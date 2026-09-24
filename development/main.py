import sys
import os
import webbrowser
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QGroupBox, QStackedWidget, QStyleFactory, QMessageBox
)
from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtGui import QFont, QPixmap, QImage, QPainter, QColor, QDesktopServices
from pages.dashboard_page import DashboardPage, create_outlined_transparent_logo, create_black_text_logo
from pages.standard_page import StandardFertilizerPage

class ClickableGroupBox(QGroupBox):
    clicked = Signal()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit()
        super().mousePressEvent(event)

class Page1Widget(QWidget):
    """
    First Page Widget with custom background image (WhatsApp Image 2026-08-11 at 08.43.18.jpeg)
    and styled choice cards.
    """
    def __init__(self, parent_window):
        super().__init__()
        self.parent_window = parent_window

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(40, 40, 40, 40)
        main_layout.setSpacing(35)
        main_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Header Logo (Using MPOB-3-all-black-fonts.png with transparent background)
        logo_label = QLabel()
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo_label.setStyleSheet("background: transparent; background-color: transparent; border: none;")
        
        logo_path = os.path.join(os.path.dirname(__file__), "MPOB-3-all-black-fonts.png")
        if not os.path.exists(logo_path):
            logo_path = os.path.join(os.path.dirname(__file__), "MPOB-3_transparent.png")

        logo_pixmap = QPixmap(logo_path)
        if not logo_pixmap.isNull():
            scaled_logo = logo_pixmap.scaledToHeight(65, Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(scaled_logo)

        main_layout.addWidget(logo_label, alignment=Qt.AlignmentFlag.AlignCenter)

        # Main layout of choice elements (Vertical Layout)
        choices_layout = QVBoxLayout()
        choices_layout.setSpacing(24)
        choices_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Row 1: Top two recommendation items
        top_row_layout = QHBoxLayout()
        top_row_layout.setSpacing(28)
        top_row_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Column 1 container (Vertical to stack QGroupBox and its button below)
        col1_layout = QVBoxLayout()
        col1_layout.setSpacing(12)
        col1_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        card1 = QGroupBox()
        card1.setFixedSize(300, 140)
        card1.setStyleSheet("""
            QGroupBox {
                background-color: rgba(255, 255, 255, 0.50);
                border: 1px solid #bcbcbc;
                border-radius: 4px;
            }
        """)
        card1_layout = QVBoxLayout(card1)
        card1_layout.setContentsMargins(10, 10, 10, 10)
        card1_layout.setSpacing(4)
        card1_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        c1_title = QLabel("Comprehensive\nFertilizer Recommendation")
        c1_title.setFont(QFont("Segoe UI", 20, QFont.Weight.Bold))
        c1_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        c1_title.setStyleSheet("color: #000000; background: transparent; font-weight: bold;")

        c1_desc = QLabel("Detailed fertilizer analysis\nAdvanced agronomic rules")
        c1_desc.setFont(QFont("Segoe UI", 10))
        c1_desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        c1_desc.setStyleSheet("color: #333333; background: transparent;")
        
        card1_layout.addWidget(c1_title)
        card1_layout.addWidget(c1_desc)
        
        btn1 = QPushButton("Get Started")
        btn1.setFixedHeight(34)
        btn1.setFixedWidth(140)
        btn1.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        btn1.setCursor(Qt.CursorShape.PointingHandCursor)
        btn1.setStyleSheet("""
            QPushButton {
                background-color: #ffffff;
                color: #000000;
                border: 1px solid #bcbcbc;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #fafafa;
                border-color: #777777;
            }
        """)
        btn1.clicked.connect(self.on_comprehensive_clicked)
        
        col1_layout.addWidget(card1)
        col1_layout.addWidget(btn1, alignment=Qt.AlignmentFlag.AlignCenter)

        # Column 2 container (Vertical to stack QGroupBox and its button below)
        col2_layout = QVBoxLayout()
        col2_layout.setSpacing(12)
        col2_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        card2 = QGroupBox()
        card2.setFixedSize(300, 140)
        card2.setStyleSheet("""
            QGroupBox {
                background-color: rgba(255, 255, 255, 0.50);
                border: 1px solid #bcbcbc;
                border-radius: 4px;
            }
        """)
        card2_layout = QVBoxLayout(card2)
        card2_layout.setContentsMargins(10, 10, 10, 10)
        card2_layout.setSpacing(4)
        card2_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        c2_title = QLabel("Standard\nFertilizer Recommendation")
        c2_title.setFont(QFont("Segoe UI", 20, QFont.Weight.Bold))
        c2_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        c2_title.setStyleSheet("color: #000000; background: transparent; font-weight: bold;")

        c2_desc = QLabel("Fast fertilizer analysis\nEssential Recommendations")
        c2_desc.setFont(QFont("Segoe UI", 10))
        c2_desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        c2_desc.setStyleSheet("color: #333333; background: transparent;")

        card2_layout.addWidget(c2_title)
        card2_layout.addWidget(c2_desc)

        btn2 = QPushButton("Get Started")
        btn2.setFixedHeight(34)
        btn2.setFixedWidth(140)
        btn2.setFont(QFont("Segoe UI", 10, QFont.Weight.Bold))
        btn2.setCursor(Qt.CursorShape.PointingHandCursor)
        btn2.setStyleSheet("""
            QPushButton {
                background-color: #ffffff;
                color: #000000;
                border: 1px solid #bcbcbc;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #fafafa;
                border-color: #777777;
            }
        """)
        btn2.clicked.connect(self.on_standard_clicked)
        
        col2_layout.addWidget(card2)
        col2_layout.addWidget(btn2, alignment=Qt.AlignmentFlag.AlignCenter)

        top_row_layout.addLayout(col1_layout)
        top_row_layout.addLayout(col2_layout)
        choices_layout.addLayout(top_row_layout)

        # -----------------------------------------------------------------
        # Card 3: Research Data Analysis System (Active -> Embedded ReaDA Page)
        # -----------------------------------------------------------------
        # Spans across both top cards (300 + 300 + 28 = 628 width)
        card3 = ClickableGroupBox()
        card3.setFixedSize(628, 120)
        card3.setStyleSheet("""
            QGroupBox {
                background-color: rgba(255, 255, 255, 0.50);
                border: 1px solid #bcbcbc;
                border-radius: 4px;
            }
            QGroupBox:hover {
                background-color: rgba(255, 255, 255, 0.60);
                border: 1.5px solid #286b67;
            }
        """)
        card3_layout = QVBoxLayout(card3)
        card3_layout.setContentsMargins(10, 10, 10, 10)
        card3_layout.setSpacing(4)
        card3_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        c3_title = QLabel("Research Data Analysis System")
        c3_title.setFont(QFont("Segoe UI", 20, QFont.Weight.Bold))
        c3_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        c3_title.setStyleSheet("color: #000000; background: transparent; font-weight: bold;")

        c3_desc = QLabel("Experimental Engine\nPalm Agronomy Databases")
        c3_desc.setFont(QFont("Segoe UI", 10))
        c3_desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        c3_desc.setStyleSheet("color: #333333; background: transparent;")

        card3_layout.addWidget(c3_title)
        card3_layout.addWidget(c3_desc)
        card3.clicked.connect(self.on_research_clicked)

        choices_layout.addWidget(card3, alignment=Qt.AlignmentFlag.AlignCenter)
        main_layout.addLayout(choices_layout)

        # Background Image Path
        self.bg_image_path = os.path.join(
            os.path.dirname(__file__),
            "WhatsApp Image 2026-08-11 at 08.43.18.jpeg"
        )

        self.bg_pixmap = None
        if os.path.exists(self.bg_image_path):
            self.bg_pixmap = QPixmap(self.bg_image_path)

    def paintEvent(self, event):
        if self.bg_pixmap and not self.bg_pixmap.isNull():
            painter = QPainter(self)
            scaled_pix = self.bg_pixmap.scaled(
                self.size(),
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation
            )
            x = (self.width() - scaled_pix.width()) // 2
            y = (self.height() - scaled_pix.height()) // 2
            painter.drawPixmap(x, y, scaled_pix)
            return

        super().paintEvent(event)

    def on_comprehensive_clicked(self):
        print("Comprehensive Fertilizer Recommendation selected! Transitioning to Dashboard Page 2...")
        self.parent_window.show_dashboard_page()

    def on_standard_clicked(self):
        print("Standard Fertilizer Recommendation selected! Transitioning to embedded Standard Page...")
        self.parent_window.page3.load_content()
        self.parent_window.show_standard_page()

    def on_research_clicked(self):
        print("Research Data Analysis System selected! Transitioning to ReaDA Page...")
        self.parent_window.show_reada_page()

class ReaDAWrapperWidget(QWidget):
    """Wrapper Widget to embed the ReaDA Desktop Application inside SmartPalm"""
    def __init__(self, parent_window):
        super().__init__()
        self.parent_window = parent_window

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Top bar with Back to SmartPalm Launcher button
        self.top_bar = QWidget()
        self.top_bar.setStyleSheet("background-color: #286b67; border: none; padding-top: 10px; padding-left: 10px;")
        top_layout = QHBoxLayout(self.top_bar)
        top_layout.setContentsMargins(0, 0, 0, 0)

        self.btn_back_to_smartpalm = QPushButton("← Back to Palmnex-MPOB")
        self.btn_back_to_smartpalm.setFixedHeight(32)
        self.btn_back_to_smartpalm.setFont(QFont("Segoe UI", 20, QFont.Weight.Bold))
        self.btn_back_to_smartpalm.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_back_to_smartpalm.setStyleSheet("""
            QPushButton {
                background-color: #ffffff;
                color: #286b67;
                border: 1px solid #71717a;
                border-radius: 4px;
                padding: 4px 16px;
            }
            QPushButton:hover {
                background-color: #f4f4f5;
                border-color: #286b67;
            }
        """)
        self.btn_back_to_smartpalm.clicked.connect(lambda: self.parent_window.stacked_widget.setCurrentIndex(0))
        top_layout.addWidget(self.btn_back_to_smartpalm)
        top_layout.addStretch()

        main_layout.addWidget(self.top_bar)

        # Load ReaDA dynamically preventing namespace collisions
        import sys
        import os
        import importlib.util

        # Backup cached pages modules
        cached_pages = {}
        for key in list(sys.modules.keys()):
            if key == "pages" or key.startswith("pages."):
                cached_pages[key] = sys.modules.pop(key)

        old_path = list(sys.path)
        sys.path.insert(0, "/Users/drsitiaisyahjaafar/Reada/ReaDA_Desktop_App")

        spec = importlib.util.spec_from_file_location("reada_main", "/Users/drsitiaisyahjaafar/Reada/ReaDA_Desktop_App/main.py")
        reada_main = importlib.util.module_from_spec(spec)
        sys.modules["reada_main"] = reada_main
        spec.loader.exec_module(reada_main)

        self.reada_win = reada_main.OriginalReaDAMainWindow()
        self.reada_win.setWindowFlags(Qt.WindowType.Widget)

        # Clean up loaded pages from sys.modules
        for key in list(sys.modules.keys()):
            if key == "pages" or key.startswith("pages."):
                sys.modules.pop(key)

        # Restore ReaDA/SmartPalm cached pages modules
        for key, mod in cached_pages.items():
            sys.modules[key] = mod

        sys.path = old_path

        # Override closeEvent of ReaDA main window to transition back to SmartPalm Page 1 instead of closing app
        def custom_closeEvent(event):
            self.parent_window.stacked_widget.setCurrentIndex(0)
            event.ignore()
        self.reada_win.closeEvent = custom_closeEvent

        main_layout.addWidget(self.reada_win)

class MainWindow(QMainWindow):
    """Main Application Window managing Page 1, Dashboard Page 2, and Standard Page 3"""
    def __init__(self):
        super().__init__()

        self.setWindowTitle("SmartPalm Application")
        self.resize(1120, 740)
        self.setMinimumSize(850, 600)

        # Stacked Widget for Page Switching
        self.stacked_widget = QStackedWidget()
        self.setCentralWidget(self.stacked_widget)

        # Page 1 (Home Option Selection Page)
        self.page1 = Page1Widget(self)
        
        # Page 2 (Comprehensive Dashboard Page)
        self.page2 = DashboardPage(self)

        # Page 3 (Standard Fertilizer Recommendation Page)
        self.page3 = StandardFertilizerPage(self)

        # Page 4 (Embedded ReaDA Application Page)
        self.page4 = ReaDAWrapperWidget(self)

        self.stacked_widget.addWidget(self.page1)
        self.stacked_widget.addWidget(self.page2)
        self.stacked_widget.addWidget(self.page3)
        self.stacked_widget.addWidget(self.page4)

        # Start on Page 1
        self.stacked_widget.setCurrentIndex(0)

        # Apply Windows Style Classic Native Theme across all application windows
        self.apply_windows_native_style()

    def show_dashboard_page(self):
        self.stacked_widget.setCurrentIndex(1)

    def show_standard_page(self):
        self.stacked_widget.setCurrentIndex(2)

    def show_reada_page(self):
        self.stacked_widget.setCurrentIndex(3)

    def apply_windows_native_style(self):
        """Unified Windows Style (Classic Native Look)"""
        windows_qss = """
            QWidget {
                background-color: #f0f0f0;
                color: #000000;
            }
            Page1Widget {
                background-color: transparent;
            }
            QMainWindow {
                background-color: #f0f0f0;
            }
            QGroupBox {
                background-color: #ffffff;
                border: 1px solid #bcbcbc;
                border-radius: 2px;
                margin-top: 10px;
                padding-top: 14px;
                font-weight: bold;
                font-size: 12px;
                color: #000000;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 0 4px;
                background-color: #ffffff;
                color: #000000;
            }
            QGroupBox:disabled {
                background-color: #f4f4f4;
                border: 1px solid #d9d9d9;
                color: #838383;
            }
            QPushButton {
                background-color: #e1e1e1;
                color: #000000;
                border: 1px solid #adadad;
                border-radius: 2px;
                padding: 5px 14px;
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
            QMessageBox {
                background-color: #f0f0f0;
            }
        """
        self.setStyleSheet(windows_qss)

    def closeEvent(self, event):
        # Clean up QWebEngineView objects and QWebChannel links to prevent crash on exit
        if hasattr(self, 'page2') and hasattr(self.page2, 'web_view') and self.page2.web_view:
            self.page2.web_view.setParent(None)
            self.page2.web_view.deleteLater()
            self.page2.web_view = None
        if hasattr(self, 'page3') and hasattr(self.page3, 'web_view') and self.page3.web_view:
            self.page3.web_view.setParent(None)
            self.page3.web_view.deleteLater()
            self.page3.web_view = None
        # Clean up ReaDA window to prevent crash on exit
        if hasattr(self, 'page4') and hasattr(self.page4, 'reada_win') and self.page4.reada_win:
            self.page4.reada_win.deleteLater()
            self.page4.reada_win = None
        super().closeEvent(event)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    if "Windows" in QStyleFactory.keys():
        app.setStyle(QStyleFactory.create("Windows"))
    elif "Fusion" in QStyleFactory.keys():
        app.setStyle(QStyleFactory.create("Fusion"))

    window = MainWindow()
    window.show()
    
    exit_code = app.exec()
    
    # Process events to cleanly delete and destroy all QWebEngineView widgets
    del window
    app.processEvents()
    sys.exit(exit_code)

