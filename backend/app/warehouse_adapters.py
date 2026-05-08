from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine, URL

from .models import DataSource

DIMENSION_COLUMNS = ["country_code", "mcc", "os"]


class WarehouseAdapter(ABC):
    def __init__(self, source: DataSource) -> None:
        self.source = source

    @abstractmethod
    def test_connection(self) -> dict[str, str]:
        raise NotImplementedError

    @abstractmethod
    def validate_schema(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_experiments(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def fetch_experiment_users(self, internal_experiment_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def fetch_metric_dataset(
        self,
        *,
        internal_experiment_id: str,
        day_range: int,
        source_type: str,
        source_name: str,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def fetch_metric_time_series(
        self,
        *,
        internal_experiment_id: str,
        day_range: int,
        source_type: str,
        source_name: str,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def analysis_sql(self, *, source_type: str, source_name: str, day_range: int) -> str:
        raise NotImplementedError

    @property
    def dimension_columns(self) -> list[str]:
        return DIMENSION_COLUMNS


AdapterFactory = Callable[[DataSource], WarehouseAdapter]
ADAPTER_FACTORIES: dict[str, AdapterFactory] = {}


class PostgresWarehouseAdapter(WarehouseAdapter):
    REQUIRED_COLUMNS = {
        "experiments": {"user_id", "experiment_id", "variation_id", "timestamp"},
        "metrics": {"user_id", "metric_name", "value", "date"},
        "conversion_events": {"user_id", "event_name", "timestamp"},
        "dimensions": {"user_id", "country_code", "mcc", "os"},
    }

    def __init__(self, source: DataSource) -> None:
        super().__init__(source)
        self.engine = self._build_engine()

    def test_connection(self) -> dict[str, str]:
        try:
            with self.engine.connect() as remote:
                remote.execute(text("SELECT 1"))
            return {"message": "Connection successful"}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to connect to PostgreSQL source: {exc}") from exc

    def validate_schema(self) -> None:
        with self.engine.connect() as remote:
            self._validate_schema_with_connection(remote)

    def list_experiments(self) -> list[dict[str, Any]]:
        with self.engine.connect() as remote:
            self._validate_schema_with_connection(remote)
            rows = remote.execute(
                text(
                    f"""
                    WITH experiment_users AS (
                        SELECT
                            experiment_id,
                            COUNT(DISTINCT user_id) AS users,
                            MIN(DATE(timestamp)) AS start_date
                        FROM {self._qualified_table(self.source.experiments_table)}
                        GROUP BY 1
                    ),
                    experiment_dates AS (
                        SELECT
                            e.experiment_id,
                            MAX(m.date) AS latest_metric_date
                        FROM {self._qualified_table(self.source.experiments_table)} e
                        LEFT JOIN {self._qualified_table(self.source.metrics_table)} m
                          ON m.user_id = e.user_id
                        GROUP BY 1
                    ),
                    experiment_variants AS (
                        SELECT
                            experiment_id,
                            COUNT(DISTINCT variation_id) AS variant_count
                        FROM {self._qualified_table(self.source.experiments_table)}
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
                )
            ).mappings().all()
        return [
            {
                "experiment_id": self.source_internal_experiment_id(str(row["experiment_id"])),
                "display_experiment_id": str(row["experiment_id"]),
                "source_name": self.source.name,
                "users": int(row["users"]),
                "start_date": str(row["start_date"]),
                "latest_metric_date": str(row["latest_metric_date"]) if row["latest_metric_date"] is not None else None,
                "variant_count": int(row["variant_count"]),
            }
            for row in rows
        ]

    def fetch_experiment_users(self, internal_experiment_id: str) -> list[dict[str, Any]]:
        experiment_id = self.source_display_experiment_id(internal_experiment_id)
        with self.engine.connect() as remote:
            rows = remote.execute(
                text(
                    f"""
                    SELECT
                        e.user_id,
                        e.variation_id,
                        e.timestamp,
                        d.country_code,
                        d.mcc,
                        d.os
                    FROM {self._qualified_table(self.source.experiments_table)} e
                    JOIN {self._qualified_table(self.source.dimensions_table)} d
                      ON d.user_id = e.user_id
                    WHERE e.experiment_id = :experiment_id
                    """
                ),
                {"experiment_id": experiment_id},
            ).mappings().all()
        return [dict(row) for row in rows]

    def fetch_metric_dataset(
        self,
        *,
        internal_experiment_id: str,
        day_range: int,
        source_type: str,
        source_name: str,
    ) -> list[dict[str, Any]]:
        experiment_id = self.source_display_experiment_id(internal_experiment_id)
        with self.engine.connect() as remote:
            if source_type == "conversion_event":
                rows = remote.execute(
                    text(
                        f"""
                        WITH experiment_users AS (
                            SELECT user_id, variation_id, timestamp, DATE(timestamp) AS d0
                            FROM {self._qualified_table(self.source.experiments_table)}
                            WHERE experiment_id = :experiment_id
                        )
                        SELECT
                            e.user_id,
                            e.variation_id,
                            d.country_code,
                            d.mcc,
                            d.os,
                            e.d0,
                            CASE WHEN COUNT(CASE WHEN c.event_name = :event_name THEN 1 END) > 0 THEN 1.0 ELSE 0.0 END AS metric_value
                        FROM experiment_users e
                        JOIN {self._qualified_table(self.source.dimensions_table)} d
                          ON d.user_id = e.user_id
                        LEFT JOIN {self._qualified_table(self.source.conversion_events_table)} c
                          ON c.user_id = e.user_id
                         AND c.timestamp >= e.timestamp
                         AND c.timestamp <= e.timestamp + make_interval(days => :day_range)
                        GROUP BY e.user_id, e.variation_id, d.country_code, d.mcc, d.os, e.d0
                        """
                    ),
                    {"experiment_id": experiment_id, "event_name": source_name, "day_range": day_range},
                ).mappings().all()
            else:
                rows = remote.execute(
                    text(
                        f"""
                        WITH experiment_users AS (
                            SELECT user_id, variation_id, timestamp, DATE(timestamp) AS d0
                            FROM {self._qualified_table(self.source.experiments_table)}
                            WHERE experiment_id = :experiment_id
                        )
                        SELECT
                            e.user_id,
                            e.variation_id,
                            d.country_code,
                            d.mcc,
                            d.os,
                            e.d0,
                            COALESCE(SUM(CASE WHEN m.metric_name = :metric_name THEN m.value ELSE 0 END), 0.0) AS metric_value
                        FROM experiment_users e
                        JOIN {self._qualified_table(self.source.dimensions_table)} d
                          ON d.user_id = e.user_id
                        LEFT JOIN {self._qualified_table(self.source.metrics_table)} m
                          ON m.user_id = e.user_id
                         AND m.date BETWEEN e.d0 AND DATE(e.d0 + make_interval(days => :day_range))
                        GROUP BY e.user_id, e.variation_id, d.country_code, d.mcc, d.os, e.d0
                        """
                    ),
                    {"experiment_id": experiment_id, "metric_name": source_name, "day_range": day_range},
                ).mappings().all()
        return [dict(row) for row in rows]

    def fetch_metric_time_series(
        self,
        *,
        internal_experiment_id: str,
        day_range: int,
        source_type: str,
        source_name: str,
    ) -> list[dict[str, Any]]:
        experiment_id = self.source_display_experiment_id(internal_experiment_id)
        with self.engine.connect() as remote:
            if source_type == "conversion_event":
                rows = remote.execute(
                    text(
                        f"""
                        WITH experiment_users AS (
                            SELECT user_id, variation_id, timestamp
                            FROM {self._qualified_table(self.source.experiments_table)}
                            WHERE experiment_id = :experiment_id
                        )
                        SELECT
                            DATE(c.timestamp) AS bucket_date,
                            e.user_id,
                            e.variation_id,
                            d.country_code,
                            d.mcc,
                            d.os,
                            CASE WHEN COUNT(CASE WHEN c.event_name = :event_name THEN 1 END) > 0 THEN 1.0 ELSE 0.0 END AS metric_value
                        FROM experiment_users e
                        JOIN {self._qualified_table(self.source.dimensions_table)} d
                          ON d.user_id = e.user_id
                        JOIN {self._qualified_table(self.source.conversion_events_table)} c
                          ON c.user_id = e.user_id
                         AND c.timestamp >= e.timestamp
                         AND c.timestamp <= e.timestamp + make_interval(days => :day_range)
                        GROUP BY DATE(c.timestamp), e.user_id, e.variation_id, d.country_code, d.mcc, d.os
                        ORDER BY bucket_date, e.variation_id, e.user_id
                        """
                    ),
                    {"experiment_id": experiment_id, "event_name": source_name, "day_range": day_range},
                ).mappings().all()
            else:
                rows = remote.execute(
                    text(
                        f"""
                        WITH experiment_users AS (
                            SELECT user_id, variation_id, timestamp, DATE(timestamp) AS d0
                            FROM {self._qualified_table(self.source.experiments_table)}
                            WHERE experiment_id = :experiment_id
                        )
                        SELECT
                            m.date AS bucket_date,
                            e.user_id,
                            e.variation_id,
                            d.country_code,
                            d.mcc,
                            d.os,
                            COALESCE(SUM(CASE WHEN m.metric_name = :metric_name THEN m.value ELSE 0 END), 0.0) AS metric_value
                        FROM experiment_users e
                        JOIN {self._qualified_table(self.source.dimensions_table)} d
                          ON d.user_id = e.user_id
                        JOIN {self._qualified_table(self.source.metrics_table)} m
                          ON m.user_id = e.user_id
                         AND m.date BETWEEN e.d0 AND DATE(e.d0 + make_interval(days => :day_range))
                        GROUP BY m.date, e.user_id, e.variation_id, d.country_code, d.mcc, d.os
                        ORDER BY bucket_date, e.variation_id, e.user_id
                        """
                    ),
                    {"experiment_id": experiment_id, "metric_name": source_name, "day_range": day_range},
                ).mappings().all()
        return [dict(row) for row in rows]

    def analysis_sql(self, *, source_type: str, source_name: str, day_range: int) -> str:
        table_name = self.source.conversion_events_table if source_type == "conversion_event" else self.source.metrics_table
        return (
            f"-- Live query against PostgreSQL source '{self.source.name}'\n"
            f"-- Warehouse table: {self.source.schema_name}.{table_name}\n"
            f"-- Metric source: {source_name}\n"
            f"-- Window: {day_range} days"
        )

    def close(self) -> None:
        self.engine.dispose()

    def _build_engine(self) -> Engine:
        return create_engine(
            URL.create(
                "postgresql+psycopg",
                username=self.source.username,
                password=self.source.password,
                host=self.source.host,
                port=self.source.port,
                database=self.source.database_name,
            ),
            pool_pre_ping=True,
            pool_size=3,
            max_overflow=2,
            connect_args={
                "connect_timeout": 5,
                "options": "-c statement_timeout=15000",
            },
        )

    def _validate_schema_with_connection(self, remote: Connection) -> None:
        table_map = {
            "experiments": self.source.experiments_table,
            "metrics": self.source.metrics_table,
            "conversion_events": self.source.conversion_events_table,
            "dimensions": self.source.dimensions_table,
        }
        for logical_name, table_name in table_map.items():
            self._validate_identifier(self.source.schema_name, "schema")
            self._validate_identifier(table_name, logical_name)
            rows = remote.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = :schema_name
                      AND table_name = :table_name
                    """
                ),
                {"schema_name": self.source.schema_name, "table_name": table_name},
            ).fetchall()
            available_columns = {row[0] for row in rows}
            missing = sorted(self.REQUIRED_COLUMNS[logical_name] - available_columns)
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Table {self.source.schema_name}.{table_name} is missing required columns: {', '.join(missing)}",
                )

    def _validate_identifier(self, identifier: str, label: str) -> None:
        import re

        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", identifier):
            raise HTTPException(status_code=400, detail=f"Invalid {label} identifier: {identifier}")

    def _quoted(self, identifier: str) -> str:
        self._validate_identifier(identifier, "SQL")
        return f'"{identifier}"'

    def _qualified_table(self, table_name: str) -> str:
        return f"{self._quoted(self.source.schema_name)}.{self._quoted(table_name)}"

    def source_internal_experiment_id(self, display_experiment_id: str) -> str:
        return f"src_{self.source.id}::{display_experiment_id}"

    def source_display_experiment_id(self, internal_experiment_id: str) -> str:
        return internal_experiment_id.split("::", 1)[1] if "::" in internal_experiment_id else internal_experiment_id


def register_adapter(source_type: str, factory: AdapterFactory) -> None:
    ADAPTER_FACTORIES[source_type] = factory


def warehouse_adapter_for(source: DataSource) -> WarehouseAdapter:
    factory = ADAPTER_FACTORIES.get(source.source_type)
    if factory is None:
        raise HTTPException(status_code=400, detail=f"Unsupported source type: {source.source_type}")
    return factory(source)


register_adapter("postgresql", PostgresWarehouseAdapter)
