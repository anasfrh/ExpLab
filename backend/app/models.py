from sqlalchemy import Column, Float, Index, Integer, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    can_simulate = Column(Integer, nullable=False, default=0)
    can_edit_metrics = Column(Integer, nullable=False, default=0)

class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = (
        Index("ix_experiments_experiment_user", "experiment_id", "user_id"),
        Index("ix_experiments_experiment_timestamp", "experiment_id", "timestamp"),
    )
    
    user_id = Column(String, nullable=False, index=True)
    experiment_id = Column(String, nullable=False, index=True)
    source_name = Column(String, nullable=False, default="Built-in Sample", index=True)
    display_experiment_id = Column(String, nullable=False, default="")
    variation_id = Column(String, nullable=False)
    timestamp = Column(String, nullable=False)
    
    # Needs a dummy primary key since SQLAlchemy requires one
    __mapper_args__ = {
        "primary_key": [user_id, experiment_id, variation_id, timestamp]
    }

class ConversionEvent(Base):
    __tablename__ = "conversion_events"
    __table_args__ = (
        Index("ix_conversion_events_user_event_timestamp", "user_id", "event_name", "timestamp"),
    )
    
    user_id = Column(String, nullable=False, index=True)
    event_name = Column(String, nullable=False)
    timestamp = Column(String, nullable=False)
    
    __mapper_args__ = {
        "primary_key": [user_id, event_name, timestamp]
    }

class Dimension(Base):
    __tablename__ = "dimensions"
    
    user_id = Column(String, nullable=False, index=True)
    country_code = Column(String, nullable=False)
    mcc = Column(String, nullable=False)
    os = Column(String, nullable=False)
    
    __mapper_args__ = {
        "primary_key": [user_id]
    }

class Metric(Base):
    __tablename__ = "metrics"
    __table_args__ = (
        Index("ix_metrics_user_date", "user_id", "date"),
        Index("ix_metrics_user_metric_date", "user_id", "metric_name", "date"),
    )
    
    user_id = Column(String, nullable=False)
    metric_name = Column(String, nullable=False)
    value = Column(Float, nullable=False)
    date = Column(String, nullable=False)
    
    __mapper_args__ = {
        "primary_key": [user_id, metric_name, date]
    }

class MetricDefinition(Base):
    __tablename__ = "metric_definitions"
    
    metric_id = Column(String, primary_key=True)
    label = Column(String, nullable=False)
    source_type = Column(String, nullable=False)
    source_name = Column(String, nullable=False)
    sql_expression = Column(String, nullable=False)
    value_format = Column(String, nullable=False)
    default_window_days = Column(Integer, nullable=False)
    default_winsorize_percentile = Column(Float, nullable=False)
    supports_winsorization = Column(Integer, nullable=False, default=1)
    desired_direction = Column(String, nullable=False, default='up')

class ConversionEventSetting(Base):
    __tablename__ = "conversion_event_settings"
    
    event_name = Column(String, primary_key=True)
    default_window_days = Column(Integer, nullable=False)

class ExperimentMetricOverride(Base):
    __tablename__ = "experiment_metric_overrides"
    
    experiment_id = Column(String, primary_key=True)
    metric_id = Column(String, primary_key=True)
    window_days = Column(Integer, nullable=False)
    winsorize_percentile = Column(Float, nullable=False)


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False, index=True)
    source_type = Column(String, nullable=False, default="postgresql")
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False, default=5432)
    database_name = Column(String, nullable=False)
    username = Column(String, nullable=False)
    password = Column(String, nullable=False)
    schema_name = Column(String, nullable=False, default="public")
    experiments_table = Column(String, nullable=False, default="experiments")
    metrics_table = Column(String, nullable=False, default="metrics")
    conversion_events_table = Column(String, nullable=False, default="conversion_events")
    dimensions_table = Column(String, nullable=False, default="dimensions")
    status = Column(String, nullable=False, default="pending")
    last_synced_at = Column(String, nullable=True)
    last_error = Column(String, nullable=True)
    imported_experiment_count = Column(Integer, nullable=False, default=0)
    imported_user_count = Column(Integer, nullable=False, default=0)
