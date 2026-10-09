// Regression test: headline figures read out of PDFs by readPdfText() and
// parseText() in src/js/parse.js. Plain Node, no browser, no build step.
//   node tests/pdf-figures.mjs [folder]
//
// The test PDFs are built right here, one per way real producers write text
// (ReportLab's ASCII85 + Flate, TJ kerning, hex strings, unescaped brackets,
// label and figure placed separately on one line, the ' operator...). The
// figures are invented; no client data is in the repo.
//
// To check real PDFs on your own machine, put them in a folder next to a
// same-named .expect.txt listing, one per line, text that must come out
// (e.g. "Net worth: $1,234,567"), and pass the folder. Don't commit them.
import fs from "fs";
import path from "path";
import vm from "vm";
import zlib from "zlib";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const js = path.resolve(here, "../src/js");

let failures = 0;
const ok = (cond, msg, extra) => {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond){ failures++; if (extra) console.log("      got: " + JSON.stringify(extra)); }
};

/* load the engine the way the page does: brand.js (newBlock), then parse.js */
const ctx = vm.createContext({ console, TextDecoder, DecompressionStream, Blob, Response, Uint8Array });
for (const f of ["brand.js", "parse.js"]) vm.runInContext(fs.readFileSync(path.join(js, f), "utf8"), ctx, { filename: f });
const readPdfText = vm.runInContext("readPdfText", ctx);
const parseText = vm.runInContext("parseText", ctx);
const asFile = (buf) => ({ arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });

/* ── tiny PDF writer: one object per content stream ─────────────────────── */
function ascii85(buf){
  let out = "";
  for (let i = 0; i < buf.length; i += 4){
    const chunk = [0, 1, 2, 3].map(k => buf[i + k] || 0);
    let n = ((chunk[0] << 24) | (chunk[1] << 16) | (chunk[2] << 8) | chunk[3]) >>> 0;
    const take = Math.min(4, buf.length - i);
    if (n === 0 && take === 4){ out += "z"; continue; }
    const c = [];
    for (let k = 0; k < 5; k++){ c.unshift(String.fromCharCode(33 + (n % 85))); n = Math.floor(n / 85); }
    out += c.join("").slice(0, take + 1);
  }
  return Buffer.from(out + "~>", "latin1");
}
function pdf(streams, { filter = "none", indirectLen = false, eol = "\n" } = {}){
  const parts = [`%PDF-1.4${eol}`];
  let n = 1;
  for (const s of [].concat(streams)){
    let body = Buffer.from(s, "latin1"), filt = "";
    if (filter === "flate"){ body = zlib.deflateSync(body); filt = "/Filter /FlateDecode "; }
    if (filter === "a85"){ body = ascii85(zlib.deflateSync(body)); filt = "/Filter [ /ASCII85Decode /FlateDecode ] "; }
    const len = indirectLen ? `${n + 1} 0 R` : body.length;
    parts.push(`${n} 0 obj${eol}<< ${filt}/Length ${len} >>${eol}stream${eol}`, body,
               `${eol}endstream${eol}endobj${eol}${n + 1} 0 obj ${body.length} endobj${eol}`);
    n += 2;
  }
  parts.push("%%EOF");
  return Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p, "latin1")));
}
const read = (streams, opts) => readPdfText(asFile(pdf(streams, opts)));

/* ── 1. a plan summary page, as each kind of producer writes it ──────────── */
const PLAN = [
  "BT /F1 16 Tf 72 740 Td (Wealth Plan Summary) Tj ET",
  "BT /F1 10 Tf 14 TL 72 710 Td",
  "(Net worth: $1,234,567) Tj T*",
  "(Probability of success: 87%) Tj T*",
  "(Annual spending goal: $96,000) Tj T*",
  "(Shortfall \\(2031\\): \\($12,400\\)) Tj T*",
  "(6.2% | Annualized return | since inception) Tj",
  "ET",
].join("\n");
const HEADLINES = [
  ["fact", "Net worth", "$1,234,567"],
  ["fact", "Probability of success", "87%"],
  ["fact", "Annual spending goal", "$96,000"],
  ["fact", "Shortfall (2031)", "($12,400)"],
  ["stat", "Annualized return", "6.2%"],
];
function checkHeadlines(text, how){
  const blocks = parseText(text);
  const facts = blocks.filter(b => b.type === "facts").flatMap(b => b.items);
  const stats = blocks.filter(b => b.type === "stats").flatMap(b => b.items);
  for (const [kind, label, value] of HEADLINES){
    const got = kind === "fact" ? facts.find(f => f.k === label)?.v : stats.find(s => s.label === label)?.num;
    ok(got === value, `${how}: ${label} = ${value}`, got ?? text);
  }
}
console.log("Headline figures from a plan summary");
for (const [how, opts] of [
  ["uncompressed", {}],
  ["Flate", { filter: "flate" }],
  ["ReportLab style (ASCII85 + Flate)", { filter: "a85" }],
  ["indirect /Length, CRLF line ends", { filter: "flate", indirectLen: true, eol: "\r\n" }],
]) checkHeadlines(await read(PLAN, opts), how);

/* ── 2. the ways a figure has gone wrong, one at a time ──────────────────── */
console.log("Producer quirks");
const cases = [
  ["unescaped brackets inside a string keep the label and the negative",
   "BT 72 700 Td (Shortfall: ($12,400)) Tj ET", "Shortfall: ($12,400)"],
  ["label and figure placed separately on one baseline (Tm)",
   "BT 1 0 0 1 72 700 Tm (Net worth:) Tj 1 0 0 1 200 700 Tm ($1,234,567) Tj ET", "Net worth: $1,234,567"],
  ["label and figure in separate BT blocks on one baseline",
   "BT 72 700 Td (Net worth:) Tj ET BT 200 700 Td ($1,234,567) Tj ET", "Net worth: $1,234,567"],
  ["a sideways Td stays on the line",
   "BT 72 700 Td (Equities) Tj 150 0 Td (45.2%) Tj 0 -14 Td (Bonds) Tj -150 0 Td ET", "Equities 45.2%\nBonds"],
  ["scaled text matrix still breaks lines",
   "BT 10 0 0 10 72 700 Tm (Line one) Tj 0 -1.2 Td (Line two) Tj ET", "Line one\nLine two"],
  ["TJ kerning: small kerns join, big ones are spaces",
   "BT 72 700 Td [(Net)-278(worth:)-278($1,)-15(234,567)] TJ ET", "Net worth: $1,234,567"],
  ["hex strings", "BT 72 700 Td <4e657420776f7274683a2024312c3233342c353637> Tj ET", "Net worth: $1,234,567"],
  ["UTF-16 hex strings", "BT 72 700 Td <FEFF00240031002C003200330034> Tj ET", "$1,234"],
  ["the ' operator starts a new line",
   "BT 14 TL 72 700 Td (Net worth: $1,234,567) Tj (Success: 87%) ' ET", "Net worth: $1,234,567\nSuccess: 87%"],
  ["octal escapes", "BT 72 700 Td (Fees \\050est.\\051: 1.25%) Tj ET", "Fees (est.): 1.25%"],
];
for (const [what, stream, want] of cases){
  for (const filter of ["none", "flate"]){
    const got = await read(stream, { filter });
    ok(got === want, `${what}${filter === "flate" ? " (Flate)" : ""}`, got);
  }
}
const two = await read(["BT 72 700 Td (Page one: $100) Tj ET", "BT 72 700 Td (Page two: $200) Tj ET"], { filter: "flate" });
ok(two === "Page one: $100\n\nPage two: $200", "every stream is read, in order", two);

/* ── 3. optional: real PDFs on this machine ─────────────────────────────── */
const dir = process.argv[2];
if (dir){
  console.log("PDFs in " + dir);
  for (const f of fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort()){
    const text = await readPdfText(asFile(fs.readFileSync(path.join(dir, f))));
    const exp = path.join(dir, f.replace(/\.pdf$/i, ".expect.txt"));
    if (!fs.existsSync(exp)){ console.log(`  · ${f}: no .expect.txt, text follows\n${text}\n`); continue; }
    const flat = text.replace(/\s+/g, " ");
    for (const want of fs.readFileSync(exp, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean))
      ok(flat.includes(want.replace(/\s+/g, " ")), `${f}: ${want}`);
  }
}

console.log(failures ? `\n${failures} failed` : "\nAll PDF figure checks passed");
process.exit(failures ? 1 : 0);
