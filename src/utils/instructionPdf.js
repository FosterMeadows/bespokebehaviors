export async function createInstructionPdf(text) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page;
  let y;
  const pages = [];
  const newPage = () => {
    page = pdf.addPage([612, 792]); pages.push(page); y = 726;
    page.drawText("BESPOKE BEHAVIORS  /  INSTRUCTION RECORD", { x: 48, y: 760, size: 8, font: bold, color: rgb(.35, .35, .45) });
  };
  newPage();
  const clean = (value) => value.replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  for (const raw of text.split("\n")) {
    const heading = raw === "Instruction Record" || /^(ELA INSTRUCTION|WIN INSTRUCTION|IXL ASSIGNMENTS|NARRATIVE SUMMARY|PERIOD OVERVIEW|CHRONOLOGICAL INSTRUCTION RECORD|STANDARDS COVERAGE SUMMARY)$/.test(raw);
    const entryHeading = / \| (ELA|WIN|IXL) \| /.test(raw);
    const size = raw === "Instruction Record" ? 22 : heading ? 12 : 10;
    const font = heading || entryHeading ? bold : regular;
    const lineHeight = heading ? 22 : 15;
    if (y < (heading || entryHeading ? 125 : 60)) newPage();
    if (!raw) { y -= 10; continue; }
    let line = "";
    const draw = () => { if (y < 60) newPage(); page.drawText(line, { x: 48, y, size, font, color: heading || entryHeading ? rgb(.31, .20, .52) : rgb(.13, .16, .22) }); y -= lineHeight; line = ""; };
    // Character wrapping also handles long Canva links and pasted identifiers.
    for (const character of clean(raw)) {
      if (font.widthOfTextAtSize(line + character, size) > 516) {
        const split = line.lastIndexOf(" ");
        if (split > line.length / 2) { const remainder = line.slice(split + 1); line = line.slice(0, split); draw(); line = remainder; }
        else draw();
      }
      line += character;
    }
    if (line) draw();
  }
  pages.forEach((item, index) => item.drawText(`${index + 1} / ${pages.length}`, { x: 530, y: 30, size: 9, font: regular, color: rgb(.4, .4, .45) }));
  return pdf.save();
}

export async function downloadInstructionPdf(text, filename) {
  const bytes = await createInstructionPdf(text);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
