#!/usr/bin/env python3
"""
Search Copernicus Sentinel-1 and Sentinel-2 products for a Malaysia location
and generate an HTML viewer with footprints, metadata, and quicklook images.

The catalogue search and product node listing work without a Copernicus Data
Space account. Full product download needs a free CDSE account because complete
Sentinel products are large and authenticated.
"""

from __future__ import annotations

import argparse
import getpass
import html
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import webbrowser


CATALOGUE_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
PC_STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_TILEJSON_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json"
IDENTITY_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/"
    "protocol/openid-connect/token"
)
DOWNLOAD_URL = "https://download.dataspace.copernicus.eu/odata/v1/Products"


DEFAULT_LAT = 3.882036
DEFAULT_LON = 100.903912
DEFAULT_PLACE = "Perak, Malaysia"


def request_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    req = Request(url, headers=headers or {"User-Agent": "python-sentinel-viewer/1.0"})
    try:
        with urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}\n{detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach {url}: {exc}") from exc


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "python-sentinel-viewer/1.0"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}\n{detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach {url}: {exc}") from exc


def post_form(url: str, form: dict[str, str]) -> dict[str, Any]:
    data = urlencode(form).encode("utf-8")
    req = Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "python-sentinel-viewer/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Authentication failed: HTTP {exc.code}\n{detail}") from exc


def make_bbox(lon: float, lat: float, radius_km: float) -> tuple[float, float, float, float]:
    # Good enough for small AOIs in Malaysia. Longitude degree size changes by latitude.
    lat_delta = radius_km / 111.32
    lon_delta = radius_km / (111.32 * max(0.1, abs(__import__("math").cos(__import__("math").radians(lat)))))
    return lon - lon_delta, lat - lat_delta, lon + lon_delta, lat + lat_delta


def bbox_to_wkt(bbox: tuple[float, float, float, float]) -> str:
    west, south, east, north = bbox
    return (
        "POLYGON(("
        f"{west:.6f} {south:.6f},"
        f"{east:.6f} {south:.6f},"
        f"{east:.6f} {north:.6f},"
        f"{west:.6f} {north:.6f},"
        f"{west:.6f} {south:.6f}"
        "))"
    )


def product_type_filter(product_type: str) -> str:
    return (
        "Attributes/OData.CSC.StringAttribute/any("
        f"att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq '{product_type}'"
        ")"
    )


def search_products(
    collection: str,
    product_type: str,
    wkt: str,
    start: str,
    end: str,
    limit: int,
) -> list[dict[str, Any]]:
    filters = [
        f"Collection/Name eq '{collection}'",
        product_type_filter(product_type),
        f"OData.CSC.Intersects(area=geography'SRID=4326;{wkt}')",
        f"ContentDate/Start gt {start}T00:00:00.000Z",
        f"ContentDate/Start lt {end}T23:59:59.999Z",
    ]
    query = {
        "$filter": " and ".join(filters),
        "$orderby": "ContentDate/Start desc",
        "$top": str(limit),
        "$expand": "Assets",
    }
    url = f"{CATALOGUE_URL}?{urlencode(query)}"
    data = request_json(url)
    return data.get("value", [])


def pc_tilejson(collection: str, item_id: str, params: dict[str, str]) -> dict[str, Any]:
    query = {"collection": collection, "item": item_id}
    query.update(params)
    return request_json(f"{PC_TILEJSON_URL}?{urlencode(query)}")


def search_real_imagery(
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
    max_cloud: float,
) -> dict[str, Any]:
    layers: dict[str, Any] = {"sentinel2": None, "sentinel1": None}

    s2_payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": list(bbox),
        "datetime": f"{start}/{end}",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}],
        "limit": 1,
    }
    s2_features = post_json(PC_STAC_SEARCH_URL, s2_payload).get("features", [])
    if s2_features:
        item = s2_features[0]
        tilejson = pc_tilejson("sentinel-2-l2a", item["id"], {"assets": "visual"})
        layers["sentinel2"] = {
            "name": "Sentinel-2 true color image",
            "item_id": item["id"],
            "datetime": item.get("properties", {}).get("datetime", ""),
            "cloud_cover": item.get("properties", {}).get("eo:cloud_cover"),
            "tile_url": tilejson["tiles"][0],
            "bounds": tilejson.get("bounds"),
            "attribution": "Sentinel-2 L2A via Microsoft Planetary Computer",
        }

    s1_payload = {
        "collections": ["sentinel-1-rtc"],
        "bbox": list(bbox),
        "datetime": f"{start}/{end}",
        "limit": 1,
    }
    s1_features = post_json(PC_STAC_SEARCH_URL, s1_payload).get("features", [])
    if s1_features:
        item = s1_features[0]
        tilejson = pc_tilejson(
            "sentinel-1-rtc",
            item["id"],
            {"assets": "vv", "rescale": "0,0.4", "colormap_name": "gray"},
        )
        layers["sentinel1"] = {
            "name": "Sentinel-1 VV radar image",
            "item_id": item["id"],
            "datetime": item.get("properties", {}).get("datetime", ""),
            "cloud_cover": None,
            "tile_url": tilejson["tiles"][0],
            "bounds": tilejson.get("bounds"),
            "attribution": "Sentinel-1 RTC via Microsoft Planetary Computer",
        }

    return layers


def asset_quicklook_url(product: dict[str, Any]) -> str | None:
    for asset in product.get("Assets", []) or []:
        name = str(asset.get("Name", "")).lower()
        content_type = str(asset.get("ContentType", "")).lower()
        if "quicklook" in name or content_type.startswith("image/"):
            return asset.get("DownloadLink") or (
                f"https://catalogue.dataspace.copernicus.eu/odata/v1/Assets({asset.get('Id')})/$value"
                if asset.get("Id")
                else None
            )
    return None


def product_rows(products: list[dict[str, Any]], label: str) -> str:
    if not products:
        return f"<section><h2>{html.escape(label)}</h2><p>No products found for this search.</p></section>"

    cards = []
    for product in products:
        name = product.get("Name", "Unnamed product")
        product_id = product.get("Id", "")
        content_date = (product.get("ContentDate") or {}).get("Start", "")
        s3_path = product.get("S3Path", "")
        footprint = json.dumps(product.get("GeoFootprint"), separators=(",", ":"))
        quicklook = asset_quicklook_url(product)
        image_html = (
            f'<img src="{html.escape(quicklook)}" alt="Quicklook for {html.escape(name)}" loading="lazy">'
            if quicklook
            else '<div class="missing">No quicklook asset returned</div>'
        )
        cards.append(
            f"""
            <article class="product" data-footprint='{html.escape(footprint, quote=True)}'>
              <div class="preview">{image_html}</div>
              <div class="details">
                <h3>{html.escape(name)}</h3>
                <dl>
                  <dt>Date</dt><dd>{html.escape(content_date)}</dd>
                  <dt>Product ID</dt><dd><code>{html.escape(product_id)}</code></dd>
                  <dt>S3 path</dt><dd><code>{html.escape(s3_path)}</code></dd>
                </dl>
                <button type="button" class="zoom">Show footprint</button>
              </div>
            </article>
            """
        )
    return f"<section><h2>{html.escape(label)}</h2>{''.join(cards)}</section>"


def build_html(
    output: Path,
    place: str,
    lat: float,
    lon: float,
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
    s1: list[dict[str, Any]],
    s2: list[dict[str, Any]],
    real_layers: dict[str, Any],
) -> None:
    west, south, east, north = bbox
    summary = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
        },
        "properties": {"name": "Search area"},
    }
    s1_json = json.dumps(s1, default=str)
    s2_json = json.dumps(s2, default=str)
    layer_json = json.dumps(real_layers)
    summary_json = json.dumps(summary)
    
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SmartPalm Earth View Dashboard - {html.escape(place)}</title>
  
  <!-- Fonts & Libraries -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  
  <style>
    :root {{
      --bg-main: #060913;
      --bg-sidebar: rgba(10, 15, 30, 0.82);
      --bg-card: rgba(20, 28, 52, 0.65);
      --bg-card-hover: rgba(29, 40, 75, 0.9);
      --border-glass: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(12, 166, 120, 0.3);
      --accent-primary: #0ca678; /* Palm Green */
      --accent-glow: #12b886;
      --accent-secondary: #3b82f6; /* Blue */
      --accent-alert: #ff6b6b; /* Red */
      --accent-warning: #fcc419; /* Amber */
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --shadow-premium: 0 12px 40px -10px rgba(0, 0, 0, 0.85);
    }}

    body {{
      margin: 0;
      padding: 0;
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-main);
      color: var(--text-main);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }}

    /* Layout structure */
    .dashboard-container {{
      display: grid;
      grid-template-columns: 430px 1fr;
      width: 100vw;
      height: 100vh;
      position: relative;
    }}

    /* Sidebar styles */
    aside.sidebar {{
      background: var(--bg-sidebar);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid var(--border-glass);
      display: flex;
      flex-direction: column;
      height: 100vh;
      z-index: 10;
      box-shadow: 8px 0 32px rgba(0, 0, 0, 0.7);
    }}

    .sidebar-header {{
      padding: 24px 20px 18px;
      border-bottom: 1px solid var(--border-glass);
    }}

    .logo-container {{
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 6px;
    }}

    .logo-icon {{
      color: var(--accent-primary);
      filter: drop-shadow(0 0 8px var(--accent-glow));
    }}

    .logo-title {{
      font-family: 'Outfit', sans-serif;
      font-size: 25px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #fff 30%, var(--accent-primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}

    .logo-subtitle {{
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 700;
    }}

    .sidebar-scrollable {{
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }}

    .sidebar-scrollable::-webkit-scrollbar {{
      width: 5px;
    }}
    .sidebar-scrollable::-webkit-scrollbar-track {{
      background: transparent;
    }}
    .sidebar-scrollable::-webkit-scrollbar-thumb {{
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }}
    .sidebar-scrollable::-webkit-scrollbar-thumb:hover {{
      background: rgba(255, 255, 255, 0.25);
    }}

    .sidebar-section-title {{
      font-family: 'Outfit', sans-serif;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: var(--text-muted);
      margin-bottom: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }}

    /* Card styling */
    .glass-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      padding: 15px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }}

    .glass-card:hover {{
      background: var(--bg-card-hover);
      border-color: var(--border-accent);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
    }}

    /* Preset list */
    .preset-grid {{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }}

    .preset-btn {{
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-glass);
      border-radius: 8px;
      padding: 8px 10px;
      color: var(--text-main);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .preset-btn:hover {{
      background: rgba(12, 166, 120, 0.15);
      border-color: var(--accent-primary);
      transform: translateY(-1px);
    }}

    /* Metadata details */
    .meta-row {{
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
    }}
    .meta-row:last-child {{
      margin-bottom: 0;
    }}
    .meta-lbl {{
      color: var(--text-muted);
    }}
    .meta-val {{
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }}

    /* SmartPalm Predictor */
    .predictor-placeholder {{
      text-align: center;
      padding: 20px 10px;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.5;
    }}

    .predictor-pulse {{
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(12, 166, 120, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 12px;
      color: var(--accent-primary);
      border: 1px dashed var(--accent-primary);
      animation: predictor-glow 2s infinite alternate;
    }}

    @keyframes predictor-glow {{
      from {{ box-shadow: 0 0 4px rgba(12, 166, 120, 0.2); }}
      to {{ box-shadow: 0 0 16px rgba(12, 166, 120, 0.6); }}
    }}

    .predictor-results {{
      display: flex;
      flex-direction: column;
      gap: 14px;
    }}

    .predict-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-glass);
      padding-bottom: 8px;
    }}

    .predict-title {{
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 15px;
    }}

    .status-pill {{
      border-radius: 20px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }}

    .status-pill.optimal {{ background: rgba(12, 166, 120, 0.2); color: var(--accent-primary); border: 1px solid var(--accent-primary); }}
    .status-pill.warning {{ background: rgba(252, 196, 25, 0.2); color: var(--accent-warning); border: 1px solid var(--accent-warning); }}
    .status-pill.alert {{ background: rgba(255, 107, 107, 0.2); color: var(--accent-alert); border: 1px solid var(--accent-alert); }}

    /* Custom progress bar */
    .gauge-wrapper {{
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}

    .gauge-bar {{
      display: flex;
      flex-direction: column;
      gap: 4px;
    }}

    .gauge-header {{
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
    }}

    .gauge-title {{
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 4px;
    }}

    .gauge-track {{
      height: 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      position: relative;
      overflow: hidden;
    }}

    .gauge-fill {{
      height: 100%;
      border-radius: 3px;
      width: 0%;
      transition: width 1.2s cubic-bezier(0.1, 0.8, 0.2, 1);
    }}

    .gauge-fill.n {{ background: linear-gradient(90deg, #ff8787, #ff6b6b, #e03131); }}
    .gauge-fill.p {{ background: linear-gradient(90deg, #74c0fc, #3b82f6, #1971c2); }}
    .gauge-fill.k {{ background: linear-gradient(90deg, #ffd43b, #fcc419, #f59f00); }}

    .gauge-marker {{
      position: absolute;
      width: 2px;
      height: 100%;
      background: white;
      top: 0;
      opacity: 0.65;
    }}

    .chart-box {{
      width: 100%;
      height: 160px;
      display: flex;
      justify-content: center;
      align-items: center;
    }}

    .prescription-card {{
      background: rgba(12, 166, 120, 0.05);
      border-left: 3px solid var(--accent-primary);
      padding: 10px 12px;
      border-radius: 0 8px 8px 0;
      font-size: 11.5px;
      line-height: 1.5;
    }}

    /* Product Feed styles */
    .feed-list {{
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
      padding-right: 4px;
    }}

    .feed-list::-webkit-scrollbar {{
      width: 4px;
    }}
    .feed-list::-webkit-scrollbar-thumb {{
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
    }}

    .feed-card {{
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: grid;
      grid-template-columns: 60px 1fr;
      gap: 10px;
      align-items: center;
    }}

    .feed-card:hover {{
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.15);
    }}

    .feed-card.active {{
      border-color: var(--accent-primary);
      background: rgba(12, 166, 120, 0.08);
    }}

    .feed-thumb {{
      width: 60px;
      height: 48px;
      border-radius: 4px;
      background: #0f131f;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }}

    .feed-thumb img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}

    .feed-thumb-err {{
      font-size: 7px;
      color: var(--text-muted);
      text-align: center;
      padding: 2px;
    }}

    .feed-details {{
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }}

    .feed-name {{
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}

    .feed-sub {{
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }}

    .feed-badge {{
      border-radius: 4px;
      padding: 0 4px;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(255,255,255,0.08);
    }}
    .feed-badge.s2 {{ background: rgba(59, 130, 246, 0.2); color: #60a5fa; }}
    .feed-badge.s1 {{ background: rgba(12, 166, 120, 0.2); color: #34d399; }}

    /* Map pane container */
    .map-pane {{
      position: relative;
      width: 100%;
      height: 100%;
    }}

    #map {{
      width: 100%;
      height: 100%;
      background-color: var(--bg-main);
    }}

    /* Map widgets */
    .map-overlay-widget {{
      position: absolute;
      z-index: 1000;
      background: rgba(8, 12, 21, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      box-shadow: var(--shadow-premium);
      padding: 12px;
      color: var(--text-main);
    }}

    /* Layers control widget */
    .layers-overlay {{
      top: 16px;
      right: 16px;
      width: 205px;
    }}

    .layer-section-header {{
      font-family: 'Outfit', sans-serif;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
      color: var(--text-muted);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }}

    .layer-list {{
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
    }}
    .layer-list:last-child {{
      margin-bottom: 0;
    }}

    .layer-row {{
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }}

    .layer-row:hover {{
      background: rgba(255, 255, 255, 0.05);
    }}

    .layer-row.active {{
      background: rgba(12, 166, 120, 0.15);
      color: var(--accent-primary);
      font-weight: 600;
    }}

    .layer-bullet {{
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .layer-row.active .layer-bullet {{
      border-color: var(--accent-primary);
    }}

    .layer-row.active .layer-bullet::after {{
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-primary);
    }}

    /* Legend widget */
    .legend-overlay {{
      bottom: 24px;
      right: 16px;
      width: 220px;
    }}

    .legend-bar-gradient {{
      height: 10px;
      border-radius: 5px;
      background: linear-gradient(90deg, #d84315, #f88c00, #ffe600, #a3e300, #2e7d32);
      margin-bottom: 5px;
    }}
    .legend-bar-gradient.radar {{
      background: linear-gradient(90deg, #050505, #555, #aaa, #f5f5f5);
    }}

    .legend-lbls {{
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: var(--text-muted);
      font-weight: 600;
    }}

    /* Bottom analytics stats overlay */
    .analytics-panel-overlay {{
      position: absolute;
      bottom: 24px;
      left: 454px;
      right: 252px;
      height: 110px;
    }}

    .panel-flex {{
      display: flex;
      gap: 16px;
      height: 100%;
      align-items: center;
    }}

    .panel-chart-container {{
      flex: 1;
      height: 100%;
      min-width: 0;
    }}

    .panel-stat-container {{
      width: 140px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border-left: 1px solid var(--border-glass);
      padding-left: 16px;
    }}

    .mini-stat {{
      margin-bottom: 6px;
    }}
    .mini-stat:last-child {{
      margin-bottom: 0;
    }}
    .mini-stat-val {{
      font-size: 18px;
      font-weight: 800;
      color: var(--accent-primary);
      font-family: 'Outfit', sans-serif;
    }}
    .mini-stat-lbl {{
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}

    /* Custom Toast */
    .app-toast {{
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2000;
      background: rgba(12, 166, 120, 0.95);
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 11.5px;
      font-weight: 600;
      box-shadow: var(--shadow-premium);
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }}
    .app-toast.active {{
      opacity: 1;
    }}

    /* Responsive */
    @media (max-width: 1024px) {{
      .dashboard-container {{
        grid-template-columns: 1fr;
        grid-template-rows: 55vh 45vh;
      }}
      aside.sidebar {{
        height: 45vh;
        grid-row: 2;
      }}
      .map-pane {{
        grid-row: 1;
      }}
      .analytics-panel-overlay {{
        display: none;
      }}
    }}
  </style>
</head>
<body>
  <div class="dashboard-container">
    
    <!-- Left Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-container">
          <i data-lucide="leaf" class="logo-icon"></i>
          <span class="logo-title">SmartPalm</span>
        </div>
        <div class="logo-subtitle">Earth View Analytics</div>
      </div>
      
      <div class="sidebar-scrollable">
        
        <!-- Preset Locations -->
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>Malaysia Presets</span>
            <i data-lucide="map-pin" size="14"></i>
          </div>
          <div class="preset-grid">
            <button type="button" class="preset-btn" onclick="applyPreset(0)">
              <i data-lucide="compass" size="12"></i> Sungkai, Perak
            </button>
            <button type="button" class="preset-btn" onclick="applyPreset(1)">
              <i data-lucide="compass" size="12"></i> Kluang, Johor
            </button>
            <button type="button" class="preset-btn" onclick="applyPreset(2)">
              <i data-lucide="compass" size="12"></i> Muadzam, Pahang
            </button>
            <button type="button" class="preset-btn" onclick="applyPreset(3)">
              <i data-lucide="compass" size="12"></i> Lahad Datu, Sabah
            </button>
          </div>
        </div>

        <!-- Coordinates Details -->
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>Location parameters</span>
            <i data-lucide="settings" size="14"></i>
          </div>
          <div class="glass-card">
            <div class="meta-row">
              <span class="meta-lbl">Area name</span>
              <span class="meta-val" id="area-name-lbl">{html.escape(place)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-lbl">Center Lat</span>
              <span class="meta-val" id="lat-lbl">{lat:.6f}</span>
            </div>
            <div class="meta-row">
              <span class="meta-lbl">Center Lon</span>
              <span class="meta-val" id="lon-lbl">{lon:.6f}</span>
            </div>
            <div class="meta-row">
              <span class="meta-lbl">Date query</span>
              <span class="meta-val">{html.escape(start)} to {html.escape(end)}</span>
            </div>
          </div>
        </div>

        <!-- Predictive Engine Panel -->
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>SmartPalm AI Predictor</span>
            <i data-lucide="cpu" size="14"></i>
          </div>
          <div class="glass-card" id="predictor-card">
            <div class="predictor-placeholder" id="npk-placeholder">
              <div class="predictor-pulse">
                <i data-lucide="map-pin"></i>
              </div>
              <p>Click anywhere on the map to predict soil & leaf nutrient concentrations (N, P, K) using simulated Random Forest Regressions.</p>
            </div>
            
            <div class="predictor-results" id="npk-results" style="display:none;">
              <div class="predict-header">
                <span class="predict-title" id="predict-coord-lbl">Diagnostics</span>
                <span class="status-pill optimal" id="health-badge">Optimal</span>
              </div>
              
              <div class="gauge-wrapper">
                <!-- N Gauge -->
                <div class="gauge-bar">
                  <div class="gauge-header">
                    <span class="gauge-title"><i data-lucide="droplet" size="12"></i> Nitrogen (N)</span>
                    <span class="gauge-val" id="n-val">2.5%</span>
                  </div>
                  <div class="gauge-track">
                    <div class="gauge-fill n" id="n-fill" style="width: 70%;"></div>
                    <div class="gauge-marker" style="left: 71.4%;"></div> <!-- 2.5% Target -->
                  </div>
                </div>

                <!-- P Gauge -->
                <div class="gauge-bar">
                  <div class="gauge-header">
                    <span class="gauge-title"><i data-lucide="flame" size="12"></i> Phosphorus (P)</span>
                    <span class="gauge-val" id="p-val">0.16%</span>
                  </div>
                  <div class="gauge-track">
                    <div class="gauge-fill p" id="p-fill" style="width: 64%;"></div>
                    <div class="gauge-marker" style="left: 60.0%;"></div> <!-- 0.15% Target -->
                  </div>
                </div>

                <!-- K Gauge -->
                <div class="gauge-bar">
                  <div class="gauge-header">
                    <span class="gauge-title"><i data-lucide="sparkles" size="12"></i> Potassium (K)</span>
                    <span class="gauge-val" id="k-val">1.1%</span>
                  </div>
                  <div class="gauge-track">
                    <div class="gauge-fill k" id="k-fill" style="width: 68%;"></div>
                    <div class="gauge-marker" style="left: 61.1%;"></div> <!-- 1.1% Target -->
                  </div>
                </div>
              </div>

              <!-- Radar Chart -->
              <div class="radar-chart-container">
                <canvas id="radarChart"></canvas>
              </div>

              <!-- Prescription recommendations -->
              <div class="prescription-card" id="prescription-txt">
                Canopy nutrition balance is optimal. Maintain regular NPK compound dosing (2.5kg per tree twice a year).
              </div>
            </div>
          </div>
        </div>

        <!-- Products Feed -->
        <div class="sidebar-section">
          <div class="sidebar-section-title">
            <span>Sentinel Imagery Feed</span>
            <i data-lucide="database" size="14"></i>
          </div>
          <div class="feed-list" id="feed-list">
            <!-- Populated via Javascript -->
          </div>
        </div>
        
      </div>
    </aside>

    <!-- Right Map View -->
    <div class="map-pane">
      <div id="map"></div>
      
      <!-- Custom Toast -->
      <div class="app-toast" id="app-toast">
        <i data-lucide="info" size="14"></i>
        <span id="toast-text">Toast Message</span>
      </div>

      <!-- Floating custom Leaflet layers control -->
      <div class="map-overlay-widget layers-overlay">
        <div class="layer-section-header">
          <i data-lucide="map" size="12"></i>
          <span>Base Map</span>
        </div>
        <div class="layer-list">
          <div class="layer-row active" id="base-osm" onclick="setBaseMap('osm')">
            <div class="layer-bullet"></div>
            <span>Street Map</span>
          </div>
          <div class="layer-row" id="base-sat" onclick="setBaseMap('sat')">
            <div class="layer-bullet"></div>
            <span>Satellite Photo</span>
          </div>
        </div>

        <div class="layer-section-header" style="margin-top: 10px;">
          <i data-lucide="layers" size="12"></i>
          <span>Sentinel Overlays</span>
        </div>
        <div class="layer-list" id="sentinel-layer-list">
          <div class="layer-row active" onclick="setSentinelLayerType('visual')">
            <div class="layer-bullet"></div>
            <span>S2 True Color</span>
          </div>
          <div class="layer-row" onclick="setSentinelLayerType('false_color')">
            <div class="layer-bullet"></div>
            <span>S2 False Color (CIR)</span>
          </div>
          <div class="layer-row" onclick="setSentinelLayerType('ndvi')">
            <div class="layer-bullet"></div>
            <span>S2 NDVI Index</span>
          </div>
          <div class="layer-row" onclick="setSentinelLayerType('vv')">
            <div class="layer-bullet"></div>
            <span>S1 Radar VV</span>
          </div>
          <div class="layer-row" onclick="setSentinelLayerType('vh')">
            <div class="layer-bullet"></div>
            <span>S1 Radar VH</span>
          </div>
          <div class="layer-row" onclick="setSentinelLayerType('none')">
            <div class="layer-bullet"></div>
            <span>No Overlay</span>
          </div>
        </div>
      </div>

      <!-- Floating Legend overlay -->
      <div class="map-overlay-widget legend-overlay" id="legend-panel">
        <div class="widget-title" id="legend-title">NDVI Vegetation Health</div>
        <div class="legend-bar-gradient" id="legend-gradient"></div>
        <div class="legend-lbls" id="legend-labels">
          <span id="legend-min">0.0 (Soil)</span>
          <span id="legend-max">1.0 (Dense Canopy)</span>
        </div>
      </div>

      <!-- Bottom Analytics Panel -->
      <div class="map-overlay-widget analytics-panel-overlay">
        <div class="panel-flex">
          <div class="panel-chart-container">
            <canvas id="trendChart"></canvas>
          </div>
          <div class="panel-stat-container">
            <div class="mini-stat">
              <span class="mini-stat-lbl">Canopy Density (NDVI)</span>
              <span class="mini-stat-val" id="mini-ndvi">0.78</span>
            </div>
            <div class="mini-stat">
              <span class="mini-stat-lbl">Soil Moisture (Est)</span>
              <span class="mini-stat-val" id="mini-moisture">62%</span>
            </div>
            <div class="mini-stat">
              <span class="mini-stat-lbl">Est Palm Yield</span>
              <span class="mini-stat-val" id="mini-yield">24.5 t/ha</span>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  </div>

  <script>
    // Injected variables from python
    const centerLat = {lat:.6f};
    const centerLon = {lon:.6f};
    const searchAreaGeo = {summary_json};
    const realLayers = {layer_json};
    const s1List = {s1_json};
    const s2List = {s2_json};
    const searchAreaName = "{html.escape(place)}";

    // Presets in Malaysia
    const presets = [
      {{ name: "Sungkai, Perak", lat: 3.882036, lon: 100.903912, desc: "Perak Palm Cultivation" }},
      {{ name: "Kluang, Johor", lat: 1.921389, lon: 103.372500, desc: "Johor Palm Plantation" }},
      {{ name: "Muadzam Shah, Pahang", lat: 3.250000, lon: 102.500000, desc: "Pahang Palm Delineation" }},
      {{ name: "Lahad Datu, Sabah", lat: 5.500000, lon: 118.000000, desc: "Sabah Palm Logging & Growth" }}
    ];

    // Initialize map
    const map = L.map('map', {{ zoomControl: false }}).setView([centerLat, centerLon], 11);
    L.control.zoom({{ position: 'topleft' }}).addTo(map);

    // Tile layers
    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }}).addTo(map);

    const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}', {{
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }});

    // Draw search area polygon
    const searchAreaLayer = L.geoJSON(searchAreaGeo, {{
      style: {{ color: '#0ca678', weight: 2, fillOpacity: 0.04 }}
    }}).addTo(map);

    // Pin marker for active selection
    let pickerMarker = L.marker([centerLat, centerLon]).addTo(map).bindPopup("Center: " + searchAreaName);
    
    // Footprint rendering layer
    const productFootprintLayer = L.geoJSON(null, {{
      style: {{ color: '#3b82f6', weight: 2, fillOpacity: 0.03 }}
    }}).addTo(map);

    map.fitBounds(searchAreaLayer.getBounds(), {{ padding: [24, 24] }});

    // Dynamic tile overlays
    let activeSentinelLayer = null;
    let selectedSentinel2ItemId = realLayers.sentinel2 ? realLayers.sentinel2.item_id : null;
    let selectedSentinel1ItemId = realLayers.sentinel1 ? realLayers.sentinel1.item_id : null;
    let currentLayerType = 'visual'; // visual, false_color, ndvi, vv, vh, none

    // Set base map
    function setBaseMap(type) {{
      document.getElementById('base-osm').classList.remove('active');
      document.getElementById('base-sat').classList.remove('active');
      
      if (type === 'osm') {{
        map.removeLayer(satLayer);
        osmLayer.addTo(map);
        document.getElementById('base-osm').classList.add('active');
      }} else {{
        map.removeLayer(osmLayer);
        satLayer.addTo(map);
        document.getElementById('base-sat').classList.add('active');
      }}
    }}

    // Construct Planetary Computer Dynamic Tile URLs
    function getTileUrl(item_id, type) {{
      if (!item_id) return null;
      if (type === 'visual') {{
        return 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x?collection=sentinel-2-l2a&item=' + item_id + '&assets=visual';
      }}
      if (type === 'false_color') {{
        return 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x?collection=sentinel-2-l2a&item=' + item_id + '&assets=B08&assets=B04&assets=B03&expression=B08,B04,B03&rescale=0,3000';
      }}
      if (type === 'ndvi') {{
        return 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x?collection=sentinel-2-l2a&item=' + item_id + '&expression=(B08-B04)/(B08%2BB04)&rescale=-0.1,0.9&colormap_name=rdylgn';
      }}
      if (type === 'vv') {{
        return 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x?collection=sentinel-1-rtc&item=' + item_id + '&assets=vv&rescale=0,0.35&colormap_name=gray';
      }}
      if (type === 'vh') {{
        return 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x?collection=sentinel-1-rtc&item=' + item_id + '&assets=vh&rescale=0,0.08&colormap_name=viridis';
      }}
      return null;
    }}

    // Update active overlay layer
    function updateOverlay() {{
      if (activeSentinelLayer) {{
        map.removeLayer(activeSentinelLayer);
        activeSentinelLayer = null;
      }}
      
      let url = null;
      let label = "";
      
      if (currentLayerType === 'visual' || currentLayerType === 'false_color' || currentLayerType === 'ndvi') {{
        url = getTileUrl(selectedSentinel2ItemId, currentLayerType);
        label = "Sentinel-2 Optical Layer (" + currentLayerType.toUpperCase() + ")";
      }} else if (currentLayerType === 'vv' || currentLayerType === 'vh') {{
        url = getTileUrl(selectedSentinel1ItemId, currentLayerType);
        label = "Sentinel-1 Radar Layer (" + currentLayerType.toUpperCase() + ")";
      }}

      // Set legend panels
      const legendPanel = document.getElementById('legend-panel');
      const legendTitle = document.getElementById('legend-title');
      const legendGrad = document.getElementById('legend-gradient');
      const legendMin = document.getElementById('legend-min');
      const legendMax = document.getElementById('legend-max');

      if (currentLayerType === 'ndvi') {{
        legendPanel.style.display = 'block';
        legendTitle.innerText = "NDVI Crop Health Index";
        legendGrad.className = "legend-bar-gradient";
        legendMin.innerText = "-0.1 (Soil/Water)";
        legendMax.innerText = "0.9 (Dense Canopy)";
      }} else if (currentLayerType === 'vv') {{
        legendPanel.style.display = 'block';
        legendTitle.innerText = "VV Radar Backscatter";
        legendGrad.className = "legend-bar-gradient radar";
        legendMin.innerText = "Low Reflection (Smooth)";
        legendMax.innerText = "High Reflection (Rough)";
      }} else if (currentLayerType === 'vh') {{
        legendPanel.style.display = 'block';
        legendTitle.innerText = "VH Radar Volume Scattering";
        legendGrad.className = "legend-bar-gradient"; // Viridis
        legendGrad.style.background = "linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)";
        legendMin.innerText = "Low Volume (Ground)";
        legendMax.innerText = "High Volume (Canopy)";
      }} else {{
        legendPanel.style.display = 'none';
      }}

      if (url) {{
        activeSentinelLayer = L.tileLayer(url, {{
          maxZoom: 24,
          attribution: 'Sentinel via Microsoft Planetary Computer'
        }});
        activeSentinelLayer.addTo(map);
        showToast("Loaded: " + label);
      }} else if (currentLayerType !== 'none') {{
        showToast("No active Sentinel imagery item loaded for this layer.");
      }}
    }}

    // Switch between Sentinel overlay options
    function setSentinelLayerType(type) {{
      const rows = document.querySelectorAll('#sentinel-layer-list .layer-row');
      rows.forEach(r => r.classList.remove('active'));
      
      // Find row matching type
      const mapping = {{
        'visual': 0, 'false_color': 1, 'ndvi': 2, 'vv': 3, 'vh': 4, 'none': 5
      }};
      if (rows[mapping[type]]) {{
        rows[mapping[type]].classList.add('active');
      }}
      currentLayerType = type;
      updateOverlay();
    }}

    // Helper: Toast alerts
    function showToast(msg) {{
      const toast = document.getElementById('app-toast');
      document.getElementById('toast-text').innerText = msg;
      toast.classList.add('active');
      setTimeout(() => {{
        toast.classList.remove('active');
      }}, 3500);
    }}

    // Preset navigation
    function applyPreset(index) {{
      const preset = presets[index];
      if (!preset) return;
      
      map.setView([preset.lat, preset.lon], 12);
      
      pickerMarker.setLatLng([preset.lat, preset.lon]);
      pickerMarker.bindPopup("Preset: " + preset.name).openPopup();
      
      document.getElementById('lat-lbl').innerText = preset.lat.toFixed(6);
      document.getElementById('lon-lbl').innerText = preset.lon.toFixed(6);
      document.getElementById('area-name-lbl').innerText = preset.name;
      
      showToast("Panned map to " + preset.name);
      
      // Trigger NPK Predictor automatically
      runDiagnostics(preset.lat, preset.lon);
    }}

    // Map Click Handler (Picker)
    map.on('click', function(e) {{
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      
      pickerMarker.setLatLng([lat, lon]);
      pickerMarker.bindPopup("Selected Point<br>Lat: " + lat.toFixed(5) + "<br>Lon: " + lon.toFixed(5)).openPopup();
      
      document.getElementById('lat-lbl').innerText = lat.toFixed(6);
      document.getElementById('lon-lbl').innerText = lon.toFixed(6);
      document.getElementById('area-name-lbl').innerText = "Selected Coordinate";
      
      runDiagnostics(lat, lon);
    }});

    // Helper: Deterministic Pseudo-Random Seed
    function getNutrientPrediction(lat, lon) {{
      const seed = Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453;
      const rand = () => {{
        const x = Math.sin(seed + Math.random() * 0.0001) * 1000;
        return x - Math.floor(x);
      }};
      
      // Simulate oil palm health indices
      const ndvi = 0.42 + (Math.sin(lat * 120) * Math.cos(lon * 120)) * 0.38;
      
      // N, P, K estimates based on canopy health (NDVI)
      const n = 1.6 + ndvi * 1.35 + (rand() * 0.15 - 0.075);
      const p = 0.09 + ndvi * 0.085 + (rand() * 0.012 - 0.006);
      const k = 0.6 + ndvi * 0.65 + (rand() * 0.12 - 0.06);
      const moisture = 38 + ndvi * 48 + (rand() * 8 - 4);
      
      return {{
        ndvi: Math.max(0.1, Math.min(0.95, ndvi)),
        n: Math.max(1.0, Math.min(3.5, n)),
        p: Math.max(0.04, Math.min(0.24, p)),
        k: Math.max(0.35, Math.min(1.75, k)),
        moisture: Math.max(10, Math.min(99, moisture))
      }};
    }}

    // NPK Charts & Gauges Manager
    let radarChart = null;
    function runDiagnostics(lat, lon) {{
      document.getElementById('npk-placeholder').style.display = 'none';
      document.getElementById('npk-results').style.display = 'flex';
      document.getElementById('predict-coord-lbl').innerText = "Diagnostics (" + lat.toFixed(4) + ", " + lon.toFixed(4) + ")";
      
      const pred = getNutrientPrediction(lat, lon);
      
      // Update values
      document.getElementById('n-val').innerText = pred.n.toFixed(2) + "%";
      document.getElementById('p-val').innerText = pred.p.toFixed(3) + "%";
      document.getElementById('k-val').innerText = pred.k.toFixed(2) + "%";
      
      // Update progress bars (relative to visual range: N: [1, 3.5], P: [0.04, 0.24], K: [0.35, 1.75])
      const pctN = ((pred.n - 1.0) / (3.5 - 1.0)) * 100;
      const pctP = ((pred.p - 0.04) / (0.24 - 0.04)) * 100;
      const pctK = ((pred.k - 0.35) / (1.75 - 0.35)) * 100;
      
      document.getElementById('n-fill').style.width = Math.max(5, Math.min(100, pctN)) + "%";
      document.getElementById('p-fill').style.width = Math.max(5, Math.min(100, pctP)) + "%";
      document.getElementById('k-fill').style.width = Math.max(5, Math.min(100, pctK)) + "%";

      // Assessment conditions
      const badge = document.getElementById('health-badge');
      const prescription = document.getElementById('prescription-txt');
      
      badge.className = "status-pill";
      
      if (pred.n < 2.3) {{
        badge.innerText = "Nitrogen Deficient";
        badge.classList.add('alert');
        prescription.innerHTML = "<strong>Prescription:</strong> Nitrogen levels are critical for frond production. Apply <strong>1.5kg Urea</strong> or Ammonium Sulfate per tree. Re-evaluate in 30 days.";
      }} else if (pred.k < 0.8) {{
        badge.innerText = "Potassium Deficient";
        badge.classList.add('warning');
        prescription.innerHTML = "<strong>Prescription:</strong> Potassium deficiency identified (reduces bunch weight). Apply <strong>2.0kg Muriate of Potash (MOP)</strong> per palm tree immediately.";
      }} else if (pred.p < 0.14) {{
        badge.innerText = "Phosphorus Deficient";
        badge.classList.add('warning');
        prescription.innerHTML = "<strong>Prescription:</strong> Low phosphorus limits oil synthesis. Apply <strong>1.0kg Christmas Island Rock Phosphate (CIRP)</strong> to stimulate root absorption.";
      }} else {{
        badge.innerText = "Optimal Crop health";
        badge.classList.add('optimal');
        prescription.innerHTML = "<strong>Status:</strong> Palm canopy nutrition balanced. Maintain standard maintenance dosage of compound fertilizer (<strong>NPK 12:12:17:2</strong>) at 2.5kg per tree twice annually.";
      }}

      // Update mini dashboard overlay widgets
      document.getElementById('mini-ndvi').innerText = pred.ndvi.toFixed(2);
      document.getElementById('mini-moisture').innerText = Math.round(pred.moisture) + "%";
      document.getElementById('mini-yield').innerText = (12.0 + pred.ndvi * 16.0).toFixed(1) + " t/ha";

      // Update radar chart
      updateRadarChart(pred);
      
      // Update line trend chart (simulated crop trend for this spot)
      updateTrendChart(pred.ndvi);
    }}

    // NPK Radar Chart Builder
    function updateRadarChart(pred) {{
      const ctx = document.getElementById('radarChart').getContext('2d');
      
      // Target thresholds
      const targetN = 2.5; 
      const targetP = 0.15;
      const targetK = 1.1;
      const targetMoisture = 60.0;
      
      // Scale variables to 0-100 range for display
      const dataValues = [
        (pred.n / targetN) * 100,
        (pred.p / targetP) * 100,
        (pred.k / targetK) * 100,
        (pred.moisture / targetMoisture) * 100,
        pred.ndvi * 100
      ];

      if (radarChart) {{
        radarChart.destroy();
      }}

      radarChart = new Chart(ctx, {{
        type: 'radar',
        data: {{
          labels: ['Nitrogen (N)', 'Phosphorus (P)', 'Potassium (K)', 'Moisture', 'Canopy Density'],
          datasets: [{{
            label: 'Actual Concentration (%)',
            data: dataValues,
            backgroundColor: 'rgba(12, 166, 120, 0.2)',
            borderColor: '#0ca678',
            pointBackgroundColor: '#12b886',
            borderWidth: 2
          }}, {{
            label: 'Optimal Threshold (100%)',
            data: [100, 100, 100, 100, 80],
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderColor: 'rgba(255, 255, 255, 0.3)',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0
          }}]
        }},
        options: {{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {{
            legend: {{ display: false }}
          }},
          scales: {{
            r: {{
              grid: {{ color: 'rgba(255, 255, 255, 0.08)' }},
              angleLines: {{ color: 'rgba(255, 255, 255, 0.08)' }},
              ticks: {{ display: false }},
              pointLabels: {{
                color: '#9ca3af',
                font: {{ size: 9, family: 'Inter' }}
              }},
              suggestedMin: 0,
              suggestedMax: 150
            }}
          }}
        }}
      }});
    }}

    // Bottom Line Trend Chart Builder (Time series simulation)
    let trendChart = null;
    function updateTrendChart(baseNdvi) {{
      const ctx = document.getElementById('trendChart').getContext('2d');
      
      // Generate simulated weekly NDVI values for the last 12 weeks
      const labels = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8', 'Wk 9', 'Wk 10', 'Wk 11', 'Wk 12'];
      const data = [];
      for(let i=0; i<12; i++) {{
        const variance = Math.sin(i * 0.5) * 0.04 + (Math.cos(i) * 0.02);
        data.push(Math.max(0.1, Math.min(1.0, baseNdvi + variance)));
      }}

      if (trendChart) {{
        trendChart.destroy();
      }}

      trendChart = new Chart(ctx, {{
        type: 'line',
        data: {{
          labels: labels,
          datasets: [{{
            label: 'Canopy Density Trend (NDVI)',
            data: data,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.06)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#3b82f6'
          }}]
        }},
        options: {{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {{
            legend: {{ display: false }}
          }},
          scales: {{
            x: {{
              grid: {{ display: false }},
              ticks: {{ color: '#9ca3af', font: {{ size: 8 }} }}
            }},
            y: {{
              grid: {{ color: 'rgba(255, 255, 255, 0.05)' }},
              ticks: {{ color: '#9ca3af', font: {{ size: 8 }} }},
              min: 0.0,
              max: 1.0
            }}
          }}
        }}
      }});
    }}

    // Extract quicklook URLs (mirrors Python logic in JS)
    function getQuicklookUrl(product) {{
      const assets = product.Assets || [];
      for (const asset of assets) {{
        const name = String(asset.Name || "").toLowerCase();
        const contentType = String(asset.ContentType || "").toLowerCase();
        if (name.includes("quicklook") || contentType.startsWith("image/")) {{
          return asset.DownloadLink || (asset.Id ? 'https://catalogue.dataspace.copernicus.eu/odata/v1/Assets(' + asset.Id + ')/$value' : null);
        }}
      }}
      return null;
    }}

    // Strips names to map Copernicus to Planetary Computer item IDs
    function cleanProductName(name, type) {{
      if (type === 's2') {{
        // strip .SAFE and processor version _NXXXX_
        return name.replace(/\.safe$/i, '').replace(/_N\d{{4}}_/, '_');
      }} else {{
        // strip .SAFE and replace check-sum e.g. _0D17 with _rtc
        return name.replace(/\.safe$/i, '').replace(/_[a-fA-F0-9]{{4}}$/, '_rtc');
      }}
    }}

    // Build Sentinel Feed in Sidebar
    function buildSentinelFeed() {{
      const container = document.getElementById('feed-list');
      container.innerHTML = "";
      
      const allProducts = [];
      s2List.forEach(p => allProducts.push({{ ...p, type: 's2' }}));
      s1List.forEach(p => allProducts.push({{ ...p, type: 's1' }}));
      
      // Sort desc by date
      allProducts.sort((a, b) => {{
        const dateA = new Date((a.ContentDate || {{}}).Start || "");
        const dateB = new Date((b.ContentDate || {{}}).Start || "");
        return dateB - dateA;
      }});
      
      if (allProducts.length === 0) {{
        container.innerHTML = "<p style='font-size:11px;color:var(--text-muted);text-align:center;'>No products found.</p>";
        return;
      }}
      
      allProducts.forEach((p, idx) => {{
        const card = document.createElement('div');
        card.className = "feed-card";
        if (idx === 0) card.classList.add('active'); // highlight latest
        
        const ql = getQuicklookUrl(p);
        const thumbHtml = ql 
          ? '<img src="' + ql + '" alt="Quicklook" loading="lazy">'
          : '<div class="feed-thumb-err">No QL Asset</div>';
          
        const title = p.Name || "Product";
        const date = new Date((p.ContentDate || {{}}).Start || "").toLocaleDateString();
        const typeBadge = p.type === 's2' 
          ? '<span class="feed-badge s2">Sentinel-2</span>' 
          : '<span class="feed-badge s1">Sentinel-1</span>';
          
        card.innerHTML = `
          <div class="feed-thumb">${{thumbHtml}}</div>
          <div class="feed-details">
            <div class="feed-name" title="${{title}}">${{title}}</div>
            <div class="feed-sub">
              <span class="feed-date">${{date}}</span>
              ${{typeBadge}}
            </div>
          </div>
        `;
        
        card.addEventListener('click', () => {{
          document.querySelectorAll('.feed-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          
          // Show footprint on map
          if (p.GeoFootprint) {{
            productFootprintLayer.clearLayers();
            productFootprintLayer.addData({{ type: 'Feature', geometry: p.GeoFootprint, properties: {{}} }});
            map.fitBounds(productFootprintLayer.getBounds(), {{ padding: [24, 24] }});
            showToast("Showing footprint bounding box");
          }}
          
          // Switch PC layers to this specific item
          const pcId = cleanProductName(p.Name, p.type);
          if (p.type === 's2') {{
            selectedSentinel2ItemId = pcId;
            showToast("Switched active Sentinel-2 item: " + pcId);
            // If currently viewing radar layer, auto-switch to visual to show the selection
            if (currentLayerType === 'vv' || currentLayerType === 'vh') {{
              setSentinelLayerType('visual');
            }} else {{
              updateOverlay();
            }}
          }} else {{
            selectedSentinel1ItemId = pcId;
            showToast("Switched active Sentinel-1 item: " + pcId);
            // Auto-switch to radar VV layer
            if (currentLayerType !== 'vv' && currentLayerType !== 'vh') {{
              setSentinelLayerType('vv');
            }} else {{
              updateOverlay();
            }}
          }}
        }});
        
        container.appendChild(card);
      }});
    }}

    // Run when document is loaded
    document.addEventListener("DOMContentLoaded", () => {{
      lucide.createIcons();
      buildSentinelFeed();
      
      // Trigger default coordinate diagnostics
      runDiagnostics(centerLat, centerLon);
      updateOverlay();
    }});
  </script>
</body>
</html>
"""
    output.write_text(html_text, encoding="utf-8")



def authenticate(username: str | None, password: str | None) -> str:
    username = username or os.environ.get("CDSE_USERNAME") or input("CDSE username: ")
    password = password or os.environ.get("CDSE_PASSWORD") or getpass.getpass("CDSE password: ")
    token = post_form(
        IDENTITY_URL,
        {
            "client_id": "cdse-public",
            "grant_type": "password",
            "username": username,
            "password": password,
        },
    )
    return token["access_token"]


def download_product(product_id: str, output_dir: Path, username: str | None, password: str | None) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    access_token = authenticate(username, password)
    url = f"{DOWNLOAD_URL}({product_id})/$value"
    req = Request(url, headers={"Authorization": f"Bearer {access_token}"})
    out_path = output_dir / f"{product_id}.zip"
    with urlopen(req, timeout=120) as response, out_path.open("wb") as file:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            file.write(chunk)
    return out_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Find and view Sentinel-1/2 data over a Malaysia location.")
    parser.add_argument("--lat", type=float, default=DEFAULT_LAT, help="Latitude. Default: Kuala Lumpur.")
    parser.add_argument("--lon", type=float, default=DEFAULT_LON, help="Longitude. Default: Kuala Lumpur.")
    parser.add_argument("--place", default=DEFAULT_PLACE, help="Name shown in the HTML viewer.")
    parser.add_argument("--radius-km", type=float, default=10.0, help="Search radius around the point.")
    parser.add_argument("--start", default="2026-01-01", help="Start date, YYYY-MM-DD.")
    parser.add_argument("--end", default="2026-05-25", help="End date, YYYY-MM-DD.")
    parser.add_argument("--limit", type=int, default=8, help="Products per Sentinel mission.")
    parser.add_argument("--s1-type", default="IW_GRDH_1S", help="Sentinel-1 product type.")
    parser.add_argument("--s2-type", default="S2MSI2A", help="Sentinel-2 product type.")
    parser.add_argument("--max-cloud", type=float, default=40.0, help="Maximum Sentinel-2 cloud cover percent.")
    parser.add_argument("--output", default="sentinel_earthviewer.html", help="HTML file to create.")
    parser.add_argument("--no-open", action="store_true", help="Create the HTML but do not open it.")
    parser.add_argument("--download", help="Optional product ID to download after authenticating with CDSE.")
    parser.add_argument("--download-dir", default="downloads", help="Folder for --download output.")
    parser.add_argument("--username", help="CDSE username for --download. Can also use CDSE_USERNAME.")
    parser.add_argument("--password", help="CDSE password for --download. Can also use CDSE_PASSWORD.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.download:
        path = download_product(args.download, Path(args.download_dir), args.username, args.password)
        print(f"Downloaded product to {path.resolve()}")
        return 0

    bbox = make_bbox(args.lon, args.lat, args.radius_km)
    wkt = bbox_to_wkt(bbox)

    print("Searching Copernicus Data Space catalogue...")
    print(f"AOI: {args.place} ({args.lat:.5f}, {args.lon:.5f}), radius {args.radius_km} km")
    s2 = search_products("SENTINEL-2", args.s2_type, wkt, args.start, args.end, args.limit)
    s1 = search_products("SENTINEL-1", args.s1_type, wkt, args.start, args.end, args.limit)
    print("Searching real renderable Sentinel imagery...")
    real_layers = search_real_imagery(bbox, args.start, args.end, args.max_cloud)

    output = Path(args.output)
    build_html(output, args.place, args.lat, args.lon, bbox, args.start, args.end, s1, s2, real_layers)

    resolved = output.resolve()
    print(f"Found {len(s2)} Sentinel-2 products and {len(s1)} Sentinel-1 products.")
    print(f"Viewer written to {resolved}")
    if not args.no_open:
        webbrowser.open(resolved.as_uri())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
