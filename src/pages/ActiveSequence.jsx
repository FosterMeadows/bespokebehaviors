import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Layers3,
  Pencil,
  Play,
  Plus,
  SkipForward,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { AuthContext } from "../AuthContext.jsx";
import {
  completeAndActivateNext,
  createSequence,
  listenActiveSequence,
  setStepStatus,
  skipAndActivateNext,
} from "../services/sequences.js";

function validLink(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export default function ActiveSequence() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sequence, setSequence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => listenActiveSequence(
    user?.uid,
    (active) => {
      setSequence(active);
      setSelectedStepId(active?.activeStepId || active?.steps?.find((step) => step.status === "active")?.id || "");
      setLoading(false);
      setError("");
    },
    () => {
      setError("The active sequence is unavailable.");
      setLoading(false);
    }
  ), [user?.uid]);

  const activeIndex = useMemo(() => sequence?.steps?.findIndex((step) => step.id === sequence.activeStepId || step.status === "active") ?? -1, [sequence]);
  const activeStep = activeIndex >= 0 ? sequence.steps[activeIndex] : null;
  const activeSummativeChecks = activeStep ? sequence.summativeChecks.filter((check) => check.afterStepId === activeStep.id) : [];

  async function run(action) {
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(actionError?.message || "Could not update the active sequence.");
    } finally {
      setWorking(false);
    }
  }

  async function handleCreate() {
    setWorking(true);
    try {
      const id = await createSequence(user.uid);
      navigate(`/command-center/sequences/${id}`, { state: { edit: true } });
    } catch (createError) {
      setError(createError?.message || "Could not create a sequence.");
      setWorking(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading active sequence…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10 pt-1">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <Link to="/command-center/sequences" className="inline-flex h-10 items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-violet-800"><ArrowLeft className="h-4 w-4" /> Sequences</Link>
        {sequence && <Link to={`/command-center/sequences/${sequence.id}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Layers3 className="h-4 w-4" /> Return to Sequence</Link>}
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {!sequence ? (
        <section className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-10 text-center">
          <CircleDot className="mx-auto h-8 w-8 text-violet-500" />
          <h1 className="mt-3 text-xl font-bold text-slate-950">No active sequence</h1>
          <p className="mt-2 text-sm text-slate-600">Choose an existing sequence or create a new one.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link to="/command-center/sequences" className="inline-flex h-10 items-center rounded-lg border border-violet-300 bg-white px-4 text-sm font-bold text-violet-700">Choose sequence</Link>
            <button type="button" onClick={handleCreate} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Create sequence</button>
          </div>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
            <header className="border-b border-violet-200 bg-violet-50/60 px-6 py-5">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-700 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-white">Active sequence</span></div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{sequence.title}</h1>
              {sequence.description && <p className="mt-2 text-sm leading-6 text-slate-600">{sequence.description}</p>}
            </header>

            {!activeStep ? (
              <div className="p-8 text-center">
                <Play className="mx-auto h-7 w-7 text-violet-500" />
                <h2 className="mt-3 text-lg font-bold text-slate-950">No active step</h2>
                <p className="mt-1 text-sm text-slate-600">Choose the point in the sequence where instruction is currently happening.</p>
                <div className="mx-auto mt-5 flex max-w-lg gap-2">
                  <select value={selectedStepId} onChange={(event) => setSelectedStepId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    <option value="">Choose a step</option>
                    {sequence.steps.map((step, index) => <option key={step.id} value={step.id}>Step {index + 1}: {step.title || "Untitled step"}</option>)}
                  </select>
                  <button type="button" disabled={!selectedStepId || working} onClick={() => run(() => setStepStatus(user.uid, sequence.id, sequence, selectedStepId, "active"))} className="h-10 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50">Choose active step</button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Step {activeIndex + 1} of {sequence.steps.length}</div><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{activeStep.title}</h2></div>
                  <Link to={`/command-center/sequences/${sequence.id}#step-${activeStep.id}`} state={{ edit: true }} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Edit Step</Link>
                </div>
                <section><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Purpose</h3><p className="mt-2 text-base leading-7 text-slate-700">{activeStep.purpose}</p></section>
                <section className="rounded-lg border border-sky-200 bg-sky-50/50 p-4"><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Student experience</h3><ul className="mt-3 space-y-2">{activeStep.studentExperience.filter((item) => item.text).map((item) => <li key={item.id} className="flex gap-2 text-sm leading-6 text-slate-700"><span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-sky-500" /><span>{item.text}{item.url && validLink(item.url) && <a href={item.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-bold text-sky-800">Open <ExternalLink className="h-3.5 w-3.5" /></a>}</span></li>)}</ul></section>
                {activeSummativeChecks.map((check) => <section key={check.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-4"><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Summative Check</h3><h4 className="mt-2 text-lg font-bold tracking-tight text-slate-950">{check.title || "Untitled summative check"}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{check.description || "No description added yet."}</p></section>)}
                {activeStep.tags.length > 0 && <div className="flex flex-wrap gap-2">{activeStep.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{tag}</span>)}</div>}
                {activeStep.resourcesPrep.length > 0 && <details open className="rounded-lg border border-slate-200"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700">Resources &amp; Prep</summary><ul className="space-y-2 border-t border-slate-200 p-4">{activeStep.resourcesPrep.map((item) => <li key={item.id} className="flex items-start gap-2 text-sm text-slate-700"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-2.5 w-2.5" /></span><span>{item.text}{item.url && validLink(item.url) && <a href={item.url} target="_blank" rel="noreferrer" className="ml-2 font-bold text-violet-700">Open link</a>}</span></li>)}</ul></details>}
                {activeStep.teacherNotes && <details className="rounded-lg border border-slate-200"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700">Teacher Notes</summary><p className="whitespace-pre-wrap border-t border-slate-200 p-4 text-sm leading-6 text-slate-700">{activeStep.teacherNotes}</p></details>}
              </div>
            )}
          </section>

          {activeStep && (
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => run(() => skipAndActivateNext(user.uid, sequence.id, sequence))} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-amber-800 hover:bg-amber-50"><SkipForward className="h-4 w-4" /> Mark Skipped</button>
                <button type="button" onClick={() => run(() => completeAndActivateNext(user.uid, sequence.id, sequence))} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"><CheckCircle2 className="h-4 w-4" /> Complete and Activate Next</button>
              </div>
              {sequence.steps.length > 1 && <details className="mt-3 border-t border-slate-200 pt-3"><summary className="cursor-pointer list-none text-xs font-bold text-slate-600 hover:text-violet-700">Choose a Different Step</summary><div className="mt-3 flex flex-wrap gap-2"><select value={selectedStepId} onChange={(event) => setSelectedStepId(event.target.value)} aria-label="Activate a different step" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm">{sequence.steps.map((step, index) => <option key={step.id} value={step.id}>Step {index + 1}: {step.title}</option>)}</select><button type="button" onClick={() => run(() => setStepStatus(user.uid, sequence.id, sequence, selectedStepId, "active"))} disabled={working || selectedStepId === activeStep.id} className="h-10 rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700 disabled:opacity-40">Activate Step</button></div></details>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
