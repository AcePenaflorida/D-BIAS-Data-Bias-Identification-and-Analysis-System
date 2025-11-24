import pandas as pd
import numpy as np

np.random.seed(42)
n = 200

# Initialize dataframe
data = pd.DataFrame({'PatientID': range(1, n+1)})

# 1. Missing Data Bias (30% missing Cholesterol)
data['Cholesterol'] = np.random.randint(150, 250, size=n)
missing_indices = np.random.choice(data.index, size=int(0.3*n), replace=False)
data.loc[missing_indices, 'Cholesterol'] = np.nan

# 2. Systematic Missingness (Cholesterol missing more for 'Old')
data['AgeGroup'] = np.random.choice(['Young', 'Middle', 'Old'], size=n)
sys_missing = (data['AgeGroup'] == 'Old')
sys_missing_indices = data[sys_missing].sample(frac=0.5, random_state=42).index
data.loc[sys_missing_indices, 'Cholesterol'] = np.nan

# 3. Categorical Imbalance (Profession skewed)
data['Profession'] = np.random.choice(['Engineer', 'Teacher', 'Artist'], p=[0.7, 0.2, 0.1], size=n)

# 4. Intersectional Bias (Gender + Residence)
data['Gender'] = np.random.choice(['Male', 'Female'], p=[0.6, 0.4], size=n)
data['Residence'] = np.random.choice(['Urban', 'Rural'], p=[0.65, 0.35], size=n)

# 5. Numeric Correlation Bias (Height vs ArmSpan)
data['Height'] = np.random.normal(170, 10, size=n)
data['ArmSpan'] = data['Height'] + np.random.normal(0, 2, size=n)

# 6. Outlier Bias (Salary)
data['Salary'] = np.random.randint(30000, 100000, size=n)
outlier_indices = np.random.choice(data.index, size=int(0.1*n), replace=False)
data.loc[outlier_indices, 'Salary'] *= 5

# 7. Target Association Bias (Region -> Disease)
data['Region'] = np.random.choice(['North', 'South'], size=n)
data['Disease'] = data['Region'].apply(lambda x: 1 if x=='North' else 0)

# 8. Fairness Disparity (LoanApproved by Gender)
def loan_approval(g):
    return np.random.choice([1,0], p=[0.7,0.3]) if g=='Male' else np.random.choice([1,0], p=[0.5,0.5])
data['LoanApproved'] = data['Gender'].apply(loan_approval)

# 9. Target Correlation Bias (HoursStudied -> ExamScore)
data['HoursStudied'] = np.random.randint(0, 20, size=n)
data['ExamScore'] = data['HoursStudied']*5 + np.random.normal(0, 5, size=n)

# Save CSV to your folder
file_path = r"C:\Users\ACER\Documents\_Projects\D-BIAS\d-bias\_data\sample_datasets\synthetic_bias_dataset.csv"
data.to_csv(file_path, index=False)
print(f"Dataset saved to: {file_path}\n")

# Summary table for checking biases
summary = pd.DataFrame({
    'BiasType': [
        'Missing Data Bias', 'Systematic Missingness', 'Categorical Imbalance', 
        'Intersectional Bias', 'Numeric Correlation Bias', 'Outlier Bias', 
        'Target Association Bias', 'Fairness Disparity', 'Target Correlation Bias'
    ],
    'ExampleFeature': [
        'Cholesterol', 'Cholesterol vs AgeGroup', 'Profession', 
        'Gender+Residence', 'Height & ArmSpan', 'Salary', 
        'Region->Disease', 'LoanApproved by Gender', 'HoursStudied->ExamScore'
    ],
    'ProportionAffected (%)': [
        round(data['Cholesterol'].isna().mean()*100,1),
        round((data['Cholesterol'].isna() & (data['AgeGroup']=='Old')).sum()/n*100,1),
        round(data['Profession'].value_counts(normalize=True).max()*100,1),
        round(((data['Gender']=='Male') & (data['Residence']=='Urban')).sum()/n*100,1),
        round(data[['Height','ArmSpan']].corr().iloc[0,1]*100,1),
        round((data['Salary'] > 100000).sum()/n*100,1),
        round((data.groupby('Region')['Disease'].mean().max()*100),1),
        round(data.groupby('Gender')['LoanApproved'].mean().max()*100,1),
        round(data[['HoursStudied','ExamScore']].corr().iloc[0,1]*100,1)
    ]
})

print("Bias Summary Table:")
print(summary)
