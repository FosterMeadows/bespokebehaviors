import { behaviorSchoolYear } from "./behaviorRecords.js";
import { canOverrideBehaviorThreshold, canUseBehavior, getAllowedGradeLevels } from "./access.js";

export function buildBehaviorStudentStats(students, records, profile, schoolYear = behaviorSchoolYear()) {
  if (!canUseBehavior(profile)) return [];
  const grades = getAllowedGradeLevels(profile);
  const counts = new Map();
  for (const record of records) {
    if (record.status !== "served" || behaviorSchoolYear(record.reteachDate || record.createdAt) !== schoolYear) continue;
    counts.set(record.studentId, (counts.get(record.studentId) || 0) + 1);
  }
  return students
    .filter(student => student.active !== false && student.archived !== true
      && (canOverrideBehaviorThreshold(profile) || grades.includes(String(student.grade)))
      && counts.has(student.id))
    .map(student => ({ ...student, served: counts.get(student.id) }));
}

export function filterBehaviorStudentStats(rows, { search = "", grade = "", sort = "most" }) {
  const compare = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
  return rows.filter(row => (!grade || String(row.grade) === grade)
    && row.displayName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const primary = sort === "most" ? b.served - a.served
        : sort === "least" ? a.served - b.served
          : sort === "grade" ? compare(a.grade, b.grade)
            : sort === "homeroom" ? compare(a.homeroom, b.homeroom)
              : sort === "student-desc" ? compare(b.displayName, a.displayName) : 0;
      return primary || compare(a.displayName, b.displayName) || compare(a.id, b.id);
    });
}
