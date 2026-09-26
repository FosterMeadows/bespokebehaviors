import { useState } from "react";
import { ChevronDown } from "lucide-react";

export const inputClass =
  "mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-violet-400";

export const linkClass =
  "rounded text-violet-800 underline decoration-violet-200 underline-offset-4 hover:decoration-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400";

export const percent = (count, total) =>
  total ? Math.round((count / total) * 100) : 0;

export const average = (value) => (value === null ? "—" : value.toFixed(1));

export function Card({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      {description && (
        <p className="mb-4 mt-1 text-sm text-slate-600">{description}</p>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, detail, onClick }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
        {label}
      </p>
      <div className="my-2 text-2xl font-bold text-slate-950">
        {onClick ? (
          <button type="button" className={linkClass} onClick={onClick}>
            {value}
          </button>
        ) : (
          value
        )}
      </div>
      <p className="text-sm text-slate-600">{detail}</p>
    </div>
  );
}

export function Expandable({ name, title, summary, children }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`analytics:${name}`) === "open";
    } catch {
      return false;
    }
  });
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`analytics-${name}`}
        className="flex w-full items-center justify-between gap-3 rounded text-left focus:outline-none focus:ring-2 focus:ring-violet-400"
        onClick={() => {
          setOpen(!open);
          try {
            localStorage.setItem(
              `analytics:${name}`,
              !open ? "open" : "closed",
            );
          } catch {
            /* Optional preference storage. */
          }
        }}
      >
        <span>
          <span className="block text-base font-bold text-slate-950">
            {title}
          </span>
          <span className="mt-1 block text-sm text-slate-600">{summary}</span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={`analytics-${name}`} hidden={!open} className="mt-5 space-y-5">
        {children}
      </div>
    </section>
  );
}

export function Empty() {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
      No served reteaches match these filters.
    </p>
  );
}
