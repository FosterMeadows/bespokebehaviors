import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  collection, onSnapshot, query, where, orderBy,
  doc, getDoc
} from "firebase/firestore";

import {
  addTask,
  ensureTodayDeck, addToDeck, removeFromDeck,
  markServedToday, updateTaskState, archiveCompletedTask
} from "../services/reteach";

import { todayKey } from "../utils/date";
import { dismissStudentFromAR, cancelTask } from "../services/reteach";
import useRandomPastel from "../hooks/useRandomPastel.js";
import { listAttendanceByStudent, listCompletedTasksByStudent } from "../services/reteach";
import { createPortal } from "react-dom";

// -------------------------------------------------
// ReteachDashboard — Setup (strip + add + waiting list) and Live (wrapping grid)
// -------------------------------------------------
export default function ReteachDashboard() {
  const { user } = useContext(AuthContext);

  const [ownerOk, setOwnerOk] = useState(false);
  const [ownerChecked, setOwnerChecked] = useState(false); // prevent false "Access denied" flash

  const [tasks, setTasks] = useState([]);                // active tasks
  const [deckItems, setDeckItems] = useState([]);        // studentId[] for today
  const [attendanceCounts, setAttendanceCounts] = useState({}); // sid -> integer days served
  const [drawer, setDrawer] = useState({ open: false, studentId: null });

  // UI mode: "setup" | "live"
  const [mode, setMode] = useState(() => localStorage.getItem("arMode") || "setup");
  useEffect(() => { localStorage.setItem("arMode", mode); }, [mode]);

  // Students: map + list for picker
  const [studentsMap, setStudentsMap] = useState({});    // sid -> student doc
  const [studentsList, setStudentsList] = useState([]);  // [{id,name,homeroom,grade}]

  // New Task form
  const [taskForm, setTaskForm] = useState({ studentId: "", subject: "ELA", title: "", teacher: "",  notes: ""});
  const [justAddedMsg, setJustAddedMsg] = useState("");  // confirmation text after add

  // Verify owner (no rule changes; just adds loading gate to avoid false deny)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user) { if (mounted) setOwnerChecked(true); return; }
        const snap = await getDoc(doc(db, "app", "meta"));
        if (!mounted) return;
        setOwnerOk(snap.exists() && snap.data().ownerUid === user.uid);
        setOwnerChecked(true);
      } catch {
        if (mounted) setOwnerChecked(true);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  // Subscribe: students (names for UI, picker)
  useEffect(() => {
    if (!ownerOk) return;
    const qStu = query(collection(db, "students"), orderBy("displayName", "asc"));
    const unsub = onSnapshot(
      qStu,
      snap => {
        const map = {};
        const list = [];
        for (const d of snap.docs) {
          const s = { id: d.id, ...d.data() };
          map[s.id] = s;
          list.push({
            id: s.id,
            name: s.displayName || s.id,
            homeroom: s.homeroom || "",
            grade: s.grade || ""
          });
        }
        setStudentsMap(map);
        setStudentsList(list);
      },
      err => console.error("[AR] students listener error", err?.code, err?.message)
    );
    return () => unsub();
  }, [ownerOk]);

  // Subscribe: active tasks (for pending counts) with fallback
  useEffect(() => {
    if (!ownerOk) return;
    const coll = collection(db, "tasks");
    const q1 = query(coll, where("active", "==", true), orderBy("lastUpdated", "desc"));

    let primaryUnsub = null;
    let fallbackUnsub = null;

    primaryUnsub = onSnapshot(
      q1,
      snap => {
        const t = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTasks(t);
      },
      err => {
        console.error("[AR] tasks primary query failed", err?.code, err?.message);
        if (primaryUnsub) { primaryUnsub(); primaryUnsub = null; }
        const q2 = query(coll, where("active", "==", true));
        fallbackUnsub = onSnapshot(
          q2,
          snap2 => {
            const t2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
            setTasks(t2);
          },
          err2 => console.error("[AR] tasks fallback query failed", err2?.code, err2?.message)
        );
      }
    );

    return () => {
      if (primaryUnsub) primaryUnsub();
      if (fallbackUnsub) fallbackUnsub();
    };
  }, [ownerOk]);

  // Ensure today's deck doc + subscribe
  useEffect(() => {
    if (!ownerOk || !user) return;
    (async () => { await ensureTodayDeck(user.uid); })();
    const ref = doc(db, "deck", todayKey());
    const unsub = onSnapshot(
      ref,
      snap => { setDeckItems(snap.exists() ? (snap.data().items || []) : []); },
      err => console.error("[AR] deck listener error", err?.code, err?.message)
    );
    return () => unsub();
  }, [ownerOk, user]);

  // Subscribe: attendance (days served counts)
  useEffect(() => {
    if (!ownerOk) return;
    const coll = collection(db, "attendance");
    const q1 = query(coll, orderBy("date", "desc"));
    const unsub = onSnapshot(
      q1,
      snap => {
        const counts = {};
        for (const d of snap.docs) {
          const r = d.data();
          if (!r.studentId || !r.date) continue;
          if (!counts[r.studentId]) counts[r.studentId] = new Set();
          counts[r.studentId].add(r.date);
        }
        const flat = {};
        for (const [sid, setDates] of Object.entries(counts)) flat[sid] = setDates.size;
        setAttendanceCounts(flat);
      },
      err => console.error("[AR] attendance listener error", err?.code, err?.message)
    );
    return () => unsub();
  }, [ownerOk]);

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
  if (!ownerChecked) return <div className="p-4">Loading…</div>;   // stops false deny/flicker
  if (!ownerOk) return <div className="p-4">Access denied.</div>;

  // Actions
  async function handleDeckToggle(studentId, on) {
    if (on) await addToDeck(studentId);
    else await removeFromDeck(studentId);
  }

  // LIVE MODE: record attendance only; keep on deck
  async function handleMarkPresent(studentId) {
    try {
      await markServedToday(studentId, user.uid);
    } catch (e) {
      console.error("[AR] markServedToday failed", e);
      alert("Failed to mark present.");
    }
  }

  // LIVE MODE: record attendance and remove from today's deck
  async function handleDismissAndPresent(studentId) {
    try {
      await markServedToday(studentId, user.uid);
      await removeFromDeck(studentId);
    } catch (e) {
      console.error("[AR] dismiss+present failed", e);
      alert("Failed to dismiss.");
    }
  }

  // Bulk present (no removal) — parallelized
  async function handleBulkMarkPresent() {
    const sids = deckItems;
    try {
      await Promise.all(sids.map(sid => markServedToday(sid, user.uid)));
    } catch (e) {
      console.warn("[AR] bulk present encountered errors", e);
      alert("Some attendance marks may have failed. Check logs.");
    }
  }

  // SETUP MODE dismiss (cancels tasks and removes from deck)
  async function handleDismissStudent(sid) {
    if (!sid) return;
    const ok = confirm("Remove this student from Needs AR? This cancels their active tasks.");
    if (!ok) return;
    try {
      await dismissStudentFromAR(sid, todayKey());
      await removeFromDeck(sid);
    } catch (e) {
      console.error("[AR] dismissStudentFromAR failed", e);
      alert("Failed to remove student from Needs AR.");
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
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
      setJustAddedMsg(`Added ${studentsMap[taskForm.studentId]?.displayName || "student"} to Needs AR.`);
      setTaskForm(tf => ({ ...tf, title: "", notes: "" }));
      setTimeout(() => setJustAddedMsg(""), 2000);
    } catch (e2) {
      console.error("[AR] addTask failed", e2);
      alert("Failed to create task.");
    }
  }

  // Quick add to DECK during live mode (no task required)
  async function handleQuickAddToDeck(studentId) {
    if (!studentId) return;
    try { await addToDeck(studentId); }
    catch (e) { console.error("[AR] quick add to deck failed", e); alert("Failed to add to deck."); }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">AR Tracker</h1>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm px-2 py-1 rounded-full border bg-sky-50 border-sky-200 text-sky-800">
            Today · {todayKey()}
          </span>
          {mode === "live" ? (
            <button
              onClick={() => setMode("setup")}
              className="px-3 py-1 border rounded hover:bg-gray-50"
              title="Return to Setup"
            >
              Return to Setup
            </button>
          ) : (
            <>
              <button
                onClick={() => setMode("live")}
                className="px-3 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-400"
                title="Start AR Session"
              >
                Start AR Session
              </button>
              <button
                onClick={handleBulkMarkPresent}
                className="px-3 py-1 border rounded hover:bg-gray-50"
                title="Mark present for everyone on deck"
              >
                Mark Present for On Deck
              </button>
            </>
          )}
        </div>
      </header>

      {mode === "live" ? (
        <LiveGrid
          studentsMap={studentsMap}
          deckItems={deckItems}
          attendanceCounts={attendanceCounts}
          tasks={tasks}
          onMarkPresent={handleMarkPresent}
          onDismissAndPresent={handleDismissAndPresent}
          onQuickAddToDeck={handleQuickAddToDeck}
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
          onDismiss={handleDismissStudent}
          onStartSession={() => setMode("live")}
        />
      )}

      <StudentSlideOver
        open={drawer.open}
        studentId={drawer.studentId}
        onClose={() => setDrawer({ open: false, studentId: null })}
      />
    </div>
  );
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
  onDismiss,
  onStartSession
}) {
  // Overlay starts ON every page load; once revealed, it stays open until refresh
  const [addRevealed, setAddRevealed] = useState(false);

  return (
    <div className="space-y-4">
      {/* Staged strip */}
      {deckItems.length > 0 && (
        <StageChipBar
          deckItems={deckItems}
          studentsMap={studentsMap}
          onUnstage={(sid) => onToggleDeck(sid, false)}
        />
      )}

      <section className="relative bg-sky-50 border border-sky-200 rounded-2xl p-4 shadow-sm overflow-hidden">
        <h2 className="font-medium mb-3">Add Student to AR</h2>

        {/* Form becomes three rows. Overlay still gates interaction. */}
        <form
          onSubmit={onCreateTask}
          className={`space-y-3 transition-opacity ${addRevealed ? "opacity-100" : "opacity-50 pointer-events-none select-none"}`}
          aria-hidden={!addRevealed}
        >
          {/* Row 1: Student name picker */}
          <div className="grid grid-cols-1">
            <label className="text-xs text-slate-600 mb-1 block">Student</label>
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
          <div className="md:flex md:gap-3 md:items-end space-y-3 md:space-y-0">
            {/* Subject */}
            <div className="md:w-2/12">
              <label className="text-xs text-slate-600 mb-1 block">Subject</label>
              <div className="relative">
                <select
                  className="appearance-none w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 py-2 text-[14px] shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                  value={taskForm.subject}
                  onChange={e => setTaskForm(tf => ({ ...tf, subject: e.target.value }))}
                >
                  <option value="ELA">ELA</option>
                  <option value="Math">Math</option>
                  <option value="Sci">Sci</option>
                  <option value="SS">SS</option>
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
            <div className="md:w-3/12">
              <label className="text-xs text-slate-600 mb-1 block">Assigning Teacher</label>
              <div className="relative">
                <select
                  className="appearance-none w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 py-2 text-[14px] shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                  value={taskForm.teacher || ""}
                  onChange={e => setTaskForm(tf => ({ ...tf, teacher: e.target.value }))}
                >
                  <option value="">Select Teacher</option>
                  <option value="Meadows">Mr. Meadows</option>
                  <option value="Davis">Mrs. Davis</option>
                  <option value="Martin">Ms. Martin</option>
                  <option value="Albaugh">Ms. Albaugh</option>
                  <option value="Luttrell">Mrs. Luttrell</option>
                  <option value="Hinzman">Mr. Hinzman</option>
                  <option value="Beeson">Ms. Beeson</option>
                  <option value="Uppercue">Ms. Uppercue</option>
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
            <div className="md:flex-[2]">
              <label className="text-xs text-slate-600 mb-1 block">Assignment name</label>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                placeholder="e.g., Argument essay draft"
                value={taskForm.title}
                onChange={e => setTaskForm(tf => ({ ...tf, title: e.target.value }))}
                required
              />
            </div>

            {/* Add button */}
            <div className="md:w-auto md:self-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm
                           focus:outline-none focus:ring-2 focus:ring-sky-400 w-full md:w-auto disabled:opacity-50"
                disabled={!taskForm.studentId || !taskForm.title}
                title="Add to Needs AR"
              >
                Add
              </button>
            </div>
          </div>

          {/* Row 3: Notes */}
          <div className="grid grid-cols-1">
            <label className="text-xs text-slate-600 mb-1 block">
              Any notes for the AR host?
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] shadow-sm min-h-[96px]
                         placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
              placeholder="Be specific: missing intro paragraph; needs conferencing on thesis; didn’t attempt questions 3–5; redo citing evidence."
              value={taskForm.notes}
              onChange={e => setTaskForm(tf => ({ ...tf, notes: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Notes are for the AR host only. Students don’t see this.
            </p>
          </div>
        </form>

        {justAddedMsg && (
          <div
            className="mt-2 text-sm px-2 py-1 rounded border bg-emerald-50 text-emerald-800 inline-block"
            aria-live="polite"
          >
            {justAddedMsg}
          </div>
        )}

        {/* Friendly overlay: tap to reveal */}
        {!addRevealed && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm"
            aria-label="Add student overlay"
          >
            <button
              type="button"
              onClick={() => setAddRevealed(true)}
              className="px-6 py-4 rounded-2xl border shadow-sm bg-white hover:bg-gray-50 text-lg font-semibold"
            >
              Add Student
            </button>
          </div>
        )}
      </section>

      {/* Students Waiting (neutral-tinted container) */}
      <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="font-medium">Students Waiting (Needs AR)</h2>

        {byStudent.length === 0 && (
          <div className="text-sm text-gray-500">No active tasks.</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {byStudent.map(([sid, list]) => (
            <SetupStudentCard
              key={sid}
              sid={sid}
              name={studentsMap[sid]?.displayName || sid}
              homeroom={studentsMap[sid]?.homeroom || ""}
              grade={studentsMap[sid]?.grade || ""}
              days={attendanceCounts[sid] || 0}
              pending={
                list.filter(
                  t => t.active && t.state !== "completed" && t.state !== "canceled"
                ).length
              }
              staged={deckItems.includes(sid)}
              onStage={() => onToggleDeck(sid, true)}
              onUnstage={() => onToggleDeck(sid, false)}
              onOpen={() => onOpenDrawer(sid)}
              onRemove={() => onDismiss(sid)}
            />
          ))}
        </div>

        <div className="flex justify-center pt-1">
          <button
            onClick={onStartSession}
            className="px-3 py-2 rounded bg-sky-600 text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-400"
            title="Start AR Session"
          >
            Start AR Session
          </button>
        </div>
      </section>

    </div>
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
  sid, name, homeroom, grade, days, pending, staged,
  onStage, onUnstage, onOpen, onRemove
}) {
  const tone = useRandomPastel(sid);
  const stop = (e) => e.stopPropagation();

  const handleOpen = () => onOpen?.();

  return (
    <div
      className="rounded-2xl border shadow-sm p-3 cursor-pointer select-none transition hover:shadow-md"
      style={{ background: tone.cardBg, borderColor: tone.border }}
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpen(); } }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight truncate" style={{ color: tone.text }}>
            {name}
          </div>
          <div className="text-xs text-gray-600 truncate">
            {homeroom ? homeroom : ""}{homeroom && grade ? " • " : ""}{grade ? `G${grade}` : ""}
          </div>
        </div>

        {/* Pills */}
        <div className="flex items-center gap-1.5">
          <Pill label="Days Served" value={days} size="lg" />
          <Pill label="Pending Tasks" value={pending} size="lg" kind={pending > 0 ? "warn" : "ok"} />
        </div>
      </div>

      {/* Footer actions — wrapper doesn’t swallow clicks; buttons do */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          className="h-10 px-4 rounded-full border bg-white/70 hover:bg-white text-slate-800 border-slate-300 text-sm"
          onClick={(e)=>{stop(e); onRemove();}}
          title="Remove from Needs AR"
        >
          Remove
        </button>

        {staged ? (
          <button
            className="h-10 px-5 rounded-full border bg-white/80 hover:bg-white text-slate-900 text-sm"
            onClick={(e)=>{stop(e); onUnstage();}}
            title="Unstage from today's deck"
          >
            Unstage
          </button>
        ) : (
          <button
            className="h-10 px-6 rounded-full bg-sky-600 text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-400 text-sm font-medium"
            onClick={(e)=>{stop(e); onStage();}}
            title="Stage for today's deck"
          >
            Stage
          </button>
        )}
      </div>
    </div>
  );
}


/* ===========================
   Live Mode Grid (wrapping)
   =========================== */
function LiveGrid({
  studentsMap,
  deckItems,
  attendanceCounts,
  tasks,
  onMarkPresent,
  onDismissAndPresent,
  onQuickAddToDeck,
  onOpenDrawer
}) {
  return (
    <div className="space-y-3">
      {/* Optional quick add: if you want it back, render InlineAdd here */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {deckItems.map((sid) => {
          const name = studentsMap[sid]?.displayName || sid;
          const subjCount = tasks.filter(t =>
            t.studentId === sid && t.active && t.state !== "completed" && t.state !== "canceled"
          ).length;

          return (
            <LiveStudentCard
              key={sid}
              name={name}
              sid={sid}
              daysServed={attendanceCounts[sid] || 0}
              pendingCount={subjCount}
              onOpen={() => onOpenDrawer(sid)}
              onMarkPresent={() => onMarkPresent(sid)}
              onDismissAndPresent={() => onDismissAndPresent(sid)}
            />
          );
        })}
      </div>

      {deckItems.length === 0 && (
        <div className="text-sm text-gray-500">No one on deck yet.</div>
      )}
    </div>
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
function LiveStudentCard({ name, sid, daysServed, pendingCount, onMarkPresent, onDismissAndPresent, onOpen }) {
  const stop = (e) => e.stopPropagation();

  return (
    <article
      className="rounded-2xl border shadow-sm p-3 bg-white cursor-pointer"
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold truncate">{name}</div>
          <div className="text-xs opacity-70">
            <span className="inline-block mr-2">Days: <b className="tabular-nums">{daysServed}</b></span>
            <span className="inline-block">Pending: <b className="tabular-nums">{pendingCount}</b></span>
          </div>
        </div>
        <button className="text-xs px-2 py-1 border rounded hover:bg-white" onClick={(e) => { stop(e); onOpen(); }}>
          Open
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          onClick={(e) => { stop(e); onMarkPresent(); }}
          title="Mark Present (M)"
        >
          Mark Present
        </button>
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
          onClick={(e) => { stop(e); onDismissAndPresent(); }}
          title="Dismiss + Present (D)"
        >
          Dismiss
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
function StudentSlideOver({ open, studentId, onClose }) {
  const { user } = useContext(AuthContext);

  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [saving, setSaving] = useState({});
  const [tab, setTab] = useState("assignments");
  const [servedJustNow, setServedJustNow] = useState(false);

  const [histAtt, setHistAtt] = useState({
    items: [], cursor: null, done: false, loading: false, error: null
  });
  const [histTasks, setHistTasks] = useState({
    items: [], cursor: null, done: false, loading: false, error: null
  });

  const [studentName, setStudentName] = useState("");
  const closeBtnRef = useRef(null);

  // Pastel palette keyed to student
  const tone = useRandomPastel(studentId || "default");

  // Helpers to produce consistent stronger accents in the same hue family
  const hsl = (s, l) => `hsl(${tone.hue}, ${s}%, ${l}%)`;
  const railColor       = hsl(50, 70);
  const buttonBg        = hsl(70, 45);
  const buttonHoverBg   = hsl(70, 40);
  const buttonText      = "#ffffff";
  const tabInactiveBg   = "#ffffff";
  const tabInactiveText = tone.text;
  const tabInactiveBor  = tone.border;
  const headingColor    = tone.text;
  const mutedText       = `color-mix(in oklab, ${tone.text} 65%, white)`;
  const chipText        = tone.text;

  const TASK_STATE_OPTIONS = [
    { value: "not_started",     label: "Hasn't Started" },
    { value: "needs_to_finish", label: "Needs to Finish" },
    { value: "in_progress",     label: "In Progress" },
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
      return `${m}.${d}.${y}`;
    } catch {
      return "—";
    }
  }

  const today = todayKey();
  const servedToday = useMemo(() => {
    return attendance?.some(a => String(a?.date) === today) || servedJustNow;
  }, [attendance, servedJustNow, today]);

  useEffect(() => {
    if (!open || !studentId) return;
    const ref = doc(db, "students", studentId);
    const unsub = onSnapshot(
      ref,
      snap => {
        const n = snap.exists() ? (snap.data().displayName || studentId) : studentId;
        setStudentName(n);
      },
      () => setStudentName(studentId)
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
      err => console.error("[AR] student tasks listener error", err?.code, err?.message)
    );

    const aq = query(collection(db, "attendance"), where("studentId", "==", studentId), orderBy("date", "desc"));
    const unsubA = onSnapshot(
      aq,
      snap => setAttendance(snap.docs.map(d => d.data())),
      err => console.error("[AR] student attendance listener error", err?.code, err?.message)
    );

    return () => { unsubT(); unsubA(); };
  }, [open, studentId, tab]);

  async function handleCancelTask(taskId) {
    if (!taskId) return;
    if (!confirm("Cancel this task? It will be removed from active lists.")) return;
    try { await cancelTask(taskId); }
    catch (e) { console.error("[AR] cancelTask failed", e); alert("Failed to cancel task."); }
  }

  async function handleChangeTaskState(taskId, nextState) {
    if (!taskId || !nextState) return;
    const prev = assignments;
    setAssignments(list => list.map(t => (t.id === taskId ? { ...t, state: nextState } : t)));
    setSaving(s => ({ ...s, [taskId]: true }));
    try {
      if (nextState === "completed") {
        await archiveCompletedTask(taskId, user?.uid || null);
      } else {
        await updateTaskState(taskId, nextState);
      }
    } catch (e) {
      alert("Failed to save task.");
      setAssignments(prev);
    } finally {
      setSaving(s => { const c = { ...s }; delete c[taskId]; return c; });
    }
  }

  async function handleMarkServedToday() {
    try {
      await markServedToday(studentId, user?.uid || null);
      setServedJustNow(true);
    } catch (e) {
      console.error("[AR] markServedToday failed", e);
      alert("Failed to mark present.");
    }
  }

  if (!open) return null;

  const todayLabel = formatMDY(today);

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Slide-over */}
      <aside
        className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-xl overflow-y-auto border-l-[4px]"
        style={{ borderLeftColor: railColor }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 pb-3 border-b bg-white"
          style={{ borderColor: tone.border }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border"
              style={{ background: tone.chipBg, color: chipText, borderColor: tone.border }}
            >
              {(studentName?.trim()?.[0] || "?").toUpperCase()}
            </div>
            <h3
              className="text-lg font-semibold mt-0 truncate"
              style={{ color: headingColor }}
            >
              {studentName || "Student"}
            </h3>
          </div>
          <button
            ref={closeBtnRef}
            className="border rounded px-2 py-1 bg-white hover:opacity-90"
            style={{ borderColor: tone.border, color: tone.text }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Attendance banner / CTA */}
          <div className="mb-3">
            {servedToday ? (
              <div
                className="text-xs px-3 py-2 rounded-lg border"
                style={{ background: tone.chipBg, color: tone.text, borderColor: tone.border }}
              >
                Present today ✓ {todayLabel}. Attendance recorded. Assignments remain until completed.
              </div>
            ) : (
              <button
                className="w-full text-sm px-4 py-3 rounded-lg font-semibold shadow-sm transition-colors"
                style={{ backgroundColor: buttonBg, color: buttonText }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = buttonHoverBg}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = buttonBg}
                onClick={handleMarkServedToday}
                title={`Count attendance for ${todayLabel}`}
              >
                Mark Present Today · {todayLabel}
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="mb-3 flex gap-2">
            <button
              className="px-3 py-1.5 rounded border transition-colors"
              style={
                tab === "assignments"
                  ? { backgroundColor: buttonBg, color: buttonText, borderColor: buttonBg }
                  : { backgroundColor: tabInactiveBg, color: tabInactiveText, borderColor: tabInactiveBor }
              }
              onClick={() => setTab("assignments")}
            >
              Assignments
            </button>
            <button
              className="px-3 py-1.5 rounded border transition-colors"
              style={
                tab === "history"
                  ? { backgroundColor: buttonBg, color: buttonText, borderColor: buttonBg }
                  : { backgroundColor: tabInactiveBg, color: tabInactiveText, borderColor: tabInactiveBor }
              }
              onClick={() => setTab("history")}
            >
              History
            </button>
          </div>

          {/* ASSIGNMENTS TAB */}
          {tab === "assignments" && (
            <>
              <section className="mb-4">
                <h4 className="font-medium mb-2" style={{ color: headingColor }}>Assignments</h4>
                {assignments.length === 0 && (
                  <div className="text-sm" style={{ color: mutedText }}>No active assignments.</div>
                )}
                <ul className="space-y-2">
                  {assignments.map(t => {
                    const current = t.state || "not_started";
                    return (
                      <li
                        key={t.id}
                        className="text-sm rounded-lg border p-2"
                        style={{ background: tone.cardBg, borderColor: tone.border }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate">
                            <div className="font-medium truncate" style={{ color: tone.text }}>
                              {t.title || "Untitled Task"}
                            </div>
                            <div className="text-xs" style={{ color: mutedText }}>
                              {t.subject || "ELA"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {saving[t.id] && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full border bg-white"
                                style={{ borderColor: tone.border, color: tone.text }}
                              >
                                Saving…
                              </span>
                            )}
                            <button
                              type="button"
                              className="text-[11px] px-2 py-0.5 rounded border bg-white hover:opacity-90"
                              style={{ borderColor: tone.border, color: tone.text }}
                              title="Cancel task"
                              onClick={() => handleCancelTask(t.id)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="block text-xs mb-1" style={{ color: tone.text }}>Task State</label>
                          <select
                            className="w-full rounded-md px-2 py-1 bg-white"
                            style={{ border: `1px solid ${tone.border}`, color: tone.text }}
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
                <h4 className="font-medium mb-2" style={{ color: headingColor }}>Recent Attendance</h4>
                {attendance.length === 0 && (
                  <div className="text-sm" style={{ color: mutedText }}>No attendance yet.</div>
                )}
                <ul className="space-y-1">
                  {attendance.map((a, idx) => (
                    <li key={idx} className="text-sm" style={{ color: tone.text }}>
                      {formatMDY(a.date)} {a.room ? `• ${a.room}` : ""} {a.by ? `• by ${a.by}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <section className="space-y-6">
              <div>
                <h4 className="font-medium mb-2" style={{ color: headingColor }}>Days Served</h4>
                {histAtt.items.length === 0 && !histAtt.loading && (
                  <div className="text-sm" style={{ color: mutedText }}>No attendance yet.</div>
                )}
                <ul className="space-y-1">
                  {histAtt.items.map(a => (
                    <li key={a.id} className="text-sm" style={{ color: tone.text }}>
                      {formatMDY(a.date)} {a.room ? `• ${a.room}` : ""} {a.by ? `• by ${a.by}` : ""}
                    </li>
                  ))}
                </ul>
                {!histAtt.done && (
                  <div className="mt-2">
                    <button
                      className="text-xs px-2 py-1 rounded border bg-white hover:opacity-90"
                      style={{ borderColor: tone.border, color: tone.text }}
                      disabled={histAtt.loading}
                      onClick={() => loadAttendancePage(false)}
                    >
                      {histAtt.loading ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium mb-2" style={{ color: headingColor }}>Completed Tasks</h4>
                {histTasks.items.length === 0 && !histTasks.loading && (
                  <div className="text-sm" style={{ color: mutedText }}>No completed tasks yet.</div>
                )}
                <ul className="space-y-2">
                  {histTasks.items.map(h => (
                    <li
                      key={h.id}
                      className="text-sm rounded-lg border p-2 bg-white"
                      style={{ borderColor: tone.border, color: tone.text }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate">
                          <div className="font-medium truncate" style={{ color: tone.text }}>
                            {h.title || "Untitled Task"}
                          </div>
                          <div className="text-xs" style={{ color: mutedText }}>
                            {h.subject || "ELA"}
                          </div>
                        </div>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full border bg-white"
                          style={{ borderColor: tone.border, color: tone.text }}
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
                      className="text-xs px-2 py-1 rounded border bg-white hover:opacity-90"
                      style={{ borderColor: tone.border, color: tone.text }}
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

          <section className="mt-6 text-xs" style={{ color: mutedText }}>
            <p>“Mark Present Today” records attendance for {todayLabel}. It does not complete assignments.</p>
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
}
