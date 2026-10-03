import { classifyAcademicAssignmentAge, getAcademicAssignmentAge } from "../../utils/academicAging.js";

export function AssignmentAge({ task, now }) {
  const status = classifyAcademicAssignmentAge(task, now);
  if (status === null || status === "fresh") return null;
  if (status === "unknown") return <span className="text-xs font-medium text-slate-500">Age unknown</span>;
  const days = getAcademicAssignmentAge(task, now);
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${status === "stuck"
      ? "border-amber-300 bg-amber-100 font-bold text-amber-950"
      : "border-slate-200 bg-slate-50 font-medium text-slate-700"}`}>
      {status === "stuck" ? "Stuck" : "Aging"} · {days} days
    </span>
  );
}
