"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { listExperiments, seedDemoPortfolio } from "../lib/api";
import { ExperimentSummary } from "../lib/types";

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US").format(value);
}

export function ExperimentsIndex() {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("Loading experiments...");

  const refresh = () => {
    startTransition(async () => {
      try {
        const response = await listExperiments();
        setExperiments(response.experiments);
        setStatus(response.experiments.length > 0 ? "Experiments ready." : "No experiments found.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load experiments.");
      }
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const createFreshSimulation = () => {
    startTransition(async () => {
      try {
        setStatus("Generating the SQLite demo warehouse...");
        await seedDemoPortfolio();
        const response = await listExperiments();
        setExperiments(response.experiments);
        setStatus("SQLite demo warehouse ready.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not create a simulation.");
      }
    });
  };

  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">&gt; experimentation-platform</div>
          <h1>Experiments Overview</h1>
        </div>
      </header>

      <section className="toolbar-panel">
        <div className="toolbar-row">
          <button className="button button-secondary">Filter</button>
          <div className="date-nav">
            <button className="icon-button" aria-label="Previous range">
              &lt;
            </button>
            <button className="icon-button" aria-label="Next range">
              &gt;
            </button>
          </div>
          <button className="button button-secondary">Last 30 days</button>
        </div>
        <div className="toolbar-row toolbar-row-end">
          <button className="button button-primary" disabled={isPending} onClick={refresh}>
            Refresh
          </button>
          <button className="button button-secondary" disabled={isPending} onClick={createFreshSimulation}>
            {experiments.length === 0 ? "Seed Demo Data" : "Reseed"}
          </button>
        </div>
      </section>

      <section className="metric-ribbon">
        <div className="metric-tile emphasis">
          <small>Experiments</small>
          <strong>{experiments.length}</strong>
          <small>{status}</small>
        </div>
        <div className="metric-tile">
          <small>Status</small>
          <strong>{isPending ? "Syncing" : "Ready"}</strong>
          <small>Registry sync state</small>
        </div>
        <div className="metric-tile">
          <small>Warehouse</small>
          <strong>Multi-source</strong>
          <small>Built-in sample plus connected sources</small>
        </div>
        <div className="metric-tile">
          <small>Latest metric date</small>
          <strong>{experiments[0]?.latest_metric_date ?? "n/a"}</strong>
          <small>Most recent batch observed</small>
        </div>
        <div className="metric-tile">
          <small>Total users</small>
          <strong>{formatNumber(experiments.reduce((sum, experiment) => sum + experiment.users, 0))}</strong>
          <small>Across all seeded experiments</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="section-tag">Traffic</div>
            <h3>Experiment Registry</h3>
          </div>
          <div className="panel-caption">Open an experiment to inspect lift, diagnostics, time series, and dimension slices.</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Source</th>
                <th>Variants</th>
                <th>Users</th>
                <th>Start Date</th>
                <th>Latest Metric Date</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((experiment) => (
                <tr key={experiment.experiment_id}>
                  <td>
                    <div className="table-primary">{experiment.display_experiment_id}</div>
                    <div className="table-secondary">Warehouse-backed experiment</div>
                  </td>
                  <td>
                    <span className="table-chip">{experiment.source_name}</span>
                  </td>
                  <td>
                    <span className="table-chip">{experiment.variant_count} variants</span>
                  </td>
                  <td>{formatNumber(experiment.users)}</td>
                  <td>{experiment.start_date}</td>
                  <td>{experiment.latest_metric_date ?? "n/a"}</td>
                  <td>
                    <Link
                      className="inline-link"
                      href={`/experiments/${encodeURIComponent(experiment.experiment_id)}?source=${encodeURIComponent(experiment.source_name)}&label=${encodeURIComponent(experiment.display_experiment_id)}`}
                    >
                      View experiment
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {experiments.length === 0 ? (
            <div className="empty-state">No experiments available yet. Click "Seed Demo Data" to generate the SQLite demo warehouse.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
