#!/usr/bin/env python3
"""
Generates crisp, high-resolution PNG legend cards showing ranges, percentages,
color codes, and critical level indicators for N, P, K, and Mg.
"""

import os
from PIL import Image, ImageDraw, ImageFont

def generate_legend_card(title, critical_text, legend_items, output_filename):
    width = 800
    height = 600
    background_color = (255, 255, 255)
    
    img = Image.new("RGB", (width, height), background_color)
    draw = ImageDraw.Draw(img)
    
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Avenir.ttc"
    ]
    
    font_title = None
    font_sub = None
    font_body = None
    font_footer = None
    
    for path in font_paths:
        if os.path.exists(path):
            try:
                font_title = ImageFont.truetype(path, 36)
                font_sub = ImageFont.truetype(path, 24)
                font_body = ImageFont.truetype(path, 22)
                font_footer = ImageFont.truetype(path, 22)
                break
            except Exception:
                continue
                
    if font_title is None:
        font_title = ImageFont.load_default()
        font_sub = font_title
        font_body = font_title
        font_footer = font_title

    # Draw Title
    draw.text((60, 50), title, fill=(30, 30, 30), font=font_title)
    
    # Draw Legend Subtitle
    draw.text((60, 110), "Legend", fill=(60, 60, 60), font=font_sub)

    # Grid layout: 2 columns, 3 rows
    col_x = [60, 420]
    start_y = 170
    row_height = 70
    box_size = 45

    for idx, item in enumerate(legend_items):
        col = 0 if idx < 3 else 1
        row = idx % 3
        
        x = col_x[col]
        y = start_y + row * row_height
        
        # Draw Color Box (with subtle border)
        draw.rectangle([x, y, x + box_size, y + box_size], fill=item["color"], outline=(80, 80, 80), width=1)
        
        # Draw Label Text
        text_x = x + box_size + 20
        text_y = y + (box_size // 4) - 2
        draw.text((text_x, text_y), item["label"], fill=(40, 40, 40), font=font_body)

    # Draw Critical Level indicator
    footer_y = 440
    draw.rectangle([60, footer_y - 10, 740, footer_y + 45], fill=(245, 247, 250), outline=(210, 215, 220), width=1)
    draw.rectangle([60, footer_y - 10, 68, footer_y + 45], fill=(85, 215, 65))
    draw.text((85, footer_y + 3), critical_text, fill=(30, 30, 30), font=font_footer)

    img.save(output_filename)
    print(f"Legend saved to: {os.path.abspath(output_filename)}")

def main():
    # 1. Nitrogen (N)
    n_items = [
        {"color": (227, 26, 28),   "label": "<= 2.1%"},
        {"color": (245, 163, 64),  "label": "> 2.1% - 2.3%"},
        {"color": (255, 240, 60),  "label": "> 2.3% - 2.5%"},
        {"color": (85, 215, 65),   "label": "> 2.5% - 2.7%"},
        {"color": (30, 110, 230),  "label": "> 2.7% - 2.9%"},
        {"color": (145, 90, 45),   "label": "> 2.9%"},
    ]
    generate_legend_card("Nitrogen", "Critical level N: 2.5%", n_items, "nitrogen_legend.png")

    # 2. Phosphorus (P)
    p_items = [
        {"color": (227, 26, 28),   "label": "<= 0.120%"},
        {"color": (245, 163, 64),  "label": "> 0.120% - 0.135%"},
        {"color": (255, 240, 60),  "label": "> 0.135% - 0.150%"},
        {"color": (85, 215, 65),   "label": "> 0.150% - 0.165%"},
        {"color": (30, 110, 230),  "label": "> 0.165% - 0.180%"},
        {"color": (145, 90, 45),   "label": "> 0.180%"},
    ]
    generate_legend_card("Phosphorus", "Critical level P: 0.15%", p_items, "phosphorus_legend.png")

    # 3. Potassium (K)
    k_items = [
        {"color": (227, 26, 28),   "label": "<= 0.70%"},
        {"color": (245, 163, 64),  "label": "> 0.70% - 0.85%"},
        {"color": (255, 240, 60),  "label": "> 0.85% - 1.00%"},
        {"color": (85, 215, 65),   "label": "> 1.00% - 1.15%"},
        {"color": (30, 110, 230),  "label": "> 1.15% - 1.30%"},
        {"color": (145, 90, 45),   "label": "> 1.30%"},
    ]
    generate_legend_card("Potassium", "Critical level K: 1.00%", k_items, "potassium_legend.png")

    # 4. Magnesium (Mg)
    mg_items = [
        {"color": (227, 26, 28),   "label": "<= 0.20%"},
        {"color": (245, 163, 64),  "label": "> 0.20% - 0.22%"},
        {"color": (255, 240, 60),  "label": "> 0.22% - 0.24%"},
        {"color": (85, 215, 65),   "label": "> 0.24% - 0.26%"},
        {"color": (30, 110, 230),  "label": "> 0.26% - 0.28%"},
        {"color": (145, 90, 45),   "label": "> 0.28%"},
    ]
    generate_legend_card("Magnesium", "Critical level Mg: 0.20%", mg_items, "magnesium_legend.png")

if __name__ == "__main__":
    main()
