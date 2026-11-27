#!/usr/bin/env python3
"""
fetch_training_bands.py
-----------------------
Fetches genuine cloud-free Sentinel-2 L2A (12 bands) and Sentinel-1 RTC (6 SAR metrics)
from Microsoft Planetary Computer STAC API for any rows in v1_training_data.csv that
have blank satellite band columns.

Matches the exact band order, scaling, and SAR calibration used by
1. Preprocessing_cloud/fetch_sentinel_data.py and training_v3/RFR_train.py.
"""

import os
import sys
import re
import json
import math
import time
import urllib.request
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import transform, transform_bounds
from rasterio.windows import from_bounds, Window

STAC_API_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SAS_TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token"

S2_BAND_MAP = {
    "Band12": "B12",
    "Band11": "B11",
    "Band9":  "B09",
    "Band8A": "B8A",
    "Band8":  "B08",
    "Band7":  "B07",
    "Band6":  "B06",
    "Band5":  "B05",
    "Band4":  "B04",
    "Band3":  "B03",
    "Band2":  "B02",
    "Band1":  "B01",
}

S1_BAND_COLS = [
    "Sigma0_VV", "Sigma0_VH",
    "Gamma0_VV", "Gamma0_VH",
    "Beta0_VV",  "Beta0_VH",
]

ALL_BAND_COLS = list(S2_BAND_MAP.keys()) + S1_BAND_COLS

INC_RAD = math.radians(38.5)
COS_INC = math.cos(INC_RAD)
TAN_INC = math.tan(INC_RAD)


def get_sas_token(collection: str) -> str:
    url = f"{SAS_TOKEN_URL}/{collection}"
    req = urllib.request.Request(url, headers={"User-Agent": "SmartPalm-TrainingFetcher/1.1"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8")).get("token", "")
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    return ""


def sign_url(url: str, token: str) -> str:
    if not token:
        return url
    return f"{url}&{token}" if "?" in url else f"{url}?{token}"


def request_stac(payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "SmartPalm-TrainingFetcher/1.1"}
    req = urllib.request.Request(STAC_API_URL, data=data, headers=headers, method="POST")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    return {}


def date_to_window(date_str: str):
    """Map dataset Date string to (group_key, start_iso, end_iso, target_mid_dt)."""
    s = str(date_str).strip()
    if re.fullmatch(r"\d{4}", s):
        yr = int(s)
        return (f"YEAR_{yr}", f"{yr}-01-01", f"{yr}-12-31", datetime(yr, 7, 1))

    m = re.match(r"^([A-Za-z]+)\s*\d*\s*,?\s*(\d{4})$", s)
    if m:
        mon_txt = m.group(1)[:3].title()
        yr = int(m.group(2))
        mon_num = datetime.strptime(mon_txt, "%b").month
        start_m = mon_num - 1
        start_y = yr
        if start_m < 1:
            start_m = 12
            start_y -= 1
        end_m = mon_num + 1
        end_y = yr
        if end_m > 12:
            end_m = 1
            end_y += 1
        end_day = 28 if end_m == 2 else (30 if end_m in (4, 6, 9, 11) else 31)
        return (
            f"MON_{yr}_{mon_num:02d}",
            f"{start_y}-{start_m:02d}-01",
            f"{end_y}-{end_m:02d}-{end_day:02d}",
            datetime(yr, mon_num, 15),
        )

    raise ValueError(f"Unrecognized date format: {s!r}")


def read_window_for_points(asset_url: str, lons: np.ndarray, lats: np.ndarray, pad_deg: float = 0.002):
    """Read only the minimal COG window covering the given points, with retry on transient HTTP errors."""
    bbox = [
        float(lons.min()) - pad_deg,
        float(lats.min()) - pad_deg,
        float(lons.max()) + pad_deg,
        float(lats.max()) + pad_deg,
    ]
    env_opts = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.tiff",
        "GDAL_HTTP_CONNECTTIMEOUT": "15",
        "GDAL_HTTP_TIMEOUT": "40",
        "GDAL_HTTP_MAX_RETRY": "2",
        "GDAL_HTTP_RETRY_DELAY": "2",
    }
    last_err = None
    for attempt in range(3):
        try:
            with rasterio.Env(**env_opts):
                with rasterio.open(asset_url) as src:
                    minx, miny, maxx, maxy = transform_bounds("EPSG:4326", src.crs, *bbox)
                    win = from_bounds(minx, miny, maxx, maxy, src.transform)
                    full_win = Window(0, 0, src.width, src.height)
                    try:
                        win = win.intersection(full_win)
                    except Exception:
                        return np.full(len(lons), np.nan, dtype=np.float32)
                    if win.width <= 0 or win.height <= 0:
                        return np.full(len(lons), np.nan, dtype=np.float32)
                    win = win.round_offsets().round_lengths()
                    win = win.intersection(full_win)
                    if win.width <= 0 or win.height <= 0:
                        return np.full(len(lons), np.nan, dtype=np.float32)
                    data = src.read(1, window=win)
                    win_tf = rasterio.windows.transform(win, src.transform)
                    xs, ys = transform("EPSG:4326", src.crs, lons.tolist(), lats.tolist())
                    rows, cols = rasterio.transform.rowcol(win_tf, xs, ys)
                    rows = np.asarray(rows)
                    cols = np.asarray(cols)
                    valid = (rows >= 0) & (rows < data.shape[0]) & (cols >= 0) & (cols < data.shape[1])
                    out = np.full(len(lons), np.nan, dtype=np.float32)
                    if np.any(valid):
                        out[valid] = data[rows[valid], cols[valid]].astype(np.float32)
                    return out
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise last_err


def deduplicate_s2_scenes(scenes: list) -> list:
    """Keep only the latest processing baseline for each unique (date, mgrs_tile) acquisition."""
    best = {}
    for sc in scenes:
        props = sc.get("properties", {})
        dt = props.get("datetime", "")[:10]
        tile = props.get("s2:mgrs_tile", sc["id"])
        try:
            pb = float(props.get("s2:processing_baseline", "0"))
        except Exception:
            pb = 0.0
        key = (dt, tile)
        if key not in best or pb > best[key][0]:
            best[key] = (pb, sc)
    deduped = [v[1] for v in best.values()]
    deduped.sort(key=lambda s: float(s.get("properties", {}).get("eo:cloud_cover", 100.0)))
    return deduped


def fetch_s2_for_group(lons: np.ndarray, lats: np.ndarray, start_iso: str, end_iso: str, token: str):
    """Multi-temporal SCL cloud-free Sentinel-2 L2A composite for exact coordinates."""
    n = len(lons)
    band_keys = list(S2_BAND_MAP.keys())
    out = np.full((n, len(band_keys)), np.nan, dtype=np.float32)
    filled = np.zeros(n, dtype=bool)

    bbox = [
        float(lons.min()) - 0.005,
        float(lats.min()) - 0.005,
        float(lons.max()) + 0.005,
        float(lats.max()) + 0.005,
    ]

    # Query scenes with cloud cover < 90%, deduplicate reprocessed copies
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": f"{start_iso}T00:00:00Z/{end_iso}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": 90.0}},
        "limit": 100,
    }
    res = request_stac(payload)
    scenes = deduplicate_s2_scenes(res.get("features", []))
    print(f"    [S2] {len(scenes)} unique scenes ({start_iso}..{end_iso}, cloud<90%)")

    # Pass 1: strict clear SCL {4=Vegetation, 5=Bare Soil, 6=Water} across all scenes
    # Pass 2 (only for stubborn non-cloud terrain-shadow pixels): also accept {2=Dark Area, 7=Unclassified}
    stages = [
        ("strict", (4, 5, 6), scenes),
        ("terrain-fallback", (2, 4, 5, 6, 7), scenes),
    ]

    for stage_name, allowed_scl, stage_scenes in stages:
        if np.all(filled):
            break
        if stage_name != "strict":
            print(f"    [S2] Running {stage_name} pass for {int(np.sum(~filled))} remaining points...")

        for sc in stage_scenes:
            if np.all(filled):
                break
            scl_asset = sc.get("assets", {}).get("SCL")
            if not scl_asset:
                continue

            rem_idx = np.where(~filled)[0]
            rem_lons = lons[rem_idx]
            rem_lats = lats[rem_idx]

            try:
                scl_vals = read_window_for_points(sign_url(scl_asset["href"], token), rem_lons, rem_lats)
            except Exception as e:
                print(f"      ! SCL skip {sc['id']}: {e}")
                continue

            clear_local = np.isin(scl_vals, allowed_scl)
            if not np.any(clear_local):
                continue

            hit_idx = rem_idx[clear_local]
            hit_lons = lons[hit_idx]
            hit_lats = lats[hit_idx]

            pb_str = str(sc.get("properties", {}).get("s2:processing_baseline", "04.00"))
            try:
                pb_val = float(pb_str)
            except Exception:
                pb_val = 4.0
            dn_offset = 1000.0 if pb_val < 4.0 else 0.0

            s2_assets = sc["assets"]

            def _read_band(args):
                b_i, b_asset = args
                if b_asset not in s2_assets:
                    return b_i, None
                vals = read_window_for_points(sign_url(s2_assets[b_asset]["href"], token), hit_lons, hit_lats)
                return b_i, vals

            tasks = [(i, S2_BAND_MAP[k]) for i, k in enumerate(band_keys)]
            band_block = np.full((len(hit_idx), len(band_keys)), np.nan, dtype=np.float32)
            try:
                with ThreadPoolExecutor(max_workers=4) as pool:
                    for b_i, vals in pool.map(_read_band, tasks):
                        if vals is not None:
                            band_block[:, b_i] = vals
            except Exception as e:
                print(f"      ! Band read skip {sc['id']}: {e}")
                continue

            good_local = np.all(np.isfinite(band_block) & (band_block > 0), axis=1)
            if not np.any(good_local):
                continue

            good_global = hit_idx[good_local]
            refl = np.round((band_block[good_local] + dn_offset) / 10000.0, 6)
            out[good_global] = refl
            filled[good_global] = True

            dt_str = sc["properties"]["datetime"][:10]
            cc = sc["properties"].get("eo:cloud_cover", -1)
            print(
                f"      + {sc['id']} ({dt_str}, PB {pb_str}, cc={cc:.1f}%): "
                f"+{len(good_global)} pts -> {int(np.sum(filled))}/{n}",
                flush=True,
            )

    return out, filled


def fetch_s1_for_group(lons: np.ndarray, lats: np.ndarray, start_iso: str, end_iso: str, target_dt: datetime, token: str):
    """Sentinel-1 RTC (VV/VH -> Sigma0, Gamma0, Beta0) composite for exact coordinates."""
    n = len(lons)
    out = np.full((n, len(S1_BAND_COLS)), np.nan, dtype=np.float32)
    filled = np.zeros(n, dtype=bool)

    bbox = [
        float(lons.min()) - 0.005,
        float(lats.min()) - 0.005,
        float(lons.max()) + 0.005,
        float(lats.max()) + 0.005,
    ]

    payload = {
        "collections": ["sentinel-1-rtc"],
        "bbox": bbox,
        "datetime": f"{start_iso}T00:00:00Z/{end_iso}T23:59:59Z",
        "limit": 50,
    }
    res = request_stac(payload)
    scenes = res.get("features", [])
    scenes.sort(
        key=lambda s: abs((datetime.strptime(s["properties"]["datetime"][:10], "%Y-%m-%d") - target_dt).total_seconds())
    )
    print(f"    [S1] Found {len(scenes)} RTC scenes ({start_iso}..{end_iso})", flush=True)

    for sc in scenes:
        if np.all(filled):
            break
        assets = sc.get("assets", {})
        if "vv" not in assets or "vh" not in assets:
            continue

        rem_idx = np.where(~filled)[0]
        rem_lons = lons[rem_idx]
        rem_lats = lats[rem_idx]

        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                f_vv = pool.submit(read_window_for_points, sign_url(assets["vv"]["href"], token), rem_lons, rem_lats)
                f_vh = pool.submit(read_window_for_points, sign_url(assets["vh"]["href"], token), rem_lons, rem_lats)
                vv = f_vv.result()
                vh = f_vh.result()
        except Exception as e:
            print(f"      ! S1 skip {sc['id']}: {e}", flush=True)
            continue

        good_local = np.isfinite(vv) & np.isfinite(vh) & (vv > 0) & (vh > 0)
        if not np.any(good_local):
            continue

        good_global = rem_idx[good_local]
        g_vv = vv[good_local]
        g_vh = vh[good_local]

        out[good_global, 0] = np.round(g_vv * COS_INC, 6)
        out[good_global, 1] = np.round(g_vh * COS_INC, 6)
        out[good_global, 2] = np.round(g_vv, 6)
        out[good_global, 3] = np.round(g_vh, 6)
        out[good_global, 4] = np.round(g_vv / TAN_INC, 6)
        out[good_global, 5] = np.round(g_vh / TAN_INC, 6)
        filled[good_global] = True

        dt_str = sc["properties"]["datetime"][:10]
        print(f"      + {sc['id']} ({dt_str}): +{len(good_global)} pts -> {int(np.sum(filled))}/{n}", flush=True)

    return out, filled


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, "v1_training_data.csv")
    print(f"Loading {csv_path}...", flush=True)
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)
    print(f"Total rows: {len(df)}", flush=True)

    missing_mask = df[ALL_BAND_COLS].apply(lambda col: col.str.strip() == "").any(axis=1)
    todo_idx = df.index[missing_mask].tolist()
    print(f"Rows needing Sentinel-2/Sentinel-1 fetch: {len(todo_idx)}", flush=True)
    if not todo_idx:
        print("All rows already have satellite bands populated!")
        return

    groups = {}
    for idx in todo_idx:
        key, start_iso, end_iso, target_dt = date_to_window(df.at[idx, "Date"])
        groups.setdefault((key, start_iso, end_iso, target_dt), []).append(idx)

    print(f"Grouped into {len(groups)} temporal windows:", flush=True)
    for (key, s_iso, e_iso, _), idxs in sorted(groups.items()):
        print(f"  - {key:12s} ({s_iso} .. {e_iso}): {len(idxs)} rows", flush=True)

    s2_token = get_sas_token("sentinel-2-l2a")
    s1_token = get_sas_token("sentinel-1-rtc")
    token_time = time.time()

    s2_cols = list(S2_BAND_MAP.keys())

    for (key, start_iso, end_iso, target_dt), idxs in sorted(groups.items()):
        if time.time() - token_time > 1200:
            s2_token = get_sas_token("sentinel-2-l2a")
            s1_token = get_sas_token("sentinel-1-rtc")
            token_time = time.time()

        print(f"\n=== Processing {key} ({start_iso} .. {end_iso}) | {len(idxs)} points ===", flush=True)
        lons = df.loc[idxs, "Longitude"].astype(float).values
        lats = df.loc[idxs, "Lattitude"].astype(float).values

        # 1. Sentinel-2
        s2_missing_local = df.loc[idxs, s2_cols].apply(lambda c: c.str.strip() == "").any(axis=1).values
        if np.any(s2_missing_local):
            sub_idx = np.array(idxs)[s2_missing_local]
            s2_vals, s2_ok = fetch_s2_for_group(lons[s2_missing_local], lats[s2_missing_local], start_iso, end_iso, s2_token)
            if not np.all(s2_ok) and key.startswith("MON_"):
                yr = target_dt.year
                rem = np.where(~s2_ok)[0]
                print(f"    [S2] Widening window to full year {yr} for {len(rem)} remaining pts...", flush=True)
                s2_vals2, s2_ok2 = fetch_s2_for_group(
                    lons[s2_missing_local][rem], lats[s2_missing_local][rem], f"{yr}-01-01", f"{yr}-12-31", s2_token
                )
                s2_vals[rem[s2_ok2]] = s2_vals2[s2_ok2]
                s2_ok[rem[s2_ok2]] = True

            for local_i, row_i in enumerate(sub_idx):
                if s2_ok[local_i]:
                    for c_i, col in enumerate(s2_cols):
                        df.at[row_i, col] = f"{s2_vals[local_i, c_i]:.6f}".rstrip("0").rstrip(".")
            df.to_csv(csv_path, index=False)

        # 2. Sentinel-1
        s1_missing_local = df.loc[idxs, S1_BAND_COLS].apply(lambda c: c.str.strip() == "").any(axis=1).values
        if np.any(s1_missing_local):
            sub_idx = np.array(idxs)[s1_missing_local]
            s1_vals, s1_ok = fetch_s1_for_group(lons[s1_missing_local], lats[s1_missing_local], start_iso, end_iso, target_dt, s1_token)
            if not np.all(s1_ok) and key.startswith("MON_"):
                yr = target_dt.year
                rem = np.where(~s1_ok)[0]
                print(f"    [S1] Widening window to full year {yr} for {len(rem)} remaining pts...", flush=True)
                s1_vals2, s1_ok2 = fetch_s1_for_group(
                    lons[s1_missing_local][rem], lats[s1_missing_local][rem], f"{yr}-01-01", f"{yr}-12-31", target_dt, s1_token
                )
                s1_vals[rem[s1_ok2]] = s1_vals2[s1_ok2]
                s1_ok[rem[s1_ok2]] = True

            for local_i, row_i in enumerate(sub_idx):
                if s1_ok[local_i]:
                    for c_i, col in enumerate(S1_BAND_COLS):
                        df.at[row_i, col] = f"{s1_vals[local_i, c_i]:.6f}".rstrip("0").rstrip(".")
            df.to_csv(csv_path, index=False)

        still_missing = int(df[ALL_BAND_COLS].apply(lambda col: col.str.strip() == "").any(axis=1).sum())
        print(f"  [Saved checkpoint] Remaining unfilled rows across entire CSV: {still_missing}", flush=True)

    final_missing = int(df[ALL_BAND_COLS].apply(lambda col: col.str.strip() == "").any(axis=1).sum())
    print("\n=================================================================", flush=True)
    print(f"DONE! Total rows: {len(df)} | Populated: {len(df) - final_missing} | Still missing: {final_missing}", flush=True)
    print("=================================================================", flush=True)


if __name__ == "__main__":
    main()
