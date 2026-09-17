import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  History as HistoryIcon,
  MapPin,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useSearchParams } from "react-router";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { canUseAdmin } from "../utils/access";
import { ANALYTICS_FILTER_KEYS, filterBehaviorRecords } from "../utils/behaviorAnalytics.js";

function toDate(value) {
  if (!value) return null;
  const date = value?.toDate
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`)
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMillis(value) {
  return toDate(value)?.getTime() || 0;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "Date Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "Not Recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatStudentDetail(student) {
  if (!student) return "Student";
  const homeroom = String(student.homeroom || "").trim();
  return [student.grade ? `Grade ${student.grade}` : "", homeroom].filter(Boolean).join(" • ") || "Student";
}

function HistoryTab({ active, icon, children, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-400 ${
        active ? "bg-white text-sky-900 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      {React.createElement(icon, { className: "h-4 w-4", "aria-hidden": true })}
      {children}
    </button>
  );
}

function EmptyHistory({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function outcomePresentation(status) {
  if (status === "present") return { label: "Present", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (status === "removed") return { label: "Removed", tone: "border-slate-200 bg-slate-100 text-slate-600" };
  if (status === "no_show") return { label: "No Show", tone: "border-red-200 bg-red-50 text-red-800" };
  return { label: "Selected", tone: "border-sky-200 bg-sky-50 text-sky-800" };
}

function BehaviorHistory({ records, studentsMap, getTeacherLabel, loading }) {
  if (loading && records.length === 0) return <EmptyHistory>Loading Behavior History…</EmptyHistory>;
  if (records.length === 0) return <EmptyHistory>No served Behavior entries yet.</EmptyHistory>;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">Behavior History</h2>
        <p className="mt-0.5 text-sm text-slate-600">{records.length} Served {records.length === 1 ? "Entry" : "Entries"}</p>
      </div>
      <div className="divide-y divide-slate-200">
        {records.map(record => {
          const student = studentsMap[record.studentId];
          const studentName = record.studentName || student?.displayName || "Unknown Student";
          const servedWith = record.servedByName || getTeacherLabel(record.servedByUid);
          return (
            <article key={record.id} className="relative bg-white p-4 pl-5 transition hover:bg-sky-50/30">
              <div className="absolute bottom-0 left-0 top-0 w-1 bg-violet-400" aria-hidden="true" />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-slate-950">{record.context || "Behavior Reteach"}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-900">
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {studentName}
                    </span>
                    <span>{formatStudentDetail(student)}</span>
                    {record.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {record.location}
                      </span>
                    )}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Served
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {formatDateTime(record.servedAt || record.reteachDate)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-800">
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Served with {servedWith}
                </span>
              </div>

              {record.note && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Reteach Note</div>
                  <p className="mt-1 text-sm leading-6 text-slate-800">{record.note}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AcademicHistory({ sessions, studentsMap, getTeacherLabel, loading }) {
  if (loading && sessions.length === 0) return <EmptyHistory>Loading Academic Sessions…</EmptyHistory>;
  if (sessions.length === 0) return <EmptyHistory>No Academic Sessions have been recorded yet.</EmptyHistory>;

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-base font-bold text-slate-950">Academic Session History</h2>
        <p className="mt-0.5 text-sm text-slate-600">{sessions.length} {sessions.length === 1 ? "Session" : "Sessions"} Recorded</p>
      </div>
      {sessions.map((session, index) => {
        const roster = session.roster || [];
        const outcomes = session.outcomes || {};
        const outcomeCounts = roster.reduce((counts, studentId) => {
          const status = outcomes[studentId]?.status || "selected";
          counts[status] = (counts[status] || 0) + 1;
          return counts;
        }, {});
        const isLive = session.status === "live";
        return (
          <article key={session.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-slate-950">{formatDate(session.date || session.id)}</h3>
                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                    {session.laneLabel || "Legacy Session"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    Hosted by {session.hostName || getTeacherLabel(session.hostUid)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Started {formatDateTime(session.startedAt)}
                  </span>
                  {!isLive && session.endedAt && <span>Ended {formatDateTime(session.endedAt)}</span>}
                </div>
              </div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${isLive ? "border-sky-200 bg-sky-50 text-sky-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                {isLive ? "In Progress" : "Completed"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{roster.length} Rostered</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{outcomeCounts.present || 0} Present</span>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{outcomeCounts.removed || 0} Removed</span>
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">{outcomeCounts.no_show || 0} No Show{(outcomeCounts.no_show || 0) === 1 ? "" : "s"}</span>
            </div>

            <details open={index === 0} className="group">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                View Student Outcomes
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {roster.map(studentId => {
                  const student = studentsMap[studentId];
                  const outcome = outcomes[studentId] || { status: "selected" };
                  const presentation = outcomePresentation(outcome.status);
                  return (
                    <div key={studentId} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-slate-700">
                        {(student?.displayName || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-950">{student?.displayName || "Unknown Student"}</div>
                        <div className="truncate text-xs text-slate-500">
                          {formatStudentDetail(student)}
                          {outcome.updatedByName ? ` • Recorded by ${outcome.updatedByName}` : ""}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.tone}`}>{presentation.label}</span>
                    </div>
                  );
                })}
                {roster.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">No students were recorded in this session.</div>}
              </div>
            </details>
          </article>
        );
      })}
    </section>
  );
}

export default function HistoryPage() {
  const { user, profile } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") === "academic" ? "academic" : "behavior");
  const [studentsMap, setStudentsMap] = useState({});
  const [teachersMap, setTeachersMap] = useState({});
  const [behaviorRecords, setBehaviorRecords] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState({ behavior: true, academic: true });
  const [errors, setErrors] = useState({ behavior: "", academic: "" });

  useEffect(() => {
    if (!user) return undefined;
    const behaviorQuery = canUseAdmin(profile) ? collection(db, "behaviorReteaches") : null;
    const unsubs = [
      onSnapshot(query(collection(db, "students"), orderBy("displayName", "asc")), snap => {
        setStudentsMap(Object.fromEntries(snap.docs.map(item => [item.id, item.data()])));
      }),
      onSnapshot(collection(db, "teachers"), snap => {
        setTeachersMap(Object.fromEntries(snap.docs.map(item => [item.id, item.data()])));
      }),
      behaviorQuery && onSnapshot(behaviorQuery, snap => {
        setBehaviorRecords(snap.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .filter(record => record.status === "served"));
        setLoading(current => ({ ...current, behavior: false }));
      }, error => {
        console.error("[History] behavior", error);
        setErrors(current => ({ ...current, behavior: "Behavior History could not be loaded." }));
        setLoading(current => ({ ...current, behavior: false }));
      }),
      onSnapshot(collection(db, "academicSessions"), snap => {
        setSessions(snap.docs.map(item => ({ id: item.id, ...item.data() })));
        setLoading(current => ({ ...current, academic: false }));
      }, error => {
        console.error("[History] academic sessions", error);
        setErrors(current => ({ ...current, academic: "Academic Session History could not be loaded." }));
        setLoading(current => ({ ...current, academic: false }));
      })
    ].filter(Boolean);
    if (!behaviorQuery) setLoading(current => ({ ...current, behavior: false }));
    return () => unsubs.forEach(unsub => unsub());
  }, [profile, user]);

  const sortedBehavior = useMemo(() => [...behaviorRecords].sort(
    (a, b) => toMillis(b.servedAt || b.reteachDate) - toMillis(a.servedAt || a.reteachDate)
  ), [behaviorRecords]);

  const behaviorFilters = useMemo(() => Object.fromEntries(
    ANALYTICS_FILTER_KEYS.map(key => [key, searchParams.get(key) || ""])
  ), [searchParams]);

  const filteredBehavior = useMemo(() => Object.values(behaviorFilters).some(Boolean) ? filterBehaviorRecords(sortedBehavior, behaviorFilters) : sortedBehavior, [behaviorFilters, sortedBehavior]);

  const activeBehaviorFilters = Object.entries(behaviorFilters).filter(([, value]) => value);

  const clearBehaviorFilters = () => {
    const next = new URLSearchParams(searchParams);
    ANALYTICS_FILTER_KEYS.forEach(key => next.delete(key));
    setSearchParams(next);
  };

  const sortedSessions = useMemo(() => [...sessions].sort(
    (a, b) => toMillis(b.startedAt || b.date || b.id) - toMillis(a.startedAt || a.date || a.id)
  ), [sessions]);

  const getTeacherLabel = value => {
    if (!value) return "Unknown Staff Member";
    const teacher = teachersMap[value];
    if (teacher) return teacher.displayName || teacher.contactEmail || "Staff Member";
    if (/^[A-Za-z0-9_-]{20,}$/.test(String(value))) return "Staff Member";
    return String(value);
  };

  if (!user) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Sign in required.</div>;

  const activeError = errors[tab];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
            <HistoryIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Admin Workspace</div>
            <div className="mt-0.5 text-sm text-slate-600">Review served Behavior entries and daily Academic Sessions.</div>
          </div>
        </div>
        <div className="inline-flex self-start rounded-lg border border-slate-200 bg-slate-100 p-1 sm:self-auto" role="tablist" aria-label="History type">
          <HistoryTab active={tab === "behavior"} icon={ShieldCheck} onClick={() => setTab("behavior")}>Behavior</HistoryTab>
          <HistoryTab active={tab === "academic"} icon={BookOpenCheck} onClick={() => setTab("academic")}>Academic</HistoryTab>
        </div>
      </header>

      {activeError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{activeError}</div>
      ) : tab === "behavior" ? (
        <>
          {activeBehaviorFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span className="font-bold">Analytics drilldown:</span>
              {behaviorFilters.start && <span>From {formatDate(behaviorFilters.start)}</span>}
              {behaviorFilters.end && <span>Through {formatDate(behaviorFilters.end)}</span>}
              {behaviorFilters.grade && <span>Grade {behaviorFilters.grade}</span>}
              {behaviorFilters.location && <span>Location: {behaviorFilters.location}</span>}
              {behaviorFilters.context && <span>Category: {behaviorFilters.context}</span>}
              {behaviorFilters.teacher && <span>Assigned by: {behaviorFilters.teacher === "__unknown__" ? "Unknown assigning staff" : teachersMap[behaviorFilters.teacher]?.displayName || behaviorRecords.find(record => record.assignedByUid === behaviorFilters.teacher)?.assignedByName || "Staff member"}</span>}
              {behaviorFilters.student && <span>Student: {studentsMap[behaviorFilters.student]?.displayName || behaviorRecords.find(record => record.studentId === behaviorFilters.student)?.studentName || "Selected student"}</span>}
              {behaviorFilters.repeat === "1" && <span>Students with multiple served reteaches in this view</span>}
              {behaviorFilters.topStaff === "1" && <span>Five staff with the most served assignments in this view</span>}
              <span>{filteredBehavior.length} matching records</span>
              <button type="button" onClick={clearBehaviorFilters} className="ml-auto font-bold text-violet-700 hover:text-violet-950">Clear filters</button>
            </div>
          )}
          <BehaviorHistory records={filteredBehavior} studentsMap={studentsMap} getTeacherLabel={getTeacherLabel} loading={loading.behavior} />
        </>
      ) : (
        <AcademicHistory sessions={sortedSessions} studentsMap={studentsMap} getTeacherLabel={getTeacherLabel} loading={loading.academic} />
      )}
    </div>
  );
}
