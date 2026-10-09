/* ═══════════════════════════════════════════════════════════════════════════
   pdfread.js — read the text of a PDF, with where each piece sits on the page
   ───────────────────────────────────────────────────────────────────────────
   Croesus reports and TD's financial-plan PDFs store their text in "CID"
   fonts: every character is a glyph number, and a small table inside the
   font (its ToUnicode map) says which letter each number is. Without that
   table the text comes out as gibberish and the digits disappear. This
   reader understands those tables, finds objects packed inside "object
   streams", and keeps the x/y position of every piece of text so table
   columns stay lined up.

   Use:
     const pdf = await readPdf(file);       // a File or Blob
     pdf.pages[0].lines[3].cells            // [{x, text}, …] left to right
     pdf.pages[0].lines[3].text             // the line, cells joined by 3 spaces
     pdf.text                               // the whole document as plain text
     pdf.warnings                           // anything that could not be read

   Nothing here touches the network. It handles what TD's tools produce; a
   scanned (picture-only) or password-protected PDF gives no text, and the
   warnings say so.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 1. Inflating (un-zipping) streams ─────────────────────────────────── */

/* Decompress Flate data with the browser's own DecompressionStream. Some PDF
   writers leave junk after the compressed data; keep whatever came out
   before the error instead of throwing it all away. */
async function pdfInflate(bytes){
  for (const kind of ["deflate", "deflate-raw"]){
    const chunks = [];
    let total = 0;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(kind));
      const reader = stream.getReader();
      for (;;){
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value); total += r.value.length;
      }
    } catch (e) { /* keep the part that inflated */ }
    if (total){
      const out = new Uint8Array(total);
      let at = 0;
      chunks.forEach(c => { out.set(c, at); at += c.length; });
      return out;
    }
  }
  return null;
}

const latin1 = (u8) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return s;
};

/* ── 2. A small PDF object parser ──────────────────────────────────────── */
/* Values come back as plain JavaScript:
     dictionary → object (keys without the slash)   array → array
     name → "/Name" (a string starting with /)       number → number
     string → {str:"…raw bytes…"}                     reference → {ref:12}
     true/false/null → themselves                     */

const PDF_WS = /[\s\0]/;
const PDF_DELIM = /[\s\0()<>\[\]{}\/%]/;

function pdfSkipSpace(s, i){
  for (;;){
    while (i < s.length && PDF_WS.test(s[i])) i++;
    if (s[i] === "%"){ while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    return i;
  }
}

/* Read a (literal string) starting at s[i] === "(". Returns {str, end}. */
function pdfLiteralString(s, i){
  let depth = 1, out = "";
  for (i++; i < s.length; i++){
    const c = s[i];
    if (c === "\\"){
      const n = s[++i];
      if (n === "n") out += "\n"; else if (n === "r") out += "\r";
      else if (n === "t") out += "\t"; else if (n === "b") out += "\b"; else if (n === "f") out += "\f";
      else if (n === "\r"){ if (s[i + 1] === "\n") i++; }          /* line continuation */
      else if (n === "\n"){ /* line continuation */ }
      else if (/[0-7]/.test(n)){
        let oct = n;
        while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[++i];
        out += String.fromCharCode(parseInt(oct, 8) & 255);
      } else out += n;
    } else if (c === "("){ depth++; out += c; }
    else if (c === ")"){ if (--depth === 0) break; out += c; }
    else out += c;
  }
  return {str: out, end: i + 1};
}

function pdfHexString(s, i){
  const end = s.indexOf(">", i);
  let hex = s.slice(i + 1, end < 0 ? s.length : end).replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length % 2) hex += "0";
  let out = "";
  for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
  return {str: out, end: end < 0 ? s.length : end + 1};
}

/* Parse one value at s[i]. Returns {v, end}. */
function pdfParseValue(s, i){
  i = pdfSkipSpace(s, i);
  const c = s[i];
  if (c === "<" && s[i + 1] === "<"){
    const d = {};
    i += 2;
    for (;;){
      i = pdfSkipSpace(s, i);
      if (i >= s.length) return {v: d, end: i};
      if (s[i] === ">" && s[i + 1] === ">") return {v: d, end: i + 2};
      if (s[i] !== "/"){ i++; continue; }                     /* tolerate junk */
      const k = pdfParseValue(s, i);
      const val = pdfParseValue(s, k.end);
      d[k.v.slice(1)] = val.v;
      i = val.end;
    }
  }
  if (c === "["){
    const a = [];
    i++;
    for (;;){
      i = pdfSkipSpace(s, i);
      if (i >= s.length || s[i] === "]") return {v: a, end: i + 1};
      const val = pdfParseValue(s, i);
      if (val.end <= i){ i++; continue; }
      a.push(val.v); i = val.end;
    }
  }
  if (c === "(") { const r = pdfLiteralString(s, i); return {v: {str: r.str}, end: r.end}; }
  if (c === "<") { const r = pdfHexString(s, i); return {v: {str: r.str}, end: r.end}; }
  if (c === "/"){
    let j = i + 1;
    while (j < s.length && !PDF_DELIM.test(s[j])) j++;
    const name = s.slice(i + 1, j).replace(/#([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return {v: "/" + name, end: j};
  }
  /* number, or "num gen R" */
  const num = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
  if (num){
    const end = i + num[0].length;
    const ref = /^\s+(\d+)\s+R(?![A-Za-z])/.exec(s.slice(end, end + 24));
    if (ref && /^\d+$/.test(num[0])) return {v: {ref: parseInt(num[0], 10)}, end: end + ref[0].length};
    return {v: parseFloat(num[0]), end};
  }
  /* keyword: true / false / null / anything else */
  let j = i;
  while (j < s.length && !PDF_DELIM.test(s[j])) j++;
  const word = s.slice(i, j);
  if (word === "true") return {v: true, end: j};
  if (word === "false") return {v: false, end: j};
  return {v: null, end: Math.max(j, i + 1)};
}

/* ── 3. The document: every object, the pages, the fonts ───────────────── */

/* Find every "12 0 obj … endobj" in the file and every object packed inside
   an object stream. Later copies of an object (incremental saves) win. */
async function pdfLoadObjects(u8){
  const s = latin1(u8);
  const objects = {};          /* number → {v, streamStart, streamEnd} */
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))){
    const num = parseInt(m[1], 10);
    let val;
    try { val = pdfParseValue(s, m.index + m[0].length); } catch (e) { continue; }
    const o = {v: val.v};
    let i = pdfSkipSpace(s, val.end);
    if (s.startsWith("stream", i)){
      i += 6;
      if (s[i] === "\r") i++;
      if (s[i] === "\n") i++;
      o.streamStart = i;
      const len = val.v && typeof val.v.Length === "number" ? val.v.Length : -1;
      if (len >= 0 && /^\s*endstream/.test(s.slice(i + len, i + len + 24))) o.streamEnd = i + len;
      else {
        let e = s.indexOf("endstream", i);
        if (e < 0) e = s.length;
        o.streamEnd = e;
        o.lengthGuessed = true;
      }
      re.lastIndex = o.streamEnd;
    }
    objects[num] = o;
  }
  const doc = {s, u8, objects};

  /* object streams: "/Type /ObjStm" holds N objects after a header of offsets */
  for (const key of Object.keys(objects)){
    const o = objects[key];
    if (!o.v || o.v.Type !== "/ObjStm" || o.streamStart == null) continue;
    const data = await pdfStreamBytes(doc, o);
    if (!data) continue;
    const t = latin1(data);
    const n = o.v.N || 0, first = o.v.First || 0;
    const head = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n; k++){
      const onum = head[2 * k], off = head[2 * k + 1];
      if (!isFinite(onum) || !isFinite(off)) continue;
      const existing = objects[onum];
      if (existing && existing.streamStart != null) continue;   /* a real stream object wins */
      try { objects[onum] = {v: pdfParseValue(t, first + off).v}; } catch (e) { /* skip */ }
    }
  }
  return doc;
}

/* Follow a {ref:n} to its value (once; values never point at themselves). */
function pdfGet(doc, v){
  let guard = 0;
  while (v && typeof v === "object" && "ref" in v && guard++ < 20){
    const o = doc.objects[v.ref];
    v = o ? o.v : null;
  }
  return v;
}
function pdfObjOf(doc, v){ return v && typeof v === "object" && "ref" in v ? doc.objects[v.ref] : null; }

/* A stream's bytes, decompressed. Only FlateDecode matters for text. */
async function pdfStreamBytes(doc, o){
  if (!o || o.streamStart == null) return null;
  let end = o.streamEnd;
  if (o.lengthGuessed && o.v && o.v.Length){
    const len = pdfGet(doc, o.v.Length);
    if (typeof len === "number" && o.streamStart + len <= doc.u8.length) end = o.streamStart + len;
  }
  let bytes = doc.u8.subarray(o.streamStart, end);
  let filters = pdfGet(doc, o.v && o.v.Filter);
  filters = Array.isArray(filters) ? filters : filters ? [filters] : [];
  for (const f of filters){
    if (f === "/FlateDecode" || f === "/Fl"){
      bytes = await pdfInflate(bytes);
      if (!bytes) return null;
    } else if (f === "/ASCII85Decode" || f === "/A85"){
      if (typeof ascii85Decode === "function") bytes = ascii85Decode(bytes); else return null;
    } else {
      return null;            /* images (DCT, JPX…) and anything exotic: not text */
    }
  }
  return bytes;
}

/* Pages in reading order, each with its inherited resources. */
function pdfPages(doc){
  const out = [];
  const walk = (node, inherited, depth) => {
    node = pdfGet(doc, node);
    if (!node || depth > 50) return;
    const res = node.Resources ? node.Resources : inherited;
    if (node.Type === "/Pages" || Array.isArray(pdfGet(doc, node.Kids))){
      (pdfGet(doc, node.Kids) || []).forEach(k => walk(k, res, depth + 1));
    } else out.push({dict: node, resources: res});
  };
  let root = null;
  for (const key of Object.keys(doc.objects)){
    const v = doc.objects[key].v;
    if (v && v.Type === "/Catalog" && v.Pages){ root = v.Pages; }
  }
  if (root) walk(root, null, 0);
  if (!out.length){
    /* no catalog found: take every page object in file order */
    for (const key of Object.keys(doc.objects)){
      const v = doc.objects[key].v;
      if (v && v.Type === "/Page") out.push({dict: v, resources: v.Resources});
    }
  }
  return out;
}

/* ── 4. Fonts: which letter each code is, and how wide ─────────────────── */

/* The Windows (WinAnsi) characters that differ from Latin-1. */
const WIN_ANSI_EXTRA = {128:"€",130:"‚",131:"ƒ",132:"„",133:"…",134:"†",135:"‡",136:"ˆ",137:"‰",138:"Š",
  139:"‹",140:"Œ",142:"Ž",145:"‘",146:"’",147:"“",148:"”",149:"•",150:"–",151:"—",152:"˜",153:"™",
  154:"š",155:"›",156:"œ",158:"ž",159:"Ÿ"};
/* Glyph names that turn up in /Differences, for the usual punctuation. */
const GLYPH_NAMES = {space:" ",quoteright:"’",quoteleft:"‘",quotedblleft:"“",quotedblright:"”",bullet:"•",
  endash:"–",emdash:"—",hyphen:"-",period:".",comma:",",colon:":",semicolon:";",percent:"%",dollar:"$",
  parenleft:"(",parenright:")",slash:"/",ampersand:"&",fi:"fi",fl:"fl",ellipsis:"…",zero:"0",one:"1",
  two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",plus:"+",minus:"−",equal:"=",
  numbersign:"#",at:"@",asterisk:"*",question:"?",exclam:"!",quotesingle:"'",quotedbl:'"',underscore:"_",
  bracketleft:"[",bracketright:"]",registered:"®",copyright:"©",trademark:"™",degree:"°",eacute:"é",
  egrave:"è",agrave:"à",ccedilla:"ç",ocircumflex:"ô",nbspace:" ",nonbreakingspace:" "};

function glyphNameToText(name){
  if (GLYPH_NAMES[name]) return GLYPH_NAMES[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  let m = /^uni([0-9A-Fa-f]{4,})/.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1].slice(0, 4), 16));
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return null;
}

/* A ToUnicode CMap: "beginbfchar <0003> <0020>" and "beginbfrange <a> <b> <dst>". */
function parseToUnicode(text){
  const map = {};
  let codeBytes = 1;
  const cs = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(text);
  if (cs) codeBytes = Math.max(1, Math.ceil(cs[1].length / 2));
  const hexToStr = (h) => {
    let s = "";
    for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16));
    if (h.length % 4 === 2) s += String.fromCharCode(parseInt(h.slice(-2), 16));
    return s;
  };
  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  charBlocks.forEach(blk => {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
    let m;
    while ((m = re.exec(blk))) map[parseInt(m[1], 16)] = hexToStr(m[2]);
  });
  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  rangeBlocks.forEach(blk => {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g;
    let m;
    while ((m = re.exec(blk))){
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[3][0] === "["){
        const dsts = m[3].match(/<([0-9A-Fa-f]*)>/g) || [];
        dsts.forEach((d, k) => { map[lo + k] = hexToStr(d.slice(1, -1)); });
      } else {
        const base = m[3].slice(1, -1);
        const head = base.slice(0, -4), last = parseInt(base.slice(-4) || "0", 16);
        for (let c = lo; c <= hi; c++) map[c] = hexToStr(head) + String.fromCharCode(last + (c - lo));
      }
    }
  });
  return {map, codeBytes};
}

/* Build a font object the page reader can use: decode(rawString) → [{text, width}] */
async function pdfFont(doc, ref, cache){
  const key = ref && ref.ref != null ? "r" + ref.ref : null;
  if (key && cache[key]) return cache[key];
  const f = pdfGet(doc, ref) || {};
  const isType0 = f.Subtype === "/Type0";
  const font = {twoByte: isType0, map: null, widths: {}, defaultWidth: isType0 ? 1000 : 500, encoding: {}};

  const tu = pdfObjOf(doc, f.ToUnicode);
  if (tu){
    const b = await pdfStreamBytes(doc, tu);
    if (b){
      const cm = parseToUnicode(latin1(b));
      font.map = cm.map;
      if (isType0) font.twoByte = cm.codeBytes !== 1;
    }
  }

  if (isType0){
    const desc = pdfGet(doc, (pdfGet(doc, f.DescendantFonts) || [])[0]) || {};
    if (typeof desc.DW === "number") font.defaultWidth = desc.DW;
    const W = pdfGet(doc, desc.W) || [];
    /* W: [first [w1 w2 …]  first last w  …] */
    for (let i = 0; i < W.length;){
      const first = pdfGet(doc, W[i]);
      const next = pdfGet(doc, W[i + 1]);
      if (Array.isArray(next)){ next.forEach((w, k) => { font.widths[first + k] = pdfGet(doc, w); }); i += 2; }
      else { const w = pdfGet(doc, W[i + 2]); for (let c = first; c <= next; c++) font.widths[c] = w; i += 3; }
    }
  } else {
    const first = pdfGet(doc, f.FirstChar) || 0;
    (pdfGet(doc, f.Widths) || []).forEach((w, k) => { font.widths[first + k] = pdfGet(doc, w); });
    const enc = pdfGet(doc, f.Encoding);
    if (enc && typeof enc === "object" && Array.isArray(enc.Differences)){
      let code = 0;
      enc.Differences.forEach(d => {
        if (typeof d === "number") code = d;
        else if (typeof d === "string"){
          const t = glyphNameToText(d.slice(1));
          if (t != null) font.encoding[code] = t;
          code++;
        }
      });
    }
  }

  font.decode = (raw) => {
    const out = [];
    const step = font.twoByte ? 2 : 1;
    for (let i = 0; i + step <= raw.length; i += step){
      const code = step === 2 ? (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1) : raw.charCodeAt(i);
      let text;
      if (font.map && font.map[code] != null) text = font.map[code];
      else if (font.encoding[code] != null) text = font.encoding[code];
      else if (step === 1) text = WIN_ANSI_EXTRA[code] || (code >= 32 ? String.fromCharCode(code) : "");
      else text = "";
      const w = font.widths[code];
      out.push({text, width: (typeof w === "number" ? w : font.defaultWidth) / 1000, code, single: step === 1});
    }
    return out;
  };
  if (key) cache[key] = font;
  return font;
}

/* ── 5. Running a page's drawing instructions to find the text ─────────── */

const mul = (a, b) => [                     /* 2-D affine matrices [a b c d e f] */
  a[0] * b[0] + a[1] * b[2],         a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],         a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],  a[4] * b[1] + a[5] * b[3] + b[5]];

/* Split a content stream into operands and operators. */
function* pdfOps(s){
  let i = 0, operands = [];
  while (i < s.length){
    i = pdfSkipSpace(s, i);
    if (i >= s.length) break;
    const c = s[i];
    if (c === "(" || c === "<" || c === "[" || c === "/" || /[-+.\d]/.test(c)){
      if (c === "<" && s[i + 1] !== "<"){ const r = pdfHexString(s, i); operands.push({str: r.str}); i = r.end; continue; }
      const r = pdfParseValue(s, i);
      /* numbers here are never references */
      if (r.v && typeof r.v === "object" && "ref" in r.v){
        const n = /^[-+]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
        operands.push(parseFloat(n[0])); i += n[0].length; continue;
      }
      operands.push(r.v); i = Math.max(r.end, i + 1); continue;
    }
    let j = i;
    while (j < s.length && !PDF_DELIM.test(s[j])) j++;
    if (j === i){ i++; continue; }
    const op = s.slice(i, j);
    i = j;
    if (op === "BI"){                                 /* inline image: skip to EI */
      const e = s.indexOf("EI", s.indexOf("ID", i));
      i = e < 0 ? s.length : e + 2;
      operands = [];
      continue;
    }
    yield {op, args: operands};
    operands = [];
  }
}

/* Read one page (or form) and push text pieces {x, y, x2, size, text}. */
async function pdfRunContent(doc, content, resources, ctm, items, fontCache, depth){
  resources = pdfGet(doc, resources) || {};
  const fonts = pdfGet(doc, resources.Font) || {};
  const xobjects = pdfGet(doc, resources.XObject) || {};
  const stack = [];
  let gs = {ctm: ctm.slice()};
  let ts = {font: null, size: 1, cs: 0, ws: 0, hs: 1, lead: 0, rise: 0};
  let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];

  const show = (str) => {
    if (!ts.font) return;
    const glyphs = ts.font.decode(str);
    let text = "";
    const start = mul([1, 0, 0, 1, 0, ts.rise], mul(tm, gs.ctm));
    for (const g of glyphs){
      text += g.text;
      const adv = (g.width * ts.size + ts.cs + (g.single && g.code === 32 ? ts.ws : 0)) * ts.hs;
      tm = mul([1, 0, 0, 1, adv, 0], tm);
    }
    const end = mul([1, 0, 0, 1, 0, ts.rise], mul(tm, gs.ctm));
    const scale = Math.hypot(start[2], start[3]) || 1;
    if (text) items.push({x: start[4], y: start[5], x2: end[4], size: Math.abs(ts.size * scale), text});
  };
  const nextLine = (tx, ty) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm.slice(); };

  for (const {op, args} of pdfOps(content)){
    const n = (k) => (typeof args[k] === "number" ? args[k] : 0);
    switch (op){
      case "q": stack.push({ctm: gs.ctm.slice(), ts: Object.assign({}, ts)}); break;
      case "Q": { const g = stack.pop(); if (g){ gs.ctm = g.ctm; ts = g.ts; } break; }
      case "cm": gs.ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], gs.ctm); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
      case "Tf": {
        const name = typeof args[0] === "string" ? args[0].slice(1) : "";
        ts.font = fonts[name] ? await pdfFont(doc, fonts[name], fontCache) : null;
        ts.size = n(1);
        break;
      }
      case "Tc": ts.cs = n(0); break;
      case "Tw": ts.ws = n(0); break;
      case "Tz": ts.hs = n(0) / 100; break;
      case "TL": ts.lead = n(0); break;
      case "Ts": ts.rise = n(0); break;
      case "Td": nextLine(n(0), n(1)); break;
      case "TD": ts.lead = -n(1); nextLine(n(0), n(1)); break;
      case "Tm": tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tm = tlm.slice(); break;
      case "T*": nextLine(0, -ts.lead); break;
      case "Tj": if (args[0] && args[0].str != null) show(args[0].str); break;
      case "'": nextLine(0, -ts.lead); if (args[0] && args[0].str != null) show(args[0].str); break;
      case '"': ts.ws = n(0); ts.cs = n(1); nextLine(0, -ts.lead); if (args[2] && args[2].str != null) show(args[2].str); break;
      case "TJ":
        (Array.isArray(args[0]) ? args[0] : []).forEach(part => {
          if (typeof part === "number") tm = mul([1, 0, 0, 1, -part / 1000 * ts.size * ts.hs, 0], tm);
          else if (part && part.str != null) show(part.str);
        });
        break;
      case "Do": {
        if (depth > 8) break;
        const name = typeof args[0] === "string" ? args[0].slice(1) : "";
        const xo = pdfObjOf(doc, xobjects[name]);
        if (!xo || !xo.v || xo.v.Subtype !== "/Form") break;
        const bytes = await pdfStreamBytes(doc, xo);
        if (!bytes) break;
        const fm = pdfGet(doc, xo.v.Matrix);
        const m = Array.isArray(fm) && fm.length === 6 ? fm : [1, 0, 0, 1, 0, 0];
        await pdfRunContent(doc, latin1(bytes), xo.v.Resources || resources, mul(m, gs.ctm), items, fontCache, depth + 1);
        break;
      }
    }
  }
}

/* ── 6. Pieces → lines → cells ─────────────────────────────────────────── */

/* Group the pieces into lines (same baseline) and, within a line, into cells
   (pieces separated by a wide gap — a new table column). */
function piecesToLines(items){
  const sorted = items.filter(it => it.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted){
    const tol = Math.max(1.5, it.size * 0.35);
    let line = null;
    for (let k = lines.length - 1; k >= 0 && k >= lines.length - 4; k--){
      if (Math.abs(lines[k].y - it.y) <= tol){ line = lines[k]; break; }
    }
    if (!line){ line = {y: it.y, items: []}; lines.push(line); }
    line.items.push(it);
  }
  return lines.map(line => {
    line.items.sort((a, b) => a.x - b.x);
    const cells = [];
    let cur = null;
    for (const it of line.items){
      const gap = cur ? it.x - cur.x2 : Infinity;
      if (cur && gap < it.size * 1.2){
        /* same cell: a space if there is a visible gap and none already */
        if (gap > it.size * 0.18 && !/\s$/.test(cur.text) && !/^\s/.test(it.text)) cur.text += " ";
        cur.text += it.text;
        cur.x2 = Math.max(cur.x2, it.x2);
      } else {
        cur = {x: it.x, x2: it.x2, size: it.size, text: it.text};
        cells.push(cur);
      }
    }
    cells.forEach(c => { c.text = c.text.replace(/\s+/g, " ").trim(); });
    const kept = cells.filter(c => c.text);
    return {y: line.y, cells: kept, text: kept.map(c => c.text).join("   ")};
  }).filter(l => l.cells.length);
}

/* ── 7. The one function the rest of the app calls ─────────────────────── */

async function readPdf(file){
  const u8 = new Uint8Array(await file.arrayBuffer());
  const warnings = [];
  const doc = await pdfLoadObjects(u8);
  if (/\/Encrypt\s/.test(doc.s.slice(-4096)) || Object.values(doc.objects).some(o => o.v && o.v.Filter === "/Standard")){
    warnings.push("This PDF is password-protected or encrypted, so its text can't be read. Print it to a new PDF and drop that in instead.");
  }
  const pages = [];
  const fontCache = {};
  for (const pg of pdfPages(doc)){
    const items = [];
    let contents = pdfGet(doc, pg.dict.Contents);
    const refs = Array.isArray(contents) ? contents : [pg.dict.Contents];
    let text = "";
    for (const r of refs){
      const b = await pdfStreamBytes(doc, pdfObjOf(doc, r));
      if (b) text += latin1(b) + "\n";
    }
    try {
      await pdfRunContent(doc, text, pg.resources, [1, 0, 0, 1, 0, 0], items, fontCache, 0);
    } catch (e) {
      warnings.push("Page " + (pages.length + 1) + " could not be fully read (" + e.message + ").");
    }
    pages.push({lines: piecesToLines(items)});
  }
  const plain = pages.map(p => p.lines.map(l => l.text).join("\n")).join("\n\n");
  if (pages.length && !plain.trim()){
    warnings.push("No text found. This PDF may be a scan (pictures of pages). Drop it in as a screenshot instead, or attach it to Copilot.");
  }
  return {pages, text: plain, warnings};
}
