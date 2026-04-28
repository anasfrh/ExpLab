"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  advanceDay,
  analyze,
  calculateSampleSize,
  listExperimentMetrics,
  updateExperimentMetricOverride,
} from "../lib/api";
import { AnalyzeResponse, ExperimentMetric, SampleSizeResponse } from "../lib/types";

function formatValue(value: number, format: ExperimentMetric["value_format"]) {
  if (format === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }

  if (format === "currency") {
    return Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }

  return Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatPValue(value: number) {
  return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}

function formatCount(value: number) {
  return Intl.NumberFormat("en-US").format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getVariationLabel(variation: string, variations: string[]) {
  const index = variations.indexOf(variation);
  if (index <= 0) {
    return "Control";
  }
  return `Treatment ${index}`;
}

export function ExperimentView({ experimentId }: { experimentId: string }) {
  const [availableMetrics, setAvailableMetrics] = useState<ExperimentMetric[]>([]);
  const [primaryMetricIds, setPrimaryMetricIds] = useState<string[]>([]);
  const [secondaryMetricIds, setSecondaryMetricIds] = useState<string[]>([]);
  const [guardrailMetricIds, setGuardrailMetricIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [sampleSize, setSampleSize] = useState<SampleSizeResponse | null>(null);
  const [status, setStatus] = useState("Loading experiment analysis...");
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [sqlMetricId, setSqlMetricId] = useState<string | null>(null);
  const [resultsView, setResultsView] = useState<"table" | "timeseries">("table");
  const [showExperimentChecks, setShowExperimentChecks] = useState(false);
  const [splitDimension, setSplitDimension] = useState<"none" | "country_code" | "mcc">("none");
  const [multipleTestingMethod, setMultipleTestingMethod] = useState<"bonferroni" | "benjamini-hochberg">("benjamini-hochberg");
  const [selectedTreatment, setSelectedTreatment] = useState<string>("");
  const [overrideWindow, setOverrideWindow] = useState(14);
  const [overrideWinsor, setOverrideWinsor] = useState(99);
  const [isPending, startTransition] = useTransition();
  const currentEditingMetric = availableMetrics.find((metric) => metric.id === editingMetricId) ?? null;
  const variations = analysis?.variations ?? [];
  const baselineVariant = variations[0] ?? "Variant 1";
  const treatmentVariants = variations.slice(1);
  const activeTreatment = treatmentVariants.includes(selectedTreatment) ? selectedTreatment : treatmentVariants[0] ?? "";

  useEffect(() => {
    if (!activeTreatment && selectedTreatment !== "") {
      setSelectedTreatment("");
      return;
    }
    if (activeTreatment !== selectedTreatment) {
      setSelectedTreatment(activeTreatment);
    }
  }, [activeTreatment, selectedTreatment]);

  const refreshAll = (primary: string[], secondary: string[], guardrail: string[]) => {
    startTransition(async () => {
      try {
        setStatus("Refreshing experiment results...");
        const [catalog, analysisResponse, sampleResponse] = await Promise.all([
          listExperimentMetrics(experimentId),
          analyze({
            experiment_id: experimentId,
            primary_metric_ids: primary,
            secondary_metric_ids: secondary,
            guardrail_metric_ids: guardrail,
            split_dimension: splitDimension === "none" ? undefined : splitDimension,
            multiple_testing_method: multipleTestingMethod,
          }),
          calculateSampleSize({
            baseline_mean: 25,
            baseline_stddev: 30,
            mde: 0.05,
            alpha: 0.05,
            power: 0.8,
          }),
        ]);
        setAvailableMetrics(catalog.metrics);
        setAnalysis(analysisResponse);
        setSampleSize(sampleResponse);
        setStatus("Experiment results are up to date.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Analysis failed.");
      }
    });
  };

  useEffect(() => {
    startTransition(async () => {
      try {
        const catalog = await listExperimentMetrics(experimentId);
        setAvailableMetrics(catalog.metrics);
        const primary = catalog.metrics.length > 0 ? [catalog.metrics[0].id] : [];
        const secondary = catalog.metrics.length > 1 ? catalog.metrics.slice(1, 3).map((m) => m.id) : [];
        const guardrail: string[] = [];
        setPrimaryMetricIds(primary);
        setSecondaryMetricIds(secondary);
        setGuardrailMetricIds(guardrail);
        refreshAll(primary, secondary, guardrail);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load experiment metrics.");
      }
    });
  }, [experimentId]);

  useEffect(() => {
    if (primaryMetricIds.length > 0 || secondaryMetricIds.length > 0 || guardrailMetricIds.length > 0) {
      refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
    }
  }, [splitDimension]);

  useEffect(() => {
    if (primaryMetricIds.length > 0 || secondaryMetricIds.length > 0 || guardrailMetricIds.length > 0) {
      refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
    }
  }, [multipleTestingMethod]);

  const addMetricRow = (metricId: string, category: "primary" | "secondary" | "guardrail") => {
    if ([...primaryMetricIds, ...secondaryMetricIds, ...guardrailMetricIds].includes(metricId)) return;
    const nextPrimary = category === "primary" ? [...primaryMetricIds, metricId] : primaryMetricIds;
    const nextSecondary = category === "secondary" ? [...secondaryMetricIds, metricId] : secondaryMetricIds;
    const nextGuardrail = category === "guardrail" ? [...guardrailMetricIds, metricId] : guardrailMetricIds;
    setPrimaryMetricIds(nextPrimary);
    setSecondaryMetricIds(nextSecondary);
    setGuardrailMetricIds(nextGuardrail);
    refreshAll(nextPrimary, nextSecondary, nextGuardrail);
  };

  const removeMetric = (metricId: string) => {
    const nextPrimary = primaryMetricIds.filter((id) => id !== metricId);
    const nextSecondary = secondaryMetricIds.filter((id) => id !== metricId);
    const nextGuardrail = guardrailMetricIds.filter((id) => id !== metricId);
    setPrimaryMetricIds(nextPrimary);
    setSecondaryMetricIds(nextSecondary);
    setGuardrailMetricIds(nextGuardrail);
    if (nextPrimary.length > 0 || nextSecondary.length > 0 || nextGuardrail.length > 0) {
      refreshAll(nextPrimary, nextSecondary, nextGuardrail);
    } else {
      setAnalysis(null);
      setStatus("Add at least one metric to continue.");
    }
  };

  const openEditor = (metricId: string, windowDays: number, winsorizePercentile: number | null) => {
    setEditingMetricId(metricId);
    setOverrideWindow(windowDays);
    setOverrideWinsor(winsorizePercentile ?? 100);
  };

  const saveOverride = () => {
    if (!editingMetricId) {
      return;
    }
    startTransition(async () => {
      try {
        await updateExperimentMetricOverride(experimentId, editingMetricId, {
          window_days: overrideWindow,
          winsorize_percentile: currentEditingMetric?.supports_winsorization ? overrideWinsor : undefined,
        });
        setEditingMetricId(null);
        refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save override.");
      }
    });
  };

  const handleAdvanceDay = () => {
    startTransition(async () => {
      try {
        setStatus("Appending one more warehouse batch day...");
        await advanceDay({
          experiment_id: experimentId,
          metric_name: "revenue",
          conversion_event_name: "purchase",
          target_lift: 0.08,
        });
        refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Advance day failed.");
      }
    });
  };

  const availableToAdd = availableMetrics.filter((metric) => ![...primaryMetricIds, ...secondaryMetricIds, ...guardrailMetricIds].includes(metric.id));
  const metricColumnSpan = 6;

  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Experiment Detail</div>
          <h1>{experimentId}</h1>
        </div>
        <div className="topbar-meta">
          <div className="meta-tile">
            <span className="meta-label">Metrics</span>
            <strong>{primaryMetricIds.length + secondaryMetricIds.length + guardrailMetricIds.length}</strong>
          </div>
          <div className="meta-tile">
            <span className="meta-label">Sample Size</span>
            <strong>{sampleSize ? Intl.NumberFormat("en-US").format(sampleSize.total_required_sample) : "n/a"}</strong>
          </div>
          <div className="meta-tile">
            <span className="meta-label">Status</span>
            <strong>{isPending ? "Running" : "Ready"}</strong>
          </div>
        </div>
      </header>

      <section className="headline-grid">
        <div className="headline-panel">
          <div className="section-tag">Navigation</div>
          <h2>Focused experiment readout with inline overrides and multivariant comparisons.</h2>
          <p>
            Global metric defaults and conversion-event windows come from the shared catalog. Inline edits here only
            affect this experiment after you save the override.
          </p>
          <div className="summary-note">
            Baseline is shown as <strong>{getVariationLabel(baselineVariant, variations)}</strong>. Choose a treatment
            in the results table to compare one arm at a time against control.
          </div>
          <div className="headline-actions">
            <Link className="button button-secondary" href="/">
              Back to experiments
            </Link>
            <button className="button button-primary" disabled={isPending} onClick={() => refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds)}>
              Refresh Results
            </button>
            <button className="button button-secondary" disabled={isPending} onClick={handleAdvanceDay}>
              Advance Batch Day
            </button>
          </div>
        </div>
        <div className="headline-panel">
          <div className="section-tag">Status</div>
          <div className="status-panel">
            <p>{status}</p>
            <div className="field">
              <label>Add Primary Metric</label>
              <select onChange={(e) => (e.target.value ? addMetricRow(e.target.value, "primary") : null)} value="">
                <option value="">Select a metric</option>
                {availableToAdd.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Add Secondary Metric</label>
              <select onChange={(e) => (e.target.value ? addMetricRow(e.target.value, "secondary") : null)} value="">
                <option value="">Select a metric</option>
                {availableToAdd.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Add Guardrail Metric</label>
              <select onChange={(e) => (e.target.value ? addMetricRow(e.target.value, "guardrail") : null)} value="">
                <option value="">Select a metric</option>
                {availableToAdd.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Slice by dimension</label>
              <select value={splitDimension} onChange={(e) => setSplitDimension(e.target.value as "none" | "country_code" | "mcc")}>
                <option value="none">No split</option>
                <option value="country_code">Country</option>
                <option value="mcc">MCC</option>
              </select>
            </div>
            <div className="field">
              <label>Multiple testing adjustment</label>
              <select
                value={multipleTestingMethod}
                onChange={(e) => setMultipleTestingMethod(e.target.value as "bonferroni" | "benjamini-hochberg")}
              >
                <option value="benjamini-hochberg">Benjamini-Hochberg</option>
                <option value="bonferroni">Bonferroni</option>
              </select>
            </div>
            <div className="summary-note">Use the edit icon in the results table to override windowing or winsorization at the experiment level.</div>
          </div>
        </div>
      </section>

      <section className="assumptions-strip">
        <div className="assumption-tile">
          <span className="meta-label">Hierarchy</span>
          <strong>Experiment override → global default → seeded fallback</strong>
        </div>
        <div className="assumption-tile">
          <span className="meta-label">Conversions</span>
          <strong>Window only, no winsorization</strong>
        </div>
        <div className="assumption-tile">
          <span className="meta-label">Metrics</span>
          <strong>Window plus winsorization when supported</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="section-tag">Results</div>
            <h3>Experiment Results</h3>
          </div>
          <div className="view-toggle">
            <button
              className={`button button-secondary button-compact ${showExperimentChecks ? "is-active" : ""}`}
              onClick={() => setShowExperimentChecks((current) => !current)}
            >
              Experiment checks
            </button>
            <button
              className={`button button-secondary button-compact ${resultsView === "table" ? "is-active" : ""}`}
              onClick={() => setResultsView("table")}
            >
              Table
            </button>
            <button
              className={`button button-secondary button-compact ${resultsView === "timeseries" ? "is-active" : ""}`}
              onClick={() => setResultsView("timeseries")}
            >
              Time Series
            </button>
          </div>
        </div>
        {resultsView === "table" ? (
          <div className="table-wrap">
            {(["primary", "secondary", "guardrail"] as const).map((category) => {
              const categoryRows = analysis?.metric_rows.filter((r) => r.category === category) ?? [];
              if (categoryRows.length === 0) return null;
              const isGuardrail = category === "guardrail";
              return (
                <div key={category} className="category-section">
                  <h4 style={{ padding: '16px 24px', margin: 0, background: 'var(--panel-2)', borderBottom: '1px solid var(--border)', textTransform: 'capitalize' }}>
                    {category} Metrics
                  </h4>
                  <table className="table experiment-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>{getVariationLabel(baselineVariant, variations)}</th>
                        <th>
                          <div className="table-header-select">
                            <span>Treatment</span>
                            <select value={activeTreatment} onChange={(e) => setSelectedTreatment(e.target.value)} disabled={treatmentVariants.length <= 1}>
                              {treatmentVariants.map((variation) => (
                                <option key={variation} value={variation}>
                                  {getVariationLabel(variation, variations)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th>Relative Lift</th>
                        {!isGuardrail && <th>P-Value</th>}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.map((row) => {
                        const selectedComparison =
                          row.comparisons.find((comparison) => comparison.variant === activeTreatment) ?? row.primary_comparison;
                        return (
                          <Fragment key={row.metric_id}>
                            <tr>
                              <td>
                          <div className="metric-name-row">
                            <div>
                              <div className="table-primary">{row.metric_label}</div>
                              <div className="table-secondary">
                                {row.source_type === "conversion_event"
                                  ? `Event: ${row.source_name} • ${row.window_days}d window`
                                  : `Metric: ${row.source_name} • ${row.window_days}d window • P${row.winsorize_percentile}`}
                              </div>
                              {row.dimension_name && row.dimension_value ? (
                                <div className="table-secondary">
                                  {row.dimension_name}: {row.dimension_value}
                                </div>
                              ) : null}
                              {row.has_experiment_override ? (
                                <div className="row-flags">
                                  <span className="mini-badge mini-badge-cyan">Experiment override</span>
                                </div>
                              ) : null}
                              {row.source_type === "conversion_event" ? (
                                <button
                                  className="inline-link inline-link-button"
                                  onClick={() => setSqlMetricId((current) => (current === row.metric_id ? null : row.metric_id))}
                                >
                                  {sqlMetricId === row.metric_id ? "Hide SQL" : "View SQL"}
                                </button>
                              ) : null}
                            </div>
                            <button
                              className="icon-button"
                              onClick={() => openEditor(row.metric_id, row.window_days, row.winsorize_percentile)}
                              aria-label={`Edit ${row.metric_label}`}
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        {[baselineVariant, activeTreatment].map((variation) => (
                          <td key={variation}>
                            <div className="variant-cell">
                              <div className="variant-primary">
                                {variation
                                  ? formatValue(row.variation_stats[variation]?.average_value ?? row.variation_values[variation] ?? 0, row.value_format)
                                  : "n/a"}
                              </div>
                              <div className="variant-stat-list">
                                <div className="variant-stat-line">
                                  <span>Users</span>
                                  <strong>{variation ? formatCount(row.variation_stats[variation]?.user_count ?? 0) : "n/a"}</strong>
                                </div>
                                <div className="variant-stat-line">
                                  <span>Conversions</span>
                                  <strong>{variation ? formatCount(row.variation_stats[variation]?.conversion_count ?? 0) : "n/a"}</strong>
                                </div>
                              </div>
                            </div>
                          </td>
                        ))}
                        <td>
                          <div className="lift-cell">
                            {selectedComparison ? (() => {
                              const comparison = selectedComparison;
                              const scaleMin = Math.min(comparison.ci_low, comparison.ci_high, 0);
                              const scaleMax = Math.max(comparison.ci_low, comparison.ci_high, 0);
                              const scaleRange = Math.max(0.0001, scaleMax - scaleMin);
                              const comparisonLeft = ((Math.min(comparison.ci_low, comparison.ci_high) - scaleMin) / scaleRange) * 100;
                              const comparisonWidth =
                                (Math.abs(comparison.ci_high - comparison.ci_low) / scaleRange) * 100;
                              const zeroPosition = ((0 - scaleMin) / scaleRange) * 100;
                              const pointPosition = ((comparison.relative_lift - scaleMin) / scaleRange) * 100;
                              return (
                                <div key={comparison.variant} className="comparison-stack">
                                  <div className="lift-label">
                                    {getVariationLabel(comparison.variant, variations)} vs{" "}
                                    {getVariationLabel(comparison.baseline_variant, variations)}:{" "}
                                    {formatValue(comparison.relative_lift, "percent")}
                                  </div>
                                  <div className="lift-track">
                                    <div className="lift-zero" style={{ left: `${zeroPosition}%` }} />
                                    <div className="lift-range" style={{ left: `${comparisonLeft}%`, width: `${comparisonWidth}%` }} />
                                    <div
                                      className={`lift-point ${comparison.relative_lift >= 0 ? "positive" : "negative"}`}
                                      style={{ left: `${pointPosition}%` }}
                                    />
                                  </div>
                                  <div className="table-secondary">
                                    CI {formatValue(comparison.ci_low, "percent")} to {formatValue(comparison.ci_high, "percent")}
                                  </div>
                                </div>
                              );
                            })() : <div className="table-secondary">No treatment comparison available.</div>}
                          </div>
                        </td>
                        {!isGuardrail && (
                          <td>
                            <div className="pvalue-stack">
                              {selectedComparison && selectedComparison.adjusted_p_value !== null ? (
                                <div className="pvalue-line">
                                  {getVariationLabel(selectedComparison.variant, variations)}: {formatPValue(selectedComparison.adjusted_p_value)}
                                </div>
                              ) : (
                                <div className="pvalue-line">n/a</div>
                              )}
                            </div>
                          </td>
                        )}
                        <td>
                          <button className="icon-button icon-button-danger" onClick={() => removeMetric(row.metric_id)} aria-label={`Remove ${row.metric_label}`}>
                            X
                          </button>
                        </td>
                            </tr>
                            {row.source_type === "conversion_event" && sqlMetricId === row.metric_id && row.analysis_sql ? (
                              <tr key={`${row.metric_id}-sql`} className="sql-row">
                                <td colSpan={isGuardrail ? metricColumnSpan - 1 : metricColumnSpan}>
                                  <div className="sql-panel sql-panel-inline">
                                    <div className="sql-panel-header">
                                      <span className="section-tag">Conversion SQL</span>
                                      <span className="table-secondary">Exact query used for this event and window in the current experiment</span>
                                    </div>
                                    <pre className="sql-block">{row.analysis_sql}</pre>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="timeseries-grid">
            {analysis?.metric_rows.map((row) => (
              <MetricSeriesCard
                key={row.metric_id}
                row={row}
                variations={variations}
                getVariationLabel={getVariationLabel}
                onEdit={openEditor}
                onRemove={removeMetric}
              />
            ))}
          </div>
        )}
        {analysis ? (
          <>
            <p className="srm-line">
            SRM check: {analysis.srm.critical ? "critical mismatch detected" : "no critical mismatch detected"} with a
            p-value of {formatPValue(analysis.srm.p_value)} across{" "}
            {Object.entries(analysis.srm.counts)
              .map(([variation, count]) => `${getVariationLabel(variation, variations)} ${count}`)
              .join(", ")}
            .
            </p>
            {analysis.multiple_testing_correction_applied ? (
              <p className="srm-line">
                {analysis.multiple_testing_method === "bonferroni" ? "Bonferroni" : "Benjamini-Hochberg"} multiple
                testing correction has been applied across the displayed metric and variant comparisons.
              </p>
            ) : null}
            {showExperimentChecks ? <ExperimentChecksPanel analysis={analysis} variations={variations} /> : null}
          </>
        ) : null}
      </section>

      {editingMetricId ? (
        <div className="popover-card">
          <div className="panel-header">
            <div>
              <div className="section-tag">Override</div>
              <h3>Edit Metric Settings</h3>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Window</label>
              <input type="number" min={1} max={30} value={overrideWindow} onChange={(e) => setOverrideWindow(Number(e.target.value))} />
            </div>
            {currentEditingMetric?.supports_winsorization ? (
              <div className="field">
                <label>Winsorization percentile</label>
                <input type="number" min={50} max={100} value={overrideWinsor} onChange={(e) => setOverrideWinsor(Number(e.target.value))} />
              </div>
            ) : (
              <div className="table-secondary">Conversion events only support conversion window overrides.</div>
            )}
            <div className="headline-actions">
              <button className="button button-primary" disabled={isPending} onClick={saveOverride}>
                Save Override
              </button>
              <button className="button button-secondary" onClick={() => setEditingMetricId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExperimentChecksPanel({
  analysis,
  variations,
}: {
  analysis: AnalyzeResponse;
  variations: string[];
}) {
  return (
    <section className="checks-panel">
      <div className="panel-header">
        <div>
          <div className="section-tag">Diagnostics</div>
          <h3>Experiment Checks</h3>
        </div>
      </div>
      <div className="checks-grid">
        {analysis.dimension_balance.map((dimensionCheck) => (
          <DimensionDistributionCard
            key={dimensionCheck.dimension}
            dimensionCheck={dimensionCheck}
            variations={variations}
            getVariationLabel={getVariationLabel}
          />
        ))}
      </div>
    </section>
  );
}

function DimensionDistributionCard({
  dimensionCheck,
  variations,
  getVariationLabel,
}: {
  dimensionCheck: AnalyzeResponse["dimension_balance"][number];
  variations: string[];
  getVariationLabel: (variation: string, variations: string[]) => string;
}) {
  const width = 760;
  const height = 260;
  const padding = { top: 24, right: 16, bottom: 44, left: 44 };
  const buckets = Object.entries(dimensionCheck.buckets);
  const maxCount = Math.max(
    1,
    ...buckets.flatMap(([, counts]) => variations.map((variation) => counts[variation] ?? 0)),
  );
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const bucketWidth = chartWidth / Math.max(1, buckets.length);
  const groupPadding = 12;
  const barGroupWidth = Math.max(24, bucketWidth - groupPadding);
  const barWidth = barGroupWidth / Math.max(1, variations.length);
  const lineColors = ["#006fee", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

  return (
    <section className="panel checks-card">
      <div className="panel-header">
        <div>
          <div className="section-tag">{dimensionCheck.dimension}</div>
          <h3>{dimensionCheck.balanced ? "Balanced distribution" : "Potential imbalance detected"}</h3>
          <div className="table-secondary">Chi-squared p-value {formatPValue(dimensionCheck.p_value)}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="timeseries-chart" role="img" aria-label={`${dimensionCheck.dimension} user distribution by variant`}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + tick * chartHeight;
          return <line key={tick} x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="timeseries-gridline" />;
        })}
        {buckets.map(([bucketName, counts], bucketIndex) => {
          const groupX = padding.left + bucketIndex * bucketWidth;
          return (
            <g key={bucketName}>
              {variations.map((variation, variationIndex) => {
                const count = counts[variation] ?? 0;
                const barHeight = (count / maxCount) * chartHeight;
                const x = groupX + variationIndex * barWidth + groupPadding / 2;
                const y = padding.top + chartHeight - barHeight;
                return (
                  <rect
                    key={`${bucketName}-${variation}`}
                    x={x}
                    y={y}
                    width={Math.max(8, barWidth - 4)}
                    height={barHeight}
                    rx={4}
                    fill={lineColors[variationIndex % lineColors.length]}
                  />
                );
              })}
              <text
                x={groupX + bucketWidth / 2}
                y={height - 12}
                textAnchor="middle"
                className="timeseries-axis-label"
              >
                {bucketName}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="timeseries-legend">
        {variations.map((variation, variationIndex) => (
          <div key={variation} className="timeseries-legend-item">
            <span className="timeseries-swatch" style={{ background: lineColors[variationIndex % lineColors.length] }} />
            <span>{getVariationLabel(variation, variations)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricSeriesCard({
  row,
  variations,
  getVariationLabel,
  onEdit,
  onRemove,
}: {
  row: AnalyzeResponse["metric_rows"][number];
  variations: string[];
  getVariationLabel: (variation: string, variations: string[]) => string;
  onEdit: (metricId: string, windowDays: number, winsorizePercentile: number | null) => void;
  onRemove: (metricId: string) => void;
}) {
  const width = 760;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 32, left: 44 };
  const points = row.time_series;
  const flattened = points.flatMap((point) => variations.map((variation) => point.variation_values[variation] ?? 0));
  const minValue = Math.min(...flattened, 0);
  const maxValue = Math.max(...flattened, 0.0001);
  const valueRange = Math.max(0.0001, maxValue - minValue);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const lineColors = ["#58b8ff", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  const pointToSvg = (value: number, index: number) => {
    const x =
      padding.left +
      (points.length === 1 ? chartWidth / 2 : (index / Math.max(1, points.length - 1)) * chartWidth);
    const y = padding.top + (1 - (value - minValue) / valueRange) * chartHeight;
    return `${x},${y}`;
  };

  const activePoint = activePointIndex !== null ? points[activePointIndex] : null;
  const activeX =
    activePointIndex !== null
      ? padding.left +
        (points.length === 1 ? chartWidth / 2 : (activePointIndex / Math.max(1, points.length - 1)) * chartWidth)
      : null;
  const activeY =
    activePointIndex !== null && activePoint
      ? Math.min(
          ...variations.map((variation) => {
            const value = activePoint.variation_values[variation] ?? 0;
            return padding.top + (1 - (value - minValue) / valueRange) * chartHeight;
          }),
        )
      : null;

  return (
    <section className="panel timeseries-card">
      <div className="panel-header">
        <div>
          <div className="section-tag">Metric</div>
          <h3>{row.metric_label}</h3>
          <div className="table-secondary">
            {row.source_type === "conversion_event"
              ? `Event: ${row.source_name} • daily ${row.window_days}d view`
              : `Metric: ${row.source_name} • daily ${row.window_days}d view`}
          </div>
          {row.dimension_name && row.dimension_value ? (
            <div className="table-secondary">
              {row.dimension_name}: {row.dimension_value}
            </div>
          ) : null}
        </div>
        <div className="headline-actions">
          <button className="icon-button" onClick={() => onEdit(row.metric_id, row.window_days, row.winsorize_percentile)} aria-label={`Edit ${row.metric_label}`}>
            ✎
          </button>
          <button className="icon-button icon-button-danger" onClick={() => onRemove(row.metric_id)} aria-label={`Remove ${row.metric_label}`}>
            X
          </button>
        </div>
      </div>
      <div className="timeseries-chart-shell" onMouseLeave={() => setActivePointIndex(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="timeseries-chart" role="img" aria-label={`${row.metric_label} over time`}>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding.top + tick * chartHeight;
            return <line key={tick} x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="timeseries-gridline" />;
          })}
          {activeX !== null ? (
            <line
              x1={activeX}
              y1={padding.top}
              x2={activeX}
              y2={padding.top + chartHeight}
              className="timeseries-active-line"
            />
          ) : null}
          {points.map((point, index) => {
            const x =
              padding.left +
              (points.length === 1 ? chartWidth / 2 : (index / Math.max(1, points.length - 1)) * chartWidth);
            return (
              <text key={point.date} x={x} y={height - 8} textAnchor="middle" className="timeseries-axis-label">
                {formatShortDate(point.date)}
              </text>
            );
          })}
          {variations.map((variation, variationIndex) => {
            const polylinePoints = points
              .map((point, index) => pointToSvg(point.variation_values[variation] ?? 0, index))
              .join(" ");
            return (
              <g key={variation}>
                <polyline
                  fill="none"
                  stroke={lineColors[variationIndex % lineColors.length]}
                  strokeWidth="2.5"
                  points={polylinePoints}
                />
                {points.map((point, index) => {
                  const value = point.variation_values[variation] ?? 0;
                  const [cx, cy] = pointToSvg(value, index).split(",").map(Number);
                  return (
                    <circle
                      key={`${variation}-${point.date}`}
                      cx={cx}
                      cy={cy}
                      r={activePointIndex === index ? 5 : 4}
                      fill={lineColors[variationIndex % lineColors.length]}
                      className="timeseries-point"
                      onMouseEnter={() => setActivePointIndex(index)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {activePoint && activeX !== null && activeY !== null ? (
          <div
            className="timeseries-tooltip"
            style={{
              left: `${Math.min(width - 180, Math.max(12, activeX + 14))}px`,
              top: `${Math.max(12, activeY - 8)}px`,
            }}
          >
            <div className="timeseries-tooltip-date">{formatShortDate(activePoint.date)}</div>
            <div className="timeseries-tooltip-list">
              {variations.map((variation, variationIndex) => (
                <div key={variation} className="timeseries-tooltip-line">
                  <span className="timeseries-swatch" style={{ background: lineColors[variationIndex % lineColors.length] }} />
                  <span>{getVariationLabel(variation, variations)}</span>
                  <strong>{formatValue(activePoint.variation_values[variation] ?? 0, row.value_format)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="timeseries-legend">
        {variations.map((variation, variationIndex) => (
          <div key={variation} className="timeseries-legend-item">
            <span className="timeseries-swatch" style={{ background: lineColors[variationIndex % lineColors.length] }} />
            <span>{getVariationLabel(variation, variations)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
