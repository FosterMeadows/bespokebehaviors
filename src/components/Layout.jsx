// Layout.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  BookOpenCheck,
  BadgeCheck,
  ChevronDown,
  ClipboardList,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Search,
  Settings,
  ShieldCheck,
  Timer,
  Upload,
  UserCog,
  UserCircle
} from "lucide-react";
import { canUseAcademic, canUseAdmin, canUseBehavior, canUseLegacyTools } from "../utils/access";

function classNames(...c) {
  return c.filter(Boolean).join(" ");
}

function InitialsAvatar({ name }) {
  const initials = useMemo(() => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (/^(mr|mrs|ms|miss|dr)\.?$/i.test(parts[0])) parts.shift();
    const surname = parts.at(-1) || name.trim();
    return surname.slice(0, 2).toUpperCase();
  }, [name]);
  return (
    <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-700 text-sm font-semibold text-white">
      {initials}
    </div>
  );
}

const PRIMARY_ITEMS = [
  { to: "/academic", label: "Academic", icon: BookOpenCheck, gate: canUseAcademic },
  { to: "/behavior", label: "Behavior", icon: ShieldCheck, gate: canUseBehavior },
  { to: "/students", label: "Students", icon: Search }
];

const LEGACY_ITEMS = [
  { to: "/dashboard", label: "Legacy Dashboard", icon: LayoutDashboard },
  { to: "/dailyplan", label: "Plans", icon: FileText },
  { to: "/standards", label: "Standards", icon: GraduationCap },
  { to: "/teachernotes", label: "Notes", icon: NotebookPen },
  { to: "/megachecklist", label: "Checklist", icon: ClipboardList },
  { to: "/gradecalculator", label: "Grade Calculator", icon: FileText },
  { to: "/one-minute-human", label: "One-Minute Human", icon: Timer },
  { to: "/log", label: "Old Behavior Log", icon: ShieldCheck }
];

const ADMIN_ITEMS = [
  { to: "/history", label: "History", icon: History },
  { to: "/admin/import-students", label: "Import Students", icon: Upload }
];

function TopNavLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        classNames(
          "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
          "hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400",
          isActive ? "border border-sky-200 bg-sky-100 text-sky-950" : "border border-transparent text-slate-700"
        )
      }
    >
      {React.createElement(icon, { className: "h-4 w-4" })}
      <span>{label}</span>
    </NavLink>
  );
}

function Menu({ label, icon, items, open, onToggle, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className={classNames(
          "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700",
          "hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400",
          open && "bg-sky-100 text-sky-950"
        )}
        aria-expanded={open}
      >
        {React.createElement(icon, { className: "h-4 w-4" })}
        <span>{label}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {items.map(({ to, label: itemLabel, icon: itemIcon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-950"
            >
              {React.createElement(itemIcon, { className: "h-4 w-4 text-sky-600" })}
              {itemLabel}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ displayName, email, logout, open, onToggle, onClose, active }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) onClose();
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div className="relative ml-2 border-l border-slate-200 pl-3" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Account menu for ${displayName || "current user"}`}
        className={classNames(
          "inline-flex h-10 items-center gap-2 rounded-lg border px-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-400",
          open || active ? "border-sky-200 bg-sky-100 text-sky-950" : "border-transparent text-slate-700 hover:bg-slate-100"
        )}
      >
        <InitialsAvatar name={displayName} />
        <span className="max-w-36 truncate">{displayName || "Account"}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 px-3 py-3">
            <div className="truncate text-sm font-bold text-slate-950">{displayName || "Account"}</div>
            {email && <div className="mt-0.5 truncate text-xs text-slate-500">{email}</div>}
          </div>
          <div className="p-2">
            <Link to="/profile" onClick={onClose} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-950">
              <UserCircle className="h-4 w-4 text-sky-600" />
              Profile
            </Link>
            <button
              type="button"
              onClick={() => { onClose(); logout(); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              <LogOut className="h-4 w-4 text-slate-500" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, displayName, logout, profile }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const showLegacyTools = canUseLegacyTools(profile);
  const showAdminTools = canUseAdmin(profile);
  const adminItems = showLegacyTools
    ? [...ADMIN_ITEMS, { to: "/admin/teachers", label: "Manage Teachers", icon: UserCog }]
    : ADMIN_ITEMS;

  const visiblePrimary = PRIMARY_ITEMS.filter(item => !item.gate || item.gate(profile));
  const isAcademicPath = location.pathname === "/academic" || location.pathname.startsWith("/academic/");

  useEffect(() => {
    setMoreOpen(false);
    setAdminOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-svh bg-[#f8f8f6]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-4 px-4">
          <Link
            to="/"
            onMouseDown={event => event.preventDefault()}
            className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-700 shadow-sm">
              <BadgeCheck className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <span className="text-base font-semibold text-slate-950">Checkpoint</span>
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1">
            {visiblePrimary.map(item => (
              <TopNavLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {showLegacyTools && (
              <Menu
                label="More"
                icon={Settings}
                items={LEGACY_ITEMS}
                open={moreOpen}
                onToggle={() => {
                  setMoreOpen(open => !open);
                  setAdminOpen(false);
                  setAccountOpen(false);
                }}
                onClose={() => setMoreOpen(false)}
              />
            )}
            {showAdminTools && (
              <Menu
                label="Admin"
                icon={History}
                items={adminItems}
                open={adminOpen}
                onToggle={() => {
                  setAdminOpen(open => !open);
                  setMoreOpen(false);
                  setAccountOpen(false);
                }}
                onClose={() => setAdminOpen(false)}
              />
            )}
            <AccountMenu
              displayName={displayName}
              email={profile?.contactEmail}
              logout={logout}
              open={accountOpen}
              active={location.pathname === "/profile"}
              onToggle={() => {
                setAccountOpen(open => !open);
                setMoreOpen(false);
                setAdminOpen(false);
              }}
              onClose={() => setAccountOpen(false)}
            />
          </div>
        </div>
      </header>

      <main className={isAcademicPath ? "min-h-[calc(100svh-4.5rem)] bg-white" : "mx-auto max-w-7xl px-4 py-6"}>
        {children}
      </main>
    </div>
  );
}
