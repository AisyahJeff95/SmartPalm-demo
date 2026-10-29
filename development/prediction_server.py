#!/usr/bin/env python3
"""
SmartPalm Local & Cloud Prediction Server (Docker & HF Spaces Compatible)
Listens on port 7860 (or PORT env var / 5001) to serve static web files,
run real Sentinel satellite data fetching, generate GeoTIFF rasters, serve HTTP APIs,
and package prediction output folders into downloadable .zip archives.
"""

import os
import sys
import io
import json
import time
import base64
import zipfile
import urllib.parse
import mimetypes
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

# Priority: training_v3, then 4. Training_v3
TRAINING_V3_DIR = os.path.join(PROJECT_ROOT, "training_v3")
if not os.path.exists(TRAINING_V3_DIR):
    TRAINING_V3_DIR = os.path.join(PROJECT_ROOT, "4. Training_v3")
if not os.path.exists(TRAINING_V3_DIR):
    TRAINING_V3_DIR = os.path.join(BASE_DIR, "training_v3")

PREDICTIONS_DIR = os.path.join(BASE_DIR, "predictions")
BOUNDARIES_DIR = os.path.join(BASE_DIR, "boundaries")

os.makedirs(PREDICTIONS_DIR, exist_ok=True)

import importlib.util

PREDICT_SCRIPT_PATH = os.path.join(TRAINING_V3_DIR, "predict_nutrients.py")
run_predictions = None

if os.path.isfile(PREDICT_SCRIPT_PATH):
    try:
        spec = importlib.util.spec_from_file_location("predict_nutrients_v3_module", PREDICT_SCRIPT_PATH)
        predict_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(predict_mod)
        run_predictions = predict_mod.run_predictions
        print(f"✓ Successfully loaded training_v3 prediction engine from {PREDICT_SCRIPT_PATH}")
    except Exception as e:
        print(f"! Warning: Failed to load predict_nutrients module from training_v3: {e}")

def find_shapefile_for_estate(estate_raw, geojson_data=None):
    """Finds matching .shp file across training_v3/map, training_v3, development/boundaries, or development."""
    clean_name = estate_raw.strip()
    map_dir = os.path.join(TRAINING_V3_DIR, "map")
    sekinchan_dir = os.path.join(TRAINING_V3_DIR, "sekinchan")
    reada_dir = os.path.join(PROJECT_ROOT, "Reada-standalone")
    
    search_dirs = [map_dir, TRAINING_V3_DIR, sekinchan_dir, BOUNDARIES_DIR, BASE_DIR, reada_dir]

    for sdir in search_dirs:
        c = os.path.join(sdir, f"{clean_name}.shp")
        if os.path.isfile(c):
            return c

    def _norm(s):
        return ''.join(ch for ch in s.lower() if ch.isalnum())

    clean_norm = _norm(clean_name)
    for search_dir in search_dirs:
        if os.path.exists(search_dir):
            for fname in os.listdir(search_dir):
                if fname.lower().endswith('.shp'):
                    fstem = os.path.splitext(fname)[0].lower()
                    fnorm = _norm(fstem)
                    if (clean_name.lower() in fstem or fstem in clean_name.lower()
                            or (fnorm and (clean_norm == fnorm or clean_norm in fnorm or fnorm in clean_norm))):
                        return os.path.join(search_dir, fname)

    # If client passed GeoJSON for an estate/custom shapefile not yet on disk, synthesize a .shp in BOUNDARIES_DIR
    if geojson_data and isinstance(geojson_data, dict) and geojson_data.get("features"):
        try:
            import shapefile
            os.makedirs(BOUNDARIES_DIR, exist_ok=True)
            safe_stem = "".join(ch if (ch.isalnum() or ch in ("_", "-")) else "_" for ch in clean_name).strip("_") or "custom_estate"
            out_shp = os.path.join(BOUNDARIES_DIR, f"{safe_stem}.shp")
            with shapefile.Writer(out_shp, shapeType=shapefile.POLYGON) as w:
                w.field("No_Block", "C", size=80)
                for idx, feat in enumerate(geojson_data.get("features", [])):
                    geom = feat.get("geometry") or {}
                    props = feat.get("properties") or {}
                    bname = str(props.get("No_Block") or props.get("name") or props.get("block") or f"Block_{idx+1}")
                    gtype = geom.get("type", "")
                    coords = geom.get("coordinates") or []
                    if gtype == "Polygon" and coords:
                        w.poly(coords)
                        w.record(bname)
                    elif gtype == "MultiPolygon" and coords:
                        for poly_coords in coords:
                            if poly_coords:
                                w.poly(poly_coords)
                                w.record(bname)
            if os.path.isfile(out_shp):
                return out_shp
        except Exception as e:
            print(f"  ! Warning: Failed to synthesize shapefile from GeoJSON: {e}")

    # Fallback to DEFAULT shapefile
    for fb in [
        os.path.join(map_dir, "seraya.shp"),
        os.path.join(TRAINING_V3_DIR, "Seraya with Block Boundary.shp"),
        os.path.join(reada_dir, "Seraya with Block Boundary.shp")
    ]:
        if os.path.isfile(fb):
            return fb
    
    return None

class PredictionRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        """Serves static files and zip downloads for HF Spaces web dashboard."""
        url_path = self.path.split('?')[0]
        
        # Handle prediction zip archive download endpoint
        if url_path == "/api/download_zip":
            query_str = ""
            if "?" in self.path:
                query_str = self.path.split("?", 1)[1]
            params = urllib.parse.parse_qs(query_str)
            folder_param = params.get("folder_name", [None])[0]
            return self.handle_download_zip(folder_param)

        if url_path == "/api/prediction_history":
            return self.handle_prediction_history()

        if url_path == "/api/prediction_overlays":
            query_str = ""
            if "?" in self.path:
                query_str = self.path.split("?", 1)[1]
            params = urllib.parse.parse_qs(query_str)
            folder_param = params.get("folder_name", [None])[0]
            return self.handle_prediction_overlays(folder_param)

        # Route root requests to development/index.html (or index.html)
        if url_path in ["/", "", "/index.html"]:
            file_path = os.path.join(BASE_DIR, "index.html")
            if not os.path.exists(file_path):
                file_path = os.path.join(PROJECT_ROOT, "index.html")
        else:
            relative_path = url_path.lstrip('/')
            # Check development/ subfolder first, then PROJECT_ROOT
            file_path = os.path.join(BASE_DIR, relative_path)
            if not os.path.exists(file_path):
                file_path = os.path.join(PROJECT_ROOT, relative_path)

        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, "index.html")

        if os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                if file_path.endswith('.tif') or file_path.endswith('.tiff'):
                    mime_type = 'image/tiff'
                elif file_path.endswith('.csv'):
                    mime_type = 'text/csv'
                elif file_path.endswith('.js'):
                    mime_type = 'application/javascript'
                elif file_path.endswith('.css'):
                    mime_type = 'text/css'
                else:
                    mime_type = 'application/octet-stream'

            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", mime_type)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to read file: {e}"})

        return self._send_json(404, {"error": f"File not found: {url_path}"})

    def _find_prediction_folder(self, folder_name=None):
        search_roots = [PREDICTIONS_DIR, TRAINING_V3_DIR]
        if folder_name:
            clean_folder = os.path.basename(folder_name.strip())
            for sroot in search_roots:
                if not os.path.isdir(sroot):
                    continue
                candidate = os.path.join(sroot, clean_folder)
                if os.path.isdir(candidate):
                    return candidate
            for sroot in search_roots:
                if not os.path.isdir(sroot):
                    continue
                matches = [
                    os.path.join(sroot, d) for d in os.listdir(sroot)
                    if d.startswith("predictions_") and clean_folder.lower() in d.lower() and os.path.isdir(os.path.join(sroot, d))
                ]
                if matches:
                    return max(matches, key=os.path.getmtime)

        all_dirs = []
        for sroot in search_roots:
            if not os.path.isdir(sroot):
                continue
            for d in os.listdir(sroot):
                full_p = os.path.join(sroot, d)
                if d.startswith("predictions_") and os.path.isdir(full_p):
                    all_dirs.append(full_p)
        if all_dirs:
            return max(all_dirs, key=os.path.getmtime)
        return None

    def handle_prediction_history(self):
        search_roots = [PREDICTIONS_DIR, TRAINING_V3_DIR]
        seen = set()
        runs = []
        for sroot in search_roots:
            if not os.path.isdir(sroot):
                continue
            for d in os.listdir(sroot):
                if not d.startswith("predictions_"):
                    continue
                full_p = os.path.join(sroot, d)
                if not os.path.isdir(full_p) or d in seen:
                    continue
                seen.add(d)
                files_in_dir = [f for f in os.listdir(full_p) if not f.startswith(".")]
                if not files_in_dir:
                    continue
                meta_path = os.path.join(full_p, "prediction_metadata.json")
                meta = {}
                if os.path.isfile(meta_path):
                    try:
                        with open(meta_path, "r", encoding="utf-8") as mf:
                            meta = json.load(mf)
                    except Exception:
                        meta = {}
                mtime = os.path.getmtime(full_p)
                # Parse folder name predictions_<estate>_<YYYY-MM-DD>_<HHMMSS>
                estate_guess = meta.get("estate_name") or d.replace("predictions_", "")
                date_guess = meta.get("acquisition_date") or datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
                parts = d.split("_")
                if len(parts) >= 4 and len(parts[-2]) == 10 and parts[-2].count("-") == 2:
                    if not meta.get("acquisition_date"):
                        date_guess = parts[-2]
                    if not meta.get("estate_name"):
                        estate_guess = " ".join(parts[1:-2])

                runs.append({
                    "folder_name": d,
                    "estate_name": estate_guess,
                    "target_date": date_guess,
                    "timestamp": meta.get("timestamp") or datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "mtime": mtime,
                    "total_blocks": meta.get("total_blocks"),
                    "total_pixels": meta.get("total_pixels"),
                    "execution_time_sec": meta.get("execution_time_seconds"),
                    "has_overlays": os.path.isfile(os.path.join(full_p, "overlays.json")),
                    "files_count": len(files_in_dir)
                })
        runs.sort(key=lambda r: r["mtime"], reverse=True)
        return self._send_json(200, {"status": "success", "runs": runs})

    def handle_prediction_overlays(self, folder_name):
        target_dir = self._find_prediction_folder(folder_name)
        if not target_dir:
            return self._send_json(404, {"error": "Prediction folder not found"})
        overlays_path = os.path.join(target_dir, "overlays.json")
        if os.path.isfile(overlays_path):
            try:
                with open(overlays_path, "r", encoding="utf-8") as f:
                    ov = json.load(f)
                return self._send_json(200, {"status": "success", "folder_name": os.path.basename(target_dir), "overlays": ov})
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to load overlays: {e}"})
        return self._send_json(404, {"error": "No cached overlays.json in this historical folder"})

    def handle_download_zip(self, folder_name=None):
        target_dir = self._find_prediction_folder(folder_name)

        if not target_dir or not os.path.isdir(target_dir):
            return self._send_json(404, {"error": "Prediction output directory not found"})

        zip_filename = f"{os.path.basename(target_dir)}.zip"
        mem_zip = io.BytesIO()

        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(target_dir):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, target_dir)
                    zf.write(abs_path, arcname=rel_path)

        mem_zip.seek(0)
        zip_bytes = mem_zip.read()

        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="{zip_filename}"')
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(zip_bytes)))
        self.end_headers()
        self.wfile.write(zip_bytes)

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        try:
            req_json = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            return self._send_json(400, {"error": "Invalid JSON payload", "details": str(e)})

        if self.path == "/api/predict":
            self.handle_predict(req_json)
        elif self.path == "/api/save_pdf":
            self.handle_save_pdf(req_json)
        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def handle_predict(self, data):
        estate_raw = data.get("estate_name", "Seraya with Block Boundary")
        is_realtime = data.get("is_realtime", False)
        date_val = data.get("date")

        if is_realtime or not date_val:
            date_val = datetime.now().strftime("%Y-%m-%d")
            print(f"\n==========================================================================")
            print(f"📡 Dashboard Prediction Request [REAL-TIME MODE]: {estate_raw} (latest as of {date_val})")
            print(f"==========================================================================")
        else:
            print(f"\n==========================================================================")
            print(f"📅 Dashboard Prediction Request [LOCKED DATE MODE]: {estate_raw} (target date: {date_val})")
            print(f"==========================================================================")

        shp_path = find_shapefile_for_estate(estate_raw, geojson_data=data.get("geojson"))
        if not shp_path or not os.path.isfile(shp_path):
            return self._send_json(400, {"error": f"Shapefile for '{estate_raw}' not found"})

        print(f"  ✓ Matched real shapefile: {shp_path}")

        if run_predictions is None:
            return self._send_json(500, {"error": "Prediction engine not loaded"})

        # Run real prediction pipeline from training_v3/predict_nutrients.py
        t0 = time.time()
        result = run_predictions(shp_path=shp_path, acquisition_date=date_val, out_dir_override=PREDICTIONS_DIR)
        elapsed_sec = round(time.time() - t0, 2)

        if not result:
            return self._send_json(500, {"error": "Prediction pipeline execution failed"})

        if result.get("out_dir") and result.get("overlays"):
            try:
                with open(os.path.join(result["out_dir"], "overlays.json"), "w", encoding="utf-8") as ovf:
                    json.dump(result["overlays"], ovf)
            except Exception as e:
                print(f"  ! Warning: Failed to save overlays.json: {e}")

        response_payload = {
            "status": "success",
            "message": f"Real 10m Sentinel predictions & shapefile rasters generated for {estate_raw}",
            "shp_path": shp_path,
            "target_date": date_val,
            "is_realtime": bool(is_realtime),
            "execution_time_sec": elapsed_sec,
            "folder_name": result["folder_name"],
            "folder_path": result["out_dir"],
            "files": result["files"],
            "overlays": result["overlays"]
        }

        self._send_json(200, response_payload)

    def handle_save_pdf(self, data):
        pdf_name = data.get("pdf_name", f"Report_{int(time.time())}.pdf")
        pdf_b64 = data.get("pdf_base64", "")
        
        if not pdf_b64:
            return self._send_json(400, {"error": "Missing pdf_base64 parameter"})

        try:
            pdf_bytes = base64.b64decode(pdf_b64)
            save_path = os.path.join(PREDICTIONS_DIR, pdf_name)
            with open(save_path, "wb") as f:
                f.write(pdf_bytes)
            
            print(f"  ✓ Saved PDF Report: {save_path}")
            self._send_json(200, {
                "status": "success",
                "message": f"Saved PDF report to {save_path}",
                "file_path": save_path
            })
        except Exception as e:
            self._send_json(500, {"error": "Failed to save PDF report", "details": str(e)})

def run_server(port=7860):
    server_address = ('0.0.0.0', port)
    httpd = ThreadingHTTPServer(server_address, PredictionRequestHandler)
    print(f"🚀 SmartPalm Server running on http://0.0.0.0:{port}")
    print(f"📁 Saving real prediction folders to {PREDICTIONS_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    env_port = os.environ.get("PORT")
    if env_port:
        port = int(env_port)
    elif len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = 7860
    run_server(port)
