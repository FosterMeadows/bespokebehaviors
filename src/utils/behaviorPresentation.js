export function todayInputValue() {
  return new Date().toLocaleDateString("en-CA");
}

export function formatReteachDate(value) {
  if (!value) return "No date";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(`${value}T00:00:00`));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatServedDateTime(value) {
  if (!value) return "Time unavailable";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatShortReteachDate(value) {
  if (!value) return "No date";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(`${value}T00:00:00`));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function dateSortValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function daysSince(value) {
  if (!value) return 0;
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

export function formatLongInputDate(value) {
  if (!value) return "No date selected";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}
