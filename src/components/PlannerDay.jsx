import React, { useEffect, useState } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import { addPlannerTask, removePlannerTask, updatePlannerTask } from "../services/planner.js";
import { addDays } from "../utils/planner.js";

export default function PlannerDay({ uid, date, tasks, today, onError }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const tomorrow = addDays(date, 1);
  const rows = tasks.filter((item) => item.date === date).sort((a, b) => a.order - b.order);

  useEffect(() => {
    setText("");
    setMessage("");
    setShowAll(false);
  }, [date]);

  async function run(action) {
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch { onError("Could not update Things to Do. Please try again."); }
    finally { setBusy(false); }
  }

  return <section className={`min-w-0 rounded-xl border bg-white ${today ? "border-violet-300" : "border-slate-200"}`}>
    <header className="flex items-center justify-between rounded-t-xl border-b border-slate-100 bg-slate-50 px-3 py-2">
      <h2 className="text-sm font-bold text-slate-900">Things to Do</h2>
      {rows.length > 0 && <span className="text-xs font-medium text-slate-500">{rows.filter((item) => item.done).length} of {rows.length} done</span>}
    </header>
    <div className="px-3 py-2">
      {rows.length > 0 && <ul className="mb-2 divide-y divide-slate-100">
        {(showAll ? rows : rows.slice(0, 4)).map((item) => <li key={item.id} className="flex items-start gap-2 py-1">
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 py-1">
            <input aria-label={`Complete ${item.text}`} type="checkbox" className="mt-1" disabled={busy} checked={item.done} onChange={(e) => run(() => updatePlannerTask(uid, item.id, { done: e.target.checked }))} />
            <span className={`min-w-0 break-words text-sm leading-5 ${item.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.text}</span>
          </label>
          <button disabled={busy} title="Copy to Tomorrow" aria-label={`Copy ${item.text} to tomorrow`} onClick={() => run(async () => {
            await addPlannerTask(uid, tomorrow, item.text);
            setMessage(`Copied to ${new Date(`${tomorrow}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.`);
          })} className="shrink-0 rounded p-2 text-slate-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"><Copy size={15} /></button>
          <button disabled={busy} title="Remove Item" aria-label={`Remove ${item.text}`} onClick={() => run(() => removePlannerTask(uid, item.id))} className="shrink-0 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 size={15} /></button>
        </li>)}
      </ul>}
      {rows.length > 4 && <button type="button" aria-expanded={showAll} className="mb-2 rounded py-1 text-sm font-semibold text-violet-700 hover:underline" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show Fewer Tasks" : `Show All ${rows.length} Tasks`}</button>}
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(async () => { await addPlannerTask(uid, date, text); setText(""); }); }} className="flex gap-1">
        <input aria-label={`Add task for ${date}`} placeholder="Add an item" maxLength={500} className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm" value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !text.trim()} aria-label={`Add item to ${date}`} className="rounded-md bg-violet-700 px-2 text-white disabled:opacity-40"><Plus size={16} /></button>
      </form>
      {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
    </div>
  </section>;
}
