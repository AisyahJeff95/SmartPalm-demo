#!/usr/bin/env python3
"""
Sentinel-1 and Sentinel-2 Data Fetcher for SmartPalm.
Fetches optical (B1-B12) and SAR (Sigma0, Gamma0, Beta0 for VV and VH)
satellite metrics from Microsoft Planetary Computer STAC API for plot coordinates in CSV.

Target CSV: 1. Preprocessing_cloud/v1_training_data.csv
"""

import os
import sys
import json
import math
import argparse
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import transform, transform_bounds
from rasterio.windows import from_bounds

# Planetary Computer STAC Endpoints
STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SAS_TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token"

# Band Mappings
S2_BAND_MAP = {
    'Band12': 'B12',  # SWIR 2 (2190 nm)
    'Band11': 'B11',  # SWIR 1 (1610 nm)
    'Band9':  'B09',  # Water Vapor (945 nm)
    'Band8A': 'B8A',  # Narrow NIR (865 nm)
    'Band8':  'B08',  # NIR (842 nm)
    'Band7':  'B07',  # Red Edge 3 (783 nm)
    'Band6':  'B06',  # Red Edge 2 (740 nm)
    'Band5':  'B05',  # Red Edge 1 (705 nm)
    'Band4':  'B04',  # Red (665 nm)
    'Band3':  'B03',  # Green (560 nm)
    'Band2':  'B02',  # Blue (490 nm)
    'Band1':  'B01',  # Coastal Aerosol (443 nm)
}

S1_BAND_COLS = [
    'Sigma0_VV', 'Sigma0_VH',
    'Gamma0_VV', 'Gamma0_VH',
    'Beta0_VV',  'Beta0_VH'
]

ALL_SENTINEL_COLS = list(S2_BAND_MAP.keys()) + S1_BAND_COLS


def get_sas_token(collection: str) -> str:
    """Fetch SAS token for authenticating Planetary Computer COG assets."""
    url = f"{SAS_TOKEN_URL}/{collection}"
    req = urllib.request.Request(url, headers={"User-Agent": "SmartPalm-Fetcher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("token", "")
    except Exception as e:
        print(f"[Warning] Failed to fetch SAS token for {collection}: {e}")
        return ""


def request_stac(payload: dict) -> dict:
    """Send search request to Planetary Computer STAC API."""
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "SmartPalm-Fetcher/1.0"}
    req = urllib.request.Request(STAC_API_URL, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_date(date_str: str) -> datetime:
    """Parse date string formats like '05-Apr-22' or '2022-04-05'."""
    for fmt in ("%d-%b-%y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except ValueError:
            pass
    # Default fallback
    return datetime(2022, 4, 5)


def sign_url(url: str, token: str) -> str:
    """Append SAS token to asset URL."""
    if token:
        return f"{url}&{token}" if "?" in url else f"{url}?{token}"
    return url


def read_window_data(asset_url: str, bbox: list, out_crs="EPSG:4326"):
    """Read a bounding box window from a COG asset."""
    with rasterio.open(asset_url) as src:
        minx, miny, maxx, maxy = transform_bounds(out_crs, src.crs, bbox[0], bbox[1], bbox[2], bbox[3])
        win = from_bounds(minx, miny, maxx, maxy, src.transform)
        win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        
        data = src.read(1, window=win)
        win_transform = rasterio.windows.transform(win, src.transform)
        return data, src.crs, win_transform


def sample_coordinates(data: np.ndarray, crs, win_transform, lons: np.ndarray, lats: np.ndarray):
    """Sample pixel values from raster data array for given longitude and latitude arrays."""
    xs, ys = transform('EPSG:4326', crs, lons, lats)
    rows, cols = rasterio.transform.rowcol(win_transform, xs, ys)
    
    # Clamp bounds to array shape
    rows = np.clip(rows, 0, data.shape[0] - 1)
    cols = np.clip(cols, 0, data.shape[1] - 1)
    
    return data[rows, cols]


def find_column(df: pd.DataFrame, candidates: list) -> str:
    """Find the first matching column name candidate in DataFrame."""
    for col in df.columns:
        if str(col).strip().lower() in [c.lower() for c in candidates]:
            return col
    return None


def fetch_sentinel_data(
    csv_path: str,
    output_path: str = None,
    days_margin: int = 30,
    lon_col: str = None,
    lat_col: str = None,
    date_col: str = None,
    default_date: str = "2022-04-05"
):
    """
    Main function to fetch Sentinel-1 and Sentinel-2 data for ANY CSV file.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Input CSV file not found: {csv_path}")

    print(f"Reading input CSV: {csv_path}")
    df = pd.read_csv(csv_path)

    # 1. Automatic Column Detection for Coordinates
    if not lon_col:
        lon_col = find_column(df, ['Longitude', 'longitude', 'long', 'lon', 'lng', 'x'])
    if not lat_col:
        lat_col = find_column(df, ['Lattitude', 'Latitude', 'latitude', 'lat', 'y'])

    if not lon_col or not lat_col:
        raise ValueError(
            f"Could not automatically detect longitude/latitude columns in CSV.\n"
            f"Available columns: {list(df.columns)}\n"
            f"Please specify --lon-col and --lat-col."
        )

    print(f"Using Coordinate Columns -> Longitude: '{lon_col}', Latitude: '{lat_col}'")
    lons = df[lon_col].astype(float).values
    lats = df[lat_col].astype(float).values
    num_points = len(df)

    # Determine Bounding Box with margin (~5km)
    min_lon, max_lon = lons.min() - 0.005, lons.max() + 0.005
    min_lat, max_lat = lats.min() - 0.005, lats.max() + 0.005
    bbox = [min_lon, min_lat, max_lon, max_lat]
    print(f"Dataset Bounding Box: [{min_lon:.5f}, {min_lat:.5f}, {max_lon:.5f}, {max_lat:.5f}]")

    # 2. Date Column Detection
    if not date_col:
        date_col = find_column(df, ['Date', 'date', 'acquisition_date', 'datetime', 'timestamp', 'date_sampled'])

    if date_col and date_col in df.columns and not df[date_col].isnull().all():
        sample_date = parse_date(df[date_col].iloc[0])
        print(f"Using Date Column '{date_col}' -> Target Date: {sample_date.strftime('%Y-%m-%d')}")
    else:
        sample_date = parse_date(default_date)
        print(f"No valid date column found. Using default target date: {sample_date.strftime('%Y-%m-%d')}")

    start_date = (sample_date - timedelta(days=days_margin)).strftime("%Y-%m-%d")
    end_date = (sample_date + timedelta(days=days_margin)).strftime("%Y-%m-%d")
    print(f"Search range: {start_date} to {end_date} (Margin: ±{days_margin} days)")

    # Fetch SAS Tokens
    print("\nFetching SAS authentication tokens from Microsoft Planetary Computer...")
    s2_token = get_sas_token("sentinel-2-l2a")
    s1_token = get_sas_token("sentinel-1-rtc")

    # -------------------------------------------------------------
    # 1. Fetch Sentinel-2 Optical Data
    # -------------------------------------------------------------
    print("\n--- Querying Sentinel-2 L2A Scenes ---")
    s2_payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": f"{start_date}/{end_date}",
        "query": {"eo:cloud_cover": {"lt": 60.0}},
        "sortby": [{"field": "properties.datetime", "direction": "asc"}],
        "limit": 15
    }
    s2_res = request_stac(s2_payload)
    s2_scenes = s2_res.get("features", [])
    print(f"Found {len(s2_scenes)} Sentinel-2 scenes in search window.")

    if not s2_scenes:
        raise RuntimeError(f"No Sentinel-2 scenes found in range {start_date} to {end_date} for bbox {bbox}.")

    # Evaluate SCL scene quality over coordinates
    best_s2_scene = None
    best_clear_count = -1

    for sc in s2_scenes:
        scl_asset = sc["assets"].get("SCL")
        if not scl_asset:
            continue
        scl_url = sign_url(scl_asset["href"], s2_token)
        try:
            scl_data, crs, win_tf = read_window_data(scl_url, bbox)
            pt_scl = sample_coordinates(scl_data, crs, win_tf, lons, lats)
            clear_mask = (pt_scl == 4) | (pt_scl == 5) | (pt_scl == 6)
            clear_count = int(np.sum(clear_mask))
            cloud_pct = sc["properties"].get("eo:cloud_cover", 100.0)
            date_str = sc["properties"]["datetime"][:10]
            print(f"  Scene {sc['id']} ({date_str}) | Cloud%: {cloud_pct:.1f}% | Clear plots: {clear_count}/{num_points}")
            
            if clear_count > best_clear_count:
                best_clear_count = clear_count
                best_s2_scene = sc
                if clear_count == num_points:
                    break
        except Exception as e:
            print(f"  [Warning] Error reading SCL for scene {sc['id']}: {e}")

    if not best_s2_scene:
        best_s2_scene = s2_scenes[0]

    print(f"\nSelected Primary Sentinel-2 Scene: {best_s2_scene['id']} ({best_s2_scene['properties']['datetime']})")

    # Read S2 Bands
    s2_results = {}
    s2_assets = best_s2_scene["assets"]

    for b_col, b_asset in S2_BAND_MAP.items():
        if b_asset not in s2_assets:
            print(f"  [Warning] Band asset {b_asset} missing from scene.")
            s2_results[b_col] = np.full(num_points, np.nan)
            continue
        
        b_url = sign_url(s2_assets[b_asset]["href"], s2_token)
        print(f"  Reading Sentinel-2 {b_col} ({b_asset})...")
        data, crs, win_tf = read_window_data(b_url, bbox)
        raw_vals = sample_coordinates(data, crs, win_tf, lons, lats)
        reflectance_vals = raw_vals.astype(np.float32) / 10000.0
        s2_results[b_col] = np.round(reflectance_vals, 6)

    # -------------------------------------------------------------
    # 2. Fetch Sentinel-1 SAR Data
    # -------------------------------------------------------------
    print("\n--- Querying Sentinel-1 RTC Scenes ---")
    s1_payload = {
        "collections": ["sentinel-1-rtc"],
        "bbox": bbox,
        "datetime": f"{start_date}/{end_date}",
        "sortby": [{"field": "properties.datetime", "direction": "asc"}],
        "limit": 10
    }
    s1_res = request_stac(s1_payload)
    s1_scenes = s1_res.get("features", [])
    print(f"Found {len(s1_scenes)} Sentinel-1 RTC scenes.")

    if not s1_scenes:
        raise RuntimeError(f"No Sentinel-1 RTC scenes found in range {start_date} to {end_date} for bbox {bbox}.")

    best_s1_scene = min(
        s1_scenes,
        key=lambda s: abs((parse_date(s['properties']['datetime'][:10]) - sample_date).total_seconds())
    )
    print(f"Selected Primary Sentinel-1 Scene: {best_s1_scene['id']} ({best_s1_scene['properties']['datetime']})")

    s1_assets = best_s1_scene["assets"]
    vv_url = sign_url(s1_assets["vv"]["href"], s1_token)
    vh_url = sign_url(s1_assets["vh"]["href"], s1_token)

    print("  Reading Sentinel-1 VV polarization...")
    vv_data, s1_crs, s1_win_tf = read_window_data(vv_url, bbox)
    vv_vals = sample_coordinates(vv_data, s1_crs, s1_win_tf, lons, lats).astype(np.float32)

    print("  Reading Sentinel-1 VH polarization...")
    vh_data, _, _ = read_window_data(vh_url, bbox)
    vh_vals = sample_coordinates(vh_data, s1_crs, s1_win_tf, lons, lats).astype(np.float32)

    inc_angle_deg = 38.5
    inc_rad = math.radians(inc_angle_deg)
    cos_inc = math.cos(inc_rad)
    tan_inc = math.tan(inc_rad)

    gamma0_vv = vv_vals
    gamma0_vh = vh_vals

    sigma0_vv = gamma0_vv * cos_inc
    sigma0_vh = gamma0_vh * cos_inc

    beta0_vv = gamma0_vv / tan_inc
    beta0_vh = gamma0_vh / tan_inc

    s1_results = {
        'Sigma0_VV': np.round(sigma0_vv, 6),
        'Sigma0_VH': np.round(sigma0_vh, 6),
        'Gamma0_VV': np.round(gamma0_vv, 6),
        'Gamma0_VH': np.round(gamma0_vh, 6),
        'Beta0_VV':  np.round(beta0_vv, 6),
        'Beta0_VH':  np.round(beta0_vh, 6)
    }

    # -------------------------------------------------------------
    # 3. Update DataFrame and Save CSV
    # -------------------------------------------------------------
    print("\n--- Populating DataFrame Columns ---")
    for col, vals in {**s2_results, **s1_results}.items():
        df[col] = vals
        print(f"  {col:10s} | Mean: {np.nanmean(vals):.6f} | Min: {np.nanmin(vals):.6f} | Max: {np.nanmax(vals):.6f}")

    if output_path is None:
        output_path = csv_path

    df.to_csv(output_path, index=False)
    print(f"\nSuccessfully saved updated Sentinel data to: {output_path}")
    print(f"Total rows updated: {len(df)}")
    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Sentinel-1 and Sentinel-2 data for ANY CSV file.")
    parser.add_argument("--csv", "-i", type=str, required=True, help="Input CSV path")
    parser.add_argument("--output", "-o", type=str, default=None, help="Output CSV path (default: overwrite input)")
    parser.add_argument("--days", type=int, default=30, help="Search range in days around sample date")
    parser.add_argument("--lon-col", type=str, default=None, help="Longitude column name (optional)")
    parser.add_argument("--lat-col", type=str, default=None, help="Latitude column name (optional)")
    parser.add_argument("--date-col", type=str, default=None, help="Date column name (optional)")
    parser.add_argument("--default-date", type=str, default="2022-04-05", help="Default target date if no date column exists")

    args = parser.parse_args()
    fetch_sentinel_data(
        csv_path=args.csv,
        output_path=args.output,
        days_margin=args.days,
        lon_col=args.lon_col,
        lat_col=args.lat_col,
        date_col=args.date_col,
        default_date=args.default_date
    )

