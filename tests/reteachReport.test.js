import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, decodePDFRawStream } from "pdf-lib";
import { generateReteachReport, generateReteachReports, wrapPdfText } from "../src/utils/reteachReport.js";

const templatePath = new URL("../public/templates/core-4.pdf", import.meta.url);

test("generates a two-page report without changing the template page count", async () => {
  const template = await readFile(templatePath);
  const generated = await generateReteachReport(template, {
    studentName: "Jordan Smith",
    homeroom: "Carter HR",
    assignedByName: "Ms. Reynolds",
    note: "The student continued talking during independent work after two reminders and needs to practice following the quiet-work routine."
  });
  const document = await PDFDocument.load(generated);

  assert.equal(document.getPageCount(), 2);
  assert.notEqual(Buffer.compare(Buffer.from(generated), template), 0);
  assert.match(document.getTitle(), /Jordan Smith/);
});

test("fits the maximum supported reteach note length", async () => {
  const template = await readFile(templatePath);
  const note = `${"Follow the classroom direction, pause, and choose a respectful response. ".repeat(8)}`.slice(0, 500);

  const generated = await generateReteachReport(template, {
    studentName: "A Student With A Deliberately Long Display Name",
    homeroom: "A Long Homeroom Name",
    assignedByName: "A Staff Member With A Long Name",
    note
  });

  assert.notEqual(Buffer.compare(Buffer.from(generated), template), 0);
});

test("wrapPdfText preserves manual paragraph breaks", async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont("Helvetica");
  const lines = wrapPdfText("First paragraph.\nSecond paragraph.", font, 10, 250);

  assert.deepEqual(lines, ["First paragraph.", "Second paragraph."]);
});

function pageContents(document, index) {
  const contents = document.getPage(index).node.Contents();
  if (typeof contents.size !== "function") return Buffer.from(decodePDFRawStream(contents).decode()).toString("latin1");
  return Array.from({ length: contents.size() }, (_, streamIndex) => {
    const stream = document.context.lookup(contents.get(streamIndex));
    return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
  }).join("\n");
}

test("combines three complete two-page reports in the supplied order", async () => {
  const template = await readFile(templatePath);
  const records = ["Bobby", "Stacy", "Gwen"].map(studentName => ({
    studentName, homeroom: "Carter HR", assignedByName: "Ms. Reynolds", note: `Review expectations with ${studentName}.`
  }));
  const combined = await PDFDocument.load(await generateReteachReports(template, records));
  assert.equal(combined.getPageCount(), 6);
  for (const [index, record] of records.entries()) {
    const individual = await PDFDocument.load(await generateReteachReport(template, record));
    assert.equal(pageContents(combined, index * 2), pageContents(individual, 0));
    assert.equal(pageContents(combined, index * 2 + 1), pageContents(individual, 1));
  }
  assert.deepEqual(await readFile(templatePath), template);
});

test("includes multiple reports for the same student with their own notes", async () => {
  const template = await readFile(templatePath);
  const first = { studentName: "Bobby", note: "Practice following classroom directions." };
  const second = { studentName: "Bobby", note: "Practice respectful hallway transitions." };
  const combined = await PDFDocument.load(await generateReteachReports(template, [first, second]));
  assert.equal(combined.getPageCount(), 4);
  assert.notEqual(pageContents(combined, 0), pageContents(combined, 2));
});

test("rejects an empty batch and identifies a report that cannot be generated", async () => {
  const template = await readFile(templatePath);
  await assert.rejects(generateReteachReports(template, []), /Select at least one report/);
  await assert.rejects(generateReteachReports(template, [
    { studentName: "Bobby", note: "Review expectations." },
    { studentName: "Stacy", note: "An excessively long note. ".repeat(200) }
  ]), /Report for Stacy could not be generated.*too long/);
});
