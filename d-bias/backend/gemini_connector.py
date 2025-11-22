
import json
import os
import time
import random
from datetime import datetime, timedelta
from supabase import create_client, Client
from google import generativeai as genai

# --- GeminiKeyManager for Supabase key rotation ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

class GeminiKeyManager:
    def __init__(self, log=None):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        self.keys = []
        self.last_used = {}
        self.log = log or (lambda msg: print(f"[GeminiKeyManager] {msg}"))

    def fetch_active_keys(self):
        now = datetime.utcnow().isoformat()
        response = self.supabase.table("gemini_api_keys").select("*").eq("is_active", True).or_(
            f"cooldown_until.is.null,cooldown_until.lt.{now}"
        ).execute()
        self.keys = response.data or []
        self.log(f"Fetched {len(self.keys)} active Gemini keys")
        return self.keys

    def get_next_key(self):
        self.fetch_active_keys()
        # Sort by last used (LRU), fallback to round-robin
        sorted_keys = sorted(self.keys, key=lambda k: self.last_used.get(k["id"], 0))
        for key in sorted_keys:
            key_id = key["id"]
            cooldown_until = key.get("cooldown_until")
            if not cooldown_until or datetime.fromisoformat(cooldown_until) < datetime.utcnow():
                self.last_used[key_id] = time.time()
                self.log(f"Using Gemini key: {key_id} ({key.get('label', '')})")
                return key
        self.log("No available Gemini keys (all on cooldown)")
        return None

    def set_cooldown(self, key_id, seconds):
        until = datetime.utcnow() + timedelta(seconds=seconds)
        self.supabase.table("gemini_api_keys").update({"cooldown_until": until.isoformat()}).eq("id", key_id).execute()
        self.log(f"Set cooldown for key {key_id} for {seconds}s (until {until.isoformat()})")

    def handle_rate_limit(self, key, retry_after):
        key_id = key["id"]
        self.set_cooldown(key_id, retry_after)
        self.log(f"Rate limit hit for key {key_id}, retry_after={retry_after}s")


class GeminiConnector:
    """Summarizes bias results using Gemini 2.5 Pro, with key rotation via GeminiKeyManager."""
    def __init__(self, api_key: str = None, key_manager: GeminiKeyManager = None, log=None):
        self.api_key = api_key
        self.key_manager = key_manager
        self.log = log or (lambda msg: print(f"[GeminiConnector] {msg}"))
        # Optional callable returning True when a cancel has been requested.
        # Callers (e.g. app.analyze) may set `connector.cancel_requested = lambda: CANCEL_REQUESTED`.
        self.cancel_requested = lambda: False
        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel("models/gemini-2.5-pro")
        else:
            self.model = None

    def _extract_text(self, response):
        if response is None:
            return "⚠️ Empty response from Gemini."
        if hasattr(response, "text") and response.text:
            return response.text.strip()
        if hasattr(response, "candidates") and response.candidates:
            try:
                parts = response.candidates[0].content.parts
                if parts and hasattr(parts[0], "text"):
                    return parts[0].text.strip()
            except Exception:
                pass
        try:
            return json.dumps(response, indent=2, default=str)[:2000]
        except Exception:
            return str(response)

    def summarize_biases(self, bias_report, dataset_name="Dataset", shape=None, excluded_columns=None, use_multi_key=False, max_retries=3):
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

        if not use_multi_key:
            if not self.api_key:
                raise ValueError("❌ Gemini API key not found.")
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("models/gemini-2.5-pro")
            try:
                response = self.model.generate_content(prompt)
                self.log("Gemini response received (single key)")
                summary_text = self._extract_text(response)
                return summary_text or "⚠️ Gemini returned no summary text."
            except Exception as e:
                return f"❌ Gemini error: {str(e)}"
        else:
            # Multi-key rotation logic
            if not self.key_manager:
                raise ValueError("GeminiKeyManager required for multi-key usage.")
            attempt = 0
            while attempt < max_retries:
                # Respect cooperative cancellation if requested by caller
                try:
                    if callable(getattr(self, "cancel_requested", None)) and self.cancel_requested():
                        self.log("Gemini summarize canceled by request")
                        return "Analysis canceled by user."
                except Exception:
                    pass
                key = self.key_manager.get_next_key()
                if not key:
                    self.log("All Gemini keys on cooldown, cannot proceed")
                    return "All Gemini keys are temporarily rate-limited. Please try again later."
                gemini_key = key["api_key"]
                genai.configure(api_key=gemini_key)
                self.model = genai.GenerativeModel("models/gemini-2.5-pro")
                try:
                    # Check cancellation immediately before making the external call
                    if callable(getattr(self, "cancel_requested", None)) and self.cancel_requested():
                        self.log("Gemini summarize canceled by request (pre-call)")
                        return "Analysis canceled by user."
                    response = self.model.generate_content(prompt)
                    self.log(f"Gemini response received (key {key['id']})")
                    summary_text = self._extract_text(response)
                    # Check for rate-limit in output
                    if isinstance(summary_text, str) and ("rate limit" in summary_text.lower() or "429" in summary_text.lower()):
                        retry_after = self._parse_retry_after_seconds_from_error_text(summary_text)
                        if retry_after is None:
                            retry_after = 20
                        self.key_manager.handle_rate_limit(key, retry_after)
                        attempt += 1
                        jitter = random.uniform(0.5, 2.0)
                        self.log(f"Retrying with next key after {retry_after + jitter}s (attempt {attempt})")
                        time.sleep(jitter)
                        continue
                    self.log(f"Gemini summary success with key {key['id']}")
                    return summary_text
                except Exception as e:
                    self.log(f"Gemini call failed for key {key['id']}: {e}")
                    attempt += 1
                    continue
            self.log("All Gemini keys failed or rate-limited after retries")
            return "All Gemini keys are temporarily unavailable. Please try again later."

    def _parse_retry_after_seconds_from_error_text(self, text: str):
        if not text:
            return None
        import re
        m = re.search(r"retry_delay\\s*\\{[^}]*seconds\\s*:\\s*(\\d+)", text, re.IGNORECASE | re.DOTALL)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                pass
        m = re.search(r"Please\\s+retry\\s+in\\s+([0-9]+(?:\\.[0-9]+)?)s", text, re.IGNORECASE)
        if m:
            try:
                secs = float(m.group(1))
                return max(1, int(round(secs)))
            except Exception:
                pass
        return None
