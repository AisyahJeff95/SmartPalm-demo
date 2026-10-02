#!/usr/bin/env python3
"""
Random Forest Regression (RFR) Training & 10m Grid Prediction Pipeline
for Oil Palm Nutrient Estimation (N, P, K, Mg, Ca, B).

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

from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error

import shapefile
import rasterio
from PIL import Image
from shapely.geometry import shape, Point
from shapely.ops import unary_union
from shapely.prepared import prep

# ==============================================================================
# CONFIGURATION (Change filenames & paths here as needed)
# ==============================================================================
TRAIN_DATASET_PATH = "v1_training_data.csv"
GRID_DATASET_PATH = "../development/v1_training_data_10m.csv.gz"
BOUNDARY_SHAPEFILE_PATH = "../development/boundaries/Ladang PPPTAR"

FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]

TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

# MPOB Color threshold functions for raster generation
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
    if val <= 0.40: return [227, 26, 28, 220]    # Red (Deficient)
    if val <= 0.50: return [245, 163, 64, 220]   # Orange (Low)
    if val <= 0.60: return [255, 240, 60, 220]   # Yellow (Slight)
    if val <= 0.75: return [85, 215, 65, 220]    # Green (Optimum)
    if val <= 0.90: return [30, 110, 230, 220]   # Blue (High)
    return [145, 90, 45, 220]                    # Brown (Excess)

def get_color_b(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 10.0: return [227, 26, 28, 220]    # Red (Deficient)
    if val <= 15.0: return [245, 163, 64, 220]   # Orange (Low)
    if val <= 20.0: return [255, 240, 60, 220]   # Yellow (Slight)
    if val <= 30.0: return [85, 215, 65, 220]    # Green (Optimum)
    if val <= 40.0: return [30, 110, 230, 220]   # Blue (High)
    return [145, 90, 45, 220]                    # Brown (Excess)

COLOR_FUNCS = {
    'N': get_color_n, 'P': get_color_p, 'K': get_color_k,
    'Mg': get_color_mg, 'Ca': get_color_ca, 'B': get_color_b
}

def resolve_path(rel_path):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(base_dir, rel_path))

def main():
    t_start = time.time()
    train_csv_path = resolve_path(TRAIN_DATASET_PATH)
    grid_csv_path = resolve_path(GRID_DATASET_PATH)
    shp_path = resolve_path(BOUNDARY_SHAPEFILE_PATH)

    print("==========================================================================")
    print("🌲 SMARTPALM RANDOM FOREST REGRESSION PIPELINE")
    print("==========================================================================")
    print(f"📁 Training Dataset Path : {train_csv_path}")
    print(f"📁 10m Grid Dataset Path : {grid_csv_path}")
    print(f"📁 Estate Boundary Path  : {shp_path}.shp")
    print("==========================================================================\n")

    if not os.path.exists(train_csv_path):
        print(f"❌ Error: Training file not found at {train_csv_path}")
        sys.exit(1)

    # --------------------------------------------------------------------------
    # STEP 1: LOAD TRAINING DATA & FIT RANDOM FOREST REGRESSORS
    # --------------------------------------------------------------------------
    print("STEP 1: Training Random Forest Regressor models on ground truth data...")
    df_train = pd.read_csv(train_csv_path)
    print(f"  ✓ Loaded {len(df_train)} training plot samples.\n")

    X = df_train[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)
    
    models = {}
    metrics_summary = []

    print("-" * 80)
    print(f"{'Target':<8} | {'R² Score':<10} | {'RMSE':<10} | {'MAE':<10} | Top 3 Important Features")
    print("-" * 80)

    for target in TARGET_COLS:
        y = df_train[target].astype(float)
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)
        
        rf = RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)
        
        y_pred = rf.predict(X_test)
        r2 = r2_score(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        mae = mean_absolute_error(y_test, y_pred)
        
        models[target] = rf
        
        model_out = resolve_path(f"rf_model_{target}.pkl")
        with open(model_out, "wb") as f:
            pickle.dump(rf, f)
        
        importances = pd.Series(rf.feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
        top3_feats = ", ".join(importances.index[:3].tolist())
        
        metrics_summary.append({
            'Target': target,
            'R2': r2,
            'RMSE': rmse,
            'MAE': mae,
            'Top_Features': top3_feats
        })
        
        print(f"{target:<8} | {r2:<10.4f} | {rmse:<10.4f} | {mae:<10.4f} | {top3_feats}")

    print("-" * 80 + "\n")

    # --------------------------------------------------------------------------
    # STEP 2: PREDICT NUTRIENTS ACROSS 10M SPATIAL GRID FOR PPPTAR BOUNDARY
    # --------------------------------------------------------------------------
    if os.path.exists(grid_csv_path):
        print("STEP 2: Generating 10m² pixel nutrient predictions across estate boundary...")
        if grid_csv_path.endswith('.gz'):
            with gzip.open(grid_csv_path, 'rt') as f:
                df_grid = pd.read_csv(f)
        else:
            df_grid = pd.read_csv(grid_csv_path)

        print(f"  ✓ Loaded {len(df_grid):,} spatial grid points.")
        
        X_grid = df_grid[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)

        for target in TARGET_COLS:
            if target in models:
                preds = models[target].predict(X_grid)
                df_grid[target] = np.round(preds, 3)

        print("  ✓ Masking predictions with shapefile boundary...")
        with shapefile.Reader(shp_path) as sf:
            geoms = [shape(sr.shape.__geo_interface__).buffer(0) for sr in sf.shapeRecords()]
        poly_union = unary_union(geoms)
        prep_poly = prep(poly_union)

        pred_out_csv = resolve_path("predicted_10m_nutrients.csv.gz")
        df_grid.to_csv(pred_out_csv, index=False, compression='gzip')
        print(f"  ✓ Saved 10m predictions to: {pred_out_csv}")

        # --------------------------------------------------------------------------
        # STEP 3: UPDATE GEOTIFF RASTERS & JS MAP OVERLAYS
        # --------------------------------------------------------------------------
        print("\nSTEP 3: Updating GeoTIFF rasters and pre-rendered web map overlays...")
        
        dev_dir = resolve_path("../development")
        overlays_dict = {}
        grid_dict = {}

        # Use Merge_Citra_Unsur_N.tif as reference template for spatial projection & shape
        ref_tif = os.path.join(dev_dir, "Merge_Citra_Unsur_N.tif")
        with rasterio.open(ref_tif) as src:
            h, w = src.height, src.width
            left, bottom, right, top = src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top
            ref_profile = src.profile.copy()

        lngs = df_grid['Longitude'].values
        lats = df_grid['Lattitude'].values
        cols = np.floor(((lngs - left) / (right - left)) * w).astype(int)
        rows = np.floor(((top - lats) / (top - bottom)) * h).astype(int)
        valid_mask = (cols >= 0) & (cols < w) & (rows >= 0) & (rows < h)

        for nut in TARGET_COLS:
            tif_path = os.path.join(dev_dir, f"Merge_Citra_Unsur_{nut}.tif")
            raster_grid = np.full((h, w), -9999, dtype=np.float32)
            rgba_img = np.zeros((h, w, 4), dtype=np.uint8)

            c_valid, r_valid, lng_v, lat_v, vals_v = cols[valid_mask], rows[valid_mask], lngs[valid_mask], lats[valid_mask], df_grid[nut].values[valid_mask]
            color_fn = COLOR_FUNCS[nut]

            for r, c, lng, lat, v in zip(r_valid, c_valid, lng_v, lat_v, vals_v):
                if prep_poly.contains(Point(lng, lat)) and v > 0:
                    raster_grid[r, c] = v
                    rgba_img[r, c] = color_fn(v)

            ref_profile.update(nodata=-9999, dtype=rasterio.float32)
            with rasterio.open(tif_path, 'w', **ref_profile) as dst:
                dst.write(raster_grid, 1)

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

        js_content = f"const RASTER_OVERLAYS_PPPTAR = {json.dumps(overlays_dict)};\nconst RASTER_GRID_DATA_PPPTAR = {json.dumps(grid_dict)};\nif (typeof window !== 'undefined') {{\n    window.RASTER_OVERLAYS_PPPTAR = RASTER_OVERLAYS_PPPTAR;\n    window.RASTER_GRID_DATA_PPPTAR = RASTER_GRID_DATA_PPPTAR;\n}}\n"
        js_path = os.path.join(dev_dir, "js/ppptar_raster_overlays.js")
        with open(js_path, "w") as f:
            f.write(js_content)
        
        print(f"  ✓ Updated GeoTIFF rasters (N, P, K, Mg, Ca, B) and generated {js_path}")

    t_end = time.time()
    print("\n==========================================================================")
    print(f"✅ PIPELINE COMPLETED SUCCESSFULLY IN {t_end - t_start:.2f} SECONDS!")
    print("==========================================================================")

if __name__ == "__main__":
    main()
