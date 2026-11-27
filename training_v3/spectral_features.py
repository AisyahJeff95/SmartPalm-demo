#!/usr/bin/env python3
"""
spectral_features.py
--------------------
Drop-in scikit-learn transformer that engineers 21 optical (Sentinel-2) and
SAR (Sentinel-1) vegetation, chlorophyll, moisture, and canopy-structure indices
from the standard 18 raw satellite bands.

Lives in its own importable module so pickled sklearn Pipelines saved as
rf_model_*.pkl can be unpickled directly by predict_nutrients.py without changes.
"""

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

RAW_FEATURE_COLS = [
    'Band12', 'Band11', 'Band9', 'Band8A', 'Band8', 'Band7',
    'Band6', 'Band5', 'Band4', 'Band3', 'Band2', 'Band1',
    'Sigma0_VV', 'Sigma0_VH', 'Gamma0_VV', 'Gamma0_VH', 'Beta0_VV', 'Beta0_VH'
]

ENGINEERED_COLS = [
    'NDVI', 'NDRE1', 'NDRE2', 'NDRE3', 'NDRE_8A5',
    'CI_RE', 'CI_G', 'GNDVI', 'NDMI', 'NBR',
    'SWIR_ratio', 'SAVI', 'EVI', 'MCARI', 'BG_ratio', 'RE_slope',
    'VH_VV_ratio', 'RVI_SAR', 'Sigma0_VV_dB', 'Sigma0_VH_dB', 'Pol_Diff_dB'
]

ALL_ENGINEERED_FEATURE_NAMES = RAW_FEATURE_COLS + ENGINEERED_COLS


class SpectralFeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Accepts either a pandas DataFrame (with RAW_FEATURE_COLS) or an (N, 18) numpy array
    and returns an (N, 39) float64 numpy array containing the 18 raw bands + 21 indices.
    """

    def __init__(self, s2_offset: float = 0.10):
        self.s2_offset = s2_offset

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            arr = X[RAW_FEATURE_COLS].apply(pd.to_numeric, errors='coerce').fillna(0.0).to_numpy(dtype=np.float64)
        else:
            arr = np.asarray(X, dtype=np.float64)
            arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

        eps = 1e-6

        # Unpack raw bands (indices match RAW_FEATURE_COLS order)
        b12 = arr[:, 0]
        b11 = arr[:, 1]
        b9  = arr[:, 2]
        b8a = arr[:, 3]
        b8  = arr[:, 4]
        b7  = arr[:, 5]
        b6  = arr[:, 6]
        b5  = arr[:, 7]
        b4  = arr[:, 8]
        b3  = arr[:, 9]
        b2  = arr[:, 10]
        b1  = arr[:, 11]
        s0_vv = np.clip(arr[:, 12], eps, None)
        s0_vh = np.clip(arr[:, 13], eps, None)

        # Offset-corrected Sentinel-2 surface reflectance (PB >= 04.00 adds +0.10)
        off = float(self.s2_offset)
        r12 = np.clip(b12 - off, eps, None)
        r11 = np.clip(b11 - off, eps, None)
        r8a = np.clip(b8a - off, eps, None)
        r8  = np.clip(b8  - off, eps, None)
        r7  = np.clip(b7  - off, eps, None)
        r6  = np.clip(b6  - off, eps, None)
        r5  = np.clip(b5  - off, eps, None)
        r4  = np.clip(b4  - off, eps, None)
        r3  = np.clip(b3  - off, eps, None)
        r2  = np.clip(b2  - off, eps, None)

        # Optical Vegetation, Chlorophyll, Red-Edge & Moisture Indices
        ndvi     = (r8 - r4) / (r8 + r4 + eps)
        ndre1    = (r8 - r5) / (r8 + r5 + eps)
        ndre2    = (r8 - r6) / (r8 + r6 + eps)
        ndre3    = (r8 - r7) / (r8 + r7 + eps)
        ndre_8a5 = (r8a - r5) / (r8a + r5 + eps)
        ci_re    = (r7 / (r5 + eps)) - 1.0
        ci_g     = (r7 / (r3 + eps)) - 1.0
        gndvi    = (r8 - r3) / (r8 + r3 + eps)
        ndmi     = (r8a - r11) / (r8a + r11 + eps)
        nbr      = (r8a - r12) / (r8a + r12 + eps)
        swir_rat = r11 / (r12 + eps)
        savi     = 1.5 * (r8 - r4) / (r8 + r4 + 0.5 + eps)
        evi_den  = r8 + 6.0 * r4 - 7.5 * r2 + 1.0
        evi      = np.clip(2.5 * (r8 - r4) / np.where(np.abs(evi_den) < 0.05, 0.05, evi_den), -2.0, 2.0)
        mcari    = ((r5 - r4) - 0.2 * (r5 - r3)) * (r5 / (r4 + eps))
        bg_ratio = r2 / (r3 + eps)
        re_slope = (r7 - r5) / (r6 + eps)

        # SAR Structural & Polarimetric Indices
        vh_vv_ratio = s0_vh / (s0_vv + eps)
        rvi_sar     = 4.0 * s0_vh / (s0_vv + s0_vh + eps)
        vv_db       = 10.0 * np.log10(s0_vv)
        vh_db       = 10.0 * np.log10(s0_vh)
        pol_diff_db = vh_db - vv_db

        derived = np.column_stack([
            ndvi, ndre1, ndre2, ndre3, ndre_8a5,
            ci_re, ci_g, gndvi, ndmi, nbr,
            swir_rat, savi, evi, mcari, bg_ratio, re_slope,
            vh_vv_ratio, rvi_sar, vv_db, vh_db, pol_diff_db
        ])
        derived = np.nan_to_num(derived, nan=0.0, posinf=0.0, neginf=0.0)
        return np.hstack([arr, derived])

    def get_feature_names_out(self, input_features=None):
        return np.array(ALL_ENGINEERED_FEATURE_NAMES, dtype=object)
