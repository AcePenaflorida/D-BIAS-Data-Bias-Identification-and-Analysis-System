import json
import os
import time
import random
from datetime import datetime, timedelta, timezone
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

    def _parse_dt(self, value):
        """Parse ISO timestamp safely, handling 'Z' and timezone offsets."""
        if not value:
            return None
        try:
            # Normalize: replace space with 'T', fix '+00' to '+00:00', and handle trailing 'Z'
            v = str(value).strip()
            v = v.replace(" ", "T")
            if v.endswith("+00"):
                v = v + ":00"
            if v.endswith("Z"):
                v = v.replace("Z", "+00:00")
            dt = datetime.fromisoformat(v)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    def _now_utc(self):
        return datetime.now(timezone.utc)

    def fetch_active_keys(self):
        now = self._now_utc().isoformat()
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
            cooldown_until = self._parse_dt(key.get("cooldown_until"))
            now = self._now_utc()
            if (not cooldown_until) or (cooldown_until < now):
                self.last_used[key_id] = time.time()
                self.log(f"Using Gemini key: {key_id} ({key.get('label', '')})")
                return key
        self.log("No available Gemini keys (all on cooldown)")
        return None

    def available_keys(self):
        """Return keys that are active and not on cooldown (no quota check)."""
        now = self._now_utc()
        self.fetch_active_keys()
        usable = []
        for key in self.keys:
            cooldown_until = self._parse_dt(key.get("cooldown_until"))
            if (not cooldown_until) or (cooldown_until < now):
                usable.append(key)
        self.log(f"Available keys (not on cooldown): {len(usable)}/{len(self.keys)}")
        return usable

    def any_available(self):
        """Shortcut to check if any key is eligible (no quota check)."""
        return len(self.available_keys()) > 0

    def ping_key(self, key, model_name="models/gemini-2.5-flash"):
        """Lightweight availability check against Gemini; sets cooldown on quota errors."""
        api_key = key.get("api_key") if isinstance(key, dict) else None
        key_id = key.get("id") if isinstance(key, dict) else None
        if not api_key:
            self.log(f"Ping skipped: key missing api_key field: {key}")
            return False
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            model.generate_content("ping")
            self.log(f"Ping success for key {key_id} using {model_name}")
            return True
        except Exception as e:
            lower = str(e).lower()
            retry_after = None
            if "limit: 0" in lower:
                retry_after = 900
            elif ("rate limit" in lower) or ("quota exceeded" in lower) or ("429" in lower):
                retry_after = 60
            if retry_after:
                try:
                    self.handle_rate_limit(key, retry_after)
                except Exception:
                    pass
            self.log(f"Ping failed for key {key_id}: {e}")
            return False

    def set_cooldown(self, key_id, seconds):
        until = self._now_utc() + timedelta(seconds=seconds)
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
        self.cancel_requested = lambda: False

        # In multi-key mode we expect key_manager; allow init without api_key in that case.
        if not api_key and not key_manager:
            self.log("No API key or key manager provided. Gemini is disabled.")
            self.model = None
            return
        if not api_key and key_manager:
            self.log("Initialized in multi-key mode (api_key not provided; will pull from key manager).")
            self.model = None
            return

        # Configure API
        genai.configure(api_key=api_key)

        # Ordered fallback list (most capable → least capable)
        MODEL_CANDIDATES = [
            "models/gemini-3.0-pro",
            "models/gemini-3.0-flash",
            "models/gemini-2.5-pro",
            "models/gemini-2.5-flash",
            "models/gemini-2.0-flash",
        ]

        self.model = None

        for model_name in MODEL_CANDIDATES:
            try:
                self.log(f"Trying model: {model_name}")
                model = genai.GenerativeModel(model_name)

                # Simple test call (very cheap) to confirm it works
                model.generate_content("ping")
                self.model = model
                self.log(f"Successfully initialized model: {model_name}")
                break

            except Exception as e:
                self.log(f"Model {model_name} failed: {e}")

        if not self.model:
            self.log("ERROR: No Gemini model could be initialized. Check your API key or quota.")

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

    def summarize_biases(self, bias_report, dataset_name="Dataset", shape=None, excluded_columns=None, use_multi_key=False, max_retries=8):
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

**Important:** Even if a bias appears repetitive, minor or non-existent, provide a complete entry for its [bias_id] with a clear note that no significant issue is detected. This ensures consistent mapping for frontend display.
"""

        # Lightweight context logging for observability
        try:
            bias_count = len(bias_report) if hasattr(bias_report, "__len__") else "unknown"
        except Exception:
            bias_count = "unknown"
        self.log(
            f"summarize_biases start dataset={dataset_name} biases={bias_count} "
            f"shape={shape} excluded={excluded_columns} multi_key={use_multi_key}"
        )
        self.log(f"prompt_length={len(prompt)} chars")

        preferred_model = os.getenv("GEMINI_MODEL", "models/gemini-3.0-pro")
        fallback_model = "models/gemini-2.5-pro"
        # Prefer flash variants first to reduce quota burn and avoid free-tier daily caps on pro.
        model_candidates = [
            "models/gemini-3.0-flash",
            "models/gemini-2.5-flash",
            preferred_model,
            "models/gemini-3.0-pro",
            "models/gemini-2.5-pro",
            "models/gemini-2.0-flash",
        ]

        def _pick_model():
            last_err = None
            for name in model_candidates:
                try:
                    self.log(f"Trying Gemini model: {name}")
                    return genai.GenerativeModel(name)
                except Exception as e:
                    last_err = e
                    self.log(f"Model {name} failed: {e}")
            if last_err:
                raise last_err
            raise RuntimeError("No Gemini model could be initialized")

        if not use_multi_key:
            if not self.api_key:
                self.log("single-key mode requested but api_key missing")
                raise ValueError("❌ Gemini API key not found.")
            genai.configure(api_key=self.api_key)
            try:
                self.model = _pick_model()
                self.log(f"Using Gemini model (single-key): {self.model.model_name}")
                response = self.model.generate_content(prompt)
                self.log("Gemini response received (single key)")
                summary_text = self._extract_text(response)
                if not summary_text:
                    self.log("Gemini returned empty summary text (single key)")
                return summary_text or "⚠️ Gemini returned no summary text."
            except Exception as e:
                self.log(f"Gemini single-key error: {e}")
                return f"❌ Gemini error: {str(e)}"
        else:
            # Multi-key rotation logic
            if not self.key_manager:
                self.log("multi-key mode requested but key_manager missing")
                raise ValueError("GeminiKeyManager required for multi-key usage.")
            attempt = 0
            limit_zero_hits = 0  # Track "limit: 0" responses that likely indicate project-wide free-tier exhaustion
            max_limit_zero_hits = 2
            while attempt < max_retries:
                attempt += 1
                # Respect cooperative cancellation if requested by caller
                try:
                    if callable(getattr(self, "cancel_requested", None)) and self.cancel_requested():
                        self.log("Gemini summarize canceled by request")
                        return "Analysis canceled by user."
                except Exception:
                    pass
                key = self.key_manager.get_next_key()
                if not key:
                    self.log("All Gemini keys on cooldown or unavailable; aborting")
                    return "All Gemini keys are temporarily rate-limited. Please try again later."
                gemini_key = key.get("api_key")
                if not gemini_key:
                    self.log(f"Key object missing api_key field: {key}")
                    continue
                genai.configure(api_key=gemini_key)
                try:
                    self.model = _pick_model()
                    self.log(f"Using Gemini model: {self.model.model_name}")
                    # Check cancellation immediately before making the external call
                    if callable(getattr(self, "cancel_requested", None)) and self.cancel_requested():
                        self.log("Gemini summarize canceled by request (pre-call)")
                        return "Analysis canceled by user."
                    self.log(f"Gemini call attempt={attempt}/{max_retries} using key_id={key.get('id')} label={key.get('label')}")
                    response = self.model.generate_content(prompt)
                    self.log(f"Gemini response received (key {key.get('id')})")
                    summary_text = self._extract_text(response)
                    # Check for rate-limit in output
                    if isinstance(summary_text, str):
                        lower = summary_text.lower()
                        if ("rate limit" in lower) or ("429" in lower) or ("quota exceeded" in lower) or ("limit: 0" in lower):
                            retry_after = self._parse_retry_after_seconds_from_error_text(summary_text)
                            if retry_after is None:
                                # If the key shows limit: 0 (free-tier exhausted), back off longer to avoid thrash.
                                retry_after = 900 if "limit: 0" in lower else 45
                            self.key_manager.handle_rate_limit(key, retry_after)
                            if "limit: 0" in lower:
                                limit_zero_hits += 1
                                self.log(f"Detected limit:0 quota exhaustion (hit {limit_zero_hits}/{max_limit_zero_hits}); treating as project-level free-tier cap")
                                if limit_zero_hits >= max_limit_zero_hits:
                                    return "Gemini quota is exhausted for this project (free-tier limit:0). Bias explanations were skipped."
                            # Increase jitter slightly by attempt to stagger retries across many keys
                            jitter = random.uniform(1.0, 3.0) + (attempt * 0.25)
                            self.log(
                                f"Rate-limit/quota signal in response; retry_after={retry_after}s jitter={round(jitter,2)}s "
                                f"attempt={attempt}/{max_retries}"
                            )
                            time.sleep(jitter)
                            continue
                    if not summary_text:
                        self.log("Gemini returned empty summary text (multi-key)")
                    else:
                        self.log(f"Gemini summary success with key {key.get('id')} length={len(summary_text)}")
                    return summary_text
                except Exception as e:
                    self.log(f"Gemini call failed for key {key.get('id')}: {e}")
                    try:
                        lower_err = str(e).lower()
                        # If quota exhausted (limit: 0), back off longer to let daily limits reset
                        backoff = 900 if "limit: 0" in lower_err else 45
                        self.key_manager.handle_rate_limit(key, retry_after=backoff)
                        if "limit: 0" in lower_err:
                            limit_zero_hits += 1
                            self.log(f"Detected limit:0 quota exhaustion (hit {limit_zero_hits}/{max_limit_zero_hits}); treating as project-level free-tier cap")
                            if limit_zero_hits >= max_limit_zero_hits:
                                return "Gemini quota is exhausted for this project (free-tier limit:0). Bias explanations were skipped."
                    except Exception:
                        # best effort; ignore if handler fails
                        pass
                    continue
            self.log("All Gemini keys failed or rate-limited after retries")
            return "All Gemini keys are temporarily unavailable. Please try again later."

    def _parse_retry_after_seconds_from_error_text(self, text: str):
        if not text:
            return None
        import re
        m = re.search(r"retry_delay\s*\{[^}]*seconds\s*:\s*(\d+)", text, re.IGNORECASE | re.DOTALL)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                pass
        m = re.search(r"Please\s+retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", text, re.IGNORECASE)
        if m:
            try:
                secs = float(m.group(1))
                return max(1, int(round(secs)))
            except Exception:
                pass
        return None
