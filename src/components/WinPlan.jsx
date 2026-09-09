import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Save, CheckCircle2, Plus, Trash2 } from "lucide-react";
import ela8 from "../data/standards/ela8.json";
import { blankWin, safeMaterialsUrl, validateWin } from "../utils/planner.js";
import { saveWin } from "../services/planner.js";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button = "inline-flex items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-sm font-bold text-violet-800 disabled:opacity-50";
const standards = ela8.filter((item) => item.code !== "None Apply");
const collapseKey = "instruction-planner-win-collapsed";

function savedCollapsePreference() {
  try { return window.localStorage.getItem(collapseKey) === "true"; }
  catch { return false; }
}

export default function WinPlan({ uid, week, saved, onDirty }) {
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(savedCollapsePreference);
  const win = draft || saved || blankWin(week);
  const noteBullets = (win.notes || "").split(/\r?\n/);
  const visibleNotes = noteBullets.map((note) => note.trim()).filter(Boolean);
  useEffect(() => { onDirty(Boolean(draft)); return () => onDirty(false); }, [draft, onDirty]);
  function change(changes) { setDraft({ ...win, ...changes }); setConfirmed(false); }
  async function save(complete = false) {
    const issue = validateWin(win, complete || win.status === "complete");
    if (issue || (complete && !confirmed)) { setError(issue || "Confirm the selected standards before completing WIN."); return; }
    setBusy(true); setError("");
    try { await saveWin(uid, win, complete); setDraft(null); setEditing(false); setReviewing(false); }
    catch (e) { setError(e.message || "Could not save WIN. Your edits are still here."); }
    finally { setBusy(false); }
  }
  const choosing = editing || reviewing;
  return <section className="rounded-xl border border-sky-200 bg-white shadow-sm">
    <header className={`flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-sky-200 bg-sky-50 px-4 ${collapsed ? "py-3" : "py-4"}`}>
      <div><p className="text-xs font-bold tracking-wider text-sky-800">WIN · This Week</p><h2 className="mt-1 text-lg font-bold text-slate-950">{win.title || "Plan the weekly lesson"}</h2></div>
      <div className="flex gap-2">{win.status === "complete" && <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">Completed</span>}{!choosing && <button className={button} onClick={() => { setCollapsed(false); setEditing(true); }}><Pencil size={15} /> {saved ? "Edit" : "Plan WIN"}</button>}<button type="button" disabled={choosing} title={collapsed ? "Expand WIN Panel" : "Collapse WIN Panel"} aria-label={collapsed ? "Expand WIN Panel" : "Collapse WIN Panel"} aria-expanded={!collapsed} className="rounded-lg border border-sky-200 bg-white/70 p-2 text-sky-800 hover:bg-white disabled:opacity-30" onClick={() => setCollapsed((value) => { const next = !value; try { window.localStorage.setItem(collapseKey, String(next)); } catch { /* Preference persistence is optional. */ } return next; })}>{collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></div>
    </header>
    {collapsed && <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-sky-900">IXL Practice</span>
        {win.skills.filter((skill) => skill.code).map((skill, index) => <span key={`${skill.code}-${index}`} title={skill.name || skill.code} className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1 font-mono text-xs font-bold text-sky-800 shadow-sm">{skill.code}</span>)}
        {!win.skills.some((skill) => skill.code) && <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">None Assigned</span>}
      </div>
      {safeMaterialsUrl(win.materialsUrl) && <a href={safeMaterialsUrl(win.materialsUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50/70 px-2.5 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100">Lesson Materials <ExternalLink size={13} /></a>}
    </div>}
    {!collapsed && <div className="space-y-4 p-5">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {editing ? <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm font-semibold">Topic / title<input className={field} maxLength={180} value={win.title} onChange={(e) => change({ title: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Materials link<input type="url" className={field} maxLength={2000} placeholder="Canva or other lesson materials" value={win.materialsUrl} onChange={(e) => change({ materialsUrl: e.target.value })} /></label>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Implementation Notes</h3>
          <ul className="space-y-2">
            {noteBullets.map((note, index) => <li key={index} className="flex items-start gap-2">
              <span aria-hidden="true" className="pt-2 text-sky-700">•</span>
              <input aria-label={`Implementation Note ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Add a note" maxLength={6000} value={note} onChange={(e) => change({ notes: noteBullets.map((item, i) => i === index ? e.target.value : item).join("\n") })} />
              <button type="button" title="Remove Note" aria-label={`Remove Note ${index + 1}`} disabled={noteBullets.length === 1 && !note} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30" onClick={() => change({ notes: noteBullets.filter((_, i) => i !== index).join("\n") })}><Trash2 size={16} /></button>
            </li>)}
          </ul>
          <button type="button" className={button} onClick={() => change({ notes: [...noteBullets, ""].join("\n") })}><Plus size={15} /> Add Note</button>
        </div>
        <div className="rounded-lg bg-sky-50 p-4"><h3 className="text-sm font-bold text-sky-900">IXL Practice</h3><ul className="mt-3 list-disc space-y-3 pl-5 marker:text-sky-600">{win.skills.map((skill, index) => <li key={index}><div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"><label className="text-xs font-semibold">Skill {index + 1} Name<input className={field} maxLength={240} value={skill.name} onChange={(e) => change({ skills: win.skills.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} /></label><label className="text-xs font-semibold">Code<input className={`${field} uppercase`} maxLength={3} value={skill.code} onChange={(e) => change({ skills: win.skills.map((item, i) => i === index ? { ...item, code: e.target.value.toUpperCase() } : item) })} /></label></div></li>)}</ul></div>
      </fieldset> : <>
        {safeMaterialsUrl(win.materialsUrl) && <a href={safeMaterialsUrl(win.materialsUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-sky-800">Lesson Materials <ExternalLink size={15} /></a>}
        {visibleNotes.length > 0 && <ul className="list-disc space-y-3 pl-5 text-base leading-7 text-slate-700 marker:text-sky-600">{visibleNotes.map((note, index) => <li key={index} className="break-words">{note}</li>)}</ul>}
        <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-4"><h3 className="text-sm font-bold text-sky-900">IXL Practice</h3>{win.skills.some((skill) => skill.name) ? <ul className="mt-2 list-disc space-y-2 pl-5 marker:text-sky-600">{win.skills.filter((skill) => skill.name).map((skill, i) => <li key={i} className="text-base leading-7 text-slate-700"><div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words">{skill.name}</span><span className="shrink-0 rounded bg-white px-2 py-1 font-mono text-sm font-bold text-sky-800">{skill.code}</span></div></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Add This Week’s Two Skills</p>}</div>
      </>}
      {choosing ? <fieldset disabled={busy} className="space-y-3"><legend className="text-sm font-bold">{reviewing ? "Confirm standards practiced" : "Planned standards"}</legend>
        <div className="flex flex-wrap gap-1">{win.standards.map((code) => <button key={code} onClick={() => change({ standards: win.standards.filter((item) => item !== code) })} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800" aria-label={`Remove ${code}`}>{code} ×</button>)}</div>
        <input aria-label="Search WIN standards" placeholder="Search standards" className={field} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{standards.filter((item) => `${item.code} ${item.text}`.toLowerCase().includes(query.toLowerCase())).map((item) => <label key={item.code} className="flex items-start gap-2 text-sm leading-5"><input className="mt-1" type="checkbox" checked={win.standards.includes(item.code)} onChange={(e) => change({ standards: e.target.checked ? [...win.standards, item.code] : win.standards.filter((code) => code !== item.code) })} /><span><strong>{item.code}</strong> {item.text}</span></label>)}</div>
      </fieldset> : <div><h3 className="text-sm font-bold">{win.status === "complete" ? "Standards practiced" : "Planned standards"}</h3><div className="mt-2 flex flex-wrap gap-2">{win.standards.map((code) => <span key={code} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">{code}</span>)}{!win.standards.length && <span className="text-sm text-slate-500">No standards selected yet.</span>}</div></div>}
      {(reviewing || (editing && win.status === "complete")) && <label className="block text-sm font-bold">Weekly reflection (required)<textarea rows={4} maxLength={6000} className={field} value={win.reflection} onChange={(e) => change({ reflection: e.target.value })} /></label>}
      {!choosing && win.reflection && <div><h3 className="text-sm font-bold">Weekly reflection</h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-slate-700">{win.reflection}</p></div>}
      {(reviewing || (editing && win.status === "complete")) && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm these standards were practiced during this WIN week.</span></label>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        {choosing ? <><button disabled={busy} className={button} onClick={() => { setDraft(null); setEditing(false); setReviewing(false); setError(""); }}>Cancel</button><button disabled={busy || ((reviewing || win.status === "complete") && !confirmed)} className={`${button} bg-violet-700 !text-white`} onClick={() => save(reviewing || win.status === "complete")}><Save size={15} />{busy ? "Saving…" : reviewing ? "Complete WIN Week" : "Save WIN"}</button></> : saved && win.status !== "complete" && <button className={button} onClick={() => { setReviewing(true); setConfirmed(false); }}><CheckCircle2 size={16} /> Complete WIN Week</button>}
      </div>
    </div>}
  </section>;
}
