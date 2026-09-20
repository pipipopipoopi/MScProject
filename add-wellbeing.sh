#!/bin/bash
# Adds GET /api/wellbeing to the server and builds the Wellbeing screen.
# Run from the repository root:  bash add-wellbeing.sh

set -e

if [ ! -f "server/src/api.js" ]; then
  echo "server/src/api.js not found. Run this from the MScProject folder."
  exit 1
fi

# ---- 1. server ------------------------------------------------------------
python3 - << 'PY'
from pathlib import Path

path = Path("server/src/api.js")
text = path.read_text()

helper = '''// Groups days by how much scrolling they contained and averages the ratings in
// each group. Days with no rating are left out of an average rather than
// counted as zero, so every figure carries the number of days behind it.
function groupAverages(days, groups, pick) {
  return groups.map((group) => {
    const members = days.filter(group.test);
    const average = (get) => {
      const values = members.map(get).filter((value) => value !== null && value !== undefined);
      if (!values.length) return null;
      return round(values.reduce((sum, value) => sum + value, 0) / values.length);
    };
    return { label: group.label, days: members.length, ...pick(average) };
  });
}

// Scrolling that belongs to the night: the hour before the sleep marker plus
// anything after it, which is scrolling in bed.
function nightMinutes(day) {
  return (day.preSleepMinutes || 0) + (day.inBedMinutes || 0);
}

'''

anchor = "module.exports = (requireToken) => {"
if "function groupAverages" not in text:
    text = text.replace(anchor, helper + anchor, 1)

route = '''  // How days with and without scrolling compare. Morning scrolling is set
  // against how the day itself felt; night scrolling against the sleep that
  // followed it, which is rated the next morning (sleepAfter).
  router.get('/api/wellbeing', requireToken, async (req, res) => {
    const config = readConfig(req.query);
    const data = await loadData(req.query);
    const { days } = buildDays(data, config);

    const morningGroups = [
      { label: 'No morning scrolling', test: (day) => !day.morningMinutes },
      { label: 'Under 20 min', test: (day) => day.morningMinutes > 0 && day.morningMinutes < 20 },
      { label: '20+ min', test: (day) => day.morningMinutes >= 20 },
    ];

    const nightGroups = [
      { label: 'No night scrolling', test: (day) => !nightMinutes(day) },
      { label: 'Under 30 min', test: (day) => nightMinutes(day) > 0 && nightMinutes(day) < 30 },
      { label: '30+ min', test: (day) => nightMinutes(day) >= 30 },
    ];

    res.json({
      config,
      totalDays: days.length,
      morning: groupAverages(days, morningGroups, (average) => ({
        daytime: {
          mood: average((day) => day.ratings.daytime && day.ratings.daytime.mood),
          anxiety: average((day) => day.ratings.daytime && day.ratings.daytime.anxiety),
          energy: average((day) => day.ratings.daytime && day.ratings.daytime.energy),
        },
        evening: {
          mood: average((day) => day.ratings.evening && day.ratings.evening.mood),
          anxiety: average((day) => day.ratings.evening && day.ratings.evening.anxiety),
          energy: average((day) => day.ratings.evening && day.ratings.evening.energy),
        },
      })),
      night: groupAverages(days, nightGroups, (average) => ({
        sleepQuality: average((day) => day.sleepAfter.quality),
        sleepOnsetDifficulty: average((day) => day.sleepAfter.onsetDifficulty),
      })),
    });
  });

  return router;'''

if "/api/wellbeing" not in text:
    text = text.replace("  return router;", route, 1)

path.write_text(text)
print("Server: /api/wellbeing added.")
PY

# ---- 2. client: styles ----------------------------------------------------
cat > client/src/screens/wellbeing.css << 'EOF'
/* Styles for the grouped comparison bars. */

.tabs {
  display: flex;
  gap: 6px;
  padding: 6px;
  background: var(--surface);
  border-radius: 999px;
}

.tabs button {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 999px;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-soft);
  cursor: pointer;
}

.tabs button.active {
  background: var(--ink);
  color: var(--bg);
  font-weight: 800;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
}

.legend span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend i {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-head {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 800;
}

.metric-head .values {
  font-weight: 700;
  color: var(--ink-faint);
}

.bar-track {
  height: 14px;
  border-radius: 7px;
  background: var(--bg);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 7px;
  border: 1px solid var(--border);
}
EOF

# ---- 3. client: Wellbeing screen ------------------------------------------
cat > client/src/screens/Wellbeing.jsx << 'EOF'
import { useEffect, useState } from "react";
import { apiGet } from "../api.js";
import "./today.css";
import "./wellbeing.css";

const MORNING_COLOURS = ["#ffffff", "#ecc96b", "#b8871f"];
const NIGHT_COLOURS = ["#ffffff", "#b9aef0", "#6f5cc4"];

function Shell({ totalDays, children }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <div className="screen-date">
            {totalDays ? "All " + totalDays + " days" : "Wellbeing"}
          </div>
          <h1>Wellbeing</h1>
        </div>
      </div>
      {children}
    </div>
  );
}

// One metric across the three groups: the bar length is the average rating
// out of ten, so the groups can be read against each other at a glance.
function Metric({ name, values, colours }) {
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{name}</span>
        <span className="values">
          {values.map((value) => (value === null ? "—" : value)).join(" · ")}
        </span>
      </div>
      {values.map((value, index) => (
        <div className="bar-track" key={index}>
          <div
            className="bar-fill"
            style={{
              width: value === null ? 0 : (value / 10) * 100 + "%",
              background: colours[index],
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Legend({ groups, colours }) {
  return (
    <div className="legend">
      {groups.map((group, index) => (
        <span key={group.label}>
          <i style={{ background: colours[index] }} />
          {group.label} · {group.days} {group.days === 1 ? "day" : "days"}
        </span>
      ))}
    </div>
  );
}

export default function Wellbeing() {
  const [state, setState] = useState({ status: "loading" });
  const [period, setPeriod] = useState("daytime");

  useEffect(() => {
    apiGet("/api/wellbeing")
      .then((data) => setState({ status: "ready", data }))
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

  const { morning, night, totalDays } = state.data;

  return (
    <Shell totalDays={totalDays}>
      <section className="card card-stack">
        <div>
          <div className="label" style={{ fontSize: 16, fontWeight: 800 }}>
            Morning scrolling and your day
          </div>
          <div className="muted">
            Average rating, 1 to 10, by minutes scrolled in your first hour awake
          </div>
        </div>

        <div className="tabs">
          {[
            ["daytime", "Afternoon"],
            ["evening", "Evening"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={period === id ? "active" : ""}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <Legend groups={morning} colours={MORNING_COLOURS} />

        {["mood", "anxiety", "energy"].map((key) => (
          <Metric
            key={key}
            name={key.charAt(0).toUpperCase() + key.slice(1)}
            values={morning.map((group) => group[period][key])}
            colours={MORNING_COLOURS}
          />
        ))}
      </section>

      <section className="card card-stack">
        <div>
          <div className="label" style={{ fontSize: 16, fontWeight: 800 }}>
            Night scrolling and your sleep
          </div>
          <div className="muted">
            Average rating, 1 to 10, by minutes scrolled in the hour before Sleep
            mode and after it
          </div>
        </div>

        <Legend groups={night} colours={NIGHT_COLOURS} />

        <Metric
          name="Sleep quality"
          values={night.map((group) => group.sleepQuality)}
          colours={NIGHT_COLOURS}
        />
        <Metric
          name="Hard to fall asleep"
          values={night.map((group) => group.sleepOnsetDifficulty)}
          colours={NIGHT_COLOURS}
        />
        <div className="muted">For "Hard to fall asleep", higher means harder.</div>
      </section>

      <div className="muted">
        Based on one person's own data. These show patterns that go together, not
        what causes what.
      </div>
    </Shell>
  );
}
EOF

echo "Wellbeing endpoint and screen written."
