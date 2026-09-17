// Explicit emulator-only fixture for visual QA. Never calls an AI provider.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createAnalysisRepository } from "../functions/lib/analysisRepository.js";
import { runBehaviorAnalysis } from "../functions/lib/analysisService.js";
import { normalizeAnalysisScope } from "../functions/shared/behaviorAnalysis.js";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const app = initializeApp(
  { projectId: "bespokebehaviors" },
  "analysis-qa-fixture",
);
const db = getFirestore(app);
try {
  const owner = await db
    .collection("teachers")
    .where("contactEmail", "==", "owner@example.test")
    .get();
  assert.equal(owner.size, 1, "Run qa:seed in the local emulator first.");
  const notes = {
    "qa-r1":
      "Synthetic QA: Repeated talking during instruction after redirection.",
    "qa-r2":
      "Synthetic QA: Continued talking over instructions after reminders.",
    "qa-r3": "Synthetic QA: Called another student a name repeatedly.",
  };
  for (const [id, note] of Object.entries(notes)) {
    const record = await db.collection("behaviorReteaches").doc(id).get();
    assert.match(record.data()?.note || "", /^Synthetic/);
    await record.ref.update({ note });
  }
  const repository = createAnalysisRepository(db);
  let providerCalls = 0;
  const args = {
    uid: owner.docs[0].id,
    data: {
      filters: normalizeAnalysisScope({
        start: "2026-08-01",
        end: "2027-07-31",
        timeZone: "America/New_York",
      }),
    },
    repository,
    apiKey: () => "qa-placeholder",
    model: "QA fixture (not AI-generated)",
    generate: async ({ records }) => {
      providerCalls++;
      const talking = records.filter((record) => /talking/.test(record.note));
      const mismatch = records.find((record) =>
        /Called another student/.test(record.note),
      );
      return {
        insights: [
          {
            text: "[QA fixture] Notes describe repeated talking after reminders.",
            recordIds: talking.map((record) => record.id),
          },
        ],
        themes: [
          {
            title: "[QA fixture] Talking during instruction",
            description:
              "Synthetic notes describe repeated talking during instruction or reminders.",
            recordIds: talking.map((record) => record.id),
          },
        ],
        categoryReviews: [
          {
            recordId: mismatch.id,
            suggestedCategory: "Disrespectful Communication",
            explanation:
              "[QA fixture] The note describes repeated name-calling, which may fit Disrespectful Communication more closely than Off-Task Behavior.",
            evidence: "Called another student a name repeatedly.",
          },
        ],
        teacherPatterns: [
          {
            teacherId: talking[0].teacherId,
            description:
              "[QA fixture] These notes describe talking and name-calling under different selected categories.",
            recordIds: [...talking.map((record) => record.id), mismatch.id],
          },
        ],
      };
    },
  };
  const first = await runBehaviorAnalysis(args);
  const second = await runBehaviorAnalysis(args);
  assert.equal(second.cached, true);
  assert.ok(providerCalls <= 1);
  const saved = (
    await db.collection("behaviorAnalyses").doc(first.analysisId).get()
  ).data();
  assert.equal(saved.status, "complete");
  assert.equal(saved.result.categoryReviews[0].recordId, "qa-r3");
  assert.equal(
    (await db.collection("behaviorAnalysisControl").doc("school").get()).data()
      .lockUntil,
    0,
  );
  console.log(
    "Saved labeled synthetic analysis fixture; real repository cache and lock verified. No AI provider called.",
  );
} finally {
  await deleteApp(app);
}
