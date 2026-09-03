import { useContext, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Gauge,
  PhoneCall,
  ShieldCheck,
  Users
} from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { AuthContext } from "../../AuthContext";
import { db } from "../../firebaseConfig";
import { canOverrideBehaviorThreshold } from "../../utils/access";
import { buildOperationalMetrics } from "../../utils/operationalMetrics";
import { APP_RELEASE } from "../../utils/release";

const COLLECTIONS = {
  tasks: "tasks",
  behaviorRecords: "behaviorReteachSummaries",
  sessions: "academicSessions",
  students: "students"
};

function formatPercent(value) {
  return value === null ? "—" : `${value}%`;
}

function formatDuration(hours) {
  if (hours === null) return "—";
  if (hours < 24) return `${Math.max(1, Math.round(hours))} hr`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

function MetricCard({ icon, label, value, detail, tone = "sky" }) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700"
  };
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${tones[tone]}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{detail}</p>
    </article>
  );
}

function Panel({ title, description, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export default function OperationalDashboard() {
  const { profile } = useContext(AuthContext);
  const canViewHomeContacts = canOverrideBehaviorThreshold(profile);
  const [days, setDays] = useState(30);
  const [data, setData] = useState({
    tasks: [], behaviorRecords: [], sessions: [], homeContacts: [], students: []
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [clientErrors, setClientErrors] = useState([]);

  useEffect(() => {
    const subscriptions = canViewHomeContacts
      ? { ...COLLECTIONS, homeContacts: "behaviorHomeContactRequirements" }
      : COLLECTIONS;
    const loaded = new Set();
    const unsubs = Object.entries(subscriptions).map(([key, collectionName]) => onSnapshot(
      collection(db, collectionName),
      snapshot => {
        loaded.add(key);
        setData(current => ({
          ...current,
          [key]: snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        }));
        if (loaded.size === Object.keys(subscriptions).length) setLoading(false);
      },
      error => {
        loaded.add(key);
        setErrors(current => current.includes(collectionName) ? current : [...current, collectionName]);
        if (loaded.size === Object.keys(subscriptions).length) setLoading(false);
        console.error(`[OperationalDashboard] ${collectionName}`, error);
      }
    ));
    return () => unsubs.forEach(unsub => unsub());
  }, [canViewHomeContacts]);

  useEffect(() => onSnapshot(
    query(collection(db, "clientErrors"), orderBy("occurredAt", "desc"), limit(50)),
    snapshot => setClientErrors(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => {
      setErrors(current => current.includes("clientErrors") ? current : [...current, "clientErrors"]);
      console.error("[OperationalDashboard] clientErrors", error);
    }
  ), []);

  const metrics = useMemo(() => buildOperationalMetrics({ ...data, days }), [data, days]);
  const maxGradeItems = Math.max(1, ...metrics.gradeWorkload.map(row => row.academicItems + row.behaviorItems));

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-600">Loading operational health…</div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Admin Workspace</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Operational Health</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Aggregate demand, timeliness, and service measures for Academic and Behavior Checkpoint.
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">Current build: {APP_RELEASE}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          Reporting window
          <select
            value={days}
            onChange={event => setDays(Number(event.target.value))}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </header>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          Some measures are unavailable because {errors.join(", ")} could not be loaded.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={<BookOpenCheck className="h-5 w-5" aria-hidden="true" />}
          label="Open Academic"
          value={metrics.openAcademic}
          detail={`${metrics.academicAged} open for 7 days or more`}
        />
        <MetricCard
          icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          label="Pending Behavior"
          value={metrics.pendingBehavior}
          detail={`${metrics.behaviorAged} pending for 7 days or more`}
          tone="violet"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          label="Aged Work"
          value={metrics.agedItems}
          detail="Open Academic and pending Behavior items at least 7 days old"
          tone="amber"
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          label="Academic Completion"
          value={formatPercent(metrics.academicCompletionRate)}
          detail={`${metrics.academicCompleted} of ${metrics.academicCohort} assignments added in this window`}
          tone="emerald"
        />
        <MetricCard
          icon={<Activity className="h-5 w-5" aria-hidden="true" />}
          label="Behavior Service"
          value={formatPercent(metrics.behaviorServiceRate)}
          detail={`${metrics.behaviorServed} of ${metrics.behaviorCohort} reteaches added in this window`}
          tone="emerald"
        />
        <MetricCard
          icon={<PhoneCall className="h-5 w-5" aria-hidden="true" />}
          label="Home Contacts"
          value={canViewHomeContacts ? metrics.pendingContacts : "—"}
          detail={canViewHomeContacts ? "Required contacts that remain outstanding" : "Available to admin and owner roles"}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Current Workload by Grade" description="Open operational items and the number of students represented.">
          {metrics.gradeWorkload.length === 0 ? (
            <EmptyState>No open Academic or pending Behavior work.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Grade</th>
                    <th className="px-3 py-3 text-right">Students</th>
                    <th className="px-3 py-3 text-right">Academic</th>
                    <th className="px-3 py-3 text-right">Behavior</th>
                    <th className="px-5 py-3 text-right">Oldest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.gradeWorkload.map(row => {
                    const total = row.academicItems + row.behaviorItems;
                    return (
                      <tr key={row.grade} className="text-slate-700">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-950">{row.grade === "Unassigned" ? "Unassigned" : `Grade ${row.grade}`}</div>
                          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(8, (total / maxGradeItems) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right font-semibold">{row.waitingStudents}</td>
                        <td className="px-3 py-3.5 text-right">{row.academicItems}</td>
                        <td className="px-3 py-3.5 text-right">{row.behaviorItems}</td>
                        <td className="px-5 py-3.5 text-right">{row.oldestDays}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Turnaround" description={`Median time from assignment to completion or service in the last ${days} days.`}>
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-950">
                <Clock3 className="h-4 w-4 text-sky-700" aria-hidden="true" />
                Academic
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">{formatDuration(metrics.medianAcademicHours)}</div>
              <div className="mt-1 text-xs text-slate-600">Based on {metrics.academicCompleted} completed</div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-violet-950">
                <Clock3 className="h-4 w-4 text-violet-700" aria-hidden="true" />
                Behavior
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">{formatDuration(metrics.medianBehaviorHours)}</div>
              <div className="mt-1 text-xs text-slate-600">Based on {metrics.behaviorServed} served</div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Academic Session Load" description={`Roster demand and recorded outcomes across the last ${days} days.`}>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Sessions", metrics.sessions, <Gauge className="h-4 w-4 text-sky-600" aria-hidden="true" />],
            ["Rostered", metrics.rostered, <Users className="h-4 w-4 text-sky-600" aria-hidden="true" />],
            ["Present", metrics.present, <CheckCircle2 className="h-4 w-4 text-sky-600" aria-hidden="true" />],
            ["No Shows", metrics.noShows, <AlertTriangle className="h-4 w-4 text-sky-600" aria-hidden="true" />],
            ["Avg. Roster", metrics.averageRoster.toFixed(1), <Activity className="h-4 w-4 text-sky-600" aria-hidden="true" />],
            ["Peak Roster", metrics.peakRoster, <BarChart3 className="h-4 w-4 text-sky-600" aria-hidden="true" />]
          ].map(([label, value, icon]) => (
            <div key={label} className="bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                {icon}
                {label}
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-700">
          Recorded attendance rate: <span className="font-bold text-slate-950">{formatPercent(metrics.sessionAttendanceRate)}</span>
          <span className="ml-2 text-xs text-slate-500">Removed and unmarked students are excluded.</span>
        </div>
      </Panel>

      <Panel title="Recent Application Errors" description="Privacy-safe technical signals from the most recent production errors. Student names, notes, and form contents are never collected here.">
        {clientErrors.length === 0 ? <EmptyState>No production errors have been reported.</EmptyState> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Reference</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Release</th><th className="px-5 py-3 text-right">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{clientErrors.slice(0, 20).map(item => <tr key={item.id}><td className="px-5 py-3 font-bold text-red-800">{item.reference}</td><td className="px-3 py-3 text-slate-700">{item.source} · {item.category}</td><td className="px-3 py-3 text-slate-600">{item.route}</td><td className="px-3 py-3 text-slate-600">{item.release}</td><td className="px-5 py-3 text-right text-slate-500">{item.occurredAt?.toDate?.().toLocaleString() || "Pending"}</td></tr>)}</tbody></table></div>
        )}
      </Panel>

      <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        This page reports aggregate operational activity only. It does not rank staff or evaluate individual students.
      </p>
    </div>
  );
}
