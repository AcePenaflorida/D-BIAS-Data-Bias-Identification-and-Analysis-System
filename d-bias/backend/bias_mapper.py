
from __future__ import annotations

import re
from typing import List, Dict, Optional, Tuple
from uuid import uuid4
from datetime import datetime


def _normalize_key(s: Optional[str]) -> str:
    if not s:
        return ""
    s = str(s).lower()
    # remove backticks and surrounding punctuation
    s = s.replace("`", "")
    # normalize arrows and multiplication signs
    s = s.replace("↔", " ").replace("×", " x ")
    # remove punctuation except alphanum and spaces
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _parse_ai_sections(ai_text: str) -> List[Dict[str, str]]:
    """Parse AI Markdown-like text into sections.

    Returns a list of dicts: {"header": str, "body": str, "type": str|None, "feature": str|None}
    Heuristics used to extract type and feature from the header:
      - backtick-enclosed feature names: `sex`
      - headers with pattern "Type: feature" or "Type (e.g., feature)"
      - fallback: attempt to split by ':' and use the first part as type
    """
    if not ai_text:
        return []

    # Normalize line endings
    text = ai_text.replace("\r\n", "\n").replace("\r", "\n")

    # Find header lines starting with one or more #'s (## or ### etc.) to be more flexible
    # Capture hash prefix and header text separately so we can reconstruct later
    pattern = re.compile(r"^(##+)\s*(.+)$", flags=re.MULTILINE)
    headers = [m for m in pattern.finditer(text)]

    sections: List[Dict[str, str]] = []
    if not headers:
        # If no explicit headers, treat whole text as one section
        sections.append({"header": "", "body": text.strip(), "type": None, "feature": None})
        return sections

    for i, m in enumerate(headers):
        hash_prefix = m.group(1).strip()
        header_text = m.group(2).strip()
        start = m.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        body = text[start:end].strip()

        # extract one or more features from header: backticks, single quotes, or pattern 'in <feature>'
        features: List[str] = []
        # backtick-enclosed features: `sex`
        for mfeat in re.finditer(r"`([^`]+)`", header_text):
            features.append(mfeat.group(1).strip())
        # single-quoted features: 'sex'
        for mfeat in re.finditer(r"'([^']+)'", header_text):
            if mfeat.group(1).strip() not in features:
                features.append(mfeat.group(1).strip())
        # pattern: "in <feature>" or ": <feature>"
        if not features:
            m = re.search(r"(?:in|for)\s+([A-Za-z0-9_\-\s↔×,]+)(?:\(|:|$)", header_text, flags=re.I)
            if m:
                candidate = m.group(1).strip()
                # split commas if multiple
                for part in re.split(r",|/", candidate):
                    part = part.strip()
                    if part:
                        features.append(part)

    # try to extract a type name
        type_name = None
        # remove leading numbering and bold markup
        cleaned = re.sub(r"^\*+|\*+$", "", header_text)
        cleaned = re.sub(r"^\d+\.?\s*", "", cleaned).strip()
        # if header contains ':' the left side is likely the type
        if ":" in cleaned:
            type_name = cleaned.split(":", 1)[0].strip()
        else:
            # heuristic: take first few words until '(' or 'e.g.' or backtick
            split_stop = re.split(r"\(|e\.g\.|\\`", cleaned)[0]
            type_name = split_stop.strip()

        # finalize
        sections.append({
            "header": header_text,
            "header_prefix": hash_prefix,
            "body": body,
            "type": type_name if type_name else None,
            "features": features or None,
        })

    return sections


def _match_section_for_issue(issue: Dict, sections: List[Dict[str, str]], used_section_ids: set) -> Optional[Tuple[Dict[str, str], int]]:
    """Return best matching section dict + its index for a bias issue.

    Scoring approach (higher is better):
      +30 exact feature match in section.features
      +20 header contains feature token
      +15 body contains feature token
      +10 type match
      -10 section already used for a different feature (soft penalty to allow multi-feature correlation reuse)
    Reject mappings where score < 15 unless an exact feature match occurred.
    """
    issue_type = issue.get("Type") or issue.get("type") or ""
    issue_feature = issue.get("Feature") or issue.get("feature") or ""

    n_issue_type = _normalize_key(issue_type)
    n_issue_feat = _normalize_key(issue_feature)
    feat_tokens = [t for t in re.split(r"[^a-z0-9]+", n_issue_feat) if t]

    def body_contains_tokens(body: str) -> bool:
        n_body = _normalize_key(body)
        return any(tok in n_body for tok in feat_tokens)

    best: Optional[Tuple[int, int]] = None  # (score, index)
    for idx, sec in enumerate(sections):
        header = sec.get("header", "")
        body = sec.get("body", "")
        sec_type = _normalize_key(sec.get("type"))
        sec_feats = [ _normalize_key(f) for f in (sec.get("features") or []) ]

        score = 0
        exact_match = n_issue_feat and n_issue_feat in sec_feats

        # Avoid mapping generic meta sections (overall/recommendations/etc.) to a specific feature unless exact feature match
        lower_header = header.lower()
        is_meta_section = any(k in lower_header for k in ["recommend", "actionable", "overall", "conclusion", "fairness", "summary"])
        if is_meta_section and not exact_match:
            continue
        if is_meta_section and exact_match and sec_feats and len(sec_feats) > 1:
            score -= 10  # prefer dedicated feature sections over grouped ones

        if exact_match:
            score += 30
        if n_issue_feat and _normalize_key(header).find(n_issue_feat) != -1:
            score += 20
        if body and n_issue_feat and body_contains_tokens(body):
            # Reduced credit if feature appears inside a multi-feature aggregate line
            multi_line = False
            for line in body.splitlines():
                bticks = re.findall(r"`([^`]+)`", line)
                if n_issue_feat and any(n_issue_feat == _normalize_key(b) for b in bticks) and len(bticks) > 1:
                    multi_line = True
                    break
            score += 15 if not multi_line else 5
        if sec_type and sec_type == n_issue_type:
            score += 10
        if idx in used_section_ids and not exact_match:
            score -= 10

        if score <= 0:
            continue
        # guardrail: if only type match (score <=10) and no tokens present -> skip
        if score <= 10 and not (exact_match or body_contains_tokens(body)):
            continue
        if best is None or score > best[0]:
            best = (score, idx)

    if best is None:
        return None

    score, idx = best
    sec = sections[idx]
    # Return full section; client will decide whether to trim. Preserve bullets & formatting.
    return sec, idx


def _extract_bullets(text: str) -> List[str]:
    """Extract bullet/numbered list items from a block of text.

    Recognizes lines starting with *, -, •, or numeric enumerations (1., 2), and indented sub-bullets.
    Returns a cleaned list of bullet strings preserving order and basic hierarchy via prefix markers.
    """
    if not text:
        return []
    bullets: List[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^(?:\*+|[-•]|\d+[.)])\s*(.+)$", line)
        if m:
            item = m.group(1).strip()
            # Remove redundant bold markers on edges
            item = re.sub(r"^\*+|\*+$", "", item).strip()
            bullets.append(item)
    # fallback: if none detected and the text is long, attempt sentence split
    if not bullets and len(text) > 60:
        sentences = re.split(r"(?<=[\.!\?])\s+", text)
        bullets = [s.strip() for s in sentences if s.strip()]
    return bullets


def _needs_synthesis(text: Optional[str], description: str) -> bool:
    """Decide whether to synthesize a structured explanation instead of using the raw text.

    Synthesize when one of the following holds:
      - missing/empty/N/A
      - identical to the short description/detection sentence
      - lacks headers and lacks any bullet/numbered items
    """
    if not text:
        return True
    txt = (text or "").strip()
    if not txt or txt.lower() in {"none", "n/a"}:
        return True
    if description and txt.strip() == (description or "").strip():
        return True
    has_header = re.search(r"^\s*#{2,6}\s+", txt, flags=re.M) is not None
    has_bullets = re.search(r"^\s*(?:\*+|[-•]|\d+[.)])\s+", txt, flags=re.M) is not None
    return not (has_header or has_bullets)


def _extract_percent_and_majority(desc: str) -> Tuple[Optional[float], Optional[str]]:
    """Pull a percentage like 58.0% and a majority label like 'False' from the description if present."""
    if not desc:
        return None, None
    pm = re.search(r"(\d{1,3}(?:\.\d+)?)%", desc)
    percent = float(pm.group(1)) if pm else None
    lm = re.search(r"'([^']+)'\s+dominates", desc)
    label = lm.group(1) if lm else None
    return percent, label


def _extract_corr_value(desc: str) -> Optional[float]:
    """Extract correlation r value from description like 'r=0.574'."""
    if not desc:
        return None
    m = re.search(r"r\s*=\s*(-?\d*\.\d+|\d+)", desc, flags=re.I)
    try:
        return float(m.group(1)) if m else None
    except Exception:
        return None


# ------------------------------
# Correlation explanation helpers
# ------------------------------
def _get_corr_category(r: Optional[float]) -> str:
    """Bucket correlation into categories used for messaging.

    Returns one of: 'none', 'realworld', 'redundant', 'inverse', 'inverse-strong'.
    """
    if r is None:
        return "none"
    a = abs(r)
    if a < 0.40:
        return "none"
    # Strong band
    if a >= 0.85:
        if r < 0:
            return "inverse-strong"
        return "redundant"
    # Moderate band
    if r < 0:
        return "inverse"
    return "realworld"


def _split_feature_pair(feature_pair: str) -> Tuple[Optional[str], Optional[str]]:
    left, right = None, None
    raw = feature_pair or ""
    for delim in ["↔", "<->", "->", "<-", " vs ", " versus ", " x ", "/", ","]:
        if delim in raw:
            parts = [p.strip() for p in raw.split(delim) if p.strip()]
            if len(parts) >= 2:
                left, right = parts[0], parts[1]
                break
    return left, right


def _generate_corr_explanation(feature_pair: str, r: Optional[float]) -> Dict[str, str]:
    """Return a context-aware explanation dict for correlation pairs.

    Keys: Meaning, Harm, Impact, Fix.
    """
    left, right = _split_feature_pair(feature_pair)
    l = f"`{left}`" if left else "first feature"
    rgt = f"`{right}`" if right else "second feature"
    r_str = f" (r={r:.3f})" if isinstance(r, float) else ""
    cat = _get_corr_category(r)

    # Special-case heuristics for known duplicates/derivations
    tokens = {t.strip().lower() for t in (left or "").split()} | {t.strip().lower() for t in (right or "").split()}
    pair_set = { (left or "").lower(), (right or "").lower() }

    def is_pair(a: str, b: str) -> bool:
        return {a.lower(), b.lower()} == pair_set

    # Contextual overlay for domain-specific pairs
    ctx = _contextual_explanation(feature_pair, r)

    # Templates per category
    if cat == "none":
        base = {
            "Meaning": f"No significant correlation detected between {l} and {rgt}{r_str}.",
            "Harm": "Weak associations are unlikely to destabilize models but may still introduce noise if overfit.",
            "Impact": "Minimal direct effect on multicollinearity or attribution.",
            "Fix": "Optional: keep both features; consider removing one if it adds noise without improving validation metrics.",
        }
        return {**base, **({} if not ctx else ctx)}

    # Group A: Redundant / identical features
    if cat == "redundant" or is_pair("bmi", "bmi_calc") or (
        pair_set <= {"carbs", "proteins", "fats", "cal_from_macros"} and (r or 0) >= 0.85
    ) or is_pair("pct_hrr", "pct_maxhr"):
        # Fine-tune Meaning text for known pairs
        if is_pair("bmi", "bmi_calc"):
            meaning = f"`bmi` and `bmi_calc` appear to be duplicates or formulaically identical{r_str}."
        elif is_pair("pct_hrr", "pct_maxhr"):
            meaning = f"`pct_hrr` and `pct_maxhr` are near-identical intensity measures capturing the same construct{r_str}."
        elif pair_set <= {"carbs", "proteins", "fats", "cal_from_macros"}:
            meaning = f"Macronutrient features are derived from the same total; values move in lockstep{r_str}."
        else:
            meaning = f"Highly redundant or duplicate information between {l} and {rgt}{r_str}."
        base = {
            "Meaning": meaning,
            "Harm": "Redundant predictors inflate multicollinearity and can make coefficients unstable, obscuring true drivers.",
            "Impact": "Interpretability degrades and feature importance may be arbitrarily split between duplicates.",
            "Fix": "Keep a single representative feature; drop or combine the rest. Use regularization or dimensionality reduction if retention is needed.",
        }
        # Redundancy trumps contextual overlays
        return base

    # Group C: Inverse correlations (negative r)
    if cat in {"inverse", "inverse-strong"}:
        strength = "strong inverse" if abs(r or 0) >= 0.85 else "inverse"
        base = {
            "Meaning": f"{strength.capitalize()} relationship{r_str}: as {l} increases, {rgt} tends to decrease (and vice versa).",
            "Harm": "Inverse links can cause suppression effects where one feature hides the predictive value of the other.",
            "Impact": "Attribution and threshold logic may mis-rank these variables; small noise in one flips the apparent importance of the other.",
            "Fix": "Consider ratio/interaction features, residualize one variable on the other to retain unique signal, and apply regularization.",
        }
        # For moderate inverse (|r|<0.6), soften guidance
        if 0 <= abs(r or 0) < 0.6:
            base["Harm"] = "Moderate inverse association poses limited multicollinearity risk but may confound attribution if both are used unregularized."
            base["Fix"] = "Keep both; add regularization and consider residualizing one on the other if attribution instability is observed."
        # Overlay contextual where applicable
        return {**base, **({} if not ctx else ctx)}

    # Group B: Real-world relationships (moderate positive)
    base = {
        "Meaning": f"Strong real-world relationship{r_str}: {l} and {rgt} increase together, reflecting a shared underlying factor.",
        "Harm": "If treated as independent, models may double-count the same phenomenon and overstate confidence.",
        "Impact": "Predictions and explanations can overweight these features, reducing generalization when one is noisy or missing.",
        "Fix": "Prefer a composite (e.g., product, average, training-load style metric) or reduce redundancy via feature selection/regularization.",
    }
    if 0 <= abs(r or 0) < 0.6:
        base["Harm"] = "Moderate overlap; biologically/behaviorally plausible with limited multicollinearity risk."
        base["Fix"] = "Keep both; normalize or standardize for regression and monitor variance inflation."
        base["Impact"] = "Minor attribution smoothing; unlikely to destabilize models unless combined with many similar features."
        base["Meaning"] = base["Meaning"].replace("Strong real-world relationship", "Moderate real-world relationship")
    # Overlay contextual where applicable
    return {**base, **({} if not ctx else ctx)}


def _contextual_explanation(feature_pair: str, r: Optional[float]) -> Dict[str, str]:
    """Context-aware Meaning/Harm/Impact/Fix for known biological/behavioral/energy relationships."""
    left, right = _split_feature_pair(feature_pair)
    k = { (left or '').strip().lower(), (right or '').strip().lower() }
    r_str = f" (r={r:.3f})" if isinstance(r, float) else ""

    def pair_is(a: str, b: str) -> bool:
        return {a.lower(), b.lower()} == k

    # weight vs protein density
    if pair_is("weight_kg", "protein_per_kg"):
        return {
            "Meaning": f"Inverse relationship{r_str}: heavier individuals typically log fewer grams of protein per kilogram (density effect).",
            "Harm": "Models may misread weight as a proxy for inadequate protein even when absolute intake is sufficient.",
            "Impact": "Nutrition recommendations can become overcorrected for heavier users, reducing personalization.",
            "Fix": "Include absolute protein grams and normalize targets by lean mass; use ratio features and residualize protein_per_kg on weight if needed.",
        }
    # duration vs experience
    if pair_is("session_duration_hours", "experience_level"):
        label = "Strong" if abs(r or 0) >= 0.6 else "Moderate"
        return {
            "Meaning": f"{label} behavioral relationship{r_str}: more experienced users tend to train longer per session.",
            "Harm": "Treating duration and experience as independent can double-count training maturity.",
            "Impact": "Progression or calorie models may overweight seasoned users' inputs.",
            "Fix": "Cap duration's marginal effect, add interaction terms, or use composite training load.",
        }
    # height vs lean mass
    if pair_is("height_m", "lean_mass_kg"):
        label = "Moderate" if 0.4 <= abs(r or 0) < 0.85 else "Strong"
        return {
            "Meaning": f"{label} biological relationship{r_str}: taller individuals tend to have higher lean mass.",
            "Harm": "Limited multicollinearity risk; mainly an interpretability consideration.",
            "Impact": "Minor dampening of unique contribution in linear models.",
            "Fix": "Keep both; standardize features and monitor VIF.",
        }
    # duration vs calorie balance (energy)
    if pair_is("session_duration_hours", "cal_balance"):
        dir_text = "more negative" if (r or 0) < 0 else "more positive"
        return {
            "Meaning": f"Energy linkage{r_str}: longer sessions associate with {dir_text} calorie balance (expenditure effects).",
            "Harm": "If intake adaptation isn't modeled, systems may recommend overly aggressive deficits for active users.",
            "Impact": "Recovery/refuel advice can be miscalibrated for high-volume users.",
            "Fix": "Model intake and expenditure jointly; add constraints to prevent prolonged excessive deficits.",
        }
    # hydration vs intake (activity-driven consumption)
    if pair_is("water_intake_liters", "calories"):
        label = "Moderate" if 0.4 <= abs(r or 0) < 0.85 else "Strong"
        return {
            "Meaning": f"{label} behavioral link{r_str}: higher activity patterns drive both hydration and calorie intake.",
            "Harm": "Minor risk of double-counting activity level if both drive the same health outcome proxy.",
            "Impact": "Feature importance between hydration and intake may blur in attribution analyses.",
            "Fix": "Retain both; standardize and consider adding an explicit activity intensity feature to absorb shared variance.",
        }
    # hydration vs lean mass (body size relation)
    if pair_is("water_intake_liters", "lean_mass_kg"):
        return {
            "Meaning": f"Moderate physiological relationship{r_str}: larger lean mass generally correlates with greater hydration needs.",
            "Harm": "Low multicollinearity risk; interpretation clarity is the main concern.",
            "Impact": "Slight dilution of unique predictive signal in linear models.",
            "Fix": "Keep both; consider normalizing water_intake_liters by body weight for refined modeling.",
        }
    # heart rate metrics (max BPM vs reserve / percent max)
    if pair_is("max_bpm", "pct_hrr"):
        label = "Moderate" if 0.4 <= abs(r or 0) < 0.85 else "Strong"
        return {
            "Meaning": f"{label} inverse cardiovascular relation{r_str}: higher estimated max BPM can reduce % heart rate reserve proportion (scaling effect).",
            "Harm": "May introduce suppression where max_bpm masks distinct recovery capacity captured by pct_hrr.",
            "Impact": "Model attribution could overweight max_bpm and understate dynamic recovery predictors.",
            "Fix": "Compute ratio/adjusted recovery indexes; consider residualizing pct_hrr on max_bpm.",
        }
    if pair_is("max_bpm", "pct_maxhr"):
        label = "Moderate" if 0.4 <= abs(r or 0) < 0.85 else "Strong"
        return {
            "Meaning": f"{label} inverse scaling{r_str}: higher max BPM associates with lower % of max HR achieved at comparable intensity markers.",
            "Harm": "Could cause misinterpretation of training intensity versus physiological capacity.",
            "Impact": "Intensity modeling may underrepresent actual exertion if scaling not handled.",
            "Fix": "Normalize pct_maxhr by individualized max_bpm baselines or use zone-based categorical features.",
        }
    # fallback: no contextual override
    return {}


def _sanitize_explanation_text(text: str, feature_pair: str, r: Optional[float]) -> Tuple[str, Optional[str]]:
    """Detect and replace mismatched or placeholder explanations for numeric correlation pairs.

    Returns (possibly modified text, reason_for_replacement|None)
    Replacement triggers:
      - Numeric pair but categorical tokens ('meal_name', 'gender') present.
      - Placeholder phrases like 'analysis of detected biases' or generic dataset headers.
      - Outlier-focused wording mistakenly applied to correlation pair.
    """
    if not feature_pair:
        return text, None
    is_numeric_pair = any(sym in feature_pair for sym in ["↔", "<->", "->", "<-"])  # arrow-like tokens
    if not is_numeric_pair:
        return text, None
    low = text.lower()
    replacement_reason = None
    placeholder_patterns = ["analysis of detected biases", "analysis of potential bias", "analysis of biases", "analysis of detected bias"]
    categorical_tokens = ["meal_name", "gender"]
    misapplied_outlier = ("outlier bias" in low and "physical_exercise" in low and "####" in low)

    if any(tok in low for tok in categorical_tokens) and "numeric correlation" not in low:
        replacement_reason = "reused categorical explanation"
    elif any(p in low for p in placeholder_patterns):
        replacement_reason = "placeholder header"
    elif misapplied_outlier or ("outlier" in low and "bias" in low and "correlation" not in low):
        replacement_reason = "misapplied outlier explanation"

    if not replacement_reason:
        return text, None

    # Build a fresh structured correlation explanation
    expl_dict = _generate_corr_explanation(feature_pair, r)
    header = f"#### Numeric Correlation Bias: `{feature_pair}`"
    bullets = [
        f"*   **Meaning:** {expl_dict.get('Meaning','')}",
        f"*   **Harm:** {expl_dict.get('Harm','')}",
        f"*   **Impact:** {expl_dict.get('Impact','')}",
        f"*   **Fix:** {expl_dict.get('Fix','')}",
    ]
    new_text = header + "\n" + "\n".join(bullets)
    return new_text.strip(), replacement_reason


def _refine_explanation_text(explanation: str, bias_type: str, feature_pair: str) -> str:
    """Language/style refinement for final output.

    - Reduce repetitive phrases via targeted substitutions
    - Enrich lifestyle metrics correlations (hydration, calories, workout duration)
    - Normalize bullets order and trim whitespace
    """
    if not explanation:
        return explanation

    text = explanation.strip()

    # Repetition reduction mappings (case-insensitive)
    replacements = [
        (r"features are directly proportional and measure the same physical concept", 
         "these variables both represent body composition scaling and can be merged for clarity"),
        (r"these metrics reflect the same physiological effort and should be standardized",
         "these features capture overlapping physiological dimensions and should be streamlined"),
        (r"double-count(ing)? the same phenomenon", "overstating a single underlying factor"),
        (r"can make coefficients unstable, obscuring true drivers",
         "can blur attribution and hide the true drivers of outcomes"),
    ]
    for pat, repl in replacements:
        text = re.sub(pat, repl, text, flags=re.I)

    # Try to parse existing bullets for Meaning/Harm/Impact/Fix
    bullet_pattern = re.compile(r"^\s*\*\s+\*\*(Meaning|Harm|Impact|Fix)\*\*:\s*(.*)$", re.I | re.M)
    parts = {"meaning": None, "harm": None, "impact": None, "fix": None}
    for m in bullet_pattern.finditer(text):
        key = m.group(1).lower()
        val = m.group(2).strip()
        if val:
            parts[key] = val

    # Lifestyle enrichment for Numeric Correlation Bias
    low_bias = (bias_type or "").lower()
    f_low = (feature_pair or "").lower()
    def has_any(s: str, keys: list[str]) -> bool:
        return any(k in s for k in keys)

    if low_bias.startswith("numeric correlation bias") and feature_pair:
        is_hydration = has_any(f_low, ["water", "hydration"]) 
        is_calories = has_any(f_low, ["calorie", "calories", "calories_intake", "cal_from_macros"]) 
        is_duration = has_any(f_low, ["duration", "session_duration", "workout_duration"]) 
        is_workout = has_any(f_low, ["workout", "frequency", "avg_bpm", "intensity"]) 

        if is_hydration and (is_calories or is_duration or is_workout):
            # Enrich Meaning/Harm/Fix minimally without disturbing earlier context
            if parts["meaning"]:
                if "activity" not in parts["meaning"].lower():
                    parts["meaning"] += " — higher physical activity tends to raise both hydration needs and energy demand."
            if parts["harm"]:
                if "normalize" not in parts["harm"].lower():
                    parts["harm"] += " Without normalization, models may confound hydration with caloric expenditure."
            if parts["fix"]:
                if "normalize" not in parts["fix"].lower():
                    parts["fix"] += " Normalize features per workout session or use regression residuals."

    # If no bullets parsed, just return cleaned text
    if not any(parts.values()):
        return text

    # Rebuild bullets in order with non-empty values
    header_match = re.match(r"^(#+\s+.*)$", text.splitlines()[0].strip())
    header = header_match.group(1) if header_match else None
    ordered = []
    if parts["meaning"]:
        ordered.append(f"*   **Meaning:** {parts['meaning'].strip()}")
    if parts["harm"]:
        ordered.append(f"*   **Harm:** {parts['harm'].strip()}")
    if parts["impact"]:
        ordered.append(f"*   **Impact:** {parts['impact'].strip()}")
    if parts["fix"]:
        ordered.append(f"*   **Fix:** {parts['fix'].strip()}")

    body = "\n".join(ordered)
    if header:
        return f"{header}\n{body}".strip()
    return body.strip()


def _synthesize_explanation(issue: Dict) -> str:
    """Create a structured, readable markdown explanation for an issue when AI text is missing/poor."""
    t = (issue.get("Type") or issue.get("type") or "").strip()
    feature = (issue.get("Feature") or issue.get("feature") or "").strip()
    severity = (issue.get("Severity") or issue.get("severity") or "").strip() or "Moderate"
    desc = (issue.get("Description") or issue.get("description") or "").strip()

    header = f"#### {t}: `{feature}`".strip()

    bullets: List[str] = []
    # Common Severity bullet
    bullets.append(f"**Severity:** **{severity}**")

    if t.lower().startswith("categorical imbalance"):
        pct, maj = _extract_percent_and_majority(desc)
        meaning = desc if desc else f"Most values for `{feature}` are concentrated in a single category."
        if pct is not None and maj:
            meaning = f"The `{feature}` feature is dominated by the `{maj}` category (~{pct}%)."
        bullets.extend([
            f"**Meaning:** {meaning}",
            "**Harm:** The model may learn to ignore the minority categories and generalize poorly for underrepresented groups.",
            "**Impact:** Predictions for the minority class can be inaccurate or unfair, especially when that class is clinically significant.",
            "**Fix:** Use resampling (e.g., SMOTE/oversampling), class weights, or collect more data for the minority categories; consider feature engineering to strengthen the signal.",
        ])
    elif t.lower().startswith("numeric correlation bias"):
        # Context-aware correlation synthesis using helpers
        r = _extract_corr_value(desc)
        expl = _generate_corr_explanation(feature, r)
        # Weak correlation handling: if 'none', still produce concise bullets
        bullets.extend([
            f"**Meaning:** {expl.get('Meaning','')}",
            f"**Harm:** {expl.get('Harm','')}",
            f"**Impact:** {expl.get('Impact','')}",
            f"**Fix:** {expl.get('Fix','')}",
        ])
    elif t.lower().startswith("outlier bias"):
        meaning = desc if desc else f"A high fraction of outliers detected in `{feature}`."
        bullets.extend([
            f"**Meaning:** {meaning}",
            "**Harm:** Outliers can skew distributions and distort learned relationships.",
            "**Impact:** Elevated false positives/negatives when outliers dominate the decision boundary.",
            "**Fix:** Investigate data quality; impute or cap extreme values; consider robust scalers or transformations.",
        ])
    else:
        # Generic template
        bullets.extend([
            f"**Meaning:** {desc or f'Issue detected in `{feature}`.'}",
            "**Harm:** May negatively affect fairness and accuracy for certain subgroups.",
            "**Fix:** Apply appropriate preprocessing or rebalancing and validate subgroup performance.",
        ])

    bullet_block = "\n".join([f"*   {b}" for b in bullets])
    return f"{header}\n{bullet_block}".strip()


def map_biases(bias_report: List[Dict], ai_text: Optional[str]) -> Dict:
    """Map structured bias report entries to AI explanations.

    Args:
        bias_report: list of dicts (each with keys like Type, Feature, Description, Severity)
        ai_text: Markdown/str produced by an LLM explaining biases

    Returns:
        dict with keys:
          - "bias_types": { type_name: [ {feature, severity, description, ai_explanation}, ... ] }
          - "overall": { "assessment": str | None }
    """
    sections = _parse_ai_sections(ai_text or "")

    result: Dict[str, List[Dict]] = {"bias_types": {}, "overall": {}}
    # Deterministic counter fallback for bias_id (stable order within a single run)
    counter = 1

    # Group the bias report entries by Type
    used_section_ids: set = set()
    for issue in (bias_report or []):
        t = issue.get("Type") or issue.get("type") or "Unknown"
        feature = issue.get("Feature") or issue.get("feature") or ""
        severity = issue.get("Severity") or issue.get("severity") or ""
        description = issue.get("Description") or issue.get("description") or ""

        # Ensure a unique bias_id for downstream traceability
        if not issue.get("bias_id"):
            try:
                issue["bias_id"] = str(uuid4())
            except Exception:
                issue["bias_id"] = f"bias_{counter:04d}"
            counter += 1

        # Re-categorize: if a numeric pair is mislabeled as categorical, move it to Numeric Correlation Bias
        if feature:
            feat_text = str(feature)
            arrow_like = any(sym in feat_text for sym in ["↔", "<->", "->", "<-"])
            if arrow_like and "numeric correlation bias" not in (t or "").lower():
                t = "Numeric Correlation Bias"

        match = _match_section_for_issue(issue, sections, used_section_ids)
        if match:
            sec_obj, sec_idx = match
            used_section_ids.add(sec_idx)  # mark section index as used
            # Reconstruct full header with hashes
            hdr_prefix = sec_obj.get("header_prefix", "####")
            full_header = f"{hdr_prefix} {sec_obj.get('header','').strip()}".strip()
            body = sec_obj.get("body", "").strip()
            ai_explanation = f"{full_header}\n{body}".strip()
        else:
            ai_explanation = None
        # robust fallback to the issue description to avoid empty or mismatched explanations
        if not ai_explanation or str(ai_explanation).strip().lower() in {"none", "", "n/a"}:
            ai_explanation = description or f"Explanation unavailable for feature '{feature}'."

        # If the explanation is still just a detection sentence without structure, synthesize a structured one
        if _needs_synthesis(ai_explanation, description):
            ai_explanation = _synthesize_explanation(issue)

        # Final cleanup pass for numeric correlation entries to replace placeholders or reused categorical text
        if (t or "").lower().startswith("numeric correlation bias") and feature:
            r_val = _extract_corr_value(description)
            cleaned_text, reason = _sanitize_explanation_text(ai_explanation, feature, r_val)
            if reason:
                ai_explanation = cleaned_text

        # Language refinement pass (style/context) for all explanations with parsed bullets
        ai_explanation = _refine_explanation_text(ai_explanation, t, feature)

        ai_explanation_bullets = _extract_bullets(ai_explanation)

        entry = {
            "bias_id": issue.get("bias_id"),
            "feature": feature,
            "severity": severity,
            "description": description,
            "ai_explanation": ai_explanation,
            "ai_explanation_bullets": ai_explanation_bullets or None,
        }

        result["bias_types"].setdefault(t, []).append(entry)

    # Extract overall assessment/recommendations if present
    # Look for dedicated overall/fairness/concluding sections across parsed sections
    overall = {"assessment": None, "fairness": None, "conclusion": None, "actionable_recommendations": None}

    def _parse_recommendations_to_list(text: str, max_items: int = 6, max_len: int = 300) -> List[str]:
        """Convert a freeform recommendations paragraph into a short list of concise strings.

        Heuristics:
          - split on common bullet/number markers (1., -, •, *), or on double-newline paragraphs
          - fall back to sentence-splitting if no bullets found
          - strip, dedupe, cap to max_items and truncate long items
        """
        if not text:
            return []
        lines: List[str] = []
        # normalize bullets to newlines
        # split on lines that look like bullets or numbered items
        for raw in re.split(r"\n+", text):
            part = raw.strip()
            if not part:
                continue
            # common bullet prefixes
            m = re.match(r"^(?:\d+\.|\-|\*|•)\s*(.+)$", part)
            if m:
                lines.append(m.group(1).strip())
            else:
                # detect '1) text' patterns
                m2 = re.match(r"^(?:\d+\))\s*(.+)$", part)
                if m2:
                    lines.append(m2.group(1).strip())
                else:
                    lines.append(part)

        # if only one very long paragraph, try sentence-splitting
        if len(lines) == 1:
            cand = lines[0]
            sentences = re.split(r"(?<=[\.\?\!])\s+", cand)
            if len(sentences) > 1:
                lines = [s.strip() for s in sentences if s.strip()]

        # post-process: dedupe preserving order
        seen = set()
        compact = []
        for l in lines:
            s = re.sub(r"\s+", " ", l).strip()
            if not s:
                continue
            if s in seen:
                continue
            seen.add(s)
            # truncate if too long
            if len(s) > max_len:
                s = s[: max_len - 3].rstrip() + "..."
            compact.append(s)
            if len(compact) >= max_items:
                break
        return compact
    for sec in sections:
        hdr = (sec.get("header") or "").lower()
        body = sec.get("body")
        if not body:
            continue
        if "overall" in hdr or "reliability" in hdr:
            overall["assessment"] = body
        if "fairness" in hdr or "ethical" in hdr:
            overall["fairness"] = body
        if "conclud" in hdr or "conclusion" in hdr:
            overall["conclusion"] = body
        if "recommend" in hdr or "actionable" in hdr:
            # store both raw text and a compact list for easy programmatic access
            overall["actionable_recommendations_raw"] = body
            overall["actionable_recommendations"] = _parse_recommendations_to_list(body)

    # fallback: if none found, try to extract from ai_text by keyword searches
    if not any(overall.values()):
        full = ai_text or ""
        low = (full or "").lower()
        # attempt to capture concluding paragraph at the end
        m = re.search(r"conclud(?:ing|e|ion)[\s\S]+$", full, flags=re.I)
        if m:
            overall["conclusion"] = m.group(0).strip()
        else:
            # as last resort put the last 2 paragraphs in conclusion
            paras = [p.strip() for p in re.split(r"\n\n+", full) if p.strip()]
            if paras:
                overall["conclusion"] = "\n\n".join(paras[-2:]) if len(paras) > 1 else paras[-1]
                # also try to synthesize recommendations from the last paragraphs
                rec_text = "\n\n".join(paras[-2:]) if len(paras) > 1 else paras[-1]
                overall["actionable_recommendations_raw"] = rec_text
                overall["actionable_recommendations"] = _parse_recommendations_to_list(rec_text)

    # Additional heuristics for overall assessment if keywords like 'assessment', 'summary', 'overview' appear
    if not overall.get("assessment") and ai_text:
        # look for lines starting with headings containing assessment/summary/overview
        for sec in sections:
            hdr = (sec.get("header") or "").lower()
            if any(k in hdr for k in ["assessment", "summary", "overview"]):
                body = (sec.get("body") or "").strip()
                if body:
                    overall["assessment"] = body
                    break

    # Allow 'action items' synonyms to populate recommendations
    if not overall.get("actionable_recommendations") and ai_text:
        for sec in sections:
            hdr = (sec.get("header") or "").lower()
            if any(k in hdr for k in ["action items", "next steps", "mitigation", "remediation"]):
                body = (sec.get("body") or "").strip()
                if body:
                    overall["actionable_recommendations_raw"] = body
                    overall["actionable_recommendations"] = _parse_recommendations_to_list(body)
                    break

    result["overall"] = overall

    # Optional metadata for report tracking
    try:
        result["metadata"] = {
            "report_id": f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "generated_at": datetime.now().isoformat(),
            "total_biases": int(len(bias_report or [])),
        }
    except Exception:
        pass

    return result

__all__ = ["map_biases"]


import re
from textwrap import shorten
from collections import Counter
import json

# ================================================================
# ⚙️ NORMALIZATION
# ================================================================
def normalize_text(text: str) -> str:
    """Normalize line endings and spacing but preserve Markdown syntax like ###, **, and _."""
    # normalize newlines
    text = text.replace("\r", "\n")
    # remove trailing spaces
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    # collapse excessive blank lines (but keep two)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # DO NOT strip markdown like **, ##, etc.
    return text.strip()


def parse_bias_report(raw_bias_report):
    """Parse raw bias report into sequentially numbered entries."""
    bias_entries = [b.strip() for b in raw_bias_report.split(" - ") if b.strip()]
    return [{"bias_id": f"bias_{i:04d}", "description": entry}
            for i, entry in enumerate(bias_entries, start=1)]


def map_bias_explanations(bias_report, ai_output):
    """Map bias IDs to AI explanations, handling messy formatting."""
    ai_output = normalize_text(ai_output)
    pattern = r"(?:\bbias_(\d{4})[:：])"
    parts = re.split(pattern, ai_output)

    ai_dict, current_id, buffer = {}, None, []
    for p in parts:
        if not p:
            continue
        if re.match(r"\d{4}", p):
            if current_id and buffer:
                ai_dict[f"bias_{current_id}"] = "\n".join(buffer).strip()
            current_id, buffer = p, []
        else:
            buffer.append(p)
    if current_id and buffer:
        ai_dict[f"bias_{current_id}"] = "\n".join(buffer).strip()

    mapped = {}
    for bias in bias_report:
        bid = bias["bias_id"]
        mapped[bid] = ai_dict.get(
            bid, f"No explanation generated for {bid}. Original: {bias['description']}"
        )
    return mapped


def extract_structured_sections(ai_output):
    """
    Extract high-level sections and biases from AI fairness audit reports.
    Works with Markdown headers (###) and bolded bias IDs (**bias_XXXX:**).
    Returns a dictionary with biases and main sections, keeping Markdown intact.
    """
    ai_output = normalize_text(ai_output)

    sections = {
        "biases": [],
        "overall_reliability_assessment": "",
        "fairness_ethics": "",
        "concluding_summary": "",
        "actionable_recommendations": "",
    }

    # === Extract all headers and their content ===
    header_pattern = re.compile(
        r"^[ \t\-]*#{2,6}\s*(.+?)\s*[:：]?\s*\n",  # header line
        re.MULTILINE
    )
    matches = list(header_pattern.finditer(ai_output))

    for idx, match in enumerate(matches):
        header = match.group(1).strip().lower()  # normalize header
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(ai_output)
        content = ai_output[start:end].strip()

        # Map headers to section keys
        if "bias_" in header:
            # Handle individual bias blocks in header (rare)
            bid_match = re.search(r"bias_(\d{4})", header)
            if bid_match:
                sections["biases"].append({"bias_id": f"bias_{bid_match.group(1)}", "text": content})
        elif "overall reliability" in header:
            sections["overall_reliability_assessment"] = content
        elif "fairness" in header:
            sections["fairness_ethics"] = content
        elif "concluding summary" in header:
            sections["concluding_summary"] = content
        elif "actionable recommendation" in header:
            sections["actionable_recommendations"] = content

    # === Extract all biases marked as **bias_XXXX:** anywhere in the text ===
    bias_pattern = re.compile(
        r"\*\*bias_(\d{4})[:：]\*\*(.*?)"
        r"(?=\n\*\*bias_\d{4}[:：]\*\*|\Z)",  # until next bias or EOF
        re.DOTALL | re.IGNORECASE
    )
    for m in bias_pattern.finditer(ai_output):
        bid = f"bias_{m.group(1)}"
        text = m.group(2).strip()
        # Avoid duplicates if already captured in headers
        if not any(b["bias_id"] == bid for b in sections["biases"]):
            sections["biases"].append({"bias_id": bid, "text": text})

    # === Ensure fallback defaults are always set ===
    sections.setdefault("overall_reliability_assessment", "_No explicit reliability assessment found._")
    sections.setdefault("fairness_ethics", "_No fairness or ethical implications identified._")
    sections.setdefault("concluding_summary", "_No concluding summary detected._")
    sections.setdefault("actionable_recommendations", "_No actionable recommendations provided._")

    return sections


def summarize_severity(biases):
    """Generate a count summary of severity levels."""
    severities = []
    for b in biases:
        m = re.search(r"Severity[:：]\s*(\w+)", b["text"], re.IGNORECASE)
        if m:
            severities.append(m.group(1).capitalize())
    return dict(Counter(severities))


def generate_bias_mapping(raw_bias_report, ai_output):
    """Full pipeline for parsing AI audit output (new multi-section version)."""
    parsed = parse_bias_report(raw_bias_report)
    mapped = map_bias_explanations(parsed, ai_output)
    structured = extract_structured_sections(ai_output)
    structured["severity_summary"] = summarize_severity(structured.get("biases", []))

    # build flexible output (supports both naming styles)
    return {
        "metadata": {
            "total_biases": len(structured.get("biases", [])),
            "severity_summary": structured.get("severity_summary", {}),
        },
        "biases": structured.get("biases", []),

        # new explicit keys
        "overall_reliability_assessment": structured.get("overall_reliability_assessment", ""),
        "fairness_ethics": structured.get("fairness_ethics", ""),
        "concluding_summary": structured.get("concluding_summary", ""),
        "actionable_recommendations": structured.get("actionable_recommendations", "")
    }




