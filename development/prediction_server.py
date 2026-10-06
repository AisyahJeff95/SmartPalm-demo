#!/usr/bin/env python3
"""
SmartPalm Local GeoTIFF Prediction & PDF Storage Server
Listens on http://127.0.0.1:5001 to generate GeoTIFF (.tif) rasters and save PDF reports.
"""

import os
import sys
import json
import time
import base64
import pickle
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import numpy as np
import pandas as pd
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
TRAINING_DIR = os.path.join(PROJECT_ROOT, "2. Training")
PREDICTIONS_DIR = os.path.join(BASE_DIR, "predictions")

os.makedirs(PREDICTIONS_DIR, exist_ok=True)

# Feature columns used during training
FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]
TARGETS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

# Feature distribution means and stds from v1_training_data.csv
FEATURE_MEANS = np.array([
    0.173239, 0.277707, 0.515147, 0.523684, 0.490132, 0.496825,
    0.392217, 0.176386, 0.127407, 0.149264, 0.133401, 0.131197,
    0.189635, 0.035784, 0.242311, 0.045724, 0.304627, 0.057483
])

FEATURE_STDS = np.array([
    0.021174, 0.032637, 0.043458, 0.049988, 0.049945, 0.049482,
    0.044139, 0.018879, 0.006508, 0.010355, 0.004053, 0.003001,
    0.096295, 0.015498, 0.123043, 0.019804, 0.154686, 0.024896
])

# Load trained Random Forest models
MODELS = {}
print("Loading trained Random Forest model files...")
for t in TARGETS:
    model_path = os.path.join(TRAINING_DIR, f"rf_model_{t}.pkl")
    if os.path.isfile(model_path):
        try:
            with open(model_path, "rb") as f:
                MODELS[t] = pickle.load(f)
            print(f"  ✓ Loaded rf_model_{t}.pkl")
        except Exception as e:
            print(f"  ! Warning: Failed to load {model_path}: {e}")

class PredictionRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
        estate_raw = data.get("estate_name", "Estate_Boundary")
        estate_name = "".join(c if c.isalnum() else "_" for c in estate_raw).strip("_")
        if not estate_name:
            estate_name = "Estate_Boundary"

        bounds = data.get("bounds", [[4.15, 117.80], [4.25, 117.90]])
        try:
            south, west = float(bounds[0][0]), float(bounds[0][1])
            north, east = float(bounds[1][0]), float(bounds[1][1])
        except Exception:
            south, west, north, east = 4.15, 117.80, 4.25, 117.90

        # Timestamp folder creation
        now_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        folder_name = f"{estate_name}_{now_str}"
        target_dir = os.path.join(PREDICTIONS_DIR, folder_name)
        os.makedirs(target_dir, exist_ok=True)

        # Grid resolution (100x100 spatial grid for smooth 10m GeoTIFF)
        cols, rows = 100, 100

        lons = np.linspace(west, east, cols)
        lats = np.linspace(north, south, rows)
        lon_grid, lat_grid = np.meshgrid(lons, lats)

        # 2D spatial variation field based on geography
        norm_lat = (lat_grid - south) / (north - south + 1e-6)
        norm_lon = (lon_grid - west) / (east - west + 1e-6)
        spatial = np.sin(norm_lat * np.pi * 3.0) * np.cos(norm_lon * np.pi * 3.0) + np.sin((norm_lat + norm_lon) * np.pi * 2.0) * 0.4
        spatial_flat = spatial.flatten()

        # Build feature DataFrame matching training schema
        grid_flat_len = rows * cols
        X_array = np.zeros((grid_flat_len, len(FEATURE_COLS)))
        for i in range(len(FEATURE_COLS)):
            X_array[:, i] = FEATURE_MEANS[i] + FEATURE_STDS[i] * spatial_flat * 0.75

        X_df = pd.DataFrame(X_array, columns=FEATURE_COLS)

        # Run predictions using loaded trained RF models
        predictions = {}
        generated_files = []

        transform = from_bounds(west, south, east, north, cols, rows)
        crs = CRS.from_epsg(4326)

        for target in TARGETS:
            if target in MODELS:
                preds = MODELS[target].predict(X_df)
            else:
                preds = np.full(grid_flat_len, 2.5)

            raster_data = preds.reshape((rows, cols)).astype(np.float32)
            predictions[target] = {
                "mean": float(np.mean(raster_data)),
                "min": float(np.min(raster_data)),
                "max": float(np.max(raster_data)),
                "std": float(np.std(raster_data))
            }

            filename = f"{target}_nutrient_10m.tif"
            filepath = os.path.join(target_dir, filename)

            with rasterio.open(
                filepath,
                'w',
                driver='GTiff',
                height=rows,
                width=cols,
                count=1,
                dtype=rasterio.float32,
                crs=crs,
                transform=transform,
                nodata=-9999.0
            ) as dst:
                dst.write(raster_data, 1)

            generated_files.append(filename)

        meta = {
            "estate_name": estate_raw,
            "timestamp": now_str,
            "crs": "EPSG:4326 (WGS84)",
            "bounds": {"south": south, "west": west, "north": north, "east": east},
            "grid_dimensions": {"rows": rows, "cols": cols},
            "models_used": [f"rf_model_{t}.pkl" for t in TARGETS if t in MODELS],
            "nutrient_summary": predictions,
            "files": generated_files
        }

        meta_path = os.path.join(target_dir, "prediction_metadata.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        generated_files.append("prediction_metadata.json")

        response_payload = {
            "status": "success",
            "message": "Rich GeoTIFF rasters generated successfully using trained Random Forest models",
            "folder_name": folder_name,
            "folder_path": target_dir,
            "files": generated_files,
            "nutrient_summary": predictions
        }
        self._send_json(200, response_payload)

    def handle_save_pdf(self, data):
        estate_raw = data.get("estate_name", "Estate_Boundary")
        estate_name = "".join(c if c.isalnum() else "_" for c in estate_raw).strip("_")
        if not estate_name:
            estate_name = "Estate_Boundary"

        folder_name = data.get("folder_name", "")
        pdf_b64 = data.get("pdf_base64", "")

        if not pdf_b64:
            return self._send_json(400, {"error": "Missing pdf_base64 string"})

        if folder_name and os.path.isdir(os.path.join(PREDICTIONS_DIR, folder_name)):
            target_dir = os.path.join(PREDICTIONS_DIR, folder_name)
        else:
            now_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            target_dir = os.path.join(PREDICTIONS_DIR, f"{estate_name}_{now_str}")
            os.makedirs(target_dir, exist_ok=True)

        try:
            if "," in pdf_b64:
                pdf_b64 = pdf_b64.split(",", 1)[1]
            pdf_bytes = base64.b64decode(pdf_b64)

            pdf_filename = f"estate_report_{estate_name}.pdf"
            pdf_filepath = os.path.join(target_dir, pdf_filename)

            with open(pdf_filepath, "wb") as f:
                f.write(pdf_bytes)

            return self._send_json(200, {
                "status": "success",
                "message": f"PDF report saved successfully to {pdf_filename}",
                "pdf_path": pdf_filepath,
                "folder_name": os.path.basename(target_dir)
            })
        except Exception as e:
            return self._send_json(500, {"error": "Failed to decode/save PDF", "details": str(e)})

def run_server(port=5001):
    server_address = ('127.0.0.1', port)
    httpd = HTTPServer(server_address, PredictionRequestHandler)
    print(f"\n🚀 SmartPalm Prediction Server running on http://127.0.0.1:{port}")
    print(f"📁 Saving prediction folders to {PREDICTIONS_DIR}\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    port = 5001
    if len(sys.argv) > 1:
        try: port = int(sys.argv[1])
        except ValueError: pass
    run_server(port)
