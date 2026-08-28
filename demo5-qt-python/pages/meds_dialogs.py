import sys
import os
from PySide6.QtWidgets import (
    QDialog, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QLineEdit, QPushButton, QTabWidget, QTableWidget, QTableWidgetItem,
    QGroupBox, QHeaderView, QMessageBox, QScrollArea, QGraphicsView, QGraphicsScene
)
from PySide6.QtCore import Qt, QSignalBlocker, Signal, QTimer, QSize
from PySide6.QtGui import QFont, QColor, QPixmap, QPainter

class RotatedLabel(QLabel):
    def __init__(self, text, parent=None):
        super().__init__(text, parent)
        self.setFixedWidth(26)
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setFont(self.font())
        painter.setPen(QColor('#000000'))
        
        # Translate to bottom-left to rotate text vertically upwards (-90 deg)
        painter.translate(0, self.height())
        painter.rotate(-90)
        
        # Draw the text vertically along the height of this label widget
        painter.drawText(0, 0, self.height(), self.width(), Qt.AlignmentFlag.AlignCenter, self.text())
        painter.end()

    def minimumSizeHint(self):
        sz = super().minimumSizeHint()
        return QSize(26, sz.width() + 10)

    def sizeHint(self):
        sz = super().sizeHint()
        return QSize(26, sz.width() + 10)

# =====================================================================
#  MPOB MEDS 1.1 FORMULA ENGINE
# =====================================================================

def calculate_crr(added_revenue, added_cost):
    if added_revenue <= 0:
        return 0.0
    return added_cost / added_revenue

def calculate_inland_baseline(age, density, drainage, consistency, slope, organic, silt, extractable, teb, root, rainfall):
    y_pot = 93.81 - (1.652 * age) - (0.1957 * density) - (9.101 * drainage) - (0.0116 * extractable)
    k_ratio = extractable / teb if teb != 0 else 0.10
    rating = 9.823 - (5.221 * drainage) + (4.3 * organic) + (50.04 * k_ratio)
    sf = rating / 18.206 if rating > 0 else 1.0
    y0 = 14.38 * sf * (y_pot / 35.919892)
    return round(y0, 2)

def calculate_inland_yield_surface(n, k, y0):
    rev_matrix = {
        0.0: {0.0: 0, 0.5: 376, 1.0: 680, 1.5: 888, 2.0: 1040, 2.5: 1136, 3.0: 1184, 3.5: 1200, 4.0: 1184, 4.5: 1144, 5.0: 1080},
        0.5: {0.0: 672, 0.5: 1104, 1.0: 1472, 1.5: 1728, 2.0: 1936, 2.5: 2080, 3.0: 2184, 3.5: 2240, 4.0: 2264, 4.5: 2264, 5.0: 2240},
        1.0: {0.0: 1216, 0.5: 1712, 1.0: 2136, 1.5: 2448, 2.0: 2720, 2.5: 2904, 3.0: 3056, 3.5: 3160, 4.0: 3232, 4.5: 3272, 5.0: 3288},
        1.5: {0.0: 1552, 0.5: 2088, 1.0: 2568, 1.5: 2928, 2.0: 3240, 2.5: 3472, 3.0: 3664, 3.5: 3808, 4.0: 3912, 4.5: 3984, 5.0: 4032},
        2.0: {0.0: 1800, 0.5: 2392, 1.0: 2920, 1.5: 3328, 2.0: 3688, 2.5: 3960, 3.0: 4200, 3.5: 4376, 4.0: 4528, 4.5: 4632, 5.0: 4712},
        2.5: {0.0: 1944, 0.5: 2576, 1.0: 3144, 1.5: 3592, 2.0: 3992, 2.5: 4296, 3.0: 4568, 3.5: 4776, 4.0: 4952, 4.5: 5088, 5.0: 5200},
        3.0: {0.0: 2032, 0.5: 2704, 1.0: 3320, 1.5: 3808, 2.0: 4240, 2.5: 4584, 3.0: 4896, 3.5: 5136, 4.0: 5344, 4.5: 5504, 5.0: 5648},
        3.5: {0.0: 2064, 0.5: 2776, 1.0: 3424, 1.5: 3944, 2.0: 4408, 2.5: 4784, 3.0: 5120, 3.5: 5384, 4.0: 5624, 4.5: 5808, 5.0: 5968},
        4.0: {0.0: 2072, 0.5: 2816, 1.0: 3504, 1.5: 4048, 2.0: 4552, 2.5: 4952, 3.0: 5320, 3.5: 5608, 4.0: 5872, 4.5: 6080, 5.0: 6264},
        4.5: {0.0: 2056, 0.5: 2832, 1.0: 3544, 1.5: 4120, 2.0: 4640, 2.5: 5064, 3.0: 5456, 3.5: 5768, 4.0: 6048, 4.5: 6272, 5.0: 6480},
        5.0: {0.0: 2024, 0.5: 2824, 1.0: 3568, 1.5: 4168, 2.0: 4720, 2.5: 5160, 3.0: 5576, 3.5: 5904, 4.0: 6208, 4.5: 6456, 5.0: 6680},
        5.5: {0.0: 1984, 0.5: 2808, 1.0: 3568, 1.5: 4192, 2.0: 4760, 2.5: 5224, 3.0: 5656, 3.5: 6008, 4.0: 6328, 4.5: 6584, 5.0: 6824},
        6.0: {0.0: 1936, 0.5: 2776, 1.0: 3568, 1.5: 4208, 2.0: 4800, 2.5: 5280, 3.0: 5728, 3.5: 6096, 4.0: 6432, 4.5: 6704, 5.0: 6960}
    }
    rev_gain = rev_matrix.get(n, {}).get(k, 0)
    added_yield = rev_gain / 800.0
    predicted_yield = max(0.0, y0 + added_yield)
    return round(predicted_yield, 2)

def calculate_coastal_baseline(drainage, rainfall):
    return round(20.44 - (3.022 * drainage) + (0.004535 * rainfall), 2)

def calculate_coastal_yield_surface(n, k, y0):
    val = 268.50 - (19.9268 * n) - (9.8243 * k) + (0.3884 * (n**2)) + (0.7609 * (n * k)) - (0.01409 * (n**2 * k))
    delta = val - 268.50
    predicted_yield = max(0.0, y0 + delta)
    return round(predicted_yield, 2)

class MEDSEngine:
    @staticmethod
    def calculate_inland(inputs):
        age = float(inputs.get('age', 12))
        density = float(inputs.get('density', 148))
        drainage = float(inputs.get('drainage', 1))
        consistency = float(inputs.get('consistency', 1))
        slope = float(inputs.get('slope', 0.5))
        organic = float(inputs.get('organic', 2.0))
        silt = float(inputs.get('silt', 18))
        extractable = float(inputs.get('extractable', 0.13))
        teb = float(inputs.get('teb', 1.3))
        root_impedance = float(inputs.get('root_impedance', 0.2))
        rainfall = float(inputs.get('rainfall', 2000))

        price_ffb = float(inputs.get('ffb', 800))
        price_sa = float(inputs.get('sa', 1200))
        price_kcl = float(inputs.get('kcl', 1600))

        Y0 = calculate_inland_baseline(age, density, drainage, consistency, slope, organic, silt, extractable, teb, root_impedance, rainfall)

        n_rates = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]
        k_rates = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]

        yield_grid = {}
        for n in n_rates:
            yield_grid[n] = {}
            for k in k_rates:
                predicted_yield = calculate_inland_yield_surface(n, k, Y0)
                yield_grid[n][k] = round(predicted_yield, 2)

        base_y = yield_grid[0.0][0.0]
        revenue_grid = {}
        crr_grid = {}

        for n in n_rates:
            revenue_grid[n] = {}
            crr_grid[n] = {}
            for k in k_rates:
                y = yield_grid[n][k]
                r_es = y - base_y
                p_r = r_es * price_ffb
                t_c = ((n * density * price_sa / 1000.0) + (k * density * price_kcl / 1000.0))

                revenue_grid[n][k] = int(round(p_r))

                if n == 0.0 and k == 0.0:
                    crr_grid[n][k] = 0.0
                else:
                    crr_val = calculate_crr(p_r, t_c)
                    crr_grid[n][k] = round(crr_val, 2)

        return n_rates, k_rates, yield_grid, revenue_grid, crr_grid

    @staticmethod
    def calculate_coastal(inputs):
        clay = float(inputs.get('clay', 45))
        drainage = float(inputs.get('drainage', 1))
        density = float(inputs.get('density', 148))
        rainfall = float(inputs.get('rainfall', 2000))
        tec = float(inputs.get('tec', 12.5))
        extractable = float(inputs.get('extractable', 0.4))
        silt = float(inputs.get('silt', 30))

        price_ffb = float(inputs.get('ffb', 800))
        price_sa = float(inputs.get('sa', 1200))
        price_kcl = float(inputs.get('kcl', 1600))

        Y0 = calculate_coastal_baseline(drainage, rainfall)

        n_rates = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]
        k_rates = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]

        yield_grid = {}
        for n in n_rates:
            yield_grid[n] = {}
            for k in k_rates:
                predicted_yield = calculate_coastal_yield_surface(n, k, Y0)
                yield_grid[n][k] = round(predicted_yield, 2)

        base_y = yield_grid[0.0][0.0]
        revenue_grid = {}
        crr_grid = {}

        for n in n_rates:
            revenue_grid[n] = {}
            crr_grid[n] = {}
            for k in k_rates:
                y = yield_grid[n][k]
                r_es = y - base_y
                p_r = r_es * price_ffb
                t_c = ((n * density * price_sa / 1000.0) + (k * density * price_kcl / 1000.0))

                revenue_grid[n][k] = int(round(p_r))

                if n == 0.0 and k == 0.0:
                    crr_grid[n][k] = 0.0
                else:
                    crr_val = calculate_crr(p_r, t_c)
                    crr_grid[n][k] = round(crr_val, 2)

        return n_rates, k_rates, yield_grid, revenue_grid, crr_grid


# =====================================================================
#  UI DIALOGS MATCHING CLASSIC WINDOWS NATIVE LOOK
# =====================================================================

class OutputDialog(QDialog):
    """3-Tab Output Grid Dialog (Yield, Revenue, Cost/Revenue Ratio) with 4-Nutrient Summary Banner"""
    def __init__(self, title, n_rates, k_rates, yield_grid, revenue_grid, crr_grid, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.resize(940, 640)
        self.setStyleSheet("""
            QDialog {
                background-color: #f0f0f0;
                color: #000000;
                font-family: "Segoe UI", "Tahoma", sans-serif;
            }
        """)

        layout = QVBoxLayout(self)

        tabs = QTabWidget()
        tabs.setStyleSheet("""
            QTabWidget::pane { border: 1px solid #bcbcbc; background: #ffffff; }
            QTabBar::tab { background: #e1e1e1; color: #000000; padding: 6px 16px; font-weight: bold; border: 1px solid #adadad; border-bottom: none; border-top-left-radius: 3px; border-top-right-radius: 3px; }
            QTabBar::tab:selected { background: #ffffff; color: #000000; border: 1px solid #bcbcbc; border-bottom: 2px solid #0078d7; }
        """)
        layout.addWidget(tabs)

        tab_yield = QWidget()
        tab_rev = QWidget()
        tab_crr = QWidget()

        tabs.addTab(tab_yield, 'FFB Yield Prediction')
        tabs.addTab(tab_rev, 'Revenue Gain')
        tabs.addTab(tab_crr, 'Cost/Revenue Ratio')

        self.n_rates = n_rates
        self.k_rates = k_rates
        self.yield_grid = yield_grid
        self.revenue_grid = revenue_grid
        self.crr_grid = crr_grid

        self.tbl_yield = self.setup_grid_table(tab_yield, n_rates, k_rates, yield_grid, 'K Fertilizer (kg/palm)', is_crr=False, crr_grid=crr_grid)
        self.tbl_rev = self.setup_grid_table(tab_rev, n_rates, k_rates, revenue_grid, 'K Fertilizer (kg/palm)', is_crr=False, crr_grid=crr_grid)
        self.tbl_crr = self.setup_grid_table(tab_crr, n_rates, k_rates, crr_grid, 'K Fertilizer (kg/palm)', is_crr=True, crr_grid=crr_grid)

        # Synchronize cell selection across all 3 tabs!
        self.tables = [self.tbl_yield, self.tbl_rev, self.tbl_crr]
        for tbl in self.tables:
            tbl.currentCellChanged.connect(self.make_sync_handler(tbl))

        # Bottom Action Bar with Print Report Button (Matching popup screenshot layout)
        bottom_bar = QHBoxLayout()
        bottom_bar.setContentsMargins(10, 8, 12, 10)

        self.btn_print = QPushButton("📄 Print Full Report (.pdf)")
        self.btn_print.setFixedHeight(36)
        self.btn_print.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        self.btn_print.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_print.setStyleSheet("""
            QPushButton {
                background-color: #12b886;
                color: #ffffff;
                border: none;
                border-radius: 6px;
                padding: 6px 20px;
            }
            QPushButton:hover {
                background-color: #0ca678;
            }
            QPushButton:pressed {
                background-color: #099268;
            }
        """)
        self.btn_print.clicked.connect(self.on_print_clicked)

        bottom_bar.addStretch()
        bottom_bar.addWidget(self.btn_print)
        layout.addLayout(bottom_bar)

    def get_dashboard_parent(self):
        """Traverses parent hierarchy or active application widgets to locate the DashboardPage instance"""
        curr = self.parent()
        while curr:
            if hasattr(curr, 'print_pdf_report_by_soil'):
                return curr
            curr = curr.parent()

        from PySide6.QtWidgets import QApplication
        for widget in QApplication.topLevelWidgets():
            if hasattr(widget, 'print_pdf_report_by_soil'):
                return widget
            if hasattr(widget, 'findChild'):
                from pages.dashboard_page import DashboardPage
                dash = widget.findChild(DashboardPage)
                if dash:
                    return dash
        return None

    def on_print_clicked(self):
        dash = self.get_dashboard_parent()
        if dash:
            r = -1
            c = -1
            for tbl in self.tables:
                if tbl.currentRow() >= 0 and tbl.currentColumn() >= 0:
                    r = tbl.currentRow()
                    c = tbl.currentColumn()
                    break
                curr = tbl.currentItem()
                if curr and curr.row() >= 0 and curr.column() >= 0:
                    r = curr.row()
                    c = curr.column()
                    break

            # Default to index 9 (N=4.5, K=4.5, Yield=22.22, CRR=0.30) if no cell is manually clicked
            if r < 0 or r >= len(self.n_rates): r = 9 if len(self.n_rates) > 9 else 0
            if c < 0 or c >= len(self.k_rates): c = 9 if len(self.k_rates) > 9 else 0

            n_val = self.n_rates[r]
            k_val = self.k_rates[c]
            yield_val = self.yield_grid[n_val][k_val]
            rev_val = self.revenue_grid[n_val][k_val]
            crr_val = self.crr_grid[n_val][k_val]

            # Retrieve inputs dictionary from parent dialog
            inputs_data = {}
            if hasattr(self.parent(), 'inputs'):
                for key, txt_widget in self.parent().inputs.items():
                    inputs_data[key] = txt_widget.text().strip()

            dash.meds_report_data = {
                'title': self.windowTitle(),
                'n_rates': self.n_rates,
                'k_rates': self.k_rates,
                'yield_grid': self.yield_grid,
                'revenue_grid': self.revenue_grid,
                'crr_grid': self.crr_grid,
                'selected_n_index': r,
                'selected_k_index': c,
                'inputs': inputs_data
            }

            if hasattr(dash, 'on_output_cell_selected'):
                dash.on_output_cell_selected(n_val, k_val, yield_val, rev_val, crr_val)

            soil_type = getattr(dash, 'current_soil_type', 'Inland')
            dash.print_pdf_report_by_soil(soil_type)
            self.accept()

    def make_sync_handler(self, source_tbl):
        def handler(r, c, prev_r, prev_c):
            if r < 0 or c < 0:
                return
            for t in self.tables:
                if t is not source_tbl:
                    blocker = QSignalBlocker(t)
                    t.setCurrentCell(r, c)

            dash = self.get_dashboard_parent()
            if dash and hasattr(dash, 'on_output_cell_selected'):
                n_val = self.n_rates[r]
                k_val = self.k_rates[c]
                yield_val = self.yield_grid[n_val][k_val]
                rev_val = self.revenue_grid[n_val][k_val]
                crr_val = self.crr_grid[n_val][k_val]
                dash.on_output_cell_selected(n_val, k_val, yield_val, rev_val, crr_val)
        return handler

    def setup_grid_table(self, tab_widget, n_rates, k_rates, grid_data, x_label, is_crr=False, crr_grid=None):
        layout = QVBoxLayout(tab_widget)
        
        top_lbl = QLabel(f'{x_label}')
        top_lbl.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))
        top_lbl.setStyleSheet('color: #000000; margin-top: 5px; margin-bottom: 5px;')
        top_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(top_lbl)

        # QHBoxLayout for Y-Axis legend + Table
        table_row_layout = QHBoxLayout()

        y_lbl = RotatedLabel("N Fertilizer (kg/palm)")
        y_lbl.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))
        y_lbl.setStyleSheet('color: #000000; margin-right: 5px;')
        table_row_layout.addWidget(y_lbl)

        tbl = QTableWidget(len(n_rates), len(k_rates))
        tbl.setStyleSheet("""
            QTableWidget { background-color: #FFFFFF; color: #000000; gridline-color: #bcbcbc; font-size: 11px; }
            QTableWidget::item:selected { background-color: #B3E5FC; color: #01579B; font-weight: bold; border: 2px solid #0288D1; }
            QHeaderView::section { background-color: #f0f0f0; color: #000000; font-weight: bold; border: 1px solid #bcbcbc; padding: 4px; }
        """)
        tbl.setHorizontalHeaderLabels([str(k) for k in k_rates])
        tbl.setVerticalHeaderLabels([str(n) for n in n_rates])

        for r_i, n in enumerate(n_rates):
            for c_i, k in enumerate(k_rates):
                val = grid_data[n][k]
                display_str = f'{val:.2f}' if is_crr else str(val)
                item = QTableWidgetItem(display_str)
                item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)

                # HIGHLIGHTING RULES:
                # 1) COST/REVENUE RATIO (is_crr=True):
                #    - VALUES EQUAL TO 0.30: LAWNGREEN (#7CFC00)
                #    - VALUES IN RANGE 0.28 to 0.29: YELLOW (#FFEE58)
                # 2) YIELD & REVENUE GAIN (is_crr=False):
                #    - CELLS WHERE CRR EQUALS 0.30: GREYISH (#D3D3D3)
                if is_crr:
                    if abs(val - 0.30) < 0.005:
                        item.setBackground(QColor('#7CFC00'))
                        item.setForeground(QColor('#000000'))
                        item.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))
                    elif 0.275 <= val <= 0.295:
                        item.setBackground(QColor('#FFEE58'))
                        item.setForeground(QColor('#000000'))
                        item.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))
                else:
                    if crr_grid and n in crr_grid and k in crr_grid[n]:
                        crr_val = crr_grid[n][k]
                        if abs(crr_val - 0.30) < 0.005:
                            item.setBackground(QColor('#D3D3D3'))
                            item.setForeground(QColor('#000000'))
                            item.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))

                tbl.setItem(r_i, c_i, item)

        tbl.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        tbl.verticalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        table_row_layout.addWidget(tbl)
        layout.addLayout(table_row_layout)
        return tbl


class EDSInlandDialog(QDialog):
    """EDS Inland Soils Parameter Input Dialog"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle('EDS Inland Soils')
        self.resize(780, 530)
        self.setStyleSheet("""
            QDialog {
                background-color: #f0f0f0;
                color: #000000;
                font-family: "Segoe UI", "Tahoma", sans-serif;
            }
            QGroupBox {
                border: 1px solid #bcbcbc;
                border-radius: 2px;
                margin-top: 10px;
                background-color: #ffffff;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 4px;
                color: #000000;
            }
            QLineEdit {
                padding: 4px;
                border: 1px solid #bcbcbc;
                border-radius: 2px;
                background: #ffffff;
                color: #000000;
            }
            QPushButton {
                background-color: #e1e1e1;
                color: #000000;
                border: 1px solid #adadad;
                border-radius: 2px;
                padding: 8px 16px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #e5f1fb;
                border-color: #0078d7;
            }
            QPushButton:pressed {
                background-color: #cce4f7;
            }
        """)

        main_layout = QVBoxLayout(self)

        title_lbl = QLabel('OIL PALM YIELD PREDICTION ON INLAND SOILS')
        title_lbl.setFont(QFont('Segoe UI', 13, QFont.Weight.Bold))
        title_lbl.setStyleSheet('color: #000000; margin-top: 5px; margin-bottom: 10px;')
        title_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(title_lbl)

        content_layout = QHBoxLayout()
        main_layout.addLayout(content_layout)

        # Characteristics Group Box
        char_group = QGroupBox('Characteristics')
        char_layout = QGridLayout(char_group)
        content_layout.addWidget(char_group)

        self.inputs = {}
        char_fields = [
            ('Palm age (Year)', 'age', '12'),
            ('Planting density (palms/ha)', 'density', '148'),
            ('Soil drainage class', 'drainage', '1'),
            ('Soil consistency class', 'consistency', '1'),
            ('Slope class', 'slope', '0.5'),
            ('Root growth impedance class', 'root_impedance', '0.2'),
            ('Soil organic matter (%)', 'organic', '2'),
            ('Silt (%)', 'silt', '18'),
            ('Extractable K (cmol/kg)', 'extractable', '0.13'),
            ('Total extractable bases (cmol/kg)', 'teb', '1.3'),
            ('Annual rainfall (mm/year)', 'rainfall', '2000'),
        ]

        for r, (lbl_str, key, def_val) in enumerate(char_fields):
            lbl = QLabel(lbl_str)
            txt = QLineEdit(def_val)
            self.inputs[key] = txt
            char_layout.addWidget(lbl, r, 0)
            char_layout.addWidget(txt, r, 1)

        # Cost Group Box
        cost_group = QGroupBox('Cost')
        cost_layout = QGridLayout(cost_group)
        content_layout.addWidget(cost_group)

        cost_fields = [
            ('Price for F.F.B/tonne', 'ffb', '800'),
            ('Cost of SA/tonne', 'sa', '1200'),
            ('Cost of KCl/tonne', 'kcl', '1600'),
        ]

        for r, (lbl_str, key, def_val) in enumerate(cost_fields):
            lbl = QLabel(lbl_str)
            txt = QLineEdit(def_val)
            self.inputs[key] = txt
            cost_layout.addWidget(lbl, r, 0)
            cost_layout.addWidget(txt, r, 1)

        btn_calc = QPushButton('Calculate Yield & Economic Response')
        btn_calc.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))
        btn_calc.clicked.connect(self.on_calculate)
        main_layout.addWidget(btn_calc)

    def on_calculate(self):
        val_map = {k: txt.text().strip() for k, txt in self.inputs.items()}
        n_rates, k_rates, yield_grid, rev_grid, crr_grid = MEDSEngine.calculate_inland(val_map)
        self.out_win = OutputDialog('EDS Inland Soil Output Grid', n_rates, k_rates, yield_grid, rev_grid, crr_grid, self)
        self.out_win.exec()


class EDSCoastalDialog(QDialog):
    """EDS Coastal / Alluvial Soils Parameter Input Dialog"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle('EDS Coastal / Alluvial Soils')
        self.resize(780, 500)
        self.setStyleSheet("""
            QDialog {
                background-color: #f0f0f0;
                color: #000000;
                font-family: "Segoe UI", "Tahoma", sans-serif;
            }
            QGroupBox {
                border: 1px solid #bcbcbc;
                border-radius: 2px;
                margin-top: 10px;
                background-color: #ffffff;
                font-weight: bold;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 4px;
                color: #000000;
            }
            QLineEdit {
                padding: 4px;
                border: 1px solid #bcbcbc;
                border-radius: 2px;
                background: #ffffff;
                color: #000000;
            }
            QPushButton {
                background-color: #e1e1e1;
                color: #000000;
                border: 1px solid #adadad;
                border-radius: 2px;
                padding: 8px 16px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #e5f1fb;
                border-color: #0078d7;
            }
            QPushButton:pressed {
                background-color: #cce4f7;
            }
        """)

        main_layout = QVBoxLayout(self)

        title_lbl = QLabel('OIL PALM YIELD PREDICTION ON COASTAL / ALLUVIAL SOILS')
        title_lbl.setFont(QFont('Segoe UI', 13, QFont.Weight.Bold))
        title_lbl.setStyleSheet('color: #000000; margin-bottom: 10px;')
        title_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(title_lbl)

        content_layout = QHBoxLayout()
        main_layout.addLayout(content_layout)

        char_group = QGroupBox('Characteristics')
        char_layout = QGridLayout(char_group)
        content_layout.addWidget(char_group)

        self.inputs = {}
        char_fields = [
            ('Clay (%)', 'clay', '45'),
            ('Soil drainage class', 'drainage', '1'),
            ('Planting density (palms/ha)', 'density', '148'),
            ('Annual rainfall (mm/year)', 'rainfall', '2000'),
            ('Total exchangeable cation (cmol/kg)', 'tec', '12.5'),
            ('Extractable K (cmol/kg)', 'extractable', '0.4'),
            ('Silt (%)', 'silt', '30'),
        ]

        for r, (lbl_str, key, def_val) in enumerate(char_fields):
            lbl = QLabel(lbl_str)
            txt = QLineEdit(def_val)
            self.inputs[key] = txt
            char_layout.addWidget(lbl, r, 0)
            char_layout.addWidget(txt, r, 1)

        cost_group = QGroupBox('Cost')
        cost_layout = QGridLayout(cost_group)
        content_layout.addWidget(cost_group)

        cost_fields = [
            ('Price for F.F.B/tonne', 'ffb', '800'),
            ('Cost of SA/tonne', 'sa', '1200'),
            ('Cost of KCl/tonne', 'kcl', '1600'),
        ]

        for r, (lbl_str, key, def_val) in enumerate(cost_fields):
            lbl = QLabel(lbl_str)
            txt = QLineEdit(def_val)
            self.inputs[key] = txt
            cost_layout.addWidget(lbl, r, 0)
            cost_layout.addWidget(txt, r, 1)

        btn_calc = QPushButton('Calculate Yield & Economic Response')
        btn_calc.setFont(QFont('Segoe UI', 10, QFont.Weight.Bold))
        btn_calc.clicked.connect(self.on_calculate)
        main_layout.addWidget(btn_calc)

    def on_calculate(self):
        val_map = {k: txt.text().strip() for k, txt in self.inputs.items()}
        n_rates, k_rates, yield_grid, rev_grid, crr_grid = MEDSEngine.calculate_coastal(val_map)
        self.out_win = OutputDialog('EDS Coastal Soil Output Grid', n_rates, k_rates, yield_grid, rev_grid, crr_grid, self)
        self.out_win.exec()

class ZoomableGraphicsView(QGraphicsView):
    """Custom QGraphicsView with smooth mouse wheel zooming & drag-to-pan functionality"""
    zoomChanged = Signal(float)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._scene = QGraphicsScene(self)
        self.setScene(self._scene)
        self.pixmap_item = None
        self.current_zoom = 1.0

        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.setStyleSheet("QGraphicsView { border: 1px solid #bcbcbc; background-color: #f5f5f5; }")

    def set_pixmap(self, pixmap):
        self._scene.clear()
        self.pixmap_item = self._scene.addPixmap(pixmap)
        self._scene.setSceneRect(self.pixmap_item.boundingRect())
        self.fit_to_view()

    def wheelEvent(self, event):
        if self.pixmap_item is None:
            return
        zoom_in_factor = 1.15
        zoom_out_factor = 1.0 / zoom_in_factor

        if event.angleDelta().y() > 0:
            zoom_factor = zoom_in_factor
        else:
            zoom_factor = zoom_out_factor

        new_zoom = self.current_zoom * zoom_factor
        if 0.1 <= new_zoom <= 15.0:
            self.current_zoom = new_zoom
            self.scale(zoom_factor, zoom_factor)
            self.zoomChanged.emit(self.current_zoom)

    def zoom_in(self):
        if self.pixmap_item is None:
            return
        zoom_factor = 1.25
        new_zoom = self.current_zoom * zoom_factor
        if new_zoom <= 15.0:
            self.current_zoom = new_zoom
            self.scale(zoom_factor, zoom_factor)
            self.zoomChanged.emit(self.current_zoom)

    def zoom_out(self):
        if self.pixmap_item is None:
            return
        zoom_factor = 1.0 / 1.25
        new_zoom = self.current_zoom * zoom_factor
        if new_zoom >= 0.1:
            self.current_zoom = new_zoom
            self.scale(zoom_factor, zoom_factor)
            self.zoomChanged.emit(self.current_zoom)

    def fit_to_view(self):
        if self.pixmap_item is None:
            return
        self.resetTransform()
        self.fitInView(self.pixmap_item, Qt.AspectRatioMode.KeepAspectRatio)
        scale_x = self.transform().m11()
        self.current_zoom = scale_x if scale_x > 0 else 1.0
        self.zoomChanged.emit(self.current_zoom)

    def reset_zoom(self):
        if self.pixmap_item is None:
            return
        self.resetTransform()
        self.current_zoom = 1.0
        self.zoomChanged.emit(self.current_zoom)

class FullMapNutrientDialog(QDialog):
    """Pop-up Dialog displaying Full Map Nutrient Detection with interactive Zoom & Pan controls"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Full Map Nutrient Detection - SmartPalm")
        self.resize(1150, 780)
        self.setMinimumSize(850, 600)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(16, 16, 16, 16)
        main_layout.setSpacing(10)

        # Title Header
        title_lbl = QLabel("Full Map Nutrient Detection Overview")
        title_lbl.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        title_lbl.setStyleSheet("color: #000000;")
        title_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(title_lbl)

        sub_lbl = QLabel("Comprehensive spatial nutrient distribution maps for Phosphorus (P), Potassium (K), Nitrogen (N), and Magnesium (Mg).")
        sub_lbl.setFont(QFont("Segoe UI", 9))
        sub_lbl.setStyleSheet("color: #555555;")
        sub_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(sub_lbl)

        # Zoom Controls Toolbar
        toolbar_layout = QHBoxLayout()
        toolbar_layout.setSpacing(8)

        help_lbl = QLabel("💡 Click & Drag mouse to pan | Scroll wheel to zoom in/out")
        help_lbl.setFont(QFont("Segoe UI", 8, QFont.Weight.Bold))
        help_lbl.setStyleSheet("color: #444444;")
        toolbar_layout.addWidget(help_lbl)

        toolbar_layout.addStretch()

        self.zoom_lbl = QLabel("Zoom: 100%")
        self.zoom_lbl.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        self.zoom_lbl.setStyleSheet("color: #000000; padding: 0 8px;")

        btn_zoom_in = QPushButton("Zoom In (+)")
        btn_zoom_out = QPushButton("Zoom Out (-)")
        btn_fit = QPushButton("Fit Window")
        btn_reset = QPushButton("Reset (100%)")

        for btn in (btn_zoom_in, btn_zoom_out, btn_fit, btn_reset):
            btn.setFixedHeight(28)
            btn.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
            btn.setCursor(Qt.CursorShape.PointingHandCursor)

        toolbar_layout.addWidget(self.zoom_lbl)
        toolbar_layout.addWidget(btn_zoom_in)
        toolbar_layout.addWidget(btn_zoom_out)
        toolbar_layout.addWidget(btn_fit)
        toolbar_layout.addWidget(btn_reset)

        main_layout.addLayout(toolbar_layout)

        # Interactive Zoomable View
        self.view = ZoomableGraphicsView()
        self.view.zoomChanged.connect(self.update_zoom_label)
        main_layout.addWidget(self.view, stretch=1)

        # Connect Zoom Actions
        btn_zoom_in.clicked.connect(self.view.zoom_in)
        btn_zoom_out.clicked.connect(self.view.zoom_out)
        btn_fit.clicked.connect(self.view.fit_to_view)
        btn_reset.clicked.connect(self.view.reset_zoom)

        # Locate image file
        img_paths = [
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "full_map_nutrient_detection.png"),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "full_map_nutrient_detection.png"),
            "/Users/drsitiaisyahjaafar/SmartPalm-demo/demo5-qt-python/data/full_map_nutrient_detection.png",
            "/Users/drsitiaisyahjaafar/SmartPalm-demo/demo5-qt-python/full_map_nutrient_detection.png"
        ]

        found_path = None
        for p in img_paths:
            if os.path.exists(p):
                found_path = p
                break

        if found_path:
            pixmap = QPixmap(found_path)
            if not pixmap.isNull():
                self.view.set_pixmap(pixmap)

        # Bottom Actions Layout
        bottom_layout = QHBoxLayout()
        bottom_layout.addStretch()

        close_btn = QPushButton("Close")
        close_btn.setFixedHeight(32)
        close_btn.setFixedWidth(100)
        close_btn.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.clicked.connect(self.accept)

        bottom_layout.addWidget(close_btn)
        main_layout.addLayout(bottom_layout)

    def showEvent(self, event):
        super().showEvent(event)
        # Automatically fit full map image to view window when opened
        QTimer.singleShot(50, self.view.fit_to_view)

    def update_zoom_label(self, zoom_val):
        pct = int(round(zoom_val * 100))
        self.zoom_lbl.setText(f"Zoom: {pct}%")


class ReportViewerDialog(QDialog):
    def __init__(self, pdf_path, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Palmnex PDF Report Viewer")
        self.resize(920, 880)
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.WindowMaximizeButtonHint | Qt.WindowType.WindowMinimizeButtonHint)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        
        # Top toolbar matching multipage example design
        toolbar_widget = QWidget()
        toolbar_widget.setStyleSheet("background-color: #f8fafc; border-bottom: 1px solid #cbd5e1;")
        toolbar = QHBoxLayout(toolbar_widget)
        toolbar.setContentsMargins(10, 5, 10, 5)
        toolbar.setSpacing(6)
        
        btn_zoom_in = QPushButton("Zoom In (+)")
        btn_zoom_in.clicked.connect(lambda: self.adjust_zoom(1.15))
        btn_zoom_out = QPushButton("Zoom Out (-)")
        btn_zoom_out.clicked.connect(lambda: self.adjust_zoom(0.85))
        
        btn_fit_width = QPushButton("Fit to Width")
        btn_fit_width.clicked.connect(self.zoom_fit_width)
        
        btn_fit_view = QPushButton("Fit in View")
        btn_fit_view.clicked.connect(self.zoom_fit_view)
        
        for btn in (btn_zoom_in, btn_zoom_out, btn_fit_width, btn_fit_view):
            btn.setFixedHeight(28)
            btn.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            
        toolbar.addWidget(btn_zoom_in)
        toolbar.addWidget(btn_zoom_out)
        toolbar.addWidget(btn_fit_width)
        toolbar.addWidget(btn_fit_view)
        toolbar.addStretch()
        
        layout.addWidget(toolbar_widget)
        
        # QtPdf multi-page viewer integration
        from PySide6.QtPdf import QPdfDocument
        from PySide6.QtPdfWidgets import QPdfView
        
        self.pdf_document = QPdfDocument(self)
        self.pdf_view = QPdfView(self)
        self.pdf_view.setDocument(self.pdf_document)
        self.pdf_view.setPageMode(QPdfView.PageMode.MultiPage)
        self.pdf_view.setZoomMode(QPdfView.ZoomMode.FitToWidth)
        
        self.pdf_document.load(pdf_path)
        layout.addWidget(self.pdf_view)
        
        # Bottom bar
        bottom_bar_widget = QWidget()
        bottom_bar_widget.setStyleSheet("background-color: #f0f0f0; border-top: 1px solid #cbd5e1;")
        bottom_bar = QHBoxLayout(bottom_bar_widget)
        bottom_bar.setContentsMargins(15, 10, 15, 10)
        
        self.pdf_path = pdf_path
        
        btn_save = QPushButton("📄 Save PDF File")
        btn_save.setFixedHeight(30)
        btn_save.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        btn_save.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_save.setStyleSheet("""
            QPushButton { background-color: #12b886; color: #ffffff; border: none; border-radius: 4px; padding: 4px 16px; }
            QPushButton:hover { background-color: #0ca678; }
        """)
        btn_save.clicked.connect(self.trigger_save)
        
        btn_close = QPushButton("Close")
        btn_close.setFixedHeight(30)
        btn_close.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        btn_close.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_close.setStyleSheet("""
            QPushButton { background-color: #e2e8f0; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 16px; }
            QPushButton:hover { background-color: #cbd5e1; }
        """)
        btn_close.clicked.connect(self.accept)
        
        bottom_bar.addStretch()
        bottom_bar.addWidget(btn_save)
        bottom_bar.addWidget(btn_close)
        
        layout.addWidget(bottom_bar_widget)
        
    def adjust_zoom(self, factor):
        from PySide6.QtPdfWidgets import QPdfView
        self.pdf_view.setZoomMode(QPdfView.ZoomMode.Custom)
        self.pdf_view.setZoomFactor(self.pdf_view.zoomFactor() * factor)
        
    def zoom_fit_width(self):
        from PySide6.QtPdfWidgets import QPdfView
        self.pdf_view.setZoomMode(QPdfView.ZoomMode.FitToWidth)
        
    def zoom_fit_view(self):
        from PySide6.QtPdfWidgets import QPdfView
        self.pdf_view.setZoomMode(QPdfView.ZoomMode.FitInView)
        
    def trigger_save(self):
        from PySide6.QtWidgets import QFileDialog
        import shutil
        path, _ = QFileDialog.getSaveFileName(self, "Save PDF Report", "palmnex_report.pdf", "PDF Files (*.pdf)")
        if path:
            shutil.copyfile(self.pdf_path, path)



