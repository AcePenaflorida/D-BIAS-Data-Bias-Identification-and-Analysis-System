from app import app
from io import BytesIO
import os
import time

CSV_PATH = os.path.abspath(
    os.getenv(
        "SMOKE_CSV_PATH",
        "C:/Users/ACER/Documents/_Projects/D-BIAS/d-bias/_data/sample_datasets/heart.csv",
    )
)


def load_csv_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def post_analyze(client, csv_bytes: bytes, run_gemini: bool = True):
    data = {
        "file": (BytesIO(csv_bytes), os.path.basename(CSV_PATH)),
        "run_gemini": "true" if run_gemini else "false",
        # don't include plots in API response; cache already stores them
        "return_plots": "none",
    }
    return client.post("/api/analyze", content_type="multipart/form-data", data=data)


def main():
    csv_bytes = load_csv_bytes(CSV_PATH)
    client = app.test_client()

    print("\n[smoke] First call (should attempt Gemini)")
    resp1 = post_analyze(client, csv_bytes, run_gemini=True)
    print("status:", resp1.status_code)
    try:
        js1 = resp1.get_json(silent=True) or {}
    except Exception:
        js1 = {}
    print("summary:", (js1 or {}).get("summary"))

    # small delay; immediate second call should be in cooldown if first hit rate-limit
    time.sleep(1)

    print("\n[smoke] Second call (should skip Gemini if cooldown is active)")
    resp2 = post_analyze(client, csv_bytes, run_gemini=True)
    print("status:", resp2.status_code)
    try:
        js2 = resp2.get_json(silent=True) or {}
    except Exception:
        js2 = {}
    print("summary:", (js2 or {}).get("summary"))

    # Show hint to check cached analysis for plots
    print("\n[smoke] Check cached JSON at d-bias/_data/program_generated_files/analysis_response.json for plots payload.")


if __name__ == "__main__":
    main()
