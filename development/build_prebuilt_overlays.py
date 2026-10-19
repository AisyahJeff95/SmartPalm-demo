#!/usr/bin/env python3
"""
Build prebuilt nutrient overlays for the dashboard from a prediction folder.

For each estate it reads the 10m GeoTIFFs (N, P, K, Mg, Ca, B), clips them to
the estate boundary and writes an individual JS file defining:
  - RASTER_OVERLAYS_<SUFFIX>  : {nut: {dataUrl, bounds}}            (map layer + Full Map popup)
  - RASTER_GRID_DATA_<SUFFIX> : {nut: {bounds, width, height, data}} (click-to-sample values)
  - <SUFFIX>_PREDICTION_META  : prediction_summary.json contents
  - <SUFFIX>_MAP_DATA         : GeoJSON FeatureCollection for this estate's blocks

Colour classes are identical to training_v3/predict_nutrients.py (verified at
runtime), so prebuilt layers look the same as a live "Run Prediction".

Usage:
  python3 development/build_prebuilt_overlays.py                 # all estates
  python3 development/build_prebuilt_overlays.py agathis         # single estate
  python3 development/build_prebuilt_overlays.py seraya
  python3 development/build_prebuilt_overlays.py ppptar
"""
import os
import sys
import io
import json
import base64

import numpy as np
import rasterio
from rasterio.features import geometry_mask
import shapefile
import pyproj
import pandas as pd
from PIL import Image
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

DEV_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(DEV_DIR)
TRAINING_V3_DIR = os.path.join(ROOT_DIR, "training_v3")

ESTATES = {
    "sekinchan": {
        "display_name": "Sekinchan 1 Poly",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "predictions_sekinchan1poly_2026-10-09_130535"),
        "shp": os.path.join(DEV_DIR, "boundaries", "sekinchan1poly.shp"),
        "out_js": os.path.join(DEV_DIR, "js", "sekinchan1poly_raster_overlays.js"),
        "suffix": "SEKINCHAN",
    },
    "ppptar": {
        "display_name": "Ladang PPPTAR",
        "pred_dir": os.path.join(ROOT_DIR, "training_v2", "predictions_Ladang_PPPTAR_2026-10-06_130811"),
        "shp": os.path.join(DEV_DIR, "boundaries", "Ladang PPPTAR.shp"),
        "out_js": os.path.join(DEV_DIR, "js", "ppptar_raster_overlays.js"),
        "suffix": "PPPTAR",
    },
    "agathis": {
        "display_name": "Agathis",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_AGATHIS_2026-10-07_172821"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "northern", "agathis", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_AGATHIS_2026-10-07_172821", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "agathis_raster_overlays.js"),
        "suffix": "AGATHIS",
        "center": [4.7290, 117.5206],
        "name_field": "No_Block",
    },
    "belian": {
        "display_name": "Belian",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_BELIAN_2026-10-07_174047"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "northern", "belian", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_BELIAN_2026-10-07_174047", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "belian_raster_overlays.js"),
        "suffix": "BELIAN",
        "center": [4.6558, 117.4987],
        "name_field": "No_Block",
    },
    "binuang": {
        "display_name": "Binuang",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_binuang_2026-10-07_175017"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "northern", "binuang", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_binuang_2026-10-07_175017", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "binuang_raster_overlays.js"),
        "suffix": "BINUANG",
        "center": [4.7068, 117.4710],
        "name_field": "No_Block",
    },
    "gaharu": {
        "display_name": "Gaharu",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_gaharu_2026-10-07_175726"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "southern", "gaharu", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_gaharu_2026-10-07_175726", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "gaharu_raster_overlays.js"),
        "suffix": "GAHARU",
        "center": [4.6056, 117.5274],
        "name_field": "Block_No",
    },
    "kapur": {
        "display_name": "Kapur",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_kapur_2026-10-07_180414"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "northern", "kapur", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_kapur_2026-10-07_180414", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "kapur_raster_overlays.js"),
        "suffix": "KAPUR",
        "center": [4.7556, 117.4674],
        "name_field": "Block_No",
    },
    "keruing": {
        "display_name": "Keruing",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_keruing_2026-10-07_193029"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "southern", "keruing", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_keruing_2026-10-07_193029", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "keruing_raster_overlays.js"),
        "suffix": "KERUING",
        "center": [4.5778, 117.6377],
        "name_field": "No_Block",
    },
    "menggaris": {
        "display_name": "Menggaris",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_menggaris_2026-10-07_191737"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "southern", "menggaris", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_menggaris_2026-10-07_191737", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "menggaris_raster_overlays.js"),
        "suffix": "MENGGARIS",
        "center": [4.6756, 117.6277],
        "name_field": "Block",
    },
    "merbau": {
        "display_name": "Merbau",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_merbau_2026-10-07_194557"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "southern", "merbau", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_merbau_2026-10-07_194557", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "merbau_raster_overlays.js"),
        "suffix": "MERBAU",
        "center": [4.6290, 117.6207],
        "name_field": "No_Block",
    },
    "ramin": {
        "display_name": "Ramin",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_ramin_2026-10-07_195112"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "northern", "ramin", "Blok Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_ramin_2026-10-07_195112", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "ramin_raster_overlays.js"),
        "suffix": "RAMIN",
        "center": [4.7157, 117.4078],
        "name_field": "No_Block",
    },
    "selanganbatu": {
        "display_name": "Selangan Batu",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_selanganbatu_2026-10-07_200218"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "northern", "selanganbatu", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_selanganbatu_2026-10-07_200218", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "selanganbatu_raster_overlays.js"),
        "suffix": "SELANGANBATU",
        "center": [4.6524, 117.4566],
        "name_field": "No_Block",
    },
    "seraya": {
        "display_name": "Seraya",
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_Seraya_with_Block_Boundary_2026-10-07_160800"),
        "shp": os.path.join(ROOT_DIR, "BENTASPATIAL", "southern", "seraya", "Block Boundary.shp"),
        "csv": os.path.join(ROOT_DIR, "training_v3", "2026", "predictions_Seraya_with_Block_Boundary_2026-10-07_160800", "predicted_nutrients_by_block.csv"),
        "out_js": os.path.join(DEV_DIR, "js", "seraya_raster_overlays.js"),
        "suffix": "SERAYA",
        "center": [4.6041, 117.5854],
        "name_field": "Block_No",
    },
}

NUTRIENTS = ["N", "P", "K", "Mg", "Ca", "B"]
BREAKS = {
    "N":  [2.10, 2.30, 2.50, 2.70, 2.90],
    "P":  [0.120, 0.135, 0.150, 0.165, 0.180],
    "K":  [0.70, 0.85, 1.00, 1.15, 1.30],
    "Mg": [0.20, 0.22, 0.24, 0.26, 0.28],
    "Ca": [0.40, 0.50, 0.60, 0.75, 0.90],
    "B":  [10.0, 15.0, 20.0, 30.0, 40.0],
}
PALETTE = np.array([
    [255, 0, 0, 255],     # red
    [255, 153, 0, 255],   # orange
    [255, 255, 0, 255],   # yellow
    [0, 220, 0, 255],     # green
    [0, 102, 255, 255],   # blue
    [153, 85, 34, 255],   # brown
], dtype=np.uint8)

MAX_PNG_SIDE = 2000      # keep overlay PNGs a sensible size
MAX_GRID_CELLS = 30_000   # keep click-sampling grids snappy in browser

TRANSFORMER_29873 = pyproj.Transformer.from_crs('EPSG:29873', 'EPSG:4326', always_xy=True)


def verify_palette_matches_pipeline():
    """Guard against drift from training_v3/predict_nutrients.py colour rules."""
    sys.path.insert(0, TRAINING_V3_DIR)
    try:
        from predict_nutrients import COLOR_FUNCS
    except Exception as exc:  # pipeline deps missing: skip check, keep going
        print(f"  (skipping palette check: {exc})")
        return
    for nut in NUTRIENTS:
        b = BREAKS[nut]
        probes = [b[0] * 0.5, *b, *[(b[i] + b[i + 1]) / 2 for i in range(4)], b[-1] * 1.5]
        for v in probes:
            idx = int(np.searchsorted(b, v, side="left"))
            assert list(PALETTE[idx]) == list(COLOR_FUNCS[nut](v)), f"palette mismatch {nut}={v}"


def reproject_geom_obj(geom):
    t = geom['type']
    coords = geom['coordinates']
    if t == 'Polygon':
        new_coords = [[TRANSFORMER_29873.transform(x, y) for x, y in ring] for ring in coords]
    elif t == 'MultiPolygon':
        new_coords = [[[TRANSFORMER_29873.transform(x, y) for x, y in ring] for ring in poly] for poly in coords]
    else:
        return None
    return shape({'type': t, 'coordinates': new_coords}).buffer(0)


def reproject_geojson_dict(geom):
    t = geom['type']
    coords = geom['coordinates']
    if t == 'Polygon':
        new_coords = [[[round(c[0], 6), round(c[1], 6)] for c in [TRANSFORMER_29873.transform(x, y) for x, y in ring]] for ring in coords]
    elif t == 'MultiPolygon':
        new_coords = [[[[round(c[0], 6), round(c[1], 6)] for c in [TRANSFORMER_29873.transform(x, y) for x, y in ring]] for ring in poly] for poly in coords]
    else:
        return None
    return {'type': t, 'coordinates': new_coords}


def load_boundary(shp_path):
    with shapefile.Reader(shp_path) as sf:
        bbox = sf.bbox
        is_proj = abs(bbox[0]) > 180 or abs(bbox[1]) > 90
        geoms = []
        for s in sf.shapes():
            if not s.points:
                continue
            if is_proj:
                g = reproject_geom_obj(s.__geo_interface__)
            else:
                g = shape(s.__geo_interface__).buffer(0)
            if g and g.is_valid and not g.is_empty:
                geoms.append(g)
    return unary_union(geoms)


def build_geojson(shp_path, csv_path, display_name, name_field):
    with shapefile.Reader(shp_path) as sf:
        fields = [f[0] for f in sf.fields[1:]]
        shapes_list = sf.shapes()
        records_list = sf.records()
        bbox = sf.bbox
        is_projected = abs(bbox[0]) > 180 or abs(bbox[1]) > 90

    df = pd.read_csv(csv_path) if csv_path and os.path.isfile(csv_path) else None

    features = []
    for idx, (s, rec) in enumerate(zip(shapes_list, records_list)):
        if is_projected:
            geom_wgs = reproject_geojson_dict(s.__geo_interface__)
        else:
            geom_wgs = s.__geo_interface__
        if not geom_wgs:
            continue

        props = dict(zip(fields, rec))
        clean_props = {}
        for k, v in props.items():
            if isinstance(v, str): clean_props[k] = v.strip()
            elif isinstance(v, float) and np.isnan(v): clean_props[k] = None
            else: clean_props[k] = v

        raw_name = clean_props.get(name_field) or clean_props.get('Block') or clean_props.get('No_Block') or clean_props.get('Block_No') or f'Block {idx+1}'
        clean_props['name'] = str(raw_name)

        if df is not None and idx < len(df):
            row = df.iloc[idx]
            for nut in ['N', 'P', 'K', 'Mg', 'Ca', 'B']:
                if f'{nut}_mean' in row:
                    val = round(float(row[f'{nut}_mean']), 3)
                    clean_props[f'{nut}_mean'] = val
                    clean_props[nut.lower()] = val
            if 'Area_Ha' not in clean_props and 'Luas_Gis' in clean_props:
                clean_props['Area_Ha'] = round(float(clean_props['Luas_Gis']), 2)

        features.append({
            'type': 'Feature',
            'geometry': geom_wgs,
            'properties': clean_props
        })

    return {'type': 'FeatureCollection', 'mapName': display_name, 'features': features}


def build(estate_key, pred_dir=None):
    cfg = ESTATES[estate_key]
    pred_dir = pred_dir or cfg["pred_dir"]
    if not os.path.isdir(pred_dir):
        sys.exit(f"Prediction folder not found: {pred_dir}")
    print(f"\n▶ {estate_key}: {os.path.relpath(pred_dir, ROOT_DIR)}")

    boundary = load_boundary(cfg["shp"])
    overlays, grids = {}, {}

    for nut in NUTRIENTS:
        with rasterio.open(os.path.join(pred_dir, f"{nut}_nutrient_10m.tif")) as src:
            arr = src.read(1).astype(np.float64)
            nodata = src.nodata
            b = src.bounds
            h, w = arr.shape
            inside = geometry_mask([mapping(boundary)], out_shape=(h, w),
                                   transform=src.transform, invert=True)

        valid = np.isfinite(arr) & (arr > 0) & inside
        if nodata is not None:
            valid &= arr != nodata

        # Colour image (same classes as the live pipeline)
        idx = np.searchsorted(BREAKS[nut], np.where(valid, arr, 0), side="left")
        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        rgba[valid] = PALETTE[idx[valid]]

        up = max(1, min(4, MAX_PNG_SIDE // max(w, h)))
        img = Image.fromarray(rgba).resize((w * up, h * up), Image.Resampling.NEAREST)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        overlays[nut] = {
            "dataUrl": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"),
            "bounds": [[b.bottom, b.left], [b.top, b.right]],
        }

        # Value grid for click sampling (subsampled for snappy browser response)
        step = 1
        while (h // step) * (w // step) > MAX_GRID_CELLS:
            step += 1
        sub = np.where(valid, np.round(arr, 3), -9999)[::step, ::step]
        grids[nut] = {
            "bounds": {"left": b.left, "bottom": b.bottom, "right": b.right, "top": b.top},
            "width": int(sub.shape[1]),
            "height": int(sub.shape[0]),
            "data": [[(-9999 if v == -9999 else round(float(v), 3)) for v in row] for row in sub],
        }

        vals = arr[valid]
        print(f"  ✓ {nut}: {w}x{h}px, {valid.sum()} px in boundary, mean={vals.mean():.3f}, "
              f"PNG x{up}, grid step {step} ({sub.shape[1]}x{sub.shape[0]})")

    meta_path = os.path.join(pred_dir, "prediction_summary.json")
    meta = json.load(open(meta_path)) if os.path.isfile(meta_path) else {}
    meta["prediction_folder"] = os.path.basename(pred_dir)

    geojson = None
    if "csv" in cfg:
        geojson = build_geojson(cfg["shp"], cfg["csv"], cfg.get("display_name", estate_key), cfg.get("name_field", "No_Block"))

    sfx = cfg["suffix"]
    js_lines = [
        "// AUTO-GENERATED by build_prebuilt_overlays.py — do not edit by hand",
        f"// Source: {os.path.relpath(pred_dir, ROOT_DIR)}",
        f"const {sfx}_PREDICTION_META = {json.dumps(meta)};",
        f"const RASTER_OVERLAYS_{sfx} = {json.dumps(overlays, separators=(',', ':'))};",
        f"const RASTER_GRID_DATA_{sfx} = {json.dumps(grids, separators=(',', ':'))};",
    ]
    if geojson:
        fc_str = json.dumps(geojson, separators=(',', ':'), ensure_ascii=False)
        js_lines.append(f"const {sfx}_MAP_DATA = {fc_str};")

    js_lines.extend([
        "if (typeof window !== 'undefined') {",
        f"    window.{sfx}_PREDICTION_META = {sfx}_PREDICTION_META;",
        f"    window.RASTER_OVERLAYS_{sfx} = RASTER_OVERLAYS_{sfx};",
        f"    window.RASTER_GRID_DATA_{sfx} = RASTER_GRID_DATA_{sfx};",
    ])
    if geojson:
        js_lines.extend([
            f"    window.{sfx}_MAP_DATA = {sfx}_MAP_DATA;",
            "    if (typeof REAL_MAPS_DATA !== 'undefined') {",
            f"        REAL_MAPS_DATA['{estate_key}'] = {sfx}_MAP_DATA;",
            "    }",
            "    if (typeof window.REAL_MAPS_DATA !== 'undefined') {",
            f"        window.REAL_MAPS_DATA['{estate_key}'] = {sfx}_MAP_DATA;",
            "    }",
        ])
    js_lines.append("}\n")

    with open(cfg["out_js"], "w", encoding="utf-8") as f:
        f.write("\n".join(js_lines))
    print(f"  ✅ Wrote {os.path.relpath(cfg['out_js'], ROOT_DIR)} ({os.path.getsize(cfg['out_js']) / 1024:.0f} KB)")

    return overlays, grids, meta, geojson


def main():
    verify_palette_matches_pipeline()
    args = sys.argv[1:]
    if not args:
        for key in ESTATES:
            build(key)
    else:
        key = args[0].lower()
        if key not in ESTATES:
            sys.exit(f"Unknown estate '{key}'. Choose from: {', '.join(ESTATES)}")
        build(key, args[1] if len(args) > 1 else None)


if __name__ == "__main__":
    main()
