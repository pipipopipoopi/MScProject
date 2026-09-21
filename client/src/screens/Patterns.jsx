import { useEffect, useState } from "react";
import { apiGet } from "../api.js";
import BarChart from "../components/BarChart.jsx";
import Heatmap from "../components/Heatmap.jsx";
import "./today.css";

const DAYS = 14;
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

// The phone's own calendar date, n days from today, as YYYY-MM-DD.
function localDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA");
}

function shortDate(day) {
  return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// Averages only the days where the window could be measured.
function average(values) {
  const measured = values.filter((value) => value !== null);
  if (!measured.length) return null;
  return Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length);
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

function Series({ title, labels, values, colour }) {
  const measured = values.filter((value) => value !== null).length;
  const mean = average(values);

  return (
    <section className="card card-stack">
      <div className="inline-row" style={{ background: "transparent", padding: 0 }}>
        <span className="label" style={{ fontSize: 16, fontWeight: 800 }}>
          {title}
        </span>
        <span className="value">{mean === null ? "—" : "avg " + mean + " min"}</span>
      </div>
      <BarChart labels={labels} values={values} colour={colour} />
      <div className="muted">
        {measured} of {values.length} days measured
      </div>
    </section>
  );
}

export default function Patterns() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    const since = localDate(-(DAYS - 1));
    Promise.all([apiGet("/api/days", { since }), apiGet("/api/hourly", { since })])
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

  // Every calendar date in the period gets a bar, recorded or not, so the
  // axis always spans the same fourteen days.
  const byDay = Object.fromEntries(state.days.map((day) => [day.day, day]));
  const dates = Array.from({ length: DAYS }, (_, index) => localDate(index - (DAYS - 1)));
  const labels = dates.map(shortDate);

  // A day without a wake marker has no morning window, and a day without a
  // sleep marker has no pre-sleep window. Those days are gaps, not zeros.
  const morning = dates.map((date) => {
    const day = byDay[date];
    return day && day.wakeAt ? Math.round(day.morningMinutes || 0) : null;
  });
  const preSleep = dates.map((date) => {
    const day = byDay[date];
    return day && day.sleepOnAt ? Math.round(day.preSleepMinutes || 0) : null;
  });

  // ECharts wants [hour, weekday, value] triples. The value is the minutes in
  // that hour on an average day of that weekday within the period.
  const cells = [];
  let busiest = 0;
  state.hourly.average.forEach((row, weekday) => {
    row.forEach((value, hour) => {
      cells.push([hour, weekday, value || 0]);
      if (value > busiest) busiest = value;
    });
  });
  const recordedDays = state.hourly.observedDays.reduce((sum, count) => sum + count, 0);

  return (
    <Shell>
      <section className="card card-stack">
        <div>
          <div className="label" style={{ fontSize: 16, fontWeight: 800 }}>
            When you scroll
          </div>
          <div className="muted">
            Average minutes in each hour, by day of the week · {recordedDays} recorded{" "}
            {recordedDays === 1 ? "day" : "days"}
          </div>
        </div>
        <Heatmap weekdays={state.hourly.weekdays} hours={HOURS} values={cells} max={busiest} />
      </section>

      <Series
        title="Morning scrolling · first hour"
        labels={labels}
        values={morning}
        colour="#ecc96b"
      />
      <Series
        title="Scrolling before Sleep mode"
        labels={labels}
        values={preSleep}
        colour="#a393e3"
      />

      <div className="muted">
        A gap is a day with no wake or sleep marker: the window could not be placed, which is
        not the same as no scrolling.
      </div>
    </Shell>
  );
}
