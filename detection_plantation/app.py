#!/usr/bin/env python3
"""
PalmNex Sentinel-2 Global Land Cover Classifier Server
Runs a local Flask app that takes a WGS84 Bounding Box, fetches Sentinel-2 imagery dynamically
via Cloud-Optimized GeoTIFFs, calculates NDVI, NDWI, NDBI, and serves a classified overlay.
"""

import os
import io
import json
import queue
import urllib.request
import urllib.parse
from urllib.error import HTTPError
import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from PIL import Image
from flask import Flask, Response, request, render_template, jsonify, send_file

# Set up optimized GDAL settings for cloud-optimized reading
os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "YES"
os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".tif,.tiff"

app = Flask(__name__, template_folder=os.path.join(os.path.dirname(__file__), 'templates'))

@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SIGN_API_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"

# Global logging queue for Server-Sent Events
log_queue = queue.Queue()

def log_info(msg):
    print(msg)
    log_queue.put(msg)

def request_json(url: str, payload: dict = None, method: str = "GET") -> dict:
    headers = {"User-Agent": "palmnex-classifier/1.0", "Content-Type": "application/json"}
    
    if payload:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    else:
        req = urllib.request.Request(url, headers=headers, method=method)
        
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}\n{detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"Could not reach {url}: {exc}") from exc

_sas_token_cache = {}

def get_sas_token(collection: str = "sentinel-2-l2a") -> str:
    import time
    now = time.time()
    if collection in _sas_token_cache:
        token, expiry = _sas_token_cache[collection]
        if now < expiry:
            return token
            
    token_url = f"https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}"
    try:
        res = request_json(token_url)
        token = res.get("token", "")
        # Expire cache in 45 minutes (tokens usually last 60 minutes)
        expiry = now + 2700
        _sas_token_cache[collection] = (token, expiry)
        return token
    except Exception as e:
        log_info(f"[Error] Failed to fetch SAS token: {e}")
        return ""

def sign_url(url: str) -> str:
    """
    Append SAS token to the Sentinel-2 asset URL.
    """
    token = get_sas_token()
    if token:
        return f"{url}&{token}" if "?" in url else f"{url}?{token}"
    return url

def search_stac(bbox: list) -> dict:
    """
    Find the latest cloud-free Sentinel-2 scene covering the bbox.
    """
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": "2024-01-01/2026-06-15",
        "query": {"eo:cloud_cover": {"lt": 20.0}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1
    }
    log_info("Querying Planetary Computer STAC for Sentinel-2 scenes...")
    res = request_json(STAC_API_URL, payload)
    features = res.get("features", [])
    if not features:
        raise RuntimeError("No cloud-free Sentinel-2 scene found for this bounding box.")
    return features[0]

def create_empty_png():
    img = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    output = io.BytesIO()
    img.save(output, format="PNG")
    output.seek(0)
    return output

@app.route('/')
def index():
    # Render main dashboard template
    # Flask search for index.html in the templates directory
    import flask
    return flask.render_template('index.html')

@app.route('/api/boundaries')
def get_boundaries():
    boundaries = {}
    
    # Try to load Seraya perimeter
    seraya_path = os.path.join(os.path.dirname(__file__), '..', 'seraya_perimeter.geojson')
    if os.path.exists(seraya_path):
        try:
            with open(seraya_path, 'r', encoding='utf-8') as f:
                boundaries['seraya'] = json.load(f)
        except Exception as e:
            print(f"Error loading Seraya: {e}")
            
    # Try to load Perak perimeter
    perak_path = os.path.join(os.path.dirname(__file__), '..', 'perak_perimeter.geojson')
    if os.path.exists(perak_path):
        try:
            with open(perak_path, 'r', encoding='utf-8') as f:
                boundaries['perak'] = json.load(f)
        except Exception as e:
            print(f"Error loading Perak: {e}")
            
    return jsonify(boundaries)

@app.route('/api/logs')
def stream_logs():
    def event_stream():
        # Clear existing logs
        while not log_queue.empty():
            try:
                log_queue.get_nowait()
            except queue.Empty:
                break
        while True:
            msg = log_queue.get()
            yield f"data: {msg}\n\n"
    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/api/classify')
def classify():
    bbox_str = request.args.get('bbox')
    if not bbox_str:
        return jsonify({"error": "Missing bbox parameter"}), 400
        
    try:
        lon_min, lat_min, lon_max, lat_max = map(float, bbox_str.split(','))
        bbox = [lon_min, lat_min, lon_max, lat_max]
        
        # 1. Search STAC
        scene = search_stac(bbox)
        scene_id = scene["id"]
        scene_date = scene["properties"]["datetime"][:10]
        log_info(f"Found Scene ID: {scene_id} ({scene_date})")
        
        assets = scene["assets"]
        b03_url = sign_url(assets["B03"]["href"]) # Green
        b04_url = sign_url(assets["B04"]["href"]) # Red
        b08_url = sign_url(assets["B08"]["href"]) # NIR
        b11_url = sign_url(assets["B11"]["href"]) # SWIR1 (20m)

        log_info("Reading Sentinel-2 band subsets remotely...")
        
        def read_band(band_url, name):
            log_info(f"Reading {name} band...")
            with rasterio.open(band_url) as src:
                minx, miny, maxx, maxy = transform_bounds("EPSG:4326", src.crs, lon_min, lat_min, lon_max, lat_max)
                window = from_bounds(minx, miny, maxx, maxy, src.transform)
                window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                if window.width <= 0 or window.height <= 0:
                    return None
                return src.read(1, window=window, out_shape=(512, 512), resampling=rasterio.enums.Resampling.bilinear).astype(np.float32)

        nir = read_band(b08_url, "NIR")
        if nir is None:
            log_info("[Warning] Bounding box window is out of range for this image.")
            return send_file(create_empty_png(), mimetype='image/png')
            
        red = read_band(b04_url, "Red")
        green = read_band(b03_url, "Green")
        swir = read_band(b11_url, "SWIR")

        if red is None or green is None or swir is None:
            log_info("[Warning] Failed to load one of the bands.")
            return send_file(create_empty_png(), mimetype='image/png')

        log_info("Computing spectral indices (NDVI, NDWI, NDBI)...")
        # Compute indices with safe denominators
        ndvi = (nir - red) / np.maximum(nir + red, 1e-6)
        ndwi = (green - nir) / np.maximum(green + nir, 1e-6)
        ndbi = (swir - nir) / np.maximum(swir + nir, 1e-6)

        log_info("Applying rule-based classification thresholds...")
        # Classification arrays
        overlay = np.zeros((512, 512, 4), dtype=np.uint8)
        
        # Rule-based conditions:
        # Water: NDWI > 0.05
        # Vegetation: NDVI > 0.35 (and not water)
        # Urban: NDBI > 0.0 (and not water and not vegetation)
        water_mask = ndwi > 0.05
        veg_mask = (ndvi > 0.35) & (~water_mask)
        urban_mask = (ndbi > 0.0) & (~water_mask) & (~veg_mask)

        # Style colors
        # Green = Vegetation -> [34, 139, 34, 180]
        # Blue = Water -> [0, 100, 255, 180]
        # Grey = Urban -> [120, 120, 120, 180]
        overlay[veg_mask] = [34, 139, 34, 180]
        overlay[water_mask] = [0, 100, 255, 180]
        overlay[urban_mask] = [120, 120, 120, 180]

        if request.args.get('format') == 'json':
            grid_512 = np.full((512, 512), 5, dtype=np.uint8) # 5 = Bare Soil / Other
            grid_512[veg_mask] = 0   # 0 = Plantation
            grid_512[water_mask] = 2  # 2 = Water
            grid_512[urban_mask] = 4  # 4 = Building
            grid_128 = grid_512[::4, ::4]
            
            log_info("Sending JSON classification grid to client.")
            return jsonify({
                "bbox": bbox,
                "grid": grid_128.tolist()
            })

        log_info("Generating PNG output overlay...")
        img = Image.fromarray(overlay, mode="RGBA")
        img_io = io.BytesIO()
        img.save(img_io, format='PNG')
        img_io.seek(0)
        
        log_info("Sending overlay to client map.")
        return Response(img_io.read(), mimetype='image/png')

    except Exception as e:
        log_info(f"Error during classification: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    log_info("Starting SmartPalm Earth local server...")
    app.run(host="0.0.0.0", port=5001, debug=True)
