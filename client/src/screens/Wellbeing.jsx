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

    </Shell>
  );
}
