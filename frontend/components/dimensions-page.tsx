"use client";

import { useEffect, useState, useTransition } from "react";

import { listDimensions } from "../lib/api";
import { DimensionItem } from "../lib/types";

export function DimensionsPage() {
  const [dimensions, setDimensions] = useState<DimensionItem[]>([]);
  const [status, setStatus] = useState("Loading dimensions...");
  const [showSql, setShowSql] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      try {
        const response = await listDimensions();
        setDimensions(response.dimensions);
        setStatus("Dimensions loaded.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load dimensions.");
      }
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="console">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">Catalog</div>
          <h1>Dimensions</h1>
        </div>
      </header>

      <section className="headline-grid">
        <div className="headline-panel">
          <div className="section-tag">Schema</div>
          <h2>Warehouse dimensions available for balance checks, splits, and experiment diagnostics.</h2>
          <p>
            Country and MCC values are exposed here so you can verify the dimensions available for allocation checks
            and grouped experiment views.
          </p>
          <div className="summary-note">
            These dimensions feed SRM-adjacent balance checks and split views rather than standalone metric logic.
          </div>
        </div>
        <div className="headline-panel">
          <div className="section-tag">Status</div>
          <div className="status-panel">
            <p>{isPending ? "Refreshing dimensions..." : status}</p>
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
            <div className="section-tag">Schema</div>
            <h3>Available Dimensions</h3>
          </div>
          <div className="panel-caption">Distinct values indicate the shape of the dimensional catalog in the demo warehouse.</div>
        </div>
        {showSql && dimensions[0] ? (
          <div className="sql-panel">
            <div className="sql-panel-header">
              <span className="section-tag">Source Query</span>
              <span className="table-secondary">Representative pull for the dimension catalog</span>
            </div>
            <pre className="sql-block">{dimensions[0].sql_query}</pre>
          </div>
        ) : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Distinct Values</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dimension) => (
                <tr key={dimension.dimension_name}>
                  <td>{dimension.dimension_name}</td>
                  <td>{dimension.distinct_values}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
