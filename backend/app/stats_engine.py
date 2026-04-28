from __future__ import annotations

import math
import sqlite3
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
from scipy.stats import chi2, chi2_contingency, norm, ttest_ind
from statsmodels.stats.multitest import multipletests

from .database import get_connection
from .schemas import MetricDefinition


USER_LEVEL_SQL = """
WITH experiment_users AS (
    SELECT user_id, variation_id, timestamp
    FROM experiments
    WHERE experiment_id = :experiment_id
),
inception AS (
    SELECT m.user_id, MIN(m.date) AS d0
    FROM metrics m
    JOIN experiment_users eu ON m.user_id = eu.user_id
    GROUP BY 1
)
SELECT
    e.user_id,
    e.variation_id,
    d.country_code,
    d.mcc,
    i.d0,
    {sql_expression} AS metric_value
FROM experiment_users e
JOIN inception i ON e.user_id = i.user_id
LEFT JOIN metrics m ON m.user_id = i.user_id
  AND m.date BETWEEN i.d0 AND DATE(i.d0, '+' || :day_range || ' days')
LEFT JOIN conversion_events c ON c.user_id = e.user_id
  AND DATE(c.timestamp) BETWEEN i.d0 AND DATE(i.d0, '+' || :day_range || ' days')
JOIN dimensions d ON d.user_id = e.user_id
WHERE DATE(e.timestamp) >= i.d0
GROUP BY e.user_id, e.variation_id, d.country_code, d.mcc, i.d0
"""

DAILY_USER_LEVEL_SQL = """
WITH experiment_users AS (
    SELECT user_id, variation_id, timestamp
    FROM experiments
    WHERE experiment_id = :experiment_id
),
experiment_dates AS (
    SELECT DISTINCT m.date AS bucket_date
    FROM experiment_users e
    JOIN metrics m ON m.user_id = e.user_id
),
selected_dates AS (
    SELECT bucket_date
    FROM experiment_dates
    ORDER BY bucket_date
    LIMIT :day_range
),
inception AS (
    SELECT m.user_id, MIN(m.date) AS d0
    FROM metrics m
    JOIN experiment_users eu ON m.user_id = eu.user_id
    GROUP BY 1
)
SELECT
    sd.bucket_date,
    e.user_id,
    e.variation_id,
    d.country_code,
    d.mcc,
    {sql_expression} AS metric_value
FROM selected_dates sd
JOIN experiment_users e ON 1=1
JOIN inception i ON i.user_id = e.user_id
JOIN dimensions d ON d.user_id = e.user_id
LEFT JOIN metrics m ON m.user_id = e.user_id
  AND m.date = sd.bucket_date
LEFT JOIN conversion_events c ON c.user_id = e.user_id
  AND DATE(c.timestamp) = sd.bucket_date
WHERE DATE(e.timestamp) >= i.d0
GROUP BY sd.bucket_date, e.user_id, e.variation_id
ORDER BY sd.bucket_date, e.variation_id, e.user_id
"""

CONVERSION_RATE_SQL = "CASE WHEN SUM(CASE WHEN c.event_name = '{event_name}' THEN 1 ELSE 0 END) > 0 THEN 1.0 ELSE 0.0 END"


@dataclass
class TestResult:
    control_mean: float
    treatment_mean: float
    relative_lift: float
    ci_low: float | None
    ci_high: float | None
    p_value: float | None
    adjusted_p_value: float | None
    control_users: int
    treatment_users: int
    winsorized_threshold: float


class StatsEngine:
    def __init__(self, connection: sqlite3.Connection | None = None) -> None:
        self.connection = connection or get_connection()

    def analyze_experiment(
        self,
        *,
        experiment_id: str,
        primary_metric_ids: list[str],
        secondary_metric_ids: list[str],
        guardrail_metric_ids: list[str],
        split_dimension: str | None = None,
        multiple_testing_method: str = "benjamini-hochberg",
    ) -> dict[str, object]:
        all_metric_ids = primary_metric_ids + secondary_metric_ids + guardrail_metric_ids
        if not all_metric_ids:
            raise ValueError("At least one metric must be supplied.")

        experiment_users = self._experiment_users_dataset(experiment_id=experiment_id)
        if not experiment_users:
            raise ValueError("No experiment data available for analysis.")

        metrics = self.get_metric_definitions(experiment_id=experiment_id, metric_ids=all_metric_ids)
        metric_rows: list[dict[str, Any]] = []
        test_slots: list[tuple[dict[str, Any], dict[str, Any]]] = []

        for metric in metrics:
            category = "primary" if metric.id in primary_metric_ids else (
                "secondary" if metric.id in secondary_metric_ids else "guardrail"
            )
            is_guardrail = category == "guardrail"

            dataset = self._metric_dataset(
                experiment_id=experiment_id,
                day_range=metric.default_window_days,
                sql_expression=metric.sql_expression,
            )
            if not dataset:
                continue

            winsor = metric.default_winsorize_percentile if metric.supports_winsorization else None
            grouped_rows = (
                self._grouped_analysis(
                    dataset,
                    split_dimension,
                    winsor,
                    skip_tests=is_guardrail,
                    experiment_id=experiment_id,
                    day_range=metric.default_window_days,
                    sql_expression=metric.sql_expression,
                )
                if split_dimension
                else [self._run_group_test(dataset, winsor, skip_tests=is_guardrail)]
            )
            for grouped_row in grouped_rows:
                row = self._decorate_metric_row(
                    grouped_row,
                    metric=metric,
                    experiment_id=experiment_id,
                    split_dimension=split_dimension,
                )
                row["category"] = category
                metric_rows.append(row)
                if not is_guardrail:
                    for comparison in row["comparisons"]:
                        test_slots.append((row, comparison))

        if not metric_rows:
            raise ValueError("No valid metric rows were produced for analysis.")

        if test_slots:
            raw_p_values = [float(comparison["p_value"]) for _, comparison in test_slots]
            statsmodels_method = "fdr_bh" if multiple_testing_method == "benjamini-hochberg" else "bonferroni"
            adjusted = multipletests(raw_p_values, method=statsmodels_method)[1] if len(raw_p_values) > 1 else raw_p_values
            for (_, comparison), adjusted_p in zip(test_slots, adjusted, strict=True):
                comparison["adjusted_p_value"] = float(adjusted_p)

        for row in metric_rows:
            row["multiple_testing_correction_applied"] = len(test_slots) > 1 and row.get("category") != "guardrail"
            if row["comparisons"]:
                row["primary_comparison"] = row["comparisons"][0]
            else:
                row["primary_comparison"] = None

        return {
            "metric_rows": metric_rows,
            "srm": self._srm_check(experiment_users),
            "dimension_balance": self._dimension_balance_checks(experiment_users),
            "variations": self._ordered_variations([str(row["variation_id"]) for row in experiment_users]),
            "multiple_testing_correction_applied": len(test_slots) > 1,
            "multiple_testing_method": multiple_testing_method,
            "split_dimension": split_dimension,
        }

    def list_metrics(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT metric_id, label, source_name, value_format, default_window_days, default_winsorize_percentile
            FROM metric_definitions
            WHERE source_type = 'metric'
            ORDER BY label
            """
        ).fetchall()
        sql_query = "SELECT metric_id, label, source_name, value_format, default_window_days, default_winsorize_percentile FROM metric_definitions WHERE source_type = 'metric' ORDER BY label"
        return [{"sql_query": sql_query, **dict(row)} for row in rows]

    def list_conversion_events(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT
                s.event_name,
                s.default_window_days,
                COUNT(c.timestamp) AS usage_count
            FROM conversion_event_settings s
            LEFT JOIN conversion_events c ON c.event_name = s.event_name
            GROUP BY s.event_name, s.default_window_days
            ORDER BY s.event_name
            """
        ).fetchall()
        sql_query = "SELECT s.event_name, s.default_window_days, COUNT(c.timestamp) AS usage_count FROM conversion_event_settings s LEFT JOIN conversion_events c ON c.event_name = s.event_name GROUP BY s.event_name, s.default_window_days ORDER BY s.event_name"
        return [{"sql_query": sql_query, **dict(row)} for row in rows]

    def list_dimensions(self) -> list[dict[str, Any]]:
        country_count = self.connection.execute("SELECT COUNT(DISTINCT country_code) AS count FROM dimensions").fetchone()["count"]
        mcc_count = self.connection.execute("SELECT COUNT(DISTINCT mcc) AS count FROM dimensions").fetchone()["count"]
        sql_query = "SELECT COUNT(DISTINCT country_code) AS country_count, COUNT(DISTINCT mcc) AS mcc_count FROM dimensions"
        return [
            {"dimension_name": "country_code", "distinct_values": country_count, "sql_query": sql_query},
            {"dimension_name": "mcc", "distinct_values": mcc_count, "sql_query": sql_query},
        ]

    def available_experiment_metrics(self, *, experiment_id: str) -> list[dict[str, Any]]:
        metrics = self.get_metric_definitions(experiment_id=experiment_id)
        return [metric.model_dump() for metric in metrics]

    def update_metric_defaults(self, *, metric_id: str, window_days: int, winsorize_percentile: float) -> None:
        self.connection.execute(
            """
            UPDATE metric_definitions
            SET default_window_days = ?, default_winsorize_percentile = ?
            WHERE metric_id = ?
            """,
            (window_days, winsorize_percentile, metric_id),
        )
        self.connection.commit()

    def update_conversion_event_defaults(self, *, event_name: str, window_days: int) -> None:
        self.connection.execute(
            """
            INSERT INTO conversion_event_settings(event_name, default_window_days)
            VALUES (?, ?)
            ON CONFLICT(event_name) DO UPDATE SET default_window_days = excluded.default_window_days
            """,
            (event_name, window_days),
        )
        self.connection.commit()

    def upsert_experiment_override(
        self,
        *,
        experiment_id: str,
        metric_id: str,
        window_days: int,
        winsorize_percentile: float | None,
    ) -> None:
        metric = self.connection.execute(
            "SELECT source_type, default_winsorize_percentile FROM metric_definitions WHERE metric_id = ?",
            (metric_id,),
        ).fetchone()
        if metric is None:
            raise ValueError(f"Unknown metric: {metric_id}")
        resolved_winsor = (
            float(metric["default_winsorize_percentile"])
            if metric["source_type"] == "conversion_event" or winsorize_percentile is None
            else winsorize_percentile
        )
        self.connection.execute(
            """
            INSERT INTO experiment_metric_overrides(experiment_id, metric_id, window_days, winsorize_percentile)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(experiment_id, metric_id) DO UPDATE SET
                window_days = excluded.window_days,
                winsorize_percentile = excluded.winsorize_percentile
            """,
            (experiment_id, metric_id, window_days, resolved_winsor),
        )
        self.connection.commit()

    def list_experiments(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            WITH experiment_users AS (
                SELECT
                    experiment_id,
                    COUNT(DISTINCT user_id) AS users,
                    MIN(DATE(timestamp)) AS start_date
                FROM experiments
                GROUP BY 1
            ),
            experiment_dates AS (
                SELECT
                    e.experiment_id,
                    MAX(m.date) AS latest_metric_date
                FROM experiments e
                LEFT JOIN metrics m ON m.user_id = e.user_id
                GROUP BY 1
            ),
            experiment_variants AS (
                SELECT
                    experiment_id,
                    COUNT(DISTINCT variation_id) AS variant_count
                FROM experiments
                GROUP BY 1
            )
            SELECT
                u.experiment_id,
                u.users,
                u.start_date,
                d.latest_metric_date,
                v.variant_count
            FROM experiment_users u
            LEFT JOIN experiment_dates d ON d.experiment_id = u.experiment_id
            LEFT JOIN experiment_variants v ON v.experiment_id = u.experiment_id
            ORDER BY u.start_date DESC, u.experiment_id
            """
        ).fetchall()
        return [dict(row) for row in rows]

    def sample_size(self, *, baseline_mean: float, baseline_stddev: float, mde: float, alpha: float, power: float) -> dict[str, float]:
        z_alpha = norm.ppf(1 - alpha / 2)
        z_beta = norm.ppf(power)
        absolute_delta = baseline_mean * mde
        required_per_arm = 2 * ((z_alpha + z_beta) ** 2) * (baseline_stddev**2) / (absolute_delta**2)
        return {
            "required_per_variation": math.ceil(required_per_arm),
            "total_required_sample": math.ceil(required_per_arm * 2),
            "absolute_delta": absolute_delta,
        }

    def power_calculator(
        self,
        *,
        metric_type: str,
        variant_count: int,
        baseline_rate: float | None,
        baseline_mean: float | None,
        baseline_stddev: float | None,
        mde: float,
        alpha: float,
        power: float,
    ) -> dict[str, float | str]:
        z_alpha = norm.ppf(1 - alpha / 2)
        z_beta = norm.ppf(power)

        if metric_type == "conversion":
            if baseline_rate is None:
                raise ValueError("baseline_rate is required for conversion sample size calculations.")
            treatment_rate = baseline_rate * (1 + mde)
            if treatment_rate <= 0 or treatment_rate >= 1:
                raise ValueError("The implied treatment conversion rate must stay between 0 and 1.")
            pooled_rate = (baseline_rate + treatment_rate) / 2
            numerator = (
                z_alpha * math.sqrt(2 * pooled_rate * (1 - pooled_rate))
                + z_beta * math.sqrt(baseline_rate * (1 - baseline_rate) + treatment_rate * (1 - treatment_rate))
            ) ** 2
            absolute_delta = treatment_rate - baseline_rate
            required_per_arm = numerator / (absolute_delta**2)
            return {
                "metric_type": metric_type,
                "variant_count": variant_count,
                "required_per_variation": math.ceil(required_per_arm),
                "total_required_sample": math.ceil(required_per_arm * variant_count),
                "absolute_delta": absolute_delta,
                "expected_treatment_value": treatment_rate,
            }

        if baseline_mean is None or baseline_stddev is None:
            raise ValueError("baseline_mean and baseline_stddev are required for continuous sample size calculations.")

        absolute_delta = baseline_mean * mde
        required_per_arm = 2 * ((z_alpha + z_beta) ** 2) * (baseline_stddev**2) / (absolute_delta**2)
        return {
            "metric_type": metric_type,
            "variant_count": variant_count,
            "required_per_variation": math.ceil(required_per_arm),
            "total_required_sample": math.ceil(required_per_arm * variant_count),
            "absolute_delta": absolute_delta,
            "expected_treatment_value": baseline_mean + absolute_delta,
        }

    def get_metric_definitions(
        self,
        *,
        experiment_id: str,
        metric_ids: list[str] | None = None,
    ) -> list[MetricDefinition]:
        params: list[Any] = [experiment_id]
        where_clause = ""
        if metric_ids:
            placeholders = ", ".join("?" for _ in metric_ids)
            where_clause = f"WHERE m.metric_id IN ({placeholders})"
            params.extend(metric_ids)

        rows = self.connection.execute(
            f"""
            SELECT
                m.metric_id,
                m.label,
                m.sql_expression,
                m.value_format,
                m.source_type,
                m.source_name,
                m.supports_winsorization,
                CASE WHEN o.metric_id IS NOT NULL THEN 1 ELSE 0 END AS has_experiment_override,
                COALESCE(o.window_days, CASE
                    WHEN m.source_type = 'conversion_event' THEN s.default_window_days
                    ELSE m.default_window_days
                END) AS resolved_window_days,
                COALESCE(o.winsorize_percentile, m.default_winsorize_percentile) AS resolved_winsorize_percentile
            FROM metric_definitions m
            LEFT JOIN conversion_event_settings s ON s.event_name = m.source_name
            LEFT JOIN experiment_metric_overrides o
              ON o.metric_id = m.metric_id
             AND o.experiment_id = ?
            {where_clause}
            ORDER BY m.label
            """,
            params,
        ).fetchall()
        return [
            MetricDefinition(
                id=row["metric_id"],
                label=row["label"],
                sql_expression=self._resolved_sql_expression(
                    source_type=row["source_type"],
                    source_name=row["source_name"],
                    sql_expression=row["sql_expression"],
                ),
                value_format=row["value_format"],
                source_type=row["source_type"],
                source_name=row["source_name"],
                default_window_days=row["resolved_window_days"],
                default_winsorize_percentile=row["resolved_winsorize_percentile"],
                supports_winsorization=bool(row["supports_winsorization"]),
                has_experiment_override=bool(row["has_experiment_override"]),
            )
            for row in rows
        ]

    def _experiment_users_dataset(self, *, experiment_id: str) -> list[sqlite3.Row]:
        query = """
        SELECT e.user_id, e.variation_id, d.country_code, d.mcc
        FROM experiments e
        JOIN dimensions d ON d.user_id = e.user_id
        WHERE e.experiment_id = :experiment_id
        """
        return self.connection.execute(query, {"experiment_id": experiment_id}).fetchall()

    def _metric_dataset(self, *, experiment_id: str, day_range: int, sql_expression: str) -> list[sqlite3.Row]:
        query = USER_LEVEL_SQL.format(sql_expression=sql_expression)
        return self.connection.execute(query, {"experiment_id": experiment_id, "day_range": day_range}).fetchall()

    def _resolved_sql_expression(self, *, source_type: str, source_name: str, sql_expression: str) -> str:
        if source_type == "conversion_event":
            return CONVERSION_RATE_SQL.format(event_name=source_name)
        return sql_expression

    def _analysis_sql(self, *, experiment_id: str, day_range: int, sql_expression: str) -> str:
        query = USER_LEVEL_SQL.format(sql_expression=sql_expression).strip()
        return query.replace(":experiment_id", f"'{experiment_id}'").replace(":day_range", str(day_range))

    def _run_group_test(
        self,
        dataset: list[sqlite3.Row],
        winsorize_percentile: float | None,
        skip_tests: bool = False,
    ) -> dict[str, Any]:
        ordered_variations = self._ordered_variations([str(row["variation_id"]) for row in dataset])
        grouped_arrays = {
            variation: np.array([row["metric_value"] for row in dataset if row["variation_id"] == variation], dtype=float)
            for variation in ordered_variations
        }
        raw_variation_stats = {
            variation: {
                "user_count": len([row for row in dataset if row["variation_id"] == variation]),
                "conversion_count": int(
                    sum(1 for row in dataset if row["variation_id"] == variation and float(row["metric_value"]) > 0)
                ),
            }
            for variation in ordered_variations
        }
        if len(ordered_variations) < 2:
            raise ValueError("At least two variants are required for analysis.")

        threshold: float | None = None
        if winsorize_percentile is not None:
            threshold = float(np.percentile(np.concatenate(list(grouped_arrays.values())), winsorize_percentile))
            grouped_arrays = {
                variation: np.clip(values, None, threshold) for variation, values in grouped_arrays.items()
            }

        baseline = ordered_variations[0]
        baseline_values = grouped_arrays[baseline]
        baseline_mean = float(np.mean(baseline_values))
        comparisons: list[dict[str, Any]] = []
        for variant in ordered_variations[1:]:
            variant_values = grouped_arrays[variant]
            variant_mean = float(np.mean(variant_values))
            relative_lift = float((variant_mean - baseline_mean) / baseline_mean) if baseline_mean else 0.0

            if skip_tests:
                comparisons.append(
                    {
                        "baseline_variant": baseline,
                        "variant": variant,
                        "relative_lift": relative_lift,
                        "ci_low": None,
                        "ci_high": None,
                        "p_value": None,
                        "adjusted_p_value": None,
                    }
                )
                continue

            raw_p_value = float(ttest_ind(variant_values, baseline_values, equal_var=False).pvalue)
            p_value = 1.0 if math.isnan(raw_p_value) else raw_p_value

            baseline_var = float(np.var(baseline_values, ddof=1))
            variant_var = float(np.var(variant_values, ddof=1))
            var_mu_t = variant_var / len(variant_values)
            var_mu_c = baseline_var / len(baseline_values)
            if baseline_mean:
                var_lift = (var_mu_t / (baseline_mean**2)) + (
                    (variant_mean**2) * var_mu_c / (baseline_mean**4)
                )
                se_lift = math.sqrt(max(0.0, var_lift))
                ci_low = relative_lift - 1.96 * se_lift
                ci_high = relative_lift + 1.96 * se_lift
            else:
                ci_low = 0.0
                ci_high = 0.0

            comparisons.append(
                {
                    "baseline_variant": baseline,
                    "variant": variant,
                    "relative_lift": relative_lift,
                    "ci_low": ci_low,
                    "ci_high": ci_high,
                    "p_value": p_value,
                    "adjusted_p_value": p_value,
                }
            )

        primary = comparisons[0]
        result = TestResult(
            control_mean=baseline_mean,
            treatment_mean=float(np.mean(grouped_arrays[ordered_variations[1]])),
            relative_lift=float(primary["relative_lift"]),
            ci_low=primary["ci_low"],
            ci_high=primary["ci_high"],
            p_value=primary["p_value"],
            adjusted_p_value=primary["adjusted_p_value"],
            control_users=len(baseline_values),
            treatment_users=len(grouped_arrays[ordered_variations[1]]),
            winsorized_threshold=threshold if threshold is not None else float("nan"),
        )
        payload = asdict(result)
        payload["winsorized_threshold"] = threshold
        payload["variation_values"] = {
            variation: float(np.mean(values)) for variation, values in grouped_arrays.items()
        }
        payload["variation_stats"] = {
            variation: {
                "user_count": raw_variation_stats[variation]["user_count"],
                "conversion_count": raw_variation_stats[variation]["conversion_count"],
                "average_value": float(np.mean(grouped_arrays[variation])),
            }
            for variation in ordered_variations
        }
        payload["comparisons"] = comparisons
        payload["baseline_variant"] = baseline
        return payload

    def _decorate_metric_row(
        self,
        row: dict[str, Any],
        *,
        metric: MetricDefinition,
        experiment_id: str,
        split_dimension: str | None,
    ) -> dict[str, Any]:
        winsor = metric.default_winsorize_percentile if metric.supports_winsorization else None
        row["metric_id"] = metric.id
        row["metric_label"] = metric.label
        row["value_format"] = metric.value_format
        row["source_type"] = metric.source_type
        row["source_name"] = metric.source_name
        row["window_days"] = metric.default_window_days
        row["winsorize_percentile"] = metric.default_winsorize_percentile if metric.supports_winsorization else None
        row["supports_winsorization"] = metric.supports_winsorization
        row["has_experiment_override"] = metric.has_experiment_override
        row["analysis_sql"] = self._analysis_sql(
            experiment_id=experiment_id,
            day_range=metric.default_window_days,
            sql_expression=metric.sql_expression,
        )
        row["time_series"] = self._metric_time_series(
            experiment_id=experiment_id,
            day_range=metric.default_window_days,
            sql_expression=metric.sql_expression,
            winsorize_percentile=winsor,
            split_dimension=split_dimension,
            split_value=row.get("dimension_value"),
        )
        row["dimension_name"] = split_dimension
        return row

    def _metric_time_series(
        self,
        *,
        experiment_id: str,
        day_range: int,
        sql_expression: str,
        winsorize_percentile: float | None,
        split_dimension: str | None = None,
        split_value: str | None = None,
    ) -> list[dict[str, Any]]:
        query = DAILY_USER_LEVEL_SQL.format(sql_expression=sql_expression)
        dataset = self.connection.execute(
            query,
            {"experiment_id": experiment_id, "day_range": day_range},
        ).fetchall()
        if not dataset:
            return []

        ordered_variations = self._ordered_variations([str(row["variation_id"]) for row in dataset])
        grouped_by_date: dict[str, list[sqlite3.Row]] = {}
        for row in dataset:
            grouped_by_date.setdefault(str(row["bucket_date"]), []).append(row)

        series: list[dict[str, Any]] = []
        for bucket_date in sorted(grouped_by_date):
            date_rows = grouped_by_date[bucket_date]
            if split_dimension and split_value is not None:
                date_rows = [row for row in date_rows if str(row[split_dimension]) == split_value]
            if not date_rows:
                continue
            grouped_arrays = {
                variation: np.array([row["metric_value"] for row in date_rows if row["variation_id"] == variation], dtype=float)
                for variation in ordered_variations
            }
            if winsorize_percentile is not None:
                threshold = float(np.percentile(np.concatenate(list(grouped_arrays.values())), winsorize_percentile))
                grouped_arrays = {
                    variation: np.clip(values, None, threshold) for variation, values in grouped_arrays.items()
                }
            series.append(
                {
                    "date": bucket_date,
                    "variation_values": {
                        variation: float(np.mean(values)) for variation, values in grouped_arrays.items()
                    },
                }
            )
        return series

    def _grouped_analysis(
        self,
        dataset: list[sqlite3.Row],
        dimension: str,
        winsorize_percentile: float | None,
        *,
        skip_tests: bool = False,
        experiment_id: str,
        day_range: int,
        sql_expression: str,
    ) -> list[dict[str, float | int | str]]:
        grouped: dict[str, list[sqlite3.Row]] = {}
        for row in dataset:
            grouped.setdefault(str(row[dimension]), []).append(row)

        results: list[dict[str, float | int | str]] = []
        for group_name, rows in grouped.items():
            try:
                group_result = self._run_group_test(rows, winsorize_percentile, skip_tests=skip_tests)
                group_result["dimension_value"] = group_name
                results.append(group_result)
            except ValueError:
                continue
        return sorted(results, key=lambda item: str(item["dimension_value"]))

    def _srm_check(self, dataset: list[sqlite3.Row]) -> dict[str, float | bool | dict[str, int]]:
        ordered_variations = self._ordered_variations([str(row["variation_id"]) for row in dataset])
        counts = {
            variation: len([row for row in dataset if row["variation_id"] == variation])
            for variation in ordered_variations
        }
        observed = np.array([counts[variation] for variation in ordered_variations], dtype=float)
        expected = np.array([observed.sum() / len(observed)] * len(observed), dtype=float)
        statistic = float(np.sum(((observed - expected) ** 2) / expected))
        p_value = float(chi2.sf(statistic, df=max(1, len(observed) - 1)))
        return {"counts": counts, "p_value": p_value, "critical": p_value < 0.01}

    def _ordered_variations(self, variations: list[str]) -> list[str]:
        return sorted(set(variations), key=self._variation_sort_key)

    def _variation_sort_key(self, variation: str) -> tuple[int, str]:
        try:
            return (int(variation.split()[-1]), variation)
        except (ValueError, IndexError):
            return (10_000, variation)

    def _dimension_balance_checks(self, dataset: list[sqlite3.Row]) -> list[dict[str, object]]:
        results: list[dict[str, object]] = []
        ordered_variations = self._ordered_variations([str(row["variation_id"]) for row in dataset])
        for dimension in ("country_code", "mcc"):
            contingency: dict[str, dict[str, int]] = {}
            for row in dataset:
                key = str(row[dimension])
                contingency.setdefault(key, {variation: 0 for variation in ordered_variations})
                contingency[key][str(row["variation_id"])] += 1

            if len(contingency) < 2:
                continue

            table = np.array([[counts[variation] for variation in ordered_variations] for counts in contingency.values()])
            _, p_value, _, _ = chi2_contingency(table)
            results.append(
                {
                    "dimension": dimension,
                    "p_value": float(p_value),
                    "balanced": bool(p_value >= 0.05),
                    "buckets": contingency,
                }
            )
        return results
