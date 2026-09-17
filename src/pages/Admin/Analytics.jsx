import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router";
import { AuthContext } from "../../AuthContext.jsx";
import { db } from "../../firebaseConfig";
import {
  analyticsOptions,
  buildBehaviorAnalytics,
  dateKey,
  schoolYearBounds,
} from "../../utils/behaviorAnalytics.js";

import BehaviorAnalysisPanel from "../../components/BehaviorAnalysisPanel.jsx";

const inputClass =
  "mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-violet-400";
const linkClass =
  "rounded text-violet-800 underline decoration-violet-200 underline-offset-4 hover:decoration-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400";
const percent = (count, total) =>
  total ? Math.round((count / total) * 100) : 0;
const average = (value) => (value === null ? "—" : value.toFixed(1));

function Card({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      {description && (
        <p className="mb-4 mt-1 text-sm text-slate-500">{description}</p>
      )}
      {children}
    </section>
  );
}

function Metric({ label, value, detail, onClick }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="my-2 text-2xl font-bold text-slate-950">
        {onClick ? (
          <button type="button" className={linkClass} onClick={onClick}>
            {value}
          </button>
        ) : (
          value
        )}
      </div>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Expandable({ name, title, summary, children }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`analytics:${name}`) === "open";
    } catch {
      return false;
    }
  });
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`analytics-${name}`}
        className="flex w-full items-center justify-between gap-3 rounded text-left focus:outline-none focus:ring-2 focus:ring-violet-400"
        onClick={() => {
          setOpen(!open);
          try {
            localStorage.setItem(
              `analytics:${name}`,
              !open ? "open" : "closed",
            );
          } catch {
            /* Optional preference storage. */
          }
        }}
      >
        <span>
          <span className="block text-base font-bold text-slate-950">
            {title}
          </span>
          <span className="mt-1 block text-sm text-slate-500">{summary}</span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={`analytics-${name}`} hidden={!open} className="mt-5 space-y-5">
        {children}
      </div>
    </section>
  );
}

function Empty() {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
      No served reteaches match these filters.
    </p>
  );
}

function RankedBars({ rows, total, onSelect, kind }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <button
          type="button"
          key={row.label}
          className="block w-full rounded-lg p-1 text-left focus:outline-none focus:ring-2 focus:ring-violet-400"
          onClick={() => onSelect(row.label)}
        >
          <span className="flex justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-800">
              {kind === "grade" && row.label !== "Unknown grade"
                ? `Grade ${row.label}`
                : row.label}
            </span>
            <span className="shrink-0 font-bold">
              {row.count} · {percent(row.count, total)}%
            </span>
          </span>
          <span className="my-2 block h-2 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-violet-500"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="block text-xs text-slate-500">
            {row.uniqueStudents} unique students
            {kind === "grade"
              ? ` · ${average(row.average)} reteaches per represented student`
              : kind === "location"
                ? ` · ${row.teacherCount} assigning staff`
                : ` · ${Math.round(row.repeatRate)}% repeat students`}
          </span>
        </button>
      ))}
    </div>
  );
}

function Trend({ analytics, interval, onInterval, openHistory }) {
  const rows = interval === "weekly" ? analytics.weekly : analytics.monthly;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <Card
      title="Served reteaches over time"
      description="Served date; weeks begin Monday. Select a period to review its records."
    >
      <div className="mb-4 flex gap-2" role="group" aria-label="Trend interval">
        {["monthly", "weekly"].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={interval === value}
            onClick={() => onInterval(value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${interval === value ? "bg-violet-100 text-violet-950" : "bg-slate-100 text-slate-600"}`}
          >
            {value === "monthly" ? "Monthly" : "Weekly"}
          </button>
        ))}
      </div>
      {!analytics.total ? (
        <Empty />
      ) : (
        <div className="flex items-end gap-2 overflow-x-auto border-b border-slate-200 pb-2 pt-5">
          {rows.map((row) => {
            const label =
              interval === "weekly"
                ? `Week of ${row.key}`
                : new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    year: "2-digit",
                  }).format(new Date(`${row.key}-01T00:00:00`));
            const detail = `${label}: ${row.count} served reteaches, ${row.uniqueStudents} unique students, ${row.teacherCount} assigning staff`;
            return (
              <button
                type="button"
                key={row.key}
                title={detail}
                aria-label={detail}
                onClick={() => openHistory({ start: row.start, end: row.end })}
                className="flex min-w-16 flex-1 flex-col items-center gap-2 rounded px-1 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <span className="text-xs font-bold">{row.count}</span>
                <span
                  className="w-full max-w-12 rounded-t bg-violet-500"
                  style={{
                    height: `${row.count ? Math.max(4, (row.count / max) * 130) : 0}px`,
                  }}
                />
                <span className="text-[11px] text-slate-600">{label}</span>
                <span className="text-[10px] text-slate-500">
                  {row.uniqueStudents} students
                  <br />
                  {row.teacherCount} staff
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          All{" "}
          {label === "Assigning teacher"
            ? "assigning staff"
            : label.toLowerCase()}
        </option>
        {options.map((option) => {
          const item =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function TeacherTable({ rows, total, onSelect }) {
  const [sort, setSort] = useState({ key: "name", direction: 1 });
  const sorted = [...rows].sort((a, b) => {
    const first = a[sort.key] ?? 0;
    const second = b[sort.key] ?? 0;
    return (
      (typeof first === "string"
        ? first.localeCompare(second)
        : first - second) * sort.direction || a.name.localeCompare(b.name)
    );
  });
  if (!rows.length) return <Empty />;
  const headers = [
    ["name", "Assigning teacher"],
    ["count", "Served / share"],
    ["uniqueStudents", "Unique students"],
    ["average", "Per student"],
    ["topCategory", "Top category"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b text-xs text-slate-500">
          <tr>
            {headers.map(([key, label]) => (
              <th
                key={key}
                className="px-2 py-3"
                aria-sort={
                  sort.key === key
                    ? sort.direction === 1
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setSort({
                      key,
                      direction:
                        sort.key === key
                          ? -sort.direction
                          : key === "name" || key === "topCategory"
                            ? 1
                            : -1,
                    })
                  }
                >
                  {label}{" "}
                  {sort.key === key ? (sort.direction === 1 ? "↑" : "↓") : "↕"}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.label} className="border-b border-slate-100">
              <th className="px-2 py-3 font-semibold">
                <button
                  className={linkClass}
                  onClick={() => onSelect(row.label)}
                >
                  {row.name}
                </button>
              </th>
              <td className="px-2 py-3">
                {row.count} · {percent(row.count, total)}%
              </td>
              <td className="px-2 py-3">{row.uniqueStudents}</td>
              <td className="px-2 py-3">{average(row.average)}</td>
              <td className="px-2 py-3">{row.topCategory}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Analytics() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const defaults = schoolYearBounds();
  const filters = {
    start: params.get("start") ?? defaults.start,
    end: params.get("end") ?? defaults.end,
    grade: params.get("grade") || "",
    teacher: params.get("teacher") || "",
    context: params.get("context") || "",
    location: params.get("location") || "",
    student: params.get("student") || "",
  };
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [interval, setInterval] = useState("monthly");
  const [bucket, setBucket] = useState(null);
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      collection(db, "behaviorReteaches"),
      (snapshot) => {
        setRecords(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        );
        setLoading(false);
        setError("");
      },
      () => {
        setError(
          "Behavior analytics could not be loaded. Reload to try again.",
        );
        setLoading(false);
      },
    );
  }, [user]);
  const options = useMemo(() => analyticsOptions(records), [records]);
  // URL filters keep the selected view available after a History drilldown.
  const serializedFilters = JSON.stringify(filters);
  const analytics = useMemo(
    () => buildBehaviorAnalytics(records, JSON.parse(serializedFilters)),
    [records, serializedFilters],
  );
  const invalidRange = Boolean(
    filters.start && filters.end && filters.start > filters.end,
  );
  const detailTeacher = params.get("detailTeacher") || "";
  const detailRef = useRef(null);
  useEffect(() => {
    if (detailTeacher && !loading && !error) detailRef.current?.focus();
  }, [detailTeacher, loading, error]);
  const detail = useMemo(
    () =>
      detailTeacher
        ? buildBehaviorAnalytics(records, {
            ...JSON.parse(serializedFilters),
            teacher: detailTeacher,
          })
        : null,
    [detailTeacher, records, serializedFilters],
  );
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) =>
      value === null ? next.delete(key) : next.set(key, value),
    );
    setParams(next, { replace: true });
    setBucket(null);
  };
  const openHistory = (changes = {}) => {
    const next = new URLSearchParams({
      tab: "behavior",
      ...filters,
      ...changes,
    });
    navigate(`/history?${next.toString()}`);
  };
  const preset = (value) => {
    const now = new Date();
    const start = new Date(now);
    if (value === "month") start.setDate(1);
    if (value === "30") start.setDate(start.getDate() - 29);
    update(
      value === "year"
        ? { ...defaults, preset: value }
        : value === "custom"
          ? { preset: value }
          : { start: dateKey(start), end: dateKey(now), preset: value },
    );
  };
  const students = options.students.filter(
    (student) =>
      student.value === filters.student ||
      student.label.toLowerCase().includes(studentSearch.toLowerCase()),
  );
  if (!user) return null;
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <BarChart3 className="h-10 w-10 rounded-lg bg-violet-100 p-2 text-violet-700" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-800">
            Admin Workspace
          </p>
          <h1 className="text-xl font-bold text-slate-950">
            Behavior Analytics
          </h1>
          <p className="text-sm text-slate-600">
            Understand served reteaches, participation, and repeating patterns.
          </p>
        </div>
      </header>
      <section
        aria-label="Analytics filters"
        className="xl:sticky top-20 z-10 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 xl:grid-cols-4"
      >
        <label className="text-sm font-semibold text-slate-700">
          Date range
          <select
            className={inputClass}
            value={
              params.get("preset") ||
              (params.has("start") || params.has("end") ? "custom" : "year")
            }
            onChange={(event) => preset(event.target.value)}
          >
            <option value="year">This school year</option>
            <option value="month">This month</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          From
          <input
            className={inputClass}
            type="date"
            value={filters.start}
            onChange={(event) =>
              update({ start: event.target.value, preset: "custom" })
            }
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Through
          <input
            className={inputClass}
            type="date"
            value={filters.end}
            onChange={(event) =>
              update({ end: event.target.value, preset: "custom" })
            }
          />
        </label>
        <SelectFilter
          label="Grades"
          value={filters.grade}
          options={options.grades}
          onChange={(grade) => update({ grade })}
        />
        <SelectFilter
          label="Assigning teacher"
          value={filters.teacher}
          options={options.teachers}
          onChange={(teacher) => update({ teacher, detailTeacher: null })}
        />
        <SelectFilter
          label="Categories"
          value={filters.context}
          options={options.contexts}
          onChange={(context) => update({ context })}
        />
        <SelectFilter
          label="Locations"
          value={filters.location}
          options={options.locations}
          onChange={(location) => update({ location })}
        />
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Find student
            <input
              type="search"
              className={inputClass}
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Search names…"
            />
          </label>
          <label className="sr-only" htmlFor="analytics-student">
            Student
          </label>
          <select
            id="analytics-student"
            className={inputClass}
            value={filters.student}
            onChange={(event) => update({ student: event.target.value })}
          >
            <option value="">All students</option>
            {students.map((student) => (
              <option key={student.value} value={student.value}>
                {student.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-slate-600 sm:col-span-3 xl:col-span-4">
          <span aria-live="polite">
            {loading
              ? "Loading records…"
              : error
                ? "Records unavailable"
                : invalidRange
                  ? "Choose a valid date range"
                  : `${analytics.total} served reteaches in current view · ${analytics.uniqueStudents} unique students`}
          </span>
          <button
            className={linkClass}
            onClick={() => {
              setParams({});
              setStudentSearch("");
              setBucket(null);
            }}
          >
            Reset filters
          </button>
        </div>
      </section>
      {invalidRange && (
        <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">
          The start date must be on or before the end date.
        </p>
      )}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">
          {error}
        </p>
      ) : loading ? (
        <p className="p-8 text-center text-slate-500">
          Loading served reteaches…
        </p>
      ) : invalidRange ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Served reteaches"
              value={analytics.total}
              detail="All records in this filtered view"
              onClick={() => openHistory()}
            />
            <Metric
              label="Highest-volume grade"
              value={analytics.topGrade?.label || "—"}
              detail={
                analytics.topGrade
                  ? `${analytics.topGrade.count} served · ${percent(analytics.topGrade.count, analytics.total)}% of this view`
                  : "No served records"
              }
              onClick={
                analytics.topGrade
                  ? () => openHistory({ grade: analytics.topGrade.label })
                  : undefined
              }
            />
            <Metric
              label="Top location"
              value={analytics.topLocation?.label || "—"}
              detail={
                analytics.topLocation
                  ? `${analytics.topLocation.count} served · ${percent(analytics.topLocation.count, analytics.total)}% of this view`
                  : "No served records"
              }
              onClick={
                analytics.topLocation
                  ? () => openHistory({ location: analytics.topLocation.label })
                  : undefined
              }
            />
            <Metric
              label="Top behavior category"
              value={analytics.topContext?.label || "—"}
              detail={
                analytics.topContext
                  ? `${analytics.topContext.count} served · ${percent(analytics.topContext.count, analytics.total)}% of this view`
                  : "No served records"
              }
              onClick={
                analytics.topContext
                  ? () => openHistory({ context: analytics.topContext.label })
                  : undefined
              }
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Served reteaches by grade"
              description="Count and share within the selected filters."
            >
              <RankedBars
                rows={analytics.gradeCounts}
                total={analytics.total}
                kind="grade"
                onSelect={(grade) => openHistory({ grade })}
              />
            </Card>
            <Trend
              analytics={analytics}
              interval={interval}
              onInterval={setInterval}
              openHistory={openHistory}
            />
          </div>
          <Card
            title="Behavior categories by grade"
            description="Percentages describe each category’s share of that grade’s served reteaches in this view. Select a cell to review records."
          >
            {!analytics.total ? (
              <Empty />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Behavior category</th>
                      {analytics.grades.map((grade) => (
                        <th key={grade} className="p-2">
                          {grade === "Unknown grade" ? grade : `Grade ${grade}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.contextByGrade.map((row) => (
                      <tr key={row.label}>
                        <th className="p-2 text-left font-semibold">
                          {row.label}
                        </th>
                        {row.grades.map((cell) => (
                          <td key={cell.grade} className="p-1">
                            <button
                              type="button"
                              disabled={!cell.count}
                              className="w-full rounded-lg bg-violet-50 p-3 text-violet-950 hover:bg-violet-100 focus:ring-2 focus:ring-violet-400 disabled:bg-slate-50 disabled:text-slate-400"
                              aria-label={`${row.label}, grade ${cell.grade}: ${cell.count} served, ${Math.round(cell.percent)} percent`}
                              onClick={() =>
                                openHistory({
                                  grade: cell.grade,
                                  context: row.label,
                                })
                              }
                            >
                              <strong>{cell.count}</strong>
                              <span className="block text-xs">
                                {Math.round(cell.percent)}%
                              </span>
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Locations that stand out"
              description="Counts, represented students, and assigning staff."
            >
              <RankedBars
                rows={analytics.locations}
                total={analytics.total}
                kind="location"
                onSelect={(location) => openHistory({ location })}
              />
            </Card>
            <Card
              title="Behavior categories that stand out"
              description="Repeat rate: students with multiple served reteaches in that category divided by students represented in that category."
            >
              <RankedBars
                rows={analytics.contexts}
                total={analytics.total}
                kind="context"
                onSelect={(context) => openHistory({ context })}
              />
            </Card>
          </div>
          <Card
            title="Teacher reteach activity"
            description="Served reteaches assigned by each staff member. Counts describe implementation patterns, not staff performance or all assignments. Select a teacher for details."
          >
            <TeacherTable
              rows={analytics.teachers}
              total={analytics.total}
              onSelect={(teacher) => update({ detailTeacher: teacher })}
            />
          </Card>
          {detail && (
            <section
              ref={detailRef}
              tabIndex={-1}
              aria-label="Teacher detail"
              className="space-y-4 rounded-xl border-2 border-violet-200 bg-violet-50 p-4"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="text-lg font-bold">
                  {options.teachers.find(
                    (teacher) => teacher.value === detailTeacher,
                  )?.label || "Assigning teacher"}{" "}
                  — detail
                </h2>
                <button
                  className={linkClass}
                  onClick={() => update({ detailTeacher: null })}
                >
                  Close teacher detail
                </button>
              </div>
              <p className="text-sm text-slate-600">
                Uses the date, grade, category, location, and student filters
                above for this teacher.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Served"
                  value={detail.total}
                  detail="Assigned by this staff member"
                  onClick={() => openHistory({ teacher: detailTeacher })}
                />
                <Metric
                  label="Unique students"
                  value={detail.uniqueStudents}
                  detail={`${average(detail.average)} reteaches per represented student`}
                  onClick={() => openHistory({ teacher: detailTeacher })}
                />
                <Metric
                  label="Repeat students"
                  value={detail.repeatStudents}
                  detail="More than one in this filtered view"
                  onClick={() =>
                    openHistory({ teacher: detailTeacher, repeat: "1" })
                  }
                />
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  ["Categories", detail.contexts, "context"],
                  ["Locations", detail.locations, "location"],
                  ["Grades", detail.gradeCounts, "grade"],
                ].map(([title, rows, field]) => (
                  <Card key={title} title={title}>
                    <RankedBars
                      rows={rows}
                      total={detail.total}
                      kind={field}
                      onSelect={(value) =>
                        openHistory({ teacher: detailTeacher, [field]: value })
                      }
                    />
                  </Card>
                ))}
              </div>
              <Trend
                analytics={detail}
                interval={interval}
                onInterval={setInterval}
                openHistory={(changes) =>
                  openHistory({ ...changes, teacher: detailTeacher })
                }
              />
              <button
                className={linkClass}
                onClick={() => openHistory({ teacher: detailTeacher })}
              >
                Open this teacher’s records in History
              </button>
              <BehaviorAnalysisPanel
                key={`${serializedFilters}:${detailTeacher}`}
                title="Teacher Written Reason Analysis"
                filters={{ ...filters, teacher: detailTeacher }}
                records={detail.records}
              />
            </section>
          )}
          <Expandable
            name="concentration"
            title="Concentration & Repeats"
            summary={`${analytics.uniqueStudents} students represented · ${analytics.repeatStudents} with multiple reteaches · ${analytics.teacherCount} assigning staff`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Assigning staff represented"
                value={analytics.teacherCount}
                detail="Staff with served assignments in this view"
                onClick={() => openHistory()}
              />
              <Metric
                label="Top five staff’s share"
                value={`${percent(analytics.topFiveCount, analytics.total)}%`}
                detail={`${analytics.topFiveCount} of ${analytics.total} served reteaches`}
                onClick={() => openHistory({ topStaff: "1" })}
              />
              <Metric
                label="Students with multiple reteaches"
                value={analytics.repeatStudents}
                detail={`${Math.round(analytics.repeatRate)}% of represented students`}
                onClick={() => openHistory({ repeat: "1" })}
              />
            </div>
            <p className="text-sm text-slate-600">
              Student counts below are for the selected range and filters. They
              do not represent current escalation status.
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              {analytics.buckets.map((item, index) => (
                <button
                  type="button"
                  key={item.label}
                  aria-pressed={bucket === index}
                  onClick={() => setBucket(bucket === index ? null : index)}
                  className={`rounded-lg border p-4 text-left focus:ring-2 focus:ring-violet-400 ${bucket === index ? "border-violet-400 bg-violet-50" : "border-slate-200"}`}
                >
                  <span className="block text-xs font-semibold text-slate-500">
                    {item.label}
                  </span>
                  <strong className="text-xl">{item.students.length}</strong>
                  <span className="ml-1 text-sm">students</span>
                </button>
              ))}
            </div>
            {bucket !== null && (
              <div className="rounded-lg border border-violet-200 p-4">
                <h3 className="mb-3 font-bold">
                  {analytics.buckets[bucket].label} in this view
                </h3>
                {!analytics.buckets[bucket].students.length ? (
                  <p className="text-sm text-slate-500">
                    No students in this bucket.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {analytics.buckets[bucket].students.map((student) => (
                      <li key={student.label}>
                        <button
                          className={linkClass}
                          onClick={() =>
                            openHistory({ student: student.label })
                          }
                        >
                          {student.name} · {student.count} served
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <h3 className="font-bold">Repeat behavior patterns</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b">
                    {[
                      "Category",
                      "Students",
                      "Repeat students",
                      "Repeat rate",
                      "Records per student",
                    ].map((label) => (
                      <th key={label} className="p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.contexts.map((row) => (
                    <tr key={row.label} className="border-b border-slate-100">
                      <th className="p-2 font-semibold">
                        <button
                          className={linkClass}
                          onClick={() => openHistory({ context: row.label })}
                        >
                          {row.label}
                        </button>
                      </th>
                      <td className="p-2">{row.uniqueStudents}</td>
                      <td className="p-2">
                        <button
                          className={linkClass}
                          onClick={() =>
                            openHistory({ context: row.label, repeat: "1" })
                          }
                        >
                          {row.repeatStudents}
                        </button>
                      </td>
                      <td className="p-2">{Math.round(row.repeatRate)}%</td>
                      <td className="p-2">{average(row.average)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Expandable>
          <BehaviorAnalysisPanel
            key={serializedFilters}
            filters={filters}
            records={analytics.records}
          />
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            Counts describe served reteach events. Student averages and repeat
            rates use only students represented in the selected records, not
            enrollment. Assigning staff counts exclude records without a staff
            ID. Dates use served date, falling back to reteach date or creation
            date when unavailable.
            {analytics.missingStudents > 0 &&
              ` ${analytics.missingStudents} records lack a student ID and are excluded from student counts and averages.`}
          </p>
        </>
      )}
    </div>
  );
}
