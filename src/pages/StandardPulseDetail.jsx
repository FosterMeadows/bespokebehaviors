import React, { useContext, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Layers3 } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { listenPlannerRows } from "../services/planner.js";
import { mergeWinPulse, winAsSequences } from "../utils/planner.js";
import { AuthContext } from "../AuthContext.jsx";
import ela8 from "../data/standards/ela8.json";
import { listenSequences } from "../services/sequences.js";
import { buildStandardsPulse, COVERAGE_LEVEL_OPTIONS } from "../utils/sequenceStandards.js";

const STANDARDS = ela8.filter((standard) => standard.code !== "None Apply");

function coverageLabel(value) {
  if (value === "not_addressed") return "Not addressed";
  return COVERAGE_LEVEL_OPTIONS.find((option) => option.value === value)?.label || value;
}

export default function StandardPulseDetail() {
  const [params] = useSearchParams();
  const includeWin = params.get("win") === "1";
  const [weeks, setWeeks] = useState([]);
  const [winError, setWinError] = useState("");
  const { standardCode = "" } = useParams();
  const { user } = useContext(AuthContext);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const standard = useMemo(() => {
    const ela = buildStandardsPulse(STANDARDS, sequences);
    return (includeWin ? mergeWinPulse(ela, buildStandardsPulse(STANDARDS, winAsSequences(weeks))) : ela).find((item) => item.code === standardCode);
  }, [sequences, standardCode, weeks, includeWin]);
  useEffect(() => {
    if (!includeWin) return;
    return listenPlannerRows(user?.uid, "winWeeks", (rows) => { setWeeks(rows); setWinError(""); }, () => setWinError("WIN coverage could not be loaded."));
  }, [user?.uid, includeWin]);

  useEffect(() => {
    setLoading(true);
    return listenSequences(user?.uid, (rows) => { setSequences(rows); setLoading(false); setError(""); }, () => { setError("This standard history is unavailable."); setLoading(false); });
  }, [user?.uid]);

  if (!standard) return <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h1 className="font-bold">Standard not found</h1><Link to={`/command-center/standards${includeWin ? "?win=1" : ""}`} className="mt-3 inline-flex text-sm font-semibold underline">Return to Standards Pulse</Link></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8 pt-1">
      <header className="border-b border-slate-200 pb-5"><Link to={`/command-center/standards${includeWin ? "?win=1" : ""}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-violet-800"><ArrowLeft className="h-4 w-4" /> Standards Pulse</Link><div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-violet-200"><BookOpenCheck className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">{standard.code}</p><h1 className="mt-1 max-w-3xl text-xl font-bold leading-7 text-slate-950">{standard.text}</h1></div></div><Link to="/command-center/sequences" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700 shadow-sm hover:bg-violet-50"><Layers3 className="h-4 w-4" /> Sequences</Link></div></header>

      {(error || winError) && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error || winError}</div>}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current condition</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700">{coverageLabel(standard.coverageLevel)}</span>{standard.needsRevisit && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-900">Needs revisit</span>}</div>{standard.latestSequenceTitle && <p className="mt-3 text-sm text-slate-600">Latest evidence came from <span className="font-semibold text-slate-800">{standard.latestSequenceTitle}</span>.</p>}</section>

      <section aria-labelledby="coverage-history-heading"><div><h2 id="coverage-history-heading" className="text-sm font-bold text-slate-950">Instruction history</h2><p className="mt-1 text-sm text-slate-600">Coverage appears here after instruction is completed.</p></div>{loading ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading history…</div> : standard.history.length ? <div className="mt-3 space-y-3">{standard.history.map((entry) => <Link key={entry.sequenceId} to={entry.href} className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{entry.sequenceTitle}</h3><span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">{coverageLabel(entry.coverageLevel)}</span>{entry.needsRevisit && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">Needs revisit</span>}</div>{entry.outcome && <p className="mt-2 text-sm text-slate-600">Outcome: {entry.outcome}</p>}{entry.note && <p className="mt-2 text-sm leading-6 text-slate-700">{entry.note}</p>}{entry.sequenceReflection && <p className="mt-2 text-xs leading-5 text-slate-500">Reflection: {entry.sequenceReflection}</p>}</div><ArrowRight className="mt-1 h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-violet-700" /></div></Link>)}</div> : <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm leading-6 text-slate-600">No completed sequence has reflected this standard yet.</div>}</section>
    </div>
  );
}
