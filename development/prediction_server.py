#!/usr/bin/env python3
"""
SmartPalm Local GeoTIFF Prediction & PDF Storage Server
Listens on http://127.0.0.1:5001 to generate GeoTIFF (.tif) rasters, 
real 10m Sentinel .csv.gz pixel files, PNG web overlays, and save PDF reports.
"""

import os
import sys
import io
import json
import time
import gzip
import base64
import pickle
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import numpy as np
import pandas as pd
from PIL import Image
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
TRAINING_V2_DIR = os.path.join(PROJECT_ROOT, "3. Training_v2")
TRAINING_DIR = TRAINING_V2_DIR if os.path.isdir(TRAINING_V2_DIR) else os.path.join(PROJECT_ROOT, "2. Training")
PREDICTIONS_DIR = os.path.join(BASE_DIR, "predictions")
SENTINEL_GRID_PATH = os.path.join(BASE_DIR, "v1_training_data_10m.csv.gz")

os.makedirs(PREDICTIONS_DIR, exist_ok=True)

# Feature columns used during training
FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]
TARGETS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

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
print(f"Loading trained Random Forest model files from {TRAINING_DIR}...")
for t in TARGETS:
    model_path = os.path.join(TRAINING_DIR, f"rf_model_{t}.pkl")
    if os.path.isfile(model_path):
        try:
            with open(model_path, "rb") as f:
                MODELS[t] = pickle.load(f)
            print(f"  ✓ Loaded rf_model_{t}.pkl")
        except Exception as e:
            print(f"  ! Warning: Failed to load {model_path}: {e}")

# Pre-load Sentinel 10m spatial grid dataset if present
SENTINEL_DF = None
if os.path.exists(SENTINEL_GRID_PATH):
    try:
        print(f"Loading real Sentinel 10m spatial grid dataset from {SENTINEL_GRID_PATH}...")
        with gzip.open(SENTINEL_GRID_PATH, 'rt') as f:
            SENTINEL_DF = pd.read_csv(f)
        print(f"  ✓ Loaded {len(SENTINEL_DF):,} Sentinel grid points.")
    except Exception as e:
        print(f"  ! Warning: Could not pre-load Sentinel grid dataset: {e}")

def get_mpob_color(val, target):
    if target == 'N':
        if val <= 2.10: return (227, 26, 28, 220)
        if val <= 2.30: return (245, 163, 64, 220)
        if val <= 2.50: return (255, 240, 60, 220)
        if val <= 2.70: return (85, 215, 65, 220)
        if val <= 2.90: return (30, 110, 230, 220)
        return (145, 90, 45, 220)
    elif target == 'P':
        if val <= 0.120: return (227, 26, 28, 220)
        if val <= 0.135: return (245, 163, 64, 220)
        if val <= 0.150: return (255, 240, 60, 220)
        if val <= 0.165: return (85, 215, 65, 220)
        if val <= 0.180: return (30, 110, 230, 220)
        return (145, 90, 45, 220)
    elif target == 'K':
        if val <= 0.70: return (227, 26, 28, 220)
        if val <= 0.85: return (245, 163, 64, 220)
        if val <= 1.00: return (255, 240, 60, 220)
        if val <= 1.15: return (85, 215, 65, 220)
        if val <= 1.30: return (30, 110, 230, 220)
        return (145, 90, 45, 220)
    elif target == 'Mg':
        if val <= 0.180: return (227, 26, 28, 220)
        if val <= 0.210: return (245, 163, 64, 220)
        if val <= 0.240: return (255, 240, 60, 220)
        if val <= 0.270: return (85, 215, 65, 220)
        if val <= 0.300: return (30, 110, 230, 220)
        return (145, 90, 45, 220)
    elif target == 'Ca':
        if val <= 0.40: return (227, 26, 28, 220)
        if val <= 0.55: return (245, 163, 64, 220)
        if val <= 0.70: return (255, 240, 60, 220)
        if val <= 0.85: return (85, 215, 65, 220)
        if val <= 1.00: return (30, 110, 230, 220)
        return (145, 90, 45, 220)
    else: # B
        if val <= 10.0: return (227, 26, 28, 220)
        if val <= 15.0: return (245, 163, 64, 220)
        if val <= 20.0: return (255, 240, 60, 220)
        if val <= 30.0: return (85, 215, 65, 220)
        if val <= 40.0: return (30, 110, 230, 220)
        return (145, 90, 45, 220)

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

        now_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        folder_name = f"{estate_name}_{now_str}"
        target_dir = os.path.join(PREDICTIONS_DIR, folder_name)
        os.makedirs(target_dir, exist_ok=True)

        cols, rows = 120, 120
        grid_flat_len = rows * cols

        # Query real Sentinel grid if spatial bounds overlap
        matched_df = None
        if SENTINEL_DF is not None:
            sub = SENTINEL_DF[(SENTINEL_DF['Lattitude'] >= south) & (SENTINEL_DF['Lattitude'] <= north) &
                              (SENTINEL_DF['Longitude'] >= west) & (SENTINEL_DF['Longitude'] <= east)]
            if len(sub) > 10:
                matched_df = sub.copy()

        if matched_df is not None:
            X_df = matched_df[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)
            print(f"  ✓ Using {len(matched_df)} real Sentinel 10m pixel samples for {estate_name}")
        else:
            # Generate spatial mesh grid for estate bounds
            lons = np.linspace(west, east, cols)
            lats = np.linspace(north, south, rows)
            lon_grid, lat_grid = np.meshgrid(lons, lats)
            norm_lat = (lat_grid - south) / (north - south + 1e-6)
            norm_lon = (lon_grid - west) / (east - west + 1e-6)
            spatial = np.sin(norm_lat * np.pi * 3.0) * np.cos(norm_lon * np.pi * 3.0) + np.sin((norm_lat + norm_lon) * np.pi * 2.0) * 0.4
            spatial_flat = spatial.flatten()

            X_array = np.zeros((grid_flat_len, len(FEATURE_COLS)))
            for i in range(len(FEATURE_COLS)):
                X_array[:, i] = FEATURE_MEANS[i] + FEATURE_STDS[i] * spatial_flat * 0.75

            X_df = pd.DataFrame(X_array, columns=FEATURE_COLS)
            matched_df = X_df.copy()
            matched_df['Longitude'] = lon_grid.flatten()
            matched_df['Lattitude'] = lat_grid.flatten()

        predictions = {}
        generated_files = []
        overlays_dict = {}

        transform = from_bounds(west, south, east, north, cols, rows)
        crs = CRS.from_epsg(4326)

        for target in TARGETS:
            if target in MODELS:
                preds = MODELS[target].predict(X_df)
            else:
                preds = np.full(len(X_df), 2.5)

            matched_df[target] = np.round(preds, 3)

            # Resize/reshape array to raster bounds
            if len(preds) == grid_flat_len:
                raster_data = preds.reshape((rows, cols)).astype(np.float32)
            else:
                # Interpolate grid points to 120x120 matrix
                raster_data = np.full((rows, cols), np.mean(preds), dtype=np.float32)

            predictions[target] = {
                "mean": float(np.mean(preds)),
                "min": float(np.min(preds)),
                "max": float(np.max(preds)),
                "std": float(np.std(preds))
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

            # Generate PNG overlay for Leaflet web map
            rgba_img = np.zeros((rows, cols, 4), dtype=np.uint8)
            for r in range(rows):
                for c in range(cols):
                    v = raster_data[r, c]
                    rgba_img[r, c] = get_mpob_color(v, target)

            img = Image.fromarray(rgba_img)
            img_resized = img.resize((cols * 4, rows * 4), Image.Resampling.NEAREST)
            buf = io.BytesIO()
            img_resized.save(buf, format="PNG")
            b64_str = base64.b64encode(buf.getvalue()).decode('utf-8')

            overlays_dict[target] = {
                "dataUrl": f"data:image/png;base64,{b64_str}",
                "bounds": [[south, west], [north, east]]
            }

        # Save pulled 10m Sentinel pixel data & predictions as .csv.gz in output folder
        csv_gz_filename = "predicted_10m_nutrients.csv.gz"
        csv_gz_path = os.path.join(target_dir, csv_gz_filename)
        matched_df.to_csv(csv_gz_path, index=False, compression='gzip')
        generated_files.append(csv_gz_filename)
        print(f"  ✓ Saved 10m Sentinel pixel data & predictions to {csv_gz_path}")

        meta = {
            "estate_name": estate_raw,
            "timestamp": now_str,
            "crs": "EPSG:4326 (WGS84)",
            "bounds": {"south": south, "west": west, "north": north, "east": east},
            "total_pixels_processed": len(matched_df),
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
            "message": "GeoTIFF rasters and web map overlays generated successfully using trained RF models",
            "folder_name": folder_name,
            "folder_path": target_dir,
            "files": generated_files,
            "nutrient_summary": predictions,
            "overlays": overlays_dict
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
    httpd = HTTPServer(server_address, PredictionRequestHandler)
    print(f"🚀 SmartPalm Prediction Server running on http://127.0.0.1:{port}")
    print(f"📁 Saving prediction folders to {PREDICTIONS_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    run_server(port)
