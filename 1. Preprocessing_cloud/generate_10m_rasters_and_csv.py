#!/usr/bin/env python3
"""
10m Pixel Grid GeoTIFF Raster and CSV Generator for SmartPalm.
Generates 10m x 10m resolution GeoTIFF rasters for N, P, K, Mg nutrients and a
comprehensive 10m CSV dataset for visualization on the comprehensive map in development/.

Target Estate: PPPTAR Estate, Malaysia
Input CSV: 1. Preprocessing_cloud/v1_training_data.csv
Boundaries: development/boundaries/Ladang PPPTAR.shp
"""

import os
import sys
import json
import math
import time
import urllib.request
import numpy as np
import pandas as pd
import shapefile
from shapely.geometry import shape, Point
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform, transform_bounds
from rasterio.features import rasterize

# Import helper functions from fetch_sentinel_data.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fetch_sentinel_data import get_sas_token, request_stac, sign_url, read_window_data, sample_coordinates, S2_BAND_MAP, S1_BAND_COLS

def main():
    print("==================================================================")
    print("  SmartPalm 10m Pixel Grid GeoTIFF & CSV Generator")
    print("  Target Estate: PPPTAR Estate")
    print("==================================================================\n")

    t_start = time.time()

    # 1. Paths definition
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dev_dir = os.path.abspath(os.path.join(base_dir, "../development"))
    csv_input_path = os.path.join(base_dir, "v1_training_data.csv")
    shp_path = os.path.join(dev_dir, "boundaries/Ladang PPPTAR.shp")

    if not os.path.exists(csv_input_path):
        raise FileNotFoundError(f"Input CSV not found: {csv_input_path}")
    if not os.path.exists(shp_path):
        raise FileNotFoundError(f"Estate boundary shapefile not found: {shp_path}")

    # Load 294 discrete sample points
    print(f"Loading sample plot data from: {csv_input_path}")
    df_samples = pd.read_csv(csv_input_path)
    sample_lons = df_samples['Longitude'].values
    sample_lats = df_samples['Lattitude'].values

    # Load shapefile polygons
    print(f"Loading estate block boundaries from: {shp_path}")
    sf = shapefile.Reader(shp_path)
    records = sf.records()
    num_shapes = len(sf.shapes())
    print(f"Loaded {num_shapes} estate block polygons.")

    # Build shapes list and plot names mapping
    shapes_list = [shape(sf.shape(i)) for i in range(num_shapes)]
    plot_names_map = [records[i]['Peringkat'].strip() for i in range(num_shapes)]

    # Bounding box of estate with small padding (~100m)
    bbox_shp = sf.bbox  # [xmin, ymin, xmax, ymax]
    padding_deg = 0.001
    xmin, ymin, xmax, ymax = (
        bbox_shp[0] - padding_deg,
        bbox_shp[1] - padding_deg,
        bbox_shp[2] + padding_deg,
        bbox_shp[3] + padding_deg,
    )
    bbox_geo = [xmin, ymin, xmax, ymax]

    # 10m pixel resolution step in WGS84 degrees (~0.00008983 deg ≈ 10.0m)
    res_deg = 10.0 / 111320.0
    cols = int(np.ceil((xmax - xmin) / res_deg))
    rows = int(np.ceil((ymax - ymin) / res_deg))
    print(f"\nConstructing 10m Spatial Grid:")
    print(f"  Dimensions: {rows} rows x {cols} cols ({rows * cols} total 10m pixels)")
    print(f"  Bounding Box [WGS84]: [{xmin:.5f}, {ymin:.5f}, {xmax:.5f}, {ymax:.5f}]")

    # Generate Grid Mesh
    grid_x = np.linspace(xmin, xmax, cols)
    grid_y = np.linspace(ymax, ymin, rows)  # North to South
    grid_lon, grid_lat = np.meshgrid(grid_x, grid_y)

    flat_lon = grid_lon.ravel()
    flat_lat = grid_lat.ravel()
    num_pixels = len(flat_lon)

    # 2. Rasterize Polygon Block Names (Spatial Join for Plot Name)
    print("\nMapping official block 'Peringkat' names to 10m grid cells...")
    out_transform = from_bounds(xmin, ymin, xmax, ymax, cols, rows)
    
    shapes_with_ids = [(shapes_list[i], i + 1) for i in range(num_shapes)]
    grid_block_ids = rasterize(
        shapes_with_ids,
        out_shape=(rows, cols),
        transform=out_transform,
        fill=0,
        dtype=np.int32
    ).ravel()

    # Create plot names array
    block_names_lut = np.array(["Outside"] + plot_names_map)
    grid_plot_names = block_names_lut[grid_block_ids]
    print(f"  Inside Estate boundary: {np.sum(grid_block_ids > 0)} pixels")
    print(f"  Outside Estate boundary: {np.sum(grid_block_ids == 0)} pixels")

    # 3. Vectorized IDW Spatial Interpolation for Nutrients (N, P, K, Ca, Mg, B)
    print("\nPerforming spatial interpolation for nutrients across 10m grid...")
    nutrient_cols = ['N', 'P', 'K', 'Ca', 'Mg', 'B']
    sample_pts = np.vstack([sample_lons, sample_lats]).T
    grid_pts = np.vstack([flat_lon, flat_lat]).T

    grid_nutrients = {}
    chunk_size = 15000

    for nut in nutrient_cols:
        sample_vals = df_samples[nut].values
        interp_vals = np.zeros(num_pixels, dtype=np.float32)

        for i in range(0, num_pixels, chunk_size):
            chunk_pts = grid_pts[i:i + chunk_size]
            dists = np.sqrt(np.sum((chunk_pts[:, np.newaxis, :] - sample_pts[np.newaxis, :, :]) ** 2, axis=2))
            dists = np.maximum(dists, 1e-12)
            weights = 1.0 / (dists ** 2)
            weights /= np.sum(weights, axis=1, keepdims=True)
            interp_vals[i:i + chunk_size] = np.sum(weights * sample_vals, axis=1)

        grid_nutrients[nut] = np.round(interp_vals, 4)
        print(f"  {nut:3s} | Min: {interp_vals.min():.4f} | Mean: {interp_vals.mean():.4f} | Max: {interp_vals.max():.4f}")

    # 4. Fetch Sentinel-1 & Sentinel-2 Satellite Metrics for all 10m pixels
    print("\nQuerying Satellite Scenes via Planetary Computer STAC API...")
    s2_token = get_sas_token("sentinel-2-l2a")
    s1_token = get_sas_token("sentinel-1-rtc")

    # S2 Search
    s2_payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox_geo,
        "datetime": "2022-03-15/2022-04-20",
        "query": {"eo:cloud_cover": {"lt": 50.0}},
        "sortby": [{"field": "properties.datetime", "direction": "asc"}],
        "limit": 10
    }
    s2_scenes = request_stac(s2_payload).get("features", [])
    
    # Pick cloud-free S2 scene
    best_s2_scene = None
    for sc in s2_scenes:
        if sc["id"] == "S2B_MSIL2A_20220324T032539_R018_T48NTK_20240531T144104":
            best_s2_scene = sc
            break
    if not best_s2_scene and s2_scenes:
        best_s2_scene = s2_scenes[0]

    print(f"Selected Primary Sentinel-2 Scene: {best_s2_scene['id']} ({best_s2_scene['properties']['datetime']})")

    # Read S2 Bands for 10m grid
    s2_grid_data = {}
    for b_col, b_asset in S2_BAND_MAP.items():
        url = sign_url(best_s2_scene["assets"][b_asset]["href"], s2_token)
        print(f"  Reading Sentinel-2 {b_col} ({b_asset})...")
        data, crs, win_tf = read_window_data(url, bbox_geo)
        sampled = sample_coordinates(data, crs, win_tf, flat_lon, flat_lat)
        s2_grid_data[b_col] = np.round(sampled.astype(np.float32) / 10000.0, 6)

    # S1 Search & Extract
    s1_payload = {
        "collections": ["sentinel-1-rtc"],
        "bbox": bbox_geo,
        "datetime": "2022-03-15/2022-04-20",
        "sortby": [{"field": "properties.datetime", "direction": "asc"}],
        "limit": 5
    }
    s1_scenes = request_stac(s1_payload).get("features", [])
    best_s1_scene = s1_scenes[0]
    print(f"Selected Primary Sentinel-1 Scene: {best_s1_scene['id']} ({best_s1_scene['properties']['datetime']})")

    vv_url = sign_url(best_s1_scene["assets"]["vv"]["href"], s1_token)
    vh_url = sign_url(best_s1_scene["assets"]["vh"]["href"], s1_token)

    print("  Reading Sentinel-1 VV polarization...")
    vv_data, s1_crs, s1_win_tf = read_window_data(vv_url, bbox_geo)
    vv_sampled = sample_coordinates(vv_data, s1_crs, s1_win_tf, flat_lon, flat_lat).astype(np.float32)

    print("  Reading Sentinel-1 VH polarization...")
    vh_data, _, _ = read_window_data(vh_url, bbox_geo)
    vh_sampled = sample_coordinates(vh_data, s1_crs, s1_win_tf, flat_lon, flat_lat).astype(np.float32)

    # Calculate SAR backscatter coefficients
    inc_rad = math.radians(38.5)
    cos_inc = math.cos(inc_rad)
    tan_inc = math.tan(inc_rad)

    s1_grid_data = {
        'Sigma0_VV': np.round(vv_sampled * cos_inc, 6),
        'Sigma0_VH': np.round(vh_sampled * cos_inc, 6),
        'Gamma0_VV': np.round(vv_sampled, 6),
        'Gamma0_VH': np.round(vh_sampled, 6),
        'Beta0_VV':  np.round(vv_sampled / tan_inc, 6),
        'Beta0_VH':  np.round(vh_sampled / tan_inc, 6),
    }

    # 5. Save GeoTIFF Rasters for N, P, K, Mg
    print("\n--- Exporting 10m GeoTIFF Rasters for N, P, K, Mg ---")
    raster_targets = ['N', 'P', 'K', 'Mg']
    
    # Export raster targets to both 1. Preprocessing_cloud and development/
    export_dirs = [base_dir, dev_dir]

    for nut in raster_targets:
        grid_2d = grid_nutrients[nut].reshape((rows, cols))
        
        for edir in export_dirs:
            # Primary filename
            filename = f"PPPTAR_Nutrient_{nut}_10m.tif"
            filepath = os.path.join(edir, filename)

            # Write single-band 32-bit float GeoTIFF
            with rasterio.open(
                filepath,
                'w',
                driver='GTiff',
                height=rows,
                width=cols,
                count=1,
                dtype=np.float32,
                crs='EPSG:4326',
                transform=out_transform,
                compress='lzw'
            ) as dst:
                dst.write(grid_2d, 1)

            # Also create standard Merge_Citra_Unsur_*.tif aliases in development for web map compatibility
            if edir == dev_dir:
                alias_name = f"Merge_Citra_Unsur_{nut}.tif"
                alias_path = os.path.join(dev_dir, alias_name)
                with rasterio.open(
                    alias_path,
                    'w',
                    driver='GTiff',
                    height=rows,
                    width=cols,
                    count=1,
                    dtype=np.float32,
                    crs='EPSG:4326',
                    transform=out_transform,
                    compress='lzw'
                ) as dst_alias:
                    dst_alias.write(grid_2d, 1)

        print(f"  Exported GeoTIFF -> PPPTAR_Nutrient_{nut}_10m.tif & Merge_Citra_Unsur_{nut}.tif")

    # 6. Save Complete 10m CSV Dataset
    print("\n--- Building Complete 10m Spatial CSV Dataset ---")
    df_grid = pd.DataFrame({
        'No.': np.arange(1, num_pixels + 1),
        'Date': '05-Apr-22',
        'Company': 'BWSB',
        'Estate': 'PPPTAR',
        'Plot': grid_plot_names,
        'Longitude': np.round(flat_lon, 7),
        'Lattitude': np.round(flat_lat, 7),
        **grid_nutrients,
        **s2_grid_data,
        **s1_grid_data
    })

    # Save to CSV files
    csv_out_local = os.path.join(base_dir, "v1_training_data_10m.csv")
    csv_out_dev = os.path.join(dev_dir, "v1_training_data_10m.csv")

    df_grid.to_csv(csv_out_local, index=False)
    df_grid.to_csv(csv_out_dev, index=False)

    print(f"\nSuccessfully created 10m Spatial CSV:")
    print(f"  Local Path: {csv_out_local}")
    print(f"  Dev Path:   {csv_out_dev}")
    print(f"  Total 10m Rows: {len(df_grid)}")
    print(f"  Total Execution Time: {round(time.time() - t_start, 2)} s")

if __name__ == "__main__":
    main()
