

export function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:px-3 ${
        active ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

export function TabCount({ children, active = false, attention = false }) {
  const tone = attention
    ? "bg-amber-100 text-amber-900 ring-amber-200"
    : active
      ? "bg-emerald-200/80 text-emerald-950 ring-emerald-300"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 ${tone}`}>
      {children}
    </span>
  );
}
