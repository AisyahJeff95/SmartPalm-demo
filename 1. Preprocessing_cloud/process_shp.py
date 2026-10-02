#!/usr/bin/env python3
"""
Sentinel-1/2 Shapefile-Based Cloud Reconstruction Pipeline.
Parses Seraya_map.shp, filters a 10m grid inside the polygon, queries STAC API for
latest S1/S2 data, reconstructs cloudy pixels using Random Forest, and exports to CSV.
"""

import os
import json
import math
import struct
import random
import urllib.request
import urllib.parse
from urllib.error import HTTPError
import numpy as np
import rasterio
from rasterio.warp import transform, transform_bounds, reproject, Resampling
from rasterio.features import rasterize
from shapely.geometry import Polygon

# 1. Decision Tree and Random Forest Regressor classes in pure Python
class DecisionTreeRegressor:
    def __init__(self, max_depth=4, min_samples_split=2):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.feature_idx = None
        self.threshold = None
        self.left = None
        self.right = None
        self.value = None

    def fit(self, X, y, depth=0):
        n_samples = len(X)
        if n_samples == 0:
            self.value = 0.0
            return self
        
        self.value = sum(y) / n_samples
        
        if depth >= self.max_depth or n_samples < self.min_samples_split:
            return self
        
        n_features = len(X[0])
        best_sse = float('inf')
        best_feature = None
        best_threshold = None
        best_left_idx = None
        best_right_idx = None
        
        # Search for the best split
        for feature in range(n_features):
            values = [row[feature] for row in X]
            thresholds = set(values)
            if len(thresholds) > 30:
                thresholds = random.sample(list(thresholds), 30)
                
            for threshold in thresholds:
                left_idx = [i for i in range(n_samples) if X[i][feature] <= threshold]
                right_idx = [i for i in range(n_samples) if X[i][feature] > threshold]
                
                if not left_idx or not right_idx:
                    continue
                
                left_y = [y[i] for i in left_idx]
                right_y = [y[i] for i in right_idx]
                
                left_mean = sum(left_y) / len(left_y)
                right_mean = sum(right_y) / len(right_y)
                
                sse = sum((val - left_mean)**2 for val in left_y) + sum((val - right_mean)**2 for val in right_y)
                
                if sse < best_sse:
                    best_sse = sse
                    best_feature = feature
                    best_threshold = threshold
                    best_left_idx = left_idx
                    best_right_idx = right_idx
        
        if best_feature is not None:
            self.feature_idx = best_feature
            self.threshold = best_threshold
            self.left = DecisionTreeRegressor(self.max_depth, self.min_samples_split).fit(
                [X[i] for i in best_left_idx], [y[i] for i in best_left_idx], depth + 1
            )
            self.right = DecisionTreeRegressor(self.max_depth, self.min_samples_split).fit(
                [X[i] for i in best_right_idx], [y[i] for i in best_right_idx], depth + 1
            )
        return self

    def predict_row(self, x):
        if self.feature_idx is None:
            return self.value
        if x[self.feature_idx] <= self.threshold:
            return self.left.predict_row(x)
        else:
            return self.right.predict_row(x)

class RandomForestRegressor:
    def __init__(self, n_estimators=10, max_depth=4, min_samples_split=2):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.trees = []

    def fit(self, X, y):
        self.trees = []
        n_samples = len(X)
        if n_samples == 0:
            return self
        for _ in range(self.n_estimators):
            indices = [random.randint(0, n_samples - 1) for _ in range(n_samples)]
            X_b = [X[i] for i in indices]
            y_b = [y[i] for i in indices]
            tree = DecisionTreeRegressor(self.max_depth, self.min_samples_split)
            tree.fit(X_b, y_b)
            self.trees.append(tree)
        return self

    def predict(self, X):
        if not self.trees:
            return [0.0] * len(X)
        predictions = [[tree.predict_row(x) for tree in self.trees] for x in X]
        return [sum(pred_list) / len(pred_list) for pred_list in predictions]

# 2. Planetary Computer API helper utilities
STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"

def request_json(url: str, payload: dict = None) -> dict:
    headers = {"Content-Type": "application/json", "User-Agent": "shp-extractor/1.0"}
    if payload:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}\n{detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"Could not reach {url}: {exc}") from exc

def get_sas_token(collection: str) -> str:
    token_url = f"https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}"
    try:
        res = request_json(token_url)
        return res.get("token", "")
    except Exception as e:
        print(f"[Warning] Failed to fetch SAS token for {collection}: {e}")
        return ""

def sign_url(url: str, token: str) -> str:
    if token:
        return f"{url}&{token}" if "?" in url else f"{url}?{token}"
    return url

# 3. Shapefile binary parser
def parse_shp_polygon(shp_path):
    with open(shp_path, 'rb') as f:
        header = f.read(100)
        file_code = struct.unpack('>i', header[:4])[0]
        shape_type = struct.unpack('<i', header[32:36])[0]
        if file_code != 9994:
            raise ValueError("Invalid shapefile file code.")
        if shape_type != 5:
            raise ValueError("Shapefile does not contain a Polygon geometry.")
        
        # Read first record header
        record_header = f.read(8)
        if len(record_header) < 8:
            raise ValueError("Shapefile contains no records.")
        rec_num, rec_len = struct.unpack('>2i', record_header)
        
        # Read record content
        rec_content = f.read(rec_len * 2)
        rec_shape_type = struct.unpack('<i', rec_content[:4])[0]
        if rec_shape_type != 5:
            raise ValueError("First record in shapefile is not a Polygon.")
            
        box = struct.unpack('<4d', rec_content[4:36]) # [xmin, ymin, xmax, ymax]
        num_parts, num_points = struct.unpack('<2i', rec_content[36:44])
        parts = struct.unpack(f'<{num_parts}i', rec_content[44:44 + 4 * num_parts])
        
        # Read points
        points_offset = 44 + 4 * num_parts
        points = []
        for i in range(num_points):
            x, y = struct.unpack('<2d', rec_content[points_offset + i * 16 : points_offset + (i + 1) * 16])
            points.append((x, y))
            
    return box, points

def main():
    print("====================================================")
    print("  Sentinel-1/2 Shapefile-Based Extraction Pipeline")
    print("  Target: Seraya Estate, Sabah, Malaysia")
    print("====================================================\n")

    # Set up GDAL configuration for fast Cloud-Optimized GeoTIFF reads
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "YES"
    os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif,.tiff"

    # Define shapefile path
    shp_path = "../shp-to-sentinel-csv/Seraya_map.shp"
    if not os.path.exists(shp_path):
        # Check if shapefile is in current directory (alternative)
        shp_path = "Seraya_map.shp"
        if not os.path.exists(shp_path):
            raise FileNotFoundError("Could not find Seraya_map.shp. Please check the paths.")

    print(f"Parsing shapefile: {shp_path}...")
    box, points = parse_shp_polygon(shp_path)
    print(f"  Shapefile BBOX (UTM Zone 50N): {box}")
    print(f"  Boundary coordinates parsed: {len(points)} vertices.")

    # Create Shapely Polygon
    poly = Polygon(points)
    
    # Define a 10m grid origin aligned to 10 meters
    xmin = math.floor(box[0] / 10.0) * 10.0
    ymin = math.floor(box[1] / 10.0) * 10.0
    xmax = math.ceil(box[2] / 10.0) * 10.0
    ymax = math.ceil(box[3] / 10.0) * 10.0
    
    width = int((xmax - xmin) / 10.0)
    height = int((ymax - ymin) / 10.0)
    print(f"  Bounding box grid dimensions: {width}x{height} pixels.")

    # Transform origin and create affine transform mapping
    tiff_transform = rasterio.transform.from_origin(xmin, ymax, 10.0, 10.0)
    tiff_crs = "EPSG:32650" # Seraya is in UTM zone 50N

    # Rasterize polygon to create a mask of points inside the estate
    print("Rasterizing shapefile polygon to generate boundary mask...")
    mask = rasterize(
        [(poly, 1)],
        out_shape=(height, width),
        transform=tiff_transform,
        fill=0,
        all_touched=False,
        dtype=np.uint8
    )
    n_valid = np.sum(mask)
    print(f"  Sampling points inside boundary: {n_valid} pixels (out of {width*height} total box pixels).")

    # Project the bounding box to Lat/Lon for the STAC API query
    bbox = transform_bounds(tiff_crs, "EPSG:4326", xmin, ymin, xmax, ymax)
    print(f"  Geographic search BBOX: {bbox}")

    # Query STAC API for the latest Sentinel-2 L2A scene (cloud cover < 50%)
    print("\nQuerying STAC API for latest Sentinel-2 scene...")
    s2_payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": "2025-01-01/2026-07-08",
        "query": {"eo:cloud_cover": {"lt": 50.0}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1
    }
    s2_features = request_json(STAC_API_URL, s2_payload).get("features", [])
    if not s2_features:
        raise RuntimeError("No Sentinel-2 scenes found in search range.")
    s2_scene = s2_features[0]
    s2_id = s2_scene["id"]
    s2_date = s2_scene["properties"]["datetime"]
    s2_cloud_pct = s2_scene["properties"]["eo:cloud_cover"]
    print(f"  Selected Sentinel-2 scene: {s2_id}")
    print(f"  Acquisition date: {s2_date}")
    print(f"  Scene cloud cover: {s2_cloud_pct:.2f}%")

    # Query STAC API for the latest Sentinel-1 RTC scene
    print("\nQuerying STAC API for latest Sentinel-1 scene...")
    s1_payload = {
        "collections": ["sentinel-1-rtc"],
        "bbox": bbox,
        "datetime": "2025-01-01/2026-07-08",
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1
    }
    s1_features = request_json(STAC_API_URL, s1_payload).get("features", [])
    if not s1_features:
        raise RuntimeError("No Sentinel-1 scenes found in search range.")
    s1_scene = s1_features[0]
    s1_id = s1_scene["id"]
    s1_date = s1_scene["properties"]["datetime"]
    print(f"  Selected Sentinel-1 scene: {s1_id}")
    print(f"  Acquisition date: {s1_date}")

    # Fetch Planetary Computer SAS tokens
    print("\nFetching Planetary Computer access tokens...")
    s2_token = get_sas_token("sentinel-2-l2a")
    s1_token = get_sas_token("sentinel-1-rtc")

    # Fetch and warp Sentinel-2 bands directly onto the target grid shape
    s2_assets = s2_scene["assets"]
    bands_to_fetch = ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "SCL"]
    s2_data = {}

    print("\nFetching and warping Sentinel-2 bands to boundary grid...")
    for b in bands_to_fetch:
        print(f"  Processing Sentinel-2 {b} band...")
        b_url = sign_url(s2_assets[b]["href"], s2_token)
        band_warped = np.zeros((height, width), dtype=np.float32)
        resampling_method = Resampling.nearest if b == "SCL" else Resampling.bilinear
        with rasterio.open(b_url) as s2_src:
            reproject(
                source=rasterio.band(s2_src, 1),
                destination=band_warped,
                src_transform=s2_src.transform,
                src_crs=s2_src.crs,
                dst_transform=tiff_transform,
                dst_crs=tiff_crs,
                resampling=resampling_method
            )
        s2_data[b] = band_warped

    # Fetch and warp Sentinel-1 bands directly onto the target grid shape
    s1_assets = s1_scene["assets"]
    s1_data = {}

    print("\nFetching and warping Sentinel-1 bands to boundary grid...")
    for b in ["vv", "vh"]:
        print(f"  Processing Sentinel-1 {b} polarization...")
        b_url = sign_url(s1_assets[b]["href"], s1_token)
        band_warped = np.zeros((height, width), dtype=np.float32)
        with rasterio.open(b_url) as s1_src:
            reproject(
                source=rasterio.band(s1_src, 1),
                destination=band_warped,
                src_transform=s1_src.transform,
                src_crs=s1_src.crs,
                dst_transform=tiff_transform,
                dst_crs=tiff_crs,
                resampling=Resampling.bilinear
            )
        s1_data[b] = band_warped

    # Convert S2 bands to standard reflectance (0.0 to 1.0)
    for b in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]:
        s2_data[b] = s2_data[b] / 10000.0

    # Calculate NDVI for cloud masking
    ndvi = (s2_data["B08"] - s2_data["B04"]) / (s2_data["B08"] + s2_data["B04"] + 1e-8)

    # Cloud masking
    print("\nApplying pixel-level cloud detection inside boundary...")
    scl = s2_data["SCL"]
    scl_mask = np.isin(scl, [3, 8, 9, 10])
    spectral_mask = (s2_data["B02"] > 0.18) & (ndvi < 0.2)
    cloud_mask = scl_mask | spectral_mask
    
    n_cloudy = np.sum(cloud_mask & (mask == 1))
    print(f"  Detected {n_cloudy} cloudy pixels inside the shapefile boundary ({n_cloudy/n_valid*100:.1f}% cloud cover).")

    # Flatten arrays
    flat_vv = s1_data["vv"].flatten()
    flat_vh = s1_data["vh"].flatten()
    flat_cloud = cloud_mask.flatten()
    flat_valid = (mask == 1).flatten()
    
    flat_s2 = {b: s2_data[b].flatten() for b in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]}

    # S1 Features: [VV, VH, VV/VH ratio]
    flat_ratio = np.where(flat_vh > 0, flat_vv / flat_vh, 0.0)
    X_S1 = np.stack([flat_vv, flat_vh, flat_ratio], axis=1)

    # Get clear training pixels
    clear_train_indices = np.where(flat_valid & ~flat_cloud)[0]
    
    rf_models = {}
    if len(clear_train_indices) > 5:
        # Performance optimization: sample at most 6000 pixels for fast training
        n_samples = len(clear_train_indices)
        train_sample_size = min(6000, n_samples)
        
        print(f"\nTraining Random Forest Regressors on subset of {train_sample_size} clear pixels...")
        random.seed(42)
        train_indices = np.array(random.sample(list(clear_train_indices), train_sample_size))
        
        X_train = X_S1[train_indices].tolist()
        for band in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]:
            print(f"  Training model for {band}...")
            y_train = flat_s2[band][train_indices].tolist()
            rf = RandomForestRegressor(n_estimators=10, max_depth=4)
            rf.fit(X_train, y_train)
            rf_models[band] = rf
    else:
        print("\n[Warning] Too few clear pixels in this scene to train models. Using raw reflectances directly.")

    # Reconstruct data
    reconstructed_data = {b: np.copy(flat_s2[b]) for b in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]}
    
    actual_cloudy_indices = np.where(flat_valid & flat_cloud)[0]
    if len(actual_cloudy_indices) > 0 and rf_models:
        print(f"\nReconstructing {len(actual_cloudy_indices)} cloud-covered pixels using Sentinel-1 C-band SAR...")
        X_reconstruct = X_S1[actual_cloudy_indices].tolist()
        for band in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]:
            pred = rf_models[band].predict(X_reconstruct)
            reconstructed_data[band][actual_cloudy_indices] = pred

    # Output to CSV
    csv_filename = "seraya_reconstructed_composite.csv"
    print(f"\nWriting aligned dataset to {csv_filename}...")
    
    with open(csv_filename, "w", encoding="utf-8") as f:
        # Header
        f.write("latitude,longitude,B02,B03,B04,B05,B08,B11,B12,VV,VH\n")
        
        row_count = 0
        for i in range(width * height):
            if flat_valid[i]:
                r = i // width
                c = i % width
                
                # Get UTM coordinate of pixel center
                x, y = tiff_transform * (c + 0.5, r + 0.5)
                # Convert to Lat/Lon
                lons, lats = transform(tiff_crs, "EPSG:4326", [x], [y])
                lat = lats[0]
                lon = lons[0]
                
                f.write(f"{lat:.6f},{lon:.6f},"
                        f"{reconstructed_data['B02'][i]:.5f},{reconstructed_data['B03'][i]:.5f},"
                        f"{reconstructed_data['B04'][i]:.5f},{reconstructed_data['B05'][i]:.5f},"
                        f"{reconstructed_data['B08'][i]:.5f},{reconstructed_data['B11'][i]:.5f},"
                        f"{reconstructed_data['B12'][i]:.5f},"
                        f"{flat_vv[i]:.5f},{flat_vh[i]:.5f}\n")
                row_count += 1

    print(f"Successfully aligned and exported {row_count} valid pixels to CSV.")

if __name__ == "__main__":
    main()
