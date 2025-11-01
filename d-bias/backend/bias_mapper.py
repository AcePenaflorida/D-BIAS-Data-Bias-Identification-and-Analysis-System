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

    # Find header lines starting with ### (allow spaces)
    pattern = re.compile(r"^###\s*(.+)$", flags=re.MULTILINE)
    headers = [m for m in pattern.finditer(text)]

    sections: List[Dict[str, str]] = []
    if not headers:
        # If no explicit headers, treat whole text as one section
        sections.append({"header": "", "body": text.strip(), "type": None, "feature": None})
        return sections

    for i, m in enumerate(headers):
        header_text = m.group(1).strip()
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
            "body": body,
            "type": type_name if type_name else None,
            "features": features or None,
        })

    return sections


def _match_section_for_issue(issue: Dict, sections: List[Dict[str, str]]) -> Optional[str]:
    """Try to find the best matching AI section body for a given bias report issue.

    Matching preference:
      1. exact feature match (normalized)
      2. type match (normalized)
      3. header contains feature substring
    """
    issue_type = issue.get("Type") or issue.get("type") or ""
    issue_feature = issue.get("Feature") or issue.get("feature") or ""

    n_issue_type = _normalize_key(issue_type)
    n_issue_feat = _normalize_key(issue_feature)

    # Helper to extract sentence(s) from body mentioning the feature
    def _extract_sentences_for_feature(body: str, feature_tokens: List[str]) -> Optional[str]:
        if not body:
            return None
        # split into sentences (naive)
        sentences = re.split(r"(?<=[\.\!\?])\s+", body)
        matched = []
        for s in sentences:
            s_norm = _normalize_key(s)
            # if any token present in sentence
            if any(tok and tok in s_norm for tok in feature_tokens):
                matched.append(s.strip())
        if matched:
            return " ".join(matched)
        return None

    # Precompute feature tokens (split on non-alnum)
    feat_tokens = [t for t in re.split(r"[^a-z0-9]+", n_issue_feat) if t]

    # 1) exact feature listed in section.features
    for sec in sections:
        sec_feats = sec.get("features") or []
        for sf in sec_feats or []:
            if _normalize_key(sf) == n_issue_feat:
                # try to extract targeted sentences mentioning the feature
                specific = _extract_sentences_for_feature(sec.get("body", ""), feat_tokens)
                return specific or sec.get("body")

    # 2) header/body contains the feature tokens
    for sec in sections:
        sec_header = _normalize_key(sec.get("header"))
        sec_body = sec.get("body", "")
        if sec_header and n_issue_feat and n_issue_feat in sec_header:
            specific = _extract_sentences_for_feature(sec_body, feat_tokens)
            return specific or sec_body
        # also search body for feature tokens
        if any(tok and tok in _normalize_key(sec_body) for tok in feat_tokens):
            specific = _extract_sentences_for_feature(sec_body, feat_tokens)
            return specific or sec_body

    # 3) type match: section type equals issue type
    for sec in sections:
        sec_type = _normalize_key(sec.get("type"))
        if sec_type and sec_type == n_issue_type:
            # prefer sentences that mention feature tokens
            specific = _extract_sentences_for_feature(sec.get("body", ""), feat_tokens)
            return specific or sec.get("body")

    # 4) fallback: first section whose type contains the issue type words
    for sec in sections:
        sec_type = _normalize_key(sec.get("type"))
        if sec_type and any(tok in sec_type for tok in n_issue_type.split() if tok):
            specific = _extract_sentences_for_feature(sec.get("body", ""), feat_tokens)
            return specific or sec.get("body")

    return None


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
    for issue in (bias_report or []):
        t = issue.get("Type") or issue.get("type") or "Unknown"
        feature = issue.get("Feature") or issue.get("feature") or ""
        severity = issue.get("Severity") or issue.get("severity") or ""
        description = issue.get("Description") or issue.get("description") or ""

        ai_explanation = _match_section_for_issue(issue, sections)

        entry = {
            "feature": feature,
            "severity": severity,
            "description": description,
            "ai_explanation": ai_explanation,
        }

        result["bias_types"].setdefault(t, []).append(entry)

    # Extract overall assessment/recommendations if present
    # Look for dedicated overall/fairness/concluding sections across parsed sections
    overall = {"assessment": None, "fairness": None, "conclusion": None}
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

    result["overall"] = overall

    return result


__all__ = ["map_biases"]
