import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { behaviorThresholdMessage } from "../../utils/behaviorThreshold.js";

export default function BehaviorThresholdDialog({ studentName, count, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="behavior-threshold-title" aria-describedby="behavior-threshold-description"
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-amber-300 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <div className="flex items-center gap-3 text-amber-900">
        <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden="true" />
        <h2 id="behavior-threshold-title" className="text-xl font-bold">Reteach Threshold Reached</h2>
      </div>
      <p className="mt-3 font-semibold">{studentName}</p>
      <p id="behavior-threshold-description" className="mt-2 text-sm leading-6">{behaviorThresholdMessage(count)}</p>
      <div className="mt-5 flex justify-end">
        <button autoFocus type="button" onClick={onClose} className="min-h-11 rounded-lg bg-amber-800 px-4 text-sm font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2">Understood</button>
      </div>
    </dialog>
  );
}
