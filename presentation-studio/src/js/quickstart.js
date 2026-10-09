/* ═══════════════════════════════════════════════════════════════════════════
   quickstart.js — the front door, the blanks, and Copilot in two steps
   ───────────────────────────────────────────────────────────────────────────
   1. THE FRONT DOOR (showWelcome). Three things on one screen: what are you
      making, drop in what you have (Croesus report, financial plan,
      screenshots, Word notes), and your notes — typed, pasted or dictated.
      "Build my document" lays out a document already written in MHWG's words
      with the client's figures in it and [[blanks]] where you have something
      to say.

   2. THE BLANKS. "Next blank" (top of the page area) walks through every
      [[blank]] and selects it, so you just type.

   3. COPILOT IN TWO STEPS. "Copy for Copilot" puts one prompt on the
      clipboard: your notes, the figures read from the files, and a numbered
      list of the blanks. Copilot answers with a numbered list; "Put it in"
      drops each answer into its blank. Copilot never re-types the figures,
      so it cannot change them. With no blanks left (or a template with
      sample text), it falls back to the whole-document prompt.

   Also here: dropping a Croesus report or plan onto an open document adds or
   refreshes its pages (importPdfFile).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 1. Reading a dropped file ─────────────────────────────────────────── */

/** Work out what a file is and read it. Never throws: problems come back in `warnings`. */
async function readSourceFile(f){
  const name = f.name || "file";
  const lower = name.toLowerCase();
  const out = {name, kind: "unknown", summary: "", warnings: []};
  try {
    if (lower.endsWith(".pdf")){
      let pdf = null;
      try { pdf = await readPdf(f); } catch (e) { out.warnings.push("The PDF reader stopped: " + e.message); }
      if (pdf && looksLikeCroesus(pdf)){
        out.kind = "croesus"; out.data = readCroesus(pdf);
        out.summary = "Croesus portfolio report: " + out.data.found.join(", ");
        out.warnings.push(...out.data.warnings, ...out.data.missing.map(m => "Not found in this report: " + m + "."));
      } else if (pdf && looksLikePlan(pdf)){
        out.kind = "plan"; out.data = readPlan(pdf);
        out.summary = "Financial plan: " + out.data.found.join(", ");
        out.warnings.push(...out.data.warnings, ...out.data.missing.map(m => "Not found in this plan: " + m + "."));
      } else {
        let text = pdf ? pdf.text : "";
        if (!text.trim()) { try { text = await readPdfText(f); } catch (e) { text = ""; } }
        if (pdf) out.warnings.push(...pdf.warnings);
        out.kind = "text"; out.text = text;
        out.summary = text.trim() ? "PDF text — added to your notes for Copilot" : "No text in this PDF (a scan?) — attach it to Copilot instead";
      }
    } else if (/\.(png|jpe?g|gif|webp)$/.test(lower)){
      out.kind = "image"; out.src = await readImage(f);
      out.summary = "Picture — goes on a \"Supporting detail\" page; attach it to Copilot too if it has numbers";
    } else if (lower.endsWith(".docx")){
      const blocks = await readDocx(f);
      out.kind = "text"; out.text = blocks.map(b => b.type === "image" ? "" : blockToText(b)).filter(Boolean).join("\n");
      out.summary = "Word document — its text is added to your notes";
    } else if (/\.(txt|md|csv)$/.test(lower)){
      out.kind = "text"; out.text = await readTextFile(f);
      out.summary = "Text — added to your notes";
    } else if (lower.endsWith(".json")){
      out.kind = "json"; out.text = await readTextFile(f);
      out.summary = "A saved file or JSON — use Open (top bar) for this";
    } else {
      out.summary = "Not a file this program reads — attach it to Copilot instead";
    }
  } catch (e) {
    out.warnings.push("Could not read " + name + ": " + (e && e.message ? e.message : e));
  }
  return out;
}

/* ── 2. The front door ─────────────────────────────────────────────────── */

/** The welcome screen (also "New"). isNew: start from scratch rather than adjust the current piece. */
function showWelcome(isNew){
  const st = {kind: isNew ? "portfolio_review" : (deck.meta.kind || "portfolio_review"), picked: !isNew, files: []};
  showModal(isNew ? "New client document" : "Start a client document", `
    <div class="welcome qs">
      <p class="lede">Pick what you are making, drop in what you have, add your notes. You get a finished
        draft with the client's figures in it and yellow <mark class="blank">[[blanks]]</mark> for the rest.
        Nothing leaves this computer.</p>
      <h3><i class="qs-n">1</i> What are you making?</h3>
      <div class="piece-grid wide" id="wcKinds"></div>
      <h3><i class="qs-n">2</i> Drop in what you have <em>optional</em></h3>
      <div class="dropzone qs-drop" id="qsDrop" tabindex="0">
        <strong>Drop the Croesus report, financial plan, screenshots or notes here</strong>
        <span>or <a href="#" id="qsBrowse">choose files</a> &middot; PDF &middot; Word &middot; pictures &middot; text</span>
      </div>
      <ul class="qs-files" id="qsFiles"></ul>
      <h3><i class="qs-n">3</i> Your notes <em>optional</em></h3>
      <textarea id="qsNotes" rows="5" placeholder="What did you talk about? What matters to them? What are you recommending?&#10;Type, paste, or talk: on Windows press the Windows key + H to dictate."></textarea>
      <label class="field"><span>Prepared for</span><input id="wcClient" placeholder="Filled in from the files, or type it (e.g. Robert &amp; Anne Kowalchuk)"></label>
      <div class="qs-go">
        <span class="hint">${isNew ? "Unsaved changes to the current piece are replaced — Cancel and Save first if you need them." :
          "Already started? <a href='#' id='wcOpen'>Open a saved file</a> or just close this."}</span>
        <button class="btn btn-primary btn-big" id="qsBuild">Build my document &rarr;</button>
      </div>
    </div>`, {wide: true});

  const drawKinds = () => {
    $("wcKinds").innerHTML = "";
    PIECE_CARDS.forEach(c => {
      const b = el("button", "piece-card" + (c.kind === st.kind ? " is-on" : ""), "<b>" + esc(c.name) + "</b><span>" + esc(c.note) + "</span>");
      b.dataset.kind = c.kind;
      b.onclick = () => { st.kind = c.kind; st.picked = true; drawKinds(); };
      $("wcKinds").appendChild(b);
    });
  };
  const drawFiles = () => {
    const ul = $("qsFiles");
    ul.innerHTML = "";
    st.files.forEach((f, i) => {
      const icon = {croesus: "&#10003;", plan: "&#10003;", image: "&#128444;", text: "&#128196;"}[f.kind] || "&#9888;";
      const li = el("li", "qs-file is-" + f.kind, `<span class="qs-icon">${icon}</span><span><b>${esc(f.name)}</b><small>${esc(f.summary)}</small>` +
        (f.warnings.length ? `<small class="qs-warn">${f.warnings.map(esc).join("<br>")}</small>` : "") + "</span>");
      const x = el("button", "o-del", "&#10005;");
      x.title = "Leave this file out";
      x.onclick = () => { st.files.splice(i, 1); drawFiles(); };
      li.appendChild(x);
      ul.appendChild(li);
    });
  };
  const addFiles = async (list) => {
    for (const f of Array.from(list)){
      const li = el("li", "qs-file is-reading", `<span class="qs-icon">&#8230;</span><span><b>${esc(f.name)}</b><small>Reading&hellip;</small></span>`);
      $("qsFiles").appendChild(li);
      st.files.push(await readSourceFile(f));
    }
    /* suggest the kind from what came in, unless one was chosen on purpose */
    const has = (k) => st.files.some(f => f.kind === k);
    if (!st.picked){
      if (has("croesus") && has("plan")) st.kind = "annual_review";
      else if (has("plan")) st.kind = "plan_summary";
      else if (has("croesus")) st.kind = "portfolio_review";
      drawKinds();
    }
    const who = sourcesClient(st.files);
    if (who && !$("wcClient").value.trim()) $("wcClient").value = who;
    drawFiles();
  };

  drawKinds();
  if (!isNew){ $("wcClient").value = deck.meta.client || ""; $("qsNotes").value = (deck.sources || {}).notes || ""; }
  const drop = $("qsDrop");
  drop.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.add("is-over"); };
  drop.ondragleave = () => drop.classList.remove("is-over");
  drop.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove("is-over"); addFiles(e.dataTransfer.files); };
  const browse = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.accept = ".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp";
    inp.onchange = () => addFiles(inp.files);
    inp.click();
  };
  $("qsBrowse").onclick = (e) => { e.preventDefault(); browse(); };
  drop.onclick = (e) => { if (e.target === drop || e.target.tagName === "STRONG") browse(); };
  if ($("wcOpen")) $("wcOpen").onclick = (e) => { e.preventDefault(); $("btnOpen").click(); };
  $("qsBuild").onclick = () => {
    if (!isNew && !deckIsStarter() && !confirm("Replace the current document with a new one built from this?")) return;
    try { localStorage.setItem(WELCOMED_KEY, "1"); } catch (e){}
    buildFromQuickStart(st, $("wcClient").value.trim(), $("qsNotes").value, isNew);
  };
  /* tests and scripts can hand files straight to the front door */
  showWelcome.addFiles = addFiles;
}

/** "Matt & Kelsey Solberg" from whichever report has the names. */
function sourcesClient(files){
  const src = {croesus: (files.find(f => f.kind === "croesus") || {}).data || null,
               plan: (files.find(f => f.kind === "plan") || {}).data || null};
  return (src.croesus || src.plan) ? clientNameFrom(src) : "";
}

/** Lay the new document out from the front door's choices. */
function buildFromQuickStart(st, client, notes, isNew){
  snapshot();
  const old = deck;
  const d = newDeck(st.kind);
  if (!isNew && old){ d.team = old.team; d.contact = old.contact; d.design = old.design; d.cover = old.cover; }
  const src = {croesus: (st.files.find(f => f.kind === "croesus") || {}).data || null,
               plan: (st.files.find(f => f.kind === "plan") || {}).data || null};
  const doc = buildDocument(st.kind, src);
  if (doc){
    d.sections = doc.sections;
    Object.keys(doc.meta).forEach(k => { if (doc.meta[k]) d.meta[k] = doc.meta[k]; });
  }
  if (client){
    d.meta.client = client;
    d.meta.title = titleIdeas(st.kind, client)[0] || d.meta.title;
  }
  /* pictures go on a page of their own, to be moved where they belong */
  const pics = st.files.filter(f => f.kind === "image");
  if (pics.length){
    d.sections.push({id: uid(), title: "Supporting detail", auto: "", blocks: pics.map(p =>
      Object.assign(newBlock("image"), {src: p.src, caption: "[[What this shows]]"}))});
  }
  /* everything with words in it feeds Copilot */
  const extra = st.files.filter(f => f.kind === "text" && (f.text || "").trim())
    .map(f => "From " + f.name + ":\n" + f.text.trim()).join("\n\n");
  d.sources = Object.assign({}, d.sources, {
    notes: [String(notes || "").trim(), extra].filter(Boolean).join("\n\n"),
    croesus: src.croesus, plan: src.plan,
    files: st.files.map(f => ({name: f.name, kind: f.kind, summary: f.summary}))
  });
  deck = d;
  redoStack = [];
  selectedId = null; currentSectionId = null; openSectionId = null;
  hideModal();
  syncPanels();
  if (isNew) markClean("not saved yet");
  render(); autosave();
  showRail("build");
  showDraftReady(doc);
}

/** What to do next, right after the draft is built. */
function showDraftReady(doc){
  const n = collectBlanks(deck).length;
  const files = (deck.sources.files || []).filter(f => f.kind === "croesus" || f.kind === "plan");
  showModal("Your draft is ready", `
    <p>${files.length ? "The figures come straight from " + files.map(f => "<b>" + esc(f.name) + "</b>").join(" and ") + "." :
      "No report was dropped in, so the pages hold the standard wording and sample text to type over."}
      ${n ? `There ${n === 1 ? "is <b>1 blank</b>" : "are <b>" + n + " blanks</b>"} left — they're highlighted yellow.` : ""}</p>
    <div class="route-grid two">
      <button class="route-btn big" id="drSelf"><i>&#9998;</i><b>I'll fill them in</b>
        <span>Press <b>Next blank</b> at the top of the page; it selects each one so you just type.</span></button>
      <button class="route-btn big" id="drCopilot"><i>&#10022;</i><b>Copilot fills them in</b>
        <span>Two steps: copy one prompt to Copilot, paste its answer back. Your figures are never re-typed.</span></button>
    </div>`, {wide: true});
  $("drSelf").onclick = () => { hideModal(); goNextBlank(); };
  $("drCopilot").onclick = () => { hideModal(); showRail("copilot"); $("qcCard").scrollIntoView({block: "start"}); };
}

/* ── 3. Blanks ─────────────────────────────────────────────────────────── */

const BLANK_RE = /\[\[[^\]]{0,200}\]\]/g;
/* fields that are never words on the page */
const NOT_TEXT_KEYS = new Set(["id", "type", "src", "seed", "chart", "unit", "size", "frame", "tone", "style",
  "cols", "level", "graphic", "num", "series", "labels", "portfolioId", "profile"]);

/** Every [[blank]] in the document, in reading order: {n, section, blockId, path, blank, line}. */
function collectBlanks(d){
  const out = [];
  (d.sections || []).forEach(sec => (sec.blocks || []).forEach(b => {
    const walk = (v, path) => {
      if (typeof v === "string"){
        (v.match(BLANK_RE) || []).forEach(blank => out.push({n: out.length + 1, section: sec.title || "", blockId: b.id,
          path: path.slice(), blank, line: richToPlain(v)}));
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path.concat(i)));
      else if (v && typeof v === "object") Object.keys(v).forEach(k => { if (!NOT_TEXT_KEYS.has(k)) walk(v[k], path.concat(k)); });
    };
    walk(b, []);
  }));
  return out;
}

/** Put `text` in place of the first `blank` in the field at `path` of block `blockId`. */
function fillBlank(d, item, text){
  let found = null;
  d.sections.forEach(s => (s.blocks || []).forEach(b => { if (b.id === item.blockId) found = b; }));
  if (!found) return false;
  let host = found;
  for (let i = 0; i < item.path.length - 1; i++){ host = host && host[item.path[i]]; }
  const key = item.path[item.path.length - 1];
  if (!host || typeof host[key] !== "string" || !host[key].includes(item.blank)) return false;
  host[key] = host[key].replace(item.blank, () => text);
  delete found.seed;
  return true;
}

/* "Next blank": select each [[blank]] on the page in turn so the advisor just types. */
let lastBlank = null;      /* {bid, i} of the blank shown last */
function goNextBlank(){
  const marks = $$("#pages mark.blank, #pages mark.needs");
  if (!marks.length){ toast("No blanks left — every [[blank]] is filled in."); return; }
  const hits = $$("#pages .blk-hit").map(h => h.dataset.bid);
  const where = marks.map(m => {
    const hit = m.closest(".blk-hit");
    const bid = hit ? hit.dataset.bid : "";
    return {m, bid, order: hits.indexOf(bid), i: hit ? $$("mark.blank, mark.needs", hit).indexOf(m) : 0};
  });
  let k = 0;
  if (lastBlank){
    const same = where.findIndex(w => w.bid === lastBlank.bid && w.i === lastBlank.i);
    /* still there (skipped): go past it; filled: the next one from the same place */
    k = same >= 0 ? (same + 1) % where.length
      : Math.max(0, where.findIndex(w => w.order > lastBlank.order || (w.bid === lastBlank.bid && w.i >= lastBlank.i)));
  }
  const w = where[k];
  lastBlank = {bid: w.bid, i: w.i, order: w.order};
  marks.forEach(x => x.classList.remove("is-current"));
  w.m.classList.add("is-current");
  w.m.scrollIntoView({block: "center", behavior: "smooth"});
  const ed = w.m.closest('[contenteditable="true"]');
  if (ed){
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(w.m);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  } else if (w.bid && !w.bid.startsWith("sec-")) selectBlock(w.bid, false);
}
/** The count on the "Next blank" button above the pages. */
function updateBlankButton(){
  const btn = $("btnNextBlank");
  if (!btn) return;
  const n = gapCount(deck.sections.map(s => s.blocks));
  btn.hidden = !n;
  btn.innerHTML = n + (n === 1 ? " blank" : " blanks") + " &middot; <b>Next &rarr;</b>";
}

/* ── 4. Copilot in two steps ───────────────────────────────────────────── */

/** The figures read from the files, written out for Copilot. */
function sourcesFactSheet(src){
  const lines = [];
  const r = src && src.croesus, p = src && src.plan;
  if (r){
    lines.push("PORTFOLIO (Croesus report" + (r.asOf ? ", as of " + r.asOf : "") + ")");
    if (r.totalValue != null) lines.push("- Total value: " + fmtMoney(r.totalValue, 2));
    if (r.netInvested != null) lines.push("- Net invested (deposits less withdrawals): " + fmtMoney(r.netInvested, 2));
    r.accounts.forEach(a => lines.push("- Account " + a.label + " (" + a.number + ", " + (a.typeText || a.type) + "): " + fmtMoney(a.value, 2)));
    if (r.periods.length) lines.push("- Returns (money-weighted, net of fees; over 1 year annualized): " + r.periods.map(x => x.label + " " + fmtPct(x.value)).join("; "));
    if (r.years.length) lines.push("- Calendar-year returns: " + r.years.map(y => y.year + " " + fmtPct(y.value)).join("; "));
    if (r.classes.length) lines.push("- Asset classes: " + r.classes.map(c => c.name + " " + (c.pct != null ? c.pct + "%" : "")).join("; "));
    const top = r.holdings.filter(h => h.marketValue).sort((a, b) => b.marketValue - a.marketValue).slice(0, 8);
    if (top.length) lines.push("- Largest holdings: " + top.map(h => h.description + " " + fmtMoney(h.marketValue, 2)).join("; "));
    if (r.totals.income != null) lines.push("- Projected annual income: " + fmtMoney(r.totals.income, 2) + (r.totals.yield != null ? ", yield " + r.totals.yield + "%" : ""));
  }
  if (p){
    if (lines.length) lines.push("");
    lines.push("FINANCIAL PLAN" + (p.planName ? " (" + p.planName + (p.date ? ", " + p.date : "") + ")" : ""));
    p.people.forEach(x => lines.push("- " + x.name + ": age " + (x.age || "?") + (x.retireAge ? ", retiring at " + x.retireAge + (x.retireYear ? " (" + x.retireYear + ")" : "") : "")));
    if (p.children.length) lines.push("- Children: " + p.children.map(c => c.name + " (" + c.age + ")").join(", "));
    if (p.netWorth != null) lines.push("- Net worth " + fmtMoney(p.netWorth) + "; assets " + fmtMoney(p.assets) + "; liabilities " + fmtMoney(p.liabilities));
    p.goals.forEach(g => lines.push("- Goal: " + g.name + (g.amount != null ? " " + fmtMoney(g.amount) + "/yr" : "") + ", fully funded in " + g.met + " of " + g.of + " years"));
    const I = p.insights;
    if (I.savingsNeed != null) lines.push("- To fix the shortfall: save " + fmtMoney(I.savingsNeed) + " more a year" + (I.lumpSum != null ? ", or a lump sum of " + fmtMoney(I.lumpSum) + " in " + I.lumpSumYear : "") + (I.requiredReturn != null ? ", or earn " + I.requiredReturn + "% a year" : ""));
    if (I.affordableSpending != null) lines.push("- Affordable retirement spending today: " + fmtMoney(I.affordableSpending) + " a year");
    I.insurance.forEach(x => lines.push("- If " + x.person + " died today, " + fmtMoney(x.amount) + " more would be needed"));
    p.education.forEach(e => lines.push("- Education, " + e.child + ": " + fmtMoney(e.totalSpend) + " total, " + fmtMoney(e.fromRESP) + " from the RESP, shortfall " + fmtMoney(e.shortfall)));
    if (p.assumptions.length) lines.push("- Assumptions: " + p.assumptions.map(a => a.name + " " + a.value).join("; "));
  }
  return lines.join("\n");
}

/** Step 1's prompt: fill the numbered blanks, or (with none) write the whole document. */
function copilotPrompt(){
  const blanks = collectBlanks(deck);
  const src = deck.sources || {};
  const notes = (src.notes || "").trim();
  const facts = sourcesFactSheet(src);
  if (!blanks.length) {
    return wholeTextPrompt().replace("[paste your notes here, or attach the plan, meeting notes and statements]",
      (notes || "[paste your notes here, or attach the plan, meeting notes and statements]") + (facts ? "\n\nFIGURES FROM THE CLIENT'S REPORTS (use exactly):\n" + facts : ""));
  }
  deck.sources = deck.sources || {};
  deck.sources.copilotBlanks = blanks.map(b => ({n: b.n, blockId: b.blockId, path: b.path, blank: b.blank}));
  const list = blanks.map(b => b.n + '. In "' + b.section + '": ' + b.line.slice(0, 320)).join("\n");
  return `I'm an investment advisor at Medicine Hat Wealth Group (TD Wealth Private Investment Advice) finishing a client document${deck.meta.client ? " for " + deck.meta.client : ""}. Please write the missing pieces marked [[ ]] below.

HOW TO ANSWER
- Reply with a numbered list only — one answer per number, the same numbers as below, nothing before or after it.
- Each answer replaces just the [[ ]] part of its line. Don't repeat the rest of the line.
- Use only my notes, the figures below and anything I've attached. Never invent a figure, name, date or fact. If you don't have what a blank needs, answer exactly: [NEEDS ADVISOR INPUT: what is missing]
- Plain, warm, professional Canadian English, written to the client ("you"). Short sentences. No guarantees, no predictions, no product hype.
- Keep each answer to what the blank asks for: "a sentence or two" means one or two sentences; a date, name or step is a few words.

MY NOTES
${notes || "[paste or dictate your notes here — what you talked about, what matters to them, what you recommend]"}
${facts ? "\nFIGURES FROM THE CLIENT'S REPORTS (already in the document — use them exactly)\n" + facts + "\n" : ""}
BLANKS TO FILL
${list}`;
}

/** Step 2: read Copilot's numbered answers and drop each into its blank. */
function parseNumberedAnswers(text){
  const out = {};
  let cur = null;
  String(text || "").replace(/\r/g, "").split("\n").forEach(line => {
    const m = /^\s*(?:\*\*)?(\d{1,3})(?:\*\*)?[.):]\s*(?:\*\*)?\s*(.*)$/.exec(line);
    if (m){ cur = +m[1]; out[cur] = m[2]; }
    else if (cur && line.trim()) out[cur] += " " + line.trim();
  });
  Object.keys(out).forEach(k => {
    out[k] = out[k].replace(/^\*\*|\*\*$/g, "").replace(/^["“](.*)["”]$/, "$1").replace(/\[\[|\]\]/g, "").trim();
    if (!out[k]) delete out[k];
  });
  return out;
}
function applyCopilotAnswer(text){
  const list = (deck.sources || {}).copilotBlanks || [];
  const answers = parseNumberedAnswers(text);
  const numbers = Object.keys(answers);
  /* not a numbered list for our blanks: treat it as a whole document (the old way) */
  if (!list.length || !numbers.length || !numbers.some(n => list.some(b => String(b.n) === n))){
    $("pasteBox").value = text;
    smartPaste(text);
    return;
  }
  snapshot();
  let filled = 0, missed = 0, flagged = 0;
  list.forEach(b => {
    const a = answers[b.n];
    if (!a) return;
    if (fillBlank(deck, b, a)){ filled++; if (/NEEDS ADVISOR INPUT/i.test(a)) flagged++; } else missed++;
  });
  deck.sources.copilotBlanks = [];
  syncPanels(); render();
  const left = collectBlanks(deck).length;
  toast(filled + " blank" + (filled === 1 ? "" : "s") + " filled" +
    (flagged ? ", " + flagged + " marked NEEDS ADVISOR INPUT" : "") +
    (missed ? " · " + missed + " had already been changed, so were left alone" : "") +
    (left ? " · " + left + " still to do" : ""), 7000);
  $("qcAnswer").value = "";
  showRail("build");
}

/* ── 5. Dropping a report onto a document that is already open ─────────── */

/** A Croesus report or plan dropped mid-way: offer to add (or refresh) its pages. */
async function importPdfFile(f){
  const s = await readSourceFile(f);
  if (s.kind !== "croesus" && s.kind !== "plan"){
    if (!(s.text || "").trim()){ alert("No text came out of that PDF — it is probably a scan. Drop a screenshot of it in instead, or attach it to Copilot."); return; }
    deck.sources = deck.sources || {};
    deck.sources.notes = [deck.sources.notes, "From " + s.name + ":\n" + s.text.trim()].filter(Boolean).join("\n\n");
    toast("The PDF's text was added to your notes — Copilot will use it.", 5000);
    return;
  }
  const what = s.kind === "croesus" ? "portfolio pages" : "plan pages";
  const already = deck.sections.some(x => x.auto === s.kind);
  showModal(s.kind === "croesus" ? "Croesus report" : "Financial plan", `
    <p><b>${esc(s.name)}</b> — ${esc(s.summary)}</p>
    ${s.warnings.length ? '<p class="hint">' + s.warnings.map(esc).join("<br>") + "</p>" : ""}
    <p>${already ? "Replace the " + what + " already in this document with these figures? Pages you wrote yourself are not touched."
                 : "Add the " + what + " to this document, with these figures?"}</p>
    <div class="modal-actions"><button class="btn btn-ghost" id="ipCancel">Cancel</button>
      <button class="btn btn-primary" id="ipGo">${already ? "Refresh the " + what : "Add the " + what}</button></div>`);
  $("ipCancel").onclick = hideModal;
  $("ipGo").onclick = () => {
    hideModal();
    snapshot();
    deck.sources = deck.sources || {};
    deck.sources[s.kind] = s.data;
    const kind = ["portfolio_review", "plan_summary", "annual_review"].includes(deck.meta.kind) ? deck.meta.kind : "annual_review";
    const doc = buildDocument(kind, {croesus: deck.sources.croesus || null, plan: deck.sources.plan || null});
    const fresh = doc ? doc.sections.filter(x => x.auto === s.kind) : [];
    const at = deck.sections.findIndex(x => x.auto === s.kind);
    deck.sections = deck.sections.filter(x => x.auto !== s.kind);
    /* new pages go where the old ones were, else before the closing sections */
    let pos = at >= 0 ? at : deck.sections.findIndex(x => /^what we (changed|recommend|do next)/i.test(x.title || "") || x.recommendationOverview);
    if (pos < 0) pos = deck.sections.length;
    deck.sections.splice(pos, 0, ...fresh);
    if (!deck.meta.client && doc && doc.meta.client) deck.meta.client = doc.meta.client;
    syncPanels(); render();
    toast(fresh.length + " page" + (fresh.length === 1 ? "" : "s") + (already ? " refreshed" : " added") + " from " + s.name, 5000);
  };
}
