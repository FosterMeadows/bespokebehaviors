import { useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDot, LifeBuoy, RotateCcw, Search } from "lucide-react";
import { AuthContext } from "../../AuthContext.jsx";
import { listenSupportReports, setSupportReportStatus } from "../../services/supportReports";

function formatDate(value) {
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : new Date(value || 0));
  return Number.isNaN(date.getTime()) ? "Pending" : date.toLocaleString();
}

export default function SupportReports() {
  const { user, profile } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => listenSupportReports(
    setReports,
    error => setMessage(`Support reports could not be loaded: ${error.message}`)
  ), []);

  const openReports = reports.filter(item => item.status !== "resolved");
  const resolvedReports = reports.filter(item => item.status === "resolved");
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter(item => status === "all" || (status === "open" ? item.status !== "resolved" : item.status === "resolved"))
      .filter(item => !term || [item.reference, item.reporterName, item.reporterEmail, item.issue, item.route].some(value => String(value || "").toLowerCase().includes(term)));
  }, [reports, search, status]);

  async function changeStatus(report, nextStatus) {
    setSavingId(report.id);
    setMessage("");
    try {
      await setSupportReportStatus(report.id, nextStatus, {
        uid: user?.uid || "",
        name: profile?.displayName || user?.displayName || user?.email || "Administrator"
      });
      setMessage(`${report.reference} marked ${nextStatus}.`);
    } catch (error) {
      setMessage(`Report status could not be changed: ${error.message}`);
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shadow-sm ring-1 ring-sky-200"><LifeBuoy className="h-5 w-5" /></div>
        <div><h1 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Support Feed</h1><p className="mt-0.5 text-sm text-slate-600">Review problem reports submitted from inside Checkpoint.</p></div>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            {[{ value: "open", label: `Open (${openReports.length})` }, { value: "resolved", label: `Resolved (${resolvedReports.length})` }, { value: "all", label: `All (${reports.length})` }].map(option => <button key={option.value} type="button" onClick={() => setStatus(option.value)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${status === option.value ? "bg-white text-sky-900 shadow-sm" : "text-slate-600"}`}>{option.label}</button>)}
          </div>
          <label className="relative w-80 max-w-full"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search support reports</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reports…" className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" /></label>
        </div>
        {message && <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">{message}</div>}
        {visible.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-600">No support reports match this view.</div> : (
          <div className="divide-y divide-slate-200">
            {visible.map(report => {
              const resolved = report.status === "resolved";
              return <article key={report.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold text-sky-800">{report.reference}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${resolved ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{resolved ? <CheckCircle2 className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}{resolved ? "Resolved" : "Open"}</span></div>
                    <h2 className="mt-2 text-base font-bold text-slate-950">{report.reporterName || "Staff Member"}</h2>
                    <div className="mt-0.5 text-xs text-slate-500">{report.reporterEmail || "No email"} · {formatDate(report.createdAt)} · {report.route || "/"}</div>
                  </div>
                  <button type="button" disabled={savingId === report.id} onClick={() => changeStatus(report, resolved ? "open" : "resolved")} className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold disabled:opacity-50 ${resolved ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}>{resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{savingId === report.id ? "Saving…" : resolved ? "Reopen" : "Mark Resolved"}</button>
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">What happened</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-900">{report.issue}</p></div>
                {report.attempted && <div className="mt-2 border-l-4 border-sky-200 bg-sky-50/60 px-3 py-2.5"><div className="text-xs font-bold uppercase tracking-wide text-sky-800">Trying to do</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{report.attempted}</p></div>}
                <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer font-semibold text-slate-600">Technical context</summary><div className="mt-2 break-words rounded-md bg-slate-50 px-3 py-2 leading-5">Release: {report.release || "Unknown"}<br />Connection: {report.online === false ? "Offline" : "Online"}<br />Browser: {report.userAgent || "Unknown"}{resolved && <><br />Resolved by: {report.resolvedByName || "Administrator"} · {formatDate(report.resolvedAt)}</>}</div></details>
              </article>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
