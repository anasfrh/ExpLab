from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import numpy as np

from .database import get_connection


COUNTRIES = ["US", "CA", "GB", "FR", "DE", "MA", "BR"]
MCCS = ["5411", "5732", "5812", "4111", "4900", "5999"]


@dataclass
class SimulationSummary:
    users: int
    start_date: str
    end_date: str
    experiment_id: str
    metric_name: str
    target_lift: float
    srm_skew: bool


class Simulator:
    def __init__(self, seed: int = 42) -> None:
        self.seed = seed
        self.py_random = random.Random(seed)
        self.rng = np.random.default_rng(seed)

    def seed_experiment(
        self,
        *,
        num_users: int,
        target_lift: float,
        srm_skew: bool,
        experiment_id: str,
        metric_name: str,
        conversion_event_name: str,
        days: int = 30,
        user_prefix: str = "user",
        num_variants: int = 2,
    ) -> SimulationSummary:
        start_date = date.today() - timedelta(days=days - 1)
        all_dates = [start_date + timedelta(days=offset) for offset in range(days)]
        variant_labels = [f"Variant {index}" for index in range(1, num_variants + 1)]
        assignment_weights = self._assignment_weights(num_variants=num_variants, srm_skew=srm_skew)

        user_ids = [f"{user_prefix}_{index:06d}" for index in range(1, num_users + 1)]
        dimensions_rows: list[tuple[str, str, str]] = []
        experiments_rows: list[tuple[str, str, str, str]] = []
        metrics_rows: list[tuple[str, str, float, str]] = []
        conversion_rows: list[tuple[str, str, str]] = []

        for user_id in user_ids:
            country_code = self.py_random.choice(COUNTRIES)
            mcc = self.py_random.choice(MCCS)
            variation = self.py_random.choices(variant_labels, weights=assignment_weights, k=1)[0]
            inception_offset = int(self.rng.integers(0, max(1, days // 4)))
            inception_date = all_dates[inception_offset]

            dimensions_rows.append((user_id, country_code, mcc))
            experiments_rows.append(
                (user_id, experiment_id, variation, datetime.combine(inception_date, datetime.min.time()).isoformat())
            )

            revenue_values = self.rng.lognormal(mean=2.2, sigma=0.9, size=days - inception_offset)
            revenue_values = revenue_values * (1.0 + self._variant_lift_multiplier(variation, target_lift))

            for day_date, revenue_value in zip(all_dates[inception_offset:], revenue_values, strict=True):
                rounded_revenue = round(float(revenue_value), 2)
                order_count = int(max(0, self.rng.poisson(lam=max(0.2, rounded_revenue / 28.0))))
                session_count = int(max(1, self.rng.poisson(lam=3.2)))

                metrics_rows.append((user_id, metric_name, rounded_revenue, day_date.isoformat()))
                metrics_rows.append((user_id, "orders", float(order_count), day_date.isoformat()))
                metrics_rows.append((user_id, "sessions", float(session_count), day_date.isoformat()))
                metrics_rows.append((user_id, "gross_profit", round(rounded_revenue * 0.37, 2), day_date.isoformat()))
                metrics_rows.append((user_id, "items_per_order", float(max(order_count, self.rng.poisson(lam=1.4))), day_date.isoformat()))

                event_probability = min(0.92, 0.16 + min(rounded_revenue / 120.0, 0.52))
                if self.rng.random() < event_probability:
                    conversion_rows.append(
                        (
                            user_id,
                            conversion_event_name,
                            datetime.combine(day_date, datetime.min.time()).isoformat(),
                        )
                    )
                if self.rng.random() < min(0.85, 0.18 + order_count * 0.06):
                    conversion_rows.append((user_id, "add_to_cart", datetime.combine(day_date, datetime.min.time()).isoformat()))
                if self.rng.random() < min(0.60, 0.08 + order_count * 0.04):
                    conversion_rows.append((user_id, "checkout_start", datetime.combine(day_date, datetime.min.time()).isoformat()))
                signup_probability = 0.11 + (0.015 * max(0, variant_labels.index(variation)))
                if self.rng.random() < signup_probability:
                    conversion_rows.append((user_id, "signup_complete", datetime.combine(day_date, datetime.min.time()).isoformat()))

        with get_connection() as connection:
            connection.executemany("INSERT INTO dimensions(user_id, country_code, mcc) VALUES (?, ?, ?)", dimensions_rows)
            connection.executemany(
                "INSERT INTO experiments(user_id, experiment_id, variation_id, timestamp) VALUES (?, ?, ?, ?)",
                experiments_rows,
            )
            connection.executemany(
                "INSERT INTO metrics(user_id, metric_name, value, date) VALUES (?, ?, ?, ?)",
                metrics_rows,
            )
            connection.executemany(
                "INSERT INTO conversion_events(user_id, event_name, timestamp) VALUES (?, ?, ?)",
                conversion_rows,
            )

        return SimulationSummary(
            users=num_users,
            start_date=start_date.isoformat(),
            end_date=all_dates[-1].isoformat(),
            experiment_id=experiment_id,
            metric_name=metric_name,
            target_lift=target_lift,
            srm_skew=srm_skew,
        )

    def advance_day(
        self,
        *,
        experiment_id: str,
        metric_name: str,
        conversion_event_name: str,
        target_lift: float,
    ) -> dict[str, str | int]:
        with get_connection() as connection:
            max_row = connection.execute("SELECT MAX(date) AS max_date FROM metrics WHERE metric_name = ?", (metric_name,)).fetchone()
            if not max_row or not max_row["max_date"]:
                raise ValueError("No metrics found. Run /simulate first.")

            next_date = date.fromisoformat(max_row["max_date"]) + timedelta(days=1)
            assignments = connection.execute(
                """
                SELECT e.user_id, e.variation_id
                FROM experiments e
                WHERE e.experiment_id = ?
                """,
                (experiment_id,),
            ).fetchall()
            if not assignments:
                raise ValueError(f"No experiment assignments found for {experiment_id}.")
            variant_labels = sorted({str(row["variation_id"]) for row in assignments}, key=self._variant_sort_key)

            metric_rows: list[tuple[str, str, float, str]] = []
            conversion_rows: list[tuple[str, str, str]] = []

            for row in assignments:
                value = float(self.rng.lognormal(mean=2.2, sigma=0.9))
                value *= 1.0 + self._variant_lift_multiplier(str(row["variation_id"]), target_lift)
                rounded_value = round(value, 2)
                metric_rows.append((row["user_id"], metric_name, rounded_value, next_date.isoformat()))
                metric_rows.append((row["user_id"], "orders", float(max(0, self.rng.poisson(lam=max(0.2, rounded_value / 28.0)))), next_date.isoformat()))
                metric_rows.append((row["user_id"], "sessions", float(max(1, self.rng.poisson(lam=3.2))), next_date.isoformat()))
                metric_rows.append((row["user_id"], "gross_profit", round(rounded_value * 0.37, 2), next_date.isoformat()))
                metric_rows.append((row["user_id"], "items_per_order", float(max(1, self.rng.poisson(lam=1.4))), next_date.isoformat()))

                event_probability = min(0.92, 0.16 + min(rounded_value / 120.0, 0.52))
                if self.rng.random() < event_probability:
                    conversion_rows.append(
                        (
                            row["user_id"],
                            conversion_event_name,
                            datetime.combine(next_date, datetime.min.time()).isoformat(),
                        )
                    )
                if self.rng.random() < min(0.85, 0.18 + rounded_value / 120.0):
                    conversion_rows.append((row["user_id"], "add_to_cart", datetime.combine(next_date, datetime.min.time()).isoformat()))
                if self.rng.random() < min(0.60, 0.08 + rounded_value / 220.0):
                    conversion_rows.append((row["user_id"], "checkout_start", datetime.combine(next_date, datetime.min.time()).isoformat()))
                signup_probability = 0.11 + (
                    0.015 * max(0, variant_labels.index(str(row["variation_id"]))) if str(row["variation_id"]) in variant_labels else 0
                )
                if self.rng.random() < signup_probability:
                    conversion_rows.append((row["user_id"], "signup_complete", datetime.combine(next_date, datetime.min.time()).isoformat()))

            connection.executemany(
                "INSERT INTO metrics(user_id, metric_name, value, date) VALUES (?, ?, ?, ?)",
                metric_rows,
            )
            connection.executemany(
                "INSERT INTO conversion_events(user_id, event_name, timestamp) VALUES (?, ?, ?)",
                conversion_rows,
            )
        return {"date": next_date.isoformat(), "metric_rows": len(metric_rows), "conversion_events": len(conversion_rows)}

    def seed_demo_portfolio(self) -> list[SimulationSummary]:
        scenarios = [
            {
                "num_users": 4000,
                "target_lift": 0.08,
                "srm_skew": False,
                "experiment_id": "exp_revenue_v1",
                "metric_name": "revenue",
                "conversion_event_name": "purchase",
                "user_prefix": "rev",
                "num_variants": 2,
            },
            {
                "num_users": 3000,
                "target_lift": 0.04,
                "srm_skew": False,
                "experiment_id": "exp_checkout_v2",
                "metric_name": "gross_profit",
                "conversion_event_name": "checkout_start",
                "user_prefix": "chk",
                "num_variants": 3,
            },
            {
                "num_users": 2500,
                "target_lift": 0.12,
                "srm_skew": True,
                "experiment_id": "exp_signup_onboarding",
                "metric_name": "sessions",
                "conversion_event_name": "signup_complete",
                "user_prefix": "sgn",
                "num_variants": 4,
            },
        ]
        return [self.seed_experiment(**scenario) for scenario in scenarios]

    def _variant_lift_multiplier(self, variation: str, target_lift: float) -> float:
        try:
            variant_index = int(variation.split()[-1]) - 1
        except (ValueError, IndexError):
            variant_index = 0
        return max(0.0, variant_index * target_lift)

    def _assignment_weights(self, *, num_variants: int, srm_skew: bool) -> list[float]:
        if not srm_skew:
            return [1 / num_variants] * num_variants
        if num_variants == 2:
            return [0.48, 0.52]
        if num_variants == 3:
            return [0.30, 0.33, 0.37]
        base = np.linspace(1.0, 1.0 + (num_variants - 1) * 0.12, num_variants)
        normalized = base / base.sum()
        return normalized.tolist()

    def _variant_sort_key(self, variation: str) -> tuple[int, str]:
        try:
            return (int(variation.split()[-1]), variation)
        except (ValueError, IndexError):
            return (10_000, variation)
