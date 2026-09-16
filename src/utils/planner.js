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

export function instructionReport({ start, end, sequences = [], events = [], weeks = [], standards = [] }) {
  const inRange = (date) => date && date >= start && date <= end;
  const standardText = (code) => `${code}: ${standards.find((item) => item.code === code)?.text || "Description unavailable"}`;
  const entries = [];
  const coverage = new Map();
  const addCoverage = (items, date, title, weekly = false) => {
    for (const item of items || []) {
      const evidence = coverage.get(item.standardCode) || [];
      evidence.push({ ...item, date, title, weekly });
      coverage.set(item.standardCode, evidence);
    }
  };
  const recorded = events.filter((event) => inRange(event.date) && ["step", "sequence"].includes(event.kind));
  for (const event of recorded) {
    const lines = [];
    if (event.kind === "step") {
      lines.push(`Step completed: ${event.step.title}`);
      if (event.step.purpose) lines.push(`Objective: ${event.step.purpose}`);
      (event.step.studentExperience || []).forEach((item) => {
        if (item.text) lines.push(`Activity: ${item.text}`);
        if (safeMaterialsUrl(item.url)) lines.push(`Resource: ${item.url}`);
      });
      if (event.step.result) lines.push(`Expected result: ${event.step.result}`);
      if (event.possibleStandards?.length) lines.push(`Planning standards (coverage not yet confirmed): ${event.possibleStandards.join(", ")}`);
    } else {
      lines.push("Sequence completed");
      if (event.outcome) lines.push(`Objective: ${event.outcome}`);
      (event.standardCoverage || []).forEach((item) => lines.push(`Confirmed ${item.coverageLevel}: ${item.standardCode}`));
      if (event.reflection) lines.push(`Reflection: ${event.reflection}`);
      addCoverage(event.standardCoverage, event.date, `ELA: ${event.sequenceTitle}`);
    }
    entries.push({ date: event.date, title: `ELA | ${event.sequenceTitle}`, lines, order: event.kind === "step" ? 2 : 3, time: event.recordedAt?.seconds || 0 });
  }
  const legacy = sequences.filter((sequence) => inRange(timestampDate(sequence.completedAt)) && !events.some((event) => event.kind === "sequence" && event.sequenceId === sequence.id));
  for (const sequence of legacy) {
    const date = timestampDate(sequence.completedAt);
    const lines = ["Historical sequence completion; individual step dates were not recorded."];
    if (sequence.outcome) lines.push(`Objective: ${sequence.outcome}`);
    (sequence.steps || []).filter((step) => step.status === "complete").forEach((step) => lines.push(`Completed step: ${step.title}${step.purpose ? ` - ${step.purpose}` : ""}`));
    if (sequence.sequenceReflection) lines.push(`Reflection: ${sequence.sequenceReflection}`);
    entries.push({ date, title: `ELA | ${sequence.title}`, lines, order: 3, time: sequence.completedAt?.seconds || 0 });
    addCoverage(sequence.standardCoverage, date, `ELA: ${sequence.title}`);
  }
  const completed = weeks.filter((week) => week.status === "complete" && inRange(week.week));
  for (const week of completed) {
    const lines = [];
    if (week.materialsUrl) lines.push(`Materials: ${week.materialsUrl}`);
    if (week.notes?.trim()) lines.push(`Implementation notes: ${week.notes.trim()}`);
    lines.push(`Practiced: ${(week.standards || []).join(", ")}`);
    if (week.reflection) lines.push(`Reflection: ${week.reflection}`);
    entries.push({ date: week.week, weekly: true, title: `WIN | ${week.title}`, lines, order: 0, time: 0 });
    addCoverage((week.standards || []).map((standardCode) => ({ standardCode, coverageLevel: "practiced" })), week.week, `WIN: ${week.title}`, true);
  }
  const skills = assignedSkills(weeks).filter((skill) => inRange(skill.week));
  for (const skill of skills) entries.push({ date: skill.week, weekly: true, title: `IXL | ${skill.name}`, lines: [`Assigned skill: ${skill.code} (assignment does not confirm completion or mastery)`], order: 1, time: 0 });
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.time - b.time || a.order - b.order || a.title.localeCompare(b.title));
  const lines = ["Instruction Record", `${displayDate(start)} - ${displayDate(end)}`, "", "PERIOD OVERVIEW",
    `${recorded.filter((event) => event.kind === "step").length} dated steps completed | ${recorded.filter((event) => event.kind === "sequence").length + legacy.length} sequences completed`,
    `${completed.length} WIN weeks completed | ${skills.length} IXL assignments | ${coverage.size} distinct standards with confirmed coverage`,
    "", "CHRONOLOGICAL INSTRUCTION RECORD",
    "ELA dates reflect recorded completion. WIN and IXL are weekly records, included by their Monday date.", ""];
  for (const entry of entries) lines.push(`${entry.weekly ? "Week of " : ""}${displayDate(entry.date)} | ${entry.title}`, ...entry.lines, "");
  if (!entries.length) lines.push("No instruction records in this date range.", "");
  lines.push("STANDARDS COVERAGE SUMMARY", "Confirmed coverage within the selected period. Coverage does not establish student mastery.", "");
  for (const [code, evidence] of [...coverage].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    evidence.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    const levels = [...new Set(evidence.map((item) => item.coverageLevel))];
    lines.push(standardText(code), `Recorded coverage: ${levels.join(", ")}`,
      `Summary: ${evidence.filter((item) => !item.weekly).length} ELA sequence completion(s) and ${evidence.filter((item) => item.weekly).length} completed WIN week(s) document this standard.`);
    for (const item of evidence) lines.push(`- ${item.weekly ? "Week of " : ""}${displayDate(item.date)} | ${item.title} | ${item.coverageLevel}${item.needsRevisit ? " | Revisit needed" : ""}${item.note ? ` - ${item.note}` : ""}`);
    lines.push("");
  }
  if (!coverage.size) lines.push("No confirmed standards coverage in this date range.");
  return lines.join("\n");
}

// Older saved reports are plain text; keep them readable without regeneration.
export function instructionReportText(report) {
  const text = report.text || "";
  if (!report.narrative?.trim()) return text;
  const lines = text.split("\n");
  lines.splice(2, 0, "", "NARRATIVE SUMMARY", report.narrative.trim());
  return lines.join("\n");
}
