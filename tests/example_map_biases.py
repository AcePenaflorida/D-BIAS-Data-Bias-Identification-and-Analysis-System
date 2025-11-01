"""Example: use the heart dataset and the bias_mapper to produce a mapped structure.

This script does the following:
 - loads the heart dataset CSV from `d-bias/_data/heart_disease_cleaned.csv`
 - builds a `BiasDetector` to generate the structured `bias_report`
 - synthesizes a simple Markdown-like `ai_text` from the report (for demo)
 - imports and calls `map_biases(bias_report, ai_text)` and prints the result

Notes:
 - This script avoids writing any files and only prints to stdout.
 - It manipulates sys.path so modules in `d-bias/backend` can be imported as plain modules
   (the package folder contains a hyphen which is not importable as a package name).

Example usage (from project root):
  python tests/example_map_biases.py

If you prefer to import the mapper as a package, adapt your PYTHONPATH so the
`d-bias` directory is importable under a valid package name.
"""
from __future__ import annotations

import os
import sys
import json
import os as _os
import pandas as pd

# Make backend modules importable (we add the backend dir to sys.path)
HERE = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "d-bias", "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Try to load environment variables from a .env file in the tests folder (useful locally)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(HERE, '.env'))
except Exception:
    # dotenv not installed or .env missing — that's fine, we'll continue
    pass

# Import detector and mapper from the backend directory
try:
    from bias_detector import BiasDetector
except Exception as e:
    raise RuntimeError(f"Could not import BiasDetector from backend: {e}")

try:
    from bias_mapper import map_biases
except Exception as e:
    raise RuntimeError(f"Could not import map_biases from backend: {e}")

# Try to import GeminiConnector (optional)
try:
    from gemini_connector import GeminiConnector
except Exception:
    GeminiConnector = None


CSV_PATH = os.path.join(PROJECT_ROOT, "d-bias", "_data", "heart_disease_cleaned.csv")


def synthesize_ai_markdown(bias_report: list) -> str:
    """Create a simple Markdown-like explanation from a bias_report for demo purposes.

    Real AI text will be richer; this is only to demonstrate `map_biases` behavior.
    """
    lines = []
    for i, issue in enumerate(bias_report, start=1):
        t = issue.get("Type") or issue.get("type") or "Issue"
        feat = issue.get("Feature") or issue.get("feature") or ""
        desc = issue.get("Description") or issue.get("description") or ""
        header = f"### **{i}. {t}: `{feat}`**"
        body = desc or "No additional explanation provided."
        lines.append(header)
        lines.append("")
        lines.append(body)
        lines.append("")

    # overall
    lines.append("### Overall Assessment and Recommendations")
    if bias_report:
        lines.append(f"The dataset contains {len(bias_report)} detected potential bias issues. Review the items above and consider rebalancing, collecting more data, or removing problematic features before modeling.")
    else:
        lines.append("No major biases detected — dataset appears balanced.")

    return "\n".join(lines)


def main():
    if not os.path.exists(CSV_PATH):
        print(f"Dataset not found: {CSV_PATH}")
        return

    # load data
    df = pd.read_csv(CSV_PATH)

    # create detector and generate bias_report
    detector = BiasDetector(df)
    bias_report = detector.generate_bias_report()

    # Obtain AI explanation: prefer Gemini if API key present and connector available
    api_key = _os.getenv("GEMINI_API_KEY")
    if api_key and GeminiConnector is not None:
        try:
            gem = GeminiConnector(api_key)
            ai_text = gem.summarize_biases(bias_report, dataset_name="heart_disease_cleaned.csv", shape=df.shape)
        except Exception as e:
            print(f"Gemini summarization failed, falling back to local synthesize: {e}")
            ai_text = synthesize_ai_markdown(bias_report)
    else:
        ai_text = synthesize_ai_markdown(bias_report)

    # call mapper
    mapped = map_biases(bias_report, ai_text)

    # Create a global overall breakdown: try to extract assessment / fairness / conclusion
    overall_text = mapped.get("overall", {}).get("assessment") or ai_text or ""

    def extract_overall_parts(text: str) -> dict:
        # look for key phrases and split; fallback to putting full text into 'conclusion'
        parts = {"assessment": None, "fairness": None, "conclusion": None}
        if not text:
            return parts

        lower = text.lower()
        # heuristics: split by known headings
        if "overall reliability" in lower or "reliability" in lower:
            # try to find 'reliability' paragraph
            m = re.search(r"(overall reliability[\s\S]+?)(?:\n\n|$)", text, flags=re.I)
            if m:
                parts["assessment"] = m.group(1).strip()

        if "fairness" in lower or "ethical" in lower:
            m = re.search(r"(fairness[\s\S]+?)(?:\n\n|$)", text, flags=re.I)
            if m:
                parts["fairness"] = m.group(1).strip()

        # concluding summary
        if "concluding" in lower or "conclusion" in lower:
            m = re.search(r"(conclud(?:ing|e|ion)[\s\S]+)$", text, flags=re.I)
            if m:
                parts["conclusion"] = m.group(1).strip()

        # fallback: place full text in conclusion if nothing found
        if not any(parts.values()):
            parts["conclusion"] = text.strip()

        return parts

    import re

    overall_parts = extract_overall_parts(overall_text)

    # print nicely
    print("\n=== MAPPED BIAS OUTPUT ===\n")
    print(json.dumps(mapped, indent=2, ensure_ascii=False))

    print("\n=== HARDCODED [OVERALL BREAKDOWN] ===\n")
    print("Assessment:\n", overall_parts.get("assessment") or "(none)")
    print("\nFairness:\n", overall_parts.get("fairness") or "(none)")
    print("\nConclusion:\n", overall_parts.get("conclusion") or "(none)")


if __name__ == "__main__":
    main()
