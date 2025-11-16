# backend/visualization.py
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import plotly.io as pio
import base64
import tempfile
import os
import json
import re
from datetime import datetime
import ast
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_JUSTIFY

def visualize_fairness_dashboard(bias_report: list[dict], df: pd.DataFrame):
    """
    Returns the three plotly figures (fig1, fig2, fig3).
    The caller (Streamlit) can display them, or in non-notebook contexts they can be shown in browser.
    """
    if not bias_report or len(bias_report) == 0:
        print("\n✅ No biases to visualize — dataset appears fair.")
        return None, None, None

    bias_df = pd.DataFrame(bias_report)

    # Normalize severity for numeric plotting - handle both 'Severity' and 'severity'
    if "Severity" in bias_df.columns:
        sev_col = "Severity"
    elif "severity" in bias_df.columns:
        sev_col = "severity"
    else:
        sev_col = None

    severity_map = {"High": 3, "Moderate": 2, "Low": 1}
    if sev_col:
        bias_df["SeverityScore"] = bias_df[sev_col].map(severity_map).fillna(1)
    else:
        bias_df["SeverityScore"] = 1

    # Count biases per Type (handle 'Type' or 'type')
    type_col = "Type" if "Type" in bias_df.columns else ("type" if "type" in bias_df.columns else None)
    feature_col = "Feature" if "Feature" in bias_df.columns else ("feature" if "feature" in bias_df.columns else None)

    if type_col is None or feature_col is None:
        # fallback: create columns for plotting
        bias_df["Type"] = bias_df.columns[0]
        bias_df["Feature"] = bias_df.columns[0]

    bias_counts = bias_df.groupby(type_col)[feature_col].count().reset_index(name="Count")
    bias_counts["Color"] = bias_counts["Count"].apply(
        lambda x: "red" if x > 5 else ("orange" if x > 2 else "green")
    )

    # ===== View 1: Bias Density Bubble Chart =====
    fig1 = px.scatter(
        bias_df,
        x=type_col,
        y="SeverityScore",
        color=sev_col if sev_col else None,
        size=bias_df["SeverityScore"] * 10,
        hover_data={
            feature_col: True,
            "Description": True if "Description" in bias_df.columns else False,
            "Severity": True if "Severity" in bias_df.columns else False,
        },
        title="Interactive Bias Density Overview",
    )
    fig1.update_layout(
        template="plotly_white",
        xaxis_title="Bias Type",
        yaxis=dict(
            tickvals=[1, 2, 3],
            ticktext=["Low", "Moderate", "High"],
            title="Severity Level"
        ),
        hoverlabel=dict(bgcolor="white", font_size=12, font_family="Arial"),
        margin=dict(t=60, b=60),
    )

    # ===== View 2: Bias Heatmap (Type × Severity) =====
    heatmap_df = bias_df.groupby([type_col, sev_col if sev_col else "SeverityScore"]).size().reset_index(name="Count")
    fig2 = px.density_heatmap(
        heatmap_df,
        x=type_col,
        y=sev_col if sev_col else "SeverityScore",
        z="Count",
        color_continuous_scale="YlOrRd",
        title="Bias Type–Severity Heatmap",
        hover_data={"Count": True},
    )
    fig2.update_layout(
        template="plotly_white",
        hoverlabel=dict(bgcolor="white", font_size=12, font_family="Arial"),
        margin=dict(t=60, b=60)
    )

    # ===== View 3: Summary Bar Chart =====
    fig3 = px.bar(
        bias_counts,
        x=type_col,
        y="Count",
        color="Color",
        text="Count",
        title="Bias Type Frequency Summary",
    )
    fig3.update_traces(textposition="outside")
    fig3.update_layout(
        template="plotly_white",
        xaxis_title="Bias Type",
        yaxis_title="Count",
        hoverlabel=dict(bgcolor="white", font_size=12, font_family="Arial"),
        showlegend=False,
        margin=dict(t=60, b=60)
    )

    return fig1, fig2, fig3


# def generate_pdf_report(response: dict, output_path: str, title: str = "D-BIAS Analysis Report") -> str:
#     """
#     Generate a professional PDF report from the analysis response.

#     - response: the JSON response returned by the backend analysis endpoint
#     - output_path: full path to write the PDF file
#     Returns the output_path on success.

#     The report contains: title page, executive summary, mapped biases, conclusions,
#     actionable recommendations, and plots where available.
#     """
#     # --- Prepare & normalize content -------------------------------------------------
#     bias_input = response.get("bias_types") or response.get("bias_report") or {}
#     # Normalize bias types to a dict of lists
#     if isinstance(bias_input, list):
#         grouped = {}
#         for b in bias_input:
#             t = b.get("Type") or b.get("type") or b.get("bias_type") or "Other"
#             grouped.setdefault(t, []).append(b)
#         bias_types = grouped
#     elif isinstance(bias_input, dict):
#         bias_types = bias_input
#     else:
#         bias_types = {}

#     overall = response.get("overall") or response.get("mapped_biases", {}).get("overall") or {}
#     summary = response.get("summary") or response.get("dataset_summary") or overall.get("assessment") or ""
#     reliability = response.get("reliability") or overall.get("reliability") or "Unknown"
#     metadata = response.get("metadata") or {}
#     def _format_dataset_name(raw):
#         if not raw:
#             return "Dataset"
#         name = str(raw)
#         try:
#             name = os.path.basename(name)
#         except Exception:
#             pass
#         name = re.sub(r"\.(csv|xlsx|xls|parquet|json|txt)$", "", name, flags=re.IGNORECASE)
#         name = name.replace("_", " ").replace("-", " ").strip()
#         return name or "Dataset"
#     raw_dataset_name = (
#         metadata.get("dataset_name")
#         or response.get("dataset_name")
#         or response.get("file_name")
#         or response.get("file_path")
#         or response.get("filename")
#         or response.get("name")
#         or "dataset"
#     )
#     dataset_name = _format_dataset_name(raw_dataset_name)
#     report_date = metadata.get("report_date") or datetime.now().strftime("%Y-%m-%d")
#     generated_by = metadata.get("generated_by") or "D-BIAS System"

#     # Recommendations (list)
#     recs = overall.get("actionable_recommendations") or overall.get("recommendations") or overall.get("actionable_recommendations_raw") or []
#     if isinstance(recs, str):
#         recs = [recs]

#     # Default output filename if not provided: d-bias/_data/program_generated_files
#     if not output_path:
#         safe_ds = re.sub(r"[^0-9A-Za-z_-]", "_", str(dataset_name))
#         date_str = datetime.now().strftime("%Y%m%d_%H%M")
#         base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "_data", "program_generated_files"))
#         os.makedirs(base_dir, exist_ok=True)
#         output_path = os.path.join(base_dir, f"Bias_Report_{safe_ds}_{date_str}.pdf")
#     os.makedirs(os.path.dirname(output_path), exist_ok=True)

#     # Temporary dir for any images
#     tmpdir = tempfile.mkdtemp(prefix="dbias_report_")
#     saved_images = []  # list of (caption, path)

#     # --- Helpers ---------------------------------------------------------------------
#     def _format_text_with_bold_markers(text: str) -> str:
#         if not text:
#             return ""
#         s = str(text)
#         # Remove markdown headings and horizontal rules
#         s = re.sub(r"^#{1,6}\s*", "", s, flags=re.MULTILINE)
#         s = re.sub(r"^-{3,}$", "", s, flags=re.MULTILINE)
#         # `code` → monospace
#         s = re.sub(r"`([^`]+)`", r"<font face='Courier'>\1</font>", s)
#         # **bold** → <b>bold</b>
#         s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
#         # *italic* → <i>italic</i> (avoid matching **bold**)
#         s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", s)
#         # Normalize <br> variations to self-closing <br/> for ReportLab
#         s = re.sub(r"<\s*br\s*/?\s*>", "<br/>", s, flags=re.IGNORECASE)
#         s = re.sub(r"<\s*/\s*br\s*>", "<br/>", s, flags=re.IGNORECASE)
#         # Normalize common bullet markers to line breaks for Paragraph
#         s = s.replace("\r\n", "\n")
#         s = re.sub(r"\n{2,}", "<br/><br/>", s)
#         return s

#     def _parse_literal(text):
#         """Try to parse JSON/dict-like text into Python structures. Return None on failure."""
#         if not isinstance(text, str):
#             return None
#         txt = text.strip()
#         if not txt:
#             return None
#         # quick gate to avoid parsing normal sentences
#         if not any(ch in txt for ch in ['{', '}', ':', '[', ']']):
#             return None
#         # Try JSON
#         try:
#             return json.loads(txt)
#         except Exception:
#             pass
#         # Try Python literal
#         try:
#             return ast.literal_eval(txt)
#         except Exception:
#             return None

#     def _render_text_or_kv(text, style):
#         """Return a list of flowables: Paragraphs or a small table from KV pairs if parsable."""
#         flows = []
#         if isinstance(text, (dict, list)):
#             parsed = text
#         else:
#             parsed = _parse_literal(text)
#         if isinstance(parsed, dict) and parsed:
#             data_rows = []
#             for k, v in parsed.items():
#                 val = v
#                 if isinstance(v, (dict, list)):
#                     try:
#                         val = json.dumps(v, ensure_ascii=False)
#                     except Exception:
#                         val = str(v)
#                 data_rows.append([Paragraph(f"<b>{_format_text_with_bold_markers(str(k))}</b>", style), Paragraph(_format_text_with_bold_markers(str(val)), style)])
#             t = Table(data_rows, colWidths=[doc.width*0.35, doc.width*0.65])
#             t.setStyle(TableStyle([
#                 ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#dddddd")),
#                 ("VALIGN", (0,0), (-1,-1), "TOP"),
#                 ("LEFTPADDING", (0,0), (-1,-1), 4),
#                 ("RIGHTPADDING", (0,0), (-1,-1), 4),
#             ]))
#             flows.append(t)
#         elif isinstance(parsed, list) and parsed:
#             for item in parsed:
#                 flows.append(Paragraph(f"• {_format_text_with_bold_markers(str(item))}", style))
#         else:
#             formatted = _format_text_with_bold_markers(str(text))
#             lines = [ln.strip() for ln in re.split(r"\n+", formatted) if ln and ln.strip()]
#             bold_lines = [ln for ln in lines if ("<b>" in ln and "</b>" in ln)]
#             normal_lines = [ln for ln in lines if ln not in bold_lines]
#             if normal_lines:
#                 flows.append(Paragraph("<br/>".join(normal_lines), style))
#             if bold_lines:
#                 if normal_lines:
#                     flows.append(Spacer(1, 4))
#                 for bl in bold_lines:
#                     flows.append(Paragraph(f"• {bl}", style))
#         return flows

#     def _insert_plot_with_caption(fig_source, caption: str):
#         """Accept path/base64/plotly dict; render to PNG (HD) and store in saved_images."""
#         if not fig_source:
#             return
#         # file path
#         if isinstance(fig_source, str) and os.path.exists(fig_source):
#             saved_images.append((caption, fig_source))
#             return
#         # base64
#         if isinstance(fig_source, str):
#             b64 = fig_source.strip()
#             if b64.startswith("iVB") or b64.startswith("/9j/"):
#                 try:
#                     img_bytes = base64.b64decode(b64)
#                     outp = os.path.join(tmpdir, f"plot_{len(saved_images)}.png")
#                     with open(outp, "wb") as f:
#                         f.write(img_bytes)
#                     saved_images.append((caption, outp))
#                     return
#                 except Exception:
#                     pass
#         # plotly fig dict
#         if isinstance(fig_source, dict):
#             try:
#                 img_bytes = pio.to_image(fig_source, format="png", scale=4)
#                 outp = os.path.join(tmpdir, f"plot_{len(saved_images)}.png")
#                 with open(outp, "wb") as f:
#                     f.write(img_bytes)
#                 saved_images.append((caption, outp))
#             except Exception:
#                 pass

#     # Collect plots from response
#     plots = response.get("plots") or {}
#     if isinstance(plots, dict):
#         for name, payload in plots.items():
#             src = payload
#             if isinstance(payload, dict):
#                 src = payload.get("path") or payload.get("png_base64") or payload.get("plotly") or payload.get("figure")
#                 if isinstance(src, dict) and src.get("data"):
#                     pass
#             _insert_plot_with_caption(src, name)

#     # --- Build PDF (styles, layout) --------------------------------------------------
#     margin = inch  # 1 inch margins
#     doc = SimpleDocTemplate(output_path, pagesize=letter, rightMargin=margin, leftMargin=margin, topMargin=margin, bottomMargin=margin)
#     styles = getSampleStyleSheet()

#     # Color palette (Apple-inspired)
#     NAVY = colors.HexColor("#2F4156")
#     TEAL = colors.HexColor("#567C8D")
#     SKYBLUE = colors.HexColor("#C8D9E6")
#     BEIGE = colors.HexColor("#F5EFEB")
#     WHITE = colors.white
#     TEXT_DARK = colors.HexColor("#333333")
#     TEXT_MUTED = colors.HexColor("#666666")

#     # Typography styles (fallback to Helvetica variants)
#     styles.add(ParagraphStyle(name="Title24", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=28, alignment=1, textColor=NAVY, spaceAfter=12))
#     styles.add(ParagraphStyle(name="Section16", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=16, leading=22, textColor=TEAL, spaceBefore=12, spaceAfter=8))
#     styles.add(ParagraphStyle(name="Sub13", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=13, leading=18, textColor=NAVY, spaceBefore=6, spaceAfter=6))
#     styles.add(ParagraphStyle(name="Body11", parent=styles["Normal"], fontName="Helvetica", fontSize=11, leading=18, textColor=TEXT_DARK, alignment=TA_JUSTIFY, spaceAfter=6))
#     styles.add(ParagraphStyle(name="Caption9", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=9, leading=12, textColor=TEXT_MUTED, alignment=1, leftIndent=12, rightIndent=12))
#     styles.add(ParagraphStyle(name="Info11", parent=styles["Normal"], fontName="Helvetica", fontSize=11, leading=16.5, textColor=TEXT_DARK, alignment=1))

#     # Severity badge colors
#     severity_colors = {"High": colors.HexColor("#E53E3E"), "Moderate": colors.HexColor("#ED8936"), "Low": colors.HexColor("#3182CE")}

#     story = []

#     # Title Page
#     story.append(Spacer(1, 56))
#     story.append(Paragraph("D-BIAS Analytical Report", styles["Title24"]))
#     story.append(Paragraph("Dataset Bias Detection and Fairness Evaluation", styles["Caption9"]))
#     story.append(Spacer(1, 10))
#     story.append(Paragraph(f"{dataset_name}", styles["Info11"]))
#     story.append(Paragraph(f"{report_date}", styles["Info11"]))
#     story.append(Paragraph(f"Generated by {generated_by}", styles["Info11"]))
#     story.append(Spacer(1, 16))
#     fairness_score = response.get("fairness_score") or overall.get("fairness_score") or overall.get("fairness")
#     if fairness_score is not None:
#         try:
#             score_text = f"{float(fairness_score):.2f}"
#         except Exception:
#             score_text = str(fairness_score)
#         badge_inner = Table(
#             [[Paragraph("Fairness Health Score", styles["Body11"])], [Paragraph(f"<b>{score_text}</b>", styles["Title24"]) ]],
#             colWidths=[doc.width * 0.5]
#         )
#         badge_inner.setStyle(TableStyle([
#             ("BACKGROUND", (0,0), (-1,-1), WHITE),
#             ("BOX", (0,0), (-1,-1), 1, SKYBLUE),
#             ("ALIGN", (0,0), (-1,-1), "CENTER"),
#             ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
#             ("TOPPADDING", (0,0), (-1,-1), 10),
#             ("BOTTOMPADDING", (0,0), (-1,-1), 12),
#         ]))
#         # Simulated drop shadow using outer container with light grey border offset
#         badge = Table([[badge_inner]], colWidths=[doc.width * 0.5])
#         badge.setStyle(TableStyle([
#             ("ALIGN", (0,0), (-1,-1), "CENTER"),
#             ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
#             ("LEFTPADDING", (0,0), (-1,-1), 2),
#             ("BOTTOMPADDING", (0,0), (-1,-1), 2),
#         ]))
#         story.append(badge)
#     story.append(Spacer(1, 18))

#     # Executive Summary
#     story.append(Paragraph("Executive Summary", styles["Section16"]))
#     exec_text = summary or ""
#     # top-3 bias types by count
#     top_biases = []
#     if isinstance(bias_types, dict) and bias_types:
#         counts = [(k, len(v) if isinstance(v, list) else 1) for k, v in bias_types.items()]
#         counts.sort(key=lambda x: x[1], reverse=True)
#         top_biases = [f"{k} ({c})" for k, c in counts[:3]]
#     # Render main summary (parse dict-like if needed)
#     for fl in _render_text_or_kv(exec_text, styles["Body11"]):
#         story.append(fl)
#     # Add key takeaways bullets
#     bullets = []
#     if top_biases:
#         bullets.append(f"Top detected bias types: {', '.join(top_biases)}")
#     if reliability and str(reliability).strip():
#         bullets.append(f"Reliability: {reliability}")
#     if bullets:
#         story.append(Spacer(1, 6))
#         bullet_flow = [Paragraph(f"• { _format_text_with_bold_markers(b) }", styles["Body11"]) for b in bullets]
#         panel = Table([[bullet_flow]], colWidths=[doc.width])
#         panel.setStyle(TableStyle([
#             ("BACKGROUND", (0,0), (-1,-1), WHITE),
#             ("BOX", (0,0), (-1,-1), 0.25, SKYBLUE),
#             ("LEFTPADDING", (0,0), (-1,-1), 10),
#             ("RIGHTPADDING", (0,0), (-1,-1), 10),
#             ("TOPPADDING", (0,0), (-1,-1), 8),
#             ("BOTTOMPADDING", (0,0), (-1,-1), 8),
#         ]))
#         story.append(panel)
#     story.append(Spacer(1, 18))

#     # Dataset Overview
#     stats = response.get("dataset_stats") or metadata.get("stats") or {}
#     if isinstance(stats, dict) and stats:
#         story.append(Paragraph("Dataset Overview", styles["Section16"]))
#         rows = stats.get("rows") or stats.get("n_rows") or stats.get("num_rows") or "—"
#         cols = stats.get("cols") or stats.get("n_cols") or stats.get("num_cols") or "—"
#         missing = stats.get("missing") or stats.get("missing_values") or "—"
#         overview = Table([
#             [Paragraph("Rows", styles["Body11"]), Paragraph(str(rows), styles["Body11"])],
#             [Paragraph("Columns", styles["Body11"]), Paragraph(str(cols), styles["Body11"])],
#             [Paragraph("Missing values", styles["Body11"]), Paragraph(str(missing), styles["Body11"])],
#         ], colWidths=[doc.width*0.45, doc.width*0.55])
#         overview.setStyle(TableStyle([("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#dddddd")), ("BACKGROUND", (0,0), (-1,0), colors.whitesmoke)]))
#         story.append(overview)
#         story.append(Spacer(1, 18))

#     # Mapped Bias Analysis
#     if isinstance(bias_types, dict) and bias_types:
#         story.append(Paragraph("Mapped Bias Analysis", styles["Section16"]))
#         for btype, items in bias_types.items():
#             story.append(Paragraph(str(btype), styles["Sub13"]))
#             if not isinstance(items, list):
#                 items = [items]
#             for entry in items:
#                 feature = entry.get("feature") or entry.get("Feature") or entry.get("column") or "(unknown)"
#                 severity = entry.get("severity") or entry.get("Severity") or entry.get("level") or "Low"
#                 severity = str(severity).title()
#                 desc = entry.get("description") or entry.get("Description") or ""
#                 ai_exp = entry.get("ai_explanation") or entry.get("AI Explanation") or entry.get("explanation") or ""
#                 impact = entry.get("impact") or entry.get("Impact") or entry.get("harm") or entry.get("Harm") or ""
#                 fix = entry.get("fix") or entry.get("recommendation") or entry.get("Recommendation") or entry.get("remediation") or ""

#                 left = []
#                 left.append(Paragraph(f"Feature: <b>{feature}</b>", styles["Body11"]))
#                 if desc:
#                     left.append(Spacer(1, 4))
#                     for fl in _render_text_or_kv(desc, styles["Body11"]):
#                         left.append(fl)
#                 if ai_exp:
#                     left.append(Spacer(1, 6))
#                     left.append(Paragraph("AI Explanation:", styles["Body11"]))
#                     for fl in _render_text_or_kv(ai_exp, styles["Body11"]):
#                         left.append(fl)
#                 if impact:
#                     left.append(Spacer(1, 6))
#                     left.append(Paragraph("Impact / Harm:", styles["Body11"]))
#                     for fl in _render_text_or_kv(impact, styles["Body11"]):
#                         left.append(fl)
#                 if fix:
#                     left.append(Spacer(1, 6))
#                     left.append(Paragraph("Fix Recommendations:", styles["Body11"]))
#                     for fl in _render_text_or_kv(fix, styles["Body11"]):
#                         left.append(fl)

#                 # Severity label with colored dot
#                 badge_color = severity_colors.get(severity, severity_colors["Low"]) if isinstance(severity, str) else severity_colors["Low"]
#                 sev_label = Paragraph(f"<font color='{badge_color.hexval()}'>●</font> {severity}", styles["Body11"])

#                 inner_card = Table([[left, sev_label]], colWidths=[doc.width - 1.6*inch, 1.4*inch])
#                 inner_card.setStyle(TableStyle([
#                     ("VALIGN", (0,0), (-1,-1), "TOP"),
#                     ("LEFTPADDING", (0,0), (-1,-1), 6),
#                     ("RIGHTPADDING", (0,0), (-1,-1), 6),
#                 ]))

#                 card = Table([[inner_card]], colWidths=[doc.width])
#                 card.setStyle(TableStyle([
#                     ("BACKGROUND", (0,0), (-1,-1), WHITE),
#                     ("BOX", (0,0), (-1,-1), 0.25, SKYBLUE),
#                     ("VALIGN", (0,0), (-1,-1), "TOP"),
#                     ("LEFTPADDING", (0,0), (-1,-1), 6),
#                     ("RIGHTPADDING", (0,0), (-1,-1), 6),
#                     ("TOPPADDING", (0,0), (-1,-1), 8),
#                     ("BOTTOMPADDING", (0,0), (-1,-1), 8),
#                 ]))
#                 story.append(card)
#                 story.append(Spacer(1, 12))
#         story.append(Spacer(1, 18))

#     # Visualizations Section
#     if saved_images:
#         story.append(Paragraph("Visualizations", styles["Section16"]))
#         captions_map = {
#             "fig1": "Bias Distribution by Type",
#             "fig2": "Fairness Trend Over Time",
#             "fig3": "Bias Severity Breakdown",
#         }
#         desc_map = {
#             "bias distribution by type": "Density and distribution of detected bias types and their severity levels.",
#             "fairness trend over time": "Temporal trend or aggregated pattern indicating how fairness metrics evolve.",
#             "bias severity breakdown": "Counts and proportions of bias severities across detected types.",
#             "bias type–severity heatmap": "Heatmap of bias counts segmented by type and severity.",
#         }
#         fig_idx = 1
#         for raw_caption, img_path in saved_images:
#             try:
#                 key = str(raw_caption).lower()
#                 if key in captions_map:
#                     cap = captions_map[key]
#                 elif "heatmap" in key:
#                     cap = "Bias Type–Severity Heatmap"
#                 elif "density" in key or "scatter" in key:
#                     cap = "Bias Distribution by Type"
#                 elif "bar" in key or "summary" in key:
#                     cap = "Bias Severity Breakdown"
#                 else:
#                     cap = raw_caption.replace('_',' ').title()
#                 img = RLImage(img_path)
#                 max_w = doc.width * 0.92
#                 if img.drawWidth > max_w:
#                     ratio = max_w / float(img.drawWidth)
#                     img.drawWidth *= ratio
#                     img.drawHeight *= ratio
#                 img_panel = Table([[img]], colWidths=[doc.width])
#                 img_panel.setStyle(TableStyle([
#                     ("BACKGROUND", (0,0), (-1,-1), WHITE),
#                     ("BOX", (0,0), (-1,-1), 0.25, SKYBLUE),
#                     ("ALIGN", (0,0), (-1,-1), "CENTER"),
#                     ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
#                     ("LEFTPADDING", (0,0), (-1,-1), 6),
#                     ("RIGHTPADDING", (0,0), (-1,-1), 6),
#                     ("TOPPADDING", (0,0), (-1,-1), 8),
#                     ("BOTTOMPADDING", (0,0), (-1,-1), 8),
#                 ]))
#                 story.append(img_panel)
#                 story.append(Spacer(1, 6))
#                 story.append(Paragraph(f"Figure {fig_idx} — {cap}", styles["Caption9"]))
#                 desc = desc_map.get(cap.lower()) or ""
#                 if desc:
#                     story.append(Paragraph(desc, styles["Body11"]))
#                 story.append(Spacer(1, 12))
#                 fig_idx += 1
#             except Exception:
#                 continue
#         story.append(Spacer(1, 18))

#     # Conclusions and Recommended Actions
#     concl = overall.get("conclusion") or overall.get("assessment") or response.get("conclusion") or ""
#     actions = response.get("actions") or {}
#     immediate = actions.get("immediate") or response.get("immediate_actions") or []
#     short_term = actions.get("short_term") or response.get("short_term_actions") or []
#     long_term = actions.get("long_term") or response.get("long_term_actions") or []
#     if immediate or short_term or long_term or recs:
#         story.append(Paragraph("Recommendations & Actions", styles["Section16"]))
#         # Build content in beige box with blue sidebar stripe (actions only, no duplicated conclusion)
#         action_flows = []
#         if immediate:
#             action_flows.append(Paragraph("Immediate Actions", styles["Sub13"]))
#             for idx, a in enumerate(immediate, start=1):
#                 action_flows.append(Paragraph(f"{idx}. { _format_text_with_bold_markers(str(a)) }", styles["Body11"]))
#         if short_term:
#             action_flows.append(Paragraph("Short-Term", styles["Sub13"]))
#             for idx, a in enumerate(short_term, start=1):
#                 action_flows.append(Paragraph(f"{idx}. { _format_text_with_bold_markers(str(a)) }", styles["Body11"]))
#         if long_term:
#             action_flows.append(Paragraph("Long-Term", styles["Sub13"]))
#             for idx, a in enumerate(long_term, start=1):
#                 action_flows.append(Paragraph(f"{idx}. { _format_text_with_bold_markers(str(a)) }", styles["Body11"]))
#         if recs:
#             action_flows.append(Paragraph("Other Recommendations", styles["Sub13"]))
#             for idx, r in enumerate(recs, start=1):
#                 action_flows.append(Paragraph(f"{idx}. { _format_text_with_bold_markers(str(r)) }", styles["Body11"]))

#         right_panel = Table([[action_flows]], colWidths=[doc.width - 10])
#         right_panel.setStyle(TableStyle([
#             ("BACKGROUND", (0,0), (-1,-1), WHITE),
#             ("LEFTPADDING", (0,0), (-1,-1), 10),
#             ("RIGHTPADDING", (0,0), (-1,-1), 10),
#             ("TOPPADDING", (0,0), (-1,-1), 8),
#             ("BOTTOMPADDING", (0,0), (-1,-1), 8),
#         ]))
#         actions_box = Table([["", right_panel]], colWidths=[8, doc.width - 8])
#         actions_box.setStyle(TableStyle([
#             ("BACKGROUND", (0,0), (0,-1), TEAL),
#             ("BOX", (1,0), (1,0), 0.25, SKYBLUE),
#         ]))
#         story.append(actions_box)
#         story.append(Spacer(1, 18))

#     # Overall Assessment with divider
#     health = response.get("health_label") or overall.get("health") or ""
#     if str(health).strip():
#         story.append(Paragraph("Conclusion", styles["Section16"]))
#         risk_bullets = []
#         # Simple risk highlight: list bias types with High severity counts
#         if isinstance(bias_types, dict):
#             for btype, items in bias_types.items():
#                 if not isinstance(items, list):
#                     items = [items]
#                 high_count = sum(1 for i in items if str(i.get("severity") or i.get("Severity") or "").lower() == "high")
#                 if high_count:
#                     risk_bullets.append(("High", f"{btype}: {high_count} high-severity findings"))
#         if reliability and str(reliability).strip():
#             story.append(Paragraph(f"Overall dataset reliability: { _format_text_with_bold_markers(str(reliability)) }", styles["Body11"]))
#         story.append(Spacer(1, 6))
#         for sev, txt in risk_bullets[:5]:
#             col = severity_colors.get(sev, TEAL)
#             story.append(Paragraph(f"<font color='{col.hexval()}'>●</font> { _format_text_with_bold_markers(txt) }", styles["Body11"]))
#         story.append(Spacer(1, 12))
#         badge_color = severity_colors.get(str(health).title(), colors.HexColor("#3182CE"))
#         health_badge = Table([[Paragraph(f"{health}", styles["Title24"]) ]], colWidths=[doc.width*0.4])
#         health_badge.setStyle(TableStyle([
#             ("BACKGROUND", (0,0), (0,0), badge_color),
#             ("TEXTCOLOR", (0,0), (0,0), colors.white),
#             ("ALIGN", (0,0),(0,0),"CENTER"),
#             ("VALIGN", (0,0),(0,0),"MIDDLE")
#         ]))
#         story.append(health_badge)
#         story.append(Spacer(1, 18))

#     # Appendix
#     appendix = response.get("metrics") or response.get("raw_metrics") or {}
#     if isinstance(appendix, str):
#         maybe = _parse_literal(appendix)
#         if isinstance(maybe, dict):
#             appendix = maybe
#     if isinstance(appendix, dict) and appendix:
#         story.append(Paragraph("Appendix", styles["Section16"]))
#         data_rows = [[Paragraph("Metric", styles["Body11"]), Paragraph("Value", styles["Body11"])] ]
#         for k, v in appendix.items():
#             data_rows.append([Paragraph(_format_text_with_bold_markers(str(k)), styles["Body11"]), Paragraph(_format_text_with_bold_markers(str(v)), styles["Body11"])])
#         t = Table(data_rows, colWidths=[doc.width*0.5, doc.width*0.5])
#         t.setStyle(TableStyle([( "GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#dddddd")), ("BACKGROUND", (0,0), (-1,0), colors.whitesmoke)]))
#         story.append(t)

#     # Header/Footer with page X of Y and teal accent line
#     header_text = f"D-BIAS Analytical Report — {dataset_name}"

#     class NumberedCanvas(canvas.Canvas):
#         header = header_text
#         gen_date = report_date
#         lmargin = margin
#         rmargin = margin
#         def __init__(self, *args, **kwargs):
#             super().__init__(*args, **kwargs)
#             self._saved_page_states = []
#         def showPage(self):
#             # Save state for later pass, then start a fresh page without emitting
#             self._saved_page_states.append(dict(self.__dict__))
#             self._startPage()
#         def save(self):
#             num_pages = len(self._saved_page_states)
#             for state in self._saved_page_states:
#                 self.__dict__.update(state)
#                 self.draw_header_footer(num_pages)
#                 canvas.Canvas.showPage(self)
#             canvas.Canvas.save(self)
#         def draw_header_footer(self, page_count):
#             w, h = self._pagesize
#             self.saveState()
#             # Header text
#             self.setFont("Helvetica", 8)
#             self.setFillColor(TEAL)
#             self.drawString(self.lmargin, h - 36, self.header)
#             # Teal accent line
#             self.setStrokeColor(TEAL)
#             self.setLineWidth(1)
#             self.line(self.lmargin, h - 40, w - self.rmargin, h - 40)
#             # Footer
#             self.setFillColor(TEXT_MUTED)
#             self.drawRightString(w - self.rmargin, 36, f"Page {self._pageNumber} of {page_count} | Generated on {self.gen_date}")
#             self.restoreState()

#     # Build PDF
#     doc.build(story, canvasmaker=NumberedCanvas)

#     return output_path


