// src/pages/History.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  Timestamp
} from "firebase/firestore";
import { CalendarDays, History as HistoryIcon, SlidersHorizontal } from "lucide-react";

// --- small utils ---
function yyyymmdd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function toTsStart(yyyy_mm_dd) {
  const [y, m, d] = (yyyy_mm_dd || "").split("-").map(Number);
  return Timestamp.fromDate(new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}
function toTsEnd(yyyy_mm_dd) {
  const [y, m, d] = (yyyy_mm_dd || "").split("-").map(Number);
  return Timestamp.fromDate(new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999));
}

const PAGE_SIZE = 25;

function HistoryTabButton({ active, children, onClick }) {
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

function historyErrorMessage(error, fallback) {
  const message = error?.message || "";
  if (error?.code === "permission-denied" || /insufficient permissions/i.test(message)) {
    return "You do not have permission to view these records.";
  }
  if (error?.code === "failed-precondition" || /requires .*index/i.test(message)) {
    return "This history view is being prepared. Try again in a few minutes.";
  }
  return fallback;
}

export default function ARHistoryPage() {
  const { user } = useContext(AuthContext);

  // --- students cache for filter + display ---
  const [studentsMap, setStudentsMap] = useState({});
  const [teachersMap, setTeachersMap] = useState({});
  const studentsList = useMemo(() => {
    return Object.entries(studentsMap)
      .map(([id, s]) => ({
        id,
        name: s.displayName || id,
        grade: s.grade || "",
        homeroom: s.homeroom || ""
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsMap]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "students"), orderBy("displayName", "asc")),
      snap => {
        const map = {};
        for (const d of snap.docs) map[d.id] = d.data();
        setStudentsMap(map);
      },
      err => console.error("[History] students listener", err?.code, err?.message)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "teachers"),
      snap => {
        const map = {};
        for (const d of snap.docs) map[d.id] = d.data();
        setTeachersMap(map);
      },
      err => console.error("[History] teachers listener", err?.code, err?.message)
    );
    return () => unsub();
  }, []);

  // --- filters ---
  const [tab, setTab] = useState("attendance"); // "attendance" | "completed"
  const [filters, setFilters] = useState({
    start: yyyymmdd(daysAgo(30)),
    end: yyyymmdd(new Date()),
    studentId: ""
  });

  // --- attendance state ---
  const [attRows, setAttRows] = useState([]);
  const [attCursor, setAttCursor] = useState(null);
  const [attDone, setAttDone] = useState(false);
  const [attLoading, setAttLoading] = useState(false);
  const [attError, setAttError] = useState("");

  // --- completed tasks state ---
  const [compRows, setCompRows] = useState([]);
  const [compCursor, setCompCursor] = useState(null);
  const [compDone, setCompDone] = useState(false);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState("");

  // --- metrics (hooks must be unconditional) ---
  const attUniqueStudents = useMemo(
    () => new Set(attRows.map(r => r.studentId)).size,
    [attRows]
  );
  const compUniqueStudents = useMemo(
    () => new Set(compRows.map(r => r.studentId)).size,
    [compRows]
  );

  // --- loaders ---
  async function loadAttendance(reset = false) {
    if (attLoading) return;
    if (attDone && !reset) return;

    setAttLoading(true);
    setAttError("");
    try {
      const cons = [];
      if (filters.start) cons.push(where("date", ">=", filters.start));
      if (filters.end) cons.push(where("date", "<=", filters.end));
      if (filters.studentId) cons.push(where("studentId", "==", filters.studentId));

      const qBase = query(
        collection(db, "attendance"),
        ...cons,
        orderBy("date", "desc"),
        limit(PAGE_SIZE)
      );

      const cursor = reset ? null : attCursor;
      const qPaged = cursor ? query(qBase, startAfter(cursor)) : qBase;
      const snap = await getDocs(qPaged);

      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const last = snap.docs[snap.docs.length - 1] || null;

      setAttRows(prev => (reset ? rows : [...prev, ...rows]));
      setAttCursor(last);
      setAttDone(rows.length < PAGE_SIZE);
    } catch (e) {
      setAttError(historyErrorMessage(e, "Attendance history could not be loaded."));
    } finally {
      setAttLoading(false);
    }
  }

  async function loadCompleted(reset = false) {
    if (compLoading) return;
    if (compDone && !reset) return;

    setCompLoading(true);
    setCompError("");
    try {
      const cons = [];
      if (filters.start) cons.push(where("completedAt", ">=", toTsStart(filters.start)));
      if (filters.end) cons.push(where("completedAt", "<=", toTsEnd(filters.end)));
      if (filters.studentId) cons.push(where("studentId", "==", filters.studentId));

      const qBase = query(
        collectionGroup(db, "academicHistory"),
        ...cons,
        orderBy("completedAt", "desc"),
        limit(PAGE_SIZE)
      );

      const cursor = reset ? null : compCursor;
      const qPaged = cursor ? query(qBase, startAfter(cursor)) : qBase;
      const snap = await getDocs(qPaged);

      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const last = snap.docs[snap.docs.length - 1] || null;

      setCompRows(prev => (reset ? rows : [...prev, ...rows]));
      setCompCursor(last);
      setCompDone(rows.length < PAGE_SIZE);
    } catch (e) {
      setCompError(historyErrorMessage(e, "Completed task history could not be loaded."));
    } finally {
      setCompLoading(false);
    }
  }

  // reset + first page whenever filters or tab change
  useEffect(() => {
    if (!user) return;
    if (tab === "attendance") {
      setAttRows([]); setAttCursor(null); setAttDone(false);
      loadAttendance(true);
    } else {
      setCompRows([]); setCompCursor(null); setCompDone(false);
      loadCompleted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters, user]);

  // --- render helpers ---
  const getStudentName = (sid) => studentsMap[sid]?.displayName || sid || "—";
  const getStudentDetail = (sid) => {
    const student = studentsMap[sid];
    if (!student) return "—";
    return [student.grade ? `Grade ${student.grade}` : "", student.homeroom || ""].filter(Boolean).join(" • ") || "—";
  };
  const getTeacherLabel = (uidOrName) => {
    if (!uidOrName) return "—";
    const teacher = teachersMap[uidOrName];
    return teacher?.displayName || teacher?.contactEmail || uidOrName;
  };
  const fmtDate = (v) => {
    try {
      const date = v?.toDate
        ? v.toDate()
        : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? new Date(`${v}T00:00:00`)
          : new Date(v);
      if (Number.isNaN(date.getTime())) return "—";
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
    } catch { return "—"; }
  };

  // don’t early-return (keeps hooks order stable)
  const blocked = !user;
  const blockedMsg = "Sign in required.";

  const activeRows = tab === "attendance" ? attRows : compRows;
  const activeUniqueStudents = tab === "attendance" ? attUniqueStudents : compUniqueStudents;
  const activeLoading = tab === "attendance" ? attLoading : compLoading;
  const activeError = tab === "attendance" ? attError : compError;

  return (
    <div className="space-y-4">
      {blocked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{blockedMsg}</div>
      ) : (
        <>
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200">
                <HistoryIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Admin workspace</div>
                <div className="mt-0.5 text-sm text-slate-600">Review attendance and completed academic work.</div>
              </div>
            </div>
            <div className="inline-flex self-start gap-1 rounded-md border border-slate-200 bg-slate-50/70 p-0.5 sm:self-auto">
              <HistoryTabButton active={tab === "attendance"} onClick={() => setTab("attendance")}>Attendance</HistoryTabButton>
              <HistoryTabButton active={tab === "completed"} onClick={() => setTab("completed")}>Completed Tasks</HistoryTabButton>
            </div>
          </header>

          <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <div>
                <h2 className="text-base font-bold text-slate-950">History filters</h2>
                <p className="mt-0.5 text-sm text-slate-600">Narrow records by date range or student.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[11rem_11rem_minmax(18rem,1fr)]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Start date</span>
                <input type="date" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">End date</span>
                <input type="date" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Student</span>
                <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))}>
                  <option value="">All students</option>
                  {studentsList.map(s => <option key={s.id} value={s.id}>{s.name}{s.homeroom ? ` • ${s.homeroom}` : ""}{s.grade ? ` • G${s.grade}` : ""}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md shadow-slate-200/40">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">{tab === "attendance" ? "Attendance history" : "Completed task history"}</h2>
                <p className="mt-0.5 text-sm text-slate-600">{activeRows.length} {activeRows.length === 1 ? "record" : "records"} across {activeUniqueStudents} {activeUniqueStudents === 1 ? "student" : "students"}</p>
              </div>
              {activeLoading && <span className="text-xs font-semibold text-sky-700">Loading records…</span>}
            </div>

            {activeError ? (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{activeError}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {tab === "attendance" ? (
                      <tr><th className="w-36 px-4 py-2.5">Date</th><th className="px-4 py-2.5">Student</th><th className="w-60 px-4 py-2.5">Grade / Homeroom</th><th className="w-64 px-4 py-2.5">Served by</th></tr>
                    ) : (
                      <tr><th className="w-36 px-4 py-2.5">Completed</th><th className="w-60 px-4 py-2.5">Student</th><th className="w-36 px-4 py-2.5">Subject</th><th className="px-4 py-2.5">Assignment</th><th className="w-64 px-4 py-2.5">Completed by</th></tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {tab === "attendance" ? attRows.map(r => (
                      <tr key={r.id} className="hover:bg-sky-50/40">
                        <td className="px-4 py-3 tabular-nums text-slate-600"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />{fmtDate(r.date)}</span></td>
                        <td className="truncate px-4 py-3 font-semibold text-slate-950">{getStudentName(r.studentId)}</td>
                        <td className="truncate px-4 py-3 text-slate-600">{getStudentDetail(r.studentId)}</td>
                        <td className="truncate px-4 py-3 text-slate-600">{getTeacherLabel(r.by)}</td>
                      </tr>
                    )) : compRows.map(h => (
                      <tr key={h.id} className="hover:bg-sky-50/40">
                        <td className="px-4 py-3 tabular-nums text-slate-600">{fmtDate(h.completedAt)}</td>
                        <td className="truncate px-4 py-3 font-semibold text-slate-950">{getStudentName(h.studentId)}</td>
                        <td className="px-4 py-3"><span className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{h.subject || "Other"}</span></td>
                        <td className="truncate px-4 py-3 text-slate-700">{h.title || "Untitled assignment"}</td>
                        <td className="truncate px-4 py-3 text-slate-600">{getTeacherLabel(h.completedBy)}</td>
                      </tr>
                    ))}
                    {activeRows.length === 0 && !activeLoading && <tr><td colSpan={tab === "attendance" ? 4 : 5} className="px-4 py-10 text-center text-sm text-slate-500">No records match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {!activeError && ((tab === "attendance" && !attDone) || (tab === "completed" && !compDone)) && (
              <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
                <button type="button" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50" disabled={activeLoading} onClick={() => tab === "attendance" ? loadAttendance(false) : loadCompleted(false)}>
                  {activeLoading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
