// Shared with the browser so cache identity and staleness use the same inputs.
export const ANALYSIS_VERSION = "served-notes-v2";
export const MAX_ANALYSIS_RECORDS = 500;
export const CATEGORY_OPTIONS = [
  "Disruption",
  "Off-Task Behavior",
  "Failure to Follow Directions",
  "Disrespectful Communication",
  "Inappropriate Language",
  "Peer Conflict",
  "Physical Contact or Horseplay",
  "Unsafe Behavior",
  "Technology Misuse",
  "Materials or Property Misuse",
  "Out of Assigned Area",
  "Routine or Procedure Violation",
  "Other",
];

export function normalizeAnalysisScope(input = {}) {
  const scope = {};
  for (const key of [
    "start",
    "end",
    "grade",
    "teacher",
    "context",
    "location",
    "student",
  ]) {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > 150)
      throw new Error("Invalid analysis filter.");
    scope[key] = value === "all" ? "" : value.trim();
  }
  for (const key of ["start", "end"]) {
    const value = scope[key];
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new Error("Choose valid analysis dates.");
  }
  if (scope.start && scope.end && scope.start > scope.end)
    throw new Error("The start date must precede the end date.");
  scope.timeZone = input.timeZone || "America/New_York";
  if (typeof scope.timeZone !== "string" || scope.timeZone.length > 80)
    throw new Error("Invalid time zone.");
  new Intl.DateTimeFormat("en-US", { timeZone: scope.timeZone }).format(
    new Date(),
  );
  return scope;
}

export function servedDay(record, timeZone) {
  const value = record.servedAt || record.reteachDate || record.createdAt;
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const date =
    value?.toDate?.() ||
    (typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : new Date(value));
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function selectAnalysisRecords(records, scope) {
  return records
    .filter((record) => {
      const day = servedDay(record, scope.timeZone);
      if (
        record.status !== "served" ||
        !day ||
        (scope.start && day < scope.start) ||
        (scope.end && day > scope.end)
      )
        return false;
      return [
        ["grade", "grade", "Unknown grade"],
        ["teacher", "assignedByUid", "__unknown__"],
        ["context", "context", "Not recorded"],
        ["location", "location", "Not recorded"],
        ["student", "studentId", "Not recorded"],
      ].every(
        ([key, field, fallback]) =>
          !scope[key] ||
          (String(record[field] || "").trim() || fallback) === scope[key],
      );
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function scopeIdentity(scope) {
  return JSON.stringify({
    version: ANALYSIS_VERSION,
    scope: normalizeAnalysisScope(scope),
  });
}

export function sourceIdentity(records, scope) {
  return JSON.stringify({
    version: ANALYSIS_VERSION,
    scope: normalizeAnalysisScope(scope),
    records: selectAnalysisRecords(records, scope).map((record) => ({
      id: record.id,
      studentId: record.studentId || "",
      studentName: record.studentName || "",
      teacherId: record.assignedByUid || "",
      teacherName: record.assignedByName || "",
      grade: record.grade || "",
      category: record.context || "",
      location: record.location || "",
      day: servedDay(record, scope.timeZone),
      note: record.note || "",
    })),
  });
}
