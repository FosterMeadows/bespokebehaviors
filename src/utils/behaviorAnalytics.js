import { behaviorSchoolYear } from "./behaviorRecords.js";

export function analyticsDate(value) {
  if (!value) return null;
  const date =
    value?.toDate?.() ||
    (typeof value?.seconds === "number"
      ? new Date(value.seconds * 1000)
      : null) ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value));
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function schoolYearBounds(schoolYear = behaviorSchoolYear()) {
  const startYear = Number(String(schoolYear).split("-")[0]);
  return Number.isFinite(startYear)
    ? { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` }
    : { start: "", end: "" };
}

export function recordSchoolYear(record) {
  return (
    record?.schoolYear ||
    behaviorSchoolYear(
      record?.reteachDate || record?.servedAt || record?.createdAt,
    )
  );
}

export function servedRecordDate(record) {
  return analyticsDate(
    record?.servedAt || record?.reteachDate || record?.createdAt,
  );
}

export function dimension(record, field) {
  const fallback =
    field === "grade"
      ? "Unknown grade"
      : field === "assignedByUid"
        ? "__unknown__"
        : "Not recorded";
  return String(record?.[field] ?? "").trim() || fallback;
}

export const ANALYTICS_FILTER_KEYS = [
  "start",
  "end",
  "grade",
  "teacher",
  "context",
  "location",
  "student",
  "repeat",
  "topStaff",
  "record",
];

export function filterBehaviorRecords(records, filters = {}) {
  const { start = "", end = "" } = filters;
  let scoped = records.filter((record) => {
    if (record?.status !== "served") return false;
    if (filters.record && record.id !== filters.record) return false;
    const date = servedRecordDate(record);
    if (!date) return false;
    const day = dateKey(date);
    if ((start && day < start) || (end && day > end)) return false;
    return [
      ["grade", "grade"],
      ["teacher", "assignedByUid"],
      ["location", "location"],
      ["context", "context"],
      ["student", "studentId"],
    ].every(
      ([filter, field]) =>
        !filters[filter] ||
        filters[filter] === "all" ||
        dimension(record, field) === filters[filter],
    );
  });
  if (filters.topStaff === "1") {
    const topIds = new Set(
      groupRows(
        scoped.filter((record) => record.assignedByUid),
        "assignedByUid",
      )
        .slice(0, 5)
        .map((row) => row.label),
    );
    scoped = scoped.filter((record) => topIds.has(record.assignedByUid));
  }
  if (filters.repeat !== "1") return scoped;
  const counts = new Map();
  scoped.forEach((record) => {
    if (record.studentId)
      counts.set(record.studentId, (counts.get(record.studentId) || 0) + 1);
  });
  return scoped.filter(
    (record) => record.studentId && counts.get(record.studentId) > 1,
  );
}

function groupRows(records, field) {
  const groups = new Map();
  records.forEach((record) => {
    const key = dimension(record, field);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups]
    .map(([label, rows]) => ({ label, records: rows, ...population(rows) }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
}

function population(records) {
  const students = new Map();
  const teachers = new Set();
  let identifiedRecords = 0;
  records.forEach((record) => {
    if (record.studentId) {
      students.set(record.studentId, (students.get(record.studentId) || 0) + 1);
      identifiedRecords += 1;
    }
    if (record.assignedByUid) teachers.add(record.assignedByUid);
  });
  const repeatStudents = [...students.values()].filter(
    (count) => count > 1,
  ).length;
  return {
    count: records.length,
    uniqueStudents: students.size,
    teacherCount: teachers.size,
    repeatStudents,
    repeatRate: students.size ? (repeatStudents / students.size) * 100 : 0,
    average: students.size ? identifiedRecords / students.size : null,
    missingStudents: records.length - identifiedRecords,
  };
}

function bucketStart(date, interval) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  if (interval === "weekly")
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  else result.setDate(1);
  return result;
}

export function trendRows(
  records,
  { start = "", end = "", interval = "monthly" } = {},
) {
  const dated = records
    .map((record) => ({ record, date: servedRecordDate(record) }))
    .filter((item) => item.date);
  const dates = dated.map((item) => item.date.getTime());
  const from =
    analyticsDate(start) ||
    (dates.length ? new Date(Math.min(...dates)) : null);
  const through =
    analyticsDate(end) || (dates.length ? new Date(Math.max(...dates)) : null);
  if (!from || !through || from > through) return [];
  const groups = new Map();
  dated.forEach(({ record, date }) => {
    const key = dateKey(bucketStart(date, interval));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const rows = [];
  for (let cursor = bucketStart(from, interval); cursor <= through; ) {
    const next = new Date(cursor);
    if (interval === "weekly") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    const last = new Date(next);
    last.setDate(last.getDate() - 1);
    const key = dateKey(cursor);
    rows.push({
      key: interval === "weekly" ? key : key.slice(0, 7),
      start: dateKey(cursor < from ? from : cursor),
      end: dateKey(last > through ? through : last),
      ...population(groups.get(key) || []),
    });
    cursor = next;
  }
  return rows;
}

export function analyticsOptions(records) {
  const served = records.filter((record) => record.status === "served");
  const values = (field) =>
    [...new Set(served.map((record) => dimension(record, field)))].sort(
      (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    );
  const people = (field, nameField) =>
    groupRows(
      served.filter((record) => record[field]),
      field,
    )
      .map((row) => ({
        value: row.label,
        label:
          row.records.find((record) => record[nameField])?.[nameField] ||
          (field === "studentId" ? "Unnamed student" : "Staff member"),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  const teachers = people("assignedByUid", "assignedByName");
  if (served.some((record) => !record.assignedByUid))
    teachers.push({ value: "__unknown__", label: "Unknown assigning staff" });
  return {
    grades: values("grade"),
    contexts: values("context"),
    locations: values("location"),
    teachers,
    students: people("studentId", "studentName"),
  };
}

export function buildBehaviorAnalytics(records, filters = {}) {
  const scoped = filterBehaviorRecords(records, filters);
  const gradeCounts = groupRows(scoped, "grade");
  const grades = gradeCounts
    .map((row) => row.label)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const contexts = groupRows(scoped, "context");
  const locations = groupRows(scoped, "location");
  const teachers = groupRows(scoped, "assignedByUid").map((row) => ({
    ...row,
    name:
      row.label === "__unknown__"
        ? "Unknown assigning staff"
        : row.records.find((record) => record.assignedByName)?.assignedByName ||
          "Staff member",
    topCategory: groupRows(row.records, "context")[0]?.label || "—",
  }));
  const students = groupRows(
    scoped.filter((record) => record.studentId),
    "studentId",
  )
    .map((row) => ({
      ...row,
      name:
        row.records.find((record) => record.studentName)?.studentName ||
        "Unnamed student",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const contextByGrade = contexts.map((context) => ({
    ...context,
    grades: grades.map((grade) => {
      const count = context.records.filter(
        (record) => dimension(record, "grade") === grade,
      ).length;
      const total = gradeCounts.find((row) => row.label === grade).count;
      return { grade, count, percent: total ? (count / total) * 100 : 0 };
    }),
  }));
  const buckets = [
    { label: "1 reteach", min: 1, max: 1 },
    { label: "2–3 reteaches", min: 2, max: 3 },
    { label: "4–5 reteaches", min: 4, max: 5 },
    { label: "6+ reteaches", min: 6, max: Infinity },
  ].map((bucket) => ({
    ...bucket,
    students: students.filter(
      (student) => student.count >= bucket.min && student.count <= bucket.max,
    ),
  }));
  return {
    ...population(scoped),
    total: scoped.length,
    records: scoped,
    grades,
    gradeCounts,
    contexts,
    locations,
    teachers,
    students,
    buckets,
    contextByGrade,
    monthly: trendRows(scoped, filters),
    weekly: trendRows(scoped, { ...filters, interval: "weekly" }),
    topGrade: gradeCounts[0] || null,
    topContext: contexts[0] || null,
    topLocation: locations[0] || null,
    topFiveCount: teachers
      .filter((row) => row.label !== "__unknown__")
      .slice(0, 5)
      .reduce((sum, row) => sum + row.count, 0),
  };
}
