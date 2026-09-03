import { useEffect, useRef, useState } from "react";
import { CANCELLATION_REASONS } from "../utils/behaviorRecords.js";

export default function CancelReteachDialog({ record, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (saving || !reason || (reason === "Other" && !note.trim())) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm({ reason, note });
    } catch (err) {
      setError(err.message || "This reteach could not be cancelled.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="cancel-reteach-title" aria-describedby="cancel-reteach-description"
      onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <h2 id="cancel-reteach-title" className="text-xl font-bold">Cancel Reteach?</h2>
          <p className="mt-1 font-semibold">{record.studentName} · {record.context}</p>
          <p id="cancel-reteach-description" className="mt-2 text-sm leading-6 text-slate-600">This removes the reteach from To Serve and active counts. The assigning teacher will see who cancelled it and why in My Reteaches. Any pending home contact linked to this reteach will be withdrawn; completed contacts stay on record.</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <label className="block text-sm font-semibold">Cancellation Reason
          <select autoFocus required value={reason} onChange={event => setReason(event.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 focus:outline-none focus:ring-2 focus:ring-red-300">
            <option value="">Select a Reason</option>
            {CANCELLATION_REASONS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        {reason === "Elevated to Referral" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Record the referral through your school's referral process. Cancelling here does not create a referral.</p>}
        <label className="block text-sm font-semibold">{reason === "Other" ? "Explanation (Required)" : "Additional Details (Optional)"}
          <textarea value={note} onChange={event => setNote(event.target.value)} required={reason === "Other"} disabled={saving} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="Briefly explain the cancellation. Do not include referral narratives or sensitive details." />
          <span className="block text-right text-xs font-normal text-slate-500">{note.length}/500</span>
        </label>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold disabled:opacity-50">Keep Reteach</button>
          <button type="submit" disabled={saving || !reason || (reason === "Other" && !note.trim())} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Cancelling…" : "Cancel Reteach"}</button>
        </div>
      </form>
    </dialog>
  );
}
