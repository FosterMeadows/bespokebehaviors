import test from "node:test";
import assert from "node:assert/strict";
import { academicTaskDocId } from "../src/utils/academicTaskIdentity.js";

test("academic task identity prevents duplicate records for equivalent assignments", async () => {
  const first = await academicTaskDocId({ studentId: "student-1", subject: "ELA", title: "Argument Essay Draft" });
  const equivalent = await academicTaskDocId({ studentId: "student-1", subject: " ela ", title: "  argument   essay draft " });
  const otherStudent = await academicTaskDocId({ studentId: "student-2", subject: "ELA", title: "Argument Essay Draft" });

  assert.equal(first, equivalent);
  assert.notEqual(first, otherStudent);
  assert.match(first, /^task_[a-f0-9]{64}$/);
});
