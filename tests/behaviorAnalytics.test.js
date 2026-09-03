import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBehaviorAnalytics, schoolYearBounds } from "../src/utils/behaviorAnalytics.js";

describe("behavior analytics", () => {
  const records = [
    { status: "served", grade: "6", context: "Disruption", location: "Classroom", servedAt: "2026-09-03" },
    { status: "served", grade: "6", context: "Disruption", location: "Hallway", servedAt: "2026-09-10" },
    { status: "served", grade: "6", context: "Peer Conflict", location: "Hallway", servedAt: "2026-10-02" },
    { status: "served", grade: "7", context: "Peer Conflict", location: "Cafeteria", servedAt: "2026-10-03" },
    { status: "pending", grade: "7", context: "Disruption", location: "Classroom", servedAt: "2026-10-04" },
    { status: "served", grade: "8", context: "Unsafe Behavior", location: "Gym", servedAt: "2025-04-04" }
  ];

  it("uses an August through July school-year window", () => {
    assert.deepEqual(schoolYearBounds("2026-2027"), { start: "2026-08-01", end: "2027-07-31" });
  });

  it("counts only served records in the selected date range", () => {
    const result = buildBehaviorAnalytics(records, { start: "2026-08-01", end: "2027-07-31" });
    assert.equal(result.total, 4);
    assert.deepEqual(result.gradeCounts, [{ label: "6", count: 3 }, { label: "7", count: 1 }]);
    assert.deepEqual(result.monthly, [{ key: "2026-09", count: 2 }, { key: "2026-10", count: 2 }]);
  });

  it("keeps behavior categories separate and calculates within-grade percentages", () => {
    const result = buildBehaviorAnalytics(records, { start: "2026-08-01", end: "2027-07-31" });
    const disruption = result.contextByGrade.find(item => item.label === "Disruption");
    assert.equal(disruption.grades.find(item => item.grade === "6").count, 2);
    assert.equal(Math.round(disruption.grades.find(item => item.grade === "6").percent), 67);
    assert.equal(disruption.grades.find(item => item.grade === "7").count, 0);
  });

  it("supports a grade drilldown without changing schoolwide grade totals", () => {
    const result = buildBehaviorAnalytics(records, { start: "2026-08-01", end: "2027-07-31", grade: "7" });
    assert.equal(result.total, 1);
    assert.deepEqual(result.locations, [{ label: "Cafeteria", count: 1 }]);
    assert.equal(result.topGrade.label, "6");
  });
});
