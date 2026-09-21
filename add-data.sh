#!/bin/bash
# Builds the Data screen: how much was captured, how reliable it is, and the
# CSV export. Client only, no server change.
# Run from the repository root:  bash add-data.sh

set -e

if [ ! -d "client/src/screens" ]; then
  echo "No client/src/screens folder here. Run this from the MScProject folder."
  exit 1
fi

# ---- download helper -------------------------------------------------------
cat > client/src/download.js << 'EOF'
import { getToken, ApiError } from "./api.js";

const BASE = import.meta.env.VITE_API_BASE || "";

// The export is behind the same token as everything else, so it cannot be a
// plain link: the file is fetched with the header and handed to the browser.
export async function downloadCsv(name = "scroll-tracker.csv") {
  const response = await fetch(BASE + "/api/export.csv", {
    headers: { Authorization: "Bearer " + getToken() },
  });

  if (!response.ok) throw new ApiError("Export failed (" + response.status + ")", response.status);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
EOF

# ---- styles ----------------------------------------------------------------
cat > client/src/screens/data.css << 'EOF'
/* Styles for the Data screen. */

.figure-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px;
  background: var(--surface);
  border-radius: var(--radius-inner);
}

.figure .number {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
}

.figure .name {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-faint);
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.settings div {
  display: flex;
  justify-content: space-between;
}

.settings b {
  font-weight: 800;
}
EOF

# ---- Data screen -----------------------------------------------------------
cat > client/src/screens/Data.jsx << 'EOF'
import { useEffect, useState } from "react";
import { apiGet } from "../api.js";
import { downloadCsv } from "../download.js";
import "./today.css";
import "./data.css";

function longDate(day) {
  if (!day) return "—";
  return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function percent(part, whole) {
  if (!whole) return "—";
  return Math.round((part / whole) * 100) + "%";
}

function Shell({ children }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <div className="screen-date">Your own records</div>
          <h1>Data</h1>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Data() {
  const [state, setState] = useState({ status: "loading" });
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    apiGet("/api/summary")
      .then((data) => setState({ status: "ready", data }))
      .catch((error) => setState({ status: "error", message: error.message }));
  }, []);

  async function exportCsv() {
    setExporting("working");
    try {
      await downloadCsv();
      setExporting("done");
    } catch {
      setExporting("failed");
    }
  }

  if (state.status === "loading") {
    return (
      <Shell>
        <div className="card muted">Loading…</div>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <div className="card error">{state.message}</div>
      </Shell>
    );
  }

  const { period, capture, checkinsCompleted, config } = state.data;
  const complete = capture.sessions - capture.estimatedSessions;

  return (
    <Shell>
      <section className="card card-stack">
        <div className="card-label">Collected</div>
        <div className="figure-grid">
          <div className="figure">
            <span className="number">{period.days}</span>
            <span className="name">days recorded</span>
          </div>
          <div className="figure">
            <span className="number">{capture.sessions}</span>
            <span className="name">app sessions</span>
          </div>
          <div className="figure">
            <span className="number">{capture.episodes}</span>
            <span className="name">scroll episodes</span>
          </div>
          <div className="figure">
            <span className="number">{period.journalDays}</span>
            <span className="name">days from the paper journal</span>
          </div>
        </div>
        <div className="muted">
          {longDate(period.first)} — {longDate(period.last)}
        </div>
      </section>

      <section className="card card-stack">
        <div className="card-label">How reliable it is</div>
        <div className="inline-row">
          <span className="label">Sessions with a proper close</span>
          <span className="value">
            {complete} · {percent(complete, capture.sessions)}
          </span>
        </div>
        <div className="inline-row">
          <span className="label">Estimated, the close was missed</span>
          <span className="value">{capture.estimatedSessions}</span>
        </div>
        <div className="inline-row">
          <span className="label">Days with a wake marker</span>
          <span className="value">
            {capture.daysWithDeclaredWake} · {percent(capture.daysWithDeclaredWake, period.days)}
          </span>
        </div>
        <div className="inline-row">
          <span className="label">Events discarded as noise</span>
          <span className="value">{capture.droppedEvents}</span>
        </div>
        <div className="muted">
          Estimated sessions are capped at {config.orphanCapMin} minutes rather than
          dropped, and days without a wake marker start at {config.dayBoundaryHour}:00.
        </div>
      </section>

      <section className="card card-stack">
        <div className="card-label">Check-ins answered</div>
        <div className="figure-grid">
          <div className="figure">
            <span className="number">{checkinsCompleted.morning}</span>
            <span className="name">morning</span>
          </div>
          <div className="figure">
            <span className="number">{checkinsCompleted.daytime}</span>
            <span className="name">afternoon</span>
          </div>
          <div className="figure">
            <span className="number">{checkinsCompleted.evening}</span>
            <span className="name">evening</span>
          </div>
          <div className="figure">
            <span className="number">{period.days}</span>
            <span className="name">possible days</span>
          </div>
        </div>
      </section>

      <section className="card card-stack">
        <div className="card-label">Settings behind the figures</div>
        <div className="settings">
          <div>
            <span>Gap that still counts as one episode</span>
            <b>{config.mergeGapSec} s</b>
          </div>
          <div>
            <span>Shortest session kept</span>
            <b>{config.minSessionSec} s</b>
          </div>
          <div>
            <span>Morning window after waking</span>
            <b>{config.morningWindowMin} min</b>
          </div>
          <div>
            <span>Window before Sleep mode</span>
            <b>{config.preSleepWindowMin} min</b>
          </div>
        </div>
      </section>

      <section className="card card-stack">
        <div className="card-label">Export</div>
        <div className="muted">
          One row per day, the same figures the screens are drawn from.
        </div>
        <button className="primary" onClick={exportCsv} disabled={exporting === "working"}>
          {exporting === "working" ? "Preparing…" : "Download CSV"}
        </button>
        {exporting === "failed" && <div className="error">Export failed. Try again.</div>}
      </section>
    </Shell>
  );
}
EOF

echo "Data screen written."
