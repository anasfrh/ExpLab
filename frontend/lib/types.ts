export type ExperimentSummary = {
  experiment_id: string;
  display_experiment_id: string;
  source_name: string;
  users: number;
  start_date: string;
  latest_metric_date: string | null;
  variant_count: number;
};

export type DataSourceSummary = {
  id: string;
  name: string;
  source_type: "postgresql";
  host: string;
  port: number;
  database_name: string;
  username: string;
  schema_name: string;
  experiments_table: string;
  metrics_table: string;
  conversion_events_table: string;
  dimensions_table: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
  imported_experiment_count: number;
  imported_user_count: number;
  password_configured: boolean;
};

export type AnalysisThresholdSettings = {
  minimum_users_per_leg: number;
  minimum_conversions_per_leg: number;
  has_experiment_override: boolean;
};

export type MetricCatalogItem = {
  metric_id: string;
  label: string;
  source_name: string;
  value_format: "number" | "currency" | "percent";
  default_window_days: number;
  default_winsorize_percentile: number;
  desired_direction: "up" | "down";
  sql_query?: string;
};

export type ExperimentMetric = {
  id: string;
  label: string;
  sql_expression: string;
  value_format: "number" | "currency" | "percent";
  source_type: "metric" | "conversion_event";
  source_name: string;
  default_window_days: number;
  default_winsorize_percentile: number;
  supports_winsorization: boolean;
  has_experiment_override: boolean;
};

export type ConversionEventItem = {
  event_name: string;
  default_window_days: number;
  usage_count: number;
  sql_query: string;
};

export type DimensionItem = {
  dimension_name: string;
  distinct_values: number;
  sql_query: string;
};

export type MetricRow = {
  metric_id: string;
  metric_label: string;
  value_format: "number" | "currency" | "percent";
  control_mean: number;
  treatment_mean: number;
  relative_lift: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  adjusted_p_value: number;
  control_users: number;
  treatment_users: number;
  winsorized_threshold: number;
  variation_values: {
    [variation: string]: number;
  };
  variation_stats: {
    [variation: string]: {
      user_count: number;
      conversion_count: number | null;
      non_zero_user_count: number;
      average_value: number;
      total_value: number;
    };
  };
  time_series: Array<{
    date: string;
    variation_values: {
      [variation: string]: number;
    };
    comparisons?: Array<{
      baseline_variant: string;
      variant: string;
      relative_lift: number;
      ci_low: number | null;
      ci_high: number | null;
      p_value: number | null;
      adjusted_p_value: number | null;
      has_sufficient_data: boolean;
      insufficient_data_reasons: string[];
    }>;
  }>;
  dimension_name: string | null;
  dimension_value?: string;
  source_type: "metric" | "conversion_event";
  source_name: string;
  analysis_sql: string;
  window_days: number;
  winsorize_percentile: number | null;
  supports_winsorization: boolean;
  has_experiment_override: boolean;
  desired_direction: "up" | "down";
  baseline_variant: string;
  comparisons: Array<{
    baseline_variant: string;
    variant: string;
    relative_lift: number;
    ci_low: number | null;
    ci_high: number | null;
    p_value: number | null;
    adjusted_p_value: number | null;
    has_sufficient_data: boolean;
    insufficient_data_reasons: string[];
  }>;
  primary_comparison: {
    baseline_variant: string;
    variant: string;
    relative_lift: number;
    ci_low: number | null;
    ci_high: number | null;
    p_value: number | null;
    adjusted_p_value: number | null;
    has_sufficient_data: boolean;
    insufficient_data_reasons: string[];
  } | null;
  multiple_testing_correction_applied: boolean;
  category: "primary" | "secondary" | "guardrail";
  analysis_thresholds: AnalysisThresholdSettings;
};

export type AnalyzeResponse = {
  metric_rows: MetricRow[];
  srm: {
    counts: Record<string, number>;
    p_value: number;
    critical: boolean;
  };
  dimension_balance: Array<{
    dimension: string;
    p_value: number;
    balanced: boolean;
    buckets: Record<string, Record<string, number>>;
  }>;
  variations: string[];
  total_users: number;
  analysis_thresholds: AnalysisThresholdSettings;
  multiple_testing_correction_applied: boolean;
  multiple_testing_method: "bonferroni" | "benjamini-hochberg";
  split_dimension: string | null;
  has_multiple_exposures: boolean;
  multiple_exposures_count: number;
};

export type SampleSizeResponse = {
  required_per_variation: number;
  total_required_sample: number;
  absolute_delta: number;
};

export type PowerCalculatorResponse = {
  metric_type: "conversion" | "continuous";
  variant_count: number;
  required_per_variation: number;
  total_required_sample: number;
  absolute_delta: number;
  expected_treatment_value: number;
};
