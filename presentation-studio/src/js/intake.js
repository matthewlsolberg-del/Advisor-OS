/* ==========================================================================
   intake.js — the Start tab and the one-button Copilot step.

   Start: pick what you are making, drop in reports and screenshots, add notes.
   A dropped Croesus report or financial plan is read on this computer
   (pdfread.js + facts.js) and the draft lays itself out at once (smart.js).
   Copilot tab: one prompt out, one answer in (slotPrompt / applySlotAnswer).
   ========================================================================== */

/* The deck as it was right after the last automatic build. While nothing has
   been edited since, dropping another report rebuilds the draft straight away. */
let builtPrint = "";
function canAutoBuild(){ return deckIsStarter() || deckPrint() === builtPrint; }
function doBuild(){ buildDraft(); builtPrint = deckPrint(); }

/* ── What are you making ─────────────────────────────────────────────────── */

function buildPieceGrid(){
  const grid = $("pieceGrid");
  grid.innerHTML = "";
  const facts = deck.facts || {};
  SMART_KINDS.forEach(c => {
    const ready = c.uses.length && c.uses.some(u => facts[u]);
    const card = el("button", "piece-card" + (deck.meta.kind === c.kind ? " is-on" : "") + (ready ? " is-ready" : ""),
      "<b>" + esc(c.name) + (ready ? ' <i class="ready-dot" title="Your report is in">●</i>' : "") + "</b><span>" + esc(c.note) + "</span>");
    card.type = "button";
    card.onclick = () => switchPiece(c.kind);
    grid.appendChild(card);
  });
}
function switchPiece(kind){
  if (deck.meta.kind === kind) return;
  const name = (SMART_KINDS.find(c => c.kind === kind) || {}).name || kind;
  if (!canAutoBuild() && !confirm("Switch to " + name + "?\n\nThe draft is laid out again for it. Words you have typed into the pre-written boxes are kept, and Undo brings everything back.")) return;
  deck.meta.kind = kind;
  doBuild();
  toast(name + " — laid out");
}

/* ── Reading what was dropped ───────────────────────────────────────────── */

async function intakePdf(file){
  toast("Reading " + file.name + "…", 8000);
  const doc = await readPdf(file);
  if (!doc.text.trim()){
    $("toast").hidden = true;
    alert("No text came out of " + file.name + " — it is probably a scan.\n\nTake a screenshot of the page you need and drop that in, or use Copilot to read it (Copilot tab → More Copilot tools).");
    return;
  }
  const kind = detectReport(doc);
  if (kind === "croesus") setFacts("portfolio", parseCroesus(doc), file.name);
  else if (kind === "plan") setFacts("plan", parsePlan(doc), file.name);
  else unknownReport(file.name, doc.text);
}

function setFacts(key, facts, fileName){
  const auto = canAutoBuild();
  snapshot();
  deck.facts = deck.facts || {};
  facts.file = fileName || facts.file || "";
  deck.facts[key] = facts;
  if (!deck.meta.client && facts.household) deck.meta.client = facts.household;
  /* if the kind of document does not use this report, pick one that does */
  const k = SMART_KINDS.find(x => x.kind === deck.meta.kind);
  if (!k || !k.uses.some(u => deck.facts[u])) deck.meta.kind = key === "plan" ? "plan_summary" : "portfolio_review";
  if (auto) doBuild(); else { syncPanels(); render(); }
  const what = key === "plan" ? "Financial plan" : "Portfolio report";
  toast(what + " read: " + (facts.found || []).join(", ") + (auto ? ". The draft is laid out." : ". Press Build my draft to use it."), 7000);
}

function unknownReport(name, text){
  showModal("I don't recognize this report", `
    <p><b>${esc(name)}</b> is not a Croesus portfolio report or a financial plan I know how to read.
    Copilot can read it for you:</p>
    <ol class="mini-steps">
      <li>Copy a prompt: <button class="btn btn-mini" id="urPort">It's a portfolio statement</button>
        <button class="btn btn-mini" id="urPlan">It's a financial plan</button></li>
      <li>In Copilot, attach <b>${esc(name)}</b>, paste the prompt, and press Enter.</li>
      <li>Paste Copilot's answer here:<textarea id="urAnswer" rows="6" spellcheck="false" placeholder="Copilot's answer…"></textarea></li>
    </ol>
    <div class="modal-actions"><button class="btn btn-ghost" id="urNotes">Just add its text to my notes</button>
      <button class="btn" id="urCancel">Cancel</button><button class="btn btn-primary" id="urGo">Use it</button></div>`);
  $("urPort").onclick = () => copyText(extractionPrompt("portfolio"), "Prompt copied — attach the report in Copilot and paste this.");
  $("urPlan").onclick = () => copyText(extractionPrompt("plan"), "Prompt copied — attach the plan in Copilot and paste this.");
  $("urCancel").onclick = hideModal;
  $("urNotes").onclick = () => {
    deck.notes = (deck.notes ? deck.notes + "\n\n" : "") + "From " + name + ":\n" + text.slice(0, 20000);
    $("fldNotes").value = deck.notes; markDirty(); hideModal();
    toast("Its text is in your notes — Copilot will use it when it writes.");
  };
  $("urGo").onclick = () => { if (useFactsAnswer($("urAnswer").value, name)) hideModal(); };
}

/** Facts JSON pasted back from Copilot. Returns true when it was used. */
function useFactsAnswer(text, name){
  let v;
  try { v = parseJSONLoose(text); } catch (e){ alert(e.message); return false; }
  if (!v || !/^(portfolio|plan)-facts$/.test(v.kind || "")){
    if (v && (v.accounts || v.holdings)) v.kind = "portfolio-facts";
    else if (v && (v.goals || v.netWorth != null)) v.kind = "plan-facts";
    else { alert("That answer does not look like report facts. Use the prompt from this window."); return false; }
  }
  try { setFacts(v.kind === "plan-facts" ? "plan" : "portfolio", normalizeFacts(v), name || "read by Copilot"); }
  catch (e){ alert(e.message); return false; }
  return true;
}

/* ── The list of what has been read ─────────────────────────────────────── */

function buildSources(){
  const host = $("sourceList");
  host.innerHTML = "";
  const f = deck.facts || {};
  const row = (title, sub, key) => {
    const r = el("div", "source-row", '<i class="ok">✓</i><div><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></div>");
    const x = el("button", "o-del", "✕"); x.type = "button"; x.title = "Forget this report";
    x.onclick = () => { snapshot(); delete deck.facts[key]; syncPanels(); render(); toast("Report removed — press Build my draft to lay the draft out without it."); };
    r.appendChild(x);
    host.appendChild(r);
  };
  if (f.portfolio){
    const P = f.portfolio;
    row("Portfolio report" + (P.file ? " · " + P.file : ""), [P.household, P.total != null ? fm$(P.total) : "", P.asOf ? "as at " + P.asOf : ""].filter(Boolean).join(" · ") +
      "\nFound " + (P.found || []).join(", "), "portfolio");
  }
  if (f.plan){
    const F = f.plan;
    row("Financial plan" + (F.file ? " · " + F.file : ""), [F.household, F.planName, F.date].filter(Boolean).join(" · ") +
      "\nFound " + (F.found || []).join(", "), "plan");
  }
  if (!f.portfolio && !f.plan) host.appendChild(el("p", "hint", "Nothing read yet. The draft below is the plain template — drop a report and it fills itself in."));
}

function buildIntakeHint(){
  const k = SMART_KINDS.find(x => x.kind === deck.meta.kind) || {uses: []};
  const f = deck.facts || {};
  const have = k.uses.filter(u => f[u]), missing = k.uses.filter(u => !f[u]);
  const word = {portfolio: "the Croesus portfolio report", plan: "the financial plan"};
  $("buildHint").textContent = !k.uses.length ? "Lays out the " + (k.name || "template").toLowerCase() + " template, ready to fill in."
    : have.length ? "Lays out the " + k.name.toLowerCase() + " from " + andList(have.map(u => word[u])) + "." + (missing.length ? " Add " + andList(missing.map(u => word[u])) + " for more." : "")
    : "Drop " + andList(missing.map(u => word[u])) + " first — or build the template with blanks to fill.";
}

/* ── Investor profile (investment recommendations) ──────────────────────── */

function buildProfileCard(){
  const show = deck.meta.kind === "recommendation" || deck.sections.some(s => s.accountRecommendation);
  $("profileCard").hidden = !show;
  if (!show) return;
  const sel = $("fldProfile");
  sel.innerHTML = '<option value="">— choose the household investor profile —</option>' +
    Object.keys(INVESTOR_PROFILES).map(n => "<option" + (n === deck.profile ? " selected" : "") + ">" + esc(n) + "</option>").join("");
  const p = INVESTOR_PROFILES[deck.profile];
  $("profileHint").textContent = p ? p.description + " Equity " + p.equityMin + "–" + p.equityMax + "%." : "Sets the profile page and the starting model for each account.";
}
/** A new profile also moves any account still on the old profile's model to the new one. */
function setProfile(name){
  snapshot();
  const before = modelForProfile(deck.profile), after = modelForProfile(name);
  deck.profile = name;
  if (after) deck.sections.filter(s => s.accountRecommendation).forEach(s => {
    const b = s.blocks.find(x => x.type === "recommendation");
    if (b && (!b.portfolioId || (before && b.portfolioId === before.portfolioId))){
      b.portfolioId = after.portfolioId; b.profile = structuredClone(after); s.portfolioId = after.portfolioId;
    }
  });
  syncPanels(); render();
}

/* ── Next blank: walk the yellow blanks on the page ─────────────────────── */

/* Each press selects the next [[blank]] (or NEEDS ADVISOR INPUT note) on the
   page, so the advisor just types over it. lastBlank remembers where we were,
   because the pages are laid out again after every edit. */
let lastBlank = null;      /* {bid, i, order} of the blank shown last */
function goNextBlank(){
  const marks = $$("#pages mark.blank, #pages mark.needs");
  if (!marks.length){ toast("No blanks left: every yellow blank is filled in."); updateBlankButton(); return; }
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
  } else if (w.bid && findBlock(w.bid)) selectBlock(w.bid, false);
}
/** The count on the "Next blank" button above the pages; hidden when there are none. */
function updateBlankButton(){
  const btn = $("btnNextBlank");
  if (!btn) return;
  const n = gapCount(deck.sections.map(s => s.blocks));
  btn.hidden = !n;
  btn.innerHTML = n + (n === 1 ? " blank" : " blanks") + " &middot; <b>Next &rarr;</b>";
}

/* ── Copilot: one prompt, one answer ─────────────────────────────────────── */

function updateSlotStatus(){
  const n = slotBlocks().length, todo = slotBlocks().filter(x => x.b.seed).length, gaps = gapCount(deck.sections.map(s => s.blocks));
  $("slotStatus").textContent = n ? n + " boxes for Copilot to write" + (todo < n ? " (" + (n - todo) + " already done)" : "") + " · " + gaps + " yellow blank" + (gaps === 1 ? "" : "s") + " left"
    : "This draft has no pre-written boxes, so the prompt asks Copilot to write the whole document from your notes.";
}
function copySlotPrompt(){
  const has = slotBlocks().length;
  copyText(has ? slotPrompt() : wholeTextPrompt().replace("NOTES:\n[paste your notes here, or attach the plan, meeting notes and statements]", "NOTES:\n" + (deck.notes || "[paste your notes here]")),
    "Prompt copied — paste it into Copilot and press Enter. Then paste Copilot's answer in box 3.");
}
function applySlots(){
  const t = $("slotAnswer").value.trim();
  if (!t){ toast("Paste Copilot's answer into box 3 first."); return; }
  if (slotBlocks().length && /"slots"|^\s*(```|\{)/.test(t)){
    try {
      const n = applySlotAnswer(t);
      if (n){ $("slotAnswer").value = ""; updateSlotStatus(); toast(n + " boxes written by Copilot. Read them over — Undo takes them back.", 5000); showRail("build"); }
      else toast("None of the boxes matched — make sure you copied Copilot's whole answer.");
    } catch (e){ alert(e.message); }
    return;
  }
  if (smartPaste(t)) $("slotAnswer").value = "";
}

function wireIntake(){
  $("fldNotes").oninput = () => { deck.notes = $("fldNotes").value; markDirty(); };
  $("fldProfile").onchange = () => setProfile($("fldProfile").value);
  $("btnBuild").onclick = () => {
    if (!canAutoBuild() && !confirm("Lay the draft out again?\n\nThe figures are refreshed from your reports. Words you have typed into the pre-written boxes are kept, and sections you added stay at the end. Undo brings back the current version.")) return;
    doBuild(); showRail("build");
    toast("Draft laid out — fill in the yellow blanks, or let Copilot write the words (tab 3).", 5000);
  };
  $("btnNextBlank").onclick = goNextBlank;
  $("btnCopySlots").onclick = copySlotPrompt;
  $("btnApplySlots").onclick = applySlots;
  $("slotAnswer").addEventListener("paste", () => setTimeout(applySlots, 60));
  $("btnExtractPortfolio").onclick = () => copyText(extractionPrompt("portfolio"), "Prompt copied — attach the statement in Copilot, paste, and bring the answer back to the box above.");
  $("btnExtractPlan").onclick = () => copyText(extractionPrompt("plan"), "Prompt copied — attach the plan in Copilot, paste, and bring the answer back to the box above.");
}
function syncIntake(){
  $("fldNotes").value = deck.notes || "";
  buildSources();
  buildIntakeHint();
  buildProfileCard();
  updateSlotStatus();
}
