#!/usr/bin/env python3
"""
Generate pre-rendered RASTER_OVERLAYS for Ladang PPPTAR from 10m GeoTIFF rasters.
Matches exact MPOB nutrient thresholds for N, P, K, Mg.
Also exports RASTER_GRID_DATA_PPPTAR for exact 10m spatial point sampling.
"""

import os
import io
import json
import base64
import numpy as np
import rasterio
from PIL import Image

def get_color_n(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 2.10: return [227, 26, 28, 220]    # Red (Deficient)
    if val <= 2.30: return [245, 163, 64, 220]   # Orange (Moderate)
    if val <= 2.50: return [255, 240, 60, 220]   # Yellow (Slight)
    if val <= 2.70: return [85, 215, 65, 220]    # Green (Optimum)
    if val <= 2.90: return [30, 110, 230, 220]   # Blue (High)
    return [145, 90, 45, 220]                    # Brown (Excess)

def get_color_p(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.120: return [227, 26, 28, 220]
    if val <= 0.135: return [245, 163, 64, 220]
    if val <= 0.150: return [255, 240, 60, 220]
    if val <= 0.165: return [85, 215, 65, 220]
    if val <= 0.180: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

def get_color_k(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.70: return [227, 26, 28, 220]
    if val <= 0.85: return [245, 163, 64, 220]
    if val <= 1.00: return [255, 240, 60, 220]
    if val <= 1.15: return [85, 215, 65, 220]
    if val <= 1.30: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

def get_color_mg(val):
    if val <= 0: return [0, 0, 0, 0]
    if val <= 0.20: return [227, 26, 28, 220]
    if val <= 0.22: return [245, 163, 64, 220]
    if val <= 0.24: return [255, 240, 60, 220]
    if val <= 0.26: return [85, 215, 65, 220]
    if val <= 0.28: return [30, 110, 230, 220]
    return [145, 90, 45, 220]

COLOR_FUNCS = {
    'N': get_color_n,
    'P': get_color_p,
    'K': get_color_k,
    'Mg': get_color_mg
}

def main():
    dev_dir = os.path.dirname(os.path.abspath(__file__))
    overlays_dict = {}
    grid_dict = {}

    for nut, color_fn in COLOR_FUNCS.items():
        tif_path = os.path.join(dev_dir, f"Merge_Citra_Unsur_{nut}.tif")
        if not os.path.exists(tif_path):
            print(f"Missing TIFF for {nut}: {tif_path}")
            continue

        with rasterio.open(tif_path) as src:
            data = src.read(1)
            h, w = data.shape
            bounds = [[src.bounds.bottom, src.bounds.left], [src.bounds.top, src.bounds.right]]

            rgba_img = np.zeros((h, w, 4), dtype=np.uint8)
            for r in range(h):
                for c in range(w):
                    v = data[r, c]
                    rgba_img[r, c] = color_fn(v)

            img = Image.fromarray(rgba_img)
            img_resized = img.resize((w * 4, h * 4), Image.Resampling.NEAREST)
            
            buf = io.BytesIO()
            img_resized.save(buf, format="PNG")
            b64_str = base64.b64encode(buf.getvalue()).decode('utf-8')
            data_url = f"data:image/png;base64,{b64_str}"

            overlays_dict[nut] = {
                "dataUrl": data_url,
                "bounds": bounds
            }

            sub = data[::2, ::2]
            sh, sw = sub.shape
            sub_clean = np.where(np.isnan(sub) | (sub <= 0), -9999, np.round(sub, 3))
            
            grid_dict[nut] = {
                "bounds": {
                    "left": src.bounds.left,
                    "bottom": src.bounds.bottom,
                    "right": src.bounds.right,
                    "top": src.bounds.top
                },
                "width": sw,
                "height": sh,
                "data": sub_clean.tolist()
            }
            print(f"Generated overlay & grid for {nut}: PNG={len(data_url)/1024:.1f} KB, Grid shape=({sh},{sw})")

    js_content = f"const RASTER_OVERLAYS_PPPTAR = {json.dumps(overlays_dict)};\nconst RASTER_GRID_DATA_PPPTAR = {json.dumps(grid_dict)};\nif (typeof window !== 'undefined') {{\n    window.RASTER_OVERLAYS_PPPTAR = RASTER_OVERLAYS_PPPTAR;\n    window.RASTER_GRID_DATA_PPPTAR = RASTER_GRID_DATA_PPPTAR;\n}}\n"
    js_path = os.path.join(dev_dir, "js/ppptar_raster_overlays.js")

    with open(js_path, "w") as f:
        f.write(js_content)

    print(f"\nSaved RASTER_OVERLAYS_PPPTAR and RASTER_GRID_DATA_PPPTAR to: {js_path}")

if __name__ == "__main__":
    main()
