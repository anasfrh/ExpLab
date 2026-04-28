export default function DocsPage() {
  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Documentation</div>
          <h1>How To Use The Platform</h1>
        </div>
      </header>

      <section className="panel docs-content">
        <div className="panel-header">
          <div>
            <div className="section-tag">Getting Started</div>
            <h3>Workflow</h3>
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
          Each row is a metric. Variant columns show the observed value for each variant. Relative lift and p-values are
          reported as pairwise comparisons against <strong>Variant 1</strong>.
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
          Dimensions expose the shared slicing schema used by the warehouse. They describe what attributes are available
          for balance checks and future segmentation.
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
      </section>
    </div>
  );
}
