import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mondayOf, addDays, blankWin, validateWin, assignedSkills, winAsSequences, mergeWinPulse, instructionReport, instructionReportText } from "../src/utils/planner.js";
import { buildStandardsPulse } from "../src/utils/sequenceStandards.js";
import { createInstructionPdf } from "../src/utils/instructionPdf.js";
import { PDFDocument } from "pdf-lib";

const standards = [{ code: "ELA.8.1", text: "Use evidence" }];
const week = { ...blankWin("2026-08-31"), title: "Inference", skills: [{ name: "Make inferences", code: "ABC" }, { name: "Use evidence", code: "DEF" }], standards: ["ELA.8.1"], reflection: "Students explained their evidence.", status: "complete", completedAt: { seconds: 1788480000 } };
describe("instruction planner", () => {
  it("keeps Monday keys stable across weekends, year boundaries, and daylight saving", () => {
    assert.equal(mondayOf("2026-09-06"), "2026-08-31");
    assert.equal(mondayOf("2027-01-01"), "2026-12-28");
    assert.equal(addDays("2026-03-06", 7), "2026-03-13");
  });
  it("allows drafts but requires reflection, standards, and valid skills to complete", () => {
    assert.equal(validateWin(blankWin("2026-08-31")), "");
    assert.equal(validateWin(week, true), "");
    assert.match(validateWin({ ...week, reflection: " " }, true), /reflection/);
    assert.match(validateWin({ ...week, standards: [] }, true), /standard/);
    assert.match(validateWin({ ...week, skills: [{ name: "Test", code: "AB" }] }), /three-character/);
    assert.equal(validateWin({ ...week, skills: [{ name: "Test", code: "A2B" }] }), "");
    assert.match(validateWin({ ...week, materialsUrl: "javascript:alert(1)" }), /http/);
  });
  it("dates assignments to the Monday and never counts a planned WIN week as coverage", () => {
    const draft = { ...week, status: "draft" };
    assert.equal(assignedSkills([draft])[0].week, "2026-08-31");
    assert.equal(winAsSequences([draft]).length, 0);
    assert.equal(winAsSequences([week])[0].standardCoverage[0].coverageLevel, "practiced");
  });
  it("optional WIN evidence never downgrades ELA assessment or clears revisit state", () => {
    const ela = buildStandardsPulse(standards, [{ id: "a", status: "complete", standardCoverage: [{ standardCode: "ELA.8.1", coverageLevel: "assessed", needsRevisit: true }] }]);
    const win = buildStandardsPulse(standards, winAsSequences([week]));
    const merged = mergeWinPulse(ela, win);
    assert.equal(merged[0].coverageLevel, "assessed");
    assert.equal(merged[0].needsRevisit, true);
    assert.equal(merged[0].history.length, 2);
    assert.equal(ela[0].history.length, 1);
    assert.match(merged[0].history[0].href, /planner/);
  });
  it("reports immutable events for active sequences, uses legacy completion dates, and excludes drafts", () => {
    const input = { start: "2026-08-31", end: "2026-09-04", standards,
      sequences: [{ id: "old", title: "Old work", outcome: "Essay", completedAt: { seconds: new Date("2026-09-02T12:00:00").getTime() / 1000 }, steps: [], standardCoverage: [] }],
      weeks: [week, { ...week, week: "2026-09-07", title: "Future lesson", status: "draft" }],
      events: [{ kind: "step", sequenceId: "active", sequenceTitle: "Snapshot title", date: "2026-09-04", step: { title: "Discuss", purpose: "Defend an inference", studentExperience: [] } }, { kind: "step", date: "2026-09-05", sequenceTitle: "Out of range", step: { title: "Outside" } }] };
    const report = instructionReport(input);
    assert.match(report, /Snapshot title/); assert.match(report, /Old work/); assert.match(report, /Inference/);
    assert.doesNotMatch(report, /Future lesson|Out of range/);
    assert.match(report, /Historical sequence completion/);
    const dated = instructionReport({ ...input, events: [...input.events, { kind: "sequence", sequenceId: "old", sequenceTitle: "Old snapshot", date: "2026-09-02" }] });
    assert.doesNotMatch(dated, /Historical sequence completion/);
  });
  it("merges all sources chronologically and summarizes only confirmed coverage", () => {
    const report = instructionReport({ start: "2026-08-31", end: "2026-09-04", standards, weeks: [week],
      sequences: [{ id: "legacy", title: "Historical lesson", completedAt: { seconds: new Date("2026-09-01T12:00:00").getTime() / 1000 }, standardCoverage: [] }],
      events: [
        { kind: "sequence", sequenceId: "a", sequenceTitle: "Final lesson", date: "2026-09-04", standardCoverage: [{ standardCode: "ELA.8.1", coverageLevel: "assessed", note: "Written evidence", needsRevisit: true }] },
        { kind: "step", sequenceTitle: "Middle lesson", date: "2026-09-02", step: { title: "Discuss" }, possibleStandards: ["PLANNED.ONLY"] },
      ] });
    const timeline = report.split("CHRONOLOGICAL INSTRUCTION RECORD")[1].split("STANDARDS COVERAGE SUMMARY")[0];
    const labels = ["WIN | Inference", "IXL | Make inferences", "ELA | Historical lesson", "ELA | Middle lesson", "ELA | Final lesson"];
    for (let i = 1; i < labels.length; i++) assert.ok(timeline.indexOf(labels[i - 1]) < timeline.indexOf(labels[i]));
    assert.match(timeline, /Week of Aug 31, 2026/);
    assert.match(report, /1 distinct standards with confirmed coverage/);
    const summary = report.split("STANDARDS COVERAGE SUMMARY")[1];
    assert.match(summary, /practiced, assessed/);
    assert.match(summary, /Written evidence/);
    assert.match(summary, /Revisit needed/);
    assert.doesNotMatch(summary, /PLANNED.ONLY/);
  });
  it("preserves narratives and old snapshots without changing saved text", () => {
    const report = { text: "Instruction Record\nDate range\n\nPERIOD OVERVIEW\nDetails", narrative: "  Our focus.\nNext steps.  " };
    const text = instructionReportText(report);
    assert.ok(text.indexOf("NARRATIVE SUMMARY") < text.indexOf("PERIOD OVERVIEW"));
    assert.match(text, /Our focus.\nNext steps./);
    assert.doesNotMatch(report.text, /NARRATIVE/);
    assert.equal(instructionReportText({ text: "Old snapshot" }), "Old snapshot");
    assert.equal(instructionReportText({ text: "Old snapshot", narrative: " " }), "Old snapshot");
  });
  it("handles empty and inclusive single-day ranges", () => {
    const report = instructionReport({ start: "2026-08-31", end: "2026-08-31", weeks: [week], standards });
    assert.match(report, /1 WIN weeks completed/);
    assert.match(report, /2 IXL assignments/);
    const empty = instructionReport({ start: "2026-09-01", end: "2026-09-01", weeks: [week] });
    assert.match(empty, /No instruction records/);
    assert.match(empty, /No confirmed standards/);
  });
  it("exports long reports and long links across multiple PDF pages", async () => {
    const text = instructionReport({ start: "2026-08-31", end: "2026-09-04", sequences: [], events: [], weeks: [week], standards });
    const bytes = await createInstructionPdf(`${text}\n${"Long reflection with evidence. ".repeat(900)}\nhttps://example.com/${"x".repeat(700)}`);
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 2);
    assert.equal(pdf.getPage(0).getWidth(), 612);
  });
});
