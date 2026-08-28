#!/usr/bin/env python3
"""
Train a Random Forest Regressor model on 200 programmatically generated spatial sampling points
inside the Seraya Estate perimeter. Reuses historical baseline Sentinel-2 reflectances
with coordinate-seeded spatial jitter to represent local crop variability.
Features: B2, B3, B4, B8, B11, B12, NDVI, NDRE, SAVI, EVI, GNDVI, MSAVI. How many bands: 12 features from Sentinel-2A (Optical) and 9 features from Sentinel-1A (Radar).
Targets: Nitrogen (%), Phosphorus (%), Potassium (%).
"""

import json
import math
import os
import random
import sys
from typing import Any, Dict, List, Optional

# Baseline Sentinel-2 bands for given mpob small benta data initial:
# change to raw data - .csv file
# # Load the dataset:
# data = pd.read_csv('https://raw.githubusercontent.com/vkavitha19/MachineLearning/refs/heads/main/datasets/k_circle_sales.csv')
# # View the first five rows of the dataset
# data.head()
# Find the null values in each of the features
# data.isnull().sum()


FALLBACK_BAND_DATA = {
    "Aug/2021": {"B02": 380, "B03": 720, "B04": 280, "B05": 1380, "B08": 3200, "B11": 1950, "B12": 950},
    "Jul/2022": {"B02": 350, "B03": 760, "B04": 260, "B05": 1450, "B08": 3320, "B11": 1820, "B12": 890},
    "Sep/2023": {"B02": 390, "B03": 700, "B04": 290, "B05": 1310, "B08": 3100, "B11": 2010, "B12": 980},
    "Oct/2024": {"B02": 310, "B03": 820, "B04": 210, "B05": 1610, "B08": 3650, "B11": 1690, "B12": 780},
    "Aug/2025": {"B02": 330, "B03": 790, "B04": 240, "B05": 1520, "B08": 3480, "B11": 1750, "B12": 820},

    # B02 is Blue, B03 is Green, B04 is Red, B05 is Red Edge 1, B08 is NIR, B11 is SWIR 1, B12 is SWIR 2
    # B02 is for water content, Blue
    # B03 is for vegetation health, Green
    # B04 is for chlorophyll content, Red
    # B05 is for vegetation stress, Red Edge 1
    # B08 is for biomass estimation, NIR
    # B11 is for soil moisture, SWIR 1
    # B12 is for vegetation water content, SWIR 2
}

# Pure Python DecisionTreeRegressor
class DecisionTreeRegressor:
    def __init__(self, max_depth=4, min_samples_split=2):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.feature_idx = None
        self.threshold = None
        self.left = None
        self.right = None
        self.value = None

    def fit(self, X, y, depth=0):
        n_samples = len(X)
        if n_samples == 0:
            self.value = 0
            return self
        
        self.value = sum(y) / n_samples
        
        if depth >= self.max_depth or n_samples < self.min_samples_split:
            return self
        
        n_features = len(X[0])
        best_sse = float('inf')
        best_feature = None
        best_threshold = None
        best_left_idx = None
        best_right_idx = None
        
        for feature in range(n_features):
            thresholds = set(row[feature] for row in X)
            # Sample thresholds for speed if too many unique values
            if len(thresholds) > 40:
                thresholds = random.sample(list(thresholds), 40)
                
            for threshold in thresholds:
                left_idx = [i for i in range(n_samples) if X[i][feature] <= threshold]
                right_idx = [i for i in range(n_samples) if X[i][feature] > threshold]
                
                if not left_idx or not right_idx:
                    continue
                
                left_y = [y[i] for i in left_idx]
                right_y = [y[i] for i in right_idx]
                
                left_mean = sum(left_y) / len(left_y)
                right_mean = sum(right_y) / len(right_y)
                
                sse = sum((val - left_mean)**2 for val in left_y) + sum((val - right_mean)**2 for val in right_y)
                
                if sse < best_sse:
                    best_sse = sse
                    best_feature = feature
                    best_threshold = threshold
                    best_left_idx = left_idx
                    best_right_idx = right_idx
        
        if best_feature is not None:
            self.feature_idx = best_feature
            self.threshold = best_threshold
            self.left = DecisionTreeRegressor(self.max_depth, self.min_samples_split).fit(
                [X[i] for i in best_left_idx], [y[i] for i in best_left_idx], depth + 1
            )
            self.right = DecisionTreeRegressor(self.max_depth, self.min_samples_split).fit(
                [X[i] for i in best_right_idx], [y[i] for i in best_right_idx], depth + 1
            )
        return self

    def predict_row(self, x):
        if self.feature_idx is None:
            return self.value
        if x[self.feature_idx] <= self.threshold:
            return self.left.predict_row(x)
        else:
            return self.right.predict_row(x)

    def predict(self, X):
        return [self.predict_row(x) for x in X]

# Pure Python RandomForestRegressor
class RandomForestRegressor:
    def __init__(self, n_estimators=15, max_depth=4, min_samples_split=2):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.trees = []

    def fit(self, X, y):
        self.trees = []
        n_samples = len(X)
        for _ in range(self.n_estimators):
            indices = [random.randint(0, n_samples - 1) for _ in range(n_samples)]
            X_b = [X[i] for i in indices]
            y_b = [y[i] for i in indices]
            tree = DecisionTreeRegressor(self.max_depth, self.min_samples_split)
            tree.fit(X_b, y_b)
            self.trees.append(tree)
        return self

    def predict(self, X):
        predictions = [tree.predict(X) for tree in self.trees]
        n_samples = len(X)
        y_pred = []
        for i in range(n_samples):
            avg_val = sum(predictions[t][i] for t in range(self.n_estimators)) / self.n_estimators
            y_pred.append(avg_val)
        return y_pred

def is_inside_perimeter(lat: float, lon: float, perimeter: List[List[float]]) -> bool:
    inside = False
    for i in range(len(perimeter)):
        j = (i - 1) % len(perimeter)
        xi, yi = perimeter[i][0], perimeter[i][1]
        xj, yj = perimeter[j][0], perimeter[j][1]
        intersect = ((yi > lon) != (yj > lon)) and (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi)
        if intersect:
            inside = not inside
    return inside

def load_perimeter() -> List[List[float]]:
    geojson_path = "seraya_perimeter.geojson"
    if os.path.exists(geojson_path):
        try:
            with open(geojson_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            features = data.get("features", [])
            if features:
                coords = features[0]["geometry"]["coordinates"][0]
                return [[c[1], c[0]] for c in coords]
        except Exception as e:
            print(f"Error reading GeoJSON: {e}")
    # Fallback perimeter
    return [
        [4.5320, 117.5500], [4.5350, 117.5700], [4.5100, 117.6100],
        [4.4950, 117.6400], [4.4600, 117.6250], [4.4500, 117.5950],
        [4.4750, 117.5600], [4.4980, 117.5380]
    ]

def main():
    print("====================================================")
    print("  Palmnex 12-Feature RandomForest: 200 Sample Dataset")
    print("====================================================\n")

    perimeter = load_perimeter()
    
    # Generate 200 random points inside perimeter
    lats = [p[0] for p in perimeter]
    lons = [p[1] for p in perimeter]
    lat_min, lat_max = min(lats), max(lats)
    lon_min, lon_max = min(lons), max(lons)

    random.seed(42)
    sample_points = []
    while len(sample_points) < 200:
        lat = random.uniform(lat_min, lat_max)
        lon = random.uniform(lon_min, lon_max)
        if is_inside_perimeter(lat, lon, perimeter):
            sample_points.append((lat, lon))

    labels = ["Aug/2021", "Jul/2022", "Sep/2023", "Oct/2024", "Aug/2025"]
    training_data = []

    print(f"Synthesizing 200 training samples inside Seraya Estate boundary...")
    for idx, (lat, lon) in enumerate(sample_points):
        # Assign years round-robin
        label = labels[idx % len(labels)]
        base_bands = FALLBACK_BAND_DATA[label]
        
        # Spatial noise simulation seeded with coordinate
        seed_val = int(lat * 100000 + lon * 100000)
        random.seed(seed_val)
        
        # Jitter bands by ±16%
        bands = {}
        for b in base_bands:
            j = 1.0 + (random.random() - 0.5) * 0.16
            bands[b] = int(base_bands[b] * j)
            
        b02 = bands["B02"]
        b03 = bands["B03"]
        b04 = bands["B04"]
        b05 = bands["B05"]
        b08 = bands["B08"]
        b11 = bands["B11"]
        b12 = bands["B12"]
        
        r2 = b02 / 10000.0
        r3 = b03 / 10000.0
        r4 = b04 / 10000.0
        r5 = b05 / 10000.0
        r8 = b08 / 10000.0
        r11 = b11 / 10000.0
        r12 = b12 / 10000.0
        
        # Calculate indices
        ndvi = (r8 - r4) / (r8 + r4) if (r8 + r4) > 0 else 0.0
        ndre = (r8 - r5) / (r8 + r5) if (r8 + r5) > 0 else 0.0
        savi = ((r8 - r4) / (r8 + r4 + 0.5)) * 1.5 if (r8 + r4 + 0.5) > 0 else 0.0
        evi = 2.5 * ((r8 - r4) / (r8 + 6.0 * r4 - 7.5 * r2 + 1.0)) if (r8 + 6.0 * r4 - 7.5 * r2 + 1.0) != 0 else 0.0
        gndvi = (r8 - r3) / (r8 + r3) if (r8 + r3) > 0 else 0.0
        
        try:
            msavi = (2 * r8 + 1 - math.sqrt(max(0, (2 * r8 + 1)**2 - 8 * (r8 - r4)))) / 2
        except Exception:
            msavi = 0.0

        # Calculate N, P, K levels derived from NDVI proxy to simulate palm biology
        noise = (random.random() - 0.5) * 0.06
        n_val = 2.0 + ndvi * 0.85 + noise
        n_val = max(1.8, min(3.1, n_val))
        
        p_val = 0.11 + ndvi * 0.07 + (random.random() - 0.5) * 0.005
        p_val = max(0.10, min(0.23, p_val))
        
        k_val = 0.6 + ndvi * 0.55 + (random.random() - 0.5) * 0.04
        k_val = max(0.5, min(1.3, k_val))

        # Simulate Sentinel-1A Radar features (z1 to z9)
        # z1: sigma0-VH, z2: gamma0-VH, z3: beta0-VH
        # z4: sigma0-VV, z5: gamma0-VV, z6: beta0-VV
        # z7: LIA, z8: PLIA, z9: IAFE
        
        # S1 radar backscatter is correlated with crop biomass/leaf moisture (ndvi)
        z1 = 0.04 + ndvi * 0.03 + (random.random() - 0.5) * 0.008
        z2 = 0.05 + ndvi * 0.03 + (random.random() - 0.5) * 0.008
        z3 = 0.08 + ndvi * 0.05 + (random.random() - 0.5) * 0.012
        
        z4 = 0.15 + ndvi * 0.12 + (random.random() - 0.5) * 0.03
        z5 = 0.18 + ndvi * 0.15 + (random.random() - 0.5) * 0.04
        z6 = 0.30 + ndvi * 0.25 + (random.random() - 0.5) * 0.06
        
        # Incidence angles (mostly independent of crop status, representing local terrain)
        z7 = 25.0 + random.random() * 10.0
        z8 = 25.0 + random.random() * 10.0
        z9 = 28.0 + random.random() * 5.0

        training_data.append({
            "B02": b02, "B03": b03, "B04": b04, "B08": b08, "B11": b11, "B12": b12,
            "ndvi": ndvi, "ndre": ndre, "savi": savi, "evi": evi, "gndvi": gndvi, "msavi": msavi,
            "z1": z1, "z2": z2, "z3": z3, "z4": z4, "z5": z5, "z6": z6, "z7": z7, "z8": z8, "z9": z9,
            "N": n_val, "P": p_val, "K": k_val
        })

    # Prepare features
    X_S2 = [[
        d["B02"], d["B03"], d["B04"], d["B08"], d["B11"], d["B12"],
        d["ndvi"], d["ndre"], d["savi"], d["evi"], d["gndvi"], d["msavi"]
    ] for d in training_data]
    
    X_S1 = [[
        d["z1"], d["z2"], d["z3"], d["z4"], d["z5"], d["z6"], d["z7"], d["z8"], d["z9"]
    ] for d in training_data]
    
    y_N = [d["N"] for d in training_data]
    y_P = [d["P"] for d in training_data]
    y_K = [d["K"] for d in training_data]

    print(f"\nCollected {len(training_data)} spatially diverse samples successfully.")
    print("Fitting dual-satellite RandomForest Regressors (S2A and S1A)...")
    
    # Train S2 (Optical) models
    random.seed(42)
    rf_N_S2 = RandomForestRegressor(n_estimators=15, max_depth=4).fit(X_S2, y_N)
    rf_P_S2 = RandomForestRegressor(n_estimators=15, max_depth=4).fit(X_S2, y_P)
    rf_K_S2 = RandomForestRegressor(n_estimators=15, max_depth=4).fit(X_S2, y_K)

    # Train S1 (Radar) models
    random.seed(42)
    rf_N_S1 = RandomForestRegressor(n_estimators=15, max_depth=4).fit(X_S1, y_N)
    rf_P_S1 = RandomForestRegressor(n_estimators=15, max_depth=4).fit(X_S1, y_P)
    rf_K_S1 = RandomForestRegressor(n_estimators=15, max_depth=4).fit(X_S1, y_K)

    # Evaluate fits
    pred_N_S2 = rf_N_S2.predict(X_S2)
    pred_N_S1 = rf_N_S1.predict(X_S1)
    
    # Calculate Mean Squared Error (MSE)
    mse_N_S2 = sum((y_N[i] - pred_N_S2[i])**2 for i in range(len(y_N))) / len(y_N)
    mse_N_S1 = sum((y_N[i] - pred_N_S1[i])**2 for i in range(len(y_N))) / len(y_N)
    
    print(f"\nModel Fit Summary (MSE):")
    print(f"  Nitrogen (N) S2-Optical MSE: {mse_N_S2:.5f}")
    print(f"  Nitrogen (N) S1-Radar MSE: {mse_N_S1:.5f}")

    # Serialize
    def serialize_tree(node):
        if node.feature_idx is None:
            return {"value": node.value}
        return {
            "feature_idx": node.feature_idx,
            "threshold": node.threshold,
            "left": serialize_tree(node.left),
            "right": serialize_tree(node.right)
        }

    model_config = {
        "trees_N_S2": [serialize_tree(t) for t in rf_N_S2.trees],
        "trees_P_S2": [serialize_tree(t) for t in rf_P_S2.trees],
        "trees_K_S2": [serialize_tree(t) for t in rf_K_S2.trees],
        "trees_N_S1": [serialize_tree(t) for t in rf_N_S1.trees],
        "trees_P_S1": [serialize_tree(t) for t in rf_P_S1.trees],
        "trees_K_S1": [serialize_tree(t) for t in rf_K_S1.trees]
    }
    
    out_path = "smartpalm_model.json"
    with open(out_path, "w") as f:
        json.dump(model_config, f, indent=2)
    print(f"\nTrained dual-satellite Random Forest models exported to {out_path}")

if __name__ == "__main__":
    main()
