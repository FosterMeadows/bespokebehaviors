import React from "react";
import {
  ArrowRight,
  BookOpenCheck,
  HeartHandshake,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

const MODULES = [
  {
    title: "Student Supports",
    description: "Keep accommodations, classroom supports, reminders, and student follow-ups close at hand.",
    icon: HeartHandshake,
    to: "/command-center/student-supports",
    iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
    cardClass: "border-amber-200 hover:border-amber-400 focus-visible:ring-amber-500",
    arrowClass: "group-hover:text-amber-700",
  },
  {
    title: "Sequences",
    description: "Arrange meaningful instructional steps, keep the current position visible, and preserve the path for reuse.",
    icon: Layers3,
    to: "/command-center/sequences",
    iconClass: "bg-violet-50 text-violet-700 ring-violet-100",
    cardClass: "border-violet-200 hover:border-violet-400 focus-visible:ring-violet-500",
    arrowClass: "group-hover:text-violet-700",
  },
  {
    title: "Classroom Interventions",
    description: "Record meaningful low-level actions and the next step without creating formal discipline records.",
    icon: ShieldCheck,
    iconClass: "bg-rose-50 text-rose-700 ring-rose-100",
    cardClass: "border-rose-200",
    statusClass: "bg-rose-50 text-rose-700",
  },
  {
    title: "Standards Pulse",
    description: "Complete instructional sequences, then let the reflected work update standards coverage passively.",
    icon: BookOpenCheck,
    to: "/command-center/standards",
    iconClass: "bg-sky-50 text-sky-700 ring-sky-100",
    cardClass: "border-sky-200 hover:border-sky-400 focus-visible:ring-sky-500",
    arrowClass: "group-hover:text-sky-700",
  },
];

export default function CommandCenter() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8 pt-1">
      <header className="border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Personal workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Teacher Command Center</h1>
        </div>
      </header>

      <section aria-label="Command Center modules">
        <div className="grid gap-4 md:grid-cols-2">
          {MODULES.map(({ title, description, icon, to, iconClass, cardClass, statusClass, arrowClass }) => {
            const content = (
              <div className="flex items-start gap-4">
                <span className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl ring-1 ${iconClass}`}>
                  {React.createElement(icon, { className: "h-8 w-8", "aria-hidden": true })}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-950">{title}</h3>
                    {!to && <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide ${statusClass}`}>Not started</span>}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
                {to && <ArrowRight className={`h-4 w-4 shrink-0 self-center text-slate-400 transition group-hover:translate-x-0.5 ${arrowClass}`} aria-hidden="true" />}
              </div>
            );

            return to ? (
              <Link key={title} to={to} className={`group rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 ${cardClass}`}>
                {content}
              </Link>
            ) : (
              <article key={title} className={`rounded-xl border bg-white p-5 shadow-sm ${cardClass}`}>{content}</article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
