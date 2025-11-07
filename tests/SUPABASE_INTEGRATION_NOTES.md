# 🚀 Supabase Integration - Test Backend Script

## Overview
The `test_backend.py` script has been extended with full Supabase integration while preserving all existing bias analysis and PDF generation functionality.

## ✅ What Was Added

### 1️⃣ **Environment Setup**
- **Imports**: Added `dotenv` for environment variables and `supabase` SDK
- **Environment Loading**: Automatically loads `.env` from `d-bias/backend/.env`
- **Supabase Client Initialization**: Creates authenticated client using:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `SUPABASE_BUCKET` (defaults to `pdf_bias_report`)

### 2️⃣ **New Function: `test_supabase_connection()`**
**Purpose**: Verify Supabase connectivity before running analysis

**Actions**:
- ✅ Fetches all users from the `users` table
- ✅ Displays user info (ID, email, created_at)
- ✅ Inserts a test log entry into `session_logs` table with:
  - `action`: "test_connection"
  - `details`: JSON with timestamp and script name
  - `created_at`: Current timestamp

**Returns**: `True` if successful, `False` otherwise

### 3️⃣ **New Function: `upload_pdf_to_supabase()`**
**Purpose**: Upload generated PDF reports to Supabase Storage and create database records

**Parameters**:
- `pdf_path` (str): Path to the PDF file
- `user_id` (int): User ID for the report (default: 1)
- `file_name` (str): Optional custom filename

**Actions**:
- ✅ Reads PDF file from disk
- ✅ Generates unique filename with timestamp: `{timestamp}_{filename}`
- ✅ Uploads to Supabase Storage bucket: `pdf_bias_report`
- ✅ Storage path: `user_{user_id}/{unique_filename}`
- ✅ Retrieves public URL for the uploaded file
- ✅ Creates a record in the `reports` table with:
  - `user_id`
  - `report_name`
  - `report_url` (storage path)
  - `created_at`

**Returns**: Dictionary with:
```python
{
    "success": True/False,
    "storage_path": "user_1/20251107_143022_dbias_report.pdf",
    "public_url": "https://...supabase.co/storage/v1/...",
    "report_record": {...},  # Database record
    "error": "..."  # Only if failed
}
```

### 4️⃣ **Main Execution Flow Update**

**Before Analysis**:
```python
test_supabase_connection()  # ← NEW: Tests DB connectivity
```

**After PDF Generation**:
```python
# Generate PDF (existing functionality)
pdf_path = generate_pdf_from_response(data)

# NEW: Upload to Supabase
if pdf_path and os.path.exists(pdf_path):
    upload_result = upload_pdf_to_supabase(
        pdf_path=pdf_path,
        user_id=1,
        file_name="dbias_report.pdf"
    )
    
    if upload_result.get("success"):
        print("✅ PDF uploaded to Supabase!")
        print(f"  Public URL: {upload_result.get('public_url')}")
```

## 🔧 Required Environment Variables

Make sure your `.env` file contains:
```env
SUPABASE_URL=https://gzsirwawbmzzjomgbplm.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_BUCKET=pdf_bias_report
```

## 📊 Database Tables Used

### `users`
- Queried to verify connection
- Fields: `id`, `email`, `created_at`

### `session_logs`
- Test connection logs inserted here
- Fields: `action`, `details`, `created_at`

### `reports`
- PDF report metadata stored here
- Fields: `id`, `user_id`, `report_name`, `report_url`, `created_at`

## 🪣 Storage Bucket Structure

```
pdf_bias_report/
└── user_{user_id}/
    └── {timestamp}_{filename}.pdf
```

Example:
```
pdf_bias_report/
└── user_1/
    └── 20251107_143022_dbias_report.pdf
```

## 🎯 Complete Workflow

When you run `test_backend.py`:

1. ✅ Loads environment variables from `.env`
2. ✅ Initializes Supabase client
3. ✅ Tests Supabase connection (fetches users, logs test entry)
4. ✅ Runs bias analysis (existing functionality)
5. ✅ Generates PDF report (existing functionality)
6. ✅ **NEW**: Uploads PDF to Supabase Storage
7. ✅ **NEW**: Creates database record in `reports` table
8. ✅ Displays all results including public URL

## 🛡️ Error Handling

All Supabase operations include:
- ✅ Try/except blocks with detailed error messages
- ✅ Traceback printing for debugging
- ✅ Graceful degradation (script continues if Supabase fails)
- ✅ Clear console logging with emojis for visibility

## 📝 Usage Example

```bash
# Make sure backend is running
cd d-bias/backend
python app.py

# In another terminal, run the test script
cd tests
python test_backend.py
```

**Expected Output**:
```
✅ Supabase client initialized successfully

🔌 Testing Supabase connection...
📥 Fetching users from database...
✅ Found 2 user(s) in database:
  - ID: 1, Email: test@example.com, Created: 2025-01-05T10:30:00
  - ID: 2, Email: admin@example.com, Created: 2025-01-06T14:20:00

📝 Inserting test entry into session_logs...
✅ Test log entry created: [{'id': 123, 'action': 'test_connection', ...}]
✅ Supabase connection test passed!

... [bias analysis output] ...

============================================================
📄 Generating PDF Report...
============================================================
Generated PDF report: C:\...\dbias_report.pdf

============================================================
☁️ Uploading to Supabase...
============================================================

📤 Uploading PDF to Supabase Storage...
  Bucket: pdf_bias_report
  Path: user_1/20251107_143022_dbias_report.pdf
✅ PDF uploaded successfully!
  Public URL: https://gzsirwawbmzzjomgbplm.supabase.co/storage/v1/...

📝 Creating record in reports table...
✅ Report record created:
  Report ID: 42
  User ID: 1
  Report Name: dbias_report.pdf
  Storage Path: user_1/20251107_143022_dbias_report.pdf

✅ PDF successfully uploaded to Supabase!
  Storage Path: user_1/20251107_143022_dbias_report.pdf
  Public URL: https://...
```

## 🔍 Troubleshooting

### "Supabase credentials not found"
- Check that `.env` file exists in `d-bias/backend/`
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set

### "Bucket not found" error
- Ensure bucket `pdf_bias_report` exists in Supabase Storage
- Check bucket permissions (should allow uploads)

### "Table does not exist" errors
- Verify tables `users`, `session_logs`, and `reports` exist
- Check table schemas match expected fields

## ✨ Benefits

1. **Non-Breaking**: All original functionality preserved
2. **Cloud Storage**: PDFs automatically backed up to Supabase
3. **Database Tracking**: All reports logged with metadata
4. **Testable**: Connection test verifies setup before analysis
5. **Debuggable**: Detailed logging at every step
6. **Shareable**: Public URLs generated for easy sharing
