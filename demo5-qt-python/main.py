import sys
import os
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QLabel, QPushButton, QStyleFactory
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont, QPixmap, QImage, QPainter, QColor

def create_outlined_transparent_logo(image_path, target_height=60, stroke_width=2, stroke_color=QColor("#000000")):
    """
    Generates a QPixmap of the logo with a crisp black outline around all words & graphics,
    maintaining 100% transparent background.
    """
    if not os.path.exists(image_path):
        return QPixmap()
    
    src_img = QImage(image_path)
    if src_img.isNull():
        return QPixmap()
    
    scaled_img = src_img.scaledToHeight(target_height, Qt.TransformationMode.SmoothTransformation)
    
    padding = stroke_width + 2
    w = scaled_img.width() + padding * 2
    h = scaled_img.height() + padding * 2
    
    # Create black silhouette
    silhouette = QImage(scaled_img.size(), QImage.Format.Format_ARGB32)
    silhouette.fill(Qt.GlobalColor.transparent)
    p_sil = QPainter(silhouette)
    p_sil.drawImage(0, 0, scaled_img)
    p_sil.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceIn)
    p_sil.fillRect(silhouette.rect(), stroke_color)
    p_sil.end()

    # Render final canvas with 100% transparent background
    final_img = QImage(w, h, QImage.Format.Format_ARGB32)
    final_img.fill(Qt.GlobalColor.transparent)
    
    p_final = QPainter(final_img)
    p_final.setRenderHint(QPainter.RenderHint.Antialiasing)
    
    # Draw silhouette around all offset angles for stroke
    for dx in range(-stroke_width, stroke_width + 1):
        for dy in range(-stroke_width, stroke_width + 1):
            if dx*dx + dy*dy <= (stroke_width + 0.5)**2 and (dx != 0 or dy != 0):
                p_final.drawImage(padding + dx, padding + dy, silhouette)
    
    # Draw original colored logo in center
    p_final.drawImage(padding, padding, scaled_img)
    p_final.end()
    
    return QPixmap.fromImage(final_img)


class MainWindow(QMainWindow):
    """First Page Application Window"""
    def __init__(self):
        super().__init__()

        self.setWindowTitle("SmartPalm - Page 1")
        self.resize(640, 420)
        self.setMinimumSize(480, 320)

        # Central Widget & Layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(40, 40, 40, 40)
        main_layout.setSpacing(35)
        main_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Transparent Logo with Black Outline
        logo_label = QLabel()
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        logo_path = os.path.join(os.path.dirname(__file__), "MPOB-3_transparent.png")
        outlined_logo = create_outlined_transparent_logo(
            logo_path,
            target_height=55,
            stroke_width=2,
            stroke_color=QColor("#000000")
        )
        if not outlined_logo.isNull():
            logo_label.setPixmap(outlined_logo)

        # Single Action Button ("hello")
        self.hello_btn = QPushButton("hello")
        self.hello_btn.setFixedHeight(42)
        self.hello_btn.setFixedWidth(160)
        self.hello_btn.setFont(QFont("Tahoma", 12, QFont.Weight.Bold))
        self.hello_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.hello_btn.clicked.connect(self.on_hello_clicked)

        # Status Label
        self.status_label = QLabel("")
        self.status_label.setFont(QFont("Tahoma", 11, QFont.Weight.Bold))
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("color: #000000;")

        # Add to layout
        main_layout.addWidget(logo_label, alignment=Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.hello_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.status_label)

        # Apply Classic Windows Style
        self.apply_classic_windows_style()

    def apply_classic_windows_style(self):
        classic_qss = """
            QWidget {
                background-color: #d4d0c8;
                color: #000000;
                font-family: "Tahoma", "Segoe UI", sans-serif;
            }
            QMainWindow {
                background-color: #d4d0c8;
            }
            QPushButton {
                background-color: #d4d0c8;
                color: #000000;
                border-top: 2px solid #ffffff;
                border-left: 2px solid #ffffff;
                border-right: 2px solid #404040;
                border-bottom: 2px solid #404040;
                padding: 6px 18px;
            }
            QPushButton:pressed {
                border-top: 2px solid #404040;
                border-left: 2px solid #404040;
                border-right: 2px solid #ffffff;
                border-bottom: 2px solid #ffffff;
                padding-top: 8px;
                padding-left: 20px;
            }
        """
        self.setStyleSheet(classic_qss)

    def on_hello_clicked(self):
        print("Hello button clicked!")
        self.status_label.setText("hello!")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    if "Fusion" in QStyleFactory.keys():
        app.setStyle(QStyleFactory.create("Fusion"))
    elif "Windows" in QStyleFactory.keys():
        app.setStyle(QStyleFactory.create("Windows"))

    window = MainWindow()
    window.show()
    sys.exit(app.exec())
