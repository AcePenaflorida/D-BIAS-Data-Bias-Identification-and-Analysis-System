# 🚀 Quick Start Checklist - Supabase Integration

## Before Running `test_backend.py`

### 1️⃣ Backend Requirements
- [ ] Flask backend is running (`python d-bias/backend/app.py`)
- [ ] Backend is accessible at `http://127.0.0.1:5000`

### 2️⃣ Environment Variables
- [ ] `.env` file exists at `d-bias/backend/.env`
- [ ] `SUPABASE_URL` is set
- [ ] `SUPABASE_SERVICE_KEY` is set (not the anon key!)
- [ ] `SUPABASE_BUCKET` is set to `pdf_bias_report`

### 3️⃣ Supabase Setup

#### Storage Bucket
- [ ] Bucket `pdf_bias_report` exists in Supabase Storage
- [ ] Bucket is set to **public** (for public URLs) OR **private** with proper RLS policies
- [ ] Service role can write to the bucket

#### Database Tables

**`users` table:**
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`session_logs` table:**
```sql
CREATE TABLE session_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`reports` table:**
```sql
CREATE TABLE reports (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  report_name TEXT NOT NULL,
  report_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4️⃣ Python Dependencies
All dependencies should already be installed from `backend/requirements.txt`:
- [ ] `supabase` (supabase-py)
- [ ] `python-dotenv`
- [ ] `requests`
- [ ] `reportlab` (for PDF generation)

To verify/install:
```bash
pip install supabase python-dotenv requests reportlab
```

### 5️⃣ Test Data
- [ ] At least one user exists in the `users` table
- [ ] Test dataset is available at the path specified in `test_backend.py`

Quick insert test user:
```sql
INSERT INTO users (email) VALUES ('test@example.com');
```

## Running the Script

### Option 1: Full Test (with backend running)
```bash
# Terminal 1: Start backend
cd d-bias/backend
python app.py

# Terminal 2: Run test
cd tests
python test_backend.py
```

### Option 2: Test Supabase Only
If you want to test just the Supabase functions without running the full analysis:

```python
# Create a simple test script: tests/test_supabase_only.py
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# Load env
load_dotenv(os.path.join("..", "d-bias", "backend", ".env"))

# Initialize client
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

# Test connection
print("Testing Supabase connection...")
users = supabase.table("users").select("*").execute()
print(f"✅ Found {len(users.data)} users")

# Test log insertion
log = supabase.table("session_logs").insert({
    "action": "manual_test",
    "details": {"test_time": datetime.now().isoformat()}
}).execute()
print(f"✅ Created log entry: {log.data}")
```

## Expected Behavior

### ✅ Success Indicators
- `✅ Supabase client initialized successfully`
- `✅ Found X user(s) in database`
- `✅ Test log entry created`
- `✅ Supabase connection test passed!`
- `✅ PDF uploaded successfully!`
- `✅ Report record created`

### ⚠️ Warning Signs
- `⚠️ Supabase credentials not found in .env file`
  → Check .env file location and contents
  
- `⚠️ Failed to initialize Supabase client`
  → Verify SUPABASE_URL and SUPABASE_SERVICE_KEY
  
- `❌ Supabase client not initialized`
  → Script will continue but skip Supabase operations

### 🔴 Error Messages
- `Failed to upload PDF to Supabase: 'Bucket not found'`
  → Create the bucket in Supabase Storage
  
- `Failed to upload PDF to Supabase: permission denied`
  → Check service role permissions or RLS policies
  
- `relation "users" does not exist`
  → Create the required database tables

## Verification Steps

After running the script successfully:

1. **Check Supabase Storage**
   - Navigate to Storage → `pdf_bias_report` bucket
   - Verify folder `user_1` exists
   - Verify PDF file with timestamp exists

2. **Check Database Records**
   ```sql
   -- Check session logs
   SELECT * FROM session_logs 
   WHERE action = 'test_connection' 
   ORDER BY created_at DESC 
   LIMIT 5;
   
   -- Check reports
   SELECT * FROM reports 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

3. **Test Public URL**
   - Copy the public URL from the script output
   - Open in browser
   - Verify PDF downloads/displays correctly

## Troubleshooting Commands

```bash
# Verify .env file location
ls -la d-bias/backend/.env

# Check Python can find modules
python -c "from supabase import create_client; print('OK')"

# Test environment variables
python -c "from dotenv import load_dotenv; import os; load_dotenv('d-bias/backend/.env'); print(os.getenv('SUPABASE_URL'))"

# Verify backend is running
curl http://127.0.0.1:5000/api/analyze

# Check file permissions
ls -la d-bias/_data/program_generated_files/
```

## Quick Fixes

### Fix: "Module not found: supabase"
```bash
pip install supabase
```

### Fix: "Module not found: dotenv"
```bash
pip install python-dotenv
```

### Fix: Backend not responding
```bash
cd d-bias/backend
python app.py
# Check console for errors
```

### Fix: .env not loading
Make sure the path is correct:
```python
# In test_backend.py, verify this line:
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "d-bias", "backend", ".env"))
```

## Support

If issues persist:
1. Check the full error traceback in console
2. Verify Supabase project is active (not paused)
3. Check Supabase service role key has proper permissions
4. Review `SUPABASE_INTEGRATION_NOTES.md` for detailed documentation
