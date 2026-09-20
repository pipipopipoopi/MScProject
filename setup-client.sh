#!/bin/bash
# Digital Mirror / scroll tracker — dashboard scaffold.
# Run from the repository root:  bash setup-client.sh
# It only writes files inside client/.

set -e

if [ ! -d "client" ]; then
  echo "No client/ folder here. Run this from the MScProject folder."
  exit 1
fi

mkdir -p client/src/screens client/src/components client/public

# ---------------------------------------------------------------- index.html
cat > client/index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#fbf4ea" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <title>Digital Mirror</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

# ---------------------------------------------------------------- .env.local
cat > client/.env.local << 'EOF'
# Address of the API. Change to http://localhost:3000 to develop against the
# local server (MAMP + npm run dev) instead of the deployed one.
VITE_API_BASE=https://msc-project-alpha.vercel.app
EOF

# ---------------------------------------------------------------- styles.css
cat > client/src/styles.css << 'EOF'
/* Design tokens taken from the agreed screen mockups (warm pastel style). */
:root {
  --bg: #fbf4ea;
  --ink: #3a2f2a;
  --ink-soft: #5e4a40;
  --ink-faint: #7a6a60;
  --surface: #ffffff;
  --border: #eadfcf;
  --yellow: #fff3c9;
  --yellow-ink: #6b5520;
  --lilac: #e6e0fa;
  --lilac-ink: #4b3fa8;
  --green: #dcefe3;
  --green-ink: #2f5e49;
  --danger: #9a4f2e;
  --radius-card: 32px;
  --radius-inner: 20px;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html,
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Nunito, "Helvetica Neue", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* The phone is the target device, so the layout is a single narrow column
   that stays centred on wider screens. */
.app {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: env(safe-area-inset-top, 0px);
}

.screen {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 40px 20px calc(120px + env(safe-area-inset-bottom, 0px)) 20px;
}

.screen-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.screen-date {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-faint);
}

h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
}

.pill-label {
  padding: 6px 12px;
  background: var(--surface);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-faint);
}

.card {
  padding: 22px;
  background: var(--surface);
  border-radius: var(--radius-card);
}

.card-yellow {
  background: var(--yellow);
}
.card-lilac {
  background: var(--lilac);
}
.card-green {
  background: var(--green);
}

.card-label {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.muted {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-faint);
}

/* ---- sign in ---- */
.signin {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 32px 28px;
  gap: 28px;
}

.signin-dots {
  display: flex;
  gap: 8px;
}

.signin-dots span {
  width: 40px;
  height: 40px;
  border-radius: 20px;
}

.signin h1 {
  font-size: 36px;
  line-height: 1.1;
}

.signin-tagline {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink-soft);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
  background: var(--surface);
  border-radius: 28px;
}

label {
  font-size: 14px;
  font-weight: 800;
}

input[type="password"] {
  height: 52px;
  padding: 0 16px;
  border: 2px solid var(--border);
  border-radius: 18px;
  background: var(--bg);
  font-family: inherit;
  font-size: 16px;
  color: var(--ink);
}

input[type="password"]:focus {
  outline: none;
  border-color: var(--ink-faint);
}

button.primary {
  height: 52px;
  margin-top: 6px;
  background: var(--ink);
  border: none;
  border-radius: 26px;
  font-family: inherit;
  font-size: 16px;
  font-weight: 800;
  color: var(--bg);
  cursor: pointer;
}

button.primary:disabled {
  opacity: 0.55;
  cursor: default;
}

.error {
  font-size: 14px;
  font-weight: 700;
  color: var(--danger);
}

/* ---- bottom navigation ---- */
.tabbar {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  max-width: 448px;
  margin: 0 auto;
  height: 68px;
  padding: 8px;
  background: var(--surface);
  border-radius: 34px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  box-shadow: 0 6px 24px rgba(58, 47, 42, 0.1);
}

.tabbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 26px;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-soft);
  cursor: pointer;
}

.tabbar button.active {
  background: var(--ink);
  color: var(--bg);
  font-weight: 800;
}

/* ---- temporary data preview, replaced by the real screens ---- */
pre.debug {
  margin: 0;
  padding: 16px;
  background: var(--surface);
  border-radius: var(--radius-inner);
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
EOF

# ---------------------------------------------------------------- main.jsx
cat > client/src/main.jsx << 'EOF'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

# ---------------------------------------------------------------- api.js
cat > client/src/api.js << 'EOF'
// Single place where the dashboard talks to the API.
// The password typed on the sign-in screen is the API token: it is kept in the
// browser so the app does not ask for it again, and sent with every request.

const BASE = import.meta.env.VITE_API_BASE || "";
const STORAGE_KEY = "dm_token";

export function getToken() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiGet(path, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: "Bearer " + getToken() },
    });
  } catch {
    // Network failure, wrong address, or a blocked cross-origin request.
    throw new ApiError("Cannot reach the server", 0);
  }

  if (response.status === 401) throw new ApiError("Wrong password", 401);
  if (!response.ok) throw new ApiError("Request failed (" + response.status + ")", response.status);
  return response.json();
}

// Used by the sign-in screen: a request that only succeeds with a valid token.
export async function verifyToken(token) {
  const previous = getToken();
  setToken(token);
  try {
    await apiGet("/api/summary", { days: 1 });
    return true;
  } catch (error) {
    if (previous) setToken(previous);
    else clearToken();
    throw error;
  }
}
EOF

# ---------------------------------------------------------------- App.jsx
cat > client/src/App.jsx << 'EOF'
import { useState } from "react";
import { getToken, clearToken } from "./api.js";
import SignIn from "./screens/SignIn.jsx";
import Today from "./screens/Today.jsx";
import Patterns from "./screens/Patterns.jsx";
import Wellbeing from "./screens/Wellbeing.jsx";
import Data from "./screens/Data.jsx";
import TabBar from "./components/TabBar.jsx";

const SCREENS = {
  today: Today,
  patterns: Patterns,
  wellbeing: Wellbeing,
  data: Data,
};

export default function App() {
  const [signedIn, setSignedIn] = useState(Boolean(getToken()));
  const [tab, setTab] = useState("today");

  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;

  const Screen = SCREENS[tab];

  function signOut() {
    clearToken();
    setSignedIn(false);
  }

  return (
    <div className="app">
      <Screen onSignOut={signOut} />
      <TabBar current={tab} onChange={setTab} />
    </div>
  );
}
EOF

# ---------------------------------------------------------------- TabBar.jsx
cat > client/src/components/TabBar.jsx << 'EOF'
const TABS = [
  ["today", "Today"],
  ["patterns", "Patterns"],
  ["wellbeing", "Wellbeing"],
  ["data", "Data"],
];

export default function TabBar({ current, onChange }) {
  return (
    <nav className="tabbar">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          className={id === current ? "active" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
EOF

# ---------------------------------------------------------------- SignIn.jsx
cat > client/src/screens/SignIn.jsx << 'EOF'
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
EOF

# ---------------------------------------------------------------- Today.jsx
cat > client/src/screens/Today.jsx << 'EOF'
import { useEffect, useState } from "react";
import { apiGet } from "../api.js";

// Temporary version: it shows the raw response so the real cards can be built
// on the actual field names. Replaced by the designed screen next.
export default function Today({ onSignOut }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    apiGet("/api/summary")
      .then((data) => setState({ status: "ready", data }))
      .catch((error) => setState({ status: "error", message: error.message }));
  }, []);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <div className="screen-date">{today}</div>
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
          <div className="card-label" style={{ marginBottom: 12 }}>
            /api/summary
          </div>
          <pre className="debug">{JSON.stringify(state.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
EOF

# ------------------------------------------------- placeholder screens
for pair in "Patterns:Patterns" "Wellbeing:Wellbeing" "Data:Data"; do
  name="${pair%%:*}"
  title="${pair##*:}"
  cat > "client/src/screens/${name}.jsx" << EOF
export default function ${name}() {
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>${title}</h1>
        </div>
      </div>
      <div className="card muted">Coming next.</div>
    </div>
  );
}
EOF
done

# Remove the files Vite generates for its starter page, if they are still there.
rm -f client/src/App.css client/src/index.css
rm -rf client/src/assets

echo "Client scaffold written."
