import requests
import json
import os



# Endpoint of your Flask backend
URL = "http://127.0.0.1:5000/api/analyze"

# Dataset path (change if needed)
FILE_PATH = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\heart_disease_cleaned.csv"

def main():
    if not os.path.exists(FILE_PATH):
        print(f"Dataset not found: {FILE_PATH}")
        return

    print("Uploading dataset and requesting bias report only...")

    with open(FILE_PATH, "rb") as f:
        # request no AI summary and no plots
        resp = requests.post(URL, files={"file": f}, data={"run_gemini": "false", "return_plots": "none"}, timeout=120)

    if resp.status_code != 200:
        print(f"Error {resp.status_code}: {resp.text}")
        try:
            print(json.dumps(resp.json(), indent=2))
        except Exception:
            pass
        return

    data = resp.json()
    bias_report = data.get("bias_report")
    dataset_summary = data.get("dataset_summary")
    reliability = data.get("reliability")

    # Print bias_report (no file writes)
    if bias_report is None:
        print("No bias_report returned by backend.")
        print(json.dumps(data, indent=2))
    else:
        # Print a short summary and each issue in a readable form
        if isinstance(bias_report, list):
            print(f"Bias report contains {len(bias_report)} issue(s)")
            if len(bias_report) == 0:
                print("No issues detected.")
            else:
                print("\n--- Issues ---")
                for i, issue in enumerate(bias_report, start=1):
                    if isinstance(issue, dict):
                        print(f"{i}. [{issue.get('Type', 'Issue')}] {issue.get('Feature', '')}")
                        desc = issue.get('Description') or issue.get('description')
                        if desc:
                            print(f"    Description: {desc}")
                        sev = issue.get('Severity') or issue.get('severity')
                        if sev:
                            print(f"    Severity: {sev}")
                    else:
                        print(f"{i}. {issue}")
        else:
            print("bias_report returned in unexpected format:")
            print(json.dumps(bias_report, indent=2))

    # Print the formatted reporter.summary() (dataset_summary)
    print("\n--- Dataset Summary (BiasReporter.summary()) ---")
    if dataset_summary:
        print(dataset_summary)
    else:
        print("No dataset_summary returned by backend.")

    # Print reliability info if present
    print("\n--- Reliability ---")
    if reliability:
        print(json.dumps(reliability, indent=2))
    else:
        print("No reliability info returned by backend.")


if __name__ == "__main__":
    main()
