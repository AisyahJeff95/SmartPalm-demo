#!/usr/bin/env python3
"""
Renders a nutrient GeoTIFF (N, P, K, or Mg) to a high-resolution, high-contrast sharp PNG map.
Applies specific agronomic color ranges for Nitrogen (N) map, or spectral scale for others.
"""

import os
import numpy as np
import rasterio
from PIL import Image

def get_nitrogen_color(val):
    """
    Nitrogen Color Mapping based on Agronomic Ranges (from Legend photo):
    <= 2.1%       : Red     [227, 26, 28]
    > 2.1% - 2.3% : Orange  [245, 163, 64]
    > 2.3% - 2.5% : Yellow  [255, 240, 60]
    > 2.5% - 2.7% : Green   [85, 215, 65]
    > 2.7% - 2.9% : Blue    [30, 110, 230]
    > 2.9%        : Brown   [145, 90, 45]
    """
    if val <= 2.1:
        return [227, 26, 28, 255]      # Red (<= 2.1%)
    elif val <= 2.3:
        return [245, 163, 64, 255]     # Orange (> 2.1% - 2.3%)
    elif val <= 2.5:
        return [255, 240, 60, 255]     # Yellow (> 2.3% - 2.5%)
    elif val <= 2.7:
        return [85, 215, 65, 255]      # Green (> 2.5% - 2.7%)
    elif val <= 2.9:
        return [30, 110, 230, 255]     # Blue (> 2.7% - 2.9%)
    else:
        return [145, 90, 45, 255]      # Brown (> 2.9%)

def get_rdylgn_color(val):
    # 5-Stop Color Gradient (RdYlGn stops)
    if val <= 0.25:
        t = val / 0.25
        r = int(215 + t * (253 - 215))
        g = int(25 + t * (174 - 25))
        b = int(28 + t * (97 - 28))
    elif val <= 0.50:
        t = (val - 0.25) / 0.25
        r = int(253 + t * (255 - 253))
        g = int(174 + t * (255 - 174))
        b = int(97 + t * (191 - 97))
    elif val <= 0.75:
        t = (val - 0.50) / 0.25
        r = int(255 + t * (166 - 255))
        g = int(255 + t * (217 - 255))
        b = int(191 + t * (106 - 191))
    else:
        t = (val - 0.75) / 0.25
        r = int(166 + t * (26 - 166))
        g = int(217 + t * (150 - 217))
        b = int(106 + t * (65 - 106))
    return [r, g, b, 255]

def main():
    # EDIT THIS to change the file to render (e.g. Merge_Citra_Unsur_N.tif, P.tif, K.tif, Mg.tif)
    tiff_path = "Merge_Citra_Unsur_N.tif"
    output_png = "nitrogen_map_sharp.png"
    
    if not os.path.exists(tiff_path):
        raise FileNotFoundError(f"Cannot find {tiff_path}")
        
    print(f"Reading {tiff_path}...")
    with rasterio.open(tiff_path) as src:
        data = src.read(1).astype(np.float32)
        
    h, w = data.shape
    print(f"Grid dimensions: {w}x{h}")
    
    # Create mask for valid pixels (not -9999.0 and not NaN)
    valid_mask = (data != -9999.0) & (~np.isnan(data))
    
    if not np.any(valid_mask):
        raise ValueError("No valid pixel data found in the GeoTIFF.")
        
    valid_vals = data[valid_mask]
    
    mean_val = np.mean(valid_vals)
    print(f"Stats: Min={np.min(valid_vals):.4f}%, Max={np.max(valid_vals):.4f}%, Mean={mean_val:.4f}%")
    
    is_nitrogen = "Unsur_N" in tiff_path or "nitrogen" in tiff_path.lower()
    
    if not is_nitrogen:
        # Percentile contrast stretching (2% to 98% range) for relative scaling maps
        p2 = np.percentile(valid_vals, 2)
        p98 = np.percentile(valid_vals, 98)
        print(f"Clipping range: 2nd percentile = {p2:.4f}%, 98th percentile = {p98:.4f}%")
        clipped_data = np.clip(data, p2, p98)
        norm_data = np.zeros_like(data)
        norm_data[valid_mask] = (clipped_data[valid_mask] - p2) / (p98 - p2 + 1e-8)
    
    img_data = np.zeros((h, w, 4), dtype=np.uint8)
    
    for r in range(h):
        for c in range(w):
            if not valid_mask[r, c]:
                # Light grey background
                img_data[r, c] = [245, 245, 245, 255]
            else:
                raw_val = data[r, c]
                if is_nitrogen:
                    img_data[r, c] = get_nitrogen_color(raw_val)
                else:
                    val = norm_data[r, c]
                    img_data[r, c] = get_rdylgn_color(val)
                
    # Create Pillow image
    img = Image.fromarray(img_data)
    
    # Upscale by 10x using NEAREST interpolation to keep grid cells crisp and sharp
    scale_factor = 10
    new_w = w * scale_factor
    new_h = h * scale_factor
    img_sharp = img.resize((new_w, new_h), Image.Resampling.NEAREST)
    
    # Save image
    img_sharp.save(output_png)
    print(f"Successfully rendered and saved Nitrogen map with exact range legend to: {os.path.abspath(output_png)}")

if __name__ == "__main__":
    main()

