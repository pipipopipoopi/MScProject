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
