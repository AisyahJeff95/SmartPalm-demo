#!/usr/bin/env python3
"""
Sentinel-2 Land Cover Classifier Example
Demonstrates:
1. Querying STAC API (Planetary Computer) for Sentinel-2 assets.
2. Using rasterio to read band imagery windows directly from Cloud URLs.
3. Calculating NDVI, NDWI, NDBI.
4. Training a scikit-learn RandomForestClassifier.
5. Performing pixel-level classification and saving the output as a GeoTIFF.
"""

import os
import json
import numpy as np
import rasterio
from rasterio.windows import Window
import geopandas as gpd
from shapely.geometry import box
from sklearn.ensemble import RandomForestClassifier
from urllib.request import Request, urlopen

# Set up endpoints
STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"

def search_stac_for_s2(bbox, date_range="2024-01-01/2024-06-01", max_cloud=10.0):
    """
    Search Planetary Computer STAC for a cloud-free Sentinel-2 scene.
    """
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": date_range,
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1
    }
    
    req = Request(
        STAC_API_URL, 
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "s2-classifier/1.0"},
        method="POST"
    )
    
    with urlopen(req) as response:
        results = json.loads(response.read().decode("utf-8"))
        features = results.get("features", [])
        if not features:
            raise RuntimeError("No cloud-free Sentinel-2 scenes found in this bbox and date range.")
        return features[0]

def calculate_index(band_a, band_b):
    """
    Safely calculate normalized index (A - B) / (A + B)
    """
    denom = band_a + band_b
    # Avoid division by zero
    denom = np.where(denom == 0, 1e-6, denom)
    return (band_a - band_b) / denom

def process_and_classify():
    # Define a bounding box around Perak site (lon_min, lat_min, lon_max, lat_max)
    bbox = [100.760, 4.955, 100.780, 4.975]
    print(f"Searching for Sentinel-2 scene over BBOX: {bbox}...")
    
    scene = search_stac_for_s2(bbox)
    assets = scene["assets"]
    
    # Cloud-Optimized GeoTIFF URLs
    b2_url = assets["B02"]["href"]  # Blue (10m)
    b3_url = assets["B03"]["href"]  # Green (10m)
    b4_url = assets["B04"]["href"]  # Red (10m)
    b8_url = assets["B08"]["href"]  # NIR (10m)
    b11_url = assets["B11"]["href"] # SWIR (20m)
    
    print("Reading spectral bands remotely using rasterio (windowed read)...")
    
    # We will read a 512x512 window from the center of the scene to save bandwidth and memory
    with rasterio.open(b4_url) as src:
        # Determine height and width
        h, w = src.height, src.width
        window = Window(w // 2 - 256, h // 2 - 256, 512, 512)
        transform = rasterio.windows.transform(window, src.transform)
        profile = src.profile.copy()
        
        red = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(b2_url) as src:
        blue = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(b3_url) as src:
        green = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(b8_url) as src:
        nir = src.read(1, window=window).astype(np.float32)
        
    with rasterio.open(b11_url) as src:
        # B11 is 20m resolution; we read it and resample/resize it to fit the 10m window (512x512)
        swir = src.read(1, window=window, out_shape=(512, 512), resampling=rasterio.enums.Resampling.bilinear).astype(np.float32)

    print("Computing vegetation and moisture indices...")
    # Calculate NDVI: (NIR - Red) / (NIR + Red)
    ndvi = calculate_index(nir, red)
    
    # Calculate NDWI: (Green - NIR) / (Green + NIR)
    ndwi = calculate_index(green, nir)
    
    # Calculate NDBI: (SWIR - NIR) / (SWIR + NIR)
    ndbi = calculate_index(swir, nir)
    
    # Flatten bands and indices to build the feature matrix (n_pixels, n_features)
    n_pixels = 512 * 512
    X = np.stack([
        blue.flatten(),
        green.flatten(),
        red.flatten(),
        nir.flatten(),
        swir.flatten(),
        ndvi.flatten(),
        ndwi.flatten(),
        ndbi.flatten()
    ], axis=1)
    
    # Replace NaN or Inf values if any
    X = np.nan_to_num(X)
    
    print(f"Feature matrix shape: {X.shape} (pixels, features)")
    
    # Create synthetic training labels for demonstration:
    # 0 = Vegetation (high NDVI)
    # 1 = Water (high NDWI)
    # 2 = Urban/Bare (high NDBI)
    print("Generating training dataset for Random Forest...")
    y_train = np.zeros(n_pixels)
    
    # Simple rule-based labeling for training bootstrap
    vegetation_mask = ndvi.flatten() > 0.4
    water_mask = ndwi.flatten() > 0.1
    urban_mask = ndbi.flatten() > 0.05
    
    y_train[vegetation_mask] = 0
    y_train[water_mask] = 1
    y_train[urban_mask] = 2
    
    # Sample a subset of points for training (e.g., 5000 pixels) to build the model quickly
    sample_indices = np.random.choice(n_pixels, size=5000, replace=False)
    X_train = X[sample_indices]
    y_train_sampled = y_train[sample_indices]
    
    print("Training RandomForestClassifier...")
    clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    clf.fit(X_train, y_train_sampled)
    
    print("Running pixel classification across the full window...")
    y_pred = clf.predict(X)
    classification_map = y_pred.reshape((512, 512)).astype(np.uint8)
    
    # Save the classification output to a GeoTIFF file
    output_filename = "landcover_classification.tif"
    profile.update(
        dtype=rasterio.uint8,
        count=1,
        height=512,
        width=512,
        transform=transform,
        compress="lzw"
    )
    
    with rasterio.open(output_filename, "w", **profile) as dst:
        dst.write(classification_map, 1)
        
    print(f"Successfully saved classification raster to: {os.path.abspath(output_filename)}")

if __name__ == "__main__":
    process_and_classify()
