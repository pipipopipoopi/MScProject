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
