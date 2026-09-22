import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpenCheck, Check, Copy, Search, Undo2, X } from "lucide-react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  collection, onSnapshot, query, where, orderBy,
  doc
} from "firebase/firestore";

import {
  addTasks, MAX_TASK_BATCH_SIZE,
  addToDeck, removeFromDeck,
  recordTodayAcademicAttendance, undoTodayAcademicAttendance, updateTaskState, archiveCompletedTask,
  addStudentToTodayAcademicSession, endTodayAcademicSession,
  listenTodayAcademicSession,
  removeStudentFromTodayAcademicSession, startTodayAcademicSession,
  ACADEMIC_SESSION_LANES, academicLaneDocId
} from "../services/academic";

import { todayKey } from "../utils/date";
import { dismissStudentFromAR, cancelTask } from "../services/academic";
import useRandomPastel from "../hooks/useRandomPastel.js";
import { listAttendanceByStudent, listCompletedTasksByStudent } from "../services/academic";
import { createPortal } from "react-dom";
import { canUseAcademic, canViewStudent, getAllowedGradeLevels, isSchoolwide } from "../utils/access";
import { formatSubjectLabel, getSubjectBorderTone, getSubjectTone } from "../utils/academicPresentation";

// -------------------------------------------------
// AcademicDashboard — Setup (strip + add + waiting list) and Live (wrapping grid)
// -------------------------------------------------

function WorkspaceStatus({ mode, count, hostName = "", sessionIsLive = false, sessionReady = true }) {
  const label = !sessionReady ? "Loading Session" : mode === "live" ? "Session In Progress" : sessionIsLive ? "Managing Live Roster" : "Planning";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
      <span className={`h-2 w-2 rounded-full ${sessionIsLive ? "bg-emerald-500" : "bg-sky-500"}`} aria-hidden="true" />
      {label}
      {sessionReady && <span className="font-medium text-slate-500">{count} {count === 1 ? "student" : "students"}</span>}
      {sessionReady && sessionIsLive && hostName && <span className="font-medium text-slate-500">Hosted by {hostName}</span>}
    </div>
  );
}

function AcademicSuccessToast({ message, children }) {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[1050] flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-sky-700 bg-sky-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">
      <Check className="h-5 w-5 shrink-0 text-sky-300" aria-hidden="true" />
      <span>{message}</span>
      {children}
    </div>
  );
}

function ConfirmationDialog({ request, onResolve }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onResolve(false);
    };
    document.addEventListener("keydown", onKeyDown);
    setTimeout(() => cancelRef.current?.focus(), 0);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [request, onResolve]);

  if (!request) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="academic-confirm-title"
        aria-describedby="academic-confirm-description"
      >
        <h2 id="academic-confirm-title" className="text-lg font-bold text-slate-950">{request.title}</h2>
        <p id="academic-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">{request.description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResolve(false)}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            Keep working
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 ${
              request.tone === "danger" ? "bg-red-700 hover:bg-red-800 focus:ring-red-300" : "bg-sky-700 hover:bg-sky-800 focus:ring-sky-300"
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Grade-scoped Firestore rules look up each referenced student document while
// authorizing task and attendance queries. Keep each query below Firestore's
// rule document-access limit (the teacher profile lookup also uses one call).
function chunkValues(values, size = 8) {
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
  const allowedGrades = useMemo(() => getAllowedGradeLevels(profile), [profile]);
  const availableLanes = useMemo(() => isSchoolwide(profile)
    ? ACADEMIC_SESSION_LANES
    : ACADEMIC_SESSION_LANES.filter(lane => allowedGrades.includes(lane.grade)), [profile, allowedGrades]);
  const [selectedLaneId, setSelectedLaneId] = useState(() => localStorage.getItem("academicLaneId") || "6-north");
  const activeLane = availableLanes.find(lane => lane.id === selectedLaneId) || availableLanes[0] || ACADEMIC_SESSION_LANES[0];

  const [tasks, setTasks] = useState([]);                // active tasks
  const [deckItems, setDeckItems] = useState([]);        // studentId[] for today
  const [attendanceCounts, setAttendanceCounts] = useState({}); // sid -> integer days served
  const [attendanceToday, setAttendanceToday] = useState({}); // sid -> true when present today
  const [drawer, setDrawer] = useState({ open: false, studentId: null });

  // UI mode: "setup" | "live"
  const [mode, setMode] = useState("setup");
  const sessionStatusRef = useRef(null);
  const [sessionReadyLaneId, setSessionReadyLaneId] = useState(null);

  // Students: map + list for picker
  const [studentsMap, setStudentsMap] = useState({});    // sid -> student doc
  const [studentsList, setStudentsList] = useState([]);  // [{id,name,homeroom,grade}]
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const laneStudentsMap = useMemo(() => Object.fromEntries(
    Object.entries(studentsMap).filter(([, student]) => String(student.grade || "") === activeLane.grade)
  ), [activeLane.grade, studentsMap]);
  const laneStudentsList = useMemo(
    () => studentsList.filter(student => String(student.grade || "") === activeLane.grade),
    [activeLane.grade, studentsList]
  );

  // New Task form
  const [taskForm, setTaskForm] = useState({ studentIds: [], subject: "ELA", title: "", teacher: "",  notes: ""});
  const [justAddedMsg, setJustAddedMsg] = useState("");  // confirmation text after add
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [attendanceUndo, setAttendanceUndo] = useState(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [dailySession, setDailySession] = useState(null);
  const [laneSessions, setLaneSessions] = useState({});

  useEffect(() => {
    if (!availableLanes.length) return;
    if (!availableLanes.some(lane => lane.id === selectedLaneId)) setSelectedLaneId(availableLanes[0].id);
  }, [availableLanes, selectedLaneId]);

  useEffect(() => {
    localStorage.setItem("academicLaneId", activeLane.id);
  }, [activeLane.id]);

  const requestConfirmation = (options) => new Promise((resolve) => {
    setConfirmation({ ...options, resolve });
  });

  const resolveConfirmation = (result) => {
    confirmation?.resolve(result);
    setConfirmation(null);
  };

  useEffect(() => {
    if (!sessionMessage) return undefined;
    const timer = setTimeout(() => setSessionMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [sessionMessage]);

  useEffect(() => {
    setTaskForm((current) => current.teacher ? current : { ...current, teacher: assigningTeacherName });
  }, [assigningTeacherName]);

  useEffect(() => {
    setTaskForm(current => {
      const studentIds = current.studentIds.filter(studentId => laneStudentsMap[studentId]);
      return studentIds.length === current.studentIds.length ? current : { ...current, studentIds };
    });
  }, [activeLane.id, laneStudentsMap]);

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
  }, [academicAllowed, profile, isDevOwner, allowedGrades]);

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
    setDeckItems([]);
    const visibleIds = new Set(Object.keys(laneStudentsMap));
    const ref = doc(db, "deck", academicLaneDocId(activeLane.id));
    const unsub = onSnapshot(
      ref,
      snap => {
        const items = snap.exists() ? (snap.data().items || []) : [];
        setDeckItems(items.filter(sid => visibleIds.has(sid)));
      },
      () => setSessionError("Today’s session roster could not be loaded.")
    );
    return () => unsub();
  }, [academicAllowed, user, studentsLoaded, laneStudentsMap, isDevOwner, activeLane.id]);

  useEffect(() => {
    if (!academicAllowed || isDevOwner) return undefined;
    sessionStatusRef.current = null;
    return listenTodayAcademicSession(
      activeLane.id,
      session => {
        const nextStatus = session?.status || "none";
        const previousStatus = sessionStatusRef.current;
        sessionStatusRef.current = nextStatus;
        setDailySession(session);
        setSessionReadyLaneId(activeLane.id);
        if (previousStatus === null || previousStatus !== nextStatus) {
          setMode(nextStatus === "live" ? "live" : "setup");
        }
      },
      () => setSessionError("Today’s Academic session record could not be loaded.")
    );
  }, [academicAllowed, isDevOwner, activeLane.id]);

  useEffect(() => {
    if (!academicAllowed || isDevOwner) return undefined;
    const unsubs = availableLanes.map(lane => listenTodayAcademicSession(
      lane.id,
      session => setLaneSessions(current => ({ ...current, [lane.id]: session })),
      () => setSessionError("Academic session statuses could not be loaded.")
    ));
    return () => unsubs.forEach(unsub => unsub());
  }, [academicAllowed, isDevOwner, availableLanes]);

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
      if (!laneStudentsMap[t.studentId]) continue;
      if (!m.has(t.studentId)) m.set(t.studentId, []);
      m.get(t.studentId).push(t);
    }
    return [...m.entries()]; // [ [sid, Task[]], ...]
  }, [laneStudentsMap, tasks]);

  if (!user) return <div className="p-4">Sign in required.</div>;
  if (!academicAllowed) return <div className="p-4">Access denied.</div>;
  if (!studentsLoaded) return <div className="p-4">Loading...</div>;
  // Actions
  async function confirmLaneMove(error, studentId, retry) {
    if (error?.code !== "academic/student-in-other-lane") throw error;
    const studentName = studentsMap[studentId]?.displayName || "This student";
    const confirmed = await requestConfirmation({
      title: `Move ${studentName} to ${activeLane.label}?`,
      description: `${studentName} is already in ${error.laneLabel}. Moving the student will remove them from that roster and place them in ${activeLane.label}.`,
      confirmLabel: "Move Student",
      tone: "default"
    });
    if (!confirmed) return false;
    await retry();
    setSessionMessage(`${studentName} moved from ${error.laneLabel} to ${activeLane.label}.`);
    return true;
  }

  async function handleDeckToggle(studentId, on) {
    if (isDevOwner) return;
    if (!laneStudentsMap[studentId]) {
      setSessionError(`This lane is limited to Grade ${activeLane.grade} students.`);
      return;
    }
    const staff = { uid: user.uid, name: assigningTeacherName };
    try {
      if (dailySession?.status === "live") {
        if (on) await addStudentToTodayAcademicSession(studentId, staff, activeLane.id);
        else await removeStudentFromTodayAcademicSession(studentId, staff, activeLane.id);
        return;
      }
      if (on) await addToDeck(studentId, user.uid, activeLane.id, { staff });
      else await removeFromDeck(studentId, activeLane.id);
    } catch (error) {
      await confirmLaneMove(error, studentId, () => dailySession?.status === "live"
        ? addStudentToTodayAcademicSession(studentId, staff, activeLane.id, { move: true })
        : addToDeck(studentId, user.uid, activeLane.id, { move: true, staff }));
    }
  }

  // LIVE MODE: record attendance only; keep on deck
  async function handleMarkPresent(studentId) {
    if (isDevOwner) return;
    if (attendanceToday[studentId]) return;
    setSessionError("");
    try {
      await recordTodayAcademicAttendance(
        studentId,
        { uid: user.uid, name: assigningTeacherName },
        activeLane.id
      );
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
      await removeStudentFromTodayAcademicSession(studentId, { uid: user.uid, name: assigningTeacherName }, activeLane.id);
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
    setSessionError("");
    try {
      const results = await Promise.allSettled(sids.map(async sid => {
        await recordTodayAcademicAttendance(
          sid,
          { uid: user.uid, name: assigningTeacherName },
          activeLane.id
        );
        return sid;
      }));
      const successfulIds = results.filter(result => result.status === "fulfilled").map(result => result.value);
      const failedCount = results.length - successfulIds.length;
      setAttendanceToday(s => {
        const next = { ...s };
        successfulIds.forEach(sid => { next[sid] = true; });
        return next;
      });
      if (successfulIds.length > 0) {
        setAttendanceUndo({ studentIds: [...successfulIds], label: `${successfulIds.length} students` });
        setSessionMessage(`${successfulIds.length} ${successfulIds.length === 1 ? "student" : "students"} marked present.`);
      }
      if (failedCount > 0) {
        const failedNames = results
          .map((result, index) => result.status === "rejected" ? studentsMap[sids[index]]?.displayName || "Student" : null)
          .filter(Boolean);
        setSessionError(`Attendance could not be recorded for ${failedNames.join(", ")}. Use Mark All Present to retry.`);
      }
    } catch (e) {
      console.warn("[AR] bulk present encountered errors", e);
      setSessionError("Some attendance marks failed. Review the roster and try again.");
    }
  }

  async function handleEndSession() {
    const unmarkedStudentIds = deckItems.filter(sid => !attendanceToday[sid]);
    const confirmed = await requestConfirmation({
      title: unmarkedStudentIds.length > 0
        ? `End with ${unmarkedStudentIds.length} Unmarked ${unmarkedStudentIds.length === 1 ? "Student" : "Students"}?`
        : "End this Academic Session?",
      description: unmarkedStudentIds.length > 0
        ? `${unmarkedStudentIds.map(sid => studentsMap[sid]?.displayName || "Student").join(", ")} will be recorded as ${unmarkedStudentIds.length === 1 ? "a No Show" : "No Shows"}. Attendance and assignments will remain unchanged.`
        : `This closes today’s session and clears all ${deckItems.length} ${deckItems.length === 1 ? "student" : "students"} from the roster. Attendance and assignments will remain unchanged.`,
      confirmLabel: "End and Clear Session",
      tone: "danger"
    });
    if (!confirmed) return;
    if (isDevOwner) {
      setMode("setup");
      return;
    }
    const sids = [...deckItems];
    try {
      await endTodayAcademicSession({
        staff: { uid: user.uid, name: assigningTeacherName },
        unmarkedStudentIds,
        laneId: activeLane.id
      });
      setMode("setup");
      setAttendanceUndo(null);
      setSessionMessage(`Session ended with ${sids.length - unmarkedStudentIds.length} present and ${unmarkedStudentIds.length} ${unmarkedStudentIds.length === 1 ? "No Show" : "No Shows"}.`);
    } catch (e) {
      console.error("[AR] end session failed", e);
      setSessionError("The session could not be ended. Try again.");
    }
  }

  async function handleUndoAttendance() {
    if (!attendanceUndo) return;
    const studentIds = [...attendanceUndo.studentIds];
    setSessionError("");
    try {
      await undoTodayAcademicAttendance(
        studentIds,
        { uid: user.uid, name: assigningTeacherName },
        activeLane.id
      );
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
    const studentName = studentsMap[sid]?.displayName || "this student";
    const activeCount = tasks.filter((task) => task.studentId === sid && task.active).length;
    const ok = await requestConfirmation({
      title: `Remove ${studentName} from Academic?`,
      description: `This cancels ${activeCount} active ${activeCount === 1 ? "assignment" : "assignments"} and removes the student from today's session roster. Attendance history is preserved.`,
      confirmLabel: "Remove from Academic",
      tone: "danger"
    });
    if (!ok) return false;
    try {
      await dismissStudentFromAR(sid, todayKey(), { uid: user?.uid || "", name: assigningTeacherName });
      await handleDeckToggle(sid, false);
      return true;
    } catch (e) {
      console.error("[AR] dismissStudentFromAR failed", e);
      setSessionError("The student could not be removed from Academic.");
      return false;
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (taskSubmitting) return;
    if (isDevOwner) {
      setJustAddedMsg("Dev mode does not write academic tasks.");
      setTimeout(() => setJustAddedMsg(""), 2000);
      return;
    }
    const selectedStudentIds = [...new Set(taskForm.studentIds.map(id => String(id || "").trim()).filter(Boolean))];
    if (!selectedStudentIds.length || !taskForm.title.trim()) return;
    const duplicateStudentIds = selectedStudentIds.filter(studentId => tasks.some(task =>
      task.studentId === studentId
      && task.active
      && task.subject === taskForm.subject.trim()
      && String(task.title || "").trim().toLowerCase() === taskForm.title.trim().toLowerCase()
    ));
    const studentIdsToCreate = selectedStudentIds.filter(studentId => !duplicateStudentIds.includes(studentId));
    if (!studentIdsToCreate.length) {
      setSessionError(selectedStudentIds.length === 1
        ? `${studentsMap[selectedStudentIds[0]]?.displayName || "This student"} already has that active assignment.`
        : "All selected students already have that active assignment.");
      return;
    }
    setTaskSubmitting(true);
    setSessionError("");
    try {
      await addTasks({
        studentIds: studentIdsToCreate,
        grade: activeLane.grade,
        subject: taskForm.subject.trim(),
        title: taskForm.title.trim(),
        notes: taskForm.notes.trim(),
        assignedBy: user.uid,
        teacher: user.displayName || ""
      });
      const addedLabel = `${studentIdsToCreate.length} ${studentIdsToCreate.length === 1 ? "student" : "students"}`;
      const skippedLabel = duplicateStudentIds.length
        ? ` Skipped ${duplicateStudentIds.length} with that active assignment.`
        : "";
      setJustAddedMsg(`Added work for ${addedLabel}.${skippedLabel}`);
      setTaskForm(tf => ({ ...tf, studentIds: [], title: "", notes: "" }));
      setTimeout(() => setJustAddedMsg(""), 2000);
    } catch (e2) {
      console.error("[AR] addTask failed", e2);
      setSessionError("The assignment could not be created. Check the fields and try again.");
    } finally {
      setTaskSubmitting(false);
    }
  }

  async function handleStartSession() {
    if (deckItems.length === 0) return;
    if (dailySession?.status === "live") {
      setMode("live");
      return;
    }
    if (isDevOwner) {
      setMode("live");
      return;
    }
    try {
      await startTodayAcademicSession({
        hostUid: user.uid,
        hostName: assigningTeacherName,
        roster: deckItems,
        laneId: activeLane.id
      });
      setSessionMessage(`Academic Session started with ${deckItems.length} ${deckItems.length === 1 ? "student" : "students"}.`);
      setMode("live");
    } catch (error) {
      console.error("[AR] start session failed", error);
      if (error?.code === "academic/session-already-live") {
        setMode("live");
        setSessionMessage("This session is already live.");
        return;
      }
      try {
        const moved = error?.studentId && await confirmLaneMove(error, error.studentId, () => startTodayAcademicSession({
          hostUid: user.uid,
          hostName: assigningTeacherName,
          roster: deckItems,
          laneId: activeLane.id,
          moveConflicts: true
        }));
        if (moved) setMode("live");
      } catch (moveError) {
        console.error("[AR] move and start session failed", moveError);
        setSessionError("The Academic Session could not be started.");
      }
    }
  }

  async function handleAddStudentLive(studentId) {
    if (!studentId || deckItems.includes(studentId)) return;
    if (!laneStudentsMap[studentId]) {
      setSessionError(`This lane is limited to Grade ${activeLane.grade} students.`);
      return;
    }
    try {
      await addStudentToTodayAcademicSession(studentId, { uid: user.uid, name: assigningTeacherName }, activeLane.id);
      setSessionMessage(`${studentsMap[studentId]?.displayName || "Student"} added to today’s session.`);
    } catch (error) {
      console.error("[AR] add live student failed", error);
      try {
        await confirmLaneMove(error, studentId, () => addStudentToTodayAcademicSession(
          studentId,
          { uid: user.uid, name: assigningTeacherName },
          activeLane.id,
          { move: true }
        ));
      } catch (moveError) {
        console.error("[AR] move live student failed", moveError);
        setSessionError("The student could not be added to this session.");
      }
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

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <WorkspaceStatus mode={mode} count={deckItems.length} hostName={dailySession?.hostName || ""} sessionReady={isDevOwner || sessionReadyLaneId === activeLane.id} sessionIsLive={sessionReadyLaneId === activeLane.id && dailySession?.status === "live"} />
          {sessionReadyLaneId === activeLane.id && dailySession?.status === "live" && (
            <button
              type="button"
              onClick={() => setMode(mode === "live" ? "setup" : "live")}
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {mode === "live" ? "Manage Live Roster" : "View Live Session"}
            </button>
          )}
        </div>
      </header>

      {availableLanes.length > 1 && <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" aria-label="Academic session lanes">
        {availableLanes.map(lane => {
          const laneSession = laneSessions[lane.id];
          const isSelected = lane.id === activeLane.id;
          const isLive = laneSession?.status === "live";
          const activeCount = laneSession?.activeRoster?.length || 0;
          return (
            <button
              key={lane.id}
              type="button"
              onClick={() => {
                setSelectedLaneId(lane.id);
                setDeckItems([]);
                setSessionReadyLaneId(null);
                setDailySession(laneSession || null);
                setMode(laneSession?.status === "live" ? "live" : "setup");
                setSessionError("");
                setSessionMessage("");
                setAttendanceUndo(null);
              }}
              aria-current={isSelected ? "page" : undefined}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                isSelected
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
              }`}
            >
              {lane.label}
              {isLive && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${isSelected ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  Live{activeCount ? ` · ${activeCount}` : ""}
                </span>
              )}
            </button>
          );
        })}
      </nav>}
      {activeLane.grade === "6" && (
        <p className="text-xs text-slate-600">Grade 6 North and South share the work backlog. Each lane has its own session roster.</p>
      )}

      {sessionError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
          <span>{sessionError}</span>
          <button type="button" onClick={() => setSessionError("")} className="shrink-0 text-xs font-bold text-red-800 hover:text-red-950">Dismiss</button>
        </div>
      )}

      <AcademicSuccessToast message={sessionMessage}>
          {attendanceUndo && mode === "live" && (
            <button
              type="button"
              onClick={handleUndoAttendance}
              className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white transition active:translate-y-px hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
      </AcademicSuccessToast>

      {sessionReadyLaneId !== activeLane.id && !isDevOwner ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status">Loading session…</div>
      ) : mode === "live" ? (
        <LiveGrid
          laneLabel={activeLane.label}
          studentsMap={laneStudentsMap}
          studentsList={laneStudentsList}
          deckItems={deckItems}
          attendanceCounts={attendanceCounts}
          attendanceToday={attendanceToday}
          tasks={tasks}
          onMarkAllPresent={handleBulkMarkPresent}
          onEndSession={handleEndSession}
          onMarkPresent={handleMarkPresent}
          onDismissAndPresent={handleDismissAndPresent}
          onAddStudent={handleAddStudentLive}
          onOpenDrawer={(sid) => setDrawer({ open: true, studentId: sid })}
        />
      ) : (
        <SetupLayout
          laneLabel={activeLane.label}
          studentsMap={laneStudentsMap}
          studentsList={laneStudentsList}
          attendanceCounts={attendanceCounts}
          byStudent={byStudent}
          deckItems={deckItems}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          justAddedMsg={justAddedMsg}
          taskSubmitting={taskSubmitting}
          onCreateTask={handleCreateTask}
          onToggleDeck={handleDeckToggle}
          onOpenDrawer={(sid) => setDrawer({ open: true, studentId: sid })}
          onStartSession={handleStartSession}
          sessionIsLive={dailySession?.status === "live"}
          onViewSession={() => setMode("live")}
        />
      )}

      <StudentSlideOver
        open={drawer.open}
        studentId={drawer.studentId}
        daysServed={attendanceCounts[drawer.studentId] || 0}
        selectedToday={deckItems.includes(drawer.studentId)}
        onClose={() => setDrawer({ open: false, studentId: null })}
        onRemoveStudent={handleDismissStudent}
        onConfirm={requestConfirmation}
      />
      <ConfirmationDialog request={confirmation} onResolve={resolveConfirmation} />
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

function formatOldestWorkAge(tasks = []) {
  const assignedDates = tasks
    .map(task => task.assignedAt?.toDate?.() || (task.assignedAt?.seconds ? new Date(task.assignedAt.seconds * 1000) : null))
    .filter(Boolean);
  if (assignedDates.length === 0) return "Oldest Work: Unknown";
  const oldest = new Date(Math.min(...assignedDates.map(date => date.getTime())));
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOldest = new Date(oldest.getFullYear(), oldest.getMonth(), oldest.getDate());
  const days = Math.max(0, Math.floor((startToday - startOldest) / 86400000));
  if (days === 0) return "Oldest Work: Today";
  return `Oldest Work: ${days} ${days === 1 ? "Day" : "Days"}`;
}

/* ===========================
   Setup layout (strip + add + waiting list)
   =========================== */
function SetupLayout({
  laneLabel,
  studentsMap,
  studentsList,
  attendanceCounts,
  byStudent,
  deckItems,
  taskForm,
  setTaskForm,
  justAddedMsg,
  taskSubmitting,
  onCreateTask,
  onToggleDeck,
  onOpenDrawer,
  onStartSession,
  sessionIsLive,
  onViewSession
}) {
  const [addWorkOpen, setAddWorkOpen] = useState(false);
  const [backlogFilters, setBacklogFilters] = useState({ search: "", subject: "", sort: "name" });
  const clearTaskForm = () => setTaskForm(tf => ({ ...tf, studentIds: [], title: "", notes: "" }));

  const backlogFilterOptions = useMemo(() => {
    const subjects = [...new Set(byStudent.flatMap(([, tasks]) => tasks.map((task) => task.subject).filter(Boolean)))]
      .sort((a, b) => String(a).localeCompare(String(b)));
    return { subjects };
  }, [byStudent]);

  const visibleBacklog = useMemo(() => {
    const search = backlogFilters.search.trim().toLowerCase();
    const rows = byStudent.filter(([sid, tasks]) => {
      const student = studentsMap[sid] || {};
      const searchable = `${student.displayName || sid} ${student.homeroom || ""}`.toLowerCase();
      if (search && !searchable.includes(search)) return false;
      if (backlogFilters.subject && !tasks.some((task) => task.subject === backlogFilters.subject)) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      const [aSid] = a;
      const [bSid] = b;
      if (backlogFilters.sort === "oldest") {
        const oldest = (tasks) => Math.min(...tasks.map(task => task.assignedAt?.toMillis?.() || (task.assignedAt?.seconds ? task.assignedAt.seconds * 1000 : Infinity)));
        const aOldest = oldest(a[1]);
        const bOldest = oldest(b[1]);
        if (aOldest !== bOldest) return aOldest - bOldest;
      }
      return String(studentsMap[aSid]?.displayName || aSid).localeCompare(String(studentsMap[bSid]?.displayName || bSid));
    });
  }, [backlogFilters, byStudent, studentsMap]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="order-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 xl:col-start-1 xl:row-start-2">
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

        {!addWorkOpen && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs font-semibold">
            <span className="text-slate-500"><strong className="mr-1 text-slate-800">{byStudent.length}</strong> students with work</span>
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
              <strong className="mr-1">{deckItems.length}</strong> selected today
            </span>
          </div>
        )}

        {addWorkOpen && (
        <form
          onSubmit={onCreateTask}
          className="space-y-4"
        >
          {/* Row 1: Student name picker */}
          <div className="grid grid-cols-1">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search Students</label>
              <span className="text-xs font-medium text-slate-500">{taskForm.studentIds.length}/{MAX_TASK_BATCH_SIZE} selected</span>
            </div>
            {taskForm.studentIds.length > 0 && (
              <div className="mb-2 space-y-2" aria-label="Selected students">
                {taskForm.studentIds.map(studentId => {
                  const student = studentsMap[studentId] || {};
                  const studentName = student.displayName || studentId;
                  return (
                    <div key={studentId} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white px-3 py-2 shadow-sm">
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{studentName}</span>
                      <button
                        type="button"
                        onClick={() => setTaskForm(current => ({
                          ...current,
                          studentIds: current.studentIds.filter(id => id !== studentId)
                        }))}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
                        aria-label={`Remove ${studentName}`}
                      >
                        <X size={13} aria-hidden="true" /> Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <StudentTypeahead
              students={taskForm.studentIds.length >= MAX_TASK_BATCH_SIZE
                ? []
                : studentsList.filter(student => !taskForm.studentIds.includes(student.id))}
              value=""
              onSelect={(sid) => setTaskForm(current => current.studentIds.includes(sid)
                ? current
                : { ...current, studentIds: [...current.studentIds, sid] })}
              onClear={() => {}}
              inputClassName="!px-3 !py-2 !text-[14px]"
              dropdownClassName=""
            />
            {taskForm.studentIds.length >= MAX_TASK_BATCH_SIZE && (
              <p className="mt-1.5 text-xs font-medium text-slate-500">Maximum {MAX_TASK_BATCH_SIZE} students per bulk assignment.</p>
            )}
          </div>

          {/* Row 2: Subject + Assignment */}
          <div className="grid grid-cols-1 gap-3">
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

            {/* Assignment name */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Assignment Name</label>
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
              Academic Note
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] shadow-sm min-h-[76px]
                         placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
              placeholder="What should the academic host know?"
              value={taskForm.notes}
              onChange={e => setTaskForm(tf => ({ ...tf, notes: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Be specific about what is missing or where help is needed. Students don’t see this.
            </p>
          </div>

          {(taskForm.studentIds.length === 0 || !taskForm.title.trim()) && (
            <div className="text-sm text-slate-600">
              {taskForm.studentIds.length === 0 ? "Choose at least one student to continue." : "Enter an assignment name."}
            </div>
          )}

          <div className="flex flex-col items-stretch gap-3 border-t border-slate-200 pt-4">
            <span className="text-xs font-medium text-slate-500">Assigning as {taskForm.teacher || "current teacher"}</span>
            <div className="flex items-center justify-end gap-2">
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
              disabled={taskForm.studentIds.length === 0 || !taskForm.title.trim() || taskSubmitting}
              title="Add academic work"
            >
              {taskSubmitting
                ? "Adding Work…"
                : taskForm.studentIds.length > 1
                  ? `Add Work for ${taskForm.studentIds.length} Students`
                  : "Add Work"}
            </button>
            </div>
          </div>
        </form>
        )}

        <AcademicSuccessToast message={justAddedMsg} />

      </section>

      <section className="order-2 min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:col-start-2 xl:row-start-2">
        <div className="sticky top-20 z-30 rounded-lg border border-slate-200 border-t-4 border-t-sky-500 bg-gradient-to-r from-sky-50/50 via-white to-sky-50/50 p-3 shadow-sm backdrop-blur-sm xl:flex xl:items-center xl:gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="text-base font-bold text-slate-950">Academic Backlog</h2>
            <span aria-label={`${byStudent.length} students with work`} className="inline-flex min-w-6 items-center justify-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-extrabold text-sky-900">{byStudent.length}</span>
            {visibleBacklog.length !== byStudent.length && (
              <span className="text-xs font-medium text-slate-500">Showing {visibleBacklog.length}</span>
            )}
          </div>

        {byStudent.length > 0 && (
          <div className="mt-3 grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)] xl:mt-0">
            <label className="relative block">
              <span className="sr-only">Search students</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={backlogFilters.search}
                onChange={(event) => setBacklogFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search students..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>
            <label>
              <span className="sr-only">Sort backlog</span>
              <select
                value={backlogFilters.sort}
                onChange={(event) => setBacklogFilters((current) => ({ ...current, sort: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value="name">Name A–Z</option>
                <option value="oldest">Oldest work first</option>
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
          </div>
        )}
        </div>

        {byStudent.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <div className="text-sm font-semibold text-slate-800">Start with a student who needs make-up work.</div>
            <div className="mt-1 text-sm text-slate-500">Use Add Work below to create the first assignment.</div>
          </div>
        )}

        {byStudent.length > 0 && visibleBacklog.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
            No students match these filters.
          </div>
        )}

        {visibleBacklog.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {visibleBacklog.map(([sid, list]) => (
            <BacklogStudentRow
              key={sid}
              name={studentsMap[sid]?.displayName || sid}
              homeroom={studentsMap[sid]?.homeroom || ""}
              grade={studentsMap[sid]?.grade || ""}
              days={attendanceCounts[sid] || 0}
              tasks={list}
              staged={deckItems.includes(sid)}
              onStage={() => onToggleDeck(sid, true)}
              onUnstage={() => onToggleDeck(sid, false)}
              onOpen={() => onOpenDrawer(sid)}
              />
            ))}
          </div>
        )}

      </section>

      {deckItems.length > 0 && <div className="order-1 xl:col-span-2 xl:row-start-1">
        <OnDeckPanel
          laneLabel={laneLabel}
          deckItems={deckItems}
          studentsMap={studentsMap}
          onUnstage={(sid) => onToggleDeck(sid, false)}
          onOpen={(sid) => onOpenDrawer(sid)}
          onStartSession={onStartSession}
          sessionIsLive={sessionIsLive}
          onViewSession={onViewSession}
        />
      </div>}

    </div>
  );
}

function BacklogStudentRow({
  name, homeroom, grade, days, staged, tasks = [],
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
  const oldestWorkAge = formatOldestWorkAge(tasks);

  return (
    <article className="relative grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 border-b border-slate-200 bg-white px-4 py-3 transition last:border-b-0 hover:bg-sky-50/40">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open details for ${name}`}
        className="absolute inset-0 z-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      />

      <div className="pointer-events-none relative z-10 col-start-1 row-start-1 flex min-w-0 items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight text-slate-950">{name}</div>
          <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{studentDetail || "Student"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-medium text-slate-500">
            <span>{days} {days === 1 ? "Day" : "Days"} Served</span>
            <span>{oldestWorkAge}</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 col-start-1 row-start-2 grid w-max grid-cols-2 gap-1.5 pl-10">
        {subjectEntries.slice(0, 4).map(([subject, count]) => (
          <span key={subject} className={`inline-flex h-7 w-32 items-center justify-between gap-1 rounded-md border px-2 text-xs font-semibold ${getSubjectTone(subject)}`}>
            {formatSubjectLabel(subject)} <span className="ml-1.5 font-bold opacity-80">{count}</span>
          </span>
        ))}
        {subjectEntries.length > 4 && (
          <span className="text-xs font-semibold text-slate-500">+{subjectEntries.length - 4} subjects</span>
        )}
      </div>

      <div className="relative z-20 col-start-2 row-span-2 row-start-1 flex self-center justify-end">
        {staged ? (
          <button
            type="button"
            onClick={onUnstage}
            aria-label="Remove from today's session"
            title="Remove from today's session"
            className="inline-flex h-9 min-w-28 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 transition active:translate-y-px hover:border-sky-300 hover:bg-sky-100"
          >
            Selected <X size={13} className="translate-y-px" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStage}
            className="inline-flex h-10 min-w-32 items-center justify-center whitespace-nowrap rounded-lg border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-800 shadow-sm transition active:translate-y-px hover:border-sky-400 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            Add to Session
          </button>
        )}
      </div>
    </article>
  );
}

function OnDeckPanel({
  laneLabel,
  deckItems,
  studentsMap,
  onUnstage,
  onOpen,
  onStartSession,
  sessionIsLive,
  onViewSession
}) {
  const [copyState, setCopyState] = useState("idle");
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const rosterId = useId();
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
    <section className="rounded-lg border border-sky-200 bg-sky-50/40 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-bold text-slate-950">{laneLabel} — {sessionIsLive ? "Live Roster" : "Selected Students"}</h2>
          <span className="text-sm text-slate-600">{deckItems.length} {deckItems.length === 1 ? "student" : "students"}</span>
          {sessionIsLive && <span className="text-xs font-medium text-emerald-800">Roster changes apply immediately</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRosterExpanded(current => !current)}
            aria-expanded={rosterExpanded}
            aria-controls={rosterId}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-sky-800 hover:bg-sky-100 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            {rosterExpanded ? "Hide students" : `Show ${deckItems.length} students`}
          </button>
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
            onClick={sessionIsLive ? onViewSession : onStartSession}
            className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={deckItems.length === 0}
            title={sessionIsLive ? "Return to the live session" : "Start today's academic session"}
          >
            {sessionIsLive ? "Return to Session" : "Start Session"}
          </button>
        </div>
      </div>

      {rosterExpanded && (
        <div id={rosterId} className="mt-3 grid grid-cols-1 gap-2 border-t border-sky-200 pt-3 sm:grid-cols-2 xl:grid-cols-4">
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
            Add to Session
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
  laneLabel,
  studentsMap,
  studentsList,
  deckItems,
  attendanceCounts,
  attendanceToday,
  tasks,
  onMarkAllPresent,
  onEndSession,
  onMarkPresent,
  onDismissAndPresent,
  onAddStudent,
  onOpenDrawer
}) {
  const presentCount = deckItems.filter((sid) => attendanceToday[sid]).length;
  const allPresent = deckItems.length > 0 && presentCount === deckItems.length;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">{laneLabel} Session</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">
              {presentCount} / {deckItems.length} Present
            </span>
            <span className="text-xs text-slate-500">Attendance does not complete assignments.</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InlineAdd
            students={studentsList.filter(student => !deckItems.includes(student.id))}
            onAdd={onAddStudent}
          />
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

      {deckItems.length > 0 && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Session attendance"
          aria-valuemin={0}
          aria-valuemax={deckItems.length}
          aria-valuenow={presentCount}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${(presentCount / deckItems.length) * 100}%` }}
          />
        </div>
      )}

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
function InlineAdd({ students, onAdd }) {
  const [open, setOpen] = useState(false);
  const [selectedSid, setSelectedSid] = useState("");

  return (
    <div className="flex items-center gap-2">
      <div className={`relative max-w-full ${open || selectedSid ? "w-72" : "w-auto"}`}>
        {!open && !selectedSid && (
          <button
            type="button"
            className="inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setOpen(true)}
          >
            + Add Student
          </button>
        )}

        {(open || selectedSid) && (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <StudentTypeahead
                students={students}
                value={selectedSid}
                onSelect={(sid) => setSelectedSid(sid)}
                onClear={() => { setSelectedSid(""); setOpen(false); }}
              />
            </div>
            <button
              className="inline-flex h-10 shrink-0 items-center rounded-lg bg-sky-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
              disabled={!selectedSid}
              onClick={async () => {
                await onAdd(selectedSid);
                setSelectedSid("");
                setOpen(false);
              }}
            >
              Add
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
      className={`flex h-full flex-col rounded-lg border p-3 shadow-sm transition hover:shadow-md ${
        presentToday
          ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
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
            <Pill label="Assignments" value={pendingCount} />
            <Pill label="Days served" value={daysServed} />
          </div>
        </div>
        <button
          className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          onClick={(e) => { stop(e); onOpen(); }}
        >
          Open
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {tasks.slice(0, 1).map((task) => (
            <div key={task.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${getSubjectTone(task.subject)}`}>
                  {formatSubjectLabel(task.subject || "Work")}
                </span>
                <span className="truncate text-sm font-semibold text-slate-950">{task.title || "Academic assignment"}</span>
              </div>
              {task.notes && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{task.notes}</p>}
            </div>
          ))}
          {tasks.length > 1 && <div className="text-xs font-semibold text-slate-500">+{tasks.length - 1} more assignments</div>}
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-4">
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
          className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef(null);
  const listboxId = useId();

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

  const chooseStudent = (student) => {
    if (!student) return;
    onSelect(student.id);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      chooseStudent(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

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
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => { setOpen(true); setActiveIndex((current) => current < 0 ? 0 : current); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Student suggestions"
          className={`absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-auto ${dropdownClassName}`}
        >
          {suggestions.length === 0 && (
            <div className="p-2 text-sm text-slate-500">No matches</div>
          )}
          {suggestions.map((s, index) => (
            <button
              type="button"
              key={s.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseStudent(s)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left ${index === activeIndex ? "bg-sky-50" : "hover:bg-slate-50"}`}
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
function StudentSlideOver({ open, studentId, daysServed = 0, selectedToday = false, onClose, onRemoveStudent, onConfirm }) {
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
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

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
    if (/^[A-Za-z0-9_-]{20,}$/.test(String(value))) return "Staff Member";
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

  // Keep keyboard focus inside the drawer and restore it on close.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [...(drawerRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => { closeBtnRef.current?.focus(); }, 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

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
    const task = assignments.find((item) => item.id === taskId);
    const confirmed = await onConfirm?.({
      title: "Cancel this assignment?",
      description: `${task?.title || "This assignment"} will be removed from active lists. Its existing history will remain available.`,
      confirmLabel: "Cancel assignment",
      tone: "danger"
    });
    if (!confirmed) return;
    try { await cancelTask(taskId, "", { uid: user?.uid || "", name: user?.displayName || "" }); }
    catch { setDrawerError("The assignment could not be canceled."); }
  }

  async function handleRemoveStudent() {
    const removed = await onRemoveStudent?.(studentId);
    if (removed) onClose();
  }

  async function handleChangeTaskState(taskId, nextState) {
    if (!taskId || !nextState) return;
    if (nextState === "completed") {
      const task = assignments.find((item) => item.id === taskId);
      const confirmed = await onConfirm?.({
        title: "Complete this assignment?",
        description: `${task?.title || "This assignment"} will move out of the active backlog and into completed history.`,
        confirmLabel: "Mark completed",
        tone: "default"
      });
      if (!confirmed) return;
    }
    const prev = assignments;
    setAssignments(list => list.map(t => (t.id === taskId ? { ...t, state: nextState } : t)));
    setSaving(s => ({ ...s, [taskId]: true }));
    try {
      if (nextState === "completed") {
        await archiveCompletedTask(taskId, user?.uid || null);
      } else {
        await updateTaskState(taskId, nextState, { uid: user?.uid || "", name: user?.displayName || "" });
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
        ref={drawerRef}
        className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
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

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
              {assignments.length} Active {assignments.length === 1 ? "Assignment" : "Assignments"}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
              {daysServed} {daysServed === 1 ? "Day" : "Days"} Served
            </span>
            {selectedToday && (
              <span className="inline-flex h-7 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800">
                Selected Today
              </span>
            )}
          </div>

          <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Student academic details">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "assignments"}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${tab === "assignments" ? "bg-white text-sky-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              onClick={() => setTab("assignments")}
            >
              Assignments
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${tab === "history" ? "bg-white text-sky-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              onClick={() => setTab("history")}
            >
              History
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {drawerError && <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span>{drawerError}</span><button type="button" onClick={() => setDrawerError("")} className="text-xs font-bold">Dismiss</button></div>}
          {/* ASSIGNMENTS TAB */}
          {tab === "assignments" && (
            <>
              <section className="mb-5 rounded-xl bg-slate-100/70 p-3">
                <h4 className="mb-3 px-1 font-semibold text-slate-950">Assignments</h4>
                {assignments.length === 0 && (
                  <div className="text-sm text-slate-500">No active assignments.</div>
                )}
                <ul className="space-y-3">
                  {assignments.map(t => {
                    const current = t.state || "not_started";
                    return (
                      <li
                        key={t.id}
                        className={`rounded-xl border border-l-4 border-slate-200 bg-white p-3 text-sm shadow-sm ${getSubjectBorderTone(t.subject)}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-bold text-slate-950">
                              {t.title || "Untitled Task"}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSubjectTone(t.subject)}`}>
                                {formatSubjectLabel(t.subject || "ELA")}
                              </span>
                              {(t.teacher || t.assignedAt) && (
                                <span className="text-xs leading-5 text-slate-500">
                                  {t.teacher ? `Assigned by ${t.teacher}` : "Assigned"}
                                  {t.assignedAt ? ` · ${formatMDY(t.assignedAt)}` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          {saving[t.id] && (
                            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              Saving…
                            </span>
                          )}
                        </div>

                        {t.notes && (
                          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Academic Note</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-700">{t.notes}</p>
                          </div>
                        )}

                        <div className="mt-2 flex items-end gap-3 border-t border-slate-100 pt-2">
                          <label className="min-w-0 flex-1">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                              value={current}
                              onChange={e => handleChangeTaskState(t.id, e.target.value)}
                            >
                              {TASK_STATE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="mb-0.5 shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                            title="Cancel assignment"
                            onClick={() => handleCancelTask(t.id)}
                          >
                            Cancel Assignment
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-2 font-semibold text-slate-950">Recent Attendance</h4>
                {attendance.length === 0 && (
                  <div className="text-sm text-slate-500">No attendance yet.</div>
                )}
                <ul className="space-y-1">
                  {attendance.map((a, idx) => (
                    <li key={idx} className="text-sm text-slate-700">
                      {formatMDY(a.date)} {a.room ? `• ${a.room}` : ""} {(a.byName || a.by) ? `• by ${a.byName || formatRecorder(a.by)}` : ""}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                <h4 className="font-semibold text-slate-950">Remove from Academic</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Cancels all active assignments for this student and removes them from today&apos;s session.
                </p>
                <button
                  type="button"
                  onClick={handleRemoveStudent}
                  className="mt-3 inline-flex h-9 items-center rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Remove from Academic
                </button>
              </section>
            </>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-950">Days Served</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Recent Academic Session Attendance</p>
                  </div>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-2.5 text-sm font-bold text-sky-800">
                    {histAtt.items.length}
                  </span>
                </div>
                {histAtt.error && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{histAtt.error}</div>
                )}
                {histAtt.loading && histAtt.items.length === 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm font-medium text-slate-500">Loading Attendance…</div>
                )}
                {histAtt.items.length === 0 && !histAtt.loading && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No attendance yet.</div>
                )}
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {histAtt.items.map(a => (
                    <li key={a.id} className="flex items-center justify-between gap-3 bg-white px-3 py-3 text-sm">
                      <span className="font-semibold text-slate-900">{formatMDY(a.date)}</span>
                      <span className="text-right text-xs text-slate-500">
                        {[a.room, (a.byName || a.by) ? `Recorded by ${a.byName || formatRecorder(a.by)}` : ""].filter(Boolean).join(" · ")}
                      </span>
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

              <div className="rounded-xl bg-slate-100/70 p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <h4 className="font-semibold text-slate-950">Completed Tasks</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Finished Academic Work</p>
                  </div>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-sm font-bold text-emerald-800">
                    {histTasks.items.length}
                  </span>
                </div>
                {histTasks.error && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{histTasks.error}</div>
                )}
                {histTasks.loading && histTasks.items.length === 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm font-medium text-slate-500">Loading Completed Tasks…</div>
                )}
                {histTasks.items.length === 0 && !histTasks.loading && !histTasks.error && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">No completed tasks yet.</div>
                )}
                <ul className="space-y-3">
                  {histTasks.items.map(h => (
                    <li
                      key={h.id}
                      className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 text-sm shadow-sm ${getSubjectBorderTone(h.subject)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-bold text-slate-950">
                            {h.title || "Untitled Task"}
                          </div>
                          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getSubjectTone(h.subject)}`}>
                            {formatSubjectLabel(h.subject || "ELA")}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Completed</span>
                          <div className="mt-1.5 text-xs font-medium text-slate-500">{formatMDY(h.completedAt)}</div>
                        </div>
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
