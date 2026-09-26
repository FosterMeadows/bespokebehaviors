import { Empty, percent, average, Card } from "./AnalyticsUI.jsx";
import { dateKey } from "../../utils/behaviorAnalytics.js";

export function RankedBars({ rows, total, onSelect, kind }) {
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
          <span className="block text-sm text-slate-600">
            {row.uniqueStudents}{" "}
            {row.uniqueStudents === 1 ? "student" : "students"}
            {kind === "grade"
              ? ` · ${average(row.average)} reteaches per student in this view`
              : kind === "location"
                ? ` · ${row.teacherCount} assigning staff`
                : ` · ${row.repeatStudents} of ${row.uniqueStudents} ${row.uniqueStudents === 1 ? "student" : "students"} had multiple reteaches`}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Trend({ analytics, interval, onInterval, openHistory }) {
  const today = dateKey(new Date());
  const rows = (
    interval === "weekly" ? analytics.weekly : analytics.monthly
  ).filter((row) => row.start <= today);
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <Card
      title="Served reteaches over time"
      description="Based on when reteaches were served, through today. Weeks begin Monday. Select a period to open records."
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
            const detail = `${label}: ${row.count} served reteaches, ${row.uniqueStudents} students, ${row.teacherCount} assigning staff`;
            return (
              <button
                type="button"
                key={row.key}
                title={detail}
                aria-label={detail}
                onClick={() => openHistory({ start: row.start, end: row.end })}
                className="flex min-w-16 flex-1 flex-col items-center gap-2 rounded px-1 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <span className="text-sm font-bold">{row.count}</span>
                <span
                  className="w-full max-w-12 rounded-t bg-violet-500"
                  style={{
                    height: `${row.count ? Math.max(4, (row.count / max) * 130) : 0}px`,
                  }}
                />
                <span className="text-sm text-slate-600">{label}</span>
                <span className="text-xs text-slate-600">
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
