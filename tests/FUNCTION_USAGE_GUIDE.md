# 📘 Function-Based Test Backend - Usage Guide

## Overview
The `test_backend.py` script has been completely refactored into clean, reusable functions. All functionality is preserved while making the code much easier to edit, test, and invoke.

---

## 🏗️ Code Structure

### 1️⃣ **Configuration Functions**
```python
config = get_config()
# Returns a dictionary with all settings:
# - Paths (HERE, ROOT_DIR, DBIAS_DIR, OUT_DIR, CACHE_PATH)
# - URLs (BACKEND_URL)
# - File paths (DATASET_PATH)
# - Supabase settings (URL, KEY, BUCKET)
# - Default user ID

supabase = initialize_supabase(config)
# Initialize Supabase client from config

ensure_output_directory(config)
# Create output directory if it doesn't exist
```

### 2️⃣ **Supabase Functions**
```python
# Test database connectivity
success = test_supabase_connection(supabase, config)
# Returns: True if successful, False otherwise

# Upload PDF to Supabase Storage
result = upload_pdf_to_supabase(
    supabase=supabase,
    config=config,
    pdf_path="path/to/report.pdf",
    user_id="optional-uuid",  # Uses config default if None
    file_name="optional_name.pdf"  # Uses filename if None
)
# Returns: {
#   "success": True/False,
#   "storage_path": "user_xxx/timestamp_file.pdf",
#   "public_url": "https://...",
#   "report_record": {...},
#   "error": "..." (if failed)
# }
```

### 3️⃣ **Analysis Functions**
```python
# Run analysis and save to file
data = analyze_and_save(
    backend_url=config["BACKEND_URL"],
    file_path=config["DATASET_PATH"],
    output_path=config["CACHE_PATH"],
    run_gemini=True,
    return_plots="both"
)
# Returns: Analysis response dictionary

# Load previously saved analysis
data = load_saved_analysis(config["CACHE_PATH"])
# Returns: Analysis response dictionary

# Display analysis results in formatted way
display_analysis_results(data)
# Prints all analysis sections

# Save plot files (PNG and HTML)
save_plots(data.get("plots"), config)
# Saves plots to output directory
```

### 4️⃣ **PDF Generation**
```python
pdf_path = generate_pdf_report(
    config=config,
    data=analysis_data,
    output_pdf_path=None  # Optional custom path
)
# Returns: Path to generated PDF
```

### 5️⃣ **Complete Workflow**
```python
results = run_analysis_workflow(
    config=config,
    supabase=supabase,
    use_cache=True,
    run_gemini=True,
    upload_to_supabase=True
)
# Returns: {
#   "analysis_data": {...},
#   "pdf_path": "...",
#   "upload_result": {...}
# }
```

---

## 🎯 Common Use Cases

### Use Case 1: Run Full Analysis (Default Behavior)
```python
from test_backend import main

# Run everything with defaults
results = main()
```

### Use Case 2: Custom Analysis with Specific Dataset
```python
from test_backend import get_config, initialize_supabase, run_analysis_workflow

# Get default config
config = get_config()

# Override dataset path
config["DATASET_PATH"] = r"C:\path\to\your\dataset.csv"

# Initialize Supabase
supabase = initialize_supabase(config)

# Run workflow
results = run_analysis_workflow(config, supabase)
```

### Use Case 3: Analysis Only (No Supabase)
```python
from test_backend import get_config, analyze_and_save, display_analysis_results

config = get_config()

# Run analysis
data = analyze_and_save(
    backend_url=config["BACKEND_URL"],
    file_path=config["DATASET_PATH"],
    output_path=config["CACHE_PATH"]
)

# Display results
display_analysis_results(data)
```

### Use Case 4: Use Cached Analysis + Generate New PDF
```python
from test_backend import get_config, load_saved_analysis, generate_pdf_report

config = get_config()

# Load cached analysis
data = load_saved_analysis(config["CACHE_PATH"])

# Generate new PDF
pdf_path = generate_pdf_report(config, data, output_pdf_path="custom_report.pdf")
print(f"PDF saved to: {pdf_path}")
```

### Use Case 5: Test Supabase Connection Only
```python
from test_backend import get_config, initialize_supabase, test_supabase_connection

config = get_config()
supabase = initialize_supabase(config)

if test_supabase_connection(supabase, config):
    print("✅ Supabase is ready!")
else:
    print("❌ Supabase connection failed")
```

### Use Case 6: Upload Existing PDF
```python
from test_backend import get_config, initialize_supabase, upload_pdf_to_supabase

config = get_config()
supabase = initialize_supabase(config)

result = upload_pdf_to_supabase(
    supabase=supabase,
    config=config,
    pdf_path="existing_report.pdf",
    user_id="custom-user-uuid",
    file_name="my_custom_report.pdf"
)

if result["success"]:
    print(f"URL: {result['public_url']}")
```

### Use Case 7: Workflow Without Cache
```python
from test_backend import get_config, initialize_supabase, run_analysis_workflow

config = get_config()
supabase = initialize_supabase(config)

# Force fresh analysis (ignore cache)
results = run_analysis_workflow(
    config=config,
    supabase=supabase,
    use_cache=False,  # ← Fresh analysis
    run_gemini=True,
    upload_to_supabase=True
)
```

### Use Case 8: Workflow Without Gemini AI
```python
from test_backend import get_config, initialize_supabase, run_analysis_workflow

config = get_config()
supabase = initialize_supabase(config)

# Skip Gemini (faster, cheaper)
results = run_analysis_workflow(
    config=config,
    supabase=supabase,
    use_cache=True,
    run_gemini=False,  # ← No AI summary
    upload_to_supabase=True
)
```

### Use Case 9: Analysis + PDF Without Upload
```python
from test_backend import get_config, run_analysis_workflow

config = get_config()

# Generate PDF but don't upload
results = run_analysis_workflow(
    config=config,
    supabase=None,  # ← No Supabase
    use_cache=True,
    run_gemini=True,
    upload_to_supabase=False  # ← No upload
)

print(f"PDF saved locally at: {results['pdf_path']}")
```

### Use Case 10: Batch Processing Multiple Datasets
```python
from test_backend import get_config, initialize_supabase, analyze_and_save, generate_pdf_report, upload_pdf_to_supabase

config = get_config()
supabase = initialize_supabase(config)

datasets = [
    "dataset1.csv",
    "dataset2.csv",
    "dataset3.csv"
]

for dataset in datasets:
    config["DATASET_PATH"] = f"path/to/{dataset}"
    cache_path = f"cache_{dataset}.json"
    
    # Analyze
    data = analyze_and_save(
        backend_url=config["BACKEND_URL"],
        file_path=config["DATASET_PATH"],
        output_path=cache_path
    )
    
    # Generate PDF
    pdf_path = generate_pdf_report(config, data, f"report_{dataset}.pdf")
    
    # Upload
    result = upload_pdf_to_supabase(supabase, config, pdf_path)
    print(f"{dataset}: {result.get('public_url')}")
```

---

## 🔧 Configuration Customization

### Modify Config Values
```python
config = get_config()

# Change backend URL
config["BACKEND_URL"] = "http://localhost:8000/analyze"

# Change dataset
config["DATASET_PATH"] = r"C:\new\dataset.csv"

# Change cache location
config["CACHE_PATH"] = "custom_cache.json"

# Change output directory
config["OUT_DIR"] = r"C:\custom\output"

# Change default user ID
config["DEFAULT_USER_ID"] = "your-uuid-here"

# Change Supabase bucket
config["SUPABASE_BUCKET"] = "custom_bucket"
```

---

## 📊 Function Return Values

### `get_config()`
```python
{
    "HERE": str,          # Script directory
    "ROOT_DIR": str,      # Project root
    "DBIAS_DIR": str,     # d-bias directory
    "OUT_DIR": str,       # Output directory
    "CACHE_PATH": str,    # Cache file path
    "BACKEND_URL": str,   # Backend API URL
    "DATASET_PATH": str,  # Dataset file path
    "SUPABASE_URL": str,  # Supabase project URL
    "SUPABASE_SERVICE_KEY": str,  # Service key
    "SUPABASE_BUCKET": str,       # Storage bucket
    "DEFAULT_USER_ID": str        # UUID
}
```

### `analyze_and_save()`
```python
{
    "fairness_score": float,
    "bias_report": str,
    "dataset_summary": dict,
    "reliability": dict,
    "summary": str,
    "mapped_biases": dict,
    "plots": dict
}
```

### `run_analysis_workflow()`
```python
{
    "analysis_data": dict,     # Full analysis response
    "pdf_path": str,           # Path to PDF
    "upload_result": dict      # Upload status
}
```

---

## 🎨 Benefits of Function-Based Design

✅ **Modularity**: Each function does one thing well  
✅ **Reusability**: Import and use functions anywhere  
✅ **Testability**: Easy to unit test individual functions  
✅ **Flexibility**: Mix and match functions for custom workflows  
✅ **Readability**: Clear function names and docstrings  
✅ **Maintainability**: Changes isolated to specific functions  
✅ **No Globals**: All state passed through parameters  
✅ **Type Hints**: Clear parameter expectations  

---

## 🚀 Quick Start

```python
# Simple one-liner
from test_backend import main
main()

# Or run the script directly
python test_backend.py
```

---

## 💡 Tips

1. **Use `get_config()` first** - Always start by getting the config
2. **Pass config around** - Most functions need it
3. **Check Supabase is not None** - Before calling Supabase functions
4. **Cache is your friend** - Use it for faster iterations
5. **Override config values** - Don't edit defaults, override after `get_config()`
6. **Error handling included** - Functions handle errors gracefully
7. **All prints preserved** - Same verbose output as before

---

## 📝 Example Script

```python
#!/usr/bin/env python
"""Custom analysis script using test_backend functions."""

from test_backend import (
    get_config,
    initialize_supabase,
    analyze_and_save,
    display_analysis_results,
    save_plots,
    generate_pdf_report,
    upload_pdf_to_supabase
)

# Setup
config = get_config()
config["DATASET_PATH"] = "my_dataset.csv"
supabase = initialize_supabase(config)

# Run analysis
data = analyze_and_save(
    backend_url=config["BACKEND_URL"],
    file_path=config["DATASET_PATH"],
    output_path="my_analysis.json"
)

# Show results
display_analysis_results(data)

# Save visualizations
save_plots(data.get("plots"), config)

# Create PDF
pdf = generate_pdf_report(config, data)

# Upload to cloud
if supabase:
    result = upload_pdf_to_supabase(supabase, config, pdf)
    print(f"Share this link: {result.get('public_url')}")
```

---

## 🔍 Debugging

Enable verbose output by checking function return values:
```python
config = get_config()
print("Config loaded:", config)

supabase = initialize_supabase(config)
print("Supabase client:", supabase)

success = test_supabase_connection(supabase, config)
print("Connection test passed:", success)
```

---

Happy coding! 🎉
