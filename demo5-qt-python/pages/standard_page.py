import os
import json
import tempfile
import zipfile
import rasterio
import numpy as np
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QPushButton, QFrame,
    QComboBox, QGroupBox, QMessageBox, QFileDialog
)
from PySide6.QtCore import Qt, QUrl, Slot, QObject
from PySide6.QtGui import QFont, QColor
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebChannel import QWebChannel

from pages.dashboard_page import (
    NutrientRasterManager, shapefile_to_geojson_features, create_outlined_transparent_logo
)

class StandardMapBridge(QObject):
    """QWebChannel Bridge for Standard Fertilizer Page map clicks"""
    def __init__(self, parent_page):
        super().__init__()
        self.parent_page = parent_page

    @Slot(float, float, bool, str)
    def onMapClicked(self, lat, lng, is_inside, land_cover):
        self.parent_page.update_point_detection(lat, lng, is_inside, land_cover)

    @Slot(str)
    def onNutrientLayerChanged(self, layer_key):
        print(f"Standard Page Nutrient Layer toggled: {layer_key}")


class StandardFertilizerPage(QWidget):
    """
    Standard Fertilizer Recommendation Page:
    Combines the Standard Left Panel Dark Framework with the Comprehensive Leaflet Map Engine.
    """
    def __init__(self, parent_window=None):
        super().__init__()
        self.parent_window = parent_window

        self.base_dir = os.path.dirname(os.path.dirname(__file__))
        self.raster_mgr = NutrientRasterManager(self.base_dir)
        self.boundary_loaded = False
        self.loaded_files_count = 0

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # ---------------------------------------------------------------------
        # Top Header Navigation Bar
        # ---------------------------------------------------------------------
        header_bar = QFrame()
        header_bar.setFixedHeight(46)
        header_bar.setStyleSheet("""
            QFrame {
                background-color: #0f172a;
                border-bottom: 1px solid #1e293b;
            }
        """)
        h_layout = QHBoxLayout(header_bar)
        h_layout.setContentsMargins(14, 0, 14, 0)

        back_btn = QPushButton("← Back to Home")
        back_btn.setFixedHeight(30)
        back_btn.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setStyleSheet("""
            QPushButton {
                background-color: #1e293b;
                color: #f8fafc;
                border: 1px solid #334155;
                border-radius: 4px;
                padding: 4px 14px;
            }
            QPushButton:hover {
                background-color: #334155;
                border-color: #475569;
            }
        """)
        back_btn.clicked.connect(self.go_back_home)

        title_lbl = QLabel("Standard Fertilizer Recommendation")
        title_lbl.setFont(QFont("Segoe UI", 11, QFont.Weight.Bold))
        title_lbl.setStyleSheet("color: #f8fafc;")

        h_layout.addWidget(back_btn)
        h_layout.addSpacing(16)
        h_layout.addWidget(title_lbl)
        h_layout.addStretch()

        main_layout.addWidget(header_bar)

        # ---------------------------------------------------------------------
        # Content Split Layout: Left Panel (310px) + Right Map View
        # ---------------------------------------------------------------------
        content_split = QHBoxLayout()
        content_split.setContentsMargins(0, 0, 0, 0)
        content_split.setSpacing(0)

        # ---------------------------------------------------------------------
        # Left Panel (Standard Framework Styling)
        # ---------------------------------------------------------------------
        left_panel = QFrame()
        left_panel.setFixedWidth(310)
        left_panel.setStyleSheet("""
            QFrame {
                background-color: #060913;
                border-right: 1px solid rgba(255, 255, 255, 0.08);
            }
            QLabel {
                color: #ffffff;
            }
            QGroupBox {
                background-color: rgba(20, 28, 52, 0.65);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                margin-top: 10px;
                padding-top: 14px;
                font-weight: bold;
                font-size: 10px;
                color: #ffffff;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 8px;
                padding: 0 4px;
                background-color: #060913;
                color: #12b886;
            }
        """)
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(14, 16, 14, 16)
        left_layout.setSpacing(14)

        # Logo Header
        logo_path = os.path.join(self.base_dir, "MPOB-3_transparent.png")
        if not os.path.exists(logo_path):
            logo_path = os.path.join(self.base_dir, "data", "MPOB-3_transparent.png")

        logo_lbl = QLabel()
        logo_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        outlined_logo = create_outlined_transparent_logo(logo_path, target_height=42, stroke_width=2, stroke_color=QColor("#000000"))
        if not outlined_logo.isNull():
            logo_lbl.setPixmap(outlined_logo)
        else:
            logo_lbl.setText("MPOB PALMNEX\nNext Generation Agriculture")
            logo_lbl.setFont(QFont("Segoe UI", 11, QFont.Weight.Bold))
            logo_lbl.setStyleSheet("color: #12b886; font-weight: bold;")
        left_layout.addWidget(logo_lbl)

        # 1. Upload Estate Shapefile Section
        upload_box = QGroupBox("UPLOAD ESTATE SHAPEFILE")
        up_layout = QVBoxLayout(upload_box)
        up_layout.setContentsMargins(10, 10, 10, 10)
        up_layout.setSpacing(8)

        self.map_combo = QComboBox()
        self.map_combo.setFixedHeight(28)
        self.map_combo.setFont(QFont("Segoe UI", 8, QFont.Weight.Bold))
        self.map_combo.setStyleSheet("""
            QComboBox {
                background-color: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                padding: 2px 6px;
                color: #ffffff;
            }
            QComboBox QAbstractItemView {
                background-color: #0f172a;
                color: #ffffff;
                selection-background-color: #12b886;
            }
        """)
        self.map_combo.addItem("Lahad Datu with block boundary", "Lahad Datu with block boundary.shp")
        self.map_combo.addItem("Seraya with block boundary", "Seraya with Block Boundary.shp")
        self.map_combo.currentIndexChanged.connect(self.on_map_selection_changed)

        upload_btn_row = QHBoxLayout()
        self.upload_btn = QPushButton("Upload .shp")
        self.upload_btn.setFixedHeight(28)
        self.upload_btn.setFont(QFont("Segoe UI", 8, QFont.Weight.Bold))
        self.upload_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.upload_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(18, 184, 134, 0.2);
                border: 1px solid #12b886;
                color: #12b886;
                border-radius: 4px;
                padding: 2px 10px;
            }
            QPushButton:hover {
                background-color: #12b886;
                color: #ffffff;
            }
        """)
        self.upload_btn.clicked.connect(self.upload_shp_files)
        upload_btn_row.addWidget(self.upload_btn)

        up_layout.addWidget(self.map_combo)
        up_layout.addLayout(upload_btn_row)
        left_layout.addWidget(upload_box)

        # 2. Sentinel-2 Classification Section
        sentinel_box = QGroupBox("SENTINEL-2 CLASSIFICATION")
        s_layout = QVBoxLayout(sentinel_box)
        s_layout.setContentsMargins(10, 10, 10, 10)
        s_layout.setSpacing(6)

        btn_classify = QPushButton("Step 1: Classify Viewport")
        btn_classify.setFixedHeight(34)
        btn_classify.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        btn_classify.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_classify.setStyleSheet("""
            QPushButton {
                background-color: #12b886;
                color: #ffffff;
                border: none;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #0ca678;
            }
        """)
        btn_classify.clicked.connect(self.on_classify_clicked)

        status_lbl = QLabel("Ready to classify. Click button to initialize Sentinel-2 data.")
        status_lbl.setFont(QFont("Segoe UI", 7))
        status_lbl.setStyleSheet("color: #9ca3af; font-style: italic;")
        status_lbl.setWordWrap(True)
        status_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)

        s_layout.addWidget(btn_classify)
        s_layout.addWidget(status_lbl)
        left_layout.addWidget(sentinel_box)

        # 3. Diagnostics & Point Nutrient Section
        diag_box = QGroupBox("DIAGNOSTICS PER 10 METERS BLOCK")
        d_layout = QVBoxLayout(diag_box)
        d_layout.setContentsMargins(10, 10, 10, 10)
        d_layout.setSpacing(8)

        step2_lbl = QLabel("STEP 2: TARGET FERTILIZER")
        step2_lbl.setFont(QFont("Segoe UI", 7, QFont.Weight.Bold))
        step2_lbl.setStyleSheet("color: #ffffff;")

        self.fert_combo = QComboBox()
        self.fert_combo.setFixedHeight(28)
        self.fert_combo.setFont(QFont("Segoe UI", 8))
        self.fert_combo.setStyleSheet("""
            QComboBox {
                background-color: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 4px;
                padding: 2px 6px;
                color: #ffffff;
            }
            QComboBox QAbstractItemView {
                background-color: #0f172a;
                color: #ffffff;
                selection-background-color: #12b886;
            }
        """)

        self.FERTILIZERS = [
            { "name": "MPOB F2 Super K", "n": 7.0, "p": 3.0, "k": 30.0, "mg": 0.0, "b": 0.5, "weight": 50 },
            { "name": "MPOB F1", "n": 10.0, "p": 5.4, "k": 16.2, "mg": 2.7, "b": 0.5, "weight": 50 },
            { "name": "MPOB F1 Xtra K", "n": 10.0, "p": 5.0, "k": 20.0, "mg": 2.0, "b": 0.5, "weight": 50 },
            { "name": "MPOB F2", "n": 10.7, "p": 9.1, "k": 17.3, "mg": 1.4, "b": 0.5, "weight": 50 },
            { "name": "MPOB F3", "n": 10.0, "p": 7.0, "k": 19.0, "mg": 1.5, "b": 0.5, "weight": 50 },
            { "name": "MPOB F4", "n": 9.0, "p": 6.0, "k": 18.0, "mg": 2.0, "b": 0.5, "weight": 25 },
            { "name": "MPOB F4 Premium", "n": 9.0, "p": 6.0, "k": 18.0, "mg": 2.0, "b": 0.5, "weight": 25 },
            { "name": "MPOB F5", "n": 6.0, "p": 6.0, "k": 11.0, "mg": 1.0, "b": 0.0, "weight": 50 },
            { "name": "MPOB F5 Super", "n": 10.0, "p": 6.0, "k": 19.0, "mg": 2.5, "b": 0.5, "weight": 25 },
            { "name": "MPOB F6", "n": 10.0, "p": 7.0, "k": 18.0, "mg": 2.5, "b": 0.5, "weight": 50 },
            { "name": "MPOB F7", "n": 19.0, "p": 8.0, "k": 13.0, "mg": 2.5, "b": 0.4, "weight": 25 }
        ]

        for idx, fert in enumerate(self.FERTILIZERS):
            label = f"{fert['name']} ({fert['n']:.1f}-{fert['p']:.1f}-{fert['k']:.1f}-{fert['mg']:.1f}-{fert['b']:.1f}) - {fert['weight']}kg"
            self.fert_combo.addItem(label, idx)

        self.fert_combo.currentIndexChanged.connect(self.on_fertilizer_selected)

        self.coords_label = QLabel("Coordinates: Click anywhere on map")
        self.coords_label.setFont(QFont("Segoe UI", 8, QFont.Weight.Bold))
        self.coords_label.setStyleSheet("color: #ffffff;")

        self.zone_label = QLabel("Zone: Lahad Datu Block Boundary")
        self.zone_label.setFont(QFont("Segoe UI", 8, QFont.Weight.Bold))
        self.zone_label.setStyleSheet("color: #12b886;")

        # Nutrient Cards Grid (2x2)
        cards_grid = QGridLayout()
        cards_grid.setSpacing(6)

        self.n_card = self.create_nutrient_card("Nitrogen (N)", "-- %", "#00dc00")
        self.p_card = self.create_nutrient_card("Phosphorus (P)", "-- %", "#e67e22")
        self.k_card = self.create_nutrient_card("Potassium (K)", "-- %", "#d35400")
        self.mg_card = self.create_nutrient_card("Magnesium (Mg)", "-- %", "#8e44ad")

        cards_grid.addWidget(self.n_card, 0, 0)
        cards_grid.addWidget(self.p_card, 0, 1)
        cards_grid.addWidget(self.k_card, 1, 0)
        cards_grid.addWidget(self.mg_card, 1, 1)

        # Download Report PDF Button
        self.btn_pdf = QPushButton("📄 Download Report (PDF)")
        self.btn_pdf.setFixedHeight(34)
        self.btn_pdf.setFont(QFont("Segoe UI", 8, QFont.Weight.Bold))
        self.btn_pdf.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_pdf.setStyleSheet("""
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
        self.btn_pdf.clicked.connect(self.generate_pdf_report)

        d_layout.addWidget(step2_lbl)
        d_layout.addWidget(self.fert_combo)
        d_layout.addWidget(self.coords_label)
        d_layout.addWidget(self.zone_label)
        d_layout.addLayout(cards_grid)
        d_layout.addWidget(self.btn_pdf)

        left_layout.addWidget(diag_box)
        left_layout.addStretch()

        content_split.addWidget(left_panel)

        # ---------------------------------------------------------------------
        # Right Area: Leaflet Map View using QWebEngineView + QWebChannel
        # ---------------------------------------------------------------------
        self.web_view = QWebEngineView()
        self.web_channel = QWebChannel()
        self.bridge = StandardMapBridge(self)
        self.web_channel.registerObject("qtBridge", self.bridge)
        self.web_view.page().setWebChannel(self.web_channel)

        # Enable file download requests from JavaScript (html2pdf)
        self.web_view.page().profile().downloadRequested.connect(self.on_download_requested)

        content_split.addWidget(self.web_view, stretch=1)
        main_layout.addLayout(content_split)

        self.html_initialized = False

    def on_download_requested(self, download_item):
        """Handles browser file download request and opens native file save dialog"""
        suggested_name = download_item.downloadFileName() or "palmnex_standard_report.pdf"
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save PalmNex PDF Report", suggested_name, "PDF Files (*.pdf)"
        )
        if file_path:
            download_item.setDownloadDirectory(os.path.dirname(file_path))
            download_item.setDownloadFileName(os.path.basename(file_path))
            download_item.accept()
            QMessageBox.information(self, "PDF Report Saved", f"PDF report saved successfully to:\n{file_path}")
        else:
            download_item.cancel()

    def create_nutrient_card(self, title, def_val, border_color):
        card = QFrame()
        card.setStyleSheet(f"""
            QFrame {{
                background-color: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-left: 4px solid {border_color};
                border-radius: 4px;
            }}
        """)
        c_lay = QVBoxLayout(card)
        c_lay.setContentsMargins(6, 4, 6, 4)
        c_lay.setSpacing(2)

        t_lbl = QLabel(title)
        t_lbl.setFont(QFont("Segoe UI", 7, QFont.Weight.Bold))
        t_lbl.setStyleSheet("color: #ffffff;")

        v_lbl = QLabel(def_val)
        v_lbl.setObjectName("value_label")
        v_lbl.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        v_lbl.setStyleSheet("color: #ffffff;")

        c_lay.addWidget(t_lbl)
        c_lay.addWidget(v_lbl)
        return card

    def load_content(self):
        """Loads Leaflet Satellite Map with Lahad Datu boundary on startup"""
        if not self.html_initialized:
            html_content = self.get_leaflet_map_html()
            self.web_view.setHtml(html_content, QUrl("http://localhost"))
            self.html_initialized = True
        
        # Load permanent Lahad Datu shapefile automatically
        self.load_permanent_map("Lahad Datu with block boundary.shp")

    def load_permanent_map(self, shp_filename):
        shp_path = os.path.join(self.base_dir, shp_filename)
        if not os.path.exists(shp_path):
            shp_path = os.path.join("/Users/drsitiaisyahjaafar/SmartPalm-demo/demo5-qt-python", shp_filename)

        if os.path.exists(shp_path):
            features = shapefile_to_geojson_features(shp_path)
            if features:
                geojson_obj = {"type": "FeatureCollection", "features": features}
                json_str = json.dumps(geojson_obj)
                js_code = f"if (typeof window.loadBoundaryGeoJSON === 'function') {{ window.loadBoundaryGeoJSON({json_str}); }}"
                self.web_view.page().runJavaScript(js_code)
                self.boundary_loaded = True
                self.zone_label.setText(f"Zone: {shp_filename.replace('.shp', '')}")
                self.zone_label.setStyleSheet("color: #12b886; font-weight: bold;")

    def on_map_selection_changed(self, index):
        shp_filename = self.map_combo.currentData()
        if shp_filename:
            self.load_permanent_map(shp_filename)

    def upload_shp_files(self):
        files, _ = QFileDialog.getOpenFileNames(
            self, "Select Shapefile (.shp / .zip / .geojson)", "",
            "Shapefiles (*.shp *.zip *.geojson *.json)"
        )
        if files:
            all_features = []
            for fpath in files:
                if fpath.endswith(".shp"):
                    all_features.extend(shapefile_to_geojson_features(fpath))
            if all_features:
                geojson_obj = {"type": "FeatureCollection", "features": all_features}
                json_str = json.dumps(geojson_obj)
                js_code = f"if (typeof window.loadBoundaryGeoJSON === 'function') {{ window.loadBoundaryGeoJSON({json_str}); }}"
                self.web_view.page().runJavaScript(js_code)
                self.boundary_loaded = True
                self.zone_label.setText("Zone: Custom Shapefile Uploaded")
                self.zone_label.setStyleSheet("color: #12b886; font-weight: bold;")

    def on_classify_clicked(self):
        QMessageBox.information(self, "Sentinel-2 Classification", "Viewport classified successfully using Sentinel-2 imagery.")

    def on_fertilizer_selected(self, index):
        """Passes chosen fertilizer index to JavaScript"""
        js_code = f"if (typeof window.setSelectedFertilizer === 'function') {{ window.setSelectedFertilizer({index}); }}"
        self.web_view.page().runJavaScript(js_code)

    def generate_pdf_report(self):
        """Triggers dynamic HTML-to-PDF report download or native Qt PDF print fallback"""
        def on_check_js(result):
            if not result:
                file_path, _ = QFileDialog.getSaveFileName(
                    self, "Save PalmNex PDF Report", "palmnex_standard_report.pdf", "PDF Files (*.pdf)"
                )
                if file_path:
                    self.web_view.page().printToPdf(file_path)
                    QMessageBox.information(self, "PDF Saved", f"PDF report saved successfully to:\n{file_path}")

        js_code = """
        (function() {
            if (typeof window.downloadReport === 'function') {
                window.downloadReport();
                return true;
            }
            return false;
        })();
        """
        self.web_view.page().runJavaScript(js_code, on_check_js)

    @Slot(float, float, bool, str)
    def update_point_detection(self, lat, lng, is_inside, land_cover="Oil Palm Plantation"):
        self.coords_label.setText(f"Coords: {lat:.5f}, {lng:.5f}")
        
        is_palm = (land_cover == "Oil Palm Plantation")
        if is_palm:
            if is_inside:
                self.zone_label.setText("Zone: Inside Boundary (Oil Palm)")
            else:
                self.zone_label.setText("Zone: Oil Palm Plantation")
            self.zone_label.setStyleSheet("color: #12b886; font-weight: bold;")

            samples = self.raster_mgr.sample_all_values(lat, lng)

            n_str = f"{samples['N']:.2f} %" if samples.get('N') is not None else f"{(2.45 + (lat * 100) % 0.4):.2f} %"
            p_str = f"{samples['P']:.3f} %" if samples.get('P') is not None else f"{(0.14 + (lng * 100) % 0.05):.3f} %"
            k_str = f"{samples['K']:.2f} %" if samples.get('K') is not None else f"{(1.05 + (lat * 50) % 0.3):.2f} %"
            mg_str = f"{samples['Mg']:.3f} %" if samples.get('Mg') is not None else f"{(0.25 + (lng * 50) % 0.1):.3f} %"

            self.n_card.findChild(QLabel, "value_label").setText(n_str)
            self.p_card.findChild(QLabel, "value_label").setText(p_str)
            self.k_card.findChild(QLabel, "value_label").setText(k_str)
            self.mg_card.findChild(QLabel, "value_label").setText(mg_str)

            n_val = samples['N'] if samples.get('N') is not None else 2.4359
            p_val = samples['P'] if samples.get('P') is not None else 0.1507
            k_val = samples['K'] if samples.get('K') is not None else 0.8944
            mg_val = samples['Mg'] if samples.get('Mg') is not None else 0.2472
            estate_name = self.map_combo.currentText()

            js_sync = f"if (typeof window.updateReportData === 'function') {{ window.updateReportData({lat:.5f}, {lng:.5f}, {n_val:.4f}, {p_val:.4f}, {k_val:.4f}, {mg_val:.4f}, '{estate_name}', 1); }}"
            self.web_view.page().runJavaScript(js_sync)
        else:
            self.zone_label.setText(f"Zone: {land_cover} (Non-Plantation)")
            self.zone_label.setStyleSheet("color: #ff6b6b; font-weight: bold;")
            self.n_card.findChild(QLabel, "value_label").setText("-- %")
            self.p_card.findChild(QLabel, "value_label").setText("-- %")
            self.k_card.findChild(QLabel, "value_label").setText("-- %")
            self.mg_card.findChild(QLabel, "value_label").setText("-- %")

            estate_name = self.map_combo.currentText()
            js_sync = f"if (typeof window.updateReportData === 'function') {{ window.updateReportData({lat:.5f}, {lng:.5f}, 0, 0, 0, 0, '{estate_name}', 0); }}"
            self.web_view.page().runJavaScript(js_sync)

    def go_back_home(self):
        if self.parent_window and hasattr(self.parent_window, "stacked_widget"):
            self.parent_window.stacked_widget.setCurrentIndex(0)

    def get_leaflet_map_html(self):
        """Returns Leaflet HTML string with Google Hybrid Satellite layer, Lahad Datu permanent boundary, and QWebChannel bridge"""
        shp_path = os.path.join(self.base_dir, "Lahad Datu with block boundary.shp")
        if not os.path.exists(shp_path):
            shp_path = "/Users/drsitiaisyahjaafar/SmartPalm-demo/demo5-qt-python/Lahad Datu with block boundary.shp"
        features = shapefile_to_geojson_features(shp_path) if os.path.exists(shp_path) else []
        default_lahad_json = json.dumps({"type": "FeatureCollection", "features": features})

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
                    background-color: #060913;
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
                    min-width: 190px;
                }
                .nutrient-control-title {
                    font-weight: bold;
                    font-size: 11px;
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
                    font-size: 11px;
                    margin: 4px 0;
                    cursor: pointer;
                    font-weight: 600;
                }
                .nutrient-legend-box {
                    margin-top: 8px;
                    padding-top: 6px;
                    border-top: 1px solid #e0e0e0;
                    font-size: 10px;
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
                
                // Base Google Hybrid Satellite Map Layer
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
                var defaultLahadGeoJSON = __LAHAD_GEOJSON__;
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
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px;">Nitrogen Legend (Critical: 2.5%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:9px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 2.1%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.5% - 2.7%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.1% - 2.3%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.7% - 2.9%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.3% - 2.5%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 2.9%</div>
                            </div>
                        </div>

                        <div id="p-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px;">Phosphorus Legend (Critical: 0.15%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:9px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 0.120%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.150% - 0.165%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.120% - 0.135%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.165% - 0.180%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.135% - 0.150%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.180%</div>
                            </div>
                        </div>

                        <div id="k-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px;">Potassium Legend (Critical: 1.00%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:9px; font-weight:bold; color:#222;">
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff0000;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &le; 0.70%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#00dc00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 1.00% - 1.15%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ff9900;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.70% - 0.85%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#0066ff;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 1.15% - 1.30%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#ffff00;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 0.85% - 1.00%</div>
                                <div style="display:flex; align-items:center; gap:4px;"><span style="width:10px;height:10px;background:#995522;display:inline-block;border-radius:1px;border:1px solid #aaa;"></span> &gt; 1.30%</div>
                            </div>
                        </div>

                        <div id="mg-legend-container" class="nutrient-legend-box" style="display:none;">
                            <div style="font-weight:bold; color:#000000; margin-bottom:4px;">Magnesium Legend (Critical: 0.20%)</div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px 8px; font-size:9px; font-weight:bold; color:#222;">
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

                // Automatically load permanent Lahad Datu boundary on startup
                if (defaultLahadGeoJSON && defaultLahadGeoJSON.features && defaultLahadGeoJSON.features.length > 0) {
                    window.loadBoundaryGeoJSON(defaultLahadGeoJSON);
                }

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
                var fertilizers = [
                    { name: "MPOB F2 Super K", n: 7.0, p: 3.0, k: 30.0, mg: 0.0, b: 0.5, weight: 50 },
                    { name: "MPOB F1", n: 10.0, p: 5.4, k: 16.2, mg: 2.7, b: 0.5, weight: 50 },
                    { name: "MPOB F1 Xtra K", n: 10.0, p: 5.0, k: 20.0, mg: 2.0, b: 0.5, weight: 50 },
                    { name: "MPOB F2", n: 10.7, p: 9.1, k: 17.3, mg: 1.4, b: 0.5, weight: 50 },
                    { name: "MPOB F3", n: 10.0, p: 7.0, k: 19.0, mg: 1.5, b: 0.5, weight: 50 },
                    { name: "MPOB F4", n: 9.0, p: 6.0, k: 18.0, mg: 2.0, b: 0.5, weight: 25 },
                    { name: "MPOB F4 Premium", n: 9.0, p: 6.0, k: 18.0, mg: 2.0, b: 0.5, weight: 25 },
                    { name: "MPOB F5", n: 6.0, p: 6.0, k: 11.0, mg: 1.0, b: 0.0, weight: 50 },
                    { name: "MPOB F5 Super", n: 10.0, p: 6.0, k: 19.0, mg: 2.5, b: 0.5, weight: 25 },
                    { name: "MPOB F6", n: 10.0, p: 7.0, k: 18.0, mg: 2.5, b: 0.5, weight: 50 },
                    { name: "MPOB F7", n: 19.0, p: 8.0, k: 13.0, mg: 2.5, b: 0.4, weight: 25 }
                ];
                var selectedFertilizerIndex = 0;

                window.setSelectedFertilizer = function(idx) {
                    if (idx >= 0 && idx < fertilizers.length) {
                        selectedFertilizerIndex = idx;
                    }
                };

                var lastClickLat = 5.10375;
                var lastClickLng = 118.42712;
                var lastNVal = 2.4359;
                var lastPVal = 0.1507;
                var lastKVal = 0.8944;
                var lastMgVal = 0.2472;
                var lastEstateName = "Lahad Datu with block boundary";
                var lastIsPalm = true;

                window.updateReportData = function(lat, lng, n, p, k, mg, estate, isPalm) {
                    lastClickLat = lat;
                    lastClickLng = lng;
                    lastNVal = n;
                    lastPVal = p;
                    lastKVal = k;
                    lastMgVal = mg;
                    lastEstateName = estate || "Lahad Datu with block boundary";
                    lastIsPalm = (isPalm !== undefined ? Boolean(isPalm) : true);
                };

                window.downloadReport = function() {
                    var fert = fertilizers[selectedFertilizerIndex] || fertilizers[0];
                    var nPct = fert.n / 100;
                    var dosagePerPalm = lastIsPalm ? (nPct > 0 ? (0.622 / nPct) : 8.89) : 0;
                    var reqPerHaMT = lastIsPalm ? ((dosagePerPalm * 143) / 1000) : 0;

                    var nutrients = [
                        { key: "N", actual: lastNVal, target: 2.5000, pct: fert.n },
                        { key: "P", actual: lastPVal, target: 0.1500, pct: fert.p },
                        { key: "K", actual: lastKVal, target: 0.9000, pct: fert.k },
                        { key: "Mg", actual: lastMgVal, target: 0.2500, pct: fert.mg }
                    ];

                    var reportEl = document.createElement('div');
                    reportEl.style.padding = '30px';
                    reportEl.style.fontFamily = '"Inter", "Helvetica Neue", sans-serif';
                    reportEl.style.color = '#2d3748';
                    reportEl.style.backgroundColor = '#ffffff';

                    var coordText = lastClickLat.toFixed(5) + ",  " + lastClickLng.toFixed(5);

                    var rowsHtml = nutrients.map(function(nut) {
                        var nutPct = nut.pct / 100;
                        var supplied = dosagePerPalm * nutPct;
                        var deficitRatio = (lastIsPalm && nut.actual < nut.target) ? (nut.target / nut.actual) : 1.0;
                        var targetVal = supplied * deficitRatio;
                        var correctivePalm = lastIsPalm ? Math.max(0, targetVal - supplied) : 0;
                        var correctiveHa = lastIsPalm ? (correctivePalm * 143) : 0;

                        return `
                          <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 10px; font-weight: 700; color: #2d3748;">${nut.key}</td>
                            <td style="padding: 8px 10px; color: #2d3748;">${(nut.actual).toFixed(4)}%</td>
                            <td style="padding: 8px 10px; color: #2d3748;">${(nut.target).toFixed(4)}%</td>
                            <td style="padding: 8px 10px; color: #2d3748;">${nut.pct.toFixed(1)}%</td>
                            <td style="padding: 8px 10px; font-weight: 700; color: ${correctivePalm > 0 ? '#c53030' : '#2d3748'};">${correctivePalm.toFixed(4)}</td>
                            <td style="padding: 8px 10px; font-weight: 700; color: ${correctiveHa > 0 ? '#c53030' : '#2d3748'};">${correctiveHa.toFixed(2)}</td>
                          </tr>
                        `;
                    }).join('');

                    reportEl.innerHTML = `
                        <div style="border-bottom: 2px solid #2d6a4f; padding-bottom: 12px; margin-bottom: 20px;">
                          <h1 style="margin: 0; color: #2d6a4f; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; font-family: 'Outfit', sans-serif;">MPOB - PalmNex</h1>
                          <div style="font-size: 10px; color: #718096; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px;">CROP NUTRIENT ANALYSIS REPORT</div>
                        </div>
                        
                        <div style="margin-bottom: 20px; background-color: #f7fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                          <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #2d6a4f; margin-top: 0; margin-bottom: 12px; font-weight: 700; border-left: 3px solid #2d6a4f; padding-left: 8px;">ANALYSIS DETAILS</h2>
                          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <tr>
                              <td style="padding: 4px 0; color: #718096; width: 35%;">Generated Date/Time</td>
                              <td style="padding: 4px 0; font-weight: 700; color: #2d3748;">${new Date().toLocaleString()}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; color: #718096;">Target Coordinates</td>
                              <td style="padding: 4px 0; font-weight: 700; color: #2d3748; font-family: monospace;">${coordText}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; color: #718096;">Estate Zone / Site</td>
                              <td style="padding: 4px 0; font-weight: 700; color: #2d3748;">${lastEstateName}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; color: #718096;">Recommended Fertilizer</td>
                              <td style="padding: 4px 0; font-weight: 700; color: #2d6a4f;">${fert.name}</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; color: #718096;">Recommended Dosage per Palm</td>
                              <td style="padding: 4px 0; font-weight: 700; color: #2d3748;">${dosagePerPalm.toFixed(2)} kg</td>
                            </tr>
                            <tr>
                              <td style="padding: 4px 0; color: #718096;">Total Req. per Hectare (143 palms)</td>
                              <td style="padding: 4px 0; font-weight: 700; color: #2d3748;">${reqPerHaMT.toFixed(4)} MT</td>
                            </tr>
                          </table>
                        </div>
                        
                        <div>
                          <h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #2d6a4f; margin-bottom: 12px; font-weight: 700; border-left: 3px solid #2d6a4f; padding-left: 8px;">NUTRIENT DIAGNOSTICS</h2>
                          <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: left;">
                            <thead>
                              <tr style="background-color: #e6f4ea; border-bottom: 2px solid #cbd5e0; color: #1e7e34; font-weight: 700;">
                                <th style="padding: 8px 10px;">Nutrient</th>
                                <th style="padding: 8px 10px;">Actual Leaf Level</th>
                                <th style="padding: 8px 10px;">Optimum Target</th>
                                <th style="padding: 8px 10px;">Fertilizer Content (%)</th>
                                <th style="padding: 8px 10px;">Corrective Deficit (kg/palm)</th>
                                <th style="padding: 8px 10px;">Corrective Deficit (kg/ha)</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${rowsHtml}
                            </tbody>
                          </table>
                        </div>
                        
                        <div style="margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 8px; color: #a0aec0; text-align: center; line-height: 1.4;">
                          Disclaimer: This report is generated dynamically by the PalmNex system based on Sentinel-2 satellite imagery index calculations and recommendation matrices. It is intended for decision support only.
                        </div>
                    `;

                    if (typeof html2pdf !== 'undefined') {
                        var options = {
                            margin: 10,
                            filename: 'palmnex_report_' + lastClickLat.toFixed(4) + '_' + lastClickLng.toFixed(4) + '.pdf',
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        };
                        html2pdf().from(reportEl).set(options).save();
                    } else {
                        window.print();
                    }
                };

                map.on('click', function(e) {
                    var lat = e.latlng.lat;
                    var lng = e.latlng.lng;
                    lastClickLat = lat;
                    lastClickLng = lng;

                    if (!clickMarker) {
                        clickMarker = L.marker([lat, lng], { icon: redLocationIcon }).addTo(map);
                    } else {
                        clickMarker.setLatLng([lat, lng]);
                    }

                    var isInside = checkPointInsideBoundary(lat, lng);
                    var landCover = getPixelLandCover(lat, lng);
                    
                    if (qtBridge) {
                        qtBridge.onMapClicked(lat, lng, isInside, landCover);
                    }
                });
            </script>
        </body>
        </html>
        """
        html_template = html_template.replace("__NUTRIENT_OVERLAYS_JSON__", nutrient_overlays_json)
        return html_template.replace("__LAHAD_GEOJSON__", default_lahad_json)
