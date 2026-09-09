import React, { useState } from "react";
import { FileDown } from "lucide-react";
import { dateKey, displayDate, instructionReport } from "../utils/planner.js";
import { saveInstructionReport } from "../services/planner.js";
import { downloadInstructionPdf } from "../utils/instructionPdf.js";
import ela8 from "../data/standards/ela8.json";

export default function InstructionReport({ uid, sequences, weeks, events, reports }) {
  const [start, setStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [end, setEnd] = useState(dateKey());
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const button = "rounded-lg border border-violet-300 px-4 py-2 text-sm font-bold text-violet-800 disabled:opacity-40";
  async function download(report, save = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      if (save) { await saveInstructionReport(uid, report); setMessage("Report snapshot saved."); }
      await downloadInstructionPdf(report.text, `instruction-record-${report.start}-to-${report.end}.pdf`);
    } catch { setError("Could not finish exporting. Your preview is still available; any saved snapshot appears below."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Instruction report</h2><p className="mt-1 text-sm text-slate-600">Dated ELA completions, completed WIN weeks, and IXL assignments. WIN and IXL use the week’s Monday.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Since<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-semibold">Through<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><button disabled={!start || !end || start > end} className={button} onClick={() => { setPreview({ start, end, text: instructionReport({ start, end, sequences, weeks, events, standards: ela8 }) }); setMessage(""); }}>Generate report</button></div>
    {start > end && <p className="mt-2 text-sm text-red-700">Choose an end date on or after the start date.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    {preview && <div className="mt-5 space-y-3"><label className="block text-sm font-bold">Review and edit for submission<textarea className="mt-2 min-h-96 w-full rounded-lg border border-slate-300 p-4 text-sm leading-6" value={preview.text} onChange={(e) => setPreview({ ...preview, text: e.target.value })} /></label><button disabled={busy || !preview.text.trim()} className={`${button} inline-flex items-center gap-2 bg-violet-700 !text-white`} onClick={() => download(preview, true)}><FileDown size={17} />{busy ? "Exporting…" : "Save snapshot & download PDF"}</button></div>}
  </section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Saved reports</h2><div className="mt-3 space-y-2">{[...reports].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((report) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span>{displayDate(report.start)} – {displayDate(report.end)}</span><div className="flex gap-2"><button className={button} onClick={() => setPreview({ start: report.start, end: report.end, text: report.text })}>Review</button><button disabled={busy} className={button} onClick={() => download(report)}>Download PDF</button></div></div>)}{!reports.length && <p className="text-sm text-slate-500">Exported snapshots will appear here.</p>}</div></section></div>;
}
