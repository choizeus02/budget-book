import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "홈", icon: "🏠" },
  { to: "/transactions", label: "내역", icon: "📋" },
  { to: "/stats", label: "통계", icon: "📊" },
  { to: "/assets", label: "자산", icon: "💰" },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-1.5 gap-0.5 text-[11px] transition-colors ${
              isActive ? "text-indigo-400" : "text-slate-500"
            }`
          }
        >
          <span className="text-base leading-5">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
