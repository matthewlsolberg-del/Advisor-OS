/* ==========================================================================
   views.js — other ways to show the same document, and where figures came from.

   1. ONE-PAGE LEAVE-BEHIND (viewMode "leave"): the key numbers, what we
      recommend and what happens next on a single page, with the standard
      disclosures in small type at the foot. Made from the document, never
      typed separately, so it always agrees with it.
   2. PRIVATE PREP SHEET (viewMode "prep"): talking points, questions to ask
      (the blanks still open), what to watch for and your notes. Every page
      says INTERNAL — it is for you, never for the client.
   3. "WHERE DID THIS NUMBER COME FROM?" Blocks built from a report carry
      `from` ("portfolio" or "plan"). Their settings panel lists each figure
      with the line of the report it was read from (sourceLinesFor).

   Both views are drawn by the same layout engine as the document (render.js),
   from a throw-away copy (viewDeck). The canvas bar's "Show" list and the
   Finish tab switch between them; nothing in the document changes.
   ========================================================================== */

/** Switch what the canvas shows: "doc", "leave" or "prep". */
function setView(mode){
  viewMode = mode || "doc";
  if ($("viewPick")) $("viewPick").value = viewMode;
  $("viewBanner").hidden = viewMode === "doc";
  $("viewBannerText").textContent = viewMode === "leave"
    ? "One-page summary to leave behind: made from the document. Change the document, and this follows."
    : "Your prep sheet: internal, for you only. It never goes in the client's document.";
  clearSelection();
  zoom = 0;
  render();
}
/** What the canvas and the PDF show right now. */
function shownDeck(){ return viewMode === "doc" ? deck : viewDeck(); }
function viewDeck(){ return viewMode === "leave" ? leaveBehindDeck() : prepSheetDeck(); }

/* A deck-shaped copy with no cover, contents or closing pages. */
function bareDeck(sections, extra){
  return Object.assign({
    meta: Object.assign({}, deck.meta),
    cover: deck.cover,
    design: Object.assign({}, deck.design, {format: "report"}),
    options: {toc: false, dividers: false, sectionBreak: false, team: false, disclosures: false, specialists: false,
      draft: deck.options.draft, confidential: deck.options.confidential, pageNumbers: true, watermark: false, runningHead: false},
    noCover: true,
    sections,
    team: deck.team, contact: deck.contact, disclosures: deck.disclosures
  }, extra || {});
}
const vb = (type, props) => Object.assign(newBlock(type), {id: "v-" + uid()}, props);
/** The first block of a type in sections whose title matches. */
function findIn(re, type){
  for (const s of deck.sections){
    if (s.accountRecommendation || !re.test(s.title || "")) continue;
    const b = (s.blocks || []).find(x => x.type === type && (x.items || []).length);
    if (b) return b;
  }
  return null;
}

/* ── 1. The one-page leave-behind ────────────────────────────────────────── */

function leaveBehindDeck(){
  const blocks = [vb("lbHead", {})];
  const stats = deck.sections.flatMap(s => s.accountRecommendation ? [] : s.blocks || []).find(b => b.type === "stats" && !b.seed);
  if (stats) blocks.push(Object.assign(structuredClone(stats), {id: "v-" + uid()}));

  const heard = findIn(/heard|matters most|goals/i, "bullets");
  if (heard){
    blocks.push(vb("heading", {level: 3, text: "What we heard", kicker: ""}));
    blocks.push(vb("bullets", {style: "bullet", items: heard.items.slice(0, 4)}));
  }
  const recActions = findIn(/recommend/i, "actions"), recBullets = findIn(/recommend/i, "bullets");
  const recs = recActions ? recActions.items.map(x => x.t + (x.d ? ": " + String(x.d).split(/(?<=[.!?])\s/)[0] : ""))
             : recBullets ? recBullets.items : [];
  const accounts = deck.sections.filter(s => s.accountRecommendation);
  if (recs.length || accounts.length){
    blocks.push(vb("heading", {level: 3, text: "What we recommend", kicker: ""}));
    const items = recs.slice(0, 5);
    accounts.slice(0, 6).forEach(s => {
      const r = (s.blocks || []).find(b => b.type === "recommendation"), p = r && recProfile(r);
      items.push("**" + (s.accountName || "Account") + "**" + (s.accountAmount ? " (" + s.accountAmount + ")" : "") + ": " + (p ? preferredPortfolioTitle(p) : "[[portfolio]]"));
    });
    blocks.push(vb("bullets", {style: "number", items}));
  }
  const next = findIn(/next|do next/i, "actions");
  if (next){
    blocks.push(vb("heading", {level: 3, text: "What happens next", kicker: ""}));
    blocks.push(vb("bullets", {style: "check", items: next.items.slice(0, 5).map(x => x.t + ([x.who, x.when].filter(Boolean).length ? " — " + [x.who, x.when].filter(Boolean).join(", ") : ""))}));
  }
  blocks.push(vb("lbFoot", {}));
  return bareDeck([{id: "v-leave", title: "Summary", noHeading: true, blocks}],
    {design: Object.assign({}, deck.design, {format: "report", density: "compact"})});
}

BLOCK_RENDERERS.lbHead = (b, wrap) => {
  const d = layoutDeck || deck;
  const box = el("div", "lb-head");
  box.appendChild(brandPair());
  box.appendChild(el("div", "lb-kick", "Meeting summary" + (d.meta.kicker ? " &middot; " + esc(d.meta.kicker) : "")));
  box.appendChild(el("h1", "lb-title", esc(d.meta.title || "")));
  const who = preparedBy(d);
  box.appendChild(el("div", "lb-meta", [d.meta.client ? "Prepared for <b>" + esc(d.meta.client) + "</b>" : "",
    d.meta.date ? esc(prettyDate(d.meta.date)) : "", who ? "Prepared by " + esc(who.name) : ""].filter(Boolean).join(" &middot; ")));
  wrap.appendChild(box);
};
BLOCK_RENDERERS.lbFoot = (b, wrap) => {
  const d = layoutDeck || deck;
  const box = el("div", "lb-foot");
  box.appendChild(el("div", "lb-contact", esc(d.contact.firm || BRAND.firm) + " &middot; " + esc(BRAND.subbrand) + " &middot; " +
    [esc(d.contact.address), esc(d.contact.phone), esc(d.contact.web)].filter(Boolean).join(" &middot; ")));
  /* the standard disclosures always print, in small type */
  box.appendChild(el("div", "lb-disc-h", "Important disclosures"));
  (d.disclosures || []).forEach(t => box.appendChild(el("p", "lb-disc", esc(t))));
  wrap.appendChild(box);
};

/* ── 2. The private prep sheet ───────────────────────────────────────────── */

function prepSheetDeck(){
  const f = deck.facts || {}, P = f.portfolio, F = f.plan;
  const kind = (SMART_KINDS.find(k => k.kind === deck.meta.kind) || {}).name || "Document";
  const S = [];
  const plain = (t) => richToPlain(t).replace(/\[\[([^\]]+)\]\]/g, "($1)");

  S.push({id: "v-p1", title: "Before the meeting", blocks: [vb("facts", {items: [
    {k: "Client", v: deck.meta.client || "(not named yet)"},
    {k: "Document", v: kind + (deck.meta.date ? ", " + prettyDate(deck.meta.date) : "")},
    P && {k: "Portfolio report", v: (P.file || "read") + (P.asOf ? ", as at " + P.asOf : "")},
    f.portfolioPrev && {k: "Earlier report", v: (f.portfolioPrev.file || "read") + (f.portfolioPrev.asOf ? ", as at " + f.portfolioPrev.asOf : "")},
    F && {k: "Financial plan", v: (F.file || "read") + (F.date ? ", " + F.date : "")},
    deck.profile && {k: "Investor profile", v: deck.profile}].filter(Boolean)})]});

  const digest = factsDigest(f).split("\n").filter(x => x.trim());
  if (digest.length) S.push({id: "v-p2", title: "Key figures", blocks: [vb("bullets", {style: "bullet",
    items: digest.slice(0, 22).map(x => x.replace(/^-\s*/, ""))})]});

  const points = [];
  deck.sections.forEach(s => {
    if (s.accountRecommendation || s.recommendationOverview) return;
    const b = (s.blocks || []).find(x => ["lead", "paragraph", "callout"].includes(x.type) && hasWords(x.text));
    const t = b ? plain(b.text) : "";
    points.push("**" + (s.title || "Untitled") + ":** " + (t.length > 170 ? t.slice(0, 167).replace(/\s+\S*$/, "") + " …" : t || "(nothing written yet)"));
  });
  if (points.length) S.push({id: "v-p3", title: "Talking points, in order", blocks: [vb("bullets", {style: "number", items: points})]});

  const seen = new Set(), asks = [];
  collectBlanks().forEach(it => {
    const k = it.label.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    asks.push(it.label + (it.context ? " (" + it.context + ")" : "") + " — " + it.section);
  });
  if (asks.length) S.push({id: "v-p4", title: "Questions to ask (still blank in the document)", blocks: [vb("bullets", {style: "check", items: asks.slice(0, 24)})]});

  const watch = [];
  (P && P.warnings || []).concat(F && F.warnings || []).forEach(w => watch.push(w));
  if (P) portfolioSuggestions(P).forEach(x => watch.push("**" + x.t + ":** " + plain(x.d)));
  if (F) planSuggestions(F).slice(0, 4).forEach(x => watch.push("**" + x.t + ":** " + plain(x.d)));
  const chk = toCheckIds().length;
  if (chk) watch.push(chk + " passage" + (chk === 1 ? "" : "s") + " Copilot wrote still to read over.");
  if (watch.length) S.push({id: "v-p5", title: "Things to watch for", blocks: [vb("bullets", {style: "bullet", items: watch.slice(0, 14)})]});

  if (String(deck.notes || "").trim()) S.push({id: "v-p6", title: "Your notes", blocks:
    String(deck.notes).trim().slice(0, 3000).split(/\n\s*\n/).map(p => vb("paragraph", {text: p.replace(/\s*\n\s*/g, " ")}))});

  return bareDeck(S, {internal: true,
    meta: Object.assign({}, deck.meta, {title: "Prep sheet: " + (deck.meta.client || deck.meta.title || "")}),
    options: {toc: false, dividers: false, sectionBreak: false, team: false, disclosures: false, specialists: false,
      draft: false, confidential: true, pageNumbers: true, watermark: false, runningHead: true}});
}

/* ── 3. Where did this number come from? ─────────────────────────────────── */

/** The figures in a block ($ amounts and percentages), each with the report
    lines that show the same number: [{fig, hits: [{p, t}]}] */
function sourceLinesFor(b){
  const facts = (deck.facts || {})[b.from];
  if (!facts) return null;
  const lines = facts.sourceLines || [];
  const text = JSON.stringify(Object.assign({}, b, {source: "", caption: "", id: ""}));
  const figs = [...new Set(text.match(/-?\$[\d,]+(?:\.\d+)?|-?\d+(?:\.\d+)?%/g) || [])].slice(0, 14);
  return figs.map(fig => {
    const core = fig.replace(/[$%-]/g, "");
    /* "$638,535" is "638,535" or "638,535.12" in the report; "16.37%" is "16.37" */
    const re = new RegExp("(^|[^\\d.,])" + core.replace(/[.,]/g, m => "\\" + m) + (fig.includes("%") ? "(?!\\d)" : "(?![\\d,])(\\.\\d+)?(?!\\d)"));
    return {fig, hits: lines.filter(l => re.test(l.t)).slice(0, 2)};
  });
}
/** The "Where these figures came from" box in the block's settings panel. */
function provenanceBox(b){
  const facts = (deck.facts || {})[b.from];
  if (!facts) return null;
  const box = el("div", "prov");
  const what = b.from === "plan" ? "the financial plan" : "the portfolio report";
  box.appendChild(el("div", "prov-h", "Where these figures came from"));
  box.appendChild(el("p", "insp-note", "Read from " + what + (facts.file ? " <b>" + esc(facts.file) + "</b>" : "") +
    (facts.asOf ? ", as at " + esc(facts.asOf) : facts.date ? ", " + esc(facts.date) : "") + ", on this computer."));
  const found = sourceLinesFor(b) || [];
  if (!(facts.sourceLines || []).length){
    box.appendChild(el("p", "insp-note", "Drop the report in again to see the line each figure came from."));
    return box;
  }
  found.forEach(x => {
    const row = el("div", "prov-row");
    row.appendChild(el("b", "", esc(x.fig)));
    row.appendChild(el("span", "", x.hits.length ? x.hits.map(h => "page " + h.p + ": " + esc(h.t.length > 110 ? h.t.slice(0, 107) + "…" : h.t)).join("<br>")
      : "<i>worked out from the report (a total, a share or a rounding), not printed in it</i>"));
    box.appendChild(row);
  });
  return box;
}
/** Kept with the facts when a report is read, so the source of each figure can be shown. */
function compactLines(doc){
  return (doc.lines || []).filter(l => /\d/.test(l.text)).slice(0, 4000).map(l => ({p: l.page + 1, t: l.text.replace(/\s{2,}/g, "  ").slice(0, 220)}));
}
