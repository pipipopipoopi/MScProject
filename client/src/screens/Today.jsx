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

// The phone's own calendar date, n days from today.
function localDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA");
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
    apiGet("/api/days", { since: localDate(-2) })
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
    today.minutesToFirstScroll === null || !today.firstScrollAfterWakeAt
      ? "—"
      : minutes(today.minutesToFirstScroll) + " min · " + clock(today.firstScrollAfterWakeAt);

  const wakeNote = !today.declaredWake
    ? "Wake time not detected yet"
    : today.wakeSource === "reported"
      ? "Woke " + clock(today.wakeAt) + " (your answer)"
      : "Woke " + clock(today.wakeAt) + " (from the alarm)";

  const sleep = today.sleepBefore || {};
  // Without a sleep marker there is no pre-sleep window, which is not the
  // same as no scrolling.
  const nightScroll =
    yesterday && yesterday.sleepOnAt ? minutes(yesterday.preSleepMinutes) : "—";
  const nightNote = yesterday
    ? [
        yesterday.sleepOnAt ? "Wind Down " + clock(yesterday.sleepOnAt) : null,
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
            <span className="value">{today.wakeAt ? minutes(today.morningMinutes) : "—"}</span>
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
              scrolled after Wind Down began
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

    </Shell>
  );
}
