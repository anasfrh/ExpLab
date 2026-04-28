from __future__ import annotations

import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "data" / "experiment.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS experiments (
                user_id TEXT NOT NULL,
                experiment_id TEXT NOT NULL,
                variation_id TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversion_events (
                user_id TEXT NOT NULL,
                event_name TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dimensions (
                user_id TEXT NOT NULL,
                country_code TEXT NOT NULL,
                mcc TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS metrics (
                user_id TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                value REAL NOT NULL,
                date TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS metric_definitions (
                metric_id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_name TEXT NOT NULL,
                sql_expression TEXT NOT NULL,
                value_format TEXT NOT NULL,
                default_window_days INTEGER NOT NULL,
                default_winsorize_percentile REAL NOT NULL,
                supports_winsorization INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS conversion_event_settings (
                event_name TEXT PRIMARY KEY,
                default_window_days INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS experiment_metric_overrides (
                experiment_id TEXT NOT NULL,
                metric_id TEXT NOT NULL,
                window_days INTEGER NOT NULL,
                winsorize_percentile REAL NOT NULL,
                PRIMARY KEY (experiment_id, metric_id)
            );

            CREATE INDEX IF NOT EXISTS idx_experiments_user ON experiments(user_id);
            CREATE INDEX IF NOT EXISTS idx_experiments_experiment_id ON experiments(experiment_id);
            CREATE INDEX IF NOT EXISTS idx_metrics_user_date ON metrics(user_id, date);
            CREATE INDEX IF NOT EXISTS idx_metrics_metric_date ON metrics(metric_name, date);
            CREATE INDEX IF NOT EXISTS idx_dimensions_user ON dimensions(user_id);
            CREATE INDEX IF NOT EXISTS idx_conversion_events_user ON conversion_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_conversion_events_user_event ON conversion_events(user_id, event_name, timestamp);
            """
        )
        seed_catalog(connection)


def seed_catalog(connection: sqlite3.Connection) -> None:
    metric_count = connection.execute("SELECT COUNT(*) AS count FROM metric_definitions").fetchone()["count"]
    if metric_count == 0:
        connection.executemany(
            """
            INSERT INTO metric_definitions(
                metric_id, label, source_type, source_name, sql_expression, value_format,
                default_window_days, default_winsorize_percentile, supports_winsorization
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "revenue",
                    "Revenue",
                    "metric",
                    "revenue",
                    "SUM(CASE WHEN m.metric_name = 'revenue' THEN m.value ELSE 0 END)",
                    "currency",
                    14,
                    99.0,
                    1,
                ),
                (
                    "orders",
                    "Orders / User",
                    "metric",
                    "orders",
                    "SUM(CASE WHEN m.metric_name = 'orders' THEN m.value ELSE 0 END)",
                    "number",
                    14,
                    99.0,
                    1,
                ),
                (
                    "sessions",
                    "Sessions / User",
                    "metric",
                    "sessions",
                    "SUM(CASE WHEN m.metric_name = 'sessions' THEN m.value ELSE 0 END)",
                    "number",
                    14,
                    99.0,
                    1,
                ),
                (
                    "gross_profit",
                    "Gross Profit",
                    "metric",
                    "gross_profit",
                    "SUM(CASE WHEN m.metric_name = 'gross_profit' THEN m.value ELSE 0 END)",
                    "currency",
                    14,
                    99.0,
                    1,
                ),
                (
                    "items_per_order",
                    "Items / User",
                    "metric",
                    "items_per_order",
                    "SUM(CASE WHEN m.metric_name = 'items_per_order' THEN m.value ELSE 0 END)",
                    "number",
                    14,
                    99.0,
                    1,
                ),
                (
                    "conversion_purchase",
                    "Purchase Conversion Rate",
                    "conversion_event",
                    "purchase",
                    "CASE WHEN COUNT(c.timestamp) > 0 THEN 1.0 ELSE 0.0 END",
                    "percent",
                    14,
                    99.0,
                    0,
                ),
                (
                    "conversion_signup_complete",
                    "Signup Completion Rate",
                    "conversion_event",
                    "signup_complete",
                    "CASE WHEN COUNT(c.timestamp) > 0 THEN 1.0 ELSE 0.0 END",
                    "percent",
                    7,
                    100.0,
                    0,
                ),
                (
                    "conversion_add_to_cart",
                    "Add To Cart Rate",
                    "conversion_event",
                    "add_to_cart",
                    "CASE WHEN COUNT(c.timestamp) > 0 THEN 1.0 ELSE 0.0 END",
                    "percent",
                    5,
                    100.0,
                    0,
                ),
            ],
        )

    event_count = connection.execute("SELECT COUNT(*) AS count FROM conversion_event_settings").fetchone()["count"]
    if event_count == 0:
        connection.execute(
            "INSERT INTO conversion_event_settings(event_name, default_window_days) VALUES (?, ?)",
            ("purchase", 14),
        )
        connection.executemany(
            "INSERT OR IGNORE INTO conversion_event_settings(event_name, default_window_days) VALUES (?, ?)",
            [
                ("signup_complete", 7),
                ("add_to_cart", 5),
                ("checkout_start", 3),
            ],
        )


def reset_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            DROP TABLE IF EXISTS experiments;
            DROP TABLE IF EXISTS conversion_events;
            DROP TABLE IF EXISTS dimensions;
            DROP TABLE IF EXISTS metrics;
            DROP TABLE IF EXISTS experiment_metric_overrides;
            DROP TABLE IF EXISTS metric_definitions;
            DROP TABLE IF EXISTS conversion_event_settings;
            """
        )
    init_db()
