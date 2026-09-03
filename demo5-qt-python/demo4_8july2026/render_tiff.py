#!/usr/bin/env python3
"""
Renders nutrient GeoTIFFs (N, P, K, Mg) to high-resolution, high-contrast sharp PNG maps.
Applies exact agronomic color ranges for each nutrient as defined in reference legends:
- Nitrogen (N): <=2.1%, >2.1-2.3%, >2.3-2.5%, >2.5-2.7%, >2.7-2.9%, >2.9%
- Phosphorus (P): <=0.120%, >0.120-0.135%, >0.135-0.150%, >0.150-0.165%, >0.165-0.180%, >0.180%
- Potassium (K): <=0.70%, >0.70-0.85%, >0.85-1.00%, >1.00-1.15%, >1.15-1.30%, >1.30%
- Magnesium (Mg): <=0.20%, >0.20-0.22%, >0.22-0.24%, >0.24-0.26%, >0.26-0.28%, >0.28%
"""

import os
import numpy as np
import rasterio
from PIL import Image

COLOR_RED    = [227, 26, 28, 255]    # <= lowest threshold
COLOR_ORANGE = [245, 163, 64, 255]   # threshold 1 - 2
COLOR_YELLOW = [255, 240, 60, 255]   # threshold 2 - 3
COLOR_GREEN  = [85, 215, 65, 255]    # threshold 3 - 4 (Optimal / above critical)
COLOR_BLUE   = [30, 110, 230, 255]   # threshold 4 - 5
COLOR_BROWN  = [145, 90, 45, 255]    # > threshold 5

def get_nitrogen_color(val):
    if val <= 2.1:
        return COLOR_RED
    elif val <= 2.3:
        return COLOR_ORANGE
    elif val <= 2.5:
        return COLOR_YELLOW
    elif val <= 2.7:
        return COLOR_GREEN
    elif val <= 2.9:
        return COLOR_BLUE
    else:
        return COLOR_BROWN

def get_phosphorus_color(val):
    if val <= 0.120:
        return COLOR_RED
    elif val <= 0.135:
        return COLOR_ORANGE
    elif val <= 0.150:
        return COLOR_YELLOW
    elif val <= 0.165:
        return COLOR_GREEN
    elif val <= 0.180:
        return COLOR_BLUE
    else:
        return COLOR_BROWN

def get_potassium_color(val):
    if val <= 0.70:
        return COLOR_RED
    elif val <= 0.85:
        return COLOR_ORANGE
    elif val <= 1.00:
        return COLOR_YELLOW
    elif val <= 1.15:
        return COLOR_GREEN
    elif val <= 1.30:
        return COLOR_BLUE
    else:
        return COLOR_BROWN

def get_magnesium_color(val):
    if val <= 0.20:
        return COLOR_RED
    elif val <= 0.22:
        return COLOR_ORANGE
    elif val <= 0.24:
        return COLOR_YELLOW
    elif val <= 0.26:
        return COLOR_GREEN
    elif val <= 0.28:
        return COLOR_BLUE
    else:
        return COLOR_BROWN

NUTRIENT_CONFIGS = {
    "N": {
        "tiff": "Merge_Citra_Unsur_N.tif",
        "output": "nitrogen_map_sharp.png",
        "color_fn": get_nitrogen_color,
        "name": "Nitrogen"
    },
    "P": {
        "tiff": "Merge_Citra_Unsur_P.tif",
        "output": "phosphorus_map_sharp.png",
        "color_fn": get_phosphorus_color,
        "name": "Phosphorus"
    },
    "K": {
        "tiff": "Merge_Citra_Unsur_K.tif",
        "output": "potassium_map_sharp.png",
        "color_fn": get_potassium_color,
        "name": "Potassium"
    },
    "Mg": {
        "tiff": "Merge_Citra_Unsur_Mg.tif",
        "output": "magnesium_map_sharp.png",
        "color_fn": get_magnesium_color,
        "name": "Magnesium"
    }
}

def render_single_map(key):
    config = NUTRIENT_CONFIGS[key]
    tiff_path = config["tiff"]
    output_png = config["output"]
    color_fn = config["color_fn"]
    name = config["name"]

    if not os.path.exists(tiff_path):
        print(f"Skipping {name}: {tiff_path} not found.")
        return

    print(f"Reading {name} GeoTIFF ({tiff_path})...")
    with rasterio.open(tiff_path) as src:
        data = src.read(1).astype(np.float32)

    h, w = data.shape
    valid_mask = (data != -9999.0) & (~np.isnan(data))

    if not np.any(valid_mask):
        print(f"Warning: No valid pixel data in {tiff_path}.")
        return

    valid_vals = data[valid_mask]
    print(f"  Stats for {name}: Min={np.min(valid_vals):.4f}%, Max={np.max(valid_vals):.4f}%, Mean={np.mean(valid_vals):.4f}%")

    img_data = np.zeros((h, w, 4), dtype=np.uint8)

    for r in range(h):
        for c in range(w):
            if not valid_mask[r, c]:
                img_data[r, c] = [245, 245, 245, 255]  # Light grey background
            else:
                img_data[r, c] = color_fn(data[r, c])

    img = Image.fromarray(img_data)
    scale_factor = 10
    img_sharp = img.resize((w * scale_factor, h * scale_factor), Image.Resampling.NEAREST)
    img_sharp.save(output_png)
    print(f"  Successfully rendered {name} map to: {os.path.abspath(output_png)}")

def main():
    print("==========================================")
    print(" Rendering Nutrient GeoTIFF Maps (N, P, K, Mg)")
    print("==========================================")
    for key in ["N", "P", "K", "Mg"]:
        render_single_map(key)

if __name__ == "__main__":
    main()


