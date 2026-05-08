from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_admin
from ..database import get_db
from ..models import DataSource
from ..schemas import DataSourceCreateRequest
from ..source_sync import sync_postgres_source, test_postgres_connection

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


@router.get("")
def list_data_sources(admin: dict[str, Any] = Depends(get_current_admin), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    sources = db.scalars(select(DataSource).order_by(DataSource.name)).all()
    return [_serialize_source(source) for source in sources]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_data_source(
    request: DataSourceCreateRequest,
    admin: dict[str, Any] = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    existing = db.scalar(select(DataSource).where(DataSource.name == request.name))
    if existing:
        raise HTTPException(status_code=409, detail=f"A source named '{request.name}' already exists.")

    source = DataSource(
        id=str(uuid.uuid4()),
        name=request.name,
        source_type=request.source_type,
        host=request.host,
        port=request.port,
        database_name=request.database_name,
        username=request.username,
        password=request.password,
        schema_name=request.schema_name,
        experiments_table=request.experiments_table,
        metrics_table=request.metrics_table,
        conversion_events_table=request.conversion_events_table,
        dimensions_table=request.dimensions_table,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return {"source": _serialize_source(source)}


@router.post("/test-connection")
def test_data_source_connection(
    request: DataSourceCreateRequest,
    admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, str]:
    source_like = type("SourceLike", (), request.model_dump())()
    return test_postgres_connection(source_like)


@router.post("/{source_id}/sync")
def sync_data_source(
    source_id: str,
    admin: dict[str, Any] = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    source = db.get(DataSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Data source not found.")

    sync_summary = sync_postgres_source(source, db)
    db.refresh(source)
    return {"source": _serialize_source(source), "sync_summary": sync_summary}


def _serialize_source(source: DataSource) -> dict[str, Any]:
    return {
        "id": source.id,
        "name": source.name,
        "source_type": source.source_type,
        "host": source.host,
        "port": source.port,
        "database_name": source.database_name,
        "username": source.username,
        "schema_name": source.schema_name,
        "experiments_table": source.experiments_table,
        "metrics_table": source.metrics_table,
        "conversion_events_table": source.conversion_events_table,
        "dimensions_table": source.dimensions_table,
        "status": source.status,
        "last_synced_at": source.last_synced_at,
        "last_error": source.last_error,
        "imported_experiment_count": source.imported_experiment_count,
        "imported_user_count": source.imported_user_count,
        "password_configured": bool(source.password),
    }
