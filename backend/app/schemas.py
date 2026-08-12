from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DimensionName = str


class SimulationRequest(BaseModel):
    num_users: int = Field(default=500, ge=100, le=2000)
    days: int = Field(default=5, ge=1, le=7)
    target_lift: float = Field(default=0.08, ge=-0.95, le=10.0)
    srm_skew: bool = False
    experiment_id: str = "exp_revenue_v1"
    metric_name: str = "revenue"
    conversion_event_name: str = "purchase"


class AnalyzeRequest(BaseModel):
    experiment_id: str = "exp_revenue_v1"
    primary_metric_ids: list[str] = Field(default_factory=lambda: ["revenue"])
    secondary_metric_ids: list[str] = Field(default_factory=lambda: ["orders", "conversion_purchase"])
    guardrail_metric_ids: list[str] = Field(default_factory=list)
    split_dimension: DimensionName | None = None
    multiple_testing_method: Literal["bonferroni", "benjamini-hochberg"] = "benjamini-hochberg"
    include_time_series: bool = False
    source_name: str | None = None


class MetricDefinition(BaseModel):
    id: str
    label: str
    sql_expression: str
    value_format: Literal["number", "currency", "percent"] = "number"
    source_type: Literal["metric", "conversion_event"] = "metric"
    source_name: str
    default_window_days: int = Field(default=14, ge=1, le=30)
    default_winsorize_percentile: float = Field(default=99.0, ge=50.0, le=100.0)
    supports_winsorization: bool = True
    has_experiment_override: bool = False
    desired_direction: Literal["up", "down"] = "up"


class MetricOverrideRequest(BaseModel):
    window_days: int = Field(ge=1, le=30)
    winsorize_percentile: float | None = Field(default=None, ge=50.0, le=100.0)


class MetricCatalogUpdateRequest(BaseModel):
    default_window_days: int = Field(ge=1, le=30)
    default_winsorize_percentile: float = Field(default=99.0, ge=50.0, le=100.0)
    desired_direction: Literal["up", "down"] = "up"


class ConversionEventUpdateRequest(BaseModel):
    default_window_days: int = Field(ge=1, le=30)


class AnalysisThresholdSettings(BaseModel):
    minimum_users_per_leg: int = Field(default=100, ge=1, le=1_000_000)
    minimum_conversions_per_leg: int = Field(default=25, ge=0, le=1_000_000)
    has_experiment_override: bool = False


class AnalysisThresholdUpdateRequest(BaseModel):
    minimum_users_per_leg: int = Field(ge=1, le=1_000_000)
    minimum_conversions_per_leg: int = Field(ge=0, le=1_000_000)


class ExperimentAnalysisThresholdOverrideRequest(BaseModel):
    minimum_users_per_leg: int | None = Field(default=None, ge=1, le=1_000_000)
    minimum_conversions_per_leg: int | None = Field(default=None, ge=0, le=1_000_000)


class AdvanceDayRequest(BaseModel):
    experiment_id: str = "exp_revenue_v1"
    metric_name: str = "revenue"
    conversion_event_name: str = "purchase"
    target_lift: float = Field(default=0.08, ge=-0.95, le=10.0)
    source_name: str | None = None


class SampleSizeRequest(BaseModel):
    baseline_mean: float = Field(default=25.0, gt=0.0)
    baseline_stddev: float = Field(default=30.0, gt=0.0)
    mde: float = Field(default=0.05, gt=0.0, lt=1.0)
    alpha: float = Field(default=0.05, gt=0.0, lt=1.0)
    power: float = Field(default=0.80, gt=0.0, lt=1.0)


class PowerCalculatorRequest(BaseModel):
    metric_type: Literal["conversion", "continuous"] = "conversion"
    variant_count: int = Field(default=2, ge=2, le=20)
    baseline_rate: float | None = Field(default=0.1, gt=0.0, lt=1.0)
    baseline_mean: float | None = Field(default=25.0, gt=0.0)
    baseline_stddev: float | None = Field(default=30.0, gt=0.0)
    mde: float = Field(default=0.05, gt=0.0, lt=1.0)
    alpha: float = Field(default=0.05, gt=0.0, lt=1.0)
    power: float = Field(default=0.80, gt=0.0, lt=1.0)


class DataSourceCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    source_type: Literal["postgresql"] = "postgresql"
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database_name: str = Field(min_length=1, max_length=255)
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=255)
    schema_name: str = Field(default="public", min_length=1, max_length=255)
    experiments_table: str = Field(default="experiments", min_length=1, max_length=255)
    metrics_table: str = Field(default="metrics", min_length=1, max_length=255)
    conversion_events_table: str = Field(default="conversion_events", min_length=1, max_length=255)
    dimensions_table: str = Field(default="dimensions", min_length=1, max_length=255)
