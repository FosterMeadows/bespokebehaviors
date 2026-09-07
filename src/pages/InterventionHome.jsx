import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Lock,
  LogOut,
  MessageSquareWarning,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import {
  canUseAcademic,
  canUseBehavior,
  hasConfiguredAccess,
} from "../utils/access";
import { listenMyHomeContactRequirements, listenPendingBehaviorReteaches } from "../services/behavior";
import { listenPendingAcademicStudentCount } from "../services/academic";

const PRIVACY_NOTICE =
  "This tool is for limited grade-level coordination of make-up work and low-level reteaches. Do not enter grades, IEP information, counseling notes, formal discipline records, sensitive narratives, or WVEIS details.";

function ModuleCard({ title, description, icon, enabled, to, actionLabel, children }) {
  const isAcademic = title === "Academic";
  const palette = isAcademic
    ? {
        icon: "bg-sky-100 text-sky-700",
        border: "border-sky-300 hover:border-sky-400",
        action: "bg-sky-700 text-white group-hover:bg-sky-800",
        focus: "focus-visible:ring-sky-500",
        label: "Make-up work",
      }
    : {
        icon: "bg-emerald-100 text-emerald-700",
        border: "border-emerald-300 hover:border-emerald-400",
        action: "bg-emerald-700 text-white group-hover:bg-emerald-800",
        focus: "focus-visible:ring-emerald-500",
        label: "Expectation review",
      };

  const body = (
    <div
      className={`group relative h-full overflow-hidden rounded-2xl border bg-white p-6 shadow-md shadow-slate-200/60 transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none sm:p-8 ${
        enabled
          ? `${palette.border} motion-safe:hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/80`
          : "border-slate-200 opacity-75"
      }`}
    >
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${enabled ? palette.icon : "bg-slate-100 text-slate-400"}`}>
            {React.createElement(icon, { className: "h-6 w-6", strokeWidth: 1.75, "aria-hidden": true })}
          </div>
          {!enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Access needed
            </span>
          )}
        </div>
        <div className="mt-5 flex flex-1 flex-col">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{palette.label}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{title}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
          {enabled && (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-7">
              <span className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${palette.action}`}>
                {actionLabel}
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              {children && <div className="shrink-0">{children}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!enabled) return body;
  return (
    <Link
      to={to}
      className={`block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 ${palette.focus}`}
    >
      {body}
    </Link>
  );
}

export default function InterventionHome({ profile, user, logout }) {
  const academicEnabled = canUseAcademic(profile);
  const behaviorEnabled = canUseBehavior(profile);
  const configured = hasConfiguredAccess(profile);
  const [pendingContacts, setPendingContacts] = useState([]);
  const [pendingReteaches, setPendingReteaches] = useState(null);
  const [pendingAcademicStudents, setPendingAcademicStudents] = useState(null);

  useEffect(() => {
    if (!academicEnabled) {
      setPendingAcademicStudents(null);
      return undefined;
    }
    setPendingAcademicStudents(null);
    return listenPendingAcademicStudentCount(
      profile,
      count => setPendingAcademicStudents(count),
      () => setPendingAcademicStudents(null)
    );
  }, [academicEnabled, profile]);

  useEffect(() => {
    if (!user?.uid || !behaviorEnabled) return undefined;
    return listenMyHomeContactRequirements(
      user.uid,
      rows => setPendingContacts(rows.filter(item => item.status === "pending")),
      () => setPendingContacts([])
    );
  }, [behaviorEnabled, user?.uid]);

  useEffect(() => {
    if (!behaviorEnabled) {
      setPendingReteaches(null);
      return undefined;
    }
    return listenPendingBehaviorReteaches(
      profile,
      rows => setPendingReteaches(rows),
      () => setPendingReteaches(null)
    );
  }, [behaviorEnabled, profile]);

  if (profile?.disabled === true) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4 py-10">
        <section className="w-full rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
            <Lock className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">Account access is disabled</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">This account cannot access student records. Contact an app owner if you believe this is an error.</p>
          <button type="button" onClick={logout} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">
            <LogOut className="h-4 w-4" />Sign Out
          </button>
        </section>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4 py-10">
        <section className="w-full rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">Account registered successfully</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Your account is ready for an app owner to assign your teacher role and grade access. You do not have access to student records while configuration is pending.</p>
          <div className="mx-auto mt-5 max-w-md rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Registered account</div>
            <div className="mt-1 break-all text-sm font-semibold text-slate-900">{user?.email || profile?.contactEmail || "School Google account"}</div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">You may sign out now. Your access will update automatically after it is assigned.</p>
          <button type="button" onClick={logout} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">
            <LogOut className="h-4 w-4" />Sign Out
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10 pt-5 sm:pt-9">
      {pendingContacts.length > 0 && (
        <Link to="/behavior" className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-100/70">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><PhoneCall className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-bold">Required Home Contact Follow-Up</span>
              <span className="mt-0.5 block text-sm">{pendingContacts.length} {pendingContacts.length === 1 ? "attempt remains" : "attempts remain"} to be recorded.</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide">Open Behavior</span>
        </Link>
      )}

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Reteach Workspace</h1>
        <p className="mt-3 text-base leading-6 text-slate-600">Choose a workspace to add a student and coordinate the next step.</p>
      </header>

      <section
        aria-label="Choose a workspace"
        className="grid gap-5 md:grid-cols-2"
      >
          <ModuleCard
            title="Academic"
            description="Add a student who needs to finish or correct academic work, then track the work through completion."
            icon={BookOpenCheck}
            enabled={academicEnabled}
            to="/academic"
            actionLabel="Open Academic"
          >
            {academicEnabled && <div
              aria-live="polite"
              aria-label={pendingAcademicStudents === null
                ? "Academic pending count loading"
                : `${pendingAcademicStudents} ${pendingAcademicStudents === 1 ? "student" : "students"} with pending academic assignments`}
              className={`inline-flex items-center gap-2 text-sm font-medium ${
                pendingAcademicStudents === null
                  ? "text-slate-500"
                  : pendingAcademicStudents > 0
                    ? "text-slate-600"
                    : "text-emerald-700"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                pendingAcademicStudents > 0 ? "text-slate-400" : "text-emerald-600"
              }`}>
                {pendingAcademicStudents === null || pendingAcademicStudents > 0
                  ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              {pendingAcademicStudents === null ? "Loading…" : `${pendingAcademicStudents} pending`}
            </div>}
          </ModuleCard>
          <ModuleCard
            title="Behavior"
            description="Assign a low-level behavior reteach to a student, then track service and completion."
            icon={MessageSquareWarning}
            enabled={behaviorEnabled}
            to="/behavior"
            actionLabel="Open Behavior"
          >
            {behaviorEnabled && <div
              aria-live="polite"
              className={`inline-flex items-center gap-2 text-sm font-medium ${
                pendingReteaches === null
                  ? "text-slate-500"
                  : pendingReteaches.length > 0
                    ? "text-slate-600"
                    : "text-emerald-700"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                pendingReteaches?.length > 0 ? "text-slate-400" : "text-emerald-600"
              }`}>
                {pendingReteaches === null || pendingReteaches.length > 0
                  ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              {pendingReteaches === null ? "Loading…" : `${pendingReteaches.length} pending`}
            </div>}
          </ModuleCard>
      </section>

      <section className="flex gap-3 border-t border-slate-200 pt-5">
        <span className="shrink-0 pt-0.5 text-slate-400">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Keep records operational</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{PRIVACY_NOTICE}</p>
        </div>
      </section>
    </div>
  );
}
