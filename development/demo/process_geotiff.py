#!/usr/bin/env python3
"""
Sentinel-1/2 Alignment & Cloud Reconstruction for Lahad Datu Nutrient Maps.
Reads local N, P, K, Mg GeoTIFFs, queries STAC API for the latest Sentinel-1 and Sentinel-2 scenes,
warps the satellite bands to match the UTM grid of the GeoTIFFs, runs Random Forest reconstruction
for any cloudy pixels, and exports the final matched dataset to CSV.
"""

import os
import json
import math
import random
import urllib.request
import urllib.parse
from urllib.error import HTTPError
import numpy as np
import rasterio
from rasterio.warp import transform, transform_bounds, reproject, Resampling

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
    headers = {"Content-Type": "application/json", "User-Agent": "lahad-datu-reconstructor/1.0"}
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

def main():
    print("====================================================")
    print("  Sentinel-1/2 Alignment & Cloud Reconstruction")
    print("  Target: Lahad Datu Site, Sabah, Malaysia")
    print("====================================================\n")

    # Set up GDAL configuration for fast Cloud-Optimized GeoTIFF reads
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "YES"
    os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif,.tiff"

    # Define paths for local GeoTIFFs
    tiff_paths = {
        "N": "Merge_Citra_Unsur_N.tif",
        "P": "Merge_Citra_Unsur_P.tif",
        "K": "Merge_Citra_Unsur_K.tif",
        "Mg": "Merge_Citra_Unsur_Mg.tif"
    }

    # Verify that local GeoTIFFs exist
    for k, p in tiff_paths.items():
        if not os.path.exists(p):
            raise FileNotFoundError(f"Missing required GeoTIFF file: {p}")

    # Read reference GeoTIFF properties
    print("Reading reference GeoTIFF (Nitrogen map)...")
    with rasterio.open(tiff_paths["N"]) as src_ref:
        tiff_crs = src_ref.crs
        tiff_transform = src_ref.transform
        tiff_width = src_ref.width
        tiff_height = src_ref.height
        tiff_bounds = src_ref.bounds
        n_data = src_ref.read(1)

    print(f"  Raster Grid dimensions: {tiff_width}x{tiff_height} pixels.")
    print(f"  CRS: {tiff_crs}")
    print(f"  Bounds: {tiff_bounds}")

    # Read other nutrient maps
    with rasterio.open(tiff_paths["P"]) as src:
        p_data = src.read(1)
    with rasterio.open(tiff_paths["K"]) as src:
        k_data = src.read(1)
    with rasterio.open(tiff_paths["Mg"]) as src:
        mg_data = src.read(1)

    # Convert bounds of reference GeoTIFF to EPSG:4326 WGS84 for STAC query
    bbox = transform_bounds(tiff_crs, "EPSG:4326", tiff_bounds.left, tiff_bounds.bottom, tiff_bounds.right, tiff_bounds.top)
    print(f"  Geographic BBOX (Lat/Lon): {bbox}")

    target_date = "2023-02-22"
    from datetime import datetime
    target_dt = datetime.strptime(target_date, "%Y-%m-%d")

    # Query STAC API for Sentinel-2 L2A scenes near target date
    print(f"\nQuerying STAC API for Sentinel-2 scenes near {target_date}...")
    s2_payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": "2023-02-10/2023-03-05",
        "limit": 10
    }
    s2_features = request_json(STAC_API_URL, s2_payload).get("features", [])
    if not s2_features:
        raise RuntimeError("No Sentinel-2 scenes found in search range.")
    
    # Sort S2 scenes by absolute difference to target date
    def get_s2_time_diff(feat):
        dt_str = feat["properties"]["datetime"][:19]
        dt = datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S")
        return abs((dt - target_dt).total_seconds())
    
    s2_features.sort(key=get_s2_time_diff)
    s2_scene = s2_features[0]
    s2_id = s2_scene["id"]
    s2_date = s2_scene["properties"]["datetime"]
    s2_cloud_pct = s2_scene["properties"]["eo:cloud_cover"]
    print(f"  Selected Sentinel-2 scene: {s2_id}")
    print(f"  Acquisition date: {s2_date}")
    print(f"  Scene cloud cover: {s2_cloud_pct:.2f}%")

    # Query STAC API for Sentinel-1 RTC scenes near target date
    print(f"\nQuerying STAC API for Sentinel-1 scenes near {target_date}...")
    s1_payload = {
        "collections": ["sentinel-1-rtc"],
        "bbox": bbox,
        "datetime": "2023-02-10/2023-03-05",
        "limit": 10
    }
    s1_features = request_json(STAC_API_URL, s1_payload).get("features", [])
    if not s1_features:
        raise RuntimeError("No Sentinel-1 scenes found in search range.")
    
    # Sort S1 scenes by absolute difference to target date
    def get_s1_time_diff(feat):
        dt_str = feat["properties"]["datetime"][:19]
        dt = datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S")
        return abs((dt - target_dt).total_seconds())

    s1_features.sort(key=get_s1_time_diff)
    s1_scene = s1_features[0]
    s1_id = s1_scene["id"]
    s1_date = s1_scene["properties"]["datetime"]
    print(f"  Selected Sentinel-1 scene: {s1_id}")
    print(f"  Acquisition date: {s1_date}")

    # Fetch Planetary Computer SAS tokens
    print("\nFetching Planetary Computer access tokens...")
    s2_token = get_sas_token("sentinel-2-l2a")
    s1_token = get_sas_token("sentinel-1-rtc")

    # Load and warp Sentinel-2 bands directly onto the GeoTIFF grid
    s2_assets = s2_scene["assets"]
    bands_to_fetch = ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "SCL"]
    s2_data = {}

    print("\nFetching and reprojecting/warping Sentinel-2 bands to target grid...")
    for b in bands_to_fetch:
        print(f"  Processing Sentinel-2 {b} band...")
        b_url = sign_url(s2_assets[b]["href"], s2_token)
        band_warped = np.zeros((tiff_height, tiff_width), dtype=np.float32)
        
        # Use nearest neighbor for categorical Scene Classification, bilinear for reflectances
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

    # Load and warp Sentinel-1 bands directly onto the GeoTIFF grid
    s1_assets = s1_scene["assets"]
    s1_data = {}

    print("\nFetching and reprojecting/warping Sentinel-1 bands to target grid...")
    for b in ["vv", "vh"]:
        print(f"  Processing Sentinel-1 {b} polarization...")
        b_url = sign_url(s1_assets[b]["href"], s1_token)
        band_warped = np.zeros((tiff_height, tiff_width), dtype=np.float32)
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

    # Calculate NDVI for cloud classification
    ndvi = (s2_data["B08"] - s2_data["B04"]) / (s2_data["B08"] + s2_data["B04"] + 1e-8)

    # Apply pixel-level cloud detection on the warped Sentinel grid
    print("\nApplying pixel-level cloud detection...")
    scl = s2_data["SCL"]
    scl_mask = np.isin(scl, [3, 8, 9, 10])
    spectral_mask = (s2_data["B02"] > 0.18) & (ndvi < 0.2)
    cloud_mask = scl_mask | spectral_mask
    
    # We only care about pixels that are inside our valid GeoTIFF area (nutrient != -9999.0)
    valid_mask = (n_data != -9999.0) & (~np.isnan(n_data))
    
    n_valid = np.sum(valid_mask)
    n_cloudy_valid = np.sum(cloud_mask & valid_mask)
    
    print(f"  Total valid estate pixels: {n_valid}")
    print(f"  Detected {n_cloudy_valid} cloudy pixels inside the estate boundary ({n_cloudy_valid/n_valid*100:.1f}% cloud cover).")

    # Flatten inputs for Random Forest mapping
    flat_vv = s1_data["vv"].flatten()
    flat_vh = s1_data["vh"].flatten()
    flat_cloud = cloud_mask.flatten()
    flat_valid = valid_mask.flatten()
    
    flat_s2 = {b: s2_data[b].flatten() for b in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]}

    # S1 Features: [VV, VH, VV/VH ratio]
    flat_ratio = np.where(flat_vh > 0, flat_vv / flat_vh, 0.0)
    X_S1 = np.stack([flat_vv, flat_vh, flat_ratio], axis=1)

    # Identify clear training indices (must be valid farm pixels AND cloud-free)
    clear_train_indices = np.where(flat_valid & ~flat_cloud)[0]
    
    # Train Random Forest Regressors
    rf_models = {}
    if len(clear_train_indices) > 5:
        print("\nTraining Random Forest Regressors on clear pixels to map radar features to optical reflectances...")
        X_train = X_S1[clear_train_indices].tolist()
        
        # If there's low cloud cover, let's create a validation subset for accuracy verification
        use_simulated_validation = False
        validation_indices = []
        if n_cloudy_valid < 0.10 * n_valid:
            print("  Low natural cloud cover inside estate. Artificially masking a 15% validation subset for accuracy checks...")
            use_simulated_validation = True
            random.seed(42)
            n_val = max(5, int(0.15 * len(clear_train_indices)))
            validation_indices = np.array(random.sample(list(clear_train_indices), n_val))
            # Adjust training set to exclude validation set
            train_indices = np.array([idx for idx in clear_train_indices if idx not in validation_indices])
            X_train = X_S1[train_indices].tolist()
        else:
            train_indices = clear_train_indices
            
        for band in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]:
            print(f"  Training model for {band}...")
            y_train = flat_s2[band][train_indices].tolist()
            rf = RandomForestRegressor(n_estimators=12, max_depth=4)
            rf.fit(X_train, y_train)
            rf_models[band] = rf
    else:
        print("\n[Warning] Too few clear pixels in this scene to train models. Using raw reflectances directly without reconstruction.")

    # Apply reconstruction/predictions
    reconstructed_data = {b: np.copy(flat_s2[b]) for b in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]}
    reconstructed_flag = np.zeros(tiff_width * tiff_height, dtype=int)

    # 1. Reconstruct actual cloudy pixels
    actual_cloudy_indices = np.where(flat_valid & flat_cloud)[0]
    if len(actual_cloudy_indices) > 0 and rf_models:
        print(f"\nReconstructing {len(actual_cloudy_indices)} cloud-covered pixels using Sentinel-1 C-band SAR...")
        X_reconstruct = X_S1[actual_cloudy_indices].tolist()
        for band in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]:
            pred = rf_models[band].predict(X_reconstruct)
            reconstructed_data[band][actual_cloudy_indices] = pred
        reconstructed_flag[actual_cloudy_indices] = 1

    # 2. Reconstruct validation pixels if any
    if use_simulated_validation and len(validation_indices) > 0 and rf_models:
        print("\nEvaluating model reconstruction accuracy on validation subset...")
        X_val = X_S1[validation_indices].tolist()
        for band in ["B02", "B03", "B04", "B05", "B08", "B11", "B12"]:
            pred = rf_models[band].predict(X_val)
            actual = flat_s2[band][validation_indices]
            
            # Print stats
            rmse = np.sqrt(np.mean((actual - pred)**2))
            denom = np.where(actual == 0, 1e-4, actual)
            mape = np.mean(np.abs((actual - pred) / denom)) * 100
            print(f"    {band:3s} | RMSE: {rmse:.5f} | MAPE: {mape:.2f}%")
            
            reconstructed_data[band][validation_indices] = pred
            reconstructed_flag[validation_indices] = 1

    # Generate CSV Output
    csv_filename = "lahad_datu_20230222.csv"
    print(f"\nWriting aligned dataset to {csv_filename}...")

    # Flatten nutrient arrays
    flat_n = n_data.flatten()
    flat_p = p_data.flatten()
    flat_k = k_data.flatten()
    flat_mg = mg_data.flatten()

    # Reconstruct 2D index mapping to get coordinates
    with open(csv_filename, "w", encoding="utf-8") as f:
        # Header
        f.write("latitude,longitude,B02,B03,B04,B05,B08,B11,B12,VV,VH,N,P,K,Mg\n")
        
        row_count = 0
        for i in range(tiff_width * tiff_height):
            if flat_valid[i]:
                r = i // tiff_width
                c = i % tiff_width
                
                # Get UTM coordinate
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
                        f"{flat_vv[i]:.5f},{flat_vh[i]:.5f},"
                        f"{flat_n[i]:.5f},{flat_p[i]:.5f},{flat_k[i]:.5f},{flat_mg[i]:.5f}\n")
                row_count += 1

    print(f"Successfully aligned and exported {row_count} valid pixels to CSV.")

if __name__ == "__main__":
    main()
