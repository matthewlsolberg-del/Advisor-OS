/* ==========================================================================
   pdfread.js — reading PDFs on this computer, with the layout kept.

   Uses the embedded copy of Mozilla pdf.js (bottom of the file). Every piece
   of text comes back with its position, so a report's rows and columns can be
   rebuilt: that is what lets facts.js pick the numbers out of a Croesus
   portfolio report or a financial plan without any guessing by an AI.

     readPdf(file)  -> { pages, lines, text }
       pages: [{ width, height, items: [{ s, x, y, w }] }]   y measured from the top
       lines: [{ page, y, cells: [{ s, x, w }], text }]       cells left to right
       text : the whole document as lines of text
   ========================================================================== */

async function readPdf(file){
  const lib = globalThis.pdfjsLib;
  if (!lib) throw Error("The PDF reader did not load. Try opening the file in Edge or Chrome.");
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({
    data,
    isEvalSupported: false,   /* never compile code from a PDF (and the page forbids it anyway) */
    disableFontFace: true,    /* we only want the text, not the drawing */
    useSystemFonts: false,
    verbosity: 0
  }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++){
    const page = await doc.getPage(n);
    const view = page.getViewport({scale: 1});
    const content = await page.getTextContent();
    pages.push({
      width: view.width, height: view.height,
      items: content.items.filter(t => t.str && t.str.trim()).map(t => ({
        s: t.str.replace(/\s+/g, " ").trim(),
        x: Math.round(t.transform[4] * 10) / 10,
        y: Math.round((view.height - t.transform[5]) * 10) / 10,
        w: Math.round(t.width * 10) / 10
      }))
    });
  }
  await doc.destroy();
  const lines = pdfLines(pages);
  return {pages, lines, text: lines.map(l => l.text).join("\n")};
}

/** Group text into lines (same height on the page), then left to right. Pieces that
    touch (a word split in two by the PDF) are joined back into one cell. */
function pdfLines(pages, tolerance){
  const tol = tolerance || 2.6, out = [];
  pages.forEach((p, pi) => {
    const items = p.items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let row = [], y = null;
    const flush = () => {
      if (!row.length) return;
      row.sort((a, b) => a.x - b.x);
      const cells = [];
      row.forEach(it => {
        const last = cells[cells.length - 1];
        if (last && it.x - (last.x + last.w) < 1.2){ last.s += (it.x - (last.x + last.w) > 0.4 ? " " : "") + it.s; last.w = it.x + it.w - last.x; }
        else cells.push({s: it.s, x: it.x, w: it.w});
      });
      out.push({page: pi, y, cells, text: cells.map(c => c.s).join("  ")});
      row = [];
    };
    items.forEach(it => {
      if (y == null || Math.abs(it.y - y) > tol){ flush(); y = it.y; }
      row.push(it);
    });
    flush();
  });
  return out;
}

/** "$ 1,234.56", "(4.06)", "-5.41", "12%" -> number; anything else -> null. */
function num(s){
  let t = String(s == null ? "" : s).trim();
  if (!t || /^n\/?d$/i.test(t)) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/^\$\s*/, ""));
  t = t.replace(/[()$%\s,]/g, "").replace(/^-/, "").replace(/\/(yr|mo)$/i, "");
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t);
  return neg ? -v : v;
}
const isNum = (s) => num(s) != null;
