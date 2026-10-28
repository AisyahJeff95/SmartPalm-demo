import os, sys, copy, re, time
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule
import shapefile, pyproj, pandas as pd, numpy as np
from shapely.geometry import Point, Polygon
from shapely.prepared import prep

template_path = 'DATAVALIDATION_BENTA/datavalidation/benta_datavalidation_format.xlsx'

estate_order = ['agathis', 'belian', 'binuang', 'gaharu', 'kapur', 'keruing', 'menggaris', 'merbau', 'ramin', 'selanganbatu', 'seraya']

shp_map = {
    'agathis': 'BENTASPATIAL/northern/agathis/Block Boundary.shp',
    'belian': 'BENTASPATIAL/northern/belian/Block Boundary.shp',
    'binuang': 'BENTASPATIAL/northern/binuang/Block Boundary.shp',
    'gaharu': 'BENTASPATIAL/southern/gaharu/Block Boundary.shp',
    'kapur': 'BENTASPATIAL/northern/kapur/Block Boundary.shp',
    'keruing': 'BENTASPATIAL/southern/keruing/Block Boundary.shp',
    'menggaris': 'BENTASPATIAL/southern/menggaris/Block Boundary.shp',
    'merbau': 'BENTASPATIAL/southern/merbau/Block Boundary.shp',
    'ramin': 'BENTASPATIAL/northern/ramin/Blok Boundary.shp',
    'selanganbatu': 'BENTASPATIAL/northern/selanganbatu/Block Boundary.shp',
    'seraya': 'BENTASPATIAL/southern/seraya/Block Boundary.shp',
}

lsu_map = {
    'agathis': '1.BentaWawasan (AGATHIS) - Data Training.xlsx',
    'belian': '6.BentaWawasan (BELIAN) - Data Training.xlsx',
    'binuang': '5.BentaWawasan (BINUANG) - Data Training .xlsx',
    'gaharu': '4.BentaWawasan (GAHARU) - Data Training.xlsx',
    'kapur': '3.BentaWawasan (KAPUR) - Data Training.xlsx',
    'keruing': '2.BentaWawasan (KERUING) - Data Training.xlsx',
    'menggaris': '8.BentaWawasan (MENGGARIS) - Data Training.xlsx',
    'merbau': '9.BentaWawasan (MERBAU) - Data Training.xlsx',
    'ramin': '10.BentaWawasan (RAMIN) - Data Training.xlsx',
    'selanganbatu': '11.BentaWawasan (SELANGAN BATU) - Data Training.xlsx',
    'seraya': '7.BentaWawasan (SERAYA) - Data Training.xlsx',
}

def get_block_name(d):
    for key in ['No_Block', 'Block_No', 'Block', 'NO_BLOK', 'No_Block2', 'Block2']:
        if key in d and d[key] is not None and str(d[key]).strip() not in ['', '0']:
            return str(d[key]).strip()
    return str(d.get('Id', ''))

def clean_float(v, default=None):
    if v is None:
        return default
    try:
        return float(v)
    except Exception:
        if '€' in str(v):
            return 16.0
        clean = re.sub(r'[^0-9.]', '', str(v))
        if clean:
            return float(clean)
        return default

# Fills and styling constants
green_data_fill = PatternFill(fill_type='solid', start_color='E2EFDA', end_color='E2EFDA')
green_avg_fill = PatternFill(fill_type='solid', start_color='C6EFCE', end_color='C6EFCE')
yellow_fill = PatternFill(fill_type='solid', start_color='FFFFF2CC', end_color='FFFFF2CC')
yellow_font = Font(name='Aptos Narrow', size=12.0, color='FF7F6000')
yellow_avg_fill = PatternFill(fill_type='solid', start_color='FFFFFF00', end_color='FFFFFF00')

thin_side = Side(border_style='thin', color='D9D9D9')
thin_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
center_align = Alignment(horizontal='center', vertical='center')

nut_map = [
    ('N', 4, 5, 6, '0.00', '0.000'),
    ('P', 7, 8, 9, '0.000', '0.000'),
    ('K', 10, 11, 12, '0.00', '0.000'),
    ('Mg', 13, 14, 15, '0.00', '0.000'),
    ('Ca', 16, 17, 18, '0.00', '0.000'),
    ('B', 19, 20, 21, '0.0', '0.00'),
]

def process_year(year):
    print(f"\n{'='*70}\nSTARTING VALIDATION PROCESSING FOR YEAR {year}\n{'='*70}")
    out_dir = f'DATAVALIDATION_BENTA/datavalidation/{year}'
    os.makedirs(out_dir, exist_ok=True)
    
    # Locate prediction directories
    pred_dirs = [d for d in os.listdir(f'training_v3/{year}') if d.startswith('predictions_')]
    pred_lookup = {}
    for pd_dir in pred_dirs:
        parts = pd_dir.split('_')
        est_name = parts[1]
        pred_lookup[est_name] = pd_dir

    estate_summaries = {}

    for estate in estate_order:
        t_start = time.time()
        print(f"Processing {estate.upper()} ({year})...")
        shp_f = shp_map[estate]
        lsu_f = lsu_map[estate]
        p_dir = pred_lookup[estate]

        # 1. Load Shapefile and Reproject
        sf = shapefile.Reader(shp_f)
        transformer = pyproj.Transformer.from_crs('EPSG:29873', 'EPSG:4326', always_xy=True)

        pred_folder = os.path.join(f'training_v3/{year}', p_dir)
        grid_path = os.path.join(pred_folder, 'predicted_10m_nutrients.csv.gz')
        df_grid = pd.read_csv(grid_path, usecols=['Longitude', 'Latitude'])
        df_csv = pd.read_csv(os.path.join(pred_folder, 'predicted_nutrients_by_block.csv'))

        lngs = df_grid['Longitude'].values
        lats = df_grid['Latitude'].values

        block_pixel_data = {}
        dbf_blocks = []
        dbf_lookup = {}

        for idx in range(len(sf.shapes())):
            rec = sf.record(idx).as_dict()
            b_name = get_block_name(rec)
            dbf_blocks.append(b_name)

            s = sf.shape(idx)
            wgs_pts = [transformer.transform(x, y) for x, y in s.points]
            poly = Polygon(wgs_pts).buffer(0)
            minx, miny, maxx, maxy = poly.bounds
            bbox_mask = (lngs >= minx) & (lngs <= maxx) & (lats >= miny) & (lats <= maxy)
            poly_prep = prep(poly)
            in_poly = [poly_prep.contains(Point(x, y)) for x, y in zip(lngs[bbox_mask], lats[bbox_mask])]
            sub_df = df_grid[bbox_mask][in_poly]

            block_info = {
                'idx': idx + 1,
                'b_name': b_name,
                'pixels': len(sub_df),
                'N': round(df_csv.loc[idx, 'N_mean'], 3) if 'N_mean' in df_csv else None,
                'P': round(df_csv.loc[idx, 'P_mean'], 3) if 'P_mean' in df_csv else None,
                'K': round(df_csv.loc[idx, 'K_mean'], 3) if 'K_mean' in df_csv else None,
                'Mg': round(df_csv.loc[idx, 'Mg_mean'], 3) if 'Mg_mean' in df_csv else None,
                'Ca': round(df_csv.loc[idx, 'Ca_mean'], 3) if 'Ca_mean' in df_csv else None,
                'B': round(df_csv.loc[idx, 'B_mean'], 2) if 'B_mean' in df_csv else None,
            }
            block_pixel_data[b_name] = block_info

            b_clean = b_name.strip()
            dbf_lookup[b_clean.lower()] = b_name
            parts = b_clean.split('/')
            if len(parts) == 2:
                p0, p1 = parts
                dbf_lookup[f'{p0}/{p1}'.lower()] = b_name
                if p1.isdigit():
                    dbf_lookup[f'{p0}/{int(p1)}'.lower()] = b_name
                    if p0.isdigit():
                        dbf_lookup[f'{int(p0)}/{int(p1)}'.lower()] = b_name
                else:
                    m_sub = re.match(r'0*(\d+)([a-zA-Z]+)', p1)
                    if m_sub:
                        dbf_lookup[f'{p0}/{m_sub.group(1)}{m_sub.group(2)}'.lower()] = b_name
                        if p0.isdigit():
                            dbf_lookup[f'{int(p0)}/{m_sub.group(1)}{m_sub.group(2)}'.lower()] = b_name

        # 2. Read LSU
        lsu_path = os.path.join('DATAVALIDATION_BENTA/bentaLSU2021-2024', lsu_f)
        wb_lsu = openpyxl.load_workbook(lsu_path, data_only=True)
        sheet_name = str(year) if str(year) in wb_lsu.sheetnames else wb_lsu.sheetnames[0]
        ws_lsu = wb_lsu[sheet_name]

        header_map = {}
        for c in range(1, ws_lsu.max_column + 1):
            h = str(ws_lsu.cell(1, c).value or '').strip().upper()
            if h:
                header_map[h] = c

        sref_col = header_map.get('SAMPLE REF. NO.') or header_map.get('SAMPLE REF NO') or header_map.get('SAMPLE REF. NO') or 3
        ledger_col = header_map.get('LEDGER NO.') or header_map.get('LEDGER NO') or 2
        plot_col = header_map.get('PLOT') or 7

        col_N = header_map.get('N')
        col_P = header_map.get('P')
        col_K = header_map.get('K')
        col_Mg = header_map.get('MG')
        col_Ca = header_map.get('CA')
        col_B = header_map.get('B')

        data_rows = []
        for r in range(2, ws_lsu.max_row + 1):
            sref = str(ws_lsu.cell(r, sref_col).value or '').strip().strip("‘'")
            ledger = str(ws_lsu.cell(r, ledger_col).value or '').strip().strip("‘'")
            plot_val = str(ws_lsu.cell(r, plot_col).value or '').strip().strip("‘'") if plot_col else ''

            raw_N = ws_lsu.cell(r, col_N).value if col_N else None
            raw_P = ws_lsu.cell(r, col_P).value if col_P else None
            raw_K = ws_lsu.cell(r, col_K).value if col_K else None
            raw_Mg = ws_lsu.cell(r, col_Mg).value if col_Mg else None
            raw_Ca = ws_lsu.cell(r, col_Ca).value if col_Ca else None
            raw_B = ws_lsu.cell(r, col_B).value if col_B else None

            val_N = clean_float(raw_N)
            val_P = clean_float(raw_P)
            val_K = clean_float(raw_K)
            val_Mg = clean_float(raw_Mg)
            val_Ca = clean_float(raw_Ca)
            val_B = clean_float(raw_B)

            target_str = sref if (sref and sref != '-') else (ledger if (ledger and ledger != '-') else plot_val)
            if not target_str or target_str == '-' or val_N is None:
                continue

            override = None
            if estate == 'belian':
                if '12-2S' in target_str or ledger == '6454': override = '12/25'
                elif '1345' in target_str or ledger == '6466': override = '13/05'
                elif target_str == '121-19': override = '12/19'
            elif estate == 'keruing':
                m_k = re.search(r'KER-08-(3[5-9])', target_str)
                if m_k: override = f'09/{m_k.group(1)}'
            elif estate == 'merbau':
                if '07-9' in target_str or '0709' in target_str: override = '07/09A'
            elif estate == 'selanganbatu':
                if 'SBU&8-06' in target_str or ledger == '6553': override = '08/6'
                elif '11-15B' in target_str: override = '11/15'
                elif '11-14B' in target_str: override = '11/14A'
            elif estate == 'seraya':
                if '06&S' in target_str: override = '06/5'
                elif 'KPDM' in target_str: override = 'SRY-KPDM'
            elif estate == 'menggaris':
                m_mg = re.match(r'0*(\d+)([A-Za-z]+)', target_str)
                if m_mg: override = f'{m_mg.group(1)}/{m_mg.group(2)}'

            cand_list = []
            if override:
                cand_list.append(override.lower())
            cand_list.append(target_str.replace('-', '/').replace('_', '/').lower())

            m_4d = re.search(r'[A-Za-z]+[-_&/](\d{2})(\d{2})', target_str)
            if m_4d:
                p0, p1 = m_4d.group(1), m_4d.group(2)
                cand_list.extend([
                    f'{p0}/{p1}'.lower(), f'{p0}/{int(p1)}'.lower(),
                    f'{p0}/{p1}a'.lower(), f'{p0}/{int(p1)}a'.lower(),
                ])

            m = re.search(r'([0-9A-Za-z]+)[-_&/]([0-9A-Za-z]+)', target_str)
            if m:
                p0, p1 = m.group(1), m.group(2)
                if not p0.isdigit():
                    m2 = re.search(r'[A-Za-z]+[-_&/](\d+)[-_&/]([0-9A-Za-z]+)', target_str)
                    if m2: p0, p1 = m2.group(1), m2.group(2)
                cand_list.extend([f'{p0}/{p1}'.lower(), f'{p0}/{p1}a'.lower(), f'{p0}/{p1}b'.lower()])
                if p0.isdigit():
                    cand_list.extend([
                        f'{int(p0):02d}/{p1}'.lower(), f'{int(p0)}/{p1}'.lower(),
                        f'{int(p0):02d}/{p1}a'.lower(), f'{int(p0):02d}/{p1}b'.lower()
                    ])
                    if p1.isdigit():
                        cand_list.extend([
                            f'{p0}/{int(p1)}'.lower(), f'{int(p0):02d}/{int(p1)}'.lower(), f'{int(p0)}/{int(p1)}'.lower(),
                            f'{p0}/{int(p1):02d}'.lower(), f'{int(p0):02d}/{int(p1):02d}'.lower(),
                            f'{p0}/{int(p1):02d}a'.lower(), f'{int(p0):02d}/{int(p1):02d}a'.lower(),
                            f'{p0}/{int(p1):02d}b'.lower(), f'{int(p0):02d}/{int(p1):02d}b'.lower()
                        ])

            matched_block_name = None
            for c in cand_list:
                if c in dbf_lookup:
                    matched_block_name = dbf_lookup[c]
                    break

            if not matched_block_name:
                continue

            pred = block_pixel_data[matched_block_name]
            data_rows.append({
                'plot': matched_block_name,
                'sref': target_str,
                'ledger': ledger,
                'pixels': pred['pixels'],
                'N_act': val_N, 'N_pred': pred['N'],
                'P_act': val_P, 'P_pred': pred['P'],
                'K_act': val_K, 'K_pred': pred['K'],
                'Mg_act': val_Mg, 'Mg_pred': pred['Mg'],
                'Ca_act': val_Ca, 'Ca_pred': pred['Ca'],
                'B_act': val_B, 'B_pred': pred['B'],
            })

        print(f"  ✓ Matched {len(data_rows)} samples.")

        # 3. Build workbook from template
        wb = openpyxl.load_workbook(template_path)
        ws = wb.active

        # Unmerge rows 17-19
        to_unmerge = []
        for m_range in list(ws.merged_cells.ranges):
            if any(m_range.min_row <= r <= m_range.max_row for r in [17, 18, 19]):
                to_unmerge.append(str(m_range))
        for m_str in to_unmerge:
            ws.unmerge_cells(m_str)

        template_row7_styles = {}
        for col in range(1, 22):
            c = ws.cell(7, col)
            template_row7_styles[col] = {
                'font': copy.copy(c.font),
                'fill': copy.copy(c.fill),
                'border': copy.copy(c.border),
                'alignment': copy.copy(c.alignment),
                'number_format': c.number_format
            }

        summary_styles = {}
        for r_orig in [17, 18, 19]:
            summary_styles[r_orig] = {}
            for col in range(1, 22):
                c = ws.cell(r_orig, col)
                summary_styles[r_orig][col] = {
                    'value': c.value,
                    'font': copy.copy(c.font),
                    'fill': copy.copy(c.fill),
                    'border': copy.copy(c.border),
                    'alignment': copy.copy(c.alignment),
                    'number_format': c.number_format
                }

        start_row = 7
        num_rows = len(data_rows)

        if num_rows == 0:
            # Handle empty estate
            cB = ws.cell(7, 2, 'No matching LSU samples within boundary')
            cB.font = copy.copy(template_row7_styles[2]['font'])
            cB.alignment = center_align
            ws.row_dimensions[7].height = 25.0
            estate_summaries[estate] = {'samples': 0, 'N': None, 'P': None, 'K': None, 'Mg': None, 'Ca': None, 'B': None}
            out_file = os.path.join(out_dir, f'{estate}_datavalidation_{year}.xlsx')
            wb.save(out_file)
            print(f"  ✓ Saved empty workbook: {out_file} ({time.time()-t_start:.1f}s)")
            continue

        end_row = start_row + num_rows - 1

        # Check which nutrients have actual data
        has_nut = {}
        for nut, _, _, _, _, _ in nut_map:
            has_nut[nut] = any(r[f'{nut}_act'] is not None for r in data_rows)

        for i, row_data in enumerate(data_rows):
            curr_r = start_row + i
            cB = ws.cell(curr_r, 2, row_data['plot'])
            cB.font = copy.copy(template_row7_styles[2]['font'])
            cB.alignment = center_align
            cB.border = thin_border

            cC = ws.cell(curr_r, 3, row_data['pixels'])
            cC.font = copy.copy(template_row7_styles[3]['font'])
            cC.alignment = center_align
            cC.border = thin_border
            cC.number_format = '#,##0'

            for nut, act_c, pred_c, acc_c, fmt_act, fmt_pred in nut_map:
                c_act = ws.cell(curr_r, act_c)
                c_pred = ws.cell(curr_r, pred_c)
                c_acc = ws.cell(curr_r, acc_c)

                c_act.font = copy.copy(template_row7_styles[act_c]['font'])
                c_act.fill = copy.copy(template_row7_styles[act_c]['fill'])
                c_act.border = thin_border
                c_act.alignment = center_align
                c_act.number_format = fmt_act

                c_pred.font = copy.copy(template_row7_styles[pred_c]['font'])
                c_pred.fill = copy.copy(template_row7_styles[pred_c]['fill'])
                c_pred.border = thin_border
                c_pred.alignment = center_align
                c_pred.number_format = fmt_pred

                c_acc.font = copy.copy(template_row7_styles[acc_c]['font'])
                c_acc.border = thin_border
                c_acc.alignment = center_align
                c_acc.number_format = '0.00'

                if row_data[f'{nut}_act'] is not None:
                    c_act.value = row_data[f'{nut}_act']
                    c_pred.value = row_data[f'{nut}_pred']
                    act_let = get_column_letter(act_c)
                    pred_let = get_column_letter(pred_c)
                    c_acc.value = f'=(1-ABS({act_let}{curr_r}-{pred_let}{curr_r})/{act_let}{curr_r})*100'
                    c_acc.fill = copy.copy(green_data_fill)
                else:
                    c_act.value = None
                    c_pred.value = row_data[f'{nut}_pred']
                    c_acc.value = None
                    c_acc.fill = PatternFill(fill_type=None)

        # Conditional formatting on data rows
        cf_rule = CellIsRule(operator='lessThanOrEqual', formula=['80'], fill=yellow_fill, font=yellow_font)
        active_acc_ranges = []
        for nut, _, _, acc_c, _, _ in nut_map:
            if has_nut[nut]:
                acc_let = get_column_letter(acc_c)
                active_acc_ranges.append(f'{acc_let}{start_row}:{acc_let}{end_row}')
        if active_acc_ranges:
            ws.conditional_formatting.add(' '.join(active_acc_ranges), cf_rule)

        # 4. Summary rows
        avg_row = end_row + 1
        r2_row = end_row + 2
        mae_row = end_row + 3
        rmse_row = end_row + 4

        ws.row_dimensions[avg_row].height = 35.0
        ws.row_dimensions[r2_row].height = 40.0
        ws.row_dimensions[mae_row].height = 39.0
        ws.row_dimensions[rmse_row].height = 66.0

        # Row avg_row: AVG ACCURACY
        cA_avg = ws.cell(avg_row, 1, 'AVG ACCURACY')
        cA_avg.font = Font(name='Aptos Narrow', size=12.0, bold=False)
        cA_avg.alignment = center_align

        nut_stats = {'samples': num_rows}
        for nut, act_c, pred_c, acc_c, _, _ in nut_map:
            acc_let = get_column_letter(acc_c)
            c_avg = ws.cell(avg_row, acc_c)
            c_avg.font = Font(name='Aptos Narrow', size=12.0, bold=False)
            c_avg.alignment = center_align
            c_avg.border = thin_border
            c_avg.number_format = '0.00'

            if has_nut[nut]:
                avg_formula = f'=AVERAGE({acc_let}{start_row}:{acc_let}{end_row})'
                c_avg.value = avg_formula
                acc_vals = [(1 - abs(r[f'{nut}_act'] - r[f'{nut}_pred']) / r[f'{nut}_act']) * 100 for r in data_rows if r[f'{nut}_act'] is not None]
                mean_acc = round(float(np.mean(acc_vals)), 2)
                nut_stats[nut] = mean_acc
                if mean_acc <= 80:
                    c_avg.fill = copy.copy(yellow_avg_fill)
                else:
                    c_avg.fill = copy.copy(green_avg_fill)
            else:
                c_avg.value = '-'
                c_avg.fill = PatternFill(fill_type=None)
                nut_stats[nut] = None

        estate_summaries[estate] = nut_stats

        # Row R2, MAE, RMSE
        cA_r2 = ws.cell(r2_row, 1, 'Best result closer to 0')
        cA_r2.font = copy.copy(summary_styles[17][1]['font'])
        cA_r2.fill = copy.copy(summary_styles[17][1]['fill'])
        cA_r2.alignment = center_align
        cA_r2.border = thin_border

        cB_r2 = ws.cell(r2_row, 2, 'R^2 (Coefficient of determination)')
        cB_r2.font = copy.copy(summary_styles[17][2]['font'])
        cB_r2.alignment = center_align
        cB_r2.border = thin_border

        cA_mae = ws.cell(mae_row, 1, 'Best result closer to 1')
        cA_mae.font = copy.copy(summary_styles[18][1]['font'])
        cA_mae.fill = copy.copy(summary_styles[18][1]['fill'])
        cA_mae.alignment = center_align
        cA_mae.border = thin_border

        cB_mae = ws.cell(mae_row, 2, 'MAE (Average size of prediction errors)')
        cB_mae.font = copy.copy(summary_styles[18][2]['font'])
        cB_mae.alignment = center_align
        cB_mae.border = thin_border

        cA_rmse = ws.cell(rmse_row, 1, 'Best result closer to 1')
        cA_rmse.font = copy.copy(summary_styles[19][1]['font'])
        cA_rmse.fill = copy.copy(summary_styles[19][1]['fill'])
        cA_rmse.alignment = center_align
        cA_rmse.border = thin_border

        cB_rmse = ws.cell(rmse_row, 2, 'RMSE (Prediction error, with larger mistakes penalised more)')
        cB_rmse.font = copy.copy(summary_styles[19][2]['font'])
        cB_rmse.alignment = center_align
        cB_rmse.border = thin_border

        for nut, act_c, pred_c, acc_c, _, _ in nut_map:
            act_let = get_column_letter(act_c)
            pred_let = get_column_letter(pred_c)

            c_r2 = ws.cell(r2_row, act_c)
            c_r2.font = copy.copy(template_row7_styles[act_c]['font'])
            c_r2.fill = copy.copy(summary_styles[17][act_c]['fill'])
            c_r2.border = thin_border
            c_r2.alignment = center_align
            c_r2.number_format = '0.0000'

            c_mae = ws.cell(mae_row, act_c)
            c_mae.font = copy.copy(template_row7_styles[act_c]['font'])
            c_mae.fill = copy.copy(summary_styles[18][act_c]['fill'])
            c_mae.border = thin_border
            c_mae.alignment = center_align
            c_mae.number_format = '0.0000'

            c_rmse = ws.cell(rmse_row, act_c)
            c_rmse.font = copy.copy(template_row7_styles[act_c]['font'])
            c_rmse.fill = copy.copy(summary_styles[19][act_c]['fill'])
            c_rmse.border = thin_border
            c_rmse.alignment = center_align
            c_rmse.number_format = '0.0000'

            if has_nut[nut]:
                c_r2.value = f'=RSQ({pred_let}{start_row}:{pred_let}{end_row}, {act_let}{start_row}:{act_let}{end_row})'
                c_mae.value = f'=SUMPRODUCT(ABS({act_let}{start_row}:{act_let}{end_row}-{pred_let}{start_row}:{pred_let}{end_row}))/COUNT({act_let}{start_row}:{act_let}{end_row})'
                c_rmse.value = f'=SQRT(SUMXMY2({act_let}{start_row}:{act_let}{end_row}, {pred_let}{start_row}:{pred_let}{end_row})/COUNT({act_let}{start_row}:{act_let}{end_row}))'
            else:
                c_r2.value = '-'
                c_mae.value = '-'
                c_rmse.value = '-'

        for r_target in [r2_row, mae_row, rmse_row]:
            ws.merge_cells(f'B{r_target}:C{r_target}')
            ws.merge_cells(f'D{r_target}:F{r_target}')
            ws.merge_cells(f'G{r_target}:I{r_target}')
            ws.merge_cells(f'J{r_target}:L{r_target}')
            ws.merge_cells(f'M{r_target}:O{r_target}')
            ws.merge_cells(f'P{r_target}:R{r_target}')
            ws.merge_cells(f'S{r_target}:U{r_target}')

        out_file = os.path.join(out_dir, f'{estate}_datavalidation_{year}.xlsx')
        wb.save(out_file)
        print(f"  ✓ Saved: {out_file} ({time.time()-t_start:.1f}s)")

    # 5. Master Summary Workbook
    summary_path = os.path.join(out_dir, f'summary_datavalidation_{year}.xlsx')
    build_summary_file(year, estate_summaries, summary_path)

def build_summary_file(year, estate_summaries, out_path):
    print(f"\nBuilding Master Summary for {year} -> {out_path}...")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f'Summary {year}'
    ws.views.sheetView[0].showGridLines = True

    # Styling
    title_font = Font(name='Aptos Narrow', size=16, bold=True, color='1F4E78')
    subtitle_font = Font(name='Aptos Narrow', size=11, italic=True, color='595959')
    header_font = Font(name='Aptos Narrow', size=12, bold=True, color='FFFFFF')
    header_fill = PatternFill(fill_type='solid', start_color='2F5597', end_color='2F5597')

    data_font = Font(name='Aptos Narrow', size=11)
    bold_font = Font(name='Aptos Narrow', size=11, bold=True)

    green_fill = PatternFill(fill_type='solid', start_color='E2EFDA', end_color='E2EFDA')
    green_avg_fill = PatternFill(fill_type='solid', start_color='C6EFCE', end_color='C6EFCE')
    yellow_fill = PatternFill(fill_type='solid', start_color='FFFFF2CC', end_color='FFFFF2CC')
    yellow_font = Font(name='Aptos Narrow', size=11, color='FF7F6000')
    yellow_avg_fill = PatternFill(fill_type='solid', start_color='FFFFFF00', end_color='FFFFFF00')

    thin_side = Side(border_style='thin', color='D9D9D9')
    thin_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    thick_bottom = Border(left=thin_side, right=thin_side, top=thin_side, bottom=Side(border_style='double', color='000000'))

    center_align = Alignment(horizontal='center', vertical='center')
    left_align = Alignment(horizontal='left', vertical='center')

    # Title
    ws['A1'] = f'BENTA ESTATE NUTRIENT VALIDATION SUMMARY - {year}'
    ws['A1'].font = title_font
    ws.row_dimensions[1].height = 25

    ws['A2'] = 'Comparison between Sentinel-2 Random Forest Predictions (training_v3) and Laboratory Actuals (LSU)'
    ws['A2'].font = subtitle_font
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 10

    # Headers
    headers = ['Estate', 'Samples', 'Mean N (%)', 'Mean P (%)', 'Mean K (%)', 'Mean Mg (%)', 'Mean Ca (%)', 'Mean B (%)']
    ws.row_dimensions[4].height = 28
    for c_idx, h_text in enumerate(headers, 1):
        cell = ws.cell(4, c_idx, h_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = thin_border

    start_r = 5
    for idx, estate in enumerate(estate_order):
        curr_r = start_r + idx
        ws.row_dimensions[curr_r].height = 22
        disp_name = estate.title() if estate != 'selanganbatu' else 'Selangan Batu'

        # Estate
        c_est = ws.cell(curr_r, 1, disp_name)
        c_est.font = bold_font
        c_est.alignment = left_align
        c_est.border = thin_border

        # Samples
        stats = estate_summaries.get(estate, {'samples': 0, 'N': None, 'P': None, 'K': None, 'Mg': None, 'Ca': None, 'B': None})
        c_samp = ws.cell(curr_r, 2, stats['samples'])
        c_samp.font = data_font
        c_samp.alignment = center_align
        c_samp.border = thin_border
        c_samp.number_format = '#,##0'

        for nut_idx, nut in enumerate(['N', 'P', 'K', 'Mg', 'Ca', 'B'], 3):
            val = stats.get(nut)
            cell = ws.cell(curr_r, nut_idx)
            cell.font = data_font
            cell.alignment = center_align
            cell.border = thin_border

            if val is not None:
                cell.value = val
                cell.number_format = '0.00'
                cell.fill = copy.copy(green_fill)
            else:
                cell.value = '-'

    # Mean row
    mean_r = start_r + len(estate_order)
    ws.row_dimensions[mean_r].height = 26

    c_lbl = ws.cell(mean_r, 1, 'Mean (%)')
    c_lbl.font = bold_font
    c_lbl.alignment = left_align
    c_lbl.border = thick_bottom

    c_tot_samp = ws.cell(mean_r, 2, f'=SUM(B{start_r}:B{mean_r-1})')
    c_tot_samp.font = bold_font
    c_tot_samp.alignment = center_align
    c_tot_samp.border = thick_bottom
    c_tot_samp.number_format = '#,##0'

    for nut_idx, nut in enumerate(['N', 'P', 'K', 'Mg', 'Ca', 'B'], 3):
        col_let = get_column_letter(nut_idx)
        formula = f'=AVERAGE({col_let}{start_r}:{col_let}{mean_r-1})'
        cell = ws.cell(mean_r, nut_idx, formula)
        cell.font = bold_font
        cell.alignment = center_align
        cell.border = thick_bottom
        cell.number_format = '0.00'

        valid_vals = [estate_summaries[e][nut] for e in estate_order if estate_summaries[e].get(nut) is not None]
        if valid_vals:
            mean_val = float(np.mean(valid_vals))
            if mean_val <= 80:
                cell.fill = copy.copy(yellow_avg_fill)
            else:
                cell.fill = copy.copy(green_avg_fill)
        else:
            cell.value = '-'
            cell.fill = PatternFill(fill_type=None)

    # Conditional formatting on accuracy cells (C5:H16)
    cf_rule = CellIsRule(operator='lessThanOrEqual', formula=['80'], fill=yellow_fill, font=yellow_font)
    ws.conditional_formatting.add(f'C{start_r}:H{mean_r}', cf_rule)

    # Column widths
    ws.column_dimensions['A'].width = 18
    ws.column_dimensions['B'].width = 12
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 15
    ws.column_dimensions['F'].width = 16
    ws.column_dimensions['G'].width = 16
    ws.column_dimensions['H'].width = 15

    wb.save(out_path)
    print(f"✓ Summary generated: {out_path}")

if __name__ == '__main__':
    years = [int(y) for y in sys.argv[1:]] if len(sys.argv) > 1 else [2022]
    for yr in years:
        process_year(yr)
