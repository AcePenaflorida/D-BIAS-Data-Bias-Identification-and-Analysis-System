import json
from google import generativeai as genai

class GeminiConnector:
    """Summarizes bias results using Gemini 2.5 Pro."""
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("❌ Gemini API key not found.")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("models/gemini-2.5-pro")

    def _extract_text(self, response):
        """Safely extract text from any Gemini response structure."""
        if response is None:
            return "⚠️ Empty response from Gemini."

        # Newer SDKs: directly return .text
        if hasattr(response, "text") and response.text:
            return response.text.strip()

        # Older SDKs: use candidates/parts
        if hasattr(response, "candidates") and response.candidates:
            try:
                parts = response.candidates[0].content.parts
                if parts and hasattr(parts[0], "text"):
                    return parts[0].text.strip()
            except Exception:
                pass

        # As fallback, dump raw content as string
        try:
            return json.dumps(response, indent=2, default=str)[:2000]
        except Exception:
            return str(response)

    def summarize_biases(self, bias_report, dataset_name="Dataset", shape=None, excluded_columns=None):
        shape_info = f"\nDataset shape: {shape[0]} rows × {shape[1]} columns." if shape else ""
        excluded_info = f"\nExcluded columns: {excluded_columns}" if excluded_columns else ""
        prompt = f"""
You are a data analyst AI specializing in explaining data bias in simple, human terms.

Below is a list of detected biases from this dataset: {dataset_name}{shape_info}{excluded_info}.

Your goal:
Write a clear, insightful explanation for a non-technical and technical audience.
Make your response **plain, structured, and data-driven**, including **numerical references, comparisons, and real-world implications**.

Requirements for bias explanations:

1. Each detected bias must have a **unique explanation**, written specifically for that instance.
2. Each bias must have a unique **bias_id** (e.g., bias_0001, bias_0002, ...), as listed in {bias_report}.
3. **Do not skip any bias_id**. If a bias has no significant issue, explicitly state:
   "Meaning: No significant bias detected for this feature."
4. Explanations must be context-aware:
   - Consider the **bias type** (e.g., Numeric Correlation, Categorical Imbalance, Outlier Bias)
   - Include **feature(s) involved**
   - Reference **numeric values** (correlation coefficients, outlier percentages, entropy, skew)
   - Reflect **severity** (Low / Moderate / High)
5. Do **not** reuse or generalize explanations across multiple bias entries; each explanation must be specific to the given feature(s) and values.
6. Provide actionable recommendations tailored to the feature(s) and bias severity.

For each bias, use the following structured format:

[bias_id]:
Feature(s): <columns involved>
Bias Type: <type, e.g., Numeric Correlation Bias, Categorical Imbalance, Outlier Bias>
Severity: <Low / Moderate / High>

Meaning: Explain what this bias indicates in this dataset. Include numeric references (e.g., correlation r=0.85, 23.5% outliers, entropy=0.45). If there is no significant issue, write: "No significant bias detected for this feature."
Harm: Explain why this bias may distort fairness, accuracy, or model reliability.
Impact: Describe how it could influence real-world predictions, outcomes, or fairness.
Severity Explanation: Clarify what the listed severity implies (e.g., High = critical, Moderate = noticeable, Low = minor).
Fix: Recommend specific steps to mitigate or reduce this bias.

After all individual bias explanations, include:

- **Overall Reliability Assessment:** Assess how trustworthy and balanced the dataset appears.
- **Fairness & Ethical Implications:** Highlight concerns regarding underrepresented groups or misclassification risks.
- **Concluding Summary:** Summarize the dataset’s overall “fairness health score” qualitatively.
- **Actionable Recommendations:** Provide concrete steps to improve dataset fairness and mitigate the identified biases.

Additionally, consider these dataset aspects in your explanations:
1. Data quality and missing values
2. Sampling imbalance or representation issues
3. Feature dominance or skew
4. Strong correlations or potential target leakage
5. Outlier risks
6. Fairness and ethical implications
7. Severity and potential impact of each bias
8. Actionable recommendations
9. Overall dataset reliability
10. Concluding summary of dataset fairness health

Write your explanation in a **bias-by-bias format**, strictly mapping each explanation to its corresponding [bias_id]. Avoid combining multiple biases into one explanation. Make explanations relatable by including numerical references, comparisons, and real-world examples wherever possible.

**Important:** Even if a bias appears minor or non-existent, provide a complete entry for its [bias_id] with a clear note that no significant issue is detected. This ensures consistent mapping for frontend display.
"""

        try:
            response = self.model.generate_content(prompt)

            # 👀 Log to console for debugging
            print("\n=== Gemini Raw Response ===")
            print(response)
            print("===========================\n")

            summary_text = self._extract_text(response)
            return summary_text or "⚠️ Gemini returned no summary text."
        except Exception as e:
            return f"❌ Gemini error: {str(e)}"
