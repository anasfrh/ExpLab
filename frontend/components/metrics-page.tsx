"use client";

import { useEffect, useState, useTransition } from "react";

import { listMetrics, updateMetricDefaults } from "../lib/api";
import { MetricCatalogItem } from "../lib/types";

export function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricCatalogItem[]>([]);
  const [status, setStatus] = useState("Loading metrics...");
  const [showSql, setShowSql] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      try {
        const response = await listMetrics();
        setMetrics(response.metrics);
        setStatus("Metrics loaded.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load metrics.");
      }
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const updateMetric = (metricId: string, window: number, winsor: number, direction: "up" | "down") => {
    startTransition(async () => {
      try {
        await updateMetricDefaults(metricId, {
          default_window_days: window,
          default_winsorize_percentile: winsor,
          desired_direction: direction,
        });
        refresh();
        setStatus("Metric defaults updated.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Update failed.");
      }
    });
  };

  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Catalog</div>
          <h1>Metrics</h1>
        </div>
      </header>

      <section className="headline-grid">
        <div className="headline-panel">
          <div className="section-tag">Defaults</div>
          <h2>Metric definitions with shared windows, winsorization defaults, and transparent SQL.</h2>
          <p>
            These defaults apply everywhere a metric is used unless an individual experiment overrides them directly in
            the results view.
          </p>
          <div className="summary-note">
            Metric-level defaults control batch windows and outlier capping. Experiment-level overrides should stay the
            exception, not the rule.
          </div>
        </div>
        <div className="headline-panel">
          <div className="section-tag">Status</div>
          <div className="status-panel">
            <p>{status}</p>
            <div className="headline-actions">
              <button className="button button-primary" disabled={isPending} onClick={refresh}>
                Refresh catalog
              </button>
              <button className="button button-secondary" onClick={() => setShowSql((current) => !current)}>
                {showSql ? "Hide SQL" : "View SQL"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="section-tag">Registry</div>
            <h3>Available Metrics</h3>
          </div>
          <div className="panel-caption">Default settings apply across the platform unless an experiment overrides them.</div>
        </div>
        {showSql && metrics[0] ? (
          <div className="sql-panel">
            <div className="sql-panel-header">
              <span className="section-tag">Source Query</span>
              <span className="table-secondary">Representative pull for the metric catalog</span>
            </div>
            <pre className="sql-block">{metrics[0].sql_query}</pre>
          </div>
        ) : null}
        <div className="settings-list">
          {metrics.map((metric) => (
            <MetricSettingsRow key={metric.metric_id} metric={metric} onSave={updateMetric} pending={isPending} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricSettingsRow({
  metric,
  onSave,
  pending,
}: {
  metric: MetricCatalogItem;
  onSave: (metricId: string, window: number, winsor: number, direction: "up" | "down") => void;
  pending: boolean;
}) {
  const [window, setWindow] = useState(metric.default_window_days);
  const [winsor, setWinsor] = useState(metric.default_winsorize_percentile);
  const [direction, setDirection] = useState<"up" | "down">(metric.desired_direction);

  useEffect(() => {
    setWindow(metric.default_window_days);
    setWinsor(metric.default_winsorize_percentile);
    setDirection(metric.desired_direction);
  }, [metric.default_window_days, metric.default_winsorize_percentile, metric.desired_direction]);

  return (
    <div className="settings-row">
      <div className="settings-copy">
        <div className="table-primary">{metric.label}</div>
        <div className="table-secondary">{metric.metric_id}</div>
        <div className="row-flags">
          <span className="mini-badge mini-badge-neutral">{window}d default window</span>
          <span className="mini-badge mini-badge-neutral">P{winsor} winsorization</span>
        </div>
      </div>
      <div className="settings-controls">
        <label>
          Window
          <input type="number" min={1} max={30} value={window} onChange={(e) => setWindow(Number(e.target.value))} />
        </label>
        <label>
          Winsor
          <input type="number" min={50} max={100} value={winsor} onChange={(e) => setWinsor(Number(e.target.value))} />
        </label>
        <label>
          Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as "up" | "down")}>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </label>
        <button className="button button-primary" disabled={pending} onClick={() => onSave(metric.metric_id, window, winsor, direction)}>
          Save
        </button>
      </div>
    </div>
  );
}
