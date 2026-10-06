# Implementation Plan - GeoTIFF (.tif) Rasters & PDF Report Storage on "Run Prediction" & "Generate Report"

Automatically create a dedicated folder in `development/predictions/<EstateName>_<YYYY-MM-DD_HH-MM-SS>/` every time a user clicks **Run Prediction**, storing georeferenced 10m GeoTIFF (`.tif`) rasters for all nutrient layers (`N`, `P`, `K`, `Mg`, `Ca`, `B`). In addition, whenever **Generate Report** is clicked, automatically save the generated PDF report (`.pdf`) inside the corresponding active prediction folder.

## User Review Required

> [!IMPORTANT]
> - **Folder Naming & Location**:
>   - Path: `/Users/drsitiaisyahjaafar/SmartPalm-demo/development/predictions/<Estate_Name>_<YYYY-MM-DD_HH-MM-SS>/`
>   - Example: `development/predictions/Ladang_PPPTAR_2026-10-06_163000/` or `development/predictions/Seraya_Block_2026-10-06_163000/`
> - **Generated GeoTIFF & PDF Files per Folder**:
>   - `N_nutrient_10m.tif` (GeoTIFF storing pixel Nitrogen % values + EPSG:4326 coordinates)
>   - `P_nutrient_10m.tif` (GeoTIFF storing pixel Phosphorus % values + coordinates)
>   - `K_nutrient_10m.tif` (GeoTIFF storing pixel Potassium % values + coordinates)
>   - `Mg_nutrient_10m.tif` (GeoTIFF storing pixel Magnesium % values + coordinates)
>   - `Ca_nutrient_10m.tif` (GeoTIFF storing pixel Calcium % values + coordinates)
>   - `B_nutrient_10m.tif` (GeoTIFF storing pixel Boron ppm values + coordinates)
>   - `prediction_metadata.json` (Summary metadata with timestamp, coordinate bounds, CRS, and pixel statistics)
>   - **`estate_report_<EstateName>.pdf`** (Generated PDF report saved directly into the active prediction folder when **Generate Report** is clicked)
> - **Local Prediction & PDF Server (`prediction_server.py`)**:
>   - Endpoint `http://127.0.0.1:5001/api/predict`: Handles GeoTIFF generation.
>   - Endpoint `http://127.0.0.1:5001/api/save_pdf`: Receives generated PDF report bytes and saves `.pdf` inside the active prediction folder.

---

## Proposed Changes

### 1. Prediction Backend Server

#### [NEW] [prediction_server.py](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/prediction_server.py)
- Built with Python `http.server` / `Flask` and `rasterio`.
- `POST /api/predict`: Computes 10m spatial grid and writes 6 GeoTIFF `.tif` rasters + `prediction_metadata.json` into `development/predictions/<EstateName>_<Timestamp>/`.
- `POST /api/save_pdf`: Receives PDF base64 / blob data from the frontend when **Generate Report** is clicked and saves `estate_report_<EstateName>.pdf` into the matching active prediction folder.

---

### 2. Dashboard Interface & Prediction Flow

#### [MODIFY] [comprehensive.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/comprehensive.html)
#### [MODIFY] [standard.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/standard.html)
#### [MODIFY] [kpsm.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/kpsm.html)

- **`runRfrPredictionFlow()` Update**:
  - Triggers `POST /api/predict` to generate GeoTIFF rasters and creates the active folder timestamp.
  - Updates inline note: *"✓ GeoTIFF rasters saved to development/predictions/<Folder_Name>/"*.
- **Report Generation Hook (`downloadPdfReport`)**:
  - In addition to standard browser PDF download (`html2pdf().save()`), extracts PDF base64 data and sends POST request to `/api/save_pdf`.
  - Saves `.pdf` file inside `development/predictions/<EstateName>_<Timestamp>/estate_report_<EstateName>.pdf`.

---

### 3. Compilation & Deployment

#### [MODIFY] [compiled.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/compiled.html)
- Recompile dashboard shell via `python3 development/compile_all.py`.

---

## Verification Plan

### Automated & Manual Verification
1. Launch prediction server: `python3 development/prediction_server.py`.
2. Open `compiled.html` in browser.
3. Select an estate map (e.g. "Ladang PPPTAR" or "Seraya with block boundary").
4. Click **Run Prediction** -> verify folder `development/predictions/Ladang_PPPTAR_<Timestamp>/` is created with 6 `.tif` files and `prediction_metadata.json`.
5. Click **Generate Report** -> verify `estate_report_Ladang_PPPTAR.pdf` is saved inside the exact same prediction folder.
