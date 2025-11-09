"""Trial script to exercise /api/upload and /api/analyze endpoints using the heart disease dataset.

Usage (PowerShell):
  # Activate your virtual environment first
  # Ensure backend is running (e.g., python d-bias/backend/app.py) or via run_dev.py script
  python -m tests.trial_upload_analyze \
    --backend http://localhost:5000 \
    --file d-bias/_data/sample_datasets/heart_disease_cleaned.csv \
    --run-gemini false \
    --return-plots json

This will:
  1. POST the file to /api/upload and print rows/columns/column list preview.
  2. POST the file to /api/analyze and print fairness score, reliability, and first few mapped biases.

Exits non-zero if a request fails.
"""
from __future__ import annotations
import argparse
import json
import sys
import pathlib
import textwrap
import time
from typing import Any, Dict

import requests

DEFAULT_HEART_PATH = pathlib.Path("d-bias/_data/sample_datasets/heart.csv")


def color(txt: str, code: str) -> str:
    return f"\033[{code}m{txt}\033[0m" if sys.stdout.isatty() else txt


def green(txt: str) -> str:
    return color(txt, "32")


def yellow(txt: str) -> str:
    return color(txt, "33")


def red(txt: str) -> str:
    return color(txt, "31")


def bold(txt: str) -> str:
    return color(txt, "1")


def pretty(obj: Any) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False)[:4000]


def post_file(url: str, file_path: pathlib.Path, extra_form: Dict[str, Any] | None = None) -> requests.Response:
    with file_path.open("rb") as f:
        files = {"file": (file_path.name, f, "text/csv")}
        data = extra_form or {}
        return requests.post(url, files=files, data=data, timeout=120)


def run_trial(args):
    heart_path = pathlib.Path(args.file)
    if not heart_path.exists():
        print(red(f"File not found: {heart_path}"))
        sys.exit(2)

    print(bold(f"Using dataset: {heart_path} ({heart_path.stat().st_size} bytes)"))

    upload_url = f"{args.backend.rstrip('/')}/api/upload"
    analyze_url = f"{args.backend.rstrip('/')}/api/analyze"

    # 1. Upload endpoint
    print(bold("\n[1] Calling /api/upload ..."))
    t0 = time.time()
    resp = post_file(upload_url, heart_path)
    dt = time.time() - t0
    print(f"Status: {resp.status_code} ({dt:.2f}s)")
    try:
        up_json = resp.json()
    except Exception:
        print(red("Failed to parse JSON from /api/upload"))
        print(resp.text[:500])
        sys.exit(1)

    if resp.status_code != 200:
        print(red("Upload failed:"), pretty(up_json))
        sys.exit(1)

    rows = up_json.get("rows")
    cols = up_json.get("cols")
    columns = up_json.get("columns", [])
    print(green(f"Upload OK: rows={rows} cols={cols}"))
    if columns:
        print("Columns (first 15):", ", ".join(columns[:15]) + (" ..." if len(columns) > 15 else ""))
    if up_json.get("preprocessing_warnings"):
        print(yellow("Warnings:"), up_json.get("preprocessing_warnings"))

    # 2. Analyze endpoint
    print(bold("\n[2] Calling /api/analyze ..."))
    form = {
        "run_gemini": str(args.run_gemini).lower(),
        "return_plots": args.return_plots,
    }
    t1 = time.time()
    resp2 = post_file(analyze_url, heart_path, form)
    dt2 = time.time() - t1
    print(f"Status: {resp2.status_code} ({dt2:.2f}s)")
    try:
        an_json = resp2.json()
    except Exception:
        print(red("Failed to parse JSON from /api/analyze"))
        print(resp2.text[:500])
        sys.exit(1)

    if resp2.status_code != 200:
        print(red("Analyze failed:"), pretty(an_json))
        sys.exit(1)

    fairness = an_json.get("fairness_score")
    reliability = an_json.get("reliability")
    mapped = (an_json.get("mapped_biases") or {}).get("bias_types", {})
    total_bias_entries = sum(len(v) for v in mapped.values()) if isinstance(mapped, dict) else 0

    print(green(f"Fairness Score: {fairness}"))
    if isinstance(reliability, dict):
        print(f"Reliability: {reliability.get('reliability_level')} - {reliability.get('message','')} ")
    print(f"Mapped bias groups: {len(mapped)} (total entries ~ {total_bias_entries})")

    # Show sample of mapped biases
    shown = 0
    for btype, arr in mapped.items():
        if shown >= 10:
            break
        if not isinstance(arr, list):
            continue
        for item in arr:
            print("-", btype, "::", item.get("feature"), "severity=", item.get("severity"))
            shown += 1
            if shown >= 5:
                break

    if args.show_full_json:
        print(bold("\nFull analyze JSON (truncated):"))
        print(pretty(an_json))

    print(green("\nTrial completed successfully."))


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Trial script for /api/upload and /api/analyze",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """Examples:\n  python -m tests.trial_upload_analyze --backend http://localhost:5000\n  python -m tests.trial_upload_analyze --file d-bias/_data/sample_datasets/heart_disease_cleaned.csv"""
        ),
    )
    p.add_argument("--backend", default="http://localhost:5000", help="Base backend URL (default: %(default)s)")
    p.add_argument("--file", default=str(DEFAULT_HEART_PATH), help="Path to dataset file (default: heart dataset)")
    p.add_argument("--run-gemini", dest="run_gemini", default=True, action="store_true", help="Request Gemini AI summary")
    p.add_argument("--return-plots", default="none", choices=["none", "json", "png", "both"], help="Plot return mode for analyze")
    p.add_argument("--show-full-json", action="store_true", help="Print truncated full JSON from analyze endpoint")
    return p.parse_args(argv)


if __name__ == "__main__":
    args = parse_args()
    run_trial(args)
