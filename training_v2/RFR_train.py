#!/usr/bin/env python3
"""
RFR_train.py
------------
Random Forest Regressor Training Pipeline for Oil Palm Nutrients (N, P, K, Mg, Ca, B).
Dataset: v1_training_data.csv in 3. Training_v2
Outputs: rf_model_N.pkl, rf_model_P.pkl, rf_model_K.pkl, rf_model_Mg.pkl, rf_model_Ca.pkl, rf_model_B.pkl

Author: Antigravity AI / SmartPalm
"""

import os
import sys
import numpy as np
import pandas as pd
import pickle
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_DATASET_PATH = os.path.join(SCRIPT_DIR, "v1_training_data.csv")

FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]

TARGET_COLS = ['N', 'P', 'K', 'Mg', 'Ca', 'B']

def train_rfr_models():
    print("==========================================================================")
    print("🌲 SMARTPALM RANDOM FOREST REGRESSOR TRAINING (3. Training_v2)")
    print("==========================================================================")
    print(f"📁 Training Dataset Path : {TRAIN_DATASET_PATH}")
    print("==========================================================================\n")

    if not os.path.exists(TRAIN_DATASET_PATH):
        print(f"❌ Error: Training dataset not found at {TRAIN_DATASET_PATH}")
        sys.exit(1)

    df_train = pd.read_csv(TRAIN_DATASET_PATH)
    print(f"  ✓ Loaded {len(df_train)} training plot samples.\n")

    X = df_train[FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0)

    models = {}
    metrics_summary = []

    print("-" * 85)
    print(f"{'Target':<8} | {'R² Score':<10} | {'RMSE':<10} | {'MAE':<10} | Top 3 Important Features")
    print("-" * 85)

    for target in TARGET_COLS:
        y = df_train[target].astype(float)
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)
        
        rf = RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)
        
        y_pred = rf.predict(X_test)
        r2 = r2_score(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        mae = mean_absolute_error(y_test, y_pred)
        
        models[target] = rf
        
        model_out = os.path.join(SCRIPT_DIR, f"rf_model_{target}.pkl")
        with open(model_out, "wb") as f:
            pickle.dump(rf, f)
        
        importances = pd.Series(rf.feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
        top3_feats = ", ".join(importances.index[:3].tolist())
        
        metrics_summary.append({
            'Target': target,
            'R2': r2,
            'RMSE': rmse,
            'MAE': mae,
            'Top_Features': top3_feats
        })
        
        print(f"{target:<8} | {r2:<10.4f} | {rmse:<10.4f} | {mae:<10.4f} | {top3_feats}")

    print("-" * 85)
    print("\n✅ All RFR models trained and saved to .pkl files successfully!")

if __name__ == "__main__":
    train_rfr_models()
