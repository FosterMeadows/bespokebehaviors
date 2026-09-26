export function formatSubjectLabel(subject) {
  if (subject === "Sci" || subject === "Science") return "Science";
  if (subject === "SS" || subject === "Social Studies") return "Social Studies";
  return subject || "Other";
}

export function getSubjectTone(subject) {
  if (subject === "Math") return "border-violet-200 bg-violet-50 text-violet-800";
  if (subject === "Sci" || subject === "Science") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (subject === "SS" || subject === "Social Studies") return "border-amber-200 bg-amber-50 text-amber-900";
  if (subject === "ELA") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function getSubjectBorderTone(subject) {
  if (subject === "Math") return "border-l-violet-200";
  if (subject === "Sci" || subject === "Science") return "border-l-emerald-200";
  if (subject === "SS" || subject === "Social Studies") return "border-l-amber-200";
  if (subject === "ELA") return "border-l-sky-200";
  return "border-l-slate-200";
}

export const ACADEMIC_TASK_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Removed" }
];

export function academicStatusOptionValue(value) {
  if (value === "needs_to_finish" || value === "turned_in") return "in_progress";
  if (value === "verified") return "completed";
  if (value === "cancelled") return "canceled";
  return ACADEMIC_TASK_STATUS_OPTIONS.some(option => option.value === value) ? value : "not_started";
}

export function formatAcademicStatus(value) {
  const labels = {
    not_started: "Not Started",
    needs_to_finish: "In Progress",
    turned_in: "In Progress",
    in_progress: "In Progress",
    completed: "Completed",
    canceled: "Removed",
    cancelled: "Removed",
    verified: "Completed"
  };
  return labels[value] || "Record";
}

export function getAcademicStatusTone(value) {
  if (value === "completed" || value === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "in_progress" || value === "needs_to_finish" || value === "turned_in") return "border-violet-200 bg-violet-50 text-violet-800";
  if (value === "canceled" || value === "cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export function formatStudentDetail(grade, homeroom) {
  const cleanHomeroom = String(homeroom || "").trim();
  const homeroomLabel = cleanHomeroom
    ? /\bhr$/i.test(cleanHomeroom) ? cleanHomeroom : `${cleanHomeroom} HR`
    : "";
  return [
    grade ? `Grade ${grade}` : "",
    homeroomLabel
  ].filter(Boolean).join(" • ");
}

export function formatOldestWorkAge(tasks = []) {
  const assignedDates = tasks
    .map(task => task.assignedAt?.toDate?.() || (task.assignedAt?.seconds ? new Date(task.assignedAt.seconds * 1000) : null))
    .filter(Boolean);
  if (assignedDates.length === 0) return "Oldest Work: Unknown";
  const oldest = new Date(Math.min(...assignedDates.map(date => date.getTime())));
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOldest = new Date(oldest.getFullYear(), oldest.getMonth(), oldest.getDate());
  const days = Math.max(0, Math.floor((startToday - startOldest) / 86400000));
  if (days === 0) return "Oldest Work: Today";
  return `Oldest Work: ${days} ${days === 1 ? "Day" : "Days"}`;
}
