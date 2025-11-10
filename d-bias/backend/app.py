# backend/app.py
from flask import Flask, request, jsonify, make_response
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import os
import time
import traceback
import uuid as _uuid
import json
from datetime import timedelta

# CORS support
try:
    from flask_cors import CORS
except ImportError:
    CORS = None

# local modules
from bias_detector import BiasDetector, MLBiasOptimizer, BiasReporter
from gemini_connector import GeminiConnector
from bias_mapper import map_biases, generate_bias_mapping
from visualization import visualize_fairness_dashboard
from preprocessing import load_and_preprocess, validate_dataset

# load .env
load_dotenv()
print("GEMINI_API_KEY:", os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)

# Allow slightly larger uploads and set JSON config if needed
app.config.setdefault("MAX_CONTENT_LENGTH", 50 * 1024 * 1024)  # 50MB safeguard
app.config.setdefault("JSONIFY_PRETTYPRINT_REGULAR", False)

# Initialize CORS if library available
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
if CORS:
    # In dev, allow any localhost origin to avoid port mismatch issues (5173/5174/etc.)
    # For production, set FRONTEND_ORIGIN explicitly and tighten this.
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
else:
    print("[WARN] flask-cors not installed; cross-origin requests from frontend may fail. Install with 'pip install flask-cors'.")


def make_json_serializable(obj):
    """Recursively convert numpy / pandas types to native Python types for JSON.

    - numpy.ndarray -> list
    - numpy.generic -> Python scalar via .item()
    - pandas.Timestamp -> ISO string
    - pandas.Series/DataFrame -> lists/dicts
    - bytes -> utf-8 decoded string
    - fallback: str(obj)
    """
    # primitive types
    if obj is None or isinstance(obj, (str, bool, int, float)):
        return obj

    # numpy types
    if isinstance(obj, np.ndarray):
        return make_json_serializable(obj.tolist())
    if isinstance(obj, np.generic):
        try:
            return obj.item()
        except Exception:
            return str(obj)

    # pandas types
    try:
        import pandas as _pd
        if isinstance(obj, _pd.Timestamp):
            return obj.isoformat()
        if isinstance(obj, _pd.Series):
            return make_json_serializable(obj.tolist())
        if isinstance(obj, _pd.DataFrame):
            return make_json_serializable(obj.to_dict(orient="records"))
    except Exception:
        pass

    # dict / list / tuple
    if isinstance(obj, dict):
        return {str(k): make_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [make_json_serializable(v) for v in obj]

    if isinstance(obj, bytes):
        try:
            return obj.decode("utf-8")
        except Exception:
            return str(obj)

    # last resort
    try:
        # some objects may be serializable directly
        import json
        json.dumps(obj)
        return obj
    except Exception:
        return str(obj)


# ------------------------
# Cached analysis helpers
# ------------------------
def get_cache_dir() -> str:
    """Return the directory where cached analysis JSON lives.

    By default, resolves to `<repo>/d-bias/_data/program_generated_files` to
    match tests/test_backend.py. Can be overridden with ANALYSIS_CACHE_DIR or
    ANALYSIS_CACHE_PATH for a specific file.
    """
    # Allow explicit override of a single file
    cache_path = os.getenv("ANALYSIS_CACHE_PATH")
    if cache_path:
        return os.path.dirname(os.path.abspath(cache_path))

    here = os.path.dirname(os.path.abspath(__file__))
    dbias_dir = os.path.abspath(os.path.join(here, ".."))
    return os.path.join(dbias_dir, "_data", "program_generated_files")


def get_cache_file() -> str:
    """Return the default cache JSON file path (analysis_response.json)."""
    # Allow explicit override of full path
    cache_path = os.getenv("ANALYSIS_CACHE_PATH")
    if cache_path:
        return os.path.abspath(cache_path)
    return os.path.join(get_cache_dir(), "analysis_response.json")

@app.route("/")
def index():
    return jsonify({"message": "D-BIAS backend running"}), 200


@app.route("/api/analysis/latest", methods=["GET"])
def latest_analysis():
    """Serve the most recently generated analysis JSON from disk.

    Looks for analysis_response.json in the cache directory. If not found,
    returns 404. The content is returned as JSON after ensuring it is
    JSON-serializable for frontend consumption.
    """
    path = get_cache_file()
    if not os.path.exists(path):
        return jsonify({"error": f"cached analysis not found at {path}"}), 404

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return jsonify({"error": f"failed to read cached analysis: {e}"}), 500

    return jsonify(make_json_serializable(data)), 200

@app.route("/api/upload", methods=["POST"])
def upload():
    """
    Accepts multipart/form-data with key 'file' (CSV).
    Returns basic dataset info: rows, columns, sample columns list.
    """
    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400

    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "no selected file"}), 400

    try:
        df, prep_warnings = load_and_preprocess(f)
    except Exception as e:
        return jsonify({"error": f"could not read/convert uploaded file: {e}"}), 400

    # run minimal sanity validation; reject if errors
    validation_errors = validate_dataset(df)
    if validation_errors:
        return jsonify({
            "error": "dataset failed minimal sanity checks",
            "reasons": validation_errors,
            "preprocessing_warnings": prep_warnings
        }), 400

    # run minimal sanity validation; reject if errors
    validation_errors = validate_dataset(df)
    if validation_errors:
        return jsonify({
            "error": "dataset failed minimal sanity checks",
            "reasons": validation_errors,
            "preprocessing_warnings": prep_warnings
        }), 400

    upload_resp = {
        "rows": int(df.shape[0]),
        "cols": int(df.shape[1]),
        "columns": list(df.columns),
        "preprocessing_warnings": prep_warnings
    }
    return jsonify(make_json_serializable(upload_resp)), 200

@app.route("/api/analyze", methods=["POST"])
def analyze():
    """Robust analysis endpoint with diagnostic logging & failure shielding.

    Form-data:
      file: CSV file (required)
      excluded: optional comma list
      run_gemini: 'true' to enable Gemini summary (requires GEMINI_API_KEY)
      return_plots: 'json' | 'png' | 'both' | 'none'
    """
    req_id = str(_uuid.uuid4())[:8]
    t0 = time.time()
    def log(msg: str):
        print(f"[analyze {req_id}] {msg}")

    # Quick availability guard
    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "no selected file"}), 400

    excluded = request.form.get("excluded", os.getenv("EXCLUDED_COLUMNS", "id,timestamp"))
    excluded_cols = [c.strip() for c in excluded.split(",") if c.strip()]
    return_plots = request.form.get("return_plots", request.args.get("return_plots", "none")).lower()
    run_gemini_flag = request.form.get("run_gemini", "false").lower() == "true"
    enable_plots = return_plots in ("json", "png", "both")
    log(f"start file={f.filename} excluded={excluded_cols} plots={return_plots} gemini={run_gemini_flag}")

    try:
        # Preprocess
        df, prep_warnings = load_and_preprocess(f)
        log(f"loaded dataframe shape={df.shape} warnings={len(prep_warnings) if prep_warnings else 0}")

        # Optimizer & detector
        try:
            optimizer = MLBiasOptimizer(df.drop(columns=[c for c in excluded_cols if c in df.columns], errors="ignore"))
        except Exception:
            optimizer = MLBiasOptimizer(df)
        detector = BiasDetector(df, exclude_columns=excluded_cols, optimizer=optimizer)
        bias_report = detector.generate_bias_report()


        log(f"bias_report entries={len(bias_report) if isinstance(bias_report, list) else 'n/a'}")

        reporter = BiasReporter(df, bias_report)
        fairness_score = reporter.fairness_score()

        ai_output = None
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if run_gemini_flag and gemini_key:
            try:
                gemini = GeminiConnector(gemini_key)
                ai_output = gemini.summarize_biases(bias_report, dataset_name=f.filename, shape=df.shape, excluded_columns=excluded_cols)
            except Exception as eg:
                ai_output = f"Gemini summary failed: {eg}"
                log(f"gemini_error={eg}")

        # Plots (optional & shielded)
        plots_payload = None
        if enable_plots:
            try:
                figs = visualize_fairness_dashboard(bias_report, df)
                plots_payload = {}
                for i, fig in enumerate(figs, start=1):
                    key = f"fig{i}"
                    if fig is None:
                        plots_payload[key] = None
                        continue
                    if return_plots in ("json", "both"):
                        try:
                            plots_payload[key] = {"plotly": fig.to_dict()}
                        except Exception:
                            plots_payload[key] = {"plotly": None}
                    if return_plots in ("png", "both"):
                        try:
                            import base64
                            img_bytes = fig.to_image(format="png")
                            plots_payload.setdefault(key, {})["png_base64"] = base64.b64encode(img_bytes).decode("utf-8")
                        except Exception as ep:
                            plots_payload.setdefault(key, {})["png_base64"] = None
                            log(f"plot_png_error key={key} err={ep}")
            except Exception as ev:
                plots_payload = {"error": str(ev)}
                log(f"visualization_block_error={ev}")

        # Numeric summary
        try:
            num_df = df.select_dtypes(include=[np.number])
            rows, cols = df.shape
            if num_df.shape[1] > 0:
                means = num_df.mean(numeric_only=True)
                medians = num_df.median(numeric_only=True)
                variances = num_df.var(numeric_only=True)
                stds = num_df.std(numeric_only=True)
                numeric_summary = {
                    "rows": int(rows),
                    "columns": int(cols),
                    "mean": float(np.nanmean(means.values)) if len(means) else 0.0,
                    "median": float(np.nanmedian(medians.values)) if len(medians) else 0.0,
                    "mode": float(num_df.mode(dropna=True).iloc[0].mean()) if not num_df.mode(dropna=True).empty else 0.0,
                    "max": float(np.nanmax(num_df.max(numeric_only=True).values)) if len(num_df.columns) else 0.0,
                    "min": float(np.nanmin(num_df.min(numeric_only=True).values)) if len(num_df.columns) else 0.0,
                    "std_dev": float(np.nanmean(stds.values)) if len(stds) else 0.0,
                    "variance": float(np.nanmean(variances.values)) if len(variances) else 0.0,
                }
            else:
                numeric_summary = {"rows": int(rows), "columns": int(cols), "mean": 0.0, "median": 0.0, "mode": 0.0, "max": 0.0, "min": 0.0, "std_dev": 0.0, "variance": 0.0}
        except Exception:
            numeric_summary = {"rows": int(df.shape[0]), "columns": int(df.shape[1]), "mean": 0.0, "median": 0.0, "mode": 0.0, "max": 0.0, "min": 0.0, "std_dev": 0.0, "variance": 0.0}

        response = {
            "bias_report": bias_report,
            "fairness_score": fairness_score,
            "summary": ai_output,
            "dataset_summary": reporter.summary(),
            "numeric_summary": numeric_summary,
            "reliability": reporter.reliability(),
            "preprocessing_warnings": prep_warnings,
        }
        try:
            ai_text_for_mapping = ai_output if ai_output else reporter.summary()
            # mapped = map_biases(bias_report, ai_text_for_mapping)
            mapped = generate_bias_mapping(bias_report, ai_text_for_mapping)
            print(mapped)
            response["mapped_biases"] = mapped
        except Exception as em:
            response["mapped_biases_error"] = str(em)
            log(f"generate_bias_mapping_error={em}")
        if plots_payload is not None:
            response["plots"] = plots_payload

        log(f"success elapsed={round(time.time()-t0,2)}s")
        return jsonify(make_json_serializable(response)), 200
    except Exception as e:
        log(f"fatal_error={e}\n{traceback.format_exc()}")
        return jsonify({
            "error": "internal server error",
            "detail": str(e),
            "trace": traceback.format_exc(),
            "request_id": req_id
        }), 500


@app.route("/api/plot/<fig_id>.png", methods=["POST"])
def plot_png(fig_id: str):
    """Return a single plot as PNG (fig1, fig2, fig3).

    Expects multipart/form-data with key 'file' (CSV/Excel). Performs preprocessing and validation
    before generating the visualization. Returns 400 if validation fails.
    """
    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400

    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "no selected file"}), 400

    try:
        df, prep_warnings = load_and_preprocess(f)
    except Exception as e:
        return jsonify({"error": f"could not read/convert uploaded file: {e}"}), 400

    validation_errors = validate_dataset(df)
    if validation_errors:
        return jsonify({
            "error": "dataset failed minimal sanity checks",
            "reasons": validation_errors,
            "preprocessing_warnings": prep_warnings
        }), 400

    # Build bias report
    excluded = request.form.get("excluded", os.getenv("EXCLUDED_COLUMNS", "id,timestamp"))
    excluded_cols = [c.strip() for c in excluded.split(",") if c.strip()]
    try:
        optimizer = MLBiasOptimizer(df.drop(columns=[c for c in excluded_cols if c in df.columns], errors="ignore"))
    except Exception:
        optimizer = MLBiasOptimizer(df)

    detector = BiasDetector(df, exclude_columns=excluded_cols, optimizer=optimizer)
    bias_report = detector.generate_bias_report()

    figs = visualize_fairness_dashboard(bias_report, df)
    mapping = {"fig1": 0, "fig2": 1, "fig3": 2}
    idx = mapping.get(fig_id.lower())
    if idx is None:
        return jsonify({"error": "invalid fig id; use fig1, fig2 or fig3"}), 400

    try:
        fig = figs[idx]
    except Exception:
        return jsonify({"error": "requested figure not available"}), 404

    if fig is None:
        return jsonify({"error": "requested figure is empty"}), 404

    try:
        img_bytes = fig.to_image(format="png")
    except Exception as e:
        return jsonify({"error": f"could not render image: {e}"}), 500

    resp = make_response(img_bytes)
    resp.headers.set("Content-Type", "image/png")
    resp.headers.set("Content-Disposition", f"inline; filename={fig_id}.png")
    return resp

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    # Disable the reloader & debug for stability during automated tests to avoid connection resets.
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode, use_reloader=False)
