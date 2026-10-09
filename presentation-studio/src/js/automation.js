/* ==========================================================================
   automation.js — the hands-off way in: Copilot answers and Presentation JSON.

   Everything here still runs on this computer. The program never talks to
   Copilot: it writes prompts for you to copy into Copilot, and it reads back
   whatever you paste — formatted text or JSON. A coder, a script or Copilot
   can describe a whole presentation as JSON (the format is documented in
   JSON_REFERENCE below and in docs/PRESENTATION_JSON.md); pasting it in shows
   a preview first and nothing changes until you press Apply.
   ========================================================================== */

/* ── The format, documented once ───────────────────────────────────────── */

const JSON_BLOCK_REFERENCE = [
  ["heading",    '{"type":"heading","text":"Sub-heading","level":3,"kicker":"optional small line above"}'],
  ["paragraph",  '{"type":"paragraph","text":"Body copy. **bold** sparingly; ==one key phrase== per page."}'],
  ["lead",       '{"type":"lead","text":"A larger opening line for the section."}'],
  ["bullets",    '{"type":"bullets","style":"bullet | number | check","items":["First point","Second point"]}'],
  ["stats",      '{"type":"stats","items":[{"num":"$1.48M","label":"Investable assets","note":"as at Aug 31"}]}'],
  ["facts",      '{"type":"facts","items":[{"k":"Retirement date","v":"2032"}]}'],
  ["table",      '{"type":"table","headers":["Option","Cost"],"rows":[["A","$1,200"]],"caption":"Illustrative","totalRow":false}'],
  ["callout",    '{"type":"callout","tone":"note | important | watch | quiet","title":"The headline","text":"One sentence."}'],
  ["quote",      '{"type":"quote","text":"A line in the client\'s own words.","by":""}'],
  ["actions",    '{"type":"actions","items":[{"t":"Rebalance","d":"What happens and why.","who":"Us","when":"Next 30 days"}]}'],
  ["twocol",     '{"type":"twocol","aTitle":"What works","aText":"…","bTitle":"What to watch","bText":"…"}'],
  ["chart",      '{"type":"chart","chart":"bar | stack | line | donut | hbar","title":"","labels":["2026","2032"],"series":[{"name":"Base case","values":[1.48,2.05]}],"unit":"$M","caption":"Illustrative only."}'],
  ["infographic",'{"type":"infographic","graphic":"timeline | steps | pyramid | gauge | compare","title":"","items":[{"t":"2032","d":"Retire"}]}'],
  ["rule",       '{"type":"rule"}  (thin divider)   {"type":"space","h":18}   {"type":"pagebreak"}']
];

const JSON_REFERENCE = `MHWG PRESENTATION JSON — version 1

One JSON object. Only "sections" is required; everything else is optional and
falls back to the house defaults.

{
  "meta": {
    "kind": "plan_summary | annual_review | portfolio_review | topic | proposal | blank",
    "client": "Robert & Anne Kowalchuk",
    "title": "The Kowalchuk Plan",
    "subtitle": "A summary of where you stand and what comes next",
    "advisor": "Matthew Solberg, CFP®, CIM®",
    "date": "2026-10-08"
  },
  "design": {
    "format": "report | slides",
    "cover": "white | premium | ivory",
    "look": "private | classic",
    "accent": "gold | shield",
    "density": "comfortable | compact"
  },
  "options": { "toc": true, "dividers": false, "sectionBreak": true, "team": true,
               "disclosures": true, "pageNumbers": true, "confidential": true },
  "sections": [
    { "title": "What we heard", "kicker": "", "blocks": [ …blocks… ] },
    { "title": "Where you stand today", "text": "Formatted text also works:\\n- bullet\\nLabel: value" },
    { "type": "recommendation", "account": "TFSA", "amount": "$95,000",
      "portfolio": "TD Core Managed Asset Allocation Portfolios - Balanced Growth",
      "howItFits": ["Point one", "Point two", "Point three", "Point four"] }
  ]
}

BLOCKS (each section's "blocks" list, top to bottom)
${JSON_BLOCK_REFERENCE.map(([t, ex]) => "  " + ex).join("\n")}

NOTES
· A section can give "blocks", or "text" in the paste format (# heading, - bullet,
  > callout, Label: value, $1.2M | Label | note, | a | b | tables).
· "portfolio" on a recommendation may be the portfolio's name or its portfolioId
  from the library. Up to four "howItFits" points.
· Numbers in charts may be written 1250, "1,250", "$1.2M", "4.5%" or "(3.2)".
· Pictures cannot come in through JSON (the program never fetches anything);
  drop the picture file onto the page instead.
· The DRAFT tag cannot be switched off from JSON — that is done on Finish.
· Write [NEEDS ADVISOR INPUT: what is missing] where a fact is missing; it is
  highlighted on the page and caught before export.`;

/* ── Reading JSON leniently ─────────────────────────────────────────────── */

/** Copilot wraps JSON in ``` fences, adds a sentence first, leaves trailing commas. */
function parseJSONLoose(text){
  let raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const starts = [raw.indexOf("{"), raw.indexOf("[")].filter(i => i >= 0);
  if (!starts.length) throw Error("No JSON found — it should start with { or [");
  const from = Math.min(...starts);
  const close = raw[from] === "{" ? "}" : "]";
  raw = raw.slice(from, raw.lastIndexOf(close) + 1);
  try { return JSON.parse(raw); }
  catch (e1){
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")); }
    catch (e2){
      const m = String(e1.message).match(/position (\d+)/);
      let where = "";
      if (m){
        const pos = +m[1], line = raw.slice(0, pos).split("\n").length;
        where = "\n\nAround line " + line + ":\n" + raw.slice(Math.max(0, pos - 60), pos + 40).replace(/\n/g, " ") + "\n" + " ".repeat(Math.min(60, pos)) + "^";
      }
      throw Error("That JSON has a mistake in it (" + e1.message + ")." + where +
        "\n\nAsk Copilot: \"Return the same answer as valid JSON only.\"");
    }
  }
}

/* ── Turning loose JSON into proper blocks ─────────────────────────────── */

const TYPE_ALIASES = {
  h2:"heading", h3:"heading", title:"heading", subheading:"heading", "sub-heading":"heading",
  text:"paragraph", p:"paragraph", body:"paragraph", para:"paragraph",
  intro:"lead", lede:"lead",
  list:"bullets", bullet:"bullets", ul:"bullets", ol:"bullets", numbered:"bullets", checklist:"bullets",
  kpi:"stats", kpis:"stats", stat:"stats", numbers:"stats", "key-numbers":"stats", cards:"stats",
  fact:"facts", keyvalue:"facts", "key-value":"facts", definition:"facts",
  grid:"table", note:"callout", alert:"callout", highlight:"callout", pullquote:"quote",
  action:"actions", "action-plan":"actions", steps:"actions", nextsteps:"actions",
  columns:"twocol", "two-column":"twocol", "two-columns":"twocol",
  graph:"chart", visual:"infographic", timeline:"infographic",
  divider:"rule", hr:"rule", spacer:"space", "page-break":"pagebreak", "new-page":"pagebreak"
};
const KNOWN_TYPES = new Set(BLOCK_KINDS.map(k => k.type));
const CHART_ALIASES = {pie:"donut", doughnut:"donut", column:"bar", columns:"bar", bars:"bar", grouped:"bar",
  stacked:"stack", horizontal:"hbar", ranking:"hbar", area:"line"};

const S = v => v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v)
  : (v.text != null ? String(v.text) : JSON.stringify(v));
const arr = v => Array.isArray(v) ? v : v == null || v === "" ? [] : [v];

/** One block from loose JSON, or null (with a warning) when it is not usable. */
function normalizeBlock(raw, warn){
  if (!raw || typeof raw !== "object" || Array.isArray(raw)){ warn("Skipped something in a blocks list that is not a block."); return null; }
  let type = String(raw.type || raw.kind || "").toLowerCase().trim().replace(/\s+/g, "-");
  type = TYPE_ALIASES[type] || type;
  if (!type){
    if (raw.headers || raw.rows) type = "table";
    else if (raw.series || raw.labels) type = "chart";
    else if (Array.isArray(raw.items) && raw.items[0] && raw.items[0].num != null) type = "stats";
    else if (Array.isArray(raw.items)) type = "bullets";
    else if (raw.text) type = "paragraph";
  }
  if (!KNOWN_TYPES.has(type)){
    if (raw.text){ warn('Unknown block type "' + (raw.type || "") + '" — kept its text as a paragraph.'); type = "paragraph"; }
    else { warn('Skipped a block of unknown type "' + (raw.type || "?") + '".'); return null; }
  }
  const b = {id: uid(), type};
  const items = arr(raw.items || raw.points || raw.rows && type !== "table" && raw.rows);
  switch (type){
    case "heading":
      b.text = S(raw.text || raw.title);
      b.level = String(raw.level) === "2" || raw.level === "h2" ? 2 : 3;
      b.kicker = S(raw.kicker);
      break;
    case "paragraph": case "lead":
      b.text = arr(raw.text || raw.body || raw.content).map(S).join(" ");
      break;
    case "bullets": {
      const st = String(raw.style || (raw.type === "numbered" || raw.type === "ol" ? "number" : raw.type === "checklist" ? "check" : "bullet")).toLowerCase();
      b.style = /num|order/.test(st) ? "number" : /check/.test(st) ? "check" : "bullet";
      b.items = items.map(S).map(x => x.trim()).filter(Boolean);
      break;
    }
    case "stats":
      b.items = items.map(x => typeof x === "object" && x
        ? {num:S(x.num ?? x.value ?? x.number ?? x.figure), label:S(x.label ?? x.title ?? x.name), note:S(x.note ?? x.caption ?? x.sub)}
        : {num:S(x), label:"", note:""}).filter(x => x.num || x.label);
      b.cols = Math.min(4, Math.max(2, Number(raw.cols) || Math.min(4, b.items.length) || 3));
      break;
    case "facts": {
      const src = Array.isArray(raw.items) ? raw.items
        : raw.items && typeof raw.items === "object" ? Object.entries(raw.items).map(([k, v]) => ({k, v})) : items;
      b.items = src.map(x => typeof x === "object" && x
        ? {k:S(x.k ?? x.label ?? x.key ?? x.name), v:S(x.v ?? x.value)}
        : (() => { const m = S(x).split(/:\s*/); return {k:m[0], v:m.slice(1).join(": ")}; })()).filter(x => x.k || x.v);
      break;
    }
    case "table": {
      b.headers = arr(raw.headers || raw.columns).map(S);
      b.rows = arr(raw.rows).map(r => Array.isArray(r) ? r.map(S)
        : r && typeof r === "object" ? (b.headers.length ? b.headers.map(h => S(r[h])) : Object.values(r).map(S)) : [S(r)]);
      const w = Math.max(b.headers.length, ...b.rows.map(r => r.length), 1);
      while (b.headers.length < w) b.headers.push("");
      b.rows.forEach(r => { while (r.length < w) r.push(""); });
      b.caption = S(raw.caption); b.totalRow = !!raw.totalRow;
      break;
    }
    case "callout": {
      const tone = String(raw.tone || "note").toLowerCase();
      b.tone = ["note", "important", "watch", "quiet"].includes(tone) ? tone : /warn|caution|risk/.test(tone) ? "watch" : /key|important|headline/.test(tone) ? "important" : "note";
      b.title = S(raw.title); b.text = S(raw.text || raw.body);
      break;
    }
    case "quote": b.text = S(raw.text || raw.quote); b.by = S(raw.by || raw.author || raw.attribution); break;
    case "actions":
      b.items = items.map(x => typeof x === "object" && x
        ? {t:S(x.t ?? x.title ?? x.action ?? x.name), d:S(x.d ?? x.detail ?? x.description ?? x.text),
           who:S(x.who ?? x.owner), when:S(x.when ?? x.timing ?? x.timeframe ?? x.due)}
        : {t:S(x), d:"", who:"", when:""}).filter(x => x.t || x.d);
      break;
    case "twocol": {
      const L = raw.left || {}, R = raw.right || {};
      b.aTitle = S(raw.aTitle ?? L.title); b.aText = S(raw.aText ?? L.text);
      b.bTitle = S(raw.bTitle ?? R.title); b.bText = S(raw.bText ?? R.text);
      break;
    }
    case "chart": {
      let kind = String(raw.chart || raw.chartType || raw.kind || "bar").toLowerCase();
      kind = CHART_ALIASES[kind] || kind;
      b.chart = CHART_KINDS.some(c => c.id === kind) ? kind : "bar";
      b.title = S(raw.title); b.unit = S(raw.unit); b.caption = S(raw.caption); b.size = "full";
      b.labels = arr(raw.labels || raw.categories).map(S);
      let series = arr(raw.series);
      if (!series.length && raw.values) series = [{name: raw.name || "", values: raw.values}];
      if (!series.length && Array.isArray(raw.data)){
        b.labels = raw.data.map(d => S(d.label ?? d.name));
        series = [{name: raw.name || "", values: raw.data.map(d => d.value ?? d.percentage)}];
      }
      b.series = series.map(s => {
        const vals = arr(s.values || s.data).map(v => typeof v === "number" ? v : readNumber(v));
        if (vals.some(v => v == null)) warn('Chart "' + (b.title || b.chart) + '": a value could not be read as a number and counts as 0.');
        return {name:S(s.name), values: vals.map(v => v == null ? 0 : v)};
      });
      if (b.series.some(s => b.labels.length && s.values.length !== b.labels.length))
        warn('Chart "' + (b.title || b.chart) + '" has a different number of values than labels.');
      if (!b.caption) warn('Chart "' + (b.title || b.chart) + '" has no caption — add one (projections must say illustrative).');
      break;
    }
    case "infographic": {
      const g = String(raw.graphic || (raw.type === "timeline" ? "timeline" : "timeline")).toLowerCase();
      b.graphic = GRAPHIC_KINDS.some(k => k.id === g) ? g : g === "process" ? "steps" : "timeline";
      b.title = S(raw.title); b.caption = S(raw.caption);
      b.items = arr(raw.items || raw.steps).map(x => typeof x === "object" && x
        ? (b.graphic === "compare" ? {t:S(x.t ?? x.label), a:S(x.a), b:S(x.b)} : {t:S(x.t ?? x.title ?? x.label), d:S(x.d ?? x.detail ?? x.text ?? x.value)})
        : {t:S(x), d:""});
      break;
    }
    case "image":
      b.src = /^data:image\//i.test(raw.src || "") ? raw.src : "";
      if (raw.src && !b.src) warn("A picture given as a web link was left out — drop the picture file onto the page instead.");
      b.caption = S(raw.caption); b.size = ["full", "two-thirds", "half"].includes(raw.size) ? raw.size : "full"; b.frame = raw.frame === "none" ? "none" : "line";
      break;
    case "space": b.h = Number(raw.h || raw.height) || 18; break;
    case "rule": case "pagebreak": break;
  }
  return b;
}
function normalizeBlocks(list, warn){
  const out = [];
  arr(list).forEach(x => {
    if (typeof x === "string") out.push(...parseText(x));
    else { const b = normalizeBlock(x, warn); if (b) out.push(b); }
  });
  return out;
}

function findPortfolio(ref){
  const r = String(ref || "").trim().toLowerCase();
  if (!r) return null;
  return portfolioLibrary.find(p => p.portfolioId.toLowerCase() === r || p.portfolioName.toLowerCase() === r)
      || portfolioLibrary.find(p => p.portfolioName.toLowerCase().includes(r) || r.includes(p.portfolioName.toLowerCase()))
      || null;
}

function normalizeSection(raw, i, warn){
  if (typeof raw === "string"){
    const parts = sectionsFromBlocks(parseText(raw));
    return parts.map((p, j) => ({id:uid(), title:p.title || "Section " + (i + j + 1), brief:p.title || "", kicker:"", summary:"", blocks:p.blocks}));
  }
  if (!raw || typeof raw !== "object"){ warn("Skipped a section that is not an object."); return []; }
  /* an account recommendation, in the JSON shape or as this program saves it */
  const recBlock = arr(raw.blocks).find(b => b && b.type === "recommendation");
  const rec = raw.type === "recommendation" ? raw : raw.recommendation && typeof raw.recommendation === "object" ? raw.recommendation
    : raw.accountRecommendation || recBlock ? Object.assign({account:raw.accountName, amount:raw.accountAmount}, recBlock || {}) : null;
  if (rec){
    const ref = rec.portfolioId || rec.portfolio || rec.portfolioName;
    const p = findPortfolio(ref);
    if (!p) warn('Recommendation for "' + S(rec.account) + '": portfolio "' + S(ref) + '" is not in this library — choose it after applying.');
    return [makeRecommendationSection({account:S(rec.account || rec.accountName), amount:S(rec.amount || rec.accountAmount),
      portfolioId: p ? p.portfolioId : S(ref), howItFits: rec.howItFits || rec.fit || [], profile: rec.profile || null})];
  }
  const title = S(raw.title || raw.heading || raw.name).trim() || "Section " + (i + 1);
  let blocks = Array.isArray(raw.blocks) ? normalizeBlocks(raw.blocks, warn)
    : typeof (raw.text || raw.markdown || raw.content) === "string" ? parseText(raw.text || raw.markdown || raw.content) : [];
  if (blocks[0] && blocks[0].type === "heading" && blocks[0].text.trim().toLowerCase() === title.toLowerCase()) blocks = blocks.slice(1);
  if (!blocks.length) warn('Section "' + title + '" is empty.');
  return [{id:uid(), title, brief:title, kicker:S(raw.kicker), summary:S(raw.summary), blocks}];
}

const META_KEYS = ["kind", "client", "title", "subtitle", "kicker", "advisor", "date"];
const OPTION_KEYS = ["toc", "dividers", "sectionBreak", "team", "disclosures", "draft", "confidential", "pageNumbers", "watermark", "runningHead"];

/** Any accepted JSON shape -> {sections, meta, design, options, …, warnings}. */
function readPresentation(v){
  const warnings = [], warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };
  if (Array.isArray(v)){
    const looksLikeBlocks = v.length && v.every(x => x && typeof x === "object" && x.type && !x.blocks && x.type !== "recommendation");
    v = looksLikeBlocks ? {sections:[{title:"New section", blocks:v}]} : {sections:v};
  } else if (v && v.type && !v.sections){
    v = {sections:[{title:"New section", blocks:[v]}]};
  } else if (v && !v.sections && Array.isArray(v.blocks)){
    v = Object.assign({}, v, {sections:[{title: v.title || "New section", blocks:v.blocks}]});
  }
  if (!v || !Array.isArray(v.sections)) throw Error('This JSON has no "sections" list, so there is nothing to lay out. See the JSON format reference.');

  const m = Object.assign({}, v.meta || {});
  const meta = {};
  META_KEYS.forEach(k => { const val = S(m[k] != null ? m[k] : (v.meta ? "" : v[k])).trim(); if (val) meta[k] = val; });
  if (meta.kind && !TEMPLATES[meta.kind]){ warn('Unknown "kind" ' + meta.kind + " — ignored."); delete meta.kind; }
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)){
    const d = new Date(meta.date);
    if (isNaN(d)) { warn("Could not read the date — it stays as it was."); delete meta.date; }
    else meta.date = d.toISOString().slice(0, 10);
  }
  const d = Object.assign({}, v.design || {});
  const design = {}, pick = (key, allowed) => { const x = String(d[key] || "").toLowerCase(); if (allowed.includes(x)) design[key] = x; };
  pick("format", ["report", "slides"]); pick("look", ["private", "classic"]); pick("accent", ["gold", "shield"]); pick("density", ["comfortable", "compact"]);
  let cover = String(d.cover || (v.cover && (v.cover.style || v.cover)) || "").toLowerCase();
  cover = ["white", "premium", "ivory"].includes(cover) ? cover : (v.cover && v.cover.style === "photo" ? "" : "");
  const options = {};
  OPTION_KEYS.forEach(k => { if (v.options && typeof v.options[k] === "boolean") options[k] = v.options[k]; });
  if (options.draft === false){ delete options.draft; warn("The DRAFT tag stays on — switch it off on the Finish tab once the piece is reviewed."); }

  const sections = [];
  v.sections.forEach((s, i) => sections.push(...normalizeSection(s, i, warn)));
  const out = {sections, meta, design, cover, options, warnings};
  if (Array.isArray(v.team) && v.team.length) out.team = v.team.map(t => ({name:S(t.name), desig:S(t.desig), title:S(t.title)}));
  if (v.contact && typeof v.contact === "object") out.contact = v.contact;
  if (Array.isArray(v.disclosures) && v.disclosures.length) out.disclosures = v.disclosures.map(S);
  const ip = S((v.household || {}).investorProfile || v.investorProfile).trim();
  if (ip){
    const name = Object.keys(INVESTOR_PROFILES).find(k => k.toLowerCase() === ip.toLowerCase().replace(/\s+investor$/, ""));
    if (name) out.investorProfile = name; else warn('Unknown investor profile "' + ip + '" — choose it on the Our recommendations page.');
  }
  return out;
}

/* ── Applying it ────────────────────────────────────────────────────────── */

function deckIsStarter(){
  return deck.sections.every(s => (s.blocks || []).every(b => b.seed || !hasWords(b)));
}

function applyPresentation(r, mode){
  snapshot();
  if (mode === "replace"){
    Object.assign(deck.meta, r.meta);
    Object.assign(deck.design, r.design);
    if (r.cover) deck.cover.style = r.cover;
    Object.assign(deck.options, r.options);
    if (r.team) deck.team = r.team;
    if (r.contact) Object.assign(deck.contact, r.contact);
    if (r.disclosures) deck.disclosures = r.disclosures;
    deck.sections = r.sections;
  } else if (mode === "fill"){
    r.sections.forEach(sec => {
      const hit = !sec.accountRecommendation && deck.sections.find(x => !x.accountRecommendation &&
        (x.title || "").trim().toLowerCase() === (sec.title || "").trim().toLowerCase());
      if (hit) hit.blocks = replaceWords(hit.blocks, sec.blocks);
      else deck.sections.push(sec);
    });
  } else {
    deck.sections.push(...r.sections);
  }
  if (r.investorProfile) setInvestorProfile(r.investorProfile);
  selectedId = null;
  syncPanels(); render();
  toast(r.sections.length + " section" + (r.sections.length === 1 ? "" : "s") + " laid out.");
  showRail("build");
}

function showImportPreview(r){
  const rows = r.sections.map(s => "<li><b>" + esc(s.title) + "</b> — " +
    (s.accountRecommendation ? "one-page recommendation" : esc(describeBlocks(s.blocks))) +
    (deck.sections.some(x => (x.title || "").trim().toLowerCase() === (s.title || "").trim().toLowerCase()) ? ' <span class="hint">· matches a section you have</span>' : "") + "</li>").join("");
  const metaBits = Object.entries(r.meta).map(([k, v]) => esc(k) + ": <b>" + esc(v) + "</b>").join(" · ");
  const starter = deckIsStarter();
  showModal("Ready to lay out", `
    <p>I read <b>${r.sections.length} section${r.sections.length === 1 ? "" : "s"}</b>:</p>
    <ul class="import-list">${rows}</ul>
    ${metaBits ? "<p class='hint'>Cover details: " + metaBits + "</p>" : ""}
    ${r.warnings.length ? "<div class='import-warn'><b>Worth knowing</b><ul>" + r.warnings.map(w => "<li>" + esc(w) + "</li>").join("") + "</ul></div>" : ""}
    <div class="choice-list">
      <label class="choice"><input type="radio" name="impMode" value="replace" ${starter ? "checked" : ""}>
        <span><b>Replace the presentation</b><em>Use these sections instead of what is there now${metaBits ? ", and these cover details" : ""}.</em></span></label>
      <label class="choice"><input type="radio" name="impMode" value="fill" ${starter ? "" : "checked"}>
        <span><b>Fill matching sections</b><em>Sections with the same title get these words (their charts and pictures stay); the rest are added at the end.</em></span></label>
      <label class="choice"><input type="radio" name="impMode" value="append">
        <span><b>Add to the end</b><em>Keep everything and add these as new sections.</em></span></label>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" id="impCancel">Cancel</button>
      <button class="btn btn-primary" id="impGo">Apply</button></div>`);
  $("impCancel").onclick = hideModal;
  $("impGo").onclick = () => {
    const mode = (document.querySelector('input[name="impMode"]:checked') || {}).value || "append";
    hideModal(); applyPresentation(r, mode);
  };
}

/* ── The one paste box: text, presentation JSON or a portfolio profile ── */

function looksLikeJSON(t){ return /^\s*(```|\{|\[)/.test(t) || /^[\s\S]{0,200}```json/i.test(t); }

function smartPaste(text){
  const t = String(text || "").trim();
  if (!t){ toast("Paste Copilot's answer into the box first."); return false; }
  if (looksLikeJSON(t)){
    let v;
    try { v = parseJSONLoose(t); }
    catch (e){ showModal("That JSON did not read", "<pre class='prompt-preview'>" + esc(e.message) + "</pre>"); return false; }
    if (v && !Array.isArray(v) && v.portfolioName && !v.sections){
      openPortfolioLibrary();
      $("libAdd").open = true; $("libJson").value = t; $("libCheck").click();
      toast("That is a portfolio profile — check it and save it to the library.", 4000);
      return true;
    }
    try { showImportPreview(readPresentation(v)); }
    catch (e){ showModal("Nothing to lay out", "<p>" + esc(e.message) + "</p>"); return false; }
    return true;
  }
  /* formatted text: with # headings it is the whole piece, otherwise one section */
  if (sectionsFromBlocks(parseText(t)).some(p => p.title)){
    previewWholePiece(t, () => { insertAsSections(t); showRail("build"); });
    return true;
  }
  askWhichSection(t);
  return true;
}

/** Text with no "# " headings: which section does it go in? */
function askWhichSection(text){
  const blocks = parseText(text);
  if (!blocks.length){ toast("Nothing I can lay out in that."); return; }
  const opts = deck.sections.map(s => `<option value="${esc(s.id)}">${esc(s.title || "Untitled section")}</option>`).join("");
  showModal("Where does this go?", `
    <p>I read this as <b>${esc(describeBlocks(blocks))}</b>, with no <code># Section</code> headings —
    so it is one section's worth.</p>
    <label class="field"><span>Put it in</span><select id="awSec">${opts}<option value="__new">＋ A new section at the end</option></select></label>
    <div class="choice-list">
      <label class="choice"><input type="radio" name="awMode" value="replace" checked><span><b>Replace the words in that section</b><em>Charts and pictures stay.</em></span></label>
      <label class="choice"><input type="radio" name="awMode" value="append"><span><b>Add after what is there</b><em>Starter text is cleared; your own words stay.</em></span></label>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" id="awCancel">Cancel</button><button class="btn btn-primary" id="awGo">Put it in</button></div>`);
  if (currentSectionId && deck.sections.some(s => s.id === currentSectionId)) $("awSec").value = currentSectionId;
  $("awCancel").onclick = hideModal;
  $("awGo").onclick = () => {
    const id = $("awSec").value, mode = document.querySelector('input[name="awMode"]:checked').value;
    hideModal();
    let sec = deck.sections.find(s => s.id === id);
    if (!sec){ snapshot(); sec = {id:uid(), title:"New section", brief:"", kicker:"", summary:"", blocks:[]}; deck.sections.push(sec); }
    fillSection(sec, text, mode);
    jumpToSection(sec);
  };
}

/* ── Exporting the presentation as JSON ────────────────────────────────── */

function blockForExport(b, images){
  const o = {};
  Object.keys(b).forEach(k => {
    if (["id", "seed", "_off", "_len", "fromNumbers", "profile", "num"].includes(k)) return;
    o[k] = b[k];
  });
  if (o.type === "image" && !images) o.src = "";
  (o.series || []).forEach(s => { delete s.bad; delete s.empty; });
  return o;
}
function presentationToJSON(images){
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = {
    format: "mhwg-presentation", version: 1,
    meta: Object.fromEntries(META_KEYS.map(k => [k, deck.meta[k] || ""]).filter(([, v]) => v)),
    design: {format: deck.design.format, cover: deck.cover.style === "photo" ? "white" : deck.cover.style,
             look: deck.design.look, accent: deck.design.accent, density: deck.design.density},
    options: Object.fromEntries(OPTION_KEYS.filter(k => k !== "draft").map(k => [k, !!deck.options[k]])),
    household: deck.household && deck.household.investorProfile ? {investorProfile: deck.household.investorProfile} : undefined,
    /* "Our recommendations" is rebuilt from the account pages, so it is not written out */
    sections: deck.sections.filter(s => !s.recommendationOverview).map(s => {
      if (s.accountRecommendation){
        const rec = s.blocks.find(b => b.type === "recommendation") || {};
        const p = recProfile(rec);
        return {type:"recommendation", account:s.accountName || "", amount:s.accountAmount || "",
          portfolio: p ? p.portfolioName : rec.portfolioId || "", portfolioId: rec.portfolioId || "", howItFits: rec.howItFits || []};
      }
      const o = {title: s.title || ""};
      if (s.kicker) o.kicker = s.kicker;
      if (s.summary) o.summary = s.summary;
      o.blocks = JSON.parse(JSON.stringify((s.blocks || []).map(b => blockForExport(b, images))));
      return o;
    })
  };
  if (!same(deck.team, BRAND.team)) out.team = deck.team;
  if (!same(deck.disclosures, BRAND.disclosures)) out.disclosures = deck.disclosures;
  return JSON.stringify(out, null, 2);
}

/* ── Prompts ────────────────────────────────────────────────────────────── */

function promptContext(){
  const msg = ((deck.sources || {}).message || {}).note || "";
  const nums = (deck.guideNumbers || []).filter(r => (r.k || "").trim() && (r.v || "").trim())
    .map(r => "- " + r.k.trim() + ": " + r.v.trim() + ((r.note || "").trim() ? " (" + r.note.trim() + ")" : ""));
  return (msg.trim() ? "The one thing the advisor wants the client to take away:\n" + msg.trim() + "\n\n" : "") +
         (nums.length ? "Key figures — use exactly as written:\n" + nums.join("\n") + "\n\n" : "");
}
function sectionList(){
  return deck.sections.filter(s => !s.accountRecommendation).map((s, i) => {
    const b = sectionBrief(s.brief || s.title, deck.meta.kind);
    return (i + 1) + '. "' + (s.title || "Section") + '"\n   ' + (b || "write what this heading calls for, under 300 words.");
  }).join("\n\n");
}

/** Route 1: the whole piece as formatted text (the most reliable Copilot answer). */
function wholeTextPrompt(){
  const list = deck.sections.filter(s => !s.accountRecommendation).map((s, i) => {
    const b = sectionBrief(s.brief || s.title, deck.meta.kind);
    return (i + 1) + ". # " + (s.title || "Section") + "\n   " + (b || "write what this heading calls for, under 300 words.");
  }).join("\n\n");
  return "I am an investment advisor preparing " + (PIECE_NAME[deck.meta.kind] || PIECE_NAME.blank) + ".\n\n" +
    promptContext() +
    "Write the whole document from my notes, section by section, in this order. Start each section with its " +
    '"# " heading exactly as written, and do not add, rename, merge or skip sections:\n\n' + list +
    "\n\n" + SOURCE_RULES + "\n\n" + PASTE_FORMAT_RULES +
    "\n\nReturn only the document, starting with the first # heading.\n\nNOTES:\n[paste your notes here, or attach the plan, meeting notes and statements]";
}

/** Route 2: the whole piece as Presentation JSON (charts, tables and layout included). */
function wholeJSONPrompt(){
  return "I am an investment advisor preparing " + (PIECE_NAME[deck.meta.kind] || PIECE_NAME.blank) +
    ". Write it from my notes and return it as JSON for our formatting tool.\n\n" +
    promptContext() +
    "SECTIONS — use these titles, in this order:\n\n" + sectionList() + "\n\n" +
    SOURCE_RULES + "\n\n" +
    "STYLE\n- Plain Canadian English at a grade 9 reading level. Short sentences, no jargon, no exclamation marks.\n" +
    "- No advice language aimed at the reader (\"you should\"). Label every projected figure illustrative.\n" +
    "- Do not write a cover, contents, disclaimers or team page — the tool adds those.\n" +
    "- Use charts, key-number cards and tables only for figures that are in my notes. Never make up numbers.\n" +
    "- Give every chart a caption. **bold** sparingly; ==one key phrase== per page at most.\n\n" +
    "JSON FORMAT\nReturn ONLY one valid JSON object, no text before or after it, shaped like:\n" +
    '{ "sections": [ { "title": "…", "blocks": [ … ] } ] }\n\nBlock types you may use:\n' +
    JSON_BLOCK_REFERENCE.map(([, ex]) => ex).join("\n") +
    "\n\nNOTES:\n[paste your notes here, or attach the plan, meeting notes and statements]";
}

/* ── Copilot for one block ──────────────────────────────────────────────── */

const DATA_BLOCKS = ["stats", "table", "chart", "infographic", "twocol"];
function blockToText(b){
  const t = (x) => String(x || "");
  switch (b.type){
    case "heading": return (b.level === 3 ? "## " : "# ") + t(b.text);
    case "paragraph": case "lead": case "quote": return t(b.text);
    case "callout": return (b.title ? t(b.title) + ": " : "") + t(b.text);
    case "bullets": return (b.items || []).map((x, i) => (b.style === "number" ? (i + 1) + ". " : "- ") + x).join("\n");
    case "facts": return (b.items || []).map(x => t(x.k) + ": " + t(x.v)).join("\n");
    case "actions": return (b.items || []).map((x, i) => (i + 1) + ". " + t(x.t) + " - " + t(x.d) +
      (x.who || x.when ? " (Owner: " + t(x.who) + (x.when ? ", When: " + t(x.when) : "") + ")" : "")).join("\n");
    default: return JSON.stringify(blockForExport(b, false), null, 2);
  }
}
const BLOCK_ASKS = [
  ["Improve the wording", "Improve the wording. Keep every number, name, date and caveat exactly as written."],
  ["Make it shorter", "Cut it by about a third without losing any number, condition or caveat."],
  ["Plain language", "Rewrite it for a client who is not a finance professional: grade 9 reading level, short sentences, no jargon."],
  ["Write it from my notes", "Write this from the notes I paste below, replacing the current content."]
];
function blockPrompt(b, ask){
  const label = (BLOCK_KINDS.find(k => k.type === b.type) || {}).label || b.type;
  const sec = (findBlock(b.id) || {}).section;
  const isData = DATA_BLOCKS.includes(b.type);
  const shape = isData ? (JSON_BLOCK_REFERENCE.find(([t]) => t === b.type) || [, ""])[1] : "";
  return "I am an investment advisor editing one part of a client " + (deck.design.format === "slides" ? "presentation" : "document") +
    (sec && sec.title ? ', in the section "' + sec.title + '"' : "") + ".\n\n" +
    "WHAT I WANT\n" + ask + "\n\n" +
    "THE CURRENT " + label.toUpperCase() + "\n" + blockToText(b) + "\n\n" +
    SOURCE_RULES + "\n\n" +
    (isData
      ? "Return ONLY valid JSON for one block in exactly this shape, nothing before or after it:\n" + shape
      : "Return only the replacement text, no introduction. Keep the same kind of content (" + label.toLowerCase() + ").\n" + PASTE_FORMAT_RULES) +
    "\n\nNOTES (optional):\n[paste anything Copilot should use]";
}

/** Put Copilot's answer in place of one block. */
function applyBlockAnswer(b, text){
  const t = String(text || "").trim();
  if (!t){ toast("Paste Copilot's answer first."); return false; }
  let blocks = [];
  if (looksLikeJSON(t)){
    try {
      const warns = [];
      const v = parseJSONLoose(t);
      blocks = normalizeBlocks(Array.isArray(v) ? v : v.blocks || [v], m => warns.push(m));
      if (warns.length) toast(warns[0], 5000);
    } catch (e){ alert(e.message); return false; }
  } else {
    blocks = parseText(t);
  }
  if (!blocks.length){ toast("Nothing I can use in that answer."); return false; }
  const at = blockIndex(b.id);
  if (!at) return false;
  snapshot();
  /* one block of the same kind: keep its settings (style, tone, size) and swap the content */
  if (blocks.length === 1 && (blocks[0].type === b.type || (["paragraph", "lead"].includes(b.type) && blocks[0].type === "paragraph"))){
    const keep = {id:b.id, type:b.type};
    ["style", "tone", "level", "cols", "size", "frame", "chart", "graphic"].forEach(k => { if (b[k] != null && blocks[0][k] == null) keep[k] = b[k]; });
    if (b.type === "lead" || b.type === "callout"){ keep.tone = b.tone; }
    const merged = Object.assign({}, blocks[0], keep);
    if (b.type === "callout" && blocks[0].type === "paragraph"){ merged.title = b.title; }
    deck.sections[at.si].blocks[at.bi] = merged;
  } else {
    deck.sections[at.si].blocks.splice(at.bi, 1, ...blocks);
  }
  selectedId = blocks.length === 1 ? (deck.sections[at.si].blocks[at.bi].id) : null;
  syncPanels(); render();
  if (selectedId) selectBlock(selectedId, false);
  toast("Copilot's answer is in.");
  return true;
}

function openBlockCopilot(id){
  const found = findBlock(id);
  if (!found) return;
  const b = found.block;
  const label = (BLOCK_KINDS.find(k => k.type === b.type) || {}).label || b.type;
  showModal("Copilot for this " + label.toLowerCase(), `
    <ol class="mini-steps">
      <li>Say what you want (or pick one):
        <div class="chips" id="bcChips">${BLOCK_ASKS.map(([n], i) => `<button class="chip${i ? "" : " is-on"}" data-i="${i}">${esc(n)}</button>`).join("")}</div>
        <textarea id="bcAsk" rows="2">${esc(BLOCK_ASKS[0][1])}</textarea></li>
      <li><button class="btn btn-primary btn-mini" id="bcCopy">Copy the prompt</button> and paste it into Copilot.
        <details><summary class="hint">See the prompt</summary><pre class="prompt-preview" id="bcPreview"></pre></details></li>
      <li>Paste Copilot's answer here:
        <textarea id="bcAnswer" rows="7" spellcheck="false" placeholder="Copilot's answer…"></textarea></li>
    </ol>
    <div class="modal-actions"><button class="btn btn-ghost" id="bcCancel">Cancel</button>
      <button class="btn btn-primary" id="bcApply">Replace this ${esc(label.toLowerCase())}</button></div>`);
  const refresh = () => { $("bcPreview").textContent = blockPrompt(b, $("bcAsk").value); };
  $$("#bcChips .chip").forEach(c => c.onclick = () => {
    $$("#bcChips .chip").forEach(x => x.classList.toggle("is-on", x === c));
    $("bcAsk").value = BLOCK_ASKS[+c.dataset.i][1]; refresh();
  });
  $("bcAsk").oninput = refresh;
  refresh();
  $("bcCopy").onclick = () => copyText(blockPrompt(b, $("bcAsk").value), "Prompt copied — paste it into Copilot, then paste the answer below.");
  $("bcCancel").onclick = hideModal;
  $("bcApply").onclick = () => { if (applyBlockAnswer(b, $("bcAnswer").value)) hideModal(); };
}

function showJSONReference(){
  showModal("Presentation JSON — the format", `
    <p class="hint">For anyone generating a presentation with a script, a spreadsheet or Copilot.
    Paste JSON in this shape into <b>Copilot &amp; JSON → Paste the answer</b>. Nothing changes until
    you have seen the preview and pressed Apply.</p>
    <pre class="prompt-preview tall">${esc(JSON_REFERENCE)}</pre>
    <div class="modal-actions">
      <button class="btn" id="jrCopyCur">Copy this presentation as JSON</button>
      <button class="btn btn-primary" id="jrCopy">Copy the reference</button></div>`, {wide:true});
  $("jrCopy").onclick = () => copyText(JSON_REFERENCE, "Format reference copied.");
  $("jrCopyCur").onclick = () => copyText(presentationToJSON(false), "This presentation copied as JSON.");
}
