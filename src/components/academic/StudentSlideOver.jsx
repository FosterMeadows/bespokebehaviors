import { useContext, useState, useRef, useEffect } from "react";
import { AuthContext } from "../../AuthContext.jsx";
import { doc, onSnapshot, query, collection, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import {
  listAttendanceByStudent,
  listCompletedTasksByStudent,
  archiveCompletedTask,
  cancelTask,
  updateTaskState
} from "../../services/academic";
import { createPortal } from "react-dom";
import {
  formatStudentDetail,
  academicStatusOptionValue,
  getSubjectBorderTone,
  getSubjectTone,
  formatSubjectLabel,
  ACADEMIC_TASK_STATUS_OPTIONS
} from "../../utils/academicPresentation";

export function StudentSlideOver({ open, studentId, daysServed = 0, selectedToday = false, onClose, onRemoveStudent, onConfirm }) {
  const { user } = useContext(AuthContext);

  const [assignments, setAssignments] = useState([]);
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

    return () => unsubT();
  }, [open, studentId, tab]);

  async function handleRemoveStudent() {
    const removed = await onRemoveStudent?.(studentId);
    if (removed) onClose();
  }

  async function handleChangeTaskState(taskId, nextState) {
    if (!taskId || !nextState || saving[taskId]) return;
    const task = assignments.find((item) => item.id === taskId);
    if (nextState === "canceled") {
      const confirmed = await onConfirm?.({
        title: "Remove this assignment?",
        description: `${task?.title || "This assignment"} will leave active assignments and will not be marked Completed.`,
        confirmLabel: "Remove assignment",
        tone: "danger"
      });
      if (!confirmed) {
        setAssignments(list => [...list]);
        return;
      }
    }
    if (nextState === "completed") {
      const confirmed = await onConfirm?.({
        title: "Complete this assignment?",
        description: `${task?.title || "This assignment"} will move out of the active backlog and into completed history.`,
        confirmLabel: "Mark completed",
        tone: "default"
      });
      if (!confirmed) {
        setAssignments(list => [...list]);
        return;
      }
    }
    const prev = assignments;
    setAssignments(list => list.map(t => (t.id === taskId ? { ...t, state: nextState } : t)));
    setSaving(s => ({ ...s, [taskId]: true }));
    try {
      if (nextState === "completed") {
        await archiveCompletedTask(taskId, user?.uid || null);
      } else if (nextState === "canceled") {
        await cancelTask(taskId, "", { uid: user?.uid || "", name: user?.displayName || "" });
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
                    const current = academicStatusOptionValue(t.state);
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

                        <div className="mt-2 border-t border-slate-100 pt-2">
                          <label className="min-w-0 flex-1">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                              value={current}
                              disabled={!!saving[t.id]}
                              onChange={e => handleChangeTaskState(t.id, e.target.value)}
                            >
                              {ACADEMIC_TASK_STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                <h4 className="font-semibold text-slate-950">Remove from Academic</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Removes all active assignments without marking them Completed, and removes this student from today&apos;s session.
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
