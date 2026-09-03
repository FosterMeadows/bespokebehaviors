const TEMPLATE_PATH = "templates/core-4.pdf";
let pdfLibPromise;

function loadPdfLib() {
  pdfLibPromise ||= import("pdf-lib");
  return pdfLibPromise;
}
const BOX = {
  x: 58,
  right: 554,
  top: 720,
  dividerY: 684,
  noteTop: 658,
  noteBottom: 606
};

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function encodableText(value, font) {
  return [...cleanText(value)].map((character) => {
    if (character === "\n") return character;
    try {
      font.encodeText(character);
      return character;
    } catch {
      return "?";
    }
  }).join("");
}

function splitLongWord(word, font, size, maxWidth) {
  const pieces = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function wrapPdfText(value, font, size, maxWidth) {
  const text = encodableText(value, font);
  if (!text) return [];

  const lines = [];
  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }

    let current = "";
    words.forEach((word) => {
      const pieces = font.widthOfTextAtSize(word, size) > maxWidth
        ? splitLongWord(word, font, size, maxWidth)
        : [word];
      pieces.forEach((piece) => {
        const candidate = current ? `${current} ${piece}` : piece;
        if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
          lines.push(current);
          current = piece;
        } else {
          current = candidate;
        }
      });
    });
    if (current) lines.push(current);
  });
  return lines;
}

function fitWrappedText(value, font, maxWidth, maxHeight) {
  for (let size = 10.5; size >= 8.25; size -= 0.25) {
    const lineHeight = size * 1.2;
    const lines = wrapPdfText(value, font, size, maxWidth);
    if (lines.length * lineHeight <= maxHeight) return { size, lineHeight, lines };
  }
  throw new Error("The reteach note is too long to fit in the report template.");
}

function fitSingleLine(value, font, preferredSize, minSize, maxWidth) {
  const text = encodableText(value, font) || "Not listed";
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  if (font.widthOfTextAtSize(text, size) > maxWidth) {
    let clipped = text;
    while (clipped.length && font.widthOfTextAtSize(`${clipped}...`, size) > maxWidth) clipped = clipped.slice(0, -1);
    return { text: `${clipped}...`, size };
  }
  return { text, size };
}

function drawMetadataField(page, { label, value, x, width }, boldFont, colors) {
  page.drawText(label, { x, y: BOX.top - 10, size: 7.25, font: boldFont, color: colors.gray });
  const fitted = fitSingleLine(value, boldFont, 10.5, 7.5, width);
  page.drawText(fitted.text, { x, y: BOX.top - 26, size: fitted.size, font: boldFont, color: colors.text });
}

export async function generateReteachReport(templateBytes, record) {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const pdf = await PDFDocument.load(templateBytes);
  if (pdf.getPageCount() < 1) throw new Error("The report template does not contain a page.");

  const page = pdf.getPage(0);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = BOX.right - BOX.x;
  const colors = {
    gray: rgb(0.35, 0.38, 0.42),
    rule: rgb(0.76, 0.78, 0.8),
    text: rgb(0.08, 0.09, 0.1)
  };

  drawMetadataField(page, {
    label: "STUDENT",
    value: record.studentName,
    x: BOX.x,
    width: 218
  }, boldFont, colors);
  drawMetadataField(page, {
    label: "HOMEROOM",
    value: record.homeroom,
    x: 286,
    width: 112
  }, boldFont, colors);
  drawMetadataField(page, {
    label: "ASSIGNED BY",
    value: record.assignedByName,
    x: 408,
    width: BOX.right - 408
  }, boldFont, colors);

  page.drawLine({
    start: { x: BOX.x, y: BOX.dividerY },
    end: { x: BOX.right, y: BOX.dividerY },
    thickness: 0.7,
    color: colors.rule
  });
  page.drawText("RETEACH NOTE", {
    x: BOX.x,
    y: BOX.dividerY - 14,
    size: 7.25,
    font: boldFont,
    color: colors.gray
  });

  const note = fitWrappedText(record.note, regularFont, contentWidth, BOX.noteTop - BOX.noteBottom);
  note.lines.forEach((line, index) => {
    page.drawText(line, {
      x: BOX.x,
      y: BOX.noteTop - index * note.lineHeight,
      size: note.size,
      font: regularFont,
      color: colors.text
    });
  });

  pdf.setTitle(`Behavior Reteach & Reset - ${cleanText(record.studentName) || "Student"}`);
  pdf.setSubject("Generated behavior reteach report");
  return pdf.save();
}

function safeFilenamePart(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "student";
}

export async function downloadReteachReport(record) {
  const templateUrl = `${import.meta.env.BASE_URL}${TEMPLATE_PATH}`;
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error("The report template could not be loaded.");

  const bytes = await generateReteachReport(await response.arrayBuffer(), record);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `reteach-report-${safeFilenamePart(record.studentName)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
}
