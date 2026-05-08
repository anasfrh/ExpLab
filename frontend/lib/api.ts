import {
  AnalyzeResponse,
  ConversionEventItem,
  DataSourceSummary,
  DimensionItem,
  ExperimentMetric,
  ExperimentSummary,
  MetricCatalogItem,
  PowerCalculatorResponse,
  SampleSizeResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, payload?: object, method?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("explab_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: method ?? (payload ? "POST" : "GET"),
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function listExperiments() {
  return request<{ experiments: ExperimentSummary[] }>("/experiments");
}

export function listMetrics() {
  return request<{ metrics: MetricCatalogItem[] }>("/metrics");
}

export function updateMetricDefaults(metricId: string, payload: { default_window_days: number; default_winsorize_percentile: number; desired_direction?: string }) {
  return request<{ message: string }>(`/metrics/${metricId}`, payload, "PUT");
}

export function listDimensions() {
  return request<{ dimensions: DimensionItem[] }>("/dimensions");
}

export function listConversionEvents() {
  return request<{ conversion_events: ConversionEventItem[] }>("/conversion-events");
}

export function updateConversionEventDefaults(eventName: string, payload: { default_window_days: number }) {
  return request<{ message: string }>(`/conversion-events/${eventName}`, payload, "PUT");
}

export function listExperimentMetrics(experimentId: string, sourceName?: string) {
  const query = sourceName ? `?source_name=${encodeURIComponent(sourceName)}` : "";
  return request<{ metrics: ExperimentMetric[] }>(`/experiments/${encodeURIComponent(experimentId)}/metrics${query}`);
}

export function updateExperimentMetricOverride(
  experimentId: string,
  metricId: string,
  payload: { window_days: number; winsorize_percentile?: number },
) {
  return request<{ message: string }>(
    `/experiments/${encodeURIComponent(experimentId)}/metrics/${encodeURIComponent(metricId)}/override`,
    payload,
    "PUT",
  );
}

export function simulate(payload: {
  num_users: number;
  target_lift: number;
  srm_skew: boolean;
  experiment_id: string;
  metric_name: string;
  conversion_event_name: string;
}) {
  return request<{ message: string; summary: Record<string, string | number | boolean> }>("/simulate", payload);
}

export function seedDemoPortfolio() {
  return request<{ message: string; experiments: Record<string, string | number | boolean>[] }>("/seed-demo", {}, "POST");
}

export function analyze(payload: {
  experiment_id: string;
  source_name?: string;
  primary_metric_ids: string[];
  secondary_metric_ids: string[];
  guardrail_metric_ids: string[];
  split_dimension?: string;
  multiple_testing_method?: "bonferroni" | "benjamini-hochberg";
}) {
  return request<AnalyzeResponse>("/analyze", payload);
}

export function advanceDay(payload: {
  experiment_id: string;
  source_name?: string;
  metric_name: string;
  conversion_event_name: string;
  target_lift: number;
}) {
  return request<{ message: string; result: { date: string; metric_rows: number; conversion_events: number } }>(
    "/advance-day",
    payload,
  );
}

export function calculateSampleSize(payload: {
  baseline_mean: number;
  baseline_stddev: number;
  mde: number;
  alpha: number;
  power: number;
}) {
  return request<SampleSizeResponse>("/sample-size", payload);
}

export function calculatePower(payload: {
  metric_type: "conversion" | "continuous";
  variant_count: number;
  baseline_rate?: number;
  baseline_mean?: number;
  baseline_stddev?: number;
  mde: number;
  alpha: number;
  power: number;
}) {
  return request<PowerCalculatorResponse>("/power-calculator", payload);
}

export function getSetupStatus() {
  return request<{ needs_setup: boolean }>("/auth/setup-status");
}

export function setupAdmin(payload: any) {
  return request<{ message: string }>("/auth/setup", payload);
}

export function login(email: string, password: string) {
  const formBody = new URLSearchParams();
  formBody.set("username", email);
  formBody.set("password", password);

  return fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ access_token: string }>;
  });
}

export function getMe() {
  return request<{ id: string; email: string; role: string; can_simulate: boolean; can_edit_metrics: boolean }>("/auth/me");
}

export function updateMyPassword(payload: { current_password: string; new_password: string }) {
  return request<{ message: string }>("/auth/me/password", payload, "PUT");
}

export function getUsers() {
  return request<any[]>("/users");
}

export function createUser(payload: any) {
  return request<{ message: string }>("/users", payload);
}

export function updateUser(userId: string, payload: any) {
  return request<{ message: string }>(`/users/${userId}`, payload, "PUT");
}

export function resetUserPassword(userId: string, payload: any) {
  return request<{ message: string }>(`/users/${userId}/password`, payload, "PUT");
}

export function deleteUser(userId: string) {
  return request<{ message: string }>(`/users/${userId}`, undefined, "DELETE");
}

export function listDataSources() {
  return request<DataSourceSummary[]>("/data-sources");
}

export function createDataSource(payload: {
  name: string;
  source_type: "postgresql";
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  schema_name: string;
  experiments_table: string;
  metrics_table: string;
  conversion_events_table: string;
  dimensions_table: string;
}) {
  return request<{ source: DataSourceSummary }>(
    "/data-sources",
    payload,
    "POST",
  );
}

export function testDataSourceConnection(payload: {
  name: string;
  source_type: "postgresql";
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  schema_name: string;
  experiments_table: string;
  metrics_table: string;
  conversion_events_table: string;
  dimensions_table: string;
}) {
  return request<{ message: string }>("/data-sources/test-connection", payload, "POST");
}

export function syncDataSource(sourceId: string) {
  return request<{ source: DataSourceSummary; sync_summary: { imported_experiment_count: number; imported_user_count: number; source_name: string } }>(
    `/data-sources/${encodeURIComponent(sourceId)}/sync`,
    {},
    "POST",
  );
}
