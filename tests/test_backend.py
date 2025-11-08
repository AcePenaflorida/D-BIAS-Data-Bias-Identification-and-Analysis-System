import requests
import json
import base64
import os
import importlib.util
import sys
import traceback
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import re


# ==================== CONFIGURATION ====================

def get_config():
    """Load and return configuration settings."""
    HERE = os.path.dirname(os.path.abspath(__file__))
    ROOT_DIR = os.path.abspath(os.path.join(HERE, ".."))
    DBIAS_DIR = os.path.join(ROOT_DIR, "d-bias")
    OUT_DIR = os.path.join(DBIAS_DIR, "_data", "program_generated_files")
    
    # Load environment variables
    env_path = os.path.join(DBIAS_DIR, "backend", ".env")
    load_dotenv(env_path)
    
    return {
        "HERE": HERE,
        "ROOT_DIR": ROOT_DIR,
        "DBIAS_DIR": DBIAS_DIR,
        "OUT_DIR": OUT_DIR,
        "CACHE_PATH": os.path.join(OUT_DIR, "analysis_response.json"),
        "BACKEND_URL": "http://127.0.0.1:5000/api/analyze",
        "DATASET_PATH": r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\sample_datasets\heart_disease_cleaned.csv",
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_KEY": os.getenv("SUPABASE_SERVICE_KEY"),
        "SUPABASE_BUCKET": os.getenv("SUPABASE_BUCKET", "pdf_bias_report"),
        "DEFAULT_USER_ID": "bed6a0d6-5c76-4d7b-9990-86de91a68a7c"
    }


def initialize_supabase(config):
    """Initialize and return Supabase client."""
    if not config["SUPABASE_URL"] or not config["SUPABASE_SERVICE_KEY"]:
        print("⚠️ Supabase credentials not found in .env file")
        return None
    
    try:
        client = create_client(config["SUPABASE_URL"], config["SUPABASE_SERVICE_KEY"])
        print("✅ Supabase client initialized successfully")
        return client
    except Exception as e:
        print(f"⚠️ Failed to initialize Supabase client: {e}")
        return None


def ensure_output_directory(config):
    """Ensure output directory exists."""
    os.makedirs(config["OUT_DIR"], exist_ok=True)


# ==================== SUPABASE FUNCTIONS ====================

def test_supabase_connection(supabase, config):
    """
    Test Supabase connectivity by:
    1. Fetching all users from the users table
    2. Inserting a test entry into session_logs
    """
    if not supabase:
        print("❌ Supabase client not initialized. Skipping connection test.")
        return False

    print("\n🔌 Testing Supabase connection...")

    try:
        # Fetch all users
        print("📥 Fetching users from database...")
        users_response = supabase.table("users").select("*").execute()
        users = users_response.data or []

        print(f"✅ Found {len(users)} user(s) in database:")
        for user in users:
            print(f"  - ID: {user.get('id')}, Email: {user.get('email')}, Created: {user.get('created_at')}")

        # Insert test log entry
        print("\n📝 Inserting test entry into session_logs...")
        log_entry = {
            "user_id": config["DEFAULT_USER_ID"],
            "action": "test_connection",
            "timestamp": datetime.utcnow().isoformat(),
            "ip_address": "127.0.0.1",
            "created_at": datetime.utcnow().isoformat()
        }
        log_response = supabase.table("session_logs").insert(log_entry).execute()

        print(f"✅ Test log entry created: {log_response.data}")
        print("✅ Supabase connection test passed!\n")
        return True

    except Exception as e:
        print(f"❌ Supabase connection test failed: {e}")
        print(traceback.format_exc())
        return False


def upload_pdf_to_supabase(supabase, config, pdf_path, user_id=None, file_name=None):
    """
    Upload a PDF file to Supabase Storage and create a record in the reports table.
    
    Args:
        supabase: Supabase client instance
        config: Configuration dictionary
        pdf_path: Path to the PDF file to upload
        user_id: User ID for the report record (default: from config)
        file_name: Optional custom file name (default: extracted from pdf_path)
    
    Returns:
        dict with keys: success, storage_path, public_url, report_record, error
    """
    if not supabase:
        return {"success": False, "error": "Supabase client not initialized"}

    if not os.path.exists(pdf_path):
        return {"success": False, "error": f"PDF file not found: {pdf_path}"}

    # Use default user_id if not provided
    if user_id is None:
        user_id = config["DEFAULT_USER_ID"]

    # Validate user_id format
    try:
        uuid.UUID(str(user_id))
    except ValueError:
        return {"success": False, "error": f"Invalid user_id format: {user_id}. Must be a UUID."}

    if file_name is None:
        file_name = os.path.basename(pdf_path)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    storage_path = f"user_{user_id}/{timestamp}_{file_name}"

    print(f"\n📤 Uploading PDF to Supabase Storage...")
    print(f"  Bucket: {config['SUPABASE_BUCKET']}")
    print(f"  Path: {storage_path}")

    try:
        with open(pdf_path, "rb") as f:
            pdf_data = f.read()

        # Upload to Supabase Storage
        upload_response = supabase.storage.from_(config["SUPABASE_BUCKET"]).upload(
            path=storage_path,
            file=pdf_data,
            file_options={"content-type": "application/pdf"}
        )

        print(f"✅ PDF uploaded successfully!")

        # Get public URL
        public_url = supabase.storage.from_(config["SUPABASE_BUCKET"]).get_public_url(storage_path)
        print(f"  Public URL: {public_url}")

        # Insert record into reports table
        print(f"\n📝 Creating record in reports table...")
        report_record = {
            "user_id": user_id,
            "report_name": file_name,
            "report_url": storage_path,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        insert_response = supabase.table("reports").insert(report_record).execute()

        print(f"✅ Report record created:")
        print(f"  Report ID: {insert_response.data[0].get('id') if insert_response.data else 'N/A'}")
        print(f"  User ID: {user_id}")
        print(f"  Report Name: {file_name}")
        print(f"  Storage Path: {storage_path}")

        return {
            "success": True,
            "storage_path": storage_path,
            "public_url": public_url,
            "report_record": insert_response.data[0] if insert_response.data else None
        }

    except Exception as e:
        error_msg = f"Failed to upload PDF to Supabase: {e}"
        print(f"❌ {error_msg}")
        print(traceback.format_exc())
        return {"success": False, "error": error_msg}


# ==================== ANALYSIS FUNCTIONS ====================

def save_plots(plots, config):
    """Save plot data to files (PNG and HTML)."""
    if not plots:
        return
    
    print("\n--- Plots returned by backend ---")
    out_dir = config["OUT_DIR"]
    os.makedirs(out_dir, exist_ok=True)
    
    for key, payload in plots.items():
        if payload is None:
            print(f"{key}: no plot available")
            continue

        # Save PNG if present
        png_b64 = None
        if isinstance(payload, dict):
            png_b64 = payload.get("png_base64") or (
                payload.get("plotly", {}).get("png_base64") 
                if isinstance(payload.get("plotly"), dict) else None
            )

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
                with open(html_path, "w", encoding="utf-8") as hf:
                    hf.write("<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n")
                    hf.write("<script src=\"https://cdn.plot.ly/plotly-latest.min.js\"></script>\n")
                    hf.write("</head>\n<body>\n<div id=\"plot\" style=\"width:100%;height:100%\"></div>\n")
                    hf.write("<script>\nconst fig = ")
                    json.dump(plotly_dict, hf)
                    hf.write(";\nPlotly.newPlot('plot', fig.data, fig.layout || {});\n</script>\n")
                    hf.write("</body>\n</html>")
                print(f"Saved interactive HTML: {html_path}")
            except Exception as e:
                print(f"Failed to write HTML for {key}: {e}")


def analyze_and_save(backend_url, file_path, output_path, run_gemini=True, return_plots="both"):
    """
    POST the dataset to the backend, save JSON response and return it.
    
    Args:
        backend_url: URL of the backend API endpoint
        file_path: Path to the dataset file
        output_path: Path to save the JSON response
        run_gemini: Whether to run Gemini AI analysis
        return_plots: Plot format to return ("both", "plotly", "png")
    
    Returns:
        dict: Analysis response data
    """
    print("📤 Sending dataset to backend...")
    with open(file_path, "rb") as f:
        response = requests.post(
            backend_url,
            files={"file": f},
            data={"run_gemini": "true" if run_gemini else "false", "return_plots": return_plots},
            timeout=120,
        )

    if response.status_code != 200:
        try:
            body = response.json()
        except Exception:
            body = response.text
        raise RuntimeError(f"Analysis failed ({response.status_code}): {body}")

    data = response.json()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as wf:
        json.dump(data, wf, ensure_ascii=False, indent=2)
    print(f"Saved analysis to: {output_path}")
    return data


def load_saved_analysis(file_path):
    """Load saved analysis from JSON file."""
    with open(file_path, "r", encoding="utf-8") as rf:
        return json.load(rf)


def display_analysis_results(data):
    """Display bias analysis results in a formatted way."""
    print("\n✅ Bias Analysis Complete!")
    print(f"Fairness Score: {data.get('fairness_score')}")

    print("\n--- Bias Report ---")
    print(data.get("bias_report") if data.get("bias_report") is not None else "No bias_report returned by backend.")

    print("\n--- Dataset Summary ---")
    print(data.get("dataset_summary", "No summary available."))
    
    print("\n--- Reliability ---")
    print(data.get("reliability", "No reliability info available."))

    print("\n--- Gemini Summary ---")
    print(data.get("summary", "No AI summary generated."))

    # Display mapped biases with bullet formatting
    mapped = data.get("mapped_biases") or {}
    print("\n--- MAPPED BIASES ---")
    print(mapped)
    bias_types = (mapped or {}).get("bias_types", {}) or {}
    if not bias_types:
        print("(none)")
    else:
        for btype, items in bias_types.items():
            print(f"\n• {btype}")
            if not items:
                print("   - (no items)")
                continue
            for it in items:
                feat = it.get("feature") or "unknown"
                sev = it.get("severity") or ""
                desc = (it.get("description") or "").strip()
                ai = (it.get("ai_explanation") or "").strip()
                ai_bullets = it.get("ai_explanation_bullets") or []
                print(f"   - Feature: {feat}")
                if sev:
                    print(f"     Severity: {sev}")
                if desc:
                    print(f"     Description: {desc}")
                if ai:
                    print("     AI Explanation:")
                    if ai_bullets:
                        for bullet in ai_bullets:
                            cleaned = re.sub(r"^(?:\*+\s*|[-•]\s*|\d+\.?\s*)", "", bullet.strip())
                            print(f"       • {cleaned}")
                    else:
                        # Fallback: line-split
                        ai_lines = [l.strip() for l in ai.splitlines() if l.strip()]
                        for line in ai_lines:
                            cleaned = re.sub(r"^(?:\*+\s*|[-•]\s*|\d+\.?\s*)", "", line)
                            print(f"       • {cleaned}")
                print("")
    
    mapped_err = data.get("mapped_biases_error")
    if mapped_err:
        print("\n--- Mapping Error ---")
        print(mapped_err)

    # Print overall assessment
    overall = (mapped or {}).get("overall", {}) or {}
    if overall:
        print("\n--- MAPPED OVERALL ---")
        print("Assessment:\n", overall.get("assessment") or "(none)")
        print("\nFairness:\n", overall.get("fairness") or "(none)")
        print("\nConclusion:\n", overall.get("conclusion") or "(none)")
        
        ar = overall.get("actionable_recommendations") or overall.get("actionable_recommendations_raw")
        if isinstance(ar, list):
            print("\nActionable Recommendations:")
            for i, item in enumerate(ar, start=1):
                print(f"{i}. {item}")
        else:
            print("\nActionable Recommendations:\n", ar or "(none)")


# ==================== PDF GENERATION ====================

def generate_pdf_report(config, data, output_pdf_path=None):
    """
    Generate PDF report from analysis data.
    
    Args:
        config: Configuration dictionary
        data: Analysis response data
        output_pdf_path: Optional path for the PDF file
    
    Returns:
        str: Path to the generated PDF file
    """
    vis_path = os.path.join(config["DBIAS_DIR"], "backend", "visualization.py")
    if not os.path.exists(vis_path):
        raise FileNotFoundError(f"visualization.py not found at expected path: {vis_path}")

    spec = importlib.util.spec_from_file_location("db_backend_visualization", vis_path)
    vis = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vis)

    if not hasattr(vis, "generate_pdf_report"):
        raise RuntimeError("visualization.generate_pdf_report not found. Please update backend/visualization.py")

    out_dir = config["OUT_DIR"]
    os.makedirs(out_dir, exist_ok=True)
    
    if output_pdf_path is None:
        output_pdf_path = os.path.join(out_dir, "dbias_report.pdf")

    pdf_path = vis.generate_pdf_report(data, output_pdf_path)
    print(f"Generated PDF report: {pdf_path}")
    return pdf_path


# ==================== MAIN WORKFLOW ====================

def run_analysis_workflow(config, supabase, use_cache=True, run_gemini=True, upload_to_supabase=True):
    """
    Run the complete bias analysis workflow.
    
    Args:
        config: Configuration dictionary
        supabase: Supabase client instance (can be None)
        use_cache: Whether to use cached analysis if available
        run_gemini: Whether to run Gemini AI analysis
        upload_to_supabase: Whether to upload PDF to Supabase
    
    Returns:
        dict: Analysis results and workflow status
    """
    results = {
        "analysis_data": None,
        "pdf_path": None,
        "upload_result": None
    }
    
    # Test Supabase connection if client is available
    if supabase:
        test_supabase_connection(supabase, config)
    
    # Load or run analysis
    if use_cache and os.path.exists(config["CACHE_PATH"]):
        print(f"🔁 Loading cached analysis from {config['CACHE_PATH']}")
        data = load_saved_analysis(config["CACHE_PATH"])
    else:
        data = analyze_and_save(
            config["BACKEND_URL"],
            config["DATASET_PATH"],
            config["CACHE_PATH"],
            run_gemini=run_gemini
        )
    
    results["analysis_data"] = data
    
    # Display results
    display_analysis_results(data)
    
    # Save plots
    plots = data.get("plots")
    if plots:
        save_plots(plots, config)
    
    # Generate PDF
    print("\n" + "="*60)
    print("📄 Generating PDF Report...")
    print("="*60)
    
    try:
        pdf_path = generate_pdf_report(config, data)
        results["pdf_path"] = pdf_path
        
        # Upload to Supabase if requested and client is available
        if upload_to_supabase and supabase and pdf_path and os.path.exists(pdf_path):
            print("\n" + "="*60)
            print("☁️ Uploading to Supabase...")
            print("="*60)
            
            upload_result = upload_pdf_to_supabase(
                supabase,
                config,
                pdf_path,
                user_id=config["DEFAULT_USER_ID"],
                file_name="dbias_report.pdf"
            )
            
            results["upload_result"] = upload_result
            
            if upload_result.get("success"):
                print("\n✅ PDF successfully uploaded to Supabase!")
                print(f"  Storage Path: {upload_result.get('storage_path')}")
                print(f"  Public URL: {upload_result.get('public_url')}")
            else:
                print(f"\n⚠️ Failed to upload PDF: {upload_result.get('error')}")
        
    except Exception as e:
        print(f"PDF generation/upload failed: {e!r}")
        print("\n--- Error Traceback ---")
        print(traceback.format_exc())
    
    return results


def main():
    """Main entry point for the test script."""
    # Initialize configuration
    config = get_config()
    ensure_output_directory(config)
    
    # Initialize Supabase client
    supabase = initialize_supabase(config)
    
    # Run the complete workflow
    results = run_analysis_workflow(
        config=config,
        supabase=supabase,
        use_cache=True,
        run_gemini=True,
        upload_to_supabase=True
    )
    
    return results


# ==================== SCRIPT EXECUTION ====================

if __name__ == "__main__":
    main()

