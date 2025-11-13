from app import app
from io import BytesIO
import os
import re



filepath = "C:\\Users\\ACER\\Documents\\_Projects\\D-BIAS\\d-bias\\_data\\sample_datasets\\lifestyle.csv"


class BackendTester:
    def __init__(self, csv_path=filepath):
        self.csv_path = os.path.abspath(csv_path)
        self.client = app.test_client()

    def load_csv_bytes(self):
        with open(self.csv_path, "rb") as f:
            return f.read()

    def test_analyze(self):
        print("...analyzing")
        csv_bytes = self.load_csv_bytes()
        data = {
            "file": (BytesIO(csv_bytes), os.path.basename(self.csv_path)),
            "run_gemini": "true",
            "return_plots": "both",
        }
        resp = self.client.post("/api/analyze", content_type="multipart/form-data", data=data)
        print("\nANALYZE /api/analyze with Gemini Response:", resp.status_code)
        if resp.status_code != 200:
            print(resp.json)
            return

        result_json = resp.json
        print("Fairness score:", result_json.get("fairness_score"))
        print("Total biases detected:", result_json.get("total_biases"))
        print("Overall Reliability:", result_json.get("reliability"))

        # Print mapped biases with Gemini explanations
        mapped = result_json.get("mapped_biases", [])
        print(f"Mapped biases returned: {len(mapped)}")
        if not mapped:
            print("No mapped biases returned.")
            return
    def run_all(self):
        self.test_analyze()


if __name__ == "__main__":
    tester = BackendTester()
    tester.run_all()
