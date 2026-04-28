"use client";

import { useEffect, useState, useTransition } from "react";

import { calculatePower } from "../lib/api";
import { PowerCalculatorResponse } from "../lib/types";

type MetricType = "conversion" | "continuous";

function formatCount(value: number) {
  return Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function PowerCalculatorPage() {
  const [metricType, setMetricType] = useState<MetricType>("conversion");
  const [variantCount, setVariantCount] = useState(2);
  const [baselineRate, setBaselineRate] = useState(0.1);
  const [baselineMean, setBaselineMean] = useState(25);
  const [baselineStddev, setBaselineStddev] = useState(30);
  const [mde, setMde] = useState(0.05);
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [result, setResult] = useState<PowerCalculatorResponse | null>(null);
  const [status, setStatus] = useState("Choose inputs to compute required sample size.");
  const [isPending, startTransition] = useTransition();

  const runCalculation = () => {
    startTransition(async () => {
      try {
        setStatus("Computing required sample size...");
        const response = await calculatePower({
          metric_type: metricType,
          variant_count: variantCount,
          baseline_rate: metricType === "conversion" ? baselineRate : undefined,
          baseline_mean: metricType === "continuous" ? baselineMean : undefined,
          baseline_stddev: metricType === "continuous" ? baselineStddev : undefined,
          mde,
          alpha,
          power,
        });
        setResult(response);
        setStatus("Power calculation ready.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Power calculation failed.");
      }
    });
  };

  useEffect(() => {
    runCalculation();
  }, [metricType]);

  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Planning</div>
          <h1>Power Calculator</h1>
        </div>
      </header>

      <section className="headline-grid">
        <div className="headline-panel">
          <div className="section-tag">Use Case</div>
          <h2>Estimate required sample size for conversion-rate tests and continuous metrics.</h2>
          <p>
            Use this page to scope experiment size before launch. Conversion calculations use a two-proportion normal
            approximation, while continuous calculations use the standard equal-variance normal approximation.
          </p>
          <div className="summary-note">
            Choose the number of planned variants to scale the total sample estimate for multivariant experiments.
          </div>
        </div>
        <div className="headline-panel">
          <div className="section-tag">Status</div>
          <div className="status-panel">
            <p>{status}</p>
            <div className="headline-actions">
              <button className="button button-primary" disabled={isPending} onClick={runCalculation}>
                Recompute
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-tag">Inputs</div>
              <h3>Experiment Assumptions</h3>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Metric type</label>
              <select value={metricType} onChange={(event) => setMetricType(event.target.value as MetricType)}>
                <option value="conversion">Conversion metric</option>
                <option value="continuous">Revenue / continuous metric</option>
              </select>
            </div>

            <div className="field">
              <label>Number of variants</label>
              <input
                type="number"
                min={2}
                max={20}
                step={1}
                value={variantCount}
                onChange={(event) => setVariantCount(Number(event.target.value))}
              />
            </div>

            {metricType === "conversion" ? (
              <div className="field">
                <label>Baseline conversion rate</label>
                <input
                  type="number"
                  min={0.0001}
                  max={0.9999}
                  step={0.0001}
                  value={baselineRate}
                  onChange={(event) => setBaselineRate(Number(event.target.value))}
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Baseline average metric value</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={baselineMean}
                    onChange={(event) => setBaselineMean(Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Baseline standard deviation</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={baselineStddev}
                    onChange={(event) => setBaselineStddev(Number(event.target.value))}
                  />
                </div>
              </>
            )}

            <div className="field">
              <label>Relative MDE</label>
              <input type="number" min={0.0001} max={0.99} step={0.0001} value={mde} onChange={(event) => setMde(Number(event.target.value))} />
            </div>
            <div className="field two-up">
              <div>
                <label>Alpha</label>
                <input type="number" min={0.0001} max={0.5} step={0.0001} value={alpha} onChange={(event) => setAlpha(Number(event.target.value))} />
              </div>
              <div>
                <label>Power</label>
                <input type="number" min={0.5} max={0.9999} step={0.0001} value={power} onChange={(event) => setPower(Number(event.target.value))} />
              </div>
            </div>
          </div>
        </section>

        <section className="main">
          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="section-tag">Output</div>
                <h3>Required Sample Size</h3>
              </div>
            </div>

            <div className="metric-ribbon">
              <div className="metric-tile emphasis">
                <small>Per variation</small>
                <strong>{result ? formatCount(result.required_per_variation) : "n/a"}</strong>
                <small>Minimum users needed in each arm under the current assumptions.</small>
              </div>
              <div className="metric-tile">
                <small>Variants</small>
                <strong>{result ? result.variant_count : "n/a"}</strong>
                <small>Total planned arms included in the sample estimate.</small>
              </div>
              <div className="metric-tile">
                <small>Total sample</small>
                <strong>{result ? formatCount(result.total_required_sample) : "n/a"}</strong>
                <small>Total planned users across all variants.</small>
              </div>
              <div className="metric-tile">
                <small>Absolute delta</small>
                <strong>
                  {result
                    ? metricType === "conversion"
                      ? formatPercent(result.absolute_delta)
                      : formatNumber(result.absolute_delta)
                    : "n/a"}
                </strong>
                <small>The minimum absolute change implied by your chosen relative MDE.</small>
              </div>
              <div className="metric-tile">
                <small>Expected treatment value</small>
                <strong>
                  {result
                    ? metricType === "conversion"
                      ? formatPercent(result.expected_treatment_value)
                      : formatNumber(result.expected_treatment_value)
                    : "n/a"}
                </strong>
                <small>The treatment benchmark required for the selected effect size.</small>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="section-tag">Interpretation</div>
                <h3>How To Use This Estimate</h3>
              </div>
            </div>
            <div className="docs-content">
              <p>
                Use <strong>per variation</strong> when planning equal traffic allocation. If you expect uneven
                allocation or SRM risk, increase the target sample size before launch. The total sample estimate scales
                with the number of variants you enter above.
              </p>
              <p>
                For conversion metrics, the calculator assumes a two-proportion test with a baseline conversion rate and
                a relative minimum detectable lift. For continuous metrics like revenue, it assumes a mean-based test
                with known baseline variance.
              </p>
            </div>
          </section>
        </section>
      </section>
    </div>
  );
}
