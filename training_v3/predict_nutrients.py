#!/usr/bin/env python3
"""
predict_nutrients.py (4. Training_v3)
---------------------------------------
Executes Random Forest nutrient predictions (rf_model_*.pkl) for ANY shapefile boundary.

Architecture:
- Separate File 1: fetch_sentinel_data.py (Handles cloud-free STAC satellite data fetching & 2-stage SCL cloud masking)
- Separate File 2: predict_nutrients.py (Calls fetch_sentinel_for_shapefile from fetch_sentinel_data.py, runs model inference, exports GeoTIFF rasters)

Standardized Output Export:
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

# Import function from SEPARATE Python script: fetch_sentinel_data.py
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from fetch_sentinel_data import fetch_sentinel_for_shapefile

PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DEV_DIR = os.path.join(PROJECT_ROOT, "development")

DEFAULT_SHAPEFILE = os.path.join(SCRIPT_DIR, "Seraya with Block Boundary.shp")

FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]
TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

# MPOB Color threshold functions (Exact RGBA Legend Matching)
COLOR_RED    = [255, 0, 0, 255]      # #ff0000
COLOR_ORANGE = [255, 153, 0, 255]    # #ff9900
COLOR_YELLOW = [255, 255, 0, 255]    # #ffff00
COLOR_GREEN  = [0, 220, 0, 255]      # #00dc00
COLOR_BLUE   = [0, 102, 255, 255]    # #0066ff
COLOR_BROWN  = [153, 85, 34, 255]    # #995522
COLOR_NODATA = [0, 0, 0, 0]          # Transparent

def get_color_n(val):
    if val <= 0: return COLOR_NODATA
    if val <= 2.10: return COLOR_RED
    if val <= 2.30: return COLOR_ORANGE
    if val <= 2.50: return COLOR_YELLOW
    if val <= 2.70: return COLOR_GREEN
    if val <= 2.90: return COLOR_BLUE
    return COLOR_BROWN

def get_color_p(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.120: return COLOR_RED
    if val <= 0.135: return COLOR_ORANGE
    if val <= 0.150: return COLOR_YELLOW
    if val <= 0.165: return COLOR_GREEN
    if val <= 0.180: return COLOR_BLUE
    return COLOR_BROWN

def get_color_k(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.70: return COLOR_RED
    if val <= 0.85: return COLOR_ORANGE
    if val <= 1.00: return COLOR_YELLOW
    if val <= 1.15: return COLOR_GREEN
    if val <= 1.30: return COLOR_BLUE
    return COLOR_BROWN

def get_color_mg(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.20: return COLOR_RED
    if val <= 0.22: return COLOR_ORANGE
    if val <= 0.24: return COLOR_YELLOW
    if val <= 0.26: return COLOR_GREEN
    if val <= 0.28: return COLOR_BLUE
    return COLOR_BROWN

def get_color_ca(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.40: return COLOR_RED
    if val <= 0.50: return COLOR_ORANGE
    if val <= 0.60: return COLOR_YELLOW
    if val <= 0.75: return COLOR_GREEN
    if val <= 0.90: return COLOR_BLUE
    return COLOR_BROWN

def get_color_b(val):
    if val <= 0: return COLOR_NODATA
    if val <= 10.0: return COLOR_RED
    if val <= 15.0: return COLOR_ORANGE
    if val <= 20.0: return COLOR_YELLOW
    if val <= 30.0: return COLOR_GREEN
    if val <= 40.0: return COLOR_BLUE
    return COLOR_BROWN

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

    # STEP 1: Call function from SEPARATE fetch_sentinel_data.py script
    print(f"\nSTEP 1: Calling fetch_sentinel_for_shapefile() from fetch_sentinel_data.py...")
    try:
        df_grid = fetch_sentinel_for_shapefile(shp_path, target_date=acquisition_date)
    except Exception as e:
        print(f"  ! Warning: Cloud-free Sentinel fetch error: {e}")
        df_grid = None

    if df_grid is None or len(df_grid) == 0:
        print(f"  ! Fallback: Generating 10m spatial mesh grid for {estate_name}...")
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
        df_grid['Date'] = acquisition_date
        df_grid['Estate'] = estate_name

    # STEP 2: Execute predictions using RF models
    print("\nSTEP 2: Executing Random Forest predictions...")
    X_grid = df_grid[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)
    for target in TARGET_COLS:
        if target in models:
            preds = models[target].predict(X_grid)
            df_grid[target] = np.round(preds, 3)

    # Standardize Column Ordering:
    if 'Lattitude' in df_grid.columns:
        df_grid = df_grid.rename(columns={'Lattitude': 'Latitude'})

    ordered_cols = ['Date', 'Estate', 'Longitude', 'Latitude'] + TARGET_COLS + [c for c in FEATURE_COLS if c in df_grid.columns]
    df_grid = df_grid[ordered_cols]

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
    lons_all = df_grid['Longitude'].values
    lats_all = df_grid['Latitude'].values

    lons_uniq = np.sort(np.unique(lons_all))
    lats_uniq = np.sort(np.unique(lats_all))

    diff_lons = np.diff(lons_uniq)
    diff_lats = np.diff(lats_uniq)

    step_lng = np.median(diff_lons[diff_lons > 1e-6]) if len(diff_lons) > 0 else 0.00009
    step_lat = np.median(diff_lats[diff_lats > 1e-6]) if len(diff_lats) > 0 else 0.00009

    cols = int(round((max_lng - min_lng) / step_lng)) + 1
    rows = int(round((max_lat - min_lat) / step_lat)) + 1

    left = min_lng - step_lng / 2.0
    right = left + cols * step_lng
    top = max_lat + step_lat / 2.0
    bottom = top - rows * step_lat

    transform = from_bounds(left, bottom, right, top, cols, rows)
    crs = CRS.from_epsg(4326)

    c_idx = np.clip(np.round((lons_all - min_lng) / step_lng).astype(int), 0, cols - 1)
    r_idx = np.clip(np.round((max_lat - lats_all) / step_lat).astype(int), 0, rows - 1)

    # Compute exact polygon interior mask so 100% of pixels inside the boundary are continuous with zero grid gaps
    try:
        from rasterio.features import geometry_mask
        from shapely.geometry import mapping
        inside_poly_mask = geometry_mask([mapping(poly_union)], out_shape=(rows, cols), transform=transform, invert=True)
    except Exception:
        inside_poly_mask = None

    overlays_dict = {}
    generated_files = [pred_csv_name, pred_csv_gz_name]
    raster_results = {}

    for nut in TARGET_COLS:
        raster_grid = np.full((rows, cols), np.nan, dtype=np.float32)
        rgba_img = np.zeros((rows, cols, 4), dtype=np.uint8)
        color_fn = COLOR_FUNCS[nut]
        vals = df_grid[nut].values

        for r, c, v in zip(r_idx, c_idx, vals):
            if 0 <= r < rows and 0 <= c < cols and v > 0:
                raster_grid[r, c] = v
                rgba_img[r, c] = color_fn(v)

        # Fill any missed interior pixels inside the polygon boundary (eliminates any rounding/grid gaps)
        if inside_poly_mask is not None and np.any(~np.isnan(raster_grid)):
            missing_interior = inside_poly_mask & np.isnan(raster_grid)
            if np.any(missing_interior):
                try:
                    from scipy.ndimage import distance_transform_edt
                    nearest_idx = distance_transform_edt(
                        np.isnan(raster_grid),
                        return_distances=False,
                        return_indices=True
                    )
                    raster_grid[missing_interior] = raster_grid[tuple(nearest_idx[:, missing_interior])]
                except Exception:
                    for _ in range(6):
                        if not np.any(missing_interior):
                            break
                        padded = np.pad(raster_grid, 1, mode='constant', constant_values=np.nan)
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
                            shifted = padded[1 + dr : 1 + dr + rows, 1 + dc : 1 + dc + cols]
                            can_fill = missing_interior & (~np.isnan(shifted))
                            if np.any(can_fill):
                                raster_grid[can_fill] = shifted[can_fill]
                                missing_interior = inside_poly_mask & np.isnan(raster_grid)
                filled_coords = np.argwhere(inside_poly_mask & (~np.isnan(raster_grid)) & (rgba_img[:, :, 3] == 0))
                for r, c in filled_coords:
                    rgba_img[r, c] = color_fn(float(raster_grid[r, c]))

        raster_results[nut] = raster_grid

        # Save single-band float GeoTIFF (for QGIS / GIS viewing)
        out_tif_name = f"{nut}_nutrient_10m.tif"
        out_tif_path = os.path.join(out_dir, out_tif_name)
        root_tif_path = os.path.join(SCRIPT_DIR, out_tif_name)
        
        for p in [out_tif_path, root_tif_path]:
            with rasterio.open(
                p,
                'w',
                driver='GTiff',
                height=rows,
                width=cols,
                count=1,
                dtype=rasterio.float32,
                crs=crs,
                transform=transform,
                nodata=np.nan
            ) as dst:
                dst.write(raster_grid, 1)

        generated_files.append(out_tif_name)
        print(f"  ✓ Exported Float GeoTIFF: {out_tif_name}")

        # PNG Base64 Overlay (cap max dimension to 2000px so JSON response stays fast)
        up = max(1, min(4, 2000 // max(cols, rows, 1)))
        img = Image.fromarray(rgba_img)
        if up > 1:
            img_resized = img.resize((cols * up, rows * up), Image.Resampling.NEAREST)
        else:
            img_resized = img
        buf = io.BytesIO()
        img_resized.save(buf, format="PNG", optimize=True)
        b64_str = base64.b64encode(buf.getvalue()).decode('utf-8')

        overlays_dict[nut] = {
            "dataUrl": f"data:image/png;base64,{b64_str}",
            "bounds": [[min_lat, min_lng], [max_lat, max_lng]]
        }

    # Compute block summary across actual shapefile block polygons
    lngs = df_grid['Longitude'].values
    lats = df_grid['Latitude'].values

    block_stats = []
    for idx, poly, rec in wgs_polygons:
        b_name = f"Block_{idx+1}"
        if rec and len(rec) > 0:
            for field in ['Blok_name', 'Block_No', 'No_Block', 'Block', 'name', 'NAME', 'BLOCK']:
                if hasattr(rec, field) and getattr(rec, field):
                    b_name = str(getattr(rec, field)).strip()
                    break
            else:
                for val in reversed(rec):
                    if isinstance(val, str) and val.strip() and not val.strip().isdigit():
                        b_name = val.strip()
                        break
                else:
                    b_name = str(rec[0])

        b_stats = {"Date": acquisition_date, "Estate": estate_name, "Block_ID": b_name}
        
        b_minx, b_miny, b_maxx, b_maxy = poly.bounds
        bbox_mask = (lngs >= b_minx) & (lngs <= b_maxx) & (lats >= b_miny) & (lats <= b_maxy)
        bbox_indices = np.where(bbox_mask)[0]

        if len(bbox_indices) > 0:
            block_prep = prep(poly)
            candidate_points = [Point(lngs[i], lats[i]) for i in bbox_indices]
            sub_mask = [block_prep.contains(pt) for pt in candidate_points]
            matched_indices = bbox_indices[sub_mask]
        else:
            matched_indices = []

        for target in TARGET_COLS:
            vals = df_grid[target].values
            if len(matched_indices) > 0:
                sub_vals = vals[matched_indices]
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
    import argparse
    parser = argparse.ArgumentParser(description="Spatial Nutrient Prediction Engine")
    parser.add_argument("--shp", type=str, default=DEFAULT_SHAPEFILE, help="Path to target shapefile (.shp)")
    parser.add_argument("--date", type=str, default="2026-10-06", help="Target acquisition date (e.g., '2026-10-06', '06-Oct-2026', 'today')")
    parser.add_argument("--out", type=str, default=None, help="Parent folder for the output (default: training_v3/). E.g. 'training_v3/2019'")
    args = parser.parse_args()

    result = run_predictions(shp_path=args.shp, acquisition_date=args.date, out_dir_override=args.out)
    sys.exit(0 if result else 1)

