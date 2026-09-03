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

export function formatAcademicStatus(value) {
  const labels = {
    not_started: "Not Started",
    needs_to_finish: "Needs to Finish",
    in_progress: "In Progress",
    completed: "Completed",
    canceled: "Canceled",
    verified: "Completed"
  };
  return labels[value] || "Record";
}

export function getAcademicStatusTone(value) {
  if (value === "completed" || value === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "in_progress") return "border-violet-200 bg-violet-50 text-violet-800";
  if (value === "needs_to_finish") return "border-amber-200 bg-amber-50 text-amber-900";
  if (value === "canceled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-800";
}
