// ============================================================
// EMPLOYEE PERFORMANCE CLUSTERING - GMM DASHBOARD
// UPDATED VERSION
// ============================================================

let analyticsData = null;
let resultData = null;

const charts = {};

Chart.defaults.font.family = "Times New Roman";
Chart.defaults.font.size = 13;

Chart.defaults.animation.duration = 1100;
Chart.defaults.animation.easing = "easeOutQuart";

const PALETTE = [
    "#1565c0",
    "#42a5f5",
    "#7e57c2",
    "#26a69a",
    "#ef6c00",
    "#c62828",
    "#00838f",
    "#6d4c41"
];


// ============================================================
// ZERO VALUE LABEL PLUGIN
// ============================================================

const zeroValueLabelPlugin = {

    id: "zeroValueLabel",

    afterDatasetsDraw(chart) {

        if (
            !chart.canvas ||
            chart.canvas.id !== "missingChart"
        ) {
            return;
        }

        const dataset =
            chart.data.datasets?.[0];

        if (!dataset) {
            return;
        }

        const meta =
            chart.getDatasetMeta(0);

        const ctx =
            chart.ctx;

        ctx.save();

        ctx.font =
            'bold 13px "Times New Roman"';

        ctx.fillStyle =
            "#7e57c2";

        ctx.textAlign =
            "center";

        meta.data.forEach(
            (bar, index) => {

                const value =
                    Number(
                        dataset.data[index] || 0
                    );

                if (value === 0) {

                    ctx.fillText(
                        "0",
                        bar.x,
                        chart.scales.y
                            .getPixelForValue(0) - 8
                    );
                }
            }
        );

        ctx.restore();
    }
};

Chart.register(
    zeroValueLabelPlugin
);


// ============================================================
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function setText(id, value) {

    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}


function destroyChart(name) {

    if (charts[name]) {

        charts[name].destroy();

        delete charts[name];
    }
}


function destroyAllCharts() {

    Object.keys(charts)
        .forEach(
            destroyChart
        );
}


function fmt(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return "-";
    }

    return n.toLocaleString(
        undefined,
        {
            maximumFractionDigits: 3
        }
    );
}


function fmtPercent(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return "-";
    }

    return `${n.toFixed(2)}%`;
}


function escapeHtml(value) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );
}


// ============================================================
// NAVIGATION
// ============================================================

function showSection(sectionId) {

    document
        .querySelectorAll(".section")
        .forEach(
            section => {

                section.classList.toggle(
                    "active",
                    section.id === sectionId
                );
            }
        );


    document
        .querySelectorAll(".nav-btn")
        .forEach(
            button => {

                const action =
                    button.getAttribute(
                        "onclick"
                    ) || "";

                button.classList.toggle(
                    "active",
                    action.includes(
                        sectionId
                    )
                );
            }
        );


    if (
        (
            sectionId === "dataset" ||
            sectionId === "preprocessing"
        ) &&
        !analyticsData
    ) {

        loadAnalytics();
    }

}


// ============================================================
// CHART BASE OPTIONS
// ============================================================

function chartBaseOptions(
    titleX = "",
    titleY = ""
) {

    return {

        responsive: true,

        maintainAspectRatio: false,

        animation: {

            duration: 1200,

            easing: "easeOutQuart"
        },

        plugins: {

            legend: {

                labels: {

                    font: {

                        family:
                            "Times New Roman"
                    }
                }
            },

            tooltip: {

                titleFont: {

                    family:
                        "Times New Roman"
                },

                bodyFont: {

                    family:
                        "Times New Roman"
                }
            }
        },

        scales: {

            x: {

                title: {

                    display:
                        Boolean(titleX),

                    text:
                        titleX,

                    font: {

                        family:
                            "Times New Roman",

                        weight:
                            "bold"
                    }
                },

                grid: {

                    color:
                        "rgba(20,55,95,0.08)"
                }
            },

            y: {

                title: {

                    display:
                        Boolean(titleY),

                    text:
                        titleY,

                    font: {

                        family:
                            "Times New Roman",

                        weight:
                            "bold"
                    }
                },

                grid: {

                    color:
                        "rgba(20,55,95,0.08)"
                }
            }
        }
    };
}


// ============================================================
// UPLOAD
// ============================================================

async function uploadFile() {

    const input =
        $("fileInput");

    const status =
        $("uploadStatus");

    if (
        !input ||
        !input.files.length
    ) {

        if (status) {

            status.textContent =
                "Please select a CSV file.";
        }

        return;
    }

    const file =
        input.files[0];

    if (
        !file.name
            .toLowerCase()
            .endsWith(".csv")
    ) {

        if (status) {

            status.textContent =
                "Please select a CSV file.";
        }

        return;
    }

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    if (status) {

        status.textContent =
            "Uploading dataset and preparing analysis...";
    }

    try {

        const response =
            await fetch(
                "/upload",
                {
                    method:
                        "POST",

                    body:
                        formData
                }
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Upload failed."
            );
        }

        setText(
            "rows",
            data.rows.toLocaleString()
        );

        setText(
            "columns",
            data.columns
        );

        setText(
            "missing",
            data.missing
        );

        setText(
            "duplicates",
            data.duplicates
        );

        analyticsData = null;

        resultData = null;

        destroyAllCharts();

        await loadAnalytics();

        await trainModel();

        if (status) {

            status.textContent =
                "Dataset uploaded. GMM analysis completed.";
        }

        showSection(
            "overview"
        );

    } catch (error) {

        console.error(error);

        if (status) {

            status.textContent =
                error.message ||
                "Upload failed.";
        }
    }
}


// ============================================================
// ANALYTICS
// ============================================================

async function loadAnalytics() {

    try {

        const response =
            await fetch(
                "/analytics"
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Could not load analytics."
            );
        }

        analyticsData =
            data;

        populateFeatureSelect();

        drawFeatureDistribution();

        drawCorrelationHeatmap();

        drawStatisticsTable();

        drawPreprocessing();

        drawPcaBefore();

    } catch (error) {

        console.error(
            "Analytics error:",
            error
        );
    }
}


// ============================================================
// FEATURE SELECT
// ============================================================

function populateFeatureSelect() {

    const select =
        $("featureSelect");

    if (
        !select ||
        !analyticsData
    ) {
        return;
    }

    select.innerHTML = "";

    analyticsData.features
        .forEach(
            (feature, index) => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    feature;

                option.textContent =
                    feature;

                if (index === 0) {

                    option.selected =
                        true;
                }

                select.appendChild(
                    option
                );
            }
        );
}


// ============================================================
// FEATURE DISTRIBUTION
// ============================================================

function drawFeatureDistribution() {

    if (!analyticsData) {
        return;
    }

    const feature =
        $("featureSelect")?.value ||
        analyticsData.features[0];

    const data =
        analyticsData
            .distributions?.[
                feature
            ];

    if (!data) {
        return;
    }

    destroyChart(
        "featureDistribution"
    );

    charts.featureDistribution =
        new Chart(
            $("featureDistributionChart"),
            {

                type:
                    "bar",

                data: {

                    labels:
                        data.labels,

                    datasets: [

                        {

                            label:
                                feature,

                            data:
                                data.counts,

                            backgroundColor:
                                "rgba(66,165,245,0.65)",

                            borderColor:
                                "#1565c0",

                            borderWidth:
                                1,

                            borderRadius:
                                5
                        }
                    ]
                },

                options:
                    chartBaseOptions(
                        feature,
                        "Employee Count"
                    )
            }
        );
}


// ============================================================
// CORRELATION HEATMAP
// ============================================================

function drawCorrelationHeatmap() {

    const container =
        $("correlationHeatmap");

    if (
        !container ||
        !analyticsData?.correlation
    ) {
        return;
    }

    const labels =
        analyticsData
            .correlation
            .labels;

    const matrix =
        analyticsData
            .correlation
            .matrix;

    container.innerHTML = "";

    container.className =
        "correlation-grid";

    container.style.setProperty(
        "--heatmap-columns",
        labels.length
    );

    const blank =
        document.createElement(
            "div"
        );

    blank.className =
        "heatmap-label blank";

    container.appendChild(
        blank
    );

    labels.forEach(
        label => {

            const el =
                document.createElement(
                    "div"
                );

            el.className =
                "heatmap-label column-label";

            el.textContent =
                label;

            container.appendChild(
                el
            );
        }
    );

    matrix.forEach(
        (row, i) => {

            const rowLabel =
                document.createElement(
                    "div"
                );

            rowLabel.className =
                "heatmap-label row-label";

            rowLabel.textContent =
                labels[i];

            container.appendChild(
                rowLabel
            );

            row.forEach(
                value => {

                    const cell =
                        document.createElement(
                            "div"
                        );

                    cell.className =
                        "heatmap-cell";

                    cell.textContent =
                        Number(value)
                            .toFixed(2);

                    cell.style.background =
                        correlationColor(
                            Number(value)
                        );

                    cell.style.color =
                        Math.abs(value) > 0.55
                            ? "#fff"
                            : "#102a43";

                    container.appendChild(
                        cell
                    );
                }
            );
        }
    );
}


function correlationColor(value) {

    const v =
        Math.max(
            -1,
            Math.min(
                1,
                value
            )
        );

    if (v < 0) {

        const t =
            v + 1;

        return `rgb(
            ${Math.round(235 - 90 * t)},
            ${Math.round(245 - 75 * t)},
            255
        )`;
    }

    const t =
        v;

    return `rgb(
        ${Math.round(245 - 75 * t)},
        ${Math.round(240 - 90 * t)},
        ${Math.round(255 - 25 * t)}
    )`;
}


// ============================================================
// STATISTICS
// ============================================================

function drawStatisticsTable() {

    const container =
        $("statisticsTable");

    if (
        !container ||
        !analyticsData
    ) {
        return;
    }

    const rows =
        analyticsData.statistics
            .map(
                row => `

                    <tr>

                        <td>
                            ${escapeHtml(
                                row.feature
                            )}
                        </td>

                        <td>
                            ${fmt(
                                row.mean
                            )}
                        </td>

                        <td>
                            ${fmt(
                                row.median
                            )}
                        </td>

                        <td>
                            ${fmt(
                                row.std
                            )}
                        </td>

                        <td>
                            ${fmt(
                                row.min
                            )}
                        </td>

                        <td>
                            ${fmt(
                                row.max
                            )}
                        </td>

                    </tr>

                `
            )
            .join("");

    container.innerHTML = `

        <div class="table-wrap">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>Feature</th>

                        <th>Mean</th>

                        <th>Median</th>

                        <th>Std. Dev.</th>

                        <th>Min</th>

                        <th>Max</th>

                    </tr>

                </thead>

                <tbody>

                    ${rows}

                </tbody>

            </table>

        </div>

    `;
}


// ============================================================
// PREPROCESSING
// ============================================================

function drawPreprocessing() {

    if (!analyticsData) {
        return;
    }

    setText(
        "preMissing",
        analyticsData.missing_total ?? 0
    );

    setText(
        "preDuplicates",
        (
            analyticsData.duplicates ??
            0
        ).toLocaleString()
    );

    const missingFeatures =
        Object.entries(
            analyticsData
                .missing_by_feature || {}
        )
        .filter(
            ([, count]) =>
                count > 0
        );

    setText(
        "preMissingDetail",

        missingFeatures.length

            ? `${missingFeatures.length} feature(s) contain missing values`

            : "No missing values detected"
    );

    setText(
        "preDuplicateDetail",

        `${(
            analyticsData.duplicates ??
            0
        ).toLocaleString()} exact duplicate row(s)`
    );

    drawMissingChart();

    drawStandardizationTable();

    drawBoxPlots();
}

// ============================================================
// MISSING VALUES
// ============================================================

function drawMissingChart() {

    const features =
        analyticsData.features || [];

    const values =
        features.map(
            feature =>
                analyticsData
                    .missing_by_feature?.[
                        feature
                    ] || 0
        );

    const totalMissing =
        values.reduce(
            (sum, value) =>
                sum + Number(value),
            0
        );

    destroyChart(
        "missing"
    );

    charts.missing =
        new Chart(
            $("missingChart"),
            {

                type:
                    "bar",

                data: {

                    labels:
                        features,

                    datasets: [

                        {

                            label:
                                "Missing Values",

                            data:
                                values,

                            backgroundColor:
                                "rgba(126,87,194,0.65)",

                            borderColor:
                                "#7e57c2",

                            borderWidth:
                                1,

                            borderRadius:
                                5
                        }
                    ]
                },

                options: {

                    ...chartBaseOptions(
                        "Feature",
                        "Missing Value Count"
                    ),

                    scales: {

                        x: {

                            ...chartBaseOptions()
                                .scales.x,

                            ticks: {

                                font: {

                                    family:
                                        "Times New Roman"
                                },

                                maxRotation:
                                    30,

                                minRotation:
                                    0
                            }
                        },

                        y: {

                            beginAtZero:
                                true,

                            suggestedMax:
                                totalMissing === 0
                                    ? 1
                                    : undefined,

                            title: {

                                display:
                                    true,

                                text:
                                    "Missing Value Count"
                            }
                        }
                    }
                }
            }
        );

    const status =
        $("missingChartStatus");

    if (status) {

        if (totalMissing === 0) {

            status.innerHTML =
                "<strong>0 missing values detected across all clustering features.</strong>";

        } else {

            status.textContent =
                `${totalMissing.toLocaleString()} missing values detected.`;
        }
    }
}


// ============================================================
// STANDARDIZATION
// ============================================================

function drawStandardizationTable() {

    const container =
        $("standardizationTable");

    if (!container) {
        return;
    }

    const rows =
        (
            analyticsData.standardization ||
            []
        )
        .map(
            row => `

                <tr>

                    <td>
                        ${escapeHtml(
                            row.feature
                        )}
                    </td>

                    <td>
                        ${fmt(
                            row.original_mean
                        )}
                    </td>

                    <td>
                        ${fmt(
                            row.original_std
                        )}
                    </td>

                    <td>
                        ${fmt(
                            row.standardized_mean
                        )}
                    </td>

                    <td>
                        ${fmt(
                            row.standardized_std
                        )}
                    </td>

                </tr>

            `
        )
        .join("");

    container.innerHTML = `

        <div class="table-wrap">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>Feature</th>

                        <th>Original Mean</th>

                        <th>Original Std.</th>

                        <th>Scaled Mean</th>

                        <th>Scaled Std.</th>

                    </tr>

                </thead>

                <tbody>

                    ${rows}

                </tbody>

            </table>

        </div>

    `;

    setText(
        "standardizationStatus",
        "Applied"
    );
}


// ============================================================
// BOX PLOTS
// ============================================================

function drawBoxPlots() {

    const container =
        $("boxPlotContainer");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    analyticsData.features
        .forEach(
            feature => {

                const s =
                    analyticsData
                        .box_stats[
                            feature
                        ];

                if (!s) {
                    return;
                }

                const min =
                    Number(s.min);

                const q1 =
                    Number(s.q1);

                const median =
                    Number(s.median);

                const q3 =
                    Number(s.q3);

                const max =
                    Number(s.max);

                const span =
                    Math.max(
                        max - min,
                        1e-9
                    );

                const pos =
                    value =>
                        (
                            (value - min)
                            /
                            span
                        ) * 100;

                const card =
                    document.createElement(
                        "div"
                    );

                card.className =
                    "boxplot-card";

                card.innerHTML = `

                    <div class="boxplot-title">

                        ${escapeHtml(
                            feature
                        )}

                    </div>

                    <div class="boxplot-area">

                        <div
                            class="boxplot-whisker"
                            style="
                                left:0%;
                                width:100%;
                            ">
                        </div>

                        <div
                            class="boxplot-cap"
                            style="
                                left:0%;
                            ">
                        </div>

                        <div
                            class="boxplot-cap"
                            style="
                                left:100%;
                            ">
                        </div>

                        <div
                            class="boxplot-box"
                            style="
                                left:${pos(q1)}%;
                                width:${Math.max(
                                    pos(q3) -
                                    pos(q1),
                                    1
                                )}%;
                            ">
                        </div>

                        <div
                            class="boxplot-median"
                            style="
                                left:${pos(median)}%;
                            ">
                        </div>

                    </div>

                    <div class="boxplot-scale">

                        <span>
                            Min ${fmt(min)}
                        </span>

                        <span>
                            Q1 ${fmt(q1)}
                        </span>

                        <span>
                            Median ${fmt(median)}
                        </span>

                        <span>
                            Q3 ${fmt(q3)}
                        </span>

                        <span>
                            Max ${fmt(max)}
                        </span>

                    </div>

                `;

                container.appendChild(
                    card
                );
            }
        );
}


// ============================================================
// PCA BEFORE
// ============================================================

function drawPcaBefore() {

    if (!analyticsData?.pca_before) {
        return;
    }

    destroyChart(
        "pcaBefore"
    );

    charts.pcaBefore =
        new Chart(
            $("pcaBeforeChart"),
            {

                type:
                    "scatter",

                data: {

                    datasets: [

                        {

                            label:
                                "Employees before clustering",

                            data:
                                analyticsData
                                    .pca_before
                                    .map(
                                        p => ({
                                            x: p.x,
                                            y: p.y
                                        })
                                    ),

                            pointRadius:
                                3,

                            pointHoverRadius:
                                6,

                            backgroundColor:
                                "rgba(21,101,192,0.42)"
                        }
                    ]
                },

                options: {

                    ...chartBaseOptions(
                        "Principal Component 1",
                        "Principal Component 2"
                    ),

                    plugins: {

                        legend: {

                            display:
                                true
                        },

                        tooltip: {

                            callbacks: {

                                label:
                                    context =>

                                        `PC1: ${
                                            context.parsed.x
                                                .toFixed(2)
                                        }, PC2: ${
                                            context.parsed.y
                                                .toFixed(2)
                                        }`
                            }
                        }
                    },

                    scales: {

                        x: {

                            title: {

                                display:
                                    true,

                                text:
                                    `PCA Component 1 (${
                                        analyticsData
                                            .pca_variance?.[0]
                                        ?? "-"
                                    }%)`,

                                color:
                                    "#1565c0",

                                font: {

                                    family:
                                        "Times New Roman",

                                    weight:
                                        "bold"
                                }
                            },

                            ticks: {

                                color:
                                    "#1565c0"
                            },

                            grid: {

                                color:
                                    "rgba(21,101,192,0.12)"
                            }
                        },

                        y: {

                            title: {

                                display:
                                    true,

                                text:
                                    `PCA Component 2 (${
                                        analyticsData
                                            .pca_variance?.[1]
                                        ?? "-"
                                    }%)`,

                                color:
                                    "#7e57c2",

                                font: {

                                    family:
                                        "Times New Roman",

                                    weight:
                                        "bold"
                                }
                            },

                            ticks: {

                                color:
                                    "#7e57c2"
                            },

                            grid: {

                                color:
                                    "rgba(126,87,194,0.12)"
                            }
                        }
                    }
                }
            }
        );
}


// ============================================================
// TRAIN GMM
// ============================================================

async function trainModel() {

    try {

        const response =
            await fetch(
                "/train",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            features:
                                analyticsData
                                    ?.features ||
                                []
                        })
                }
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "GMM training failed."
            );
        }

        resultData =
            data.result;

        updateModelCards();

        drawModelCharts();

        drawClusterCharts();

        drawPcaAfterOverview();

        drawProfileCharts();

        drawEvaluation();

        drawGmmParameters();

        drawPcaTradeoff();

        drawInsights();

    } catch (error) {

        console.error(
            "GMM error:",
            error
        );

        const status =
            $("uploadStatus");

        if (status) {

            status.textContent =
                error.message;
        }
    }
}


// ============================================================
// MODEL CARDS
// ============================================================

function updateModelCards() {

    if (!resultData) {
        return;
    }

    setText(
        "bestK",
        resultData.best_k
    );

    setText(
        "silhouette",
        Number(
            resultData.silhouette
        ).toFixed(4)
    );

    setText(
        "avgConfidence",
        `${Number(
            resultData.avg_confidence
        ).toFixed(2)}%`
    );

    setText(
        "selectionMethod",
        "BIC"
    );

    setText(
        "daviesBouldin",
        Number(
            resultData.davies_bouldin
        ).toFixed(4)
    );

    setText(
        "calinskiHarabasz",
        fmt(
            resultData.calinski_harabasz
        )
    );

    setText(
        "logLikelihood",
        fmt(
            resultData.log_likelihood
        )
    );

    const text =
        $("selectedKExplanation");

    if (text) {

        text.innerHTML = `

            <strong>
                K = ${resultData.best_k}
            </strong>

            was selected because it has the

            <strong>
                lowest BIC
            </strong>

            among the tested values

            <strong>
                ${resultData.k_values.join(", ")}
            </strong>.

            AIC and silhouette are shown
            for comparison.

        `;
    }
}


// ============================================================
// AIC / BIC / SILHOUETTE
// ============================================================

function drawModelCharts() {

    if (!resultData) {
        return;
    }

    drawMetricChart(
        "aic",
        "aicChart",
        "AIC",
        resultData.aic_values,
        "Lower AIC is better",
        "#1565c0"
    );

    drawMetricChart(
        "bic",
        "bicChart",
        "BIC",
        resultData.bic_values,
        "Lower BIC is better",
        "#7e57c2"
    );

    drawMetricChart(
        "silhouette",
        "silhouetteChart",
        "Silhouette Score",
        resultData.silhouette_values,
        "Higher silhouette is better",
        "#00838f"
    );
}


function drawMetricChart(
    name,
    canvasId,
    label,
    values,
    subtitle,
    color
) {

    destroyChart(name);

    if (
        !values ||
        !values.length ||
        !$(canvasId)
    ) {
        return;
    }

    const labels =
        resultData
            .k_values
            .map(
                k =>
                    `K = ${k}`
            );

    let bestIndex = -1;

    if (label === "BIC") {

        bestIndex =
            values.indexOf(
                Math.min(...values)
            );
    }

    if (
        label === "AIC"
    ) {

        bestIndex =
            values.indexOf(
                Math.min(...values)
            );
    }

    if (
        label === "Silhouette Score"
    ) {

        bestIndex =
            values.indexOf(
                Math.max(...values)
            );
    }

    const pointRadius =
        values.map(
            (_, i) =>
                i === bestIndex
                    ? 7
                    : 4
        );

    charts[name] =
        new Chart(
            $(canvasId),
            {

                type:
                    "line",

                data: {

                    labels,

                    datasets: [

                        {

                            label,

                            data:
                                values,

                            borderColor:
                                color,

                            backgroundColor:
                                color,

                            pointBackgroundColor:
                                color,

                            pointBorderColor:
                                "#ffffff",

                            pointBorderWidth:
                                2,

                            pointRadius,

                            pointHoverRadius:
                                8,

                            borderWidth:
                                3,

                            tension:
                                0.28,

                            fill:
                                false
                        }
                    ]
                },

                options: {

                    ...chartBaseOptions(
                        "Number of Clusters (K)",
                        label
                    ),

                    plugins: {

                        legend: {

                            display:
                                true
                        },

                        tooltip: {

                            callbacks: {

                                afterLabel:
                                    () =>
                                        subtitle
                            }
                        }
                    }
                }
            }
        );
}


// ============================================================
// PCA AFTER - OVERVIEW
// ============================================================

function drawPcaAfterOverview() {

    if (
        !resultData?.pca_after ||
        !$("pcaAfterOverviewChart")
    ) {
        return;
    }

    destroyChart(
        "pcaAfterOverview"
    );

    const groups = {};

    resultData.pca_after
        .forEach(
            point => {

                const cluster =
                    Number(
                        point.cluster
                    );

                if (!groups[cluster]) {

                    groups[cluster] = [];
                }

                groups[cluster]
                    .push({

                        x:
                            point.x,

                        y:
                            point.y
                    });
            }
        );

    const datasets =
        Object.keys(groups)
            .map(
                (cluster, index) => ({

                    label:
                        `Cluster ${cluster}`,

                    data:
                        groups[cluster],

                    backgroundColor:
                        PALETTE[
                            index %
                            PALETTE.length
                        ],

                    borderColor:
                        PALETTE[
                            index %
                            PALETTE.length
                        ],

                    pointRadius:
                        3,

                    pointHoverRadius:
                        6
                })
            );

    charts.pcaAfterOverview =
        new Chart(
            $("pcaAfterOverviewChart"),
            {

                type:
                    "scatter",

                data: {

                    datasets
                },

                options: {

                    ...chartBaseOptions(
                        "Principal Component 1",
                        "Principal Component 2"
                    ),

                    plugins: {

                        legend: {

                            display:
                                true,

                            position:
                                "top"
                        },

                        tooltip: {

                            callbacks: {

                                label:
                                    context => {

                                        return `Cluster ${
                                            context.dataset.label
                                                .replace(
                                                    "Cluster ",
                                                    ""
                                                )
                                        } | PC1: ${
                                            Number(
                                                context.parsed.x
                                            ).toFixed(2)
                                        } | PC2: ${
                                            Number(
                                                context.parsed.y
                                            ).toFixed(2)
                                        }`;
                                    }
                            }
                        }
                    },

                    scales: {

                        x: {

                            title: {

                                display:
                                    true,

                                text:
                                    "PCA Component 1",

                                font: {

                                    family:
                                        "Times New Roman",

                                    weight:
                                        "bold"
                                }
                            }
                        },

                        y: {

                            title: {

                                display:
                                    true,

                                text:
                                    "PCA Component 2",

                                font: {

                                    family:
                                        "Times New Roman",

                                    weight:
                                        "bold"
                                }
                            }
                        }
                    }
                }
            }
        );
}

// ============================================================
// CLUSTERS
// ============================================================

function drawClusterCharts() {

    if (!resultData) {
        return;
    }

    drawPcaAfter();

    drawClusterSize();

    // Confidence distribution replaced
    // with Attrition Rate by Cluster
    drawAttrition();
}


// ============================================================
// PCA AFTER - CLUSTERS PAGE
// ============================================================

function drawPcaAfter() {

    destroyChart(
        "pcaAfter"
    );

    if (
        !resultData?.pca_after ||
        !$("pcaAfterChart")
    ) {
        return;
    }

    const groups = {};

    resultData.pca_after
        .forEach(
            point => {

                const cluster =
                    Number(
                        point.cluster
                    );

                if (!groups[cluster]) {

                    groups[cluster] = [];
                }

                groups[cluster]
                    .push({

                        x:
                            point.x,

                        y:
                            point.y
                    });
            }
        );

    const datasets =
        Object.keys(groups)
            .map(
                (cluster, index) => ({

                    label:
                        `Cluster ${cluster}`,

                    data:
                        groups[cluster],

                    backgroundColor:
                        PALETTE[
                            index %
                            PALETTE.length
                        ],

                    borderColor:
                        PALETTE[
                            index %
                            PALETTE.length
                        ],

                    pointRadius:
                        3.5,

                    pointHoverRadius:
                        7

                })
            );

    const pc1 =
        resultData
            .pca_tradeoff
            ?.selected_pc1 || 1;

    const pc2 =
        resultData
            .pca_tradeoff
            ?.selected_pc2 || 2;

    charts.pcaAfter =
        new Chart(
            $("pcaAfterChart"),
            {

                type:
                    "scatter",

                data: {

                    datasets

                },

                options: {

                    ...chartBaseOptions(
                        `PC${pc1}`,
                        `PC${pc2}`
                    ),

                    plugins: {

                        legend: {

                            position:
                                "top"
                        },

                        title: {

                            display:
                                true,

                            text:
                                `Cluster Visualization — PC${pc1} vs PC${pc2}`,

                            font: {

                                family:
                                    "Times New Roman",

                                size:
                                    14,

                                weight:
                                    "bold"
                            }
                        }
                    },

                    scales: {

                        x: {

                            title: {

                                display:
                                    true,

                                text:
                                    `PCA Component ${pc1}`,

                                color:
                                    "#1565c0",

                                font: {

                                    family:
                                        "Times New Roman",

                                    weight:
                                        "bold"
                                }
                            },

                            ticks: {

                                color:
                                    "#1565c0"
                            },

                            grid: {

                                color:
                                    "rgba(21,101,192,0.12)"
                            }
                        },

                        y: {

                            title: {

                                display:
                                    true,

                                text:
                                    `PCA Component ${pc2}`,

                                color:
                                    "#7e57c2",

                                font: {

                                    family:
                                        "Times New Roman",

                                    weight:
                                        "bold"
                                }
                            },

                            ticks: {

                                color:
                                    "#7e57c2"
                            },

                            grid: {

                                color:
                                    "rgba(126,87,194,0.12)"
                            }
                        }
                    }
                }
            }
        );
}


// ============================================================
// CLUSTER SIZE
// ============================================================

function drawClusterSize() {

    destroyChart(
        "clusterSize"
    );

    if (
        !resultData?.cluster_sizes ||
        !$("clusterChart")
    ) {
        return;
    }

    const sizes =
        resultData.cluster_sizes;

    charts.clusterSize =
        new Chart(
            $("clusterChart"),
            {

                type:
                    "bar",

                data: {

                    labels:
                        sizes.map(
                            x =>
                                `Cluster ${x.cluster}`
                        ),

                    datasets: [

                        {

                            label:
                                "Employees",

                            data:
                                sizes.map(
                                    x =>
                                        x.count
                                ),

                            backgroundColor:
                                sizes.map(
                                    (_, i) =>
                                        PALETTE[
                                            i %
                                            PALETTE.length
                                        ]
                                ),

                            borderRadius:
                                7
                        }
                    ]
                },

                options:
                    chartBaseOptions(
                        "Cluster",
                        "Employee Count"
                    )
            }
        );
}


// ============================================================
// ATTRITION RATE BY CLUSTER
// ============================================================

function drawAttrition() {

    destroyChart(
        "attrition"
    );

    if (
        !resultData?.attrition_by_cluster ||
        !$("attritionChart")
    ) {
        return;
    }

    const data =
        resultData.attrition_by_cluster;

    charts.attrition =
        new Chart(
            $("attritionChart"),
            {

                type:
                    "bar",

                data: {

                    labels:
                        data.map(
                            item =>
                                `Cluster ${item.cluster}`
                        ),

                    datasets: [

                        {

                            label:
                                "Attrition Rate (%)",

                            data:
                                data.map(
                                    item =>
                                        Number(
                                            item.attrition
                                        )
                                ),

                            backgroundColor:
                                data.map(
                                    (_, index) =>
                                        PALETTE[
                                            index %
                                            PALETTE.length
                                        ]
                                ),

                            borderColor:
                                data.map(
                                    (_, index) =>
                                        PALETTE[
                                            index %
                                            PALETTE.length
                                        ]
                                ),

                            borderWidth:
                                1,

                            borderRadius:
                                8
                        }
                    ]
                },

                options: {

                    ...chartBaseOptions(
                        "Cluster",
                        "Attrition Rate (%)"
                    ),

                    scales: {

                        x: {

                            title: {

                                display:
                                    true,

                                text:
                                    "Cluster"

                            }

                        },

                        y: {

                            beginAtZero:
                                true,

                            max:
                                100,

                            title: {

                                display:
                                    true,

                                text:
                                    "Attrition Rate (%)"

                            },

                            ticks: {

                                callback:
                                    value =>
                                        `${value}%`

                            }

                        }

                    },

                    plugins: {

                        legend: {

                            display:
                                true,

                            position:
                                "top"

                        },

                        tooltip: {

                            callbacks: {

                                label:
                                    context =>
                                        `${Number(
                                            context.raw
                                        ).toFixed(2)}% attrition`

                            }

                        }

                    }

                }

            }
        );
}


// ============================================================
// EVALUATION
// ============================================================

function drawEvaluation() {

    if (!resultData) {
        return;
    }

    const evaluation =
        resultData.evaluation;

    if (!evaluation) {
        return;
    }


    // -----------------------------------------
    // Accuracy
    // -----------------------------------------

    const accuracyElement =
        $("accuracy");

    if (accuracyElement) {

        if (
            evaluation.available &&
            evaluation.accuracy !== null
        ) {

            accuracyElement.textContent =
                `${Number(
                    evaluation.accuracy
                ).toFixed(2)}%`;

        } else {

            accuracyElement.textContent =
                "N/A";
        }
    }


    // -----------------------------------------
    // ARI
    // -----------------------------------------

    setText(
        "adjustedRandIndex",

        evaluation.available

            ? Number(
                evaluation.adjusted_rand_index
            ).toFixed(4)

            : "N/A"
    );


    // -----------------------------------------
    // NMI
    // -----------------------------------------

    setText(
        "normalizedMutualInfo",

        evaluation.available

            ? Number(
                evaluation.normalized_mutual_information
            ).toFixed(4)

            : "N/A"
    );


    // -----------------------------------------
    // Explanation
    // -----------------------------------------

    const explanation =
        $("evaluationExplanation");

    if (explanation) {

        explanation.innerHTML = `

            ${
                evaluation.available

                    ? `

                        <strong>
                            Ground-truth evaluation available.
                        </strong>

                        Accuracy, ARI, NMI and the
                        confusion matrix were calculated
                        using

                        <strong>
                            ${escapeHtml(
                                evaluation
                                    .true_label_column
                            )}
                        </strong>

                        as the true cluster label.

                    `

                    : `

                        <strong>
                            Accuracy and confusion matrix:
                            N/A
                        </strong>

                        GMM is an unsupervised clustering
                        algorithm. Your dataset does not
                        contain a true cluster-label column.

                        The

                        <strong>
                            left
                        </strong>

                        column is an employee attrition
                        outcome, not a ground-truth cluster.

                    `
            }

        `;
    }


    // -----------------------------------------
    // Confusion matrix
    // -----------------------------------------

    drawConfusionMatrix(
        evaluation
    );
}


// ============================================================
// CONFUSION MATRIX
// ============================================================

function drawConfusionMatrix(
    evaluation
) {

    const container =
        $("confusionMatrixContainer");

    if (!container) {
        return;
    }

    if (
        !evaluation.available ||
        !evaluation.confusion_matrix?.length
    ) {

        container.innerHTML = `

            <div class="evaluation-empty">

                <h3>
                    Confusion Matrix Not Available
                </h3>

                <p>
                    A confusion matrix requires
                    ground-truth cluster labels.
                </p>

            </div>

        `;

        return;
    }

    const matrix =
        evaluation.confusion_matrix;

    const labels =
        evaluation.labels;

    let html = `

        <div class="table-wrap confusion-wrap">

            <table class="data-table confusion-table">

                <thead>

                    <tr>

                        <th>
                            True / Predicted
                        </th>

                        ${
                            labels
                                .map(
                                    label =>
                                        `<th>
                                            Cluster ${label}
                                        </th>`
                                )
                                .join("")
                        }

                    </tr>

                </thead>

                <tbody>

    `;

    matrix.forEach(
        (row, i) => {

            html += `

                <tr>

                    <th>
                        Cluster ${labels[i]}
                    </th>

                    ${
                        row
                            .map(
                                value =>
                                    `<td>
                                        <strong>
                                            ${value}
                                        </strong>
                                    </td>`
                            )
                            .join("")
                    }

                </tr>

            `;
        }
    );

    html += `

                </tbody>

            </table>

        </div>

    `;

    container.innerHTML =
        html;
}


// ============================================================
// GMM PARAMETERS
// ============================================================

function drawGmmParameters() {

    if (!resultData) {
        return;
    }

    drawMixtureWeights();

    drawCovarianceMatrices();
}


// ============================================================
// MIXTURE WEIGHTS
// ============================================================

function drawMixtureWeights() {

    const container =
        $("mixtureWeightsContainer");

    if (!container) {
        return;
    }

    const weights =
        resultData.mixture_weights || [];

    if (!weights.length) {

        container.innerHTML =
            "<p>Mixture weights unavailable.</p>";

        return;
    }

    container.innerHTML = `

        <div class="gmm-weights-grid">

            ${
                weights
                    .map(
                        (weight, index) => `

                            <div
                                class="gmm-parameter-card"
                            >

                                <div
                                    class="gmm-parameter-title"
                                >
                                    Cluster ${index}
                                </div>

                                <div
                                    class="gmm-parameter-value"
                                >
                                    ${(
                                        Number(
                                            weight
                                        ) * 100
                                    ).toFixed(2)}%
                                </div>

                                <div
                                    class="gmm-parameter-description"
                                >
                                    Mixture weight
                                </div>

                            </div>

                        `
                    )
                    .join("")
            }

        </div>

    `;


    // Optional chart

    if ($("mixtureWeightsChart")) {

        destroyChart(
            "mixtureWeights"
        );

        charts.mixtureWeights =
            new Chart(
                $("mixtureWeightsChart"),
                {

                    type:
                        "bar",

                    data: {

                        labels:
                            weights.map(
                                (_, i) =>
                                    `Cluster ${i}`
                            ),

                        datasets: [

                            {

                                label:
                                    "Mixture Weight (%)",

                                data:
                                    weights.map(
                                        value =>
                                            Number(
                                                value
                                            ) * 100
                                    ),

                                backgroundColor:
                                    weights.map(
                                        (_, i) =>
                                            PALETTE[
                                                i %
                                                PALETTE.length
                                            ]
                                    ),

                                borderRadius:
                                    7
                            }
                        ]
                    },

                    options:
                        chartBaseOptions(
                            "Cluster",
                            "Mixture Weight (%)"
                        )
                }
            );
    }
}


// ============================================================
// COVARIANCE MATRICES
// ============================================================

function drawCovarianceMatrices() {

    const container =
        $("covarianceContainer");

    if (!container) {
        return;
    }

    const matrices =
        resultData
            .covariance_matrices || [];

    const features =
        resultData.features || [];

    if (!matrices.length) {

        container.innerHTML = `

            <div class="evaluation-empty">

                <h3>
                    Covariance Information
                </h3>

                <p>
                    Covariance matrix information
                    is unavailable.
                </p>

            </div>

        `;

        return;
    }

    container.innerHTML = "";

    matrices.forEach(
        (matrix, clusterIndex) => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "covariance-card";

            let html = `

                <h3>
                    Cluster ${clusterIndex}
                    Covariance Matrix
                </h3>

                <div class="table-wrap">

                    <table
                        class="data-table covariance-table"
                    >

                        <thead>

                            <tr>

                                <th>
                                    Feature
                                </th>

            `;

            features.forEach(
                feature => {

                    html += `

                        <th>
                            ${escapeHtml(
                                feature
                            )}
                        </th>

                    `;
                }
            );

            html += `

                            </tr>

                        </thead>

                        <tbody>

            `;

            matrix.forEach(
                (row, rowIndex) => {

                    html += `

                        <tr>

                            <th>
                                ${escapeHtml(
                                    features[
                                        rowIndex
                                    ] ||
                                    `Feature ${rowIndex + 1}`
                                )}
                            </th>

                    `;

                    row.forEach(
                        value => {

                            html += `

                                <td>
                                    ${Number(
                                        value
                                    ).toFixed(4)}
                                </td>

                            `;
                        }
                    );

                    html += `

                        </tr>

                    `;
                }
            );

            html += `

                        </tbody>

                    </table>

                </div>

            `;

            card.innerHTML =
                html;

            container.appendChild(
                card
            );
        }
    );
}

// ============================================================
// COVARIANCE MATRICES - CONTINUATION
// ============================================================

function drawCovarianceMatrices() {

    const container =
        $("covarianceContainer");

    if (!container) {
        return;
    }

    const matrices =
        resultData
            .covariance_matrices || [];

    const features =
        resultData.features || [];

    if (!matrices.length) {

        container.innerHTML =
            "<p>Covariance matrices unavailable.</p>";

        return;
    }

    let html = "";

    matrices.forEach(
        (matrix, clusterIndex) => {

            html += `

                <div
                    class="covariance-card"
                >

                    <h3>
                        Cluster ${clusterIndex}
                        Covariance Matrix
                    </h3>

                    <div class="table-wrap">

                        <table class="data-table covariance-table">

                            <thead>

                                <tr>

                                    <th>
                                        Feature
                                    </th>

                                    ${
                                        features
                                            .map(
                                                feature =>
                                                    `<th>
                                                        ${escapeHtml(
                                                            feature
                                                        )}
                                                    </th>`
                                            )
                                            .join("")
                                    }

                                </tr>

                            </thead>

                            <tbody>

                                ${
                                    matrix
                                        .map(
                                            (
                                                row,
                                                rowIndex
                                            ) => `

                                                <tr>

                                                    <th>
                                                        ${escapeHtml(
                                                            features[
                                                                rowIndex
                                                            ] ||
                                                            `Feature ${rowIndex + 1}`
                                                        )}
                                                    </th>

                                                    ${
                                                        row
                                                            .map(
                                                                value =>
                                                                    `<td>
                                                                        ${Number(
                                                                            value
                                                                        ).toFixed(4)}
                                                                    </td>`
                                                            )
                                                            .join("")
                                                    }

                                                </tr>

                                            `
                                        )
                                        .join("")
                                }

                            </tbody>

                        </table>

                    </div>

                </div>

            `;
        }
    );

    container.innerHTML =
        html;
}


// ============================================================
// PCA TRADE-OFF
// ============================================================

function drawPcaTradeoff() {

    const container =
        $("pcaTradeoffContainer");

    if (!container) {
        return;
    }

    const tradeoff =
        resultData.pca_tradeoff;

    if (!tradeoff) {

        container.innerHTML =
            "<p>PCA trade-off information unavailable.</p>";

        return;
    }

    const rows =
        (
            tradeoff.all_pairs || []
        )
        .map(
            item => `

                <tr>

                    <td>
                        PC${item.pc1}
                        vs
                        PC${item.pc2}
                    </td>

                    <td>
                        ${Number(
                            item.variance
                        ).toFixed(2)}%
                    </td>

                    <td>
                        ${Number(
                            item.silhouette
                        ).toFixed(4)}
                    </td>

                    <td>
                        ${Number(
                            item.tradeoff_score
                        ).toFixed(4)}
                    </td>

                </tr>

            `
        )
        .join("");

    container.innerHTML = `

        <div class="pca-tradeoff-summary">

            <h3>
                Selected Visualization
            </h3>

            <p>

                <strong>
                    PC${tradeoff.selected_pc1}
                    vs
                    PC${tradeoff.selected_pc2}
                </strong>

                was selected using a

                <strong>
                    40% variance + 60% separation
                </strong>

                trade-off.

            </p>

            <p>

                Variance retained:

                <strong>
                    ${tradeoff.variance_retained}%
                </strong>

                &nbsp; | &nbsp;

                Separation score:

                <strong>
                    ${tradeoff.silhouette}
                </strong>

            </p>

        </div>

        <div class="table-wrap">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>
                            PCA Pair
                        </th>

                        <th>
                            Variance Retained
                        </th>

                        <th>
                            Separation
                        </th>

                        <th>
                            Trade-off Score
                        </th>

                    </tr>

                </thead>

                <tbody>

                    ${rows}

                </tbody>

            </table>

        </div>

    `;
}


// ============================================================
// CLUSTER PROFILE
// ============================================================

function drawProfileCharts() {

    if (!resultData) {
        return;
    }

    drawFeatureClusterComparison();

    drawProfileHeatmap();

    drawProfileTable();
}


// ============================================================
// FEATURE CLUSTER COMPARISON
// ============================================================

function drawFeatureClusterComparison() {

    destroyChart(
        "featureCluster"
    );

    if (
        !$("featureClusterChart")
    ) {
        return;
    }

    const features =
        resultData.features;

    const datasets =
        resultData.profile_z
            .map(
                (cluster, index) => ({

                    label:
                        `Cluster ${cluster.cluster}`,

                    data:
                        features.map(
                            feature =>
                                Number(
                                    cluster[
                                        feature
                                    ]
                                )
                        ),

                    backgroundColor:
                        PALETTE[
                            index %
                            PALETTE.length
                        ],

                    borderRadius:
                        5
                })
            );

    charts.featureCluster =
        new Chart(
            $("featureClusterChart"),
            {

                type:
                    "bar",

                data: {

                    labels:
                        features,

                    datasets

                },

                options: {

                    ...chartBaseOptions(
                        "Performance Feature",
                        "Standardized Mean (Z-score)"
                    ),

                    plugins: {

                        legend: {

                            position:
                                "top"
                        }
                    }
                }
            }
        );
}


// ============================================================
// PROFILE HEATMAP
// ============================================================

function drawProfileHeatmap() {

    const container =
        $("profileHeatmap");

    if (!container) {
        return;
    }

    const features =
        resultData.features;

    const clusters =
        resultData.profile_z;

    container.innerHTML = "";

    container.className =
        "profile-heatmap";

    container.style.setProperty(
        "--heatmap-columns",
        features.length
    );

    const blank =
        document.createElement(
            "div"
        );

    blank.className =
        "heatmap-label blank";

    container.appendChild(
        blank
    );

    features.forEach(
        feature => {

            const label =
                document.createElement(
                    "div"
                );

            label.className =
                "heatmap-label column-label";

            label.textContent =
                feature;

            container.appendChild(
                label
            );
        }
    );

    clusters.forEach(
        cluster => {

            const rowLabel =
                document.createElement(
                    "div"
                );

            rowLabel.className =
                "heatmap-label row-label";

            rowLabel.textContent =
                `Cluster ${cluster.cluster}`;

            container.appendChild(
                rowLabel
            );

            features.forEach(
                feature => {

                    const value =
                        Number(
                            cluster[
                                feature
                            ]
                        );

                    const cell =
                        document.createElement(
                            "div"
                        );

                    cell.className =
                        "heatmap-cell";

                    cell.textContent =
                        value.toFixed(2);

                    cell.style.background =
                        profileColor(
                            value
                        );

                    cell.style.color =
                        Math.abs(value) > 1
                            ? "#fff"
                            : "#102a43";

                    container.appendChild(
                        cell
                    );
                }
            );
        }
    );
}


function profileColor(value) {

    const v =
        Math.max(
            -2.5,
            Math.min(
                2.5,
                value
            )
        );

    if (v < 0) {

        const t =
            (v + 2.5) / 5;

        return `rgb(
            ${Math.round(
                215 - 45 * t
            )},
            ${Math.round(
                232 + 15 * t
            )},
            255
        )`;
    }

    const t =
        v / 2.5;

    return `rgb(
        ${Math.round(
            245 - 85 * t
        )},
        ${Math.round(
            240 - 70 * t
        )},
        ${Math.round(
            255 - 15 * t
        )}
    )`;
}


// ============================================================
// PROFILE TABLE
// ============================================================

function drawProfileTable() {

    const container =
        $("profileTable");

    if (!container) {
        return;
    }

    const features =
        resultData.features;

    const rows =
        resultData.profile
            .map(
                cluster => `

                    <tr>

                        <td>

                            <strong>
                                Cluster ${cluster.cluster}
                            </strong>

                        </td>

                        ${
                            features
                                .map(
                                    feature =>
                                        `<td>
                                            ${fmt(
                                                cluster[
                                                    feature
                                                ]
                                            )}
                                        </td>`
                                )
                                .join("")
                        }

                    </tr>

                `
            )
            .join("");

    container.innerHTML = `

        <div class="table-wrap">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>
                            Cluster
                        </th>

                        ${
                            features
                                .map(
                                    f =>
                                        `<th>
                                            ${escapeHtml(
                                                f
                                            )}
                                        </th>`
                                )
                                .join("")
                        }

                    </tr>

                </thead>

                <tbody>

                    ${rows}

                </tbody>

            </table>

        </div>

    `;
}


// ============================================================
// INSIGHTS DASHBOARD
// ============================================================

function drawInsights() {

    const container =
        $("insightsContainer");

    if (
        !container ||
        !resultData
    ) {
        return;
    }

    container.innerHTML = "";


    // ========================================================
    // SELECTED K
    // ========================================================

    const selectedCard =
        document.createElement(
            "div"
        );

    selectedCard.className =
        "insight-card";

    selectedCard.innerHTML = `

        <div class="insight-icon">
            K
        </div>

        <h3>
            Selected Cluster Count
        </h3>

        <div class="insight-big">
            ${resultData.best_k}
        </div>

        <p>

            The final GMM model uses

            <strong>
                ${resultData.best_k} clusters
            </strong>,

            selected using the lowest BIC
            among K =
            ${resultData.k_values.join(", ")}.

        </p>

    `;

    container.appendChild(
        selectedCard
    );


    // ========================================================
    // LARGEST CLUSTER
    // ========================================================

    const largest =
        resultData.cluster_sizes.reduce(
            (a, b) =>
                a.count > b.count
                    ? a
                    : b
        );


    const largestCard =
        document.createElement(
            "div"
        );

    largestCard.className =
        "insight-card";


    largestCard.innerHTML = `

        <div class="insight-icon">
            #
        </div>

        <h3>
            Largest Cluster
        </h3>

        <div class="insight-big">
            Cluster ${largest.cluster}
        </div>

        <p>

            ${largest.count.toLocaleString()}
            employees belong to this cluster,
            representing

            <strong>
                ${largest.percentage}%
            </strong>

            of the dataset.

        </p>

    `;

    container.appendChild(
        largestCard
    );


    // ========================================================
    // WHY ACCURACY IS NOT AVAILABLE
    // ========================================================

    const evaluationCard =
        document.createElement(
            "div"
        );

    evaluationCard.className =
        "insight-card";

    evaluationCard.innerHTML = `

        <div class="insight-icon">
            i
        </div>

        <h3>
            Why Accuracy Is Not Available
        </h3>

        <p>

            GMM is an

            <strong>
                unsupervised clustering algorithm
            </strong>.

            Your dataset does not contain
            ground-truth cluster labels.

        </p>

        <p>

            Therefore, accuracy and a confusion
            matrix are not mathematically
            appropriate for the current dataset.

        </p>

        <p>

            The

            <strong>
                left
            </strong>

            column represents employee
            attrition and is not used as the
            GMM cluster label.

        </p>

    `;

    container.appendChild(
        evaluationCard
    );


    // ========================================================
    // GMM PARAMETERS
    // ========================================================

    const parameterCard =
        document.createElement(
            "div"
        );

    parameterCard.className =
        "insight-card";


    parameterCard.innerHTML = `

        <div class="insight-icon">
            Σ
        </div>

        <h3>
            GMM Parameters
        </h3>

        <p>

            The model uses

            <strong>
                full covariance matrices
            </strong>

            for each Gaussian component.

        </p>

        <p>

            Mixture weights are learned
            automatically for each cluster.

        </p>

        <p>

            AIC and BIC are used for
            model comparison.

        </p>

    `;

    container.appendChild(
        parameterCard
    );


    // ========================================================
    // CLUSTER CHARACTERISTICS
    // ========================================================
    // Cluster 0 and Cluster 1 are displayed.
    // Cluster 2 is intentionally replaced by
    // "Why Accuracy Is Not Available".
    // ========================================================

    resultData.profile_z
        .filter(
            cluster =>
                Number(cluster.cluster) !== 2
        )
        .forEach(
            cluster => {

                const features =
                    resultData.features
                        .slice()
                        .sort(
                            (a, b) =>
                                Number(
                                    cluster[b]
                                )
                                -
                                Number(
                                    cluster[a]
                                )
                        );


                const high =
                    features.slice(
                        0,
                        2
                    );


                const low =
                    features
                        .slice(-2)
                        .reverse();


                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "insight-card cluster-insight";


                card.innerHTML = `

                    <div class="insight-icon">
                        C${cluster.cluster}
                    </div>

                    <h3>
                        Cluster ${cluster.cluster}
                        Characteristics
                    </h3>

                    <p>

                        <strong>
                            Higher-than-average:
                        </strong>

                        ${high
                            .map(
                                escapeHtml
                            )
                            .join(", ")}

                    </p>

                    <p>

                        <strong>
                            Lower-than-average:
                        </strong>

                        ${low
                            .map(
                                escapeHtml
                            )
                            .join(", ")}

                    </p>

                `;


                container.appendChild(
                    card
                );

            }
        );


    // ========================================================
    // BUSINESS / HR INTERPRETATION
    // ========================================================

    const hrCard =
        document.createElement(
            "div"
        );


    hrCard.className =
        "insight-card";


    let attritionHTML = "";


    if (
        resultData.attrition_by_cluster &&
        resultData.attrition_by_cluster.length
    ) {

        attritionHTML = `

            <div class="attrition-section">

                <h4>
                    Post-Clustering Attrition Comparison
                </h4>

                <div class="attrition-grid">

                    ${
                        resultData
                            .attrition_by_cluster
                            .map(
                                item => `

                                    <div
                                        class="attrition-item"
                                    >

                                        <span>
                                            Cluster
                                            ${item.cluster}
                                        </span>

                                        <strong>
                                            ${item.attrition}%
                                        </strong>

                                    </div>

                                `
                            )
                            .join("")
                    }

                </div>

            </div>

        `;
    }


    hrCard.innerHTML = `

        <div class="insight-icon">
            HR
        </div>

        <h3>
            Business / HR Interpretation
        </h3>

        <p>

            GMM groups employees according to
            similarity in the selected
            performance-related features.

            The

            <strong>
                left
            </strong>

            variable is not used during
            clustering.

        </p>

        <p>

            HR teams can use the resulting
            cluster profiles to investigate
            differences in satisfaction,
            evaluation scores, project load,
            monthly working hours and
            company tenure.

        </p>

        ${attritionHTML}

    `;


    container.appendChild(
        hrCard
    );

}

// ============================================================
// PAGE LOAD
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const featureSelect =
            $("featureSelect");

        if (featureSelect) {

            featureSelect.addEventListener(
                "change",
                drawFeatureDistribution
            );
        }

    }
);
