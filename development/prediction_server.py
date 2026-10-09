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

def find_shapefile_for_estate(estate_raw):
    """Finds matching .shp file across training_v3, development/boundaries, or development."""
    clean_name = estate_raw.strip()
    
    candidates = [
        os.path.join(TRAINING_V3_DIR, f"{clean_name}.shp"),
        os.path.join(BOUNDARIES_DIR, f"{clean_name}.shp"),
        os.path.join(BASE_DIR, f"{clean_name}.shp"),
    ]

    for c in candidates:
        if os.path.isfile(c):
            return c

    def _norm(s):
        return ''.join(ch for ch in s.lower() if ch.isalnum())

    clean_norm = _norm(clean_name)
    for search_dir in [TRAINING_V3_DIR, BOUNDARIES_DIR, BASE_DIR]:
        if os.path.exists(search_dir):
            for fname in os.listdir(search_dir):
                if fname.lower().endswith('.shp'):
                    fstem = os.path.splitext(fname)[0].lower()
                    fnorm = _norm(fstem)
                    if (clean_name.lower() in fstem or fstem in clean_name.lower()
                            or (fnorm and (clean_norm == fnorm or clean_norm in fnorm or fnorm in clean_norm))):
                        return os.path.join(search_dir, fname)

    # Fallback to DEFAULT shapefile
    fallback_shp = os.path.join(TRAINING_V3_DIR, "Seraya with Block Boundary.shp")
    if os.path.isfile(fallback_shp):
        return fallback_shp
    
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

    def handle_download_zip(self, folder_name=None):
        target_dir = None
        if folder_name:
            clean_folder = os.path.basename(folder_name.strip())
            candidate = os.path.join(PREDICTIONS_DIR, clean_folder)
            if os.path.isdir(candidate):
                target_dir = candidate
            else:
                matches = [d for d in os.listdir(PREDICTIONS_DIR) if clean_folder.lower() in d.lower() and os.path.isdir(os.path.join(PREDICTIONS_DIR, d))]
                if matches:
                    target_dir = os.path.join(PREDICTIONS_DIR, matches[-1])

        if not target_dir:
            # Fallback to the most recent prediction folder
            subdirs = [os.path.join(PREDICTIONS_DIR, d) for d in os.listdir(PREDICTIONS_DIR) if os.path.isdir(os.path.join(PREDICTIONS_DIR, d))]
            if subdirs:
                target_dir = max(subdirs, key=os.path.getmtime)

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

        shp_path = find_shapefile_for_estate(estate_raw)
        if not shp_path or not os.path.isfile(shp_path):
            return self._send_json(400, {"error": f"Shapefile for '{estate_raw}' not found"})

        print(f"  ✓ Matched real shapefile: {shp_path}")

        if run_predictions is None:
            return self._send_json(500, {"error": "Prediction engine not loaded"})

        # Run real prediction pipeline from training_v3/predict_nutrients.py
        result = run_predictions(shp_path=shp_path, acquisition_date=date_val, out_dir_override=PREDICTIONS_DIR)

        if not result:
            return self._send_json(500, {"error": "Prediction pipeline execution failed"})

        response_payload = {
            "status": "success",
            "message": f"Real 10m Sentinel predictions & shapefile rasters generated for {estate_raw}",
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
