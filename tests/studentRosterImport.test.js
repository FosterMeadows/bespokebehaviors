import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildManualRosterRow, parseRosterText, redactRosterText, revalidateRosterRows } from "../src/utils/studentRosterImport.js";

describe("student roster import parsing", () => {
  it("parses the four-column SIS format and stores only the homeroom teacher", () => {
    const text = [
      "Student Name\tStudent ID\tGrade Level\tHomeroom",
      "Smith, Jordan\t12345\t7th\tHomeroom 7th Carter",
      "Van Dyke, Amari J.\t67890\tGrade 6\tHomeroom 6th Ms. O'Neil-Santos",
    ].join("\n");

    const rows = parseRosterText(text);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].studentName, "Smith, Jordan");
    assert.equal(rows[1].studentName, "Van Dyke, Amari");
    assert.deepEqual(rows.map(({ displayName, grade, homeroom, externalStudentId, valid }) => ({ displayName, grade, homeroom, externalStudentId, valid })), [
      { displayName: "Jordan Smith", grade: "7", homeroom: "Carter", externalStudentId: "12345", valid: true },
      { displayName: "Amari Van Dyke", grade: "6", homeroom: "Ms. O'Neil-Santos", externalStudentId: "67890", valid: true },
    ]);
  });

  it("omits middle names while preserving compound surnames and hyphenated first names", () => {
    const rows = parseRosterText([
      "De La Cruz, Ana Maria Elena\t100\t6\tHomeroom 6th Rivera",
      "Smith, Mary-Jane Louise\t101\t7\tHomeroom 7th Carter",
    ].join("\n"));

    assert.equal(rows[0].displayName, "Ana De La Cruz");
    assert.equal(rows[1].displayName, "Mary-Jane Smith");
  });

  it("supports rows without headers in the documented column order", () => {
    const [row] = parseRosterText("Nguyen, Kai\tA-100\t8\tHomeroom 8th Grade Dr. Lee");

    assert.equal(row.displayName, "Kai Nguyen");
    assert.equal(row.homeroom, "Dr. Lee");
    assert.equal(row.valid, true);
  });

  it("rejects malformed names and homerooms", () => {
    const [row] = parseRosterText("Jordan Smith\t12345\t7\tCarter");

    assert.equal(row.valid, false);
    assert.deepEqual(row.errors, [
      "Student name must use LastName, FirstName format",
      "Homeroom must use Homeroom 6th TeacherName format",
    ]);
  });

  it("redacts the Student ID in the new second-column position", () => {
    const text = "Student Name\tStudent ID\tGrade Level\tHomeroom\nSmith, Jordan\t12345\t7\tHomeroom 7th Carter";

    assert.equal(
      redactRosterText(text),
      "Student Name\tStudent ID\tGrade Level\tHomeroom\nSmith, Jordan\t[hidden]\t7\tHomeroom 7th Carter",
    );
  });

  it("revalidates edited preview fields without changing the protected Student ID", () => {
    const [sourceRow] = parseRosterText("Smith Jordan\t12345\t7\tCarter");
    const [correctedRow] = revalidateRosterRows([{ ...sourceRow, studentName: "Smith, Jordan", homeroomSource: "Homeroom 7th Carter" }]);

    assert.equal(correctedRow.valid, true);
    assert.equal(correctedRow.displayName, "Jordan Smith");
    assert.equal(correctedRow.homeroom, "Carter");
    assert.equal(correctedRow.externalStudentId, "12345");
  });

  it("builds a valid manual student row using the stored roster fields", () => {
    const row = buildManualRosterRow({
      studentName: "De La Cruz, Ana Maria",
      externalStudentId: "S-200",
      grade: "6th",
      homeroom: "Ms. Rivera-Smith",
    });

    assert.equal(row.valid, true);
    assert.equal(row.studentName, "De La Cruz, Ana");
    assert.equal(row.displayName, "Ana De La Cruz");
    assert.equal(row.externalStudentId, "S-200");
    assert.equal(row.grade, "6");
    assert.equal(row.homeroom, "Ms. Rivera-Smith");
  });
});
