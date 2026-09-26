import { useState, useEffect } from "react";
import { archiveCompletedTask, cancelTask, updateTaskState } from "../../services/academic";
import { ChevronRight, Check } from "lucide-react";
import {
  formatStudentDetail,
  getSubjectTone,
  formatSubjectLabel,
  academicStatusOptionValue,
  ACADEMIC_TASK_STATUS_OPTIONS
} from "../../utils/academicPresentation";
import { StudentTypeahead } from "./StudentTypeahead.jsx";

export function LiveGrid({
  laneLabel,
  studentsMap,
  studentsList,
  deckItems,
  attendanceCounts,
  attendanceToday,
  tasks,
  currentUser,
  readOnly,
  onConfirm,
  onManageRoster,
  onMarkAllPresent,
  onEndSession,
  onMarkPresent,
  onDismissAndPresent,
  onAddStudent,
  onOpenDrawer
}) {
  const presentCount = deckItems.filter((sid) => attendanceToday[sid]).length;
  const allPresent = deckItems.length > 0 && presentCount === deckItems.length;
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});
  const [savingTasks, setSavingTasks] = useState({});
  const [workError, setWorkError] = useState("");
  const selectedStudent = selectedStudentId ? studentsMap[selectedStudentId] : null;
  const selectedTasks = tasks.filter(task =>
    task.studentId === selectedStudentId && task.active && task.state !== "completed" && task.state !== "canceled"
  );

  useEffect(() => {
    if (!deckItems.includes(selectedStudentId)) setSelectedStudentId(deckItems[0] || null);
  }, [deckItems, selectedStudentId]);

  useEffect(() => {
    setStatusOverrides(current => Object.fromEntries(Object.entries(current).filter(([taskId, state]) => {
      const task = tasks.find(item => item.id === taskId);
      return task && task.state !== state;
    })));
  }, [tasks]);

  async function changeTaskState(task, nextState) {
    if (!task?.id || !nextState || readOnly || savingTasks[task.id]) return;
    if (nextState === "canceled") {
      const confirmed = await onConfirm?.({
        title: "Remove This Assignment?",
        description: `${task.title || "This assignment"} will leave the active backlog and will not be marked Completed.`,
        confirmLabel: "Remove Assignment",
        tone: "danger"
      });
      if (!confirmed) return;
    }
    if (nextState === "completed") {
      const confirmed = await onConfirm?.({
        title: "Complete This Assignment?",
        description: `${task.title || "This assignment"} will move out of the active backlog and into completed history.`,
        confirmLabel: "Mark Completed",
        tone: "default"
      });
      if (!confirmed) return;
    }
    setWorkError("");
    setStatusOverrides(current => ({ ...current, [task.id]: nextState }));
    setSavingTasks(current => ({ ...current, [task.id]: true }));
    try {
      if (nextState === "completed") await archiveCompletedTask(task.id, currentUser?.uid || null);
      else if (nextState === "canceled") await cancelTask(task.id, "", {
        uid: currentUser?.uid || "",
        name: currentUser?.displayName || ""
      });
      else await updateTaskState(task.id, nextState, {
        uid: currentUser?.uid || "",
        name: currentUser?.displayName || ""
      });
    } catch {
      setWorkError("The assignment could not be saved. Try again.");
      setStatusOverrides(current => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    } finally {
      setSavingTasks(current => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-base font-bold text-slate-950">{laneLabel} Session</h2>
            <button type="button" onClick={onManageRoster} className="text-xs font-semibold text-sky-800 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-400">
              Manage roster &amp; lanes
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">
              {presentCount} / {deckItems.length} Present
            </span>
            <span className="text-[13px] text-slate-600">Attendance does not complete assignments.</span>
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
            title="Mark Everyone On Deck Present"
          >
            {allPresent ? "Everyone Present" : "Mark Everyone Present"}
          </button>
          <button
            type="button"
            onClick={onEndSession}
            disabled={deckItems.length === 0}
            className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 sm:ml-2 hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-45"
            title="End the session and clear today's roster"
          >
            End &amp; Clear Session
          </button>
        </div>
      </div>

      {deckItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <div className="text-sm font-semibold text-slate-800">No Students On Deck</div>
          <div className="mt-1 text-sm text-slate-600">Return to setup and add students to On Deck before starting a session.</div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.5fr)]">
          <section aria-label="Session Students" className="min-w-0 self-start overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70">
            <div className="flex items-center justify-between rounded-t-lg border-b border-slate-200 px-3 py-2.5">
              <h3 className="text-sm font-bold text-slate-900">Students</h3>
              <span className="text-xs font-semibold text-slate-600">{deckItems.length} on roster</span>
            </div>
            <ul className="divide-y divide-slate-200">
              {deckItems.map(sid => {
                const student = studentsMap[sid] || {};
                const activeTasks = tasks.filter(task =>
                  task.studentId === sid && task.active && task.state !== "completed" && task.state !== "canceled"
                );
                const selected = sid === selectedStudentId;
                const present = !!attendanceToday[sid];
                return (
                  <li key={sid} className={`flex items-center gap-2 border-l-4 p-2 last:rounded-b-lg ${selected ? "border-l-sky-400 bg-sky-50 ring-1 ring-inset ring-sky-100" : "border-l-transparent bg-white"}`}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setSelectedStudentId(sid); setWorkError(""); }}
                      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${selected ? "text-slate-950" : "text-slate-900 hover:bg-slate-50"}`}
                    >
                      <span className="flex items-center gap-1 text-sm font-bold">
                        <span className="min-w-0 truncate">{student.displayName || sid}</span>
                        {selected && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden="true" />}
                      </span>
                      <span className="block truncate text-[13px] text-slate-600">
                        {student.homeroom || `Grade ${student.grade || ""}`} · {activeTasks.length} {activeTasks.length === 1 ? "Assignment" : "Assignments"}
                      </span>
                    </button>
                    {present ? (
                      <span className="inline-flex h-9 w-28 shrink-0 items-center justify-center gap-1 rounded-md border border-transparent bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Present
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onMarkPresent(sid)}
                        className="inline-flex h-9 w-28 shrink-0 items-center justify-center rounded-md border border-sky-300 bg-white px-2 text-xs font-semibold text-sky-800 hover:border-sky-400 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        Mark Present
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Selected Student Work" className="min-w-0 rounded-lg border-t border-slate-200 bg-slate-50 p-3 sm:p-4 lg:sticky lg:top-20 lg:self-start lg:border-l lg:border-t-0">
            {selectedStudentId && (
              <div key={selectedStudentId} className="academic-step-in">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="min-w-0">
                    <p className="mb-0.5 text-xs font-semibold text-slate-600">Selected student</p>
                    <h3 className="text-lg font-bold text-slate-950">{selectedStudent?.displayName || selectedStudentId}</h3>
                    <p className="text-sm text-slate-600">{formatStudentDetail(selectedStudent?.grade, selectedStudent?.homeroom) || "Student"}</p>
                    <p className="mt-1 text-[13px] font-medium text-slate-600">
                      {selectedTasks.length} active {selectedTasks.length === 1 ? "assignment" : "assignments"} · {attendanceCounts[selectedStudentId] || 0} {attendanceCounts[selectedStudentId] === 1 ? "day" : "days"} served
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${attendanceToday[selectedStudentId] ? "bg-emerald-50 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {attendanceToday[selectedStudentId] ? "Present today" : "Not marked present"}
                    </span>
                    <button type="button" onClick={() => onOpenDrawer(selectedStudentId)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Full details
                    </button>
                  </div>
                </div>

                {workError && <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{workError}</div>}
                <div className="mt-3 space-y-3">
                  {selectedTasks.length === 0 && <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-600">No active assignments for this student.</p>}
                  {selectedTasks.map(task => (
                    <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="min-w-0 flex-1 text-sm font-bold text-slate-950">{task.title || "Untitled Task"}</h4>
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${getSubjectTone(task.subject)}`}>
                          {formatSubjectLabel(task.subject || "ELA")}
                        </span>
                      </div>
                      {task.teacher && <p className="mt-1 text-[13px] text-slate-600">Assigned by {task.teacher}</p>}
                      {task.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{task.notes}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[13px] font-semibold text-slate-600">Work status</span>
                          <select
                            value={academicStatusOptionValue(statusOverrides[task.id] || task.state)}
                            disabled={!!savingTasks[task.id] || readOnly}
                            onChange={event => changeTaskState(task, event.target.value)}
                            className="h-10 w-44 max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-60"
                          >
                            {ACADEMIC_TASK_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        {savingTasks[task.id] && <span role="status" className="text-xs font-semibold text-slate-600">Saving…</span>}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="mt-4 border-t border-slate-200 pt-3 text-right">
                  <button type="button" onClick={() => onDismissAndPresent(selectedStudentId)} className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white hover:text-red-700">
                    Remove from session
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

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
