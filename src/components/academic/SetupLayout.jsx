import { useState, useMemo, useId, useRef, useEffect } from "react";
import { MAX_TASK_BATCH_SIZE } from "../../services/academic";
import { X, Search, ChevronRight, Check, Copy } from "lucide-react";
import { StudentTypeahead } from "./StudentTypeahead.jsx";
import { AcademicSuccessToast } from "./AcademicFeedback.jsx";
import {
  formatSubjectLabel,
  formatStudentDetail,
  formatOldestWorkAge,
  getSubjectTone
} from "../../utils/academicPresentation";
import { Avatar } from "./Avatar.jsx";

export function SetupLayout({
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
      <section className="order-3 rounded-lg border border-slate-200 border-t-4 border-t-sky-500 bg-slate-50/70 p-4 xl:col-start-1 xl:row-start-2">
        <div className={addWorkOpen ? "mb-3 flex flex-wrap items-start justify-between gap-2" : "flex flex-wrap items-center justify-between gap-3"}>
          <div>
            <h2 className="text-base font-bold text-slate-950">Add Work</h2>
            <p className="mt-1 text-sm text-slate-600">
              {addWorkOpen ? "Who needs to make up what?" : "Add academic work when a student needs a new makeup task."}
            </p>
          </div>
          {addWorkOpen ? (
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              onClick={() => setAddWorkOpen(false)}
            >
              Collapse
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              onClick={() => setAddWorkOpen(true)}
            >
              + Add Work
            </button>
          )}
        </div>

        {!addWorkOpen && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs font-semibold">
            <span className="text-slate-600"><strong className="mr-1 text-slate-800">{byStudent.length}</strong> students with work</span>
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">
              <strong className="mr-1">{deckItems.length}</strong> selected today
            </span>
          </div>
        )}

        {addWorkOpen && (
        <form
          onSubmit={onCreateTask}
          className="space-y-3"
        >
          {/* Row 1: Student name picker */}
          <div className="grid grid-cols-1">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-sm font-semibold text-slate-800">Search students</label>
              <span className="text-xs font-medium text-slate-600">{taskForm.studentIds.length}/{MAX_TASK_BATCH_SIZE} selected</span>
            </div>
            {taskForm.studentIds.length > 0 && (
              <div className="mb-2 space-y-2" aria-label="Selected students">
                {taskForm.studentIds.map(studentId => {
                  const student = studentsMap[studentId] || {};
                  const studentName = student.displayName || studentId;
                  return (
                    <div key={studentId} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white px-3 py-2">
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
              inputClassName="!px-3 !py-2 !text-[14px] !shadow-none placeholder:!text-slate-500"
              dropdownClassName=""
            />
            {taskForm.studentIds.length >= MAX_TASK_BATCH_SIZE && (
              <p className="mt-1.5 text-xs font-medium text-slate-600">Maximum {MAX_TASK_BATCH_SIZE} students per bulk assignment.</p>
            )}
          </div>

          {/* Row 2: Subject + Assignment */}
          <div className="grid grid-cols-1 gap-3">
            {/* Subject */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">Subject</label>
              <div className="relative">
                <select
                  className="appearance-none w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 py-2 text-[14px]
                             focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                  value={taskForm.subject}
                  onChange={e => setTaskForm(tf => ({ ...tf, subject: e.target.value }))}
                >
                  <option value="ELA">ELA</option>
                  <option value="Math">Math</option>
                  <option value="Sci">Science</option>
                  <option value="SS">Social Studies</option>
                </select>
              </div>
            </div>

            {/* Assignment name */}
            <div>
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">Assignment name</label>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px]
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
              <label className="text-sm font-semibold text-slate-800 mb-1.5 block">
              Academic note
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] min-h-[76px]
                         placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
              placeholder="What should the academic host know?"
              value={taskForm.notes}
              onChange={e => setTaskForm(tf => ({ ...tf, notes: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-600">
              Be specific about what is missing or where help is needed. Students don’t see this.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 border-t border-slate-200 pt-3">
            <div className="space-y-1 text-xs leading-4 text-slate-600">
              {(taskForm.studentIds.length === 0 || !taskForm.title.trim()) && (
                <p>{taskForm.studentIds.length === 0 ? "Choose at least one student to continue." : "Enter an assignment name."}</p>
              )}
              <p>Assigning as {taskForm.teacher || "current teacher"}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={clearTaskForm}
            >
              Clear
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
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
    <article className="group relative grid min-h-20 grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 transition-colors last:border-b-0 hover:bg-sky-50/40 xl:grid-cols-[minmax(10rem,0.9fr)_minmax(12rem,1.35fr)_minmax(9rem,0.75fr)_8rem]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open details for ${name}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      />

      <div className="pointer-events-none relative z-10 col-start-1 row-start-1 min-w-0">
        <div className="flex items-center gap-1 text-[15px] font-bold leading-tight text-slate-950 group-hover:text-sky-800">
          <span className="truncate">{name}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-sky-700" aria-hidden="true" />
        </div>
        <div className="mt-0.5 truncate text-[13px] font-medium text-slate-600">{studentDetail || "Student"}</div>
      </div>

      <div className="pointer-events-none relative z-10 col-start-1 row-start-2 flex min-w-0 flex-wrap gap-1.5 xl:col-start-2 xl:row-start-1">
        {subjectEntries.slice(0, 4).map(([subject, count]) => (
          <span key={subject} className={`inline-flex h-7 min-w-28 items-center justify-between gap-2 rounded-md border px-2 text-xs font-semibold ${getSubjectTone(subject)}`}>
            {formatSubjectLabel(subject)} <span className="ml-1.5 font-bold opacity-80">{count}</span>
          </span>
        ))}
        {subjectEntries.length > 4 && (
          <span className="text-xs font-semibold text-slate-500">+{subjectEntries.length - 4} subjects</span>
        )}
      </div>

      <div className="pointer-events-none relative z-10 col-start-1 row-start-3 flex flex-col gap-0.5 text-[13px] tabular-nums xl:col-start-3 xl:row-start-1">
        <span className="font-semibold text-slate-900">{oldestWorkAge}</span>
        <span className="font-medium text-slate-600">{days} {days === 1 ? "Day" : "Days"} Served</span>
      </div>

      <div className="relative z-20 col-start-2 row-span-3 row-start-1 flex self-center justify-end xl:col-start-4 xl:row-span-1">
        <button
          type="button"
          onClick={staged ? onUnstage : onStage}
          aria-label={staged ? "Remove from today's session" : undefined}
          title={staged ? "Remove from today's session" : undefined}
          className={`inline-flex h-10 w-32 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm font-semibold text-sky-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${staged ? "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100" : "border-sky-300 bg-white hover:border-sky-400 hover:bg-sky-50"}`}
        >
          {staged ? <>Selected <X size={14} aria-hidden="true" /></> : "Add to Session"}
        </button>
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
