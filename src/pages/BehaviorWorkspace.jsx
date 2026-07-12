import React, { useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, MapPin, MessageSquareWarning, Puzzle, Search, Undo2, UserRound } from "lucide-react";
import { AuthContext } from "../AuthContext.jsx";
import {
  BEHAVIOR_THRESHOLD,
  CONTEXT_OPTIONS,
  LOCATION_OPTIONS,
  createBehaviorReteach,
  getBehaviorServedCount,
  listenBehaviorStudents,
  listenPendingBehaviorReteaches,
  markBehaviorReteachServed,
  normalizeStudent,
  restoreBehaviorReteachPending
} from "../services/behavior";

const MOCK_STUDENTS = [
  { id: "dev-student-1", displayName: "Timmy Turner", grade: "6", homeroom: "Carter HR", behaviorBuybacks: 0 },
  { id: "dev-student-2", displayName: "Billy Batson", grade: "7", homeroom: "Martin HR", behaviorBuybacks: 0 },
  { id: "dev-student-3", displayName: "Sara Bell", grade: "8", homeroom: "Patel HR", behaviorBuybacks: 0 }
];

const MOCK_COUNTS = {
  "dev-student-1": {
    served: 2,
    buybacks: 0,
    adjusted: 2,
    servedRecords: [
      { id: "dev-served-1", reteachDate: "2026-05-06", assignedByName: "A. Carter", context: "Procedures", location: "Classroom" },
      { id: "dev-served-2", reteachDate: "2026-05-21", assignedByName: "Dev Owner", context: "Transition", location: "Hallway" }
    ]
  },
  "dev-student-2": {
    served: 5,
    buybacks: 0,
    adjusted: 5,
    servedRecords: [
      { id: "dev-served-3", reteachDate: "2026-04-15", assignedByName: "M. Davis", context: "Transition", location: "Hallway" },
      { id: "dev-served-4", reteachDate: "2026-04-29", assignedByName: "Dev Owner", context: "Materials", location: "Classroom" },
      { id: "dev-served-5", reteachDate: "2026-05-07", assignedByName: "S. Patel", context: "Technology use", location: "Classroom" },
      { id: "dev-served-6", reteachDate: "2026-05-18", assignedByName: "A. Carter", context: "Transition", location: "Hallway" },
      { id: "dev-served-7", reteachDate: "2026-06-02", assignedByName: "Dev Owner", context: "Transition", location: "Classroom" }
    ]
  },
  "dev-student-3": {
    served: 6,
    buybacks: 0,
    adjusted: 6,
    servedRecords: [
      { id: "dev-served-8", reteachDate: "2026-03-11", assignedByName: "M. Davis", context: "Respectful participation", location: "Classroom" },
      { id: "dev-served-9", reteachDate: "2026-03-25", assignedByName: "Dev Owner", context: "Transition", location: "Hallway" },
      { id: "dev-served-10", reteachDate: "2026-04-09", assignedByName: "A. Carter", context: "Procedures", location: "Cafeteria" },
      { id: "dev-served-11", reteachDate: "2026-04-22", assignedByName: "S. Patel", context: "Transition", location: "Hallway" },
      { id: "dev-served-12", reteachDate: "2026-05-14", assignedByName: "Dev Owner", context: "Side conversations", location: "Classroom" },
      { id: "dev-served-13", reteachDate: "2026-05-29", assignedByName: "M. Davis", context: "Transition", location: "Classroom" }
    ]
  }
};

const SERVE_SORT_OPTIONS = [
  { value: "oldest", label: "Oldest" },
  { value: "newest", label: "Newest" },
  { value: "student", label: "Student A-Z" },
  { value: "grade", label: "Grade" },
  { value: "context", label: "Context" }
];

const STUDENT_ACCENTS = [
  "#bfdbfe",
  "#bbf7d0",
  "#ddd6fe",
  "#fde68a",
  "#fecdd3",
  "#cbd5e1"
];

function hashStudentAccentKey(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getStudentAccent(record) {
  const key = String(record?.studentId || record?.studentName || record?.id || "");
  return STUDENT_ACCENTS[hashStudentAccentKey(key) % STUDENT_ACCENTS.length];
}

function reteachCountTone(count) {
  if (count >= 5) return "border-red-200 bg-red-50 text-red-800";
  if (count >= 3) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function todayInputValue() {
  return new Date().toLocaleDateString("en-CA");
}

function formatReteachDate(value) {
  if (!value) return "No date";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(`${value}T00:00:00`));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatShortReteachDate(value) {
  if (!value) return "No date";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(`${value}T00:00:00`));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function dateSortValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatLongInputDate(value) {
  if (!value) return "No date selected";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function progressTone(adjusted = 0) {
  if (adjusted >= 6) return {
    bar: "bg-red-500",
    dot: "bg-red-500",
    text: "text-red-800",
    tint: "bg-red-50",
    glow: "shadow-[-8px_0_16px_-10px_rgb(203_213_225)]"
  };
  if (adjusted >= 4) return {
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-800",
    tint: "bg-amber-50",
    glow: "shadow-[-8px_0_16px_-10px_rgb(253_230_138)]"
  };
  return {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-800",
    tint: "bg-emerald-50",
    glow: "shadow-[-8px_0_16px_-10px_rgb(167_243_208)]"
  };
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-xs font-semibold transition active:translate-y-px focus:outline-none focus:ring-2 focus:ring-sky-400 ${
        active ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function StudentSummary({ student, count, loading }) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  if (!student) return null;

  const records = [...(count?.servedRecords || [])].sort((a, b) => dateSortValue(b.reteachDate || b.servedAt) - dateSortValue(a.reteachDate || a.servedAt));
  const visibleRecords = showAllHistory ? records : records.slice(0, 4);
  const adjusted = count?.adjusted || 0;
  const remaining = Math.max(0, BEHAVIOR_THRESHOLD - adjusted);
  const tone = progressTone(adjusted);

  return (
    <aside className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${tone.glow}`}>
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Student Snapshot</h2>
      </div>

      <div className="p-5">
      <div className={`rounded-lg ${tone.tint} p-4`}>
        {loading ? (
          <div className="text-sm text-slate-600">Loading progress...</div>
        ) : (
          <>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Behavior reteach threshold</div>
            <div className="h-3 overflow-hidden rounded-full bg-white/80">
              <div
                className={`h-full rounded-full ${tone.bar} transition-all`}
                style={{ width: `${Math.min(100, (adjusted / BEHAVIOR_THRESHOLD) * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-slate-950">
                {remaining === 0 ? "Threshold reached" : `${adjusted} served · ${remaining} until threshold`}
              </div>
            </div>
            {count?.buybacks > 0 && (
              <div className="mt-1 text-xs text-slate-600">Includes {count.buybacks} buyback{count.buybacks === 1 ? "" : "s"}.</div>
            )}
          </>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent Reteaches</h3>
        {records.length === 0 && !loading ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">No served reteaches recorded yet.</div>
        ) : (
          <div className="mt-3 space-y-0">
            {visibleRecords.map((record, index) => (
            <div key={record.id || `${record.reteachDate}-${index}`} className="relative border-l border-slate-200 pb-4 pl-5 last:pb-0">
              <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full ${tone.dot}`} />
              <div className="text-sm font-semibold text-slate-950">{record.context || "Unspecified"}</div>
              <div className="mt-0.5 text-sm text-slate-600">
                {record.location || "No location"} • {formatShortReteachDate(record.reteachDate || record.servedAt)} • {record.assignedByName || record.servedByName || "Unknown teacher"}
              </div>
            </div>
            ))}
            {records.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllHistory((current) => !current)}
                className="mt-4 text-sm font-semibold text-sky-800 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                {showAllHistory ? "Show recent only" : `View all ${records.length} reteaches`}
              </button>
            )}
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}

function MaxedOutNotice({ studentName }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-red-200 bg-red-50 text-red-950 sm:grid-cols-[4rem_1fr]">
      <div className="flex min-h-full items-center justify-center bg-red-100 px-3 py-5 text-red-700">
        <AlertTriangle className="h-8 w-8 shrink-0" />
      </div>
      <p className="p-5 text-sm font-semibold leading-6">
        {studentName} has reached the behavior reteach threshold. No additional entries can be made in this app. Continue the process in WVEIS and consult your team leader or administration if you need guidance.
      </p>
    </div>
  );
}

export default function BehaviorWorkspace() {
  const { user, profile } = useContext(AuthContext);
  const isDevOwner = user?.uid === "dev-owner";
  const teacherName = profile?.displayName || user?.displayName || user?.email || "Unknown teacher";
  const [activeTab, setActiveTab] = useState("assign");
  const [students, setStudents] = useState(isDevOwner ? MOCK_STUDENTS : []);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [servedCount, setServedCount] = useState(null);
  const [devCounts, setDevCounts] = useState(MOCK_COUNTS);
  const [countLoading, setCountLoading] = useState(false);
  const [pending, setPending] = useState([]);
  const [pendingCounts, setPendingCounts] = useState({});
  const [serveFilters, setServeFilters] = useState({
    search: "",
    grade: "",
    sort: "oldest"
  });
  const [form, setForm] = useState({ reteachDate: todayInputValue(), location: "", context: "", note: "" });
  const [situationEditing, setSituationEditing] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [undoRecord, setUndoRecord] = useState(null);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (isDevOwner) {
      setStudents(MOCK_STUDENTS);
      return undefined;
    }

    return listenBehaviorStudents(
      profile,
      setStudents,
      (err) => setError(`Could not load students: ${err.message}`)
    );
  }, [isDevOwner, profile]);

  useEffect(() => {
    if (isDevOwner) return undefined;

    return listenPendingBehaviorReteaches(
      profile,
      setPending,
      (err) => setError(`Could not load To Serve list: ${err.message}`)
    );
  }, [isDevOwner, profile]);

  useEffect(() => {
    let ignore = false;

    async function loadPendingCounts() {
      if (pending.length === 0) {
        setPendingCounts({});
        return;
      }

      if (isDevOwner) {
        const counts = {};
        for (const record of pending) {
          counts[record.studentId] = devCounts[record.studentId] || { adjusted: 0 };
        }
        setPendingCounts(counts);
        return;
      }

      try {
        const studentIds = [...new Set(pending.map((record) => record.studentId).filter(Boolean))];
        const entries = await Promise.all(
          studentIds.map(async (studentId) => [studentId, await getBehaviorServedCount(studentId)])
        );
        if (!ignore) setPendingCounts(Object.fromEntries(entries));
      } catch (err) {
        if (!ignore) setError(`Could not load reteach counts: ${err.message}`);
      }
    }

    loadPendingCounts();
    return () => {
      ignore = true;
    };
  }, [devCounts, isDevOwner, pending]);

  useEffect(() => {
    let ignore = false;

    async function loadCount() {
      if (!selectedStudent) {
        setServedCount(null);
        return;
      }

      setCountLoading(true);
      try {
        const count = isDevOwner
          ? devCounts[selectedStudent.id] || { served: 0, buybacks: 0, adjusted: 0 }
          : await getBehaviorServedCount(selectedStudent.id, selectedStudent.behaviorBuybacks);
        if (!ignore) setServedCount(count);
      } catch (err) {
        if (!ignore) setError(`Could not load served count: ${err.message}`);
      } finally {
        if (!ignore) setCountLoading(false);
      }
    }

    loadCount();
    return () => {
      ignore = true;
    };
  }, [devCounts, isDevOwner, selectedStudent]);

  const suggestions = useMemo(() => {
    const term = studentQuery.trim().toLowerCase();
    if (!term || selectedStudent?.displayName === studentQuery) return [];
    return students
      .map(normalizeStudent)
      .filter((student) => student.displayName.toLowerCase().includes(term))
      .slice(0, 8);
  }, [selectedStudent, studentQuery, students]);

  const serveFilterOptions = useMemo(() => {
    const unique = (values) => [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
    return {
      grades: unique(pending.map((record) => record.grade))
    };
  }, [pending]);

  const visiblePending = useMemo(() => {
    const search = serveFilters.search.trim().toLowerCase();
    const rows = pending.filter((record) => {
      if (search && !String(record.studentName || "").toLowerCase().includes(search)) return false;
      if (serveFilters.grade && String(record.grade || "") !== serveFilters.grade) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (serveFilters.sort === "newest") return dateSortValue(b.reteachDate || b.createdAt) - dateSortValue(a.reteachDate || a.createdAt);
      if (serveFilters.sort === "student") return String(a.studentName || "").localeCompare(String(b.studentName || ""));
      if (serveFilters.sort === "grade") return String(a.grade || "").localeCompare(String(b.grade || "")) || String(a.studentName || "").localeCompare(String(b.studentName || ""));
      if (serveFilters.sort === "context") return String(a.context || "").localeCompare(String(b.context || "")) || String(a.studentName || "").localeCompare(String(b.studentName || ""));
      return dateSortValue(a.reteachDate || a.createdAt) - dateSortValue(b.reteachDate || b.createdAt);
    });
  }, [pending, serveFilters]);

  const submitBlocked = servedCount?.adjusted >= BEHAVIOR_THRESHOLD;
  const assignmentMaxedOut = selectedStudent && !countLoading && submitBlocked;
  const situationComplete = Boolean(form.location && form.context);
  const showSituationEditor = !situationComplete || situationEditing;
  const canSubmit = selectedStudent && form.reteachDate && form.location && form.context && form.note.trim() && !submitBlocked && !submitting;
  const disabledReason = useMemo(() => {
    if (submitting) return "";
    if (!selectedStudent) {
      return studentQuery.trim()
        ? "Choose a student from the suggestions so the reteach can be attached to the correct student record."
        : "Select a student from the suggestions.";
    }
    if (!form.reteachDate) return "Select a date.";
    if (!form.location) return "Select a location.";
    if (!form.context) return "Select a context.";
    if (!form.note.trim()) return "Enter a brief reteach note.";
    if (submitBlocked) return "This student is already at the behavior reteach threshold.";
    return "";
  }, [form.context, form.location, form.note, form.reteachDate, selectedStudent, studentQuery, submitBlocked, submitting]);

  function selectStudent(student) {
    const normalized = normalizeStudent(student);
    resetDraft();
    setSelectedStudent(normalized);
    setStudentQuery(normalized.displayName);
    setMessage("");
    setError("");
  }

  function resetDraft() {
    setForm({ reteachDate: todayInputValue(), location: "", context: "", note: "" });
    setSituationEditing(true);
  }

  function clearForm() {
    resetDraft();
    setSelectedStudent(null);
    setStudentQuery("");
    setServedCount(null);
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab);
    setMessage("");
    setError("");
    setUndoRecord(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!selectedStudent) {
      setError("Select a student before submitting.");
      return;
    }
    if (submitBlocked) {
      setError("This student is already at the behavior reteach threshold.");
      return;
    }
    if (!canSubmit) {
      setError("Complete all required fields before submitting.");
      return;
    }

    setSubmitting(true);
    const payload = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.displayName,
      grade: selectedStudent.grade,
      homeroom: selectedStudent.homeroom,
      assignedByUid: user?.uid || "",
      assignedByName: teacherName,
      reteachDate: form.reteachDate,
      note: form.note.trim(),
      location: form.location,
      context: form.context
    };

    try {
      if (isDevOwner) {
        setPending((rows) => [
          {
            id: `dev-reteach-${Date.now()}`,
            ...payload,
            status: "pending",
            createdAt: new Date(),
            servedAt: null,
            servedByUid: null,
            servedByName: null
          },
          ...rows
        ]);
      } else {
        await createBehaviorReteach(payload);
      }
      setMessage("Behavior reteach added to To Serve.");
      clearForm();
      setActiveTab("serve");
    } catch (err) {
      setError(`Could not create behavior reteach: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleServed(record) {
    setMessage("");
    setError("");

    try {
      if (isDevOwner) {
        setPending((rows) => rows.filter((row) => row.id !== record.id));
        setDevCounts((counts) => {
          const current = counts[record.studentId] || { served: 0, buybacks: 0, adjusted: 0, servedRecords: [] };
          const nextServed = current.served + 1;
          const nextCount = {
            ...current,
            served: nextServed,
            adjusted: Math.max(0, nextServed - current.buybacks),
            servedRecords: [
              ...(current.servedRecords || []),
              {
                id: `${record.id}-served`,
                reteachDate: record.reteachDate,
                assignedByName: record.assignedByName,
                context: record.context,
                location: record.location
              }
            ]
          };
          return { ...counts, [record.studentId]: nextCount };
        });
      } else {
        await markBehaviorReteachServed(record.id, { uid: user?.uid || "", name: teacherName });
      }
      setMessage(`${record.studentName} marked served.`);
      setUndoRecord(record);
    } catch (err) {
      setError(`Could not mark served: ${err.message}`);
    }
  }

  async function handleUndoServed() {
    if (!undoRecord || undoing) return;

    setUndoing(true);
    setError("");
    try {
      if (isDevOwner) {
        setPending((rows) => rows.some((row) => row.id === undoRecord.id) ? rows : [undoRecord, ...rows]);
        setDevCounts((counts) => {
          const current = counts[undoRecord.studentId] || { served: 0, buybacks: 0, adjusted: 0, servedRecords: [] };
          const nextServed = Math.max(0, current.served - 1);
          return {
            ...counts,
            [undoRecord.studentId]: {
              ...current,
              served: nextServed,
              adjusted: Math.max(0, nextServed - current.buybacks),
              servedRecords: (current.servedRecords || []).filter((item) => item.id !== `${undoRecord.id}-served`)
            }
          };
        });
      } else {
        await restoreBehaviorReteachPending(undoRecord.id);
      }
      setMessage(`${undoRecord.studentName} returned to To Serve.`);
      setUndoRecord(null);
    } catch (err) {
      setError(`Could not undo served status: ${err.message}`);
    } finally {
      setUndoing(false);
    }
  }

  const visibleMessage = message;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-200">
            <MessageSquareWarning className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Behavior workspace</div>
            <div className="mt-0.5 text-sm text-slate-600">Assign reteaches and track service.</div>
          </div>
        </div>
        <div className="inline-flex self-start gap-1 rounded-md border border-slate-200 bg-slate-50/70 p-0.5 sm:self-auto">
          <TabButton active={activeTab === "assign"} onClick={() => handleTabChange("assign")}>New Reteach</TabButton>
          <TabButton active={activeTab === "serve"} onClick={() => handleTabChange("serve")}>To Serve ({pending.length})</TabButton>
        </div>
      </div>

      {(visibleMessage || error) && (
        <div className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          <span>{error || visibleMessage}</span>
          {!error && undoRecord && activeTab === "serve" && (
            <button
              type="button"
              onClick={handleUndoServed}
              disabled={undoing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-white/80 px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-sm transition active:translate-y-px hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {undoing ? "Undoing…" : "Undo"}
            </button>
          )}
        </div>
      )}

      {activeTab === "assign" ? (
        <form onSubmit={handleSubmit} className={`grid gap-5 ${selectedStudent ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
            {!selectedStudent ? (
              <div className="rounded-lg bg-sky-50/70 p-6">
                <h2 className="text-2xl font-bold text-slate-950">Who needs a Reteach today?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start by choosing an active student from your assigned grade scope.
                </p>
                <div className="relative mt-5">
                  <label className="sr-only" htmlFor="behavior-student-search">Search students</label>
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="behavior-student-search"
                    type="text"
                    value={studentQuery}
                    onChange={(event) => {
                      setStudentQuery(event.target.value);
                      setSelectedStudent(null);
                    }}
                    placeholder="Search students..."
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    autoComplete="off"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {suggestions.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => selectStudent(student)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-sky-50 active:bg-sky-100"
                        >
                          <span className="font-medium text-slate-900">{student.displayName}</span>
                          <span className="text-slate-500">Grade {student.grade || "-"}{student.homeroom ? ` • ${student.homeroom}` : " • Homeroom"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {studentQuery.trim() && suggestions.length === 0 && (
                  <div className="mt-3 text-sm text-slate-600">No matching students in your current scope.</div>
                )}
                {!studentQuery.trim() && (
                  <div className="mt-5 grid gap-2 border-t border-sky-100 pt-5 sm:grid-cols-3" aria-label="How to create a reteach">
                    {["Choose a student", "Describe the reteach", "Add to To Serve"].map((step, index) => (
                      <div key={step} className="flex items-center gap-2.5 rounded-lg bg-white/70 px-3 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-sky-100">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
                          {index + 1}
                        </span>
                        {step}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-gradient-to-r from-sky-50 to-white p-4 ring-1 ring-sky-100">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-bold uppercase tracking-wide text-sky-900">Assign a new Reteach</div>
                      <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedStudent.displayName}</h2>
                      <div className="mt-1 text-sm font-medium text-slate-500">
                        Grade {selectedStudent.grade || "-"}{selectedStudent.homeroom ? ` • ${selectedStudent.homeroom}` : " • Homeroom"}
                      </div>
                    </div>
                    <div className="flex items-start">
                      <button
                        type="button"
                        onClick={() => {
                          resetDraft();
                          setSelectedStudent(null);
                          setStudentQuery("");
                          setServedCount(null);
                        }}
                         className="inline-flex h-8 items-center justify-center rounded-md border border-sky-200 bg-white/70 px-3 text-xs font-semibold text-sky-800 shadow-sm transition active:translate-y-px hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      >
                        Change Student
                      </button>
                    </div>
                  </div>
                </div>

                {assignmentMaxedOut ? (
                  <MaxedOutNotice studentName={selectedStudent.displayName} />
                ) : !situationComplete ? (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Situation</h2>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-location">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          Location
                        </label>
                        <select
                          id="behavior-location"
                          value={form.location}
                          onChange={(event) => {
                            const nextLocation = event.target.value;
                            setForm((current) => ({ ...current, location: nextLocation }));
                            if (nextLocation && form.context) setSituationEditing(false);
                          }}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        >
                          <option value="">Select location</option>
                          {LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-context">
                          <Puzzle className="h-3.5 w-3.5 text-slate-400" />
                          Context
                        </label>
                        <select
                          id="behavior-context"
                          value={form.context}
                          onChange={(event) => {
                            const nextContext = event.target.value;
                            setForm((current) => ({ ...current, context: nextContext }));
                            if (form.location && nextContext) setSituationEditing(false);
                          }}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        >
                          <option value="">Select context</option>
                          {CONTEXT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        Assigned by <span className="font-medium text-slate-800">{teacherName}</span> • {formatLongInputDate(form.reteachDate)}
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                        Edit date
                        <input
                          id="reteach-date"
                          type="date"
                          value={form.reteachDate}
                          onChange={(event) => setForm((current) => ({ ...current, reteachDate: event.target.value }))}
                          required
                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="behavior-step-in rounded-lg bg-white p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">What needs reteaching?</h2>
                      <span className="text-xs text-slate-500">{form.note.length}/240</span>
                    </div>

                    {showSituationEditor ? (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-location">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              Location
                            </label>
                            <select
                              id="behavior-location"
                              value={form.location}
                              onChange={(event) => {
                                const nextLocation = event.target.value;
                                setForm((current) => ({ ...current, location: nextLocation }));
                                if (nextLocation && form.context) setSituationEditing(false);
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                              <option value="">Select location</option>
                              {LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-context">
                              <Puzzle className="h-3.5 w-3.5 text-slate-400" />
                              Context
                            </label>
                            <select
                              id="behavior-context"
                              value={form.context}
                              onChange={(event) => {
                                const nextContext = event.target.value;
                                setForm((current) => ({ ...current, context: nextContext }));
                                if (form.location && nextContext) setSituationEditing(false);
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                              <option value="">Select context</option>
                              {CONTEXT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            Assigned by <span className="font-medium text-slate-800">{teacherName}</span> • {formatLongInputDate(form.reteachDate)}
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                            Edit date
                            <input
                              id="reteach-date"
                              type="date"
                              value={form.reteachDate}
                              onChange={(event) => setForm((current) => ({ ...current, reteachDate: event.target.value }))}
                              required
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-sky-950">
                              <MapPin className="h-4 w-4 text-sky-600" />
                              {form.location}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-violet-950">
                              <Puzzle className="h-4 w-4 text-violet-600" />
                              {form.context}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSituationEditing(true)}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                          >
                            Edit Situation
                          </button>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          Assigned by <span className="font-medium text-slate-800">{teacherName}</span> • {formatLongInputDate(form.reteachDate)}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <label className="sr-only" htmlFor="behavior-note">What needs reteaching?</label>
                      <p className="text-xs leading-5 text-slate-500">
                        Keep this brief and operational. Do not enter formal discipline, counseling, IEP, or WVEIS details.
                      </p>
                      <textarea
                        id="behavior-note"
                        value={form.note}
                        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                        maxLength={240}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 shadow-inner shadow-slate-100 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Describe the skill, expectation, or routine to revisit."
                      />
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
                      {disabledReason && (
                        <div className="text-sm text-slate-600 sm:mr-auto">
                          {disabledReason}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={clearForm}
                        className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      >
                        Clear
                      </button>
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        Add to To Serve
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {selectedStudent && (
            <StudentSummary key={selectedStudent.id} student={selectedStudent} count={servedCount} loading={countLoading} />
          )}
        </form>
      ) : (
        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">To Serve</h2>
                <div className="mt-1 text-sm font-medium text-slate-500">
                  {pending.length} pending reteach{pending.length === 1 ? "" : "es"}
                </div>
              </div>
              {visiblePending.length !== pending.length && (
                <div className="text-sm font-medium text-slate-500">
                  Showing {visiblePending.length}
                </div>
              )}
            </div>

            {pending.length > 0 && (
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_10rem_11rem] lg:items-center">
                <label className="relative block">
                  <span className="sr-only">Search student</span>
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={serveFilters.search}
                    onChange={(event) => setServeFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Search student..."
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </label>

                <label>
                  <span className="sr-only">Grade</span>
                  <select
                    value={serveFilters.grade}
                    onChange={(event) => setServeFilters((current) => ({ ...current, grade: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="">All grades</option>
                    {serveFilterOptions.grades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
                  </select>
                </label>

                <label>
                  <span className="sr-only">Sort reteaches</span>
                  <select
                    value={serveFilters.sort}
                    onChange={(event) => setServeFilters((current) => ({ ...current, sort: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  >
                    {SERVE_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>Sort: {option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden="true" />
              <div className="mt-3 text-base font-bold text-slate-900">All caught up</div>
              <div className="mt-2 text-sm text-slate-600">There are no reteaches waiting to be served.</div>
              <button
                type="button"
                onClick={() => handleTabChange("assign")}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                Create a new reteach
              </button>
            </div>
          ) : visiblePending.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-600 shadow-sm">
              No reteaches match these filters.
            </div>
          ) : (
            <div className="space-y-2.5">
              {visiblePending.map((record) => (
                <div key={record.id} className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  <div
                    className="absolute -left-px bottom-0 top-0 w-1 rounded-l-lg opacity-70"
                    style={{
                      backgroundColor: getStudentAccent(record),
                      boxShadow: `0 0 12px 1px ${getStudentAccent(record)}`
                    }}
                    aria-hidden="true"
                  />
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <h3 className="text-lg font-bold text-slate-950">{record.studentName}</h3>
                      <span className="text-sm font-semibold text-slate-500">
                        Grade {record.grade || "-"}{record.homeroom ? ` • ${record.homeroom}` : " • Homeroom"}
                      </span>
                    </div>
                    <div className="order-3 col-start-1 flex min-w-0 flex-wrap gap-1.5 text-[11px] font-semibold">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
                        <UserRound className="h-3.5 w-3.5" />
                        {record.assignedByName || "Unknown"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatReteachDate(record.reteachDate)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1 text-sky-950">
                        <MapPin className="h-3.5 w-3.5" />
                        {record.location}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50/80 px-2 py-1 text-violet-950">
                        <Puzzle className="h-3.5 w-3.5" />
                        {record.context}
                      </span>
                    </div>
                    <div className="order-2 row-span-2 flex shrink-0 items-center gap-2">
                      {(() => {
                        const currentCount = pendingCounts[record.studentId]?.adjusted;
                        const reteachNumber = Math.min(BEHAVIOR_THRESHOLD, Math.max(1, (Number(currentCount) || 0) + 1));
                        return (
                          <span className={`inline-flex h-14 flex-col items-center justify-center rounded-md border px-3 leading-tight ${reteachCountTone(reteachNumber)}`}>
                            <span className="text-[10px] font-bold uppercase tracking-wide">After service</span>
                            <span className="mt-0.5 text-sm font-extrabold">{reteachNumber} of {BEHAVIOR_THRESHOLD}</span>
                          </span>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => handleServed(record)}
                        className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                        Mark Served
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 min-h-12 border-l-4 border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Reteach note</div>
                    <p className="mt-0.5 text-[15px] leading-6 text-slate-900">{record.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
