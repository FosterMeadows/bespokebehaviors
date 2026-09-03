import React, { useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, PhoneCall, Search, XCircle } from "lucide-react";
import { AuthContext } from "../../AuthContext.jsx";
import HomeContactForm from "../../components/HomeContactForm.jsx";
import ReteachCancellationDetails from "../../components/ReteachCancellationDetails.jsx";
import { listenAllHomeContactRequirements, recordHomeContactAttempt } from "../../services/behavior";

function toDate(value) {
  if (!value) return null;
  const date = value.toDate?.() || (value.seconds
    ? new Date(value.seconds * 1000)
    : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(startValue, endValue = new Date()) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function formatDate(value) {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) : "Not Recorded";
}

function Metric({ label, value, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950"
  };
  return <div className={`rounded-lg border p-4 ${tones[tone]}`}><div className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</div><div className="mt-1 text-2xl font-extrabold">{value}</div></div>;
}

export default function HomeContacts() {
  const { user, profile } = useContext(AuthContext);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => listenAllHomeContactRequirements(
    setRecords,
    error => setMessage(`Home contacts could not be loaded: ${error.message}`)
  ), []);

  const pending = records.filter(item => item.status === "pending");
  const completed = records.filter(item => item.status === "completed");
  const averageDays = completed.length
    ? (completed.reduce((sum, item) => sum + daysBetween(item.requiredAt, item.completedAt), 0) / completed.length).toFixed(1)
    : "—";
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records
      .filter(item => status === "all" || item.status === status)
      .filter(item => !term || [item.studentName, item.assignedByName, item.grade, item.contactedParty].some(value => String(value || "").toLowerCase().includes(term)))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        return (toDate(a.requiredAt)?.getTime() || 0) - (toDate(b.requiredAt)?.getTime() || 0);
      });
  }, [records, search, status]);

  async function recordAttempt(requirement, details) {
    setSaving(true);
    setMessage("");
    try {
      await recordHomeContactAttempt(requirement.id, details, {
        uid: user?.uid || "",
        name: profile?.displayName || user?.displayName || user?.email || "Staff Member"
      });
      setEditingId(null);
      setMessage(`Home contact attempt recorded for ${requirement.studentName}.`);
    } catch (error) {
      setMessage(`Home contact could not be recorded: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shadow-sm ring-1 ring-amber-200"><PhoneCall className="h-5 w-5" /></div>
        <div><h1 className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Home Contact Follow-Up</h1><p className="mt-0.5 text-sm text-slate-600">Review required attempts and follow-up timing.</p></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="Pending" value={pending.length} tone="amber" />
        <Metric label="Completed" value={completed.length} tone="emerald" />
        <Metric label="Successful" value={completed.filter(item => item.successful).length} tone="sky" />
        <Metric label="Average Days" value={averageDays} />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
            {[{ value: "pending", label: `Pending (${pending.length})` }, { value: "completed", label: `Completed (${completed.length})` }, { value: "cancelled", label: "Withdrawn" }, { value: "all", label: "All" }].map(option => <button key={option.value} type="button" onClick={() => setStatus(option.value)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${status === option.value ? "bg-white text-sky-900 shadow-sm" : "text-slate-600"}`}>{option.label}</button>)}
          </div>
          <label className="relative w-80"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search home contacts</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Student or Teacher…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" /></label>
        </div>
        {message && <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">{message}</div>}
        {visible.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-600">No home contact requirements match this view.</div> : (
          <div className="divide-y divide-slate-200">
            {visible.map(item => {
              const elapsed = daysBetween(item.requiredAt, item.cancelledAt || item.completedAt || new Date());
              return <article key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-base font-bold text-slate-950">{item.studentName}</h2><span className="text-sm font-semibold text-slate-500">Grade {item.grade || "—"}{item.homeroom ? ` · ${item.homeroom}` : ""}</span></div>
                    <div className="mt-1 text-sm text-slate-600">Assigned by <span className="font-semibold text-slate-800">{item.assignedByName}</span> on {formatDate(item.requiredAt)}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${item.status === "cancelled" ? "border-slate-200 bg-slate-50 text-slate-600" : item.status === "pending" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{item.status === "pending" ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{item.status === "cancelled" ? "Withdrawn" : item.status === "pending" ? `${elapsed} Days Pending` : `Completed in ${elapsed} Days`}</span>
                </div>
                {item.status === "cancelled" ? <ReteachCancellationDetails record={item} /> : item.status === "completed" ? <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">{item.successful ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-500" />}{item.contactedParty} · {item.method} · {formatDate(item.attemptDate)} · {item.successful ? "Successful" : "No Contact"}</div>
                  {item.note && <p className="mt-2 border-l-2 border-slate-300 pl-3 leading-6">{item.note}</p>}
                  <div className="mt-2 text-xs font-medium text-slate-500">Recorded by {item.recordedByName || "Staff Member"}</div>
                </div> : editingId === item.id ? <HomeContactForm saving={saving} onCancel={() => setEditingId(null)} onSubmit={details => recordAttempt(item, details)} /> : <button type="button" onClick={() => setEditingId(item.id)} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-xs font-bold text-white"><PhoneCall className="h-3.5 w-3.5" />Record on Behalf of Teacher</button>}
              </article>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
