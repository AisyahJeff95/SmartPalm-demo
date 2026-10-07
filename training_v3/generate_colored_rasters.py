#!/usr/bin/env python3
"""
generate_colored_rasters.py (4. Training_v3)
---------------------------------------------
Generates 4-Band RGBA Colored GeoTIFF Rasters (.tif) based on exact MPOB Nutrient Color Legends:
- Red    (#ff0000): Deficient / Critical low
- Orange (#ff9900): Low / Moderate
- Yellow (#ffff00): Marginal / Slight
- Green  (#00dc00): Optimum / Ideal
- Blue   (#0066ff): High / Surplus
- Brown  (#995522): Excess

Usage:
  python3 generate_colored_rasters.py --folder predictions_Seraya_with_Block_Boundary_2026-10-06_161103
  python3 generate_colored_rasters.py --all   # Processes all prediction folders in training_v3
"""

import os
import sys
import glob
import argparse
import numpy as np
import pandas as pd
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

# RGBA Color Definitions matching user HTML Legend
COLOR_RED    = [255, 0, 0, 255]      # #ff0000
COLOR_ORANGE = [255, 153, 0, 255]    # #ff9900
COLOR_YELLOW = [255, 255, 0, 255]    # #ffff00
COLOR_GREEN  = [0, 220, 0, 255]      # #00dc00
COLOR_BLUE   = [0, 102, 255, 255]    # #0066ff
COLOR_BROWN  = [153, 85, 34, 255]    # #995522
COLOR_NODATA = [0, 0, 0, 0]          # Transparent

def get_color_n(val):
    if val <= 0: return COLOR_NODATA
    if val <= 2.10: return COLOR_RED        # <= 2.1%
    if val <= 2.30: return COLOR_ORANGE     # 2.1% - 2.3%
    if val <= 2.50: return COLOR_YELLOW     # 2.3% - 2.5%
    if val <= 2.70: return COLOR_GREEN      # 2.5% - 2.7% (Optimum)
    if val <= 2.90: return COLOR_BLUE       # 2.7% - 2.9%
    return COLOR_BROWN                      # > 2.9%

def get_color_p(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.120: return COLOR_RED       # <= 0.120%
    if val <= 0.135: return COLOR_ORANGE    # 0.120% - 0.135%
    if val <= 0.150: return COLOR_YELLOW    # 0.135% - 0.150%
    if val <= 0.165: return COLOR_GREEN     # 0.150% - 0.165% (Optimum)
    if val <= 0.180: return COLOR_BLUE      # 0.165% - 0.180%
    return COLOR_BROWN                      # > 0.180%

def get_color_k(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.70: return COLOR_RED        # <= 0.70%
    if val <= 0.85: return COLOR_ORANGE     # 0.70% - 0.85%
    if val <= 1.00: return COLOR_YELLOW     # 0.85% - 1.00%
    if val <= 1.15: return COLOR_GREEN      # 1.00% - 1.15% (Optimum)
    if val <= 1.30: return COLOR_BLUE       # 1.15% - 1.30%
    return COLOR_BROWN                      # > 1.30%

def get_color_mg(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.20: return COLOR_RED        # <= 0.20%
    if val <= 0.22: return COLOR_ORANGE     # 0.20% - 0.22%
    if val <= 0.24: return COLOR_YELLOW     # 0.22% - 0.24%
    if val <= 0.26: return COLOR_GREEN      # 0.24% - 0.26% (Optimum)
    if val <= 0.28: return COLOR_BLUE       # 0.26% - 0.28%
    return COLOR_BROWN                      # > 0.28%

def get_color_ca(val):
    if val <= 0: return COLOR_NODATA
    if val <= 0.40: return COLOR_RED        # <= 0.40%
    if val <= 0.50: return COLOR_ORANGE     # 0.40% - 0.50%
    if val <= 0.60: return COLOR_YELLOW     # 0.50% - 0.60%
    if val <= 0.75: return COLOR_GREEN      # 0.60% - 0.75% (Optimum)
    if val <= 0.90: return COLOR_BLUE       # 0.75% - 0.90%
    return COLOR_BROWN                      # > 0.90%

def get_color_b(val):
    if val <= 0: return COLOR_NODATA
    if val <= 10.0: return COLOR_RED        # <= 10.0 ppm
    if val <= 15.0: return COLOR_ORANGE     # 10.0 - 15.0 ppm
    if val <= 20.0: return COLOR_YELLOW     # 15.0 - 20.0 ppm
    if val <= 30.0: return COLOR_GREEN      # 20.0 - 30.0 ppm (Optimum)
    if val <= 40.0: return COLOR_BLUE       # 30.0 - 40.0 ppm
    return COLOR_BROWN                      # > 40.0 ppm

COLOR_FUNCS = {
    'N': get_color_n, 'P': get_color_p, 'K': get_color_k,
    'Mg': get_color_mg, 'Ca': get_color_ca, 'B': get_color_b
}

def process_prediction_folder(target_dir: str):
    """Processes a prediction directory and exports colored RGBA GeoTIFFs for all 6 nutrients."""
    if not os.path.exists(target_dir):
        print(f"❌ Error: Directory not found -> {target_dir}")
        return

    print("==========================================================================")
    print(f"🎨 GENERATING COLORED RGBA GEOTIFF RASTERS")
    print(f"📁 Target Folder: {target_dir}")
    print("==========================================================================")

    csv_path = os.path.join(target_dir, "predicted_10m_nutrients.csv")
    if not os.path.exists(csv_path):
        # Check root fetched CSV if in main training_v3 dir
        csv_candidates = glob.glob(os.path.join(target_dir, "fetched_sentinel_*.csv"))
        if csv_candidates:
            csv_path = csv_candidates[0]
        else:
            print(f"❌ Could not find predicted_10m_nutrients.csv in {target_dir}")
            return

    df = pd.read_csv(csv_path)
    required_cols = ['Longitude', 'Latitude']
    if not all(col in df.columns for col in required_cols):
        print(f"❌ CSV is missing Longitude/Latitude columns: {csv_path}")
        return

    # Spatial Bounds & Dimensions
    min_lng, max_lng = df['Longitude'].min(), df['Longitude'].max()
    min_lat, max_lat = df['Latitude'].min(), df['Latitude'].max()

    lons_uniq = np.sort(np.unique(df['Longitude']))
    lats_uniq = np.sort(np.unique(df['Latitude']))[::-1] # Descending row order (top to bottom)

    cols = len(lons_uniq)
    rows = len(lats_uniq)

    transform = from_bounds(min_lng, min_lat, max_lng, max_lat, cols, rows)
    crs = CRS.from_epsg(4326)

    # Exact O(1) Dictionary Mapping
    lng_to_col = {val: i for i, val in enumerate(lons_uniq)}
    lat_to_row = {val: i for i, val in enumerate(lats_uniq)}

    c_idx = np.array([lng_to_col[lng] for lng in df['Longitude'].values])
    r_idx = np.array([lat_to_row[lat] for lat in df['Latitude'].values])

    for nut in TARGET_COLS:
        if nut not in df.columns:
            continue

        color_fn = COLOR_FUNCS[nut]
        vals = df[nut].values
        float_grid = np.full((rows, cols), np.nan, dtype=np.float32)
        rgba_img = np.zeros((rows, cols, 4), dtype=np.uint8)

        for r, c, v in zip(r_idx, c_idx, vals):
            if 0 <= r < rows and 0 <= c < cols and v > 0:
                float_grid[r, c] = v
                rgba_img[r, c] = color_fn(v)

        # 1. Update single-band float GeoTIFF
        out_tif_float = os.path.join(target_dir, f"{nut}_nutrient_10m.tif")
        with rasterio.open(
            out_tif_float,
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
            dst.write(float_grid, 1)

        # 2. Update 4-band RGBA Colored GeoTIFFs
        out_tif_colored1 = os.path.join(target_dir, f"{nut}_nutrient_10m_colored.tif")
        out_tif_colored2 = os.path.join(target_dir, f"{nut}_colored_10m.tif")

        for tif_path in [out_tif_colored1, out_tif_colored2]:
            with rasterio.open(
                tif_path,
                'w',
                driver='GTiff',
                height=rows,
                width=cols,
                count=4,
                dtype=rasterio.uint8,
                crs=crs,
                transform=transform,
                photometric='RGBA'
            ) as dst:
                dst.write(np.moveaxis(rgba_img, -1, 0))

        print(f"  ✓ Exported Float & Colored GeoTIFFs ({cols}x{rows}): {nut}_nutrient_10m.tif & {nut}_colored_10m.tif")


    print(f"✅ Successfully generated all 6 nutrient colored rasters in {target_dir}!\n")

def main():
    parser = argparse.ArgumentParser(description="Generate 4-Band RGBA Colored GeoTIFF Rasters for Nutrients")
    parser.add_argument("--folder", type=str, help="Specific prediction folder name or path")
    parser.add_argument("--all", action="store_true", help="Process all prediction folders in training_v3")
    args = parser.parse_args()

    if args.folder:
        target_path = args.folder if os.path.isabs(args.folder) else os.path.join(SCRIPT_DIR, args.folder)
        process_prediction_folder(target_path)
    elif args.all or len(sys.argv) == 1:
        # Process main training_v3 directory
        process_prediction_folder(SCRIPT_DIR)

        # Process all prediction subfolders
        pred_folders = glob.glob(os.path.join(SCRIPT_DIR, "predictions_*"))
        for folder in pred_folders:
            if os.path.isdir(folder):
                process_prediction_folder(folder)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
