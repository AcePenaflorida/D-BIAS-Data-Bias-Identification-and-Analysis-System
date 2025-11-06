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
        Write a clear, insightful explanation for a non-technical and technical audience
        Make your response **plain, structured, and data-driven**, including **numerical references, comparisons, and real-world implications**.

        For each bias, explain:
        1. **Meaning:** What the bias indicates in this dataset.
        2. **Harm:** Why it may distort fairness, accuracy, or model reliability.
        3. **Impact:** How it could influence real-world predictions or health outcomes.
        4. **Severity:** Explain what the listed severity means (e.g., High = critical).
        5. **Fix:** Recommend actionable steps to mitigate or reduce it.

        Then provide:
        - **Overall Reliability Assessment:** How trustworthy and balanced the dataset appears.
        - **Fairness & Ethical Implications:** Any concerns regarding underrepresented groups or misclassification risks.
        - **Concluding Summary:** A short paragraph summarizing the dataset’s overall “fairness health score” (qualitative is fine).


          Below is a list of potential biases detected in the dataset:
          {bias_report}
          Also address these dataset aspects:
          1. Data quality and missing values
          2. Sampling imbalance or representation issues
          3. Feature dominance or skew
          4. Strong correlations or target leakage
          5. Outlier risks
          6. Fairness and ethical implications
          7. Severity and potential impact of each bias
          8. Actionable recommendations
          9. Overall reliability
          10. Concluding summary of dataset fairness health

          Then conclude with:
          - **Overall Reliability Assessment:** How trustworthy and balanced the dataset appears.
          - **Fairness & Ethical Implications:** Any underrepresentation or bias concerns.
          - **Concluding Summary:** A short paragraph summarizing the dataset’s overall “fairness health score” (qualitative is fine).
          - **Actionable Recommendations:** Specific steps to improve dataset fairness and mitigate identified biases.  
          

          Write your explanation in a structured, data-driven way — use numerical references, comparisons, and real-world examples to make your insights relatable and understandable.
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
