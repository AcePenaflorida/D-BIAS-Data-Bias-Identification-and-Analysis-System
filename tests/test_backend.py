import requests
import json
import base64
import os
import webbrowser

# Endpoint of your Flask backend
url = "http://127.0.0.1:5000/api/analyze"

# Your dataset path (change if needed)
file_path = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\heart_disease_cleaned.csv"

print("📤 Sending dataset to backend...")

# Upload + analyze
with open(file_path, "rb") as f:
    # request both AI summary and visualizations (both JSON and PNG)
    response = requests.post(url, files={"file": f}, data={"run_gemini": "true", "return_plots": "both"}, timeout=120)

# Display the results
if response.status_code == 200:
    data = response.json()

    print("\n✅ Bias Analysis Complete!")
    print(f"Fairness Score: {data.get('fairness_score')}")

    print("\n--- Bias Report ---")
    print((data.get("bias_report") if data.get("bias_report") is not None else "No bias_report returned by backend."))

    print("\n--- Dataset Summary ---")
    print(data.get("dataset_summary", "No summary available."))
    print("\n--- Reliability ---")
    print(data.get("reliability", "No reliability info available."))

    print("\n--- Gemini Summary ---")
    print(data.get("summary", "No AI summary generated."))
    
    # Display mapped biases (if backend produced them)
    mapped = data.get("mapped_biases")
    print("\n--- MAPPED BIASES ---")
    print(mapped)
    mapped_err = data.get("mapped_biases_error")
    if mapped_err:
        print("\n--- Mapping Error ---")
        print(mapped_err)
    # if mapped:
    #     print("\n--- MAPPED BIASES ---")
    #     try:
    #         bias_types = mapped.get("bias_types", {})
    #         for btype, items in bias_types.items():
    #             print(f"\n== {btype} ==")
    #             for it in items:
    #                 feat = it.get("feature")
    #                 sev = it.get("severity")
    #                 desc = it.get("description")
    #                 ai_ex = it.get("ai_explanation")
    #                 print(f"- {feat} (Severity: {sev})")
    #                 print(f"  Description: {desc}")
    #                 if ai_ex:
    #                     # print a short snippet to keep console readable
    #                     snippet = ai_ex if len(ai_ex) < 800 else ai_ex[:800] + "..."
    #                     print(f"  AI explanation: {snippet}")
    #     except Exception as e:
    #         print(f"Failed to pretty-print mapped_biases: {e}")

        # print overall
        overall = mapped.get("overall", {})
        if overall:
            print("\n--- MAPPED OVERALL ---")
            print("Assessment:\n", overall.get("assessment") or "(none)")
            print("\nFairness:\n", overall.get("fairness") or "(none)")
            print("\nConclusion:\n", overall.get("conclusion") or "(none)")
    # Handle returned visualizations (if any)
    plots = data.get("plots")
    if plots:
        print("\n--- Plots returned by backend ---")
        out_dir = os.path.join(os.getcwd(), "backend_plots")
        os.makedirs(out_dir, exist_ok=True)
        for key, payload in plots.items():
            if payload is None:
                print(f"{key}: no plot available")
                continue

            # Save PNG if present
            png_b64 = None
            if isinstance(payload, dict):
                png_b64 = payload.get("png_base64") or (payload.get("plotly", {}).get("png_base64") if isinstance(payload.get("plotly"), dict) else None)

            if png_b64:
                try:
                    img_bytes = base64.b64decode(png_b64)
                    png_path = os.path.join(out_dir, f"{key}.png")
                    with open(png_path, "wb") as imgf:
                        imgf.write(img_bytes)
                    print(f"Saved PNG: {png_path}")
                    try:
                        webbrowser.open(f"file://{png_path}")
                    except Exception:
                        pass
                except Exception as e:
                    print(f"Failed to write PNG for {key}: {e}")

            # Save Plotly JSON as an HTML file for interactive viewing
            plotly_dict = None
            if isinstance(payload, dict) and payload.get("plotly"):
                plotly_dict = payload.get("plotly")

            if plotly_dict:
                try:
                    html_path = os.path.join(out_dir, f"{key}.html")
                    # simple html wrapper embedding plotly.js and the figure JSON
                    with open(html_path, "w", encoding="utf-8") as hf:
                        hf.write("<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<script src=\"https://cdn.plot.ly/plotly-latest.min.js\"></script>\n</head>\n<body>\n<div id=\"plot\" style=\"width:100%;height:100%\"></div>\n<script>\nconst fig = ")
                        json.dump(plotly_dict, hf)
                        hf.write(";\nPlotly.newPlot('plot', fig.data, fig.layout || {});\n</script>\n</body>\n</html>")
                    print(f"Saved interactive HTML: {html_path}")
                    try:
                        webbrowser.open(f"file://{html_path}")
                    except Exception:
                        pass
                except Exception as e:
                    print(f"Failed to write HTML for {key}: {e}")
else:
    print(f"❌ Error {response.status_code}: {response.text}")
    # If the backend returned JSON with reasons (e.g., validation), try to pretty-print
    try:
        err = response.json()
        print(json.dumps(err, indent=2))
    except Exception:
        pass
