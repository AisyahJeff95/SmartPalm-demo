#!/usr/bin/env python3
"""
RFR_train.py
------------
Random Forest Regressor Training Pipeline for Oil Palm Nutrients (N, P, K, Mg, Ca, B).
Dataset: v1_training_data.csv in training_v3
Outputs:
  - rf_model_N.pkl, rf_model_P.pkl, rf_model_K.pkl, rf_model_Mg.pkl, rf_model_Ca.pkl, rf_model_B.pkl
  - scatter_plot_<target>.png, model_performance_scatter_plots.png, model_performance_barchart.png
  - model_performance_summary.csv (and .xlsx if openpyxl is available)

Author: Antigravity AI / SmartPalm
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, KFold, cross_val_predict
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_DATASET_PATH = os.path.join(SCRIPT_DIR, "v1_training_data.csv")

FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]

TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']
TARGET_UNITS = {'N': '%', 'P': '%', 'K': '%', 'Mg': '%', 'Ca': '%', 'B': 'ppm'}


def save_plots(plot_data, metrics_df):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as e:
        print(f"  ! Skipping plot generation (matplotlib unavailable: {e})")
        return

    # 1. Combined 2x3 scatter plots (Actual vs Predicted on Test Set)
    fig, axes = plt.subplots(2, 3, figsize=(15, 9))
    fig.suptitle("Random Forest Nutrient Models — Test Set Actual vs Predicted", fontsize=14, fontweight="bold")
    for ax, target in zip(axes.flat, TARGET_COLS):
        d = plot_data[target]
        y_true, y_pred = d["y_test"], d["y_pred"]
        lo = min(y_true.min(), y_pred.min())
        hi = max(y_true.max(), y_pred.max())
        pad = (hi - lo) * 0.05 if hi > lo else 0.1
        ax.scatter(y_true, y_pred, alpha=0.45, s=18, color="#16a34a", edgecolors="none")
        ax.plot([lo - pad, hi + pad], [lo - pad, hi + pad], "r--", lw=1.2, label="1:1 line")
        ax.set_title(f"{target} ({TARGET_UNITS[target]}) | n={d['n']} | R²={d['r2']:.3f}, RMSE={d['rmse']:.4f}")
        ax.set_xlabel(f"Actual {target}")
        ax.set_ylabel(f"Predicted {target}")
        ax.grid(True, alpha=0.25)
        ax.set_xlim(lo - pad, hi + pad)
        ax.set_ylim(lo - pad, hi + pad)
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    plt.savefig(os.path.join(SCRIPT_DIR, "model_performance_scatter_plots.png"), dpi=150)
    plt.close(fig)

    # 2. Individual scatter plots
    for target in TARGET_COLS:
        d = plot_data[target]
        y_true, y_pred = d["y_test"], d["y_pred"]
        lo = min(y_true.min(), y_pred.min())
        hi = max(y_true.max(), y_pred.max())
        pad = (hi - lo) * 0.05 if hi > lo else 0.1
        fig_i, ax_i = plt.subplots(figsize=(6, 5))
        ax_i.scatter(y_true, y_pred, alpha=0.5, s=22, color="#16a34a", edgecolors="none")
        ax_i.plot([lo - pad, hi + pad], [lo - pad, hi + pad], "r--", lw=1.3)
        ax_i.set_title(f"{target} ({TARGET_UNITS[target]}) | Test R²={d['r2']:.4f} | RMSE={d['rmse']:.4f} | MAE={d['mae']:.4f}")
        ax_i.set_xlabel(f"Actual {target} ({TARGET_UNITS[target]})")
        ax_i.set_ylabel(f"Predicted {target} ({TARGET_UNITS[target]})")
        ax_i.grid(True, alpha=0.25)
        ax_i.set_xlim(lo - pad, hi + pad)
        ax_i.set_ylim(lo - pad, hi + pad)
        plt.tight_layout()
        plt.savefig(os.path.join(SCRIPT_DIR, f"scatter_plot_{target}.png"), dpi=150)
        plt.close(fig_i)

    # 3. Performance bar chart (Test R² vs 5-Fold CV R²)
    fig_b, ax_b = plt.subplots(figsize=(9, 5))
    x = np.arange(len(metrics_df))
    w = 0.35
    b1 = ax_b.bar(x - w / 2, metrics_df["Test_R2"], width=w, label="Test R² (20% holdout)", color="#16a34a")
    b2 = ax_b.bar(x + w / 2, metrics_df["CV5_R2"], width=w, label="5-Fold CV R²", color="#2563eb")
    ax_b.set_xticks(x)
    ax_b.set_xticklabels(metrics_df["Target"])
    ax_b.set_ylabel("R² Score")
    ax_b.set_title("Random Forest Model Performance by Nutrient (Updated Multi-Estate Dataset)")
    ax_b.set_ylim(min(0, float(metrics_df[["Test_R2", "CV5_R2"]].min().min()) - 0.1), 1.05)
    ax_b.grid(axis="y", alpha=0.25)
    ax_b.legend()
    for bars in (b1, b2):
        for bar in bars:
            h = bar.get_height()
            ax_b.text(bar.get_x() + bar.get_width() / 2, h + 0.015, f"{h:.3f}", ha="center", va="bottom", fontsize=8.5)
    plt.tight_layout()
    plt.savefig(os.path.join(SCRIPT_DIR, "model_performance_barchart.png"), dpi=150)
    plt.close(fig_b)
    print("  ✓ Updated scatter plots and performance bar chart.")


def train_rfr_models():
    print("==========================================================================")
    print("🌲 SMARTPALM RANDOM FOREST REGRESSOR TRAINING (training_v3)")
    print("==========================================================================")
    print(f"📁 Training Dataset Path : {TRAIN_DATASET_PATH}")
    print("==========================================================================\n")

    if not os.path.exists(TRAIN_DATASET_PATH):
        print(f"❌ Error: Training dataset not found at {TRAIN_DATASET_PATH}")
        sys.exit(1)

    df_train = pd.read_csv(TRAIN_DATASET_PATH)
    print(f"  ✓ Loaded {len(df_train)} total plot samples.")
    if "Company" in df_train.columns:
        comp_counts = df_train["Company"].value_counts().to_dict()
        print(f"  ✓ Company breakdown: {comp_counts}\n")

    X_all = df_train[FEATURE_COLS].apply(pd.to_numeric, errors='coerce')
    feat_valid = X_all.notna().all(axis=1)
    if not feat_valid.all():
        print(f"  ! Dropping {int((~feat_valid).sum())} rows with missing satellite band values.\n")

    models = {}
    metrics_summary = []
    plot_data = {}

    print("-" * 116)
    print(f"{'Target':<7} | {'n':>5} | {'Test R²':>8} | {'Test RMSE':>9} | {'Test MAE':>9} | {'CV5 R²':>8} | {'CV5 RMSE':>9} | Top 3 Important Features")
    print("-" * 116)

    for target in TARGET_COLS:
        y_raw = pd.to_numeric(df_train[target], errors='coerce')
        valid_mask = feat_valid & y_raw.notna() & (y_raw > 0)

        X = X_all.loc[valid_mask].copy()
        y = y_raw.loc[valid_mask].astype(float).copy()

        # Stratify by Company when multiple companies with >=5 samples exist
        strat = None
        if "Company" in df_train.columns:
            comps = df_train.loc[valid_mask, "Company"]
            if comps.nunique() > 1 and comps.value_counts().min() >= 5:
                strat = comps

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.20, random_state=42, stratify=strat
        )

        rf = RandomForestRegressor(
            n_estimators=300,
            max_depth=None,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        rf.fit(X_train, y_train)

        y_pred = rf.predict(X_test)
        r2 = r2_score(y_test, y_pred)
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        mae = float(mean_absolute_error(y_test, y_pred))

        # 5-Fold Cross-Validation across all valid samples
        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        rf_cv = RandomForestRegressor(
            n_estimators=200,
            max_depth=None,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
        cv_pred = cross_val_predict(rf_cv, X, y, cv=kf, n_jobs=-1)
        cv_r2 = r2_score(y, cv_pred)
        cv_rmse = float(np.sqrt(mean_squared_error(y, cv_pred)))
        cv_mae = float(mean_absolute_error(y, cv_pred))

        models[target] = rf

        model_out = os.path.join(SCRIPT_DIR, f"rf_model_{target}.pkl")
        with open(model_out, "wb") as f:
            pickle.dump(rf, f)

        importances = pd.Series(rf.feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
        top3_feats = ", ".join(importances.index[:3].tolist())

        metrics_summary.append({
            'Target': target,
            'Samples': len(y),
            'Train_Samples': len(y_train),
            'Test_Samples': len(y_test),
            'Test_R2': round(r2, 4),
            'Test_RMSE': round(rmse, 4),
            'Test_MAE': round(mae, 4),
            'CV5_R2': round(cv_r2, 4),
            'CV5_RMSE': round(cv_rmse, 4),
            'CV5_MAE': round(cv_mae, 4),
            'Top_Features': top3_feats
        })

        plot_data[target] = {
            "y_test": y_test.values,
            "y_pred": y_pred,
            "n": len(y),
            "r2": r2,
            "rmse": rmse,
            "mae": mae,
        }

        print(
            f"{target:<7} | {len(y):>5} | {r2:>8.4f} | {rmse:>9.4f} | {mae:>9.4f} | "
            f"{cv_r2:>8.4f} | {cv_rmse:>9.4f} | {top3_feats}"
        )

    print("-" * 116)

    metrics_df = pd.DataFrame(metrics_summary)
    summary_csv = os.path.join(SCRIPT_DIR, "model_performance_summary.csv")
    metrics_df.to_csv(summary_csv, index=False)
    try:
        summary_xlsx = os.path.join(SCRIPT_DIR, "model_performance_summary.xlsx")
        metrics_df.to_excel(summary_xlsx, index=False)
        print(f"  ✓ Saved summary tables: {summary_csv} & {summary_xlsx}")
    except Exception:
        print(f"  ✓ Saved summary table: {summary_csv}")

    save_plots(plot_data, metrics_df)
    print("\n✅ All 6 RFR models trained and saved to .pkl files successfully!")


if __name__ == "__main__":
    train_rfr_models()
