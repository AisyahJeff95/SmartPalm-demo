#!/usr/bin/env python3
"""
Build prebuilt nutrient overlays for the dashboard from a prediction folder.

For each estate it reads the 10m GeoTIFFs (N, P, K, Mg, Ca, B), clips them to
the estate boundary and writes a JS file defining:
  - RASTER_OVERLAYS_<SUFFIX>  : {nut: {dataUrl, bounds}}            (map layer + Full Map popup)
  - RASTER_GRID_DATA_<SUFFIX> : {nut: {bounds, width, height, data}} (click-to-sample values)
  - <SUFFIX>_PREDICTION_META  : prediction_summary.json contents

Colour classes are identical to training_v3/predict_nutrients.py (verified at
runtime), so prebuilt layers look the same as a live "Run Prediction".

Usage:
  python3 development/build_prebuilt_overlays.py                 # all estates
  python3 development/build_prebuilt_overlays.py ppptar          # one estate
  python3 development/build_prebuilt_overlays.py sekinchan <prediction_folder>
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
from PIL import Image
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

DEV_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(DEV_DIR)
TRAINING_V3_DIR = os.path.join(ROOT_DIR, "training_v3")

ESTATES = {
    "sekinchan": {
        "pred_dir": os.path.join(ROOT_DIR, "training_v3", "predictions_sekinchan1poly_2026-10-09_130535"),
        "shp": os.path.join(DEV_DIR, "boundaries", "sekinchan1poly.shp"),
        "out_js": os.path.join(DEV_DIR, "js", "sekinchan1poly_raster_overlays.js"),
        "suffix": "SEKINCHAN",
    },
    "ppptar": {
        "pred_dir": os.path.join(ROOT_DIR, "training_v2", "predictions_Ladang_PPPTAR_2026-10-06_130811"),
        "shp": os.path.join(DEV_DIR, "boundaries", "Ladang PPPTAR.shp"),
        "out_js": os.path.join(DEV_DIR, "js", "ppptar_raster_overlays.js"),
        "suffix": "PPPTAR",
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
MAX_GRID_CELLS = 150_000  # keep click-sampling grids small enough for the browser


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


def load_boundary(shp_path):
    with shapefile.Reader(shp_path) as sf:
        geoms = [shape(s.__geo_interface__).buffer(0) for s in sf.shapes() if s.points]
    return unary_union(geoms)


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

        # Value grid for click sampling (subsampled for large estates)
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

    sfx = cfg["suffix"]
    js = (
        "// AUTO-GENERATED by build_prebuilt_overlays.py — do not edit by hand\n"
        f"// Source: {os.path.relpath(pred_dir, ROOT_DIR)}\n"
        f"const {sfx}_PREDICTION_META = {json.dumps(meta)};\n"
        f"const RASTER_OVERLAYS_{sfx} = {json.dumps(overlays, separators=(',', ':'))};\n"
        f"const RASTER_GRID_DATA_{sfx} = {json.dumps(grids, separators=(',', ':'))};\n"
        "if (typeof window !== 'undefined') {\n"
        f"    window.{sfx}_PREDICTION_META = {sfx}_PREDICTION_META;\n"
        f"    window.RASTER_OVERLAYS_{sfx} = RASTER_OVERLAYS_{sfx};\n"
        f"    window.RASTER_GRID_DATA_{sfx} = RASTER_GRID_DATA_{sfx};\n"
        "}\n"
    )
    with open(cfg["out_js"], "w") as f:
        f.write(js)
    print(f"  ✅ Wrote {os.path.relpath(cfg['out_js'], ROOT_DIR)} ({os.path.getsize(cfg['out_js']) / 1024:.0f} KB)")


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
