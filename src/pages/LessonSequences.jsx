import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  GripVertical,
  Layers3,
  Play,
  Plus,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { AuthContext } from "../AuthContext.jsx";
import { createSequence, listenSequences, reorderOnDeckSequences } from "../services/sequences.js";

function SequenceRow({ sequence, quiet = false, dragHandle = null, setNodeRef = null, style = undefined, dragging = false }) {
  const title = sequence.title || "Untitled sequence";
  const activeIndex = sequence.steps.findIndex((step) => step.id === sequence.activeStepId || step.status === "active");
  return (
    <article ref={setNodeRef} style={style} className={`relative flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md sm:flex-row sm:items-center ${quiet ? "opacity-80 hover:opacity-100" : ""} ${dragging ? "z-10 border-violet-300 opacity-80 shadow-lg" : ""}`}>
      {dragHandle}
      <Link to={`/command-center/sequences/${sequence.id}`} className="group min-w-0 flex-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-950 transition group-hover:text-violet-800">{title}</h3>
          {(sequence.description || sequence.outcome) && <p className="mt-1 line-clamp-1 text-sm text-slate-600">{sequence.description || sequence.outcome}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{sequence.steps.length} {sequence.steps.length === 1 ? "step" : "steps"}</span>
            {activeIndex >= 0 && <span>Step {activeIndex + 1} active</span>}
            {sequence.standardCoverage.length > 0 && <span>{sequence.standardCoverage.length} standards reflected</span>}
          </div>
        </div>
      </Link>
      <div className="flex shrink-0 items-center justify-end self-end sm:self-auto">
        <Link to={`/command-center/sequences/${sequence.id}`} aria-label={`Open ${title}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-violet-50 hover:text-violet-700"><ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
    </article>
  );
}

function SortableSequenceRow({ sequence, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sequence.id, disabled });
  const title = sequence.title || "Untitled sequence";
  const style = { transform: CSS.Transform.toString(transform), transition };
  const dragHandle = (
    <button type="button" {...attributes} {...listeners} aria-label={`Move ${title}`} className="flex h-9 w-7 shrink-0 touch-none cursor-grab items-center justify-center self-start rounded-md text-slate-400 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 active:cursor-grabbing sm:self-center">
      <GripVertical className="h-5 w-5" aria-hidden="true" />
    </button>
  );
  return <SequenceRow sequence={sequence} dragHandle={dragHandle} setNodeRef={setNodeRef} style={style} dragging={isDragging} />;
}

function ActiveSequencePanel({ sequence }) {
  const title = sequence.title || "Untitled sequence";
  const activeIndex = sequence.steps.findIndex((step) => step.id === sequence.activeStepId || step.status === "active");
  const currentStep = activeIndex >= 0 ? sequence.steps[activeIndex] : null;
  const completedSteps = sequence.steps.filter((step) => step.status === "complete").length;
  const progressValue = sequence.steps.length ? Math.round(((activeIndex >= 0 ? activeIndex + 1 : completedSteps) / sequence.steps.length) * 100) : 0;

  return (
    <article className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/70 shadow-sm">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-violet-700">In progress</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{title}</h3>
          {(sequence.description || sequence.outcome) && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{sequence.description || sequence.outcome}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
            <span>{sequence.steps.length} {sequence.steps.length === 1 ? "step" : "steps"}</span>
            {sequence.standardCoverage.length > 0 && <span>{sequence.standardCoverage.length} standards reflected</span>}
          </div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-white/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 text-xs font-bold">
            <span className="text-slate-500">Current Position</span>
            <span className="text-violet-700">{activeIndex >= 0 ? `Step ${activeIndex + 1} of ${sequence.steps.length}` : `${completedSteps} of ${sequence.steps.length} complete`}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-label="Sequence progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressValue}>
            <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progressValue}%` }} />
          </div>
          {currentStep?.title && <p className="mt-3 line-clamp-1 text-sm font-bold text-slate-800">{currentStep.title}</p>}
          <div className="mt-4">
            <Link to={`/command-center/sequences/${sequence.id}`} state={{ edit: false }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white shadow-sm hover:bg-violet-800">Open Sequence <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function SequenceSection({ id, title, icon: Icon, sequences, quiet = false, featured = false }) {
  if (!sequences.length) return null;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="space-y-3">
      <div>
        <h2 id={`${id}-heading`} className="flex items-center gap-2 text-sm font-bold text-slate-950">{React.createElement(Icon, { className: "h-4 w-4 text-violet-600", "aria-hidden": true })} {title}</h2>
      </div>
      <div className="space-y-2">{sequences.map((sequence) => featured ? <ActiveSequencePanel key={sequence.id} sequence={sequence} /> : <SequenceRow key={sequence.id} sequence={sequence} quiet={quiet} />)}</div>
    </section>
  );
}

function OnDeckSection({ sequences, onDragEnd, saving }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  if (!sequences.length) return null;
  return (
    <section id="on-deck-sequences" aria-labelledby="on-deck-sequences-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="on-deck-sequences-heading" className="flex items-center gap-2 text-sm font-bold text-slate-950"><Layers3 className="h-4 w-4 text-violet-600" aria-hidden="true" /> On Deck</h2>
        </div>
        {saving && <span className="text-xs font-semibold text-slate-500" role="status">Saving order…</span>}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sequences.map((sequence) => sequence.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">{sequences.map((sequence) => <SortableSequenceRow key={sequence.id} sequence={sequence} disabled={saving} />)}</div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

export default function LessonSequences() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => listenSequences(
    user?.uid,
    (rows) => {
      setSequences(rows);
      setLoading(false);
      setError("");
    },
    () => {
      setError("Sequences are unavailable.");
      setLoading(false);
    }
  ), [user?.uid]);

  const grouped = useMemo(() => ({
    active: sequences.filter((sequence) => sequence.status === "active"),
    draft: sequences.filter((sequence) => sequence.status === "draft"),
    complete: sequences.filter((sequence) => sequence.status === "complete"),
    archived: sequences.filter((sequence) => sequence.status === "archived"),
  }), [sequences]);

  async function handleCreate() {
    setWorking(true);
    setError("");
    try {
      const sequenceId = await createSequence(user.uid);
      navigate(`/command-center/sequences/${sequenceId}`, { state: { edit: true } });
    } catch (createError) {
      setError(createError?.message || "Could not create a sequence.");
      setWorking(false);
    }
  }

  async function handleDeckDragEnd({ active, over }) {
    if (!over || active.id === over.id || savingOrder) return;
    const oldIndex = grouped.draft.findIndex((sequence) => sequence.id === active.id);
    const newIndex = grouped.draft.findIndex((sequence) => sequence.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previousIds = grouped.draft.map((sequence) => sequence.id);
    const reordered = arrayMove(grouped.draft, oldIndex, newIndex);
    const reorderedIds = reordered.map((sequence) => sequence.id);
    const optimisticOrder = new Map(reorderedIds.map((id, index) => [id, index]));
    setSequences((rows) => rows.map((sequence) => optimisticOrder.has(sequence.id) ? { ...sequence, deckOrder: optimisticOrder.get(sequence.id) } : sequence));
    setSavingOrder(true);
    setError("");
    try {
      await reorderOnDeckSequences(user.uid, reorderedIds);
    } catch (reorderError) {
      const previousOrder = new Map(previousIds.map((id, index) => [id, index]));
      setSequences((rows) => rows.map((sequence) => previousOrder.has(sequence.id) ? { ...sequence, deckOrder: previousOrder.get(sequence.id) } : sequence));
      setError(reorderError?.message || "Could not save the On Deck order.");
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8 pt-1">
      <header className="border-b border-slate-200 pb-5">
        <Link to="/command-center" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-violet-800"><ArrowLeft className="h-4 w-4" /> Command Center</Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-violet-200"><Layers3 className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Instructional arcs</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Sequences</h1>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/command-center/planner" className="inline-flex h-10 items-center rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700">Planner</Link>
            <Link to="/command-center/sequences/active" className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 text-sm font-bold text-violet-700 shadow-sm hover:bg-violet-50"><Play className="h-4 w-4" /> Active View</Link>
            <Link to="/command-center/standards" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><BookOpenCheck className="h-4 w-4" /> Standards Pulse</Link>
            <button type="button" onClick={handleCreate} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"><Plus className="h-4 w-4" /> New sequence</button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Loading sequences…</div>
      ) : (
        <>
          {grouped.active.length ? (
            <SequenceSection id="active-sequence" title="Active Sequence" icon={CircleDot} sequences={grouped.active} featured />
          ) : (
            <section className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-8 text-center">
              <CircleDot className="mx-auto h-7 w-7 text-violet-500" />
              <h2 className="mt-3 font-bold text-slate-950">No active sequence</h2>
              <p className="mt-1 text-sm text-slate-600">Choose an existing sequence or create a new one.</p>
              <div className="mt-4 flex justify-center gap-2">
                {grouped.draft.length > 0 && <a href="#on-deck-sequences" className="inline-flex h-10 items-center rounded-lg border border-violet-300 bg-white px-4 text-sm font-bold text-violet-700 hover:bg-violet-50">Choose sequence</a>}
                <button type="button" onClick={handleCreate} disabled={working} className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Create sequence</button>
              </div>
            </section>
          )}

          <OnDeckSection sequences={grouped.draft} onDragEnd={handleDeckDragEnd} saving={savingOrder} />

          {grouped.complete.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-bold text-slate-800"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Complete <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{grouped.complete.length}</span></summary>
              <div className="space-y-2 border-t border-slate-200 p-4">{grouped.complete.map((sequence) => <SequenceRow key={sequence.id} sequence={sequence} quiet />)}</div>
            </details>
          )}

          {grouped.archived.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-bold text-slate-700"><Archive className="h-5 w-5 text-slate-500" /> Archived <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{grouped.archived.length}</span></summary>
              <div className="space-y-2 border-t border-slate-200 p-4">{grouped.archived.map((sequence) => <SequenceRow key={sequence.id} sequence={sequence} quiet />)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
