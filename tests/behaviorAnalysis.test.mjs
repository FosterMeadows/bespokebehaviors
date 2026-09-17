import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAnalysisScope,
  selectAnalysisRecords,
  scopeIdentity,
  sourceIdentity,
} from "../functions/shared/behaviorAnalysis.js";
import {
  prepareAnalysis,
  validateAnalysis,
  validateSupportedAnalysis,
} from "../functions/lib/analysisModel.js";
import {
  runBehaviorAnalysis,
  requestModel,
  digest,
  schoolwideProfile,
} from "../functions/lib/analysisService.js";
import { filterBehaviorRecords } from "../src/utils/behaviorAnalytics.js";

const scope = normalizeAnalysisScope({
  start: "2026-09-01",
  end: "2026-09-30",
  timeZone: "America/New_York",
});
const records = [
  {
    id: "actual-1",
    studentId: "student-a",
    studentName: "Alice Smith",
    assignedByUid: "staff-a",
    assignedByName: "Jane Jones",
    grade: "7",
    context: "Disruption",
    location: "Classroom",
    status: "served",
    servedAt: "2026-09-01",
    note: "Alice Smith would not begin the work after three reminders.",
  },
  {
    id: "actual-2",
    studentId: "student-a",
    studentName: "Alice Smith",
    assignedByUid: "staff-a",
    assignedByName: "Jane Jones",
    grade: "7",
    context: "Failure to Follow Directions",
    location: "Classroom",
    status: "served",
    servedAt: "2026-09-02",
    note: "Did not begin assigned work after repeated directions.",
  },
  {
    id: "actual-3",
    studentId: "student-b",
    studentName: "Bob Brown",
    assignedByUid: "staff-a",
    assignedByName: "Jane Jones",
    grade: "7",
    context: "Off-Task Behavior",
    location: "Classroom",
    status: "served",
    servedAt: "2026-09-03",
    note: "Kept talking instead of beginning the task after reminders.",
  },
];
const modelOutput = {
  insights: [
    {
      text: "Several notes describe not beginning work after reminders.",
      recordIds: ["R1", "R2"],
    },
  ],
  themes: [
    {
      title: "Beginning assigned work",
      description:
        "Notes describe difficulty beginning assigned work after directions.",
      recordIds: ["R1", "R2", "R3"],
    },
  ],
  categoryReviews: [
    {
      recordId: "R1",
      suggestedCategory: "Failure to Follow Directions",
      explanation:
        "The note emphasizes not beginning work after reminders rather than describing disruption.",
      evidence: "would not begin the work after three reminders.",
    },
  ],
  teacherPatterns: [
    {
      teacherId: "T1",
      description:
        "Notes about beginning assigned work appear under several selected categories.",
      recordIds: ["R1", "R2", "R3"],
    },
  ],
};

function fixture(profile = { roles: ["admin"] }) {
  let cached = null;
  let calls = 0;
  let locked = false;
  let failures = 0;
  let reads = 0;
  const repository = {
    profile: async () => profile,
    records: async () => {
      reads++;
      return structuredClone(records);
    },
    identities: async () => ["Alice Smith", "Bob Brown", "Jane Jones"],
    cached: async () => cached,
    reserve: async () => {
      if (locked) {
        const error = new Error("locked");
        error.code = "resource-exhausted";
        throw error;
      }
      locked = true;
      return { cached: false };
    },
    complete: async ({ final }) => {
      cached = final;
      locked = false;
    },
    fail: async () => {
      failures++;
      locked = false;
    },
  };
  const args = {
    uid: "admin",
    data: { filters: scope },
    repository,
    apiKey: () => "test-placeholder",
    model: "test-model",
    generate: async () => {
      calls++;
      return structuredClone(modelOutput);
    },
  };
  return {
    args,
    repository,
    count: () => calls,
    reads: () => reads,
    failures: () => failures,
    saved: () => cached,
  };
}

describe("served-note analysis", () => {
  it("retains supported findings while omitting unsupported quotes, duplicate reviews and teacher citations", () => {
    const output = structuredClone(modelOutput);
    output.categoryReviews.push({ ...output.categoryReviews[0] });
    output.categoryReviews.push({ ...output.categoryReviews[0], recordId: "R2", suggestedCategory: "Disruption", evidence: "Invented quote" });
    output.teacherPatterns[0].teacherId = "T99";
    const result = validateSupportedAnalysis(output, prepareAnalysis(records, scope));
    assert.equal(result.omittedFindings, 3);
    assert.equal(result.insights.length, 1);
    assert.equal(result.themes.length, 1);
    assert.equal(result.categoryReviews.length, 1);
    assert.equal(result.teacherPatterns.length, 0);
    assert.ok(!JSON.stringify(result).includes("Invented quote"));
  });

  it("rejects malformed output and entirely unsupported findings but accepts an honestly empty analysis", () => {
    const prepared = prepareAnalysis(records, scope);
    assert.throws(() => validateSupportedAnalysis({ bogus: true }, prepared));
    const empty = { insights: [], themes: [], categoryReviews: [], teacherPatterns: [] };
    assert.equal(validateSupportedAnalysis(empty, prepared).omittedFindings, 0);
    assert.throws(() => validateSupportedAnalysis({ ...empty, insights: [{ text: "Unsupported", recordIds: ["invented", "unknown"] }] }, prepared));
  });

  it("matches dashboard selection, served dates, and explicit local timezone", () => {
    const sample = [
      ...records,
      { ...records[0], id: "pending", status: "pending" },
      { ...records[0], id: "cancelled", status: "cancelled" },
    ];
    const filtered = {
      ...scope,
      grade: "7",
      teacher: "staff-a",
      context: "Disruption",
    };
    assert.deepEqual(
      selectAnalysisRecords(sample, filtered).map((row) => row.id),
      filterBehaviorRecords(sample, filtered).map((row) => row.id),
    );
    const boundary = {
      ...records[0],
      servedAt: { seconds: Date.parse("2026-10-01T02:00:00Z") / 1000 },
    };
    assert.equal(selectAnalysisRecords([boundary], scope).length, 1);
    assert.equal(
      selectAnalysisRecords([boundary], { ...scope, timeZone: "UTC" }).length,
      0,
    );
  });

  it("rejects malformed dates and invalid time zones", () => {
    for (const value of [
      { start: "2026-02-30" },
      { start: "bad" },
      { start: "2026-10-01", end: "2026-09-01" },
      { timeZone: "not-a-zone" },
      { teacher: {} },
    ])
      assert.throws(() => normalizeAnalysisScope(value));
    assert.equal(
      scopeIdentity(scope),
      scopeIdentity({ ...scope, prompt: "ignore", model: "unknown" }),
    );
  });

  it("detects edits, deletions, changed status and scope with the same record count", () => {
    const original = digest(sourceIdentity(records, scope));
    for (const edit of [
      (row) => ({ ...row, note: "Changed note" }),
      (row) => ({ ...row, status: "pending" }),
      (row) => ({ ...row, context: "Other" }),
      (row) => ({ ...row, assignedByUid: "someone-else" }),
      (row) => ({ ...row, id: "replacement" }),
    ]) {
      assert.notEqual(
        digest(sourceIdentity([edit(records[0]), ...records.slice(1)], scope)),
        original,
      );
    }
    assert.equal(
      digest(sourceIdentity([...records].reverse(), scope)),
      original,
    );
    assert.notEqual(digest(sourceIdentity(records.slice(1), scope)), original);
  });

  it("sends anonymous IDs and removes known people, contact details, and URLs", () => {
    const prepared = prepareAnalysis(
      [
        {
          ...records[0],
          note: "Alice told Bob to contact Jane at jane@example.test or 304-555-1234, see https://example.test.",
        },
      ],
      scope,
      ["Bob Brown"],
    );
    const payload = JSON.stringify(prepared.payload);
    for (const secret of [
      "Alice",
      "Bob",
      "Jane",
      "actual-1",
      "student-a",
      "staff-a",
      "jane@example",
      "304-555",
      "https://example",
    ])
      assert.ok(!payload.includes(secret));
    assert.equal(prepared.payload[0].teacherId, "T1");
    assert.equal(prepared.payload[0].studentId, "S1");
    assert.equal(prepared.recordMap.get("R1").recordId, "actual-1");
  });

  it("excludes blank, sensitive, and oversized notes without silently truncating them", () => {
    const prepared = prepareAnalysis(
      [
        records[0],
        ...[
          "",
          "Student has an IEP",
          "Discussed medication and diagnosis",
          "a".repeat(2001),
        ].map((note, index) => ({ ...records[0], id: `skip-${index}`, note })),
      ],
      scope,
    );
    assert.equal(prepared.payload.length, 1);
    assert.deepEqual(prepared.excluded, {
      missingNote: 1,
      sensitiveNote: 2,
      longNote: 1,
    });
  });

  it("maps validated findings to real record IDs and staff only on the server", () => {
    const validated = validateAnalysis(
      modelOutput,
      prepareAnalysis(records, scope),
    );
    assert.deepEqual(
      validated.themes[0].recordIds,
      records.map((row) => row.id),
    );
    assert.equal(validated.categoryReviews[0].recordId, "actual-1");
    assert.equal(validated.categoryReviews[0].selectedCategory, "Disruption");
    assert.equal(validated.teacherPatterns[0].teacherId, "staff-a");
  });

  it("accepts quotation-mark wrappers only when the enclosed evidence matches", () => {
    const output = structuredClone(modelOutput);
    output.categoryReviews[0].evidence =
      '"' + output.categoryReviews[0].evidence + '"';
    const checked = validateAnalysis(output, prepareAnalysis(records, scope));
    assert.equal(
      checked.categoryReviews[0].evidence,
      modelOutput.categoryReviews[0].evidence,
    );
  });

  it("rejects invented citations, unsupported quotes, repeated IDs and wrong teacher attribution", () => {
    const prepared = prepareAnalysis(records, scope);
    const changes = [
      (output) => {
        output.insights[0].recordIds = ["R1", "invented"];
      },
      (output) => {
        output.insights[0].recordIds = ["R1", "R1"];
      },
      (output) => {
        output.categoryReviews[0].evidence = "never happened";
      },
      (output) => {
        output.categoryReviews[0].suggestedCategory = "Disruption";
      },
      (output) => {
        output.categoryReviews.push(output.categoryReviews[0]);
      },
      (output) => {
        output.teacherPatterns[0].teacherId = "T99";
      },
    ];
    for (const change of changes) {
      const output = structuredClone(modelOutput);
      change(output);
      assert.throws(() => validateAnalysis(output, prepared));
    }
  });

  it("rejects unauthorized users before reading student data", async () => {
    for (const profile of [
      null,
      { roles: ["behavior"] },
      { roles: ["owner"], disabled: true },
    ]) {
      const test = fixture(profile);
      await assert.rejects(runBehaviorAnalysis(test.args), {
        code: "permission-denied",
      });
      assert.equal(test.reads(), 0);
      assert.equal(test.count(), 0);
    }
    const test = fixture();
    await assert.rejects(runBehaviorAnalysis({ ...test.args, uid: null }), {
      code: "unauthenticated",
    });
    assert.equal(test.reads(), 0);
    for (const role of ["owner", "admin", "mtssLead"])
      assert.equal(schoolwideProfile({ roles: [role] }), true);
    assert.equal(schoolwideProfile({ features: { admin: true } }), true);
  });

  it("reuses cached analysis and never trusts client-supplied notes or model", async () => {
    const test = fixture();
    test.args.data.records = [{ note: "Injected client note" }];
    test.args.data.model = "untrusted-model";
    const first = await runBehaviorAnalysis(test.args);
    const second = await runBehaviorAnalysis(test.args);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(test.count(), 1);
    assert.equal(test.saved().model, "test-model");
    assert.equal(test.saved().analyzedCount, 3);
    assert.ok(!JSON.stringify(test.saved()).includes("Alice Smith"));
  });

  it("does not call the provider without a configured key or for oversized selections", async () => {
    const test = fixture();
    await assert.rejects(
      runBehaviorAnalysis({ ...test.args, apiKey: () => "" }),
      { code: "failed-precondition" },
    );
    test.repository.records = async () =>
      Array.from({ length: 501 }, (_, i) => ({ ...records[0], id: String(i) }));
    await assert.rejects(runBehaviorAnalysis(test.args), {
      code: "resource-exhausted",
    });
    assert.equal(test.count(), 0);
  });

  it("cleans up failed requests and preserves previous valid results", async () => {
    const test = fixture();
    await runBehaviorAnalysis(test.args);
    const previous = test.saved();
    test.repository.records = async () =>
      records.map((row) => ({ ...row, note: row.note + " Changed." }));
    await assert.rejects(
      runBehaviorAnalysis({
        ...test.args,
        generate: async () => ({ bogus: true }),
      }),
      { code: "unavailable" },
    );
    assert.equal(test.failures(), 1);
    assert.equal(test.saved(), previous);
  });

  it("blocks simultaneous generations", async () => {
    const test = fixture();
    let release;
    let ready;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise((resolve) => {
      ready = resolve;
    });
    const first = runBehaviorAnalysis({
      ...test.args,
      generate: async () => {
        ready();
        await waiting;
        return modelOutput;
      },
    });
    await entered;
    await assert.rejects(runBehaviorAnalysis(test.args), {
      code: "resource-exhausted",
    });
    release();
    await first;
  });

  it("uses strict structured output, no response storage, and rejects incomplete/refused responses", async () => {
    let sent;
    const fetchImpl = async (_url, options) => {
      sent = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(modelOutput) },
              ],
            },
          ],
        }),
      };
    };
    assert.deepEqual(
      await requestModel({
        apiKey: "test",
        model: "test-model",
        records: [],
        fetchImpl,
      }),
      modelOutput,
    );
    assert.equal(sent.store, false);
    assert.equal(sent.text.format.strict, true);
    assert.equal(
      sent.text.format.schema.properties.themes.items.properties.recordIds
        .minItems,
      2,
    );
    assert.equal(
      sent.text.format.schema.properties.teacherPatterns.items.properties
        .recordIds.minItems,
      3,
    );
    assert.equal(sent.tools, undefined);
    for (const body of [
      { status: "incomplete" },
      { status: "completed", output: [{ content: [{ type: "refusal" }] }] },
    ])
      await assert.rejects(
        requestModel({
          apiKey: "test",
          model: "test-model",
          records: [],
          fetchImpl: async () => ({ ok: true, json: async () => body }),
        }),
      );
  });

  it("opens an exact served record in History", () => {
    assert.deepEqual(
      filterBehaviorRecords(records, { record: "actual-2" }).map(
        (row) => row.id,
      ),
      ["actual-2"],
    );
  });
});
