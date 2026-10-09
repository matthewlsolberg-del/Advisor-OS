/* ==========================================================================
   workflow.js — what is written, what is not, and getting text into place.

   Starter content that came from a template is marked `seed`. Anything the
   person writes or pastes clears that mark, which is how the section status
   chips, the progress count and the Finish check know what is real.

   (Carried over from v6's guide.js; the step-by-step accordion it drove has
   been replaced by the Start / Build / Copilot / Style / Finish tabs.)
   ========================================================================== */

const PIECE_CARDS = [
  {kind:"plan_summary",     name:"Financial plan summary", note:"Where they stand, what the plan projects, what happens next"},
  {kind:"portfolio_review", name:"Portfolio review",       note:"How it is invested, how it behaved, what changed"},
  {kind:"annual_review",    name:"Annual review",          note:"The year, the portfolio, the plan, the decisions"},
  {kind:"topic",            name:"Topic write-up",         note:"One question: options, recommendation, caveats"},
  {kind:"proposal",         name:"New-client proposal",    note:"What we heard, what we would do, how we work"},
  {kind:"blank",            name:"Start blank",            note:"Build the sections yourself"}
];

const NUMBER_ROWS = {
  plan_summary:[
    {k:"Total net worth", v:"", note:""},
    {k:"Investable assets", v:"", note:"Registered and non-registered"},
    {k:"Target retirement year", v:"", note:""},
    {k:"Target annual income", v:"", note:"Today's dollars"},
    {k:"Plan success rate", v:"", note:""}],
  portfolio_review:[
    {k:"Total invested assets", v:"", note:""},
    {k:"Return this period", v:"", note:"Net of fees"},
    {k:"Contributions", v:"", note:"This period"},
    {k:"Withdrawals", v:"", note:"This period"},
    {k:"Cash held for spending", v:"", note:""}],
  annual_review:[
    {k:"Portfolio return", v:"", note:"Net of fees"},
    {k:"Contributions", v:"", note:"This year"},
    {k:"Withdrawals", v:"", note:"This year"},
    {k:"Plan success rate", v:"", note:""}],
  topic:[
    {k:"What it costs", v:"", note:""},
    {k:"What it saves", v:"", note:"Illustrative"},
    {k:"Deadline", v:"", note:""}],
  proposal:[
    {k:"Assets under care", v:"", note:"*as at Nov 2023"},
    {k:"Senior advisors", v:"", note:"All CFP®"},
    {k:"Years serving families", v:"", note:"In Medicine Hat"}],
  blank:[{k:"", v:"", note:""}, {k:"", v:"", note:""}, {k:"", v:"", note:""}]
};


const VISUAL_TYPES = ["chart", "infographic", "image"];

/* ── Status ─────────────────────────────────────────────────────────────── */

/* Settings on a block (its style, size, chart type…) are not content. */
const NOT_CONTENT = new Set(["id","type","seed","style","level","tone","cols","size","frame",
  "chart","graphic","totalRow","numeric","fromNumbers","h","_off","_len"]);
/** Does this block actually say something? An empty paragraph does not. */
function hasWords(v, key){
  if (key && NOT_CONTENT.has(key)) return false;
  if (typeof v === "string") return /[\p{L}\p{N}]/u.test(v);
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.some(x => hasWords(x));
  if (v && typeof v === "object") return Object.keys(v).some(k => hasWords(v[k], k));
  return false;
}
function sectionStatus(sec){
  if (sec.recommendationOverview) return householdProfileName() ? "done" : "started";
  if (sec.accountRecommendation) return (sec.blocks || []).some(b => b.type === "recommendation" && recProfile(b)) ? "done" : "started";
  const blocks = sec.blocks || [];
  if (gapCount(blocks) && blocks.some(b => !b.seed && hasWords(b))) return "started";
  const real = blocks.filter(b => !b.seed && hasWords(b));
  if (!blocks.length) return "empty";
  if (!real.length) return "empty";
  if (blocks.some(b => b.seed && !VISUAL_TYPES.includes(b.type))) return "started";
  return "done";
}
function deckProgress(){
  const total = deck.sections.length;
  const done = deck.sections.filter(s => sectionStatus(s) === "done").length;
  return {done, total};
}
function seedCount(){
  return deck.sections.reduce((n, s) =>
    n + (s.blocks || []).filter(b => b.seed && !VISUAL_TYPES.includes(b.type)).length, 0);
}

/* ── Small builders ─────────────────────────────────────────────────────── */

function totalBlocks(){
  return deck.sections.reduce((n, s) => n + (s.blocks || []).length, 0);
}



const KIND_NAMES = {
  paragraph:["paragraph","paragraphs"], lead:["opening line","opening lines"],
  heading:["heading","headings"], bullets:["list","lists"], stats:["set of key-number cards","sets of key-number cards"],
  facts:["set of fact rows","sets of fact rows"], actions:["action plan","action plans"],
  callout:["callout","callouts"], quote:["quote","quotes"], table:["table","tables"],
  twocol:["two-column block","two-column blocks"], chart:["chart","charts"], image:["picture","pictures"]
};
/** "2 paragraphs, a table and 3 bullet points" */
function describeBlocks(blocks){
  const counts = {};
  blocks.forEach(b => {
    const key = b.type === "bullets" ? (b.style === "number" ? "numbered" : "bullets") : b.type;
    counts[key] = (counts[key] || 0) + (b.type === "bullets" ? (b.items || []).length : 1);
  });
  const parts = Object.keys(counts).map(k => {
    const n = counts[k];
    if (k === "bullets") return n + " bullet point" + (n === 1 ? "" : "s");
    if (k === "numbered") return n + " numbered point" + (n === 1 ? "" : "s");
    const nm = KIND_NAMES[k] || [k, k + "s"];
    return n === 1 ? (/^[aeiou]/.test(nm[0]) ? "an " : "a ") + nm[0] : n + " " + nm[1];
  });
  if (!parts.length) return "nothing I can lay out";
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}
function sectionBlocksFrom(sec, text){
  let blocks = parseText(text);
  /* Copilot often repeats the heading; drop it rather than printing it twice. */
  if (blocks.length && blocks[0].type === "heading" && blocks[0].level === 2 &&
      (blocks[0].text || "").trim().toLowerCase() === (sec.title || "").trim().toLowerCase()){
    blocks = blocks.slice(1);
  }
  return blocks;
}
/** Show what the paste will become, and what it will replace, before it lands. */
function previewFill(sec, text, go){
  const blocks = sectionBlocksFrom(sec, text);
  if (!blocks.length){ toast("Nothing I can lay out in that."); return; }
  const words = (sec.blocks || []).filter(isWords);
  /* what stays put (spacers and page breaks stay too, but are not worth naming) */
  const visuals = (sec.blocks || []).filter(b => !isWords(b) && !LAYOUT_TYPES.includes(b.type));
  const written = words.filter(b => !b.seed && hasWords(b));
  const stay = visuals.length ? esc(describeBlocks(visuals)) + " stay" + (visuals.length === 1 ? "s" : "") + " where " +
    (visuals.length === 1 ? "it is" : "they are") : "";
  let html = "<p>I read this as <b>" + esc(describeBlocks(blocks)) + "</b>.</p>";
  if (written.length){
    html += "<p><b>Replace</b> swaps out the words already in “" + esc(sec.title || "this section") +
      "” (" + esc(describeBlocks(written)) + ")" + (stay ? " — " + stay : "") +
      ". <b>Add to the end</b> keeps what is there and puts this after the last of the words.</p>";
  } else {
    html += "<p>It goes into “" + esc(sec.title || "this section") + "” in place of the starter text" +
      (stay ? "; " + stay : "") + ".</p>";
  }
  html += "<p class='btn-row'><button class='btn btn-primary' id='pvReplace'>" +
    (written.length ? "Replace" : "Put it in") + "</button>" +
    (written.length ? "<button class='btn' id='pvAppend'>Add to the end</button>" : "") +
    "<button class='btn btn-ghost' id='pvCancel'>Cancel</button></p>";
  showModal("Before it goes in", html);
  $("pvReplace").onclick = () => { hideModal(); go("replace"); };
  if ($("pvAppend")) $("pvAppend").onclick = () => { hideModal(); go("append"); };
  $("pvCancel").onclick = hideModal;
}
/** The whole piece at once: say which sections it refills and which are new. */
function previewWholePiece(text, go){
  const parts = sectionsFromBlocks(parseText(text)).filter(p => p.title);
  if (!parts.length){ go(); return; }      /* insertAsSections explains this case */
  const rows = parts.map(p => {
    const hit = deck.sections.find(sec => (sec.title || "").trim().toLowerCase() === p.title.toLowerCase());
    return "<li><b>" + esc(p.title) + "</b> — " + esc(describeBlocks(p.blocks)) +
      (hit ? " <span class='hint'>· replaces the words in this section, keeps its charts</span>"
           : " <span class='hint'>· a new section (no heading matched)</span>") + "</li>";
  }).join("");
  showModal("Before it goes in",
    "<p>I found <b>" + parts.length + " section" + (parts.length === 1 ? "" : "s") + "</b>:</p><ul>" + rows + "</ul>" +
    "<p class='btn-row'><button class='btn btn-primary' id='pvGo'>Lay it out</button>" +
    "<button class='btn btn-ghost' id='pvCancel'>Cancel</button></p>");
  $("pvGo").onclick = () => { hideModal(); go(); };
  $("pvCancel").onclick = hideModal;
}

/* What a paste replaces: the words. Charts, pictures, the number cards from step 4
   and layout pieces (page breaks, spacers, rules) are never words, and they stay
   exactly where they are in the section. */
const LAYOUT_TYPES = ["pagebreak", "space", "rule"];
function isWords(b){
  return !VISUAL_TYPES.includes(b.type) && !LAYOUT_TYPES.includes(b.type) && !b.fromNumbers;
}
/** Swap every block of words for `blocks`, which go where the first of them was
    (the top of the section if it had none). Everything else keeps its place. */
function replaceWords(old, blocks){
  const first = old.findIndex(isWords);
  const kept = old.filter(b => !isWords(b));
  const at = first < 0 ? 0 : old.slice(0, first).filter(b => !isWords(b)).length;
  kept.splice(at, 0, ...blocks);
  return kept;
}
/** Starter text goes; `blocks` go right after the last words that were written
    (or where the starter text was). Everything else keeps its place. */
function appendWords(old, blocks){
  const kept = old.filter(b => !(isWords(b) && b.seed));
  let lastReal = -1;
  old.forEach((b, i) => { if (isWords(b) && !b.seed) lastReal = i; });
  let at;
  if (lastReal >= 0) at = kept.indexOf(old[lastReal]) + 1;
  else {
    const firstSeed = old.findIndex(b => isWords(b) && b.seed);
    at = firstSeed < 0 ? kept.length : old.slice(0, firstSeed).filter(b => !(isWords(b) && b.seed)).length;
  }
  kept.splice(at, 0, ...blocks);
  return kept;
}
/** Put Copilot's answer into a section: Replace swaps the words (starter text and
    anything pasted before); Add to the end puts it after what was written. */
function fillSection(sec, text, mode){
  snapshot();
  const blocks = sectionBlocksFrom(sec, text);
  const old = sec.blocks || [];
  sec.blocks = mode === "append" ? appendWords(old, blocks) : replaceWords(old, blocks);
  selectedId = null;
  syncPanels(); render();
  toast((mode === "append" ? "Added to “" : "Put into “") + (sec.title || "section") + "”");
}

function jumpToSection(sec){
  currentSectionId = sec.id;
  const first = (sec.blocks || [])[0];
  const node = $("pages").querySelector('.blk-hit[data-bid="sec-' + sec.id + '"]') ||
    (first && $("pages").querySelector('.blk-hit[data-bid="' + first.id + '"]'));
  if (node) node.scrollIntoView({block:"start", behavior:"smooth"});
}

function showSectionExample(sec){
  const title = String(sec.title || "").trim(), key = String(sec.brief || title).trim();
  const found = SAMPLE_SECTIONS[deck.meta.kind + ":" + key] || SAMPLE_SECTIONS[key] || SAMPLE_SECTIONS[title];
  if (!found){
    showModal("Example", "<p>There is no worked example for a section with this title. " +
      "Open a section from one of the templates to see how a finished one reads.</p>");
    return;
  }
  showModal("Example — " + title,
    "<p class='hint'>A finished version of this section. Invented clients, illustrative " +
    "figures — it shows the shape and the tone, not words to copy.</p><pre class='prompt-preview'>" +
    esc(found) + "</pre>" +
    "<p class='btn-row'><button class='btn' id='exCopy'>Copy it</button></p>");
  $("exCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(found); toast("Copied"); } catch { toast("Select the text and copy it"); }
  };
}

function preflight(){
  const issues = [];
  if (!deck.meta.client) issues.push({t:"No client name on the cover", fix:() => showRail("start")});
  if (!deck.meta.date) issues.push({t:"No date on the cover", fix:() => showRail("start")});
  if (!deck.meta.advisor) issues.push({t:"No advisor named on the cover", fix:() => showRail("start")});

  deck.sections.forEach(s => {
    const st = sectionStatus(s);
    if (st !== "done"){
      issues.push({
        t: '“' + (s.title || "Untitled") + '” is ' + (st === "empty" ? "still empty" : "part written"),
        fix: () => { showRail("build"); jumpToSection(s); }
      });
    }
  });

  deck.sections.forEach(s => (s.blocks || []).forEach(b => {
    if (b.seed && VISUAL_TYPES.includes(b.type)){
      issues.push({t:"A " + b.type + " still holds sample numbers", fix:() => selectBlock(b.id, true)});
    }
  }));

  deck.sections.forEach(s => {
    const n = gapCount(s.blocks);
    if (n) issues.push({t:'“' + (s.title || "Untitled") + '” still has ' + n + " note" + (n === 1 ? "" : "s") +
      " for the advisor ([NEEDS ADVISOR INPUT] / [SOURCE CONFLICT])",
      fix: () => { showRail("build"); jumpToSection(s); }});
  });

  const eq = householdEquityCheck(deck);
  if (eq && !eq.inRange){
    const sum = deck.sections.find(s => s.recommendationOverview);
    issues.push({t:"Combined equity (" + eq.equity + "%) is outside the " + deck.household.investorProfile +
      " range of " + eq.min + "%–" + eq.max + "%", fix:() => { const b = sum && sum.blocks[0]; if (b) selectBlock(b.id, true); }});
  }

  layoutProblems().forEach(c => issues.push({
    t:"Something runs off the bottom of page " + c.page + " and would be cut off in the PDF",
    fix:() => c.node.scrollIntoView({block:"start", behavior:"smooth"})}));

  if (!deck.options.disclosures){
    issues.push({t:"The standard disclosures are switched off", fix:() => showRail("style")});
  } else if (JSON.stringify(deck.disclosures) !== JSON.stringify(BRAND.disclosures)){
    issues.push({t:"The disclosures have been changed from the standard wording — compliance needs to see that",
      fix:() => showRail("style")});
  }
  if (!deck.options.draft && deck.meta.reviewedHash && deck.meta.reviewedHash !== contentHash()){
    issues.push({t:"The piece has changed since the DRAFT tag came off — put it back on until it is checked again",
      fix:() => setDraft(true)});
  }

  const noCaption = [];
  deck.sections.forEach(s => (s.blocks || []).forEach(b => {
    if (b.type === "chart" && !(b.caption || "").trim()) noCaption.push(b);
  }));
  noCaption.forEach(b => issues.push({
    t:"A chart has no caption — projections should say they are illustrative",
    fix:() => selectBlock(b.id, true)}));

  return issues;
}

/** A short fingerprint of what the client will read (not layout settings). */
function contentHash(){
  const m = deck.meta;
  const t = JSON.stringify([m.title, m.subtitle, m.client, m.advisor, m.date, m.kicker,
    deck.sections.map(s => [s.title, s.kicker, s.summary, (s.blocks || []).map(b => Object.assign({}, b, {id:0}))]),
    deck.team, deck.contact, deck.disclosures, deck.options.disclosures]);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
/** The DRAFT tag on or off — the one way in, from the guide or from Setup.
    Taking it off remembers exactly what was approved, so a later edit is caught. */
function setDraft(on){
  deck.options.draft = !!on;
  deck.meta.reviewedHash = on ? "" : contentHash();
  render(); syncPanels();
}
