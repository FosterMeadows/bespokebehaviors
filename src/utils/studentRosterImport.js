const EXPECTED_COLUMNS = ["studentName", "externalStudentId", "grade", "homeroom"];

const HEADER_ALIASES = {
  studentname: "studentName",
  name: "studentName",
  displayname: "studentName",
  studentid: "externalStudentId",
  studentnumber: "externalStudentId",
  sisid: "externalStudentId",
  stateid: "externalStudentId",
  grade: "grade",
  gradelevel: "grade",
  homeroom: "homeroom",
  homebase: "homeroom",
};

function normalizedHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseStudentName(value) {
  const source = String(value || "").trim();
  const separator = source.indexOf(",");
  if (separator < 1) return { displayName: "", valid: false };
  const lastName = source.slice(0, separator).trim();
  const givenNames = source.slice(separator + 1).trim();
  if (!lastName || !givenNames) return { displayName: "", valid: false };
  const firstName = givenNames.split(/\s+/)[0];
  return {
    importName: `${lastName}, ${firstName}`,
    displayName: `${firstName} ${lastName}`.replace(/\s+/g, " "),
    valid: true,
  };
}

function extractHomeroomTeacher(value) {
  const source = String(value || "").trim();
  const match = source.match(/^homeroom\s+\(?\s*(?:(?:grade\s*)?\d+(?:st|nd|rd|th)?|k(?:indergarten)?)\s*\)?(?:\s+grade)?\s+(.+)$/i);
  return match?.[1]?.trim().replace(/\s+/g, " ") || "";
}

function normalizeGrade(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(?:grade\s*)?(\d+)(?:st|nd|rd|th)?$/i);
  return match ? String(Number(match[1])) : source;
}

function validateRosterRow(row) {
  const studentName = String(row.studentName || "").trim();
  const externalStudentId = String(row.externalStudentId || "").trim();
  const grade = normalizeGrade(row.grade);
  const homeroomSource = String(row.homeroomSource || "").trim();
  const parsedName = parseStudentName(studentName);
  const homeroom = extractHomeroomTeacher(homeroomSource);
  const errors = [];
  if (!studentName) errors.push("Student name is missing");
  else if (!parsedName.valid) errors.push("Student name must use LastName, FirstName format");
  if (!externalStudentId) errors.push("Student ID is missing");
  if (!grade) errors.push("Grade level is missing");
  if (!homeroomSource) errors.push("Homeroom is missing");
  else if (!homeroom) errors.push("Homeroom must use Homeroom 6th TeacherName format");
  if (row.columnCount < 4) errors.push("Expected four spreadsheet columns");
  return {
    ...row,
    studentName,
    displayName: parsedName.displayName,
    grade,
    homeroomSource,
    homeroom,
    externalStudentId,
    errors,
    valid: errors.length === 0,
  };
}

export function revalidateRosterRows(rows) {
  const validated = rows.map(validateRosterRow);
  const idCounts = new Map();
  validated.forEach(row => {
    const key = row.externalStudentId.trim().toUpperCase();
    if (key) idCounts.set(key, (idCounts.get(key) || 0) + 1);
  });
  return validated.map(row => {
    const duplicate = row.externalStudentId && idCounts.get(row.externalStudentId.trim().toUpperCase()) > 1;
    if (!duplicate) return row;
    return { ...row, valid: false, errors: [...row.errors, "Duplicate student ID in this paste"] };
  });
}

export function buildManualRosterRow({ studentName, externalStudentId, grade, homeroom }) {
  const parsedName = parseStudentName(studentName);
  const cleanedId = String(externalStudentId || "").trim();
  const cleanedGrade = normalizeGrade(grade);
  const cleanedHomeroom = String(homeroom || "").trim().replace(/\s+/g, " ");
  const errors = [];
  if (!String(studentName || "").trim()) errors.push("Student name is missing");
  else if (!parsedName.valid) errors.push("Student name must use LastName, FirstName format");
  if (!cleanedId) errors.push("Student ID is missing");
  if (!cleanedGrade) errors.push("Grade level is missing");
  if (!cleanedHomeroom) errors.push("Homeroom teacher is missing");
  return {
    rowNumber: 1,
    studentName: parsedName.valid ? parsedName.importName : String(studentName || "").trim(),
    displayName: parsedName.displayName,
    externalStudentId: cleanedId,
    grade: cleanedGrade,
    homeroom: cleanedHomeroom,
    errors,
    valid: errors.length === 0,
  };
}

export function parseRosterText(text) {
  const lines = String(text || "").split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const firstCells = lines[0].split("\t").map(cell => cell.trim());
  const detectedHeaders = firstCells.map(cell => HEADER_ALIASES[normalizedHeader(cell)] || "");
  const hasHeaders = EXPECTED_COLUMNS.every(column => detectedHeaders.includes(column));
  const columnOrder = hasHeaders ? detectedHeaders : EXPECTED_COLUMNS;
  const dataLines = hasHeaders ? lines.slice(1) : lines;

  const sourceRows = dataLines.map((line, index) => {
    const cells = line.split("\t").map(cell => cell.trim());
    const values = {};
    columnOrder.forEach((column, cellIndex) => {
      if (column) values[column] = cells[cellIndex] || "";
    });
    const pastedStudentName = values.studentName || "";
    const parsedPastedName = parseStudentName(pastedStudentName);
    const studentName = parsedPastedName.valid ? parsedPastedName.importName : pastedStudentName;
    const externalStudentId = values.externalStudentId || "";
    const grade = values.grade || "";
    const homeroomSource = values.homeroom || "";
    return {
      rowNumber: index + (hasHeaders ? 2 : 1),
      studentName,
      grade,
      homeroomSource,
      externalStudentId,
      columnCount: cells.length,
    };
  });
  return revalidateRosterRows(sourceRows);
}

export function redactRosterText(text) {
  const lines = String(text || "").split(/\r?\n/);
  if (!lines.length || !text) return "";
  const firstCells = lines[0].split("\t").map(cell => cell.trim());
  const detectedHeaders = firstCells.map(cell => HEADER_ALIASES[normalizedHeader(cell)] || "");
  const hasHeaders = detectedHeaders.includes("externalStudentId");
  const idColumn = hasHeaders ? detectedHeaders.indexOf("externalStudentId") : 1;
  return lines.map((line, index) => {
    if (hasHeaders && index === 0) return line;
    const cells = line.split("\t");
    if (cells[idColumn] !== undefined && cells[idColumn].trim()) cells[idColumn] = "[hidden]";
    return cells.join("\t");
  }).join("\n");
}
