#!/usr/bin/env python3
"""
make_outer_boundaries.py (training_v3)
--------------------------------------
For every estate shapefile in training_v3/map/*.shp, merge all block polygons
and keep ONLY the outer boundary (no internal block lines, no holes/gaps).

Output: training_v3/map/outer_boundary/<estate>.shp (+ .shx .dbf .prj)
        One polygon per estate; attributes ESTATE, AREA_HA, BLOCKS.

    python3 training_v3/make_outer_boundaries.py

Re-running overwrites the outputs. Source files are never modified.
"""

import glob
import os
import sys

import shapefile
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_DIR = os.path.join(SCRIPT_DIR, "map")
OUT_DIR = os.path.join(MAP_DIR, "outer_boundary")

# Timbalai 1948 / RSO Borneo (m) — EPSG:29873, same CRS assumed by predict_nutrients.py
import pyproj
PRJ_WKT = pyproj.CRS.from_epsg(29873).to_wkt("WKT1_ESRI")


def holes(g):
    polys = [g] if isinstance(g, Polygon) else list(g.geoms)
    return sum(len(p.interiors) for p in polys)


def outer_boundary(blocks):
    """Merge blocks and return (outer polygon(s), merged geometry)."""
    merged = unary_union(blocks).buffer(0)
    polys = [merged] if isinstance(merged, Polygon) else list(merged.geoms)
    outers = [Polygon(p.exterior) for p in polys]
    # If a separate part lies inside another part's outline, it is inner -> drop it.
    keep = [o for i, o in enumerate(outers)
            if not any(j != i and outers[j].contains(o) for j in range(len(outers)))]
    out = keep[0] if len(keep) == 1 else MultiPolygon(keep)
    return out, merged


def write_shp(path_noext, geom, estate, n_blocks):
    polys = [geom] if isinstance(geom, Polygon) else list(geom.geoms)
    # Shapefile convention: outer rings clockwise (orient sign=-1.0)
    parts = [list(orient(p, sign=-1.0).exterior.coords) for p in polys]
    with shapefile.Writer(path_noext, shapeType=shapefile.POLYGON) as w:
        w.field("ESTATE", "C", size=40)
        w.field("AREA_HA", "N", size=14, decimal=2)
        w.field("BLOCKS", "N", size=6, decimal=0)
        w.poly(parts)
        w.record(estate, round(geom.area / 1e4, 2), n_blocks)
    with open(path_noext + ".prj", "w") as f:
        f.write(PRJ_WKT)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(MAP_DIR, "*.shp")))
    if not files:
        sys.exit(f"No shapefiles found in {MAP_DIR}")

    print(f"{'Estate':<14}{'Blocks':>7}{'Gaps removed':>14}{'Blocks ha':>12}{'Outer ha':>11}{'Parts':>7}")
    print("-" * 65)
    ok = True
    for p in files:
        estate = os.path.splitext(os.path.basename(p))[0]
        with open(p, "rb") as fh:
            sf = shapefile.Reader(shp=fh)
            blocks = [shape(s.__geo_interface__).buffer(0) for s in sf.shapes() if len(s.points) >= 3]
        blocks = [b for b in blocks if not b.is_empty]
        outer, merged = outer_boundary(blocks)

        # Checks
        n_parts = 1 if isinstance(outer, Polygon) else len(outer.geoms)
        inside = all(outer.buffer(0.01).contains(b) for b in blocks)
        good = outer.is_valid and holes(outer) == 0 and inside
        ok &= good

        write_shp(os.path.join(OUT_DIR, estate), outer, estate, len(blocks))
        print(f"{estate:<14}{len(blocks):>7}{holes(merged):>14}{merged.area / 1e4:>12.1f}"
              f"{outer.area / 1e4:>11.1f}{n_parts:>7}{'' if good else '   ⚠ CHECK'}")

    print("-" * 65)
    print(f"✓ Wrote {len(files)} outer boundaries → {os.path.relpath(OUT_DIR)}" if ok
          else "⚠ Some estates failed a check (see ⚠ above).")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
