"use client";

import { useEffect, useState, useTransition } from "react";

import { listConversionEvents, updateConversionEventDefaults } from "../lib/api";
import { ConversionEventItem } from "../lib/types";

export function ConversionEventsPage() {
  const [events, setEvents] = useState<ConversionEventItem[]>([]);
  const [status, setStatus] = useState("Loading events...");
  const [showSql, setShowSql] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      try {
        const response = await listConversionEvents();
        setEvents(response.conversion_events);
        setStatus("Event defaults loaded.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load conversion events.");
      }
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const updateEvent = (eventName: string, window: number) => {
    startTransition(async () => {
      try {
        await updateConversionEventDefaults(eventName, { default_window_days: window });
        refresh();
        setStatus("Conversion window updated.");
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
          <h1>Conversion Events</h1>
        </div>
      </header>

      <section className="headline-grid">
        <div className="headline-panel">
          <div className="section-tag">Defaults</div>
          <h2>Event definitions with shared conversion windows and reusable analysis defaults.</h2>
          <p>
            Conversion event settings apply wherever the event is used, unless an experiment explicitly overrides the
            window in the results table.
          </p>
          <div className="summary-note">
            Conversion events only carry a conversion window. Winsorization stays reserved for numeric metrics.
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
            <h3>Available Events</h3>
          </div>
          <div className="panel-caption">Event defaults propagate across the platform until an experiment overrides them.</div>
        </div>
        {showSql && events[0] ? (
          <div className="sql-panel">
            <div className="sql-panel-header">
              <span className="section-tag">Source Query</span>
              <span className="table-secondary">Representative pull for the event catalog</span>
            </div>
            <pre className="sql-block">{events[0].sql_query}</pre>
          </div>
        ) : null}
        <div className="settings-list">
          {events.map((event) => (
            <ConversionEventRow key={event.event_name} event={event} onSave={updateEvent} pending={isPending} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ConversionEventRow({
  event,
  onSave,
  pending,
}: {
  event: ConversionEventItem;
  onSave: (eventName: string, window: number) => void;
  pending: boolean;
}) {
  const [window, setWindow] = useState(event.default_window_days);

  useEffect(() => {
    setWindow(event.default_window_days);
  }, [event.default_window_days]);

  return (
    <div className="settings-row">
      <div className="settings-copy">
        <div className="table-primary">{event.event_name}</div>
        <div className="table-secondary">{event.usage_count} observed events</div>
        <div className="row-flags">
          <span className="mini-badge mini-badge-neutral">{window}d conversion window</span>
        </div>
      </div>
      <div className="settings-controls">
        <label>
          Conversion window
          <input type="number" min={1} max={30} value={window} onChange={(e) => setWindow(Number(e.target.value))} />
        </label>
        <button className="button button-primary" disabled={pending} onClick={() => onSave(event.event_name, window)}>
          Save
        </button>
      </div>
    </div>
  );
}
