#!/usr/bin/env python3
"""
benchmark_models.py
-------------------
Benchmarks raw 18 Sentinel bands vs 39 engineered spectral/SAR indices across
Random Forest, ExtraTrees, HistGradientBoosting, and Ensemble pipelines for
all 6 oil palm nutrients (N, P, K, Mg, Ca, B).

Selects the highest 5-Fold CV R² drop-in scikit-learn Pipeline per nutrient,
saves it to rf_model_<target>.pkl (100% compatible with predict_nutrients.py),
updates summary tables & plots, and writes a dated .txt report.
"""

import os
import sys
import pickle
from datetime import datetime
import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from spectral_features import (
    SpectralFeatureEngineer,
    RAW_FEATURE_COLS,
    ENGINEERED_COLS,
    ALL_ENGINEERED_FEATURE_NAMES,
)

from sklearn.pipeline import Pipeline
from sklearn.ensemble import (
    RandomForestRegressor,
    ExtraTreesRegressor,
    HistGradientBoostingRegressor,
    VotingRegressor,
)
from sklearn.model_selection import train_test_split, KFold, cross_val_predict
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error

TRAIN_DATASET_PATH = os.path.join(SCRIPT_DIR, "v1_training_data.csv")
TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']
TARGET_UNITS = {'N': '%', 'P': '%', 'K': '%', 'Mg': '%', 'Ca': '%', 'B': 'ppm'}

# Optional gradient boosting libraries
HAS_XGB = False
HAS_LGBM = False
try:
    from xgboost import XGBRegressor
    HAS_XGB = True
except Exception:
    pass
try:
    from lightgbm import LGBMRegressor
    HAS_LGBM = True
except Exception:
    pass


def build_candidates():
    """Return ordered dict of candidate model factories (all accept raw 18-column input)."""
    cands = {
        "RF_Raw18": lambda: RandomForestRegressor(
            n_estimators=300, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
        ),
        "RF_Indices39": lambda: Pipeline([
            ("fe", SpectralFeatureEngineer(s2_offset=0.10)),
            ("reg", RandomForestRegressor(
                n_estimators=300, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
            )),
        ]),
        "ET_Raw18": lambda: ExtraTreesRegressor(
            n_estimators=400, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
        ),
        "ET_Indices39": lambda: Pipeline([
            ("fe", SpectralFeatureEngineer(s2_offset=0.10)),
            ("reg", ExtraTreesRegressor(
                n_estimators=400, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
            )),
        ]),
        "HGB_Indices39": lambda: Pipeline([
            ("fe", SpectralFeatureEngineer(s2_offset=0.10)),
            ("reg", HistGradientBoostingRegressor(
                max_iter=350, learning_rate=0.04, max_leaf_nodes=31,
                min_samples_leaf=15, l2_regularization=1.0, random_state=42
            )),
        ]),
        "Ensemble_ET_RF_HGB_39": lambda: Pipeline([
            ("fe", SpectralFeatureEngineer(s2_offset=0.10)),
            ("reg", VotingRegressor([
                ("et", ExtraTreesRegressor(
                    n_estimators=400, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
                )),
                ("rf", RandomForestRegressor(
                    n_estimators=300, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
                )),
                ("hgb", HistGradientBoostingRegressor(
                    max_iter=350, learning_rate=0.04, max_leaf_nodes=31,
                    min_samples_leaf=15, l2_regularization=1.0, random_state=42
                )),
            ])),
        ]),
    }

    if HAS_XGB:
        cands["XGB_Indices39"] = lambda: Pipeline([
            ("fe", SpectralFeatureEngineer(s2_offset=0.10)),
            ("reg", XGBRegressor(
                n_estimators=400, learning_rate=0.03, max_depth=6,
                subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
                random_state=42, n_jobs=-1, verbosity=0
            )),
        ])

    if HAS_LGBM:
        cands["LGBM_Indices39"] = lambda: Pipeline([
            ("fe", SpectralFeatureEngineer(s2_offset=0.10)),
            ("reg", LGBMRegressor(
                n_estimators=400, learning_rate=0.03, num_leaves=31,
                subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
                random_state=42, n_jobs=-1, verbose=-1
            )),
        ])

    return cands


def extract_top_features(fitted_model, top_k=5):
    """Extract top feature names from RF/ET/Pipeline/VotingRegressor."""
    if isinstance(fitted_model, Pipeline):
        names = ALL_ENGINEERED_FEATURE_NAMES
        reg = fitted_model.named_steps["reg"]
    else:
        names = RAW_FEATURE_COLS
        reg = fitted_model

    if hasattr(reg, "feature_importances_"):
        imp = np.asarray(reg.feature_importances_, dtype=float)
    elif isinstance(reg, VotingRegressor):
        imps = []
        for est in reg.estimators_:
            if hasattr(est, "feature_importances_"):
                a = np.asarray(est.feature_importances_, dtype=float)
                if a.sum() > 0:
                    imps.append(a / a.sum())
        if not imps:
            return "N/A"
        imp = np.mean(imps, axis=0)
    else:
        return "N/A (HGB)"

    order = np.argsort(imp)[::-1][:top_k]
    return ", ".join(f"{names[i]}" for i in order)


def save_plots(plot_data, best_df, bench_df):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as e:
        print(f"  ! Skipping plots (matplotlib unavailable: {e})")
        return

    # 1. Combined 2x3 scatter plot of winning models (5-Fold Out-Of-Fold predictions)
    fig, axes = plt.subplots(2, 3, figsize=(15.5, 9.2))
    fig.suptitle("Best Benchmarked Pipeline per Nutrient — 5-Fold Out-of-Fold Actual vs Predicted", fontsize=14, fontweight="bold")
    for ax, target in zip(axes.flat, TARGET_COLS):
        d = plot_data[target]
        y_true, y_pred = d["y_true"], d["cv_pred"]
        lo = min(y_true.min(), y_pred.min())
        hi = max(y_true.max(), y_pred.max())
        pad = (hi - lo) * 0.05 if hi > lo else 0.1
        ax.scatter(y_true, y_pred, alpha=0.35, s=14, color="#16a34a", edgecolors="none")
        ax.plot([lo - pad, hi + pad], [lo - pad, hi + pad], "r--", lw=1.2)
        ax.set_title(f"{target} ({TARGET_UNITS[target]}) — {d['model']}\nCV5 R²={d['cv_r2']:.3f} | RMSE={d['cv_rmse']:.4f} | MAE={d['cv_mae']:.4f}", fontsize=9.5)
        ax.set_xlabel(f"Actual {target}")
        ax.set_ylabel(f"Predicted {target}")
        ax.grid(True, alpha=0.25)
        ax.set_xlim(lo - pad, hi + pad)
        ax.set_ylim(lo - pad, hi + pad)
    plt.tight_layout(rect=[0, 0, 1, 0.94])
    plt.savefig(os.path.join(SCRIPT_DIR, "model_performance_scatter_plots.png"), dpi=150)
    plt.close(fig)

    # 2. Individual scatter plots
    for target in TARGET_COLS:
        d = plot_data[target]
        y_true, y_pred = d["y_true"], d["cv_pred"]
        lo = min(y_true.min(), y_pred.min())
        hi = max(y_true.max(), y_pred.max())
        pad = (hi - lo) * 0.05 if hi > lo else 0.1
        fig_i, ax_i = plt.subplots(figsize=(6.2, 5.2))
        ax_i.scatter(y_true, y_pred, alpha=0.4, s=18, color="#16a34a", edgecolors="none")
        ax_i.plot([lo - pad, hi + pad], [lo - pad, hi + pad], "r--", lw=1.3)
        ax_i.set_title(f"{target} ({TARGET_UNITS[target]}) | {d['model']}\n5-Fold CV R²={d['cv_r2']:.4f} | RMSE={d['cv_rmse']:.4f} | MAE={d['cv_mae']:.4f}", fontsize=10)
        ax_i.set_xlabel(f"Actual {target} ({TARGET_UNITS[target]})")
        ax_i.set_ylabel(f"Predicted {target} ({TARGET_UNITS[target]})")
        ax_i.grid(True, alpha=0.25)
        ax_i.set_xlim(lo - pad, hi + pad)
        ax_i.set_ylim(lo - pad, hi + pad)
        plt.tight_layout()
        plt.savefig(os.path.join(SCRIPT_DIR, f"scatter_plot_{target}.png"), dpi=150)
        plt.close(fig_i)

    # 3. Benchmark comparison bar chart (Baseline RF_Raw18 vs Best Model CV5 R²)
    fig_b, ax_b = plt.subplots(figsize=(10.5, 5.2))
    x = np.arange(len(TARGET_COLS))
    w = 0.35
    base_r2 = [float(bench_df[(bench_df["Target"] == t) & (bench_df["Model"] == "RF_Raw18")]["CV5_R2"].iloc[0]) for t in TARGET_COLS]
    best_r2 = [float(best_df[best_df["Target"] == t]["CV5_R2"].iloc[0]) for t in TARGET_COLS]
    b1 = ax_b.bar(x - w / 2, base_r2, width=w, label="Baseline: RF (Raw 18 Bands)", color="#94a3b8")
    b2 = ax_b.bar(x + w / 2, best_r2, width=w, label="Winner: Spectral/SAR Indices Pipeline", color="#16a34a")
    ax_b.set_xticks(x)
    ax_b.set_xticklabels([f"{t}\n({best_df[best_df['Target']==t]['Best_Model'].iloc[0]})" for t in TARGET_COLS], fontsize=8.5)
    ax_b.set_ylabel("5-Fold Cross-Validation R²")
    ax_b.set_title("Model Benchmark: Raw 18 Bands vs Engineered Spectral & SAR Indices (5-Fold CV)")
    ax_b.set_ylim(0, max(1.0, max(best_r2) + 0.12))
    ax_b.grid(axis="y", alpha=0.25)
    ax_b.legend()
    for bars in (b1, b2):
        for bar in bars:
            h = bar.get_height()
            ax_b.text(bar.get_x() + bar.get_width() / 2, h + 0.015, f"{h:.3f}", ha="center", va="bottom", fontsize=8.5)
    plt.tight_layout()
    plt.savefig(os.path.join(SCRIPT_DIR, "model_performance_barchart.png"), dpi=150)
    plt.close(fig_b)
    print("  ✓ Updated scatter plots and benchmark comparison bar chart.", flush=True)


def write_txt_report(report_path, date_str, df_train, bench_df, best_df):
    comp_counts = df_train["Company"].value_counts().to_dict() if "Company" in df_train.columns else {}
    lines = []
    lines.append("=" * 92)
    lines.append(f"SMARTPALM NUTRIENT PREDICTION — MODEL BENCHMARK & SPECTRAL INDICES REPORT ({date_str})")
    lines.append("=" * 92)
    lines.append(f"Generated On      : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Training Dataset  : {TRAIN_DATASET_PATH}")
    lines.append(f"Total Clean Rows  : {len(df_train)} ({comp_counts})")
    lines.append(f"Input Schema      : 18 raw satellite bands (12 Sentinel-2 L2A + 6 Sentinel-1 RTC)")
    lines.append(f"Engineered Schema : 39 features (18 raw bands + 21 spectral & SAR indices via Pipeline)")
    lines.append(f"Drop-In Module    : training_v3/spectral_features.py (SpectralFeatureEngineer)")
    lines.append("")
    lines.append("1. WHY THIS BENCHMARK WAS RUN")
    lines.append("-" * 92)
    lines.append("After expanding v1_training_data.csv from 294 single-estate FGV rows to 2,914 multi-estate")
    lines.append("rows across FGV (279), BWSB (250), and Sabah Softwoods Berhad (2,385 across 2022-2026),")
    lines.append("and removing the 5 lab outlier rows + 15 zero-filled R1 rows, we benchmarked whether adding")
    lines.append("domain-specific optical vegetation & SAR indices and comparing tree/boosting algorithms")
    lines.append("improves generalization accuracy over the raw 18-band Random Forest baseline.")
    lines.append("")
    lines.append("All winning models are saved as self-contained scikit-learn Pipelines in rf_model_<X>.pkl,")
    lines.append("meaning predict_nutrients.py continues to pass the exact same 18 raw Sentinel columns")
    lines.append("while the Pipeline computes all 21 indices automatically inside model.predict().")
    lines.append("")
    lines.append("2. ENGINEERED FEATURES (21 INDICES ADDED TO THE 18 RAW BANDS = 39 TOTAL)")
    lines.append("-" * 92)
    lines.append("Note: Sentinel-2 L2A bands (PB >= 04.00) include a +0.10 radiometric offset. Before")
    lines.append("computing normalized ratios, SpectralFeatureEngineer subtracts 0.10 (clipped >= 1e-6)")
    lines.append("so vegetation indices recover true physical surface-reflectance dynamic range.")
    lines.append("")
    lines.append("  A. Optical Vegetation, Chlorophyll, Red-Edge & Moisture Indices (16):")
    lines.append("     1. NDVI       = (B8 - B4) / (B8 + B4)             [Canopy vigor / biomass]")
    lines.append("     2. NDRE1      = (B8 - B5) / (B8 + B5)             [Red-Edge 1 chlorophyll / N]")
    lines.append("     3. NDRE2      = (B8 - B6) / (B8 + B6)             [Red-Edge 2 chlorophyll / N]")
    lines.append("     4. NDRE3      = (B8 - B7) / (B8 + B7)             [Red-Edge 3 canopy structure]")
    lines.append("     5. NDRE_8A5   = (B8A - B5) / (B8A + B5)           [Narrow NIR Red-Edge (N, Mg)]")
    lines.append("     6. CI_RE      = (B7 / B5) - 1                     [Chlorophyll Index Red-Edge]")
    lines.append("     7. CI_G       = (B7 / B3) - 1                     [Chlorophyll Index Green]")
    lines.append("     8. GNDVI      = (B8 - B3) / (B8 + B3)             [Green NDVI / foliar N]")
    lines.append("     9. NDMI       = (B8A - B11) / (B8A + B11)         [Canopy moisture / K & P stress]")
    lines.append("    10. NBR        = (B8A - B12) / (B8A + B12)         [SWIR2 canopy dryness / Mg]")
    lines.append("    11. SWIR_ratio = B11 / B12                         [SWIR1/SWIR2 biochemical ratio]")
    lines.append("    12. SAVI       = 1.5 * (B8 - B4) / (B8 + B4 + 0.5) [Soil-Adjusted Veg Index]")
    lines.append("    13. EVI        = 2.5 * (B8 - B4) / (B8 + 6*B4 - 7.5*B2 + 1) [Enhanced Veg Index]")
    lines.append("    14. MCARI      = ((B5 - B4) - 0.2*(B5 - B3)) * (B5 / B4)    [Chlorophyll absorption]")
    lines.append("    15. BG_ratio   = B2 / B3                           [Blue/Green pigment balance]")
    lines.append("    16. RE_slope   = (B7 - B5) / B6                    [Red-Edge inflection slope]")
    lines.append("")
    lines.append("  B. Sentinel-1 SAR Structural & Polarimetric Indices (5):")
    lines.append("    17. VH_VV_ratio = Sigma0_VH / Sigma0_VV            [Cross/co-pol canopy density]")
    lines.append("    18. RVI_SAR     = 4 * Sigma0_VH / (VV + VH)        [Radar Vegetation Index]")
    lines.append("    19. Sigma0_VV_dB = 10 * log10(Sigma0_VV)           [Log VV backscatter (dB)]")
    lines.append("    20. Sigma0_VH_dB = 10 * log10(Sigma0_VH)           [Log VH backscatter (dB)]")
    lines.append("    21. Pol_Diff_dB  = Sigma0_VH_dB - Sigma0_VV_dB     [Polarization diff (dB)]")
    lines.append("")
    lines.append("3. FULL BENCHMARK COMPARISON (5-FOLD CROSS-VALIDATION & 20% STRATIFIED HOLDOUT)")
    lines.append("-" * 92)
    for target in TARGET_COLS:
        sub = bench_df[bench_df["Target"] == target].sort_values("CV5_R2", ascending=False)
        n_samp = int(sub["Samples"].iloc[0])
        lines.append(f"\n  Target: {target} ({TARGET_UNITS[target]}) | Valid Samples n = {n_samp}")
        lines.append(f"  {'Model':<24} | {'CV5 R²':>8} | {'CV5 RMSE':>9} | {'CV5 MAE':>9} | {'Test R²':>8} | {'Test RMSE':>9}")
        lines.append("  " + "-" * 80)
        for _, row in sub.iterrows():
            star = "  <-- SELECTED" if row["Model"] == best_df[best_df["Target"] == target]["Best_Model"].iloc[0] else ""
            lines.append(
                f"  {row['Model']:<24} | {row['CV5_R2']:>8.4f} | {row['CV5_RMSE']:>9.4f} | "
                f"{row['CV5_MAE']:>9.4f} | {row['Test_R2']:>8.4f} | {row['Test_RMSE']:>9.4f}{star}"
            )

    lines.append("")
    lines.append("")
    lines.append("4. DEPLOYED WINNING MODELS (SAVED TO training_v3/rf_model_<Target>.pkl)")
    lines.append("-" * 92)
    lines.append(f"{'Target':<7} | {'n':>5} | {'Selected Model':<22} | {'Base CV R²':>10} | {'Win CV R²':>9} | {'Gain':>8} | {'CV RMSE':>8} | {'CV MAE':>8}")
    lines.append("-" * 92)
    for _, row in best_df.iterrows():
        delta = row["CV5_R2"] - row["Baseline_CV5_R2"]
        lines.append(
            f"{row['Target']:<7} | {int(row['Samples']):>5} | {row['Best_Model']:<22} | "
            f"{row['Baseline_CV5_R2']:>10.4f} | {row['CV5_R2']:>9.4f} | {delta:>+8.4f} | "
            f"{row['CV5_RMSE']:>8.4f} | {row['CV5_MAE']:>8.4f}"
        )
    lines.append("-" * 92)
    lines.append("")
    lines.append("Top Important Features per Winning Model:")
    for _, row in best_df.iterrows():
        lines.append(f"  - {row['Target']:<3}: {row['Top_Features']}")

    lines.append("")
    lines.append("5. PRACTICAL NOTES & HOW TO IMPROVE FURTHER")
    lines.append("-" * 92)
    lines.append("- Drop-in Compatibility: predict_nutrients.py loads rf_model_*.pkl with zero code changes.")
    lines.append("  Keep training_v3/spectral_features.py in the same folder as rf_model_*.pkl.")
    lines.append("- Final Deployed Models: After unbiased 5-Fold CV and 80/20 evaluation, each winning")
    lines.append("  Pipeline is re-fit on 100% of valid samples for maximum real-world accuracy.")
    lines.append("- Previous Backup: Original FGV-only models remain preserved in training_v3/models_v1_backup/.")
    lines.append("- Biggest Future Accuracy Lever: Sabah Softwoods rows currently only include the sampling")
    lines.append("  YEAR (2022-2026) rather than exact sampling MONTH/DAY. Providing exact foliar sampling")
    lines.append("  dates (and Ca lab readings for Sabah Softwoods) will tighten satellite-to-lab alignment")
    lines.append("  and raise R² significantly more than algorithm tuning alone.")
    lines.append("=" * 92)

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  ✓ Saved detailed report: {report_path}", flush=True)


def main():
    print("==========================================================================", flush=True)
    print("🚀 SMARTPALM MULTI-MODEL & SPECTRAL INDICES BENCHMARK (training_v3)", flush=True)
    print("==========================================================================", flush=True)
    print(f"Optional boosters detected -> XGBoost: {HAS_XGB}, LightGBM: {HAS_LGBM}", flush=True)

    df_train = pd.read_csv(TRAIN_DATASET_PATH)
    print(f"Loaded {len(df_train)} clean rows from {TRAIN_DATASET_PATH}", flush=True)

    X_all = df_train[RAW_FEATURE_COLS].apply(pd.to_numeric, errors="coerce")
    feat_valid = X_all.notna().all(axis=1)

    candidates = build_candidates()
    print(f"Benchmarking {len(candidates)} candidate pipelines: {list(candidates.keys())}\n", flush=True)

    all_bench_rows = []
    best_rows = []
    plot_data = {}

    kf = KFold(n_splits=5, shuffle=True, random_state=42)

    for target in TARGET_COLS:
        y_raw = pd.to_numeric(df_train[target], errors="coerce")
        valid_mask = feat_valid & y_raw.notna() & (y_raw > 0)
        X = X_all.loc[valid_mask].copy()
        y = y_raw.loc[valid_mask].astype(float).copy()

        strat = None
        if "Company" in df_train.columns:
            comps = df_train.loc[valid_mask, "Company"]
            if comps.nunique() > 1 and comps.value_counts().min() >= 5:
                strat = comps

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.20, random_state=42, stratify=strat
        )

        print(f"\n=== Target: {target} ({TARGET_UNITS[target]}) | n={len(y)} ===", flush=True)
        print(f"  {'Model':<24} | {'CV5 R²':>8} | {'CV5 RMSE':>9} | {'CV5 MAE':>9} | {'Test R²':>8} | {'Test RMSE':>9}", flush=True)
        print("  " + "-" * 78, flush=True)

        best_cv_r2 = -1e9
        best_info = None
        baseline_cv_r2 = None

        for m_name, m_factory in candidates.items():
            # 1. Stratified 80/20 Holdout evaluation
            m_hold = m_factory()
            m_hold.fit(X_train, y_train)
            y_pred_test = m_hold.predict(X_test)
            test_r2 = float(r2_score(y_test, y_pred_test))
            test_rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_test)))
            test_mae = float(mean_absolute_error(y_test, y_pred_test))

            # 2. Unbiased 5-Fold Cross-Validation across all valid samples
            cv_pred = cross_val_predict(m_factory(), X, y, cv=kf, n_jobs=1)
            cv_r2 = float(r2_score(y, cv_pred))
            cv_rmse = float(np.sqrt(mean_squared_error(y, cv_pred)))
            cv_mae = float(mean_absolute_error(y, cv_pred))

            if m_name == "RF_Raw18":
                baseline_cv_r2 = cv_r2

            print(
                f"  {m_name:<24} | {cv_r2:>8.4f} | {cv_rmse:>9.4f} | {cv_mae:>9.4f} | "
                f"{test_r2:>8.4f} | {test_rmse:>9.4f}",
                flush=True,
            )

            all_bench_rows.append({
                "Target": target,
                "Samples": len(y),
                "Model": m_name,
                "CV5_R2": round(cv_r2, 4),
                "CV5_RMSE": round(cv_rmse, 4),
                "CV5_MAE": round(cv_mae, 4),
                "Test_R2": round(test_r2, 4),
                "Test_RMSE": round(test_rmse, 4),
                "Test_MAE": round(test_mae, 4),
            })

            if cv_r2 > best_cv_r2:
                best_cv_r2 = cv_r2
                best_info = {
                    "model_name": m_name,
                    "factory": m_factory,
                    "cv_r2": cv_r2,
                    "cv_rmse": cv_rmse,
                    "cv_mae": cv_mae,
                    "test_r2": test_r2,
                    "test_rmse": test_rmse,
                    "test_mae": test_mae,
                    "cv_pred": cv_pred,
                }

        # Re-fit winning model on 100% of valid samples and save drop-in .pkl
        final_model = best_info["factory"]()
        final_model.fit(X, y)
        model_out = os.path.join(SCRIPT_DIR, f"rf_model_{target}.pkl")
        with open(model_out, "wb") as f:
            pickle.dump(final_model, f)

        top_feats = extract_top_features(final_model, top_k=5)
        print(f"  >>> WINNER for {target}: {best_info['model_name']} (CV5 R²={best_info['cv_r2']:.4f}, gain={best_info['cv_r2'] - baseline_cv_r2:+.4f}) -> saved {os.path.basename(model_out)}", flush=True)

        best_rows.append({
            "Target": target,
            "Samples": len(y),
            "Best_Model": best_info["model_name"],
            "Baseline_CV5_R2": round(baseline_cv_r2, 4),
            "CV5_R2": round(best_info["cv_r2"], 4),
            "CV5_RMSE": round(best_info["cv_rmse"], 4),
            "CV5_MAE": round(best_info["cv_mae"], 4),
            "Test_R2": round(best_info["test_r2"], 4),
            "Test_RMSE": round(best_info["test_rmse"], 4),
            "Test_MAE": round(best_info["test_mae"], 4),
            "Top_Features": top_feats,
        })

        plot_data[target] = {
            "model": best_info["model_name"],
            "y_true": y.values,
            "cv_pred": best_info["cv_pred"],
            "cv_r2": best_info["cv_r2"],
            "cv_rmse": best_info["cv_rmse"],
            "cv_mae": best_info["cv_mae"],
        }

    bench_df = pd.DataFrame(all_bench_rows)
    best_df = pd.DataFrame(best_rows)

    # Save CSV/Excel summaries
    bench_csv = os.path.join(SCRIPT_DIR, "model_benchmark_all_results.csv")
    summary_csv = os.path.join(SCRIPT_DIR, "model_performance_summary.csv")
    bench_df.to_csv(bench_csv, index=False)
    best_df.to_csv(summary_csv, index=False)
    try:
        summary_xlsx = os.path.join(SCRIPT_DIR, "model_performance_summary.xlsx")
        with pd.ExcelWriter(summary_xlsx) as writer:
            best_df.to_excel(writer, sheet_name="Winning_Models", index=False)
            bench_df.to_excel(writer, sheet_name="Full_Benchmark", index=False)
        print(f"\n  ✓ Saved Excel workbook: {summary_xlsx}", flush=True)
    except Exception as e:
        print(f"\n  ! Saved CSV summaries (Excel skipped: {e})", flush=True)

    save_plots(plot_data, best_df, bench_df)

    # Write dated .txt report
    date_str = datetime.now().strftime("%Y-%m-%d")
    report_path = os.path.join(SCRIPT_DIR, f"{date_str}_model_benchmark_and_spectral_indices_report.txt")
    write_txt_report(report_path, date_str, df_train, bench_df, best_df)

    print("\n✅ Benchmark complete! All winning drop-in Pipelines saved and reported.", flush=True)


if __name__ == "__main__":
    main()
