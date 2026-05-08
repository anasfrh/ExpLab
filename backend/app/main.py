from __future__ import annotations

from fastapi import FastAPI, Depends, APIRouter
from fastapi import HTTPException, Query
from typing import Any
from fastapi.middleware.cors import CORSMiddleware

from .database import LOCAL_SOURCE_NAME, clear_source_data
from .schemas import (
    AdvanceDayRequest,
    AnalyzeRequest,
    ConversionEventUpdateRequest,
    MetricCatalogUpdateRequest,
    MetricOverrideRequest,
    PowerCalculatorRequest,
    SampleSizeRequest,
    SimulationRequest,
)
from .simulator import Simulator
from .stats_engine import StatsEngine
from .auth import get_current_user, check_can_simulate, check_can_edit_metrics
from .database import SessionLocal
from .models import DataSource
from .routers.data_sources import router as data_sources_router
from .routers.users import router as users_router


app = FastAPI(title="Warehouse Native Experimentation API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = Simulator()
app.include_router(users_router)
app.include_router(data_sources_router)


def resolve_data_source(source_name: str | None) -> DataSource | None:
    if not source_name or source_name == LOCAL_SOURCE_NAME:
        return None
    with SessionLocal() as session:
        source = session.query(DataSource).filter(DataSource.name == source_name).first()
    if source is None:
        raise HTTPException(status_code=404, detail=f"Unknown data source: {source_name}")
    return source


@app.on_event("startup")
def startup() -> None:
    from .database import init_db
    init_db()
    simulator.ensure_demo_portfolio()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/simulate")
def simulate(request: SimulationRequest, current_user: dict[str, Any] = Depends(check_can_simulate)) -> dict[str, object]:
    clear_source_data(source_name=LOCAL_SOURCE_NAME)
    summary = simulator.seed_experiment(
        num_users=request.num_users,
        target_lift=request.target_lift,
        srm_skew=request.srm_skew,
        experiment_id=request.experiment_id,
        metric_name=request.metric_name,
        conversion_event_name=request.conversion_event_name,
    )
    return {"message": "Simulation complete", "summary": summary.__dict__}


@app.post("/seed-demo")
def seed_demo(current_user: dict[str, Any] = Depends(check_can_simulate)) -> dict[str, object]:
    summaries = simulator.reset_demo_portfolio()
    return {"message": "Demo portfolio seeded", "experiments": [summary.__dict__ for summary in summaries]}


@app.get("/experiments")
def list_experiments(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, object]:
    engine = StatsEngine()
    return {"experiments": engine.list_experiments()}


@app.get("/metrics")
def list_metrics(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, object]:
    engine = StatsEngine()
    return {"metrics": engine.list_metrics()}


@app.put("/metrics/{metric_id}")
def update_metric(metric_id: str, request: MetricCatalogUpdateRequest, current_user: dict[str, Any] = Depends(check_can_edit_metrics)) -> dict[str, str]:
    engine = StatsEngine()
    engine.update_metric_defaults(
        metric_id=metric_id,
        window_days=request.default_window_days,
        winsorize_percentile=request.default_winsorize_percentile,
    )
    return {"message": "Metric defaults updated"}


@app.get("/dimensions")
def list_dimensions(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, object]:
    engine = StatsEngine()
    return {"dimensions": engine.list_dimensions()}


@app.get("/conversion-events")
def list_conversion_events(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, object]:
    engine = StatsEngine()
    return {"conversion_events": engine.list_conversion_events()}


@app.put("/conversion-events/{event_name}")
def update_conversion_event(event_name: str, request: ConversionEventUpdateRequest, current_user: dict[str, Any] = Depends(check_can_edit_metrics)) -> dict[str, str]:
    engine = StatsEngine()
    engine.update_conversion_event_defaults(event_name=event_name, window_days=request.default_window_days)
    return {"message": "Conversion event defaults updated"}


@app.get("/experiments/{experiment_id}/metrics")
def experiment_metrics(
    experiment_id: str,
    source_name: str | None = Query(default=None),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, object]:
    source = resolve_data_source(source_name)
    engine = StatsEngine(source=source)
    try:
        return {"metrics": engine.available_experiment_metrics(experiment_id=experiment_id)}
    finally:
        engine.close()


@app.put("/experiments/{experiment_id}/metrics/{metric_id}/override")
def update_experiment_metric_override(
    experiment_id: str,
    metric_id: str,
    request: MetricOverrideRequest,
    current_user: dict[str, Any] = Depends(check_can_edit_metrics)
) -> dict[str, str]:
    engine = StatsEngine()
    engine.upsert_experiment_override(
        experiment_id=experiment_id,
        metric_id=metric_id,
        window_days=request.window_days,
        winsorize_percentile=request.winsorize_percentile,
    )
    return {"message": "Experiment override updated"}


@app.post("/advance-day")
def advance_day(request: AdvanceDayRequest, current_user: dict[str, Any] = Depends(check_can_simulate)) -> dict[str, object]:
    if request.source_name and request.source_name != LOCAL_SOURCE_NAME:
        raise HTTPException(status_code=400, detail="Advance day is only available for the built-in sample source.")
    result = simulator.advance_day(
        experiment_id=request.experiment_id,
        metric_name=request.metric_name,
        conversion_event_name=request.conversion_event_name,
        target_lift=request.target_lift,
    )
    return {"message": "Advanced simulation by one day", "result": result}


@app.post("/analyze")
def analyze(request: AnalyzeRequest, current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, object]:
    source = resolve_data_source(request.source_name)
    engine = StatsEngine(source=source)
    try:
        result = engine.analyze_experiment(
            experiment_id=request.experiment_id,
            primary_metric_ids=request.primary_metric_ids,
            secondary_metric_ids=request.secondary_metric_ids,
            guardrail_metric_ids=request.guardrail_metric_ids,
            split_dimension=request.split_dimension,
            multiple_testing_method=request.multiple_testing_method,
        )
        return result
    finally:
        engine.close()


@app.post("/sample-size")
def sample_size(request: SampleSizeRequest) -> dict[str, float]:
    engine = StatsEngine()
    return engine.sample_size(
        baseline_mean=request.baseline_mean,
        baseline_stddev=request.baseline_stddev,
        mde=request.mde,
        alpha=request.alpha,
        power=request.power,
    )


@app.post("/power-calculator")
def power_calculator(request: PowerCalculatorRequest) -> dict[str, float | str]:
    engine = StatsEngine()
    return engine.power_calculator(
        metric_type=request.metric_type,
        variant_count=request.variant_count,
        baseline_rate=request.baseline_rate,
        baseline_mean=request.baseline_mean,
        baseline_stddev=request.baseline_stddev,
        mde=request.mde,
        alpha=request.alpha,
        power=request.power,
    )
