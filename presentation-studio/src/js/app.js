/* ==========================================================================
   app.js — the studio: state, the five tabs, editing, import, export.

   One rule runs through this file: the deck object is the truth. Every edit
   changes the deck, then the page is laid out again from scratch. That is why
   two people editing two different pieces get identical formatting.
   ========================================================================== */

const $  = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const AUTOSAVE_KEY = "mhwg.presentation.working-copy";
const WELCOMED_KEY = "mhwg.presentation.welcomed";

/* ── State ──────────────────────────────────────────────────────────────── */

let deck = null;
let selectedId = null;
let currentSectionId = null;     /* where "Add a block" puts things when nothing is selected */
let openSectionId = null;        /* the section expanded in the Build outline */
let undoStack = [], redoStack = [];
let zoom = 0;                    /* 0 = fit to the window */
let relayoutTimer = null;

function todayISO(){
  const t = new Date();
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function newDeck(kind){
  const t = TEMPLATES[kind] || TEMPLATES.plan_summary;
  return {
    version: 1,
    meta:{ kind, title:t.title, subtitle:t.subtitle, kicker:t.kicker, client:"", advisor:"", date:todayISO(), docTitle:"" },
    cover:{style:"white", image:""},
    design:{accent:"gold", density:"comfortable", look:"private", format:"report"},
    options:{ toc:true, dividers:false, sectionBreak:true, team:true, disclosures:true,
      draft:true, confidential:true, pageNumbers:true, watermark:false, runningHead:true },
    /* Starter content is marked `seed`; any edit clears the mark. */
    sections:(t.sections || []).map(s => ({
      id: uid(), title:s.title, brief:s.title, kicker:s.kicker || "", summary:s.summary || "",
      blocks:(s.blocks || []).map(b => Object.assign(structuredClone(b), {id: uid(), seed: true}))
    })),
    team: structuredClone(BRAND.team),
    contact:{firm:BRAND.firm, address:BRAND.address, phone:BRAND.phone, web:BRAND.web},
    disclosures: BRAND.disclosures.slice(),
    guideNumbers: null,   /* key figures, fed into every prompt */
    drafts: {},
    sources: {}           /* sources.message.note: the one takeaway, fed into every prompt */
  };
}

/* ── Undo ───────────────────────────────────────────────────────────────── */

/* Each snapshot is the whole deck, photos included, so the stacks are capped by
   size as well as count — sixty copies of a deck with photos would sink the tab. */
const UNDO_BUDGET = 40e6;
function trimStack(st){
  let total = st.reduce((n, x) => n + x.length, 0);
  while (st.length > 60 || (st.length > 1 && total > UNDO_BUDGET)) total -= st.shift().length;
}
function snapshot(){
  undoStack.push(JSON.stringify(deck));
  trimStack(undoStack);
  redoStack.length = 0;
  updateUndoButtons();
}
function undo(){
  if (!undoStack.length){ toast("Nothing to undo"); return; }
  redoStack.push(JSON.stringify(deck)); trimStack(redoStack);
  deck = migrate(JSON.parse(undoStack.pop()));
  selectedId = null;
  syncPanels(); render(); toast("Undone");
}
function redo(){
  if (!redoStack.length){ toast("Nothing to redo"); return; }
  undoStack.push(JSON.stringify(deck)); trimStack(undoStack);
  deck = migrate(JSON.parse(redoStack.pop()));
  selectedId = null;
  syncPanels(); render(); toast("Redone");
}
function updateUndoButtons(){
  $("btnUndo").disabled = !undoStack.length;
  $("btnRedo").disabled = !redoStack.length;
}

/* ── Small helpers ──────────────────────────────────────────────────────── */

function toast(msg, ms){
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms || 2600);
}
async function copyText(text, msg){
  try { await navigator.clipboard.writeText(text); toast(msg || "Copied"); }
  catch {
    /* some locked-down browsers refuse the clipboard: show it, selected, to copy by hand */
    showModal("Copy this", "<p class='hint'>Press <b>Ctrl+C</b> to copy the selected text.</p><textarea id='copyBox' rows='16' class='mono'></textarea>");
    $("copyBox").value = text; $("copyBox").focus(); $("copyBox").select();
  }
}
function downloadFile(name, text, type){
  const blob = new Blob([text], {type: type || "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function findBlock(id){
  for (const s of deck.sections){
    const b = (s.blocks || []).find(x => x.id === id);
    if (b) return {block:b, section:s};
  }
  return null;
}
function setPath(obj, path, value){
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++){
    const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cur[k] == null) cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[k];
  }
  const last = /^\d+$/.test(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
  cur[last] = value;
}
function blockLabelOf(b){
  return b.type === "recommendation" ? "Recommendation" : (BLOCK_KINDS.find(k => k.type === b.type) || {}).label || b.type;
}

/* The browser keeps a backup copy in case the tab crashes. It can fail — the
   browser only allows a few MB, and photos fill that fast — so a failure is
   said out loud. */
let autosaveTimer = null, autosaveWarned = false;
let lastPrint = "";
function deckPrint(){
  const t = JSON.stringify(deck);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return t.length + ":" + (h >>> 0);
}
function markClean(text){ lastPrint = deckPrint(); $("saveState").textContent = text; }
function markDirty(){
  $("saveState").textContent = "unsaved changes";
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, 700);
}
function autosave(){
  clearTimeout(autosaveTimer);
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(deck));
    autosaveWarned = false;
  } catch (e){
    $("saveState").textContent = "unsaved changes — too big for the backup copy, use Save";
    if (!autosaveWarned){
      autosaveWarned = true;
      toast("This piece is too big for the browser's backup copy (usually photos). Press Save now and then — that file is your safety net.", 7000);
    }
  }
}

/* ── Render ─────────────────────────────────────────────────────────────── */

function render(){
  const host = $("pages");
  const edit = $("optEditInline").checked;
  const keepTop = host.scrollTop, keepLeft = host.scrollLeft;
  host.className = "pages doc" + (edit ? " edit-on" : "");
  const result = layout(deck, host);
  $("pageCount").textContent = result.pages.length + (result.pages.length === 1 ? " page" : " pages");
  if (edit){
    $$(".is-editable", host).forEach(n => {
      if (n.closest(".blk-recommendation")) return;
      n.setAttribute("contenteditable", "true");
      n.setAttribute("spellcheck", "true");
    });
  }
  if (selectedId){
    $$('.blk-hit[data-bid="' + selectedId + '"]', host).forEach(n => n.classList.add("is-selected"));
  }
  decorateBlocks();
  applyZoom();
  /* laying out again rebuilds every page; put the view back where the person was */
  host.scrollTop = keepTop; host.scrollLeft = keepLeft;
  updateChips();
  const print = deckPrint();
  if (print !== lastPrint){ lastPrint = print; markDirty(); }
  updateUndoButtons();
}
function relayoutSoon(){
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => { render(); buildOutline(); }, 260);
}
function applyZoom(){
  const host = $("pages");
  let z = zoom;
  if (!z) z = fitZoom();
  $$(".page", host).forEach(p => { p.style.zoom = z; });
  $("zoomLabel").textContent = zoom ? Math.round(z * 100) + "%" : "Fit";
}
function pageWidth(){ return parseFloat(getComputedStyle($("pages")).getPropertyValue("--pw")) || 816; }
function fitZoom(){ return Math.min(1, Math.max(0.2, ($("pages").clientWidth - 48) / pageWidth())); }

/* Tools on each block, right on the page: add below, Copilot, move, delete. */
function decorateBlocks(){
  $$("#pages .blk-hit").forEach(w => {
    const bid = w.dataset.bid;
    if (!bid || w.querySelector(":scope > .blk-quickbar")) return;
    const bar = el("div", "blk-quickbar");
    const btn = (label, title, on, cls) => {
      const b = el("button", cls || "", label);
      b.type = "button"; b.title = title;
      b.addEventListener("mousedown", e => e.preventDefault());   /* keep focus where it is */
      b.onclick = (e) => { e.stopPropagation(); on(b); };
      bar.appendChild(b);
    };
    if (bid.startsWith("sec-")){
      const sec = deck.sections.find(s => "sec-" + s.id === bid);
      if (!sec) return;
      btn("+ Block", "Add a block at the top of this section", (b) => showInsertMenu(b, {sectionId: sec.id, top: true}));
      btn("✦ Copilot", "Write this section with Copilot", () => { showRail("copilot"); setPromptKind("section", sec.id); });
    } else if (w.dataset.type === "recommendation"){
      btn("Edit recommendation", "Change the account, amount, portfolio or points", () => selectBlock(bid, false));
      btn("Delete page", "Remove this recommendation page", () => {
        const sec = recSectionOf(bid);
        if (sec && confirm('Delete "' + sec.title + '"?')){ snapshot(); deck.sections = deck.sections.filter(s => s !== sec); clearSelection(); syncPanels(); render(); }
      }, "is-danger");
    } else {
      btn("+ Add below", "Insert a block below this one", (b) => showInsertMenu(b, {after: bid}));
      btn("✦ Copilot", "Improve or write this with Copilot", () => openBlockCopilot(bid));
      btn("↑", "Move up", () => moveBlock(bid, -1));
      btn("↓", "Move down", () => moveBlock(bid, 1));
      btn("⧉", "Duplicate", () => duplicateBlock(bid));
      btn("✕", "Delete", () => deleteBlock(bid), "is-danger");
    }
    w.appendChild(bar);
  });
}

function showInsertMenu(anchor, where){
  const menu = $("insertMenu");
  menu.innerHTML = '<div class="im-title">Add a block</div><div class="im-grid"></div>';
  const grid = menu.querySelector(".im-grid");
  BLOCK_KINDS.forEach(k => {
    const b = el("button", "", "<b>" + esc(k.label) + "</b><span>" + esc(k.note) + "</span>");
    b.onclick = () => { menu.hidden = true; insertNewBlock(k.type, where); };
    grid.appendChild(b);
  });
  const r = anchor.getBoundingClientRect();
  menu.hidden = false;
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8)) + "px";
}

/* ── Panels: fields to deck and back ────────────────────────────────────── */

const FIELD_MAP = [
  ["fldClient",   d => d.meta.client,    (d,v) => d.meta.client = v],
  ["fldTitle",    d => d.meta.title,     (d,v) => d.meta.title = v],
  ["fldSubtitle", d => d.meta.subtitle,  (d,v) => d.meta.subtitle = v],
  ["fldAdvisor",  d => d.meta.advisor,   (d,v) => d.meta.advisor = v],
  ["fldDate",     d => d.meta.date,      (d,v) => d.meta.date = v],
  ["fldFirm",     d => d.contact.firm,   (d,v) => d.contact.firm = v],
  ["fldAddress",  d => d.contact.address,(d,v) => d.contact.address = v],
  ["fldPhone",    d => d.contact.phone,  (d,v) => d.contact.phone = v],
  ["fldWeb",      d => d.contact.web,    (d,v) => d.contact.web = v]
];
const OPTION_MAP = [
  ["optToc","toc"], ["optDividers","dividers"], ["optSectionBreak","sectionBreak"], ["optTeam","team"],
  ["optDisc","disclosures"], ["optDraft","draft"], ["optConfidential","confidential"],
  ["optPageNums","pageNumbers"], ["optWatermark","watermark"], ["optRunningHead","runningHead"]
];

function syncPanels(){
  $("docTitle").value = deck.meta.docTitle || "";
  FIELD_MAP.forEach(([id, get]) => { const n = $(id); if (n && document.activeElement !== n) n.value = get(deck) || ""; });
  OPTION_MAP.forEach(([id, key]) => { $(id).checked = !!deck.options[key]; });
  $("fldDisclosures").value = (deck.disclosures || []).join("\n\n");
  $$('input[name="accent"]').forEach(r => r.checked = r.value === deck.design.accent);
  $$('input[name="density"]').forEach(r => r.checked = r.value === deck.design.density);
  $("fldMessage").value = ((deck.sources || {}).message || {}).note || "";
  buildPieceGrid();
  buildSwatches();
  buildTitlePicker();
  buildAdvisorPicker();
  buildTeamEditor();
  buildOutline();
  buildNumbers();
  buildPromptPicker();
  buildCheckList();
}

/* Start: what are we making */
function buildPieceGrid(){
  const grid = $("pieceGrid");
  grid.innerHTML = "";
  PIECE_CARDS.forEach(c => {
    const card = el("button", "piece-card" + (deck.meta.kind === c.kind ? " is-on" : ""),
      "<b>" + esc(c.name) + "</b><span>" + esc(c.note) + "</span>");
    card.onclick = () => switchPiece(c.kind);
    grid.appendChild(card);
  });
}
function switchPiece(kind){
  if (deck.meta.kind === kind) return;
  const name = (PIECE_CARDS.find(c => c.kind === kind) || {}).name || kind;
  if (!deckIsStarter() && !confirm("Switch to " + name + "?\n\nThe sections you have now are replaced with this template's. (Undo brings them back.)")) return;
  snapshot();
  /* only the sections and cover wording change; client, figures, team and settings stay */
  const fresh = newDeck(kind);
  ["kind", "subtitle", "kicker"].forEach(k => { deck.meta[k] = fresh.meta[k]; });
  if (!deck.meta.title || Object.values(TITLE_IDEAS).some(list => list.includes(deck.meta.title)) || /^The .+ (Plan|Review|Portfolio Review)$/.test(deck.meta.title))
    deck.meta.title = titleIdeas(kind, deck.meta.client)[0] || fresh.meta.title;
  const recs = deck.sections.filter(s => s.accountRecommendation);
  deck.sections = fresh.sections.concat(recs);
  if (deck.guideNumbers && deck.guideNumbers.every(r => !(r.v || "").trim())) deck.guideNumbers = null;
  selectedId = null; openSectionId = null;
  syncPanels(); render();
  toast(name + " — sections loaded");
}

/* the little picture-swatches for format, cover and page style */
function swatchRow(host, items, current, cls, onPick){
  host.innerHTML = "";
  items.forEach(([id, name, note]) => {
    const b = el("button", cls + " is-" + id + (current === id ? " is-on" : ""),
      "<i></i><span>" + esc(name) + "</span>" + (note ? "<em>" + esc(note) + "</em>" : ""));
    b.type = "button";
    b.onclick = () => { snapshot(); onPick(id); buildSwatches(); render(); };
    host.appendChild(b);
  });
}
function buildSwatches(){
  swatchRow($("formatPick"), [["report", "Report", "Portrait — print or email"], ["slides", "Slides", "Landscape — screen or TV"]],
    deck.design.format || "report", "fmt-swatch", id => { deck.design.format = id; zoom = 0; });
  swatchRow($("coverPick"), [["white", "Clean white"], ["ivory", "Ivory"], ["premium", "Premium green"], ["photo", "Photograph"]],
    deck.cover.style || "white", "cover-swatch", id => {
      deck.cover.style = id;
      if (id === "photo" && !deck.cover.image) setTimeout(() => $("btnCoverImage").click(), 50);
    });
  swatchRow($("lookPick"), [["private", "Private bank", "Open, gold hairlines"], ["classic", "Classic", "Boxed, green headers"]],
    deck.design.look || "private", "look-swatch", id => { deck.design.look = id; });
  $("btnCoverImage").hidden = deck.cover.style !== "photo";
}

function buildTitlePicker(){
  const sel = $("fldTitleIdea");
  const ideas = titleIdeas(deck.meta.kind, deck.meta.client);
  sel.innerHTML = '<option value="">Suggestions…</option>' + ideas.map(t => "<option>" + esc(t) + "</option>").join("");
  sel.value = "";
}
function buildAdvisorPicker(){
  const sel = $("fldAdvisor");
  const cur = deck.meta.advisor || "";
  const opts = [""].concat(deck.team.map(m => m.name + (m.desig ? ", " + m.desig : ""))).concat([BRAND.firm]);
  if (cur && !opts.includes(cur)) opts.push(cur);
  sel.innerHTML = opts.map(o => '<option value="' + esc(o) + '">' + esc(o || "— choose —") + "</option>").join("");
  sel.value = cur;
}
function buildTeamEditor(){
  const host = $("teamEditor");
  host.innerHTML = "";
  deck.team.forEach((m, i) => {
    const row = el("div", "team-row");
    ["name","desig","title"].forEach(k => {
      const inp = document.createElement("input");
      inp.value = m[k] || "";
      inp.placeholder = k === "name" ? "Name" : k === "desig" ? "Designations" : "Title";
      inp.oninput = () => { deck.team[i][k] = inp.value; relayoutSoon(); };
      row.appendChild(inp);
    });
    row.appendChild(inspBtn("Remove", () => { snapshot(); deck.team.splice(i, 1); buildTeamEditor(); render(); }, "btn-danger"));
    host.appendChild(row);
  });
}

/* ── Build: the outline ─────────────────────────────────────────────────── */

const STATUS_TEXT = {done:"written", started:"part written", empty:"to write"};

function buildOutline(){
  const host = $("outline");
  host.innerHTML = "";
  const p = deckProgress();
  $("buildProgress").textContent = p.done + " of " + p.total + " written";
  $("buildBar").style.width = (p.total ? Math.round(p.done / p.total * 100) : 0) + "%";

  if (!deck.sections.length) host.appendChild(el("div", "o-empty", "No sections yet — add one below."));
  deck.sections.forEach((s, si) => {
    const status = sectionStatus(s);
    const open = s.id === openSectionId;
    const box = el("div", "o-section is-" + status + (open ? " is-open" : "") + (s.accountRecommendation ? " is-rec" : ""));
    const head = el("div", "o-sec-head");
    head.draggable = true;
    head.ondragstart = (e) => { e.dataTransfer.setData("text/plain", "sec:" + si); };
    head.ondragover = (e) => { e.preventDefault(); box.classList.add("is-drop"); };
    head.ondragleave = () => box.classList.remove("is-drop");
    head.ondrop = (e) => {
      e.preventDefault(); box.classList.remove("is-drop");
      const data = e.dataTransfer.getData("text/plain");
      if (data.startsWith("sec:")){
        const from = Number(data.slice(4));
        if (from === si) return;
        snapshot();
        const [moved] = deck.sections.splice(from, 1);
        deck.sections.splice(si, 0, moved);
        syncPanels(); render();
      } else if (data.startsWith("blk:")){
        const [, fsi, fbi] = data.split(":");
        if (s.accountRecommendation) return;
        snapshot();
        const [moved] = deck.sections[Number(fsi)].blocks.splice(Number(fbi), 1);
        deck.sections[si].blocks.push(moved);
        buildOutline(); render();
      }
    };
    head.appendChild(el("span", "o-grip", "⠿"));
    head.appendChild(el("span", "o-num", String(si + 1)));
    if (s.accountRecommendation){
      const rec = s.blocks.find(b => b.type === "recommendation") || {};
      const p = recProfile(rec);
      head.appendChild(el("span", "o-title", "<b>" + esc(s.accountName || "Account") + (s.accountAmount ? " · " + esc(s.accountAmount) : "") +
        "</b><small>" + esc(p ? p.portfolioName : "Choose a portfolio") + "</small>"));
    } else {
      const name = document.createElement("input");
      name.value = s.title || "";
      name.placeholder = "Section title";
      name.title = "Rename this section";
      name.oninput = () => { s.title = name.value; relayoutSoon(); };
      name.onfocus = () => { currentSectionId = s.id; };
      head.appendChild(name);
      head.appendChild(el("span", "o-status", STATUS_TEXT[status]));
    }
    const del = el("button", "o-del", "✕");
    del.title = "Delete this section";
    del.onclick = (e) => {
      e.stopPropagation();
      if (!confirm('Delete "' + (s.title || "Untitled") + '" and everything in it?')) return;
      snapshot(); deck.sections.splice(si, 1); clearSelection(); syncPanels(); render();
    };
    head.appendChild(del);
    head.onclick = (e) => {
      if (e.target.closest("button")) return;
      currentSectionId = s.id;
      if (s.accountRecommendation){ const r = s.blocks[0]; if (r) selectBlock(r.id, true); return; }
      openSectionId = open && e.target.tagName !== "INPUT" ? null : s.id;
      buildOutline(); updateAddWhere();
      jumpToSection(s);
    };
    box.appendChild(head);

    if (open && !s.accountRecommendation){
      const list = el("div", "o-blocks");
      if (!(s.blocks || []).length) list.appendChild(el("div", "o-empty", "Empty — add a block below, or paste text on Copilot & JSON."));
      (s.blocks || []).forEach((b, bi) => {
        const row = el("div", "o-block" + (b.id === selectedId ? " is-selected" : "") + (b.seed ? " is-seed" : ""));
        row.draggable = true;
        row.ondragstart = (e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", "blk:" + si + ":" + bi); };
        row.ondragover = (e) => { e.preventDefault(); row.classList.add("o-drag-over"); };
        row.ondragleave = () => row.classList.remove("o-drag-over");
        row.ondrop = (e) => {
          e.preventDefault(); e.stopPropagation(); row.classList.remove("o-drag-over");
          const data = e.dataTransfer.getData("text/plain");
          if (!data.startsWith("blk:")) return;
          const [, fsi, fbi] = data.split(":");
          snapshot();
          const [moved] = deck.sections[Number(fsi)].blocks.splice(Number(fbi), 1);
          deck.sections[si].blocks.splice(bi, 0, moved);
          buildOutline(); render();
        };
        row.appendChild(el("span", "o-kind", esc(blockLabelOf(b))));
        row.appendChild(el("span", "o-label", esc(blockLabel(b)) + (b.seed ? ' <em>sample</em>' : "")));
        row.onclick = () => selectBlock(b.id, true);
        list.appendChild(row);
      });
      const brief = sectionBrief(s.brief || s.title, deck.meta.kind);
      if (brief) list.appendChild(el("p", "o-brief", "<b>What goes here:</b> " + esc(brief)));
      const tools = el("div", "o-tools");
      tools.appendChild(inspBtn("✦ Write with Copilot", () => { showRail("copilot"); setPromptKind("section", s.id); }));
      tools.appendChild(inspBtn("Show an example", () => showSectionExample(s)));
      list.appendChild(tools);
      box.appendChild(list);
    }
    host.appendChild(box);
  });
  updateAddWhere();
}

function blockLabel(b){
  const first = (s) => String(s || "").replace(/\*\*|==/g,"").slice(0, 44);
  switch (b.type){
    case "heading": case "paragraph": case "lead": case "quote": return first(b.text) || "(empty)";
    case "callout": return first(b.title || b.text);
    case "bullets": return first((b.items || [])[0]) + ((b.items || []).length > 1 ? " …" : "");
    case "stats":   return (b.items || []).map(i => i.num).join("  ");
    case "facts":   return first((b.items || [])[0] && b.items[0].k);
    case "actions": return first((b.items || [])[0] && b.items[0].t);
    case "table":   return (b.headers || []).join(" · ").slice(0, 44);
    case "chart":   return b.title || b.chart;
    case "infographic": return b.title || b.graphic;
    case "image":   return b.caption || (b.src ? "picture" : "no picture yet");
    case "twocol":  return first(b.aTitle) + " | " + first(b.bTitle);
    default: return "";
  }
}

/* Section presets for "+ Add" */
const SECTION_PRESETS = [
  ["blank", "Blank section", () => ({title:"New section", blocks:blocks({type:"paragraph", text:""})})],
  ["executive", "Executive summary", () => ({title:"Executive Summary", blocks:blocks(
    {type:"lead", text:"The one message you want the client to understand first."},
    {type:"bullets", style:"bullet", items:["Key point","Key point","Key point"]})})],
  ["heard", "What we heard", () => ({title:"What we heard", blocks:blocks(
    {type:"lead", text:"Your words, played back — so you know we were listening."},
    {type:"bullets", style:"bullet", items:["Priority or concern","Priority or concern","Priority or concern"]},
    {type:"quote", text:"A line in the client's own words.", by:""})})],
  ["first", "What we would do first", () => ({title:"What we would do first", blocks:blocks(
    {type:"actions", items:[{t:"First priority", d:"What happens and why.", who:"Us", when:"Next 30 days"},
                            {t:"Second priority", d:"What happens and why.", who:"You", when:"As agreed"}]})})],
  ["stand", "Where you stand today", () => ({title:"Where you stand today", blocks:blocks(
    {type:"stats", cols:3, items:[{num:"—", label:"Net worth", note:""},{num:"—", label:"Investable assets", note:""},{num:"—", label:"Debt", note:""}]},
    {type:"paragraph", text:"What the balance sheet says."})})],
  ["portfolio", "Portfolio review", () => ({title:"Portfolio review", blocks:blocks(
    {type:"lead", text:"A concise review of the portfolio and the decisions in front of you."},
    {type:"paragraph", text:"The portfolio commentary."})})],
  ["planning", "Financial planning", () => ({title:"Financial planning", blocks:blocks(
    {type:"lead", text:"How the planning decisions work together."},
    {type:"paragraph", text:"The planning discussion."})})],
  ["estate", "Estate planning", () => ({title:"Estate planning", blocks:blocks(
    {type:"lead", text:"Key estate-planning considerations and next steps."},
    {type:"bullets", style:"bullet", items:["Consideration","Consideration","Next step"]})})],
  ["insurance", "Insurance review", () => ({title:"Insurance review", blocks:blocks(
    {type:"lead", text:"How insurance fits within the broader plan."},
    {type:"paragraph", text:"The insurance review."})})],
  ["cashflow", "Cash flow", () => ({title:"Cash flow", blocks:blocks(
    {type:"lead", text:"The cash-flow picture and the decisions it supports."},
    {type:"facts", items:[{k:"Income", v:"—"},{k:"Spending", v:"—"},{k:"Available cash flow", v:"—"}]})})],
  ["options", "Options compared", () => ({title:"The options we considered", blocks:blocks(
    {type:"table", caption:"Illustrative — figures rounded, before tax", headers:["Option","What it does","Trade-off"],
      rows:[["Option A","",""],["Option B","",""]]},
    {type:"twocol", aTitle:"What this does well", aText:"", bTitle:"What to watch", bText:""})})],
  ["how", "How we work", () => ({title:"How we work", blocks:blocks(
    {type:"infographic", graphic:"steps", title:"Our process",
      items:[{t:"Discover",d:"Understand the whole picture"},{t:"Plan",d:"Model the options"},{t:"Implement",d:"Put the plan to work"},{t:"Review",d:"Adjust as life changes"}]},
    {type:"paragraph", text:"What working with us is actually like."})})],
  ["team", "The team behind the plan", () => ({title:"The team behind the plan", blocks:blocks(
    {type:"paragraph", text:"You are not hiring one advisor — you are hiring a team, with a dedicated service group behind it."})})],
  ["next", "What happens next", () => ({title:"What happens next", blocks:blocks(
    {type:"actions", items:[{t:"Confirm the plan", d:"Review and confirm the agreed direction.", who:"You", when:"Next meeting"},
                            {t:"Implement", d:"Complete the agreed account and portfolio changes.", who:"Us", when:"After approval"}]})})]
];
function addPresetSection(id){
  const p = SECTION_PRESETS.find(x => x[0] === id) || SECTION_PRESETS[0];
  const made = p[2]();
  snapshot();
  const sec = {id:uid(), title:made.title, brief:made.title, kicker:"", summary:"",
    blocks:made.blocks.map(b => Object.assign(b, {seed:true}))};
  deck.sections.push(sec);
  currentSectionId = openSectionId = sec.id;
  selectedId = null;
  syncPanels(); render(); jumpToSection(sec);
  toast("“" + sec.title + "” added — click its text on the page to write it.");
}

function addTarget(){
  const sel = selectedId && findBlock(selectedId);
  if (sel && !sel.section.accountRecommendation) return {after: selectedId};
  const sec = deck.sections.find(s => s.id === currentSectionId && !s.accountRecommendation)
           || deck.sections.slice().reverse().find(s => !s.accountRecommendation);
  return sec ? {sectionId: sec.id} : {};
}
function updateAddWhere(){
  const t = addTarget();
  let txt;
  if (t.after){ const f = findBlock(t.after); txt = "Goes below the selected " + blockLabelOf(f.block).toLowerCase() + " in “" + (f.section.title || "section") + "”."; }
  else if (t.sectionId){ const s = deck.sections.find(x => x.id === t.sectionId); txt = "Goes at the end of “" + (s.title || "section") + "”. Select a block on the page to put it below that instead."; }
  else txt = "Goes into a new section.";
  $("addWhere").textContent = txt;
}

/* ── Copilot tab: key figures and the prompt picker ─────────────────────── */

function buildNumbers(){
  const host = $("numRows");
  if (!deck.guideNumbers) deck.guideNumbers = (NUMBER_ROWS[deck.meta.kind] || NUMBER_ROWS.blank).map(r => Object.assign({}, r));
  const rows = deck.guideNumbers;
  host.innerHTML = "";
  rows.forEach((r, i) => {
    const card = el("div", "num-row");
    const inp = (key, ph) => { const n = document.createElement("input"); n.value = r[key] || ""; n.placeholder = ph;
      n.oninput = () => { r[key] = n.value; markDirty(); showPrompt(); }; card.appendChild(n); };
    inp("k", "Label"); inp("v", "Value"); inp("note", "Note (as at…, illustrative)");
    card.appendChild(inspBtn("✕", () => { snapshot(); rows.splice(i, 1); buildNumbers(); markDirty(); }, "btn-danger"));
    host.appendChild(card);
  });
  const sel = $("numSection"), keep = sel.value;
  sel.innerHTML = deck.sections.filter(s => !s.accountRecommendation).map(s => '<option value="' + esc(s.id) + '">' + esc(s.title || "Untitled") + "</option>").join("");
  if (keep) sel.value = keep;
}
function numbersToPage(kind){
  const rows = (deck.guideNumbers || []).filter(r => (r.k || "").trim() && (r.v || "").trim());
  if (kind === "stats" && rows.length < 2){ toast("Fill in at least two figures."); return; }
  if (!rows.length){ toast("Fill in at least one figure."); return; }
  const block = kind === "stats"
    ? Object.assign(newBlock("stats"), {fromNumbers:"stats", cols: rows.length <= 4 ? rows.length : rows.length <= 6 ? 3 : 4,
        items: rows.map(r => ({num:r.v, label:r.k, note:r.note || ""}))})
    : Object.assign(newBlock("facts"), {fromNumbers:"facts",
        items: rows.map(r => ({k:r.k, v:r.v + ((r.note || "").trim() ? " (" + r.note.trim() + ")" : "")}))});
  /* pressing again updates the cards already on the page instead of adding a second set */
  let existing = null;
  deck.sections.forEach(s => (s.blocks || []).forEach((b, i) => { if (b.fromNumbers === kind) existing = {s, i}; }));
  snapshot();
  if (existing){
    block.id = existing.s.blocks[existing.i].id;
    existing.s.blocks[existing.i] = block;
    syncPanels(); render(); jumpToSection(existing.s);
    toast("Updated the figures already in “" + (existing.s.title || "section") + "”");
    return;
  }
  const sec = deck.sections.find(s => s.id === $("numSection").value) || deck.sections.find(s => !s.accountRecommendation);
  if (!sec){ toast("Add a section first."); return; }
  sec.blocks.unshift(block);
  syncPanels(); render(); jumpToSection(sec);
  toast("Added to “" + (sec.title || "section") + "”");
}

function setPromptKind(kind, sectionId){
  const r = document.querySelector('input[name="promptKind"][value="' + kind + '"]');
  if (r) r.checked = true;
  if (sectionId){ $("promptSection").value = sectionId; currentSectionId = sectionId; }
  buildPromptPicker();
  if (kind === "section") $("promptSection").scrollIntoView({block:"center", behavior:"smooth"});
}
function promptKind(){ return (document.querySelector('input[name="promptKind"]:checked') || {}).value || "text"; }
function buildPromptPicker(){
  const kind = promptKind();
  const secSel = $("promptSection"), keep = secSel.value;
  const secs = deck.sections.filter(s => !s.accountRecommendation);
  secSel.innerHTML = secs.map((s, i) => '<option value="' + esc(s.id) + '">' + (i + 1) + ". " + esc(s.title || "Untitled section") + "</option>").join("");
  if (keep && secs.some(s => s.id === keep)) secSel.value = keep;
  else if (currentSectionId && secs.some(s => s.id === currentSectionId)) secSel.value = currentSectionId;
  const tool = $("promptTool");
  if (!tool.options.length) tool.innerHTML = GENERAL_PROMPTS.map(p => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("");
  secSel.hidden = kind !== "section";
  tool.hidden = kind !== "tool";
  showPrompt();
}
function currentPromptText(){
  const kind = promptKind();
  if (kind === "json") return wholeJSONPrompt();
  if (kind === "tool"){ const p = GENERAL_PROMPTS.find(x => x.id === $("promptTool").value); return p ? p.text : ""; }
  if (kind === "section"){
    const secs = deck.sections.filter(s => !s.accountRecommendation);
    const titles = secs.map(s => s.title || "Untitled section");
    const i = Math.max(0, secs.findIndex(s => s.id === $("promptSection").value));
    return titles.length ? sectionPrompt(deck.meta.kind, titles[i], i, titles) : "Add a section first.";
  }
  return wholeTextPrompt();
}
function showPrompt(){ $("promptPreview").textContent = currentPromptText(); }

/* ── Finish: the check list ─────────────────────────────────────────────── */

function buildCheckList(){
  const host = $("checkList");
  if (!host) return;
  const issues = preflight();
  host.innerHTML = "";
  if (!issues.length){
    host.appendChild(el("div", "check-ok", "<b>Nothing outstanding.</b> Every section written, no sample numbers or advisor notes left. Have a read through the pages, then export."));
  } else {
    host.appendChild(el("p", "hint", "Worth fixing before anyone sees it. Click one to go to it."));
    issues.forEach(is => {
      const row = el("button", "check-row", esc(is.t));
      row.onclick = is.fix;
      host.appendChild(row);
    });
  }
}
function updateChips(){
  const p = deckProgress();
  $("buildChip").textContent = p.total ? p.done + "/" + p.total : "";
  const n = preflight().length;
  $("finishChip").textContent = n ? String(n) : "✓";
  $("finishChip").className = n ? "is-warn" : "is-ok";
  if ($("rail").querySelector('.panel.is-active[data-panel="finish"]')) buildCheckList();
}

/* ── Inspector ──────────────────────────────────────────────────────────── */

function selectBlock(id, scroll){
  selectedId = id;
  const found = findBlock(id);
  if (found){ currentSectionId = found.section.id; if (!found.section.accountRecommendation) openSectionId = found.section.id; }
  $$(".blk-hit.is-selected").forEach(n => n.classList.remove("is-selected"));
  const nodes = $$('#pages .blk-hit[data-bid="' + id + '"]');
  nodes.forEach(n => n.classList.add("is-selected"));
  if (scroll && nodes[0]) nodes[0].scrollIntoView({block:"center", behavior:"smooth"});
  buildOutline();
  buildInspector();
}
function clearSelection(){
  selectedId = null;
  $$(".blk-hit.is-selected").forEach(n => n.classList.remove("is-selected"));
  $("inspector").hidden = true;
  buildOutline();
}

function insp(label, node){
  const wrap = el("label", "field");
  wrap.appendChild(el("span", "", esc(label)));
  wrap.appendChild(node);
  return wrap;
}
function inspInput(value, on, ph){
  const n = document.createElement("input");
  n.value = value == null ? "" : value;
  if (ph) n.placeholder = ph;
  n.oninput = () => on(n.value);
  return n;
}
function inspArea(value, on, rows){
  const n = document.createElement("textarea");
  n.rows = rows || 4; n.value = value == null ? "" : value;
  n.oninput = () => on(n.value);
  return n;
}
function inspSelect(options, value, on){
  const n = document.createElement("select");
  options.forEach(o => {
    const op = document.createElement("option");
    op.value = o.id != null ? o.id : o;
    op.textContent = o.name != null ? o.name : o;
    n.appendChild(op);
  });
  n.value = value;
  n.onchange = () => on(n.value);
  return n;
}
function inspBtn(text, on, cls){
  const b = el("button", "btn btn-mini " + (cls || ""));
  b.type = "button";
  b.textContent = text;
  b.onclick = on;
  return b;
}

function buildInspector(){
  const found = selectedId && findBlock(selectedId);
  const box = $("inspector"), body = $("inspectorBody");
  if (!found){ box.hidden = true; return; }
  const b = found.block;
  box.hidden = false;
  $("inspectorTitle").textContent = blockLabelOf(b);
  body.innerHTML = "";
  const isRec = b.type === "recommendation";
  ["btnBlockUp", "btnBlockDown", "btnBlockDup", "btnBlockCopilot"].forEach(id => { $(id).hidden = isRec; });
  if (isRec){ buildRecommendationInspector(b, body); return; }
  body.appendChild(el("p", "insp-note insp-sec", "In “" + esc(found.section.title || "section") + "”" + (b.seed ? " · <b>still sample text</b>" : "")));

  /* `look` edits (chart type, title, size) change how it looks, not what it says,
     so they never clear a chart's "still sample numbers" mark */
  const change = (fn, look) => {
    fn();
    if (!(look && VISUAL_TYPES.includes(b.type))) delete b.seed;
    relayoutSoon();
  };
  const rowsEditor = (items, fields, addDefault) => {
    const table = el("div", "rows-editor");
    items.forEach((it, i) => {
      const card = el("div", "team-row");
      fields.forEach(f => card.appendChild(inspInput(it[f.k], v => change(() => it[f.k] = v), f.ph)));
      const bar = el("div", "row-tools");
      bar.appendChild(inspBtn("↑", () => { if (i > 0){ snapshot(); items.splice(i-1,0,items.splice(i,1)[0]); buildInspector(); render(); }}));
      bar.appendChild(inspBtn("↓", () => { if (i < items.length-1){ snapshot(); items.splice(i+1,0,items.splice(i,1)[0]); buildInspector(); render(); }}));
      bar.appendChild(inspBtn("Remove", () => { snapshot(); items.splice(i,1); delete b.seed; buildInspector(); render(); }, "btn-danger"));
      card.appendChild(bar);
      table.appendChild(card);
    });
    body.appendChild(table);
    body.appendChild(inspBtn("+ Add a row", () => { snapshot(); items.push(Object.assign({}, addDefault)); buildInspector(); render(); }));
  };

  switch (b.type){
    case "heading":
      body.appendChild(insp("Level", inspSelect([{id:"2",name:"Large heading"},{id:"3",name:"Sub-heading"}],
        String(b.level || 2), v => change(() => b.level = Number(v)))));
      body.appendChild(insp("Kicker (small green line above)", inspInput(b.kicker, v => change(() => b.kicker = v), "optional")));
      body.appendChild(insp("Text", inspInput(b.text, v => change(() => b.text = v))));
      break;
    case "paragraph": case "lead":
      body.appendChild(insp("Text", inspArea(b.text, v => change(() => b.text = v), 8)));
      body.appendChild(el("p","insp-note","**double asterisks** make bold. ==double equals== highlights one key phrase — once a page at most."));
      break;
    case "bullets":
      body.appendChild(insp("Style", inspSelect([{id:"bullet",name:"Bullets"},{id:"number",name:"Numbered"},{id:"check",name:"Check boxes"}],
        b.style || "bullet", v => change(() => b.style = v))));
      body.appendChild(insp("One item per line", inspArea((b.items || []).join("\n"), v => change(() => b.items = v.split("\n").filter(x => x.trim())), 8)));
      break;
    case "stats":
      body.appendChild(insp("Cards across", inspSelect(["2","3","4"], String(b.cols || 3), v => change(() => b.cols = Number(v)))));
      rowsEditor(b.items, [{k:"num",ph:"$1.2M"},{k:"label",ph:"What it is"},{k:"note",ph:"small note"}], {num:"",label:"",note:""});
      break;
    case "facts":
      rowsEditor(b.items, [{k:"k",ph:"Label"},{k:"v",ph:"Value"}], {k:"",v:""});
      break;
    case "actions":
      rowsEditor(b.items, [{k:"t",ph:"Title"},{k:"d",ph:"What happens and why"},{k:"who",ph:"Owner (You / Us)"},{k:"when",ph:"When"}], {t:"",d:"",who:"",when:""});
      break;
    case "callout":
      body.appendChild(insp("Tone", inspSelect([{id:"note",name:"Note (gold)"},{id:"important",name:"Important (green)"},
        {id:"watch",name:"Watch out (amber)"},{id:"quiet",name:"Quiet (outline)"}], b.tone || "note", v => change(() => b.tone = v))));
      body.appendChild(insp("Title", inspInput(b.title, v => change(() => b.title = v), "optional")));
      body.appendChild(insp("Text", inspArea(b.text, v => change(() => b.text = v), 4)));
      break;
    case "quote":
      body.appendChild(insp("Quote", inspArea(b.text, v => change(() => b.text = v), 3)));
      body.appendChild(insp("Attribution", inspInput(b.by, v => change(() => b.by = v), "optional")));
      break;
    case "twocol":
      body.appendChild(insp("Left heading", inspInput(b.aTitle, v => change(() => b.aTitle = v))));
      body.appendChild(insp("Left text", inspArea(b.aText, v => change(() => b.aText = v), 5)));
      body.appendChild(insp("Right heading", inspInput(b.bTitle, v => change(() => b.bTitle = v))));
      body.appendChild(insp("Right text", inspArea(b.bText, v => change(() => b.bText = v), 5)));
      break;
    case "table": {
      body.appendChild(insp("Headers (comma separated)", inspInput((b.headers || []).join(", "), v => change(() => b.headers = v.split(",").map(s => s.trim())))));
      body.appendChild(insp("Rows — one per line, cells separated by |",
        inspArea((b.rows || []).map(r => r.join(" | ")).join("\n"),
          v => change(() => b.rows = v.split("\n").filter(x => x.trim()).map(r => r.split("|").map(c => c.trim()))), 8)));
      body.appendChild(insp("Caption", inspInput(b.caption, v => change(() => b.caption = v), "Illustrative — …")));
      const tot = el("label", "check");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!b.totalRow;
      cb.onchange = () => change(() => b.totalRow = cb.checked);
      tot.appendChild(cb); tot.appendChild(document.createTextNode(" Last row is a total"));
      body.appendChild(tot);
      body.appendChild(inspBtn("Make a chart from this table", () => tableToChart(b), "btn-primary"));
      body.appendChild(el("p","insp-note","Tip: paste cells straight from Excel into a new paragraph's Copilot box, or into the paste box — tab-separated rows become a table."));
      break;
    }
    case "chart": {
      body.appendChild(insp("Chart", inspSelect(CHART_KINDS, b.chart || "bar", v => change(() => b.chart = v, true))));
      body.appendChild(insp("Title", inspInput(b.title, v => change(() => b.title = v, true), "optional")));
      body.appendChild(insp("Categories (comma separated)",
        inspInput((b.labels || []).join(", "), v => change(() => b.labels = v.split(/\s*[,;\t]\s*/).map(s => s.trim()).filter(Boolean)))));
      const warn = el("p", "insp-warn");
      const check = () => { const w = chartWarnings(b); warn.innerHTML = w.map(esc).join("<br>"); warn.hidden = !w.length; };
      body.appendChild(insp("Series — one per line:  Name: 1; 2; 3",
        inspArea((b.series || []).map(s => (s.name || "") + ": " + s.values.join("; ")).join("\n"),
          v => change(() => { b.series = parseSeriesText(v); check(); }), 5)));
      body.appendChild(warn);
      check();
      body.appendChild(insp("Unit", inspInput(b.unit, v => change(() => { b.unit = v; check(); }, true), "$M, %, years…")));
      body.appendChild(insp("Caption", inspInput(b.caption, v => change(() => b.caption = v, true))));
      body.appendChild(el("p","insp-note","Numbers can be typed as 1,250 or $1.2M or (4.5) for a negative. Any projection shown to a client should say “Illustrative only…” in the caption."));
      break;
    }
    case "infographic": {
      body.appendChild(insp("Graphic", inspSelect(GRAPHIC_KINDS, b.graphic || "timeline", v => { change(() => b.graphic = v, true); buildInspector(); })));
      body.appendChild(insp("Title", inspInput(b.title, v => change(() => b.title = v, true), "optional")));
      const fields = b.graphic === "compare" ? [{k:"t",ph:"Row label"},{k:"a",ph:"Option A"},{k:"b",ph:"Option B"}]
        : b.graphic === "gauge" ? [{k:"t",ph:"Label"},{k:"d",ph:"Percent, e.g. 78"}]
        : [{k:"t",ph:"Title"},{k:"d",ph:"One short line"}];
      rowsEditor(b.items, fields, {t:"",d:""});
      body.appendChild(insp("Caption", inspInput(b.caption, v => change(() => b.caption = v, true))));
      break;
    }
    case "image": {
      body.appendChild(inspBtn(b.src ? "Replace the picture…" : "Choose a picture…", () => pickFile("image/*", async (f) => {
        snapshot(); b.src = await readImage(f); delete b.seed; render(); buildInspector();
      }), "btn-primary"));
      body.appendChild(insp("Width", inspSelect([{id:"full",name:"Full width"},{id:"two-thirds",name:"Two thirds"},{id:"half",name:"Half"}],
        b.size || "full", v => change(() => b.size = v, true))));
      body.appendChild(insp("Border", inspSelect([{id:"line",name:"Hairline"},{id:"none",name:"None"}], b.frame || "line", v => change(() => b.frame = v, true))));
      body.appendChild(insp("Caption", inspInput(b.caption, v => change(() => b.caption = v, true))));
      break;
    }
    case "space":
      body.appendChild(insp("Height (px)", inspInput(b.h || 18, v => change(() => b.h = Number(v) || 18))));
      break;
    default:
      body.appendChild(el("p","insp-note","Nothing to set on this block."));
  }
}

/* ── Numbers for charts ─────────────────────────────────────────────────── */

/** "$1,250", "4.5%", "(3.2)", "-4", "1.2M" -> number; anything else -> null. */
function readNumber(raw){
  let t = String(raw == null ? "" : raw).replace(/\*\*|==/g, "").trim();
  if (!t || t === "—" || t === "-") return null;
  const neg = /^\(.*\)$/.test(t) || /^[−–-]/.test(t);
  t = t.replace(/^\(|\)$/g, "").replace(/^[−–-]/, "").replace(/[$€£%\s]/g, "").replace(/,/g, "");
  let mult = 1;
  const m = t.match(/^([\d.]+)([kKmMbB])$/);
  if (m){ t = m[1]; mult = {k:1e3, m:1e6, b:1e9}[m[2].toLowerCase()]; }
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t) * mult;
  return neg ? -v : v;
}
/** A comma followed by exactly three digits is a thousands separator ("1,250"). */
function splitValues(text){
  return String(text).split(/\s*[;|\t]\s*|,\s+|,(?!\d{3}(?:\D|$))/).map(x => x.trim()).filter(x => x !== "");
}
function parseSeriesText(v){
  return v.split("\n").filter(x => x.trim()).map(line => {
    const i = line.indexOf(":");
    const name = i > 0 ? line.slice(0, i).trim() : "";
    const raw = splitValues(i > 0 ? line.slice(i + 1) : line);
    const s = {name, values: raw.map(x => { const n = readNumber(x); return n == null ? 0 : n; })};
    const bad = raw.filter(x => readNumber(x) == null);
    if (bad.length) s.bad = bad;
    return s;
  });
}
function chartWarnings(b){
  const w = [], n = (b.labels || []).length;
  (b.series || []).forEach(s => {
    const nm = s.name ? "“" + s.name + "”" : "A series";
    if (s.bad && s.bad.length) w.push(nm + ": could not read " + s.bad.map(x => "“" + x + "”").join(", ") + " — counted as 0.");
    if (s.empty) w.push(nm + ": " + s.empty + (s.empty === 1 ? " empty cell" : " empty cells") + " counted as 0.");
    if (n && s.values.length !== n) w.push(nm + " has " + s.values.length + " numbers for " + n + " categories.");
  });
  if (b.chart === "donut" && (b.series || [])[0]){
    const vals = b.series[0].values;
    const sum = vals.reduce((a, x) => a + x, 0);
    if (/%/.test(b.unit || "") && Math.abs(sum - 100) > 0.5)
      w.push("These add up to " + (Math.round(sum * 10) / 10) + "%, not 100% — the slices are drawn as shares of the total.");
    if (vals.some(x => x < 0)) w.push("A donut cannot show a negative number.");
  }
  return w;
}
function richToPlain(t){ return String(t || "").replace(/\*\*|==/g, "").trim(); }
function tableToChart(t){
  const headers = t.headers || [];
  const rows = (t.rows || []).filter((r, i) => !(t.totalRow && i === t.rows.length - 1));
  if (!rows.length){ toast("The table has no rows yet."); return; }
  const width = Math.max(headers.length, ...rows.map(r => r.length));
  const cols = [];
  for (let c = 1; c < width; c++){
    const vals = rows.map(r => readNumber(r[c]));
    if (vals.filter(v => v != null).length >= Math.ceil(rows.length / 2)){
      const unread = rows.map(r => richToPlain(r[c])).filter((x, i) => vals[i] == null);
      const empty = unread.filter(x => !x || x === "—" || x === "-").length;
      const bad = unread.filter(x => x && x !== "—" && x !== "-");
      cols.push({name: richToPlain(headers[c] || "Series " + c), values: vals.map(v => v == null ? 0 : v), bad, empty,
                 pct: rows.some(r => /%/.test(r[c] || ""))});
    }
  }
  if (!cols.length){ toast("No column of numbers found to chart."); return; }
  const labels = rows.map(r => richToPlain(r[0] || ""));
  const sum = cols[0].values.reduce((a, x) => a + x, 0);
  const kind = cols.length === 1 && cols[0].pct && Math.abs(sum - 100) <= 1 ? "donut"
             : labels.length > 8 && cols.length <= 3 ? "line" : "bar";
  const chart = Object.assign(newBlock("chart"), {
    chart: kind, title: "", labels,
    series: cols.map(c => Object.assign({name: c.name, values: c.values}, c.bad.length ? {bad: c.bad} : {}, c.empty ? {empty: c.empty} : {})),
    unit: cols.every(c => c.pct) ? "%" : "", caption: richToPlain(t.caption || "")
  });
  const at = blockIndex(t.id);
  snapshot();
  deck.sections[at.si].blocks.splice(at.bi + 1, 0, chart);
  selectedId = chart.id;
  syncPanels(); render(); buildInspector();
  toast("Chart added under the table — check the type and add a caption");
}

/* ── Block operations ───────────────────────────────────────────────────── */

function blockIndex(id){
  for (let si = 0; si < deck.sections.length; si++){
    const bi = (deck.sections[si].blocks || []).findIndex(b => b.id === id);
    if (bi >= 0) return {si, bi};
  }
  return null;
}
function moveBlock(id, dir){
  const at = blockIndex(id); if (!at) return;
  const list = deck.sections[at.si].blocks;
  const to = at.bi + dir;
  /* never move into or out of a recommendation page */
  const neighbour = (k) => deck.sections[k] && !deck.sections[k].accountRecommendation;
  snapshot();
  if (to < 0){
    if (!neighbour(at.si - 1)){ undoStack.pop(); toast("Already at the top of the section."); return; }
    const [m] = list.splice(at.bi, 1);
    deck.sections[at.si - 1].blocks.push(m);
  } else if (to >= list.length){
    if (!neighbour(at.si + 1)){ undoStack.pop(); toast("Already at the end of the section."); return; }
    const [m] = list.splice(at.bi, 1);
    deck.sections[at.si + 1].blocks.unshift(m);
  } else {
    const [m] = list.splice(at.bi, 1);
    list.splice(to, 0, m);
  }
  render(); selectBlock(id, false);
}
function deleteBlock(id){
  const at = blockIndex(id); if (!at) return;
  const sec = deck.sections[at.si];
  if (sec.accountRecommendation){
    if (!confirm('Delete the page "' + sec.title + '"?')) return;
    snapshot(); deck.sections.splice(at.si, 1);
  } else {
    snapshot(); sec.blocks.splice(at.bi, 1);
  }
  clearSelection(); syncPanels(); render();
  toast("Deleted — Undo (Ctrl+Z) brings it back");
}
function duplicateBlock(id){
  const at = blockIndex(id); if (!at) return;
  snapshot();
  const copy = JSON.parse(JSON.stringify(deck.sections[at.si].blocks[at.bi]));
  copy.id = uid();
  deck.sections[at.si].blocks.splice(at.bi + 1, 0, copy);
  render(); selectBlock(copy.id, false);
}
/** A new block from the palette or the "+ Add below" menu. */
function insertNewBlock(type, where){
  where = where || addTarget();
  const b = newBlock(type);
  snapshot();
  const at = where.after && blockIndex(where.after);
  if (at && !deck.sections[at.si].accountRecommendation){
    deck.sections[at.si].blocks.splice(at.bi + 1, 0, b);
  } else {
    let sec = deck.sections.find(s => s.id === where.sectionId && !s.accountRecommendation);
    if (!sec){ sec = {id:uid(), title:"New section", brief:"", kicker:"", summary:"", blocks:[]}; deck.sections.push(sec); }
    if (where.top) sec.blocks.unshift(b); else sec.blocks.push(b);
  }
  render(); selectBlock(b.id, true);
  if (type === "image") setTimeout(() => $("inspectorBody").querySelector(".btn-primary")?.click(), 120);
}

/* ── Import: text, files ────────────────────────────────────────────────── */

function insertBlocks(list, where){
  if (!list.length){ toast("Nothing came through — check the text and try again."); return; }
  snapshot();
  let s = where || deck.sections.find(x => x.id === currentSectionId && !x.accountRecommendation)
          || deck.sections.slice().reverse().find(x => !x.accountRecommendation);
  if (!s){ s = {id:uid(), title:"New section", brief:"", kicker:"", summary:"", blocks:[]}; deck.sections.push(s); }
  s.blocks.push(...list);
  syncPanels(); render(); jumpToSection(s);
  toast(list.length + (list.length === 1 ? " block" : " blocks") + " added to “" + (s.title || "section") + "”");
}
/** Split a run of blocks into sections at each top-level heading. */
function sectionsFromBlocks(list){
  const parts = [];
  let current = null;
  list.forEach(b => {
    if (b.type === "heading" && b.level === 2){
      current = {title: String(b.text || "").trim(), blocks: []};
      parts.push(current);
      return;
    }
    if (!current){ current = {title: null, blocks: []}; parts.push(current); }
    current.blocks.push(b);
  });
  return parts.filter(p => p.title || p.blocks.length);
}
/** A part whose heading matches a section refills it (visuals stay); others become new sections. */
function mergeSections(parts){
  if (!parts.length) return;
  snapshot();
  let added = 0, filled = 0;
  parts.forEach(part => {
    if (!part.title){
      if (part.blocks.length){
        let first = deck.sections.find(s => !s.accountRecommendation);
        if (!first){ first = {id:uid(), title:"Section one", blocks:[]}; deck.sections.unshift(first); }
        first.blocks.unshift(...part.blocks);
      }
      return;
    }
    const hit = deck.sections.find(sec => !sec.accountRecommendation &&
      (sec.title || "").trim().toLowerCase() === part.title.toLowerCase());
    if (hit){ hit.blocks = replaceWords(hit.blocks, part.blocks); filled++; }
    else { deck.sections.push({id:uid(), title:part.title, brief:part.title, kicker:"", summary:"", blocks:part.blocks}); added++; }
  });
  selectedId = null;
  syncPanels(); render();
  const bits = [];
  if (filled) bits.push(filled + " section" + (filled === 1 ? "" : "s") + " filled");
  if (added)  bits.push(added + " added");
  toast(bits.join(", ") || "Nothing to add");
}
function insertAsSections(text){
  const parts = sectionsFromBlocks(parseText(text));
  if (!parts.some(p => p.title)){ insertBlocks(parseText(text)); return; }
  mergeSections(parts);
}

function showBorrowDialog(){
  const rows = PIECE_CARDS.filter(c => c.kind !== "blank").map(c => {
    const items = (TEMPLATES[c.kind].sections || []).map((sec, i) =>
      '<label class="check"><input type="checkbox" data-kind="' + c.kind + '" data-i="' + i + '"> ' + esc(sec.title) + "</label>").join("");
    return "<h3>" + esc(c.name) + "</h3>" + items;
  }).join("");
  showModal("Add sections from another template", `
    <p class="hint">Tick the sections you want; they are added at the end with their starter blocks
    and their Copilot prompts.</p>
    <div class="borrow-grid">${rows}</div>
    <div class="modal-actions"><button class="btn btn-ghost" id="btnBorrowCancel">Cancel</button>
      <button class="btn btn-primary" id="btnBorrowAdd">Add the ticked sections</button></div>`, {wide:true});
  $("btnBorrowCancel").onclick = hideModal;
  $("btnBorrowAdd").onclick = () => {
    const picks = $$("#modalBody input[type=checkbox]").filter(c => c.checked);
    if (!picks.length){ toast("Nothing ticked."); return; }
    snapshot();
    picks.forEach(c => {
      const src = TEMPLATES[c.dataset.kind].sections[Number(c.dataset.i)];
      deck.sections.push({id: uid(), title: src.title, brief: src.title, kicker: src.kicker || "", summary: src.summary || "",
        blocks: (src.blocks || []).map(b => Object.assign(structuredClone(b), {id: uid(), seed: true}))});
    });
    hideModal(); syncPanels(); render();
    toast(picks.length + " section" + (picks.length === 1 ? "" : "s") + " added");
  };
}

function pickFile(accept, cb){
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = accept;
  inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); };
  inp.click();
}

async function handleFiles(files){
  for (const f of Array.from(files)){
    const name = f.name.toLowerCase();
    try{
      if (name.endsWith(".docx")){
        const blocks = await readDocx(f);
        const parts = sectionsFromBlocks(blocks);
        if (parts.some(p => p.title)) mergeSections(parts); else insertBlocks(blocks);
      } else if (name.endsWith(".json")){
        openAnyJSON(await readTextFile(f));
      } else if (name.endsWith(".pdf")){
        const text = await readPdfText(f);
        if (!text.trim()){
          alert("No text came out of that PDF — it is probably a scan or an image-only export.\n\nCopy the text out of the PDF viewer and paste it, or take a screenshot and drop that in as a picture.");
        } else {
          $("pasteBox").value = text;
          showRail("copilot");
          $("pasteCard").scrollIntoView({block:"center"});
          alert("The PDF's text is in the paste box for you to check before it goes in.\n\n" + PDF_CAVEAT);
        }
      } else if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)){
        const b = newBlock("image");
        b.src = await readImage(f); b.caption = "";
        insertBlocks([b]);
      } else {
        insertAsSections(await readTextFile(f));
      }
    } catch (err){
      alert("Could not read " + f.name + ".\n\n" + (err && err.message ? err.message : err));
    }
  }
}
/** A dropped or opened .json: a saved working file opens; anything else is Presentation JSON. */
function openAnyJSON(text){
  let d;
  try { d = parseJSONLoose(text); } catch (e){ alert(e.message); return; }
  if (d && d.sections && d.meta && d.cover && d.version) return openDeckJSON(text);
  if (Array.isArray(d) && d.length && d[0] && d[0].portfolioName){
    showModal("Portfolio library backup", "<p>This looks like a portfolio library backup. Import it from the library.</p>");
    return;
  }
  smartPaste(text);
}

/* ── Save / open ────────────────────────────────────────────────────────── */

function fileStem(){
  const t = (deck.meta.docTitle || deck.meta.client || deck.meta.title || "presentation")
    .replace(/[^\w\s-]/g,"").replace(/\s+/g,"_").slice(0, 60);
  return t + "_" + (deck.meta.date || "");
}
function commitEdits(){ const a = document.activeElement; if (a && a !== document.body && a.closest && a.closest("#pages")) a.blur(); }
function saveDeck(){
  commitEdits();
  downloadFile(fileStem() + ".mhwg.json", JSON.stringify(deck, null, 2));
  markClean("saved to your Downloads folder");
}
function openDeckJSON(text){
  let d;
  try { d = JSON.parse(text); }
  catch { alert("That file is not a saved presentation."); return; }
  if (!d || !d.sections){ alert("That file is not a saved presentation."); return; }
  snapshot();
  deck = migrate(d);
  selectedId = null; currentSectionId = null; openSectionId = null;
  syncPanels();
  markClean("no changes since opening"); autosave();
  render();
  hideModal();
  showRail("build");
  toast("Opened");
}
function migrate(d){
  d.version = d.version || 1;
  d.meta = d.meta || {};
  d.cover = d.cover || {style:"white", image:""};
  d.design = Object.assign({accent:"gold", density:"comfortable", look:"private", format:"report"}, d.design || {});
  d.options = Object.assign({toc:true, dividers:false, sectionBreak:true, team:true, disclosures:true,
    draft:true, confidential:true, pageNumbers:true, watermark:false, runningHead:true}, d.options || {});
  d.team = d.team && d.team.length ? d.team : BRAND.team.map(m => Object.assign({}, m));
  d.contact = Object.assign({firm:BRAND.firm, address:BRAND.address, phone:BRAND.phone, web:BRAND.web}, d.contact || {});
  d.disclosures = d.disclosures && d.disclosures.length ? d.disclosures : BRAND.disclosures.slice();
  d.sections = (d.sections || []).map(s => Object.assign({id:uid(), title:"", blocks:[]}, s));
  d.sections.forEach(s => { s.blocks = (s.blocks || []).filter(Boolean); });
  d.guideNumbers = Array.isArray(d.guideNumbers) ? d.guideNumbers : null;
  d.drafts = d.drafts && typeof d.drafts === "object" ? d.drafts : {};
  d.sources = d.sources && typeof d.sources === "object" ? d.sources : {};
  delete d.wizard;
  /* No network, ever: a picture must be embedded in the file. */
  const local = v => !v || /^data:image\//i.test(v);
  let dropped = 0;
  if (!local(d.cover.image)){ d.cover.image = ""; dropped++; }
  d.sections.forEach(s => (s.blocks || []).forEach(b => { if (b.type === "image" && !local(b.src)){ b.src = ""; dropped++; } }));
  if (dropped) setTimeout(() => toast(dropped + (dropped === 1 ? " picture was a web link" : " pictures were web links") +
    " — removed, this program never loads anything from the internet. Drop the picture file in instead.", 7000), 50);
  migrateRecommendations(d);
  return d;
}

/* ── Export ─────────────────────────────────────────────────────────────── */

function layoutProblems(){
  return $$(".page", $("pages")).map((p, i) => ({page: i + 1, node: p})).filter(x => x.node.querySelector(".page-overflow"));
}
function exportPdf(force){
  commitEdits();
  const gaps = gapCount(deck.sections.map(s => s.blocks));
  if (gaps && force !== true && force !== "gaps"){
    showModal("Notes for the advisor are still in the text", `
      <p>${gaps} place${gaps === 1 ? "" : "s"} still say <b>[NEEDS ADVISOR INPUT]</b> or
      <b>[SOURCE CONFLICT]</b> — they are highlighted on the page and would print in the PDF.</p>
      <div class="modal-actions"><button class="btn btn-ghost" id="btnGapsAnyway">Export anyway</button>
         <button class="btn btn-primary" id="btnShowGaps">Show me</button></div>`);
    $("btnShowGaps").onclick = () => { hideModal(); showRail("finish"); };
    $("btnGapsAnyway").onclick = () => exportPdf("gaps");
    return;
  }
  const cut = layoutProblems();
  if (cut.length && force !== true){
    showModal("Something would be cut off", `
      <p>On ${cut.length === 1 ? "page " + cut[0].page : "pages " + cut.map(c => c.page).join(", ")}
      something runs past the bottom of the page. The PDF would cut it off without any mark.</p>
      <p>Usually it is a picture that is too tall, a chart with a lot in it, or one very long
      sentence. Shrink the picture, split the text, or add a page break.</p>
      <div class="modal-actions"><button class="btn btn-ghost" id="btnPrintAnyway">Export anyway</button>
         <button class="btn btn-primary" id="btnShowCut">Show me</button></div>`);
    $("btnShowCut").onclick = () => { hideModal(); cut[0].node.scrollIntoView({block:"start", behavior:"smooth"}); };
    $("btnPrintAnyway").onclick = () => exportPdf(true);
    return;
  }
  const slides = deck.design.format === "slides";
  showModal("Export the PDF", `
    <p>The PDF comes out of the browser's own print engine, so the type stays sharp and selectable.</p>
    <h3>In the print window</h3>
    <ol>
      <li><b>Destination:</b> Save as PDF</li>
      <li><b>Layout:</b> ${slides ? "Landscape" : "Portrait"} &nbsp;·&nbsp; <b>Paper:</b> ${slides ? "leave as set" : "Letter"}</li>
      <li><b>Margins:</b> None &nbsp;·&nbsp; <b>Scale:</b> Default (100%)</li>
      <li>Under <b>More settings</b>: <b>Background graphics ON</b> (or the green cover prints white)
          and <b>Headers and footers OFF</b></li>
    </ol>
    <div class="callout">These settings stick after the first time on this computer.</div>
    <div class="modal-actions"><button class="btn btn-primary" id="btnDoPrint">Open the print window</button></div>`);
  $("btnDoPrint").onclick = () => { hideModal(); setPrintPage(); setTimeout(() => window.print(), 60); };
}
function setPrintPage(){
  let st = $("printPageSize");
  if (!st){ st = document.createElement("style"); st.id = "printPageSize"; document.head.appendChild(st); }
  st.textContent = deck.design.format === "slides" ? "@page{size:13.333in 7.5in;margin:0}" : "@page{size:letter;margin:0}";
}

/* ── Present: full screen, one page at a time ───────────────────────────── */

let presentAt = 0, presentPages = [];
function presentLayout(){
  let host = $("presentHost");
  if (!host){
    host = document.createElement("div");
    host.id = "presentHost";
    host.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;";
    document.body.appendChild(host);
  }
  host.className = "pages doc";
  const show = Object.assign({}, deck, {design: Object.assign({}, deck.design, {format: "slides"})});
  layout(show, host);
  presentPages = $$(".page", host);
}
function present(){
  commitEdits();
  presentLayout();
  if (!presentPages.length) return;
  let ov = $("presentView");
  if (!ov){
    ov = document.createElement("div");
    ov.id = "presentView";
    ov.className = "present";
    ov.innerHTML = '<div class="present-stage"></div><div class="present-bar"><span id="presentCount"></span>' +
      '<span>← → to move · Esc to finish</span></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => {
      if (e.target.closest(".present-bar")) return;
      presentGo(presentAt + (e.clientX > window.innerWidth / 3 ? 1 : -1));
    });
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) presentEnd(); else presentGo(presentAt); });
    window.addEventListener("resize", () => { if (!ov.hidden) presentGo(presentAt); });
  }
  ov.hidden = false;
  presentGo(0);
  if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
}
function presentGo(i){
  presentAt = Math.max(0, Math.min(presentPages.length - 1, i));
  const ov = $("presentView"), stage = ov.querySelector(".present-stage");
  stage.innerHTML = "";
  const holder = el("div", "doc");
  ["accent", "density", "look", "format"].forEach(k => holder.dataset[k] = $("presentHost").dataset[k] || "");
  const p = presentPages[presentAt].cloneNode(true);
  p.querySelectorAll("[contenteditable]").forEach(n => n.removeAttribute("contenteditable"));
  p.querySelectorAll(".page-overflow,.blk-tag,.blk-quickbar").forEach(n => n.remove());
  const w = parseFloat(getComputedStyle($("presentHost")).getPropertyValue("--pw")) || 1280;
  const h = parseFloat(getComputedStyle($("presentHost")).getPropertyValue("--ph")) || 720;
  p.style.zoom = Math.min(window.innerWidth / w, (window.innerHeight - 34) / h);
  p.style.boxShadow = "none";
  holder.appendChild(p);
  stage.appendChild(holder);
  $("presentCount").textContent = (presentAt + 1) + " / " + presentPages.length;
}
function presentEnd(){
  const ov = $("presentView");
  if (!ov || ov.hidden) return;
  ov.hidden = true;
  $("presentHost").innerHTML = "";
  presentPages = [];
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/* ── Modal, help, welcome ───────────────────────────────────────────────── */

function showModal(title, html, opts){
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").querySelector(".modal-card").classList.toggle("is-wide", !!(opts && opts.wide));
  $("modal").hidden = false;
  $("modalBody").scrollTop = 0;
}
function hideModal(){ $("modal").hidden = true; }

function showHelp(){
  showModal("How this works", `
    <h3>Five steps, left to right</h3>
    <ol>
      <li><b>Start</b> — what you are making, who it is for, report or slides.</li>
      <li><b>Build</b> — the sections. Click any text on the page and type over it. Point at a block for its
        tools; click it to see its settings on the right. Add sections, blocks and account recommendations here.</li>
      <li><b>Copilot &amp; JSON</b> — copy a prompt into Copilot, paste its answer back. Text or JSON, the
        program works out which and shows you a preview first.</li>
      <li><b>Style</b> — cover, page style, which pages are included, team, disclosures.</li>
      <li><b>Finish</b> — a check list of anything left to do, the DRAFT tag, Save and Export PDF.</li>
    </ol>
    <h3>Nothing leaves this computer</h3>
    <p>The program never connects to anything — no internet, no AI, no cloud. Copilot runs where it always
    does; you carry prompts to it and answers back by copy and paste.</p>
    <h3>The paste format (for typing or Copilot)</h3>
    <ul>
      <li><code># Section</code> and <code>## Sub-heading</code> · <code>- bullet</code> · <code>1. numbered</code></li>
      <li><code>&gt; one sentence</code> becomes a callout · <code>Label: value</code> becomes a fact row</li>
      <li><code>$1.2M | Projected at 65 | note</code> becomes a key-number card</li>
      <li><code>| Option | Cost |</code> becomes a table — or paste cells straight from Excel</li>
      <li><code>1. Title - detail (Owner: Us, When: 30 days)</code> becomes an action plan</li>
      <li><code>**bold**</code> and <code>==one highlighted phrase==</code></li>
    </ul>
    <h3>Keyboard</h3>
    <p><code>Ctrl+Z</code> undo · <code>Ctrl+Y</code> redo · <code>Ctrl+S</code> save · <code>Ctrl+P</code> export ·
    <code>Enter</code> finishes editing a line · <code>Delete</code> removes the selected block.</p>
    <h3>Saving</h3>
    <p><b>Save</b> writes a <code>.mhwg.json</code> working file to Downloads — the file you reopen to change the
    piece later. The browser also keeps a working copy so nothing is lost if the window closes.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="btnClearLocal">Clear the working copy from this browser</button>
      <button class="btn" id="btnHelpJSON">JSON format</button>
      <button class="btn btn-primary" id="btnHelpWelcome">Show the welcome screen</button></div>`, {wide:true});
  $("btnClearLocal").onclick = () => { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e){} toast("Working copy cleared from this browser"); };
  $("btnHelpJSON").onclick = showJSONReference;
  $("btnHelpWelcome").onclick = () => showWelcome(false);
}

/** The front door: what are you making, who for, and how will you fill it in. */
function showWelcome(isNew){
  let kind = isNew ? "plan_summary" : deck.meta.kind;
  showModal(isNew ? "New presentation" : "Welcome to Presentation Studio", `
    <div class="welcome">
      <p class="lede">Make a polished, on-brand client presentation. Pick what you are making,
        then choose how you want to fill it in — you can mix all three.</p>
      <h3>1 · What are you making?</h3>
      <div class="piece-grid wide" id="wcKinds"></div>
      <label class="field"><span>Prepared for (optional)</span><input id="wcClient" placeholder="Robert &amp; Anne Kowalchuk"></label>
      <h3>2 · How do you want to fill it in?</h3>
      <div class="route-grid">
        <button class="route-btn big" data-route="type"><i>&#9998;</i><b>I'll type it</b>
          <span>The template's sections appear with sample text. Click any text on the page and type over it.</span></button>
        <button class="route-btn big" data-route="copilot"><i>&#10022;</i><b>Copilot writes it</b>
          <span>Copy one prompt into Copilot with your notes, paste its answer back. Laid out for you.</span></button>
        <button class="route-btn big" data-route="json"><i>{&#8202;}</i><b>I have JSON</b>
          <span>A whole presentation from Copilot, a script or a coder, in one paste.</span></button>
      </div>
      <p class="hint center">${isNew ? "Unsaved changes to the current piece are lost — Cancel and Save first if you need them." : "Already started? <a href='#' id='wcOpen'>Open a saved file</a> or just close this."}</p>
    </div>`, {wide:true});
  const kinds = $("wcKinds");
  const drawKinds = () => {
    kinds.innerHTML = "";
    PIECE_CARDS.forEach(c => {
      const b = el("button", "piece-card" + (c.kind === kind ? " is-on" : ""), "<b>" + esc(c.name) + "</b><span>" + esc(c.note) + "</span>");
      b.onclick = () => { kind = c.kind; drawKinds(); };
      kinds.appendChild(b);
    });
  };
  drawKinds();
  if (!isNew) $("wcClient").value = deck.meta.client || "";
  if ($("wcOpen")) $("wcOpen").onclick = (e) => { e.preventDefault(); $("btnOpen").click(); };
  $$("#modalBody .route-btn").forEach(btn => btn.onclick = () => {
    try { localStorage.setItem(WELCOMED_KEY, "1"); } catch (e){}
    const client = $("wcClient").value.trim();
    if (isNew || kind !== deck.meta.kind || !deckIsStarter()){
      if (!isNew && !deckIsStarter() && kind !== deck.meta.kind && !confirm("Replace the current sections with the new template?")) return;
      snapshot();
      const d = newDeck(kind);
      if (!isNew){ d.team = deck.team; d.contact = deck.contact; d.design = deck.design; d.cover = deck.cover; }
      deck = d;
      redoStack = [];
    }
    deck.meta.client = client;
    if (client) deck.meta.title = titleIdeas(kind, client)[0] || deck.meta.title;
    selectedId = null; currentSectionId = null; openSectionId = null;
    hideModal();
    syncPanels();
    if (isNew) markClean("not saved yet");
    render(); autosave();
    const route = btn.dataset.route;
    if (route === "type"){ showRail("build"); toast("Click any text on the page and type over it."); }
    else if (route === "copilot"){ showRail("copilot"); setPromptKind("text"); }
    else { goJSON(); }
  });
}
function goJSON(){
  showRail("copilot");
  setPromptKind("json");
  $("pasteCard").scrollIntoView({block:"center", behavior:"smooth"});
  $("pasteBox").focus();
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */

function showRail(name){
  $$(".rail-tab").forEach(t => t.classList.toggle("is-active", t.dataset.panel === name));
  $$(".panel").forEach(p => p.classList.toggle("is-active", p.dataset.panel === name));
  const panel = document.querySelector('.panel[data-panel="' + name + '"]');
  if (panel) panel.scrollTop = 0;
  if (name === "finish") buildCheckList();
  if (name === "copilot") showPrompt();
}
function go(target){
  if (target === "copilot-json") goJSON();
  else showRail(target);
}

function wire(){
  $$(".rail-tab").forEach(t => t.onclick = () => showRail(t.dataset.panel));
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));

  /* top bar */
  $("docTitle").oninput = () => { deck.meta.docTitle = $("docTitle").value; markDirty(); };
  $("btnUndo").onclick = undo;
  $("btnRedo").onclick = redo;
  $("btnNew").onclick = () => showWelcome(true);
  $("btnOpen").onclick = () => pickFile(".json", async f => openAnyJSON(await readTextFile(f)));
  $("btnSave").onclick = saveDeck;
  $("btnSave2").onclick = saveDeck;
  $("btnPresent").onclick = present;
  $("btnPresent2").onclick = present;
  $("btnHelp").onclick = showHelp;
  $("btnExport").onclick = () => exportPdf();
  $("btnExport2").onclick = () => exportPdf();
  $("btnModalClose").onclick = hideModal;
  $("modal").addEventListener("mousedown", (e) => { if (e.target === $("modal")) hideModal(); });

  /* start + style fields */
  FIELD_MAP.forEach(([id, , set]) => {
    const n = $(id); if (!n) return;
    const ev = n.tagName === "SELECT" || n.type === "date" ? "onchange" : "oninput";
    n[ev] = () => {
      set(deck, n.value);
      if (id === "fldClient") buildTitlePicker();
      if (id === "fldTitle") buildTitlePicker();
      relayoutSoon();
    };
  });
  $("fldClient").onchange = () => {
    /* a typed name makes the surname title the first suggestion; use it if the title is still a house one */
    const ideas = titleIdeas(deck.meta.kind, deck.meta.client);
    if (ideas[0] && /^The .+/.test(ideas[0]) && Object.values(TITLE_IDEAS).some(l => l.includes(deck.meta.title))){
      deck.meta.title = ideas[0]; $("fldTitle").value = ideas[0]; buildTitlePicker(); render();
    }
  };
  $("fldTitleIdea").onchange = () => {
    const v = $("fldTitleIdea").value;
    if (!v) return;
    deck.meta.title = v; $("fldTitle").value = v; render();
  };
  OPTION_MAP.forEach(([id, key]) => {
    $(id).onchange = () => {
      if (key === "draft") return setDraft($(id).checked);
      snapshot(); deck.options[key] = $(id).checked; render();
    };
  });
  $$('input[name="accent"]').forEach(r => r.onchange = () => { snapshot(); deck.design.accent = r.value; render(); });
  $$('input[name="density"]').forEach(r => r.onchange = () => { snapshot(); deck.design.density = r.value; render(); });
  $("btnCoverImage").onclick = () => pickFile("image/*", async f => {
    snapshot(); deck.cover.image = await readImage(f); deck.cover.style = "photo"; buildSwatches(); render();
  });
  $("btnAddMember").onclick = () => { snapshot(); deck.team.push({name:"", desig:"", title:""}); buildTeamEditor(); render(); };
  $("fldDisclosures").oninput = () => {
    deck.disclosures = $("fldDisclosures").value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    relayoutSoon();
  };
  $("btnResetDisc").onclick = () => {
    snapshot(); deck.disclosures = BRAND.disclosures.slice();
    $("fldDisclosures").value = deck.disclosures.join("\n\n"); render();
  };

  /* build */
  $("presetPick").innerHTML = SECTION_PRESETS.map(([id, name]) => '<option value="' + id + '">' + esc(name) + "</option>").join("");
  $("btnAddSection").onclick = () => addPresetSection($("presetPick").value);
  $("btnAddRec").onclick = openRecommendationDialog;
  $("btnBorrow").onclick = showBorrowDialog;
  const pal = $("palette");
  BLOCK_KINDS.forEach(k => {
    const b = el("button", "", "<b>" + esc(k.label) + "</b><span>" + esc(k.note) + "</span>");
    b.type = "button";
    b.onclick = () => insertNewBlock(k.type);
    pal.appendChild(b);
  });
  $("btnBrowse").onclick = () => $("fileInput").click();
  $("fileInput").onchange = (e) => { handleFiles(e.target.files); e.target.value = ""; };
  const dz = $("dropzone");
  ["dragenter","dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave","drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", e => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  $("canvas").addEventListener("dragover", e => e.preventDefault());
  $("canvas").addEventListener("drop", e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  /* copilot & json */
  $("fldMessage").oninput = () => {
    deck.sources = deck.sources || {};
    deck.sources.message = {note: $("fldMessage").value};
    markDirty(); showPrompt();
  };
  $("btnAddNum").onclick = () => { snapshot(); (deck.guideNumbers = deck.guideNumbers || []).push({k:"", v:"", note:""}); buildNumbers(); markDirty(); };
  $("btnNumStats").onclick = () => numbersToPage("stats");
  $("btnNumFacts").onclick = () => numbersToPage("facts");
  $$('input[name="promptKind"]').forEach(r => r.onchange = buildPromptPicker);
  $("promptSection").onchange = () => { currentSectionId = $("promptSection").value; showPrompt(); };
  $("promptTool").onchange = showPrompt;
  $("btnCopyPrompt").onclick = () => copyText(currentPromptText(),
    "Prompt copied — paste it into Copilot, add your notes, then paste the answer into step 3.");
  $("pasteBox").placeholder = "Paste Copilot's whole answer here — formatted text or JSON.\n\n" +
    "# What we heard\nA short opening line.\n- bullet\nLabel: value\n$1.2M | Projected at 65 | illustrative";
  $("btnSmartPaste").onclick = () => { if (smartPaste($("pasteBox").value)) $("pasteBox").dataset.used = "1"; };
  $("btnClearPaste").onclick = () => { $("pasteBox").value = ""; $("pasteBox").focus(); };
  $("btnWordDraft").onclick = () => { downloadDocxDraft(deck); toast("Word draft saved to Downloads — fill it in, then drop it on the page."); };
  $("btnCopyJSON").onclick = () => copyText(presentationToJSON(false), "Presentation copied as JSON.");
  $("btnDownloadJSON").onclick = () => downloadFile(fileStem() + ".presentation.json", presentationToJSON(true));
  $("btnJSONRef").onclick = showJSONReference;
  $("btnLibrary").onclick = openPortfolioLibrary;

  /* finish */
  $("btnRecheck").onclick = () => { render(); buildCheckList(); toast("Checked"); };

  /* inspector */
  $("btnCloseInspector").onclick = clearSelection;
  $("btnBlockUp").onclick = () => selectedId && moveBlock(selectedId, -1);
  $("btnBlockDown").onclick = () => selectedId && moveBlock(selectedId, 1);
  $("btnBlockDup").onclick = () => selectedId && duplicateBlock(selectedId);
  $("btnBlockDelete").onclick = () => selectedId && deleteBlock(selectedId);
  $("btnBlockCopilot").onclick = () => selectedId && openBlockCopilot(selectedId);

  /* the page itself */
  const host = $("pages");
  host.addEventListener("click", (e) => {
    if (e.target.closest(".blk-quickbar")) return;
    const hit = e.target.closest(".blk-hit");
    if (hit && !hit.dataset.bid.startsWith("sec-")) selectBlock(hit.dataset.bid, false);
    else if (hit){ currentSectionId = hit.dataset.bid.slice(4); clearSelection(); }
    else if (!e.target.closest(".is-editable")) clearSelection();
  });
  host.addEventListener("focusin", (e) => {
    const ed = e.target.closest(".is-editable");
    if (ed) ed._before = ed.innerHTML;
  });
  /* Pasting onto the page goes in as plain text: rich paste from Word or Outlook can
     carry pictures that are web links, which the browser would fetch. */
  const plainInto = (e, text) => {
    e.preventDefault();
    document.execCommand("insertText", false, String(text || "").replace(/\s*\n\s*/g, " "));
  };
  host.addEventListener("paste", (e) => {
    if (!(e.target.closest && e.target.closest(".is-editable"))) return;
    let text = e.clipboardData.getData("text/plain");
    if (!text.trim()) text = richToPlain(htmlToRich(e.clipboardData.getData("text/html") || ""));
    plainInto(e, text);
  });
  host.addEventListener("drop", (e) => {
    if (!(e.target.closest && e.target.closest(".is-editable"))) return;
    if (e.dataTransfer.files.length) return;
    plainInto(e, e.dataTransfer.getData("text/plain"));
  });
  host.addEventListener("focusout", (e) => {
    const ed = e.target.closest(".is-editable");
    if (!ed || ed.innerHTML === ed._before) return;
    const bid = ed.dataset.bid;
    if (bid && bid.startsWith("sec-")){
      const sec = deck.sections.find(s => "sec-" + s.id === bid);
      if (!sec) return;
      snapshot();
      sec[ed.dataset.path === "kicker" ? "kicker" : "title"] = htmlToRich(ed.innerHTML);
      buildOutline(); render();
      return;
    }
    const found = findBlock(bid);
    if (!found) return;
    snapshot();
    let path = ed.dataset.path, value = htmlToRich(ed.innerHTML);
    /* a block split across pages: write back into this fragment's part only */
    const frag = ed.closest(".blk");
    if (frag && frag.dataset.off != null){
      const off = +frag.dataset.off, len = +frag.dataset.len;
      const seg = path.split(".");
      if ((seg[0] === "items" || seg[0] === "rows") && seg.length > 1){
        seg[1] = String(+seg[1] + off);
        path = seg.join(".");
      } else if (path === "text" && SPLITTABLE[found.block.type]){
        const units = SPLITTABLE[found.block.type].units(found.block);
        if (off + len < units.length && String(value).trim() && !/[.!?:;]["”’)]*\s*$/.test(value)) value = String(value).trim() + ".";
        units.splice(off, len, value);
        value = units.filter(u => String(u).trim()).join(" ");
      }
    }
    setPath(found.block, path, value);
    delete found.block.seed;
    buildOutline(); render();
    if (selectedId === found.block.id) buildInspector();
  });
  host.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && e.target.closest(".is-editable")){ e.preventDefault(); e.target.blur(); }
    if (e.key === "Escape" && e.target.closest(".is-editable")) e.target.blur();
  });
  $("optEditInline").onchange = render;

  /* zoom */
  $("btnZoomIn").onclick = () => { zoom = Math.min(1.6, (zoom || fitZoom()) + 0.1); applyZoom(); };
  $("btnZoomOut").onclick = () => { zoom = Math.max(0.3, (zoom || fitZoom()) - 0.1); applyZoom(); };
  $("zoomLabel").onclick = () => { zoom = 0; applyZoom(); };
  window.addEventListener("resize", () => { if (!zoom) applyZoom(); });

  /* close the insert menu on any outside click */
  document.addEventListener("mousedown", (e) => {
    if (!$("insertMenu").hidden && !e.target.closest("#insertMenu")) $("insertMenu").hidden = true;
  });

  /* keyboard */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s"){ e.preventDefault(); saveDeck(); }
    if (mod && e.key.toLowerCase() === "p"){ e.preventDefault(); exportPdf(); }
    if (mod && e.key.toLowerCase() === "z" && !typing){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (mod && e.key.toLowerCase() === "y" && !typing){ e.preventDefault(); redo(); }
    if ((e.key === "Delete") && selectedId && !typing && $("modal").hidden) deleteBlock(selectedId);
    if (e.key === "Escape"){
      if (!$("insertMenu").hidden) $("insertMenu").hidden = true;
      else if (!$("modal").hidden) hideModal();
      else if (selectedId && !typing) clearSelection();
    }
    if ($("presentView") && !$("presentView").hidden){
      if (["ArrowRight","ArrowDown","PageDown"," ","Enter"].includes(e.key)){ e.preventDefault(); presentGo(presentAt + 1); }
      if (["ArrowLeft","ArrowUp","PageUp","Backspace"].includes(e.key)){ e.preventDefault(); presentGo(presentAt - 1); }
      if (e.key === "Home") presentGo(0);
      if (e.key === "End") presentGo(1e6);
      if (e.key === "Escape") presentEnd();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    const a = document.activeElement;
    if (a && a.closest && a.closest(".is-editable")) a.blur();
    autosave();
    if ($("saveState").textContent.startsWith("unsaved")){ e.preventDefault(); e.returnValue = ""; }
  });
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

function boot(){
  loadPortfolioLibrary();
  let restored = null;
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) restored = JSON.parse(saved);
  } catch (e){}
  deck = restored && restored.sections ? migrate(restored) : newDeck("plan_summary");
  $$("[data-wordmark]").forEach(n => n.appendChild(wordmark()));
  wire();
  syncPanels();
  markClean(restored ? "restored from this browser" : "not saved yet");
  render();
  if (restored) showRail("build");
  /* web fonts change every measurement, so lay out again once they are in */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  let welcomed = false;
  try { welcomed = !!localStorage.getItem(WELCOMED_KEY); } catch (e){}
  if (!restored && !welcomed) showWelcome(false);
}
document.addEventListener("DOMContentLoaded", boot);
