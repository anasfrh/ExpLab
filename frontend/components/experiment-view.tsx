"use client";
import { formatValue, formatPValue, formatCount } from "../lib/formatters";
import { DimensionDistributionCard, MetricSeriesCard } from "./charts";

import { Fragment } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  advanceDay,
  analyze,
  updateExperimentAnalysisThresholds,
  listExperimentMetrics,
  updateExperimentMetricOverride,
} from "../lib/api";
import { AnalyzeResponse, ExperimentMetric } from "../lib/types";


function getVariationLabel(variation: string, variations: string[]) {
  const index = variations.indexOf(variation);
  if (index <= 0) {
    return "Control";
  }
  return `Treatment ${index}`;
}

export function ExperimentView({
  experimentId,
  experimentLabel,
  sourceName,
}: {
  experimentId: string;
  experimentLabel?: string;
  sourceName?: string;
}) {
  const [availableMetrics, setAvailableMetrics] = useState<ExperimentMetric[]>([]);
  const [primaryMetricIds, setPrimaryMetricIds] = useState<string[]>([]);
  const [secondaryMetricIds, setSecondaryMetricIds] = useState<string[]>([]);
  const [guardrailMetricIds, setGuardrailMetricIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [status, setStatus] = useState("Loading experiment analysis...");
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [thresholdOverrideEnabled, setThresholdOverrideEnabled] = useState(false);
  const [thresholdUsers, setThresholdUsers] = useState(100);
  const [thresholdConversions, setThresholdConversions] = useState(25);
  const [showGlobalSql, setShowGlobalSql] = useState<boolean>(false);
  const [resultsView, setResultsView] = useState<"table" | "timeseries">("table");
  const [showExperimentChecks, setShowExperimentChecks] = useState(false);
  const [splitDimension, setSplitDimension] = useState<string>("none");
  const [multipleTestingMethod, setMultipleTestingMethod] = useState<"bonferroni" | "benjamini-hochberg">("benjamini-hochberg");
  const [selectedTreatment, setSelectedTreatment] = useState<string>("");
  const [overrideWindow, setOverrideWindow] = useState(14);
  const [overrideWinsor, setOverrideWinsor] = useState(99);
  const [isPending, startTransition] = useTransition();
  const hasLoadedInitialAnalysis = useRef(false);
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

  const getSecondaryStatLabel = (sourceType: "metric" | "conversion_event") =>
    sourceType === "conversion_event" ? "Conversions" : "Winsorized total";

  const getSecondaryStatValue = (
    variation: string,
    row: AnalyzeResponse["metric_rows"][number],
  ) => {
    const stats = row.variation_stats[variation];
    if (!stats) {
      return 0;
    }
    return row.source_type === "conversion_event"
      ? stats.conversion_count ?? 0
      : stats.total_value;
  };

  const refreshAll = (primary: string[], secondary: string[], guardrail: string[]) => {
    startTransition(async () => {
      try {
        setStatus("Refreshing experiment results...");
        const analysisResponse = await analyze({
          experiment_id: experimentId,
          source_name: sourceName,
          primary_metric_ids: primary,
          secondary_metric_ids: secondary,
          guardrail_metric_ids: guardrail,
          split_dimension: splitDimension === "none" ? undefined : splitDimension,
          multiple_testing_method: multipleTestingMethod,
          include_time_series: resultsView === "timeseries",
        });
        setAnalysis(analysisResponse);
        setStatus("Experiment results are up to date.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Analysis failed.");
      }
    });
  };

  useEffect(() => {
    startTransition(async () => {
      try {
        hasLoadedInitialAnalysis.current = false;
        const catalog = await listExperimentMetrics(experimentId, sourceName);
        setAvailableMetrics(catalog.metrics);
        const primary = catalog.metrics.length > 0 ? [catalog.metrics[0].id] : [];
        const secondary = catalog.metrics.length > 1 ? catalog.metrics.slice(1, 3).map((m) => m.id) : [];
        const guardrail: string[] = [];
        setPrimaryMetricIds(primary);
        setSecondaryMetricIds(secondary);
        setGuardrailMetricIds(guardrail);
        hasLoadedInitialAnalysis.current = true;
        refreshAll(primary, secondary, guardrail);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load experiment metrics.");
      }
    });
  }, [experimentId, sourceName]);

  useEffect(() => {
    if (
      hasLoadedInitialAnalysis.current &&
      (primaryMetricIds.length > 0 || secondaryMetricIds.length > 0 || guardrailMetricIds.length > 0)
    ) {
      refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
    }
  }, [splitDimension]);

  useEffect(() => {
    if (
      hasLoadedInitialAnalysis.current &&
      (primaryMetricIds.length > 0 || secondaryMetricIds.length > 0 || guardrailMetricIds.length > 0)
    ) {
      refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
    }
  }, [multipleTestingMethod]);

  useEffect(() => {
    const hasSelectedMetrics =
      primaryMetricIds.length > 0 || secondaryMetricIds.length > 0 || guardrailMetricIds.length > 0;
    const needsTimeSeries =
      resultsView === "timeseries" &&
      hasSelectedMetrics &&
      !!analysis &&
      analysis.metric_rows.some((row) => row.time_series.length === 0);

    if (hasLoadedInitialAnalysis.current && needsTimeSeries) {
      refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
    }
  }, [resultsView, analysis, primaryMetricIds, secondaryMetricIds, guardrailMetricIds]);

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

  const openThresholdEditor = () => {
    const thresholds = analysis?.analysis_thresholds;
    if (!thresholds) {
      return;
    }
    setThresholdOverrideEnabled(thresholds.has_experiment_override);
    setThresholdUsers(thresholds.minimum_users_per_leg);
    setThresholdConversions(thresholds.minimum_conversions_per_leg);
    setEditingThresholds(true);
  };

  const saveThresholdOverride = () => {
    startTransition(async () => {
      try {
        await updateExperimentAnalysisThresholds(experimentId, thresholdOverrideEnabled ? {
          minimum_users_per_leg: thresholdUsers,
          minimum_conversions_per_leg: thresholdConversions,
        } : {});
        setEditingThresholds(false);
        refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save analysis thresholds.");
      }
    });
  };

  const handleAdvanceDay = () => {
    startTransition(async () => {
      try {
        setStatus("Appending one more warehouse batch day...");
        await advanceDay({
          experiment_id: experimentId,
          source_name: sourceName,
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

  const exportCsv = () => {
    if (!analysis) return;

    const rows = [
      ["Category", "Metric", "Dimension", "Dimension Value", "Variant", "Baseline", "Relative Lift", "CI Low", "CI High", "P-Value", "Is Stat Sig"]
    ];

    analysis.metric_rows.forEach((row) => {
      row.comparisons.forEach((comparison) => {
        const isStatSig = comparison.adjusted_p_value !== null && comparison.adjusted_p_value < 0.05;
        rows.push([
          `"${row.category}"`,
          `"${row.metric_label}"`,
          `"${row.dimension_name || "overall"}"`,
          `"${row.dimension_value || "overall"}"`,
          `"${getVariationLabel(comparison.variant, variations)}"`,
          `"${getVariationLabel(comparison.baseline_variant, variations)}"`,
          comparison.relative_lift.toString(),
          comparison.ci_low?.toString() || "n/a",
          comparison.ci_high?.toString() || "n/a",
          comparison.adjusted_p_value?.toString() || "n/a",
          isStatSig.toString(),
        ]);
      });
    });

    const csvContent = rows.map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `experiment_${experimentId}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const availableToAdd = availableMetrics.filter((metric) => ![...primaryMetricIds, ...secondaryMetricIds, ...guardrailMetricIds].includes(metric.id));
  const metricColumnSpan = 6;

  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Experiment Detail</div>
          <h1>{experimentLabel ?? experimentId}</h1>
          {sourceName ? (
            <div style={{ marginTop: 6 }}>
              <span className="section-tag">{sourceName}</span>
            </div>
          ) : null}
        </div>
        <div className="topbar-meta">
          <div className="meta-tile">
            <span className="meta-label">Metrics</span>
            <strong>{primaryMetricIds.length + secondaryMetricIds.length + guardrailMetricIds.length}</strong>
          </div>
          <div className="meta-tile">
            <span className="meta-label">Current Sample</span>
            <strong>{analysis ? Intl.NumberFormat("en-US").format(analysis.total_users) : "n/a"}</strong>
          </div>
          <div className="meta-tile">
            <span className="meta-label">Status</span>
            <strong>{isPending ? "Running" : "Ready"}</strong>
          </div>
        </div>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="headline-panel" style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="section-tag" style={{ margin: 0 }}>Navigation</div>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Overview</h3>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Baseline: <strong>{getVariationLabel(baselineVariant, variations)}</strong>
            </span>
          </div>
          <div className="headline-actions" style={{ margin: 0 }}>
            <Link className="button button-secondary button-compact" href="/">
              Back to experiments
            </Link>
            <button className="button button-primary button-compact" disabled={isPending} onClick={() => refreshAll(primaryMetricIds, secondaryMetricIds, guardrailMetricIds)}>
              Refresh Results
            </button>
            <button className="button button-secondary button-compact" disabled={isPending || (!!sourceName && sourceName !== "Built-in Sample")} onClick={handleAdvanceDay}>
              Advance Batch Day
            </button>
            <button className="button button-secondary button-compact" disabled={isPending || !analysis} onClick={openThresholdEditor}>
              Threshold Override
            </button>
            <button className="button button-secondary button-compact" disabled={!analysis} onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="headline-panel" style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="section-tag" style={{ margin: 0 }}>Status</div>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{status}</span>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0 }}>
              <select style={{ padding: "6px 10px", fontSize: "0.85rem" }} onChange={(e) => (e.target.value ? addMetricRow(e.target.value, "primary") : null)} value="">
                <option value="">+ Primary Metric</option>
                {availableToAdd.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <select style={{ padding: "6px 10px", fontSize: "0.85rem" }} onChange={(e) => (e.target.value ? addMetricRow(e.target.value, "secondary") : null)} value="">
                <option value="">+ Secondary Metric</option>
                {availableToAdd.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <select style={{ padding: "6px 10px", fontSize: "0.85rem" }} onChange={(e) => (e.target.value ? addMetricRow(e.target.value, "guardrail") : null)} value="">
                <option value="">+ Guardrail Metric</option>
                {availableToAdd.map((metric) => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <select style={{ padding: "6px 10px", fontSize: "0.85rem" }} value={splitDimension} onChange={(e) => setSplitDimension(e.target.value)}>
                <option value="none">None</option>
                {analysis?.dimension_balance?.map((db) => (
                  <option key={db.dimension} value={db.dimension}>Split by {db.dimension}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <select style={{ padding: "6px 10px", fontSize: "0.85rem" }} value={multipleTestingMethod} onChange={(e) => setMultipleTestingMethod(e.target.value as "bonferroni" | "benjamini-hochberg")}>
                <option value="benjamini-hochberg">FDR (B-H)</option>
                <option value="bonferroni">FWER (Bonferroni)</option>
              </select>
            </div>
          </div>
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
                      {Object.values(
                        categoryRows.reduce((acc, row) => {
                          acc[row.metric_id] = acc[row.metric_id] || [];
                          acc[row.metric_id].push(row);
                          return acc;
                        }, {} as Record<string, typeof categoryRows>)
                      ).map((rows) => {
                        const primaryRow = rows[0];
                        const isSplit = rows.length > 1 || primaryRow.dimension_value;

                        return (
                          <Fragment key={primaryRow.metric_id}>
                            {isSplit && (
                              <tr className="metric-group-header">
                                <td colSpan={isGuardrail ? 4 : 5} style={{ backgroundColor: "var(--bg-2)", borderBottom: "none", padding: "12px 16px 8px" }}>
                                  <div className="metric-name-row" style={{ margin: 0 }}>
                                    <div>
                                      <div className="table-primary">{primaryRow.metric_label}</div>
                                      <div className="table-secondary">
                                        {primaryRow.source_type === "conversion_event"
                                          ? `Event: ${primaryRow.source_name} • ${primaryRow.window_days}d window`
                                          : `Metric: ${primaryRow.source_name} • ${primaryRow.window_days}d window • P${primaryRow.winsorize_percentile}`}
                                      </div>
                                      {primaryRow.has_experiment_override ? (
                                        <div className="row-flags" style={{ marginTop: "4px" }}>
                                          <span className="mini-badge mini-badge-cyan">Experiment override</span>
                                        </div>
                                      ) : null}
                                      </div>
                                    <button
                                      className="icon-button"
                                      onClick={() => openEditor(primaryRow.metric_id, primaryRow.window_days, primaryRow.winsorize_percentile)}
                                      aria-label={`Edit ${primaryRow.metric_label}`}
                                    >
                                      ✎
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {rows.map((row, index) => {
                              const selectedComparison =
                                row.comparisons.find((comparison) => comparison.variant === activeTreatment) ?? row.primary_comparison;

                              const isStatSig = selectedComparison && selectedComparison.adjusted_p_value !== null && selectedComparison.adjusted_p_value < 0.05;
                              const isPositive = selectedComparison && (row.desired_direction === "down" ? selectedComparison.relative_lift < 0 : selectedComparison.relative_lift > 0);
                              const isNegative = selectedComparison && (row.desired_direction === "down" ? selectedComparison.relative_lift > 0 : selectedComparison.relative_lift < 0);

                              let ciColor = "var(--muted-2)";
                              let pvalueBg = "transparent";
                              let pvalueColor = "inherit";

                              if (isStatSig && isPositive) {
                                ciColor = "var(--green)";
                                pvalueBg = "rgba(34, 197, 94, 0.15)";
                                pvalueColor = "var(--green)";
                              } else if (isStatSig && isNegative) {
                                ciColor = "var(--red)";
                                pvalueBg = "rgba(239, 68, 68, 0.15)";
                                pvalueColor = "var(--red)";
                              }

                              return (
                                <Fragment key={`${row.metric_id}-${row.dimension_value ?? "overall"}`}>
                                  <tr>
                                    <td style={isSplit ? { paddingLeft: "32px", position: "relative" } : {}}>
                                      {isSplit ? (
                                        <>
                                          <div style={{ position: "absolute", left: "14px", top: "50%", width: "10px", height: "1px", backgroundColor: "var(--border)", transform: "translateY(-50%)" }} />
                                          <div style={{ position: "absolute", left: "14px", top: "0", width: "1px", height: index === rows.length - 1 ? "50%" : "100%", backgroundColor: "var(--border)" }} />
                                          <div className="table-primary">{row.dimension_value || "Unknown"}</div>
                                        </>
                                      ) : (
                                        <div className="metric-name-row">
                                          <div>
                                            <div className="table-primary">{row.metric_label}</div>
                                            <div className="table-secondary">
                                              {row.source_type === "conversion_event"
                                                ? `Event: ${row.source_name} • ${row.window_days}d window`
                                                : `Metric: ${row.source_name} • ${row.window_days}d window • P${row.winsorize_percentile}`}
                                            </div>
                                            {row.has_experiment_override ? (
                                              <div className="row-flags">
                                                <span className="mini-badge mini-badge-cyan">Experiment override</span>
                                              </div>
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
                                      )}
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
                                        <span>{getSecondaryStatLabel(row.source_type)}</span>
                                        <strong>
                                          {variation
                                            ? row.source_type === "conversion_event"
                                              ? formatCount(getSecondaryStatValue(variation, row))
                                              : formatValue(getSecondaryStatValue(variation, row), row.value_format)
                                            : "n/a"}
                                        </strong>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              ))}
                              <td>
                                <div className="lift-cell">
                                  {selectedComparison ? (() => {
                                    const comparison = selectedComparison;
                                    const ciLow = comparison.ci_low ?? comparison.relative_lift;
                                    const ciHigh = comparison.ci_high ?? comparison.relative_lift;
                                    const scaleMin = Math.min(ciLow, ciHigh, 0);
                                    const scaleMax = Math.max(ciLow, ciHigh, 0);
                                    const scaleRange = Math.max(0.0001, scaleMax - scaleMin);
                                    const comparisonLeft = ((Math.min(ciLow, ciHigh) - scaleMin) / scaleRange) * 100;
                                    const comparisonWidth =
                                      (Math.abs(ciHigh - ciLow) / scaleRange) * 100;
                                    const zeroPosition = ((0 - scaleMin) / scaleRange) * 100;
                                    const pointPosition = ((comparison.relative_lift - scaleMin) / scaleRange) * 100;
                                    return (
                                      <div key={comparison.variant} className="comparison-stack">
                                        <div className="lift-label">
                                          {getVariationLabel(comparison.variant, variations)} vs{" "}
                                          {getVariationLabel(comparison.baseline_variant, variations)}:{" "}
                                          {formatValue(comparison.relative_lift, "percent")}
                                        </div>
                                        {comparison.has_sufficient_data && comparison.ci_low !== null && comparison.ci_high !== null ? (
                                          <>
                                            <div className="lift-track">
                                              <div className="lift-zero" style={{ left: `${zeroPosition}%` }} />
                                              <div className="lift-range" style={{ left: `${comparisonLeft}%`, width: `${comparisonWidth}%`, backgroundColor: ciColor }} />
                                              <div
                                                className={`lift-point ${comparison.relative_lift >= 0 ? "positive" : "negative"}`}
                                                style={{ left: `${pointPosition}%` }}
                                              />
                                            </div>
                                            <div className="table-secondary">
                                              CI {formatValue(comparison.ci_low, "percent")} to {formatValue(comparison.ci_high, "percent")}
                                            </div>
                                          </>
                                        ) : (
                                          <div className="table-secondary">
                                            {comparison.insufficient_data_reasons.join(" ")}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })() : <div className="table-secondary">No treatment comparison available.</div>}
                                </div>
                              </td>
                              {!isGuardrail && (
                                <td>
                                  <div className="pvalue-stack">
                                    {selectedComparison && selectedComparison.adjusted_p_value !== null ? (
                                      <div className="pvalue-line" style={{ backgroundColor: pvalueBg, color: pvalueColor, padding: pvalueBg !== "transparent" ? "2px 6px" : "0", borderRadius: "4px", display: "inline-block" }}>
                                        {getVariationLabel(selectedComparison.variant, variations)}: {formatPValue(selectedComparison.adjusted_p_value)}
                                      </div>
                                    ) : selectedComparison ? (
                                      <div className="pvalue-line">{selectedComparison.insufficient_data_reasons.join(" ")}</div>
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

                                </Fragment>
                              );
                            })}
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
            <div className="headline-panel" style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div className="section-tag" style={{ marginBottom: 6 }}>Time Series</div>
                <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                  Showing relative lift for one treatment against {getVariationLabel(baselineVariant, variations)}.
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <select style={{ padding: "6px 10px", fontSize: "0.85rem" }} value={activeTreatment} onChange={(e) => setSelectedTreatment(e.target.value)} disabled={treatmentVariants.length <= 1}>
                  {treatmentVariants.map((variation) => (
                    <option key={variation} value={variation}>
                      {getVariationLabel(variation, variations)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {analysis?.metric_rows.map((row) => (
              <MetricSeriesCard
                key={row.metric_id}
                row={row}
                variations={variations}
                selectedTreatment={activeTreatment}
                getVariationLabel={getVariationLabel}
                onEdit={openEditor}
                onRemove={removeMetric}
              />
            ))}
          </div>
        )}
        {analysis ? (
          <>
            {analysis.multiple_testing_correction_applied ? (
              <p className="srm-line">
                {analysis.multiple_testing_method === "bonferroni" ? "Bonferroni" : "Benjamini-Hochberg"} multiple
                testing correction has been applied across the displayed metric and variant comparisons.
              </p>
            ) : null}
            <div style={{ marginTop: "12px", display: "flex", gap: "10px", alignItems: "center" }}>
              <button className="button button-secondary button-compact" onClick={() => setShowGlobalSql(true)}>
                View Analysis SQL
              </button>
            </div>
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

      {editingThresholds ? (
        <div className="popover-card">
          <div className="panel-header">
            <div>
              <div className="section-tag">Thresholds</div>
              <h3>Experiment Analysis Thresholds</h3>
            </div>
          </div>
          <div className="form-grid">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={thresholdOverrideEnabled} onChange={(e) => setThresholdOverrideEnabled(e.target.checked)} />
              Use experiment-specific thresholds
            </label>
            <div className="field">
              <label>Minimum users per leg</label>
              <input type="number" min={1} value={thresholdUsers} onChange={(e) => setThresholdUsers(Number(e.target.value))} disabled={!thresholdOverrideEnabled} />
            </div>
            <div className="field">
              <label>Minimum conversions per leg</label>
              <input type="number" min={0} value={thresholdConversions} onChange={(e) => setThresholdConversions(Number(e.target.value))} disabled={!thresholdOverrideEnabled} />
            </div>
            <div className="table-secondary">
              {thresholdOverrideEnabled
                ? "These thresholds apply only to this experiment."
                : "When disabled, this experiment uses the global defaults from Settings."}
            </div>
            <div className="headline-actions">
              <button className="button button-primary" disabled={isPending} onClick={saveThresholdOverride}>
                Save Thresholds
              </button>
              <button className="button button-secondary" onClick={() => setEditingThresholds(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showGlobalSql && analysis ? (
        <div className="popover-card" style={{ maxWidth: "800px", width: "90vw", maxHeight: "80vh", overflow: "auto" }}>
          <div className="panel-header" style={{ position: "sticky", top: 0, backgroundColor: "var(--bg)", zIndex: 1, paddingBottom: "16px", borderBottom: "1px solid var(--border)", marginBottom: "16px" }}>
            <div>
              <div className="section-tag">Queries</div>
              <h3>Analysis SQL</h3>
            </div>
          </div>
          <div className="sql-panel">
            {analysis.metric_rows
              .filter((row, index, self) => index === self.findIndex((r) => r.metric_id === row.metric_id))
              .filter((row) => row.analysis_sql)
              .map((row) => (
                <div key={row.metric_id} style={{ marginBottom: "24px" }}>
                  <pre className="sql-block">
                    {`-- ${row.metric_label} (${row.source_type === "conversion_event" ? "Conversion Event" : "Metric"})\n${row.analysis_sql}`}
                  </pre>
                </div>
              ))}
            {analysis.metric_rows.filter((row) => row.analysis_sql).length === 0 && (
              <div className="table-secondary">No SQL queries available for the current metrics.</div>
            )}
          </div>
          <div className="headline-actions" style={{ position: "sticky", bottom: 0, backgroundColor: "var(--bg)", padding: "16px 0 0 0", marginTop: "16px", borderTop: "1px solid var(--border)" }}>
            <button className="button button-secondary" onClick={() => setShowGlobalSql(false)}>
              Close
            </button>
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
  const srmCountsSummary = Object.entries(analysis.srm.counts)
    .map(([variation, count]) => `${getVariationLabel(variation, variations)} ${formatCount(count)}`)
    .join(", ");

  return (
    <section className="checks-panel">
      <div className="panel-header">
        <div>
          <div className="section-tag">Diagnostics</div>
          <h3>Experiment Checks</h3>
        </div>
      </div>
      <div
        className={`diagnostic-banner ${analysis.srm.critical ? "diagnostic-banner-danger" : "diagnostic-banner-success"}`}
      >
        <strong>{analysis.srm.critical ? "Sample Ratio Mismatch Detected" : "No Sample Ratio Mismatch Detected"}</strong>
        <p style={{ margin: "4px 0 0 0" }}>
          {analysis.srm.critical
            ? "Observed traffic allocation differs materially from the expected split for this experiment."
            : "Observed traffic allocation is within the expected range for this experiment."}
        </p>
        <p style={{ margin: "4px 0 0 0" }}>
          P-value: {formatPValue(analysis.srm.p_value)}. Variation counts: {srmCountsSummary}.
        </p>
      </div>
      {analysis.has_multiple_exposures && (
        <div className="diagnostic-banner diagnostic-banner-danger">
          <strong>Multiple Exposures Detected</strong>
          <p style={{ margin: "4px 0 0 0" }}>{analysis.multiple_exposures_count} user(s) were exposed to more than one variation in this experiment.</p>
          <p style={{ margin: "4px 0 0 0" }}>This violates the stable unit treatment value assumption (SUTVA). These results may be invalid.</p>
        </div>
      )}
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
