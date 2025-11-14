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

export default function ARHistoryPage() {
  const { user } = useContext(AuthContext);
  const [ownerOk] = useState(true); // keep true if your route already gates on owner

  // --- students cache for filter + display ---
  const [studentsMap, setStudentsMap] = useState({});
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

      const qPaged = attCursor ? query(qBase, startAfter(attCursor)) : qBase;
      const snap = await getDocs(qPaged);

      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const last = snap.docs[snap.docs.length - 1] || null;

      setAttRows(prev => (reset ? rows : [...prev, ...rows]));
      setAttCursor(last);
      setAttDone(rows.length < PAGE_SIZE);
    } catch (e) {
      setAttError(e?.message || "Failed to load attendance.");
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
        collectionGroup(db, "reteachHistory"),
        ...cons,
        orderBy("completedAt", "desc"),
        limit(PAGE_SIZE)
      );

      const qPaged = compCursor ? query(qBase, startAfter(compCursor)) : qBase;
      const snap = await getDocs(qPaged);

      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const last = snap.docs[snap.docs.length - 1] || null;

      setCompRows(prev => (reset ? rows : [...prev, ...rows]));
      setCompCursor(last);
      setCompDone(rows.length < PAGE_SIZE);
    } catch (e) {
      setCompError(e?.message || "Failed to load completed tasks.");
    } finally {
      setCompLoading(false);
    }
  }

  // reset + first page whenever filters or tab change
  useEffect(() => {
    if (!user || !ownerOk) return;
    if (tab === "attendance") {
      setAttRows([]); setAttCursor(null); setAttDone(false);
      loadAttendance(true);
    } else {
      setCompRows([]); setCompCursor(null); setCompDone(false);
      loadCompleted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters, user, ownerOk]);

  // --- render helpers ---
  const getStudentLabel = (sid) => {
    const s = studentsMap[sid];
    if (!s) return sid || "—";
    const bits = [s.displayName].filter(Boolean);
    if (s.homeroom) bits.push(s.homeroom);
    if (s.grade) bits.push(`G${s.grade}`);
    return bits.join(" • ");
  };
  const fmtDate = (v) => {
    try {
      if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
      if (typeof v === "string") return v;
      return "—";
    } catch { return "—"; }
  };

  // don’t early-return (keeps hooks order stable)
  const blocked = !user || !ownerOk;
  const blockedMsg = !user ? "Sign in required." : "Access denied.";

  return (
    <div className="p-4 space-y-6">
      {blocked ? (
        <div className="p-4">{blockedMsg}</div>
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">AR History</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="text-sm text-gray-500">
                {tab === "attendance" ? (
                  <>Rows: <b>{attRows.length}</b> • Students: <b>{attUniqueStudents}</b></>
                ) : (
                  <>Rows: <b>{compRows.length}</b> • Students: <b>{compUniqueStudents}</b></>
                )}
              </div>
            </div>
          </header>

          {/* Filters */}
          <section className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Start</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1"
                  value={filters.start}
                  onChange={e => setFilters(f => ({ ...f, start: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">End</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1"
                  value={filters.end}
                  onChange={e => setFilters(f => ({ ...f, end: e.target.value }))}
                />
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs text-gray-600 mb-1">Student</label>
                <select
                  className="border rounded px-2 py-1 w-full"
                  value={filters.studentId}
                  onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))}
                >
                  <option value="">All students</option>
                  {studentsList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.homeroom ? ` • ${s.homeroom}` : ""}{s.grade ? ` • G${s.grade}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ml-auto flex gap-2">
                <button
                  className={`px-3 py-1 rounded border ${tab === "attendance" ? "bg-gray-900 text-white" : "bg-white"}`}
                  onClick={() => setTab("attendance")}
                >
                  Attendance
                </button>
                <button
                  className={`px-3 py-1 rounded border ${tab === "completed" ? "bg-gray-900 text-white" : "bg-white"}`}
                  onClick={() => setTab("completed")}
                >
                  Completed Tasks
                </button>
              </div>
            </div>
          </section>

          {/* TABLES */}
          {tab === "attendance" ? (
            <section className="bg-white border rounded-2xl p-4 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left border-b">
                    <tr className="[&>th]:py-2 [&>th]:pr-4">
                      <th className="tabular-nums">Date</th>
                      <th>Student</th>
                      <th>Room</th>
                      <th>Served by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attRows.map(r => (
                      <tr key={r.id} className="border-b last:border-0 [&>td]:py-2 [&>td]:pr-4">
                        <td className="tabular-nums">{r.date || "—"}</td>
                        <td className="truncate">{getStudentLabel(r.studentId)}</td>
                        <td>{r.room || "—"}</td>
                        <td className="truncate">{r.by || "—"}</td>
                      </tr>
                    ))}
                    {attRows.length === 0 && !attLoading && !attError && (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-500">No results</td></tr>
                    )}
                    {attError && (
                      <tr><td colSpan={4} className="py-3 text-sm text-red-600">{attError}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                {!attDone && (
                  <button
                    className="text-xs px-3 py-1 border rounded"
                    disabled={attLoading}
                    onClick={() => loadAttendance(false)}
                  >
                    {attLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="bg-white border rounded-2xl p-4 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left border-b">
                    <tr className="[&>th]:py-2 [&>th]:pr-4">
                      <th className="tabular-nums">Completed</th>
                      <th>Student</th>
                      <th>Subject</th>
                      <th>Title</th>
                      <th>Completed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compRows.map(h => (
                      <tr key={h.id} className="border-b last:border-0 [&>td]:py-2 [&>td]:pr-4">
                        <td className="tabular-nums">{fmtDate(h.completedAt)}</td>
                        <td className="truncate">{getStudentLabel(h.studentId)}</td>
                        <td>{h.subject || "—"}</td>
                        <td className="truncate">{h.title || "Untitled Task"}</td>
                        <td className="truncate">{h.completedBy || "—"}</td>
                      </tr>
                    ))}
                    {compRows.length === 0 && !compLoading && !compError && (
                      <tr><td colSpan={5} className="py-6 text-center text-gray-500">No results</td></tr>
                    )}
                    {compError && (
                      <tr><td colSpan={5} className="py-3 text-sm text-red-600">{compError}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                {!compDone && (
                  <button
                    className="text-xs px-3 py-1 border rounded"
                    disabled={compLoading}
                    onClick={() => loadCompleted(false)}
                  >
                    {compLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            </section>
          )}

          <footer className="text-xs text-gray-500">
            <p>Tip: if Firestore asks for an index, create it for the query you’re running.</p>
          </footer>
        </>
      )}
    </div>
  );
}
