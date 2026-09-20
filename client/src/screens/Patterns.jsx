import { useEffect, useState } from "react";
import { apiGet } from "../api.js";
import BarChart from "../components/BarChart.jsx";
import Heatmap from "../components/Heatmap.jsx";
import "./today.css";

const DAYS = 14;
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

function shortDate(day) {
  return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function Shell({ children }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <div className="screen-date">Last {DAYS} days</div>
          <h1>Patterns</h1>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Patterns() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    Promise.all([apiGet("/api/days", { days: DAYS }), apiGet("/api/hourly", { days: DAYS })])
      .then(([daysData, hourlyData]) =>
        setState({ status: "ready", days: daysData.days || [], hourly: hourlyData })
      )
      .catch((error) => setState({ status: "error", message: error.message }));
  }, []);

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

  const days = state.days;

  if (!days.length) {
    return (
      <Shell>
        <div className="card muted">No days recorded yet.</div>
      </Shell>
    );
  }

  const labels = days.map((day) => shortDate(day.day));
  const morning = days.map((day) => Math.round(day.morningMinutes || 0));
  const preSleep = days.map((day) => Math.round(day.preSleepMinutes || 0));

  // ECharts wants [column, row, value] triples.
  const cells = [];
  let busiest = 0;
  state.hourly.minutes.forEach((row, weekday) => {
    row.forEach((value, hour) => {
      cells.push([hour, weekday, value || 0]);
      if (value > busiest) busiest = value;
    });
  });

  return (
    <Shell>
      <section className="card card-stack">
        <div>
          <div className="label" style={{ fontSize: 16, fontWeight: 800 }}>
            When you scroll
          </div>
          <div className="muted">Darker means more minutes in that hour</div>
        </div>
        <Heatmap
          weekdays={state.hourly.weekdays}
          hours={HOURS}
          values={cells}
          max={busiest}
        />
      </section>

      <section className="card card-stack">
        <div className="inline-row" style={{ background: "transparent", padding: 0 }}>
          <span className="label" style={{ fontSize: 16, fontWeight: 800 }}>
            Morning scrolling · first hour
          </span>
          <span className="value">avg {average(morning)} min</span>
        </div>
        <BarChart labels={labels} values={morning} colour="#ecc96b" />
      </section>

      <section className="card card-stack">
        <div className="inline-row" style={{ background: "transparent", padding: 0 }}>
          <span className="label" style={{ fontSize: 16, fontWeight: 800 }}>
            Scrolling before Sleep mode
          </span>
          <span className="value">avg {average(preSleep)} min</span>
        </div>
        <BarChart labels={labels} values={preSleep} colour="#a393e3" />
      </section>

      <div className="muted">
        Days with no wake or sleep marker show zero for that window, not missing data.
      </div>
    </Shell>
  );
}
