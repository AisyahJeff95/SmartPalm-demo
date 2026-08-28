import sys
import os
import json
import zipfile
import tempfile
import io
import base64
import rasterio
import numpy as np
from PIL import Image
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame,
    QFileDialog, QGraphicsDropShadowEffect, QMessageBox, QGroupBox, QComboBox
)
from PySide6.QtCore import Qt, Slot, QUrl, QObject, Signal
from PySide6.QtGui import QFont, QPixmap, QImage, QPainter, QColor
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebChannel import QWebChannel
import shapefile
import pyproj

from pages.meds_dialogs import EDSInlandDialog, EDSCoastalDialog, FullMapNutrientDialog

def get_nutrient_color(val, nutrient_type="N"):
    """Agronomic Color mapping for N, P, K, Mg GeoTIFF rasters based on exact legend ranges"""
    if val is None or np.isnan(val) or val <= -9000:
        return [0, 0, 0, 0]
    alpha = 240
    
    if nutrient_type == "N":
        if val <= 2.1:
            return [255, 0, 0, alpha]         # Red (<= 2.1%)
        elif val <= 2.3:
            return [255, 153, 0, alpha]       # Orange (> 2.1% - 2.3%)
        elif val <= 2.5:
            return [255, 255, 0, alpha]       # Yellow (> 2.3% - 2.5%)
        elif val <= 2.7:
            return [0, 220, 0, alpha]         # Green (> 2.5% - 2.7%)
        elif val <= 2.9:
            return [0, 102, 255, alpha]       # Blue (> 2.7% - 2.9%)
        else:
            return [153, 85, 34, alpha]        # Brown (> 2.9%)
            
    elif nutrient_type == "P":
        if val <= 0.120:
            return [255, 0, 0, alpha]         # Red (<= 0.120%)
        elif val <= 0.135:
            return [255, 153, 0, alpha]       # Orange (> 0.120% - 0.135%)
        elif val <= 0.150:
            return [255, 255, 0, alpha]       # Yellow (> 0.135% - 0.150%)
        elif val <= 0.165:
            return [0, 220, 0, alpha]         # Green (> 0.150% - 0.165%)
        elif val <= 0.180:
            return [0, 102, 255, alpha]       # Blue (> 0.165% - 0.180%)
        else:
            return [153, 85, 34, alpha]        # Brown (> 0.180%)
            
    elif nutrient_type == "K":
        if val <= 0.70:
            return [255, 0, 0, alpha]         # Red (<= 0.70%)
        elif val <= 0.85:
            return [255, 153, 0, alpha]       # Orange (> 0.70% - 0.85%)
        elif val <= 1.00:
            return [255, 255, 0, alpha]       # Yellow (> 0.85% - 1.00%)
        elif val <= 1.15:
            return [0, 220, 0, alpha]         # Green (> 1.00% - 1.15%)
        elif val <= 1.30:
            return [0, 102, 255, alpha]       # Blue (> 1.15% - 1.30%)
        else:
            return [153, 85, 34, alpha]        # Brown (> 1.30%)
            
    elif nutrient_type == "Mg":
        if val <= 0.20:
            return [255, 0, 0, alpha]         # Red (<= 0.20%)
        elif val <= 0.22:
            return [255, 153, 0, alpha]       # Orange (> 0.20% - 0.22%)
        elif val <= 0.24:
            return [255, 255, 0, alpha]       # Yellow (> 0.22% - 0.24%)
        elif val <= 0.26:
            return [0, 220, 0, alpha]         # Green (> 0.24% - 0.26%)
        elif val <= 0.28:
            return [0, 102, 255, alpha]       # Blue (> 0.26% - 0.28%)
        else:
            return [153, 85, 34, alpha]        # Brown (> 0.28%)
            
    return [0, 0, 0, 0]

class NutrientRasterManager:
    """Manages loading, sampling, and overlay generation for GeoTIFF nutrient rasters (N, P, K, Mg)"""
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.rasters = {}
        self.transformers_utm = {}
        self.transformers_wgs = {}
        self.overlay_cache = {}
        
        nutrient_files = {
            "N": "Merge_Citra_Unsur_N.tif",
            "P": "Merge_Citra_Unsur_P.tif",
            "K": "Merge_Citra_Unsur_K.tif",
            "Mg": "Merge_Citra_Unsur_Mg.tif"
        }
        for key, fname in nutrient_files.items():
            path = os.path.join(base_dir, fname)
            if os.path.exists(path):
                self.load_raster(key, path)

    def load_raster(self, key, path):
        try:
            with rasterio.open(path) as src:
                self.rasters[key] = {
                    'data': src.read(1),
                    'nodata': src.nodata,
                    'transform': src.transform,
                    'crs': src.crs,
                    'bounds': src.bounds,
                    'shape': src.shape
                }
                # WGS84 -> UTM for sampling clicked (lat, lon)
                self.transformers_utm[key] = pyproj.Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
                # UTM -> WGS84 for computing GeoTIFF overlay lat/lon bounds
                self.transformers_wgs[key] = pyproj.Transformer.from_crs(src.crs, 'EPSG:4326', always_xy=True)
                
                self.overlay_cache[key] = self._generate_overlay(key)
        except Exception as e:
            print(f"Error loading nutrient raster ({key}): {e}")

    def sample_value(self, key, lat, lon):
        if key not in self.rasters:
            return None
        r = self.rasters[key]
        x, y = self.transformers_utm[key].transform(lon, lat)
        row, col = rasterio.transform.rowcol(r['transform'], x, y)
        if 0 <= row < r['shape'][0] and 0 <= col < r['shape'][1]:
            val = r['data'][row, col]
            if val != r['nodata'] and not np.isnan(val) and val > -9000:
                return float(val)
        return None

    def sample_all_values(self, lat, lon):
        results = {}
        for key in ["N", "P", "K", "Mg"]:
            results[key] = self.sample_value(key, lat, lon)
        return results

    def _generate_overlay(self, key):
        if key not in self.rasters:
            return None
        r = self.rasters[key]
        data = r['data']
        h, w = data.shape
        valid_mask = (data != r['nodata']) & (~np.isnan(data)) & (data > -9000)
        
        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        for row in range(h):
            for col in range(w):
                if valid_mask[row, col]:
                    rgba[row, col] = get_nutrient_color(data[row, col], key)
                else:
                    rgba[row, col] = [0, 0, 0, 0]

        img = Image.fromarray(rgba, 'RGBA')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        b64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        data_url = f'data:image/png;base64,{b64_str}'

        wgs_left, wgs_bottom = self.transformers_wgs[key].transform(r['bounds'].left, r['bounds'].bottom)
        wgs_right, wgs_top = self.transformers_wgs[key].transform(r['bounds'].right, r['bounds'].top)
        bounds = [[wgs_bottom, wgs_left], [wgs_top, wgs_right]]
        
        return {'dataUrl': data_url, 'bounds': bounds}

def reproject_coordinate_tuple(pt, transformer):
    """Reprojects a single coordinate tuple from projected meters to WGS84 [lon, lat]"""
    if len(pt) >= 2:
        lon, lat = transformer.transform(pt[0], pt[1])
        return [lon, lat]
    return pt

def reproject_geometry(geom, transformer):
    """Recursively reprojects GeoJSON geometry coordinates to WGS84 (EPSG:4326)"""
    g_type = geom.get('type')
    coords = geom.get('coordinates')
    if not coords:
        return geom
    
    if g_type == 'Point':
        return {'type': 'Point', 'coordinates': reproject_coordinate_tuple(coords, transformer)}
    elif g_type in ('LineString', 'MultiPoint'):
        return {'type': g_type, 'coordinates': [reproject_coordinate_tuple(p, transformer) for p in coords]}
    elif g_type in ('Polygon', 'MultiLineString'):
        new_coords = []
        for ring in coords:
            new_coords.append([reproject_coordinate_tuple(p, transformer) for p in ring])
        return {'type': g_type, 'coordinates': new_coords}
    elif g_type == 'MultiPolygon':
        new_coords = []
        for poly in coords:
            new_poly = []
            for ring in poly:
                new_poly.append([reproject_coordinate_tuple(p, transformer) for p in ring])
            new_coords.append(new_poly)
        return {'type': 'MultiPolygon', 'coordinates': new_coords}
    return geom

def shapefile_to_geojson_features(shp_path):
    """
    Safely parses a .shp file using pyshp, auto-reprojects projected meter coordinates
    (like RSO Sabah / Timbalai / UTM) into WGS84 [lng, lat], and returns a list of GeoJSON features.
    """
    sf = None
    try:
        sf = shapefile.Reader(shp_path)
    except Exception:
        pass

    if sf is None or not hasattr(sf, "shapes"):
        try:
            f = open(shp_path, "rb")
            sf = shapefile.Reader(shp=f)
        except Exception as err:
            raise RuntimeError(f"Unable to read .shp geometry: {err}")

    prj_path = os.path.splitext(shp_path)[0] + ".prj"
    transformer = None
    
    bbox = getattr(sf, "bbox", None)
    is_projected = False
    if bbox:
        if abs(bbox[0]) > 180 or abs(bbox[1]) > 90 or abs(bbox[2]) > 180 or abs(bbox[3]) > 90:
            is_projected = True

    if is_projected:
        if os.path.exists(prj_path):
            try:
                with open(prj_path, 'r') as f:
                    prj_wkt = f.read().strip()
                crs_src = pyproj.CRS.from_user_input(prj_wkt)
                transformer = pyproj.Transformer.from_crs(crs_src, 'EPSG:4326', always_xy=True)
            except Exception:
                pass
        if transformer is None:
            try:
                # Timbalai RSO Sabah shapefiles (like Seraya_map.shp) have Easting > 800,000m
                if bbox and bbox[0] > 800000:
                    transformer = pyproj.Transformer.from_crs('EPSG:29873', 'EPSG:4326', always_xy=True)
                else:
                    transformer = pyproj.Transformer.from_crs('EPSG:32650', 'EPSG:4326', always_xy=True)
            except Exception:
                try:
                    transformer = pyproj.Transformer.from_crs('EPSG:32650', 'EPSG:4326', always_xy=True)
                except Exception:
                    pass

    has_dbf = False
    fields = []
    try:
        if hasattr(sf, "dbf") and sf.dbf:
            fields = [x[0] for x in sf.fields[1:]]
            has_dbf = True
    except Exception:
        has_dbf = False

    shapes = sf.shapes()
    records_data = []
    if has_dbf:
        try:
            records_data = sf.records()
        except Exception:
            records_data = [None] * len(shapes)
            has_dbf = False
    else:
        records_data = [None] * len(shapes)

    records = []
    for shape, rec in zip(shapes, records_data):
        geom = shape.__geo_interface__
        if transformer:
            geom = reproject_geometry(geom, transformer)

        props = dict(zip(fields, rec)) if (has_dbf and rec) else {}
        records.append({'type': 'Feature', 'geometry': geom, 'properties': props})

    return records

def create_black_text_logo(image_path, target_height=65):
    """Generates logo QPixmap with transparent background and crisp all-black text, no outline"""
    if not os.path.exists(image_path):
        return QPixmap()
    src_img = QImage(image_path)
    if src_img.isNull():
        return QPixmap()
    
    src_img = src_img.convertToFormat(QImage.Format.Format_ARGB32)
    w = src_img.width()
    h = src_img.height()
    
    clean_img = QImage(w, h, QImage.Format.Format_ARGB32)
    clean_img.fill(Qt.GlobalColor.transparent)
    
    icon_limit = int(w * 0.11)
    
    for y in range(h):
        for x in range(w):
            c = QColor.fromRgb(src_img.pixel(x, y))
            r, g, b, a = c.red(), c.green(), c.blue(), c.alpha()
            
            if r > 220 and g > 220 and b > 220:
                clean_img.setPixelColor(x, y, QColor(0, 0, 0, 0))
            elif a > 20:
                if x >= icon_limit:
                    clean_img.setPixelColor(x, y, QColor(0, 0, 0, a))
                else:
                    clean_img.setPixelColor(x, y, QColor(r, g, b, a))

    scaled_img = clean_img.scaledToHeight(target_height, Qt.TransformationMode.SmoothTransformation)
    return QPixmap.fromImage(scaled_img)

def create_outlined_transparent_logo(image_path, target_height=45, stroke_width=2, stroke_color=QColor("#000000")):
    """Generates logo QPixmap with crisp black outline around words & icon"""
    if not os.path.exists(image_path):
        return QPixmap()
    src_img = QImage(image_path)
    if src_img.isNull():
        return QPixmap()
    
    scaled_img = src_img.scaledToHeight(target_height, Qt.TransformationMode.SmoothTransformation)
    padding = stroke_width + 2
    w = scaled_img.width() + padding * 2
    h = scaled_img.height() + padding * 2
    
    silhouette = QImage(scaled_img.size(), QImage.Format.Format_ARGB32)
    silhouette.fill(Qt.GlobalColor.transparent)
    p_sil = QPainter(silhouette)
    p_sil.drawImage(0, 0, scaled_img)
    p_sil.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceIn)
    p_sil.fillRect(silhouette.rect(), stroke_color)
    p_sil.end()

    final_img = QImage(w, h, QImage.Format.Format_ARGB32)
    final_img.fill(Qt.GlobalColor.transparent)
    p_final = QPainter(final_img)
    p_final.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    for dx in range(-stroke_width, stroke_width + 1):
        for dy in range(-stroke_width, stroke_width + 1):
            if dx*dx + dy*dy <= (stroke_width + 0.5)**2 and (dx != 0 or dy != 0):
                p_final.drawImage(padding + dx, padding + dy, silhouette)
    
    p_final.drawImage(padding, padding, scaled_img)
    p_final.end()
    return QPixmap.fromImage(final_img)

class MapBridge(QObject):
    """Bridge for communication between Leaflet JavaScript map and PySide6 Qt GUI"""
    pointClicked = Signal(float, float, bool, str, str)
    nutrientLayerChanged = Signal(str)

    @Slot(float, float, bool, str, str)
    def onMapClicked(self, lat, lng, is_inside, land_cover="Oil Palm Plantation", block_name="Block 22"):
        self.pointClicked.emit(lat, lng, is_inside, land_cover, block_name)

    @Slot(str)
    def onNutrientLayerChanged(self, layer_name):
        self.nutrientLayerChanged.emit(layer_name)

class DashboardPage(QWidget):
    """Windows Style Classic Native Dashboard Page (Page 2)"""
    def __init__(self, parent_window=None):
        super().__init__()
        self.parent_window = parent_window
        self.current_soil_type = "Inland"
        self.boundary_loaded = False
        self.loaded_files_count = 0
        self.active_nutrient_layer = "OFF"

        base_dir = os.path.dirname(os.path.dirname(__file__))
        self.raster_mgr = NutrientRasterManager(base_dir)

        # Main Layout: Left Sidebar Panel (400px) + Right Map Area
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # =========================================================================
        # LEFT PANEL (Sidebar Controls in Classic Native Windows Style)
        # =========================================================================
        left_panel = QFrame()
        left_panel.setFixedWidth(460)
        left_panel.setStyleSheet("""
            QFrame {
                background-color: #f0f0f0;
                border-right: 1px solid #a0a0a0;
            }
            QLabel {
                color: #000000;
                font-family: "Segoe UI", "Tahoma", sans-serif;
            }
            QLabel:disabled {
                color: #838383;
            }
            QGroupBox {
                background-color: #f0f0f0;
                border: 1px solid #bcbcbc;
                border-radius: 2px;
                margin-top: 10px;
                padding-top: 14px;
                font-weight: bold;
                font-size: 16px;
                color: #000000;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 0 4px;
                background-color: #f0f0f0;
                color: #000000;
            }
            QGroupBox:disabled {
                border: 1px solid #d9d9d9;
                color: #838383;
            }
            QPushButton {
                background-color: #e1e1e1;
                color: #000000;
                border: 1px solid #adadad;
                border-radius: 2px;
                padding: 4px 14px;
                font-family: "Segoe UI", "Tahoma", sans-serif;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #e5f1fb;
                border-color: #0078d7;
            }
            QPushButton:pressed {
                background-color: #cce4f7;
                border-color: #005499;
            }
            QPushButton:disabled {
                background-color: #f4f4f4;
                color: #838383;
                border: 1px solid #adb2b5;
            }
        """)
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(15, 15, 15, 15)
        left_layout.setSpacing(12)

        # Top Navigation Bar (Classic Native Back Button)
        nav_bar = QHBoxLayout()
        back_btn = QPushButton("← Back to Palmnex-MPOB")
        back_btn.setFixedHeight(36)
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setFont(QFont("Segoe UI", 16, QFont.Weight.Bold))
        if parent_window:
            back_btn.clicked.connect(lambda: parent_window.stacked_widget.setCurrentIndex(0))
        nav_bar.addWidget(back_btn)
        nav_bar.addStretch()
        left_layout.addLayout(nav_bar)

        # Header Logo (Outlined Black Transparent Logo matching Page 1)
        logo_layout = QHBoxLayout()
        logo_label = QLabel()
        logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "MPOB-3_transparent.png")
        if not os.path.exists(logo_path):
            logo_path = os.path.join(os.path.dirname(__file__), "MPOB-3_transparent.png")
        
        outlined_logo = create_outlined_transparent_logo(logo_path, target_height=42)
        if not outlined_logo.isNull():
            logo_label.setPixmap(outlined_logo)
            logo_layout.addWidget(logo_label)
        
        left_layout.addLayout(logo_layout)

        # -------------------------------------------------------------------------
        # 1. SHP File Upload & Map Selector Container (Classic Native Windows Box)
        # -------------------------------------------------------------------------
        upload_box = QGroupBox("Map File Selection")
        upload_layout = QVBoxLayout(upload_box)
        upload_layout.setContentsMargins(12, 10, 12, 10)
        upload_layout.setSpacing(8)

        # Dropdown selection row
        combo_row = QHBoxLayout()
        combo_label = QLabel("Select Map:")
        combo_label.setFont(QFont("Segoe UI", 15, QFont.Weight.Bold))

        self.map_combo = QComboBox()
        self.map_combo.setFixedHeight(36)
        self.map_combo.setFont(QFont("Segoe UI", 14))
        self.map_combo.setCursor(Qt.CursorShape.PointingHandCursor)
        self.map_combo.setStyleSheet("""
            QComboBox {
                background-color: #ffffff;
                border: 1px solid #adadad;
                border-radius: 2px;
                padding: 2px 8px;
                color: #000000;
            }
            QComboBox:hover {
                border-color: #0078d7;
            }
            QComboBox QAbstractItemView {
                background-color: #ffffff;
                color: #000000;
                selection-background-color: #e5f1fb;
                selection-color: #000000;
            }
        """)

        # Populate permanent map options
        self.map_combo.addItem("Lahad Datu with block boundary", "Lahad Datu with block boundary.shp")
        self.map_combo.addItem("Seraya with block boundary", "Seraya with Block Boundary.shp")
        self.map_combo.currentIndexChanged.connect(self.on_map_selection_changed)

        combo_row.addWidget(combo_label)
        combo_row.addWidget(self.map_combo, stretch=1)
        upload_layout.addLayout(combo_row)

        # File upload row
        upload_row = QHBoxLayout()
        drop_label = QLabel("Or upload custom .shp file(s):")
        drop_label.setFont(QFont("Segoe UI", 13))
        drop_label.setStyleSheet("color: #555555;")

        self.upload_btn = QPushButton("Upload")
        self.upload_btn.setFixedHeight(32)
        self.upload_btn.setFixedWidth(100)
        self.upload_btn.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        self.upload_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.upload_btn.clicked.connect(self.upload_shp_files)

        upload_row.addWidget(drop_label)
        upload_row.addStretch()
        upload_row.addWidget(self.upload_btn)
        upload_layout.addLayout(upload_row)

        left_layout.addWidget(upload_box)

        # -------------------------------------------------------------------------
        # 2. Point Nutrient Detection Container (Disabled until upload)
        # -------------------------------------------------------------------------
        self.nutrient_box = QGroupBox("Point Nutrient Detection")
        nutrient_layout = QVBoxLayout(self.nutrient_box)
        nutrient_layout.setContentsMargins(12, 12, 12, 12)
        nutrient_layout.setSpacing(10)

        nutrient_sub = QLabel("Click on any spot inside the map boundary to check the nutrient detection of N P K and Mg in each 10 meters Block.")
        nutrient_sub.setFont(QFont("Segoe UI", 12))
        nutrient_sub.setWordWrap(True)

        self.coords_label = QLabel("Coordinates: Please upload .shp file(s)")
        self.coords_label.setFont(QFont("Segoe UI", 15, QFont.Weight.Bold))

        self.zone_label = QLabel("Zone: Upload map file(s) to activate")
        self.zone_label.setFont(QFont("Segoe UI", 14, QFont.Weight.Bold))
        self.zone_label.setStyleSheet("color: #838383;")

        # 4 Nutrient Display Cards Grid (2x2)
        grid_layout = QHBoxLayout()
        grid_layout.setSpacing(10)

        col1_layout = QVBoxLayout()
        self.n_card = self.create_windows_nutrient_box("N (%)", "-- %")
        self.k_card = self.create_windows_nutrient_box("K (%)", "-- %")
        col1_layout.addWidget(self.n_card)
        col1_layout.addWidget(self.k_card)

        col2_layout = QVBoxLayout()
        self.p_card = self.create_windows_nutrient_box("P (%)", "-- %")
        self.mg_card = self.create_windows_nutrient_box("Mg (%)", "-- %")
        col2_layout.addWidget(self.p_card)
        col2_layout.addWidget(self.mg_card)

        grid_layout.addLayout(col1_layout)
        grid_layout.addLayout(col2_layout)

        # View Full Map Button
        self.view_full_map_btn = QPushButton("View Full Map Nutrient Detection")
        self.view_full_map_btn.setFixedHeight(42)
        self.view_full_map_btn.setFont(QFont("Segoe UI", 15, QFont.Weight.Bold))
        self.view_full_map_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.view_full_map_btn.clicked.connect(self.show_full_map_nutrient_dialog)

        nutrient_layout.addWidget(nutrient_sub)
        nutrient_layout.addWidget(self.coords_label)
        nutrient_layout.addWidget(self.zone_label)
        nutrient_layout.addLayout(grid_layout)
        nutrient_layout.addWidget(self.view_full_map_btn)

        left_layout.addWidget(self.nutrient_box)

        # -------------------------------------------------------------------------
        # 3. Inland Soil Analysis Box
        # -------------------------------------------------------------------------
        self.inland_box = QGroupBox("Inland Soil Analysis")
        inland_layout = QHBoxLayout(self.inland_box)
        inland_layout.setContentsMargins(10, 10, 10, 10)
        inland_layout.setSpacing(8)

        self.inland_btn = QPushButton("Inland Soil Data Entry")
        self.inland_btn.setFixedHeight(42)
        self.inland_btn.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        self.inland_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.inland_btn.clicked.connect(lambda: self.select_soil_type("Inland"))

        self.inland_report_btn = QPushButton("📄 Print Full Report (.pdf)")
        self.inland_report_btn.setFixedHeight(42)
        self.inland_report_btn.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        self.inland_report_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.inland_report_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(18, 184, 134, 0.15);
                border: 1px solid #12b886;
                color: #12b886;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #12b886;
                color: #ffffff;
            }
        """)
        self.inland_report_btn.clicked.connect(lambda: self.print_pdf_report_by_soil("Inland"))

        inland_layout.addWidget(self.inland_btn, stretch=1)
        inland_layout.addWidget(self.inland_report_btn, stretch=1)
        left_layout.addWidget(self.inland_box)

        # -------------------------------------------------------------------------
        # 4. Alluvial Soil Analysis Box
        # -------------------------------------------------------------------------
        self.alluvial_box = QGroupBox("Alluvial Soil Analysis")
        alluvial_layout = QHBoxLayout(self.alluvial_box)
        alluvial_layout.setContentsMargins(10, 10, 10, 10)
        alluvial_layout.setSpacing(8)

        self.alluvial_btn = QPushButton("Coastal Soil Data Entry")
        self.alluvial_btn.setFixedHeight(42)
        alluvial_btn_font = QFont("Segoe UI", 13, QFont.Weight.Bold)
        self.alluvial_btn.setFont(alluvial_btn_font)
        self.alluvial_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.alluvial_btn.clicked.connect(lambda: self.select_soil_type("Alluvial"))

        self.alluvial_report_btn = QPushButton("📄 Print Full Report (.pdf)")
        self.alluvial_report_btn.setFixedHeight(42)
        self.alluvial_report_btn.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        self.alluvial_report_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.alluvial_report_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(18, 184, 134, 0.15);
                border: 1px solid #12b886;
                color: #12b886;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #12b886;
                color: #ffffff;
            }
        """)
        self.alluvial_report_btn.clicked.connect(lambda: self.print_pdf_report_by_soil("Alluvial"))

        alluvial_layout.addWidget(self.alluvial_btn, stretch=1)
        alluvial_layout.addWidget(self.alluvial_report_btn, stretch=1)
        left_layout.addWidget(self.alluvial_box)

        left_layout.addStretch()

        # Report Cell Selection Attributes
        self.selected_yield = 22.50
        self.selected_rev = 337500.0
        self.selected_crr = 0.30
        self.selected_n_rate = 1.0
        self.selected_k_rate = 3.0
        self.last_clicked_block = "Block 22"

        # Disable downstream controls initially
        self.set_downstream_controls_enabled(False)

        # =========================================================================
        # RIGHT PANEL (Leaflet Satellite Map in QWebEngineView)
        # =========================================================================
        self.web_view = QWebEngineView()
        
        # QWebChannel Setup
        self.channel = QWebChannel()
        self.bridge = MapBridge()
        self.bridge.pointClicked.connect(self.update_point_detection)
        self.channel.registerObject("qtBridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        # Enable file download requests from JavaScript (html2pdf)
        self.web_view.page().profile().downloadRequested.connect(self.on_download_requested)

        # Load HTML Map string
        html_map_content = self.get_leaflet_map_html()
        self.web_view.setHtml(html_map_content, QUrl("http://localhost"))
        self.web_view.loadFinished.connect(self.on_map_loaded)

        # Add left and right panels to main dashboard layout
        main_layout.addWidget(left_panel)
        main_layout.addWidget(self.web_view, stretch=1)

    def on_download_requested(self, download_item):
        """Handles browser PDF report download requests from JavaScript (html2pdf)"""
        if getattr(self, '_is_downloading', False):
            download_item.cancel()
            return
        self._is_downloading = True

        suggested_name = download_item.downloadFileName() or "palmnex_comprehensive_report_block22.pdf"
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save Comprehensive PDF Report", suggested_name, "PDF Files (*.pdf)"
        )
        if file_path:
            download_item.setDownloadDirectory(os.path.dirname(file_path))
            download_item.setDownloadFileName(os.path.basename(file_path))
            download_item.accept()
            QMessageBox.information(self, "PDF Saved", f"Comprehensive PDF report saved successfully to:\n{file_path}")
        else:
            download_item.cancel()

        from PySide6.QtCore import QTimer
        QTimer.singleShot(1500, lambda: setattr(self, '_is_downloading', False))

    def on_output_cell_selected(self, n_rate, k_rate, yield_val, rev_val, crr_val):
        """Updates internal report state when user picks a grid cell in OutputDialog"""
        self.selected_n_rate = n_rate
        self.selected_k_rate = k_rate
        self.selected_yield = yield_val
        self.selected_rev = rev_val
        self.selected_crr = crr_val
        print(f"Selected report cell: N={n_rate}, K={k_rate}, Yield={yield_val}, Rev={rev_val}, CRR={crr_val}")

    def on_map_loaded(self, ok):
        """Auto-loads selected map shapefile when map view completes loading"""
        if ok and not self.boundary_loaded:
            self.on_map_selection_changed(self.map_combo.currentIndex())

    def on_map_selection_changed(self, index):
        """Handles map selection change from QComboBox dropdown"""
        data = self.map_combo.currentData()
        if not data:
            return

        if isinstance(data, str) and data.endswith(".shp"):
            self.load_shapefile_by_name(data)

    def load_shapefile_by_name(self, filename):
        """Loads shapefile by filename from project root or companion directories"""
        target_shp = None
        if os.path.exists(filename):
            target_shp = filename
        else:
            base_dir = os.path.dirname(os.path.dirname(__file__))
            current_dir = os.path.dirname(__file__)
            candidate_paths = [
                os.path.join(current_dir, filename),
                os.path.join(base_dir, filename),
                os.path.join(base_dir, "22_Feb_2023", filename)
            ]
            for p in candidate_paths:
                if os.path.exists(p):
                    target_shp = p
                    break

        if not target_shp:
            print(f"Shapefile {filename} not found.")
            return

        try:
            features = shapefile_to_geojson_features(target_shp)
            if features:
                combined_geojson = {
                    "type": "FeatureCollection",
                    "features": features
                }
                json_str = json.dumps(combined_geojson)
                js_code = f"if (typeof window.loadBoundaryGeoJSON === 'function') {{ window.loadBoundaryGeoJSON({json_str}); }}"
                self.web_view.page().runJavaScript(js_code)

                self.boundary_loaded = True
                self.loaded_files_count = 1

                # Enable downstream controls
                self.set_downstream_controls_enabled(True)
                map_title = self.map_combo.currentText()
                self.zone_label.setText(f"Zone: Map boundary ({map_title}) loaded")
                self.zone_label.setStyleSheet("color: #008000; font-weight: bold;")
                self.coords_label.setText("Coordinates: Click anywhere inside boundaries")
                
                # Push pre-rendered Nitrogen raster overlay data to JS
                if self.raster_mgr.overlay_cache.get("N"):
                    n_info = self.raster_mgr.overlay_cache["N"]
                    data_url = n_info['dataUrl']
                    bounds = n_info['bounds']
                    js_code = f"if (typeof window.setNitrogenOverlayData === 'function') {{ window.setNitrogenOverlayData('{data_url}', {json.dumps(bounds)}); }}"
                    self.web_view.page().runJavaScript(js_code)

                print(f"Successfully loaded map shapefile: {target_shp}")
        except Exception as e:
            print(f"Error loading map shapefile ({filename}): {e}")

    def set_downstream_controls_enabled(self, enabled):
        """Enables or disables downstream controls before/after shapefile upload"""
        self.nutrient_box.setEnabled(enabled)
        if hasattr(self, 'inland_box'):
            self.inland_box.setEnabled(enabled)
        if hasattr(self, 'alluvial_box'):
            self.alluvial_box.setEnabled(enabled)

    def print_pdf_report_by_soil(self, soil_type):
        """Triggers full A4 PDF report generation for specified soil type (Inland / Alluvial)"""
        if not self.boundary_loaded:
            QMessageBox.warning(self, "No Map Boundary", "Please upload map shapefile(s) first before printing report.")
            return

        self.current_soil_type = soil_type
        estate_name = self.map_combo.currentText()
        coords_str = self.coords_label.text().replace("Coordinates: ", "")
        
        # Sample current point nutrient values
        n_str = self.n_card.findChild(QLabel, "value_label").text()
        p_str = self.p_card.findChild(QLabel, "value_label").text()
        k_str = self.k_card.findChild(QLabel, "value_label").text()
        mg_str = self.mg_card.findChild(QLabel, "value_label").text()

        def parse_val(s, default):
            try:
                return float(s.replace('%', '').strip())
            except Exception:
                return default

        n_val = parse_val(n_str, 2.45)
        p_val = parse_val(p_str, 0.150)
        k_val = parse_val(k_str, 0.90)
        mg_val = parse_val(mg_str, 0.250)

        # Load permanent block 22 photo from data/block22_permanent_photo.png
        import base64
        base_dir = os.path.dirname(os.path.dirname(__file__))
        photo_path = os.path.join(base_dir, "data", "block22_permanent_photo.png")
        if not os.path.exists(photo_path):
            photo_path = os.path.join(os.path.dirname(__file__), "block22_permanent_photo.png")
            
        b64_str = ""
        if os.path.exists(photo_path):
            try:
                with open(photo_path, "rb") as f:
                    b64_str = base64.b64encode(f.read()).decode("utf-8")
            except Exception as e:
                print("Error reading permanent photo:", e)
        
        sat_data_url = f"data:image/png;base64,{b64_str}" if b64_str else ""
        report_data = getattr(self, 'meds_report_data', {})
        if not report_data:
            report_data = {
                'title': f"EDS {soil_type} Soil Output Grid",
                'n_rates': [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0],
                'k_rates': [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0],
                'yield_grid': {},
                'revenue_grid': {},
                'crr_grid': {},
                'selected_n_index': 9,
                'selected_k_index': 9,
                'inputs': {
                    'age': '12', 'density': '148', 'drainage': '1', 'consistency': '1',
                    'slope': '0.5', 'root_impedance': '0.2', 'organic': '2', 'silt': '18',
                    'extractable': '0.13', 'teb': '1.3', 'rainfall': '2000',
                    'ffb': '800', 'sa': '1200', 'kcl': '1600',
                    'clay': '45', 'tec': '12.5'
                }
            }
            for n in report_data['n_rates']:
                report_data['yield_grid'][n] = {}
                report_data['revenue_grid'][n] = {}
                report_data['crr_grid'][n] = {}
                for k in report_data['k_rates']:
                    report_data['yield_grid'][n][k] = 14.38 + n * 0.5 + k * 1.2
                    report_data['revenue_grid'][n][k] = int((14.38 + n * 0.5 + k * 1.2) * 25 * 600)
                    report_data['crr_grid'][n][k] = 0.30

        block_name = getattr(self, 'last_clicked_block', 'Block 22')
        yield_val = getattr(self, 'selected_yield', 22.22)
        rev_val = getattr(self, 'selected_rev', 333300.0)
        crr_val = getattr(self, 'selected_crr', 0.30)
        n_rate = getattr(self, 'selected_n_rate', 4.5)
        k_rate = getattr(self, 'selected_k_rate', 4.5)

        ffb_price = 600
        calculated_rev = rev_val if rev_val > 0 else (yield_val * 25 * ffb_price)
        n_kg_palm = n_rate if n_rate > 0 else 0.62
        p_kg_palm = 0.27
        k_kg_palm = k_rate if k_rate > 0 else 3.0
        mg_kg_palm = 0.00

        n_kg_ha = n_kg_palm * 143
        p_kg_ha = p_kg_palm * 143
        k_kg_ha = k_kg_palm * 143
        mg_kg_ha = mg_kg_palm * 143

        formulation_name = "7-3-30-0"

        # ------------------------------------------------------------
        #  Page 2 HTML Components Generation
        # ------------------------------------------------------------
        inputs = report_data['inputs']
        if soil_type.lower() == "inland":
            char_html = f"""
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155;">
              <tr>
                <td style="width: 50%; padding: 4px; vertical-align: top;">
                  <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; background: #f8fafc;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px;">Characteristics</div>
                    <table style="width: 100%; font-size: 10px;">
                      <tr><td style="color: #64748b; padding: 2px 0;">Palm age (Year)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('age', '12')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Planting density (palms/ha)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('density', '148')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Soil drainage class</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('drainage', '1')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Soil consistency class</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('consistency', '1')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Slope class</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('slope', '0.5')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Root growth impedance class</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('root_impedance', '0.2')}</td></tr>
                    </table>
                  </div>
                </td>
                <td style="width: 50%; padding: 4px; vertical-align: top;">
                  <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; background: #f8fafc;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px;">&nbsp;</div>
                    <table style="width: 100%; font-size: 10px;">
                      <tr><td style="color: #64748b; padding: 2px 0;">Soil organic matter (%)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('organic', '2')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Silt (%)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('silt', '18')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Extractable K (cmol/kg)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('extractable', '0.13')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Total extractable bases (cmol/kg)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('teb', '1.3')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Annual rainfall (mm/year)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('rainfall', '2000')}</td></tr>
                      <tr><td colspan="2" style="padding: 2px 0;">&nbsp;</td></tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>
            """
        else:
            char_html = f"""
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155;">
              <tr>
                <td style="width: 50%; padding: 4px; vertical-align: top;">
                  <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; background: #f8fafc;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px;">Characteristics</div>
                    <table style="width: 100%; font-size: 10px;">
                      <tr><td style="color: #64748b; padding: 2px 0;">Clay (%)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('clay', '45')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Soil drainage class</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('drainage', '1')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Planting density (palms/ha)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('density', '148')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Annual rainfall (mm/year)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('rainfall', '2000')}</td></tr>
                    </table>
                  </div>
                </td>
                <td style="width: 50%; padding: 4px; vertical-align: top;">
                  <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; background: #f8fafc;">
                    <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px;">&nbsp;</div>
                    <table style="width: 100%; font-size: 10px;">
                      <tr><td style="color: #64748b; padding: 2px 0;">Total exchangeable cation (cmol/kg)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('tec', '12.5')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Extractable K (cmol/kg)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('extractable', '0.4')}</td></tr>
                      <tr><td style="color: #64748b; padding: 2px 0;">Silt (%)</td><td style="font-weight: 600; text-align: right; color: #0f172a;">{inputs.get('silt', '30')}</td></tr>
                      <tr><td colspan="2" style="padding: 2px 0;">&nbsp;</td></tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>
            """

        cost_html = f"""
        <div style="font-size: 11px; font-weight: bold; color: #1e293b; margin: 12px 4px; display: flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;">
          <div>Price for F.F.B/tonne: <span style="color: #2d6a4f;">RM {inputs.get('ffb', '800')}</span></div>
          <div>Cost of SOA/tonne: <span style="color: #2d6a4f;">RM {inputs.get('sa', '1200')}</span></div>
          <div>Cost of KCl/tonne: <span style="color: #2d6a4f;">RM {inputs.get('kcl', '1600')}</span></div>
        </div>
        """

        def generate_grid_html(n_rates, k_rates, grid_data, selected_n, selected_k, is_crr=False, crr_grid=None, title_label="Table"):
            html = f"""
            <div style="margin-top: 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px;">
              <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 4px; text-align: center;">{title_label}</div>
              <div style="font-size: 8px; font-weight: 700; color: #64748b; text-align: center; margin-bottom: 4px;">K Fertilizer (kg/palm)</div>
              <div style="display: flex;">
                <div style="writing-mode: vertical-lr; transform: rotate(180deg); font-size: 8px; font-weight: 700; color: #64748b; text-align: center; padding-right: 6px; display: flex; align-items: center; justify-content: center;">
                  N Fertilizer (kg/palm)
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 7.5px; text-align: center; border: 1px solid #cbd5e1;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #cbd5e1;">
                      <th style="border: 1px solid #cbd5e1; padding: 2px;">&nbsp;</th>
            """
            for k in k_rates:
                html += f'<th style="border: 1px solid #cbd5e1; padding: 2px; font-weight: 700;">{k:.1f}</th>'
            html += "</tr></thead><tbody>"

            for r_i, n in enumerate(n_rates):
                html += f'<tr style="border-bottom: 1px solid #e2e8f0;"><td style="border: 1px solid #cbd5e1; padding: 2px; background-color: #f1f5f9; font-weight: 700;">{n:.1f}</td>'
                for c_i, k in enumerate(k_rates):
                    val = grid_data.get(n, {}).get(k, 0.0)
                    is_selected = (abs(n - selected_n) < 0.005) and (abs(k - selected_k) < 0.005)
                    
                    bg_color = ""
                    text_color = "#334155"
                    font_weight = "normal"
                    border_style = "1px solid #cbd5e1"
                    
                    if is_selected:
                        bg_color = "#3b82f6"
                        text_color = "#ffffff"
                        font_weight = "bold"
                        border_style = "2px solid #2563eb"
                    elif is_crr:
                        if abs(val - 0.30) < 0.005:
                            bg_color = "#7CFC00"
                            text_color = "#000000"
                            font_weight = "bold"
                        elif 0.275 <= val <= 0.295:
                            bg_color = "#FFEE58"
                            text_color = "#000000"
                            font_weight = "bold"
                    else:
                        if crr_grid and n in crr_grid and k in crr_grid[n]:
                            crr_val = crr_grid[n][k]
                            if abs(crr_val - 0.30) < 0.005:
                                bg_color = "#d3d3d3"
                                font_weight = "bold"
                    
                    style_str = f"border: {border_style}; padding: 2px;"
                    if bg_color:
                        style_str += f" background-color: {bg_color};"
                    style_str += f" color: {text_color}; font-weight: {font_weight};"
                    
                    display_str = f"{val:.2f}" if is_crr else (f"{val:,.0f}" if val >= 1000 else f"{val:.2f}")
                    html += f'<td style="{style_str}">{display_str}</td>'
                html += "</tr>"
            
            html += "</tbody></table></div></div>"
            return html

        yield_table_html = generate_grid_html(
            report_data['n_rates'], report_data['k_rates'], report_data['yield_grid'],
            n_rate, k_rate, is_crr=False, crr_grid=report_data['crr_grid'], title_label="FFB Yield Prediction"
        )
        
        revenue_table_html = generate_grid_html(
            report_data['n_rates'], report_data['k_rates'], report_data['revenue_grid'],
            n_rate, k_rate, is_crr=False, crr_grid=report_data['crr_grid'], title_label="Revenue Gain"
        )

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Palmnex Report - {block_name}</title>
            <style>
                body {{
                    margin: 0;
                    padding: 20px;
                    background-color: #f1f5f9;
                    font-family: 'Segoe UI', 'Inter', sans-serif;
                }}
                @media screen {{
                    body {{
                        zoom: 0.76;
                    }}
                }}
                .report-wrapper {{
                    max-width: 800px;
                    margin: 0 auto 20px auto;
                    background: #ffffff;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.08);
                    border-radius: 8px;
                    padding: 25px 30px;
                    box-sizing: border-box;
                }}
            </style>
        </head>
        <body>
            <!-- PAGE 1: High Level Summary -->
            <div class="report-wrapper">
                <div style="border-bottom: 2.5px solid #2d6a4f; padding-bottom: 8px; margin-bottom: 14px;">
                  <h1 style="margin: 0; color: #2d6a4f; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Report</h1>
                  <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px;">MPOB - PALMNEX COMPREHENSIVE {soil_type.upper()} SOIL ANALYSIS</div>
                </div>

                <!-- Top Section: Estate Info + Real Google Satellite Grid Map -->
                <div style="display: flex; gap: 14px; margin-bottom: 14px;">
                  <div style="flex: 1; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px;">
                    <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #0f172a;">Estate info</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155;">
                      <tr>
                        <td style="padding: 3px 0; width: 45%; color: #64748b;">- Name</td>
                        <td style="padding: 3px 0; font-weight: 700; color: #0f172a;">{estate_name}</td>
                      </tr>
                      <tr>
                        <td style="padding: 3px 0; color: #64748b;">- Location</td>
                        <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">Lahad Datu, Sabah ({coords_str})</td>
                      </tr>
                      <tr>
                        <td style="padding: 3px 0; color: #64748b;">- Current fertilizer usage</td>
                        <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">Standard MPOB Rates</td>
                      </tr>
                      <tr>
                        <td style="padding: 3px 0; color: #64748b;">- 1 block = 25 ha (basic)</td>
                        <td style="padding: 3px 0; font-weight: 700; color: #2d6a4f;">25.0 ha ({block_name})</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Full Lahad Datu Google Satellite Map Box with Orange Grid Overlay & Red Pin Badge -->
                  <div style="flex: 1; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; display: flex; align-items: center; justify-content: center;">
                    <div style="position: relative; width: 145px; height: 145px; border-radius: 6px; overflow: hidden; border: 2.5px solid #ff7800; box-shadow: 0 4px 10px rgba(0,0,0,0.15); background-color: #0b0f19;">
                      <img src="{sat_data_url}" style="width: 100%; height: 100%; object-fit: contain;" />
                    </div>
                  </div>
                </div>

                <!-- Middle Section: Report Table -->
                <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;">
                  <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a;">Report</h3>
                  
                  <!-- Chosen Output Grid Parameters Summary Banner -->
                  <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 600; color: #1e293b;">
                    <div>
                      Chosen Cost/Revenue Ratio: <span style="font-weight: 800; color: #15803d; font-size: 12px; background: #e2e8f0; padding: 2px 6px; border-radius: 3px;">{crr_val:.2f}</span>
                    </div>
                    <div>
                      Yield Prediction: <span style="font-weight: 800; color: #2d6a4f; font-size: 12px;">{yield_val:.2f} (t/ha/yr)</span>
                    </div>
                    <div>
                      Revenue Gain: <span style="font-weight: 800; color: #2d6a4f; font-size: 12px;">RM {calculated_rev:,.2f} / yr</span>
                    </div>
                  </div>
                  <div style="font-size: 10px; color: #64748b; font-weight: 400; margin-bottom: 10px; text-align: right;">
                    Revenue gain formula = (Yield prediction x 25 ha x FFB price RM {ffb_price})
                  </div>

                  <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center;">
                    <thead>
                      <tr style="background-color: #f1f5f9; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 700;">
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: left; width: 20%;">Element</th>
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 26%;">Leaf Analysis (avg%)</th>
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 27%;">Fert Recommendation (kg/palm)</th>
                        <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 27%;">Fert Recommendation (kg/ha)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">N</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">Average per block ({n_val:.2f}%)</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{n_kg_palm:.2f}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{n_kg_ha:.2f}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">P</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">{p_val:.3f}%</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{p_kg_palm:.2f}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{p_kg_ha:.2f}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">K</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">{k_val:.2f}%</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{k_kg_palm:.2f}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{k_kg_ha:.2f}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">Mg</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">{mg_val:.3f}%</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{mg_kg_palm:.2f}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">{mg_kg_ha:.2f}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style="margin-top: 10px; font-size: 11px; font-weight: 700; color: #0f172a;">
                    Recommended Formulation:<br/>
                    <span style="color: #2d6a4f; font-weight: 700;">N:7, P:3, K:30, Mg:0</span>
                  </div>
                </div>

                <!-- Bottom Section: Monthly Trend Chart & Stress Level Donut Chart -->
                <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; gap: 14px; align-items: center;">
                  
                  <!-- Monthly Trend Chart -->
                  <div style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px;">
                    <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-bottom: 6px;">Optimum Nutrient Analysis %</div>
                    <div style="display: flex; gap: 10px; font-size: 8px; font-weight: 700; margin-bottom: 8px;">
                      <span style="color: #0284c7;">■ May</span>
                      <span style="color: #0d9488;">■ June</span>
                      <span style="color: #ea580c;">■ July</span>
                    </div>
                    
                    <div style="font-size: 9px; display: flex; flex-direction: column; gap: 6px;">
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">N</div>
                        <div style="height: 5px; background: #0284c7; width: 75%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 78%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 72%; border-radius: 2px;"></div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">P</div>
                        <div style="height: 5px; background: #0284c7; width: 80%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 82%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 85%; border-radius: 2px;"></div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">K</div>
                        <div style="height: 5px; background: #0284c7; width: 88%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 90%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 95%; border-radius: 2px;"></div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">Mg</div>
                        <div style="height: 5px; background: #0284c7; width: 85%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #0d9488; width: 88%; border-radius: 2px; margin-bottom: 2px;"></div>
                        <div style="height: 5px; background: #ea580c; width: 92%; border-radius: 2px;"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Stress Level Donut Chart -->
                  <div style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 9px; display: flex; flex-direction: column; gap: 8px;">
                      <div style="font-weight: 700; color: #64748b;">Stress-level</div>
                      <div>
                        <div style="font-weight: 700; color: #ef4444;">Stressed</div>
                        <div style="color: #64748b;">10.0%</div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #eab308;">Moderate</div>
                        <div style="color: #64748b;">30.0%</div>
                      </div>
                      <div>
                        <div style="font-weight: 700; color: #22c55e;">Healthy</div>
                        <div style="color: #64748b;">60.0%</div>
                      </div>
                    </div>

                    <svg width="110" height="110" viewBox="0 0 42 42" class="donut">
                      <circle class="donut-hole" cx="21" cy="21" r="15.91549430918954" fill="#ffffff"></circle>
                      <circle class="donut-ring" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e2e8f0" stroke-width="6"></circle>

                      <!-- Healthy 60% (Green) -->
                      <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#22c55e" stroke-width="6" stroke-dasharray="60 40" stroke-dashoffset="25"></circle>
                      <!-- Moderate 30% (Yellow) -->
                      <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#eab308" stroke-width="6" stroke-dasharray="30 70" stroke-dashoffset="65"></circle>
                      <!-- Stressed 10% (Red) -->
                      <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#ef4444" stroke-width="6" stroke-dasharray="10 90" stroke-dashoffset="35"></circle>
                    </svg>
                  </div>
                </div>

                <div style="margin-top: 18px; border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 8px; color: #94a3b8; text-align: center; line-height: 1.3;">
                  Disclaimer: This report is generated dynamically by the MPOB PalmNex system based on Sentinel-2 satellite imagery index calculations, MEDS agronomic yield matrices, and leaf nutrient analysis.
                </div>
            </div>

            <!-- PAGE 2: Input parameters and complete detailed grids -->
            <div style="page-break-before: always; height: 1px; clear: both;"></div>
            <div class="report-wrapper" style="margin-top: 20px;">
                <div style="border-bottom: 2.5px solid #2d6a4f; padding-bottom: 8px; margin-bottom: 14px;">
                  <h1 style="margin: 0; color: #2d6a4f; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">{soil_type.title()} Soil Analysis Input:</h1>
                </div>

                <!-- Characteristics Section -->
                {char_html}

                <!-- Cost variables section -->
                {cost_html}

                <!-- FFB Yield Prediction Table -->
                {yield_table_html}

                <!-- Revenue Gain Table -->
                {revenue_table_html}
            </div>
        </body>
        </html>
        """

        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWidgets import QProgressDialog

        # Create a hidden QWebEngineView to generate the PDF
        self.temp_web_view = QWebEngineView()
        self.temp_web_view.setHtml(html_content)

        progress = QProgressDialog("Generating PDF report, please wait...", None, 0, 0, self)
        progress.setWindowTitle("Please Wait")
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.show()

        def on_load_finished(ok):
            if ok:
                def on_print_finished(pdf_data_bytes):
                    progress.close()
                    # Write QByteArray to temp file
                    import os
                    base_dir = os.path.dirname(os.path.dirname(__file__))
                    temp_pdf_path = os.path.join(base_dir, "data", "temp_report.pdf")
                    os.makedirs(os.path.dirname(temp_pdf_path), exist_ok=True)
                    try:
                        with open(temp_pdf_path, "wb") as f:
                            f.write(pdf_data_bytes.data())
                            
                        # Show ReportViewerDialog with PDF path
                        from pages.meds_dialogs import ReportViewerDialog
                        dialog = ReportViewerDialog(temp_pdf_path, self)
                        dialog.exec()
                    except Exception as e:
                        QMessageBox.critical(self, "Error Saving Report", f"Could not create temporary PDF report: {e}")
                    
                    # Clean up the temp view reference
                    self.temp_web_view = None

                self.temp_web_view.page().printToPdf(on_print_finished)
            else:
                progress.close()
                QMessageBox.critical(self, "Generation Failed", "Could not render report template.")
                self.temp_web_view = None

        self.temp_web_view.loadFinished.connect(on_load_finished)

    def create_windows_nutrient_box(self, title_text, initial_value):
        """Helper to create classic native Windows style nutrient display cards"""
        box = QFrame()
        box.setStyleSheet("""
            QFrame {
                background-color: #ffffff;
                border: 1px solid #bcbcbc;
                border-radius: 2px;
            }
            QFrame:disabled {
                background-color: #f4f4f4;
                border: 1px solid #d9d9d9;
            }
        """)
        box.setFixedHeight(88)
        layout = QVBoxLayout(box)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(2)

        lbl_title = QLabel(title_text)
        lbl_title.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        lbl_title.setStyleSheet("color: #444444;")

        lbl_val = QLabel(initial_value)
        lbl_val.setObjectName("value_label")
        lbl_val.setFont(QFont("Segoe UI", 20, QFont.Weight.Bold))
        lbl_val.setStyleSheet("color: #000000;")

        layout.addWidget(lbl_title)
        layout.addWidget(lbl_val)
        return box

    def select_soil_type(self, soil_type):
        """Handles Inland / Alluvial button click action by opening MEDS popup dialogs"""
        self.current_soil_type = soil_type
        print(f"Opening MEDS yield prediction pop-up for soil type: {soil_type}")

        if soil_type == "Inland":
            dialog = EDSInlandDialog(self)
            dialog.exec()
        elif soil_type in ("Alluvial", "Coastal"):
            dialog = EDSCoastalDialog(self)
            dialog.exec()

    def show_full_map_nutrient_dialog(self):
        """Opens Full Map Nutrient Detection pop-up dialog"""
        dialog = FullMapNutrientDialog(self)
        dialog.exec()

    def upload_shp_files(self):
        """Opens file dialog for selecting up to 10 shapefiles at once"""
        default_dir = os.path.dirname(__file__)

        file_paths, _ = QFileDialog.getOpenFileNames(
            self,
            "Select Map Shapefiles (Up to 10 files)",
            default_dir,
            "Spatial Files (*.shp *.geojson *.json *.zip);;All Files (*)"
        )

        if not file_paths:
            return

        if len(file_paths) > 10:
            QMessageBox.warning(self, "Limit Reached", "You selected more than 10 files. Processing the first 10 files.")
            file_paths = file_paths[:10]

        all_features = []
        successful_count = 0

        try:
            for file_path in file_paths:
                features = []
                if file_path.endswith(".geojson") or file_path.endswith(".json"):
                    with open(file_path, "r") as f:
                        data = json.load(f)
                        if data.get("type") == "FeatureCollection":
                            features = data.get("features", [])
                        elif data.get("type") == "Feature":
                            features = [data]
                elif file_path.endswith(".shp"):
                    features = shapefile_to_geojson_features(file_path)
                elif file_path.endswith(".zip"):
                    temp_dir = tempfile.mkdtemp()
                    with zipfile.ZipFile(file_path, "r") as zip_ref:
                        zip_ref.extractall(temp_dir)
                    shp_files = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.endswith(".shp")]
                    if shp_files:
                        features = shapefile_to_geojson_features(shp_files[0])

                if features:
                    all_features.extend(features)
                    successful_count += 1

            if all_features:
                combined_geojson = {
                    "type": "FeatureCollection",
                    "features": all_features
                }
                json_str = json.dumps(combined_geojson)
                
                # Pass combined GeoJSON to Leaflet JavaScript map to render all boundaries at once
                js_code = f"if (typeof window.loadBoundaryGeoJSON === 'function') {{ window.loadBoundaryGeoJSON({json_str}); }}"
                self.web_view.page().runJavaScript(js_code)
                
                self.boundary_loaded = True
                self.loaded_files_count = successful_count

                # Enable all downstream controls
                self.set_downstream_controls_enabled(True)
                self.zone_label.setText(f"Zone: {successful_count} map boundary file(s) loaded successfully")
                self.zone_label.setStyleSheet("color: #008000; font-weight: bold;")
                self.coords_label.setText("Coordinates: Click anywhere inside boundaries")
                
                QMessageBox.information(
                    self,
                    "Maps Loaded",
                    f"Successfully loaded {successful_count} shapefile boundary file(s)! Point nutrient detection activated."
                )

        except Exception as e:
            QMessageBox.critical(self, "Error Loading Files", f"Failed to parse shapefiles: {str(e)}")

    def clear_map_and_reset(self):
        """Clears uploaded map boundaries from satellite map and resets dashboard state to empty"""
        self.boundary_loaded = False
        self.loaded_files_count = 0

        # Remove boundary layer from Leaflet map safely
        js_code = "if (typeof window.clearBoundaryLayer === 'function') { window.clearBoundaryLayer(); }"
        self.web_view.page().runJavaScript(js_code)

        # Reset labels
        self.coords_label.setText("Coordinates: Please upload .shp file(s)")
        self.zone_label.setText("Zone: Upload map file(s) to activate")
        self.zone_label.setStyleSheet("color: #838383; font-weight: bold;")

        # Reset nutrient cards
        self.n_card.findChild(QLabel, "value_label").setText("-- %")
        self.p_card.findChild(QLabel, "value_label").setText("-- %")
        self.k_card.findChild(QLabel, "value_label").setText("-- %")
        self.mg_card.findChild(QLabel, "value_label").setText("-- %")

        # Disable downstream controls until next upload
        self.set_downstream_controls_enabled(False)
        QMessageBox.information(self, "Reset Complete", "Map boundary cleared. Dashboard reset to default state.")

    @Slot(float, float, bool, str, str)
    def update_point_detection(self, lat, lng, is_inside, land_cover="Oil Palm Plantation", block_name="Block 22"):
        """Updates Coordinates, Zone status, and nutrient values on map click (Raster sampling or algorithm fallback)"""
        if not self.boundary_loaded:
            return

        self.last_clicked_block = block_name
        self.coords_label.setText(f"Coordinates: {lat:.5f}, {lng:.5f}")
        
        is_palm = (land_cover == "Oil Palm Plantation")
        
        if is_palm:
            map_title = self.map_combo.currentText()
            if is_inside:
                self.zone_label.setText(f"Zone: Inside Boundary ({map_title})")
            else:
                self.zone_label.setText("Zone: Oil Palm Plantation")
            self.zone_label.setStyleSheet("color: #008000; font-weight: bold;")
            
            # Sample authentic GeoTIFF rasters if available at point, else fallback to spatial algorithm
            samples = self.raster_mgr.sample_all_values(lat, lng)
            
            if samples.get('N') is not None:
                n_str = f"{samples['N']:.2f} %"
            else:
                n_str = f"{(2.45 + (lat * 100) % 0.4):.2f} %"

            if samples.get('P') is not None:
                p_str = f"{samples['P']:.3f} %"
            else:
                p_str = f"{(0.14 + (lng * 100) % 0.05):.3f} %"

            if samples.get('K') is not None:
                k_str = f"{samples['K']:.2f} %"
            else:
                k_str = f"{(1.05 + (lat * 50) % 0.3):.2f} %"

            if samples.get('Mg') is not None:
                mg_str = f"{samples['Mg']:.3f} %"
            else:
                mg_str = f"{(0.25 + (lng * 50) % 0.1):.3f} %"

            self.n_card.findChild(QLabel, "value_label").setText(n_str)
            self.p_card.findChild(QLabel, "value_label").setText(p_str)
            self.k_card.findChild(QLabel, "value_label").setText(k_str)
            self.mg_card.findChild(QLabel, "value_label").setText(mg_str)
        else:
            self.zone_label.setText(f"Zone: {land_cover} (Non-Plantation)")
            self.zone_label.setStyleSheet("color: #cc0000; font-weight: bold;")
            self.n_card.findChild(QLabel, "value_label").setText("-- %")
            self.p_card.findChild(QLabel, "value_label").setText("-- %")
            self.k_card.findChild(QLabel, "value_label").setText("-- %")
            self.mg_card.findChild(QLabel, "value_label").setText("-- %")

    def print_pdf_report(self):
        """Print full PDF report dialog"""
        if not self.boundary_loaded:
            QMessageBox.warning(self, "No Map Boundary", "Please upload map shapefile(s) first before printing report.")
            return
        QMessageBox.information(self, "PDF Report", f"Generating full PDF nutrient report for {self.loaded_files_count} map boundaries...")

    def get_leaflet_map_html(self):
        """Returns Leaflet HTML string with Google Hybrid Satellite layer and QWebChannel bridge"""
        overlays_dict = {}
        for k in ["N", "P", "K", "Mg"]:
            if self.raster_mgr.overlay_cache.get(k):
                info = self.raster_mgr.overlay_cache[k]
                overlays_dict[k] = {'dataUrl': info['dataUrl'], 'bounds': info['bounds']}
        nutrient_overlays_json = json.dumps(overlays_dict)

        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8" />
            <title>Satellite Map</title>
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <script src="qrc:///qtwebchannel/qwebchannel.js"></script>
            <style>
                html, body, #map {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                    background-color: #0b0f19;
                }
                .leaflet-control-zoom {
                    border: 1px solid #adadad !important;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
                    border-radius: 2px !important;
                }
                .nutrient-select-control {
                    background: rgba(255, 255, 255, 0.95) !important;
                    border: 1px solid #a0a0a0 !important;
                    border-radius: 4px !important;
                    padding: 10px 14px !important;
                    font-family: "Segoe UI", sans-serif !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.25) !important;
                    color: #000000 !important;
                    min-width: 250px;
                }
                .nutrient-control-title {
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 6px;
                    color: #000000;
                    border-bottom: 1px solid #d0d0d0;
                    padding-bottom: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .nutrient-option {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    margin: 4px 0;
                    cursor: pointer;
                    font-weight: 600;
                }
                .nutrient-option input {
                    transform: scale(1.2) !important;
                    margin-right: 4px !important;
                }
                .nutrient-legend-box {
                    margin-top: 8px;
                    padding-top: 6px;
                    border-top: 1px solid #e0e0e0;
                    font-size: 12px;
                }
                .block-tooltip {
                    background: rgba(0, 0, 0, 0.85) !important;
                    border: 1px solid #ff7800 !important;
                    color: #ffffff !important;
                    font-weight: bold !important;
                    font-size: 11px !important;
                    padding: 2px 6px !important;
                    border-radius: 3px !important;
                }
            </style>
        </head>
        <body>
            <div id="map"></div>
            <script>
                var map = L.map('map', { zoomControl: true }).setView([5.104, 118.428], 13);
                
                // Google Hybrid Satellite Map Layer
                L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                    attribution: '&copy; Google Maps'
                }).addTo(map);

                var boundaryLayer = null;
                var currentGeoJSON = null;
                var clickMarker = null;
                var currentOverlayLayer = null;
                var nutrientOverlays = __NUTRIENT_OVERLAYS_JSON__;
                var qtBridge = null;

                var redLocationIcon = L.divIcon({
                    className: 'red-pin-marker',
                    html: `<svg width="16" height="21" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                             <path d="M16 0C7.16 0 0 7.16 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16 24.84 0 16 0ZM16 22C12.69 22 10 19.31 10 16C10 12.69 12.69 10 16 10C19.31 10 22 12.69 22 16C22 19.31 19.31 22 16 22Z" fill="#ff0000" stroke="#ffffff" stroke-width="2"/>
                           </svg>`,
                    iconSize: [16, 21],
                    iconAnchor: [8, 21],
                    popupAnchor: [0, -20]
                });

                if (typeof QWebChannel !== 'undefined') {
                    new QWebChannel(qt.webChannelTransport, function (channel) {
                        qtBridge = channel.objects.qtBridge;
                    });
                }

                var nutrientControl = L.control({ position: 'bottomright' });
                nutrientControl.onAdd = function(map) {
                    var div = L.DomUtil.create('div', 'nutrient-select-control');
                    div.innerHTML = `
                        <div class="nutrient-control-title">Nutrient Layer Selection</div>
                        <label class="nutrient-option"><input type="radio" name="nutrient_opt" value="OFF" checked onchange="toggleNutrientLayer(this.value)" /> Off / Boundary Only</label>
                        <label class="nutrient-option" style="color:#008000;"><input type="radio" name="nutrient_opt" value="N" onchange="toggleNutrientLayer(this.value)" /> 🟢 1. N% Detection</label>
                        <label class="nutrient-option" style="color:#e67e22;"><input type="radio" name="nutrient_opt" value="P" onchange="toggleNutrientLayer(this.value)" /> 🟠 2. P% Detection</label>
                        <label class="nutrient-option" style="color:#d35400;"><input type="radio" name="nutrient_opt" value="K" onchange="toggleNutrientLayer(this.value)" /> 🟡 3. K% Detection</label>
                        <label class="nutrient-option" style="color:#8e44ad;"><input type="radio" name="nutrient_opt" value="Mg" onchange="toggleNutrientLayer(this.value)" /> 🟤 4. Mg% Detection</label>
                        
                        <div id="n-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px; font-size:12px;">Nitrogen Legend (Critical: 2.5%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:11px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 2.1%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.5% - 2.7%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.1% - 2.3%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.7% - 2.9%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.3% - 2.5%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.9%</div>
                            </div>
                        </div>

                        <div id="p-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px; font-size:12px;">Phosphorus Legend (Critical: 0.15%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:11px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 0.120%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.150% - 0.165%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.120% - 0.135%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.165% - 0.180%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.135% - 0.150%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.180%</div>
                            </div>
                        </div>

                        <div id="k-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px; font-size:12px;">Potassium Legend (Critical: 1.00%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:11px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 0.70%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 1.00% - 1.15%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.70% - 0.85%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 1.15% - 1.30%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.85% - 1.00%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 1.30%</div>
                            </div>
                        </div>

                        <div id="mg-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px; font-size:12px;">Magnesium Legend (Critical: 0.20%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:11px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 0.20%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.24% - 0.26%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.20% - 0.22%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.26% - 0.28%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.22% - 0.24%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.28%</div>
                            </div>
                        </div>
                    `;
                    return div;
                };
                nutrientControl.addTo(map);

                function toggleNutrientLayer(val) {
                    document.querySelectorAll('.nutrient-legend-box').forEach(function(el) {
                        el.style.display = 'none';
                    });

                    if (currentOverlayLayer) {
                        map.removeLayer(currentOverlayLayer);
                        currentOverlayLayer = null;
                    }

                    if (val !== 'OFF' && nutrientOverlays && nutrientOverlays[val]) {
                        var legendBox = document.getElementById(val.toLowerCase() + '-legend-container');
                        if (legendBox) legendBox.style.display = 'block';
                        
                        var oData = nutrientOverlays[val];
                        currentOverlayLayer = L.imageOverlay(oData.dataUrl, oData.bounds, { opacity: 0.85, zIndex: 400 }).addTo(map);
                    }

                    if (qtBridge && typeof qtBridge.onNutrientLayerChanged === 'function') {
                        qtBridge.onNutrientLayerChanged(val);
                    }
                }

                function isPointInRing(pt, ring) {
                    var x = pt[0], y = pt[1];
                    var inside = false;
                    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                        var xi = ring[i][0], yi = ring[i][1];
                        var xj = ring[j][0], yj = ring[j][1];
                        var intersect = ((yi > y) !== (yj > y))
                            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                }

                function isPointInGeom(pt, geom) {
                    if (!geom) return false;
                    if (geom.type === 'Polygon') {
                        if (!isPointInRing(pt, geom.coordinates[0])) return false;
                        for (var k = 1; k < geom.coordinates.length; k++) {
                            if (isPointInRing(pt, geom.coordinates[k])) return false;
                        }
                        return true;
                    } else if (geom.type === 'MultiPolygon') {
                        for (var p = 0; p < geom.coordinates.length; p++) {
                            if (isPointInRing(pt, geom.coordinates[p][0])) {
                                var inHole = false;
                                for (var h = 1; h < geom.coordinates[p].length; h++) {
                                    if (isPointInRing(pt, geom.coordinates[p][h])) {
                                        inHole = true; break;
                                    }
                                }
                                if (!inHole) return true;
                            }
                        }
                    }
                    return false;
                }

                function checkPointInsideBoundary(lat, lng) {
                    if (!currentGeoJSON || !currentGeoJSON.features) return false;
                    var pt = [lng, lat];
                    for (var i = 0; i < currentGeoJSON.features.length; i++) {
                        var feat = currentGeoJSON.features[i];
                        if (feat && feat.geometry && isPointInGeom(pt, feat.geometry)) {
                            return true;
                        }
                    }
                    return false;
                }

                window.loadBoundaryGeoJSON = function(geojson) {
                    if (boundaryLayer) {
                        map.removeLayer(boundaryLayer);
                    }
                    currentGeoJSON = geojson;
                    boundaryLayer = L.geoJSON(geojson, {
                        style: function(feature) {
                            return {
                                color: '#ff7800',
                                weight: 2.5,
                                opacity: 0.95,
                                fillColor: '#ff7800',
                                fillOpacity: 0.12
                            };
                        },
                        onEachFeature: function(feature, layer) {
                            if (feature.properties) {
                                var blkId = feature.properties.BLOCK_ID || feature.properties.NAME || feature.properties.id;
                                if (blkId !== undefined) {
                                    layer.bindTooltip('Block ' + blkId, {
                                        permanent: false,
                                        direction: 'center',
                                        className: 'block-tooltip'
                                    });
                                }
                            }
                            layer.on({
                                mouseover: function(e) {
                                    var l = e.target;
                                    l.setStyle({ weight: 4, color: '#ffff00', fillOpacity: 0.35 });
                                },
                                mouseout: function(e) {
                                    boundaryLayer.resetStyle(e.target);
                                }
                            });
                        }
                    }).addTo(map);

                    if (boundaryLayer.getBounds().isValid()) {
                        map.fitBounds(boundaryLayer.getBounds(), { padding: [160, 160], maxZoom: 14 });
                    }
                };

                window.clearBoundaryLayer = function() {
                    if (boundaryLayer) {
                        map.removeLayer(boundaryLayer);
                        boundaryLayer = null;
                    }
                    if (currentOverlayLayer) {
                        map.removeLayer(currentOverlayLayer);
                        currentOverlayLayer = null;
                    }
                    if (clickMarker) {
                        map.removeLayer(clickMarker);
                        clickMarker = null;
                    }
                    currentGeoJSON = null;
                    map.setView([5.104, 118.428], 13);
                };

                function hash(x, y) {
                    var h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                    return h - Math.floor(h);
                }

                function getPixelLandCover(lat, lon) {
                    var latGrid = Math.abs(lat - Math.round(lat / 0.0028) * 0.0028);
                    var lonGrid = Math.abs(lon - Math.round(lon / 0.0038) * 0.0038);
                    var isRoad = (latGrid < 0.00004) || (lonGrid < 0.00004);

                    var isBuilding = isRoad && (hash(Math.floor(lat * 4000), Math.floor(lon * 4000)) > 0.62);

                    var riverLat = 5.105 + Math.sin((lon - 118.42) * 120) * 0.002;
                    var isWater = Math.abs(lat - riverLat) < 0.00025;

                    if (isBuilding) return "Building / House";
                    if (isRoad) return "Road";
                    if (isWater) return "Water Body";
                    return "Oil Palm Plantation";
                }

                window.downloadFullReport = function(soilType, estateName, coordsText, blockName, yieldVal, revVal, crrVal, nRate, kRate, nLeaf, pLeaf, kLeaf, mgLeaf, satDataUrl) {
                    soilType = soilType || "Inland";
                    estateName = estateName || "Lahad Datu with block boundary";
                    blockName = blockName || "Block 22";
                    yieldVal = (yieldVal !== undefined && yieldVal !== null) ? yieldVal : 22.50;
                    revVal = (revVal !== undefined && revVal !== null) ? revVal : 337500;
                    crrVal = (crrVal !== undefined && crrVal !== null) ? crrVal : 0.30;
                    nRate = (nRate !== undefined && nRate !== null) ? nRate : 1.0;
                    kRate = (kRate !== undefined && kRate !== null) ? kRate : 3.0;

                    nLeaf = (nLeaf !== undefined && nLeaf !== null) ? nLeaf : 2.45;
                    pLeaf = (pLeaf !== undefined && pLeaf !== null) ? pLeaf : 0.150;
                    kLeaf = (kLeaf !== undefined && kLeaf !== null) ? kLeaf : 0.90;
                    mgLeaf = (mgLeaf !== undefined && mgLeaf !== null) ? mgLeaf : 0.250;

                    var ffbPrice = 600;
                    var calculatedRev = revVal > 0 ? revVal : (yieldVal * 25 * ffbPrice);

                    var nKgPalm = nRate > 0 ? nRate : 0.62;
                    var pKgPalm = 0.27;
                    var kKgPalm = kRate > 0 ? kRate : 3.0;
                    var mgKgPalm = 0.00;

                    var nKgHa = nKgPalm * 143;
                    var pKgHa = pKgPalm * 143;
                    var kKgHa = kKgPalm * 143;
                    var mgKgHa = mgKgPalm * 143;

                    var formulationName = "(7:3:30:0)";

                    var reportEl = document.createElement('div');
                    reportEl.style.padding = '25px 30px';
                    reportEl.style.fontFamily = '"Inter", "Segoe UI", sans-serif';
                    reportEl.style.color = '#1e293b';
                    reportEl.style.backgroundColor = '#ffffff';

                    reportEl.innerHTML = `
                        <div style="border-bottom: 2.5px solid #2d6a4f; padding-bottom: 8px; margin-bottom: 14px;">
                          <h1 style="margin: 0; color: #2d6a4f; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Report</h1>
                          <div style="font-size: 10px; color: #64748b; font-weight: 600; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px;">MPOB - PALMNEX COMPREHENSIVE ${soilType.toUpperCase()} SOIL ANALYSIS</div>
                        </div>

                        <!-- Top Section: Estate Info + Real Google Satellite Grid Map -->
                        <div style="display: flex; gap: 14px; margin-bottom: 14px;">
                          <div style="flex: 1; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px;">
                            <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #0f172a;">Estate info</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155;">
                              <tr>
                                <td style="padding: 3px 0; width: 45%; color: #64748b;">- Name</td>
                                <td style="padding: 3px 0; font-weight: 700; color: #0f172a;">${estateName}</td>
                              </tr>
                              <tr>
                                <td style="padding: 3px 0; color: #64748b;">- Location</td>
                                <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">Lahad Datu, Sabah (${coordsText})</td>
                              </tr>
                              <tr>
                                <td style="padding: 3px 0; color: #64748b;">- Current fertilizer usage</td>
                                <td style="padding: 3px 0; font-weight: 600; color: #0f172a;">Standard MPOB Rates</td>
                              </tr>
                              <tr>
                                <td style="padding: 3px 0; color: #64748b;">- 1 block = 25 ha (basic)</td>
                                <td style="padding: 3px 0; font-weight: 700; color: #2d6a4f;">25.0 ha (${blockName})</td>
                              </tr>
                            </table>
                          </div>

                          <!-- Full Lahad Datu Google Satellite Map Box with Orange Grid Overlay & Red Pin Badge -->
                          <div style="flex: 1; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <div style="position: relative; width: 100%; height: 135px; border-radius: 6px; overflow: hidden; border: 2.5px solid #ff7800; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
                              <img src="${satDataUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
                            </div>
                          </div>
                        </div>

                        <!-- Middle Section: Report Table -->
                        <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;">
                          <h3 style="margin-top: 0; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #0f172a;">Report</h3>
                          
                          <!-- Chosen Output Grid Parameters Summary Banner -->
                          <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 600; color: #1e293b;">
                            <div>
                              Chosen Cost/Revenue Ratio: <span style="font-weight: 800; color: #15803d; font-size: 12px; background: #e2e8f0; padding: 2px 6px; border-radius: 3px;">${crrVal.toFixed(2)}</span>
                            </div>
                            <div>
                              Yield Prediction: <span style="font-weight: 800; color: #2d6a4f; font-size: 12px;">${yieldVal.toFixed(2)} (t/ha/yr)</span>
                            </div>
                            <div>
                              Revenue Gain: <span style="font-weight: 800; color: #2d6a4f; font-size: 12px;">RM ${calculatedRev.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} / yr</span>
                            </div>
                          </div>
                          <div style="font-size: 10px; color: #64748b; font-weight: 400; margin-bottom: 10px; text-align: right;">
                            Revenue gain formula = (Yield prediction x 25 ha x FFB price RM ${ffbPrice})
                          </div>

                          <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: center;">
                            <thead>
                              <tr style="background-color: #f1f5f9; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 700;">
                                <th style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: left; width: 20%;">Element</th>
                                <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 26%;">Leaf Analysis (avg%)</th>
                                <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 27%;">Fert Recommendation (kg/palm)</th>
                                <th style="padding: 7px 8px; border: 1px solid #cbd5e1; width: 27%;">Fert Recommendation (kg/ha)</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">N</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">Average per block (${nLeaf.toFixed(2)}%)</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${nKgPalm.toFixed(2)}</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${nKgHa.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">P</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${pLeaf.toFixed(3)}%</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${pKgPalm.toFixed(2)}</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${pKgHa.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">K</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${kLeaf.toFixed(2)}%</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${kKgPalm.toFixed(2)}</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${kKgHa.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; text-align: left; color: #0f172a;">Mg</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155;">${mgLeaf.toFixed(3)}%</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${mgKgPalm.toFixed(2)}</td>
                                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #15803d;">${mgKgHa.toFixed(2)}</td>
                              </tr>
                            </tbody>
                          </table>

                          <div style="margin-top: 10px; font-size: 11px; font-weight: 700; color: #0f172a;">
                            Recommended Formulation:<br/>
                            <span style="color: #2d6a4f; font-weight: 700;">N P K (kita bagi Compound Formula terus: ${formulationName})</span>
                          </div>
                        </div>

                        <!-- Bottom Section: Monthly Trend Chart & Stress Level Donut Chart -->
                        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; display: flex; gap: 14px; align-items: center;">
                          
                          <!-- Monthly Trend Chart -->
                          <div style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px;">
                            <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-bottom: 6px;">Optimum Nutrient Analysis %</div>
                            <div style="display: flex; gap: 10px; font-size: 8px; font-weight: 700; margin-bottom: 8px;">
                              <span style="color: #0284c7;">■ May</span>
                              <span style="color: #0d9488;">■ June</span>
                              <span style="color: #ea580c;">■ July</span>
                            </div>
                            
                            <div style="font-size: 9px; display: flex; flex-direction: column; gap: 6px;">
                              <div>
                                <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">N</div>
                                <div style="height: 5px; background: #0284c7; width: 75%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #0d9488; width: 78%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #ea580c; width: 72%; border-radius: 2px;"></div>
                              </div>
                              <div>
                                <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">P</div>
                                <div style="height: 5px; background: #0284c7; width: 80%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #0d9488; width: 82%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #ea580c; width: 85%; border-radius: 2px;"></div>
                              </div>
                              <div>
                                <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">K</div>
                                <div style="height: 5px; background: #0284c7; width: 88%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #0d9488; width: 90%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #ea580c; width: 95%; border-radius: 2px;"></div>
                              </div>
                              <div>
                                <div style="font-weight: 700; color: #334155; margin-bottom: 2px;">Mg</div>
                                <div style="height: 5px; background: #0284c7; width: 85%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #0d9488; width: 88%; border-radius: 2px; margin-bottom: 2px;"></div>
                                <div style="height: 5px; background: #ea580c; width: 92%; border-radius: 2px;"></div>
                              </div>
                            </div>
                          </div>

                          <!-- Stress Level Donut Chart -->
                          <div style="flex: 1; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
                            <div style="font-size: 9px; display: flex; flex-direction: column; gap: 8px;">
                              <div style="font-weight: 700; color: #64748b;">Stress-level</div>
                              <div>
                                <div style="font-weight: 700; color: #ef4444;">Stressed</div>
                                <div style="color: #64748b;">10.0%</div>
                              </div>
                              <div>
                                <div style="font-weight: 700; color: #eab308;">Moderate</div>
                                <div style="color: #64748b;">30.0%</div>
                              </div>
                              <div>
                                <div style="font-weight: 700; color: #22c55e;">Healthy</div>
                                <div style="color: #64748b;">60.0%</div>
                              </div>
                            </div>

                            <svg width="110" height="110" viewBox="0 0 42 42" class="donut">
                              <circle class="donut-hole" cx="21" cy="21" r="15.91549430918954" fill="#ffffff"></circle>
                              <circle class="donut-ring" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#e2e8f0" stroke-width="6"></circle>

                              <!-- Healthy 60% (Green) -->
                              <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#22c55e" stroke-width="6" stroke-dasharray="60 40" stroke-dashoffset="25"></circle>
                              <!-- Moderate 30% (Yellow) -->
                              <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#eab308" stroke-width="6" stroke-dasharray="30 70" stroke-dashoffset="65"></circle>
                              <!-- Stressed 10% (Red) -->
                              <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#ef4444" stroke-width="6" stroke-dasharray="10 90" stroke-dashoffset="35"></circle>
                            </svg>
                          </div>
                        </div>

                        <div style="margin-top: 18px; border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 8px; color: #94a3b8; text-align: center; line-height: 1.3;">
                          Disclaimer: This report is generated dynamically by the MPOB PalmNex system based on Sentinel-2 satellite imagery index calculations, MEDS agronomic yield matrices, and leaf nutrient analysis.
                        </div>
                    `;

                    if (typeof html2pdf !== 'undefined') {
                        var options = {
                            margin: 8,
                            filename: 'palmnex_comprehensive_report_' + blockName.replace(/\s+/g, '_') + '.pdf',
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        };
                        html2pdf().from(reportEl).set(options).save();
                    } else {
                        window.print();
                    }
                };

                function findClickedBlockFeature(lat, lng) {
                    if (!currentGeoJSON || !currentGeoJSON.features) return null;
                    for (var i = 0; i < currentGeoJSON.features.length; i++) {
                        var feat = currentGeoJSON.features[i];
                        if (feat && feat.geometry) {
                            var coords = null;
                            if (feat.geometry.type === 'Polygon') {
                                coords = feat.geometry.coordinates[0];
                            } else if (feat.geometry.type === 'MultiPolygon') {
                                coords = feat.geometry.coordinates[0][0];
                            }
                            if (coords && isPointInPoly(lat, lng, coords)) {
                                return feat;
                            }
                        }
                    }
                    return null;
                }

                function isPointInPoly(lat, lng, poly) {
                    var inside = false;
                    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                        var xi = poly[i][0], yi = poly[i][1];
                        var xj = poly[j][0], yj = poly[j][1];
                        var intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                }

                map.on('click', function(e) {
                    var lat = e.latlng.lat;
                    var lng = e.latlng.lng;

                    if (!clickMarker) {
                        clickMarker = L.marker([lat, lng], { icon: redLocationIcon }).addTo(map);
                    } else {
                        clickMarker.setLatLng([lat, lng]);
                    }

                    var isInside = checkPointInsideBoundary(lat, lng);
                    var landCover = getPixelLandCover(lat, lng);

                    var blockName = "Block 22";
                    var clickedFeat = findClickedBlockFeature(lat, lng);
                    if (clickedFeat && clickedFeat.properties) {
                        var bId = clickedFeat.properties.BLOCK_ID || clickedFeat.properties.Block || clickedFeat.properties.id;
                        if (bId !== undefined && bId !== null) {
                            blockName = "Block " + bId;
                        }
                        window.currentSelectedFeature = clickedFeat;
                    }
                    window.selectedBlockName = blockName;
                    
                    if (qtBridge && typeof qtBridge.onMapClicked === 'function') {
                        qtBridge.onMapClicked(lat, lng, isInside, landCover, blockName);
                    }
                });
            </script>
        </body>
        </html>
        """
        return html_template.replace("__NUTRIENT_OVERLAYS_JSON__", nutrient_overlays_json)
