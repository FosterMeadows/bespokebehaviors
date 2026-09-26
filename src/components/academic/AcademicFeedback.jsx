import { Check } from "lucide-react";
import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export function WorkspaceStatus({ mode, count, hostName = "", sessionIsLive = false, sessionReady = true }) {
  const label = !sessionReady ? "Loading Session" : mode === "live" ? "Session In Progress" : sessionIsLive ? "Managing Live Roster" : "Planning";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
      <span className={`h-2 w-2 rounded-full ${sessionIsLive ? "bg-emerald-500" : "bg-sky-500"}`} aria-hidden="true" />
      {label}
      {sessionReady && <span className="font-medium text-slate-500">{count} {count === 1 ? "student" : "students"}</span>}
      {sessionReady && sessionIsLive && hostName && <span className="font-medium text-slate-500">Hosted by {hostName}</span>}
    </div>
  );
}

export function AcademicSuccessToast({ message, children }) {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[1050] flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-sky-700 bg-sky-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">
      <Check className="h-5 w-5 shrink-0 text-sky-300" aria-hidden="true" />
      <span>{message}</span>
      {children}
    </div>
  );
}

export function ConfirmationDialog({ request, onResolve }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onResolve(false);
    };
    document.addEventListener("keydown", onKeyDown);
    setTimeout(() => cancelRef.current?.focus(), 0);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [request, onResolve]);

  if (!request) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="academic-confirm-title"
        aria-describedby="academic-confirm-description"
      >
        <h2 id="academic-confirm-title" className="text-lg font-bold text-slate-950">{request.title}</h2>
        <p id="academic-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">{request.description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResolve(false)}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            Keep working
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 ${
              request.tone === "danger" ? "bg-red-700 hover:bg-red-800 focus:ring-red-300" : "bg-sky-700 hover:bg-sky-800 focus:ring-sky-300"
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
