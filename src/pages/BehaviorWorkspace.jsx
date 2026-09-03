import React, { useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, ClipboardCheck, Download, MapPin, MessageSquareWarning, PhoneCall, Puzzle, Search, Undo2, UserRound, X } from "lucide-react";
import { AuthContext } from "../AuthContext.jsx";
import HomeContactForm from "../components/HomeContactForm.jsx";
import CancelReteachDialog from "../components/CancelReteachDialog.jsx";
import ReteachCancellationDetails from "../components/ReteachCancellationDetails.jsx";
import {
  BEHAVIOR_THRESHOLD,
  BEHAVIOR_CATEGORY_OPTIONS,
  LOCATION_OPTIONS,
  cancelBehaviorReteach,
  createBehaviorReteach,
  ensureBehaviorReteachSummaries,
  getBehaviorServedCount,
  listenBehaviorAssignmentStudents,
  listenMyHomeContactRequirements,
  listenMyBehaviorReteaches,
  listenPendingBehaviorReteaches,
  markBehaviorReteachServed,
  normalizeStudent,
  recordHomeContactAttempt,
  restoreBehaviorReteachPending
} from "../services/behavior";
import { canCancelBehaviorReteach, canOverrideBehaviorThreshold } from "../utils/access";
import { downloadReteachReport } from "../utils/reteachReport";

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
  { value: "context", label: "Behavior Category" }
];

function reteachCountTone(count) {
  if (count >= 5) return "border-red-200 bg-red-50 text-red-800";
  if (count >= 4) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
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

function formatServedDateTime(value) {
  if (!value) return "Time unavailable";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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

function daysSince(value) {
  if (!value) return 0;
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
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
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold shadow-sm transition active:translate-y-px focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
        active ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function TabCount({ children, active = false, attention = false }) {
  const tone = attention
    ? "bg-amber-100 text-amber-900 ring-amber-200"
    : active
      ? "bg-emerald-200/80 text-emerald-950 ring-emerald-300"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 ${tone}`}>
      {children}
    </span>
  );
}

function BehaviorWorkflowRail({ currentStep }) {
  const steps = ["Choose a Student", "Set the Situation", "Write the Reteach"];
  const compact = currentStep > 1;
  return (
    <div className={`relative border-b border-emerald-100 px-2 ${compact ? "pb-3 pt-0" : "pb-4 pt-1"}`} aria-label="How to create a Reteach">
      <div className={`absolute left-[16.67%] right-[16.67%] h-px bg-slate-200 ${compact ? "top-3" : "top-4"}`} aria-hidden="true" />
      <ol className="relative grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepNumber === currentStep;
          const isComplete = stepNumber < currentStep;
          return (
            <li key={step} className={`flex flex-col items-center text-center ${compact ? "gap-1" : "gap-2"}`}>
              <span className={`flex items-center justify-center rounded-full border font-bold shadow-sm transition-colors ${compact ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs"} ${
                isCurrent
                  ? `border-emerald-700 bg-emerald-700 text-white ${compact ? "ring-2" : "ring-4"} ring-emerald-100`
                  : isComplete
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-400"
              }`}>
                {stepNumber}
              </span>
              <span className={`${compact ? "text-[11px]" : "text-xs"} font-semibold ${isCurrent ? "text-emerald-950" : isComplete ? "text-emerald-800" : "text-slate-400"}`}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StudentSummary({ student, count, pendingCount, loading }) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  if (!student) return null;

  const records = [...(count?.servedRecords || [])].sort((a, b) => dateSortValue(b.reteachDate || b.servedAt) - dateSortValue(a.reteachDate || a.servedAt));
  const visibleRecords = showAllHistory ? records : records.slice(0, 4);
  const adjusted = count?.adjusted || 0;
  const remaining = Math.max(0, BEHAVIOR_THRESHOLD - adjusted);
  const tone = progressTone(adjusted);
  const thresholdPanelTone = adjusted >= 4 ? tone.tint : "bg-slate-50 ring-1 ring-slate-100";

  return (
    <aside className={`overflow-hidden rounded-lg border border-slate-200 bg-white lg:sticky lg:top-24 lg:self-start ${tone.glow}`}>
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Student Snapshot</h2>
      </div>

      <div className="p-4">
      <div className={`rounded-lg ${thresholdPanelTone} p-3`}>
        {loading ? (
          <div className="text-sm text-slate-600">Loading progress...</div>
        ) : (
          <>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Behavior reteach threshold</div>
            <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200/70">
              <div
                className={`h-full rounded-full ${tone.bar} transition-all`}
                style={{ width: `${Math.min(100, (adjusted / BEHAVIOR_THRESHOLD) * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2.5">
              <div className="text-sm font-semibold text-slate-900">
                {remaining === 0 ? "Threshold Reached" : `Current Count: ${adjusted} · ${remaining} Until Threshold`}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-600">
                {pendingCount} Pending Reteach{pendingCount === 1 ? "" : "es"}
              </div>
            </div>
            {count?.buybacks > 0 && (
              <div className="mt-1 text-xs text-slate-600">Includes {count.buybacks} Buyback{count.buybacks === 1 ? "" : "s"}.</div>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
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
              {record.servedPostThreshold && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-red-700">Served after threshold</div>}
              {!record.servedPostThreshold && record.postThreshold && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-red-700">Assigned after threshold</div>}
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

function PostThresholdNotice({ studentName, acknowledged, onAcknowledge }) {
  return (
    <div className="grid overflow-hidden rounded-lg border border-amber-300 bg-amber-50 text-amber-950 sm:grid-cols-[4rem_1fr]">
      <div className="flex min-h-full items-center justify-center bg-amber-100 px-3 py-5 text-amber-700">
        <AlertTriangle className="h-8 w-8 shrink-0" />
      </div>
      <div className="p-5">
        <div className="text-sm font-bold">6 Reteaches served. Escalation threshold reached.</div>
        <p className="mt-1 text-sm leading-6">
          {studentName} may still receive a Reteach when it remains the appropriate response. This entry will be recorded as post-threshold.
        </p>
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-100/70 px-3 py-2.5 text-sm leading-5">
          <span className="font-bold">Before continuing:</span> Only use this option if your team leader or an administrator has directed you to use a Reteach instead of WVEIS. If you haven&apos;t checked with them yet, please do so.
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-white/70 px-3 py-2.5 text-sm font-semibold leading-5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-700 focus:ring-amber-400"
          />
          <span>I understand this student has reached the escalation threshold and this reteach is still the appropriate response.</span>
        </label>
      </div>
    </div>
  );
}

export default function BehaviorWorkspace() {
  const { user, profile } = useContext(AuthContext);
  const isDevOwner = user?.uid === "dev-owner";
  const canOverrideThreshold = isDevOwner || canOverrideBehaviorThreshold(profile);
  const teacherName = profile?.displayName || user?.displayName || user?.email || "Unknown teacher";
  const [activeTab, setActiveTab] = useState("assign");
  const [students, setStudents] = useState(isDevOwner ? MOCK_STUDENTS : []);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [servedCount, setServedCount] = useState(null);
  const [generatingReportIds, setGeneratingReportIds] = useState([]);
  const [devCounts, setDevCounts] = useState(MOCK_COUNTS);
  const [countLoading, setCountLoading] = useState(false);
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(!isDevOwner);
  const [myReteaches, setMyReteaches] = useState([]);
  const [homeContactRequirements, setHomeContactRequirements] = useState([]);
  const [editingHomeContactId, setEditingHomeContactId] = useState(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [myStatusFilter, setMyStatusFilter] = useState("all");
  const [pendingCounts, setPendingCounts] = useState({});
  const [serveFilters, setServeFilters] = useState({
    search: "",
    grade: "",
    sort: "oldest"
  });
  const [form, setForm] = useState({ reteachDate: todayInputValue(), location: "", context: "", note: "" });
  const [situationEditing, setSituationEditing] = useState(true);
  const [thresholdAcknowledged, setThresholdAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [undoRecord, setUndoRecord] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [servingIds, setServingIds] = useState([]);
  const [cancellingRecord, setCancellingRecord] = useState(null);
  useEffect(() => {
    if (isDevOwner) {
      setStudents(MOCK_STUDENTS);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe = () => {};

    async function startStudentSearch() {
      if (canOverrideThreshold) {
        try {
          await ensureBehaviorReteachSummaries();
        } catch (err) {
          if (!cancelled) setError(`Could not prepare behavior snapshots: ${err.message}`);
        }
      }
      if (cancelled) return;
      unsubscribe = listenBehaviorAssignmentStudents(
        profile,
        setStudents,
        (err) => setError(`Could not load students: ${err.message}`)
      );
    }

    startStudentSearch();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [canOverrideThreshold, isDevOwner, profile]);

  useEffect(() => {
    if (isDevOwner) {
      setPendingLoading(false);
      return undefined;
    }

    return listenPendingBehaviorReteaches(
      profile,
      rows => {
        setPending(rows);
        setPendingLoading(false);
      },
      (err) => {
        setPendingLoading(false);
        setError(`Could not load To Serve list: ${err.message}`);
      }
    );
  }, [isDevOwner, profile]);

  useEffect(() => {
    if (isDevOwner) return undefined;

    return listenMyBehaviorReteaches(
      user?.uid,
      setMyReteaches,
      (err) => setError(`Could not load your reteaches: ${err.message}`)
    );
  }, [isDevOwner, user?.uid]);

  useEffect(() => {
    if (isDevOwner) return undefined;
    return listenMyHomeContactRequirements(
      user?.uid,
      setHomeContactRequirements,
      (err) => setError(`Could not load required home contacts: ${err.message}`)
    );
  }, [isDevOwner, user?.uid]);

  const homeContactByReteach = useMemo(() => Object.fromEntries(
    homeContactRequirements.map(requirement => [requirement.reteachId, requirement])
  ), [homeContactRequirements]);
  const pendingHomeContacts = useMemo(
    () => homeContactRequirements.filter(requirement => requirement.status === "pending"),
    [homeContactRequirements]
  );

  const visibleMyReteaches = useMemo(() => {
    if (myStatusFilter === "all") return myReteaches;
    return myReteaches.filter((record) => record.status === myStatusFilter);
  }, [myReteaches, myStatusFilter]);
  const myReteachCounts = useMemo(() => ({
    all: myReteaches.length,
    pending: myReteaches.filter((record) => record.status === "pending").length,
    served: myReteaches.filter((record) => record.status === "served").length,
    cancelled: myReteaches.filter((record) => record.status === "cancelled").length
  }), [myReteaches]);

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
          : await getBehaviorServedCount(selectedStudent.id);
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
  }, [devCounts, isDevOwner, selectedStudent, pending]);

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

  const pendingByStudent = useMemo(() => pending.reduce((counts, record) => ({
    ...counts,
    [record.studentId]: (counts[record.studentId] || 0) + 1
  }), {}), [pending]);

  const selectedPendingCount = selectedStudent
    ? servedCount?.pending ?? pendingByStudent[selectedStudent.id] ?? 0
    : 0;

  const isPostThreshold = Boolean(selectedStudent && !countLoading && servedCount?.adjusted >= BEHAVIOR_THRESHOLD);
  const situationComplete = Boolean(form.location && form.context);
  const showSituationEditor = !situationComplete || situationEditing;
  const canSubmit = selectedStudent && form.reteachDate && form.location && form.context && form.note.trim() && (!isPostThreshold || (canOverrideThreshold && thresholdAcknowledged)) && !submitting;
  const disabledReason = useMemo(() => {
    if (submitting) return "";
    if (!selectedStudent) {
      return studentQuery.trim()
        ? "Choose a student from the suggestions so the reteach can be attached to the correct student record."
        : "Select a student from the suggestions.";
    }
    if (!form.reteachDate) return "Select a date.";
    if (!form.location) return "Select a location.";
    if (!form.context) return "Select a behavior category.";
    if (!form.note.trim()) return "Enter a brief reteach note.";
    if (isPostThreshold && !canOverrideThreshold) return "This student has reached the six-reteach threshold.";
    if (isPostThreshold && !thresholdAcknowledged) return "Acknowledge the escalation threshold before adding this reteach.";
    return "";
  }, [canOverrideThreshold, form.context, form.location, form.note, form.reteachDate, isPostThreshold, selectedStudent, studentQuery, submitting, thresholdAcknowledged]);

  function selectStudent(student) {
    const normalized = normalizeStudent(student);
    resetDraft();
    setServedCount(null);
    setSelectedStudent(normalized);
    setStudentQuery(normalized.displayName);
    setMessage("");
    setError("");
  }

  function resetDraft() {
    setForm({ reteachDate: todayInputValue(), location: "", context: "", note: "" });
    setSituationEditing(true);
    setThresholdAcknowledged(false);
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
    if (!canSubmit) {
      setError("Complete all required fields before submitting.");
      return;
    }

    setSubmitting(true);
    let countAtSubmission;
    try {
      countAtSubmission = isDevOwner
        ? devCounts[selectedStudent.id] || { served: 0, buybacks: 0, adjusted: 0 }
        : await getBehaviorServedCount(selectedStudent.id);
      setServedCount(countAtSubmission);
    } catch (err) {
      setError(`Could not verify the student reteach count: ${err.message}`);
      setSubmitting(false);
      return;
    }

    const postThresholdAtSubmission = countAtSubmission.adjusted >= BEHAVIOR_THRESHOLD;
    if (postThresholdAtSubmission && !canOverrideThreshold) {
      setError("This student has reached the six-reteach threshold. No additional reteach can be added.");
      setSubmitting(false);
      return;
    }
    if (postThresholdAtSubmission && !thresholdAcknowledged) {
      setError("Acknowledge the escalation threshold before adding this reteach.");
      setSubmitting(false);
      return;
    }

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
      context: form.context,
      postThreshold: postThresholdAtSubmission,
      thresholdAcknowledged: postThresholdAtSubmission && thresholdAcknowledged,
      servedCountAtAssignment: countAtSubmission.adjusted
    };

    try {
      if (isDevOwner) {
        const devRecord = {
            id: `dev-reteach-${Date.now()}`,
            ...payload,
            status: "pending",
            createdAt: new Date(),
            servedAt: null,
            servedByUid: null,
            servedByName: null,
            servedPostThreshold: false
          };
        setPending((rows) => [devRecord, ...rows]);
        setMyReteaches((rows) => [devRecord, ...rows]);
      } else {
        const created = await createBehaviorReteach(payload, { allowPostThreshold: canOverrideThreshold });
        if (created.homeContactRequired) {
          setMessage("Reteach Added — Home contact required");
          clearForm();
          setActiveTab("mine");
          return;
        }
      }
      setMessage("Reteach Added");
      clearForm();
      setActiveTab("serve");
    } catch (err) {
      setError(`Could not create behavior reteach: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  function mayCancel(record) {
    return (isDevOwner && record.status === "pending") || canCancelBehaviorReteach(profile, user?.uid, record);
  }

  function cancelButton(record) {
    const allowed = mayCancel(record);
    const label = allowed ? `Cancel Reteach for ${record.studentName}` : "Only the Assigning Teacher or an Admin Can Cancel";
    return <span title={label} className="inline-flex shrink-0">
      <button type="button" aria-label={label} disabled={!allowed || servingIds.includes(record.id)} onClick={() => setCancellingRecord(record)}
        className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </span>;
  }

  async function handleCancelReteach(details) {
    const record = cancellingRecord;
    if (!record || !mayCancel(record)) throw new Error("You do not have permission to cancel this reteach.");
    if (isDevOwner) {
      const cancellation = { status: "cancelled", cancelledAt: new Date(), cancelledByUid: user.uid, cancelledByName: teacherName, cancellationReason: details.reason, cancellationNote: details.note.trim() };
      setMyReteaches(rows => rows.map(row => row.id === record.id ? { ...row, ...cancellation } : row));
      setHomeContactRequirements(rows => rows.map(row => row.reteachId === record.id && row.status === "pending" ? { ...row, ...cancellation } : row));
    } else {
      await cancelBehaviorReteach(record.id, details, { uid: user.uid, name: teacherName });
    }
    setPending(rows => rows.filter(row => row.id !== record.id));
    setCancellingRecord(null);
    setError("");
    setMessage(`${record.studentName}: Reteach Cancelled — ${details.reason}.`);
  }

  async function handleServed(record) {
    if (servingIds.includes(record.id)) return;
    setMessage("");
    setError("");
    setServingIds((ids) => [...ids, record.id]);

    try {
      if (isDevOwner) {
        setPending((rows) => rows.filter((row) => row.id !== record.id));
        setMyReteaches((rows) => rows.map((row) => row.id === record.id ? {
          ...row,
          status: "served",
          servedAt: new Date(),
          servedByUid: user?.uid || "",
          servedByName: teacherName,
          servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
        } : row));
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
                location: record.location,
                postThreshold: record.postThreshold,
                servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
              }
            ]
          };
          return { ...counts, [record.studentId]: nextCount };
        });
      } else {
        await markBehaviorReteachServed(record.id, {
          uid: user?.uid || "",
          name: teacherName,
          servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
        });
      }
      setPending((rows) => rows.filter((row) => row.id !== record.id));
      setMyReteaches((rows) => rows.map((row) => row.id === record.id ? {
        ...row,
        status: "served",
        servedAt: new Date(),
        servedByUid: user?.uid || "",
        servedByName: teacherName,
        servedPostThreshold: (pendingCounts[record.studentId]?.adjusted || 0) >= BEHAVIOR_THRESHOLD
      } : row));
      setMessage(`${record.studentName} marked served.`);
      setUndoRecord(record);
    } catch (err) {
      setError(`Could not mark served: ${err.message}`);
    } finally {
      setServingIds((ids) => ids.filter((id) => id !== record.id));
    }
  }

  async function handleGenerateReport(record) {
    if (generatingReportIds.includes(record.id)) return;
    setGeneratingReportIds((ids) => [...ids, record.id]);
    setError("");
    try {
      await downloadReteachReport(record);
    } catch (err) {
      setError(`Could not generate report: ${err.message}`);
    } finally {
      setGeneratingReportIds((ids) => ids.filter((id) => id !== record.id));
    }
  }

  async function handleUndoServed() {
    if (!undoRecord || undoing) return;

    setUndoing(true);
    setError("");
    try {
      if (isDevOwner) {
        setPending((rows) => rows.some((row) => row.id === undoRecord.id) ? rows : [undoRecord, ...rows]);
        setMyReteaches((rows) => rows.map((row) => row.id === undoRecord.id ? {
          ...row,
          status: "pending",
          servedAt: null,
          servedByUid: null,
          servedByName: null,
          servedPostThreshold: false
        } : row));
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
        await restoreBehaviorReteachPending(undoRecord.id, { uid: user?.uid || "", name: teacherName });
      }
      setPending((rows) => rows.some((row) => row.id === undoRecord.id) ? rows : [undoRecord, ...rows]);
      setMyReteaches((rows) => rows.map((row) => row.id === undoRecord.id ? {
        ...row,
        status: "pending",
        servedAt: null,
        servedByUid: null,
        servedByName: null,
        servedPostThreshold: false
      } : row));
      setMessage(`${undoRecord.studentName} returned to To Serve.`);
      setUndoRecord(null);
    } catch (err) {
      setError(`Could not undo served status: ${err.message}`);
    } finally {
      setUndoing(false);
    }
  }

  async function handleRecordHomeContact(requirement, details) {
    setContactSaving(true);
    setError("");
    try {
      await recordHomeContactAttempt(requirement.id, details, {
        uid: user?.uid || "",
        name: teacherName
      });
      setEditingHomeContactId(null);
      setMessage(`Home contact attempt recorded for ${requirement.studentName}.`);
    } catch (err) {
      setError(`Could not record home contact: ${err.message}`);
    } finally {
      setContactSaving(false);
    }
  }

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => {
      setMessage("");
      setUndoRecord(null);
    }, undoRecord ? 6500 : 4000);
    return () => window.clearTimeout(timeout);
  }, [message, undoRecord]);

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
        <div className="inline-flex self-start gap-2 sm:self-auto">
          <TabButton active={activeTab === "assign"} onClick={() => handleTabChange("assign")}>New Reteach</TabButton>
          <TabButton active={activeTab === "serve"} onClick={() => handleTabChange("serve")}>To Serve <TabCount active={activeTab === "serve"}>{pending.length}</TabCount></TabButton>
          <TabButton active={activeTab === "mine"} onClick={() => handleTabChange("mine")}>
            My Reteaches
            {pendingHomeContacts.length > 0 && <TabCount active={activeTab === "mine"} attention>{pendingHomeContacts.length}</TabCount>}
          </TabButton>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {visibleMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-emerald-700 bg-emerald-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          <span>{visibleMessage}</span>
          {undoRecord && activeTab === "serve" && (
            <button
              type="button"
              onClick={handleUndoServed}
              disabled={undoing}
              className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white transition active:translate-y-px hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {undoing ? "Undoing…" : "Undo"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setUndoRecord(null);
            }}
            className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg font-normal leading-none text-emerald-100 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {pendingHomeContacts.length > 0 && (
        <button
          type="button"
          onClick={() => handleTabChange("mine")}
          className="flex w-full items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-100/70"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><PhoneCall className="h-5 w-5" /></span>
            <span>
              <span className="block text-sm font-bold">Required Home Contact Follow-Up</span>
              <span className="mt-0.5 block text-sm">{pendingHomeContacts.length} contact {pendingHomeContacts.length === 1 ? "attempt needs" : "attempts need"} to be recorded.</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide">View Follow-Up</span>
        </button>
      )}

      {activeTab === "assign" && (
        <button
          type="button"
          onClick={() => handleTabChange("serve")}
          className={`group flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            pendingLoading
              ? "border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 text-slate-800 focus:ring-slate-400"
              : pending.length > 0
              ? "border-amber-300 bg-gradient-to-r from-amber-50 via-white to-amber-50 text-amber-950 hover:border-amber-400 hover:shadow-md focus:ring-amber-400"
              : "border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-white to-emerald-50/70 text-emerald-950 hover:border-emerald-300 hover:shadow-md focus:ring-emerald-400"
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              pendingLoading ? "bg-slate-100 text-slate-500" : pending.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            }`}>
              {pendingLoading || pending.length > 0
                ? <Clock3 className="h-5 w-5" aria-hidden="true" />
                : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            </span>
            <span>
              <span className="block text-sm font-bold">
                {pendingLoading
                  ? "Checking the To Serve queue…"
                  : pending.length === 0
                  ? "No pending reteaches"
                  : `There ${pending.length === 1 ? "is" : "are"} ${pending.length} pending ${pending.length === 1 ? "Reteach" : "Reteaches"}.`}
              </span>
              <span className="mt-0.5 block text-sm text-slate-600">
                {pendingLoading
                  ? "This will only take a moment."
                  : pending.length === 0
                  ? "The To Serve queue is currently clear."
                  : "Open the queue to review students and record service."}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            <span className="hidden sm:inline">On Deck</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </button>
      )}

      {activeTab === "assign" ? (
        <form onSubmit={handleSubmit} className={`grid gap-5 ${selectedStudent ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
          <section className="relative space-y-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/60 p-4 shadow-sm transition duration-200 hover:shadow-md">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-emerald-600" />
              {!selectedStudent && (
                <MessageSquareWarning
                  className="absolute -bottom-10 -right-9 hidden h-44 w-44 text-emerald-200/35 sm:block"
                  strokeWidth={1}
                />
              )}
            </div>
            <div className="relative z-10">
              <BehaviorWorkflowRail currentStep={!selectedStudent ? 1 : situationComplete ? 3 : 2} />
            </div>
            {!selectedStudent ? (
              <div className="relative z-10 px-4 pb-3 pt-2 sm:px-5">
                <h2 className="text-2xl font-bold text-slate-950">Who needs a Reteach today?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Start by choosing an active student from the school roster.
                </p>
                <div className="relative mt-4 sm:mr-32 lg:mr-40">
                  <label className="sr-only" htmlFor="behavior-student-search">Search students</label>
                  <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-emerald-600" />
                  <input
                    id="behavior-student-search"
                    type="text"
                    value={studentQuery}
                    onChange={(event) => {
                      setStudentQuery(event.target.value);
                      setSelectedStudent(null);
                    }}
                    placeholder="Search by student name..."
                    className="h-12 w-full rounded-xl border border-emerald-200 bg-white pl-12 pr-4 text-sm shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    autoComplete="off"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {suggestions.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => selectStudent(student)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50 active:bg-emerald-100"
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
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-gradient-to-r from-emerald-50/80 to-white px-4 py-3 ring-1 ring-emerald-100">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-emerald-900">Assign a new Reteach</div>
                      <h2 className="mt-0.5 text-xl font-bold text-slate-950">{selectedStudent.displayName}</h2>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">
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
                         className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-200 bg-white/80 px-3 text-xs font-semibold text-emerald-900 shadow-sm transition active:translate-y-px hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        Change Student
                      </button>
                    </div>
                  </div>
                </div>

                {isPostThreshold && canOverrideThreshold && (
                  <PostThresholdNotice
                    studentName={selectedStudent.displayName}
                    acknowledged={thresholdAcknowledged}
                    onAcknowledge={setThresholdAcknowledged}
                  />
                )}

                {isPostThreshold && !canOverrideThreshold ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-6 text-amber-950">
                    <div className="text-sm font-bold uppercase tracking-wide">Threshold Reached</div>
                    <p className="mt-2 text-sm leading-6">
                      This student has six served reteaches. No additional reteach can be added.
                    </p>
                  </div>
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
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        >
                          <option value="">Select location</option>
                          {LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-context">
                          <Puzzle className="h-3.5 w-3.5 text-slate-400" />
                          Behavior Category
                        </label>
                        <select
                          id="behavior-context"
                          value={form.context}
                          onChange={(event) => {
                            const nextContext = event.target.value;
                            setForm((current) => ({ ...current, context: nextContext }));
                            if (form.location && nextContext) setSituationEditing(false);
                          }}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        >
                          <option value="">Select behavior category</option>
                          {BEHAVIOR_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
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
                  <div className="behavior-step-in rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">What needs reteaching?</h2>
                      <span className="text-xs text-slate-500">{form.note.length}/500</span>
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
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                              <option value="">Select location</option>
                              {LOCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="behavior-context">
                              <Puzzle className="h-3.5 w-3.5 text-slate-400" />
                              Behavior Category
                            </label>
                            <select
                              id="behavior-context"
                              value={form.context}
                              onChange={(event) => {
                                const nextContext = event.target.value;
                                setForm((current) => ({ ...current, context: nextContext }));
                                if (form.location && nextContext) setSituationEditing(false);
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            >
                              <option value="">Select behavior category</option>
                              {BEHAVIOR_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
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
                        Do not enter formal discipline, counseling, IEP, or WVEIS details.
                      </p>
                      <textarea
                        id="behavior-note"
                        value={form.note}
                        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                        maxLength={500}
                        rows={5}
                        className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 shadow-inner shadow-slate-100 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Describe what happened using specific, observable actions. Include enough context to support the student’s reflection."
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
                        {isPostThreshold ? "Add Post-Threshold Reteach" : "Add to List"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {selectedStudent && (
            <StudentSummary key={selectedStudent.id} student={selectedStudent} count={servedCount} pendingCount={selectedPendingCount} loading={countLoading} />
          )}
        </form>
      ) : activeTab === "serve" ? (
        <section className="space-y-4">
          <div className="sticky top-20 z-20 rounded-lg border border-slate-200 border-t-4 border-t-emerald-500 bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/50 p-3 shadow-sm backdrop-blur-sm">
            <div className="lg:flex lg:items-center lg:gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between lg:shrink-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-950">To Serve</h2>
                  <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                    {pending.length}
                  </span>
                </div>
              </div>
              {visiblePending.length !== pending.length && (
                <div className="text-sm font-medium text-slate-500">
                  Showing {visiblePending.length}
                </div>
              )}
            </div>

            {pending.length > 0 && (
              <div className="mt-3 grid gap-3 lg:mt-0 lg:flex-1 lg:grid-cols-[minmax(14rem,1fr)_10rem_11rem] lg:items-center">
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
                <div key={record.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-emerald-200" aria-hidden="true" />
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <h3 className="text-lg font-bold text-slate-950">{record.studentName}</h3>
                      <span className="text-sm font-semibold text-slate-500">
                        Grade {record.grade || "-"} • Homeroom: {record.homeroom || "Not listed"}
                      </span>
                    </div>
                    <div className="order-2 flex min-w-0 flex-wrap gap-1.5 text-[11px] font-semibold sm:order-3 sm:col-start-1">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 text-slate-700">
                        <UserRound className="h-3.5 w-3.5" />
                        Assigned by {record.assignedByName || "Unknown"}
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
                      {record.postThreshold && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Assigned after threshold
                        </span>
                      )}
                    </div>
                    <div className="order-3 mt-1 flex w-full flex-wrap items-stretch gap-2 sm:order-2 sm:row-span-2 sm:mt-0 sm:w-auto sm:shrink-0 sm:items-center sm:justify-end">
                      {(() => {
                        const currentCount = pendingCounts[record.studentId]?.adjusted;
                        const pendingCount = pendingByStudent[record.studentId] || 0;
                        const thresholdReached = (Number(currentCount) || 0) >= BEHAVIOR_THRESHOLD;
                        return (
                          <span className={`inline-flex min-h-12 flex-1 flex-col items-center justify-center rounded-md border px-3 leading-tight sm:flex-none ${reteachCountTone(Number(currentCount) || 0)}`}>
                            <span className="text-[10px] font-bold uppercase tracking-wide">{thresholdReached ? "Threshold reached" : "Student status"}</span>
                            <span className="mt-0.5 text-xs font-bold">{Number(currentCount) || 0} Served · {pendingCount} Pending</span>
                          </span>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => handleGenerateReport(record)}
                        disabled={generatingReportIds.includes(record.id)}
                        className="inline-flex min-h-12 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition active:translate-y-px hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
                      >
                        <Download className="h-5 w-5" />
                        {generatingReportIds.includes(record.id) ? "Generating..." : "Generate Report"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleServed(record)}
                        disabled={servingIds.includes(record.id)}
                        className="inline-flex min-h-12 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                        {servingIds.includes(record.id) ? "Saving…" : "Mark Served"}
                      </button>
                      {cancelButton(record)}
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
      ) : (
        <section className="space-y-4">
          <div className="sticky top-20 z-20 rounded-lg border border-slate-200 border-t-4 border-t-emerald-500 bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/50 p-3 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-slate-950">My Reteaches</h2>
              <div className="inline-flex flex-wrap gap-1 rounded-md bg-slate-100 p-1" aria-label="Filter my reteaches">
                {[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "served", label: "Served" }, { value: "cancelled", label: "Cancelled" }].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMyStatusFilter(option.value)}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition ${myStatusFilter === option.value ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"}`}
                  >
                    {option.label}
                    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${myStatusFilter === option.value ? "bg-emerald-100 text-emerald-900" : "bg-slate-200/80 text-slate-600"}`}>
                      {myReteachCounts[option.value]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visibleMyReteaches.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
              <ClipboardCheck className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
              <div className="mt-3 text-base font-bold text-slate-900">No {myStatusFilter === "all" ? "" : `${myStatusFilter} `}reteaches to show</div>
              <div className="mt-2 text-sm text-slate-600">
                {myStatusFilter === "all" ? "Reteaches you assign will appear here." : `You have no ${myStatusFilter} reteaches.`}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleMyReteaches.map((record) => {
                const served = record.status === "served";
                const cancelled = record.status === "cancelled";
                const contactRequirement = homeContactByReteach[record.id];
                return (
                  <article key={record.id} className={`rounded-lg border border-slate-200 bg-white shadow-sm ${served ? "p-3" : "p-4"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="text-lg font-bold text-slate-950">{record.studentName}</h3>
                          <span className="text-sm font-semibold text-slate-500">Grade {record.grade || "-"}{record.homeroom ? ` • ${record.homeroom}` : ""}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
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
                          {record.servedPostThreshold && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-800">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Served After Threshold
                            </span>
                          )}
                          {!record.servedPostThreshold && record.postThreshold && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-800">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Assigned After Threshold
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${cancelled ? "border-red-200 bg-red-50 text-red-800" : served ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                          {cancelled ? <X className="h-3.5 w-3.5" /> : served ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                          {cancelled ? "Cancelled" : served ? "Served" : "Pending"}
                        </span>
                        {record.status === "pending" && cancelButton(record)}
                      </div>
                    </div>
                    <div className={`border-l-4 border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 ${served ? "mt-2 py-2 leading-5" : "mt-3 py-2.5 leading-6"}`}>{record.note}</div>
                    <ReteachCancellationDetails record={record} />
                    {contactRequirement?.status === "cancelled" && <p className="mt-2 text-xs font-semibold text-slate-600">Linked Home Contact Withdrawn</p>}
                    {contactRequirement?.status === "pending" && (
                      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold">Home Contact Required</div>
                            <div className="mt-0.5 text-xs font-medium">Assigned {daysSince(contactRequirement.requiredAt)} {daysSince(contactRequirement.requiredAt) === 1 ? "Day" : "Days"} Ago</div>
                          </div>
                          {editingHomeContactId !== contactRequirement.id && (
                            <button type="button" onClick={() => setEditingHomeContactId(contactRequirement.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-xs font-bold text-white shadow-sm hover:bg-amber-800">
                              <PhoneCall className="h-3.5 w-3.5" />Record Home Contact
                            </button>
                          )}
                        </div>
                        {editingHomeContactId === contactRequirement.id && (
                          <HomeContactForm
                            saving={contactSaving}
                            onCancel={() => setEditingHomeContactId(null)}
                            onSubmit={(details) => handleRecordHomeContact(contactRequirement, details)}
                          />
                        )}
                      </div>
                    )}
                    {contactRequirement?.status === "completed" && (
                      <details className="group mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-950">
                        <summary className="cursor-pointer px-3 py-2 text-sm marker:text-emerald-600">
                          <span className="ml-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-bold">Home Contact Recorded</span>
                            <span className="text-xs font-semibold text-emerald-800">
                              {contactRequirement.successful ? "Successful" : "Attempted — No Contact"} · {contactRequirement.method} · {formatReteachDate(contactRequirement.attemptDate)}
                            </span>
                          </span>
                        </summary>
                        <div className="border-t border-emerald-200 px-3 py-2 text-sm">
                          <div>{contactRequirement.contactedParty} · Recorded by {contactRequirement.recordedByName || "Staff Member"}</div>
                          {contactRequirement.note && <div className="mt-2 border-l-2 border-emerald-300 pl-3 leading-5">{contactRequirement.note}</div>}
                        </div>
                      </details>
                    )}
                    {served && (
                      <div className="mt-2 text-xs font-medium text-slate-500">
                        Marked served by {record.servedByName || "Unknown teacher"} on {formatServedDateTime(record.servedAt)}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {cancellingRecord && <CancelReteachDialog key={cancellingRecord.id} record={cancellingRecord} onClose={() => setCancellingRecord(null)} onConfirm={handleCancelReteach} />}
    </div>
  );
}
