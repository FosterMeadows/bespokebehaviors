export default function ReteachCancellationDetails({ record }) {
  if (record.status !== "cancelled") return null;
  const value = record.cancelledAt;
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null);
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-950">
      <div className="font-bold">Cancelled — <span className="uppercase">{record.cancellationReason}</span></div>
      <div className="mt-1 text-xs">Cancelled by {record.cancelledByName || "Staff Member"}{date && !Number.isNaN(date.getTime()) ? ` · ${date.toLocaleString()}` : ""}</div>
      {record.cancellationNote && <p className="mt-2 whitespace-pre-wrap break-words">{record.cancellationNote}</p>}
    </div>
  );
}
