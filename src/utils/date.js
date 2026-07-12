// src/utils/date.js

// Pin all "day keys" to school time. Stop letting UTC troll you.
export const SCHOOL_TZ = "America/New_York";

// --- UI formatting (keep locale-flexible if you like) ---
export function formatPrettyDate(d, tz = SCHOOL_TZ) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz, month: "long", day: "numeric", year: "numeric"
  }).format(d);
}
export function formatWeekday(d, tz = SCHOOL_TZ) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz, weekday: "long"
  }).format(d);
}

// --- Stable "YYYY-MM-DD" day keys (for Firestore doc IDs/fields) ---
export function toDayKey(date = new Date(), tz = SCHOOL_TZ) {
  // en-CA -> "YYYY-MM-DD" without locale weirdness
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}
export function todayKey(tz = SCHOOL_TZ) {
  return toDayKey(new Date(), tz);
}

// Back-compat: map your old makeDateKey to the stable version.
export function makeDateKey(d) {
  return toDayKey(d, SCHOOL_TZ);
}

// Useful helpers
export function parseDayKey(key) {
  // Returns a Date at 00:00 *local system time* for convenience.
  // Use only for UI; do not rely on absolute ms equality across TZs.
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDaysToKey(key, days, tz = SCHOOL_TZ) {
  const base = parseDayKey(key, tz);
  base.setDate(base.getDate() + days);
  return toDayKey(base, tz);
}

export function lastNDaysKeys(n, endKey = todayKey(), tz = SCHOOL_TZ) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addDaysToKey(endKey, -i, tz));
  return keys;
}

// For <input type="date"> value binding. UI-only.
export function toLocalDateInputValue(d) {
  // Keep this local; it's a UI control, not a storage key.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
