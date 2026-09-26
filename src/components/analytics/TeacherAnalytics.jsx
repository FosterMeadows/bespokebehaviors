import { linkClass, Metric, average, Card, Empty, percent } from "./AnalyticsUI.jsx";
import { RankedBars, Trend } from "./AnalyticsCharts.jsx";
import BehaviorAnalysisPanel from "../../components/BehaviorAnalysisPanel.jsx";
import { useState } from "react";

export function TeacherDetail({
  detailRef,
  options,
  detailTeacher,
  update,
  detail,
  openHistory,
  interval,
  setInterval,
  serializedFilters,
  filters
}) {
  return (
    <section
              ref={detailRef}
              tabIndex={-1}
              aria-label="Teacher detail"
              className="scroll-mt-56 space-y-4 rounded-xl border-2 border-violet-200 bg-violet-50 p-4"
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
                  label="Students involved"
                  value={detail.uniqueStudents}
                  detail={`${average(detail.average)} reteaches per student in this view`}
                  onClick={() => openHistory({ teacher: detailTeacher })}
                />
                <Metric
                  label="Students with 2+"
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
                title="Teacher AI snapshot summary"
                filters={{ ...filters, teacher: detailTeacher }}
                records={detail.records}
              />
            </section>
  );
}

export function TeacherTable({ rows, total, onSelect }) {
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
    ["count", "Reteaches / % of total"],
    ["uniqueStudents", "Students involved"],
    ["average", "Reteaches per student"],
    ["topCategory", "Top category"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b text-sm text-slate-600">
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
