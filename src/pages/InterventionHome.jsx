import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Lock,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import {
  canUseAcademic,
  canUseBehavior,
  hasConfiguredAccess,
} from "../utils/access";

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
        action: "bg-sky-700 text-white group-hover:bg-sky-800",
        focus: "focus-visible:ring-sky-500",
        label: "Make-up work",
      }
    : {
        icon: "bg-emerald-100 text-emerald-700",
        border: "border-emerald-200 hover:border-emerald-400",
        accent: "bg-emerald-600",
        surface: "from-white to-emerald-50/60",
        action: "bg-emerald-700 text-white group-hover:bg-emerald-800",
        focus: "focus-visible:ring-emerald-500",
        label: "Expectation review",
      };

  const body = (
    <div
      className={`group relative h-full min-h-64 overflow-hidden rounded-lg border bg-gradient-to-br p-6 shadow-sm transition duration-200 ${
        enabled
          ? `${palette.border} ${palette.surface} hover:-translate-y-0.5 hover:shadow-lg`
          : "border-slate-200 from-white to-slate-50 opacity-75"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${enabled ? palette.accent : "bg-slate-300"}`} />
      <div className="flex h-full flex-col">
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
          {children && <div className="mt-4">{children}</div>}
          {enabled && (
            <div className="mt-auto pt-6">
              <span className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold shadow-sm transition-colors ${palette.action}`}>
                {actionLabel}
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
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
      className={`block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 ${palette.focus}`}
    >
      {body}
    </Link>
  );
}

export default function InterventionHome({ profile }) {
  const academicEnabled = canUseAcademic(profile);
  const behaviorEnabled = canUseBehavior(profile);
  const configured = hasConfiguredAccess(profile);

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-6 pt-1">
      {!configured && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Your app access has not been configured yet. Ask an app owner or school administrator to assign your role and grade scope.
        </section>
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

      <section aria-label="Choose a workspace">
        <div className="grid gap-5 md:grid-cols-2">
          <ModuleCard
            title="Academic"
            description="Add a student who needs to finish or correct academic work, then track the work through completion."
            icon={BookOpenCheck}
            enabled={academicEnabled}
            to="/academic"
            actionLabel="Add to Academic"
          />
          <ModuleCard
            title="Behavior"
            description="Assign a low-level behavior reteach to a student, then track service and completion."
            icon={MessageSquareWarning}
            enabled={behaviorEnabled}
            to="/behavior"
            actionLabel="Add to Behavior"
          />
        </div>
      </section>

      <section className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-5 py-3.5 text-sm leading-6 text-slate-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
        <p>{PRIVACY_NOTICE}</p>
      </section>
    </div>
  );
}
