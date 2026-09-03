import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Tags,
  TrendingUp,
  UsersRound
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router";
import { AuthContext } from "../../AuthContext.jsx";
import { db } from "../../firebaseConfig";
import { behaviorSchoolYear } from "../../utils/behaviorRecords.js";
import { buildBehaviorAnalytics, schoolYearBounds } from "../../utils/behaviorAnalytics.js";

const GRADE_COLORS = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500"];

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

function SummaryCard({ icon: Icon, label, value, detail, tone = "sky" }) {
  const tones = {
    sky: "bg-sky-100 text-sky-700 ring-sky-200",
    violet: "bg-violet-100 text-violet-700 ring-violet-200",
    amber: "bg-amber-100 text-amber-800 ring-amber-200",
    emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200"
  };
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${tones[tone]}`}>
        {React.createElement(Icon, { className: "h-4 w-4", "aria-hidden": true })}
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-950">{value}</div>
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </article>
  );
}

function EmptyChart() {
  return <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">No served reteaches in this range.</div>;
}

function RankedBars({ rows, total, color = "bg-sky-500", onSelect, ariaLabel, formatLabel = value => value }) {
  if (!rows.length) return <EmptyChart />;
  const max = Math.max(...rows.map(row => row.count), 1);
  return (
    <div className="space-y-3" role="list" aria-label={ariaLabel}>
      {rows.map(row => (
        <div key={row.label} role="listitem">
          <button type="button" onClick={() => onSelect(row.label)} className="group block w-full rounded-lg p-1 text-left focus:outline-none focus:ring-2 focus:ring-sky-400">
            <span className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-slate-800 group-hover:text-sky-800">{formatLabel(row.label)}</span>
              <span className="shrink-0 font-bold text-slate-950">{row.count} <span className="font-medium text-slate-500">· {percent(row.count, total)}%</span></span>
            </span>
            <span className="block h-2.5 overflow-hidden rounded-full bg-slate-100">
              <span className={`block h-full rounded-full transition-all group-hover:brightness-90 ${color}`} style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

function MonthlyBars({ rows }) {
  if (!rows.length) return <EmptyChart />;
  const max = Math.max(...rows.map(row => row.count), 1);
  return (
    <div className="flex min-h-52 items-end gap-2 overflow-x-auto border-b border-slate-200 px-1 pt-5" aria-label="Served reteaches by month">
      {rows.map(row => (
        <div key={row.key} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-xs font-bold text-slate-700">{row.count}</span>
          <span className="w-full max-w-16 rounded-t-md bg-violet-500" style={{ height: `${Math.max(8, (row.count / max) * 140)}px` }} />
          <span className="pb-2 text-[11px] font-semibold text-slate-500">{monthLabel(row.key)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      <p className="mb-4 mt-1 text-sm leading-5 text-slate-500">{description}</p>
      {children}
    </section>
  );
}

export default function Analytics() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const currentSchoolYear = behaviorSchoolYear();
  const defaultBounds = schoolYearBounds(currentSchoolYear);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [start, setStart] = useState(defaultBounds.start);
  const [end, setEnd] = useState(defaultBounds.end);
  const [grade, setGrade] = useState("all");

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, "behaviorReteaches"), snapshot => {
      setRecords(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      setLoading(false);
      setError("");
    }, snapshotError => {
      console.error("[Analytics] behavior", snapshotError);
      setError("Behavior analytics could not be loaded.");
      setLoading(false);
    });
  }, [user]);

  const analytics = useMemo(() => buildBehaviorAnalytics(records, { start, end, grade }), [end, grade, records, start]);
  const allTotal = analytics.gradeCounts.reduce((sum, row) => sum + row.count, 0);

  const openHistory = filters => {
    const params = new URLSearchParams({ tab: "behavior", start, end, ...filters });
    if (grade !== "all" && !params.has("grade")) params.set("grade", grade);
    navigate(`/history?${params.toString()}`);
  };

  if (!user) return null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700 shadow-sm ring-1 ring-violet-200">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-violet-800">Admin Workspace</div>
            <h1 className="text-xl font-bold text-slate-950">Behavior Analytics</h1>
            <p className="mt-0.5 text-sm text-slate-600">Spot grade, location, and behavior-category trends in served reteaches.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Served records only
        </div>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3" aria-label="Analytics filters">
        <label className="text-sm font-semibold text-slate-700">From
          <input type="date" value={start} onChange={event => setStart(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Through
          <input type="date" value={end} onChange={event => setEnd(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Grade
          <select value={grade} onChange={event => setGrade(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100">
            <option value="all">All grades</option>
            {analytics.grades.map(item => <option key={item} value={item}>Grade {item}</option>)}
          </select>
        </label>
        <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>Default range: {currentSchoolYear} school year</span>
          <button type="button" onClick={() => { setStart(defaultBounds.start); setEnd(defaultBounds.end); setGrade("all"); }} className="font-bold text-violet-700 hover:text-violet-900">Reset filters</button>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">Loading served reteaches…</div> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={TrendingUp} label="Served reteaches" value={analytics.total} detail={grade === "all" ? "Across all grades in this range" : `Grade ${grade} in this range`} />
            <SummaryCard icon={UsersRound} label="Highest-volume grade" value={analytics.topGrade ? `Grade ${analytics.topGrade.label}` : "—"} detail={analytics.topGrade ? `${analytics.topGrade.count} served · ${percent(analytics.topGrade.count, allTotal)}% of all grades` : "No served records"} tone="violet" />
            <SummaryCard icon={MapPin} label="Top location" value={analytics.topLocation?.label || "—"} detail={analytics.topLocation ? `${analytics.topLocation.count} served · ${percent(analytics.topLocation.count, analytics.total)}% of this view` : "No location data"} tone="amber" />
            <SummaryCard icon={Tags} label="Top behavior category" value={analytics.topContext?.label || "—"} detail={analytics.topContext ? `${analytics.topContext.count} served · ${percent(analytics.topContext.count, analytics.total)}% of this view` : "No category data"} tone="emerald" />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Served reteaches by grade" description="Count and share of all served reteaches. Select a grade to review its records in History.">
              <RankedBars rows={analytics.gradeCounts} total={allTotal} color="bg-violet-500" ariaLabel="Served reteaches by grade" formatLabel={value => `Grade ${value}`} onSelect={value => openHistory({ grade: value })} />
            </ChartCard>
            <ChartCard title="Served reteaches over time" description={grade === "all" ? "Monthly totals across all grades." : `Monthly totals for Grade ${grade}.`}>
              <MonthlyBars rows={analytics.monthly} />
            </ChartCard>
          </section>

          <ChartCard title="Behavior categories by grade" description="Each percentage is the category’s share of that grade’s served reteaches. Select any cell to open the matching History records.">
            {analytics.contextByGrade.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
                  <thead><tr><th className="px-2 text-left text-xs uppercase tracking-wide text-slate-500">Behavior category</th>{analytics.grades.map(item => <th key={item} className="px-2 text-center text-xs uppercase tracking-wide text-slate-500">Grade {item}</th>)}</tr></thead>
                  <tbody>{analytics.contextByGrade.map(context => (
                    <tr key={context.label}>
                      <th className="max-w-64 px-2 text-left font-semibold text-slate-800">{context.label}</th>
                      {context.grades.map((item, index) => (
                        <td key={item.grade} className="px-1">
                          <button type="button" disabled={!item.count} onClick={() => openHistory({ grade: item.grade, context: context.label })} className={`flex min-h-14 w-full flex-col items-center justify-center rounded-lg border px-2 transition focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 ${item.count ? "border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-400 hover:bg-violet-100" : ""}`}>
                            <span className="font-bold">{item.count}</span><span className="text-xs">{Math.round(item.percent)}%</span><span className={`mt-1 block h-1 w-8 rounded-full ${GRADE_COLORS[index % GRADE_COLORS.length]}`} aria-hidden="true" />
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyChart />}
          </ChartCard>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Locations that stand out" description={`Count and share of ${grade === "all" ? "all" : `Grade ${grade}`} served reteaches. Select a location to inspect its records.`}>
              <RankedBars rows={analytics.locations} total={analytics.total} color="bg-amber-500" ariaLabel="Served reteaches by location" onSelect={value => openHistory({ location: value })} />
            </ChartCard>
            <ChartCard title="Behavior categories that stand out" description={`Count and share of ${grade === "all" ? "all" : `Grade ${grade}`} served reteaches. Categories remain separate.`}>
              <RankedBars rows={analytics.contexts} total={analytics.total} color="bg-emerald-500" ariaLabel="Served reteaches by behavior category" onSelect={value => openHistory({ context: value })} />
            </ChartCard>
          </section>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            Counts describe served reteaches, not unique students. Percentages are calculated within the current view unless the chart specifies within-grade percentages.
          </div>
        </>
      )}
    </div>
  );
}
