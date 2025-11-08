import streamlit as st

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="Figma Styled Button Demo",
    page_icon="⬇️",
    layout="centered"
)

# --- CUSTOM CSS (Figma styles translated) ---
st.markdown("""
<style>
/* Import Google Font */
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap');

/* PAGE BACKGROUND (optional dark mode style) */
body {
    background-color: #0E1117;
}

/* Style for the download button */
div[data-testid="stDownloadButton"] > button {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    padding: 8px 12px;
    gap: 8px;

    width: 153px;
    height: 40px;

    background: #0E1117;
    border: 1px solid rgba(250, 250, 250, 0.2);
    border-radius: 8px;

    color: #FAFAFA;
    font-family: 'Source Sans 3', sans-serif;
    font-weight: 400;
    font-size: 16px;
    line-height: 24px;
    text-align: center;

    transition: all 0.2s ease-in-out;
}

/* Hover state */
div[data-testid="stDownloadButton"] > button:hover {
    border-color: rgba(250, 250, 250, 0.4);
    background: #262730;
}

/* Tooltip styling */
[data-testid="stTooltipContent"] {
    background: #262730 !important;
    color: #FAFAFA !important;
    font-family: 'Source Sans 3', sans-serif !important;
    font-size: 14px !important;
    border-radius: 8px !important;
    padding: 8px 10px !important;
    box-shadow: 0px 10px 10px 3px rgba(49, 51, 63, 0.1), 
                0px 1px 2px -1px rgba(49, 51, 63, 0.1) !important;
}

/* Optional container spacing (to mimic Figma frame padding) */
.block-container {
    padding-top: 4rem;
}
</style>
""", unsafe_allow_html=True)

# --- CONTENT (Frame Simulation) ---
with st.container():
    st.markdown("### Download Section")
    st.write("Get your data or report with the styled download button below 👇")

    # The Figma-styled Streamlit button
    st.download_button(
        label="Download now",
        data="This is some text from your Streamlit app.",
        file_name="sample.txt",
        mime="text/plain",
        help="Help message goes here"
    )

st.markdown("---")
st.caption("Figma → Streamlit | Custom styled download button demo 💅")
