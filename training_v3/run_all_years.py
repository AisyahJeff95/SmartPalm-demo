#!/usr/bin/env python3
"""
run_all_years.py (training_v3)
------------------------------
Runs predict_nutrients.py for every estate x every year in one go, in parallel,
saving each result straight into training_v3/<year>/.

    python3 training_v3/run_all_years.py                 # 2019-2024, all 11 estates, 4 at a time
    python3 training_v3/run_all_years.py --workers 6     # faster on good internet
    python3 training_v3/run_all_years.py --years 2021 2023 --estates agathis ramin
    python3 training_v3/run_all_years.py --dry-run       # just list what would run

Features
  * Acquisition date = <year>-08-01 (change with --month-day).
  * Skips estate/year combinations that already have a finished result
    (a predictions_<estate>_* folder containing prediction_summary.json) in
    training_v3/<year>/, so you can simply re-run it after a Wi-Fi drop.
    Use --force to run everything again.
  * Failed runs are retried once (--retries) after the rest have finished.
  * One log file per run in training_v3/logs/<estate>_<year>.log.
  * Ctrl+C stops all running jobs cleanly.
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PREDICT = os.path.join(SCRIPT_DIR, "predict_nutrients.py")
MAP_DIR = os.path.join(SCRIPT_DIR, "map")
LOG_DIR = os.path.join(SCRIPT_DIR, "logs")

DEFAULT_ESTATES = ["binuang", "belian", "agathis", "gaharu", "kapur", "keruing",
                   "menggaris", "merbau", "ramin", "selanganbatu", "seraya"]
DEFAULT_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]

_running = set()
_lock = Lock()


def already_done(estate, label):
    """True if training_v3/<label>/ already holds a finished run for this estate."""
    year_dir = os.path.join(SCRIPT_DIR, str(label))
    if not os.path.isdir(year_dir):
        return False
    key = f"predictions_{estate.replace(' ', '_')}_".lower()
    for name in os.listdir(year_dir):
        path = os.path.join(year_dir, name)
        if key in name.lower() and os.path.isdir(path) and \
                os.path.isfile(os.path.join(path, "prediction_summary.json")):
            return True
    return False


def run_one(estate, label, date, attempt):
    shp = os.path.join(MAP_DIR, f"{estate}.shp")
    out = os.path.join(SCRIPT_DIR, str(label))
    os.makedirs(out, exist_ok=True)
    log_path = os.path.join(LOG_DIR, f"{estate}_{label}.log")
    cmd = [sys.executable, PREDICT, "--shp", shp, "--date", date, "--out", out]
    t0 = time.time()
    with open(log_path, "a" if attempt > 1 else "w", encoding="utf-8") as log:
        log.write(f"\n=== attempt {attempt}: {' '.join(cmd)}\n")
        log.flush()
        p = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, cwd=os.path.dirname(SCRIPT_DIR),
                             env={**os.environ, "PYTHONUNBUFFERED": "1"})
        with _lock:
            _running.add(p)
        try:
            rc = p.wait()
        finally:
            with _lock:
                _running.discard(p)
    return estate, label, date, rc, time.time() - t0, log_path


def run_batch(jobs, workers, attempt):
    failed = []
    total = len(jobs)
    ex = ThreadPoolExecutor(max_workers=workers)
    try:
        futs = [ex.submit(run_one, e, lbl, d, attempt) for e, lbl, d in jobs]
        for i, f in enumerate(as_completed(futs), 1):
            estate, label, date, rc, secs, log_path = f.result()
            ok = rc == 0
            print(f"  [{i:>2}/{total}] {'✓' if ok else '✗'} {estate:<13} {label}  "
                  f"({secs / 60:.1f} min){'' if ok else '  → see ' + os.path.relpath(log_path)}",
                  flush=True)
            if not ok:
                failed.append((estate, label, date))
    except BaseException:
        # Stop requested: drop queued jobs first, then stop the ones running.
        ex.shutdown(wait=False, cancel_futures=True)
        with _lock:
            for p in list(_running):
                p.terminate()
        raise
    ex.shutdown(wait=True)
    return failed


def main():
    ap = argparse.ArgumentParser(description="Run predict_nutrients.py for all estates and years.")
    ap.add_argument("--years", type=int, nargs="+", default=DEFAULT_YEARS)
    ap.add_argument("--estates", nargs="+", default=DEFAULT_ESTATES)
    ap.add_argument("--month-day", default="08-01", help="MM-DD used for every year (default 08-01)")
    ap.add_argument("--dates", nargs="+", default=None,
                    help="Full dates instead of --years, e.g. 2025-12-01 2026-01-01. "
                         "Each is saved in training_v3/<YYYY-MM>/")
    ap.add_argument("--workers", type=int, default=4, help="Runs at the same time (default 4)")
    ap.add_argument("--retries", type=int, default=1, help="Extra attempts for failed runs (default 1)")
    ap.add_argument("--force", action="store_true", help="Re-run even if a finished result exists")
    ap.add_argument("--dry-run", action="store_true", help="Only print the plan")
    args = ap.parse_args()

    missing = [e for e in args.estates if not os.path.isfile(os.path.join(MAP_DIR, f"{e}.shp"))]
    if missing:
        sys.exit(f"❌ Shapefile not found in {MAP_DIR}: {', '.join(missing)}")

    # periods = [(output folder label, acquisition date)]
    if args.dates:
        periods = [(d[:7], d) for d in args.dates]
        out_desc = "training_v3/<YYYY-MM>/"
    else:
        periods = [(str(y), f"{y}-{args.month_day}") for y in args.years]
        out_desc = "training_v3/<year>/"

    jobs, skipped = [], []
    for lbl, d in periods:
        for e in args.estates:
            (skipped if (not args.force and already_done(e, lbl)) else jobs).append((e, lbl, d))

    print("=" * 70)
    print(f"🌴 Batch nutrient prediction: {len(args.estates)} estates × {len(periods)} dates")
    print(f"   Dates   : {', '.join(d for _, d in periods)}")
    print(f"   To run  : {len(jobs)}    Already done (skipped): {len(skipped)}")
    print(f"   Workers : {args.workers}    Output: {out_desc}    Logs: training_v3/logs/")
    print("=" * 70)
    if skipped:
        print("Skipped:", ", ".join(f"{e} {l}" for e, l, _ in skipped))
    if args.dry_run or not jobs:
        for e, l, d in jobs:
            print(f"  would run: {e} {d} → training_v3/{l}/")
        return 0

    os.makedirs(LOG_DIR, exist_ok=True)
    def _on_term(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, _on_term)
    start = time.time()
    try:
        failed = run_batch(jobs, args.workers, attempt=1)
        for r in range(args.retries):
            if not failed:
                break
            print(f"\n↻ Retrying {len(failed)} failed run(s) in 30 s (attempt {r + 2})…", flush=True)
            time.sleep(30)
            failed = run_batch(failed, args.workers, attempt=r + 2)
    except KeyboardInterrupt:
        print("\n⛔ Stopping — terminating running jobs…")
        with _lock:
            for p in list(_running):
                p.terminate()
        return 130

    print("\n" + "=" * 70)
    print(f"Finished in {(time.time() - start) / 60:.1f} min — "
          f"{len(jobs) - len(failed)} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed:", ", ".join(f"{e} {l}" for e, l, _ in failed))
        print("Just run this script again (with stable Wi-Fi) — finished runs are skipped.")
        print("Note: a failed run may leave an incomplete predictions_* folder in the output folder.")
    print("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
