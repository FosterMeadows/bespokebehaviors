import React, { useContext, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  GripVertical,
  Link as LinkIcon,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  SkipForward,
  Trash2,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { AuthContext } from "../AuthContext.jsx";
import ela8 from "../data/standards/ela8.json";
import {
  ACTIVITY_MODE_OPTIONS,
  activateSequence,
  completeSequence,
  createListItem,
  createStep,
  createSummativeCheck,
  listenSequence,
  saveSequenceDraft,
  setStepStatus,
} from "../services/sequences.js";
import { COVERAGE_LEVEL_OPTIONS } from "../utils/sequenceStandards.js";

const STANDARDS = ela8.filter((standard) => standard.code !== "None Apply");
const EMPTY_FORM = {
  title: "",
  description: "",
  outcome: "",
  status: "draft",
  activeStepId: "",
  resources: [],
  steps: [],
  summativeChecks: [],
  possibleStandards: [],
  standardCoverage: [],
  sequenceReflection: "",
};

const STATUS_TONE = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-violet-100 text-violet-800",
  complete: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-100 text-slate-500",
  upcoming: "bg-slate-100 text-slate-600",
  skipped: "bg-amber-100 text-amber-800",
};

function validLink(value) {
  return !value || /^https?:\/\//i.test(value.trim());
}

function moveItem(items, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function StandardsChecklist({ selectedCodes, onToggle, search, onSearch }) {
  const query = search.trim().toLowerCase();
  const visible = STANDARDS.filter((standard) => !query || standard.code.toLowerCase().includes(query) || standard.text.toLowerCase().includes(query));
  return (
    <div>
      <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search standards" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
      <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
        {visible.map((standard) => (
          <label key={standard.code} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-violet-50">
            <input type="checkbox" checked={selectedCodes.includes(standard.code)} onChange={() => onToggle(standard.code)} className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-500" />
            <span><span className="block text-xs font-bold text-slate-900">{standard.code}</span><span className="mt-0.5 block text-xs leading-5 text-slate-600">{standard.text}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ListEditor({ items, onChange, label, description, addLabel, allowLinks = false, addAtBottom = false }) {
  function update(itemId, changes) {
    onChange(items.map((item) => item.id === itemId ? { ...item, ...changes } : item));
  }
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div><h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-700">{label}</h4>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>
        {!addAtBottom && <button type="button" onClick={() => onChange([...items, createListItem()])} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50"><Plus className="h-3.5 w-3.5" /> {addLabel}</button>}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, itemIndex) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
              <input value={item.text} onChange={(event) => update(item.id, { text: event.target.value })} placeholder={`${label} item ${itemIndex + 1}`} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
              <button type="button" onClick={() => onChange(moveItem(items, itemIndex, -1))} disabled={itemIndex === 0} aria-label={`Move ${label} item ${itemIndex + 1} up`} className="rounded p-1.5 text-slate-400 hover:bg-white disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onChange(moveItem(items, itemIndex, 1))} disabled={itemIndex === items.length - 1} aria-label={`Move ${label} item ${itemIndex + 1} down`} className="rounded p-1.5 text-slate-400 hover:bg-white disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))} aria-label={`Remove ${label} item ${itemIndex + 1}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {allowLinks && <div className="mt-2 flex items-center gap-2 pl-3.5"><LinkIcon className="h-3.5 w-3.5 text-slate-400" /><input type="url" value={item.url || ""} onChange={(event) => update(item.id, { url: event.target.value })} placeholder="Optional link" className="h-8 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></div>}
          </div>
        ))}
        {!items.length && <div className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">Nothing added.</div>}
      </div>
      {addAtBottom && <div className="mt-2 flex justify-end"><button type="button" onClick={() => onChange([...items, createListItem()])} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50"><Plus className="h-3.5 w-3.5" /> {addLabel}</button></div>}
    </section>
  );
}

function SummativeCheckCard({ check, editing, onChange, onRemove }) {
  return (
    <article className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-amber-700" />
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Summative Check</span>
        </div>
        {editing && <button type="button" onClick={onRemove} aria-label="Delete summative check" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>}
      </header>
      {editing ? (
        <div className="grid gap-4 p-4">
          <label className="block"><span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">Title</span><input value={check.title} onChange={(event) => onChange({ ...check, title: event.target.value })} placeholder="Name the summative assignment" className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">Description</span><textarea rows={3} value={check.description} onChange={(event) => onChange({ ...check, description: event.target.value })} placeholder="What will students complete or demonstrate?" className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>
        </div>
      ) : (
        <div className="p-4">
          <h3 className="text-lg font-bold tracking-tight text-slate-950">{check.title || "Untitled summative check"}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{check.description || "No description added yet."}</p>
        </div>
      )}
    </article>
  );
}

function StepCard({ step, index, count, editing, sequenceStatus, onChange, onMove, onDuplicate, onRemove, onState, onEdit }) {
  const [collapsed, setCollapsed] = useState(false);
  const complete = step.status === "complete";
  const skipped = step.status === "skipped";
  const active = step.status === "active";
  const cardTone = active
    ? "border-l-4 border-violet-500 bg-violet-50/20"
    : complete
      ? "border-emerald-200 opacity-80"
      : skipped
        ? "border-amber-200 opacity-70"
        : "border-slate-200";

  if (editing) {
    return (
      <article draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${cardTone}`}>
        <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-slate-400" aria-hidden="true" />
          <label className="min-w-0 flex-1">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-slate-500">Step {index + 1} title</span>
            <input value={step.title} onChange={(event) => onChange({ ...step, title: event.target.value })} placeholder="Name this instructional move" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-bold outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </label>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={`${collapsed ? "Expand" : "Collapse"} step ${index + 1}`} className="rounded p-2 text-slate-500 hover:bg-white">{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`} className="rounded p-2 text-slate-500 hover:bg-white disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move step ${index + 1} down`} className="rounded p-2 text-slate-500 hover:bg-white disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
            <button type="button" onClick={onDuplicate} aria-label={`Duplicate step ${index + 1}`} className="rounded p-2 text-slate-500 hover:bg-violet-50 hover:text-violet-700"><Copy className="h-4 w-4" /></button>
            <button type="button" onClick={onRemove} disabled={count === 1} aria-label={`Delete step ${index + 1}`} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-25"><Trash2 className="h-4 w-4" /></button>
          </div>
        </header>
        {!collapsed && (
          <div className="space-y-5 p-5">
            <label className="block"><span className="text-xs font-bold uppercase tracking-[0.1em] text-violet-700">Purpose</span><textarea rows={3} value={step.purpose} onChange={(event) => onChange({ ...step, purpose: event.target.value })} placeholder="Why are students doing this step?" className="mt-2 w-full resize-y rounded-lg border border-violet-200 bg-violet-50/30 px-3 py-2 text-sm leading-6 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></label>
            <ListEditor items={step.studentExperience} onChange={(items) => onChange({ ...step, studentExperience: items })} label="Student experience" description="The short, ordered list of what students will actually do." addLabel="Add Experience" allowLinks addAtBottom />
            <details className="rounded-lg border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700"><MoreHorizontal className="h-4 w-4" /> Resources &amp; Prep <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs">{step.resourcesPrep.length}</span></summary>
              <div className="border-t border-slate-200 p-4"><ListEditor items={step.resourcesPrep} onChange={(items) => onChange({ ...step, resourcesPrep: items })} label="Resource or prep" addLabel="Add item" allowLinks /></div>
            </details>
            <details className="rounded-lg border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700"><Pencil className="h-4 w-4" /> Teacher Notes</summary>
              <div className="border-t border-slate-200 p-4"><textarea rows={4} value={step.teacherNotes} onChange={(event) => onChange({ ...step, teacherNotes: event.target.value })} placeholder="Practical reminders, pacing notes, or class-specific adjustments" className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></div>
            </details>
            <fieldset><legend className="text-xs font-bold uppercase tracking-[0.1em] text-slate-700">Activity modes <span className="font-normal normal-case tracking-normal text-slate-500">(optional)</span></legend><div className="mt-2 flex flex-wrap gap-2">{ACTIVITY_MODE_OPTIONS.map((tag) => <label key={tag} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${step.tags.includes(tag) ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}><input type="checkbox" checked={step.tags.includes(tag)} onChange={() => onChange({ ...step, tags: step.tags.includes(tag) ? step.tags.filter((item) => item !== tag) : [...step.tags, tag] })} className="sr-only" />{tag}</label>)}</div></fieldset>
          </div>
        )}
      </article>
    );
  }

  return (
    <article className={`overflow-hidden rounded-xl border bg-white shadow-sm ${cardTone}`}>
      <header className={`flex items-center justify-between gap-4 px-5 py-4 ${collapsed ? "" : "border-b border-slate-200"} ${active ? "bg-violet-50/70" : "bg-slate-50"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-slate-500">Step {index + 1}</span>
            <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${STATUS_TONE[step.status] || STATUS_TONE.upcoming}`}>{active ? "Active step" : step.status}</span>
          </div>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{step.title || `Step ${index + 1}`}</h3>
        </div>
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-100">{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />} {collapsed ? "Expand" : "Collapse"}</button>
      </header>
      {!collapsed && (
        <>
          <div className="space-y-5 p-5">
            <section><h4 className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-violet-700">Purpose</h4><p className="mt-2 text-sm leading-6 text-slate-700">{step.purpose || "No purpose added yet."}</p></section>
            <section><h4 className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-sky-800">Student experience</h4>{step.studentExperience.some((item) => item.text) ? <ul className="mt-2 space-y-1.5">{step.studentExperience.filter((item) => item.text).map((item) => <li key={item.id} className="flex gap-2 text-sm leading-6 text-slate-700"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" /><span>{item.text}{item.url && validLink(item.url) && <a href={item.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-sky-800 hover:underline">Open <ExternalLink className="h-3.5 w-3.5" /></a>}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No student experience added yet.</p>}</section>
            {step.tags.length > 0 && <div className="flex flex-wrap gap-2">{step.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{tag}</span>)}</div>}
            {step.resourcesPrep.length > 0 && <details className="rounded-lg border border-slate-200"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700">Resources &amp; Prep <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{step.resourcesPrep.length}</span></summary><ul className="space-y-2 border-t border-slate-200 p-4">{step.resourcesPrep.map((item) => <li key={item.id} className="flex items-start gap-2 text-sm text-slate-700"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-2.5 w-2.5" /></span><span>{item.text}{item.url && validLink(item.url) && <a href={item.url} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-violet-700 hover:underline">Open link</a>}</span></li>)}</ul></details>}
            {step.teacherNotes && <details className="rounded-lg border border-slate-200"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700">Teacher Notes</summary><p className="whitespace-pre-wrap border-t border-slate-200 p-4 text-sm leading-6 text-slate-700">{step.teacherNotes}</p></details>}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
            <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /> Edit Step</button>
            {sequenceStatus === "active" && <div className="flex flex-wrap gap-2">{active ? <><button type="button" onClick={() => onState("complete")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800"><Check className="h-3.5 w-3.5" /> Mark Complete</button><button type="button" onClick={() => onState("skipped")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-50"><SkipForward className="h-3.5 w-3.5" /> Skip</button></> : <button type="button" onClick={() => onState("active")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold text-violet-700 hover:bg-violet-50"><Play className="h-3.5 w-3.5" /> Mark active</button>}{(complete || skipped) && <button type="button" onClick={() => onState("upcoming")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" /> Upcoming</button>}</div>}
          </footer>
        </>
      )}
    </article>
  );
}

export default function LessonSequenceEditor() {
  const { sequenceId = "" } = useParams();
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const loadedId = useRef("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(location.state?.edit === true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCompletion, setShowCompletion] = useState(false);
  const [possibleSearch, setPossibleSearch] = useState("");
  const [coverageSearch, setCoverageSearch] = useState("");
  const [draggedIndex, setDraggedIndex] = useState(-1);

  useEffect(() => listenSequence(user?.uid, sequenceId, (sequence) => {
    if (!sequence) {
      setError("Sequence not found.");
      setLoading(false);
      return;
    }
    if (loadedId.current !== sequenceId || !dirty) {
      setForm(sequence);
      loadedId.current = sequenceId;
    }
    setLoading(false);
  }, () => {
    setError("This sequence is unavailable.");
    setLoading(false);
  }), [dirty, sequenceId, user?.uid]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => setSuccess(""), 2600);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (loading || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isEditing, loading, location.hash]);

  function change(updater) {
    setForm((current) => typeof updater === "function" ? updater(current) : updater);
    setDirty(true);
    setSuccess("");
  }

  function validateLinks() {
    for (const step of form.steps) {
      for (const item of [...step.studentExperience, ...step.resourcesPrep]) if (!validLink(item.url)) return "Step links must begin with http:// or https://.";
    }
    return "";
  }

  function activationError() {
    if (!form.title.trim()) return "Give the sequence a title before activating it.";
    if (!form.outcome.trim()) return "Add the expected result before activating the sequence.";
    const incomplete = form.steps.findIndex((step) => !step.title.trim() || !step.purpose.trim() || !step.studentExperience.some((item) => item.text.trim()));
    return incomplete >= 0 ? `Step ${incomplete + 1} needs a title, purpose, and student experience before activation.` : "";
  }

  async function handleSave() {
    const linkError = validateLinks();
    if (linkError) {
      setError(linkError);
      return false;
    }
    setSaving(true);
    setError("");
    try {
      await saveSequenceDraft(user.uid, sequenceId, form);
      setDirty(false);
      setSuccess("Sequence saved.");
      return true;
    } catch (saveError) {
      setError(saveError?.message || "Could not save this sequence.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function switchToView() {
    if (dirty && !(await handleSave())) return;
    setIsEditing(false);
  }

  async function handleManualSave() {
    if (await handleSave()) setIsEditing(false);
  }

  async function runAction(action, message) {
    setSaving(true);
    setError("");
    try {
      await action();
      setDirty(false);
      if (message) setSuccess(message);
      return true;
    } catch (actionError) {
      setError(actionError?.message || "Could not update this sequence.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(stepId = "") {
    const problem = activationError();
    if (problem) {
      setError(problem);
      return;
    }
    const activated = await runAction(() => activateSequence(user.uid, sequenceId, form, stepId), stepId ? "Active step updated." : "Sequence activated.");
    if (activated) setIsEditing(false);
  }

  async function handleStepState(step, status) {
    if (status === "active" && (!step.title.trim() || !step.purpose.trim() || !step.studentExperience.some((item) => item.text.trim()))) {
      setError("This step needs a title, purpose, and student experience before it can become Active.");
      return;
    }
    if (dirty && !(await handleSave())) return;
    await runAction(() => setStepStatus(user.uid, sequenceId, form, step.id, status), status === "active" ? "Active step updated." : "Step status updated.");
  }

  function togglePossible(code) {
    change((current) => ({ ...current, possibleStandards: current.possibleStandards.includes(code) ? current.possibleStandards.filter((item) => item !== code) : [...current.possibleStandards, code] }));
  }

  function toggleCoverage(code) {
    change((current) => ({
      ...current,
      standardCoverage: current.standardCoverage.some((item) => item.standardCode === code)
        ? current.standardCoverage.filter((item) => item.standardCode !== code)
        : [...current.standardCoverage, { standardCode: code, coverageLevel: "introduced", needsRevisit: false, note: "" }],
    }));
  }

  function updateCoverage(code, changes) {
    change((current) => ({ ...current, standardCoverage: current.standardCoverage.map((item) => item.standardCode === code ? { ...item, ...changes } : item) }));
  }

  function openCompletion() {
    if (!form.standardCoverage.length && form.possibleStandards.length) {
      change((current) => ({ ...current, standardCoverage: current.possibleStandards.map((standardCode) => ({ standardCode, coverageLevel: "introduced", needsRevisit: false, note: "" })) }));
    }
    setShowCompletion(true);
  }

  async function handleComplete() {
    const completed = await runAction(() => completeSequence(user.uid, sequenceId, form));
    if (completed) navigate("/command-center/standards");
  }

  function dropStep(targetIndex) {
    if (draggedIndex < 0 || draggedIndex === targetIndex) return;
    const next = [...form.steps];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    change({ ...form, steps: next });
    setDraggedIndex(-1);
  }

  if (loading) return <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading sequence…</div>;

  const selectedCoverageCodes = form.standardCoverage.map((item) => item.standardCode);
  const viewWidth = !isEditing ? "mx-auto w-full lg:w-3/4" : "w-full";
  const lastStepId = form.steps.at(-1)?.id || "";
  const hasTrailingSummativeCheck = form.summativeChecks.some((check) => check.afterStepId === lastStepId);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 pt-1">
      <header className="sticky top-[4.5rem] z-30 -mx-2 flex flex-col gap-3 border-b border-slate-200 bg-[#f8f8f6]/95 px-2 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Link to="/command-center/sequences" className="inline-flex h-10 items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-violet-800"><ArrowLeft className="h-4 w-4" /> Sequences</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/command-center/planner" className="inline-flex h-10 items-center rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700">Planner</Link>
          <Link to="/command-center/sequences/active" className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700 shadow-sm hover:bg-violet-50"><Play className="h-4 w-4" /> Active View</Link>
          <Link to="/command-center/standards" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><BookOpenCheck className="h-4 w-4" /> Standards Pulse</Link>
          <div className="inline-flex h-10 rounded-lg border border-slate-300 bg-white p-1 shadow-sm" aria-label="Sequence mode">
            <button type="button" onClick={switchToView} className={`inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-bold ${!isEditing ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Eye className="h-4 w-4" /> View</button>
            <button type="button" onClick={() => setIsEditing(true)} className={`inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-bold ${isEditing ? "bg-violet-700 text-white" : "text-slate-600 hover:bg-violet-50"}`}><Pencil className="h-4 w-4" /> Edit</button>
          </div>
          {isEditing && <button type="button" onClick={handleManualSave} disabled={saving || !dirty} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white shadow-sm disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>}
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>}
      {success && <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg" role="status"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {success}</div>}

      <section className={`${viewWidth} overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm`}>
        {isEditing ? (
          <>
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-slate-500">Sequence title</span>
                <div className="flex items-center gap-2">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-slate-500">Status</span>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide ${STATUS_TONE[form.status]}`}>{form.status}</span>
                </div>
              </div>
              <input
                aria-label="Sequence title"
                value={form.title}
                onChange={(event) => change({ ...form, title: event.target.value })}
                className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-xl font-bold tracking-tight text-slate-950 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="flex min-h-44 flex-col rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">Framing for the Sequence</span>
                  <textarea rows={4} value={form.description} onChange={(event) => change({ ...form, description: event.target.value })} placeholder="How should this sequence be framed?" className="mt-2 flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="flex min-h-44 flex-col rounded-lg border border-violet-200 bg-violet-50/40 p-4">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Expected Result</span>
                  <textarea rows={4} value={form.outcome} onChange={(event) => change({ ...form, outcome: event.target.value })} placeholder="What meaningful conclusion, product, performance, discussion, writing task, or demonstration ends this arc?" className="mt-2 flex-1 resize-y rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
              </div>
              <details className="rounded-lg border border-slate-200 bg-white"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700">Possible Standards <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{form.possibleStandards.length}</span></summary><div className="border-t border-slate-200 p-4"><p className="mb-3 text-sm text-slate-600">These remain planning references until the sequence is completed.</p><StandardsChecklist selectedCodes={form.possibleStandards} onToggle={togglePossible} search={possibleSearch} onSearch={setPossibleSearch} /></div></details>
            </div>
          </>
        ) : (
          <>
            <header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="flex flex-wrap items-center gap-2"><span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-slate-500">Sequence</span><span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${STATUS_TONE[form.status]}`}>{form.status}</span></div><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{form.title || "Untitled sequence"}</h1>{form.description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{form.description}</p>}</header>
            <div className="space-y-4 p-5"><section className="rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Expected Result</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{form.outcome || "No expected result added yet."}</p></section></div>
          </>
        )}
      </section>

      <section aria-label="Sequence steps" className={`${viewWidth} space-y-3`}>
        <div className="space-y-4">
          {form.steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div id={`step-${step.id}`} className="scroll-mt-36" onDragOver={(event) => event.preventDefault()} onDrop={() => dropStep(index)} onDragStart={() => setDraggedIndex(index)}>
                <StepCard
                  step={step}
                  index={index}
                  count={form.steps.length}
                  editing={isEditing}
                  sequenceStatus={form.status}
                  onChange={(nextStep) => change({ ...form, steps: form.steps.map((item) => item.id === step.id ? nextStep : item) })}
                  onMove={(direction) => change({ ...form, steps: moveItem(form.steps, index, direction) })}
                  onDuplicate={() => change({ ...form, steps: [...form.steps.slice(0, index + 1), createStep({ title: `${step.title || `Step ${index + 1}`} copy`, purpose: step.purpose, result: step.result, teacherNotes: step.teacherNotes, tags: [...step.tags], status: "upcoming", studentExperience: step.studentExperience.map((item) => createListItem({ text: item.text, url: item.url })), resourcesPrep: step.resourcesPrep.map((item) => createListItem({ text: item.text, url: item.url })) }), ...form.steps.slice(index + 1)] })}
                  onRemove={() => {
                    const replacementStepId = form.steps[index - 1]?.id || form.steps[index + 1]?.id || "";
                    change({
                      ...form,
                      steps: form.steps.filter((item) => item.id !== step.id),
                      summativeChecks: form.summativeChecks.map((check) => check.afterStepId === step.id ? { ...check, afterStepId: replacementStepId } : check),
                    });
                  }}
                  onState={(state) => handleStepState(step, state)}
                  onEdit={() => setIsEditing(true)}
                />
              </div>
              {form.summativeChecks.filter((check) => check.afterStepId === step.id).map((check) => (
                <div key={check.id} className="mx-auto border-x-2 border-dashed border-amber-300 px-4 lg:w-3/5">
                  <SummativeCheckCard
                    check={check}
                    editing={isEditing}
                    onChange={(nextCheck) => change({ ...form, summativeChecks: form.summativeChecks.map((item) => item.id === check.id ? nextCheck : item) })}
                    onRemove={() => change({ ...form, summativeChecks: form.summativeChecks.filter((item) => item.id !== check.id) })}
                  />
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        {isEditing && <div className={`flex flex-wrap justify-end gap-2 pt-1 ${hasTrailingSummativeCheck ? "mx-auto px-4 lg:w-3/5" : ""}`}><button type="button" onClick={() => change({ ...form, steps: [...form.steps, createStep()] })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold text-violet-700 hover:bg-violet-50"><Plus className="h-4 w-4" /> Add Step</button><button type="button" onClick={() => change({ ...form, summativeChecks: [...form.summativeChecks, createSummativeCheck({ afterStepId: form.steps.at(-1)?.id || "" })] })} disabled={!form.steps.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-40"><Plus className="h-4 w-4" /> Add Summative Check</button></div>}
      </section>

      {!isEditing && form.status === "active" && !showCompletion && (
        <div className={`${viewWidth} flex justify-end pt-1`}>
          <button type="button" onClick={openCompletion} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"><CheckCircle2 className="h-4 w-4" /> Complete Sequence</button>
        </div>
      )}

      {!isEditing && form.status === "draft" && (
        <div className={`${viewWidth} flex justify-end pt-1`}>
          <button type="button" onClick={() => handleActivate()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"><Play className="h-4 w-4" /> Activate sequence</button>
        </div>
      )}

      {showCompletion && form.status === "active" && (
        <section className="space-y-4 rounded-xl border border-emerald-300 bg-white p-5 shadow-md">
          <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">Completion review</p><h2 className="mt-1 text-xl font-bold text-slate-950">What did this sequence actually cover?</h2><p className="mt-1 text-sm text-slate-600">Select standards, describe the coverage, and preserve the reflection.</p></div>
          <div className="grid gap-5 lg:grid-cols-[minmax(17rem,0.7fr)_minmax(0,1.3fr)]">
            <StandardsChecklist selectedCodes={selectedCoverageCodes} onToggle={toggleCoverage} search={coverageSearch} onSearch={setCoverageSearch} />
            <div className="space-y-3">{form.standardCoverage.length ? form.standardCoverage.map((coverage) => <div key={coverage.standardCode} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="font-bold text-violet-700">{coverage.standardCode}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-bold">Coverage level</span><select value={coverage.coverageLevel} onChange={(event) => updateCoverage(coverage.standardCode, { coverageLevel: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{COVERAGE_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="flex items-end"><span className="flex h-10 w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-semibold"><input type="checkbox" checked={coverage.needsRevisit} onChange={(event) => updateCoverage(coverage.standardCode, { needsRevisit: event.target.checked })} /> Needs revisit</span></label></div><textarea rows={2} value={coverage.note} onChange={(event) => updateCoverage(coverage.standardCode, { note: event.target.value })} placeholder="Optional note" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>) : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">Select at least one standard.</div>}</div>
          </div>
          <label className="block"><span className="text-sm font-bold">Sequence reflection <span className="font-normal text-slate-500">(optional)</span></span><textarea rows={4} value={form.sequenceReflection} onChange={(event) => change({ ...form, sequenceReflection: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={() => setShowCompletion(false)} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold">Keep active</button><button type="button" onClick={handleComplete} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white"><ListChecks className="h-4 w-4" /> Complete and Update Standards Pulse</button></div>
        </section>
      )}
    </div>
  );
}
