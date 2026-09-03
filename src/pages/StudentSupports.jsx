import { useContext, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronRight,
  HeartHandshake,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { AuthContext } from "../AuthContext.jsx";
import {
  createSupportStudent,
  deleteSupportStudent,
  listenSupportStudents,
  newAccommodation,
  newAccommodationNote,
  SUPPORT_NOTE_CONTEXTS,
  updateSupportStudent,
} from "../services/studentSupports.js";
import { removeAccommodationFromList } from "../utils/studentSupportUtils.js";

const CONTEXT_STYLES = {
  Used: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Offered: "bg-sky-50 text-sky-700 ring-sky-200",
  Refused: "bg-rose-50 text-rose-700 ring-rose-200",
  "Not needed": "bg-slate-100 text-slate-600 ring-slate-200",
  "General observation": "bg-amber-50 text-amber-800 ring-amber-200",
};

const PERIOD_STYLES = [
  {
    filterActive: "border-sky-600 bg-sky-50 text-sky-900",
    filterCount: "bg-sky-200/70 text-sky-900",
    filterIdle: "hover:border-sky-300 hover:bg-sky-50/60",
    cardAccent: "border-l-sky-400",
    avatar: "bg-sky-50 text-sky-700",
  },
  {
    filterActive: "border-violet-600 bg-violet-50 text-violet-900",
    filterCount: "bg-violet-200/70 text-violet-900",
    filterIdle: "hover:border-violet-300 hover:bg-violet-50/60",
    cardAccent: "border-l-violet-400",
    avatar: "bg-violet-50 text-violet-700",
  },
  {
    filterActive: "border-emerald-600 bg-emerald-50 text-emerald-900",
    filterCount: "bg-emerald-200/70 text-emerald-900",
    filterIdle: "hover:border-emerald-300 hover:bg-emerald-50/60",
    cardAccent: "border-l-emerald-400",
    avatar: "bg-emerald-50 text-emerald-700",
  },
  {
    filterActive: "border-amber-600 bg-amber-50 text-amber-900",
    filterCount: "bg-amber-200/70 text-amber-900",
    filterIdle: "hover:border-amber-300 hover:bg-amber-50/60",
    cardAccent: "border-l-amber-400",
    avatar: "bg-amber-50 text-amber-700",
  },
  {
    filterActive: "border-rose-600 bg-rose-50 text-rose-900",
    filterCount: "bg-rose-200/70 text-rose-900",
    filterIdle: "hover:border-rose-300 hover:bg-rose-50/60",
    cardAccent: "border-l-rose-400",
    avatar: "bg-rose-50 text-rose-700",
  },
];

function todayValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function ContextPill({ context }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide ring-1 ${CONTEXT_STYLES[context] || CONTEXT_STYLES["General observation"]}`}>{context}</span>;
}

function PeriodOverview({ periods, selected, onSelect }) {
  const totalStudents = periods.reduce((total, period) => total + period.studentCount, 0);

  return (
    <section aria-labelledby="period-overview-heading">
      <h2 id="period-overview-heading" className="text-sm font-bold text-slate-950">Class Periods</h2>
      <p className="mt-1 text-sm text-slate-500">Filter the student list by class period.</p>
      {periods.length ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter students by class period">
          <button type="button" onClick={() => onSelect("all")} aria-pressed={selected === "all"} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${selected === "all" ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>
            All students
            <span className={`rounded-full px-2 py-0.5 text-xs ${selected === "all" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{totalStudents}</span>
          </button>
          {periods.map((period, index) => {
            const style = PERIOD_STYLES[index % PERIOD_STYLES.length];
            return <button key={period.name} type="button" onClick={() => onSelect(period.name)} aria-pressed={selected === period.name} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-bold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${selected === period.name ? style.filterActive : `border-slate-200 bg-white text-slate-700 ${style.filterIdle}`}`}>
              {period.name}
              <span className={`rounded-full px-2 py-0.5 text-xs ${selected === period.name ? style.filterCount : "bg-slate-100 text-slate-500"}`}>{period.studentCount}</span>
            </button>;
          })}
        </div>
      ) : null}
    </section>
  );
}

export default function StudentSupports() {
  const { user } = useContext(AuthContext);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentDraft, setStudentDraft] = useState({ name: "", classPeriod: "" });
  const [editingStudentId, setEditingStudentId] = useState("");
  const [editStudentDraft, setEditStudentDraft] = useState({ name: "", classPeriod: "" });
  const [addingAccommodationFor, setAddingAccommodationFor] = useState("");
  const [accommodationDraft, setAccommodationDraft] = useState("");
  const [editingAccommodation, setEditingAccommodation] = useState(null);
  const [deletingAccommodation, setDeletingAccommodation] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteDraft, setNoteDraft] = useState({ date: todayValue(), context: "Used", details: "" });
  const [expandedStudentIds, setExpandedStudentIds] = useState(() => new Set());

  useEffect(() => listenSupportStudents(user?.uid, (rows) => {
    setStudents(rows);
    setLoading(false);
    setError("");
  }, (nextError) => {
    setError(nextError?.message || "Student supports could not be loaded.");
    setLoading(false);
  }), [user?.uid]);

  const periods = useMemo(() => {
    const groups = new Map();
    students.forEach((student) => {
      const name = student.classPeriod || "Unassigned";
      if (!groups.has(name)) groups.set(name, { name, studentCount: 0, accommodations: new Set() });
      const group = groups.get(name);
      group.studentCount += 1;
      student.accommodations.forEach((item) => group.accommodations.add(item.text));
    });
    return [...groups.values()].map((group) => ({ ...group, accommodations: [...group.accommodations].sort() })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [students]);

  const visibleStudents = useMemo(() => students.filter((student) => periodFilter === "all" || (student.classPeriod || "Unassigned") === periodFilter), [students, periodFilter]);

  function toggleStudent(studentId) {
    setExpandedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function expandStudent(studentId) {
    setExpandedStudentIds((current) => new Set(current).add(studentId));
  }

  async function runSaving(key, action) {
    setSaving(key);
    setError("");
    try {
      await action();
    } catch (nextError) {
      setError(nextError?.message || "That change could not be saved.");
    } finally {
      setSaving("");
    }
  }

  async function addStudent(event) {
    event.preventDefault();
    await runSaving("new-student", async () => {
      await createSupportStudent(user.uid, studentDraft);
      setStudentDraft({ name: "", classPeriod: "" });
      setShowAddStudent(false);
    });
  }

  function beginStudentEdit(student) {
    expandStudent(student.id);
    setEditingStudentId(student.id);
    setEditStudentDraft({ name: student.name, classPeriod: student.classPeriod });
  }

  async function saveStudent(event, student) {
    event.preventDefault();
    await runSaving(`student-${student.id}`, async () => {
      await updateSupportStudent(user.uid, student.id, editStudentDraft);
      setEditingStudentId("");
    });
  }

  async function addAccommodation(event, student) {
    event.preventDefault();
    if (!accommodationDraft.trim()) return;
    await runSaving(`accommodation-${student.id}`, async () => {
      await updateSupportStudent(user.uid, student.id, { accommodations: [...student.accommodations, newAccommodation(accommodationDraft)] });
      setAddingAccommodationFor("");
      setAccommodationDraft("");
    });
  }

  async function saveAccommodation(event, student, accommodation) {
    event.preventDefault();
    if (!editingAccommodation?.text.trim()) return;
    await runSaving(`edit-accommodation-${accommodation.id}`, async () => {
      await updateSupportStudent(user.uid, student.id, { accommodations: student.accommodations.map((item) => item.id === accommodation.id ? { ...item, text: editingAccommodation.text } : item) });
      setEditingAccommodation(null);
    });
  }

  async function deleteAccommodation() {
    if (!deletingAccommodation) return;
    const student = students.find((item) => item.id === deletingAccommodation.studentId);
    if (!student) {
      setDeletingAccommodation(null);
      return;
    }
    await runSaving(`delete-accommodation-${deletingAccommodation.accommodationId}`, async () => {
      await updateSupportStudent(user.uid, student.id, {
        accommodations: removeAccommodationFromList(student.accommodations, deletingAccommodation.accommodationId),
      });
      if (editingAccommodation?.id === deletingAccommodation.accommodationId) setEditingAccommodation(null);
      setDeletingAccommodation(null);
    });
  }

  async function deleteStudent() {
    if (!deletingStudent) return;
    await runSaving(`delete-student-${deletingStudent.id}`, async () => {
      await deleteSupportStudent(user.uid, deletingStudent.id);
      setExpandedStudentIds((current) => {
        const next = new Set(current);
        next.delete(deletingStudent.id);
        return next;
      });
      if (editingStudentId === deletingStudent.id) setEditingStudentId("");
      setDeletingStudent(null);
    });
  }

  async function saveNote(event) {
    event.preventDefault();
    const student = students.find((item) => item.id === noteTarget?.studentId);
    if (!student) return;
    await runSaving(`note-${noteTarget.accommodationId}`, async () => {
      const accommodations = student.accommodations.map((item) => item.id === noteTarget.accommodationId ? { ...item, notes: [newAccommodationNote(noteDraft), ...item.notes] } : item);
      await updateSupportStudent(user.uid, student.id, { accommodations });
      setNoteTarget(null);
      setNoteDraft({ date: todayValue(), context: "Used", details: "" });
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-10 pt-1">
      <header className="border-b border-slate-200 pb-5">
        <Link to="/command-center" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Command Center</Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100"><HeartHandshake className="h-6 w-6" aria-hidden="true" /></span>
            <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Personal workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Student Supports</h1></div>
          </div>
          <button type="button" onClick={() => setShowAddStudent((value) => !value)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><Plus className="h-4 w-4" aria-hidden="true" />Add Student</button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {showAddStudent && (
        <form onSubmit={addStudent} className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">New Student</h2><button type="button" onClick={() => setShowAddStudent(false)} aria-label="Close new student form" className="rounded-md p-1 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
            <label className="text-sm font-semibold text-slate-700">Student name<input autoFocus required value={studentDraft.name} onChange={(event) => setStudentDraft((draft) => ({ ...draft, name: event.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></label>
            <label className="text-sm font-semibold text-slate-700">Class period<input value={studentDraft.classPeriod} onChange={(event) => setStudentDraft((draft) => ({ ...draft, classPeriod: event.target.value }))} placeholder="e.g. Period 2" className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></label>
            <button disabled={saving === "new-student"} className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50">{saving === "new-student" ? "Saving…" : "Create"}</button>
          </div>
        </form>
      )}

      <PeriodOverview periods={periods} selected={periodFilter} onSelect={setPeriodFilter} />

      <section aria-labelledby="students-heading">
        <div><h2 id="students-heading" className="text-sm font-bold text-slate-950">{periodFilter === "all" ? "All Students" : periodFilter}</h2><p className="mt-1 text-sm text-slate-500">{visibleStudents.length} {visibleStudents.length === 1 ? "student" : "students"} · Select a student to manage supports</p></div>

        {loading ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading student supports…</div> : visibleStudents.length ? (
          <div className="mt-3 space-y-3">
            {visibleStudents.map((student, studentIndex) => {
              const periodIndex = Math.max(0, periods.findIndex((period) => period.name === (student.classPeriod || "Unassigned")));
              const periodStyle = PERIOD_STYLES[periodIndex % PERIOD_STYLES.length];
              const noteCount = student.accommodations.reduce((total, accommodation) => total + accommodation.notes.length, 0);
              return <article key={student.id} className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 ${periodStyle.cardAccent} ${studentIndex % 2 ? "bg-slate-50/60" : "bg-white"} shadow-sm transition hover:border-slate-300`}>
                {editingStudentId === student.id ? (
                  <form onSubmit={(event) => saveStudent(event, student)} className="grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Student name<input required value={editStudentDraft.name} onChange={(event) => setEditStudentDraft((draft) => ({ ...draft, name: event.target.value }))} className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-amber-500" /></label>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Class period<input value={editStudentDraft.classPeriod} onChange={(event) => setEditStudentDraft((draft) => ({ ...draft, classPeriod: event.target.value }))} className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-amber-500" /></label>
                    <div className="flex gap-2"><button disabled={saving === `student-${student.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />Save</button><button type="button" onClick={() => setEditingStudentId("")} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-600">Cancel</button></div>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 p-2">
                    <button type="button" onClick={() => toggleStudent(student.id)} aria-expanded={expandedStudentIds.has(student.id)} aria-controls={`student-supports-${student.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${periodStyle.avatar}`}><Users className="h-4.5 w-4.5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-950">{student.name}</span><span className="mt-0.5 block text-xs font-semibold text-slate-500">{student.classPeriod || "Unassigned period"}</span></span>
                      <span className="hidden shrink-0 text-xs font-semibold text-slate-500 sm:inline">{student.accommodations.length} {student.accommodations.length === 1 ? "accommodation" : "accommodations"}{noteCount ? ` · ${noteCount} notes` : ""}</span>
                      {expandedStudentIds.has(student.id) ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                    </button>
                    <details className="relative shrink-0"><summary aria-label={`Actions for ${student.name}`} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"><button type="button" onClick={() => beginStudentEdit(student)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Edit student</button><button type="button" onClick={() => setDeletingStudent({ id: student.id, name: student.name, accommodationCount: student.accommodations.length, noteCount })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete student</button></div></details>
                  </div>
                )}

                {expandedStudentIds.has(student.id) && <div id={`student-supports-${student.id}`} className="border-t border-slate-100 bg-slate-50/40 p-4">
                  <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Accommodations</h4><button type="button" onClick={() => { setAddingAccommodationFor(student.id); setAccommodationDraft(""); }} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900"><Plus className="h-3.5 w-3.5" />Add accommodation</button></div>
                  {addingAccommodationFor === student.id && <form onSubmit={(event) => addAccommodation(event, student)} className="mt-3 flex gap-2"><textarea autoFocus required rows="2" value={accommodationDraft} onChange={(event) => setAccommodationDraft(event.target.value)} placeholder="Type the accommodation exactly as it applies to this student…" className="min-h-16 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /><div className="flex flex-col gap-2"><button disabled={saving === `accommodation-${student.id}`} className="h-8 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white">Add</button><button type="button" onClick={() => setAddingAccommodationFor("")} className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-600">Cancel</button></div></form>}

                  {student.accommodations.length ? <div className="mt-3 divide-y divide-slate-200 overflow-visible rounded-lg border border-slate-200 bg-white">{student.accommodations.map((accommodation) => {
                    const latest = accommodation.notes[0];
                    return <div key={accommodation.id} className="relative p-4">
                      {editingAccommodation?.id === accommodation.id ? <form onSubmit={(event) => saveAccommodation(event, student, accommodation)} className="flex gap-2"><textarea autoFocus required rows="2" value={editingAccommodation.text} onChange={(event) => setEditingAccommodation((draft) => ({ ...draft, text: event.target.value }))} className="min-h-16 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500" /><div className="flex flex-col gap-2"><button className="h-8 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white">Save</button><button type="button" onClick={() => setEditingAccommodation(null)} className="h-8 text-xs font-bold text-slate-500">Cancel</button></div></form> : <p className="pr-10 text-sm font-bold leading-6 text-slate-900">{accommodation.text}</p>}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {latest ? <details className="group"><summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />{accommodation.notes.length} {accommodation.notes.length === 1 ? "note" : "notes"} · Latest {formatDate(latest.date)}</summary><div className="mt-3 space-y-2">{accommodation.notes.map((note) => <div key={note.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200"><div className="flex flex-wrap items-center gap-2"><ContextPill context={note.context} /><span className="text-xs font-semibold text-slate-500">{formatDate(note.date)}</span></div>{note.details && <p className="mt-2 text-xs leading-5 text-slate-600">{note.details}</p>}</div>)}</div></details> : <span className="text-xs font-semibold text-slate-400">No notes yet</span>}
                        <div className="ml-auto flex items-center gap-1.5"><button type="button" onClick={() => { setNoteTarget({ studentId: student.id, accommodationId: accommodation.id, studentName: student.name, accommodationText: accommodation.text }); setNoteDraft({ date: todayValue(), context: "Used", details: "" }); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-bold text-amber-800 hover:bg-amber-50"><BookOpenText className="h-3.5 w-3.5" />Log note</button><details className="relative"><summary aria-label={`Actions for ${accommodation.text}`} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"><button type="button" onClick={() => setEditingAccommodation({ id: accommodation.id, text: accommodation.text })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => setDeletingAccommodation({ studentId: student.id, studentName: student.name, accommodationId: accommodation.id, accommodationText: accommodation.text, noteCount: accommodation.notes.length })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button></div></details></div>
                      </div>
                    </div>;
                  })}</div> : <p className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">No accommodations assigned yet.</p>}
                </div>}
              </article>;
            })}
          </div>
        ) : <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-white p-10 text-center"><HeartHandshake className="mx-auto h-8 w-8 text-amber-300" /><p className="mt-3 font-bold text-slate-800">{students.length ? "No students in this period" : "No student records yet"}</p><p className="mt-1 text-sm text-slate-500">{students.length ? "Choose another period or show all students." : "Add a student to begin tracking accommodations."}</p></div>}
      </section>

      {deletingAccommodation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="delete-accommodation-title" aria-describedby="delete-accommodation-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700"><Trash2 className="h-5 w-5" /></div><h2 id="delete-accommodation-title" className="mt-4 text-lg font-bold text-slate-950">Delete this accommodation?</h2><p id="delete-accommodation-description" className="mt-2 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">{deletingAccommodation.accommodationText}</span> will be removed from {deletingAccommodation.studentName}.{deletingAccommodation.noteCount > 0 ? ` Its ${deletingAccommodation.noteCount} usage ${deletingAccommodation.noteCount === 1 ? "note" : "notes"} will also be permanently deleted.` : ""}</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeletingAccommodation(null)} disabled={saving === `delete-accommodation-${deletingAccommodation.accommodationId}`} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-600 disabled:opacity-50">Keep Accommodation</button><button type="button" onClick={deleteAccommodation} disabled={saving === `delete-accommodation-${deletingAccommodation.accommodationId}`} className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">{saving === `delete-accommodation-${deletingAccommodation.accommodationId}` ? "Deleting…" : "Delete Accommodation"}</button></div></div></div>}

      {deletingStudent && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="delete-student-title" aria-describedby="delete-student-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700"><Trash2 className="h-5 w-5" /></div><h2 id="delete-student-title" className="mt-4 text-lg font-bold text-slate-950">Delete this student?</h2><p id="delete-student-description" className="mt-2 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">{deletingStudent.name}</span> will be permanently removed from Student Supports. This also deletes {deletingStudent.accommodationCount} {deletingStudent.accommodationCount === 1 ? "accommodation" : "accommodations"} and {deletingStudent.noteCount} {deletingStudent.noteCount === 1 ? "note" : "notes"} stored in this workspace.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeletingStudent(null)} disabled={saving === `delete-student-${deletingStudent.id}`} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-600 disabled:opacity-50">Keep Student</button><button type="button" onClick={deleteStudent} disabled={saving === `delete-student-${deletingStudent.id}`} className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">{saving === `delete-student-${deletingStudent.id}` ? "Deleting…" : "Delete Student"}</button></div></div></div>}

      {noteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation"><form onSubmit={saveNote} role="dialog" aria-modal="true" aria-labelledby="note-dialog-title" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">{noteTarget.studentName}</p><h2 id="note-dialog-title" className="mt-1 text-lg font-bold text-slate-950">Record accommodation note</h2><p className="mt-2 text-sm leading-6 text-slate-600">{noteTarget.accommodationText}</p></div><button type="button" onClick={() => setNoteTarget(null)} aria-label="Close note form" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Date<input type="date" required value={noteDraft.date} onChange={(event) => setNoteDraft((draft) => ({ ...draft, date: event.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-amber-500" /></label><label className="text-sm font-semibold text-slate-700">Context<select value={noteDraft.context} onChange={(event) => setNoteDraft((draft) => ({ ...draft, context: event.target.value }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-amber-500">{SUPPORT_NOTE_CONTEXTS.map((context) => <option key={context}>{context}</option>)}</select></label></div><label className="mt-4 block text-sm font-semibold text-slate-700">Details<textarea rows="4" value={noteDraft.details} onChange={(event) => setNoteDraft((draft) => ({ ...draft, details: event.target.value }))} placeholder="What happened, and in what setting?" className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal leading-6 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setNoteTarget(null)} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving === `note-${noteTarget.accommodationId}`} className="h-10 rounded-lg bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-50">{saving === `note-${noteTarget.accommodationId}` ? "Saving…" : "Save Note"}</button></div></form></div>}
    </div>
  );
}
