import { Expandable, Metric, percent, linkClass, average } from "./AnalyticsUI.jsx";

export function RepeatedReteaches({
  analytics,
  openHistory,
  bucket,
  setBucket
}) {
  return (
    <Expandable
            name="concentration"
            title="Students with repeated reteaches"
            summary={`${analytics.uniqueStudents} ${analytics.uniqueStudents === 1 ? "student" : "students"} in this view · ${analytics.repeatStudents} with multiple reteaches · ${analytics.teacherCount} assigning staff`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Assigning staff"
                value={analytics.teacherCount}
                detail="Staff with served assignments in this view"
                onClick={() => openHistory()}
              />
              <Metric
                label="Reteaches assigned by the five most active staff"
                value={`${percent(analytics.topFiveCount, analytics.total)}%`}
                detail={`${analytics.topFiveCount} of ${analytics.total} served reteaches. Counts depend on role and student contact; this is not a performance measure.`}
                onClick={() => openHistory({ topStaff: "1" })}
              />
              <Metric
                label="Students with multiple reteaches"
                value={analytics.repeatStudents}
                detail={`${analytics.repeatStudents} of ${analytics.uniqueStudents} ${analytics.uniqueStudents === 1 ? "student" : "students"} in this view`}
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
                  <span className="block text-sm font-semibold text-slate-600">
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
                  <p className="text-sm text-slate-600">
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
                      "Students with 2+",
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
  );
}
