import React from "react";
import { ExternalLink, Layers3, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { safeMaterialsUrl } from "../utils/planner.js";

const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40";

export default function PlannerElaDay({ date, sequences, projection, busy, onSaveDays }) {
  const legacyDays = Array.isArray(projection?.transitions) ? projection.transitions : projection?.sequenceId ? [{ date: projection.week, sequenceId: projection.sequenceId, stepId: projection.stepId || "" }] : [];
  const days = Array.isArray(projection?.days) ? projection.days : legacyDays;
  const dayPlan = days.find((item) => item.date === date);
  const sequence = sequences.find((item) => item.id === dayPlan?.sequenceId);
  const step = sequence?.steps.find((item) => item.id === dayPlan?.stepId);
  const dayName = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });

  function save(sequenceId, stepId) {
    return onSaveDays([...days.filter((item) => item.date !== date), ...(sequenceId ? [{ date, sequenceId, stepId }] : [])].sort((a, b) => a.date.localeCompare(b.date)));
  }

  return <section className="rounded-xl border border-violet-200 bg-white shadow-sm">
    <header className="rounded-t-xl border-b border-violet-200 bg-violet-50 px-5 py-4">
      <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-violet-800"><Layers3 size={15} /> ELA · Planned For {dayName}</div>
      <label className="mt-2 block">
        <span className="sr-only">Planned Sequence</span>
        <select disabled={busy} className="w-full rounded-lg border border-violet-200 bg-white/80 px-3 py-2 text-base font-bold text-slate-950 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" value={dayPlan?.sequenceId || ""} onChange={(event) => {
          const nextSequence = sequences.find((item) => item.id === event.target.value);
          const firstStep = nextSequence?.steps.find((item) => item.id === nextSequence.activeStepId) || nextSequence?.steps.find((item) => item.status !== "complete") || nextSequence?.steps[0];
          save(nextSequence?.id || "", firstStep?.id || "");
        }}>
          <option value="">No Sequence Planned</option>
          {sequences.map((item) => <option key={item.id} value={item.id}>{item.title || "Untitled Sequence"} · {item.status.charAt(0).toUpperCase() + item.status.slice(1)}</option>)}
        </select>
      </label>
    </header>
    <div className="space-y-4 p-5">
      {sequence ? <>
        <label className="block text-sm font-bold text-slate-700">Planned Step
          <select disabled={busy} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900" value={dayPlan?.stepId || ""} onChange={(event) => save(sequence.id, event.target.value)}>
            <option value="">Choose a Step</option>
            {sequence.steps.map((item, index) => <option key={item.id} value={item.id}>Step {index + 1}: {item.title || "Untitled Step"}</option>)}
          </select>
        </label>
        {step && <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
          <p className="text-xs font-bold tracking-wide text-violet-700">Planned Position</p>
          <h3 className="mt-2 font-bold">Step {sequence.steps.indexOf(step) + 1}: {step.title}</h3>
          {step.purpose && <p className="mt-2 text-sm leading-6 text-slate-700">{step.purpose}</p>}
          {step.studentExperience?.filter((item) => item.text).map((item) => <p key={item.id} className="mt-2 text-sm text-slate-700">{item.text}{safeMaterialsUrl(item.url) && <a className="ml-2 inline-flex text-violet-800 underline" href={safeMaterialsUrl(item.url)} target="_blank" rel="noreferrer">Open <ExternalLink size={12} /></a>}</p>)}
        </div>}
        <div className="flex flex-wrap gap-2">
          <Link className={button} to={`/command-center/sequences/${sequence.id}`}>Open Sequence</Link>
          <button disabled={busy} className={`${button} !border-red-200 !text-red-700`} onClick={() => save("", "")}><Trash2 size={15} /> Remove Day Plan</button>
        </div>
      </> : <p className="text-sm text-slate-500">Choose the sequence and step you expect to use on this date. Today’s active sequence will not change.</p>}
    </div>
  </section>;
}
