import requests
import json
import base64
import os
import importlib.util
import sys
import traceback

# Resolve a unified output directory under d-bias/_data/program_generated_files
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(HERE, ".."))
DBIAS_DIR = os.path.join(ROOT_DIR, "d-bias")
OUT_DIR = os.path.join(DBIAS_DIR, "_data", "program_generated_files")
os.makedirs(OUT_DIR, exist_ok=True)

# Endpoint of your Flask backend
url = "http://127.0.0.1:5000/api/analyze"

# Your dataset path (change if needed)
file_path = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\sample_datasets\heart_disease_cleaned.csv"


# Where to cache analysis results so we don't re-run the backend repeatedly
CACHE_PATH = os.path.join(OUT_DIR, "analysis_response.json")


def get_plots(data):
    plots = data.get("plots")
    if plots:
        print("\n--- Plots returned by backend ---")
        out_dir = OUT_DIR
        os.makedirs(out_dir, exist_ok=True)
        for key, payload in plots.items():
            if payload is None:
                print(f"{key}: no plot available")
                continue

            # Save PNG if present
            png_b64 = None
            if isinstance(payload, dict):
                png_b64 = payload.get("png_base64") or (payload.get("plotly", {}).get("png_base64") if isinstance(payload.get("plotly"), dict) else None)

            if png_b64:
                try:
                    img_bytes = base64.b64decode(png_b64)
                    png_path = os.path.join(out_dir, f"{key}.png")
                    with open(png_path, "wb") as imgf:
                        imgf.write(img_bytes)
                    print(f"Saved PNG: {png_path}")
                except Exception as e:
                    print(f"Failed to write PNG for {key}: {e}")

            # Save Plotly JSON as an HTML file for interactive viewing
            plotly_dict = None
            if isinstance(payload, dict) and payload.get("plotly"):
                plotly_dict = payload.get("plotly")

            if plotly_dict:
                try:
                    html_path = os.path.join(out_dir, f"{key}.html")
                    # simple html wrapper embedding plotly.js and the figure JSON
                    with open(html_path, "w", encoding="utf-8") as hf:
                        hf.write("<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<script src=\"https://cdn.plot.ly/plotly-latest.min.js\"></script>\n</head>\n<body>\n<div id=\"plot\" style=\"width:100%;height:100%\"></div>\n<script>\nconst fig = ")
                        json.dump(plotly_dict, hf)
                        hf.write(";\nPlotly.newPlot('plot', fig.data, fig.layout || {});\n</script>\n</body>\n</html>")
                    print(f"Saved interactive HTML: {html_path}")
                except Exception as e:
                    print(f"Failed to write HTML for {key}: {e}")


def analyze_and_save(url: str, file_path: str, out_path: str, run_gemini: bool = True, return_plots: str = "both") -> dict:
    """POST the dataset to the backend, save JSON response to out_path and return it.

    This avoids re-running the analysis when you already have a saved response.
    """
    print("📤 Sending dataset to backend...")
    with open(file_path, "rb") as f:
        response = requests.post(
            url,
            files={"file": f},
            data={"run_gemini": "true" if run_gemini else "false", "return_plots": return_plots},
            timeout=120,
        )

    if response.status_code != 200:
        # surface helpful error
        try:
            body = response.json()
        except Exception:
            body = response.text
        raise RuntimeError(f"Analysis failed ({response.status_code}): {body}")

    data = response.json()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as wf:
        json.dump(data, wf, ensure_ascii=False, indent=2)
    print(f"Saved analysis to: {out_path}")
    return data

def load_saved(out_path: str) -> dict:
    with open(out_path, "r", encoding="utf-8") as rf:
        return json.load(rf)


# Load cached response if available, otherwise run analysis and save
if os.path.exists(CACHE_PATH):
    print(f"🔁 Loading cached analysis from {CACHE_PATH}")
    data = load_saved(CACHE_PATH)
else:
    data = analyze_and_save(url, file_path, CACHE_PATH)

# Display the results (same output as before)
print("\n✅ Bias Analysis Complete!")
print(f"Fairness Score: {data.get('fairness_score')}")

print("\n--- Bias Report ---")
print((data.get("bias_report") if data.get("bias_report") is not None else "No bias_report returned by backend."))

print("\n--- Dataset Summary ---")
print(data.get("dataset_summary", "No summary available."))
print("\n--- Reliability ---")
print(data.get("reliability", "No reliability info available."))

print("\n--- Gemini Summary ---")
print(data.get("summary", "No AI summary generated."))

# Display mapped biases (if backend produced them)
mapped = data.get("mapped_biases") or {}
print("\n--- MAPPED BIASES ---")
print(mapped)
mapped_err = data.get("mapped_biases_error")
if mapped_err:
    print("\n--- Mapping Error ---")
    print(mapped_err)

# print overall
overall = (mapped or {}).get("overall", {}) or {}
if overall:
    print("\n--- MAPPED OVERALL ---")
    print("Assessment:\n", overall.get("assessment") or "(none)")
    print("\nFairness:\n", overall.get("fairness") or "(none)")
    print("\nConclusion:\n", overall.get("conclusion") or "(none)")
    # actionable_recommendations may be a list (preferred) or raw string
    ar = overall.get("actionable_recommendations") or overall.get("actionable_recommendations_raw")
    if isinstance(ar, list):
        print("\nActionable Recommendations:")
        for i, item in enumerate(ar, start=1):
            print(f"{i}. {item}")
    else:
        print("\nActionable Recommendations:\n", ar or "(none)")

print(get_plots(data))


def generate_pdf_from_response(data: dict, out_pdf_path: str = None) -> str:
    """
    Convenience wrapper for tests: dynamically import the backend visualization module
    and call its `generate_pdf_report` function with the analysis response.

    Returns path to the written PDF.
    """
    vis_path = os.path.join(DBIAS_DIR, "backend", "visualization.py")
    if not os.path.exists(vis_path):
        raise FileNotFoundError(f"visualization.py not found at expected path: {vis_path}")

    spec = importlib.util.spec_from_file_location("db_backend_visualization", vis_path)
    vis = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vis)

    if not hasattr(vis, "generate_pdf_report"):
        raise RuntimeError("visualization.generate_pdf_report not found. Please update backend/visualization.py")

    out_dir = OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    if out_pdf_path is None:
        out_pdf_path = os.path.join(out_dir, "dbias_report.pdf")

    pdf_path = vis.generate_pdf_report(data, out_pdf_path)
    print(f"Generated PDF report: {pdf_path}")
    return pdf_path


# Optionally generate a PDF when this script is invoked directly
try:
    _ = generate_pdf_from_response(data)
except Exception as e:
    print(f"PDF generation skipped or failed: {e!r}")
    print("\n--- PDF Error Traceback ---")
    print(traceback.format_exc())

