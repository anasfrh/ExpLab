from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import DataSource
from .warehouse_adapters import warehouse_adapter_for


def sync_postgres_source(source: DataSource, db: Session) -> dict[str, int | str]:
    adapter = warehouse_adapter_for(source)
    try:
        adapter.validate_schema()
        experiments = adapter.list_experiments()
        experiment_count = len(experiments)
        user_count = sum(int(item["users"]) for item in experiments)
        source.status = "ready"
        source.last_error = None
        source.last_synced_at = datetime.now(UTC).isoformat()
        source.imported_experiment_count = int(experiment_count)
        source.imported_user_count = int(user_count)
        db.add(source)
        db.commit()
        return {
            "imported_experiment_count": int(experiment_count),
            "imported_user_count": int(user_count),
            "source_name": source.name,
        }
    except HTTPException as exc:
        source.status = "error"
        source.last_error = str(exc.detail)
        db.add(source)
        db.commit()
        raise
    except Exception as exc:
        source.status = "error"
        source.last_error = str(exc)
        db.add(source)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Failed to inspect source '{source.name}': {exc}") from exc
    finally:
        if hasattr(adapter, "close"):
            adapter.close()


def test_postgres_connection(source_like: DataSource | Any) -> dict[str, str]:
    adapter = warehouse_adapter_for(source_like)
    try:
        return adapter.test_connection()
    finally:
        if hasattr(adapter, "close"):
            adapter.close()
