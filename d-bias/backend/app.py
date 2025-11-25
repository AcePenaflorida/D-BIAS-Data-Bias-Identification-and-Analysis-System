# backend/app.py
from flask import Flask, request, jsonify, make_response
import pandas as pd
import numpy as np
from dotenv import load_dotenv
import re
import os
import time
import traceback
import threading
import random
import hashlib
import io
import tempfile
 
import json
from datetime import timedelta

# CORS support
try:
    from flask_cors import CORS
except ImportError:
    CORS = None

# local modules
from bias_detector import BiasDetector, MLBiasOptimizer, BiasReporter
from gemini_connector import GeminiConnector, GeminiKeyManager
from bias_mapper import generate_bias_mapping
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

# ------------------------
# Small helpers for readability
# ------------------------
_GEMINI_COOLDOWN_UNTIL = 0.0  # epoch seconds until which we should skip Gemini calls

# Concurrency and pacing controls for Gemini
_GEMINI_MAX_CONCURRENCY = max(1, int(os.getenv("GEMINI_MAX_CONCURRENCY", "1")))
_GEMINI_SEM = threading.Semaphore(_GEMINI_MAX_CONCURRENCY)
_GEMINI_MIN_INTERVAL_SEC = max(0.0, float(os.getenv("GEMINI_MIN_INTERVAL_MS", "1500")) / 1000.0)
_GEMINI_DISABLE_WAIT = os.getenv("GEMINI_DISABLE_WAIT", "false").lower() == "true"
_last_gemini_call_at = 0.0
_last_gemini_lock = threading.Lock()

# In-memory cache for identical prompts to avoid re-calling Gemini unnecessarily
_GEMINI_CACHE: dict[str, str] = {}

def _parse_retry_after_seconds_from_error_text(text: str) -> int | None:
    """Best-effort parse of retry delay seconds from Gemini error text.

    Looks for patterns like:
      - "retry_delay {\n  seconds: 19\n}"
      - "Please retry in 8.87s"
    Returns an integer number of seconds or None if not found.
    """
    if not text:
        return None
    # retry_delay { seconds: N }
    m = re.search(r"retry_delay\s*\{[^}]*seconds\s*:\s*(\d+)", text, re.IGNORECASE | re.DOTALL)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass
    # Please retry in Xs
    m = re.search(r"Please\s+retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", text, re.IGNORECASE)
    if m:
        try:
            secs = float(m.group(1))
            return max(1, int(round(secs)))
        except Exception:
            pass
    return None


def _set_gemini_cooldown(seconds: int, log):
    """Set a global cooldown until now + seconds to avoid repeated 429s."""
    global _GEMINI_COOLDOWN_UNTIL
    try:
        sec = max(1, int(seconds))
    except Exception:
        sec = 15
    _GEMINI_COOLDOWN_UNTIL = time.time() + sec
    if log:
        log(f"gemini_cooldown_set seconds={sec}")


def get_gemini_cooldown_remaining() -> int:
    """Return remaining cooldown in whole seconds (0 if none)."""
    remaining = int(max(0.0, _GEMINI_COOLDOWN_UNTIL - time.time()))
    return remaining


def _enforce_min_interval():
    """Ensure at least GEMINI_MIN_INTERVAL_MS elapses between Gemini calls."""
    if _GEMINI_DISABLE_WAIT or _GEMINI_MIN_INTERVAL_SEC <= 0:
        return
    global _last_gemini_call_at
    with _last_gemini_lock:
        now = time.time()
        wait = (_last_gemini_call_at + _GEMINI_MIN_INTERVAL_SEC) - now
        if wait > 0:
            time.sleep(wait)
        _last_gemini_call_at = time.time()


def _prompt_cache_key(bias_report, dataset_name: str, shape, excluded_columns):
    try:
        payload = json.dumps({
            "dataset": dataset_name,
            "shape": shape,
            "excluded": excluded_columns,
            "bias_report": bias_report,
        }, sort_keys=True, default=str)
    except Exception:
        payload = f"{dataset_name}|{shape}|{excluded_columns}|{str(bias_report)[:200000]}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def handle_gemini_error(err: Exception, log) -> str:
    """Record cooldown for 429/rate-limit errors and return a user-friendly message.

    - Parses retry-after seconds from the error text if possible.
    - Sets a short fallback cooldown if parsing fails.
    - Returns the original error text for transparency, prefixed to indicate rate limit where applicable.
    """
    msg = str(err)
    lowered = msg.lower()
    # Detect quota/429 errors broadly
    if "429" in lowered or "quota" in lowered or "rate limit" in lowered or "rate-limit" in lowered:
        secs = _parse_retry_after_seconds_from_error_text(msg)
        if secs is None:
            # conservative default
            secs = 20
        _set_gemini_cooldown(secs, log)
        if log:
            log(f"gemini_rate_limited retry_after={secs}s")
        return f"Gemini temporarily rate-limited; skipping for ~{secs}s. Original error: {msg}"
    # Non-rate-limit error: return as-is
    return f"Gemini summary failed: {msg}"

def maybe_run_gemini_summary(run_gemini: bool, gemini_key: str, bias_report, dataset_name: str, shape, excluded_columns, log):
    """Optionally run Gemini with retries, pacing and caching. Returns ai_output (or None).

    Behavior:
    - Respects global cooldown if already set.
    - Uses a global semaphore to limit parallel calls.
    - Enforces a minimum interval between successive calls.
    - Retries on rate-limit with server-advised delay + jitter.
    - Caches successful outputs keyed by prompt payload.
    """
    ai_output = None
    if not (run_gemini and gemini_key):
        return ai_output

    # Honor active cooldown to avoid immediate 429s
    remaining = get_gemini_cooldown_remaining()
    if remaining > 0 and not _GEMINI_DISABLE_WAIT:
        if log:
            log(f"gemini_wait_cooldown {remaining}s before retry")
        time.sleep(remaining)

    # Cache lookup
    try:
        cache_key = _prompt_cache_key(bias_report, dataset_name, shape, excluded_columns)
        cached = _GEMINI_CACHE.get(cache_key)
        if cached:
            if log:
                log("gemini_cache_hit true")
            return cached
    except Exception:
        cache_key = None

    max_retries = max(0, int(os.getenv("GEMINI_MAX_RETRIES", "2")))
    attempt = 0
    while attempt <= max_retries:
        attempt += 1
        try:
            # Concurrency control + pacing
            with _GEMINI_SEM:
                _enforce_min_interval()
                gemini = GeminiConnector(gemini_key)
                ai_output = gemini.summarize_biases(
                    bias_report,
                    dataset_name=dataset_name,
                    shape=shape,
                    excluded_columns=excluded_columns,
                )
            # Check for textual rate-limit signals
            if isinstance(ai_output, str):
                lower = ai_output.lower()
                if ("429" in lower) or ("quota" in lower) or ("rate limit" in lower) or ("rate-limit" in lower):
                    secs = _parse_retry_after_seconds_from_error_text(ai_output) or 20
                    _set_gemini_cooldown(secs, log)
                    if attempt <= max_retries and not _GEMINI_DISABLE_WAIT:
                        jitter = random.uniform(0.2, 0.4) * secs
                        if log:
                            log(f"gemini_rate_limited (text) retry_after={secs}s attempt={attempt}/{max_retries} jitter={int(jitter)}s")
                        time.sleep(secs + jitter)
                        continue
                    if log:
                        log(f"gemini_rate_limited (text) retry_after={secs}s no-more-retries")
            # Success path: cache and return
            if cache_key and isinstance(ai_output, str) and ai_output and not ai_output.startswith("❌"):
                _GEMINI_CACHE[cache_key] = ai_output
            return ai_output
        except Exception as eg:
            # Parse error and decide whether to retry
            msg = str(eg)
            lower = msg.lower()
            if ("429" in lower) or ("quota" in lower) or ("rate limit" in lower) or ("rate-limit" in lower):
                secs = _parse_retry_after_seconds_from_error_text(msg) or 20
                _set_gemini_cooldown(secs, log)
                if attempt <= max_retries and not _GEMINI_DISABLE_WAIT:
                    jitter = random.uniform(0.2, 0.4) * secs
                    if log:
                        log(f"gemini_rate_limited exception retry_after={secs}s attempt={attempt}/{max_retries} jitter={int(jitter)}s")
                    time.sleep(secs + jitter)
                    continue
            # Non-rate-limit or no more retries: log and return handled error text
            handled = handle_gemini_error(eg, log)
            if log:
                log(f"gemini_error_final attempt={attempt} err={eg}")
            return handled
    return ai_output


def build_plots_payload(bias_report, df: pd.DataFrame, return_plots: str, enable_plots: bool, log):
    """Create plots payload dict depending on return_plots value.

    Returns a dict or {"error": str} or None if plots disabled.
    """
    if not enable_plots:
        return None

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
        return plots_payload
    except Exception as ev:
        log(f"visualization_block_error={ev}")
        return {"error": str(ev)}


def compute_numeric_summary(df: pd.DataFrame) -> dict:
    """Compute the numeric summary with the same shielding as before."""
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
    return numeric_summary


def apply_bias_mapping_to_response(response: dict, bias_report, ai_output, reporter, log):
    """Generate bias mapping and update the response dict in-place.

    Keeps original error handling and keys unchanged.
    """
    try:
        ai_text_for_mapping = ai_output if ai_output else reporter.summary()
        mapped = generate_bias_mapping(bias_report, ai_text_for_mapping)
        metadata = mapped.get("metadata", {})

        response.update({
            "mapped_biases": mapped.get("biases", []),
            "overall_reliability_assessment": mapped.get("overall_reliability_assessment", ""),
            "fairness_ethics": mapped.get("fairness_ethics", ""),
            "concluding_summary": mapped.get("concluding_summary", ""),
            "actionable_recommendations": mapped.get("actionable_recommendations", ""),
            "total_biases": metadata.get("total_biases", 0),
            "severity_summary": metadata.get("severity_summary", {}),
        })
    except Exception as em:
        response["mapped_biases_error"] = str(em)
        log(f"generate_bias_mapping_error={em}")


def save_analysis_cache(payload: dict, log):
    """Persist payload to the analysis cache path, preserving logging semantics."""
    try:
        # Allow administrators to disable local JSON cache writes via env var.
        # Setting ALLOW_LOCAL_SAVE=false will skip writing analysis_response.json.
        if os.getenv("ALLOW_LOCAL_SAVE", "true").lower() not in ("1", "true", "yes"):
            log("local_save_disabled_by_server_config: skipping analysis cache write")
            return
        cache_dir = get_cache_dir()
        os.makedirs(cache_dir, exist_ok=True)
        cache_file = get_cache_file()
        with open(cache_file, "w", encoding="utf-8") as wf:
            json.dump(make_json_serializable(payload), wf, ensure_ascii=False, indent=2)
        log(f"cached analysis written to {cache_file}")
    except Exception as ew:
        log(f"cache_write_error={ew}")

# @app.route("/api/render_pdf", methods=["POST"])
# def render_pdf_from_html():
#     """Render posted HTML to a PDF using Playwright (Chromium) and return bytes.

#     Accepts either:
#       - multipart/form-data with field 'html' containing the HTML string
#       - application/json body {"html": "..."}

#     Returns: application/pdf bytes.
#     """
#     html = None
#     try:
#         if request.content_type and request.content_type.startswith("application/json"):
#             data = request.get_json(silent=True) or {}
#             html = data.get("html")
#         else:
#             # form-data: treat 'html' as text field or file
#             if "html" in request.form:
#                 html = request.form.get("html")
#             elif "html" in request.files:
#                 f = request.files["html"]
#                 html = f.read().decode("utf-8", errors="replace")
#     except Exception:
#         html = None

#     if not html or not isinstance(html, str) or len(html) < 16:
#         return jsonify({"error": "missing_or_invalid_html"}), 400

#     try:
#         from playwright.sync_api import sync_playwright
#     except Exception as e:
#         return jsonify({"error": f"playwright_unavailable: {e}"}), 500

#     try:
#         # Ensure relative asset links resolve by injecting a <base> tag
#         base_url = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").rstrip("/") + "/"
#         if "<head" in html.lower():
#             # insert <base> right after <head>
#             try:
#                 html = re.sub(r"(<head[^>]*>)", r"\1<base href=\"%s\"/>" % base_url, html, count=1, flags=re.IGNORECASE)
#             except Exception:
#                 pass
#         else:
#             html = f"<head><base href=\"{base_url}\"/></head>" + html

#         with sync_playwright() as p:
#             browser = p.chromium.launch(headless=True)
#             context = browser.new_context()
#             page = context.new_page()
#             page.set_content(html, wait_until="networkidle")
#             pdf_bytes = page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
#             context.close()
#             browser.close()
#     except Exception as e:
#         return jsonify({"error": f"render_failed: {e}"}), 500

#     resp = make_response(pdf_bytes)
#     resp.headers.set("Content-Type", "application/pdf")
#     resp.headers.set("Content-Disposition", "inline; filename=report.pdf")
#     return resp

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

@app.route("/api/save_pdf", methods=["POST"])
def save_pdf_to_cache():
    """Accept a PDF file and save it to the program_generated_files directory.

    Form-data:
      file: PDF file (required)
      filename: optional filename to use; defaults to a timestamped pattern

    Returns JSON with {"path": <absolute_path>, "filename": <name>} on success.
    """
    try:
        # Server-side guard: allow disabling local saves via env var.
        # Set ALLOW_LOCAL_SAVE=false to reject attempts to write files to disk.
        if os.getenv("ALLOW_LOCAL_SAVE", "true").lower() not in ("1", "true", "yes"):
            return jsonify({"error": "local_save_disabled_by_server_config"}), 403
        if "file" not in request.files:
            return jsonify({"error": "no file part"}), 400
        f = request.files["file"]
        if not f or f.filename == "":
            return jsonify({"error": "no selected file"}), 400

        # Sanitize/derive filename
        req_name = request.form.get("filename", "").strip()
        base_name = re.sub(r"[^A-Za-z0-9_.-]", "_", req_name) if req_name else "dbias_report.pdf"
        # Ensure .pdf extension
        if not base_name.lower().endswith(".pdf"):
            base_name = f"{base_name}.pdf"

        # If default name, add timestamp to avoid clashes
        if base_name == "dbias_report.pdf":
            ts = time.strftime("%Y%m%d_%H%M%S")
            base_name = f"dbias_report_{ts}.pdf"

        out_dir = get_cache_dir()
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, base_name)

        # Save upload to a temp file inside the same directory, then atomically
        # replace the final file after removing existing PDFs. This reduces the
        # chance of leaving a partially-written file and is more robust on
        # cross-platform filesystems.
        tmp_path = None
        try:
            fd, tmp_path = tempfile.mkstemp(suffix=".pdf", dir=out_dir)
            os.close(fd)
            # Save incoming file to temp path first
            f.save(tmp_path)
        except Exception as e:
            # cleanup temp if created
            try:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            return jsonify({"error": f"failed to save upload to temp file: {e}"}), 500

        # Delete existing PDFs (except the temp we just wrote). Collect any
        # delete errors to report but continue where possible.
        delete_errors = []
        try:
            for fname in os.listdir(out_dir):
                fp = os.path.join(out_dir, fname)
                if not os.path.isfile(fp):
                    continue
                # skip our temp file
                try:
                    if os.path.samefile(fp, tmp_path):
                        continue
                except Exception:
                    # fallback to path comparison
                    if os.path.abspath(fp) == os.path.abspath(tmp_path):
                        continue
                if fname.lower().endswith('.pdf'):
                    try:
                        os.remove(fp)
                    except Exception as ex:
                        delete_errors.append(str(ex))
        except Exception as ex:
            delete_errors.append(str(ex))

        # Atomically move temp into the final path. os.replace is atomic on
        # most platforms and will overwrite the destination if it exists.
        try:
            os.replace(tmp_path, out_path)
        except Exception as e:
            # Attempt cleanup of temp file and report error
            try:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            return jsonify({"error": f"failed to move temp file into place: {e}", "delete_errors": delete_errors}), 500

        resp = {"path": out_path, "filename": base_name}
        if delete_errors:
            resp["delete_errors"] = delete_errors
        return jsonify(resp), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
    t0 = time.time()
    def log(msg: str):
        print(f"[analyze] {msg}")

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

    # Mark running job so the cancel endpoint can target it, and support cooperative cancellation
    global RUNNING_ANALYSIS_JOB, RUNNING_ANALYSIS_PID, CANCEL_REQUESTED
    RUNNING_ANALYSIS_JOB = threading.current_thread()
    RUNNING_ANALYSIS_PID = None
    # reset any previous cancellation request for this new analysis run
    CANCEL_REQUESTED = False

    try:
        # Preprocess
        df, prep_warnings = load_and_preprocess(f)
        log(f"loaded dataframe shape={df.shape} warnings={len(prep_warnings) if prep_warnings else 0}")

        # Check for cooperative cancellation after preprocessing
        if CANCEL_REQUESTED:
            log("analysis canceled after preprocessing")
            return jsonify({"status": "Canceled"}), 200

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


        # Use GeminiKeyManager and GeminiConnector for multi-key rotation
        ai_output = None
        if run_gemini_flag:
            # Check cancellation before starting potentially long Gemini calls
            if CANCEL_REQUESTED:
                log("analysis canceled before Gemini call")
                return jsonify({"status": "Canceled"}), 200
            key_manager = GeminiKeyManager(log=log)
            gemini_connector = GeminiConnector(key_manager=key_manager, log=log)
            # Allow GeminiConnector to observe cooperative cancellation requests
            try:
                gemini_connector.cancel_requested = lambda: CANCEL_REQUESTED
            except Exception:
                pass
            ai_output = gemini_connector.summarize_biases(
                bias_report,
                dataset_name=f.filename,
                shape=df.shape,
                excluded_columns=excluded_cols,
                use_multi_key=True,
                max_retries=3
            )

        plots_payload = build_plots_payload(
            bias_report=bias_report,
            df=df,
            return_plots=return_plots,
            enable_plots=enable_plots,
            log=log,
        )

        # Always build plots for the cache (both JSON and PNG), regardless of request flag
        cache_plots_payload = build_plots_payload(
            bias_report=bias_report,
            df=df,
            return_plots="both",
            enable_plots=True,
            log=log,
        )

        # Numeric summary
        numeric_summary = compute_numeric_summary(df)

        response = {
            "bias_report": bias_report,
            "fairness_score": fairness_score,
            "summary": ai_output,
            "dataset_summary": reporter.summary(),
            "numeric_summary": numeric_summary,
            "reliability": reporter.reliability(),
            "preprocessing_warnings": prep_warnings,
        }
        apply_bias_mapping_to_response(response, bias_report, ai_output, reporter, log)
        
        # Persist the full analysis (including mapped_biases and plots) to cache JSON for /api/analysis/latest
        cache_response = dict(response)
        if cache_plots_payload is not None:
            cache_response["plots"] = cache_plots_payload
        save_analysis_cache(cache_response, log)
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
        }), 500
    finally:
        # Clear running job and cancellation flag so subsequent analyses start clean
        try:
            RUNNING_ANALYSIS_JOB = None
            RUNNING_ANALYSIS_PID = None
            CANCEL_REQUESTED = False
        except Exception:
            pass


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


# --- Cancel Analysis Endpoint ---
import signal
from typing import Optional

# Track running analysis jobs (simple global for demo; use a job manager in production)
RUNNING_ANALYSIS_JOB: Optional[threading.Thread] = None
RUNNING_ANALYSIS_PID: Optional[int] = None
# Simple cancellation flag that analysis code can poll to stop work cooperatively
CANCEL_REQUESTED: bool = False

@app.route("/api/cancel-analysis", methods=["POST"])
def cancel_analysis():
    """
    Cancel the current analysis job, abort running tasks, clean up partial files, and respond with status.
    Expects JSON body: { "job_id": <optional> }
    """
    global RUNNING_ANALYSIS_JOB, RUNNING_ANALYSIS_PID, CANCEL_REQUESTED
    # Attempt to terminate running thread/process
    canceled = False
    cleanup_error = None
    try:
        # Mark cancellation requested so running analysis can stop cooperatively
        CANCEL_REQUESTED = True
        canceled = False
        cleanup_error = None
        # If using subprocess for analysis, terminate it
        # If using subprocess for analysis, terminate it
        if RUNNING_ANALYSIS_PID:
            try:
                os.kill(RUNNING_ANALYSIS_PID, signal.SIGTERM)
                canceled = True
            except Exception as e:
                cleanup_error = f"Failed to kill process: {e}"
        # If using thread, set a flag or interrupt (not always possible)
        if RUNNING_ANALYSIS_JOB and RUNNING_ANALYSIS_JOB.is_alive():
            # No safe way to kill a thread; set a flag in real implementation
            canceled = True
        # Clean up partial files (delete temp files in cache dir)
        cache_dir = get_cache_dir()
        for fname in os.listdir(cache_dir):
            if fname.startswith("temp_") or fname.endswith(".tmp"):
                try:
                    os.remove(os.path.join(cache_dir, fname))
                except Exception:
                    pass
    except Exception as e:
        cleanup_error = str(e)
    # Reset job tracking (note: cancellation flag remains True until next analysis resets it)
    RUNNING_ANALYSIS_JOB = None
    RUNNING_ANALYSIS_PID = None
    status = "Canceled" if canceled else "No active job"
    resp = { "status": status }
    if cleanup_error:
        resp["cleanup_error"] = cleanup_error
    return jsonify(resp), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    # Disable the reloader & debug for stability during automated tests to avoid connection resets.
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode, use_reloader=False)
