import { useEffect, useState } from "react";
import { apiGet } from "../api.js";

// Temporary version: shows the raw response so the designed cards can be
// built on the actual field names. Replaced by the real screen next.
export default function Today({ onSignOut }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    apiGet("/api/days", { days: 3 })
      .then((data) => setState({ status: "ready", data }))
      .catch((error) => setState({ status: "error", message: error.message }));
  }, []);

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Today</h1>
        </div>
        <button className="pill-label" style={{ border: "none" }} onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {state.status === "loading" && <div className="card muted">Loading…</div>}
      {state.status === "error" && <div className="card error">{state.message}</div>}
      {state.status === "ready" && (
        <div className="card">
          <div className="card-label" style={{ marginBottom: 12 }}>/api/days</div>
          <pre className="debug">{JSON.stringify(state.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
