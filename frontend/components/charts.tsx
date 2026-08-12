import React, { useState } from "react";
import type { AnalyzeResponse } from "../lib/types";
import { formatPValue, formatShortDate, formatValue } from "../lib/formatters";

export function DimensionDistributionCard({
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
  const [activeBar, setActiveBar] = useState<{
    bucketName: string;
    variation: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  return (
    <section className="panel checks-card">
      <div className="panel-header">
        <div>
          <div className="section-tag">{dimensionCheck.dimension}</div>
          <h3>{dimensionCheck.balanced ? "Balanced distribution" : "Potential imbalance detected"}</h3>
          <div className="table-secondary">Chi-squared p-value {formatPValue(dimensionCheck.p_value)}</div>
        </div>
      </div>
      <div className="timeseries-chart-shell" onMouseLeave={() => setActiveBar(null)}>
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
                  const renderedBarWidth = Math.max(8, barWidth - 4);
                  return (
                    <rect
                      key={`${bucketName}-${variation}`}
                      x={x}
                      y={y}
                      width={renderedBarWidth}
                      height={barHeight}
                      rx={4}
                      fill={lineColors[variationIndex % lineColors.length]}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() =>
                        setActiveBar({
                          bucketName,
                          variation,
                          count,
                          x: x + renderedBarWidth / 2,
                          y,
                        })
                      }
                    >
                      <title>{`${bucketName} • ${getVariationLabel(variation, variations)}: ${count}`}</title>
                    </rect>
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
        {activeBar ? (
          <div
            className="timeseries-tooltip"
            style={{
              left: `${Math.min(width - 250, Math.max(12, activeBar.x + 14))}px`,
              top: `${Math.max(12, activeBar.y - 8)}px`,
              width: "220px",
            }}
          >
            <div className="timeseries-tooltip-date">{activeBar.bucketName}</div>
            <div className="timeseries-tooltip-list">
              <div className="timeseries-tooltip-line">
                <span
                  className="timeseries-swatch"
                  style={{ background: lineColors[variations.indexOf(activeBar.variation) % lineColors.length] }}
                />
                <span>{getVariationLabel(activeBar.variation, variations)}</span>
                <strong>{activeBar.count}</strong>
              </div>
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

export function MetricSeriesCard({
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
  const treatmentVariants = variations.filter((v) => v !== row.baseline_variant);

  const flattened = points.flatMap((point) =>
    (point.comparisons || []).flatMap((c) => [c.ci_low, c.ci_high, c.relative_lift])
  );
  const minValue = Math.min(...flattened, 0);
  const maxValue = Math.max(...flattened, 0.0001);
  const valueRange = Math.max(0.0001, maxValue - minValue);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const lineColors = ["#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#58b8ff"];
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
    activePointIndex !== null && activePoint && treatmentVariants.length > 0
      ? Math.min(
          ...treatmentVariants.map((variation) => {
            const comp = activePoint.comparisons?.find((c) => c.variant === variation);
            const value = comp ? comp.relative_lift : 0;
            return padding.top + (1 - (value - minValue) / valueRange) * chartHeight;
          })
        )
      : null;

  return (
    <section className="panel timeseries-card">
      <div className="panel-header">
        <div>
          <div className="section-tag">Metric Lift</div>
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
          
          <line
            x1={padding.left}
            y1={padding.top + (1 - (0 - minValue) / valueRange) * chartHeight}
            x2={width - padding.right}
            y2={padding.top + (1 - (0 - minValue) / valueRange) * chartHeight}
            stroke="var(--muted-2)"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />

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
          {treatmentVariants.map((variation, variationIndex) => {
            const color = lineColors[variationIndex % lineColors.length];
            const polylinePoints = points
              .map((point, index) => {
                const comp = point.comparisons?.find((c) => c.variant === variation);
                return pointToSvg(comp ? comp.relative_lift : 0, index);
              })
              .join(" ");

            const polygonPoints = [
              ...points.map((point, index) => {
                const comp = point.comparisons?.find((c) => c.variant === variation);
                return pointToSvg(comp ? comp.ci_high : 0, index);
              }),
              ...points.slice().reverse().map((point, reversedIndex) => {
                const index = points.length - 1 - reversedIndex;
                const comp = point.comparisons?.find((c) => c.variant === variation);
                return pointToSvg(comp ? comp.ci_low : 0, index);
              }),
            ].join(" ");

            return (
              <g key={variation}>
                <polygon fill={color} fillOpacity="0.1" points={polygonPoints} />
                <polyline fill="none" stroke={color} strokeWidth="2.5" points={polylinePoints} />
                {points.map((point, index) => {
                  const comp = point.comparisons?.find((c) => c.variant === variation);
                  const value = comp ? comp.relative_lift : 0;
                  const [cx, cy] = pointToSvg(value, index).split(",").map(Number);
                  return (
                    <circle
                      key={`${variation}-${point.date}`}
                      cx={cx}
                      cy={cy}
                      r={activePointIndex === index ? 5 : 4}
                      fill={color}
                      className="timeseries-point"
                      onMouseEnter={() => setActivePointIndex(index)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {activePoint && activeX !== null && activeY !== null && treatmentVariants.length > 0 ? (
          <div
            className="timeseries-tooltip"
            style={{
              left: `${Math.min(width - 250, Math.max(12, activeX + 14))}px`,
              top: `${Math.max(12, activeY - 8)}px`,
              width: '230px',
            }}
          >
            <div className="timeseries-tooltip-date">{formatShortDate(activePoint.date)}</div>
            <div className="timeseries-tooltip-list">
              {treatmentVariants.map((variation, variationIndex) => {
                const comp = activePoint.comparisons?.find((c) => c.variant === variation);
                if (!comp) return null;
                const color = lineColors[variationIndex % lineColors.length];
                return (
                  <div key={variation} style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="timeseries-swatch" style={{ background: color }} />
                        <span>{getVariationLabel(variation, variations)} vs {getVariationLabel(row.baseline_variant, variations)}</span>
                      </div>
                      <strong>{formatValue(comp.relative_lift, "percent")}</strong>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)", paddingLeft: "20px" }}>
                      CI {formatValue(comp.ci_low, "percent")} to {formatValue(comp.ci_high, "percent")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div className="timeseries-legend">
        {treatmentVariants.map((variation, variationIndex) => (
          <div key={variation} className="timeseries-legend-item">
            <span className="timeseries-swatch" style={{ background: lineColors[variationIndex % lineColors.length] }} />
            <span>{getVariationLabel(variation, variations)} vs {getVariationLabel(row.baseline_variant, variations)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
