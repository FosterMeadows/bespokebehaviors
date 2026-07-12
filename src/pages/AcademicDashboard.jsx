import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, Check, Copy, Search, Undo2, X } from "lucide-react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  collection, onSnapshot, query, where, orderBy,
  doc
} from "firebase/firestore";

import {
  addTask,
  ensureTodayDeck, addToDeck, removeFromDeck,
  markServedToday, unmarkServedToday, updateTaskState, archiveCompletedTask
} from "../services/academic";

import { todayKey } from "../utils/date";
import { dismissStudentFromAR, cancelTask } from "../services/academic";
import useRandomPastel from "../hooks/useRandomPastel.js";
import { listAttendanceByStudent, listCompletedTasksByStudent } from "../services/academic";
import { createPortal } from "react-dom";
import { canUseAcademic, canViewStudent, getAllowedGradeLevels, isSchoolwide } from "../utils/access";

// -------------------------------------------------
// AcademicDashboard — Setup (strip + add + waiting list) and Live (wrapping grid)
// -------------------------------------------------
const BACKLOG_SORT_OPTIONS = [
  { value: "student", label: "Student A–Z" },
  { value: "assignments", label: "Most assignments" },
  { value: "days", label: "Most days served" },
  { value: "grade", label: "Grade" }
];

function formatSubjectLabel(subject) {
  if (subject === "Sci") return "Science";
  if (subject === "SS") return "Social Studies";
  return subject || "Other";
}

function WorkspaceTabButton({ active, children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-8 rounded-md px-3 text-xs font-semibold transition active:translate-y-px focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45 ${
        active ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function chunkValues(values, size = 30) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export default function AcademicDashboard() {
  const { user, profile } = useContext(AuthContext);
  const academicAllowed = canUseAcademic(profile);
  const isDevOwner = user?.uid === "dev-owner";
  const assigningTeacherName = profile?.displayName || user?.displayName || user?.email || "Current teacher";

  const [tasks, setTasks] = useState([]);                // active tasks
  const [deckItems, setDeckItems] = useState([]);        // studentId[] for today
  const [attendanceCounts, setAttendanceCounts] = useState({}); // sid -> integer days served
  const [attendanceToday, setAttendanceToday] = useState({}); // sid -> true when present today
  const [drawer, setDrawer] = useState({ open: false, studentId: null });

  // UI mode: "setup" | "live"
  const [mode, setMode] = useState(() => localStorage.getItem("arMode") || "setup");
  useEffect(() => { localStorage.setItem("arMode", mode); }, [mode]);

  // Students: map + list for picker
  const [studentsMap, setStudentsMap] = useState({});    // sid -> student doc
  const [studentsList, setStudentsList] = useState([]);  // [{id,name,homeroom,grade}]
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  // New Task form
  const [taskForm, setTaskForm] = useState({ studentId: "", subject: "ELA", title: "", teacher: "",  notes: ""});
  const [justAddedMsg, setJustAddedMsg] = useState("");  // confirmation text after add
  const [attendanceUndo, setAttendanceUndo] = useState(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    setTaskForm((current) => current.teacher ? current : { ...current, teacher: assigningTeacherName });
  }, [assigningTeacherName]);

  // Subscribe: students (names for UI, picker)
  useEffect(() => {
    if (!academicAllowed) return;
    if (isDevOwner) {
      setStudentsMap({});
      setStudentsList([]);
      setStudentsLoaded(true);
      return;
    }
    setStudentsLoaded(false);
    const allowedGrades = getAllowedGradeLevels(profile);
    if (!isSchoolwide(profile) && !allowedGrades.length) {
      setStudentsMap({});
      setStudentsList([]);
      setStudentsLoaded(true);
      return;
    }
    const qStu = isSchoolwide(profile)
      ? query(collection(db, "students"), orderBy("displayName", "asc"))
      : query(collection(db, "students"), where("grade", "in", allowedGrades.slice(0, 30)));
    const unsub = onSnapshot(
      qStu,
      snap => {
        const map = {};
        const list = [];
        for (const d of snap.docs) {
          const s = { id: d.id, ...d.data() };
          if (!canViewStudent(profile, s)) continue;
          map[s.id] = s;
          list.push({
            id: s.id,
            name: s.displayName || s.id,
            homeroom: s.homeroom || "",
            grade: s.grade || ""
          });
        }
        setStudentsMap(map);
        setStudentsList(list.sort((a, b) => a.name.localeCompare(b.name)));
        setStudentsLoaded(true);
      },
      () => setSessionError("Students could not be loaded for your assigned grades.")
    );
    return () => unsub();
  }, [academicAllowed, profile, isDevOwner]);

  // Subscribe: active tasks (for pending counts) with fallback
  useEffect(() => {
    if (!academicAllowed || !studentsLoaded) return;
    if (isDevOwner) {
      setTasks([]);
      return;
    }
    const visibleIds = Object.keys(studentsMap);
    if (!visibleIds.length) {
      setTasks([]);
      return;
    }
    const coll = collection(db, "tasks");
    const chunkRows = new Map();
    const publish = () => setTasks(
      [...chunkRows.values()].flat().sort((a, b) => {
        const aTime = a.lastUpdated?.toMillis?.() || a.lastUpdated?.seconds || 0;
        const bTime = b.lastUpdated?.toMillis?.() || b.lastUpdated?.seconds || 0;
        return bTime - aTime;
      })
    );
    const unsubs = chunkValues(visibleIds).map((ids, index) => onSnapshot(
      query(coll, where("active", "==", true), where("studentId", "in", ids)),
      snap => {
        chunkRows.set(index, snap.docs.map(d => ({ id: d.id, ...d.data() })));
        publish();
      },
      () => setSessionError("Academic assignments could not be loaded.")
    ));
    return () => unsubs.forEach(unsub => unsub());
  }, [academicAllowed, studentsLoaded, studentsMap, isDevOwner]);

  // Ensure today's deck doc + subscribe
  useEffect(() => {
    if (!academicAllowed || !user || !studentsLoaded) return;
    if (isDevOwner) {
      setDeckItems([]);
      return;
    }
    const visibleIds = new Set(Object.keys(studentsMap));
    (async () => { await ensureTodayDeck(user.uid); })();
    const ref = doc(db, "deck", `${todayKey()}_${user.uid}`);
    const unsub = onSnapshot(
      ref,
      snap => {
        const items = snap.exists() ? (snap.data().items || []) : [];
        setDeckItems(items.filter(sid => visibleIds.has(sid)));
      },
      () => setSessionError("Today’s session roster could not be loaded.")
    );
    return () => unsub();
  }, [academicAllowed, user, studentsLoaded, studentsMap, isDevOwner]);

  // Subscribe: attendance (days served counts)
  useEffect(() => {
    if (!academicAllowed || !studentsLoaded) return;
    if (isDevOwner) {
      setAttendanceCounts({});
      setAttendanceToday({});
      return;
    }
    const visibleIds = Object.keys(studentsMap);
    if (!visibleIds.length) {
      setAttendanceCounts({});
      setAttendanceToday({});
      return;
    }
    const coll = collection(db, "attendance");
    const chunkRows = new Map();
    const publish = () => {
        const counts = {};
        const presentToday = {};
        const today = todayKey();
        for (const r of [...chunkRows.values()].flat()) {
          if (!r.studentId || !r.date) continue;
          if (!counts[r.studentId]) counts[r.studentId] = new Set();
          counts[r.studentId].add(r.date);
          if (String(r.date) === today) presentToday[r.studentId] = true;
        }
        const flat = {};
        for (const [sid, setDates] of Object.entries(counts)) flat[sid] = setDates.size;
        setAttendanceCounts(flat);
        setAttendanceToday(presentToday);
    };
    const unsubs = chunkValues(visibleIds).map((ids, index) => onSnapshot(
      query(coll, where("studentId", "in", ids)),
      snap => {
        chunkRows.set(index, snap.docs.map(d => d.data()));
        publish();
      },
      () => setSessionError("Attendance history could not be loaded.")
    ));
    return () => unsubs.forEach(unsub => unsub());
  }, [academicAllowed, studentsLoaded, studentsMap, isDevOwner]);

  // Group tasks by student for "Students Waiting"
  const byStudent = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (!m.has(t.studentId)) m.set(t.studentId, []);
      m.get(t.studentId).push(t);
    }
    return [...m.entries()]; // [ [sid, Task[]], ...]
  }, [tasks]);

  if (!user) return <div className="p-4">Sign in required.</div>;
  if (!academicAllowed) return <div className="p-4">Access denied.</div>;
  if (!studentsLoaded) return <div className="p-4">Loading...</div>;
  // Actions
  async function handleDeckToggle(studentId, on) {
    if (isDevOwner) return;
    if (on) await addToDeck(studentId, user.uid);
    else await removeFromDeck(studentId, user.uid);
  }

  // LIVE MODE: record attendance only; keep on deck
  async function handleMarkPresent(studentId) {
    if (isDevOwner) return;
    if (attendanceToday[studentId]) return;
    try {
      await markServedToday(studentId, user.uid);
      setAttendanceToday(s => ({ ...s, [studentId]: true }));
      setAttendanceUndo({ studentIds: [studentId], label: studentsMap[studentId]?.displayName || "Student" });
      setSessionMessage(`${studentsMap[studentId]?.displayName || "Student"} marked present.`);
    } catch (e) {
      console.error("[AR] markServedToday failed", e);
      setSessionError("Attendance could not be marked. Try again.");
    }
  }

  // LIVE MODE: remove from today's deck only; assignments remain pending
  async function handleDismissAndPresent(studentId) {
    if (isDevOwner) return;
    try {
      await removeFromDeck(studentId, user.uid);
    } catch (e) {
      console.error("[AR] dismiss from session failed", e);
      setSessionError("The student could not be removed from this session.");
    }
  }

  // Bulk present (no removal) — parallelized
  async function handleBulkMarkPresent() {
    if (isDevOwner) return;
    const sids = deckItems.filter((sid) => !attendanceToday[sid]);
    if (sids.length === 0) return;
    try {
      await Promise.all(sids.map(sid => markServedToday(sid, user.uid)));
      setAttendanceToday(s => {
        const next = { ...s };
        sids.forEach(sid => { next[sid] = true; });
        return next;
      });
      setAttendanceUndo({ studentIds: [...sids], label: `${sids.length} students` });
      setSessionMessage(`${sids.length} students marked present.`);
    } catch (e) {
      console.warn("[AR] bulk present encountered errors", e);
      setSessionError("Some attendance marks failed. Review the roster and try again.");
    }
  }

  async function handleEndSession() {
    if (!confirm("End this session and clear every student from today's session roster?")) return;
    if (isDevOwner) {
      setMode("setup");
      return;
    }
    const sids = [...deckItems];
    try {
      await Promise.all(sids.map(sid => removeFromDeck(sid, user.uid)));
      setMode("setup");
    } catch (e) {
      console.error("[AR] end session failed", e);
      setSessionError("The session could not be ended. Try again.");
    }
  }

  async function handleUndoAttendance() {
    if (!attendanceUndo) return;
    const studentIds = [...attendanceUndo.studentIds];
    try {
      await Promise.all(studentIds.map((sid) => unmarkServedToday(sid, user.uid)));
      setAttendanceToday((current) => {
        const next = { ...current };
        studentIds.forEach((sid) => { delete next[sid]; });
        return next;
      });
      setSessionMessage(`${attendanceUndo.label} returned to not present.`);
      setAttendanceUndo(null);
    } catch (e) {
      console.error("[AR] undo attendance failed", e);
      setSessionError("Attendance could not be undone.");
    }
  }

  // SETUP MODE dismiss (cancels tasks and removes from deck)
  async function handleDismissStudent(sid) {
    if (!sid) return false;
    if (isDevOwner) return false;
    const ok = confirm("Remove this student from Academic? This cancels their active tasks.");
    if (!ok) return false;
    try {
      await dismissStudentFromAR(sid, todayKey());
      await removeFromDeck(sid, user.uid);
      return true;
    } catch (e) {
      console.error("[AR] dismissStudentFromAR failed", e);
      setSessionError("The student could not be removed from Academic.");
      return false;
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (isDevOwner) {
      setJustAddedMsg("Dev mode does not write academic tasks.");
      setTimeout(() => setJustAddedMsg(""), 2000);
      return;
    }
    if (!taskForm.studentId.trim() || !taskForm.title.trim()) return;
    try {
      await addTask({
        studentId: taskForm.studentId.trim(),
        subject: taskForm.subject.trim(),
        title: taskForm.title.trim(),
        notes: taskForm.notes.trim(),
        assignedBy: user.uid,
        teacher: user.displayName || ""
      });
      setJustAddedMsg(`Added ${studentsMap[taskForm.studentId]?.displayName || "student"} to Academic.`);
      setTaskForm(tf => ({ ...tf, title: "", notes: "" }));
      setTimeout(() => setJustAddedMsg(""), 2000);
    } catch (e2) {
      console.error("[AR] addTask failed", e2);
      setSessionError("The assignment could not be created. Check the fields and try again.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-4 py-6">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
            <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Academic workspace</div>
            <div className="mt-0.5 text-sm text-slate-600">Assign make-up work and run sessions.</div>
          </div>
        </div>

        <div className="inline-flex self-start gap-1 rounded-md border border-slate-200 bg-slate-50/70 p-0.5 sm:self-auto">
          <WorkspaceTabButton active={mode === "setup"} onClick={() => setMode("setup")}>
            Plan Session
          </WorkspaceTabButton>
          <WorkspaceTabButton active={mode === "live"} onClick={() => setMode("live")} disabled={deckItems.length === 0}>
            In Session ({deckItems.length})
          </WorkspaceTabButton>
        </div>
      </header>

      {(sessionMessage || sessionError) && (
        <div className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${sessionError ? "border-red-200 bg-red-50 text-red-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          <span>{sessionError || sessionMessage}</span>
          {!sessionError && attendanceUndo && mode === "live" && (
            <button
              type="button"
              onClick={handleUndoAttendance}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-white/80 px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-sm transition active:translate-y-px hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
          {sessionError && <button type="button" onClick={() => setSessionError("")} className="shrink-0 text-xs font-bold text-red-800 hover:text-red-950">Dismiss</button>}
        </div>
      )}

      {mode === "live" ? (
        <LiveGrid
          studentsMap={studentsMap}
          deckItems={deckItems}
          attendanceCounts={attendanceCounts}
          attendanceToday={attendanceToday}
          tasks={tasks}
          onMarkAllPresent={handleBulkMarkPresent}
          onEndSession={handleEndSession}
          onMarkPresent={handleMarkPresent}
          onDismissAndPresent={handleDismissAndPresent}
          onOpenDrawer={(sid) => setDrawer({ open: true, studentId: sid })}
        />
      ) : (
        <SetupLayout
          studentsMap={studentsMap}
          studentsList={studentsList}
          attendanceCounts={attendanceCounts}
          byStudent={byStudent}
          deckItems={deckItems}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          justAddedMsg={justAddedMsg}
          onCreateTask={handleCreateTask}
          onToggleDeck={handleDeckToggle}
          onOpenDrawer={(sid) => setDrawer({ open: true, studentId: sid })}
          onStartSession={() => setMode("live")}
        />
      )}

      <StudentSlideOver
        open={drawer.open}
        studentId={drawer.studentId}
        onClose={() => setDrawer({ open: false, studentId: null })}
        onRemoveStudent={handleDismissStudent}
      />
    </div>
  );
}

function formatStudentDetail(grade, homeroom) {
  const cleanHomeroom = String(homeroom || "").trim();
  const homeroomLabel = cleanHomeroom
    ? /\bhr$/i.test(cleanHomeroom) ? cleanHomeroom : `${cleanHomeroom} HR`
    : "";
  return [
    grade ? `Grade ${grade}` : "",
    homeroomLabel
  ].filter(Boolean).join(" • ");
}

/* ===========================
   Setup layout (strip + add + waiting list)
   =========================== */
function SetupLayout({
  studentsMap,
  studentsList,
  attendanceCounts,
  byStudent,
  deckItems,
  taskForm,
  setTaskForm,
  justAddedMsg,
  onCreateTask,
  onToggleDeck,
  onOpenDrawer,
  onStartSession
}) {
  const [addWorkOpen, setAddWorkOpen] = useState(false);
  const [backlogFilters, setBacklogFilters] = useState({ search: "", grade: "", subject: "", sort: "student" });
  const clearTaskForm = () => setTaskForm(tf => ({ ...tf, studentId: "", title: "", notes: "" }));

  const backlogFilterOptions = useMemo(() => {
    const grades = [...new Set(byStudent.map(([sid]) => String(studentsMap[sid]?.grade || "")).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const subjects = [...new Set(byStudent.flatMap(([, tasks]) => tasks.map((task) => task.subject).filter(Boolean)))]
      .sort((a, b) => String(a).localeCompare(String(b)));
    return { grades, subjects };
  }, [byStudent, studentsMap]);

  const visibleBacklog = useMemo(() => {
    const search = backlogFilters.search.trim().toLowerCase();
    const rows = byStudent.filter(([sid, tasks]) => {
      const student = studentsMap[sid] || {};
      const searchable = `${student.displayName || sid} ${student.homeroom || ""}`.toLowerCase();
      if (search && !searchable.includes(search)) return false;
      if (backlogFilters.grade && String(student.grade || "") !== backlogFilters.grade) return false;
      if (backlogFilters.subject && !tasks.some((task) => task.subject === backlogFilters.subject)) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      const [aSid, aTasks] = a;
      const [bSid, bTasks] = b;
      if (backlogFilters.sort === "assignments") return bTasks.length - aTasks.length;
      if (backlogFilters.sort === "days") return (attendanceCounts[bSid] || 0) - (attendanceCounts[aSid] || 0);
      if (backlogFilters.sort === "grade") {
        return String(studentsMap[aSid]?.grade || "").localeCompare(String(studentsMap[bSid]?.grade || ""), undefined, { numeric: true })
          || String(studentsMap[aSid]?.displayName || aSid).localeCompare(String(studentsMap[bSid]?.displayName || bSid));
      }
      return String(studentsMap[aSid]?.displayName || aSid).localeCompare(String(studentsMap[bSid]?.displayName || bSid));
    });
  }, [attendanceCounts, backlogFilters, byStudent, studentsMap]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <div className={addWorkOpen ? "mb-4 flex flex-wrap items-start justify-between gap-3" : "flex flex-wrap items-center justify-between gap-3"}>
          <div>
            <h2 className="text-base font-bold text-slate-950">Add Work</h2>
            <p className="mt-1 text-sm text-slate-600">
              {addWorkOpen ? "Who needs to make up what?" : "Add academic work when a student needs a new makeup task."}
            </p>
          </div>
          {addWorkOpen ? (
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => setAddWorkOpen(false)}
            >
              Collapse
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              onClick={() => setAddWorkOpen(true)}
            >
              + Add Work
            </button>
          )}
        </div>

        {addWorkOpen && (
        <form
          onSubmit={onCreateTask}
          className="academic-step-in space-y-4"
        >
          {/* Row 1: Student name picker */}
          <div className="grid grid-cols-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Search student</label>
            <StudentTypeahead
              students={studentsList}
              value={taskForm.studentId}
              onSelect={(sid) => setTaskForm(tf => ({ ...tf, studentId: sid }))}
              onClear={() => setTaskForm(tf => ({ ...tf, studentId: "" }))}
              inputClassName="!px-3 !py-2 !text-[14px]"
              dropdownClassName=""
            />
          </div>

          {/* Row 2: Subject + Teacher + Assignment + Add button */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[150px_230px_minmax(0,1fr)_auto] lg:items-end">
            {/* Subject */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Subject</label>
              <div className="relative">
                <select
                  className="appearance-none w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 py-2 text-[14px] shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                  value={taskForm.subject}
                  onChange={e => setTaskForm(tf => ({ ...tf, subject: e.target.value }))}
                >
                  <option value="ELA">ELA</option>
                  <option value="Math">Math</option>
                  <option value="Sci">Science</option>
                  <option value="SS">Social Studies</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
                  viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 1 1 .94 1.16l-4.24 3.36a.75.75 0 0 1-.94 0L5.21 8.39a.75.75 0 0 1 .02-1.18z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            {/* Assigning Teacher */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Assigning Teacher</label>
              <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                {taskForm.teacher || "Current teacher"}
              </div>
            </div>

            {/* Assignment name */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Assignment name</label>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                placeholder="e.g., Argument essay draft"
                value={taskForm.title}
                onChange={e => setTaskForm(tf => ({ ...tf, title: e.target.value }))}
                required
              />
            </div>

          </div>

          {/* Row 3: Notes */}
          <div className="grid grid-cols-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">
              Academic note
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[14px] shadow-sm min-h-[76px]
                         placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
              placeholder="Be specific: missing intro paragraph; needs conferencing on thesis; didn’t attempt questions 3–5; redo citing evidence."
              value={taskForm.notes}
              onChange={e => setTaskForm(tf => ({ ...tf, notes: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Notes are for the academic host only. Students don’t see this.
            </p>
          </div>

          {(!taskForm.studentId || !taskForm.title.trim()) && (
            <div className="text-sm text-slate-600">
              {!taskForm.studentId ? "Choose a student to continue." : "Enter an assignment name."}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={clearTaskForm}
            >
              Clear
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!taskForm.studentId || !taskForm.title}
              title="Add academic work"
            >
              Add Work
            </button>
          </div>
        </form>
        )}

        {justAddedMsg && (
          <div
            className="mt-3 inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
            aria-live="polite"
          >
            {justAddedMsg}
          </div>
        )}

      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Academic Backlog</h2>
            <p className="mt-1 text-sm text-slate-600">
              {byStudent.length} {byStudent.length === 1 ? "student" : "students"} with active academic work
            </p>
          </div>
          {visibleBacklog.length !== byStudent.length && (
            <div className="text-sm font-medium text-slate-500">Showing {visibleBacklog.length}</div>
          )}
        </div>

        {byStudent.length > 0 && (
          <div className="grid grid-cols-[minmax(16rem,1fr)_9rem_11rem_13rem] gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="relative block">
              <span className="sr-only">Search backlog</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={backlogFilters.search}
                onChange={(event) => setBacklogFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search student or homeroom..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>

            <label>
              <span className="sr-only">Filter by grade</span>
              <select
                value={backlogFilters.grade}
                onChange={(event) => setBacklogFilters((current) => ({ ...current, grade: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="">All grades</option>
                {backlogFilterOptions.grades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
              </select>
            </label>

            <label>
              <span className="sr-only">Filter by subject</span>
              <select
                value={backlogFilters.subject}
                onChange={(event) => setBacklogFilters((current) => ({ ...current, subject: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="">All subjects</option>
                {backlogFilterOptions.subjects.map((subject) => <option key={subject} value={subject}>{formatSubjectLabel(subject)}</option>)}
              </select>
            </label>

            <label>
              <span className="sr-only">Sort backlog</span>
              <select
                value={backlogFilters.sort}
                onChange={(event) => setBacklogFilters((current) => ({ ...current, sort: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                {BACKLOG_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {byStudent.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <div className="text-sm font-semibold text-slate-800">No active academic work.</div>
            <div className="mt-1 text-sm text-slate-500">Students appear here after work is added.</div>
          </div>
        )}

        {byStudent.length > 0 && visibleBacklog.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
            No students match these filters.
          </div>
        )}

        {visibleBacklog.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[minmax(16rem,1.1fr)_minmax(18rem,1.15fr)_13rem_12rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <span>Student</span>
              <span>Subjects</span>
              <span>Workload</span>
              <span className="text-right">Session</span>
            </div>
            {visibleBacklog.map(([sid, list]) => (
            <BacklogStudentRow
              key={sid}
              name={studentsMap[sid]?.displayName || sid}
              homeroom={studentsMap[sid]?.homeroom || ""}
              grade={studentsMap[sid]?.grade || ""}
              days={attendanceCounts[sid] || 0}
              tasks={list}
              pending={
                list.filter(
                  t => t.active && t.state !== "completed" && t.state !== "canceled"
                ).length
              }
              staged={deckItems.includes(sid)}
              onStage={() => onToggleDeck(sid, true)}
              onUnstage={() => onToggleDeck(sid, false)}
              onOpen={() => onOpenDrawer(sid)}
              />
            ))}
          </div>
        )}

      </section>

      <div className="pt-2">
        <OnDeckPanel
          deckItems={deckItems}
          studentsMap={studentsMap}
          onUnstage={(sid) => onToggleDeck(sid, false)}
          onOpen={(sid) => onOpenDrawer(sid)}
          onStartSession={onStartSession}
        />
      </div>

    </div>
  );
}

function BacklogStudentRow({
  name, homeroom, grade, days, pending, staged, tasks = [],
  onStage, onUnstage, onOpen
}) {
  const studentDetail = formatStudentDetail(grade, homeroom);
  const subjectCounts = tasks.reduce((counts, task) => {
    if (!task.active || task.state === "completed" || task.state === "canceled") return counts;
    const subject = task.subject || "Other";
    counts[subject] = (counts[subject] || 0) + 1;
    return counts;
  }, {});
  const subjectEntries = Object.entries(subjectCounts);

  return (
    <article className="relative grid min-h-20 grid-cols-[minmax(16rem,1.1fr)_minmax(18rem,1.15fr)_13rem_12rem] items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 transition last:border-b-0 hover:bg-sky-50/40">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open details for ${name}`}
        className="absolute inset-0 z-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      />

      <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight text-slate-950">{name}</div>
          <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{studentDetail || "Student"}</div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-wrap items-center gap-1.5">
        {subjectEntries.slice(0, 4).map(([subject, count]) => (
          <span key={subject} className="inline-flex h-7 items-center rounded-md border border-sky-100 bg-sky-50 px-2.5 text-xs font-semibold text-sky-800">
            {formatSubjectLabel(subject)} <span className="ml-1.5 font-bold text-sky-950">{count}</span>
          </span>
        ))}
        {subjectEntries.length > 4 && (
          <span className="text-xs font-semibold text-slate-500">+{subjectEntries.length - 4} subjects</span>
        )}
      </div>

      <div className="pointer-events-none relative z-10 flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
        <span><strong className="font-bold text-slate-950">{pending}</strong> {pending === 1 ? "assignment" : "assignments"}</span>
        <span className="text-slate-300">·</span>
        <span><strong className="font-bold text-slate-950">{days}</strong> {days === 1 ? "day" : "days"} served</span>
      </div>

      <div className="relative z-20 flex items-center justify-end">
        {staged ? (
          <button
            type="button"
            onClick={onUnstage}
            className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition active:translate-y-px hover:bg-slate-50"
          >
            Remove from session
          </button>
        ) : (
          <button
            type="button"
            onClick={onStage}
            className="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-sky-700 px-3 text-xs font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            Add to session
          </button>
        )}
      </div>
    </article>
  );
}

function OnDeckPanel({
  deckItems,
  studentsMap,
  onUnstage,
  onOpen,
  onStartSession
}) {
  const [copyState, setCopyState] = useState("idle");
  const copyTimerRef = useRef(null);
  const deckNames = deckItems.map((sid) => studentsMap[sid]?.displayName || sid);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const copyNames = async () => {
    if (deckNames.length === 0) return;
    try {
      await navigator.clipboard.writeText(deckNames.join("\n"));
      setCopyState("copied");
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState("idle"), 3000);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">Today&apos;s Session</h2>
          <p className="mt-1 text-sm text-slate-600">
            {deckItems.length} {deckItems.length === 1 ? "student" : "students"} selected
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyNames}
            disabled={deckItems.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {copyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copyState === "copied" ? `${deckNames.length} ${deckNames.length === 1 ? "name" : "names"} copied` : copyState === "error" ? "Couldn’t copy" : "Copy names"}
          </button>
          <button
            onClick={onStartSession}
            className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={deckItems.length === 0}
            title="Start today's academic session"
          >
            Start Session
          </button>
        </div>
      </div>

      {deckItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <div className="text-sm font-semibold text-slate-800">No students selected.</div>
          <div className="mt-1 text-sm text-slate-500">Use “Add to session” in the Academic Backlog.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          {deckItems.map((sid) => {
            const student = studentsMap[sid] || {};
            const name = student.displayName || sid;
            const detail = formatStudentDetail(student.grade, student.homeroom);

            return (
              <article
                key={sid}
                className="relative flex min-h-16 items-center gap-3 rounded-lg border border-sky-100 bg-white px-3 py-2.5 shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
              >
                <button
                  type="button"
                  onClick={() => onOpen(sid)}
                  aria-label={`Open details for ${name}`}
                  className="absolute inset-0 z-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
                />
                <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3">
                  <Avatar name={name} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-950">{name}</div>
                    <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{detail || "Student"}</div>
                  </div>
                </div>
                <div className="relative z-20 ml-auto flex items-center justify-end">
                  <button
                    type="button"
                    aria-label={`Remove ${name} from session`}
                    title="Remove from session"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    onClick={() => onUnstage(sid)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ===========================
   Stage Chip Bar (compact)
   — fixed: no hooks inside map; extracted StageChip component
   =========================== */
function StageChipBar({ deckItems, studentsMap, onUnstage }) {
  return (
    <div className="flex items-center flex-wrap gap-2 p-2 border rounded-2xl bg-white shadow-sm border-sky-200">
      <span className="text-xs px-2 py-1 rounded-full border bg-sky-50 border-sky-200 text-sky-800">
        Staged: {deckItems.length}
      </span>
      {deckItems.map(sid => (
        <StageChip
          key={sid}
          sid={sid}
          name={studentsMap[sid]?.displayName || sid}
          onUnstage={() => onUnstage(sid)}
        />
      ))}
    </div>
  );
}

function StageChip({ sid, name, onUnstage }) {
  const tone = useRandomPastel(sid);
  return (
    <span
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-sm"
      style={{ background: tone.chipBg, borderColor: tone.border }}
    >
      <Avatar name={name} />
      <span className="truncate max-w-[160px]">{name}</span>
      <button
        type="button"
        className="text-[11px] px-2 py-0.5 rounded border bg-white"
        onClick={onUnstage}
      >
        Unstage
      </button>
    </span>
  );
}

/* ===========================
   SetupStudentRow — open on any empty space, only buttons stop
   =========================== */
function SetupStudentRow({
  sid, name, homeroom, grade, days, pending, staged,
  onStage, onUnstage, onOpen, onRemove
}) {
  const tone = useRandomPastel(sid);
  const stop = (e) => e.stopPropagation();

  const handleOpen = () => onOpen?.();

  return (
    <div
      className="rounded-2xl border shadow-sm p-3 cursor-pointer select-none"
      style={{ background: tone.cardBg, borderColor: tone.border }}
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpen(); } }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="font-semibold leading-tight truncate" style={{ color: tone.text }}>{name}</div>
          <div className="text-xs text-gray-500 truncate">
            {homeroom ? homeroom : ""}{homeroom && grade ? " • " : ""}{grade ? `G${grade}` : ""}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Pill label="Days Served" value={days} />
          <Pill label="Pending Tasks" value={pending} kind={pending > 0 ? "warn" : "ok"} />
          <button className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={(e)=>{stop(e); onRemove();}}>
            Remove
          </button>
        </div>
      </div>

      {/* Footer actions — no wrapper-level stopPropagation */}
      <div className="mt-3 flex items-center gap-2">
        {staged ? (
          <>
            <span className="px-2 py-0.5 rounded-full border bg-sky-50 border-sky-200 text-xs">Staged</span>
            <button className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={(e)=>{stop(e); onUnstage();}}>
              Unstage
            </button>
          </>
        ) : (
          <button className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={(e)=>{stop(e); onStage();}}>
            Stage
          </button>
        )}
      </div>
    </div>
  );
}


/* ===========================
   SetupStudentCard — same idea, only buttons stop
   =========================== */
function SetupStudentCard({
  sid, name, homeroom, grade, days, pending, staged, tasks = [],
  onStage, onUnstage, onOpen, onRemove
}) {
  const tone = useRandomPastel(sid);
  const stop = (e) => e.stopPropagation();
  const activeAssignments = tasks.filter(
    t => t.active && t.state !== "completed" && t.state !== "canceled"
  );
  const studentDetail = formatStudentDetail(grade, homeroom);

  return (
    <article
      className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3 pl-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div
        className="absolute bottom-0 left-0 top-0 w-1"
        style={{ background: tone.border, boxShadow: `0 0 16px ${tone.border}` }}
      />
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight text-slate-950 truncate">
            {name}
          </div>
          <div className="text-xs font-medium text-slate-500 truncate">{studentDetail || "Student"}</div>
          <div className="hidden">
            {homeroom ? homeroom : ""}{homeroom && grade ? " • " : ""}{grade ? `G${grade}` : ""}
          </div>
        </div>
        </div>

        {/* Pills */}
        <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
          <Pill label="Days served" value={days} />
          <Pill label="Assignments" value={pending} kind={pending > 0 ? "warn" : "ok"} />
          {staged && (
            <span className="inline-flex h-8 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800">
              In today's session
            </span>
          )}
        </div>
      </div>

      {/* Footer actions — wrapper doesn’t swallow clicks; buttons do */}
      {activeAssignments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activeAssignments.slice(0, 3).map((task) => (
            <span
              key={task.id}
              className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <span className="mr-1 font-bold text-slate-500">{task.subject || "Work"}</span>
              <span className="truncate">{task.title || "Academic assignment"}</span>
            </span>
          ))}
          {activeAssignments.length > 3 && (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
              +{activeAssignments.length - 3} more
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition active:translate-y-px hover:bg-slate-50"
          onClick={(e)=>{stop(e); onOpen();}}
        >
          Open details
        </button>
        <button
          className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 shadow-sm transition active:translate-y-px hover:bg-red-50"
          onClick={(e)=>{stop(e); onRemove();}}
          title="Remove from Academic"
        >
          Remove from Academic
        </button>

        {staged ? (
          <button
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={(e)=>{stop(e); onUnstage();}}
            title="Remove from today's session"
          >
            Remove from session
          </button>
        ) : (
          <button
            className="inline-flex h-9 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
            onClick={(e)=>{stop(e); onStage();}}
            title="Add to today's session"
          >
            Add to session
          </button>
        )}
      </div>
    </article>
  );
}


/* ===========================
   Live Mode Grid (wrapping)
   =========================== */
function LiveGrid({
  studentsMap,
  deckItems,
  attendanceCounts,
  attendanceToday,
  tasks,
  onMarkAllPresent,
  onEndSession,
  onMarkPresent,
  onDismissAndPresent,
  onOpenDrawer
}) {
  const presentCount = deckItems.filter((sid) => attendanceToday[sid]).length;
  const allPresent = deckItems.length > 0 && presentCount === deckItems.length;

  return (
    <section className="academic-step-in rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">Academic Session</h2>
          <p className="mt-1 text-sm text-slate-600">
            {presentCount} of {deckItems.length} marked present. Attendance does not complete assignments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onMarkAllPresent}
            disabled={deckItems.length === 0 || allPresent}
            className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
            title="Mark everyone on deck present"
          >
            {allPresent ? "Everyone Present" : "Mark Everyone Present"}
          </button>
          <button
            type="button"
            onClick={onEndSession}
            disabled={deckItems.length === 0}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
            title="End the session and clear today's roster"
          >
            End &amp; Clear Session
          </button>
        </div>
      </div>

      {deckItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <div className="text-sm font-semibold text-slate-800">No students on deck.</div>
          <div className="mt-1 text-sm text-slate-500">Return to setup and add students to On Deck before starting a session.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {deckItems.map((sid) => {
            const name = studentsMap[sid]?.displayName || sid;
            const subjCount = tasks.filter(t =>
              t.studentId === sid && t.active && t.state !== "completed" && t.state !== "canceled"
            ).length;
            const activeTasks = tasks.filter(t =>
              t.studentId === sid && t.active && t.state !== "completed" && t.state !== "canceled"
            );

            return (
              <LiveStudentCard
                key={sid}
                name={name}
                detail={formatStudentDetail(studentsMap[sid]?.grade, studentsMap[sid]?.homeroom)}
                daysServed={attendanceCounts[sid] || 0}
                pendingCount={subjCount}
                tasks={activeTasks}
                presentToday={!!attendanceToday[sid]}
                onOpen={() => onOpenDrawer(sid)}
                onMarkPresent={() => onMarkPresent(sid)}
                onDismissAndPresent={() => onDismissAndPresent(sid)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ===========================
   Inline add (Live mode) — not currently rendered in header
   =========================== */
function InlineAdd({ studentsMap, onAdd }) {
  const [open, setOpen] = useState(false);
  const [selectedSid, setSelectedSid] = useState("");

  const studentsList = useMemo(() => {
    return Object.values(studentsMap).map(s => ({
      id: s.id, name: s.displayName || s.id, homeroom: s.homeroom || "", grade: s.grade || ""
    }));
  }, [studentsMap]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-64">
        {!open && !selectedSid && (
          <button
            type="button"
            className="px-3 py-1.5 border rounded w-full text-left"
            onClick={() => setOpen(true)}
          >
            + Add Student
          </button>
        )}

        {(open || selectedSid) && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <StudentTypeahead
                students={studentsList}
                value={selectedSid}
                onSelect={(sid) => setSelectedSid(sid)}
                onClear={() => { setSelectedSid(""); setOpen(false); }}
              />
            </div>
            <button
              className="px-3 py-1.5 border rounded disabled:opacity-50"
              disabled={!selectedSid}
              onClick={async () => {
                await onAdd(selectedSid);
                setSelectedSid("");
                setOpen(false);
              }}
            >
              Add to Deck
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================
   Live Student Card (clean white; status via pills)
   =========================== */
function LiveStudentCard({ name, detail, daysServed, pendingCount, tasks = [], presentToday, onMarkPresent, onDismissAndPresent, onOpen }) {
  const stop = (e) => e.stopPropagation();

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        const k = e.key.toLowerCase();
        if (k === "enter") { e.preventDefault(); onOpen(); }
        if (k === "m")     { e.preventDefault(); onMarkPresent(); }
        if (k === "d")     { e.preventDefault(); onDismissAndPresent(); }
      }}
      aria-label={`${name} card`}
      title="Open details"
    >
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-950">{name}</div>
          <div className="truncate text-xs font-medium text-slate-500">{detail || "Student"}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill label="Assignments" value={pendingCount} kind={pendingCount > 0 ? "warn" : "ok"} />
            <Pill label="Days served" value={daysServed} />
            {presentToday && (
              <span className="inline-flex h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
                Present
              </span>
            )}
          </div>
        </div>
        <button
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={(e) => { stop(e); onOpen(); }}
        >
          Open
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {tasks.slice(0, 2).map((task) => (
            <div key={task.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-sky-800">{task.subject || "Work"}</span>
                <span className="truncate text-sm font-semibold text-slate-950">{task.title || "Academic assignment"}</span>
              </div>
              {task.notes && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{task.notes}</p>}
            </div>
          ))}
          {tasks.length > 2 && <div className="text-xs font-semibold text-slate-500">+{tasks.length - 2} more assignments</div>}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          className={`inline-flex h-10 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 ${
            presentToday
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "bg-sky-700 text-white hover:bg-sky-800"
          }`}
          disabled={presentToday}
          onClick={(e) => { stop(e); onMarkPresent(); }}
          title="Mark Present (M)"
        >
          {presentToday ? "Present" : "Mark Present"}
        </button>
        <button
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={(e) => { stop(e); onDismissAndPresent(); }}
          title="Dismiss from this session"
        >
          Remove from Session
        </button>
      </div>
    </article>
  );
}

function StudentTypeahead({ students, value, onSelect, onClear, inputClassName = "", dropdownClassName = "" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const selected = value ? students.find(s => s.id === value) : null;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 10);
    return students
      .filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.homeroom && s.homeroom.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [query, students]);

  useEffect(() => {
    function onDoc(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white border border-slate-300 shadow-sm text-sm">
          <Avatar name={selected.name} />
          <span className="truncate max-w-[260px]">
            {selected.name}
            {selected.homeroom ? ` • ${selected.homeroom}` : ""}
            {selected.grade ? ` • G${selected.grade}` : ""}
          </span>
        </span>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 shadow-sm"
          onClick={onClear}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition ${inputClassName}`}
        placeholder="Type a student name…"
        aria-label="Search students"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <div
          className={`absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-auto ${dropdownClassName}`}
        >
          {suggestions.length === 0 && (
            <div className="p-2 text-sm text-slate-500">No matches</div>
          )}
          {suggestions.map(s => (
            <button
              type="button"
              key={s.id}
              onClick={() => { onSelect(s.id); setQuery(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
            >
              <Avatar name={s.name} />
              <div className="truncate">
                <div className="text-sm font-medium truncate text-slate-900">{s.name}</div>
                {(s.homeroom || s.grade) && (
                  <div className="text-xs text-slate-500 truncate">
                    {s.homeroom ? s.homeroom : ""}
                    {s.homeroom && s.grade ? " • " : ""}
                    {s.grade ? `G${s.grade}` : ""}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function Pill({ label, value, kind = "default", size = "lg" }) {
  const tone =
    kind === "warn" ? "bg-amber-100 border-amber-300 text-amber-900"
    : kind === "ok" ? "bg-emerald-100 border-emerald-300 text-emerald-900"
    : "bg-slate-50 border-slate-200 text-slate-800";

  const sizes = {
    lg: "text-[13px] h-8 px-3 gap-1.5",
    sm: "text-[12px] h-6 px-2 gap-1"
  };

  return (
    <span className={`inline-flex items-center rounded-full border font-medium tabular-nums ${tone} ${sizes[size]}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}


function Avatar({ name = "" }) {
  const initial = (name?.trim()?.[0] || "?").toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold">
      {initial}
    </div>
  );
}

/* ===========================
   StudentSlideOver (single-hue pastel theming)
   — added ESC close and basic focus handling
   =========================== */
function StudentSlideOver({ open, studentId, onClose, onRemoveStudent }) {
  const { user } = useContext(AuthContext);

  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [saving, setSaving] = useState({});
  const [tab, setTab] = useState("assignments");
  const [drawerError, setDrawerError] = useState("");

  const [histAtt, setHistAtt] = useState({
    items: [], cursor: null, done: false, loading: false, error: null
  });
  const [histTasks, setHistTasks] = useState({
    items: [], cursor: null, done: false, loading: false, error: null
  });

  const [studentName, setStudentName] = useState("");
  const [studentMeta, setStudentMeta] = useState({ grade: "", homeroom: "" });
  const closeBtnRef = useRef(null);

  const TASK_STATE_OPTIONS = [
    { value: "not_started",     label: "Hasn't started" },
    { value: "needs_to_finish", label: "Needs to finish" },
    { value: "in_progress",     label: "In progress" },
    { value: "completed",       label: "Completed" }
  ];

  function formatMDY(input) {
    try {
      let y, m, d;
      if (input?.toDate) {
        const dt = input.toDate();
        y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
      } else if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
        const [yy, mm, dd] = input.split("-").map(s => parseInt(s, 10));
        y = yy; m = mm; d = dd;
      } else if (typeof input === "string") {
        const dt = new Date(input);
        if (!isNaN(dt)) {
          y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
        } else {
          return input;
        }
      } else {
        return "—";
      }
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
        new Date(y, m - 1, d)
      );
    } catch {
      return "—";
    }
  }

  function formatRecorder(value) {
    if (!value) return "";
    if (value === user?.uid) return user?.displayName || user?.email || "Current teacher";
    if (/^[A-Za-z0-9_-]{20,}$/.test(String(value))) return "staff";
    return String(value);
  }

  useEffect(() => {
    if (!open || !studentId) return;
    setDrawerError("");
    const ref = doc(db, "students", studentId);
    const unsub = onSnapshot(
      ref,
      snap => {
        const data = snap.exists() ? snap.data() : {};
        const n = data.displayName || studentId;
        setStudentName(n);
        setStudentMeta({ grade: data.grade || "", homeroom: data.homeroom || "" });
      },
      () => {
        setStudentName(studentId);
        setStudentMeta({ grade: "", homeroom: "" });
      }
    );
    return () => unsub();
  }, [open, studentId]);

  // ESC to close + focus the Close button on open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // focus close for quick ESC/Enter access
    setTimeout(() => { closeBtnRef.current?.focus(); }, 0);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function loadAttendancePage(reset = false) {
    if (!studentId || histAtt.loading || (histAtt.done && !reset)) return;
    setHistAtt(s => ({ ...s, loading: true, error: null, ...(reset ? { items: [], cursor: null, done: false } : {}) }));
    try {
      const res = await listAttendanceByStudent(studentId, { pageSize: 10, cursor: reset ? null : histAtt.cursor });
      setHistAtt(s => ({ items: reset ? res.items : [...s.items, ...res.items], cursor: res.cursor, done: res.done, loading: false, error: null }));
    } catch (e) {
      setHistAtt(s => ({ ...s, loading: false, error: e?.message || "Failed to load attendance." }));
    }
  }

  async function loadCompletedPage(reset = false) {
    if (!studentId || histTasks.loading || (histTasks.done && !reset)) return;
    setHistTasks(s => ({ ...s, loading: true, error: null, ...(reset ? { items: [], cursor: null, done: false } : {}) }));
    try {
      const res = await listCompletedTasksByStudent(studentId, { pageSize: 10, cursor: reset ? null : histTasks.cursor });
      setHistTasks(s => ({ items: reset ? res.items : [...s.items, ...res.items], cursor: res.cursor, done: res.done, loading: false, error: null }));
    } catch (e) {
      setHistTasks(s => ({ ...s, loading: false, error: e?.message || "Failed to load completed tasks." }));
    }
  }

  useEffect(() => {
    if (!open || !studentId || tab !== "history") return;
    loadAttendancePage(true);
    loadCompletedPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, tab]);

  useEffect(() => {
    if (!open || !studentId || tab !== "assignments") return;

    const tq = query(collection(db, "tasks"), where("active", "==", true), where("studentId", "==", studentId));
    const unsubT = onSnapshot(
      tq,
      snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setDrawerError("Assignments could not be loaded for this student.")
    );

    const aq = query(collection(db, "attendance"), where("studentId", "==", studentId), orderBy("date", "desc"));
    const unsubA = onSnapshot(
      aq,
      snap => setAttendance(snap.docs.map(d => d.data())),
      () => setDrawerError("Attendance could not be loaded for this student.")
    );

    return () => { unsubT(); unsubA(); };
  }, [open, studentId, tab]);

  async function handleCancelTask(taskId) {
    if (!taskId) return;
    if (!confirm("Cancel this task? It will be removed from active lists.")) return;
    try { await cancelTask(taskId); }
    catch { setDrawerError("The assignment could not be canceled."); }
  }

  async function handleRemoveStudent() {
    const removed = await onRemoveStudent?.(studentId);
    if (removed) onClose();
  }

  async function handleChangeTaskState(taskId, nextState) {
    if (!taskId || !nextState) return;
    if (nextState === "completed" && !confirm("Mark this assignment completed and move it to history?")) return;
    const prev = assignments;
    setAssignments(list => list.map(t => (t.id === taskId ? { ...t, state: nextState } : t)));
    setSaving(s => ({ ...s, [taskId]: true }));
    try {
      if (nextState === "completed") {
        await archiveCompletedTask(taskId, user?.uid || null);
      } else {
        await updateTaskState(taskId, nextState);
      }
    } catch {
      setDrawerError("The assignment could not be saved.");
      setAssignments(prev);
    } finally {
      setSaving(s => { const c = { ...s }; delete c[taskId]; return c; });
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Slide-over */}
      <aside
        className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700">
              {(studentName?.trim()?.[0] || "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-slate-950">
                {studentName || "Student"}
              </h3>
              <p className="truncate text-sm font-medium text-slate-500">
                {formatStudentDetail(studentMeta.grade, studentMeta.homeroom) || "Student"}
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {drawerError && <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span>{drawerError}</span><button type="button" onClick={() => setDrawerError("")} className="text-xs font-bold">Dismiss</button></div>}
          {/* Tabs */}
          <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${tab === "assignments" ? "bg-white text-sky-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              onClick={() => setTab("assignments")}
            >
              Assignments
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${tab === "history" ? "bg-white text-sky-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              onClick={() => setTab("history")}
            >
              History
            </button>
          </div>

          {/* ASSIGNMENTS TAB */}
          {tab === "assignments" && (
            <>
              <section className="mb-4">
                <h4 className="mb-2 font-semibold text-slate-950">Assignments</h4>
                {assignments.length === 0 && (
                  <div className="text-sm text-slate-500">No active assignments.</div>
                )}
                <ul className="space-y-2">
                  {assignments.map(t => {
                    const current = t.state || "not_started";
                    return (
                      <li
                        key={t.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate">
                            <div className="truncate font-semibold text-slate-950">
                              {t.title || "Untitled Task"}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {t.subject || "ELA"}
                              </span>
                              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                                {TASK_STATE_OPTIONS.find(opt => opt.value === current)?.label || current}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {saving[t.id] && (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                Saving…
                              </span>
                            )}
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              title="Cancel task"
                              onClick={() => handleCancelTask(t.id)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Task State</label>
                          <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                            value={current}
                            onChange={e => handleChangeTaskState(t.id, e.target.value)}
                          >
                            {TASK_STATE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="mb-4">
                <h4 className="mb-2 font-semibold text-slate-950">Recent Attendance</h4>
                {attendance.length === 0 && (
                  <div className="text-sm text-slate-500">No attendance yet.</div>
                )}
                <ul className="space-y-1">
                  {attendance.map((a, idx) => (
                    <li key={idx} className="text-sm text-slate-700">
                      {formatMDY(a.date)} {a.room ? `• ${a.room}` : ""} {a.by ? `• by ${formatRecorder(a.by)}` : ""}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="border-t border-slate-200 pt-4">
                <h4 className="font-semibold text-slate-950">Remove from Academic</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Cancels all active assignments for this student and removes them from today&apos;s session.
                </p>
                <button
                  type="button"
                  onClick={handleRemoveStudent}
                  className="mt-3 inline-flex h-9 items-center rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Remove from Academic
                </button>
              </section>
            </>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <section className="space-y-6">
              <div>
                <h4 className="mb-2 font-semibold text-slate-950">Days Served</h4>
                {histAtt.items.length === 0 && !histAtt.loading && (
                  <div className="text-sm text-slate-500">No attendance yet.</div>
                )}
                <ul className="space-y-1">
                  {histAtt.items.map(a => (
                    <li key={a.id} className="text-sm text-slate-700">
                      {formatMDY(a.date)} {a.room ? `• ${a.room}` : ""} {a.by ? `• by ${formatRecorder(a.by)}` : ""}
                    </li>
                  ))}
                </ul>
                {!histAtt.done && (
                  <div className="mt-2">
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={histAtt.loading}
                      onClick={() => loadAttendancePage(false)}
                    >
                      {histAtt.loading ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 font-semibold text-slate-950">Completed Tasks</h4>
                {histTasks.items.length === 0 && !histTasks.loading && (
                  <div className="text-sm text-slate-500">No completed tasks yet.</div>
                )}
                <ul className="space-y-2">
                  {histTasks.items.map(h => (
                    <li
                      key={h.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate">
                          <div className="truncate font-semibold text-slate-950">
                            {h.title || "Untitled Task"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {h.subject || "ELA"}
                          </div>
                        </div>
                        <span
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                        >
                          {formatMDY(h.completedAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {!histTasks.done && (
                  <div className="mt-2">
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={histTasks.loading}
                      onClick={() => loadCompletedPage(false)}
                    >
                      {histTasks.loading ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

        </div>
      </aside>
    </div>,
    document.body
  );
}
