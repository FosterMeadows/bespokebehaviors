export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(key, amount) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function mondayOf(key = dateKey()) {
  const date = new Date(`${key}T12:00:00`);
  return addDays(key, -((date.getDay() + 6) % 7));
}

export function displayDate(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function timestampDate(value) {
  const ms = value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : 0);
  return ms ? dateKey(new Date(ms)) : "";
}

export function blankWin(week) {
  return { week, title: "", materialsUrl: "", notes: "", skills: [{ name: "", code: "" }, { name: "", code: "" }], standards: [], reflection: "", status: "draft" };
}

export function safeMaterialsUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}

export function validateWin(win, completing = false) {
  if (win.materialsUrl && !safeMaterialsUrl(win.materialsUrl)) return "Use a complete http or https materials link.";
  for (const skill of win.skills) {
    if ((skill.name || skill.code) && (!skill.name.trim() || !/^[A-Za-z0-9]{3}$/.test(skill.code))) return "Each IXL skill needs its name and three-character code.";
  }
  if (completing) {
    if (!win.title.trim()) return "Add the WIN topic/title.";
    if (!win.reflection.trim()) return "Write a reflection before completing WIN.";
    if (!win.standards.length) return "Confirm at least one standard practiced.";
    if (win.skills.filter((skill) => skill.name.trim() && skill.code).length !== 2) return "Add both weekly IXL skills before completing WIN.";
  }
  return "";
}

export function assignedSkills(weeks) {
  return weeks.flatMap((week) => (week.skills || []).filter((skill) => skill.name && skill.code).map((skill, index) => ({ ...skill, week: week.week, title: week.title, id: `${week.week}-${index}` }))).sort((a, b) => b.week.localeCompare(a.week));
}

export function winAsSequences(weeks) {
  return weeks.filter((week) => week.status === "complete").map((week) => ({
    id: `win-${week.week}`, title: `WIN: ${week.title}`, status: "complete", completedAt: week.completedAt,
    source: "win", href: `/command-center/planner?view=today&date=${week.week}&week=${week.week}`,
    sequenceReflection: week.reflection,
    standardCoverage: week.standards.map((standardCode) => ({ standardCode, coverageLevel: "practiced" })),
  }));
}

// WIN adds evidence without lowering ELA's coverage level or clearing a revisit flag.
export function mergeWinPulse(ela, win) {
  const rank = { not_addressed: 0, introduced: 1, practiced: 2, assessed: 3 };
  return ela.map((standard) => {
    const extra = win.find((item) => item.code === standard.code);
    if (!extra?.history.length) return standard;
    const history = [...standard.history, ...extra.history].sort((a, b) => b.completedAt - a.completedAt);
    const latest = history[0];
    return { ...standard, latestNote: latest.note, latestSequenceId: latest.sequenceId, latestSequenceTitle: latest.sequenceTitle,
      coverageLevel: rank[extra.coverageLevel] > rank[standard.coverageLevel] ? extra.coverageLevel : standard.coverageLevel,
      history, winCount: extra.history.length };
  });
}

export function instructionReport({ start, end, sequences, events, weeks, standards = [] }) {
  const inRange = (date) => date && date >= start && date <= end;
  const standardText = (code) => `${code}: ${standards.find((item) => item.code === code)?.text || ""}`;
  const lines = ["Instruction Record", `${displayDate(start)} - ${displayDate(end)}`, "", "ELA INSTRUCTION", ""];
  const recorded = events.filter((event) => inRange(event.date)).sort((a, b) => a.date.localeCompare(b.date));
  for (const event of recorded) {
    lines.push(`${displayDate(event.date)} | ${event.sequenceTitle}`, event.kind === "step" ? `Step completed: ${event.step.title}` : "Sequence completed",
      `Objective: ${event.kind === "step" ? event.step.purpose : event.outcome}`);
    if (event.kind === "step") {
      (event.step.studentExperience || []).forEach((item) => lines.push(`Activity: ${item.text}`));
      if (event.step.result) lines.push(`Expected result: ${event.step.result}`);
    }
    if (event.kind === "sequence") {
      (event.standardCoverage || []).forEach((item) => lines.push(`${item.coverageLevel}: ${standardText(item.standardCode)}${item.note ? ` — ${item.note}` : ""}`));
      if (event.reflection) lines.push(`Reflection: ${event.reflection}`);
    } else if (event.possibleStandards?.length) {
      lines.push("Sequence planning standards (coverage confirmed on sequence completion):");
      event.possibleStandards.forEach((code) => lines.push(standardText(code)));
    }
    lines.push("");
  }
  const legacy = sequences.filter((sequence) => inRange(timestampDate(sequence.completedAt)) && !events.some((event) => event.kind === "sequence" && event.sequenceId === sequence.id));
  for (const sequence of legacy) {
    lines.push(`${displayDate(timestampDate(sequence.completedAt))} | ${sequence.title}`, `Objective: ${sequence.outcome}`, "Historical sequence completion; individual step dates were not recorded.");
    sequence.steps.filter((step) => step.status === "complete").forEach((step) => lines.push(`Completed step: ${step.title}${step.purpose ? ` — ${step.purpose}` : ""}`));
    (sequence.standardCoverage || []).forEach((item) => lines.push(`${item.coverageLevel}: ${standardText(item.standardCode)}`));
    if (sequence.sequenceReflection) lines.push(`Reflection: ${sequence.sequenceReflection}`);
    lines.push("");
  }
  if (!recorded.length && !legacy.length) lines.push("No dated ELA completions in this period.", "");
  lines.push("WIN INSTRUCTION", "");
  const completed = weeks.filter((week) => week.status === "complete" && inRange(week.week)).sort((a, b) => a.week.localeCompare(b.week));
  completed.forEach((week) => {
    lines.push(`Week of ${displayDate(week.week)} | ${week.title}`);
    if (week.materialsUrl) lines.push(`Materials: ${week.materialsUrl}`);
    if (week.notes?.trim()) {
      lines.push("Implementation Notes:");
      week.notes.split(/\r?\n/).map((note) => note.trim()).filter(Boolean).forEach((note) => lines.push(`- ${note}`));
    }
    week.standards.forEach((code) => lines.push(`Practiced: ${standardText(code)}`));
    lines.push(`Reflection: ${week.reflection}`, "");
  });
  if (!completed.length) lines.push("No completed WIN weeks in this period.", "");
  lines.push("IXL ASSIGNMENTS", "");
  const skills = assignedSkills(weeks).filter((skill) => inRange(skill.week));
  skills.forEach((skill) => lines.push(`${displayDate(skill.week)} | ${skill.name} | ${skill.code}`));
  if (!skills.length) lines.push("No IXL assignments in this period.");
  return lines.join("\n");
}
