import React, { useState } from "react";
import { FileDown } from "lucide-react";
import { dateKey, displayDate, instructionReport, instructionReportText } from "../utils/planner.js";
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
      await downloadInstructionPdf(instructionReportText(report), `instruction-record-${report.start}-to-${report.end}.pdf`);
    } catch { setError("Could not finish exporting. Your preview is still available; any saved snapshot appears below."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Instruction report</h2><p className="mt-1 text-sm text-slate-600">Create a chronological instruction record with standards coverage and your narrative summary. WIN and IXL records are included by their Monday date.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Since<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-semibold">Through<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" /></label><button disabled={busy || !start || !end || start > end} className={button} onClick={() => { setPreview({ start, end, narrative: preview?.narrative || "", text: instructionReport({ start, end, sequences, weeks, events, standards: ela8 }) }); setMessage(""); }}>Generate report</button></div>
    {start > end && <p className="mt-2 text-sm text-red-700">Choose an end date on or after the start date.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    {preview && <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
        <label className="block text-sm font-bold text-slate-900">Narrative summary <span className="font-normal text-slate-500">(optional)</span>
          <textarea disabled={busy} className="mt-2 min-h-40 w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6" placeholder="Describe the instructional focus, progress you observed, reflections, and next steps for this period." value={preview.narrative || ""} onChange={(e) => setPreview({ ...preview, narrative: e.target.value })} />
        </label>
        <p className="mt-2 text-xs text-slate-600">Your summary appears near the beginning of the PDF and is saved with this report.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-bold text-slate-900">Report preview</h3><p className="text-sm text-slate-600">{displayDate(preview.start)} - {displayDate(preview.end)}</p></div>
        <button disabled={busy || !preview.text.trim()} className={`${button} inline-flex items-center gap-2 bg-violet-700 !text-white`} onClick={() => download(preview, true)}><FileDown size={17} />{busy ? "Exporting..." : "Save snapshot & download PDF"}</button>
      </div>
      <article aria-label="Instruction report preview" className="max-h-[44rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        {instructionReportText(preview).split("\n").map((line, index) => {
          if (!line) return <div key={index} className="h-3" />;
          if (line === "Instruction Record") return <h3 key={index} className="text-2xl font-bold text-slate-950">{line}</h3>;
          if (/^(NARRATIVE SUMMARY|PERIOD OVERVIEW|CHRONOLOGICAL INSTRUCTION RECORD|STANDARDS COVERAGE SUMMARY)$/.test(line)) return <h4 key={index} className="mb-3 mt-5 border-b border-violet-200 pb-2 text-sm font-bold tracking-wide text-violet-800">{line}</h4>;
          return <p key={index} className={`whitespace-pre-wrap break-words text-sm leading-7 ${line.includes(" | ELA | ") || line.includes(" | WIN | ") || line.includes(" | IXL | ") ? "mt-2 font-bold text-violet-900" : "text-slate-700"}`}>{line}</p>;
        })}
      </article>
      <details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Edit report details</summary><label className="mt-3 block text-sm text-slate-600">Changes below are included in the saved PDF. Generating a new report replaces these details.
        <textarea disabled={busy} aria-label="Report details" className="mt-2 min-h-96 w-full rounded-lg border border-slate-300 p-4 text-sm leading-6" value={preview.text} onChange={(e) => setPreview({ ...preview, text: e.target.value })} />
      </label></details>
    </div>}
  </section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Saved reports</h2><div className="mt-3 space-y-2">{[...reports].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((report) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span>{displayDate(report.start)} – {displayDate(report.end)}</span><div className="flex gap-2"><button disabled={busy} className={button} onClick={() => setPreview({ start: report.start, end: report.end, text: report.text, narrative: report.narrative || "" })}>Review</button><button disabled={busy} className={button} onClick={() => download(report)}>Download PDF</button></div></div>)}{!reports.length && <p className="text-sm text-slate-500">Exported snapshots will appear here.</p>}</div></section></div>;
}
