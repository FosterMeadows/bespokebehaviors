export const CANCELLATION_REASONS = ["Elevated to Referral", "Assigned in Error", "Duplicate", "Other"];

export function behaviorSchoolYear(value = new Date()) {
  const date = value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : new Date(value));
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  return safeDate.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// Schoolwide summaries deliberately exclude notes and cancellation reasons.
export function behaviorSummary(record) {
  return {
    studentId: record.studentId,
    studentName: record.studentName,
    grade: record.grade || "",
    homeroom: record.homeroom || "",
    assignedByUid: record.assignedByUid,
    assignedByName: record.assignedByName,
    reteachDate: record.reteachDate,
    location: record.location,
    context: record.context,
    postThreshold: Boolean(record.postThreshold),
    status: record.status,
    createdAt: record.createdAt,
    servedAt: record.servedAt ?? null,
    servedByUid: record.servedByUid ?? null,
    servedByName: record.servedByName ?? null,
    servedPostThreshold: Boolean(record.servedPostThreshold)
  };
}
