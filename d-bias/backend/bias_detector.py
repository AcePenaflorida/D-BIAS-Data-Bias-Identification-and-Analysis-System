# backend/bias_detector.py
import pandas as pd
import numpy as np
from scipy.stats import chi2_contingency, zscore
import textwrap
import warnings
import os
from typing import Optional, Dict, Any, List

warnings.filterwarnings("ignore")

# Optional ML libs (graceful)
try:
    from sklearn.decomposition import PCA
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except Exception:
    SKLEARN_AVAILABLE = False

# Optional fairness lib (graceful)
try:
    from fairlearn.metrics import MetricFrame, selection_rate, false_positive_rate, false_negative_rate
    FAIRLEARN_AVAILABLE = True
except Exception:
    FAIRLEARN_AVAILABLE = False

# ==========================================
# ✅ MLBiasOptimizer
# ==========================================
class MLBiasOptimizer:
    """
    Lightweight optimizer to:
      - extract dataset statistics,
      - compute adaptive thresholds,
      - provide PCA-based numeric reduction groups,
      - optionally run a quick model-based fairness evaluation.
    """

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.num_cols = self.df.select_dtypes(include=np.number).columns.tolist()
        self.cat_cols = self.df.select_dtypes(exclude=np.number).columns.tolist()
        self.stats = self._compute_stats()
        self.thresholds = self._auto_thresholds()

    def _compute_stats(self) -> Dict[str, Any]:
        stats = {}
        stats["n_rows"], stats["n_cols"] = self.df.shape
        stats["missing_mean"] = self.df.isna().mean().mean()
        stats["num_cols"] = len(self.num_cols)
        stats["cat_cols"] = len(self.cat_cols)
        # numeric skew/kurtosis (robust)
        if self.num_cols:
            # pandas may warn about numeric_only in older/newer versions; keep numeric_only param if supported
            try:
                skews = self.df[self.num_cols].dropna().skew(numeric_only=True)
            except TypeError:
                skews = self.df[self.num_cols].dropna().skew()
            stats["mean_skew"] = float(np.nanmean(skews))
            stats["median_skew"] = float(np.nanmedian(skews))
        else:
            stats["mean_skew"] = 0.0
            stats["median_skew"] = 0.0
        return stats

    def _auto_thresholds(self) -> Dict[str, float]:
        """
        Provide adaptive thresholds based on dataset statistics.
        These are safe defaults — you can plug in a learned model here later.
        """
        t = {}
        # missingness: more tolerant for large datasets
        if self.stats["n_rows"] < 200:
            t["missing_warn"] = 0.05
            t["missing_high"] = 0.15
        elif self.stats["n_rows"] < 2000:
            t["missing_warn"] = 0.07
            t["missing_high"] = 0.2
        else:
            t["missing_warn"] = 0.1
            t["missing_high"] = 0.25

        # correlation thresholds adapt with number of numeric features
        base_corr = 0.4
        if self.stats["num_cols"] > 50:
            base_corr = 0.5  # be stricter in high-dim (after PCA we still check)
        t["corr_warn"] = base_corr
        t["corr_high"] = min(0.85, base_corr + 0.25)

        # outlier ratio threshold adapts with skew
        mean_skew = abs(self.stats.get("mean_skew", 0.0))
        t["outlier_warn"] = 0.05
        t["outlier_high"] = 0.15 if mean_skew < 1 else 0.2

        return t

    def reduce_numeric_features_via_pca(self, variance_retained: float = 0.95) -> Optional[pd.DataFrame]:
        """
        Reduce numeric columns using PCA to capture redundancy.
        Returns transformed dataframe (reduced components) or None if sklearn not available or no numeric columns.
        Use this to speed correlation / redundancy checks.
        """
        if not SKLEARN_AVAILABLE or not self.num_cols:
            return None
        df_num = self.df[self.num_cols].fillna(self.df[self.num_cols].median())
        scaler = StandardScaler()
        df_scaled = scaler.fit_transform(df_num)
        pca = PCA(n_components=variance_retained, random_state=0)
        reduced = pca.fit_transform(df_scaled)
        # return as DataFrame with component names
        comp_names = [f"PCA_{i}" for i in range(reduced.shape[1])]
        return pd.DataFrame(reduced, columns=comp_names, index=self.df.index)

    def evaluate_model_fairness(self, target_col: str, sensitive_cols: List[str], test_size: float = 0.3) -> Dict[str, Any]:
        """
        Quick model-based fairness check:
          - trains a simple logistic regression (if possible),
          - computes selection_rate and FPR/FNR by group using fairlearn (if available).
        Returns a summary dict. Gracefully degrades if libs not present.
        """
        if not SKLEARN_AVAILABLE or target_col not in self.df.columns:
            return {"status": "skipped", "reason": "sklearn missing or target not found"}

        result = {"status": "ok", "by_sensitive": {}}
        # prepare X/y
        df = self.df.dropna(subset=[target_col])
        y = df[target_col]
        X = df.drop(columns=[target_col]).select_dtypes(include=[np.number]).fillna(0)
        if X.shape[1] == 0:
            return {"status": "skipped", "reason": "no numeric features for modelling"}

        # train/test split
        try:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, stratify=y, random_state=0)
            clf = LogisticRegression(max_iter=1000, solver="liblinear")
            clf.fit(X_train, y_train)
            y_pred = clf.predict(X_test)
        except Exception as e:
            return {"status": "skipped", "reason": f"training failed: {e}"}

        # if fairlearn available compute metric frame
        if FAIRLEARN_AVAILABLE and sensitive_cols:
            for s in sensitive_cols:
                if s not in X_test.columns and s in df.columns:
                    # use original column from df if not in numeric X_test
                    sf = df.loc[X_test.index, s]
                elif s in X_test.columns:
                    sf = X_test[s]
                else:
                    continue
                metric_frame = MetricFrame(
                    metrics={'selection_rate': selection_rate,
                             'false_positive_rate': false_positive_rate,
                             'false_negative_rate': false_negative_rate},
                    y_true=y_test,
                    y_pred=y_pred,
                    sensitive_features=sf
                )
                result["by_sensitive"][s] = metric_frame.by_group.to_dict()
        else:
            # fallback: grouping selection rates by sensitive cols if present in df
            for s in sensitive_cols:
                if s in df.columns:
                    grp = pd.DataFrame({"y_true": y_test, "y_pred": y_pred, s: df.loc[y_test.index, s]})
                    rates = grp.groupby(s)["y_pred"].value_counts(normalize=True).unstack(fill_value=0).to_dict(orient="index")
                    result["by_sensitive"][s] = {"selection_rate_by_group": rates}
        return result


# ==========================================
# 1️⃣ Gemini Connector (kept small here if needed)
# ==========================================
# Note: For separation of concerns we kept Gemini connector in gemini_connector.py.
# If you want it copied here remove the separate module and re-add.


# ==========================================
# 2️⃣ BiasDetector (core)
# ==========================================
class BiasDetector:
    def __init__(self, df: pd.DataFrame, exclude_columns: list[str] = None, optimizer: Optional[MLBiasOptimizer] = None):
        self.df = df.copy()
        self.bias_report = []

        # Handle excluded columns (case-insensitive)
        self.exclude_columns = []
        if exclude_columns:
            # normalize provided exclude list, handle capitalization variants
            self.exclude_columns = [c for c in exclude_columns if c in self.df.columns or c.lower() in [col.lower() for col in self.df.columns]]
            # attempt to drop them (ignore errors)
            self.df = self.df.drop(columns=self.exclude_columns, errors="ignore")

        # Detect column types
        self.num_cols = self.df.select_dtypes(include=np.number).columns.tolist()
        self.cat_cols = self.df.select_dtypes(exclude=np.number).columns.tolist()
        self.target_col = self._detect_target_column()

        # optimizer
        self.optimizer = optimizer or MLBiasOptimizer(self.df)
        self.thresholds = self.optimizer.thresholds

        # Precompute reduced numeric view if available
        self.reduced_numeric_df = self.optimizer.reduce_numeric_features_via_pca() if SKLEARN_AVAILABLE else None

    def _detect_target_column(self):
        for c in self.df.columns:
            if any(k in c.lower() for k in ["target", "label", "outcome", "class", "disease", "result"]):
                return c
        return None

    def detect_missing_bias(self):
        warn_t = self.thresholds.get("missing_warn", 0.05)
        high_t = self.thresholds.get("missing_high", 0.2)
        for c, ratio in self.df.isna().mean().items():
            if ratio > warn_t:
                self.bias_report.append({
                    "Type": "Missing Data Bias",
                    "Feature": c,
                    "Description": f"{ratio*100:.1f}% missing values — possible sampling bias.",
                    "Severity": "High" if ratio > high_t else "Moderate"
                })
            # systematic missingness tests against categorical groups
            for group_col in self.cat_cols:
                if c == group_col:
                    continue
                try:
                    contingency = pd.crosstab(self.df[group_col], self.df[c].isna())
                    if contingency.shape[0] > 1 and contingency.shape[1] > 1:
                        chi2, p, _, _ = chi2_contingency(contingency)
                        if p < 0.05:
                            self.bias_report.append({
                                "Type": "Systematic Missingness",
                                "Feature": f"{c} vs {group_col}",
                                "Description": f"Missing values in '{c}' depend on '{group_col}' (p={p:.4f}).",
                                "Severity": "High" if p < 0.01 else "Moderate"
                            })
                except Exception:
                    continue

    def detect_categorical_imbalance(self):
        for c in self.cat_cols:
            vc = self.df[c].value_counts(normalize=True)
            if vc.empty:
                continue
            # entropy for distributional measure
            entropy = -(vc * np.log2(vc + 1e-12)).sum()
            dominant_pct = vc.iloc[0]
            if dominant_pct > 0.6 or entropy < 1.0:
                self.bias_report.append({
                    "Type": "Categorical Imbalance",
                    "Feature": c,
                    "Description": f"'{vc.index[0]}' dominates {dominant_pct*100:.1f}% of '{c}' values (entropy={entropy:.2f}).",
                    "Severity": "High" if dominant_pct > 0.75 else "Moderate"
                })

        # intersectional check on pairs (cheap)
        if len(self.cat_cols) >= 2:
            for i in range(len(self.cat_cols)-1):
                a, b = self.cat_cols[i], self.cat_cols[i+1]
                combo = self.df[a].astype(str) + "||" + self.df[b].astype(str)
                combo_vc = combo.value_counts(normalize=True)
                if combo_vc.iloc[0] > 0.7:
                    self.bias_report.append({
                        "Type": "Intersectional Bias",
                        "Feature": f"{a} × {b}",
                        "Description": f"'{combo_vc.index[0]}' combination dominates {combo_vc.iloc[0]*100:.1f}% of combinations.",
                        "Severity": "High"
                    })

    def detect_numeric_correlation(self):
        corr_warn = self.thresholds.get("corr_warn", 0.4)
        corr_high = self.thresholds.get("corr_high", 0.7)

        # Use reduced numeric view (PCA components) to find candidate redundancies faster when available
        if self.reduced_numeric_df is not None and self.reduced_numeric_df.shape[1] > 1:
            corr_matrix = self.reduced_numeric_df.corr()
            corr_pairs = (
                corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
                .stack().reset_index()
            )
            corr_pairs.columns = ["Comp A", "Comp B", "Correlation"]
            corr_pairs = corr_pairs[abs(corr_pairs["Correlation"]) > corr_warn]
            # Map back to original features is non-trivial; we report component-level redundancy
            for _, row in corr_pairs.iterrows():
                self.bias_report.append({
                    "Type": "Numeric Correlation Bias (PCA)",
                    "Feature": f"{row['Comp A']} ↔ {row['Comp B']}",
                    "Description": f"Strong component correlation r={row['Correlation']:.3f} (use to inspect original features).",
                    "Severity": "High" if abs(row["Correlation"]) > corr_high else "Moderate"
                })
            # Also do a partial check on original columns for high-variance pairs if dimensionality manageable
            if len(self.num_cols) < 200:
                df_corr = self.df[self.num_cols].dropna(axis=0)
                df_corr = df_corr.loc[:, df_corr.std() > 0]
                if df_corr.shape[1] >= 2:
                    corr_matrix_o = df_corr.corr()
                    corr_pairs_o = (
                        corr_matrix_o.where(np.triu(np.ones(corr_matrix_o.shape), k=1).astype(bool))
                        .stack().reset_index()
                    )
                    corr_pairs_o.columns = ["Feature A", "Feature B", "Correlation"]
                    corr_pairs_o = corr_pairs_o[abs(corr_pairs_o["Correlation"]) > corr_warn]
                    for _, row in corr_pairs_o.iterrows():
                        self.bias_report.append({
                            "Type": "Numeric Correlation Bias",
                            "Feature": f"{row['Feature A']} ↔ {row['Feature B']}",
                            "Description": f"Strong correlation r={row['Correlation']:.3f}.",
                            "Severity": "High" if abs(row["Correlation"]) > corr_high else "Moderate"
                        })
        else:
            # fallback: pairwise correlation but only if not too many numeric cols
            if len(self.num_cols) < 200:
                df_corr = self.df[self.num_cols].dropna(axis=0)
                df_corr = df_corr.loc[:, df_corr.std() > 0]
                if df_corr.shape[1] < 2:
                    return
                corr_matrix = df_corr.corr()
                corr_pairs = (
                    corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
                    .stack().reset_index()
                )
                corr_pairs.columns = ["Feature A", "Feature B", "Correlation"]
                corr_pairs = corr_pairs[abs(corr_pairs["Correlation"]) > corr_warn]
                for _, row in corr_pairs.iterrows():
                    self.bias_report.append({
                        "Type": "Numeric Correlation Bias",
                        "Feature": f"{row['Feature A']} ↔ {row['Feature B']}",
                        "Description": f"Strong correlation r={row['Correlation']:.3f}.",
                        "Severity": "High" if abs(row["Correlation"]) > corr_high else "Moderate"
                    })
            else:
                # too many numeric cols and no PCA available: skip correlation step for speed
                self.bias_report.append({
                    "Type": "Numeric Correlation Bias",
                    "Feature": "Skipped correlation (high-dim, no PCA)",
                    "Description": "Too many numeric columns to do pairwise correlation quickly. Consider enabling sklearn for PCA pre-processing.",
                    "Severity": "Moderate"
                })

    def detect_outlier_bias(self):
        warn_t = self.thresholds.get("outlier_warn", 0.05)
        high_t = self.thresholds.get("outlier_high", 0.15)
        for c in self.num_cols:
            # robust IQR-based outlier detection
            col = self.df[c].dropna()
            if col.nunique() <= 10:
                continue
            q1, q3 = np.percentile(col, [25, 75])
            iqr = q3 - q1
            if iqr == 0:
                continue
            lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            outlier_ratio = ((col < lower) | (col > upper)).mean()
            if outlier_ratio > warn_t:
                direction = "right-skewed" if col.mean() > np.median(col) else "left-skewed"
                self.bias_report.append({
                    "Type": "Outlier Bias",
                    "Feature": c,
                    "Description": f"{outlier_ratio*100:.1f}% of '{c}' values are outliers ({direction}).",
                    "Severity": "High" if outlier_ratio > high_t else "Moderate"
                })

    def detect_target_association(self):
        if not self.target_col:
            return
        target = self.target_col

        # if target categorical, do chi2 for categorical features and disparity metrics
        if target in self.cat_cols:
            for c in self.cat_cols:
                if c == target:
                    continue
                try:
                    contingency = pd.crosstab(self.df[c], self.df[target])
                    if contingency.shape[0] > 1 and contingency.shape[1] > 1:
                        chi2, p, _, _ = chi2_contingency(contingency)
                        if p < 0.05:
                            self.bias_report.append({
                                "Type": "Target Association Bias",
                                "Feature": c,
                                "Description": f"'{c}' associates with '{target}' (p={p:.4f}).",
                                "Severity": "High" if p < 0.01 else "Moderate"
                            })
                        # simple fairness gap for binary case
                        if self.df[target].nunique() == 2 and self.df[c].nunique() == 2:
                            rates = self.df.groupby(c)[target].mean()
                            if len(rates) == 2:
                                diff = abs(rates.iloc[0] - rates.iloc[1])
                                if diff > 0.1:
                                    self.bias_report.append({
                                        "Type": "Fairness Disparity",
                                        "Feature": c,
                                        "Description": f"Outcome gap between {c} groups = {diff:.2f}.",
                                        "Severity": "High" if diff > 0.2 else "Moderate"
                                    })
                except Exception:
                    continue
        else:
            # numeric target: correlation checks (robust to NA)
            for c in self.num_cols:
                if c == target:
                    continue
                try:
                    corr = self.df[[c, target]].dropna().corr().iloc[0, 1]
                    if pd.notna(corr) and abs(corr) > 0.3:
                        self.bias_report.append({
                            "Type": "Target Correlation Bias",
                            "Feature": c,
                            "Description": f"'{c}' correlated with '{target}' (r={corr:.3f}).",
                            "Severity": "High" if abs(corr) > 0.5 else "Moderate"
                        })
                except Exception:
                    continue

    def generate_bias_report(self):
        # Run detectors (use the same sequence for compatibility)
        self.detect_missing_bias()
        self.detect_categorical_imbalance()
        self.detect_numeric_correlation()
        self.detect_outlier_bias()
        self.detect_target_association()
        return self.bias_report


class BiasReporter:
    def __init__(self, df, bias_report):
        self.df = df
        self.bias_report = bias_report

    def fairness_score(self):
        if not self.bias_report:
            return 95
        penalties = sum(10 if b.get("Severity", b.get("severity", "") ) == "High" else 5 for b in self.bias_report)
        return max(0, 100 - penalties)

    def print_summary(self):
        print("\n📘 DATASET FAIRNESS SUMMARY")
        print("=" * 80)
        if not self.bias_report:
            print("✅ No major biases detected — dataset appears balanced and well-distributed.")
            return

        summary_text = "\n".join([
            f"- [{b.get('Type', b.get('type'))}] {b.get('Feature', b.get('feature', b.get('pair', '')))}: {b.get('Description', '')} (Severity: {b.get('Severity', b.get('severity', ''))})"
            for b in self.bias_report
        ])
        print(textwrap.fill(summary_text, width=120))

    def print_reliability(self):
        n = len(self.df)
        score = self.fairness_score()
        print("\n💡 Fairness Reliability Score:", score, "/100")
        if n < 100:
            print("⚠️ Dataset small — detection reliability limited.")
        elif n < 1000:
            print("🟡 Moderate dataset size — reliability good but not fully stable.")
        else:
            print("🟢 Large dataset — bias detection reliability is high.")

        if score > 85:
            print("🟢 Dataset appears fair and balanced.")
        elif score > 60:
            print("🟡 Some moderate biases detected — review recommended.")
        else:
            print("🔴 High bias risk — dataset requires correction before modeling.")
