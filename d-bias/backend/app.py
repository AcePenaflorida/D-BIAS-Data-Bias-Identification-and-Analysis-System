# backend/app.py
from flask import Flask, request, jsonify, make_response
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import os
from datetime import timedelta

# CORS support
try:
    from flask_cors import CORS
except ImportError:
    CORS = None

# local modules
from bias_detector import BiasDetector, MLBiasOptimizer, BiasReporter
from gemini_connector import GeminiConnector
from bias_mapper import map_biases
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

@app.route("/")
def index():
    return jsonify({"message": "D-BIAS backend running"}), 200

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
    """
    Accepts multipart/form-data with key 'file' (CSV).
    Optional form data:
      - excluded: comma-separated columns to exclude
      - run_gemini: 'true' to request AI summary (if GEMINI_API_KEY present)
    """
    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400

    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "no selected file"}), 400

    excluded = request.form.get("excluded", os.getenv("EXCLUDED_COLUMNS", "id,timestamp"))
    excluded_cols = [c.strip() for c in excluded.split(",") if c.strip()]

    try:
        df, prep_warnings = load_and_preprocess(f)
    except Exception as e:
        return jsonify({"error": f"could not read/convert uploaded file: {e}"}), 400

    # Build optimizer and detector
    try:
        optimizer = MLBiasOptimizer(df.drop(columns=[c for c in excluded_cols if c in df.columns], errors="ignore"))
    except Exception:
        optimizer = MLBiasOptimizer(df)  # fallback

    detector = BiasDetector(df, exclude_columns=excluded_cols, optimizer=optimizer)
    bias_report = detector.generate_bias_report()

    reporter = BiasReporter(df, bias_report)
    fairness_score = reporter.fairness_score()

    summary_text = None
    run_gemini = request.form.get("run_gemini", "false").lower() == "true"
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if run_gemini and gemini_key:
        try:
            gemini = GeminiConnector(gemini_key)
            summary_text = gemini.summarize_biases(bias_report, dataset_name=f.filename, shape=df.shape, excluded_columns=excluded_cols)
        except Exception as e:
            summary_text = f"Gemini summary failed: {e}"

    # Optional: generate visualizations and return them when requested.
    # Accepted values for return_plots: 'json' (plotly dict), 'png' (base64 PNG), 'both'
    return_plots = request.form.get("return_plots", request.args.get("return_plots", "none")).lower()
    plots_payload = None
    if return_plots in ("json", "png", "both"):
        try:
            figs = visualize_fairness_dashboard(bias_report, df)
            plots_payload = {}
            for i, fig in enumerate(figs, start=1):
                key = f"fig{i}"
                if fig is None:
                    plots_payload[key] = None
                    continue
                # always include plotly dict/json
                if return_plots in ("json", "both"):
                    try:
                        plots_payload[key] = {"plotly": fig.to_dict()}
                    except Exception:
                        plots_payload[key] = {"plotly": None}

                # include PNG if requested and kaleido available
                if return_plots in ("png", "both"):
                    try:
                        import base64
                        img_bytes = fig.to_image(format="png")
                        plots_payload.setdefault(key, {})["png_base64"] = base64.b64encode(img_bytes).decode("utf-8")
                    except Exception:
                        # PNG export failed (kaleido maybe missing); record error
                        plots_payload.setdefault(key, {})["png_base64"] = None
        except Exception as e:
            # If visualization generation fails, include an error note but continue returning other results
            plots_payload = {"error": str(e)}

    # also return visualizations as JSON-ready (not images) - we return nothing heavy here; frontends should call visualization module directly if needed
    # Compute lightweight numeric summary for frontend display
    try:
        num_df = df.select_dtypes(include=[np.number])
        rows, cols = df.shape
        if num_df.shape[1] > 0:
            means = num_df.mean(numeric_only=True)
            medians = num_df.median(numeric_only=True)
            variances = num_df.var(numeric_only=True)
            stds = num_df.std(numeric_only=True)
            # representative aggregation across numeric columns
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
            numeric_summary = {
                "rows": int(rows),
                "columns": int(cols),
                "mean": 0.0,
                "median": 0.0,
                "mode": 0.0,
                "max": 0.0,
                "min": 0.0,
                "std_dev": 0.0,
                "variance": 0.0,
            }
    except Exception:
        numeric_summary = {
            "rows": int(df.shape[0]),
            "columns": int(df.shape[1]),
            "mean": 0.0,
            "median": 0.0,
            "mode": 0.0,
            "max": 0.0,
            "min": 0.0,
            "std_dev": 0.0,
            "variance": 0.0,
        }

    response = {
        "bias_report": bias_report,
        "fairness_score": fairness_score,
        "summary": summary_text,
        "dataset_summary": reporter.summary(),
        "numeric_summary": numeric_summary,
        "reliability": reporter.reliability()
    }
    # Map AI explanations to each bias entry (returns grouped structure). If no AI summary
    # was generated, map_biases will still return a structure (ai_explanation may be None).
    try:
        # Use Gemini summary when available; otherwise fall back to reporter.summary()
        ai_text_for_mapping = summary_text if summary_text else reporter.summary()
        mapped = map_biases(bias_report, ai_text_for_mapping)
        response["mapped_biases"] = mapped
    except Exception as e:
        # don't fail the whole endpoint if mapping errors; include an error note
        response["mapped_biases_error"] = str(e)
    if plots_payload is not None:
        response["plots"] = plots_payload

    return jsonify(make_json_serializable(response)), 200


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
    app.run(host="0.0.0.0", port=port, debug=True)
