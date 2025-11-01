import io
import json
import os

import pandas as pd
import plotly.express as px
import requests
import streamlit as st
from dotenv import load_dotenv

from utils import pretty_json


load_dotenv()


st.set_page_config(page_title="D-BIAS — Frontend", layout="wide")

BACKEND_DEFAULT = os.getenv("BACKEND_URL", "http://127.0.0.1:5000/api/analyze")


st.title("D-BIAS — Data Bias Identification (Initial Frontend)")
st.markdown("Upload a CSV, analyze dataset fairness, and optionally request an AI (Gemini) summary.")

with st.sidebar:
    st.header("Settings")
    backend_url = st.text_input("Backend analyze URL", value=BACKEND_DEFAULT)
    run_gemini = st.checkbox("Run AI summary (Gemini)", value=False)
    max_preview_rows = st.number_input("Preview rows", min_value=5, max_value=500, value=10)
    st.write("\n")


uploaded_file = st.file_uploader("Upload CSV file", type=["csv"])

if uploaded_file is not None:
    try:
        raw = uploaded_file.getvalue()
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        st.error(f"Could not read CSV: {e}")
        st.stop()

    st.subheader("Dataset preview")
    st.dataframe(df.head(int(max_preview_rows)))

    st.info(f"Rows: {df.shape[0]} — Columns: {df.shape[1]}")

    if st.button("Analyze with backend"):
        with st.spinner("Uploading and analyzing..."):

            try:
                # Normalize backend URL: accept either a full analyze URL or just the host/base API
                if backend_url.rstrip("/").endswith("/api/analyze"):
                    analyze_url = backend_url.rstrip("/")
                elif backend_url.rstrip("/").endswith("/api"):
                    analyze_url = backend_url.rstrip("/") + "/analyze"
                else:
                    # assume user may have provided only host like http://127.0.0.1:5000
                    analyze_url = backend_url.rstrip("/") + "/api/analyze"

                st.write(f"Posting to: `{analyze_url}`")

                files = {"file": (uploaded_file.name, io.BytesIO(raw), "text/csv")}
                data = {"run_gemini": "true" if run_gemini else "false"}

                resp = requests.post(analyze_url, files=files, data=data, timeout=120)

                if resp.status_code != 200:
                    st.error(f"Backend error {resp.status_code}: {resp.text}")
                else:
                    result = resp.json()

                    st.success("Analysis complete")

                    col1, col2 = st.columns([1, 2])

                    with col1:
                        st.metric("Fairness score", value=result.get("fairness_score", "N/A"))
                        st.markdown("**AI Summary**")
                        summary = result.get("summary") or "(no AI summary returned)"
                        st.write(summary)

                    with col2:
                        st.markdown("**Bias report (raw)**")
                        st.json(result.get("bias_report", {}))

                    st.markdown("---")
                    st.markdown("### Quick visual: column counts")
                    try:
                        # pick a categorical-ish column for demo
                        if df.shape[1] > 0:
                            cat = df.columns[0]
                            vc = df[cat].value_counts().reset_index()
                            vc.columns = [cat, "count"]
                            fig = px.bar(vc.head(20), x=cat, y="count", title=f"Value counts — {cat}")
                            st.plotly_chart(fig, use_container_width=True)
                    except Exception:
                        st.info("Could not produce quick visual from dataset")

                    st.markdown("---")
                    st.markdown("#### Full backend JSON response")
                    st.code(pretty_json(result), language="json")

            except requests.exceptions.RequestException as e:
                st.error(f"Request failed: {e}")
            except Exception as e:
                st.error(f"Unexpected error: {e}")

else:
    st.info("Upload a CSV from the left to get started.")
