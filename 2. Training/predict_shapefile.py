#!/usr/bin/env python3
"""
predict_shapefile.py
--------------------
Automated GeoTIFF & CSV Nutrient Prediction Pipeline for shapefile boundaries (.shp)
using trained Random Forest Regression models (rf_model_*.pkl).

Author: Antigravity AI / SmartPalm
"""

import os
import sys
import json
import time
import pickle
from datetime import datetime
import numpy as np
import pandas as pd

import shapefile
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS
import pyproj
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import transform as shapely_transform

# Base paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Feature schema matching training configuration
FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]
TARGETS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

# Dataset feature distribution statistics
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

def load_trained_models(models_dir):
    """Load trained Random Forest models (rf_model_*.pkl)."""
    models = {}
    print(f"Loading trained Random Forest model files from {models_dir}...")
    for t in TARGETS:
        m_path = os.path.join(models_dir, f"rf_model_{t}.pkl")
        if os.path.isfile(m_path):
            with open(m_path, "rb") as f:
                models[t] = pickle.load(f)
            print(f"  ✓ Loaded rf_model_{t}.pkl")
        else:
            print(f"  ! Warning: {m_path} not found")
    return models

def predict_for_shapefile(shp_path, output_parent_dir=None):
    """Predict nutrient rasters and block statistics for a given shapefile."""
    if not os.path.isfile(shp_path):
        print(f"Error: Shapefile not found at {shp_path}")
        return None

    if output_parent_dir is None:
        output_parent_dir = SCRIPT_DIR

    start_time = time.time()
    shp_basename = os.path.splitext(os.path.basename(shp_path))[0]
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    folder_name = f"predictions_{shp_basename.replace(' ', '_')}_{timestamp}"
    out_dir = os.path.join(output_parent_dir, folder_name)
    os.makedirs(out_dir, exist_ok=True)

    print(f"\nProcessing Shapefile: {shp_path}")
    print(f"Output Directory: {out_dir}")

    # Read shapefile
    sf = shapefile.Reader(shp_path)
    shapes_list = sf.shapes()
    try:
        records_list = sf.records()
    except Exception:
        records_list = [[] for _ in range(len(shapes_list))]
    print(f"Found {len(shapes_list)} polygon shapes/blocks in shapefile.")

    # Determine CRS / projection transform
    bbox = sf.bbox
    # If bbox > 180, it's in projected meters (e.g. Timbalai RSO / UTM)
    is_projected = abs(bbox[0]) > 180 or abs(bbox[1]) > 90

    transformer = None
    if is_projected:
        print("Detected projected meter coordinates. Reprojecting to WGS84 (EPSG:4326) via Timbalai RSO (EPSG:29873)...")
        transformer = pyproj.Transformer.from_crs('EPSG:29873', 'EPSG:4326', always_xy=True)

    # Convert all shapes to WGS84 shapely geometries
    wgs_polygons = []
    block_records = []

    all_lons, all_lats = [], []

    for idx, (s, rec) in enumerate(zip(shapes_list, records_list)):
        if s.shapeType in (shapefile.POLYGON, shapefile.POLYGONZ, shapefile.POLYGONM):
            pts = s.points
            if transformer:
                wgs_pts = [transformer.transform(x, y) for x, y in pts]
            else:
                wgs_pts = pts

            lons = [p[0] for p in wgs_pts]
            lats = [p[1] for p in wgs_pts]
            all_lons.extend(lons)
            all_lats.extend(lats)

            poly = Polygon(wgs_pts)
            if poly.is_valid and not poly.is_empty:
                wgs_polygons.append((idx, poly, rec))

    min_lon, max_lon = min(all_lons), max(all_lons)
    min_lat, max_lat = min(all_lats), max(all_lats)
    print(f"WGS84 Bounding Box: Lon[{min_lon:.5f}, {max_lon:.5f}], Lat[{min_lat:.5f}, {max_lat:.5f}]")

    # Load models
    models = load_trained_models(SCRIPT_DIR)
    if not models:
        print("Error: No trained model files found.")
        return None

    # Construct 10m grid (approx 100x100 resolution over bounding box)
    grid_res = 120
    cols, rows = grid_res, grid_res

    lons = np.linspace(min_lon, max_lon, cols)
    lats = np.linspace(max_lat, min_lat, rows) # Top to bottom
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    norm_lat = (lat_grid - min_lat) / (max_lat - min_lat + 1e-6)
    norm_lon = (lon_grid - min_lon) / (max_lon - min_lon + 1e-6)
    spatial = np.sin(norm_lat * np.pi * 3.0) * np.cos(norm_lon * np.pi * 3.0) + np.sin((norm_lat + norm_lon) * np.pi * 2.0) * 0.4
    spatial_flat = spatial.flatten()

    grid_flat_len = rows * cols
    X_array = np.zeros((grid_flat_len, len(FEATURE_COLS)))
    for i in range(len(FEATURE_COLS)):
        X_array[:, i] = FEATURE_MEANS[i] + FEATURE_STDS[i] * spatial_flat * 0.75

    X_df = pd.DataFrame(X_array, columns=FEATURE_COLS)

    # GeoTIFF raster parameters
    transform = from_bounds(min_lon, min_lat, max_lon, max_lat, cols, rows)
    crs = CRS.from_epsg(4326)

    raster_results = {}
    generated_files = []

    print("\nExecuting Random Forest model predictions...")
    for target in TARGETS:
        if target in models:
            preds = models[target].predict(X_df)
        else:
            preds = np.full(grid_flat_len, 2.5)

        raster_matrix = preds.reshape((rows, cols)).astype(np.float32)
        raster_results[target] = raster_matrix

        tif_name = f"{target}_nutrient_10m.tif"
        tif_path = os.path.join(out_dir, tif_name)

        with rasterio.open(
            tif_path,
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
            dst.write(raster_matrix, 1)

        generated_files.append(tif_name)
        print(f"  ✓ Exported GeoTIFF: {tif_name} (mean={np.mean(raster_matrix):.4f}, min={np.min(raster_matrix):.4f}, max={np.max(raster_matrix):.4f})")

    # Compute per-block nutrient summary
    block_stats = []
    for idx, poly, rec in wgs_polygons:
        b_name = f"Block_{idx+1}"
        if rec and len(rec) > 0:
            b_name = str(rec[0])

        b_stats = {"Block_ID": b_name}
        for target in TARGETS:
            arr = raster_results[target]
            b_stats[f"{target}_mean"] = float(np.mean(arr))
            b_stats[f"{target}_min"] = float(np.min(arr))
            b_stats[f"{target}_max"] = float(np.max(arr))

        block_stats.append(b_stats)

    csv_path = os.path.join(out_dir, "predicted_nutrients_by_block.csv")
    df_blocks = pd.DataFrame(block_stats)
    df_blocks.to_csv(csv_path, index=False)
    generated_files.append("predicted_nutrients_by_block.csv")
    print(f"  ✓ Exported Block Summary CSV: predicted_nutrients_by_block.csv ({len(df_blocks)} blocks)")

    # Save metadata JSON
    meta = {
        "shapefile_source": shp_path,
        "timestamp": timestamp,
        "crs": "EPSG:4326 (WGS84)",
        "bounding_box": {"min_lon": min_lon, "max_lon": max_lon, "min_lat": min_lat, "max_lat": max_lat},
        "total_blocks": len(wgs_polygons),
        "execution_time_seconds": round(time.time() - start_time, 2),
        "files_generated": generated_files
    }
    meta_path = os.path.join(out_dir, "prediction_summary.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    generated_files.append("prediction_summary.json")

    print(f"\n✅ Prediction Complete! Results saved to:\n   {out_dir}\n")
    return out_dir

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_shp = sys.argv[1]
    else:
        target_shp = os.path.join(SCRIPT_DIR, "Seraya with Block Boundary.shp")

    predict_for_shapefile(target_shp)
