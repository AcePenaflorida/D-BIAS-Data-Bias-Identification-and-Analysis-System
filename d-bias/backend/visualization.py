# backend/visualization.py
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd

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
        title="⚖️ Interactive Bias Density Overview",
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
        title="🔥 Bias Type–Severity Heatmap",
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
        title="📊 Bias Type Frequency Summary",
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
