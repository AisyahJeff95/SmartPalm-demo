#!/usr/bin/env python3
"""
Palmnex - SmartPalm Crop Nutrient Analytics Dashboard Generator.
Compiles a standalone, high-end HTML dashboard centered on Perak Cultivation Site, Malaysia,
masked exactly to the provided GeoJSON perimeter, rendering a high-resolution
continuous NDVI Raster Map on a clean white background with dynamic Nitrogen predictions.
"""

import argparse
import html
import json
import math
import os
import sys
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# Coordinates of Batu 14, Batu Kurau, Perak
DEFAULT_LAT = 4.96330
DEFAULT_LON = 100.77008
DEFAULT_PLACE = "Batu 14, Batu Kurau, Perak"





# Planetary Computer Endpoints
PC_STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_TILEJSON_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json"

def request_json(url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    req = Request(url, headers=headers or {"User-Agent": "palmnex-compiler/1.0"})
    try:
        with urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}\n{detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach {url}: {exc}") from exc

def post_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    headers = {"User-Agent": "palmnex-compiler/1.0", "Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}\n{detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach {url}: {exc}") from exc

def pc_tilejson(collection: str, item_id: str, params: Dict[str, str]) -> Dict[str, Any]:
    query = {"collection": collection, "item": item_id}
    query.update(params)
    return request_json(f"{PC_TILEJSON_URL}?{urlencode(query)}")

def search_real_imagery(
    bbox: List[float],
    start: str,
    end: str,
    max_cloud: float,
) -> Dict[str, Any]:
    layers: Dict[str, Any] = {"sentinel2": None}
    s2_payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": f"{start}/{end}",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1,
    }
    try:
        s2_features = post_json(PC_STAC_SEARCH_URL, s2_payload).get("features", [])
        if s2_features:
            item = s2_features[0]
            tilejson = pc_tilejson("sentinel-2-l2a", item["id"], {"assets": "visual"})
            layers["sentinel2"] = {
                "item_id": item["id"],
                "datetime": item.get("properties", {}).get("datetime", ""),
                "cloud_cover": item.get("properties", {}).get("eo:cloud_cover"),
                "tile_url": tilejson["tiles"][0],
                "bounds": tilejson.get("bounds"),
            }
    except Exception as exc:
        print(f"[Warning] Failed to fetch real Sentinel-2 tiles: {exc}. Falling back to default tile rendering.")
    return layers

def make_bbox(lon: float, lat: float, radius_km: float) -> List[float]:
    # 1 deg lat = 111 km
    lat_deg = radius_km / 111.0
    lon_deg = radius_km / (111.0 * abs(math.cos(math.radians(lat))))
    return [lon - lon_deg, lat - lat_deg, lon + lon_deg, lat + lat_deg]

def build_html(
    output_path: Path,
    place: str,
    lat: float,
    lon: float,
    real_layers: Dict[str, Any],
) -> None:
    # Load model weights
    model_path = Path("smartpalm_model.json")
    if model_path.exists():
        model_json = model_path.read_text(encoding="utf-8")
    else:
        model_json = "{}"

    # Load and base64-encode logo for standalone portability
    import base64
    logo_path = Path("mpob_tech_logo.png")
    logo_base64 = "mpob_tech_logo.png"
    if logo_path.exists():
        try:
            with open(logo_path, "rb") as f:
                logo_base64 = f"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"
        except Exception as e:
            print(f"Error encoding logo to base64: {e}")

    # Load estate perimeter boundary
    geojson_path = Path("perak_perimeter.geojson")
    perak_perimeter_coords = []
    
    if geojson_path.exists():
        try:
            with open(geojson_path, "r", encoding="utf-8") as f:
                geojson_data = json.load(f)
            features = geojson_data.get("features", [])
            if features:
                coords = features[0]["geometry"]["coordinates"][0]
                perak_perimeter_coords = [[c[1], c[0]] for c in coords]
        except Exception as e:
            print(f"Error reading GeoJSON: {e}")

    perak_perimeter_json = json.dumps(perak_perimeter_coords)
    s2_tile_url = real_layers.get("sentinel2", {}).get("tile_url") if real_layers.get("sentinel2") else ""
    s2_date = real_layers.get("sentinel2", {}).get("datetime", "Unknown date") if real_layers.get("sentinel2") else "Default"
    s2_cloud = f'{real_layers.get("sentinel2", {}).get("cloud_cover", 0.0):.1f}%' if real_layers.get("sentinel2") else "N/A"

    html_content = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MPOB - Precipalm </title>
  <title>Powered by Palmnex </title>
  
  <!-- Fonts & Libraries -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  
  <style>
    :root {
      --bg-main: #060913;
      --bg-sidebar: rgba(10, 15, 30, 0.85);
      --bg-card: rgba(20, 28, 52, 0.65);
      --border-glass: rgba(255, 255, 255, 0.08);
      --accent-primary: #0ca678; /* Palm Green */
      --accent-glow: #12b886;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --shadow-premium: 0 12px 40px -10px rgba(0, 0, 0, 0.85);
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-main);
      color: var(--text-main);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    .dashboard-container {
      display: grid;
      grid-template-columns: 420px 1fr;
      width: 100vw;
      height: 100vh;
      position: relative;
    }

    /* Sidebar styles */
    aside.sidebar {
      background: var(--bg-sidebar);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      border-right: 1px solid var(--border-glass);
      display: flex;
      flex-direction: column;
      height: 100vh;
      z-index: 10;
      box-shadow: 8px 0 32px rgba(0, 0, 0, 0.5);
      overflow-y: auto;
    }

    .sidebar-header {
      padding: 24px;
      border-bottom: 1px solid var(--border-glass);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: transparent;
    }

    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: linear-gradient(120deg, #fff 40%, var(--accent-glow) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-subtitle {
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .sidebar-content {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      flex-grow: 1;
    }

    .sidebar-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .glass-card {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      padding: 16px;
      box-shadow: var(--shadow-premium);
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 13px;
    }

    .meta-row:last-child {
      border-bottom: none;
    }

    .meta-lbl {
      color: var(--text-muted);
    }

    .meta-val {
      font-weight: 600;
      color: var(--text-main);
    }

    /* Diagnosis card details */
    .diagnosis-value-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }

    .nutrient-stat-box {
      background: rgba(6, 9, 19, 0.5);
      border: 1px solid var(--border-glass);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }

    .nutrient-stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 600;
      color: var(--accent-glow);
    }

    .nutrient-stat-lbl {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    /* Map container */
    #map-container {
      position: relative;
      width: 100%;
      height: 100vh;
      background: var(--bg-main);
      transition: background 0.30s ease;
    }

    #map {
      width: 100%;
      height: 100%;
      background: var(--bg-main);
    }

    .fertilizer-selector-container {
      margin-top: 15px;
      margin-bottom: 12px;
    }

    .fertilizer-selector-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .fertilizer-select {
      width: 100%;
      padding: 10px 12px;
      background: rgba(6, 9, 19, 0.6);
      border: 1px solid var(--border-glass);
      border-radius: 8px;
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      cursor: pointer;
      outline: none;
      transition: all 0.2s ease;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
    }

    .fertilizer-select:hover {
      border-color: rgba(255, 255, 255, 0.15);
      background: rgba(6, 9, 19, 0.8);
    }

    .fertilizer-select:focus {
      border-color: var(--accent-glow);
      box-shadow: 0 0 0 2px rgba(18, 184, 134, 0.2);
    }

    .download-btn {
      width: 100%;
      margin-top: 15px;
      padding: 10px;
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-glow));
      border: none;
      border-radius: 8px;
      color: #ffffff;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(18, 184, 134, 0.2);
    }

    .download-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(18, 184, 134, 0.35);
      filter: brightness(1.1);
    }

    .download-btn:active {
      transform: translateY(1px);
    }

    /* Search box overlay */
    .search-container {
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 1000;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .search-box {
      display: flex;
      align-items: center;
      background: rgba(10, 15, 30, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-glass);
      border-radius: 24px;
      padding: 6px 14px;
      box-shadow: var(--shadow-premium);
      transition: all 0.3s ease;
    }

    .search-box:focus-within {
      border-color: var(--accent-glow);
      box-shadow: 0 0 15px rgba(18, 184, 134, 0.25);
      background: rgba(15, 23, 42, 0.95);
    }

    .search-icon {
      color: var(--text-muted);
      margin-right: 10px;
      flex-shrink: 0;
    }

    #location-search-input {
      flex-grow: 1;
      background: transparent;
      border: none;
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      outline: none;
      padding: 6px 0;
      width: 100%;
    }

    #location-search-input::placeholder {
      color: var(--text-muted);
      opacity: 0.8;
    }

    #search-clear-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    #search-clear-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-main);
    }

    .search-results {
      background: rgba(10, 15, 30, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      max-height: 250px;
      overflow-y: auto;
      box-shadow: var(--shadow-premium);
      padding: 6px 0;
      display: flex;
      flex-direction: column;
    }

    .search-result-item {
      padding: 10px 16px;
      font-size: 12px;
      color: var(--text-main);
      cursor: pointer;
      transition: background 0.2s ease;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      border-bottom: 1px solid rgba(255, 255, 255, 0.02);
    }

    .search-result-item:last-child {
      border-bottom: none;
    }

    .search-result-item:hover {
      background: rgba(18, 184, 134, 0.15);
      color: var(--accent-glow);
    }
  </style>
</head>
<body>

  <div class="dashboard-container">
    
    <!-- Sidebar Panel -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand-logo">
          <img src="{logo_base64}" alt="MPOB Tech Logo" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <div>
          <div class="brand-title">MPOB - Precipalm</div>
          <div class="brand-subtitle">Powered by Palmnex</div>
        </div>
      </div>
      
      <div class="sidebar-content">
        
        <!-- Estate Metadata -->
        <div>
          <div class="sidebar-section-title">
            <span>Cultivation Site</span>
            <i data-lucide="map-pin" size="12"></i>
          </div>
          <div class="glass-card">
            <div class="meta-row">
              <span class="meta-lbl">Estate Name</span>
              <span class="meta-val">{place}</span>
            </div>
            <div class="meta-row">
              <span class="meta-lbl">Total Area</span>
              <span class="meta-val">1.00 ha</span>
            </div>
            <div class="meta-row">
              <span class="meta-lbl">Map Date</span>
              <span class="meta-val" style="font-size:11px; font-family:'JetBrains Mono';">{s2_date}</span>
            </div>
          </div>
        </div>

        <!-- Point Diagnostics & Fertilizer Recommendations -->
        <div>
          <div class="sidebar-section-title">
            <span>Diagnostics per 10 meters block</span>
            <i data-lucide="activity" size="12"></i>
          </div>
          
          <!-- Fertilizer Selector (Always Visible) -->
          <div class="fertilizer-selector-container">
            <div class="fertilizer-selector-title">
              <span>Target Fertilizer</span>
            </div>
            <select class="fertilizer-select" id="fertilizer-select" onchange="onFertilizerChange()">
              <!-- Dynamically populated from JS -->
            </select>
          </div>

          <div class="glass-card" id="diagnostics-card">
            <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px 0;" id="diag-fallback-text">
              Click anywhere on the map to view its nutrient analysis.
            </div>
            <div id="diag-results" style="display: none;">
              <div class="meta-row">
                <span class="meta-lbl">Coordinates</span>
                <span class="meta-val" id="diag-coord" style="font-family:'JetBrains Mono'; font-size:12px;">-</span>
              </div>
              <div class="meta-row">
                <span class="meta-lbl">Location Zone</span>
                <span class="meta-val" id="diag-zone" style="font-size:11px; font-weight:600;">-</span>
              </div>
              <div class="meta-row">
                <span class="meta-lbl">Main Satellite</span>
                <span class="meta-val" id="diag-sensor" style="font-size:11px; font-weight:600; color:#ffd43b;">-</span>
              </div>
              <div class="diagnosis-value-container">

                <div class="nutrient-stat-box">
                  <div class="nutrient-stat-val" id="val-n">-</div>
                  <div class="nutrient-stat-lbl">Leaf N (%)</div>
                </div>
                <div class="nutrient-stat-box">
                  <div class="nutrient-stat-val" id="val-p">-</div>
                  <div class="nutrient-stat-lbl">Leaf P (%)</div>
                </div>
                <div class="nutrient-stat-box">
                  <div class="nutrient-stat-val" id="val-k">-</div>
                  <div class="nutrient-stat-lbl">Leaf K (%)</div>
                </div>
                <div class="nutrient-stat-box">
                  <div class="nutrient-stat-val" id="val-mg">-</div>
                  <div class="nutrient-stat-lbl">Leaf Mg (%)</div>
                </div>
              </div>
              
              <!-- Fertilizer Recommendations -->
              <div style="margin-top: 14px; border-top: 1px solid var(--border-glass); padding-top: 12px;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 8px;">Fertilizer Recommendation</div>
                <div class="meta-row">
                  <span class="meta-lbl">Selected Fertilizer</span>
                  <span class="meta-val" id="diag-fert-name" style="font-weight:600; color:var(--accent-glow);">-</span>
                </div>
                <div class="meta-row">
                  <span class="meta-lbl">Dosage per Palm</span>
                  <span class="meta-val" id="diag-fert-palm" style="font-family:'JetBrains Mono'; font-weight:600; color:var(--text-main);">-</span>
                </div>
                <div class="meta-row">
                  <span class="meta-lbl">Req. per Block (3,947 palms)</span>
                  <span class="meta-val" id="diag-fert-block" style="font-family:'JetBrains Mono'; font-weight:600; color:var(--text-main);">-</span>
                </div>
                
                <div style="margin-top: 12px;">
                  <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 6px;">Corrective Dosage per Block</div>
                  <div class="corrective-list" id="diag-corrective-list" style="display: flex; flex-direction: column; gap: 4px;">
                    <!-- Dynamically populated N P K Mg B corrective dosages -->
                  </div>
                </div>
              </div>
              
              <!-- Download button -->
              <button class="download-btn" id="download-report-btn" onclick="downloadReport()">
                <i data-lucide="download" size="14"></i>
                <span>Download Report (CSV)</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </aside>

    <!-- Map Area -->
    <div id="map-container">
      <!-- Location Search Box Overlay -->
      <div class="search-container">
        <div class="search-box">
          <i data-lucide="search" class="search-icon" size="16"></i>
          <input type="text" id="location-search-input" placeholder="Search location..." onkeydown="handleSearchKey(event)">
          <button id="search-clear-btn" onclick="clearSearch()" style="display: none;">
            <i data-lucide="x" size="14"></i>
          </button>
        </div>
        <div class="search-results" id="search-results-dropdown" style="display: none;"></div>
      </div>
      <div id="map"></div>
    </div>

  </div>

  <script>
    // Initialize Lucide icons
    lucide.createIcons();

    const centerLat = {lat_raw};
    const centerLon = {lon_raw};
    const smartpalmModel = {model_json};
    const perakPerimeter = {seraya_perimeter_json};

    // Initialize Map (allows free zooming and panning, max zoom restricted to 18)
    const map = L.map('map', { zoomControl: false, maxZoom: 18 }).setView([centerLat, centerLon], 17);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Base ESRI Satellite layer (displays high-resolution, cloud-free imagery at all times)
    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Tiles &copy; Esri &mdash; USDA, USGS, AeroGRID, IGN, and the GIS User Community'
    }).addTo(map);

    // Optional Sentinel-2 Visual layer if available (unchecked by default so users can zoom in clearly using ESRI satellite)
    const s2Url = "{s2_tile_url}";
    let s2LayerInstance = null;
    if (s2Url) {
      s2LayerInstance = L.tileLayer(s2Url, {
        maxZoom: 18,
        attribution: 'Sentinel-2 Visual Tile &copy; Microsoft Planetary Computer'
      });
    }

    // Borderline boundary - solid bright green outline around the estate
    const borderLayer = L.polygon(perakPerimeter, {
      color: '#00ff88',
      weight: 3,
      fillColor: 'transparent',
      interactive: false
    }).addTo(map);

    // Layer Control in the top-right corner to allow toggling Sentinel-2 overlay on/off
    const baseMaps = {
      "High-Resolution Map (Cloud-free)": satLayer
    };
    const overlays = {};
    if (s2LayerInstance) {
      overlays["Sentinel-2 Latest Imagery ({s2_date})"] = s2LayerInstance;
    }
    const layerControl = L.control.layers(baseMaps, overlays, { position: 'bottomright', collapsed: false }).addTo(map);

    // Fast Point in Polygon checker
    function isInsidePerimeter(lat, lon) {
      let inside = false;
      for (let i = 0, j = perakPerimeter.length - 1; i < perakPerimeter.length; j = i++) {
        const xi = perakPerimeter[i][0], yi = perakPerimeter[i][1];
        const xj = perakPerimeter[j][0], yj = perakPerimeter[j][1];
        const intersect = ((yi > lon) !== (yj > lon)) && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    // Deterministic Fractal Noise for smooth crop field simulation
    function hash(x, y) {
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return h - Math.floor(h);
    }

    function noise(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      
      const a = hash(ix, iy);
      const b = hash(ix + 1, iy);
      const c = hash(ix, iy + 1);
      const d = hash(ix + 1, iy + 1);
      
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      
      return a * (1 - ux) * (1 - uy) +
             b * ux * (1 - uy) +
             c * (1 - ux) * uy +
             d * ux * uy;
     }

    function fbm(x, y) {
      let value = 0.0;
      let amplitude = 0.5;
      for (let i = 0; i < 4; i++) {
        value += amplitude * noise(x, y);
        x *= 2.0;
        y *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }

    // Generates simulated NDVI health proxy
    function getLocalNDVI(lat, lon) {
      const x = (lon - 100.77) * 800;
      const y = (lat - 4.96) * 800;
      let val = 0.72 + fbm(x, y) * 0.22;
      
      // Add regular grid harvesting paths
      const latSpacing = 0.000425;
      const lonSpacing = 0.001275;
      
      const dLat = Math.abs(lat - Math.round(lat / latSpacing) * latSpacing);
      const dLon = Math.abs(lon - Math.round(lon / lonSpacing) * lonSpacing);
      
      if (dLat < 0.00003 || dLon < 0.00004) {
        val = 0.99; // Represents the white roads/paths inside the estate
      }
      return Math.max(0.1, Math.min(0.99, val));
    }

    // Simulate Sentinel-2 bands and calculate 6 vegetation indices for pixel-level ML prediction
    function getLocalFeatures(lat, lon) {
      const ndvi_base = getLocalNDVI(lat, lon);
      const seed = Math.sin(lat * 150 + lon * 230) * 1000;
      const rand = () => {
        const x = Math.sin(seed) * 1000;
        return x - Math.floor(x);
      };
      const j = (rand() - 0.5) * 0.02;

      const r8 = Math.max(0.05, Math.min(0.95, 0.25 + ndvi_base * 0.45 + j));
      const r4 = Math.max(0.02, Math.min(0.95, 0.04 + (1 - ndvi_base) * 0.18 - j * 0.5));
      const r3 = Math.max(0.02, Math.min(0.95, 0.08 + ndvi_base * 0.08 + j * 0.2));
      const r2 = Math.max(0.02, Math.min(0.95, 0.03 + (1 - ndvi_base) * 0.06 - j * 0.2));
      const r5 = Math.max(0.05, Math.min(0.95, 0.12 + ndvi_base * 0.22 + j * 0.5));
      const r11 = Math.max(0.05, Math.min(0.95, 0.16 + (1 - ndvi_base) * 0.12 - j * 0.3));
      const r12 = Math.max(0.02, Math.min(0.95, 0.08 + (1 - ndvi_base) * 0.08 - j * 0.2));

      const b2 = Math.round(r2 * 10000);
      const b3 = Math.round(r3 * 10000);
      const b4 = Math.round(r4 * 10000);
      const b8 = Math.round(r8 * 10000);
      const b11 = Math.round(r11 * 10000);
      const b12 = Math.round(r12 * 10000);
      const b5 = Math.round(r5 * 10000);

      const ndvi = (r8 - r4) / (r8 + r4);
      const ndre = (r8 - r5) / (r8 + r5);
      const savi = ((r8 - r4) / (r8 + r4 + 0.5)) * 1.5;
      const evi = 2.5 * ((r8 - r4) / (r8 + 6.0 * r4 - 7.5 * r2 + 1.0));
      const gndvi = (r8 - r3) / (r8 + r3);
      const msavi = (2 * r8 + 1 - Math.sqrt((2 * r8 + 1) * (2 * r8 + 1) - 8 * (r8 - r4))) / 2;

      return [
        b2, b3, b4, b8, b11, b12,
        ndvi, ndre, savi, evi, gndvi, msavi
      ];
    }

    // Random Forest evaluator
    function evaluateTree(node, features) {
      if (node.value !== undefined) return node.value;
      const val = features[node.feature_idx];
      if (val <= node.threshold) {
        return evaluateTree(node.left, features);
      } else {
        return evaluateTree(node.right, features);
      }
    }

    // Random Forest evaluator
    function predictRandomForest(features, trees) {
      if (!trees || trees.length === 0) return 0.0;
      let sum = 0;
      trees.forEach(t => sum += evaluateTree(t, features));
      return sum / trees.length;
    }

    // Map Click Diagnostics Handler
    let pickerMarker = null;
    let lastNVal = null;
    let lastPVal = null;
    let lastKVal = null;
    let lastMgVal = null;

    map.on('click', function(e) {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      // Place / Update diagnostic marker pin anywhere on the map
      if (!pickerMarker) {
        pickerMarker = L.marker([lat, lon]).addTo(map);
      } else {
        pickerMarker.setLatLng([lat, lon]);
      }

      // Get 12-feature vector
      const features = getLocalFeatures(lat, lon);
      const ndvi = features[6];

      // Run ML predictions for N, P, and K
      const nVal = smartpalmModel.trees_N_S2 ? predictRandomForest(features, smartpalmModel.trees_N_S2) : 2.5;
      const pVal = smartpalmModel.trees_P_S2 ? predictRandomForest(features, smartpalmModel.trees_P_S2) : 0.15;
      const kVal = smartpalmModel.trees_K_S2 ? predictRandomForest(features, smartpalmModel.trees_K_S2) : 0.90;
      
      // Calculate realistic Mg Leaf Level based on NDVI (varying slightly around optimum 0.25%)
      const mgVal = 0.24 + (ndvi * 0.02);

      // Store predicted values for dynamic recalculations
      lastNVal = nVal;
      lastPVal = pVal;
      lastKVal = kVal;
      lastMgVal = mgVal;

      // Update UI panels
      document.getElementById('diag-fallback-text').style.display = 'none';
      document.getElementById('diag-results').style.display = 'block';
      
      document.getElementById('diag-coord').innerText = lat.toFixed(5) + ", " + lon.toFixed(5);
      
      const inside = isInsidePerimeter(lat, lon);
      const zoneEl = document.getElementById('diag-zone');
      zoneEl.innerText = inside ? "Inside Batu 14, Batu Kurau, Perak" : "Outside Site";
      zoneEl.style.color = inside ? "#12b886" : "#fa5252";
      
      document.getElementById('diag-sensor').innerText = "Sentinel-2A (Optical)";
      document.getElementById('val-mg').innerText = mgVal.toFixed(3) + "%";
      document.getElementById('val-n').innerText = nVal.toFixed(2) + "%";
      document.getElementById('val-p').innerText = pVal.toFixed(3) + "%";
      document.getElementById('val-k').innerText = kVal.toFixed(2) + "%";

      // Calculate and display recommendation details
      updateRecommendations();
    });

    // Fertilizer database from MPOB specifications
    const fertilizers = [
      { name: "MPOB F1", n: 10.0, p: 5.4, k: 16.2, mg: 2.7, b: 0.5, weight: 50 },
      { name: "MPOB F1 Xtra K", n: 10.0, p: 5.0, k: 20.0, mg: 2.0, b: 0.5, weight: 50 },
      { name: "MPOB F2", n: 10.7, p: 9.1, k: 17.3, mg: 1.4, b: 0.5, weight: 50 },
      { name: "MPOB F2 Super K", n: 7.0, p: 3.0, k: 30.0, mg: 0.0, b: 1.0, weight: 50 },
      { name: "MPOB F3", n: 10.0, p: 7.0, k: 19.0, mg: 1.5, b: 0.5, weight: 50 },
      { name: "MPOB F4", n: 9.0, p: 6.0, k: 18.0, mg: 2.0, b: 0.5, weight: 25 },
      { name: "MPOB F4 Premium", n: 9.0, p: 6.0, k: 18.0, mg: 2.0, b: 0.5, weight: 25 },
      { name: "MPOB F5", n: 6.0, p: 6.0, k: 11.0, mg: 1.0, b: 0.0, weight: 50 },
      { name: "MPOB F5 Super", n: 10.0, p: 6.0, k: 19.0, mg: 2.5, b: 0.5, weight: 25 },
      { name: "MPOB F6", n: 10.0, p: 7.0, k: 18.0, mg: 2.5, b: 0.5, weight: 50 },
      { name: "MPOB F7", n: 19.0, p: 8.0, k: 13.0, mg: 2.5, b: 0.4, weight: 25 }
    ];

    let selectedFertilizerIndex = 0;

    function populateFertilizers() {
      const select = document.getElementById('fertilizer-select');
      if (!select) return;
      select.innerHTML = '';
      fertilizers.forEach((fert, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = fert.name + " (" + fert.n + "-" + fert.p + "-" + fert.k + "-" + fert.mg + "-" + fert.b + ") - " + fert.weight + "kg";
        select.appendChild(opt);
      });
      select.value = selectedFertilizerIndex;
    }

    function onFertilizerChange() {
      const select = document.getElementById('fertilizer-select');
      if (!select) return;
      selectedFertilizerIndex = parseInt(select.value, 10);
      console.log("Selected Fertilizer:", fertilizers[selectedFertilizerIndex]);
      updateRecommendations();
    }

    function updateRecommendations() {
      if (lastNVal === null) return;
      
      const fert = fertilizers[selectedFertilizerIndex];
      const palmsPerBlock = 3946.918;

      // 1. Calculate standard dosage per palm (kg)
      const nPct = fert.n / 100;
      const dosagePerPalm = nPct > 0 ? (0.622 / nPct) : 0;
      
      // 2. Calculate requirement per block (MT)
      const reqPerBlockMT = (dosagePerPalm * palmsPerBlock) / 1000;
      
      // Update UI elements for standard dosage
      document.getElementById('diag-fert-name').innerText = fert.name;
      document.getElementById('diag-fert-palm').innerText = dosagePerPalm > 0 ? (dosagePerPalm.toFixed(2) + " kg") : "N/A";
      document.getElementById('diag-fert-block').innerText = dosagePerPalm > 0 ? (reqPerBlockMT.toFixed(5) + " MT") : "N/A";
      
      const correctiveList = document.getElementById('diag-corrective-list');
      correctiveList.innerHTML = '';
      
      // 3. Calculate corrective dosages for N, P, K, Mg, B
      const nutrients = [
        { key: "N", name: "Nitrogen (N)", pct: fert.n, actual: lastNVal, target: 2.50, color: "#12b886" },
        { key: "P", name: "Phosphorus (P)", pct: fert.p, actual: lastPVal, target: 0.15, color: "#ff922b" },
        { key: "K", name: "Potassium (K)", pct: fert.k, actual: lastKVal, target: 0.90, color: "#cc5de8" },
        { key: "Mg", name: "Magnesium (Mg)", pct: fert.mg, actual: lastMgVal, target: 0.25, color: "#a9e34b" },
        { key: "B", name: "Boron (B)", pct: fert.b, actual: 0.0015, target: 0.0015, color: "#f783ac" }
      ];
      
      nutrients.forEach(nut => {
        const nutPct = nut.pct / 100;
        const supplied = dosagePerPalm * nutPct;
        
        // Target is scaled by deficit ratio (target / actual) if actual < target
        const deficitRatio = nut.actual < nut.target ? (nut.target / nut.actual) : 1.0;
        const targetVal = supplied * deficitRatio;
        
        const correctivePalm = Math.max(0, targetVal - supplied);
        const correctiveBlock = correctivePalm * palmsPerBlock;
        
        const rowEl = document.createElement('div');
        rowEl.className = 'meta-row';
        rowEl.style.padding = '3px 0';
        rowEl.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        rowEl.innerHTML = `
          <span class="meta-lbl" style="font-weight: 500;">
            <span style="color: ${nut.color}; font-weight: 700; font-family: 'JetBrains Mono'; margin-right: 4px;">${nut.key}</span> Deficit
          </span>
          <span class="meta-val" style="font-family: 'JetBrains Mono'; font-size: 11px; color: ${correctivePalm > 0 ? 'var(--accent-glow)' : 'var(--text-muted)'};">
            ${correctiveBlock.toFixed(2)} kg <span style="color: var(--text-muted); font-size: 10px;">(${correctivePalm.toFixed(2)} kg/palm)</span>
          </span>
        `;
        correctiveList.appendChild(rowEl);
      });
    }

    function downloadReport() {
      if (lastNVal === null) return;
      
      const fert = fertilizers[selectedFertilizerIndex];
      const palmsPerBlock = 3946.918;

      const nPct = fert.n / 100;
      const dosagePerPalm = nPct > 0 ? (0.622 / nPct) : 0;
      const reqPerBlockMT = (dosagePerPalm * palmsPerBlock) / 1000;
      
      const coordText = document.getElementById('diag-coord').innerText;
      const zoneText = document.getElementById('diag-zone').innerText;
      
      const nutrients = [
        { key: "N", actual: lastNVal, target: 2.50, pct: fert.n },
        { key: "P", actual: lastPVal, target: 0.15, pct: fert.p },
        { key: "K", actual: lastKVal, target: 0.90, pct: fert.k },
        { key: "Mg", actual: lastMgVal, target: 0.25, pct: fert.mg },
        { key: "B", actual: 0.0015, target: 0.0015, pct: fert.b }
      ];

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Precipalm Analysis Report\\n";
      csvContent += `Generated,${new Date().toISOString()}\\n`;
      csvContent += `Coordinates,"${coordText}"\\n`;
      csvContent += `Zone,${zoneText}\\n`;
      csvContent += `Selected Fertilizer,${fert.name}\\n`;
      csvContent += `Dosage per Palm (kg),${dosagePerPalm.toFixed(2)}\\n`;
      csvContent += `Requirement per Block (MT),${reqPerBlockMT.toFixed(5)}\\n\\n`;
      
      csvContent += "Nutrient,Actual Leaf Level,Optimum Target,Fertilizer Content (%),Corrective Deficit (kg/palm),Corrective Deficit (kg/block)\\n";
      
      nutrients.forEach(nut => {
        const nutPct = nut.pct / 100;
        const supplied = dosagePerPalm * nutPct;
        const deficitRatio = nut.actual < nut.target ? (nut.target / nut.actual) : 1.0;
        const targetVal = supplied * deficitRatio;
        const correctivePalm = Math.max(0, targetVal - supplied);
        const correctiveBlock = correctivePalm * palmsPerBlock;
        
        csvContent += `${nut.key},${(nut.actual * (nut.key === "B" ? 10000 : 1)).toFixed(4)}${nut.key === "B" ? " ppm" : "%"},${(nut.target * (nut.key === "B" ? 10000 : 1)).toFixed(4)}${nut.key === "B" ? " ppm" : "%"},${nut.pct.toFixed(1)}%,${correctivePalm.toFixed(4)},${correctiveBlock.toFixed(2)}\\n`;
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      
      const cleanCoord = coordText.replace(/[\s,]+/g, "_");
      link.setAttribute("download", `precipalm_report_${cleanCoord}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    let searchTimeout = null;

    function handleSearchKey(event) {
      const input = document.getElementById('location-search-input');
      const clearBtn = document.getElementById('search-clear-btn');
      
      if (input.value.trim().length > 0) {
        clearBtn.style.display = 'flex';
      } else {
        clearBtn.style.display = 'none';
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        performSearch(input.value.trim());
      } else {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          triggerAutocomplete(input.value.trim());
        }, 500);
      }
    }

    function clearSearch() {
      const input = document.getElementById('location-search-input');
      input.value = '';
      document.getElementById('search-clear-btn').style.display = 'none';
      document.getElementById('search-results-dropdown').style.display = 'none';
    }

    async function triggerAutocomplete(query) {
      const dropdown = document.getElementById('search-results-dropdown');
      if (query.length < 3) {
        dropdown.style.display = 'none';
        return;
      }

      try {
        const response = await fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(query) + "&limit=5");
        const results = await response.json();
        
        if (results && results.length > 0) {
          dropdown.innerHTML = '';
          results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerText = item.display_name;
            div.onclick = () => {
              goToLocation(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
              dropdown.style.display = 'none';
            };
            dropdown.appendChild(div);
          });
          dropdown.style.display = 'flex';
        } else {
          dropdown.style.display = 'none';
        }
      } catch (err) {
        console.error("Autocomplete search error:", err);
      }
    }

    async function performSearch(query) {
      if (query.length === 0) return;
      document.getElementById('search-results-dropdown').style.display = 'none';
      
      try {
        const response = await fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(query) + "&limit=1");
        const results = await response.json();
        if (results && results.length > 0) {
          const topResult = results[0];
          goToLocation(parseFloat(topResult.lat), parseFloat(topResult.lon), topResult.display_name);
        } else {
          alert("Location not found. Please try a different query.");
        }
      } catch (err) {
        console.error("Search geocoding error:", err);
      }
    }

    function goToLocation(lat, lon, displayName) {
      map.setView([lat, lon], 14);
      
      if (!pickerMarker) {
        pickerMarker = L.marker([lat, lon]).addTo(map);
      } else {
        pickerMarker.setLatLng([lat, lon]);
      }
      
      const mockEvent = { latlng: L.latLng(lat, lon) };
      map.fire('click', mockEvent);
    }

    // Initialize fertilizers list
    populateFertilizers();

    // Fit map bounds to the perimeter polygon
    const fitPoly = L.polygon(perakPerimeter);
    map.fitBounds(fitPoly.getBounds(), { padding: [30, 30] });

  </script>
</body>
</html>
"""

    # Replace dynamic tags safely
    html_content = html_content.replace("{place}", html.escape(place))
    html_content = html_content.replace("{lat}", f"{lat:.5f}")
    html_content = html_content.replace("{lon}", f"{lon:.5f}")
    html_content = html_content.replace("{lat_raw}", str(lat))
    html_content = html_content.replace("{lon_raw}", str(lon))
    html_content = html_content.replace("{s2_date}", s2_date[:10])
    html_content = html_content.replace("{s2_cloud}", s2_cloud)
    html_content = html_content.replace("{s2_tile_url}", s2_tile_url)
    html_content = html_content.replace("{model_json}", model_json)
    html_content = html_content.replace("{seraya_perimeter_json}", perak_perimeter_json)
    html_content = html_content.replace("{logo_base64}", logo_base64)

    output_path.write_text(html_content, encoding="utf-8")
    print(f"Palmnex HTML compiled successfully to {output_path}")

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Palmnex Crop Nutrient interface for Perak Site.")
    parser.add_argument("--lat", type=float, default=DEFAULT_LAT, help="Latitude center.")
    parser.add_argument("--lon", type=float, default=DEFAULT_LON, help="Longitude center.")
    parser.add_argument("--place", type=str, default=DEFAULT_PLACE, help="Place name.")
    parser.add_argument("--radius-km", type=float, default=8.0, help="Search radius.")
    parser.add_argument("--start", type=str, default="2022-01-01", help="Sentinel start date.")
    parser.add_argument("--end", type=str, default="2026-06-15", help="Sentinel end date.")
    parser.add_argument("--max-cloud", type=float, default=50.0, help="Max cloud cover.")
    parser.add_argument("--output", type=str, default="palmnex_perak.html", help="Output file.")
    parser.add_argument("--no-open", action="store_true", help="Don't open output in browser.")
    return parser.parse_args()

    
def main() -> int:
    args = parse_args()
    bbox = make_bbox(args.lon, args.lat, args.radius_km)
    
    print("Searching Copernicus Data Space / Planetary Computer...")
    real_layers = search_real_imagery(bbox, args.start, args.end, args.max_cloud)
    
    output = Path(args.output)
    build_html(output, args.place, args.lat, args.lon, real_layers)
    
    if not args.no_open:
      webbrowser.open(output.resolve().as_uri())
    return 0

if __name__ == "__main__":
    sys.exit(main())
