import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStandardsPulse } from "../src/utils/sequenceStandards.js";

describe("sequence-derived standards pulse", () => {
  const standards = [
    { code: "ELA.8.1", text: "Evidence" },
    { code: "ELA.8.2", text: "Theme" },
  ];

  it("uses complete sequences and keeps coverage separate from revisit state", () => {
    const result = buildStandardsPulse(standards, [
      {
        id: "active",
        title: "Still planning",
        status: "active",
        standardCoverage: [{ standardCode: "ELA.8.2", coverageLevel: "assessed", needsRevisit: false }]
      },
      {
        id: "first",
        title: "First sequence",
        status: "complete",
        completedAt: { seconds: 1 },
        outcome: "Paragraph",
        standardCoverage: [{ standardCode: "ELA.8.1", coverageLevel: "introduced", needsRevisit: false, note: "Modeled evidence." }]
      },
      {
        id: "second",
        title: "Second sequence",
        status: "complete",
        completedAt: { seconds: 2 },
        outcome: "Essay",
        standardCoverage: [{ standardCode: "ELA.8.1", coverageLevel: "practiced", needsRevisit: true, note: "Citations need another pass." }]
      }
    ]);

    const evidence = result.find((item) => item.code === "ELA.8.1");
    const theme = result.find((item) => item.code === "ELA.8.2");
    assert.equal(evidence.coverageLevel, "practiced");
    assert.equal(evidence.needsRevisit, true);
    assert.equal(evidence.latestSequenceTitle, "Second sequence");
    assert.equal(evidence.history.length, 2);
    assert.equal(evidence.history[0].outcome, "Essay");
    assert.equal(theme.coverageLevel, "not_addressed");
  });
});
