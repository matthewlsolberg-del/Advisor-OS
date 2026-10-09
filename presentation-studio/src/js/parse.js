/* ==========================================================================
   parse.js — everything that turns outside material into blocks.

     · parseText()  — the paste box: a light mark-up most people type anyway
     · readDocx()   — Word files, unzipped and parsed in the browser
     · readPdfText()— best-effort text out of a PDF (no library, so: honest
                      about its limits — see PDF_CAVEAT)
     · readImage()  — an image becomes a data URI stored in the file

   Nothing here touches the network. Everything runs on this machine.
   ========================================================================== */

/* ── Rich text: the model stores **bold** markers, the page renders <b> ──── */

function esc(s){
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function richToHtml(s){
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/==(.+?)==/g, '<em class="hl">$1</em>')    /* one highlighted phrase */
    /* Copilot's gap markers stay loud until someone fills them in */
    .replace(/\[(NEEDS ADVISOR INPUT|SOURCE CONFLICT)\b([^\]]*)\]/gi, '<mark class="needs">[$1$2]</mark>')
    /* a fill-in blank from a pre-filled template: [[what goes here]] */
    .replace(/\[\[([^\]]+)\]\]/g, '<mark class="blank">[[$1]]</mark>');
}
/** Copilot is told to write these instead of guessing. Each one is a question for the advisor. */
const GAP_RE = /\[(?:NEEDS ADVISOR INPUT|SOURCE CONFLICT)\b[^\]]*\]|\[\[[^\]]+\]\]/gi;
function gapCount(v){ return (JSON.stringify(v || "").match(GAP_RE) || []).length; }
/* Is this element bold? <b>/<strong>, or a span Word or Chrome styled with a
   heavy font-weight. Google Docs wraps whole pastes in <b style="font-weight:
   normal">, so an explicit light weight wins over the tag. */
function isBoldEl(n, tag){
  const fw = (n.style && n.style.fontWeight || "").toLowerCase();
  if (fw){
    if (fw === "bold" || fw === "bolder") return true;
    if (fw === "normal" || fw === "lighter") return false;
    const w = parseInt(fw, 10);
    if (!isNaN(w)) return w >= 600;
  }
  return tag === "b" || tag === "strong";
}
function htmlToRich(html){
  /* An inert document: nothing in a parsed (not live) document loads, so a
     pasted <img src="http://…"> never reaches the network. */
  const d = new DOMParser().parseFromString(String(html == null ? "" : html), "text/html").body;
  const walk = (node, inBold) => {
    let out = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1){
        const tag = n.tagName.toLowerCase();
        if (tag === "style" || tag === "script" || tag === "head" || tag === "title") return;
        const bold = !inBold && isBoldEl(n, tag);
        const inner = walk(n, inBold || bold);
        /* the rich format has bold and one highlight — no italics, so
           font-style:italic simply falls through as plain text */
        if (bold) out += inner.trim() ? "**" + inner + "**" : inner;
        else if (tag === "em" && n.classList.contains("hl")) out += "==" + inner + "==";
        else if (tag === "br") out += " ";
        else if (tag === "div" || tag === "p") out += (out && !out.endsWith(" ") ? " " : "") + inner;
        else out += inner;
      }
    });
    return out;
  };
  return walk(d, false).replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}

/* ── The paste format ───────────────────────────────────────────────────── */

const PASTE_HELP =
  "# heading · ## sub-heading · - bullet · 1. numbered · > callout · " +
  "Label: value → fact row · $1.2M | Label | note → stat card · | a | b | → table · --- → rule";

/* the number may carry "about" (~ ≈) in front and "or more" (+) behind: "25+", "$1B+", "~40%" */
const RE_STAT   = /^\s*([~≈]?\s?[$€£]?\s?[-+]?[\d.,]+\s*(?:%|k|K|M|MM|B|bn|x|×|yrs?|years?)?\+?)\s*\|\s*([^|]{1,60})\s*(?:\|\s*(.*))?$/;
const RE_FACT   = /^\s*([A-Za-z0-9][^:|]{1,58}?)\s*:\s{0,4}(.{1,80})$/;
const RE_TABLE  = /^\s*\|(.+)\|\s*$/;
const RE_SEP    = /^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/;
const RE_BULLET = /^\s*[-•*·]\s+(.*)$/;
const RE_NUMBER = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const RE_ACTION = /^\s*\d{1,2}[.)]\s+(.{2,70}?)\s*[-–—]\s*(.+?)\s*(?:\((?:Owner:\s*)?([^,)]*?)(?:,\s*When:\s*([^)]*))?\))?\s*$/;

function looksNumeric(s){ return /[\d]/.test(s) && /^[\s~≈$€£+\-\d.,%kKMBbnx×]+$/.test(s.replace(/\s*(yrs?|years?)\s*$/i,"")); }

/* The shape of a fact row, before deciding whether it really is one. Lines an
   earlier rule claims (bullets, numbers, pipes, headings, callouts) are not. */
function factShape(t){
  if (!t || RE_BULLET.test(t) || RE_NUMBER.test(t) || RE_TABLE.test(t) || /^#|^>/.test(t)) return null;
  const m = t.match(RE_FACT);
  if (!m || t.length >= 92 || /[.!?]$/.test(t) || /^https?/i.test(t)) return null;
  return m;
}
/* "Retirement date: 2032" is a fact; "Recommendation: keep the GIC ladder" is
   a sentence that happens to have a colon. A fact's value carries a number, or
   is short, or sits among other Label: value lines. */
function isFactLine(lines, i){
  const m = factShape(lines[i].trim());
  if (!m) return null;
  const v = m[2].trim();
  if (/\d/.test(v)) return m;
  /* "Recommendation: keep the ladder" is a sentence, not a figure */
  if (/^(recommendation|note|source|summary|conclusion|next steps?|action|why|goal|objective|bottom line|key point|takeaway|purpose|context|background|outcome|decision)s?$/i.test(m[1].trim())) return null;
  if (v.split(/\s+/).length <= 3) return m;
  const near = (j) => j >= 0 && j < lines.length && !!factShape(lines[j].trim());
  return near(i - 1) || near(i + 1) ? m : null;
}

/* Rows copied out of Excel arrive tab-separated. Trailing empty cells are
   dropped, then every row is padded to the widest so the grid stays square. */
function tabRows(lines){
  const rows = lines.map(l => {
    const cells = l.split("\t").map(c => c.trim());
    while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
    return cells;
  });
  const width = Math.max(...rows.map(r => r.length));
  rows.forEach(r => { while (r.length < width) r.push(""); });
  return rows;
}

/**
 * Turn pasted text into an array of blocks.
 * Lines of the same kind gather into one block (three bullets = one list).
 */
function parseText(raw){
  const lines = String(raw || "").replace(/\r\n?/g,"\n").split("\n");
  const out = [];
  let para = [], bullets = null, numbers = null, facts = null, stats = null, table = null;

  const flushPara = () => {
    if (!para.length) return;
    out.push(Object.assign(newBlock("paragraph"), {text: para.join(" ").trim()}));
    para = [];
  };
  const flushList = () => {
    if (bullets && bullets.length){
      out.push(Object.assign(newBlock("bullets"), {style:"bullet", items:bullets}));
    }
    if (numbers && numbers.length){
      /* "1. Title - detail (Owner: Us, When: 30 days)" reads as an action plan */
      const actions = numbers.map(n => n.action).filter(Boolean);
      if (actions.length === numbers.length && numbers.length > 1){
        out.push(Object.assign(newBlock("actions"), {items:actions}));
      } else {
        out.push(Object.assign(newBlock("bullets"), {style:"number", items:numbers.map(n => n.text)}));
      }
    }
    bullets = null; numbers = null;
  };
  const flushFacts = () => {
    if (facts && facts.length) out.push(Object.assign(newBlock("facts"), {items:facts}));
    facts = null;
  };
  const flushStats = () => {
    if (stats && stats.length){
      out.push(Object.assign(newBlock("stats"),
        {cols: Math.min(4, Math.max(2, stats.length)), items:stats}));
    }
    stats = null;
  };
  const flushTable = () => {
    /* a lone row is still something the person typed: keep it as a table row */
    if (table){
      out.push(Object.assign(newBlock("table"), table.rows.length
        ? {headers:table.headers, rows:table.rows, caption:"", totalRow:false}
        : {headers:table.headers.map(() => ""), rows:[table.headers], caption:"", totalRow:false}));
    }
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushFacts(); flushStats(); flushTable(); };

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    const t = line.trim();

    if (!t){ flushAll(); continue; }

    /* two or more tab-separated lines in a row: an Excel paste, so a table */
    if (line.includes("\t")){
      let j = i;
      while (j < lines.length && lines[j].includes("\t") && lines[j].trim()) j++;
      if (j - i >= 2){
        flushAll();
        const rows = tabRows(lines.slice(i, j));
        out.push(Object.assign(newBlock("table"),
          {headers:rows[0], rows:rows.slice(1), caption:"", totalRow:false}));
        i = j - 1;
        continue;
      }
    }

    /* table rows first — a pipe row is unambiguous */
    if (RE_TABLE.test(t) && !RE_STAT.test(t)){
      if (RE_SEP.test(t)) continue;
      const cells = t.replace(/^\s*\|/,"").replace(/\|\s*$/,"").split("|").map(c => c.trim());
      flushPara(); flushList(); flushFacts(); flushStats();
      if (!table) table = {headers:cells, rows:[]};
      else table.rows.push(cells);
      continue;
    }
    flushTable();

    if (/^#{1,6}\s+/.test(t)){
      flushAll();
      const level = (t.match(/^#+/)[0].length) >= 2 ? 3 : 2;
      out.push(Object.assign(newBlock("heading"), {level, kicker:"", text:t.replace(/^#{1,6}\s+/,"").trim()}));
      continue;
    }
    if (/^-{3,}$|^_{3,}$|^\*{3,}$/.test(t)){ flushAll(); out.push(newBlock("rule")); continue; }
    if (/^>\s?/.test(t)){
      flushAll();
      const text = t.replace(/^>\s?/,"").trim();
      out.push(Object.assign(newBlock("callout"), {tone:"note", title:"", text}));
      continue;
    }
    let m;
    if ((m = t.match(RE_STAT)) && looksNumeric(m[1])){
      flushPara(); flushList(); flushFacts();
      (stats = stats || []).push({num:m[1].replace(/\s+/g,""), label:(m[2]||"").trim(), note:(m[3]||"").trim()});
      continue;
    }
    flushStats();
    if ((m = t.match(RE_BULLET))){
      flushPara(); flushFacts();
      if (numbers){ flushList(); }
      (bullets = bullets || []).push(m[1].trim());
      continue;
    }
    if ((m = t.match(RE_NUMBER))){
      flushPara(); flushFacts();
      if (bullets){ flushList(); }
      const a = t.match(RE_ACTION);
      (numbers = numbers || []).push({
        text: m[2].trim(),
        action: a ? {t:a[1].trim(), d:a[2].trim(), who:(a[3]||"").trim(), when:(a[4]||"").trim()} : null
      });
      continue;
    }
    flushList();
    if ((m = isFactLine(lines, i))){
      flushPara();
      (facts = facts || []).push({k:m[1].trim(), v:m[2].trim()});
      continue;
    }
    flushFacts();
    para.push(t.replace(/\t+/g, " "));   /* a lone tab line is just text */
  }
  flushAll();
  return out;
}

/* ── Word (.docx) ─────────────────────────────────────────────────────────
   A .docx is a zip. Browsers can inflate with DecompressionStream, so the
   whole thing works offline with no library.
   ------------------------------------------------------------------------ */

async function unzip(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  /* end-of-central-directory record, searched from the back */
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid Word/zip file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method  = dv.getUint16(p + 10, true);
    const csize   = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen= dv.getUint16(p + 30, true);
    const cmtLen  = dv.getUint16(p + 32, true);
    const lho     = dv.getUint32(p + 42, true);
    const name    = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    /* local header tells us where the data actually starts */
    const lNameLen = dv.getUint16(lho + 26, true), lExtraLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lNameLen + lExtraLen;
    files[name] = {method, bytes:u8.subarray(start, start + csize)};
    p += 46 + nameLen + extraLen + cmtLen;
  }
  const bytes = async (name) => {
    const f = files[name];
    if (!f) return null;
    if (f.method === 0) return f.bytes;
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([f.bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  const read = async (name) => {
    const b = await bytes(name);
    return b ? new TextDecoder().decode(b) : null;
  };
  return {names:Object.keys(files), read, bytes};
}

/* Bytes to a data: URL, in slices so a large photo does not blow the stack. */
function bytesToDataUrl(u8, mime){
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000){
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return "data:" + mime + ";base64," + btoa(bin);
}

async function readDocx(file){
  const zip = await unzip(await file.arrayBuffer());
  const xml = await zip.read("word/document.xml");
  if (!xml) throw new Error("That file does not look like a Word document.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const V = "urn:schemas-microsoft-com:vml";
  const wAttr = (el, name) => el ? (el.getAttributeNS(W, name) || el.getAttribute("w:" + name) || "") : "";
  const kids = (el, name) => Array.from(el.children).filter(c => c.localName === name);
  const out = [];
  let bullets = null, numbers = null;

  const flushLists = () => {
    if (bullets && bullets.length) out.push(Object.assign(newBlock("bullets"), {style:"bullet", items:bullets}));
    if (numbers && numbers.length) out.push(Object.assign(newBlock("bullets"), {style:"number", items:numbers}));
    bullets = null; numbers = null;
  };

  /* numbering.xml says whether a list is bullets or numbers:
     numId → abstractNum → the level's numFmt ("bullet", "decimal", …). */
  const numFmt = {};
  const numXml = await zip.read("word/numbering.xml");
  if (numXml){
    const nd = new DOMParser().parseFromString(numXml, "application/xml");
    const abstractFmt = {};
    Array.from(nd.getElementsByTagNameNS(W, "abstractNum")).forEach(an => {
      const lv = {};
      kids(an, "lvl").forEach(l => { lv[wAttr(l, "ilvl")] = wAttr(kids(l, "numFmt")[0], "val"); });
      abstractFmt[wAttr(an, "abstractNumId")] = lv;
    });
    Array.from(nd.getElementsByTagNameNS(W, "num")).forEach(n => {
      const lv = Object.assign({}, abstractFmt[wAttr(kids(n, "abstractNumId")[0], "val")] || {});
      /* a per-list override can change a level's format */
      kids(n, "lvlOverride").forEach(o => {
        const l = kids(o, "lvl")[0];
        if (l && kids(l, "numFmt")[0]) lv[wAttr(o, "ilvl")] = wAttr(kids(l, "numFmt")[0], "val");
      });
      numFmt[wAttr(n, "numId")] = lv;
    });
  }

  /* Pictures: r:embed → document.xml.rels → word/media/… bytes. Linked
     (external) pictures are never fetched; EMF/WMF are skipped quietly. */
  const rels = {};
  const relsXml = await zip.read("word/_rels/document.xml.rels");
  if (relsXml){
    const rd = new DOMParser().parseFromString(relsXml, "application/xml");
    Array.from(rd.getElementsByTagName("Relationship")).forEach(r => {
      if (/external/i.test(r.getAttribute("TargetMode") || "")) return;
      let t = r.getAttribute("Target") || "";
      t = t.startsWith("/") ? t.slice(1) : "word/" + t;
      while (/[^/]+\/\.\.\//.test(t)) t = t.replace(/[^/]+\/\.\.\//, "");
      rels[r.getAttribute("Id")] = t;
    });
  }
  const MIME = {png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif"};
  const pictures = async (p) => {
    const ids = [];
    Array.from(p.getElementsByTagNameNS(A, "blip")).forEach(b => {
      ids.push(b.getAttributeNS(R, "embed") || b.getAttribute("r:embed"));
    });
    Array.from(p.getElementsByTagNameNS(V, "imagedata")).forEach(b => {
      ids.push(b.getAttributeNS(R, "id") || b.getAttribute("r:id"));
    });
    const srcs = [];
    for (const id of ids){
      const path = id && rels[id];
      const mime = path && MIME[(path.split(".").pop() || "").toLowerCase()];
      if (!mime) continue;
      const b = await zip.bytes(path);
      if (b && b.length) srcs.push(bytesToDataUrl(b, mime));
    }
    return srcs;
  };

  const runText = (p) => {
    let s = "";
    p.querySelectorAll("r").forEach(r => {
      if (r.getElementsByTagNameNS(W,"t").length === 0 &&
          r.getElementsByTagNameNS(W,"tab").length) { s += "  "; }
      const rPr = kids(r, "rPr")[0];
      const b = rPr && kids(rPr, "b")[0];
      const bold = !!b && !/^(0|false|off)$/i.test(wAttr(b, "val"));
      let txt = "";
      Array.from(r.getElementsByTagNameNS(W,"t")).forEach(t => { txt += t.textContent; });
      if (!txt) return;
      /* keep edge spaces outside the markers: "** bold**" reads badly */
      s += bold ? txt.replace(/^(\s*)([\s\S]*?)(\s*)$/, "$1**$2**$3") : txt;
    });
    return s.replace(/\*\*\s*\*\*/g,"").replace(/\s+/g," ").trim();
  };

  /* Content controls (w:sdt) and custom-XML wrappers hold ordinary paragraphs
     and tables; unwrap them so their contents are read like any other. */
  const flatten = (el) => {
    const res = [];
    Array.from(el.children).forEach(c => {
      if (c.localName === "sdt"){
        kids(c, "sdtContent").forEach(sc => res.push(...flatten(sc)));
      } else if (c.localName === "customXml"){
        res.push(...flatten(c));
      } else res.push(c);
    });
    return res;
  };

  /* The draft's own words (docxout.js DRAFT_*). An MHWG-styled paragraph is
     dropped only when it still says what the draft wrote; anything typed after
     those words, or in place of them, is content. */
  const norm = (s) => String(s).replace(/\*\*/g,"").replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
    .replace(/\s+/g," ").trim();
  let lastHeading = "", sawTitle = false, sawPrepared = false;
  const scaffoldRest = (style, text) => {
    const t = norm(text);
    if (/^MHWGTitle$/i.test(style) && !sawTitle){ sawTitle = true; return ""; }
    if (!sawPrepared && /^Prepared for .{1,80}$/.test(t)){ sawPrepared = true; return ""; }
    const gen = ["Write this section here."];
    if (typeof DRAFT_HOWTO === "string") gen.push(DRAFT_HOWTO, DRAFT_HELP_HEAD, DRAFT_HELP);
    if (typeof draftInstruction === "function"){
      try { gen.push(draftInstruction(lastHeading)); } catch (e) { /* no brief */ }
    }
    for (const g0 of gen){
      const g = norm(g0);
      if (t === g) return "";
      if (t.startsWith(g)) return t.slice(g.length).replace(/^[\s—–-]+/, "").trim();
    }
    return text;
  };

  const body = doc.getElementsByTagNameNS(W,"body")[0];
  if (!body) throw new Error("The Word file has no readable body.");

  for (const el of flatten(body)){
    const tag = el.localName;

    if (tag === "p"){
      let text = runText(el);
      const pPr = kids(el, "pPr")[0];
      const style = wAttr(pPr && kids(pPr, "pStyle")[0], "val");
      const numPr = pPr && kids(pPr, "numPr")[0];
      const numId = numPr ? wAttr(kids(numPr, "numId")[0], "val") : "";
      const ilvl = numPr ? (wAttr(kids(numPr, "ilvl")[0], "val") || "0") : "0";
      const isList = (!!numId && numId !== "0") || /^List(Number|Bullet)/i.test(style);
      const pics = await pictures(el);
      if (!text && !pics.length){ continue; }

      if (text && /^MHWG/i.test(style)){
        text = scaffoldRest(style, text);
      }
      const emitPics = () => {
        if (!pics.length) return;
        flushLists();
        pics.forEach(src => out.push(Object.assign(newBlock("image"), {src, caption:""})));
      };
      if (!text){ emitPics(); continue; }

      if (/^Heading([1-9])/i.test(style)){
        flushLists();
        const lvl = parseInt(style.replace(/\D/g,""), 10) || 1;
        lastHeading = norm(text);
        out.push(Object.assign(newBlock("heading"), {level: lvl <= 1 ? 2 : 3, kicker:"", text}));
        emitPics();
        continue;
      }
      if (/^Title$/i.test(style)){
        flushLists();
        out.push(Object.assign(newBlock("heading"), {level:2, kicker:"", text}));
        emitPics();
        continue;
      }
      if (/^Quote|IntenseQuote/i.test(style)){
        flushLists();
        out.push(Object.assign(newBlock("callout"), {tone:"note", title:"", text}));
        emitPics();
        continue;
      }
      if (isList){
        /* numbering.xml decides; with no entry (or a list style with no
           numPr), a leading digit in the text is the practical tell */
        const lv = numFmt[numId];
        const fmt = lv ? (lv[ilvl] || lv["0"] || "") : "";
        const numbered = fmt ? !/^(bullet|none)$/i.test(fmt)
                             : (/^\d+[.)]\s/.test(text) || /^ListNumber/i.test(style));
        const item = text.replace(/^\d+[.)]\s*/,"");
        if (numbered){ if (bullets) flushLists(); (numbers = numbers || []).push(item); }
        else { if (numbers) flushLists(); (bullets = bullets || []).push(text); }
        emitPics();
        continue;
      }
      flushLists();
      /* single short "Label: value" lines still read as fact rows */
      const parsed = parseText(text);
      out.push(...(parsed.length ? parsed : [Object.assign(newBlock("paragraph"), {text})]));
      emitPics();
      continue;
    }

    if (tag === "tbl"){
      flushLists();
      const rows = [];
      Array.from(el.getElementsByTagNameNS(W,"tr")).forEach(tr => {
        const cells = Array.from(tr.getElementsByTagNameNS(W,"tc")).map(tc => {
          return Array.from(tc.getElementsByTagNameNS(W,"p")).map(runText).join(" ").trim();
        });
        if (cells.length) rows.push(cells);
      });
      if (rows.length){
        out.push(Object.assign(newBlock("table"),
          {headers:rows[0], rows:rows.slice(1), caption:"", totalRow:false}));
      }
    }
  }
  flushLists();
  return out;
}

/* ── PDF text (best effort) ─────────────────────────────────────────────── */

const PDF_CAVEAT =
  "PDF text is pulled out without a reader library, so spacing and column order " +
  "can come through rough — and PDFs that store text as images give nothing at all. " +
  "Treat it as a starting point: check it, then tidy it. For charts and tables in a " +
  "PDF, a screenshot dropped in as an image usually looks better anyway.";

/* ReportLab — which is what the MHWG studios print with — wraps its streams in
   ASCII85 before deflating them, so a PDF from our own tools needs this first. */
function ascii85Decode(bytes){
  const out = [];
  let tuple = 0, count = 0;
  for (let i = 0; i < bytes.length; i++){
    const c = bytes[i];
    if (c === 0x7E) break;                       /* ~> terminator */
    if (c <= 0x20 || c === 0x0A || c === 0x0D) continue;
    if (c === 0x7A && count === 0){ out.push(0,0,0,0); continue; }   /* z */
    if (c < 0x21 || c > 0x75) continue;
    tuple = tuple * 85 + (c - 0x21); count++;
    if (count === 5){
      out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255);
      tuple = 0; count = 0;
    }
  }
  if (count > 0){
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    const b = [(tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255];
    out.push(...b.slice(0, count - 1));
  }
  return new Uint8Array(out);
}

async function inflate(bytes, raw){
  const ds = new DecompressionStream(raw ? "deflate-raw" : "deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pdfDecodeString(s){
  let out = "";
  for (let i = 0; i < s.length; i++){
    const c = s[i];
    if (c === "\\"){
      const n = s[++i];
      if (n === "n") out += "\n"; else if (n === "r") out += "";
      else if (n === "t") out += " "; else if (n === "(") out += "(";
      else if (n === ")") out += ")"; else if (n === "\\") out += "\\";
      else if (/[0-7]/.test(n)){
        let oct = n;
        while (oct.length < 3 && /[0-7]/.test(s[i+1])) oct += s[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else out += n;
    } else out += c;
  }
  return out;
}

function extractTextOps(content){
  /* Pull the text-showing operators out of a content stream and rebuild lines
     from the positioning operators. Good enough for prose. Inside a TJ array
     a big negative kern (below about -200) is how most PDFs draw a space.
     The ' and " operators move to the next line and then show their string,
     which comes before them, so the line break goes in front of that string. */
  let out = "", buf = "", inArray = false, last = 0;
  const push = () => { if (buf.trim()) out += buf.trim() + "\n"; buf = ""; };
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[|\]|[-+]?(?:\d+\.?\d*|\.\d+)|T\*|\bT[dDmJj]\b|\bTL\b|\bET\b|['"]/g;
  let m;
  while ((m = re.exec(content))){
    const tok = m[0];
    if (tok[0] === "("){
      last = buf.length;
      buf += pdfDecodeString(tok.slice(1, -1));
    } else if (tok[0] === "<"){
      last = buf.length;
      /* one byte per two hex digits, unless it carries a UTF-16BE mark */
      let hex = tok.slice(1, -1).replace(/\s/g,"");
      if (/^feff/i.test(hex)){
        for (let i = 4; i + 4 <= hex.length; i += 4){
          const code = parseInt(hex.substr(i, 4), 16);
          if (code >= 32 && code < 0xFFFD) buf += String.fromCharCode(code);
        }
      } else {
        if (hex.length % 2) hex += "0";
        for (let i = 0; i < hex.length; i += 2){
          const code = parseInt(hex.substr(i, 2), 16);
          if (code >= 32) buf += String.fromCharCode(code);
        }
      }
    } else if (tok === "["){ inArray = true;
    } else if (tok === "]"){ inArray = false;
    } else if (/^[-+.\d]/.test(tok)){
      if (inArray && parseFloat(tok) < -200 && buf && !/\s$/.test(buf)) buf += " ";
    } else if (tok === "Td" || tok === "TD" || tok === "T*" || tok === "Tm" || tok === "ET"){
      push();
    } else if (tok === "'" || tok === '"'){
      const shown = buf.slice(last);
      buf = buf.slice(0, last); push(); buf = shown;
    }
  }
  push();
  return out;
}

async function readPdfText(file){
  const u8 = new Uint8Array(await file.arrayBuffer());
  const latin = new TextDecoder("latin1").decode(u8);
  let text = "";
  /* "stream" followed by its end-of-line — the look-behind keeps it from
     matching the tail of "endstream", which once sent every stream after
     the first off the rails */
  const re = /(?<!end)stream(?:\r\n|\n|\r)/g;
  let m;
  while ((m = re.exec(latin))){
    const start = m.index + m[0].length;
    /* the stream's own dictionary: back to this object's "obj" keyword */
    const objAt = latin.lastIndexOf("obj", m.index);
    const header = latin.slice(objAt >= 0 && m.index - objAt < 4000 ? objAt : Math.max(0, m.index - 400), m.index);
    /* a direct /Length is exact; "/Length 12 0 R" points elsewhere, so then
       fall back to searching for endstream */
    let end = -1;
    const len = header.match(/\/Length\s+(\d+)\b(?!\s+\d+\s+R)/);
    if (len){
      const e = start + parseInt(len[1], 10);
      if (/^\s*endstream/.test(latin.slice(e, e + 32))) end = e;
    }
    if (end < 0){
      end = latin.indexOf("endstream", start);
      if (end < 0) break;
      while (end > start && (latin[end - 1] === "\n" || latin[end - 1] === "\r")) end--;
    }
    const after = latin.indexOf("endstream", end);
    re.lastIndex = after < 0 ? end : after + 9;
    if (/\/Image|\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(header)) continue;
    let bytes = u8.subarray(start, end);
    let content = null;
    if (/\/ASCII85Decode/.test(header)){
      try { bytes = ascii85Decode(bytes); } catch { continue; }
    }
    if (/\/FlateDecode/.test(header)){
      try { content = new TextDecoder("latin1").decode(await inflate(bytes, false)); }
      catch { try { content = new TextDecoder("latin1").decode(await inflate(bytes, true)); } catch { content = null; } }
    } else if (!/\/Filter/.test(header) || /\/ASCII85Decode/.test(header)){
      content = new TextDecoder("latin1").decode(bytes);
    }
    if (content && /\bTJ\b|\bTj\b/.test(content)) text += extractTextOps(content) + "\n";
  }
  /* stitch obvious hard-wraps back into paragraphs */
  return text
    .replace(/\u0000/g,"")
    .replace(/([a-z,;])\n([a-z(])/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Images ─────────────────────────────────────────────────────────────── */

function readImage(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Could not read that image."));
    fr.readAsDataURL(file);
  });
}

function readTextFile(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Could not read that file."));
    fr.readAsText(file);
  });
}

;
