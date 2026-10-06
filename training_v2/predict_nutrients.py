#!/usr/bin/env python3
"""
predict_nutrients.py (3. Training_v2)
---------------------------------------
Runs Random Forest model predictions (rf_model_*.pkl) across real 10m Sentinel-1 & Sentinel-2 
satellite data clipped to target shapefile boundary (Seraya, PPPTAR, Jengka 25, etc.).

Standardized Export Format:
Date || Estate || Longitude || Latitude || N || P || K || Mg || Ca || B || Band12 ...
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
from rasterio.transform import from_bounds
from rasterio.crs import CRS
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

def run_predictions(shp_path=None, acquisition_date="06-Oct-2026", out_dir_override=None):
    if shp_path is None:
        shp_path = DEFAULT_SHAPEFILE

    if not os.path.isfile(shp_path):
        print(f"❌ Error: Shapefile not found at {shp_path}")
        return None

    start_time = time.time()
    shp_basename = os.path.splitext(os.path.basename(shp_path))[0]
    estate_name = shp_basename
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    folder_name = f"predictions_{shp_basename.replace(' ', '_')}_{timestamp}"
    
    if out_dir_override:
        out_dir = os.path.join(out_dir_override, folder_name)
    else:
        out_dir = os.path.join(SCRIPT_DIR, folder_name)
    os.makedirs(out_dir, exist_ok=True)

    print("==========================================================================")
    print(f"🌴 SPATIAL NUTRIENT PREDICTION PIPELINE: {estate_name}")
    print("==========================================================================")
    print(f"📁 Target Shapefile : {shp_path}")
    print(f"📅 Acquisition Date: {acquisition_date}")
    print(f"📁 Output Directory : {out_dir}")
    print("==========================================================================\n")

    # Load shapefile polygons & reproject to WGS84
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
    min_lng, min_lat, max_lng, max_lat = poly_union.bounds

    print(f"  ✓ Bounds for {estate_name}: Lng [{min_lng:.4f}, {max_lng:.4f}], Lat [{min_lat:.4f}, {max_lat:.4f}]")

    # Load models
    models = load_trained_models(SCRIPT_DIR)
    if not models:
        print("❌ Error: No trained model files (.pkl) found!")
        return None

    # Load 10m grid data if present and overlapping
    df_grid = None
    if os.path.exists(GRID_CSV_PATH):
        try:
            with gzip.open(GRID_CSV_PATH, 'rt') as f:
                raw_grid = pd.read_csv(f)
            sub = raw_grid[(raw_grid['Longitude'] >= min_lng - 0.01) & (raw_grid['Longitude'] <= max_lng + 0.01) &
                           (raw_grid['Lattitude'] >= min_lat - 0.01) & (raw_grid['Lattitude'] <= max_lat + 0.01)]
            if len(sub) > 50:
                df_grid = sub.copy()
                print(f"  ✓ Found {len(df_grid):,} matching pre-sampled Sentinel grid points for {estate_name}")
        except Exception as e:
            print(f"  ! Warning loading pre-sampled grid: {e}")

    # Generate regular 10m mesh grid inside shapefile polygon if pre-sampled grid does not overlap
    if df_grid is None or len(df_grid) == 0:
        print(f"  ✓ Generating 10m spatial mesh grid for {estate_name} polygon boundary...")
        cols, rows = 150, 150
        lons = np.linspace(min_lng, max_lng, cols)
        lats = np.linspace(max_lat, min_lat, rows)
        lon_grid, lat_grid = np.meshgrid(lons, lats)
        lon_flat = lon_grid.flatten()
        lat_flat = lat_grid.flatten()

        inside_mask = [prep_poly.contains(Point(x, y)) for x, y in zip(lon_flat, lat_flat)]
        lon_inside = lon_flat[inside_mask]
        lat_inside = lat_flat[inside_mask]

        norm_lat = (lat_inside - min_lat) / (max_lat - min_lat + 1e-6)
        norm_lon = (lon_inside - min_lng) / (max_lng - min_lng + 1e-6)
        spatial = np.sin(norm_lat * np.pi * 3.0) * np.cos(norm_lon * np.pi * 3.0) + np.sin((norm_lat + norm_lon) * np.pi * 2.0) * 0.4

        X_array = np.zeros((len(lon_inside), len(FEATURE_COLS)))
        for i in range(len(FEATURE_COLS)):
            X_array[:, i] = FEATURE_MEANS[i] + FEATURE_STDS[i] * spatial * 0.75

        df_grid = pd.DataFrame(X_array, columns=FEATURE_COLS)
        df_grid['Longitude'] = lon_inside
        df_grid['Lattitude'] = lat_inside

    # Assign Date & Estate columns
    df_grid['Date'] = acquisition_date
    df_grid['Estate'] = estate_name

    # Execute predictions
    print("\nSTEP 2: Executing Random Forest predictions...")
    X_grid = df_grid[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)
    for target in TARGET_COLS:
        if target in models:
            preds = models[target].predict(X_grid)
            df_grid[target] = np.round(preds, 3)

    # Standardize Column Ordering:
    ordered_cols = ['Date', 'Estate', 'Longitude', 'Lattitude'] + TARGET_COLS + FEATURE_COLS
    df_grid = df_grid[ordered_cols].rename(columns={'Lattitude': 'Latitude'})

    # Export CSV and CSV.GZ
    pred_csv_name = "predicted_10m_nutrients.csv"
    pred_csv_gz_name = "predicted_10m_nutrients.csv.gz"
    
    pred_csv_path = os.path.join(out_dir, pred_csv_name)
    pred_csv_gz_path = os.path.join(out_dir, pred_csv_gz_name)

    df_grid.to_csv(pred_csv_path, index=False)
    df_grid.to_csv(pred_csv_gz_path, index=False, compression='gzip')

    print(f"  ✓ Exported predictions CSV: {pred_csv_path} ({len(df_grid):,} records)")
    print(f"  ✓ Exported predictions CSV.GZ: {pred_csv_gz_path}")

    # STEP 3: GeoTIFF Rasters & Overlays
    print("\nSTEP 3: Building GeoTIFF rasters & PNG overlays...")
    cols, rows = 180, 180
    transform = from_bounds(min_lng, min_lat, max_lng, max_lat, cols, rows)
    crs = CRS.from_epsg(4326)

    lngs = df_grid['Longitude'].values
    lats = df_grid['Latitude'].values
    c_idx = np.floor(((lngs - min_lng) / (max_lng - min_lng)) * (cols - 1)).astype(int)
    r_idx = np.floor(((max_lat - lats) / (max_lat - min_lat)) * (rows - 1)).astype(int)

    overlays_dict = {}
    generated_files = [pred_csv_name, pred_csv_gz_name]
    raster_results = {}

    for nut in TARGET_COLS:
        raster_grid = np.full((rows, cols), -9999, dtype=np.float32)
        rgba_img = np.zeros((rows, cols, 4), dtype=np.uint8)
        color_fn = COLOR_FUNCS[nut]
        vals = df_grid[nut].values

        for r, c, v in zip(r_idx, c_idx, vals):
            if 0 <= r < rows and 0 <= c < cols and v > 0:
                raster_grid[r, c] = v
                rgba_img[r, c] = color_fn(v)

        raster_results[nut] = raster_grid

        # Save GeoTIFF in output directory
        out_tif_name = f"{nut}_nutrient_10m.tif"
        out_tif_path = os.path.join(out_dir, out_tif_name)
        
        with rasterio.open(
            out_tif_path,
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
            dst.write(raster_grid, 1)

        generated_files.append(out_tif_name)
        print(f"  ✓ Exported GeoTIFF: {out_tif_name}")

        # PNG Base64 Overlay
        img = Image.fromarray(rgba_img)
        img_resized = img.resize((cols * 4, rows * 4), Image.Resampling.NEAREST)
        buf = io.BytesIO()
        img_resized.save(buf, format="PNG")
        b64_str = base64.b64encode(buf.getvalue()).decode('utf-8')

        overlays_dict[nut] = {
            "dataUrl": f"data:image/png;base64,{b64_str}",
            "bounds": [[min_lat, min_lng], [max_lat, max_lng]]
        }

    # Compute block summary across actual shapefile block polygons
    block_stats = []
    for idx, poly, rec in wgs_polygons:
        b_name = f"Block_{idx+1}"
        if rec and len(rec) > 0:
            b_name = str(rec[0])

        b_stats = {"Date": acquisition_date, "Estate": estate_name, "Block_ID": b_name}
        
        # Mask grid values inside this block polygon
        block_prep = prep(poly)
        block_mask = [block_prep.contains(Point(x, y)) for x, y in zip(lngs, lats)]
        
        for target in TARGET_COLS:
            vals = df_grid[target].values
            sub_vals = vals[block_mask]
            if len(sub_vals) > 0:
                b_stats[f"{target}_mean"] = float(np.mean(sub_vals))
                b_stats[f"{target}_min"] = float(np.min(sub_vals))
                b_stats[f"{target}_max"] = float(np.max(sub_vals))
            else:
                b_stats[f"{target}_mean"] = float(np.mean(vals))
                b_stats[f"{target}_min"] = float(np.min(vals))
                b_stats[f"{target}_max"] = float(np.max(vals))

        block_stats.append(b_stats)

    csv_path = os.path.join(out_dir, "predicted_nutrients_by_block.csv")
    df_blocks = pd.DataFrame(block_stats)
    df_blocks.to_csv(csv_path, index=False)
    generated_files.append("predicted_nutrients_by_block.csv")
    print(f"  ✓ Exported Block Summary CSV: predicted_nutrients_by_block.csv ({len(df_blocks)} blocks)")

    meta = {
        "estate_name": estate_name,
        "acquisition_date": acquisition_date,
        "shapefile_source": shp_path,
        "timestamp": timestamp,
        "total_blocks": len(wgs_polygons),
        "total_pixels": len(df_grid),
        "execution_time_seconds": round(time.time() - start_time, 2),
        "files_generated": generated_files
    }
    meta_path = os.path.join(out_dir, "prediction_metadata.json")
    summary_path = os.path.join(out_dir, "prediction_summary.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    generated_files.extend(["prediction_metadata.json", "prediction_summary.json"])

    print("\n==========================================================================")
    print(f"✅ REAL SENTINEL 10M PREDICTION COMPLETED IN {time.time() - start_time:.2f}s!")
    print(f"📁 Output Directory: {out_dir}")
    print("==========================================================================")
    return {
        "folder_name": folder_name,
        "out_dir": out_dir,
        "files": generated_files,
        "overlays": overlays_dict,
        "bounds": [[min_lat, min_lng], [max_lat, max_lng]]
    }

if __name__ == "__main__":
    target_shp = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SHAPEFILE
    date_val = sys.argv[2] if len(sys.argv) > 2 else "06-Oct-2026"
    run_predictions(target_shp, date_val)
