# PalmnexReaDS — Original ReaDA Raw Data (CSV Export)

This directory contains the complete raw agronomic data and database schemas exported from the original **PORIM / MPOB ReaDA** (*Relational Database for Agronomy Trial Data*) system.

---

## 📁 Manifest of CSV Datasets

| File Name | Original ReaDA Table | Description & Agronomic Scope |
| :--- | :--- | :--- |
| **`DATAINFO_trials.csv`** | `DATAINFO.DBF` | Master Agronomy Trial Registers (Trial Code, Estate, Planting Year, Stand Density, Factor Configurations, Recording Cycles). |
| **`DATATREAT_plot_treatments.csv`** | `DATATREAT.DBF` | Plot-level treatment allocations, factorial treatment levels ($N \times P \times K \times Mg \times Lime \times Density$), and sub-plot mappings. |
| **`DATAPALM_palm_census.csv`** | `DATAPALM.DBF` | Palm numbering layout, oil palm progenies (*DxP AVROS, DxP MARDI, DxP Yangambi, DxP Calabar*), and palm recording status. |
| **`DATARYLD_harvest_rounds.csv`** | `DATARYLD.DBF` | Individual harvesting round records (Bunch Number, Fresh Bunch Weight in kg, Loose Fruit weight in kg, Harvester ID). |
| **`DATAFFB_annual_yield.csv`** | `DATAFFB.DBF` | Annual plot Fresh Fruit Bunch (FFB) summaries (Mean Bunch Weight, Bunch Number per palm, Palm Yield kg/palm, FFB Yield t/ha, Total Bunches & Weight). |
| **`DATALEAF_tissue_nutrients.csv`** | `DATALEAF.DBF` | Frond 17 foliar tissue nutrient laboratory results: Nitrogen (N%), Phosphorus (P%), Potassium (K%), Calcium (Ca%), Magnesium (Mg%), Sulfur (S%), Chlorine (Cl%), Boron (B ppm), Copper (Cu ppm), Zinc (Zn ppm), Manganese (Mn ppm), Iron (Fe ppm). |
| **`DATAVM_vegetative_measurements.csv`** | `DATAVM.DBF` | Vegetative morphometric censuses: Rachis Length (cm), Petiole Cross-section Width & Depth (cm), Petiole Area ($cm^2$), Pinnae count, Leaf Area ($m^2$), Frond Dry Weight ($FDW$ kg), Canopy Leaf Area Index ($LAI$), Trunk Height (m), Palm Girth (m). |
| **`DATASOIL_soil_nutrients.csv`** | `DATASOIL.DBF` | Soil pedological and chemical fertility profiles by depth (0–15 cm, 15–30 cm): Soil pH ($H_2O$), Organic Carbon (%), Total Nitrogen (%), Available Phosphorus (Bray II ppm), Exchangeable K, Ca, Mg ($cmol(+)/kg$), and Cation Exchange Capacity ($CEC$). |
| **`DATAMISS_missing_palms.csv`** | `DATAMISS.DBF` | Palm vacancy and mortality census records (Lightning strike, ganoderma, sterility, replanted status). |
| **`ACFSINFO_schema_dictionary.csv`** | `ACFSINFO.DBF` | Complete dBase table schema & field dictionary from the original PORIM system (all 60 field definitions with byte lengths and types). |
| **`ACFSDATA_schema_dictionary.csv`** | `ACFSDATA.DBF` | Complete dBase table schema & field dictionary from the original PORIM system (all 189 field definitions with byte lengths and types). |
| **`ACFSINFO.csv`** | `ACFSINFO.DBF` | Original table header template for trial metadata. |
| **`ACFSDATA.csv`** | `ACFSDATA.DBF` | Original table header template for all agronomic observations. |

---

## 🌴 Included Agronomy Trials
- **DTP1**: Teluk Intan Station (Planted 1988, Density varies: 120–160 palms/ha, 6-Factor: Rep, Density, N, P, K, Lime)
- **FT1**: Sg. Papan Estate (Planted 1989, Density: 148 palms/ha, 4-Factor: Rep, N, P, K)
- **FT2**: Bukit Paloh Estate (Planted 1990, Density: 136 palms/ha, 4-Factor: Rep, N, K, Mg)
- **FT3**: Pamol Sabah (Planted 1991, Density: 148 palms/ha, 4-Factor: Rep, N, P, K)
- **FT4**: Malamba Sabah (Planted 1992, Density: 148 palms/ha, 3-Factor: Rep, N, P)
- **FT5**: Ladang Koko (Planted 1993, Density: 148 palms/ha)
- **TEP1 & TEP2**: Teluk Intan / Felcra Sg. Mong (Perak)
- **LPK1**: Teluk Intan
- **RISDA**: Gerdong Station
- **PR1998/1**: Banting Research Station (Planted 1998, DxP AVROS)
- **PR2002/4**: Kluang Substation (Planted 2002, DxP Yangambi)
- **PR2005/2**: Teluk Intan Station (Planted 2005, DxP Calabar)
- **1000 & 1500**: Lahad Datu Research Station (Sabah)
