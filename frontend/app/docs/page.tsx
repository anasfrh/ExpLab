const requiredTables = [
  {
    name: "experiments",
    purpose: "Assignment log. Tells ExpLab which user entered which experiment and which variant they saw.",
    grain: "One row per exposure or assignment event.",
    columns: [
      ["user_id", "Stable user identifier used across every table."],
      ["experiment_id", "Unique experiment key such as `checkout_header_test`."],
      ["variation_id", "Variant label such as `Variant 1`, `Control`, or `Treatment B`."],
      ["timestamp", "When the user first entered that experiment."],
    ],
  },
  {
    name: "metrics",
    purpose: "Continuous or count-style outcomes such as revenue, sessions, orders, latency, or margin.",
    grain: "One row per user, metric, and date.",
    columns: [
      ["user_id", "Stable user identifier that joins back to `experiments`."],
      ["metric_name", "Metric family name such as `revenue`, `orders`, or `latency`."],
      ["value", "Numeric metric value for that user and day."],
      ["date", "Metric observation date used for experiment windows."],
    ],
  },
  {
    name: "conversion_events",
    purpose: "Event log for binary metrics such as purchase, signup completion, or checkout start.",
    grain: "One row per event occurrence.",
    columns: [
      ["user_id", "Stable user identifier."],
      ["event_name", "Event name such as `purchase` or `signup_complete`."],
      ["timestamp", "Exact event time used for conversion windows."],
    ],
  },
  {
    name: "dimensions",
    purpose: "User attributes used for SRM diagnostics, balance checks, and segmentation.",
    grain: "One current row per user.",
    columns: [
      ["user_id", "Stable user identifier."],
      ["country_code", "Example segment column."],
      ["mcc", "Example merchant category or business segment column."],
      ["os", "Example operating system column."],
    ],
  },
];

const metadataTables = [
  {
    name: "metric_definitions",
    purpose: "Catalog of reusable metrics, their SQL expressions, formats, and default windows.",
  },
  {
    name: "conversion_event_settings",
    purpose: "Default conversion windows by event name.",
  },
  {
    name: "experiment_metric_overrides",
    purpose: "Per-experiment overrides for analysis windows and winsorization.",
  },
  {
    name: "users",
    purpose: "Application users and permissions for the ExpLab UI.",
  },
];

const setupPrinciples = [
  "Use the same `user_id` in every warehouse-facing table.",
  "Store experiment exposure time in `experiments.timestamp` and keep it immutable.",
  "Store metrics in tall format instead of one wide row with many metric columns.",
  "Keep conversion events event-level. Do not pre-aggregate them into counts if you want flexible windows.",
  "Keep at least one row in `dimensions` for every exposed user so balance checks can run.",
];

const commonMistakes = [
  "Multiple rows for the same user in `dimensions`, which breaks the one-user join shape.",
  "Using different user identifiers across assignment, metric, and event tables.",
  "Writing daily aggregates by variant instead of user-level rows.",
  "Backfilling metrics that occurred before exposure into the post-exposure window.",
  "Changing variant labels mid-experiment instead of keeping a stable `variation_id`.",
];

export default function DocsPage() {
  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Documentation</div>
          <h1>Database Setup For ExpLab</h1>
        </div>
      </header>

      <section className="panel docs-content docs-stack">
        <div className="panel-header">
          <div>
            <div className="section-tag">Getting Started</div>
            <h3>How To Use The Platform</h3>
          </div>
        </div>

        <p>
          Start on the <strong>Experiments</strong> page to browse the registry. Open an experiment to inspect
          multivariant results, compare metrics across variants, and apply experiment-specific overrides.
        </p>

        <h4>Experiments</h4>
        <p>
          The experiments registry shows user counts, variant counts, and metric recency. Select an experiment to open
          the detailed results view.
        </p>

        <h4>Experiment Results</h4>
        <p>
          Each row is a metric. Variant columns show the observed value for each variant. Relative lift and p-values
          are reported as pairwise comparisons against <strong>Variant 1</strong>.
        </p>
        <p>
          Use the edit icon on a row to override that metric’s window for the current experiment. Metric rows may also
          support winsorization. Conversion-event rows support conversion window overrides only.
        </p>

        <h4>Metrics</h4>
        <p>
          The metrics catalog controls global defaults for reusable metric definitions. Changes made there apply
          everywhere unless an experiment-level override exists.
        </p>

        <h4>Conversion Events</h4>
        <p>
          The conversion events page defines global conversion windows for reusable events. Those defaults apply to all
          experiments unless overridden within an experiment.
        </p>

        <h4>Dimensions</h4>
        <p>
          Dimensions expose the shared slicing schema used by the warehouse. They describe what attributes are
          available for balance checks and future segmentation.
        </p>

        <h4>Power Calculator</h4>
        <p>
          The power calculator supports both conversion metrics and revenue or other continuous metrics. Use it to
          estimate the users required per variation before you launch an experiment.
        </p>

        <h4>Statistics</h4>
        <p>
          Sample Ratio Mismatch is shown beneath the results table. When multiple comparisons are displayed,
          Benjamini-Hochberg multiple testing correction is applied and explicitly noted.
        </p>

        <div className="panel-header">
          <div>
            <div className="section-tag">Warehouse Setup</div>
            <h3>How your database should be structured</h3>
          </div>
          <div className="panel-caption">
            ExpLab analyzes experiments from four warehouse-facing tables and manages its own metric metadata
            separately.
          </div>
        </div>

        <p>
          ExpLab expects a warehouse-native, user-level schema. The core idea is simple: one table for experiment
          assignments, one table for numeric metrics, one table for conversion events, and one table for user
          dimensions. If those four tables share the same <strong>user identifier</strong>, ExpLab can join them to
          run lift analysis, sample ratio mismatch checks, dimension balance checks, and conversion-window logic.
        </p>

        <div className="docs-callout">
          <strong>Minimum viable connection model</strong>
          <p>
            If you can provide <code>experiments</code>, <code>metrics</code>, <code>conversion_events</code>, and{" "}
            <code>dimensions</code> in the shapes shown below, your warehouse is ready for ExpLab.
          </p>
        </div>

        <h4>Architecture Overview</h4>
        <div className="diagram-flow" aria-label="Architecture overview">
          <div className="diagram-node">
            <span className="diagram-label">Your Warehouse</span>
            <strong>Assignments + Metrics + Events + Dimensions</strong>
          </div>
          <div className="diagram-arrow" aria-hidden="true">
            →
          </div>
          <div className="diagram-node">
            <span className="diagram-label">ExpLab</span>
            <strong>Metric catalog + analysis engine</strong>
          </div>
          <div className="diagram-arrow" aria-hidden="true">
            →
          </div>
          <div className="diagram-node">
            <span className="diagram-label">Outputs</span>
            <strong>Lift, p-values, SRM, balance, power planning</strong>
          </div>
        </div>

        <h4>Required Warehouse Tables</h4>
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
                    <th>What ExpLab expects</th>
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

        <h4>Relationship Diagram</h4>
        <div className="schema-diagram" aria-label="Warehouse schema relationships">
          <div className="schema-card schema-card-primary">
            <div className="schema-title">
              <code>experiments</code>
            </div>
            <ul>
              <li>
                <code>user_id</code>
              </li>
              <li>
                <code>experiment_id</code>
              </li>
              <li>
                <code>variation_id</code>
              </li>
              <li>
                <code>timestamp</code>
              </li>
            </ul>
          </div>
          <div className="schema-links" aria-hidden="true">
            <span>joins on `user_id`</span>
            <span>joins on `user_id`</span>
            <span>joins on `user_id`</span>
          </div>
          <div className="schema-column">
            <div className="schema-card">
              <div className="schema-title">
                <code>metrics</code>
              </div>
              <ul>
                <li>
                  <code>user_id</code>
                </li>
                <li>
                  <code>metric_name</code>
                </li>
                <li>
                  <code>value</code>
                </li>
                <li>
                  <code>date</code>
                </li>
              </ul>
            </div>
            <div className="schema-card">
              <div className="schema-title">
                <code>conversion_events</code>
              </div>
              <ul>
                <li>
                  <code>user_id</code>
                </li>
                <li>
                  <code>event_name</code>
                </li>
                <li>
                  <code>timestamp</code>
                </li>
              </ul>
            </div>
            <div className="schema-card">
              <div className="schema-title">
                <code>dimensions</code>
              </div>
              <ul>
                <li>
                  <code>user_id</code>
                </li>
                <li>
                  <code>country_code</code>
                </li>
                <li>
                  <code>mcc</code>
                </li>
                <li>
                  <code>os</code>
                </li>
              </ul>
            </div>
          </div>
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

        <h4>How ExpLab Uses Each Table</h4>
        <div className="docs-steps">
          <div className="docs-step">
            <span>1</span>
            <p>
              ExpLab starts from <code>experiments</code> to identify the users in a given experiment and the variant
              each user saw.
            </p>
          </div>
          <div className="docs-step">
            <span>2</span>
            <p>
              It joins <code>dimensions</code> on <code>user_id</code> so it can run balance checks and segmentation.
            </p>
          </div>
          <div className="docs-step">
            <span>3</span>
            <p>
              It reads <code>metrics</code> for continuous outcomes and keeps only post-exposure dates within the
              selected analysis window.
            </p>
          </div>
          <div className="docs-step">
            <span>4</span>
            <p>
              It reads <code>conversion_events</code> for binary outcomes and marks whether each user converted inside
              the configured window.
            </p>
          </div>
        </div>

        <h4>Setup Principles</h4>
        <ul className="docs-list">
          {setupPrinciples.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>

        <h4>ExpLab Metadata Tables</h4>
        <p>
          Besides your warehouse-facing tables, ExpLab stores application metadata that controls how analyses are
          configured. These tables are internal to ExpLab and do not need to come from your product warehouse.
        </p>
        <div className="docs-grid docs-grid-compact">
          {metadataTables.map((table) => (
            <article key={table.name} className="docs-card docs-card-compact">
              <div className="docs-card-header">
                <code>{table.name}</code>
              </div>
              <p>{table.purpose}</p>
            </article>
          ))}
        </div>

        <h4>Example Rows</h4>
        <pre className="docs-code-block">
          <code>{`experiments
user_id   experiment_id          variation_id  timestamp
u_1001    checkout_header_test   Variant 1     2026-05-01T09:00:00
u_1002    checkout_header_test   Variant 2     2026-05-01T09:03:00

metrics
user_id   metric_name  value   date
u_1001    revenue      54.20   2026-05-01
u_1001    sessions     3       2026-05-01
u_1002    revenue      71.00   2026-05-01

conversion_events
user_id   event_name        timestamp
u_1001    purchase          2026-05-02T10:15:00
u_1002    checkout_start    2026-05-01T09:11:00

dimensions
user_id   country_code  mcc   os
u_1001    US            5411  iOS
u_1002    CA            5812  Android`}</code>
        </pre>

        <h4>Common Mistakes To Avoid</h4>
        <ul className="docs-list">
          {commonMistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>

        <div className="docs-callout docs-callout-muted">
          <strong>Practical rule of thumb</strong>
          <p>
            If you can answer “which users saw which variant, what did each user do afterward, and what attributes
            describe those users?” with clean joins on <code>user_id</code>, your database is in the right shape for
            ExpLab.
          </p>
        </div>
      </section>
    </div>
  );
}
