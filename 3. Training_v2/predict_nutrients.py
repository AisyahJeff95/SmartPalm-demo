#!/usr/bin/env python3
"""
predict_nutrients.py (3. Training_v2)
---------------------------------------
Runs Random Forest model predictions (rf_model_*.pkl) across real 10m Sentinel-1 & Sentinel-2 
satellite data (v1_training_data_10m.csv.gz) clipped to target shapefile boundary (Ladang PPPTAR.shp).

Exports:
1. GeoTIFF Rasters (.tif) for N, P, K, Mg, Ca, B
2. Block Summary CSV (predicted_nutrients_by_block.csv)
3. Metadata JSON (prediction_summary.json)
4. Updates development/ GeoTIFFs and js/ppptar_raster_overlays.js for automatic dashboard overlay

Author: Antigravity AI / SmartPalm
"""

import os
import sys
import io
import gzip
import time
import json
import base64
import numpy as np
import pandas as pd
import pickle
from datetime import datetime

import shapefile
import rasterio
from PIL import Image
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.prepared import prep
import pyproj

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DEV_DIR = os.path.join(PROJECT_ROOT, "development")

DEFAULT_SHAPEFILE = os.path.join(SCRIPT_DIR, "Ladang PPPTAR.shp")
GRID_CSV_PATH = os.path.join(DEV_DIR, "v1_training_data_10m.csv.gz")

FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]
TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

# MPOB Color threshold functions
def get_color_n(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 2.10: return [227, 26, 28, 220]    # Red (Deficient)
    if val <= 2.30: return [245, 163, 64, 220]   # Orange (Moderate)
    if val <= 2.50: return [255, 240, 60, 220]   # Yellow (Slight)
    if val <= 2.70: return [85, 215, 65, 220]    # Green (Optimum)
    if val <= 2.90: return [30, 110, 230, 220]   # Blue (High)
    return [145, 90, 45, 220]                    # Brown (Excess)

def get_color_p(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.120: return [227, 26, 28, 220]
    if val <= 0.135: return [245, 163, 64, 220]
    if val <= 0.150: return [255, 240, 60, 220]
    if val <= 0.165: return [85, 215, 65, 220]
    if val <= 0.180: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

def get_color_k(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.70: return [227, 26, 28, 220]
    if val <= 0.85: return [245, 163, 64, 220]
    if val <= 1.00: return [255, 240, 60, 220]
    if val <= 1.15: return [85, 215, 65, 220]
    if val <= 1.30: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

def get_color_mg(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.20: return [227, 26, 28, 220]
    if val <= 0.22: return [245, 163, 64, 220]
    if val <= 0.24: return [255, 240, 60, 220]
    if val <= 0.26: return [85, 215, 65, 220]
    if val <= 0.28: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

def get_color_ca(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.40: return [227, 26, 28, 220]
    if val <= 0.50: return [245, 163, 64, 220]
    if val <= 0.60: return [255, 240, 60, 220]
    if val <= 0.75: return [85, 215, 65, 220]
    if val <= 0.90: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

def get_color_b(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 10.0: return [227, 26, 28, 220]
    if val <= 15.0: return [245, 163, 64, 220]
    if val <= 20.0: return [255, 240, 60, 220]
    if val <= 30.0: return [85, 215, 65, 220]
    if val <= 40.0: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

COLOR_FUNCS = {
    'N': get_color_n, 'P': get_color_p, 'K': get_color_k,
    'Mg': get_color_mg, 'Ca': get_color_ca, 'B': get_color_b
}

def load_trained_models(models_dir):
    models = {}
    print(f"Loading trained Random Forest models from {models_dir}...")
    for t in TARGET_COLS:
        m_path = os.path.join(models_dir, f"rf_model_{t}.pkl")
        if os.path.isfile(m_path):
            with open(m_path, "rb") as f:
                models[t] = pickle.load(f)
            print(f"  ✓ Loaded rf_model_{t}.pkl")
        else:
            print(f"  ! Warning: {m_path} not found")
    return models

def run_predictions(shp_path=None):
    if shp_path is None:
        shp_path = DEFAULT_SHAPEFILE

    if not os.path.isfile(shp_path):
        print(f"❌ Error: Shapefile not found at {shp_path}")
        return None

    start_time = time.time()
    shp_basename = os.path.splitext(os.path.basename(shp_path))[0]
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    folder_name = f"predictions_{shp_basename.replace(' ', '_')}_{timestamp}"
    out_dir = os.path.join(SCRIPT_DIR, folder_name)
    os.makedirs(out_dir, exist_ok=True)

    print("==========================================================================")
    print(f"🌴 REAL SENTINEL 10M SPATIAL NUTRIENT PREDICTION PIPELINE: {shp_basename}")
    print("==========================================================================")
    print(f"📁 Target Shapefile : {shp_path}")
    print(f"📁 10m Sentinel Data: {GRID_CSV_PATH}")
    print(f"📁 Output Directory : {out_dir}")
    print("==========================================================================\n")

    # Load 10m grid data
    if not os.path.exists(GRID_CSV_PATH):
        print(f"❌ Error: Sentinel 10m grid dataset not found at {GRID_CSV_PATH}")
        return None

    print("STEP 1: Loading real 10m Sentinel-1 & Sentinel-2 pixel dataset...")
    with gzip.open(GRID_CSV_PATH, 'rt') as f:
        df_grid = pd.read_csv(f)
    print(f"  ✓ Loaded {len(df_grid):,} spatial grid points.")

    X_grid = df_grid[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)

    # Load models
    models = load_trained_models(SCRIPT_DIR)
    if not models:
        print("❌ Error: No trained model files (.pkl) found!")
        return None

    print("\nSTEP 2: Executing RFR predictions across 1.32M real Sentinel pixels...")
    for target in TARGET_COLS:
        if target in models:
            preds = models[target].predict(X_grid)
            df_grid[target] = np.round(preds, 3)

    pred_out_csv = os.path.join(out_dir, "predicted_10m_nutrients.csv.gz")
    df_grid.to_csv(pred_out_csv, index=False, compression='gzip')
    print(f"  ✓ Saved 10m predictions to: {pred_out_csv}")

    # STEP 3: Boundary Masking & GeoTIFF Generation
    print("\nSTEP 3: Masking predictions with shapefile polygon boundary & building GeoTIFF rasters...")
    with shapefile.Reader(shp_path) as sf:
        shapes_list = sf.shapes()
        try:
            records_list = sf.records()
        except Exception:
            records_list = [[] for _ in range(len(shapes_list))]

        bbox = sf.bbox
        is_projected = abs(bbox[0]) > 180 or abs(bbox[1]) > 90
        transformer = None
        if is_projected:
            print("  ✓ Detected projected coordinates. Reprojecting Timbalai RSO (EPSG:29873) -> WGS84 (EPSG:4326)...")
            transformer = pyproj.Transformer.from_crs('EPSG:29873', 'EPSG:4326', always_xy=True)

        geoms = []
        wgs_polygons = []
        for idx, (s, rec) in enumerate(zip(shapes_list, records_list)):
            pts = s.points
            if transformer:
                wgs_pts = [transformer.transform(x, y) for x, y in pts]
            else:
                wgs_pts = pts
            if len(wgs_pts) >= 3:
                p = Polygon(wgs_pts).buffer(0)
                if p.is_valid and not p.is_empty:
                    geoms.append(p)
                    wgs_polygons.append((idx, p, rec))

    poly_union = unary_union(geoms)
    prep_poly = prep(poly_union)

    ref_tif = os.path.join(DEV_DIR, "Merge_Citra_Unsur_N.tif")
    if not os.path.exists(ref_tif):
        print(f"❌ Error: Reference GeoTIFF template not found at {ref_tif}")
        return None

    with rasterio.open(ref_tif) as src:
        h, w = src.height, src.width
        left, bottom, right, top = src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top
        ref_profile = src.profile.copy()

    lngs = df_grid['Longitude'].values
    lats = df_grid['Lattitude'].values
    cols = np.floor(((lngs - left) / (right - left)) * w).astype(int)
    rows = np.floor(((top - lats) / (top - bottom)) * h).astype(int)
    valid_mask = (cols >= 0) & (cols < w) & (rows >= 0) & (rows < h)

    overlays_dict = {}
    grid_dict = {}
    generated_files = ["predicted_10m_nutrients.csv.gz"]
    raster_results = {}

    for nut in TARGET_COLS:
        raster_grid = np.full((h, w), -9999, dtype=np.float32)
        rgba_img = np.zeros((h, w, 4), dtype=np.uint8)

        c_valid, r_valid, lng_v, lat_v, vals_v = cols[valid_mask], rows[valid_mask], lngs[valid_mask], lats[valid_mask], df_grid[nut].values[valid_mask]
        color_fn = COLOR_FUNCS[nut]

        for r, c, lng, lat, v in zip(r_valid, c_valid, lng_v, lat_v, vals_v):
            if prep_poly.contains(Point(lng, lat)) and v > 0:
                raster_grid[r, c] = v
                rgba_img[r, c] = color_fn(v)

        raster_results[nut] = raster_grid

        # Save GeoTIFF in output directory
        out_tif_name = f"{nut}_nutrient_10m.tif"
        out_tif_path = os.path.join(out_dir, out_tif_name)
        ref_profile.update(nodata=-9999, dtype=rasterio.float32)
        with rasterio.open(out_tif_path, 'w', **ref_profile) as dst:
            dst.write(raster_grid, 1)

        # Update development GeoTIFF
        dev_tif_path = os.path.join(DEV_DIR, f"Merge_Citra_Unsur_{nut}.tif")
        with rasterio.open(dev_tif_path, 'w', **ref_profile) as dst:
            dst.write(raster_grid, 1)

        generated_files.append(out_tif_name)
        print(f"  ✓ Exported GeoTIFF: {out_tif_name}")

        # PNG Base64 Overlay
        img = Image.fromarray(rgba_img)
        img_resized = img.resize((w * 4, h * 4), Image.Resampling.NEAREST)
        buf = io.BytesIO()
        img_resized.save(buf, format="PNG")
        b64_str = base64.b64encode(buf.getvalue()).decode('utf-8')

        overlays_dict[nut] = {
            "dataUrl": f"data:image/png;base64,{b64_str}",
            "bounds": [[bottom, left], [top, right]]
        }

        sub = raster_grid[::2, ::2]
        sh, sw = sub.shape
        grid_dict[nut] = {
            "bounds": {"left": left, "bottom": bottom, "right": right, "top": top},
            "width": sw, "height": sh,
            "data": np.where(np.isnan(sub), -9999, np.round(sub, 3)).tolist()
        }

    # Update JS overlay file
    js_content = f"const RASTER_OVERLAYS_PPPTAR = {json.dumps(overlays_dict)};\nconst RASTER_GRID_DATA_PPPTAR = {json.dumps(grid_dict)};\nif (typeof window !== 'undefined') {{\n    window.RASTER_OVERLAYS_PPPTAR = RASTER_OVERLAYS_PPPTAR;\n    window.RASTER_GRID_DATA_PPPTAR = RASTER_GRID_DATA_PPPTAR;\n}}\n"
    js_path = os.path.join(DEV_DIR, "js/ppptar_raster_overlays.js")
    with open(js_path, "w") as f:
        f.write(js_content)
    print(f"  ✓ Updated JS Overlay file: {js_path}")

    # Compute block summary
    block_stats = []
    for idx, poly, rec in wgs_polygons:
        b_name = f"Block_{idx+1}"
        if rec and len(rec) > 0:
            b_name = str(rec[0])

        b_stats = {"Block_ID": b_name}
        for target in TARGET_COLS:
            arr = raster_results[target]
            valid_vals = arr[arr > 0]
            if len(valid_vals) > 0:
                b_stats[f"{target}_mean"] = float(np.mean(valid_vals))
                b_stats[f"{target}_min"] = float(np.min(valid_vals))
                b_stats[f"{target}_max"] = float(np.max(valid_vals))
            else:
                b_stats[f"{target}_mean"] = 0.0
                b_stats[f"{target}_min"] = 0.0
                b_stats[f"{target}_max"] = 0.0

        block_stats.append(b_stats)

    csv_path = os.path.join(out_dir, "predicted_nutrients_by_block.csv")
    df_blocks = pd.DataFrame(block_stats)
    df_blocks.to_csv(csv_path, index=False)
    generated_files.append("predicted_nutrients_by_block.csv")
    print(f"  ✓ Exported Block Summary CSV: predicted_nutrients_by_block.csv ({len(df_blocks)} blocks)")

    meta = {
        "shapefile_source": shp_path,
        "sentinel_grid_source": GRID_CSV_PATH,
        "timestamp": timestamp,
        "total_blocks": len(wgs_polygons),
        "execution_time_seconds": round(time.time() - start_time, 2),
        "files_generated": generated_files
    }
    meta_path = os.path.join(out_dir, "prediction_summary.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    generated_files.append("prediction_summary.json")

    print("\n==========================================================================")
    print(f"✅ REAL SENTINEL 10M PREDICTION COMPLETED IN {time.time() - start_time:.2f}s!")
    print(f"📁 Output Directory: {out_dir}")
    print("==========================================================================")
    return out_dir

if __name__ == "__main__":
    target_shp = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SHAPEFILE
    run_predictions(target_shp)
