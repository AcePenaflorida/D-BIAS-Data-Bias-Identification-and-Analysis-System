import numpy as np
import pandas as pd
import os

def generate_master_d_bias_dataset(
    n_rows: int = 600,
    output: str = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\sample_datasets\d_bias_master.csv",
    meta_output: str = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\sample_datasets\d_bias_master_metadata.csv",
    random_seed: int = 42,
):
    """
    Generate a compact dataset that intentionally embeds all bias types used
    by D-BIAS. Signals are made strong enough to be detected reliably.

    Biases covered:
      1) Missing data bias (MAR + MCAR)
      2) Systematic missingness (dependent on groups)
      3) Categorical imbalance
      4) Intersectional bias (gender × location)
      5) Numeric correlation bias (redundant numeric features)
      6) Outlier bias (heavy-tailed mixture)
      7) Target association bias (categorical target linked to a feature)
      8) Fairness disparity (selection rate gap by sensitive attribute)
      9) Target correlation bias (numeric target linked to a feature)
    """

    rng = np.random.default_rng(random_seed)

    # Ensure folder exists
    os.makedirs(os.path.dirname(output), exist_ok=True)

    # ---------------------------
    # 0 — Base features
    # ---------------------------
    age = rng.integers(20, 80, n_rows)
    age_group = rng.choice(["Young", "Adult", "Senior"], n_rows, p=[0.4, 0.4, 0.2])

    # ---------------------------
    # 1 — Missing Data Bias (global + per-feature)
    # ---------------------------
    cholesterol = rng.normal(200, 30, n_rows)
    cholesterol[rng.random(n_rows) < 0.30] = np.nan  # ~30% MCAR

    # ---------------------------
    # 2 — Systematic Missingness (MAR): income depends on age_group
    # ---------------------------
    income = rng.normal(50000, 15000, n_rows)
    income[age_group == "Young"] = np.nan  # strong group-dependent missingness
    # add a second systematic missingness signal (cholesterol for Seniors)
    chol_mask = (age_group == "Senior") & (rng.random(n_rows) < 0.25)
    cholesterol[chol_mask] = np.nan

    # ---------------------------
    # 3 — Categorical Imbalance
    # ---------------------------
    profession = rng.choice(["Engineer", "Teacher", "Nurse"], n_rows, p=[0.80, 0.10, 0.10])
    # Imbalance in region as well (helps detection beyond profession)
    region = rng.choice(["North", "South", "East", "West"], n_rows, p=[0.15, 0.50, 0.20, 0.15])

    # ---------------------------
    # 4 — Intersectional Bias (gender × location)
    # ---------------------------
    gender = rng.choice(["Male", "Female"], n_rows)
    location = rng.choice(["Urban", "Rural"], n_rows)
    mask = rng.random(n_rows) < 0.75  # concentrate majority on Male + Urban
    gender[mask] = "Male"
    location[mask] = "Urban"

    # ---------------------------
    # 5 — Numeric Correlation Bias (redundant numeric features)
    # ---------------------------
    height = rng.normal(170, 10, n_rows)
    arm_span = height * 1.02 + rng.normal(0, 1.5, n_rows)
    weight = height * 0.45 + rng.normal(0, 3.0, n_rows)  # additional correlated feature

    # ---------------------------
    # 6 — Outlier Bias (mixture with heavy outliers)
    # ---------------------------
    normal_salary = rng.normal(50000, 8000, int(n_rows * 0.78))
    outlier_salary = rng.normal(160000, 22000, int(n_rows * 0.22))
    salary = np.concatenate([normal_salary, outlier_salary])
    rng.shuffle(salary)
    # a second outlier-prone numeric feature
    expenses = rng.normal(2000, 400, n_rows)
    spike_idx = rng.choice(n_rows, size=int(n_rows * 0.1), replace=False)
    expenses[spike_idx] += rng.normal(6000, 1000, size=spike_idx.size)

    # ---------------------------
    # 7 — Target Association Bias (categorical target tied to region)
    # ---------------------------
    disease = np.where(
        region == "South",
        rng.choice(["Yes", "No"], n_rows, p=[0.8, 0.2]),  # high risk in South
        rng.choice(["Yes", "No"], n_rows, p=[0.2, 0.8])   # low elsewhere
    )

    # ---------------------------
    # 8 — Fairness Disparity (selection rates differ by gender)
    # ---------------------------
    gender_fd = rng.choice(["Male", "Female"], n_rows)
    # Stronger disparity; make the outcome explicitly categorical for detectors
    loan_approved_binary = np.where(
        gender_fd == "Male",
        rng.choice([0, 1], n_rows, p=[0.15, 0.85]),  # advantaged group
        rng.choice([0, 1], n_rows, p=[0.75, 0.25])   # disadvantaged group
    )
    loan_approved = np.where(loan_approved_binary == 1, "Approved", "Denied")

    # ---------------------------
    # 9 — Target Correlation Bias (numeric target)
    # ---------------------------
    hours = rng.uniform(0, 10, n_rows)
    exam_score = hours * 12 + rng.normal(0, 3.0, n_rows)  # stronger linear link
    # Provide a numeric target with a target-like keyword to ensure detection
    label_score = hours * 15 + rng.normal(0, 2.0, n_rows)

    # ---------------------------
    # Combine into master dataframe
    # Ensure the first target-like column is categorical ('disease') so
    # BiasDetector selects it for target association in the categorical branch.
    # Avoid placing a numeric column with target-like keywords (e.g., 'label')
    # before 'disease' to prevent switching to the numeric branch.
    # ---------------------------
    df = pd.DataFrame({
        "age": age,
        "cholesterol": cholesterol,

        "age_group": age_group,
        "income": income,

        "profession": profession,

        "gender": gender,
        "location": location,

        "height": height,
        "arm_span": arm_span,
        "weight": weight,

        "salary": salary,
        "expenses": expenses,

        # Prioritize numeric target correlation: place a numeric target-like with keyword early
        "label_score": label_score,
        # Keep categorical association signals
        "region": region,
        "disease": disease,  # categorical target-like column

        "gender_fd": gender_fd,
        # include both numeric binary target and categorical label for fairness disparity detection
        "loan_approved_result": loan_approved_binary,  # numeric binary target-like column
        "loan_approved": loan_approved,

        "hours_studied": hours,
        "exam_score": exam_score
    })

    # Save master dataset
    df.to_csv(output, index=False)

    # ---------------------------
    # Ground-truth metadata: mark all biases as present (1)
    # ---------------------------
    meta = pd.DataFrame([{
        "missing_data_bias": 1,
        "systematic_missingness": 1,
        "categorical_imbalance": 1,
        "intersectional_bias": 1,
        "numeric_correlation_bias": 1,
        "outlier_bias": 1,
        "target_association_bias": 1,
        "fairness_disparity": 1,
        "target_correlation_bias": 1
    }])

    meta.to_csv(meta_output, index=False)

    print("✔ Master dataset saved to:", output)
    print("✔ Metadata file saved to:", meta_output)
    return df


# RUN IT
if __name__ == "__main__":
    generate_master_d_bias_dataset()
