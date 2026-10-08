/* ==========================================================================
   docxout.js — writing a Word file, which is parse.js's reader in reverse.

   "Get the Word draft" hands you a .docx with this piece's headings already in
   place and, under each, a line saying what belongs there. You (or an
   associate) fill it in using Copilot inside Word — where Copilot is genuinely
   good — save it, and drag it back onto the studio.

   The instruction lines carry a custom paragraph style, MHWGInstruction, and
   parse.js drops a line in that style when its words are still the ones the
   draft wrote (DRAFT_* below). So the round trip is clean whether or not the
   person bothers to delete them — and text typed into a grey line survives.
   Each MHWG style hands Enter back to Normal (w:next), so new paragraphs
   start out as ordinary body text.

   The zip is written with STORE (no compression) — Word is perfectly happy
   with that, and it keeps this file to a CRC table and a header layout instead
   of a compression pipeline.
   ========================================================================== */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Build a zip (stored, uncompressed) from [{name, text}]. */
function zipStore(files){
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;

  const u16 = (n) => [n & 255, (n >>> 8) & 255];
  const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);

    const local = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0));
    parts.push(new Uint8Array(local), nameBytes, data);

    central.push([].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset)));
    central.push(nameBytes);

    offset += local.length + nameBytes.length + data.length;
  });

  const cdParts = [];
  let cdLen = 0;
  central.forEach(c => {
    const arr = c instanceof Uint8Array ? c : new Uint8Array(c);
    cdParts.push(arr); cdLen += arr.length;
  });
  const eocd = new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdLen), u32(offset), u16(0)));

  return new Blob(parts.concat(cdParts, [eocd]), {type:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}

/* ── The document parts ─────────────────────────────────────────────────── */

const xmlEsc = (s) => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;");

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/* Premium Green headings and a grey italic instruction style, so the draft
   already looks like ours before a word is written. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="TD Sans Body" w:hAnsi="TD Sans Body" w:cs="Segoe UI"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:after="120"/></w:pPr>
<w:rPr><w:rFonts w:ascii="TD Sans Headline" w:hAnsi="TD Sans Headline"/><w:b/><w:color w:val="002B1A"/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="80"/></w:pPr>
<w:rPr><w:rFonts w:ascii="TD Sans Headline" w:hAnsi="TD Sans Headline"/><w:b/><w:color w:val="002B1A"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="240" w:after="60"/></w:pPr>
<w:rPr><w:rFonts w:ascii="TD Sans Headline" w:hAnsi="TD Sans Headline"/><w:b/><w:color w:val="1A7E0C"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="MHWGTitle"><w:name w:val="MHWG Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:spacing w:after="120"/></w:pPr>
<w:rPr><w:rFonts w:ascii="TD Sans Headline" w:hAnsi="TD Sans Headline"/><w:b/><w:color w:val="002B1A"/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="MHWGHelpHead"><w:name w:val="MHWG Help Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:spacing w:before="360" w:after="80"/></w:pPr>
<w:rPr><w:rFonts w:ascii="TD Sans Headline" w:hAnsi="TD Sans Headline"/><w:b/><w:color w:val="6F756F"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="MHWGInstruction"><w:name w:val="MHWG Instruction"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:spacing w:after="160"/><w:ind w:left="200"/></w:pPr>
<w:rPr><w:i/><w:color w:val="6F756F"/><w:sz w:val="19"/></w:rPr></w:style>
</w:styles>`;

/* The words the draft writes for itself. readDocx compares against these, so
   only the draft's own lines are dropped on the way back in — anything a person
   typed into an MHWG-styled line is kept. Change the wording here, not inline. */
const DRAFT_HOWTO =
  "HOW TO USE THIS: write under each heading below — with Copilot in Word if you like. " +
  "The grey italic lines say what belongs in each section; leave them or delete them, " +
  "either way they are ignored. Keep the headings exactly as they are. When you are done, " +
  "save the file and drag it onto the MHWG Presentation Studio, which will lay it out.";
const DRAFT_HELP_HEAD = "Formatting shortcuts (optional)";
const DRAFT_HELP =
  "Word's own bullets, numbered lists, bold and tables all come through. Beyond those: " +
  "a line like \"Retirement date: 2032\" becomes a fact row; a line like " +
  "\"$1.2M | Projected at 65 | illustrative\" becomes a key-number card; a line starting " +
  "with > becomes a callout; and \"1. Title - what happens. (Owner: Us, When: 30 days)\" " +
  "becomes an action plan.";
function draftInstruction(sectionTitle){
  const brief = sectionBrief(sectionTitle);
  return brief ? "Write here — " + brief : "Write this section here.";
}

function para(text, style){
  const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${ppr}<w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
}

/**
 * The Word draft for a deck: title, a short how-to, then every section as a
 * Heading 1 with its brief underneath and room to write.
 */
function buildDocxDraft(deck){
  const kind = deck.meta.kind;
  const bits = [];
  bits.push(para(deck.meta.title || "Draft", "MHWGTitle"));
  if (deck.meta.client) bits.push(para("Prepared for " + deck.meta.client, "MHWGInstruction"));
  bits.push(para(DRAFT_HOWTO, "MHWGInstruction"));

  (deck.sections || []).forEach(sec => {
    bits.push(para(sec.title || "Section", "Heading1"));
    bits.push(para(draftInstruction(sec.title), "MHWGInstruction"));
    bits.push(para(""));
  });

  bits.push(para(DRAFT_HELP_HEAD, "MHWGHelpHead"));
  bits.push(para(DRAFT_HELP, "MHWGInstruction"));

  const document_xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bits.join("")}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

  return zipStore([
    {name:"[Content_Types].xml",        text:CONTENT_TYPES},
    {name:"_rels/.rels",                text:RELS},
    {name:"word/_rels/document.xml.rels", text:DOC_RELS},
    {name:"word/styles.xml",            text:STYLES},
    {name:"word/document.xml",          text:document_xml}
  ]);
}

function downloadDocxDraft(deck){
  const blob = buildDocxDraft(deck);
  const stem = (deck.meta.client || deck.meta.title || "draft")
    .replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 50);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = stem + "_draft.docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

;
