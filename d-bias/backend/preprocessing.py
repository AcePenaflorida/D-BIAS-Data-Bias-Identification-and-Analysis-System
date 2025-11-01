import io
import os
import re
from typing import Tuple, List

import pandas as pd
import numpy as np


def _clean_column_name(name: str) -> str:
    # strip, lowercase, replace spaces/hyphens with underscore, remove non-word except underscore
    if name is None:
        return ""
    s = str(name).strip().lower()
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"[^0-9a-zA-Z_]+", "", s)
    if s == "":
        s = "col"
    return s


def _ensure_unique_columns(cols: List[str]) -> List[str]:
    seen = {}
    out = []
    for c in cols:
        base = c
        i = 1
        while c in seen:
            c = f"{base}_{i}"
            i += 1
        seen[c] = True
        out.append(c)
    return out


def load_and_preprocess(file_storage) -> Tuple[pd.DataFrame, List[str]]:
    """Load an uploaded file (CSV or Excel) into a cleaned pandas DataFrame.

    Returns (df, warnings). Raises ValueError on unsupported/invalid files.
    """
    warnings = []

    filename = getattr(file_storage, "filename", "uploaded") or "uploaded"
    name_lower = filename.lower()

    # read buffer
    try:
        content = file_storage.read()
    except Exception:
        # file_storage might be a flask FileStorage which supports .stream
        try:
            file_storage.stream.seek(0)
            content = file_storage.stream.read()
        except Exception as e:
            raise ValueError(f"Could not read uploaded file: {e}")

    # try to infer format by extension
    _, ext = os.path.splitext(name_lower)
    try:
        if ext in (".xls", ".xlsx"):
            # For excel, read first sheet
            df = pd.read_excel(io.BytesIO(content), engine="openpyxl" if ext == ".xlsx" else None)
            warnings.append(f"Excel file detected; using first sheet.")
        elif ext in (".csv", ".txt"):
            # try csv with pandas' sniffing
            try:
                df = pd.read_csv(io.StringIO(content.decode("utf-8")))
            except Exception:
                # fallback: try latin-1
                df = pd.read_csv(io.StringIO(content.decode("latin-1")))
        else:
            # attempt to read as CSV by default
            try:
                df = pd.read_csv(io.StringIO(content.decode("utf-8")))
                warnings.append(f"Unknown extension {ext}; attempted CSV parsing.")
            except Exception:
                # try excel fallback
                try:
                    df = pd.read_excel(io.BytesIO(content))
                    warnings.append(f"Unknown extension {ext}; parsed as Excel.")
                except Exception:
                    raise ValueError("Unsupported file type or corrupt file. Please upload a CSV or single-sheet Excel file.")
    except Exception as e:
        raise ValueError(f"Failed to parse uploaded file: {e}")

    # Basic sanity checks
    if df is None or not isinstance(df, pd.DataFrame):
        raise ValueError("Uploaded file did not contain a valid tabular sheet.")

    if df.shape[0] == 0 or df.shape[1] == 0:
        raise ValueError("Uploaded dataset is empty or has no columns.")

    # Drop fully-empty columns
    all_null_cols = [c for c in df.columns if df[c].isna().all()]
    if all_null_cols:
        df = df.drop(columns=all_null_cols)
        warnings.append(f"Dropped {len(all_null_cols)} entirely empty column(s): {all_null_cols}")

    # Lowercase and sanitize column names
    orig_cols = list(df.columns)
    cleaned = [_clean_column_name(c) for c in orig_cols]
    cleaned = _ensure_unique_columns(cleaned)
    df.columns = cleaned
    if cleaned != orig_cols:
        warnings.append(f"Normalized column names to lowercase/underscore: {cleaned}")

    # Trim whitespace for object/string columns
    obj_cols = df.select_dtypes(include=[object]).columns.tolist()
    for c in obj_cols:
        try:
            df[c] = df[c].apply(lambda v: v.strip() if isinstance(v, str) else v)
        except Exception:
            continue

    # Provide additional checks
    # if many missing values (>50% in any column) warn
    high_missing = {c: float(df[c].isna().mean()) for c in df.columns if df[c].isna().mean() > 0.5}
    if high_missing:
        warnings.append(f"Columns with >50% missing values: {list(high_missing.keys())}")

    # if duplicate column names were present (before cleanup) warn
    dup_cols = [c for c in orig_cols if orig_cols.count(c) > 1]
    if dup_cols:
        warnings.append(f"Duplicate column names detected in upload: {dup_cols}. They were made unique.")

    # Final check: ensure at least one non-empty column
    if df.shape[1] == 0:
        raise ValueError("No usable columns after preprocessing.")

    # Reset index to simple RangeIndex
    df = df.reset_index(drop=True)

    return df, warnings


def validate_dataset(df: pd.DataFrame) -> List[str]:
    """Run minimal sanity checks and return a list of error messages (empty if OK).

    Thresholds are configurable via environment variables:
      - MIN_ROWS (default 10)
      - MIN_COLS (default 2)
      - MAX_MISSING_COL_RATIO (default 0.8)  # per-column maximum allowed missing ratio
    """
    errors: List[str] = []
    try:
        min_rows = int(os.getenv("MIN_ROWS", "10"))
    except Exception:
        min_rows = 10
    try:
        min_cols = int(os.getenv("MIN_COLS", "2"))
    except Exception:
        min_cols = 2
    try:
        max_missing = float(os.getenv("MAX_MISSING_COL_RATIO", "0.8"))
    except Exception:
        max_missing = 0.8

    # basic shape checks
    if df.shape[0] < min_rows:
        errors.append(f"Too few rows: {df.shape[0]} < MIN_ROWS ({min_rows})")
    if df.shape[1] < min_cols:
        errors.append(f"Too few columns: {df.shape[1]} < MIN_COLS ({min_cols})")

    # per-column missingness
    high_missing_cols = [c for c in df.columns if df[c].isna().mean() > max_missing]
    if high_missing_cols:
        errors.append(f"Columns with >{int(max_missing*100)}% missing values: {high_missing_cols}")

    # too many duplicate rows? if all rows identical, dataset likely invalid
    try:
        if df.shape[0] > 1 and df.nunique().sum() == 0:
            errors.append("Dataset has no variability (all values identical or single unique value per column).")
    except Exception:
        pass

    # require at least one numeric and one categorical column by default
    require_both = os.getenv("REQUIRE_NUMERIC_AND_CATEGORICAL", "true").lower() in ("1", "true", "yes")
    try:
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        cat_cols = df.select_dtypes(include=[object, "category"]).columns.tolist()
        if require_both:
            if len(num_cols) == 0:
                errors.append("Dataset must include at least one numeric column.")
            if len(cat_cols) == 0:
                errors.append("Dataset must include at least one categorical/text column.")
    except Exception:
        # if dtype detection fails, skip this check
        pass

    # duplicate rows ratio
    try:
        dup_ratio = float(df.duplicated().mean())
        max_dup = float(os.getenv("MAX_DUPLICATE_ROW_RATIO", "0.5"))
        if dup_ratio > max_dup:
            errors.append(f"Too many duplicate rows: {dup_ratio:.2f} > MAX_DUPLICATE_ROW_RATIO ({max_dup}).")
    except Exception:
        pass
    except Exception:
        pass

    # ensure at least one non-empty column
    if df.shape[1] == 0:
        errors.append("No usable columns after preprocessing.")

    return errors
