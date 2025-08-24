import React, { useMemo, useState, useMemo as useMemo2 } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardList,
  FileText,
  BookOpenCheck,
  Calculator,
  NotebookPen,
  CheckSquare,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  LogOut
} from "lucide-react";

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

// Feature flag so the gremlins don't find the behavior log yet
const SHOW_BEHAVIOR = false;

const CORE_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/dailyplan", label: "Plans", icon: FileText },
  { to: "/standards", label: "Standards", icon: BookOpenCheck }
];

const TOOL_ITEMS = [
  { to: "/teachernotes", label: "Notes", icon: NotebookPen },
  { to: "/megachecklist", label: "Checklist", icon: CheckSquare },
  { to: "/gradecalculator", label: "Grade Calculator", icon: Calculator },
  ...(SHOW_BEHAVIOR ? [{ to: "/log", label: "Behavior Log", icon: ClipboardList, end: true }] : [])
];

function NavItem({ to, label, icon: Icon, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
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
  );
}

function SectionLabel({ children }) {
  return (
    <h3 className="px-3 text-[11px] tracking-wider font-semibold text-sky-600 uppercase mb-3">
      {children}
    </h3>
  );
}

export default function Layout({ children, displayName, logout }) {
  const location = useLocation();
  const isToolRoute = useMemo(
    () => TOOL_ITEMS.some(i => location.pathname.startsWith(i.to)),
    [location.pathname]
  );
  const [toolsOpen, setToolsOpen] = useState(isToolRoute);

  return (
    <div className="flex h-svh bg-sky-50">
      <aside className="w-72 border-r border-sky-200 bg-gradient-to-b from-sky-50 to-white shadow-sm flex flex-col">
        {/* Header */}
        <div className="flex h-16 items-center gap-2 border-b border-sky-200 px-4 bg-sky-100/70">
          <div className="h-8 w-8 rounded-xl bg-sky-700" />
          <div className="text-base font-semibold text-sky-800">Teacher Omnitool</div>
        </div>

        {/* Nav */}
        <nav className="px-3 py-4 overflow-y-auto">
          <SectionLabel>Main</SectionLabel>
          <ul className="space-y-1 mb-4">
            {CORE_ITEMS.map(item => (
              <li key={item.to}>
                <NavItem {...item} />
              </li>
            ))}
          </ul>

          <SectionLabel>Tools</SectionLabel>
          <div className="mb-1">
            <button
              onClick={() => setToolsOpen(o => !o)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-sky-700 hover:text-sky-900 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
              aria-expanded={toolsOpen}
              aria-controls="tools-group"
            >
              <span className="flex items-center gap-2">
                {/* little chevron lives on the left for better scan */}
                {toolsOpen ? (
                  <ChevronDown className="h-4 w-4 text-sky-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-sky-500" />
                )}
                Quick Utilities
              </span>
            </button>

            {toolsOpen && (
              <motion.ul
                id="tools-group"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 space-y-1 overflow-hidden"
              >
                {TOOL_ITEMS.map(item => (
                  <li key={item.to}>
                    <NavItem {...item} />
                  </li>
                ))}
              </motion.ul>
            )}
          </div>
        </nav>

        {/* Account / Sign out */}
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
