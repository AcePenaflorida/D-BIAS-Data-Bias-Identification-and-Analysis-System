"""bias_mapper.py

Utilities to map the structured `bias_report` (list[dict]) produced by the
detector to the unstructured AI explanation text (Markdown-like sections).

Main entrypoint:
    map_biases(bias_report: list, ai_text: str) -> dict

The function returns a dict with grouped bias types and a lightweight
``overall`` section extracted from the AI explanation (if present).

The implementation is intentionally heuristic and robust to common
Markdown header patterns produced by LLMs (e.g. "### **1. Categorical
Imbalance: `sex`**").
"""
from __future__ import annotations

import re
from typing import List, Dict, Optional, Tuple


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
        r = _extract_corr_value(desc)
        meaning = desc if desc else f"Strong dependence detected among the variables in `{feature}`."
        r_info = f" (r={r:.3f})" if isinstance(r, float) else ""
        bullets.extend([
            f"**Meaning:** {meaning}{r_info}",
            "**Harm:** Multicollinearity can make models unstable and interpretations misleading (over-reliance on a single predictor).",
            "**Impact:** Model may overfit or become less robust when one of the correlated features is missing/noisy.",
            "**Fix:** Apply regularization, monitor feature importance, or remove/merge redundant predictors after evaluating performance.",
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

    # Group the bias report entries by Type
    used_section_ids: set = set()
    for issue in (bias_report or []):
        t = issue.get("Type") or issue.get("type") or "Unknown"
        feature = issue.get("Feature") or issue.get("feature") or ""
        severity = issue.get("Severity") or issue.get("severity") or ""
        description = issue.get("Description") or issue.get("description") or ""

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

        ai_explanation_bullets = _extract_bullets(ai_explanation)

        entry = {
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

    return result


__all__ = ["map_biases"]
