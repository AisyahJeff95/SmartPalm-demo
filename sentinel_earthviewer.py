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
    layer_json = json.dumps(real_layers)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sentinel Viewer - {html.escape(place)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    :root {{
      color-scheme: light;
      --ink: #17202a;
      --muted: #5f6c7b;
      --line: #d6dde5;
      --surface: #f6f8fa;
      --accent: #087f5b;
    }}
    body {{
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: white;
    }}
    header {{
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }}
    h1 {{
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }}
    .meta {{
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 14px;
    }}
    .imagery-panel {{
      padding: 14px 24px;
      border-bottom: 1px solid var(--line);
      background: white;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }}
    .imagery-card {{
      border-left: 4px solid var(--accent);
      padding: 0 0 0 12px;
      min-width: 0;
    }}
    .imagery-card strong {{
      display: block;
      font-size: 14px;
      margin-bottom: 4px;
    }}
    .imagery-card span {{
      display: block;
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }}
    #map {{
      width: 100%;
      height: min(58vh, 560px);
      min-height: 360px;
      border-bottom: 1px solid var(--line);
    }}
    main {{
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px;
    }}
    section + section {{
      margin-top: 30px;
    }}
    h2 {{
      font-size: 18px;
      margin: 0 0 12px;
      letter-spacing: 0;
    }}
    .product {{
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 16px;
      padding: 14px 0;
      border-top: 1px solid var(--line);
    }}
    .preview {{
      width: 260px;
      aspect-ratio: 4 / 3;
      background: #e9eef3;
      display: grid;
      place-items: center;
      overflow: hidden;
    }}
    .preview img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}
    .missing {{
      color: var(--muted);
      font-size: 13px;
      padding: 10px;
      text-align: center;
    }}
    h3 {{
      margin: 0 0 10px;
      font-size: 15px;
      overflow-wrap: anywhere;
      letter-spacing: 0;
    }}
    dl {{
      display: grid;
      grid-template-columns: 86px 1fr;
      gap: 6px 12px;
      margin: 0 0 12px;
      font-size: 13px;
    }}
    dt {{
      color: var(--muted);
    }}
    dd {{
      margin: 0;
      overflow-wrap: anywhere;
    }}
    button {{
      border: 1px solid var(--accent);
      background: var(--accent);
      color: white;
      height: 32px;
      padding: 0 12px;
      font-size: 13px;
      cursor: pointer;
    }}
    @media (max-width: 720px) {{
      main {{ padding: 16px; }}
      .imagery-panel {{ grid-template-columns: 1fr; padding: 12px 16px; }}
      .product {{ grid-template-columns: 1fr; }}
      .preview {{ width: 100%; }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>Sentinel Viewer</h1>
    <div class="meta">
      <span>{html.escape(place)}</span>
      <span>Lat {lat:.5f}, Lon {lon:.5f}</span>
      <span>{html.escape(start)} to {html.escape(end)}</span>
      <span>{len(s1)} Sentinel-1, {len(s2)} Sentinel-2 products</span>
    </div>
  </header>
  <div class="imagery-panel" id="imagery-panel"></div>
  <div id="map"></div>
  <main>
    {product_rows(s2, "Sentinel-2 optical products")}
    {product_rows(s1, "Sentinel-1 radar products")}
  </main>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([{lat:.6f}, {lon:.6f}], 11);
    const streetMap = L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }});
    streetMap.addTo(map);

    const realLayers = {layer_json};
    const baseLayers = {{ 'OpenStreetMap': streetMap }};
    const overlayLayers = {{}};
    const panel = document.getElementById('imagery-panel');
    const layerEntries = [
      ['Sentinel-2 true color', realLayers.sentinel2],
      ['Sentinel-1 radar VV', realLayers.sentinel1],
    ];
    layerEntries.forEach(([label, info], index) => {{
      const card = document.createElement('div');
      card.className = 'imagery-card';
      if (info && info.tile_url) {{
        const layer = L.tileLayer(info.tile_url, {{
          maxZoom: 24,
          attribution: info.attribution || ''
        }});
        overlayLayers[label] = layer;
        if (index === 0) {{
          layer.addTo(map);
        }}
        const cloud = info.cloud_cover === null || info.cloud_cover === undefined
          ? ''
          : `Cloud cover: ${{Number(info.cloud_cover).toFixed(1)}}%`;
        card.innerHTML = `<strong>${{label}}</strong><span>${{info.datetime || 'Date unavailable'}}</span><span>${{cloud}}</span><span>${{info.item_id}}</span>`;
      }} else {{
        card.innerHTML = `<strong>${{label}}</strong><span>No renderable image found for this search.</span>`;
      }}
      panel.appendChild(card);
    }});
    L.control.layers(baseLayers, overlayLayers, {{ collapsed: false }}).addTo(map);

    const searchArea = {json.dumps(summary)};
    const searchLayer = L.geoJSON(searchArea, {{
      style: {{ color: '#087f5b', weight: 2, fillOpacity: 0.06 }}
    }}).addTo(map);
    L.marker([{lat:.6f}, {lon:.6f}]).addTo(map).bindPopup({json.dumps(place)});
    const productLayer = L.geoJSON(null, {{
      style: {{ color: '#d9480f', weight: 2, fillOpacity: 0.04 }}
    }}).addTo(map);
    map.fitBounds(searchLayer.getBounds(), {{ padding: [24, 24] }});

    document.querySelectorAll('.product').forEach((card) => {{
      const button = card.querySelector('.zoom');
      button.addEventListener('click', () => {{
        const footprint = JSON.parse(card.dataset.footprint);
        productLayer.clearLayers();
        if (footprint) {{
          productLayer.addData({{ type: 'Feature', geometry: footprint, properties: {{}} }});
          map.fitBounds(productLayer.getBounds(), {{ padding: [24, 24] }});
        }}
      }});
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
