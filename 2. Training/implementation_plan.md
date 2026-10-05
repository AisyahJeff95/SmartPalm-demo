# Implementation Plan - "Run Prediction" Button in Satellite AI & Map Layer Overlay

Add a **"⚡ Run Prediction"** button positioned directly at the top of the **"Nutrient Layer Selection"** box on the map view in **Comprehensive Fert** (`comprehensive.html`), **Standard Fert** (`standard.html`), and **KPSM** (`kpsm.html`) dashboards, removing the separate "Show LSU" option.

## User Review Required

> [!IMPORTANT]
> - **Simplified Interface & Layout**: Removed "Show LSU". The prediction workflow is launched directly from the **⚡ Run Prediction** button located at the top of the **Nutrient Layer Selection** floating box on the map.
> - **Execution Flow**:
>   1. User selects an estate map from the list (`map-select-comp` / `map-select-std`).
>   2. User selects Real-Time Satellite Acquisition or a specific Satellite Date.
>   3. User clicks **⚡ Run Prediction** (positioned at the top of the floating **Nutrient Layer Selection** box).
> - **Model Execution**: Runs the trained Random Forest models (`rf_model_N.pkl`, `P.pkl`, `K.pkl`, `Mg.pkl`, `Ca.pkl`, `B.pkl`), renders the 10m pixel nutrient heatmap overlay, and populates all nutrient values (`N%`, `P%`, `K%`, `Mg%`, `Ca%`, `B ppm`).

---

## Proposed Changes

### Dashboard User Interface & Layout

#### [MODIFY] [comprehensive.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/comprehensive.html)
#### [MODIFY] [standard.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/standard.html)
#### [MODIFY] [kpsm.html](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/kpsm.html)

1. **Remove "Show LSU" Checkbox**:
   - Remove the `Show LSU` checkbox and sub-option container from the sidebar panel.

2. **Add "⚡ Run Prediction" Button Top of "Nutrient Layer Selection" Box**:
   - Place the **⚡ Run Prediction** button (`#btn-run-prediction`) inside `.leaflet-nutrient-selector` right above the `Nutrient Layer Selection` title header.
   - Styled with a modern gradient button (`linear-gradient(135deg, #10b981, #059669)` or `#0284c7`), full width, rounded corners, and glowing hover/active effects.
   - Include inline execution status feedback (`#prediction-status-msg`) directly below the button.

3. **JavaScript Prediction Handler (`runRfrPredictionFlow`)**:
   - Add `runRfrPredictionFlow()` function in [`development/js/reada.js`](file:///Users/drsitiaisyahjaafar/SmartPalm-demo/development/js/reada.js).
   - Validates that an estate boundary is selected.
   - Displays real-time status banner (*"Scanning Estate using Sentinel & AI Models...."*).
   - Activates model predictions for the selected boundary grid using trained models (`rf_model_N.pkl`, `P.pkl`, `K.pkl`, `Mg.pkl`, `Ca.pkl`, `B.pkl`).
   - Automatically selects the primary nutrient overlay layer (e.g., `N% Detection`) and populates nutrient readout values.

---

## Verification Plan

### Manual Verification
- Open the compiled dashboard in browser (`compiled.html`).
- Select "Ladang PPPTAR" from the map selection dropdown.
- Check "Real-Time Satellite Acquisition" or select a date.
- Click **⚡ Run Prediction** at the top of the floating **Nutrient Layer Selection** box.
- Verify that status message appears (*"Scanning Estate using Sentinel & AI Models...."*), the 10m nutrient heatmap renders on the map, and nutrient values (`N%`, `P%`, `K%`, `Mg%`, `Ca%`, `B ppm`) populate cleanly.
