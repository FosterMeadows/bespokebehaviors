import React, { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardList,
  FileText,
  BookOpenCheck,
  Calculator,
  NotebookPen,
  CheckSquare,
  LogOut
} from "lucide-react";

const navItems = [
  { to: "/log", label: "Behavior Log", icon: ClipboardList },
  { to: "/standards", label: "Standards Tracker", icon: BookOpenCheck },
  { to: "/dailyplan", label: "Daily Plan", icon: FileText },
  { to: "/gradecalculator", label: "Grade Calculator", icon: Calculator },
  { to: "/teachernotes", label: "Teacher Notes", icon: NotebookPen },
  { to: "/megachecklist", label: "Mega Checklist", icon: CheckSquare },
];

function classNames(...c) {
  return c.filter(Boolean).join(" ");
}

function InitialsAvatar({ name }) {
  const initials = useMemo(() => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);
  return (
    <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-700 text-white font-semibold">
      {initials}
    </div>
  );
}

export default function Layout({ children, displayName, logout }) {
  return (
    <div className="flex h-svh bg-sky-50">
      <aside className="w-72 border-r border-sky-200 bg-gradient-to-b from-sky-50 to-white shadow-sm flex flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-sky-200 px-4 bg-sky-100/70">
          <div className="h-8 w-8 rounded-xl bg-sky-700" />
          <div className="text-base font-semibold text-sky-800">Behavior App</div>
        </div>

        <nav className="px-3 py-4 overflow-y-auto">
          <h3 className="px-3 text-[11px] tracking-wider font-semibold text-sky-600 uppercase mb-3">Main</h3>
          <ul className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/log"}
                  className={({ isActive }) =>
                    classNames(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                      "text-sky-700 hover:text-sky-900 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400",
                      isActive && "text-sky-900"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="active-pill"
                          className="absolute inset-0 rounded-xl bg-sky-200"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon className="relative h-5 w-5 shrink-0 text-sky-500 group-hover:text-sky-700" />
                      <span className="relative">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto border-t border-sky-200 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-white/70 p-3 ring-1 ring-sky-200">
            <InitialsAvatar name={displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sky-900">{displayName || "User"}</p>
              <p className="text-xs text-sky-600">Signed in</p>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-white">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
