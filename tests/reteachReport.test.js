import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { generateReteachReport, wrapPdfText } from "../src/utils/reteachReport.js";

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
