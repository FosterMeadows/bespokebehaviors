const TERMINAL_ACADEMIC_STATES = new Set(["completed", "verified", "canceled", "cancelled"]);

export function metricDate(value) {
  if (!value) return null;
  const date = value?.toDate
    ? value.toDate()
    : typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`)
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfWindow(now, days) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return start;
}

function ageInDays(value, now) {
  const date = metricDate(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function isOpenAcademic(task) {
  const state = String(task.state || "not_started").toLowerCase();
  return task.active !== false && !TERMINAL_ACADEMIC_STATES.has(state);
}

function isAcademicComplete(task) {
  const state = String(task.state || "").toLowerCase();
  return state === "completed" || state === "verified" || task.archived === true;
}

function inWindow(value, start, now) {
  const date = metricDate(value);
  return Boolean(date && date >= start && date <= now);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function elapsedHours(startValue, endValue) {
  const start = metricDate(startValue);
  const end = metricDate(endValue);
  if (!start || !end || end < start) return null;
  return (end.getTime() - start.getTime()) / 3_600_000;
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

export function buildOperationalMetrics({
  tasks = [],
  behaviorRecords = [],
  sessions = [],
  homeContacts = [],
  students = [],
  days = 30,
  staleDays = 7,
  now = new Date()
} = {}) {
  const windowStart = startOfWindow(now, days);
  const studentGrades = new Map(students.map(student => [student.id, String(student.grade || "Unassigned")]));
  const openAcademic = tasks.filter(isOpenAcademic);
  const pendingBehavior = behaviorRecords.filter(record => record.status === "pending");
  const pendingContacts = homeContacts.filter(record => record.status === "pending");

  const academicCohort = tasks.filter(task =>
    !["canceled", "cancelled"].includes(String(task.state || "").toLowerCase())
    && inWindow(task.assignedAt || task.createdAt, windowStart, now)
  );
  const completedAcademic = academicCohort.filter(isAcademicComplete);
  const behaviorCohort = behaviorRecords.filter(record => record.status !== "cancelled" && inWindow(record.createdAt || record.reteachDate, windowStart, now));
  const servedBehavior = behaviorCohort.filter(record => record.status === "served");
  const recentSessions = sessions.filter(session => inWindow(session.date || session.startedAt, windowStart, now));

  const academicTurnaround = completedAcademic
    .map(task => elapsedHours(task.assignedAt || task.createdAt, task.completedAt || task.lastUpdated))
    .filter(value => value !== null);
  const behaviorTurnaround = servedBehavior
    .map(record => elapsedHours(record.createdAt || record.reteachDate, record.servedAt))
    .filter(value => value !== null);

  const sessionTotals = recentSessions.reduce((totals, session) => {
    const roster = Array.isArray(session.roster) ? session.roster : [];
    const outcomes = session.outcomes || {};
    const present = roster.filter(studentId => outcomes[studentId]?.status === "present").length;
    const noShows = roster.filter(studentId => outcomes[studentId]?.status === "no_show").length;
    totals.rostered += roster.length;
    totals.present += present;
    totals.noShows += noShows;
    totals.peakRoster = Math.max(totals.peakRoster, roster.length);
    return totals;
  }, { rostered: 0, present: 0, noShows: 0, peakRoster: 0 });

  const gradeMap = new Map();
  const ensureGrade = grade => {
    const label = grade && grade !== "Unassigned" ? grade : "Unassigned";
    if (!gradeMap.has(label)) gradeMap.set(label, {
      grade: label,
      academicItems: 0,
      behaviorItems: 0,
      studentIds: new Set(),
      oldestDays: 0
    });
    return gradeMap.get(label);
  };

  openAcademic.forEach(task => {
    const row = ensureGrade(studentGrades.get(task.studentId));
    row.academicItems += 1;
    if (task.studentId) row.studentIds.add(task.studentId);
    row.oldestDays = Math.max(row.oldestDays, ageInDays(task.assignedAt || task.createdAt, now));
  });
  pendingBehavior.forEach(record => {
    const row = ensureGrade(record.grade || studentGrades.get(record.studentId));
    row.behaviorItems += 1;
    if (record.studentId) row.studentIds.add(record.studentId);
    row.oldestDays = Math.max(row.oldestDays, ageInDays(record.createdAt || record.reteachDate, now));
  });

  const gradeWorkload = [...gradeMap.values()]
    .map(row => ({ ...row, waitingStudents: row.studentIds.size, studentIds: undefined }))
    .sort((a, b) => {
      if (a.grade === "Unassigned") return 1;
      if (b.grade === "Unassigned") return -1;
      return a.grade.localeCompare(b.grade, undefined, { numeric: true });
    });

  const academicAged = openAcademic.filter(task => ageInDays(task.assignedAt || task.createdAt, now) >= staleDays).length;
  const behaviorAged = pendingBehavior.filter(record => ageInDays(record.createdAt || record.reteachDate, now) >= staleDays).length;

  return {
    days,
    openAcademic: openAcademic.length,
    pendingBehavior: pendingBehavior.length,
    agedItems: academicAged + behaviorAged,
    academicAged,
    behaviorAged,
    pendingContacts: pendingContacts.length,
    academicCompletionRate: percentage(completedAcademic.length, academicCohort.length),
    academicCompleted: completedAcademic.length,
    academicCohort: academicCohort.length,
    behaviorServiceRate: percentage(servedBehavior.length, behaviorCohort.length),
    behaviorServed: servedBehavior.length,
    behaviorCohort: behaviorCohort.length,
    medianAcademicHours: median(academicTurnaround),
    medianBehaviorHours: median(behaviorTurnaround),
    sessions: recentSessions.length,
    ...sessionTotals,
    sessionAttendanceRate: percentage(sessionTotals.present, sessionTotals.present + sessionTotals.noShows),
    averageRoster: recentSessions.length ? sessionTotals.rostered / recentSessions.length : 0,
    gradeWorkload
  };
}
