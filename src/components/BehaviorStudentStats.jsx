import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { BEHAVIOR_THRESHOLD, listenServedBehaviorSummaries } from "../services/behavior";
import { behaviorSchoolYear } from "../utils/behaviorRecords.js";
import { buildBehaviorStudentStats, filterBehaviorStudentStats } from "../utils/behaviorStudentStats.js";

export default function BehaviorStudentStats({ students, profile, devCounts }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(!devCounts);
  const [error, setError] = useState("");
  const [maxedFilter, setMaxedFilter] = useState("all");
  const [filters, setFilters] = useState({ search: "", grade: "", sort: "most" });
  useEffect(() => {
    if (devCounts) return undefined;
    return listenServedBehaviorSummaries(rows => {
      setRecords(rows);
      setLoading(false);
      setError("");
    }, err => {
      setError(`Could not load student stats: ${err.message}`);
      setLoading(false);
    });
  }, [devCounts]);
  const rows = useMemo(() => devCounts
    ? students.map(student => ({ ...student, served: devCounts[student.id]?.served || 0 })).filter(student => student.served > 0)
    : buildBehaviorStudentStats(students, records, profile), [students, records, profile, devCounts]);
  const grades = [...new Set(rows.map(row => String(row.grade)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const visible = filterBehaviorStudentStats(rows, filters)
    .filter(student => maxedFilter === "all" || (maxedFilter === "hide"
      ? student.served < BEHAVIOR_THRESHOLD
      : student.served >= BEHAVIOR_THRESHOLD));
  const fieldClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";
  return (
    <section className="space-y-4" aria-labelledby="student-stats-title">
      <div className="space-y-4 border-b border-slate-200 bg-white p-3">
        <div>
          <h2 id="student-stats-title" className="text-xl font-bold text-slate-950">Student Stats</h2>
          <p className="mt-1 text-sm text-slate-600">Reteaches served in {behaviorSchoolYear()} for your grades. Totals are before buybacks.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_13rem]">
          <label><span className="sr-only">Search student stats</span><input className={fieldClass} placeholder="Search student..." value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
          <label><span className="sr-only">Filter stats by grade</span><select className={fieldClass} value={filters.grade} onChange={event => setFilters({ ...filters, grade: event.target.value })}>
            <option value="">All grades</option>
            {grades.map(grade => <option key={grade} value={grade}>Grade {grade}</option>)}
          </select></label>
          <label><span className="sr-only">Sort student stats</span><select className={fieldClass} value={filters.sort} onChange={event => setFilters({ ...filters, sort: event.target.value })}>
            <option value="most">Served: High to low</option><option value="least">Served: Low to high</option>
            <option value="student">Student A–Z</option><option value="student-desc">Student Z–A</option>
            <option value="grade">Grade</option><option value="homeroom">Homeroom</option>
          </select></label>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={maxedFilter === "hide"}
            onChange={event => setMaxedFilter(event.target.checked ? "hide" : "all")}
            className="h-4 w-4 rounded border-slate-300 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          />
          Hide Maxed Students
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={maxedFilter === "only"}
            onChange={event => setMaxedFilter(event.target.checked ? "only" : "all")}
            className="h-4 w-4 rounded border-slate-300 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          />
          Show Only Maxed Students
        </label>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>
        : loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading student stats…</p>
          : visible.length === 0 ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-600">{rows.length ? "No students match these filters." : "No students in your assigned grades have served reteaches this school year."}</p>
            : <div className="space-y-2.5">
              {visible.map(student => {
                const maxed = student.served >= BEHAVIOR_THRESHOLD;
                return <article key={student.id} className={`flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3 shadow-sm ${maxed ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-emerald-50/50"}`}>
                <div><h3 className="text-xl font-bold text-slate-950"><Link to={`/students?studentId=${encodeURIComponent(student.id)}&tab=behavior`} className="rounded text-emerald-800 underline decoration-emerald-800/30 underline-offset-4 hover:text-emerald-950 hover:decoration-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">{student.displayName}</Link></h3><p className="text-sm font-semibold text-slate-500">Grade {student.grade || "–"} • Homeroom: {student.homeroom || "Not listed"}</p></div>
                <div className="flex items-center gap-2"><span className={`text-sm font-medium ${maxed ? "text-amber-800" : "text-slate-600"}`}>{maxed ? "Maxed" : "Served"}</span><span className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg px-3 text-lg font-bold ${maxed ? "bg-amber-200 text-amber-950" : "bg-[#397A82] text-white"}`}>{student.served}</span></div>
              </article>;
              })}
            </div>}
    </section>
  );
}
