# D-BIAS API Reference

Base URL (examples):
- Local: `http://localhost:5000`
- Production: your Railway backend URL (HTTPS)
## Endpoints

### Health
- `GET /`
  - Returns a simple status JSON.
- `GET /api/ping`
  - Lightweight liveness/warmup check.

### Analysis cache
- `GET /api/analysis/latest`
  - Returns the most recent cached analysis JSON.
  - 404 if no cached file exists.

### PDF cache
- `POST /api/save_pdf`
  - Multipart form-data: `file` (PDF, required), `filename` (optional).
  - Saves PDF into `_data/program_generated_files/` (or `ANALYSIS_CACHE_PATH/ANALYSIS_CACHE_DIR`).
  - Respects `ALLOW_LOCAL_SAVE` (403 if disabled).

### Dataset upload (light validation)
- `POST /api/upload`
  - Multipart form-data: `file` (CSV, required).
  - Returns rows, cols, column names, and preprocessing warnings.
  - 400 on invalid/missing file or validation failure.

### Full analysis
- `POST /api/analyze`
  - Multipart form-data:
    - `file` (CSV, required)
    - `excluded` (comma-separated list, optional; defaults to `EXCLUDED_COLUMNS` env e.g. `id,timestamp`)
    - `run_gemini` (`true|false`, optional; default `false`)
    - `return_plots` (`json|png|both|none`, optional; default `none`)
  - Returns bias report, fairness score, summaries, numeric summary, optional plots, and optional Gemini AI summary.
  - 400 on validation errors; 500 on internal errors.

### Plot PNG (single chart)
- `POST /api/plot/<fig_id>.png`
  - `fig_id` one of `fig1`, `fig2`, `fig3`.
  - Multipart form-data: `file` (CSV, required), `excluded` (optional, same as above).
  - Returns a PNG image inline.
  - 400 on invalid fig id or validation failure; 404 if figure unavailable.

### Cancel analysis
- `POST /api/cancel-analysis`
  - JSON body optional: `{ "job_id": "..." }` (not required/used currently).
  - Sets cancellation flag for the running analysis job and cleans temp files.
  - Returns status (`Canceled` or `No active job`).

## Key environment variables
- `FRONTEND_ORIGIN` (CORS allowlist, comma-separated)
- `ALLOW_ALL_ORIGINS` (`true/false`, wildcard CORS without credentials)
- `MAX_CONTENT_LENGTH` (upload size limit; default 50MB)
- `EXCLUDED_COLUMNS` (defaults to `id,timestamp`)
- `ALLOW_LOCAL_SAVE` (`true/false`, allow writing cache/PDF locally)
- `ANALYSIS_CACHE_PATH` / `ANALYSIS_CACHE_DIR` (override cache location)
- `GEMINI_MAX_CONCURRENCY`, `GEMINI_MIN_INTERVAL_MS`, `GEMINI_DISABLE_WAIT`, `GEMINI_MAX_RETRIES` (Gemini pacing)
- `REDIS_URL`, `GEMINI_CONCURRENCY_LIMIT`, `GEMINI_QUEUE_NAME` (distributed queue if used)

Notes:
- Upload/analyze/plot endpoints are CSRF-exempt for client compatibility.
- Ensure HTTPS in production; HSTS is added automatically when behind HTTPS.
- File uploads must be CSV for data endpoints and PDF for `/api/save_pdf`.
