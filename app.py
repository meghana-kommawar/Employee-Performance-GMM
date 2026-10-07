from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from pathlib import Path

import pandas as pd
import numpy as np

from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score


app = Flask(__name__)


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

UPLOAD_FOLDER = BASE_DIR / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)

app.config["MAX_CONTENT_LENGTH"] = (
    50 * 1024 * 1024
)

current_df = None
current_result = None


# ============================================================
# HR PERFORMANCE FEATURES
# ============================================================

PERFORMANCE_FEATURES = [
    "satisfaction_level",
    "last_evaluation",
    "number_project",
    "average_montly_hours",
    "time_spend_company",
]


OPTIONAL_NUMERIC_FEATURES = [
    "Work_accident",
    "promotion_last_5years",
]


# left is an outcome/attrition variable.
# It is NOT used for GMM clustering.
TARGET_COLUMNS = [
    "left"
]


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def clean_number(value):

    if pd.isna(value):
        return None

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):

        value = float(value)

        if not np.isfinite(value):
            return None

        return value

    return value


def safe_float(value, digits=4):

    if value is None or pd.isna(value):
        return None

    value = float(value)

    if not np.isfinite(value):
        return None

    return round(value, digits)


def histogram(values, bins=20):

    values = pd.to_numeric(
        pd.Series(values),
        errors="coerce"
    ).dropna().to_numpy(dtype=float)

    if len(values) == 0:

        return {
            "labels": [],
            "counts": [],
            "centers": []
        }

    if np.min(values) == np.max(values):

        value = float(values[0])

        return {
            "labels": [
                f"{value:.2f}"
            ],

            "counts": [
                int(len(values))
            ],

            "centers": [
                value
            ]
        }

    counts, edges = np.histogram(
        values,
        bins=bins
    )

    return {

        "labels": [
            f"{edges[i]:.2f}–{edges[i + 1]:.2f}"
            for i in range(len(counts))
        ],

        "counts": [
            int(value)
            for value in counts
        ],

        "centers": [

            round(
                float(
                    (
                        edges[i]
                        +
                        edges[i + 1]
                    ) / 2
                ),
                4
            )

            for i in range(len(counts))
        ]
    }


def five_number(values):

    values = pd.to_numeric(
        pd.Series(values),
        errors="coerce"
    ).dropna().to_numpy(dtype=float)

    if len(values) == 0:

        return {
            "min": None,
            "q1": None,
            "median": None,
            "q3": None,
            "max": None
        }

    q = np.percentile(
        values,
        [
            0,
            25,
            50,
            75,
            100
        ]
    )

    return {

        "min":
            safe_float(
                q[0],
                3
            ),

        "q1":
            safe_float(
                q[1],
                3
            ),

        "median":
            safe_float(
                q[2],
                3
            ),

        "q3":
            safe_float(
                q[3],
                3
            ),

        "max":
            safe_float(
                q[4],
                3
            )
    }


def sample_pca(
    points,
    labels=None,
    max_points=1000
):
    """
    PCA visualization only.

    IMPORTANT:
    This sampling is ONLY for sending points to the browser.
    It does NOT affect:
        - GMM training
        - AIC
        - BIC
        - K selection
        - silhouette score
    """

    n = len(points)

    if n <= max_points:

        indices = np.arange(n)

    else:

        rng = np.random.default_rng(42)

        indices = np.sort(
            rng.choice(
                n,
                size=max_points,
                replace=False
            )
        )

    if labels is None:

        return [

            {
                "x":
                    float(
                        points[i, 0]
                    ),

                "y":
                    float(
                        points[i, 1]
                    )
            }

            for i in indices
        ]

    return [

        {
            "x":
                float(
                    points[i, 0]
                ),

            "y":
                float(
                    points[i, 1]
                ),

            "cluster":
                int(
                    labels[i]
                )
        }

        for i in indices
    ]


def get_model_features(df):

    numeric = df.select_dtypes(
        include=np.number
    ).columns.tolist()

    features = [

        feature

        for feature
        in PERFORMANCE_FEATURES

        if (
            feature in numeric
            and feature not in TARGET_COLUMNS
        )
    ]

    if len(features) < 2:

        features = [

            feature

            for feature
            in numeric

            if feature not in TARGET_COLUMNS
        ]

    return features


def prepare_features(
    df,
    features
):

    X = df[features].copy()

    X = X.replace(
        [
            np.inf,
            -np.inf
        ],
        np.nan
    )

    for column in X.columns:

        X[column] = pd.to_numeric(
            X[column],
            errors="coerce"
        )

    X = X.dropna(
        axis=1,
        how="all"
    )

    if X.shape[1] < 2:

        raise ValueError(
            "At least two numerical features with usable values are required."
        )

    for column in X.columns:

        median = X[column].median()

        if pd.isna(median):

            median = 0.0

        X[column] = X[column].fillna(
            median
        )

    return X


# ============================================================
# HOME
# ============================================================

@app.route("/")
def index():

    return render_template(
        "index.html"
    )


# ============================================================
# UPLOAD DATASET
# ============================================================

@app.route(
    "/upload",
    methods=["POST"]
)
def upload():

    global current_df
    global current_result

    if "file" not in request.files:

        return jsonify({

            "success":
                False,

            "message":
                "No file selected."

        }), 400

    file = request.files["file"]

    if not file.filename:

        return jsonify({

            "success":
                False,

            "message":
                "No file selected."

        }), 400

    if not file.filename.lower().endswith(
        ".csv"
    ):

        return jsonify({

            "success":
                False,

            "message":
                "Please upload a CSV file."

        }), 400

    filename = secure_filename(
        file.filename
    )

    if not filename:

        return jsonify({

            "success":
                False,

            "message":
                "Invalid filename."

        }), 400

    path = (
        UPLOAD_FOLDER /
        filename
    )

    file.save(path)

    try:

        try:

            df = pd.read_csv(
                path
            )

        except UnicodeDecodeError:

            df = pd.read_csv(
                path,
                encoding="latin1"
            )

        if df.empty:

            return jsonify({

                "success":
                    False,

                "message":
                    "The CSV file is empty."

            }), 400

        df.columns = [

            str(column).strip()

            for column
            in df.columns
        ]

        current_df = df

        current_result = None

        numeric_columns = (

            df.select_dtypes(
                include=np.number
            )

            .columns
            .tolist()

        )

        recommended = [

            feature

            for feature
            in PERFORMANCE_FEATURES

            if feature in df.columns
        ]

        optional = [

            feature

            for feature
            in OPTIONAL_NUMERIC_FEATURES

            if feature in df.columns
        ]

        excluded_target = [

            feature

            for feature
            in TARGET_COLUMNS

            if feature in df.columns
        ]

        preview_df = df.head(
            8
        ).copy()

        preview_df = (
            preview_df
            .astype(object)
            .where(
                pd.notna(preview_df),
                None
            )
        )

        return jsonify({

            "success":
                True,

            "filename":
                filename,

            "rows":
                int(
                    df.shape[0]
                ),

            "columns":
                int(
                    df.shape[1]
                ),

            "missing":
                int(
                    df.isna()
                    .sum()
                    .sum()
                ),

            "duplicates":
                int(
                    df.duplicated()
                    .sum()
                ),

            "column_names":
                df.columns.tolist(),

            "numeric_columns":
                numeric_columns,

            "recommended_features":
                recommended,

            "optional_features":
                optional,

            "excluded_features":
                excluded_target,

            "preview":
                preview_df.to_dict(
                    orient="records"
                )
        })

    except Exception as exc:

        return jsonify({

            "success":
                False,

            "message":
                f"Could not read CSV: {exc}"

        }), 400


# ============================================================
# ANALYTICS
# ============================================================

@app.route("/analytics")
def analytics():

    if current_df is None:

        return jsonify({

            "success":
                False,

            "message":
                "Upload a CSV dataset first."

        }), 400

    try:

        features = get_model_features(
            current_df
        )

        X = prepare_features(
            current_df,
            features
        )

        features = X.columns.tolist()

        # ----------------------------------------------------
        # STATISTICS
        # ----------------------------------------------------

        statistics = []

        for feature in features:

            values = X[feature]

            statistics.append({

                "feature":
                    feature,

                "mean":
                    safe_float(
                        values.mean(),
                        3
                    ),

                "median":
                    safe_float(
                        values.median(),
                        3
                    ),

                "std":
                    safe_float(
                        values.std(
                            ddof=1
                        ),
                        3
                    ),

                "min":
                    safe_float(
                        values.min(),
                        3
                    ),

                "max":
                    safe_float(
                        values.max(),
                        3
                    )
            })

        # ----------------------------------------------------
        # CORRELATION
        # ----------------------------------------------------

        correlation_matrix = (
            X.corr()
            .fillna(0.0)
        )

        correlation = {

            "labels":
                features,

            "matrix":
                correlation_matrix
                .round(3)
                .values
                .tolist()
        }

        # ----------------------------------------------------
        # DISTRIBUTIONS
        # ----------------------------------------------------

        distributions = {

            feature:
                histogram(
                    X[feature].values,
                    bins=20
                )

            for feature
            in features
        }

        # ----------------------------------------------------
        # BOX PLOTS
        # ----------------------------------------------------

        box_stats = {

            feature:
                five_number(
                    X[feature].values
                )

            for feature
            in features
        }

        # ----------------------------------------------------
        # MISSING VALUES
        # ----------------------------------------------------

        missing_by_feature = {

            feature:
                int(
                    current_df[
                        feature
                    ]
                    .isna()
                    .sum()
                )

            for feature
            in features
        }

        # ----------------------------------------------------
        # STANDARDIZATION
        # ----------------------------------------------------

        scaler = StandardScaler()

        scaled = scaler.fit_transform(
            X
        )

        standardization = []

        for index, feature in enumerate(
            features
        ):

            standardization.append({

                "feature":
                    feature,

                "original_mean":
                    safe_float(
                        X[feature].mean(),
                        3
                    ),

                "original_std":
                    safe_float(
                        X[feature].std(
                            ddof=0
                        ),
                        3
                    ),

                "standardized_mean":
                    safe_float(
                        np.mean(
                            scaled[:, index]
                        ),
                        3
                    ),

                "standardized_std":
                    safe_float(
                        np.std(
                            scaled[:, index]
                        ),
                        3
                    )
            })

        # ----------------------------------------------------
        # PCA BEFORE CLUSTERING
        # ----------------------------------------------------

        pca_before_json = []

        pca_variance = [
            0.0,
            0.0
        ]

        if (
            len(X) >= 2
            and len(features) >= 2
        ):

            pca = PCA(
                n_components=2,
                random_state=42
            )

            pca_points = pca.fit_transform(
                scaled
            )

            pca_variance = (
                pca
                .explained_variance_ratio_
                * 100
            ).tolist()

            pca_before_json = sample_pca(
                pca_points
            )

        return jsonify({

            "success":
                True,

            "features":
                features,

            "statistics":
                statistics,

            "correlation":
                correlation,

            "distributions":
                distributions,

            "box_stats":
                box_stats,

            "missing_total":
                int(
                    current_df
                    .isna()
                    .sum()
                    .sum()
                ),

            "missing_by_feature":
                missing_by_feature,

            "duplicates":
                int(
                    current_df
                    .duplicated()
                    .sum()
                ),

            "standardization":
                standardization,

            "pca_before":
                pca_before_json,

            "pca_variance": [

                round(
                    float(value),
                    2
                )

                for value
                in pca_variance
            ]
        })

    except Exception as exc:

        return jsonify({

            "success":
                False,

            "message":
                f"Analytics error: {exc}"

        }), 500


# ============================================================
# TRAIN GMM
# ============================================================

@app.route(
    "/train",
    methods=["POST"]
)
def train():

    global current_result

    if current_df is None:

        return jsonify({

            "success":
                False,

            "message":
                "Upload a CSV dataset first."

        }), 400

    try:

        # ====================================================
        # STEP 1 — REMOVE DUPLICATES
        # ====================================================

        df_model = (
            current_df
            .drop_duplicates()
            .copy()
        )

        if df_model.empty:

            raise ValueError(
                "No rows remain after removing duplicates."
            )

        duplicates_removed = (
            len(current_df)
            -
            len(df_model)
        )

        # ====================================================
        # STEP 2 — SELECT FEATURES
        # ====================================================

        data = request.get_json(
            silent=True
        ) or {}

        requested = data.get(
            "features",
            []
        )

        numeric_features = (

            df_model

            .select_dtypes(
                include=np.number
            )

            .columns
            .tolist()

        )

        allowed = [

            feature

            for feature
            in numeric_features

            if feature not in TARGET_COLUMNS
        ]

        if requested:

            features = [

                feature

                for feature
                in requested

                if feature in allowed
            ]

        else:

            features = [

                feature

                for feature
                in PERFORMANCE_FEATURES

                if feature in allowed
            ]

        if len(features) < 2:

            features = allowed

        if len(features) < 2:

            raise ValueError(
                "At least two numerical performance features are required."
            )

        # ====================================================
        # STEP 3 — PREPARE FEATURES
        # ====================================================

        X = prepare_features(
            df_model,
            features
        )

        # IMPORTANT:
        # X and df_model now have exactly the same row order.
        features = X.columns.tolist()

        if len(X) < 3:

            raise ValueError(
                "At least 3 rows are required for GMM clustering."
            )

        # ====================================================
        # STEP 4 — STANDARDIZATION
        # ====================================================

        scaler = StandardScaler()

        X_scaled = scaler.fit_transform(
            X
        )

        # ====================================================
        # STEP 5 — PCA
        # ====================================================

        pca = PCA(
            n_components=2,
            random_state=42
        )

        pca_points = pca.fit_transform(
            X_scaled
        )

        explained = (
            pca.explained_variance_ratio_
            *
            100
        )

        # ====================================================
        # STEP 6 — TEST K = 2,3,4,5,6
        #
        # IMPORTANT:
        # ALL rows are used.
        #
        # There is NO 5000-row sample here.
        # ====================================================

        max_k = min(
            6,
            len(X_scaled) - 1
        )

        if max_k < 2:

            raise ValueError(
                "The dataset is too small to test K=2."
            )

        k_values = list(
            range(
                2,
                max_k + 1
            )
        )

        aic_values = []

        bic_values = []

        silhouette_values = []

        cluster_results = []

        fitted_models = {}

        # ====================================================
        # STEP 7 — TRAIN EVERY K USING COMPLETE DATASET
        # ====================================================

        for k in k_values:

            print(
                f"Training GMM for K={k} "
                f"using {len(X_scaled)} complete rows..."
            )

            model = GaussianMixture(

                n_components=k,

                covariance_type="full",

                random_state=42,

                n_init=3,

                reg_covar=1e-6,

                max_iter=300,

                tol=1e-3
            )

            # FULL DATASET
            model.fit(
                X_scaled
            )

            converged = bool(
                model.converged_
            )

            iterations = int(
                model.n_iter_
            )

            # ------------------------------------------------
            # PREDICTIONS USING ALL ROWS
            # ------------------------------------------------

            labels_k = model.predict(
                X_scaled
            )

            unique_labels = np.unique(
                labels_k
            )

            # ------------------------------------------------
            # SILHOUETTE USING ALL ROWS
            # ------------------------------------------------

            if len(unique_labels) > 1:

                silhouette = silhouette_score(
                    X_scaled,
                    labels_k
                )

            else:

                silhouette = 0.0

            # ------------------------------------------------
            # AIC USING ALL ROWS
            # ------------------------------------------------

            aic = model.aic(
                X_scaled
            )

            # ------------------------------------------------
            # BIC USING ALL ROWS
            # ------------------------------------------------

            bic = model.bic(
                X_scaled
            )

            # ------------------------------------------------
            # CLUSTER COUNTS
            # ------------------------------------------------

            counts = np.bincount(
                labels_k,
                minlength=k
            )

            aic_values.append(
                float(aic)
            )

            bic_values.append(
                float(bic)
            )

            silhouette_values.append(
                float(silhouette)
            )

            fitted_models[k] = model

            cluster_results.append({

                "k":
                    int(k),

                "aic":
                    round(
                        float(aic),
                        3
                    ),

                "bic":
                    round(
                        float(bic),
                        3
                    ),

                "silhouette":
                    round(
                        float(silhouette),
                        4
                    ),

                "converged":
                    converged,

                "iterations":
                    iterations,

                "clusters": [

                    {

                        "cluster":
                            int(i),

                        "count":
                            int(
                                counts[i]
                            ),

                        "percentage":
                            round(
                                float(
                                    counts[i]
                                    /
                                    len(labels_k)
                                    *
                                    100
                                ),
                                3
                            )
                    }

                    for i in range(k)
                ]
            })

        # ====================================================
        # STEP 8 — SELECT BEST K
        #
        # LOWEST BIC = SELECTED K
        #
        # BIC values are calculated using ALL rows.
        # ====================================================

        best_index = int(
            np.argmin(
                bic_values
            )
        )

        best_k = int(
            k_values[
                best_index
            ]
        )

        print(
            "================================================"
        )

        print(
            "GMM MODEL SELECTION"
        )

        print(
            f"Rows used: {len(X_scaled)}"
        )

        print(
            f"K values tested: {k_values}"
        )

        print(
            f"BIC values: {bic_values}"
        )

        print(
            f"Selected K: {best_k}"
        )

        print(
            "================================================"
        )

        # ====================================================
        # STEP 9 — FINAL MODEL
        # ====================================================

        gmm = fitted_models[
            best_k
        ]

        final_converged = bool(
            gmm.converged_
        )

        final_iterations = int(
            gmm.n_iter_
        )

        # ====================================================
        # STEP 10 — FINAL PREDICTION
        # ====================================================

        labels = gmm.predict(
            X_scaled
        )

        probabilities = (
            gmm.predict_proba(
                X_scaled
            )
        )

        confidence = (
            probabilities.max(
                axis=1
            )
            *
            100
        )

        silhouette = float(
            silhouette_values[
                best_index
            ]
        )

        # ====================================================
        # STEP 11 — CLUSTER SIZE
        # ====================================================

        cluster_counts = np.bincount(
            labels,
            minlength=best_k
        )

        cluster_sizes = [

            {

                "cluster":
                    int(i),

                "count":
                    int(
                        cluster_counts[i]
                    ),

                "percentage":
                    round(
                        float(
                            cluster_counts[i]
                            /
                            len(labels)
                            *
                            100
                        ),
                        2
                    )
            }

            for i in range(best_k)
        ]

        # ====================================================
        # STEP 12 — CLUSTER PROFILE
        # ====================================================

        profile_raw = X.copy()

        profile_raw["Cluster"] = labels

        profile_table = (

            profile_raw

            .groupby(
                "Cluster"
            )[features]

            .mean()

            .reindex(
                range(best_k)
            )
        )

        feature_std = (

            X.std(
                ddof=0
            )

            .replace(
                0,
                1
            )
        )

        profile_z = (

            profile_table
            -
            X.mean()

        ) / feature_std

        profile_z = (

            profile_z

            .replace(
                [
                    np.inf,
                    -np.inf
                ],
                0
            )

            .fillna(0)
        )

        profile_json = []

        profile_z_json = []

        for cluster in range(
            best_k
        ):

            raw_item = {

                "cluster":
                    int(cluster)
            }

            z_item = {

                "cluster":
                    int(cluster)
            }

            for feature in features:

                raw_item[feature] = (
                    clean_number(
                        profile_table.loc[
                            cluster,
                            feature
                        ]
                    )
                )

                z_item[feature] = (
                    clean_number(
                        profile_z.loc[
                            cluster,
                            feature
                        ]
                    )
                )

            profile_json.append(
                raw_item
            )

            profile_z_json.append(
                z_item
            )

        # ====================================================
        # STEP 13 — CONFIDENCE DISTRIBUTION
        # ====================================================

        conf_counts, conf_edges = (
            np.histogram(
                confidence,
                bins=np.linspace(
                    0,
                    100,
                    11
                )
            )
        )

        confidence_distribution = [

            {

                "label":
                    (
                        f"{int(conf_edges[i])}-"
                        f"{int(conf_edges[i + 1])}%"
                    ),

                "count":
                    int(
                        conf_counts[i]
                    )
            }

            for i in range(
                len(conf_counts)
            )
        ]

        # ====================================================
        # STEP 14 — POST-CLUSTER ATTRITION ANALYSIS
        #
        # left is NOT used to create clusters.
        # It is only analyzed AFTER clustering.
        # ====================================================

        attrition_by_cluster = []

        if "left" in df_model.columns:

            left_values = pd.to_numeric(
                df_model["left"],
                errors="coerce"
            )

            temp = pd.DataFrame({

                "cluster":
                    labels,

                "left":
                    left_values.to_numpy()
            })

            grouped = (

                temp

                .groupby(
                    "cluster"
                )["left"]

                .mean()

                .reindex(
                    range(best_k)
                )

                *
                100
            )

            attrition_by_cluster = [

                {

                    "cluster":
                        int(i),

                    "attrition":
                        round(
                            float(
                                grouped.loc[i]
                            ),
                            2
                        )
                }

                for i in range(best_k)

                if pd.notna(
                    grouped.loc[i]
                )
            ]

        # ====================================================
        # STEP 15 — FINAL RESULT
        # ====================================================

        current_result = {

            # Complete cleaned dataset
            "training_rows":
                int(
                    len(df_model)
                ),

            # Duplicate information
            "duplicates_removed":
                int(
                    duplicates_removed
                ),

            # Model convergence
            "converged":
                final_converged,

            "iterations":
                final_iterations,

            # IMPORTANT:
            # Full rows were used for K calculation.
            "k_calculation_rows":
                int(
                    len(X_scaled)
                ),

            # Silhouette also uses full rows.
            "silhouette_sample_size":
                int(
                    len(X_scaled)
                ),

            "features":
                features,

            # Selected K
            "best_k":
                best_k,

            # Final silhouette
            "silhouette":
                round(
                    silhouette,
                    4
                ),

            # Average membership confidence
            "avg_confidence":
                round(
                    float(
                        np.mean(
                            confidence
                        )
                    ),
                    2
                ),

            # Final model AIC
            "aic":
                round(
                    float(
                        gmm.aic(
                            X_scaled
                        )
                    ),
                    3
                ),

            # Final model BIC
            "bic":
                round(
                    float(
                        gmm.bic(
                            X_scaled
                        )
                    ),
                    3
                ),

            # K = 2,3,4,5,6
            "k_values":
                k_values,

            # AIC for every K
            "aic_values": [

                round(
                    float(value),
                    3
                )

                for value
                in aic_values
            ],

            # BIC for every K
            "bic_values": [

                round(
                    float(value),
                    3
                )

                for value
                in bic_values
            ],

            # Silhouette for every K
            "silhouette_values": [

                round(
                    float(value),
                    4
                )

                for value
                in silhouette_values
            ],

            # Detailed K results
            "cluster_results":
                cluster_results,

            # Final cluster sizes
            "cluster_sizes":
                cluster_sizes,

            # Cluster feature profiles
            "profile":
                profile_json,

            # Standardized cluster profiles
            "profile_z":
                profile_z_json,

            # Post-clustering attrition
            "attrition_by_cluster":
                attrition_by_cluster,

            # GMM probability confidence
            "confidence_distribution":
                confidence_distribution,

            # PCA variance
            "pca_variance": [

                round(
                    float(value),
                    2
                )

                for value
                in explained
            ],

            # PCA before clustering
            #
            # Visualization sampling ONLY.
            "pca_before":
                sample_pca(
                    pca_points
                ),

            # PCA after clustering
            #
            # Visualization sampling ONLY.
            "pca_after":
                sample_pca(
                    pca_points,
                    labels
                )
        }

        # ====================================================
        # RETURN RESULT
        # ====================================================

        return jsonify({

            "success":
                True,

            "result":
                current_result
        })

    except Exception as exc:

        app.logger.exception(
            "GMM training error"
        )

        return jsonify({

            "success":
                False,

            "message":
                f"Model training error: {exc}"

        }), 500


# ============================================================
# RUN APPLICATION
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )