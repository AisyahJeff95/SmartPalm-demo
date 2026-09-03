#!/usr/bin/env python3
"""
Generates SmartPalm / PalmNex Cloud GIS Architecture Framework PDF.
"""
from pathlib import Path
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group, Polygon

def draw_box(group, x, y, width, height, title, subtitle, fill_color, border_color):
    # Rounded box simulation
    r = Rect(x, y, width, height, rx=8, ry=8, fillColor=fill_color, strokeColor=border_color, strokeWidth=1.5)
    group.add(r)
    
    # Title
    t = String(x + width/2, y + height - 18, title, fontName="Helvetica-Bold", fontSize=11, textAnchor="middle", fillColor=colors.HexColor("#1e293b"))
    group.add(t)
    
    # Subtitle
    if subtitle:
        lines = subtitle.split("\n")
        curr_y = y + height - 32
        for line in lines:
            st = String(x + width/2, curr_y, line, fontName="Helvetica", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#475569"))
            group.add(st)
            curr_y -= 12

def draw_arrow(group, x1, y1, x2, y2, label=""):
    # Main line
    line = Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#0ca678"), strokeWidth=2)
    group.add(line)
    
    # Arrow head at (x2, y2)
    dx = x2 - x1
    dy = y2 - y1
    if dx > 0: # Right
        head = Polygon([x2, y2, x2-8, y2+4, x2-8, y2-4], fillColor=colors.HexColor("#0ca678"), strokeColor=colors.HexColor("#0ca678"))
    elif dx < 0: # Left
        head = Polygon([x2, y2, x2+8, y2+4, x2+8, y2-4], fillColor=colors.HexColor("#0ca678"), strokeColor=colors.HexColor("#0ca678"))
    elif dy > 0: # Up
        head = Polygon([x2, y2, x2-4, y2-8, x2+4, y2-8], fillColor=colors.HexColor("#0ca678"), strokeColor=colors.HexColor("#0ca678"))
    else: # Down
        head = Polygon([x2, y2, x2-4, y2+8, x2+4, y2+8], fillColor=colors.HexColor("#0ca678"), strokeColor=colors.HexColor("#0ca678"))
    group.add(head)
    
    if label:
        lx = (x1 + x2) / 2
        ly = (y1 + y2) / 2 + 5
        lbl = String(lx, ly, label, fontName="Helvetica-Bold", fontSize=8, textAnchor="middle", fillColor=colors.HexColor("#0f766e"))
        group.add(lbl)

def create_framework_pdf(filename="SmartPalm_PalmNex_Cloud_GIS_Framework.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=landscape(letter),
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Title'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#064e3b'),
        alignment=0
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#334155')
    )
    
    h2_style = ParagraphStyle(
        'H2Style',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0ca678'),
        spaceBefore=10,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#1e293b')
    )
    
    story = []
    
    # Header Banner
    story.append(Paragraph("SmartPalm / PalmNex — Cloud GIS Architecture Framework", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("High-Scale Spatial Pipelines, Cloud Object Storage (S3/R2), PostGIS & Viewport Vector Streaming", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0ca678'), spaceAfter=14))
    
    # --- DIAGRAM ---
    d = Drawing(720, 240)
    g = Group()
    
    # Layer Background Panels
    # Layer 1: Frontend User Layer (Left)
    bg1 = Rect(10, 10, 180, 220, rx=6, ry=6, fillColor=colors.HexColor('#f0fdf4'), strokeColor=colors.HexColor('#bbf7d0'), strokeWidth=1)
    g.add(bg1)
    g.add(String(100, 215, "FRONTEND USER LAYER", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#15803d")))
    
    # Layer 2: API & Processing Layer (Middle)
    bg2 = Rect(205, 10, 240, 220, rx=6, ry=6, fillColor=colors.HexColor('#f0f9ff'), strokeColor=colors.HexColor('#bae6fd'), strokeWidth=1)
    g.add(bg2)
    g.add(String(325, 215, "API & PROCESSING LAYER", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
    
    # Layer 3: Cloud Storage & DB Layer (Right)
    bg3 = Rect(460, 10, 250, 220, rx=6, ry=6, fillColor=colors.HexColor('#fdf4ff'), strokeColor=colors.HexColor('#f5d0fe'), strokeWidth=1)
    g.add(bg3)
    g.add(String(585, 215, "CLOUD STORAGE & DATABASE LAYER", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#7e22ce")))
    
    # Draw Boxes
    # Box 1: Web Dashboard (Leaflet.js)
    draw_box(g, 25, 120, 150, 75, "Leaflet Dashboard", "Interactive Map UI\nLocalStorage / Cache\nPoint Diagnostics", colors.HexColor('#ffffff'), colors.HexColor('#16a34a'))
    
    # Box 2: Shapefile / GeoJSON Upload Control
    draw_box(g, 25, 25, 150, 75, "Shapefile Uploader", "Client-Side shpjs / Turf\nDrag & Drop .shp/.zip\nInstant Geometry Parse", colors.HexColor('#ffffff'), colors.HexColor('#16a34a'))
    
    # Box 3: FastAPI Backend & Tile Services
    draw_box(g, 220, 120, 210, 75, "Backend & Tile Server", "FastAPI / Node.js Engine\nVector Tile Generator\nSigned URL Authentication", colors.HexColor('#ffffff'), colors.HexColor('#0284c7'))

    # Box 4: HTTP Range Streaming Engine
    draw_box(g, 220, 25, 210, 75, "HTTP Range Streaming", "PMTiles / FlatGeobuf\nFetches Bounded Tiles\nOnly ~50 KB per Viewport", colors.HexColor('#ffffff'), colors.HexColor('#0284c7'))

    # Box 5: Cloud Storage Buckets (S3 / R2)
    draw_box(g, 475, 120, 220, 75, "Cloud Storage (S3 / R2)", "AWS S3 / Cloudflare R2\nStores Raw .shp / .zip\nHosts PMTiles & GeoTIFFs", colors.HexColor('#ffffff'), colors.HexColor('#9333ea'))

    # Box 6: PostGIS Spatial DB
    draw_box(g, 475, 25, 220, 75, "PostGIS Spatial DB", "PostgreSQL + PostGIS\nEstate Metadata & Tables\nNutrient ML Predictions", colors.HexColor('#ffffff'), colors.HexColor('#9333ea'))
    
    # Connectors / Arrows
    # Upload -> Backend
    draw_arrow(g, 175, 62, 220, 62, "Upload Raw")
    
    # Backend -> Cloud Storage
    draw_arrow(g, 430, 157, 475, 157, "Sync Files")
    
    # Backend -> PostGIS
    draw_arrow(g, 430, 62, 475, 62, "Metadata / Queries")

    # Cloud Storage -> Streaming Engine
    draw_arrow(g, 475, 135, 430, 62, "Byte Range")

    # Streaming Engine -> Leaflet Map
    draw_arrow(g, 220, 157, 175, 157, "Stream Tiles")

    d.add(g)
    story.append(d)
    story.append(Spacer(1, 10))
    
    # --- TABLE OF COMPONENTS ---
    story.append(Paragraph("System Component Specifications", h2_style))
    
    table_data = [
        [
            Paragraph("<b>Component Layer</b>", body_style),
            Paragraph("<b>Technology / Service</b>", body_style),
            Paragraph("<b>Primary Function & Data Handled</b>", body_style),
            Paragraph("<b>Storage & Performance</b>", body_style)
        ],
        [
            Paragraph("<b>Client Dashboard</b>", body_style),
            Paragraph("Leaflet.js + Turf.js + shpjs", body_style),
            Paragraph("Interactive visualization, shapefile parsing, point nutrient diagnostics, layer toggling.", body_style),
            Paragraph("IndexedDB / LocalStorage (~5-10 MB client cache).", body_style)
        ],
        [
            Paragraph("<b>Cloud Storage</b>", body_style),
            Paragraph("AWS S3 / Cloudflare R2", body_style),
            Paragraph("Stores raw Shapefiles (.shp, .zip), PMTiles archives, and high-res GeoTIFF raster maps.", body_style),
            Paragraph("Scalable to Terabytes; HTTP Range Request streaming.", body_style)
        ],
        [
            Paragraph("<b>Spatial Database</b>", body_style),
            Paragraph("PostgreSQL + PostGIS", body_style),
            Paragraph("Stores estate polygons, metadata catalog, soil nutrient levels, and fertilizer recommendations.", body_style),
            Paragraph("Millisecond spatial indexing (R-Tree / GIST indexes).", body_style)
        ],
        [
            Paragraph("<b>Vector Streaming</b>", body_style),
            Paragraph("PMTiles / Mapbox MVT", body_style),
            Paragraph("Streams bounded spatial tile data corresponding only to the user's active map viewport.", body_style),
            Paragraph("Ultra-low bandwidth (~50 KB per viewport load).", body_style)
        ]
    ]
    
    comp_table = Table(table_data, colWidths=[110, 140, 290, 180])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    
    story.append(comp_table)
    
    doc.build(story)
    print(f"Successfully generated PDF: {filename}")

if __name__ == "__main__":
    create_framework_pdf()
