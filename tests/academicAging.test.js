import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAcademicAssignmentAge,
  getAcademicAssignmentAge,
  isOpenAcademicAssignment,
  selectAcademicBacklog,
  summarizeAcademicAssignmentAges
} from "../src/utils/academicAging.js";
import { formatOldestWorkAge } from "../src/utils/academicPresentation.js";

const now = new Date("2026-10-03T16:00:00Z");
const task = (assignedAt, overrides = {}) => ({ active: true, state: "not_started", studentId: "s1", assignedAt, ...overrides });

for (const [assignedAt, days, status] of [
  ["2026-10-03", 0, "fresh"],
  ["2026-09-27", 6, "fresh"],
  ["2026-09-26", 7, "aging"],
  ["2026-09-20", 13, "aging"],
  ["2026-09-19", 14, "stuck"],
  ["2026-01-01", 275, "stuck"]
]) {
  test(`classifies ${days}-day open work as ${status}`, () => {
    assert.equal(getAcademicAssignmentAge(task(assignedAt), now), days);
    assert.equal(classifyAcademicAssignmentAge(task(assignedAt), now), status);
  });
}

test("excludes terminal, archived, and inactive assignments, including legacy states", () => {
  for (const state of ["completed", "verified", "canceled", "cancelled", "removed", "archived", " COMPLETED "]) {
    const closed = task("2026-01-01", { state });
    assert.equal(isOpenAcademicAssignment(closed), false);
    assert.equal(getAcademicAssignmentAge(closed, now), null);
    assert.equal(classifyAcademicAssignmentAge(closed, now), null);
  }
  for (const overrides of [{ active: false }, { archived: true }, { active: undefined }]) {
    assert.equal(classifyAcademicAssignmentAge(task("2026-01-01", overrides), now), null);
  }
  for (const state of ["not_started", "in_progress", "needs_to_finish", "turned_in", undefined]) {
    assert.equal(classifyAcademicAssignmentAge(task("2026-09-19", { state }), now), "stuck");
  }
  assert.equal(classifyAcademicAssignmentAge(null, now), null);
});

test("uses the original assignment date and falls back only to an absent assignment's creation date", () => {
  assert.equal(getAcademicAssignmentAge(task("2026-09-19", { createdAt: "2026-09-01", lastUpdated: "2026-10-03" }), now), 14);
  assert.equal(getAcademicAssignmentAge(task(undefined, { createdAt: "2026-09-26" }), now), 7);
  assert.equal(classifyAcademicAssignmentAge(task("bad", { createdAt: "2026-09-26" }), now), "unknown");
});

test("supports Firestore timestamps, serialized timestamps, Dates, and dated legacy strings", () => {
  const date = new Date("2026-09-26T23:00:00Z");
  for (const value of [date, date.getTime(), { toDate: () => date }, { seconds: date.getTime() / 1000, nanoseconds: 0 }, date.toISOString(), "2026-09-26T19:00:00-04:00"]) {
    assert.equal(getAcademicAssignmentAge(task(value), now), 7);
  }
  // Epoch timestamps are valid dates, not missing/falsy values.
  assert.equal(classifyAcademicAssignmentAge(task({ seconds: 0 }), now), "stuck");
});

test("missing and malformed dates remain unknown and cannot produce a false fresh classification", () => {
  for (const value of [undefined, null, "", "bad", "2026-02-30", "2026-13-01", "2026-02-30T12:00:00Z", "2026-09-26T24:00:00Z", "2026-09-26T12:00:00", new Date(NaN), NaN, {}, true, { seconds: NaN }, { toDate: () => { throw new Error("bad timestamp"); } }]) {
    assert.equal(getAcademicAssignmentAge(task(value), now), null);
    assert.equal(classifyAcademicAssignmentAge(task(value), now), "unknown");
  }
  assert.equal(getAcademicAssignmentAge(task("2026-09-26"), new Date(NaN)), null);
});

test("uses the school date at midnight rather than UTC or the device's local timezone", () => {
  const beforeMidnight = new Date("2026-10-03T03:59:59Z");
  const midnight = new Date("2026-10-03T04:00:00Z");
  assert.equal(getAcademicAssignmentAge(task("2026-09-26"), beforeMidnight), 6);
  assert.equal(getAcademicAssignmentAge(task("2026-09-26"), midnight), 7);
  assert.equal(getAcademicAssignmentAge(task("2026-09-26T03:59:59Z"), midnight), 8);
  assert.equal(getAcademicAssignmentAge(task("2026-09-26T04:00:00Z"), midnight), 7);
  assert.equal(getAcademicAssignmentAge(task("2026-10-03T03:59:59Z"), midnight), 1);
});

test("counts calendar days across spring and fall daylight-saving changes", () => {
  assert.equal(getAcademicAssignmentAge(task("2026-03-08T05:00:00Z"), new Date("2026-03-15T04:00:00Z")), 7);
  assert.equal(getAcademicAssignmentAge(task("2026-11-01T04:00:00Z"), new Date("2026-11-08T05:00:00Z")), 7);
  assert.equal(classifyAcademicAssignmentAge(task("2026-03-08"), new Date("2026-03-15T04:00:00Z")), "aging");
});

test("future assignment dates retain the existing zero-day age behavior", () => {
  assert.equal(getAcademicAssignmentAge(task("2026-10-04"), now), 0);
  assert.equal(classifyAcademicAssignmentAge(task("2026-10-04"), now), "fresh");
});

test("summarizes assignments and distinct affected students without counting history or unknown ages as fresh", () => {
  const tasks = [task("2026-10-03"), task("2026-09-26"), task("2026-09-19"),
    task("2026-09-01", { studentId: "s2" }), task(null, { studentId: "s3" }),
    task("2025-01-01", { active: false }), task("2025-01-01", { archived: true })];
  assert.deepEqual(summarizeAcademicAssignmentAges(tasks, now), {
    open: 5, fresh: 1, aging: 1, stuck: 2, unknown: 1, needsAttention: 3, attentionStudents: 2, oldestDays: 32
  });
  assert.equal(summarizeAcademicAssignmentAges([task(null)], now).oldestDays, null);
  assert.equal(summarizeAcademicAssignmentAges([], now).open, 0);
  assert.equal(summarizeAcademicAssignmentAges([task("2026-10-03")], now).oldestDays, 0);
});

test("the existing oldest-work label shares the same date rules and ignores closed work", () => {
  assert.equal(formatOldestWorkAge([task("2026-10-03")], now), "Oldest Work: Today");
  assert.equal(formatOldestWorkAge([task("2026-10-02")], now), "Oldest Work: 1 Day");
  assert.equal(formatOldestWorkAge([task("2026-09-19"), task("2025-01-01", { active: false })], now), "Oldest Work: 14 Days");
  assert.equal(formatOldestWorkAge([task(null)], now), "Oldest Work: Unknown");
});

const students = { s1: { displayName: "Zara", homeroom: "North" }, s2: { displayName: "Amy" }, s3: { displayName: "Bea" } };
const byStudent = [
  ["s1", [task("2026-09-19", { subject: "ELA" }), task("2026-10-03", { subject: "Math" })]],
  ["s2", [task("2026-09-26", { studentId: "s2", subject: "Math" }), task("2026-09-20", { studentId: "s2", subject: "Math" })]],
  ["s3", [task(null, { studentId: "s3", subject: "ELA" }), task("2025-01-01", { studentId: "s3", active: false })]]
];

test("combines age, subject, and student search filters on matching assignments", () => {
  const rows = selectAcademicBacklog(byStudent, students, { subject: "Math", age: "attention" }, now);
  assert.deepEqual(rows.map(([id]) => id), ["s2"]);
  assert.equal(rows[0][1].length, 2);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { subject: "Math", age: "stuck" }, now), []);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { search: " NORTH ", age: "fresh" }, now).map(([id]) => id), ["s1"]);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { age: "unknown" }, now).map(([id]) => id), ["s3"]);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { age: "aging" }, now).map(([id]) => id), ["s2"]);
  assert.equal(byStudent[0][1].length, 2); // Filtering does not mutate loaded data.
});

test("sorts by oldest matching work or concentration, keeping unknown ages last", () => {
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { sort: "name" }, now).map(([id]) => id), ["s2", "s3", "s1"]);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { sort: "oldest" }, now).map(([id]) => id), ["s1", "s2", "s3"]);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { sort: "attention" }, now).map(([id]) => id), ["s2", "s1", "s3"]);
  assert.deepEqual(selectAcademicBacklog(byStudent, students, { sort: "oldest", subject: "Math" }, now).map(([id]) => id), ["s2", "s1"]);
});
