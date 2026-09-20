#!/bin/bash
# Adds GET /api/hourly to the server and the heatmap to the Patterns screen.
# Run from the repository root:  bash add-hourly.sh

set -e

if [ ! -f "server/src/api.js" ]; then
  echo "server/src/api.js not found. Run this from the MScProject folder."
  exit 1
fi

# ---- 1. server: hourly endpoint -------------------------------------------
python3 - << 'PY'
from pathlib import Path

path = Path("server/src/api.js")
text = path.read_text()

helper = '''// Spreads each session across the local hours it covers, so a session running
// from 23:50 to 00:20 adds ten minutes to one hour and twenty to the next.
// Rows are weekdays (Monday first) and columns are hours of the local clock.
function hourlyGrid(sessions) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const session of sessions) {
    let at = session.startAt.getTime() + session.offsetMin * 60000;
    const end = session.endAt.getTime() + session.offsetMin * 60000;

    while (at < end) {
      const local = new Date(at);
      const nextHour = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        local.getUTCHours() + 1,
      );
      const sliceEnd = Math.min(end, nextHour);
      const weekday = (local.getUTCDay() + 6) % 7; // Monday = 0
      grid[weekday][local.getUTCHours()] += (sliceEnd - at) / 60000;
      at = sliceEnd;
    }
  }

  return grid;
}

'''

anchor = "module.exports = (requireToken) => {"
if "function hourlyGrid" not in text:
    text = text.replace(anchor, helper + anchor, 1)

route = '''  // Minutes of scrolling by weekday and hour, for the heatmap. Days are counted
  // per weekday so the dashboard can show an average rather than a total.
  router.get('/api/hourly', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const { days, sessions } = buildDays(data, config);

    const observedDays = new Array(7).fill(0);
    for (const day of days) {
      const weekday = (new Date(day.day + 'T12:00:00Z').getUTCDay() + 6) % 7;
      observedDays[weekday] += 1;
    }

    res.json({
      config,
      weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      observedDays,
      minutes: hourlyGrid(sessions).map((row) => row.map((value) => round(value))),
    });
  });

  return router;'''

if "/api/hourly" not in text:
    text = text.replace("  return router;", route, 1)

path.write_text(text)
print("Server: /api/hourly added.")
PY

# ---- 2. client: heatmap component -----------------------------------------
cat > client/src/components/Heatmap.jsx << 'EOF'
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

// Weekday by hour grid: the darker the cell, the more minutes of scrolling
// happened in that hour of that day of the week.
export default function Heatmap({ weekdays, hours, values, max }) {
  const holder = useRef(null);

  useEffect(() => {
    const chart = echarts.init(holder.current, null, { renderer: "svg" });

    chart.setOption({
      animation: false,
      textStyle: { fontFamily: "Nunito, sans-serif" },
      grid: { left: 34, right: 4, top: 4, bottom: 22 },
      tooltip: {
        backgroundColor: "#3a2f2a",
        borderWidth: 0,
        textStyle: { color: "#fbf4ea", fontWeight: 700 },
        formatter: (point) =>
          weekdays[point.value[1]] +
          " " +
          String(point.value[0]).padStart(2, "0") +
          ":00 · " +
          point.value[2] +
          " min",
      },
      xAxis: {
        type: "category",
        data: hours,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: "#7a6a60",
          fontSize: 10,
          fontWeight: 700,
          interval: (index) => index % 6 === 0,
        },
      },
      yAxis: {
        type: "category",
        data: weekdays,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#7a6a60", fontSize: 11, fontWeight: 700 },
      },
      visualMap: {
        show: false,
        min: 0,
        max: max || 1,
        inRange: { color: ["#f3ebdf", "#e6e0fa", "#c9bdf2", "#a393e3", "#7361c8"] },
      },
      series: [
        {
          type: "heatmap",
          data: values,
          itemStyle: { borderColor: "#fbf4ea", borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: "#3a2f2a" } },
        },
      ],
    });

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [weekdays, hours, values, max]);

  return <div ref={holder} style={{ width: "100%", height: 220 }} />;
}
EOF

# ---- 3. client: Patterns screen with the heatmap ---------------------------
cat > client/src/screens/Patterns.jsx << 'EOF'
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
EOF

echo "Hourly endpoint and Patterns heatmap written."
