#!/bin/bash
# Writes the designed Today screen. Run from the repository root:
#   bash update-today.sh

set -e

if [ ! -d "client/src/screens" ]; then
  echo "No client/src/screens folder here. Run this from the MScProject folder."
  exit 1
fi

# ------------------------------------------------------------- today.css
cat > client/src/screens/today.css << 'EOF'
/* Styles specific to the Today screen. */

.stat-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-circle {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  border-radius: 48px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-circle .value {
  font-size: 38px;
  font-weight: 800;
  line-height: 1;
}

.stat-circle .unit {
  font-size: 13px;
  font-weight: 700;
}

.stat-caption {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.2;
}

.inline-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border-radius: var(--radius-inner);
}

.inline-row .label {
  font-size: 14px;
  font-weight: 700;
}

.inline-row .value {
  font-size: 16px;
  font-weight: 800;
  text-align: right;
}

.card-note {
  font-size: 12px;
  font-weight: 600;
}

.card-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.score-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.score-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius-inner);
}

.score-box .value {
  font-size: 22px;
  font-weight: 800;
}

.score-box .out-of {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-faint);
}

.score-box .name {
  font-size: 13px;
  font-weight: 700;
}

.ratings-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--surface);
  border-radius: var(--radius-inner);
}

.ratings-when {
  font-size: 13px;
  font-weight: 800;
  color: var(--green-ink);
}

.ratings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.ratings-grid b {
  font-size: 18px;
}

.checkins {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  background: var(--surface);
  border-radius: 22px;
}

.checkins .title {
  font-size: 13px;
  font-weight: 800;
}

.checkins .marks {
  display: flex;
  gap: 12px;
  font-size: 13px;
  font-weight: 700;
}

.checkins .done {
  color: var(--green-ink);
}

.checkins .missed {
  color: var(--ink-faint);
}

button.link {
  border: none;
  background: var(--surface);
  cursor: pointer;
}
EOF

# ------------------------------------------------------------- Today.jsx
cat > client/src/screens/Today.jsx << 'EOF'
import { useEffect, useState } from "react";
import { apiGet } from "../api.js";
import "./today.css";

// Timestamps are stored in UTC; the dashboard shows them in the phone's own
// time, which is how the person experienced them.
function clock(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function longDate(day) {
  if (!day) return "";
  return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function minutes(value) {
  return value === null || value === undefined ? 0 : Math.round(value);
}

function Shell({ day, onSignOut, children }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <div className="screen-date">{longDate(day)}</div>
          <h1>Today</h1>
        </div>
        <button className="pill-label link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      {children}
    </div>
  );
}

export default function Today({ onSignOut }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    apiGet("/api/days", { days: 3 })
      .then((data) => setState({ status: "ready", days: data.days || [] }))
      .catch((error) => setState({ status: "error", message: error.message }));
  }, []);

  if (state.status === "loading") {
    return (
      <Shell onSignOut={onSignOut}>
        <div className="card muted">Loading…</div>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell onSignOut={onSignOut}>
        <div className="card error">{state.message}</div>
      </Shell>
    );
  }

  const days = state.days;
  const today = days[days.length - 1];
  // The scrolling that preceded last night's sleep belongs to the previous
  // logical day, while the sleep ratings for that night are recorded this
  // morning. They are shown together in the "Last night" card.
  const yesterday = days.length > 1 ? days[days.length - 2] : null;

  if (!today) {
    return (
      <Shell onSignOut={onSignOut}>
        <div className="card muted">No days recorded yet.</div>
      </Shell>
    );
  }

  const firstScroll =
    today.minutesToFirstScroll === null || !today.firstScrollAt
      ? "—"
      : minutes(today.minutesToFirstScroll) + " min · " + clock(today.firstScrollAt);

  const wakeNote = today.declaredWake
    ? "Woke " + clock(today.wakeAt) + ", from Sleep mode"
    : "Wake time not detected, day counted from 07:00";

  const sleep = today.sleepBefore || {};
  const nightScroll = yesterday ? minutes(yesterday.preSleepMinutes) : 0;
  const nightNote = yesterday
    ? [
        yesterday.sleepOnAt ? "Sleep mode " + clock(yesterday.sleepOnAt) : null,
        yesterday.lastScrollAt ? "last scroll " + clock(yesterday.lastScrollAt) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No data for yesterday yet";

  const ratings = today.ratings || {};
  const latest = ratings.evening
    ? { when: "Evening", values: ratings.evening }
    : ratings.daytime
      ? { when: "Afternoon", values: ratings.daytime }
      : null;

  const morningDone = sleep.quality !== null || sleep.onsetDifficulty !== null;

  return (
    <Shell day={today.day} onSignOut={onSignOut}>
      <section className="card card-yellow card-stack">
        <div className="card-label" style={{ color: "var(--yellow-ink)" }}>
          This morning
        </div>
        <div className="stat-row">
          <div className="stat-circle">
            <span className="value">{minutes(today.morningMinutes)}</span>
            <span className="unit">min</span>
          </div>
          <div className="stat-caption">scrolled in your first hour awake</div>
        </div>
        <div className="inline-row">
          <span className="label">First scroll after waking</span>
          <span className="value">{firstScroll}</span>
        </div>
        <div className="card-note" style={{ color: "var(--yellow-ink)" }}>
          {wakeNote}
        </div>
      </section>

      <section className="card card-lilac card-stack">
        <div className="card-label" style={{ color: "var(--lilac-ink)" }}>
          Last night
        </div>
        <div className="stat-row">
          <div className="stat-circle" style={{ width: 84, height: 84 }}>
            <span className="value" style={{ fontSize: 32 }}>
              {nightScroll}
            </span>
            <span className="unit">min</span>
          </div>
          <div>
            <div className="stat-caption" style={{ fontSize: 17 }}>
              scrolled in the hour before Sleep mode
            </div>
            <div className="card-note" style={{ color: "#4a4270", marginTop: 4 }}>
              {nightNote}
            </div>
          </div>
        </div>
        <div className="score-pair">
          <div className="score-box">
            <span className="value">
              {sleep.quality ?? "—"}
              <span className="out-of">/10</span>
            </span>
            <span className="name">Sleep quality</span>
          </div>
          <div className="score-box">
            <span className="value">
              {sleep.onsetDifficulty ?? "—"}
              <span className="out-of">/10</span>
            </span>
            <span className="name">Hard to fall asleep</span>
          </div>
        </div>
      </section>

      <section className="card card-green card-stack">
        <div className="card-label" style={{ color: "var(--green-ink)" }}>
          How you feel today
        </div>
        {latest ? (
          <div className="ratings-box">
            <span className="ratings-when">{latest.when}</span>
            <div className="ratings-grid">
              <span>
                Mood <b>{latest.values.mood ?? "—"}</b>
                <span className="out-of">/10</span>
              </span>
              <span>
                Anxiety <b>{latest.values.anxiety ?? "—"}</b>
                <span className="out-of">/10</span>
              </span>
              <span>
                Energy <b>{latest.values.energy ?? "—"}</b>
                <span className="out-of">/10</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="ratings-box muted">No check-in answered yet today.</div>
        )}
      </section>

      <div className="checkins">
        <span className="title">Check-ins today</span>
        <div className="marks">
          <span className={morningDone ? "done" : "missed"}>
            Morning {morningDone ? "✓" : "—"}
          </span>
          <span className={ratings.daytime ? "done" : "missed"}>
            Afternoon {ratings.daytime ? "✓" : "—"}
          </span>
          <span className={ratings.evening ? "done" : "missed"}>
            Evening {ratings.evening ? "✓" : "—"}
          </span>
        </div>
      </div>

      <div className="muted">
        Total today {minutes(today.totalMinutes)} min · {today.episodeCount} episodes
      </div>
    </Shell>
  );
}
EOF

echo "Today screen written."
