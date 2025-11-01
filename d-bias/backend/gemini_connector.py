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
        You are a professional data analyst AI.
        Explain detected dataset biases and their implications.

        Dataset: {dataset_name}{shape_info}{excluded_info}
        Detected Biases: {bias_report}

        Please include:
        1. Meaning
        2. Harm
        3. Impact
        4. Severity
        5. Fix
        Then add:
        - Overall reliability
        - Fairness and ethical implications
        - Concluding summary of dataset fairness.
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
