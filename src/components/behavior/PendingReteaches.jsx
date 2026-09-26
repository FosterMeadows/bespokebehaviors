import { Search, CheckCircle2, UserRound, CalendarDays, MapPin, AlertTriangle, Download, Puzzle } from "lucide-react";
import { BEHAVIOR_THRESHOLD } from "../../services/behavior";
import { formatReteachDate } from "../../utils/behaviorPresentation.js";

export function PendingReteaches({
  pending,
  serveFilters,
  setServeFilters,
  serveFilterOptions,
  visiblePending,
  handleTabChange,
  pendingStudentGroups,
  pendingCounts,
  handleGenerateReport,
  generatingReportIds,
  handleServed,
  servingIds,
  cancelButton
}) {
  return (
    <section className="space-y-4">
          <div className="sticky top-20 z-20 border-b border-slate-200 bg-white p-3">
            <h2 className="sr-only">To Serve</h2>
            <div>
            {pending.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_11rem] sm:items-center">
                <label className="relative block">
                  <span className="sr-only">Search student</span>
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={serveFilters.search}
                    onChange={(event) => setServeFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Search student..."
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label>
                  <span className="sr-only">Grade</span>
                  <select
                    value={serveFilters.grade}
                    onChange={(event) => setServeFilters((current) => ({ ...current, grade: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">All grades</option>
                    {serveFilterOptions.grades.map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
                  </select>
                </label>

                <label>
                  <span className="sr-only">Sort reteaches</span>
                  <select
                    value={serveFilters.sort}
                    onChange={(event) => setServeFilters((current) => ({ ...current, sort: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    {SERVE_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>Sort: {option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            </div>
          </div>

          {visiblePending.length !== pending.length && <p className="text-sm text-slate-500" role="status">Showing {visiblePending.length} of {pending.length} reteaches</p>}

          {pending.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden="true" />
              <div className="mt-3 text-base font-bold text-slate-900">All caught up</div>
              <div className="mt-2 text-sm text-slate-600">There are no reteaches waiting to be served.</div>
              <button
                type="button"
                onClick={() => handleTabChange("assign")}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                Create a new reteach
              </button>
            </div>
          ) : visiblePending.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-600 shadow-sm">
              No reteaches match these filters.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingStudentGroups.map(({ key, student, records }) => (
                <article key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-emerald-100 bg-emerald-50/50 px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="text-xl font-bold text-slate-950">{student.studentName}</h3>
                      <span className="text-sm font-semibold text-slate-500">Grade {student.grade || "-"} • Homeroom: {student.homeroom || "Not listed"}</span>
                    </div>
                    {(() => {
                      const served = pendingCounts[student.studentId]?.adjusted;
                      if (served == null) return <span className="text-xs text-slate-500">Served history loading…</span>;
                      return (
                        <div className="flex shrink-0 items-center gap-3" title={served + " reteaches previously served"} aria-label={served + " previously served; scale of 0 to " + BEHAVIOR_THRESHOLD}>
                          <span className="text-xs font-medium text-slate-600">Served</span>
                          <span className="flex gap-1" aria-hidden="true">
                            {Array.from({ length: BEHAVIOR_THRESHOLD }, (_, index) => (
                              <span key={index} className={"flex h-6 w-6 items-center justify-center rounded border text-[11px] font-semibold " + (index < served ? "border-[#397A82] bg-[#397A82] text-white" : "border-slate-300 bg-white text-slate-400")}>{index + 1}</span>
                            ))}
                          </span>
                        </div>
                      );
                    })()}
                  </header>
                  <div className="divide-y divide-slate-200">
                    {records.map(record => (
                      <section key={record.id} aria-label={student.studentName + ": " + record.context + ", " + formatReteachDate(record.reteachDate)} className="p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 text-slate-700">
                        <UserRound className="h-4 w-4 shrink-0" />
                        Assigned by {record.assignedByName || "Unknown"}
                      </span>
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 text-slate-700">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        {formatReteachDate(record.reteachDate)}
                      </span>
                      <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-1 text-sky-950">
                        <MapPin className="h-4 w-4 shrink-0" />
                        {record.location}
                      </span>
                      {record.postThreshold && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Assigned after threshold
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:shrink-0">

                      <button
                        type="button"
                        onClick={() => handleGenerateReport(record)}
                        disabled={generatingReportIds.includes(record.id)}
                        className="inline-flex min-h-12 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition active:translate-y-px hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
                      >
                        <Download className="h-5 w-5" />
                        {generatingReportIds.includes(record.id) ? "Generating..." : "Generate Report"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleServed(record)}
                        disabled={servingIds.includes(record.id)}
                        className="inline-flex min-h-12 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition active:translate-y-px hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                        {servingIds.includes(record.id) ? "Saving…" : "Mark Served"}
                      </button>
                      {cancelButton(record, true)}
                    </div>
                        </div>
                  <div className="mt-3 min-h-12 border-l-4 border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-violet-950"><Puzzle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{record.context}</div>
                    <p className="mt-0.5 whitespace-pre-line text-base leading-6 text-slate-900">{record.note}</p>
                  </div>
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
  );
}

const SERVE_SORT_OPTIONS = [
  { value: "oldest", label: "Oldest" },
  { value: "newest", label: "Newest" },
  { value: "student", label: "Student A-Z" },
  { value: "grade", label: "Grade" },
  { value: "context", label: "Behavior Category" }
];
