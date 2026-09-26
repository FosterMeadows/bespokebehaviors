import { useContext, useMemo, useState, useRef, useEffect } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { canUseAcademic, getAllowedGradeLevels, isSchoolwide, canViewStudent } from "../utils/access";
import {
  ACADEMIC_SESSION_LANES,
  academicLaneDocId,
  listenTodayAcademicSession,
  addStudentToTodayAcademicSession,
  removeStudentFromTodayAcademicSession,
  addToDeck,
  removeFromDeck,
  recordTodayAcademicAttendance,
  endTodayAcademicSession,
  undoTodayAcademicAttendance,
  dismissStudentFromAR,
  addTasks,
  startTodayAcademicSession
} from "../services/academic";
import { query, collection, orderBy, where, onSnapshot, doc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { todayKey } from "../utils/date";
import { BookOpenCheck, Undo2 } from "lucide-react";
import { WorkspaceStatus, AcademicSuccessToast, ConfirmationDialog } from "../components/academic/AcademicFeedback.jsx";
import { LiveGrid } from "../components/academic/LiveGrid.jsx";
import { SetupLayout } from "../components/academic/SetupLayout.jsx";
import { StudentSlideOver } from "../components/academic/StudentSlideOver.jsx";

// -------------------------------------------------
// AcademicDashboard — Setup (strip + add + waiting list) and Live (student workbench)
// -------------------------------------------------

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
        ? `End With ${unmarkedStudentIds.length} Unmarked ${unmarkedStudentIds.length === 1 ? "Student" : "Students"}?`
        : "End This Academic Session?",
      description: unmarkedStudentIds.length > 0
        ? `${unmarkedStudentIds.map(sid => studentsMap[sid]?.displayName || "Student").join(", ")} will be recorded as ${unmarkedStudentIds.length === 1 ? "a No Show" : "No Shows"}. Attendance and assignments will remain unchanged.`
        : `This closes today’s session and clears all ${deckItems.length} ${deckItems.length === 1 ? "student" : "students"} from the roster. Attendance and assignments will remain unchanged.`,
      confirmLabel: "End & Clear Session",
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
      description: `This removes ${activeCount} active ${activeCount === 1 ? "assignment" : "assignments"} without marking them Completed, and removes the student from today's session roster. Attendance history is preserved.`,
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
      {/* Planning and roster-management navigation */}
      {mode !== "live" && <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
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
      </header>}

      {mode !== "live" && availableLanes.length > 1 && <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" aria-label="Academic session lanes">
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
      {mode !== "live" && activeLane.grade === "6" && (
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
          currentUser={user}
          readOnly={isDevOwner}
          onConfirm={requestConfirmation}
          onManageRoster={() => setMode("setup")}
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
