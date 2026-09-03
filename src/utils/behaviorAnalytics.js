import { behaviorSchoolYear } from "./behaviorRecords.js";

export function analyticsDate(value) {
  if (!value) return null;
  const date = value?.toDate?.()
    || (typeof value?.seconds === "number" ? new Date(value.seconds * 1000) : null)
    || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value));
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function schoolYearBounds(schoolYear = behaviorSchoolYear()) {
  const startYear = Number(String(schoolYear).split("-")[0]);
  if (!Number.isFinite(startYear)) return { start: "", end: "" };
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` };
}

export function recordSchoolYear(record) {
  return record?.schoolYear || behaviorSchoolYear(record?.reteachDate || record?.servedAt || record?.createdAt);
}

export function servedRecordDate(record) {
  return analyticsDate(record?.servedAt || record?.reteachDate || record?.createdAt);
}

function cleanDimension(value, fallback) {
  const cleaned = String(value || "").trim();
  return cleaned || fallback;
}

function inDateRange(record, start, end) {
  const date = servedRecordDate(record);
  if (!date) return false;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return (!start || day >= start) && (!end || day <= end);
}

function rankedCounts(records, field, fallback) {
  const counts = new Map();
  records.forEach(record => {
    const label = cleanDimension(record[field], fallback);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildBehaviorAnalytics(records, { start = "", end = "", grade = "all" } = {}) {
  const served = records.filter(record => record?.status === "served" && inDateRange(record, start, end));
  const grades = [...new Set(served.map(record => cleanDimension(record.grade, "Unknown grade")))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const scoped = grade === "all" ? served : served.filter(record => cleanDimension(record.grade, "Unknown grade") === grade);
  const gradeCounts = rankedCounts(served, "grade", "Unknown grade");
  const contexts = rankedCounts(scoped, "context", "Not recorded");
  const locations = rankedCounts(scoped, "location", "Not recorded");
  const gradeTotals = Object.fromEntries(gradeCounts.map(item => [item.label, item.count]));
  const contextByGrade = contexts.map(context => ({
    ...context,
    grades: grades.map(gradeLabel => {
      const count = served.filter(record => (
        cleanDimension(record.context, "Not recorded") === context.label
        && cleanDimension(record.grade, "Unknown grade") === gradeLabel
      )).length;
      return {
        grade: gradeLabel,
        count,
        percent: gradeTotals[gradeLabel] ? (count / gradeTotals[gradeLabel]) * 100 : 0
      };
    })
  }));
  const monthlyMap = new Map();
  scoped.forEach(record => {
    const date = servedRecordDate(record);
    if (!date) return;
    const key = monthKey(date);
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
  });
  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, count }));

  return {
    total: scoped.length,
    grades,
    gradeCounts,
    contexts,
    locations,
    contextByGrade,
    monthly,
    topGrade: gradeCounts[0] || null,
    topContext: contexts[0] || null,
    topLocation: locations[0] || null
  };
}
