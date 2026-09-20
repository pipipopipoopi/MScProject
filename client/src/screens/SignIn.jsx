import { useState } from "react";
import { verifyToken } from "../api.js";

export default function SignIn({ onSignedIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await verifyToken(password.trim());
      onSignedIn();
    } catch (problem) {
      setError(
        problem.status === 401
          ? "Wrong password."
          : "Cannot reach the server. Check your connection."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="signin">
        <div className="signin-dots">
          <span style={{ background: "var(--yellow)" }} />
          <span style={{ background: "var(--lilac)" }} />
          <span style={{ background: "var(--green)" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1>Digital Mirror</h1>
          <div className="signin-tagline">
            See when you scroll, and how it goes with your day.
          </div>
        </div>

        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
          <button className="primary" onClick={submit} disabled={busy || !password}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          {error && <div className="error">{error}</div>}
        </div>

        <div className="muted">Your data stays on your own server.</div>
      </div>
    </div>
  );
}
