from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from .models import (
    Base,
    ConversionEventSetting,
    GlobalAnalysisSetting,
    MetricDefinition,
)

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "data" / "experiment.db"

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
DEMO_TABLES = (
    "experiment_metric_overrides",
    "conversion_events",
    "metrics",
    "experiments",
    "dimensions",
    "metric_definitions",
    "conversion_event_settings",
)
LOCAL_SOURCE_NAME = "Built-in Sample"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_connection() -> sqlite3.Connection:
    """Open a direct SQLite connection for read-heavy stats and simulator work."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
    connection.row_factory = sqlite3.Row
    return connection

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with engine.begin() as connection:
        connection.execute(text("PRAGMA journal_mode=WAL;"))
    
    Base.metadata.create_all(bind=engine)
    _migrate_legacy_schema()
    
    with SessionLocal() as session:
        seed_catalog(session)
        seed_global_analysis_settings(session)


from sqlalchemy import func

def seed_catalog(session: Session) -> None:
    metric_count = session.scalar(func.count(MetricDefinition.metric_id))
    if metric_count == 0:
        metrics = [
            MetricDefinition(metric_id="revenue", label="Revenue", source_type="metric", source_name="revenue", sql_expression="SUM(CASE WHEN m.metric_name = 'revenue' THEN m.value ELSE 0 END)", value_format="currency", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=1, desired_direction="up"),
            MetricDefinition(metric_id="orders", label="Orders / User", source_type="metric", source_name="orders", sql_expression="SUM(CASE WHEN m.metric_name = 'orders' THEN m.value ELSE 0 END)", value_format="number", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=1, desired_direction="up"),
            MetricDefinition(metric_id="sessions", label="Sessions / User", source_type="metric", source_name="sessions", sql_expression="SUM(CASE WHEN m.metric_name = 'sessions' THEN m.value ELSE 0 END)", value_format="number", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=1, desired_direction="up"),
            MetricDefinition(metric_id="gross_profit", label="Gross Profit", source_type="metric", source_name="gross_profit", sql_expression="SUM(CASE WHEN m.metric_name = 'gross_profit' THEN m.value ELSE 0 END)", value_format="currency", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=1, desired_direction="up"),
            MetricDefinition(metric_id="items_per_order", label="Items / User", source_type="metric", source_name="items_per_order", sql_expression="SUM(CASE WHEN m.metric_name = 'items_per_order' THEN m.value ELSE 0 END)", value_format="number", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=1, desired_direction="up"),
            MetricDefinition(metric_id="conversion_purchase", label="Purchase Conversion Rate", source_type="conversion_event", source_name="purchase", sql_expression="CASE WHEN COUNT(c.timestamp) > 0 THEN 1.0 ELSE 0.0 END", value_format="percent", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=0, desired_direction="up"),
            MetricDefinition(metric_id="conversion_signup_complete", label="Signup Completion Rate", source_type="conversion_event", source_name="signup_complete", sql_expression="CASE WHEN COUNT(c.timestamp) > 0 THEN 1.0 ELSE 0.0 END", value_format="percent", default_window_days=7, default_winsorize_percentile=100.0, supports_winsorization=0, desired_direction="up"),
            MetricDefinition(metric_id="conversion_add_to_cart", label="Add To Cart Rate", source_type="conversion_event", source_name="add_to_cart", sql_expression="CASE WHEN COUNT(c.timestamp) > 0 THEN 1.0 ELSE 0.0 END", value_format="percent", default_window_days=5, default_winsorize_percentile=100.0, supports_winsorization=0, desired_direction="up"),
            MetricDefinition(metric_id="latency", label="Latency (ms)", source_type="metric", source_name="latency", sql_expression="SUM(CASE WHEN m.metric_name = 'latency' THEN m.value ELSE 0 END) / NULLIF(SUM(CASE WHEN m.metric_name = 'latency' THEN 1 ELSE 0 END), 0)", value_format="number", default_window_days=14, default_winsorize_percentile=99.0, supports_winsorization=1, desired_direction="down"),
        ]
        session.add_all(metrics)

    event_count = session.scalar(func.count(ConversionEventSetting.event_name))
    if event_count == 0:
        events = [
            ConversionEventSetting(event_name="purchase", default_window_days=14),
            ConversionEventSetting(event_name="signup_complete", default_window_days=7),
            ConversionEventSetting(event_name="add_to_cart", default_window_days=5),
            ConversionEventSetting(event_name="checkout_start", default_window_days=3),
        ]
        for event in events:
            # use merge to do "insert or ignore" functionality equivalent
            session.merge(event)
            
    session.commit()


def seed_global_analysis_settings(session: Session) -> None:
    existing = session.get(GlobalAnalysisSetting, 1)
    if existing is None:
        session.add(
            GlobalAnalysisSetting(
                id=1,
                minimum_users_per_leg=100,
                minimum_conversions_per_leg=25,
            )
        )
        session.commit()


def reset_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with engine.begin() as connection:
        connection.execute(text("PRAGMA journal_mode=WAL;"))
        for table_name in DEMO_TABLES:
            connection.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))

    Base.metadata.create_all(bind=engine)

    with SessionLocal() as session:
        seed_catalog(session)
        seed_global_analysis_settings(session)


def clear_source_data(*, source_name: str, user_prefix: str | None = None) -> None:
    with engine.begin() as connection:
        if user_prefix:
            like_pattern = f"{user_prefix}%"
            connection.execute(text("DELETE FROM metrics WHERE user_id LIKE :pattern"), {"pattern": like_pattern})
            connection.execute(text("DELETE FROM conversion_events WHERE user_id LIKE :pattern"), {"pattern": like_pattern})
            connection.execute(text("DELETE FROM dimensions WHERE user_id LIKE :pattern"), {"pattern": like_pattern})
        else:
            user_rows = connection.execute(
                text("SELECT DISTINCT user_id FROM experiments WHERE source_name = :source_name"),
                {"source_name": source_name},
            ).fetchall()
            user_ids = [row[0] for row in user_rows]
            for user_id in user_ids:
                connection.execute(text("DELETE FROM metrics WHERE user_id = :user_id"), {"user_id": user_id})
                connection.execute(text("DELETE FROM conversion_events WHERE user_id = :user_id"), {"user_id": user_id})
                connection.execute(text("DELETE FROM dimensions WHERE user_id = :user_id"), {"user_id": user_id})

        experiment_rows = connection.execute(
            text("SELECT experiment_id FROM experiments WHERE source_name = :source_name"),
            {"source_name": source_name},
        ).fetchall()
        for row in experiment_rows:
            connection.execute(
                text("DELETE FROM experiment_metric_overrides WHERE experiment_id = :experiment_id"),
                {"experiment_id": row[0]},
            )
        connection.execute(text("DELETE FROM experiments WHERE source_name = :source_name"), {"source_name": source_name})


def _migrate_legacy_schema() -> None:
    with engine.begin() as connection:
        experiment_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(experiments)")).fetchall()
        }
        if "source_name" not in experiment_columns:
            connection.execute(text("ALTER TABLE experiments ADD COLUMN source_name TEXT"))
        if "display_experiment_id" not in experiment_columns:
            connection.execute(text("ALTER TABLE experiments ADD COLUMN display_experiment_id TEXT"))

        connection.execute(
            text(
                """
                UPDATE experiments
                SET source_name = COALESCE(source_name, :source_name),
                    display_experiment_id = COALESCE(display_experiment_id, experiment_id)
                """
            ),
            {"source_name": LOCAL_SOURCE_NAME},
        )
