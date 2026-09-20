import { test } from "node:test";
import assert from "node:assert/strict";
import { errorDiagnostics, groupClientErrors, diagnosticKey } from "../src/utils/errorDiagnostics.js";

test("diagnostics classify causes without saving sensitive error contents", () => {
  const error = { code: "failed-precondition", message: "Student Jane Doe query requires an index https://example.com?token=secret", stack: "Error Jane Doe\n at f (https://app.test/assets/index-ABC.js:12:34)\n at https://evil.test/assets/index.js:1:2\n at https://app.test/students/private:1:2\n at https://app.test/assets/index.js?secret=abc:1:2" };
  const result = errorDiagnostics(error, "behavior-count", "https://app.test");
  assert.equal(result.cause, "index");
  assert.equal(result.codeLocation, "/assets/index-ABC.js:12:34");
  assert.doesNotMatch(JSON.stringify(result), /Jane|secret|evil|private/);
  assert.equal(errorDiagnostics({ code: "permission-denied" }).cause, "permission");
  assert.equal(errorDiagnostics(new TypeError("Failed to fetch")).cause, "network");
  assert.equal(errorDiagnostics({ name: "Jane Doe", code: "secret" }, "Jane Doe").category, "Error");
  assert.equal(errorDiagnostics(null).cause, "unknown");
});

test("groups matching diagnostic reports across sources but separates releases and legacy errors", () => {
  const base = { route: "/behavior", release: "v1", ...errorDiagnostics({ code: "permission-denied" }), occurredAt: { seconds: 10 } };
  assert.equal(diagnosticKey({ ...base, source: "console" }), diagnosticKey({ ...base, source: "promise" }));
  const groups = groupClientErrors([
    { ...base, id: "a", source: "promise", occurredAt: { seconds: 20 } },
    { ...base, id: "b", source: "console" },
    { ...base, id: "c", release: "v2" },
    { id: "old1", category: "Error" }, { id: "old2", category: "Error" }
  ]);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].first, 10000);
  assert.equal(groups[0].last, 20000);
  assert.deepEqual([...groups[0].sources], ["promise", "console"]);
});
