def clean_last_bias_text(text: str) -> str:
    """
    Cleans the last mapped bias output by:
    - Removing unrelated summary/conclusion/recommendation text
    - Removing extra blank lines and trailing newlines
    """
    # Remove any section headers that should not be part of the last bias
    # These are usually bolded or start with certain phrases
    section_markers = [
        "** Overall Reliability Assessment", "** Fairness & Ethical Implications", 
        "** Concluding Summary", "** Actionable Recommendations",
        "### **Overall Summary and Recommendations**",
        "**Overall Reliability Assessment:**", "**Fairness & Ethical Implications:**",
        "**Concluding Summary:**", "**Actionable Recommendations:**",
        "Overall Assessment and Recommendations",
        "### Overall Health and Reliability Assessment",
        "\n\n***\n\n### **",
        "\n\n****",
        "\n\n---",
        "\n---",
        "--- ### Overall Assessment and Recommendations",
        "\n\n---\n### Final Assessment",
        "\n",
        "\n\n"


    ]
    # Remove everything after the first occurrence of any marker
    for marker in section_markers:
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
            break
    # Remove excessive blank lines (more than 2)
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove trailing newlines and spaces
    text = text.rstrip()
    return text


import re
from textwrap import shorten
from collections import Counter
import json

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
    """Parse a raw bias report (string or list) into entries with bias_id and description.

    Supports:
    - String: split on " - " and number sequentially
    - List[str]: number sequentially
    - List[dict]: use existing bias_id/description when available, otherwise infer
    """
    entries = []
    # String input: original behavior
    if isinstance(raw_bias_report, str):
        bias_entries = [b.strip() for b in raw_bias_report.split(" - ") if b.strip()]
        for i, entry in enumerate(bias_entries, start=1):
            entries.append({"bias_id": f"bias_{i:04d}", "description": entry})
        return entries

    # List input: strings or dicts
    if isinstance(raw_bias_report, list):
        for i, item in enumerate(raw_bias_report, start=1):
            if isinstance(item, dict):
                bid = item.get("bias_id") or f"bias_{i:04d}"
                # Try common fields for a short description (prefer Description if present)
                desc = (
                    item.get("description")
                    or item.get("Description")
                    or item.get("details")
                    or item.get("text")
                    or item.get("message")
                    or item.get("Feature")
                    or item.get("Type")
                )
                if desc is None:
                    try:
                        desc = json.dumps(item, ensure_ascii=False)
                    except Exception:
                        desc = str(item)
                entries.append({"bias_id": str(bid), "description": str(desc).strip()})
            else:
                entries.append({"bias_id": f"bias_{i:04d}", "description": str(item).strip()})
        return entries

    # Fallback: best-effort stringification
    return [{"bias_id": "bias_0001", "description": str(raw_bias_report)}]


def map_bias_explanations(bias_report, ai_output):
    """Map bias IDs to AI explanations, ensuring each block is strictly isolated."""
    ai_output = normalize_text(ai_output or "")

    # Strict pattern: matches bias headers at the start of a line (optionally bracketed)
    split_pat = re.compile(r"^\s*\[?bias_(\d{4})\]?\s*[:：]\s*", re.MULTILINE | re.IGNORECASE)
    matches = list(split_pat.finditer(ai_output))
    ai_dict = {}
    for idx, match in enumerate(matches):
        bias_id = f"bias_{match.group(1)}"
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(ai_output)
        block = ai_output[start:end].strip()
        ai_dict[bias_id] = block
    # Map explanations to bias_report
    mapped = {}
    for bias in bias_report:
        bid = bias.get("bias_id")
        mapped[bid] = ai_dict.get(
            bid, f"No explanation generated for {bid}. Original: {bias.get('description', '')}"
        )
    return mapped

def extract_structured_sections(ai_output):
    """
    Extract high-level sections and biases from AI fairness audit reports.
    Works with bolded headers (e.g., **Overall Reliability Assessment:**)
    and keeps biases extraction intact.
    """
    ai_output = normalize_text(ai_output)

    sections = {
        "biases": [],
        "overall_reliability_assessment": "",
        "fairness_ethics": "",
        "concluding_summary": "",
        "actionable_recommendations": "",
    }

    # === Bolded section headers regex ===
    section_headers = {
        "overall_reliability_assessment": r"Overall Reliability Assessment",
        "fairness_ethics": r"Fairness\s*&\s*Ethical Implications",
        "concluding_summary": r"Concluding Summary",
        "actionable_recommendations": r"Actionable Recommendations",
    }

    # Create a regex to match all section headers
    header_regex = re.compile(
        r"\*\*(?P<header>{})\s*[:：]?\*\*".format("|".join(section_headers.values())),
        re.IGNORECASE
    )

    # Find all bolded headers and their positions
    matches = list(header_regex.finditer(ai_output))

    for idx, match in enumerate(matches):
        header_name = match.group("header").strip().lower()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(ai_output)
        content = ai_output[start:end].strip()

        # Map header to section key
        for key, pattern in section_headers.items():
            if re.fullmatch(pattern, match.group("header"), re.IGNORECASE):
                sections[key] = content
                break

    # === Bias extraction (unchanged) ===
    bold_bias_pat = re.compile(
        r"\*\*\s*\[?\s*bias_(\d{4})\s*\]?\s*[:：]\s*\*\*(.*?)"
        r"(?=\n\*\*\s*\[?\s*bias_\d{4}\s*\]?\s*[:：]\s*\*\*|\Z)",
        re.DOTALL | re.IGNORECASE
    )
    for m in bold_bias_pat.finditer(ai_output):
        bid = f"bias_{m.group(1)}"
        text = (m.group(2) or "").strip()
        if not any(b["bias_id"] == bid for b in sections["biases"]):
            sections["biases"].append({"bias_id": bid, "text": text})

    plain_bias_pat = re.compile(
        r"^\s*\[?\s*bias_(\d{4})\s*\]?\s*[:：]\s*(.*?)\s*(?=\n\s*\[?\s*bias_\d{4}\s*\]?\s*[:：]|\Z)",
        re.DOTALL | re.IGNORECASE | re.MULTILINE
    )
    for m in plain_bias_pat.finditer(ai_output):
        bid = f"bias_{m.group(1)}"
        text = (m.group(2) or "").strip()
        if not any(b["bias_id"] == bid for b in sections["biases"]):
            sections["biases"].append({"bias_id": bid, "text": text})

    # === Fallback defaults if sections not found ===
    if not sections.get("overall_reliability_assessment"):
        sections["overall_reliability_assessment"] = "_No explicit reliability assessment found._"
    if not sections.get("fairness_ethics"):
        sections["fairness_ethics"] = "_No fairness or ethical implications identified._"
    if not sections.get("concluding_summary"):
        sections["concluding_summary"] = "_No concluding summary detected._"
    if not sections.get("actionable_recommendations"):
        sections["actionable_recommendations"] = "_No actionable recommendations provided._"

    return sections

def summarize_severity(biases):
    """Generate a count summary of severity levels.

    Accepts items with either 'text', 'ai_explanation', or explicit 'Severity' field.
    """
    severities = []
    for b in biases:
        if not isinstance(b, dict):
            src = str(b)
        else:
            # explicit field takes precedence
            sev_field = b.get("Severity") or b.get("severity")
            if isinstance(sev_field, str) and sev_field.strip():
                severities.append(sev_field.strip().capitalize())
                continue
            src = b.get("text") or b.get("ai_explanation") or ""
        m = re.search(r"Severity[:：]\s*([A-Za-z]+)", str(src), re.IGNORECASE)
        if m:
            severities.append(m.group(1).capitalize())
    return dict(Counter(severities))


def generate_bias_mapping(raw_bias_report, ai_output):
    """Full pipeline for parsing AI audit output and mapping to bias entries.

    Returns a structure with:
      - metadata: counts and severity summary
      - biases: list of {bias_id, description, ai_explanation, severity}
      - overall_* sections extracted from the AI output
    """
    parsed = parse_bias_report(raw_bias_report)
    ai_output = ai_output or ""

    # Extract structured sections and any bias blocks in the AI output
    structured = extract_structured_sections(ai_output)
    ai_struct_map = {b.get("bias_id"): (b.get("text") or "").strip() for b in structured.get("biases", [])}

    # Also build a mapping using split-based parsing as fallback
    ai_map_fallback = map_bias_explanations(parsed, ai_output)

    # Map raw report dicts for richer fallback explanations
    raw_map = {}
    if isinstance(raw_bias_report, list):
        for i, item in enumerate(raw_bias_report, start=1):
            bid = parsed[i-1].get("bias_id") if i-1 < len(parsed) else f"bias_{i:04d}"
            raw_map[bid] = item if isinstance(item, dict) else {"Description": str(item)}

    combined_biases = []
    for i, b in enumerate(parsed):
        bid = b.get("bias_id")
        raw_item = raw_map.get(bid, {})
        desc = (
            b.get("description")
            or (raw_item.get("Description") if isinstance(raw_item, dict) else None)
            or ""
        ).strip()
        ai_text = (ai_struct_map.get(bid) or ai_map_fallback.get(bid) or "").strip()
        # Synthesize explanation if missing
        if not ai_text or ai_text.startswith("No explanation generated for"):
            if isinstance(raw_item, dict) and raw_item:
                r_type = raw_item.get("Type") or raw_item.get("type") or ""
                r_feat = raw_item.get("Feature") or raw_item.get("feature") or ""
                r_desc = raw_item.get("Description") or raw_item.get("description") or ""
                r_sev = raw_item.get("Severity") or raw_item.get("severity") or ""
                parts = []
                if r_type: parts.append(f"Type: {r_type}")
                if r_feat: parts.append(f"Feature: {r_feat}")
                if r_desc: parts.append(str(r_desc))
                if r_sev: parts.append(f"Severity: {r_sev}")
                ai_text = "; ".join([p for p in parts if p]) or desc
            else:
                ai_text = desc
        # Only sanitize the last bias output
        if i == len(parsed) - 1:
            ai_text = clean_last_bias_text(ai_text)
        sev_match = re.search(r"Severity[:：]\s*([A-Za-z]+)", ai_text, re.IGNORECASE)
        severity = None
        if sev_match:
            severity = sev_match.group(1).capitalize()
        elif isinstance(raw_item, dict):
            r_sev = raw_item.get("Severity") or raw_item.get("severity")
            if isinstance(r_sev, str) and r_sev.strip():
                severity = r_sev.strip().capitalize()
        combined_biases.append({
            "bias_id": bid,
            "description": desc,
            "ai_explanation": ai_text,
            "severity": severity,
        })

    severity_summary = summarize_severity(combined_biases)

    return {
        "metadata": {
            "total_biases": len(combined_biases),
            "severity_summary": severity_summary,
        },
        "biases": combined_biases,
        "overall_reliability_assessment": structured.get("overall_reliability_assessment", ""),
        "fairness_ethics": structured.get("fairness_ethics", ""),
        "concluding_summary": structured.get("concluding_summary", ""),
        "actionable_recommendations": structured.get("actionable_recommendations", ""),
    }

