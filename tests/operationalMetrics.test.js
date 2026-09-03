import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalMetrics } from "../src/utils/operationalMetrics.js";

test("builds aggregate workload and windowed rates", () => {
  const metrics = buildOperationalMetrics({
    now: new Date("2026-07-19T12:00:00"),
    days: 30,
    students: [
      { id: "s1", grade: "6" },
      { id: "s2", grade: "7" }
    ],
    tasks: [
      { studentId: "s1", active: true, state: "not_started", assignedAt: "2026-07-01T12:00:00" },
      { studentId: "s2", active: false, state: "completed", assignedAt: "2026-07-10T12:00:00", completedAt: "2026-07-12T12:00:00" }
    ],
    behaviorRecords: [
      { studentId: "s1", grade: "6", status: "pending", createdAt: "2026-07-10T12:00:00" },
      { studentId: "s2", grade: "7", status: "served", createdAt: "2026-07-11T12:00:00", servedAt: "2026-07-12T12:00:00" },
      { studentId: "s2", grade: "7", status: "cancelled", createdAt: "2026-07-11T12:00:00" }
    ],
    sessions: [{
      date: "2026-07-15",
      roster: ["s1", "s2"],
      outcomes: { s1: { status: "present" }, s2: { status: "no_show" } }
    }],
    homeContacts: [{ status: "pending" }, { status: "completed" }, { status: "cancelled" }]
  });

  assert.equal(metrics.openAcademic, 1);
  assert.equal(metrics.pendingBehavior, 1);
  assert.equal(metrics.agedItems, 2);
  assert.equal(metrics.academicCompletionRate, 50);
  assert.equal(metrics.behaviorServiceRate, 50);
  assert.equal(metrics.pendingContacts, 1);
  assert.equal(metrics.sessionAttendanceRate, 50);
  assert.equal(metrics.gradeWorkload[0].waitingStudents, 1);
  assert.equal(metrics.gradeWorkload[0].academicItems, 1);
  assert.equal(metrics.gradeWorkload[0].behaviorItems, 1);
});

test("returns unavailable rates when a reporting window has no cohort", () => {
  const metrics = buildOperationalMetrics({ now: new Date("2026-07-19T12:00:00") });
  assert.equal(metrics.academicCompletionRate, null);
  assert.equal(metrics.behaviorServiceRate, null);
  assert.equal(metrics.sessionAttendanceRate, null);
  assert.equal(metrics.medianAcademicHours, null);
  assert.deepEqual(metrics.gradeWorkload, []);
});
