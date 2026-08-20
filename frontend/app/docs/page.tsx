const toc = [
  ["overview", "1. What ExpLab does"],
  ["workflow", "2. Typical workflow"],
  ["warehouse", "3. Required warehouse tables"],
  ["joins", "4. How ExpLab builds an analysis dataset"],
  ["metrics", "5. Metric types and windows"],
  ["statistics", "6. Statistical methods"],
  ["thresholds", "7. Thresholds and data requirements"],
  ["power", "8. Power and sample size"],
  ["metadata", "9. Internal metadata tables"],
  ["mistakes", "10. Common mistakes"],
] as const;

const requiredTables = [
  {
    name: "experiments",
    purpose: "Assignment log. It tells ExpLab which user entered which experiment and which variant they saw.",
    grain: "One row per exposure or assignment event.",
    columns: [
      ["user_id", "Stable user identifier used across every table."],
      ["experiment_id", "Stable experiment key such as `checkout_header_test`."],
      ["variation_id", "Variant label such as `Variant 1`, `Control`, or `Treatment B`."],
      ["timestamp", "Exposure time. ExpLab uses this to start post-exposure windows."],
    ],
  },
  {
    name: "metrics",
    purpose: "Continuous or count-style outcomes such as revenue, gross profit, orders, sessions, items, or latency.",
    grain: "One row per user, metric, and date.",
    columns: [
      ["user_id", "Stable user identifier that joins back to `experiments`."],
      ["metric_name", "Metric family name such as `revenue`, `gross_profit`, or `latency`."],
      ["value", "Numeric observation for that user and date."],
      ["date", "Observation date used for analysis windows."],
    ],
  },
  {
    name: "conversion_events",
    purpose: "Binary events such as purchase, signup completion, add to cart, or checkout start.",
    grain: "One row per event occurrence.",
    columns: [
      ["user_id", "Stable user identifier."],
      ["event_name", "Event name such as `purchase` or `signup_complete`."],
      ["timestamp", "Event time used for conversion windows."],
    ],
  },
  {
    name: "dimensions",
    purpose: "User attributes used for SRM diagnostics, balance checks, and segmentation.",
    grain: "One current row per user.",
    columns: [
      ["user_id", "Stable user identifier."],
      ["country_code", "Example segment column."],
      ["mcc", "Example business or merchant category column."],
      ["os", "Example operating system column."],
    ],
  },
] as const;

const metadataTables = [
  ["metric_definitions", "Catalog of reusable metrics, SQL expressions, formats, directions, default windows, and default winsorization."],
  ["conversion_event_settings", "Default conversion windows for reusable event names."],
  ["experiment_metric_overrides", "Per-experiment overrides for metric windows and winsorization."],
  ["global_analysis_settings", "Global minimum users and minimum conversions per leg before statistical testing is allowed."],
  ["experiment_analysis_overrides", "Per-experiment overrides for those global analysis thresholds."],
  ["users", "Application users and permissions."],
] as const;

const setupPrinciples = [
  "Use the same `user_id` in every warehouse-facing table.",
  "Keep `experiments.timestamp` immutable. It is the anchor for post-exposure analysis.",
  "Store metrics in tall format. Do not create one very wide table with hundreds of metric columns.",
  "Store events at event level. Do not pre-aggregate them if you want flexible conversion windows.",
  "Keep one row in `dimensions` for every user who appears in `experiments`.",
];

const commonMistakes = [
  "Using different user IDs across assignment, metric, event, and dimension tables.",
  "Writing aggregate rows by variant instead of user-level rows.",
  "Including metric values that happened before exposure in the post-exposure window.",
  "Changing variant labels during the life of an experiment.",
  "Having multiple rows for one user in `dimensions`.",
  "Treating count metrics as already-normalized rates before loading them into ExpLab.",
];

export default function DocsPage() {
  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Documentation</div>
          <h1>ExpLab Documentation</h1>
        </div>
      </header>

      <section className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Table Of Contents</div>
            <h3>Read this page in order or jump to one section</h3>
          </div>
        </div>
        <div className="docs-grid docs-grid-compact">
          {toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="docs-card docs-card-compact inline-link">
              {label}
            </a>
          ))}
        </div>
      </section>

      <section id="overview" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Overview</div>
            <h3>1. What ExpLab does</h3>
          </div>
        </div>
        <p>
          ExpLab is a warehouse-native experimentation tool. It starts from user-level experiment exposure data, joins
          user-level metrics and event data, and then computes lift, confidence intervals, p-values, sample ratio
          mismatch checks, dimension balance checks, and power planning outputs.
        </p>
        <p>
          The platform is designed around one simple rule: if you can tell ExpLab which user saw which variant, what
          that user did after exposure, and which attributes describe that user, ExpLab can analyze the experiment.
        </p>
        <div className="docs-callout">
          <strong>Important data model rule</strong>
          <p>
            ExpLab analyzes <strong>user-level rows</strong>. It does not expect pre-aggregated rows by variant. The
            analysis engine needs one value per user per metric window.
          </p>
        </div>
      </section>

      <section id="workflow" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Workflow</div>
            <h3>2. Typical workflow</h3>
          </div>
        </div>
        <div className="docs-steps">
          <div className="docs-step">
            <span>1</span>
            <p>Open the Experiments page to see the experiment registry, user counts, variant counts, and metric recency.</p>
          </div>
          <div className="docs-step">
            <span>2</span>
            <p>Open one experiment to see metric rows, pairwise lift against the baseline variant, checks, and optional time series.</p>
          </div>
          <div className="docs-step">
            <span>3</span>
            <p>Choose primary, secondary, and guardrail metrics. ExpLab applies multiple-testing correction across primary and secondary comparisons.</p>
          </div>
          <div className="docs-step">
            <span>4</span>
            <p>Edit experiment-specific metric windows or winsorization settings when needed. Conversion-event metrics allow window overrides only.</p>
          </div>
          <div className="docs-step">
            <span>5</span>
            <p>Use the checks panel to review sample ratio mismatch, multiple exposure warnings, and dimension balance diagnostics.</p>
          </div>
        </div>
      </section>

      <section id="warehouse" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Warehouse Setup</div>
            <h3>3. Required warehouse tables</h3>
          </div>
          <div className="panel-caption">
            ExpLab reads four warehouse-facing tables and stores its own metadata tables separately.
          </div>
        </div>

        <div className="docs-grid">
          {requiredTables.map((table) => (
            <article key={table.name} className="docs-card">
              <div className="docs-card-header">
                <code>{table.name}</code>
              </div>
              <p>{table.purpose}</p>
              <p>
                <strong>Grain:</strong> {table.grain}
              </p>
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map(([column, description]) => (
                    <tr key={column}>
                      <td>
                        <code>{column}</code>
                      </td>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>

        <h4>Recommended SQL DDL</h4>
        <pre className="docs-code-block">
          <code>{`CREATE TABLE experiments (
  user_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  variation_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL
);

CREATE TABLE metrics (
  user_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  date DATE NOT NULL
);

CREATE TABLE conversion_events (
  user_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL
);

CREATE TABLE dimensions (
  user_id TEXT PRIMARY KEY,
  country_code TEXT,
  mcc TEXT,
  os TEXT
);`}</code>
        </pre>
      </section>

      <section id="joins" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Analysis Dataset</div>
            <h3>4. How ExpLab builds an analysis dataset</h3>
          </div>
        </div>
        <p>
          ExpLab starts from the <code>experiments</code> table. For one experiment, it builds a list of exposed users,
          their variant, and their exposure date. This is the base population for the analysis.
        </p>
        <div className="docs-steps">
          <div className="docs-step">
            <span>1</span>
            <p>Load all exposed users for the selected experiment from <code>experiments</code>.</p>
          </div>
          <div className="docs-step">
            <span>2</span>
            <p>Join <code>dimensions</code> on <code>user_id</code> so balance checks and dimension splits can run.</p>
          </div>
          <div className="docs-step">
            <span>3</span>
            <p>For continuous metrics, join <code>metrics</code> within the configured post-exposure window and aggregate to one numeric value per user.</p>
          </div>
          <div className="docs-step">
            <span>4</span>
            <p>For conversion metrics, join <code>conversion_events</code> within the configured post-exposure window and mark each user as converted or not converted.</p>
          </div>
          <div className="docs-step">
            <span>5</span>
            <p>Group those user-level values by variant and compute comparisons against the baseline variant.</p>
          </div>
        </div>
        <div className="docs-callout docs-callout-muted">
          <strong>Baseline rule</strong>
          <p>
            ExpLab sorts variants and treats the first variant as the baseline. Most comparisons are reported as
            “selected treatment versus baseline”.
          </p>
        </div>
      </section>

      <section id="metrics" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Metrics</div>
            <h3>5. Metric types and windows</h3>
          </div>
        </div>

        <h4>Continuous metrics</h4>
        <p>
          Continuous metrics come from the <code>metrics</code> table. A metric definition provides a SQL expression
          such as revenue sum, gross profit sum, or average latency. ExpLab applies that SQL expression at the
          <strong> user level</strong> inside the post-exposure window.
        </p>
        <p>
          If a user has no matching metric rows, that user is still part of the denominator because the engine starts
          from the exposed user set and uses a left join. In practice this means the user contributes a value of
          <code>0</code> for sum-based metrics unless the SQL expression defines a different behavior.
        </p>

        <h4>Conversion metrics</h4>
        <p>
          Conversion metrics come from the <code>conversion_events</code> table. A user is marked as converted if at
          least one event with the chosen <code>event_name</code> occurs inside the post-exposure window. In code,
          this becomes a user-level binary value of <code>1.0</code> or <code>0.0</code>.
        </p>

        <h4>Metric windows</h4>
        <p>
          Every metric has a default analysis window. Conversion metrics also have default event windows. You can
          override those defaults at the experiment level. ExpLab always uses the resolved window for that metric and
          experiment.
        </p>

        <h4>Winsorization</h4>
        <p>
          Continuous metrics may be winsorized. ExpLab computes one percentile threshold across all user-level values
          in the compared groups and clips values above that threshold down to the threshold. This reduces the impact of
          extreme outliers without removing the users from the sample.
        </p>
        <p>
          Conversion-event metrics are not winsorized.
        </p>
      </section>

      <section id="statistics" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Statistics</div>
            <h3>6. Statistical methods</h3>
          </div>
        </div>

        <h4>User-level means</h4>
        <p>
          For each variant, ExpLab computes the mean of the user-level values. For continuous metrics, that is the mean
          of the per-user metric values in the selected window. For conversion metrics, that is the mean of the binary
          conversion flags, which is the conversion rate.
        </p>

        <h4>Relative lift</h4>
        <p>
          Relative lift is computed as:
        </p>
        <pre className="docs-code-block">
          <code>{`relative_lift = (treatment_mean - control_mean) / control_mean`}</code>
        </pre>
        <p>
          If the baseline mean is zero, ExpLab returns a relative lift of <code>0.0</code> to avoid dividing by zero.
        </p>

        <h4>P-values</h4>
        <p>
          ExpLab uses <strong>Welch’s two-sample t-test</strong> for metric comparisons. In code, this is
          <code>ttest_ind(..., equal_var=False)</code>. Welch’s t-test is more robust than the equal-variance t-test
          when the two groups have different variances.
        </p>
        <p>
          The test runs on the full user-level vectors for baseline and treatment after any winsorization has been
          applied. For conversion metrics, those user-level vectors are binary <code>0</code> and <code>1</code>
          values, so the same Welch test is still used on those user-level outcomes. If the p-value returned by the
          library is <code>NaN</code>, ExpLab converts it to <code>1.0</code>.
        </p>

        <h4>Confidence intervals</h4>
        <p>
          ExpLab reports a 95% confidence interval for relative lift. The interval is computed with a
          <strong> delta-method approximation</strong>. In simple terms, ExpLab first estimates the uncertainty of the
          relative-lift formula using the sample variance of the baseline group and treatment group, then builds the
          interval as:
        </p>
        <pre className="docs-code-block">
          <code>{`relative_lift ± 1.96 × se_lift`}</code>
        </pre>
        <p>
          The standard error <code>se_lift</code> is computed as follows:
        </p>
        <pre className="docs-code-block">
          <code>{`baseline_var = sample variance of baseline user values
treatment_var = sample variance of treatment user values
var_mu_t = treatment_var / n_treatment
var_mu_c = baseline_var / n_control

var_lift =
  (var_mu_t / control_mean^2) +
  (treatment_mean^2 * var_mu_c / control_mean^4)

se_lift = sqrt(var_lift)
ci_low = relative_lift - 1.96 * se_lift
ci_high = relative_lift + 1.96 * se_lift`}</code>
        </pre>
        <p>
          This is the same delta-method formula used in the analysis engine. It is a normal approximation on the
          relative-lift scale and is used for both continuous metrics and binary conversion metrics because both are
          represented as user-level numeric vectors.
        </p>

        <h4>Multiple testing correction</h4>
        <p>
          When more than one primary or secondary comparison is shown, ExpLab applies a multiple-testing correction
          within each category separately. In other words, primary comparisons are corrected together and secondary
          comparisons are corrected together. Supported methods are:
        </p>
        <ul className="docs-list">
          <li><strong>Benjamini-Hochberg</strong> for false discovery rate control.</li>
          <li><strong>Bonferroni</strong> for stricter family-wise error control.</li>
        </ul>
        <p>
          Guardrail metrics still show descriptive values such as means and lift, but ExpLab does not treat them as
          formal decision metrics in the same way. P-values and confidence intervals are intentionally suppressed for
          guardrail comparisons in the results view.
        </p>

        <h4>Sample ratio mismatch</h4>
        <p>
          ExpLab checks whether observed traffic allocation matches the equal-allocation expectation. It computes a
          chi-square statistic from observed and expected variant counts, then converts that to a p-value using the
          chi-square survival function.
        </p>
        <pre className="docs-code-block">
          <code>{`expected_per_variant = total_exposed_users / number_of_variants
statistic = sum((observed - expected)^2 / expected)
p_value = chi-square survival function(statistic, df = variants - 1)`}</code>
        </pre>
        <p>
          ExpLab flags SRM as critical when <code>p_value &lt; 0.01</code>.
        </p>

        <h4>Dimension balance checks</h4>
        <p>
          For each dimension, ExpLab builds a contingency table of dimension bucket by variant and runs a chi-square
          test of independence. This tells you whether the distribution of that dimension looks materially different
          across variants.
        </p>

        <h4>Multiple exposures</h4>
        <p>
          ExpLab also checks whether a single user appears in more than one variant for the same experiment. If so, the
          platform flags that as a multiple-exposure warning because it can violate experiment assumptions.
        </p>
      </section>

      <section id="thresholds" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Readiness Rules</div>
            <h3>7. Thresholds and data requirements</h3>
          </div>
        </div>
        <p>
          ExpLab can be configured to require a minimum number of users per leg and a minimum number of conversions per
          leg before formal testing is allowed.
        </p>
        <p>
          For conversion metrics, “conversions” means users whose binary conversion flag is <code>1</code>. For
          continuous metrics, ExpLab interprets the second threshold as users with non-zero metric values.
        </p>
        <p>
          If a comparison does not meet the configured thresholds, ExpLab still shows descriptive values such as means
          and lift, but it suppresses the p-value and confidence interval and explains why the comparison is not ready.
        </p>
      </section>

      <section id="power" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Planning</div>
            <h3>8. Power and sample size</h3>
          </div>
        </div>

        <h4>Continuous metrics</h4>
        <p>
          For continuous metrics, ExpLab uses the standard two-arm normal approximation:
        </p>
        <pre className="docs-code-block">
          <code>{`absolute_delta = baseline_mean * mde
required_per_arm =
  2 * (z_(1-alpha/2) + z_power)^2 * baseline_stddev^2 / absolute_delta^2`}</code>
        </pre>

        <h4>Conversion metrics</h4>
        <p>
          For binary outcomes, ExpLab uses a two-proportion power approximation based on the baseline rate, expected
          treatment rate, alpha, and target power.
        </p>
        <p>
          In both cases, the UI returns required users per variation and the total sample required for the whole
          experiment.
        </p>
      </section>

      <section id="metadata" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Metadata</div>
            <h3>9. Internal metadata tables</h3>
          </div>
        </div>
        <p>
          These tables are managed by ExpLab. They are not required in your product warehouse.
        </p>
        <div className="docs-grid docs-grid-compact">
          {metadataTables.map(([name, purpose]) => (
            <article key={name} className="docs-card docs-card-compact">
              <div className="docs-card-header">
                <code>{name}</code>
              </div>
              <p>{purpose}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="mistakes" className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Operational Notes</div>
            <h3>10. Common mistakes</h3>
          </div>
        </div>

        <h4>Setup principles</h4>
        <ul className="docs-list">
          {setupPrinciples.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>

        <h4>Mistakes to avoid</h4>
        <ul className="docs-list">
          {commonMistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>

        <div className="docs-callout docs-callout-muted">
          <strong>Practical rule of thumb</strong>
          <p>
            If you can answer “which users saw which variant, what did each user do after exposure, and which user
            attributes are available for checks and splits?” with clean joins on <code>user_id</code>, your data model
            is in the right shape for ExpLab.
          </p>
        </div>
      </section>
    </div>
  );
}
