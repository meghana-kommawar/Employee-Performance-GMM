EMPLOYEE PERFORMANCE CLUSTERING USING GMM

Run:
    pip install -r requirements.txt
    python app.py

Then open:
    http://127.0.0.1:5000

Important:
- GMM uses satisfaction_level, last_evaluation, number_project,
  average_montly_hours, and time_spend_company.
- 'left' is excluded from clustering because it is an outcome/target.
- K=2..6 are tested.
- BIC is the primary model-selection criterion.
- AIC, BIC, and Silhouette are shown together.
- PCA is used for 2D visualization.
- 'left' can be analyzed after clustering as attrition by cluster.
