/* ==========================================================================
   viz.js — charts and infographics, drawn as inline SVG.

   Everything is vector, so it stays crisp in the PDF at any size, and the
   colour order follows the TD data-visualisation rule: Shield Green leads,
   Premium Green second, gold third, then the secondary palette one at a time.
   ========================================================================== */

const VIZ_W = 660;                      /* the content column, in CSS px */
const SEQ = BRAND.sequence;
const INK = "#1C1C1C";

const svgEsc = (s) => esc(s);
const nfmt = (n) => {
  if (n == null || n === "" || isNaN(n)) return "";
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString("en-CA", {maximumFractionDigits:0});
  if (a >= 100)  return n.toFixed(0);
  if (a >= 10)   return n.toFixed(1).replace(/\.0$/,"");
  return String(Math.round(n * 100) / 100);
};

/* A "nice" axis top: 1, 2, 2.5 or 5 × a power of ten. */
function niceMax(v){
  if (!(v > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * pow;
}
function axisTicks(max, count){
  const t = [];
  for (let i = 0; i <= count; i++) t.push(max * i / count);
  return t;
}

/* A value axis that always includes zero and reaches below it when the data
   does (calendar-year returns, for instance). All-positive data keeps the
   original 0 → niceMax scale with four steps. */
function niceScale(lo, hi){
  lo = Math.min(0, isFinite(lo) ? lo : 0);
  hi = Math.max(0, isFinite(hi) ? hi : 0);
  if (lo >= 0){
    const max = niceMax(hi * 1.05);
    return {min:0, max, ticks:axisTicks(max, 4)};
  }
  hi *= 1.05; lo *= 1.12;                /* room for labels above and below */
  const step = niceMax((hi - lo) / 5);
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = hi > 0 ? Math.ceil(hi / step - 1e-9) * step : 0;
  const ticks = [];
  for (let k = Math.round(min / step); k <= Math.round(max / step); k++) ticks.push(k * step);
  return {min, max, ticks};
}

/* Word-wrap for SVG text: estimates glyph width from the font size (the
   same rough measure the rest of this file uses) and breaks into lines.
   Words longer than a line are split so nothing runs sideways. */
function wrapText(s, maxW, fs){
  const maxCh = Math.max(4, Math.floor(maxW / (fs * 0.58)));
  const lines = [];
  let line = "";
  String(s == null ? "" : s).split(/\s+/).filter(Boolean).forEach(w => {
    while (w.length > maxCh){
      if (line){ lines.push(line); line = ""; }
      lines.push(w.slice(0, maxCh - 1) + "-");
      w = w.slice(maxCh - 1);
    }
    if (!line) line = w;
    else if ((line + " " + w).length > maxCh){ lines.push(line); line = w; }
    else line += " " + w;
  });
  if (line) lines.push(line);
  return lines;
}
/* One <text> with a <tspan> per wrapped line; y is the first baseline. */
function svgLines(lines, x, y, lh, attrs){
  if (!lines.length) return "";
  return `<text x="${x}" y="${y}" ${attrs}>` +
         lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${svgEsc(l)}</tspan>`).join("") +
         `</text>`;
}

/* Text colour from the fill it sits on: white only where white has the
   better contrast (deep green, kick green, aged gold, slate, purple), ink
   on light fills. Shield Green always takes ink — never white on #42BF19. */
function textOn(fill){
  const h = String(fill || "").replace("#", "").toUpperCase();
  if (h === "42BF19" || !/^[0-9A-F]{6}$/.test(h)) return INK;
  const lin = (i) => {
    const c = parseInt(h.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  const LINK = 0.0116;                   /* luminance of #1C1C1C */
  return 1.05 / (L + 0.05) >= (L + 0.05) / (LINK + 0.05) ? "#FFFFFF" : INK;
}
/* Secondary (description) text on a fill: solid colours, no transparency. */
function subTextOn(fill){
  return textOn(fill) === "#FFFFFF" ? "#E4E9E2" : INK;
}

/* ── Charts ─────────────────────────────────────────────────────────────── */

function chartSVG(b){
  const labels = (b.labels || []).map(String);
  const series = (b.series || []).filter(s => s && s.values);
  const unit = b.unit || "";
  switch (b.chart){
    case "line":  return lineChart(labels, series, unit);
    case "donut": return donutChart(labels, series[0] ? series[0].values : [], unit);
    case "hbar":  return hBarChart(labels, series[0] ? series[0].values : [], unit);
    case "stack": return barChart(labels, series, unit, true);
    default:      return barChart(labels, series, unit, false);
  }
}

function chartFrame(h, inner){
  return `<svg viewBox="0 0 ${VIZ_W} ${h}" width="100%" height="${h}" role="img" ` +
         `style="font-family:inherit">${inner}</svg>`;
}

/* Legend that flows onto as many rows as it needs within maxW. Long names
   wrap inside their own entry. Returns the markup and the height used
   below the first baseline. */
function legend(names, x, y, maxW){
  const fs = 11, rowH = 17, limit = maxW || (VIZ_W - x);
  let out = "", cx = x, cy = y, rowExtra = 0;
  names.forEach((n, i) => {
    const lines = wrapText(n, Math.min(240, limit - 14), fs);
    const textW = Math.max(0, ...lines.map(l => l.length)) * fs * 0.58;
    const w = 14 + textW + 16;
    if (cx > x && cx + w - 16 > x + limit){ cx = x; cy += rowH + rowExtra; rowExtra = 0; }
    out += `<rect x="${cx}" y="${cy - 8}" width="9" height="9" fill="${SEQ[i % SEQ.length]}"/>` +
           svgLines(lines, cx + 14, cy, 13, `font-size="${fs}" fill="#3C4339"`);
    rowExtra = Math.max(rowExtra, (lines.length - 1) * 13);
    cx += w;
  });
  return {svg:out, height:cy - y + rowExtra};
}

/* X-axis labels wrapped to their slot; returns markup and line count. A line
   chart puts its first and last labels on the very edges of the plot, so each
   label is nudged inwards just enough to stay inside the chart. */
function xLabels(labels, xAt, slotW, y){
  let out = "", maxLines = 1;
  labels.forEach((lab, i) => {
    const lines = wrapText(lab, Math.max(30, slotW - 6), 11);
    maxLines = Math.max(maxLines, lines.length);
    const half = Math.max(0, ...lines.map(l => l.length)) * 11 * 0.58 / 2;
    const cx = Math.min(VIZ_W - 2 - half, Math.max(2 + half, xAt(i)));
    out += svgLines(lines, cx, y, 13, `font-size="11" fill="#3C4339" text-anchor="middle"`);
  });
  return {svg:out, lines:maxLines};
}

function valueAxis(sc, y, padL, padR, unit){
  let g = "";
  sc.ticks.forEach(t => {
    g += `<line x1="${padL}" x2="${VIZ_W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="#E4E9E2" stroke-width="1"/>` +
         `<text x="${padL - 9}" y="${y(t) + 4}" font-size="10.5" fill="#8b978d" text-anchor="end">${nfmt(t)}${unit && t === sc.max ? " " + svgEsc(unit) : ""}</text>`;
  });
  return g;
}

/* Bottom of the chart: x labels, then the legend, then the frame height. */
function chartFoot(labels, series, xAt, slotW, plotBottom, padL){
  const xl = xLabels(labels, xAt, slotW, plotBottom + 18);
  const lastLabelY = plotBottom + 18 + (xl.lines - 1) * 13;
  let leg = {svg:"", height:0};
  if (series.length > 1) leg = legend(series.map(s => s.name || ""), padL, lastLabelY + 20, VIZ_W - padL - 8);
  return {svg:xl.svg + leg.svg, H:lastLabelY + 28 + leg.height};
}

function barChart(labels, series, unit, stacked){
  const padL = 52, padR = 14, padT = 16, plotH = 206;
  const plotW = VIZ_W - padL - padR;
  const num = (v) => { const n = Number(v); return isNaN(n) || v === "" || v == null ? NaN : n; };
  let lo = 0, hi = 0;
  if (stacked){
    labels.forEach((_, i) => {
      let pos = 0, neg = 0;
      series.forEach(s => { const v = num(s.values[i]) || 0; if (v >= 0) pos += v; else neg += v; });
      hi = Math.max(hi, pos); lo = Math.min(lo, neg);
    });
  } else {
    series.forEach(s => s.values.forEach(v => { const n = num(v); if (!isNaN(n)){ hi = Math.max(hi, n); lo = Math.min(lo, n); } }));
  }
  const sc = niceScale(lo, hi);
  const span = sc.max - sc.min;
  const y = (v) => padT + plotH - ((v - sc.min) / span) * plotH;
  const y0 = y(0);

  const g = valueAxis(sc, y, padL, padR, unit);

  const slot = plotW / Math.max(1, labels.length);
  const n = stacked ? 1 : Math.max(1, series.length);
  const bw = Math.min(64, (slot * 0.62) / n);
  let bars = "";
  labels.forEach((lab, i) => {
    const cx = padL + slot * i + slot / 2;
    if (stacked){
      let pos = 0, neg = 0;
      series.forEach((s, si) => {
        const v = num(s.values[i]) || 0;
        if (!v) return;
        const from = v > 0 ? pos : neg, to = from + v;
        const ya = y(Math.max(from, to)), yb = y(Math.min(from, to));
        bars += `<rect x="${cx - bw/2}" y="${ya}" width="${bw}" height="${Math.max(0, yb - ya)}" fill="${SEQ[si % SEQ.length]}"/>`;
        if (v > 0) pos = to; else neg = to;
      });
    } else {
      series.forEach((s, si) => {
        const v = num(s.values[i]);
        if (isNaN(v)) return;
        const x = cx - (n * bw) / 2 + si * bw;
        const yy = y(v);
        const top = Math.min(yy, y0), h = Math.abs(y0 - yy);
        const ly = v < 0 ? yy + 14 : yy - 6;
        bars += `<rect x="${x}" y="${top}" width="${bw - 3}" height="${h}" fill="${SEQ[si % SEQ.length]}"/>` +
                `<text x="${x + (bw - 3)/2}" y="${ly}" font-size="10.5" fill="#3C4339" text-anchor="middle">${nfmt(v)}</text>`;
      });
    }
  });

  const base = `<line x1="${padL}" x2="${VIZ_W - padR}" y1="${y0}" y2="${y0}" stroke="#002B1A" stroke-width="1.2"/>`;
  const foot = chartFoot(labels, series, (i) => padL + slot * i + slot / 2, slot, padT + plotH, padL);
  return chartFrame(foot.H, g + bars + base + foot.svg);
}

function lineChart(labels, series, unit){
  const padL = 52, padR = 16, padT = 16, plotH = 206;
  const plotW = VIZ_W - padL - padR;
  const vals = series.flatMap(s => s.values.map(Number)).filter(v => !isNaN(v));
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const span = sc.max - sc.min;
  const y = (v) => padT + plotH - ((v - sc.min) / span) * plotH;
  const x = (i) => padL + (labels.length < 2 ? plotW / 2 : (plotW * i) / (labels.length - 1));

  const g = valueAxis(sc, y, padL, padR, unit);
  let lines = "";
  series.forEach((s, si) => {
    const col = SEQ[si % SEQ.length];
    const pts = s.values.map((v, i) => [x(i), y(Number(v) || 0)]);
    lines += `<polyline fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" ` +
             `points="${pts.map(p => p.join(",")).join(" ")}"/>`;
    pts.forEach(p => { lines += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#fff" stroke="${col}" stroke-width="2"/>`; });
  });
  const base = `<line x1="${padL}" x2="${VIZ_W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="#002B1A" stroke-width="1.2"/>`;
  const slotW = labels.length < 2 ? plotW : plotW / (labels.length - 1);
  const foot = chartFoot(labels, series, x, slotW, padT + plotH, padL);
  return chartFrame(foot.H, g + base + lines + foot.svg);
}

function donutChart(labels, values, unit){
  const cx = 168, R = 92, r = 56;
  const nums = values.map(v => Math.max(0, Number(v) || 0));
  const sum = nums.reduce((a, b) => a + b, 0);
  const total = sum || 1;
  /* Percent inputs that already add to ~100 are shown exactly as typed;
     anything else is shown as its computed share of the total. */
  const asTyped = unit === "%" && Math.abs(sum - 100) <= 0.5;

  /* Legend rows first, so the frame can grow to fit wrapped labels. */
  const lx = 348, valW = 70, lh = 15;
  const rowsData = labels.map((lab, i) => ({lab, i, lines:wrapText(lab, VIZ_W - 4 - valW - lx, 12)}));
  const rowsH = rowsData.reduce((a, d) => a + 21 + (d.lines.length - 1) * lh, 0);
  const H = Math.max(250, rowsH + 30);
  const cy = H / 2;

  let a0 = -Math.PI / 2, arcs = "";
  const p = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
  nums.forEach((v, i) => {
    if (!(v > 0)) return;                  /* zero slices draw nothing */
    const fill = SEQ[i % SEQ.length];
    const share = v / total;
    if (share >= 0.9999){
      /* A full ring: an arc can't start and end on the same point, so draw
         two half arcs outside and two inside (evenodd leaves the hole). */
      arcs += `<path d="M${cx} ${cy - R} A${R} ${R} 0 1 1 ${cx} ${cy + R} A${R} ${R} 0 1 1 ${cx} ${cy - R} Z ` +
              `M${cx} ${cy - r} A${r} ${r} 0 1 0 ${cx} ${cy + r} A${r} ${r} 0 1 0 ${cx} ${cy - r} Z" ` +
              `fill="${fill}" fill-rule="evenodd"/>`;
      a0 += Math.PI * 2;
      return;
    }
    const a1 = a0 + share * Math.PI * 2;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const [x0,y0] = p(a0,R), [x1,y1] = p(a1,R), [x2,y2] = p(a1,r), [x3,y3] = p(a0,r);
    arcs += `<path d="M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z" ` +
            `fill="${fill}" stroke="#fff" stroke-width="1.5"/>`;
    a0 = a1;
  });

  let rows = "", yy = cy - rowsH / 2 + 12;
  rowsData.forEach(d => {
    const i = d.i;
    const pct = asTyped ? nums[i] : (nums[i] / total) * 100;
    rows += `<rect x="330" y="${yy - 9}" width="10" height="10" fill="${SEQ[i % SEQ.length]}"/>` +
            svgLines(d.lines, lx, yy, lh, `font-size="12" fill="${INK}"`) +
            `<text x="${VIZ_W - 4}" y="${yy}" font-size="12" fill="#002B1A" text-anchor="end" font-weight="600">` +
            `${unit === "%" ? nfmt(pct) + "%" : nfmt(nums[i]) + (unit ? " " + svgEsc(unit) : "")}</text>`;
    yy += 21 + (d.lines.length - 1) * lh;
  });
  return chartFrame(H, arcs + rows);
}

function hBarChart(labels, values, unit){
  const padT = 10, padL = 150, padR = 46, lh = 14;
  const plotW = VIZ_W - padL - padR;
  const nums = values.map(v => Number(v) || 0);
  const lo = Math.min(0, ...nums), hi = Math.max(0, ...nums);
  const span = niceMax(hi - lo) || 1;
  /* Negative values extend left of a zero line placed in proportion. */
  const zx = padL + (-lo / span) * plotW;
  let out = "", y = padT;
  labels.forEach((lab, i) => {
    const lines = wrapText(lab, padL - 18, 12);
    const rowH = Math.max(30, 16 + lines.length * lh);
    const mid = y + rowH / 2;
    const w = (Math.abs(nums[i]) / span) * plotW;
    const bx = nums[i] < 0 ? zx - w : zx;
    const tx = nums[i] < 0 ? bx - 6 : zx + w + 8;
    out += svgLines(lines, padL - 12, mid + 4 - (lines.length - 1) * lh / 2, lh, `font-size="12" fill="#3C4339" text-anchor="end"`) +
           `<rect x="${padL}" y="${mid - 8.5}" width="${plotW}" height="17" fill="#F4F8F5"/>` +
           `<rect x="${bx}" y="${mid - 8.5}" width="${Math.max(1, w)}" height="17" fill="${SEQ[i % SEQ.length]}"/>` +
           `<text x="${tx}" y="${mid + 4}" font-size="11.5" fill="#002B1A" font-weight="600"${nums[i] < 0 ? ' text-anchor="end"' : ""}>${nfmt(nums[i])}${unit ? " " + svgEsc(unit) : ""}</text>`;
    y += rowH;
  });
  if (lo < 0) out += `<line x1="${zx}" x2="${zx}" y1="${padT}" y2="${y}" stroke="#002B1A" stroke-width="1.2"/>`;
  return chartFrame(y + padT, out);
}

/* ── Infographics ───────────────────────────────────────────────────────── */

function infographicSVG(b){
  const items = (b.items || []).filter(Boolean);
  switch (b.graphic){
    case "steps":    return stepsGraphic(items);
    case "pyramid":  return pyramidGraphic(items);
    case "compare":  return compareGraphic(items);
    case "gauge":    return gaugeGraphic(items);
    default:         return timelineGraphic(items);
  }
}

function timelineGraphic(items){
  const n = Math.max(1, items.length);
  const slot = VIZ_W / n, textW = Math.max(40, slot - 12);
  const titles = items.map(it => wrapText(it.t || "", textW, 14));
  const descs = items.map(it => wrapText(it.d || "", textW, 11));
  const tLines = Math.max(1, ...titles.map(l => l.length));
  const dLines = Math.max(0, ...descs.map(l => l.length));
  const y = 62 + (tLines - 1) * 17;
  const H = Math.max(150, y + 30 + Math.max(0, dLines - 1) * 15 + 28);
  const xAt = (i) => slot * i + slot / 2;
  let out = `<line x1="${n === 1 ? 34 : xAt(0)}" x2="${n === 1 ? VIZ_W - 34 : xAt(n - 1)}" y1="${y}" y2="${y}" stroke="#E4E9E2" stroke-width="2"/>`;
  items.forEach((it, i) => {
    const x = xAt(i);
    const col = i === 0 ? "#002B1A" : SEQ[0];
    const tl = titles[i];
    out += `<circle cx="${x}" cy="${y}" r="8" fill="${col}"/>` +
           `<circle cx="${x}" cy="${y}" r="14" fill="none" stroke="${col}" stroke-width="1"/>` +
           svgLines(tl, x, y - 26 - (tl.length - 1) * 17, 17, `font-size="14" font-weight="600" fill="#002B1A" text-anchor="middle"`) +
           svgLines(descs[i], x, y + 30, 15, `font-size="11" fill="#3C4339" text-anchor="middle"`);
  });
  return chartFrame(H, out);
}

function stepsGraphic(items){
  const n = Math.max(1, items.length), gap = 10;
  const w = (VIZ_W - gap * (n - 1)) / n, notch = 16;
  const textW = Math.max(40, w - notch * 2 - 6);
  const titles = items.map(it => wrapText(it.t || "", textW, 14));
  const descs = items.map(it => wrapText(it.d || "", textW, 10.5));
  /* Height grows to fit the longest step: title block + gap + description. */
  const blockH = Math.max(...items.map((_, i) => titles[i].length * 17 + (descs[i].length ? 8 + descs[i].length * 13 : 0)), 0);
  const H = Math.max(128, blockH + 36);
  let out = "";
  items.forEach((it, i) => {
    const x = i * (w + gap);
    const dark = i % 2 === 0;
    const fill = dark ? "#002B1A" : "#F4F8F5";
    const tcol = dark ? "#FFFFFF" : "#002B1A";
    const dcol = dark ? "#E4E9E2" : "#3C4339";
    const right = i === n - 1 ? `L${x + w} 0 L${x + w} ${H}` : `L${x + w - notch} 0 L${x + w} ${H/2} L${x + w - notch} ${H}`;
    const left = i === 0 ? `` : `L${x + notch} ${H/2}`;
    const tx = x + w/2 + (i ? notch/2 : 0);
    const tl = titles[i], dl = descs[i];
    const myH = tl.length * 17 + (dl.length ? 8 + dl.length * 13 : 0);
    const top = H / 2 - myH / 2 + 13;        /* first title baseline */
    out += `<path d="M${x} 0 ${right} L${x} ${H} ${left} Z" fill="${fill}"/>` +
           svgLines(tl, tx, top, 17, `font-size="14" font-weight="600" fill="${tcol}" text-anchor="middle"`) +
           svgLines(dl, tx, top + (tl.length - 1) * 17 + 21, 13, `font-size="10.5" fill="${dcol}" text-anchor="middle"`);
  });
  return chartFrame(H, out);
}

function pyramidGraphic(items){
  const n = Math.max(1, items.length), gap = 6;
  const half = VIZ_W * 0.34;
  const cx = VIZ_W / 2;
  let out = "", y = 0;
  items.forEach((it, i) => {
    const topW = half * ((i + 1) / n) * 2 * 0.5 + 60;
    const botW = half * ((i + 2) / n) * 2 * 0.5 + 60;
    const textW = Math.max(50, topW - 16);
    const tl = wrapText(it.t || "", textW, 13);
    const dl = it.d ? wrapText(it.d, textW, 10.5) : [];
    const blockH = tl.length * 16 + (dl.length ? dl.length * 13 + 2 : 0);
    const rowH = Math.max(46, blockH + 14);
    const fill = SEQ[i % SEQ.length];
    out += `<path d="M${cx - topW/2} ${y} L${cx + topW/2} ${y} L${cx + botW/2} ${y + rowH} L${cx - botW/2} ${y + rowH} Z" ` +
           `fill="${fill}"/>`;
    const first = y + rowH / 2 - blockH / 2 + 12;
    out += svgLines(tl, cx, first, 16, `font-size="13" font-weight="600" fill="${textOn(fill)}" text-anchor="middle"`) +
           svgLines(dl, cx, first + (tl.length - 1) * 16 + 15, 13, `font-size="10.5" fill="${subTextOn(fill)}" text-anchor="middle"`);
    y += rowH + gap;
  });
  return chartFrame(Math.max(1, y), out);
}

function compareGraphic(items){
  const headH = 34, labW = 210, lh = 15;
  const colW = (VIZ_W - 220) / 2;
  let body = "", y = headH;
  items.forEach((it) => {
    const t = wrapText(it.t || "", labW, 12);
    const a = wrapText(it.a || it.d || "", colW - 16, 12);
    const b = wrapText(it.b || "", colW - 16, 12);
    const lines = Math.max(1, t.length, a.length, b.length);
    const rowH = Math.max(40, 25 + (lines - 1) * lh + 15);
    const base = (k) => y + rowH / 2 + 4 - (k - 1) * lh / 2;
    body += `<line x1="0" x2="${VIZ_W}" y1="${y}" y2="${y}" stroke="#E4E9E2"/>` +
            svgLines(t, 0, base(t.length), lh, `font-size="12" fill="#3C4339"`) +
            svgLines(a, 220 + colW/2, base(a.length), lh, `font-size="12" fill="${INK}" text-anchor="middle"`) +
            svgLines(b, 220 + colW + colW/2, base(b.length), lh, `font-size="12" fill="${INK}" text-anchor="middle"`);
    y += rowH;
  });
  const H = y;
  const out = `<rect x="220" y="0" width="${colW}" height="${H}" fill="#F4F8F5"/>` +
              `<text x="${220 + colW/2}" y="22" font-size="12" font-weight="600" fill="#002B1A" text-anchor="middle">Option A</text>` +
              `<text x="${220 + colW + colW/2}" y="22" font-size="12" font-weight="600" fill="#002B1A" text-anchor="middle">Option B</text>` +
              body + `<line x1="0" x2="${VIZ_W}" y1="${H}" y2="${H}" stroke="#E4E9E2"/>`;
  return chartFrame(H + 2, out);
}

function gaugeGraphic(items){
  const n = Math.max(1, items.length);
  const slot = VIZ_W / n, R = 46, sw = 11;
  const labels = items.map(it => wrapText(it.t || "", Math.max(40, slot - 10), 11.5));
  const H = Math.max(150, 62 + R + 26 + (Math.max(1, ...labels.map(l => l.length)) - 1) * 14 + 16);
  let out = "";
  items.forEach((it, i) => {
    const cx = slot * i + slot / 2, cy = 62;
    const pct = Math.max(0, Math.min(100, parseFloat(String(it.d).replace(/[^\d.]/g,"")) || 0));
    const circ = 2 * Math.PI * R;
    out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#E4E9E2" stroke-width="${sw}"/>` +
           `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${SEQ[i % SEQ.length]}" stroke-width="${sw}" ` +
           `stroke-dasharray="${circ * pct / 100} ${circ}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})"/>` +
           `<text x="${cx}" y="${cy + 7}" font-size="20" font-weight="600" fill="#002B1A" text-anchor="middle">${nfmt(pct)}%</text>` +
           svgLines(labels[i], cx, cy + R + 26, 14, `font-size="11.5" fill="#3C4339" text-anchor="middle"`);
  });
  return chartFrame(H, out);
}

const GRAPHIC_KINDS = [
  {id:"timeline", name:"Timeline — milestones along a line"},
  {id:"steps",    name:"Process — chevron steps"},
  {id:"pyramid",  name:"Pyramid — layered priorities"},
  {id:"gauge",    name:"Dials — percentages"},
  {id:"compare",  name:"Comparison — A vs B rows"}
];
const CHART_KINDS = [
  {id:"bar",   name:"Bar (grouped)"},
  {id:"stack", name:"Bar (stacked)"},
  {id:"line",  name:"Line"},
  {id:"donut", name:"Donut — allocation"},
  {id:"hbar",  name:"Horizontal bars — ranking"}
];

;
