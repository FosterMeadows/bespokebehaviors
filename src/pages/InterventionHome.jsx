import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  BadgeCheck,
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
        border: "border-sky-200 hover:border-sky-400",
        accent: "bg-sky-600",
        surface: "from-white to-sky-50/60",
        watermark: "text-sky-200/55",
        action: "bg-sky-700 text-white group-hover:bg-sky-800",
        focus: "focus-visible:ring-sky-500",
        label: "Make-up work",
      }
    : {
        icon: "bg-emerald-100 text-emerald-700",
        border: "border-emerald-200 hover:border-emerald-400",
        accent: "bg-emerald-600",
        surface: "from-white to-emerald-50/60",
        watermark: "text-emerald-200/55",
        action: "bg-emerald-700 text-white group-hover:bg-emerald-800",
        focus: "focus-visible:ring-emerald-500",
        label: "Expectation review",
      };

  const body = (
    <div
      className={`group relative h-full min-h-64 overflow-hidden rounded-xl border bg-gradient-to-br p-6 shadow-sm transition duration-200 ${
        enabled
          ? `${palette.border} ${palette.surface} hover:-translate-y-1 hover:shadow-xl`
          : "border-slate-200 from-white to-slate-50 opacity-75"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${enabled ? palette.accent : "bg-slate-300"}`} />
      <div className={`pointer-events-none absolute -bottom-8 -right-7 ${enabled ? palette.watermark : "text-slate-200/60"}`} aria-hidden="true">
        {React.createElement(icon, { className: "h-36 w-36", strokeWidth: 1 })}
      </div>
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-lg ${enabled ? palette.icon : "bg-slate-100 text-slate-400"}`}>
            {React.createElement(icon, { className: "h-7 w-7", strokeWidth: 1.75 })}
          </div>
          {!enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Access needed
            </span>
          )}
        </div>
        <div className="mt-7 flex flex-1 flex-col">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{palette.label}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{title}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
          {enabled && (
            <div className="mt-auto flex items-stretch gap-3 pt-6">
              <span className={`inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold shadow-sm transition-colors ${palette.action}`}>
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
      className={`block h-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 ${palette.focus}`}
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
    <div className="mx-auto max-w-6xl space-y-4 pb-6 pt-1">
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

      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
            <BadgeCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Reteach workspace</h1>
            <div className="mt-0.5 text-sm text-slate-600">Choose a workspace to add a student and coordinate the next step.</div>
          </div>
        </div>
      </header>

      <section
        aria-label="Choose a workspace"
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-sky-50/70 via-white to-emerald-50/70 p-3 shadow-sm sm:p-4"
      >
        <div className="pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full bg-sky-200/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-emerald-200/25 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-5 md:grid-cols-2">
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
              className={`inline-flex h-full w-fit items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-bold backdrop-blur-sm ${
                pendingAcademicStudents === null
                  ? "border-slate-200/80 bg-white/55 text-slate-600"
                  : pendingAcademicStudents > 0
                    ? "border-amber-200/80 bg-amber-50/65 text-amber-950"
                    : "border-emerald-200/80 bg-emerald-50/65 text-emerald-900"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                pendingAcademicStudents > 0 ? "bg-amber-100/90 text-amber-700" : "bg-emerald-100/90 text-emerald-700"
              }`}>
                {pendingAcademicStudents === null || pendingAcademicStudents > 0
                  ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              {pendingAcademicStudents === null ? "— Pending" : `${pendingAcademicStudents} Pending`}
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
              className={`inline-flex h-full w-fit items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-bold backdrop-blur-sm ${
                pendingReteaches === null
                  ? "border-slate-200/80 bg-white/55 text-slate-600"
                  : pendingReteaches.length > 0
                    ? "border-amber-200/80 bg-amber-50/65 text-amber-950"
                    : "border-emerald-200/80 bg-emerald-50/65 text-emerald-900"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                pendingReteaches?.length > 0 ? "bg-amber-100/90 text-amber-700" : "bg-emerald-100/90 text-emerald-700"
              }`}>
                {pendingReteaches === null || pendingReteaches.length > 0
                  ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              {pendingReteaches === null ? "— Pending" : `${pendingReteaches.length} Pending`}
            </div>}
          </ModuleCard>
        </div>
      </section>

      <section className="flex gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
        <span className="flex w-14 shrink-0 self-stretch items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <ShieldCheck className="h-full w-full opacity-30" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Keep Records Operational</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{PRIVACY_NOTICE}</p>
        </div>
      </section>
    </div>
  );
}
