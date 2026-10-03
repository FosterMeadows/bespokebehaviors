import { toDayKey } from "./date.js";

// Calendar days in SCHOOL_TZ; update thresholds here, not in components.
export const ACADEMIC_AGE_THRESHOLDS = Object.freeze({ aging: 7, stuck: 14 });
const CLOSED_STATES = new Set(["completed", "verified", "canceled", "cancelled", "removed", "archived"]);
const DAY_MS = 86_400_000;

export function isOpenAcademicAssignment(task) {
  return task?.active === true && task.archived !== true
    && !CLOSED_STATES.has(String(task.state || "not_started").trim().toLowerCase());
}

function calendarDayNumber(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
  return date.getTime() / DAY_MS;
}

function schoolDayNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return calendarDayNumber(value);
    // Legacy strings must identify an instant. Ambiguous local date-times are
    // unknown rather than changing age with the device's timezone.
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
      || calendarDayNumber(value.slice(0, 10)) === null) return null;
  }
  try {
    const date = value instanceof Date ? value
      : typeof value?.toDate === "function" ? value.toDate()
        : typeof value?.seconds === "number" ? new Date(value.seconds * 1000)
          : typeof value === "number" || typeof value === "string" ? new Date(value) : null;
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
    return calendarDayNumber(toDayKey(date));
  } catch {
    return null;
  }
}

export function getAcademicAssignmentAge(task, now = new Date()) {
  if (!isOpenAcademicAssignment(task)) return null;
  // assignedAt is authoritative. Use the existing creation date only when it
  // is absent; a malformed assignment date must not masquerade as fresh work.
  const assignedDay = schoolDayNumber(task.assignedAt ?? task.createdAt);
  const today = schoolDayNumber(now);
  if (assignedDay === null || today === null) return null;
  return Math.max(0, today - assignedDay);
}

function classifyDays(days) {
  if (days === null) return "unknown";
  if (days >= ACADEMIC_AGE_THRESHOLDS.stuck) return "stuck";
  if (days >= ACADEMIC_AGE_THRESHOLDS.aging) return "aging";
  return "fresh";
}

export function classifyAcademicAssignmentAge(task, now = new Date()) {
  return isOpenAcademicAssignment(task) ? classifyDays(getAcademicAssignmentAge(task, now)) : null;
}

export function summarizeAcademicAssignmentAges(tasks = [], now = new Date()) {
  const summary = { open: 0, fresh: 0, aging: 0, stuck: 0, unknown: 0, needsAttention: 0, attentionStudents: 0, oldestDays: null };
  const attentionStudents = new Set();
  for (const task of tasks) {
    if (!isOpenAcademicAssignment(task)) continue;
    const days = getAcademicAssignmentAge(task, now);
    const status = classifyDays(days);
    summary.open += 1;
    summary[status] += 1;
    if (days !== null) summary.oldestDays = Math.max(summary.oldestDays ?? 0, days);
    if (status === "aging" || status === "stuck") {
      summary.needsAttention += 1;
      if (task.studentId) attentionStudents.add(task.studentId);
    }
  }
  summary.attentionStudents = attentionStudents.size;
  return summary;
}

// Subject and age filters apply to the same assignment. Rows retain only the
// matching work, while opening a student still shows all their assignments.
export function selectAcademicBacklog(byStudent, studentsMap, filters, now = new Date()) {
  const search = String(filters.search || "").trim().toLowerCase();
  const rows = byStudent.flatMap(([sid, tasks]) => {
    const student = studentsMap[sid] || {};
    if (search && !`${student.displayName || sid} ${student.homeroom || ""}`.toLowerCase().includes(search)) return [];
    const matching = tasks.filter(task => {
      if (!isOpenAcademicAssignment(task) || (filters.subject && task.subject !== filters.subject)) return false;
      if (!filters.age) return true;
      const status = classifyAcademicAssignmentAge(task, now);
      return filters.age === "attention" ? status === "aging" || status === "stuck" : status === filters.age;
    });
    return matching.length ? [[sid, matching]] : [];
  });
  const summaries = new Map(rows.map(([sid, tasks]) => [sid, summarizeAcademicAssignmentAges(tasks, now)]));
  return rows.sort(([aSid], [bSid]) => {
    const a = summaries.get(aSid);
    const b = summaries.get(bSid);
    if (filters.sort === "attention") {
      const attentionOrder = b.needsAttention - a.needsAttention || b.stuck - a.stuck;
      if (attentionOrder) return attentionOrder;
    }
    if (filters.sort === "oldest" || filters.sort === "attention") {
      const ageOrder = (b.oldestDays ?? -1) - (a.oldestDays ?? -1);
      if (ageOrder) return ageOrder;
    }
    return String(studentsMap[aSid]?.displayName || aSid).localeCompare(String(studentsMap[bSid]?.displayName || bSid));
  });
}
