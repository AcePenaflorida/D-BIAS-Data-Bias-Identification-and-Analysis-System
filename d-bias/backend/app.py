# backend/app.py
from flask import Flask, request, jsonify
import pandas as pd
from dotenv import load_dotenv
import os

# local modules
from bias_detector import BiasDetector, MLBiasOptimizer, BiasReporter
from gemini_connector import GeminiConnector
from visualization import visualize_fairness_dashboard

# load .env
load_dotenv()
print("GEMINI_API_KEY:", os.getenv("GEMINI_API_KEY"))

app = Flask(__name__)

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
        df = pd.read_csv(f)
    except Exception as e:
        return jsonify({"error": f"could not read CSV: {e}"}), 400

    return jsonify({
        "rows": int(df.shape[0]),
        "cols": int(df.shape[1]),
        "columns": list(df.columns)
    }), 200

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
        df = pd.read_csv(f)
    except Exception as e:
        return jsonify({"error": f"could not read CSV: {e}"}), 400

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

    # also return visualizations as JSON-ready (not images) - we return nothing heavy here; frontends should call visualization module directly if needed
    return jsonify({
        "bias_report": bias_report,
        "fairness_score": fairness_score,
        "summary": summary_text
    }), 200

@app.route("/api/test", methods=["GET"])
def test_local_file():
    """Quick test route that analyzes your local dataset file"""
    test_path = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\heart_disease_cleaned.csv"
    if not os.path.exists(test_path):
        return jsonify({"error": "File not found at " + test_path}), 404

    df = pd.read_csv(test_path)
    excluded = os.getenv("EXCLUDED_COLUMNS", "id,timestamp").split(",")

    optimizer = MLBiasOptimizer(df.drop(columns=[c for c in excluded if c in df.columns], errors="ignore"))
    detector = BiasDetector(df, exclude_columns=excluded, optimizer=optimizer)
    bias_report = detector.generate_bias_report()
    reporter = BiasReporter(df, bias_report)
    fairness_score = reporter.fairness_score()

    gemini = GeminiConnector(os.getenv("GEMINI_API_KEY"))
    summary = gemini.summarize_biases(bias_report, "heart_disease_cleaned.csv", df.shape, excluded)

    return jsonify({
        "fairness_score": fairness_score,
        "bias_report": bias_report,
        "summary": summary
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
