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
       donuts: donut charts drawn on pages that mention an asset allocation,
               measured from their shapes (see pdfDonuts below)
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
  const pages = [], donuts = [];
  for (let n = 1; n <= doc.numPages; n++){
    const page = await doc.getPage(n);
    const view = page.getViewport({scale: 1});
    const content = await page.getTextContent();
    /* Croesus draws the asset-allocation chart, labels and numbers included, as
       shapes rather than text, so the chart itself is measured instead */
    if (n <= 3 && content.items.some(t => /ASSET ALLOCATION/i.test(t.str || ""))){
      try { pdfDonuts(await pdfFills(page, lib)).forEach(d => donuts.push(Object.assign(d, {page: n - 1}))); }
      catch (e){ /* a drawing we cannot follow: the report is still read as text */ }
    }
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
  return {pages, lines, donuts, text: lines.map(l => l.text).join("\n")};
}

/* ── Charts drawn as shapes ─────────────────────────────────────────────── */

/** Every filled shape on a page: {color: "#rrggbb", segs: [{op: "m"|"l"|"c", pts: [[x, y], …]}]},
    in page points (y up), with transforms and embedded drawings already applied. */
async function pdfFills(page, lib){
  const OPS = lib.OPS, list = await page.getOperatorList();
  const mul = (m, c) => [m[0]*c[0] + m[1]*c[2], m[0]*c[1] + m[1]*c[3], m[2]*c[0] + m[3]*c[2], m[2]*c[1] + m[3]*c[3],
                         m[4]*c[0] + m[5]*c[2] + c[4], m[4]*c[1] + m[5]*c[3] + c[5]];
  const hex = (a) => typeof a[0] === "string" ? a[0].toLowerCase()
    : "#" + Array.from(a).slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  const FILLS = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  let ctm = [1, 0, 0, 1, 0, 0], color = "#000000", path = [];
  const stack = [], out = [];
  const pt = (x, y) => [ctm[0]*x + ctm[2]*y + ctm[4], ctm[1]*x + ctm[3]*y + ctm[5]];
  list.fnArray.forEach((fn, i) => {
    const a = list.argsArray[i];
    if (fn === OPS.save) stack.push({ctm, color});
    else if (fn === OPS.restore){ const s = stack.pop(); if (s){ ctm = s.ctm; color = s.color; } }
    else if (fn === OPS.transform) ctm = mul(a, ctm);
    else if (fn === OPS.paintFormXObjectBegin){ stack.push({ctm, color}); if (a[0]) ctm = mul(a[0], ctm); }
    else if (fn === OPS.paintFormXObjectEnd){ const s = stack.pop(); if (s){ ctm = s.ctm; color = s.color; } }
    else if (fn === OPS.setFillRGBColor) color = hex(a);
    else if (fn === OPS.constructPath){
      const ops = a[0], v = a[1];
      let k = 0, cur = [0, 0];
      ops.forEach(op => {
        if (op === OPS.moveTo){ cur = [v[k], v[k+1]]; path.push({op: "m", pts: [pt(cur[0], cur[1])]}); k += 2; }
        else if (op === OPS.lineTo){ cur = [v[k], v[k+1]]; path.push({op: "l", pts: [pt(cur[0], cur[1])]}); k += 2; }
        else if (op === OPS.curveTo){ path.push({op: "c", pts: [pt(v[k], v[k+1]), pt(v[k+2], v[k+3]), pt(v[k+4], v[k+5])]}); cur = [v[k+4], v[k+5]]; k += 6; }
        else if (op === OPS.curveTo2){ path.push({op: "c", pts: [pt(cur[0], cur[1]), pt(v[k], v[k+1]), pt(v[k+2], v[k+3])]}); cur = [v[k+2], v[k+3]]; k += 4; }
        else if (op === OPS.curveTo3){ path.push({op: "c", pts: [pt(v[k], v[k+1]), pt(v[k+2], v[k+3]), pt(v[k+2], v[k+3])]}); cur = [v[k+2], v[k+3]]; k += 4; }
        else if (op === OPS.rectangle){
          const [x, y, w, h] = v.slice(k, k + 4);
          path.push({op: "m", pts: [pt(x, y)]}, {op: "l", pts: [pt(x + w, y)]}, {op: "l", pts: [pt(x + w, y + h)]}, {op: "l", pts: [pt(x, y + h)]});
          k += 4;
        }
      });
    }
    else if (FILLS.has(fn)){ if (path.length) out.push({color, segs: path}); path = []; }
    else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.endPath) path = [];
  });
  return out;
}

/** Donut charts among the filled shapes. A donut is a ring of slices, each drawn from
    the outer arc's start A round to its end B, across to the inner arc and back; the
    slices chain (one's B is the next one's A) all the way round. Each slice's share
    is the angle it sweeps, which is exact to far better than the 0.1% a report prints.
    Returns [{cx, cy, r, slices: [{color, pct}], legend: [{color, x, y}]}]. */
function pdfDonuts(fills){
  const same = (p, q) => Math.abs(p[0] - q[0]) < 0.05 && Math.abs(p[1] - q[1]) < 0.05;
  /* the corners of each shape that could be a slice: A, B (outer) and C, D (inner) */
  const slices = [];
  fills.forEach(f => {
    if (f.segs.length > 14 || f.segs[0].op !== "m" || f.segs.slice(1).some(s => s.op === "m")) return;
    const v = f.segs.map(s => s.pts[s.pts.length - 1]);
    const li = f.segs.findIndex((s, i) => i > 0 && s.op === "l" && !same(v[i - 1], v[i]));
    if (li < 2) return;
    slices.push({color: f.color, A: v[0], B: v[li - 1], C: v[li], D: v[v.length - 1],
      outer: f.segs.slice(1, li).filter(s => s.op === "c"), fill: f});
  });
  const used = new Set(), out = [];
  slices.forEach(s0 => {
    if (used.has(s0)) return;
    /* follow the chain from this slice until it comes back round */
    const ring = [s0];
    let cur = s0;
    while (ring.length < 40){
      const nx = slices.find(s => !ring.includes(s) && !used.has(s) && same(s.A, cur.B));
      if (!nx) break;
      ring.push(nx); cur = nx;
    }
    if (!same(cur.B, s0.A) || ring.length < 2) return;
    /* the centre: the circle through every point on the outer arcs */
    const P = [];
    ring.forEach(s => { P.push(s.A); s.outer.forEach(c => {
      const [p0, p1, p2] = c.pts, q = P[P.length - 1];
      P.push([0.125*q[0] + 0.375*p0[0] + 0.375*p1[0] + 0.125*p2[0], 0.125*q[1] + 0.375*p0[1] + 0.375*p1[1] + 0.125*p2[1]], p2);
    }); });
    const fit = circleFit(P);
    if (!fit || fit.r < 8 || P.some(p => Math.abs(Math.hypot(p[0] - fit.cx, p[1] - fit.cy) - fit.r) > Math.max(0.6, fit.r * 0.01))) return;
    const ang = (p) => Math.atan2(p[1] - fit.cy, p[0] - fit.cx);
    /* which way round the ring goes, from the biggest slice */
    const sweep = (s, dir) => { let d = (ang(s.B) - ang(s.A)) * dir; while (d < 0) d += 2 * Math.PI; return d; };
    const total = (dir) => ring.reduce((n, s) => n + sweep(s, dir), 0);
    const dir = Math.abs(total(-1) - 2 * Math.PI) < Math.abs(total(1) - 2 * Math.PI) ? -1 : 1;
    if (Math.abs(total(dir) - 2 * Math.PI) > 0.01) return;
    ring.forEach(s => used.add(s));
    out.push({cx: fit.cx, cy: fit.cy, r: fit.r,
      slices: ring.map(s => ({color: s.color, pct: sweep(s, dir) / (2 * Math.PI) * 100}))});
  });
  /* the legend: small squares in the slice colours, beside the chart, top to bottom */
  out.forEach(d => {
    d.legend = fills.filter(f => {
      const xs = f.segs.flatMap(s => s.pts.map(p => p[0])), ys = f.segs.flatMap(s => s.pts.map(p => p[1]));
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      f._box = {x: Math.min(...xs), y: (Math.max(...ys) + Math.min(...ys)) / 2, w, h};
      return f.segs.filter(s => s.op === "m").length === 1 && w > 3 && w < 24 && h > 3 && h < 24 &&
        Math.min(...xs) > d.cx + d.r && Math.min(...xs) < d.cx + d.r * 4 && Math.abs(f._box.y - d.cy) < d.r * 1.6;
    }).map(f => ({color: f.color, x: f._box.x, y: f._box.y})).sort((a, b) => b.y - a.y)
      .filter((l, i, all) => all.findIndex(m => m.color === l.color) === i);
  });
  return out;
}

/** Least-squares circle through points: {cx, cy, r}, or null. */
function circleFit(P){
  if (P.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = P.length, mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n;
  P.forEach(([x0, y0]) => { const x = x0 - mx, y = y0 - my, z = x*x + y*y;
    sx += x; sy += y; sxx += x*x; syy += y*y; sxy += x*y; sxz += x*z; syz += y*z; sz += z; });
  /* solve for x² + y² + Dx + Ey + F = 0 */
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], R = [-sxz, -syz, -sz];
  const det = (m) => m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]);
  const d0 = det(M);
  if (Math.abs(d0) < 1e-9) return null;
  const col = (k) => M.map((row, i) => row.map((v, j) => j === k ? R[i] : v));
  const D = det(col(0)) / d0, E = det(col(1)) / d0, F = det(col(2)) / d0;
  const cx = -D / 2, cy = -E / 2, r2 = cx*cx + cy*cy - F;
  return r2 > 0 ? {cx: cx + mx, cy: cy + my, r: Math.sqrt(r2)} : null;
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
