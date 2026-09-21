#!/bin/bash
# Removes the two sections that were not asked for: capture reliability and
# the analysis thresholds. The Data screen keeps what was collected, the
# check-in counts and the export.
# Run from the repository root:  bash trim-data.sh

set -e

if [ ! -f "client/src/screens/Data.jsx" ]; then
  echo "client/src/screens/Data.jsx not found. Run this from the MScProject folder."
  exit 1
fi

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

  const { period, capture, checkinsCompleted } = state.data;

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

echo "Data screen trimmed."
