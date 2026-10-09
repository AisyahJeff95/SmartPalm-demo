#!/usr/bin/env python3
"""
build_kpsm_home_data.py
-----------------------
Builds js/kpsm_home_data.js for the KPSM Home page (kpsm-home.html).

  * Reads  "SPOC MPOB.xlsx"  (ZON · NEGERI · NAMA SPOC · BILANGAN SPOC)
  * Reads  Malaysia state (ADM1) boundaries from data/malaysia_adm1.geojson
    (downloaded once from geoBoundaries gbOpen MYS ADM1, CC-BY 4.0, if missing)
  * Simplifies the state shapes into a light, illustration-style SVG
    (Borneo is shifted west so both halves of Malaysia fit nicely side by side)

Usage:
    python3 development/build_kpsm_home_data.py

Re-run whenever SPOC MPOB.xlsx is updated.
"""

import json
import math
import os
import sys
import urllib.request
from collections import OrderedDict

import openpyxl
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

BASE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(BASE, "SPOC MPOB.xlsx")
GEOJSON = os.path.join(BASE, "data", "malaysia_adm1.geojson")
OUT_JS = os.path.join(BASE, "js", "kpsm_home_data.js")
GEO_URL = ("https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/"
           "releaseData/gbOpen/MYS/ADM1/geoBoundaries-MYS-ADM1_simplified.geojson")

# ── Zone palette (soft, illustration-friendly) ───────────────────────────────
ZONE_COLORS = OrderedDict([
    ("ZON UTARA",     "#6cc5a0"),
    ("ZON TENGAH",    "#f5bd6a"),
    ("ZON TIMUR",     "#7fb2ee"),
    ("ZON SELATAN 1", "#f39aa6"),
    ("ZON SELATAN 2", "#d9707f"),
    ("ZON SABAH 1",   "#b49ce8"),
    ("ZON SABAH 2",   "#8a6fd3"),
    ("ZON SARAWAK 1", "#86d3d3"),
    ("ZON SARAWAK 2", "#3fadb3"),
])

# Map geoBoundaries names → Excel NEGERI names
NAME_FIX = {
    "PENANG": "PULAU PINANG",
    "PULAU PINANG": "PULAU PINANG",
    "MALACCA": "MELAKA",
    "MELAKA": "MELAKA",
    "NEGERI SEMBILAN": "NEGERI SEMBILAN",
    "NEGRI SEMBILAN": "NEGERI SEMBILAN",
    "KUALA LUMPUR": "KUALA LUMPUR",
    "WILAYAH PERSEKUTUAN KUALA LUMPUR": "KUALA LUMPUR",
    "FEDERAL TERRITORY OF KUALA LUMPUR": "KUALA LUMPUR",
    "PUTRAJAYA": "PUTRAJAYA",
    "WILAYAH PERSEKUTUAN PUTRAJAYA": "PUTRAJAYA",
    "LABUAN": "LABUAN",
    "WILAYAH PERSEKUTUAN LABUAN": "LABUAN",
}

BORNEO = {"SABAH", "SARAWAK", "LABUAN"}
BORNEO_SHIFT = -3.4      # degrees of longitude (illustrative compaction)
LAT_REF = math.radians(4.0)
SCALE = 62.0             # px per degree
LON0, LAT_TOP = 97.6, 7.75

# Label bubble anchor positions (lon, lat — before Borneo shift)
LABEL_POS = {
    "KEDAH":           (98.35, 6.55),
    "PULAU PINANG":    (98.35, 5.45),
    "PERAK":           (98.35, 4.35),
    "SELANGOR":        (98.95, 3.05),
    "NEGERI SEMBILAN": (99.75, 1.95),
    "MELAKA":          (100.85, 1.05),
    "JOHOR":           (104.95, 1.35),
    "PAHANG":          (104.55, 3.35),
    "TERENGGANU":      (104.35, 4.95),
    "KELANTAN":        (101.25, 7.25),
    "SARAWAK":         (110.9, 4.15),
    "SABAH":           (114.6, 7.05),
}


def norm_name(n):
    u = n.upper().strip()
    return NAME_FIX.get(u, u)


def project(lon, lat, state):
    if state in BORNEO:
        lon += BORNEO_SHIFT
    x = (lon - LON0) * SCALE * math.cos(LAT_REF)
    y = (LAT_TOP - lat) * SCALE
    return x, y


def ring_to_path(coords, state):
    pts = [project(x, y, state) for x, y in coords]
    if len(pts) < 3:
        return ""
    s = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
    return s


def geom_to_path(g, state):
    polys = [g] if isinstance(g, Polygon) else list(g.geoms)
    parts = []
    for p in polys:
        parts.append(ring_to_path(p.exterior.coords, state))
        for hole in p.interiors:
            parts.append(ring_to_path(hole.coords, state))
    return "".join(parts)


def load_geojson():
    """Return the ADM1 GeoJSON, or None if it is missing and cannot be downloaded."""
    if not os.path.isfile(GEOJSON):
        print(f"Downloading state boundaries → {GEOJSON}")
        try:
            req = urllib.request.Request(GEO_URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            json.loads(data)  # make sure it is real GeoJSON, not a Wi-Fi login page
        except Exception as e:
            print(f"WARNING: could not download state boundaries ({e}).")
            print("         Building SPOC data only — the map will appear after re-running")
            print("         this script with internet access (or with the GeoJSON in data/).")
            return None
        os.makedirs(os.path.dirname(GEOJSON), exist_ok=True)
        with open(GEOJSON, "wb") as f:
            f.write(data)
    with open(GEOJSON, "r", encoding="utf-8") as f:
        return json.load(f)


def load_spoc():
    ws = openpyxl.load_workbook(XLSX, data_only=True).worksheets[0]
    rows = []
    for r in ws.iter_rows(values_only=True):
        if not r or not r[0] or not str(r[0]).upper().startswith("ZON "):
            continue
        zone, state, name, count = (str(r[0]).strip().upper(), str(r[1]).strip().upper(),
                                    str(r[2]).strip(), r[3])
        try:
            count = int(count)
        except (TypeError, ValueError):
            count = 0
        rows.append({"zone": zone, "state": state, "name": name, "count": count})
    return rows


def main():
    spoc = load_spoc()
    gj = load_geojson()

    # Group geometries per (normalised) state
    groups = {}
    for feat in (gj or {}).get("features", []):
        props = feat.get("properties", {})
        nm = props.get("shapeName") or props.get("name") or props.get("NAME_1") or ""
        st = norm_name(nm)
        groups.setdefault(st, []).append(shape(feat["geometry"]))

    states = OrderedDict()
    for st, geoms in sorted(groups.items()):
        g = unary_union(geoms).buffer(0)
        g = g.simplify(0.012, preserve_topology=True)
        polys = [g] if isinstance(g, Polygon) else list(g.geoms)
        big = max(p.area for p in polys)
        # keep the main shapes + reasonably sized islands (Penang, Langkawi, Labuan…)
        keep = [p for p in polys if p.area >= max(0.004, big * 0.004) or st in ("LABUAN", "PULAU PINANG", "PUTRAJAYA")]
        if not keep:
            keep = polys
        g2 = MultiPolygon(keep) if len(keep) > 1 else keep[0]
        rp = max(keep, key=lambda p: p.area).representative_point()
        cx, cy = project(rp.x, rp.y, st)
        entry = {"path": geom_to_path(g2, st), "cx": round(cx, 1), "cy": round(cy, 1)}
        if st in LABEL_POS:
            lx, ly = project(*LABEL_POS[st], st)
            entry["lx"], entry["ly"] = round(lx, 1), round(ly, 1)
        states[st] = entry

    # Canvas size
    xs, ys = [], []
    for st, e in states.items():
        for tok in e["path"].replace("M", " ").replace("L", " ").replace("Z", " ").split():
            x, y = tok.split(",")
            xs.append(float(x)); ys.append(float(y))
        if "lx" in e:
            xs += [e["lx"] - 70, e["lx"] + 70]; ys += [e["ly"] - 26, e["ly"] + 26]
    if xs:
        W, H = math.ceil(max(xs) + 16), math.ceil(max(ys) + 16)
        minx, miny = math.floor(min(xs) - 16), math.floor(min(ys) - 16)
    else:  # no boundaries available yet
        W, H, minx, miny = 900, 200, 0, 0

    missing = sorted({r["state"] for r in spoc} - set(states))
    if missing:
        print("WARNING: states in Excel without geometry:", missing)
    print("Geometry states:", list(states))

    payload = {
        "source": "SPOC MPOB.xlsx",
        "zoneColors": ZONE_COLORS,
        "viewBox": f"{minx} {miny} {W - minx} {H - miny}",
        "states": states,
        "spoc": spoc,
    }
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// Auto-generated by build_kpsm_home_data.py — do not edit by hand.\n")
        f.write("// Boundaries: geoBoundaries gbOpen MYS ADM1 (CC BY 4.0), simplified for illustration.\n")
        f.write("window.KPSM_HOME_DATA = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";\n")
    total = sum(r["count"] for r in spoc)
    print(f"✓ {OUT_JS}  ({os.path.getsize(OUT_JS)//1024} KB) — {len(spoc)} SPOC, total {total:,}")


if __name__ == "__main__":
    sys.exit(main())
