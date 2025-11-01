import requests
import json

# Endpoint of your Flask backend
url = "http://127.0.0.1:5000/api/analyze"

# Your dataset path (change if needed)
file_path = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\heart_disease_cleaned.csv"

print("📤 Sending dataset to backend...")

# Upload + analyze
with open(file_path, "rb") as f:
    response = requests.post(url, files={"file": f}, data={"run_gemini": "true"})

# Display the results
if response.status_code == 200:
    data = response.json()

    print("\n✅ Bias Analysis Complete!")
    print(f"Fairness Score: {data.get('fairness_score')}")

    print("\n--- Bias Report ---")
    print(json.dumps(data.get("bias_report"), indent=2))

    print("\n--- Gemini Summary ---")
    print(data.get("summary", "No AI summary generated."))
else:
    print(f"❌ Error {response.status_code}: {response.text}")
