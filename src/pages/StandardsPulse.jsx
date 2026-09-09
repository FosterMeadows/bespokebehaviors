import React, { useContext, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Layers3, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { listenPlannerRows } from "../services/planner.js";
import { mergeWinPulse, winAsSequences } from "../utils/planner.js";
import { AuthContext } from "../AuthContext.jsx";
import ela8 from "../data/standards/ela8.json";
import { listenSequences } from "../services/sequences.js";
import { buildStandardsPulse, COVERAGE_LEVEL_OPTIONS } from "../utils/sequenceStandards.js";

const STANDARDS = ela8.filter((standard) => standard.code !== "None Apply");

const LEVEL_META = {
  not_addressed: { label: "Not addressed", badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  introduced: { label: "Introduced", badge: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  practiced: { label: "Practiced", badge: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  assessed: { label: "Assessed", badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
};

const LEVEL_FILTERS = [
  { value: "not_addressed", label: "Not addressed" },
  ...COVERAGE_LEVEL_OPTIONS,
];

export default function StandardsPulse() {
  const [params, setParams] = useSearchParams();
  const includeWin = params.get("win") === "1";
  const [weeks, setWeeks] = useState([]);
  const [winError, setWinError] = useState("");
  const { user } = useContext(AuthContext);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    return listenSequences(
      user?.uid,
      (rows) => {
        setSequences(rows);
        setError("");
        setLoading(false);
      },
      () => {
        setError("Standards Pulse is unavailable.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!includeWin) return;
    return listenPlannerRows(user?.uid, "winWeeks", (rows) => { setWeeks(rows); setWinError(""); }, () => setWinError("WIN coverage could not be loaded."));
  }, [user?.uid, includeWin]);
  const standardsWithState = useMemo(() => {
    const ela = buildStandardsPulse(STANDARDS, sequences);
    return includeWin ? mergeWinPulse(ela, buildStandardsPulse(STANDARDS, winAsSequences(weeks))) : ela;
  }, [sequences, weeks, includeWin]);
  const counts = useMemo(() => standardsWithState.reduce((summary, standard) => {
    summary[standard.coverageLevel] = (summary[standard.coverageLevel] || 0) + 1;
    if (standard.needsRevisit) summary.needs_revisit = (summary.needs_revisit || 0) + 1;
    return summary;
  }, {}), [standardsWithState]);

  const visibleStandards = useMemo(() => {
    const search = queryText.trim().toLowerCase();
    return standardsWithState.filter((standard) => {
      const matchesFilter = filter === "all"
        || standard.coverageLevel === filter
        || (filter === "needs_revisit" && standard.needsRevisit)
        || (filter === "not_assessed" && (standard.coverageLevel === "introduced" || standard.coverageLevel === "practiced"));
      const matchesSearch = !search || standard.code.toLowerCase().includes(search) || standard.text.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [filter, queryText, standardsWithState]);

  const filters = [
    { value: "all", label: "All", count: STANDARDS.length },
    ...LEVEL_FILTERS.map((option) => ({ ...option, count: counts[option.value] || 0 })),
    { value: "needs_revisit", label: "Needs revisit", count: counts.needs_revisit || 0 },
    { value: "not_assessed", label: "In progress, not assessed", count: (counts.introduced || 0) + (counts.practiced || 0) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8 pt-1">
      <header className="border-b border-slate-200 pb-5">
        <Link to="/command-center" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-violet-800"><ArrowLeft className="h-4 w-4" /> Command Center</Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-violet-200"><BookOpenCheck className="h-5 w-5" /></span>
            <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">ELA Grade 8</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Standards Pulse</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">A passive view of what completed instructional sequences actually covered.</p></div>
          </div>
          <Link to="/command-center/sequences" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-violet-800"><Layers3 className="h-4 w-4" /> Sequences</Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={includeWin} onChange={(event) => setParams(event.target.checked ? { win: "1" } : {})} /> Include WIN coverage</label><Link to="/command-center/planner?view=win" className="text-sm font-bold text-violet-700">WIN coverage history</Link></div>
      {includeWin && winError && <p role="alert" className="text-sm text-red-700">{winError}</p>}
      <section aria-label="Coverage summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LEVEL_FILTERS.map((option) => {
          const meta = LEVEL_META[option.value];
          return <button key={option.value} type="button" onClick={() => setFilter(option.value)} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-violet-300 ${filter === option.value ? "border-violet-400 ring-2 ring-violet-100" : "border-slate-200"}`}><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />{option.label}</div><div className="mt-2 text-2xl font-bold text-slate-950">{counts[option.value] || 0}</div></button>;
        })}
        <button type="button" onClick={() => setFilter("needs_revisit")} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-amber-300 ${filter === "needs_revisit" ? "border-amber-400 ring-2 ring-amber-100" : "border-slate-200"}`}><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Needs revisit</div><div className="mt-2 text-2xl font-bold text-slate-950">{counts.needs_revisit || 0}</div></button>
      </section>

      <section className="space-y-3" aria-labelledby="standards-list-heading">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 id="standards-list-heading" className="text-sm font-bold text-slate-950">All standards</h2><p className="mt-1 text-sm text-slate-600">{visibleStandards.length} of {STANDARDS.length} standards shown</p></div><label className="relative block w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><span className="sr-only">Search standards</span><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search code or language" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></label></div>
        <div className="flex flex-wrap gap-2" aria-label="Filter standards">{filters.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === item.value ? "bg-violet-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-violet-50 hover:text-violet-800"}`}>{item.label} · {item.count}</button>)}</div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>}
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading standards coverage…</div> : visibleStandards.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleStandards.map((standard) => {
              const meta = LEVEL_META[standard.coverageLevel] || LEVEL_META.not_addressed;
              return (
                <Link key={standard.code} to={`/command-center/standards/${encodeURIComponent(standard.code)}${includeWin ? "?win=1" : ""}`} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                  {standard.winCount > 0 && <p className="mb-2 text-xs font-bold text-sky-800">WIN practice: {standard.winCount} week{standard.winCount === 1 ? "" : "s"}</p>}
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{standard.code}</h3><span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ${meta.badge}`}>{meta.label}</span>{standard.needsRevisit && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-900 ring-1 ring-amber-200">Needs revisit</span>}</div><p className="mt-2 text-sm leading-6 text-slate-600">{standard.text}</p>{standard.latestSequenceTitle ? <div className="mt-3 text-xs text-slate-500"><span>Latest sequence: {standard.latestSequenceTitle}</span>{standard.latestNote && <span className="ml-3">{standard.latestNote}</span>}</div> : <div className="mt-3 text-xs text-slate-400">No completed sequence has reflected this standard yet.</div>}</div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-700" /></div>
                </Link>
              );
            })}
          </div>
        ) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No standards match this filter.</div>}
      </section>
    </div>
  );
}
