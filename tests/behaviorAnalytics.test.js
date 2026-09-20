import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBehaviorStudentStats, filterBehaviorStudentStats } from "../src/utils/behaviorStudentStats.js";

describe("student stats", () => {
  const students = [
    { id: "a", displayName: "Amy", grade: "6", homeroom: "B", behaviorBuybacks: 2 },
    { id: "b", displayName: "Ben", grade: "7", homeroom: "A" },
    { id: "c", displayName: "Cam", grade: "6", active: false },
    { id: "d", displayName: "Dee", grade: "6" }
  ];
  const served = (studentId, extra = {}) => ({ studentId, status: "served", reteachDate: "2026-09-01", ...extra });
  const records = [served("a"), served("a", { assignedByUid: "another-teacher", grade: "5" }),
    served("a", { status: "pending" }), served("a", { status: "cancelled" }),
    served("a", { reteachDate: "2025-09-01" }), served("b"), served("c")];
  it("counts current-year service across teachers using current assigned grades, before buybacks", () => {
    const result = buildBehaviorStudentStats(students, records, { roles: ["behavior"], gradeLevels: [6] }, "2026-2027");
    assert.deepEqual(result.map(row => [row.id, row.served]), [["a", 2]]);
    assert.deepEqual(buildBehaviorStudentStats(students, records, { roles: ["behavior"] }, "2026-2027"), []);
    assert.deepEqual(buildBehaviorStudentStats(students, records, { roles: ["owner"], disabled: true }, "2026-2027"), []);
    assert.equal(buildBehaviorStudentStats(students, records, { roles: ["admin"] }, "2026-2027").length, 2);
  });
  it("supports multiple grades, count sorting, name sorting, and combined filters", () => {
    const rows = buildBehaviorStudentStats(students, records, { roles: ["behavior"], gradeLevels: [6, 7] }, "2026-2027");
    assert.deepEqual(filterBehaviorStudentStats(rows, { sort: "least" }).map(row => row.id), ["b", "a"]);
    assert.deepEqual(filterBehaviorStudentStats(rows, { sort: "most" }).map(row => row.id), ["a", "b"]);
    assert.deepEqual(filterBehaviorStudentStats(rows, { sort: "student-desc" }).map(row => row.id), ["b", "a"]);
    assert.deepEqual(filterBehaviorStudentStats(rows, { grade: "6", search: " AM " }).map(row => row.id), ["a"]);
    assert.deepEqual(filterBehaviorStudentStats(rows, { sort: "homeroom" }).map(row => row.id), ["b", "a"]);
  });
});
import {
  analyticsOptions,
  buildBehaviorAnalytics,
  filterBehaviorRecords,
  schoolYearBounds,
  trendRows,
} from "../src/utils/behaviorAnalytics.js";

const row = (id, studentId, teacher, grade, context, date, extra = {}) => ({
  id,
  studentId,
  studentName: `Student ${studentId}`,
  assignedByUid: teacher,
  assignedByName: `Teacher ${teacher}`,
  status: "served",
  grade,
  context,
  location: "Classroom",
  servedAt: date,
  ...extra,
});
const records = [
  row("1", "a", "x", "6", "Disruption", "2026-09-01"),
  row("2", "a", "x", "6", "Disruption", "2026-09-02"),
  row("3", "b", "x", "6", "Directions", "2026-09-03"),
  row("4", "c", "y", "7", "Disruption", "2026-09-07", { location: "Hallway" }),
  row("5", "c", "y", "7", "Directions", "2026-11-01"),
  row("6", "d", "y", "7", "Disruption", "2026-09-04", { status: "pending" }),
  row("7", "d", "y", "7", "Disruption", "2026-09-04", { status: "cancelled" }),
  row("8", "a", "x", "6", "Disruption", "2025-09-01"),
];
const range = { start: "2026-09-01", end: "2026-11-30" };

describe("behavior analytics", () => {
  it("uses an August through July school-year window", () => {
    assert.deepEqual(schoolYearBounds("2026-2027"), {
      start: "2026-08-01",
      end: "2027-07-31",
    });
  });

  it("counts only served records and zero-fills the selected months", () => {
    const result = buildBehaviorAnalytics(records, range);
    assert.equal(result.total, 5);
    assert.deepEqual(
      result.gradeCounts.map(({ label, count }) => ({ label, count })),
      [
        { label: "6", count: 3 },
        { label: "7", count: 2 },
      ],
    );
    assert.deepEqual(
      result.monthly.map(({ key, count }) => ({ key, count })),
      [
        { key: "2026-09", count: 4 },
        { key: "2026-10", count: 0 },
        { key: "2026-11", count: 1 },
      ],
    );
    assert.equal(result.uniqueStudents, 3);
    assert.equal(result.repeatStudents, 2);
    assert.equal(result.teacherCount, 2);
    assert.equal(result.topFiveCount, 5);
  });

  it("applies all dimensions to every chart and matches History drilldowns", () => {
    const filters = {
      ...range,
      grade: "7",
      teacher: "y",
      context: "Disruption",
      location: "Hallway",
      student: "c",
    };
    const result = buildBehaviorAnalytics(records, filters);
    assert.equal(result.total, 1);
    assert.equal(result.topGrade.label, "7");
    assert.deepEqual(result.grades, ["7"]);
    assert.deepEqual(
      result.records.map((record) => record.id),
      filterBehaviorRecords(records, filters).map((record) => record.id),
    );
    assert.equal(result.contextByGrade[0].grades[0].percent, 100);
  });

  it("calculates category repeats per distinct student, not per record or across categories", () => {
    const result = buildBehaviorAnalytics(records, range);
    const disruption = result.contexts.find(
      (item) => item.label === "Disruption",
    );
    assert.equal(disruption.uniqueStudents, 2);
    assert.equal(disruption.repeatStudents, 1);
    assert.equal(disruption.repeatRate, 50);
    assert.equal(disruption.average, 1.5);
    assert.equal(
      result.contexts.find((item) => item.label === "Directions").repeatRate,
      0,
    );
    assert.deepEqual(
      filterBehaviorRecords(records, {
        ...range,
        context: "Disruption",
        repeat: "1",
      }).map((record) => record.id),
      ["1", "2"],
    );
    assert.equal(disruption.grades, undefined);
    const matrix = result.contextByGrade.find(
      (item) => item.label === "Disruption",
    );
    assert.equal(
      Math.round(matrix.grades.find((item) => item.grade === "6").percent),
      67,
    );
    assert.equal(matrix.grades.find((item) => item.grade === "7").percent, 50);
  });

  it("groups identity by stable ID even when names are shared or change", () => {
    const result = buildBehaviorAnalytics(
      [
        row("1", "a", "x", "6", "Disruption", "2026-09-01", {
          studentName: "Same",
          assignedByName: "Same",
        }),
        row("2", "b", "y", "6", "Disruption", "2026-09-01", {
          studentName: "Same",
          assignedByName: "Same",
        }),
        row("3", "a", "x", "6", "Disruption", "2026-09-01", {
          studentName: "Renamed",
          assignedByName: "Renamed",
        }),
      ],
      range,
    );
    assert.equal(result.uniqueStudents, 2);
    assert.equal(result.teachers.length, 2);
    assert.equal(result.repeatStudents, 1);
  });

  it("keeps missing identity records out of distinct counts and averages", () => {
    const missing = row("9", "", "", "", "", "2026-09-01", { location: "  " });
    const result = buildBehaviorAnalytics([...records, missing], range);
    assert.equal(result.total, 6);
    assert.equal(result.missingStudents, 1);
    assert.equal(result.uniqueStudents, 3);
    assert.equal(result.average, 5 / 3);
    assert.equal(result.teacherCount, 2);
    assert.equal(result.topFiveCount, 5);
    assert.equal(
      result.teachers.find((item) => item.label === "__unknown__").count,
      1,
    );
    assert.equal(
      filterBehaviorRecords([missing], {
        grade: "Unknown grade",
        context: "Not recorded",
        location: "Not recorded",
        teacher: "__unknown__",
      }).length,
      1,
    );
  });

  it("uses Monday weeks, includes zero weeks, and clips drilldowns to selected dates", () => {
    const rows = trendRows(
      filterBehaviorRecords(records, {
        start: "2026-09-02",
        end: "2026-09-17",
      }),
      { start: "2026-09-02", end: "2026-09-17", interval: "weekly" },
    );
    assert.deepEqual(
      rows.map(({ key, start, end, count }) => ({ key, start, end, count })),
      [
        { key: "2026-08-31", start: "2026-09-02", end: "2026-09-06", count: 2 },
        { key: "2026-09-07", start: "2026-09-07", end: "2026-09-13", count: 1 },
        { key: "2026-09-14", start: "2026-09-14", end: "2026-09-17", count: 0 },
      ],
    );
    rows.forEach((period) =>
      assert.equal(
        filterBehaviorRecords(records, { start: period.start, end: period.end })
          .length,
        period.count,
      ),
    );
  });

  it("includes end dates and supports legacy date fallback and Firestore timestamps", () => {
    const result = filterBehaviorRecords(
      [
        {
          status: "served",
          servedAt: { toDate: () => new Date(2026, 8, 30, 23, 59) },
        },
        { status: "served", reteachDate: "2026-09-01" },
        {
          status: "served",
          createdAt: { seconds: new Date(2026, 8, 15).getTime() / 1000 },
        },
        { status: "served", servedAt: "invalid" },
        { status: "served" },
      ],
      { start: "2026-09-01", end: "2026-09-30" },
    );
    assert.equal(result.length, 3);
    assert.equal(
      buildBehaviorAnalytics(records, {
        start: "2026-12-01",
        end: "2026-09-01",
      }).total,
      0,
    );
  });

  it("assigns each represented student to exactly one selected-view bucket", () => {
    const sample = [1, 2, 3, 4, 5, 6, 7].flatMap((count) =>
      Array.from({ length: count }, (_, index) =>
        row(
          `${count}-${index}`,
          `student-${count}`,
          "x",
          "6",
          "Disruption",
          "2026-09-01",
        ),
      ),
    );
    const result = buildBehaviorAnalytics(sample, range);
    assert.deepEqual(
      result.buckets.map((bucket) => bucket.students.length),
      [1, 2, 2, 2],
    );
    result.buckets.forEach((bucket) =>
      bucket.students.forEach((student) => {
        assert.equal(
          filterBehaviorRecords(sample, { ...range, student: student.label })
            .length,
          student.count,
        );
      }),
    );
  });

  it("drills into the same top five staff used by the concentration total", () => {
    const sample = [1, 2, 3, 4, 5, 6].flatMap((count) =>
      Array.from({ length: count }, (_, index) =>
        row(
          String(count) + "-" + index,
          "a",
          "teacher-" + count,
          "6",
          "Disruption",
          "2026-09-01",
        ),
      ),
    );
    sample.push(row("unknown", "a", "", "6", "Disruption", "2026-09-01"));
    const result = buildBehaviorAnalytics(sample, range);
    const matching = filterBehaviorRecords(sample, { ...range, topStaff: "1" });
    assert.equal(result.topFiveCount, 20);
    assert.equal(matching.length, result.topFiveCount);
    assert.equal(
      new Set(matching.map((record) => record.assignedByUid)).size,
      5,
    );
    assert.ok(
      matching.every(
        (record) =>
          record.assignedByUid !== "teacher-1" && record.assignedByUid,
      ),
    );
  });

  it("keeps filter options stable across selections and supports empty data", () => {
    const options = analyticsOptions(records);
    assert.deepEqual(options.grades, ["6", "7"]);
    assert.equal(options.teachers.length, 2);
    assert.equal(options.students.length, 3);
    const empty = buildBehaviorAnalytics([], range);
    assert.equal(empty.total, 0);
    assert.equal(empty.average, null);
    assert.equal(empty.monthly.length, 3);
    assert.equal(empty.repeatRate, 0);
  });
});
