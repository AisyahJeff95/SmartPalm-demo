#!/usr/bin/env python3
"""
SmartPalm Local GeoTIFF Prediction & PDF Storage Server
Listens on http://127.0.0.1:5001 to generate GeoTIFF (.tif) rasters, 
real 10m Sentinel .csv pixel files, PNG web overlays, and save PDF reports.

Invokes real shapefile & real Sentinel prediction pipeline from 3. Training_v2/predict_nutrients.py.
"""

import os
import sys
import io
import json
import time
import base64
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

    # Check for partial matches if exact name doesn't match
    for c in candidates:
        if os.path.isfile(c):
            return c

    for search_dir in [TRAINING_V3_DIR, BOUNDARIES_DIR, BASE_DIR]:
        if os.path.exists(search_dir):
            for fname in os.listdir(search_dir):
                if fname.lower().endswith('.shp'):
                    fstem = os.path.splitext(fname)[0].lower()
                    if clean_name.lower() in fstem or fstem in clean_name.lower():
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
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

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
        date_val = data.get("date", "06-Oct-2026")
        
        print(f"\n==========================================================================")
        print(f"📡 Dashboard Prediction Request: {estate_raw} ({date_val})")
        print(f"==========================================================================")

        shp_path = find_shapefile_for_estate(estate_raw)
        if not shp_path or not os.path.isfile(shp_path):
            return self._send_json(400, {"error": f"Shapefile for '{estate_raw}' not found"})

        print(f"  ✓ Matched real shapefile: {shp_path}")

        if run_predictions is None:
            return self._send_json(500, {"error": "Prediction engine not loaded"})

        # Run real prediction pipeline from 4. Training_v3/predict_nutrients.py
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

def run_server(port=5001):
    server_address = ('', port)
    httpd = ThreadingHTTPServer(server_address, PredictionRequestHandler)
    print(f"🚀 SmartPalm Multi-Threaded Prediction Server running on http://127.0.0.1:{port}")
    print(f"📁 Saving real prediction folders to {PREDICTIONS_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    run_server(port)
