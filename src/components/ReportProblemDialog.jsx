import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquareWarning, X } from "lucide-react";
import { createSupportReport } from "../services/supportReports";

export default function ReportProblemDialog({ open, onClose, currentPath, reporterName }) {
  const issueRef = useRef(null);
  const [issue, setIssue] = useState("");
  const [attempted, setAttempted] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setTimeout(() => issueRef.current?.focus(), 0);
    const onKeyDown = event => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, saving]);

  useEffect(() => {
    if (open) return;
    setIssue("");
    setAttempted("");
    setError("");
    setReference("");
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!issue.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const nextReference = await createSupportReport({ issue, attempted, route: currentPath, reporterName });
      setReference(nextReference);
    } catch (submitError) {
      setError(submitError.message || "The report could not be sent. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="report-problem-title">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200"><MessageSquareWarning className="h-5 w-5" /></span>
            <div><h2 id="report-problem-title" className="text-lg font-bold text-slate-950">Report a Problem</h2><p className="mt-0.5 text-sm text-slate-600">Send a private report to the app administrators.</p></div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close report form" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        {reference ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
            <h3 className="mt-3 text-lg font-bold text-slate-950">Report sent</h3>
            <p className="mt-2 text-sm text-slate-600">Your reference is <span className="font-bold text-slate-900">{reference}</span>.</p>
            <button type="button" onClick={onClose} className="mt-5 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              Do not include student names, grades, IEP information, counseling details, discipline narratives, or other sensitive student information.
            </div>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{error}</div>}
            <label className="block">
              <span className="text-sm font-bold text-slate-800">What happened?</span>
              <textarea ref={issueRef} value={issue} onChange={event => setIssue(event.target.value)} maxLength={1200} required placeholder="Describe the problem and any message you saw." className="mt-1.5 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" />
              <span className="mt-1 block text-right text-xs text-slate-500">{issue.length}/1200</span>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">What were you trying to do? <span className="font-medium text-slate-500">(optional)</span></span>
              <textarea value={attempted} onChange={event => setAttempted(event.target.value)} maxLength={600} placeholder="For example: mark a reteach served." className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" />
            </label>
            <p className="text-xs leading-5 text-slate-500">Your name, email, current page, browser, and submission time will be included automatically.</p>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={!issue.trim() || saving} className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Sending…" : "Send Report"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
