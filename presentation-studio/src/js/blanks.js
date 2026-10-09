/* ==========================================================================
   blanks.js — the yellow [[blanks]] as one short form, and "check" marks.

   1. FILL IN THE BLANKS (Edit tab). Every [[blank]] and [NEEDS ADVISOR
      INPUT] note in the document is listed as one row with a box to type in.
      Type, press Enter, and the page fills itself. collectBlanks() finds
      them; fillBlank() writes one answer into the deck.
   2. COPILOT FILLS BLANKS FROM YOUR NOTES. The one Copilot prompt
      (smart.js slotPrompt) also lists the blanks, numbered b1, b2 …;
      blankPromptPart() writes that list and remembers which blank each
      number is (deck.blankKeys); applyBlankAnswers() puts Copilot's answers
      back.
   3. "CHECK" MARKS. Anything Copilot wrote is marked to read over
      (deck.toCheck = {blockId: true}). The mark shows on screen only, never
      in the PDF. Editing the block, or pressing "✓ Looks right" on it,
      clears the mark. The Finish checklist lists what is left.
   ========================================================================== */

/* Block types that are drawn from settings, never typed into. */
const BLANK_SKIP_TYPES = ["recommendation", "householdSummary"];
/* Keys that are settings, not words. */
const BLANK_SKIP_KEYS = new Set(["id", "type", "seed", "src", "slot", "slotHint", "chart", "graphic", "style",
  "tone", "size", "frame", "unit", "level", "cols", "source", "from"]);

/** Every blank in the document, in reading order:
    [{bid, path, raw, occ, label, context, section, inSlot}] */
function collectBlanks(d){
  d = d || deck;
  const out = [];
  d.sections.forEach(s => {
    if (s.accountRecommendation || s.recommendationOverview) return;
    (s.blocks || []).forEach(b => {
      if (BLANK_SKIP_TYPES.includes(b.type)) return;
      walkStrings(b, "", (str, path) => {
        const seen = {};
        (str.match(GAP_RE) || []).forEach(raw => {
          const occ = seen[raw] = (seen[raw] == null ? 0 : seen[raw] + 1);
          out.push({bid: b.id, path, raw, occ, label: blankLabel(raw), context: blankContext(b, path),
                    section: s.title || "", inSlot: !!b.slot});
        });
      });
    });
  });
  return out;
}
function walkStrings(v, path, fn){
  if (typeof v === "string"){ if (v.indexOf("[") >= 0) fn(v, path); return; }
  if (Array.isArray(v)){ v.forEach((x, i) => walkStrings(x, path ? path + "." + i : String(i), fn)); return; }
  if (v && typeof v === "object") Object.keys(v).forEach(k => {
    if (!BLANK_SKIP_KEYS.has(k) && !k.startsWith("_")) walkStrings(v[k], path ? path + "." + k : k, fn);
  });
}
/** "[[By when]]" -> "By when"; "[NEEDS ADVISOR INPUT: pension amount]" -> "pension amount" */
function blankLabel(raw){
  const t = raw.replace(/^\[\[|\]\]$/g, "").replace(/^\[(NEEDS ADVISOR INPUT|SOURCE CONFLICT)\s*:?\s*|\]$/gi, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Advisor input";
}
/** A few words that say where the blank sits: the fact row's label, the action's title. */
function blankContext(b, path){
  const m = path.match(/^items\.(\d+)\.(\w+)$/);
  if (!m) return "";
  const it = (b.items || [])[+m[1]] || {};
  const name = m[2] === "k" || m[2] === "t" ? "" : richToPlain(it.k || it.t || it.label || "");
  return name && !/\[\[|\[NEEDS/i.test(name) ? name : "";
}
function getPath(obj, path){
  return String(path).split(".").reduce((o, k) => o == null ? o : o[/^\d+$/.test(k) ? +k : k], obj);
}
/** Put `text` in place of one blank. Returns true when it was still there. */
function fillBlank(item, text){
  const found = findBlock(item.bid);
  if (!found) return false;
  const cur = getPath(found.block, item.path);
  if (typeof cur !== "string") return false;
  let at = -1, from = 0;
  for (let k = 0; k <= item.occ; k++){
    const i = cur.indexOf(item.raw, from);
    if (i < 0) break;
    at = i; from = i + item.raw.length;
  }
  if (at < 0) at = cur.indexOf(item.raw);
  if (at < 0) return false;
  setPath(found.block, item.path, cur.slice(0, at) + text + cur.slice(at + item.raw.length));
  delete found.block.seed;
  return true;
}

/* ── 1. The form on the Edit tab ─────────────────────────────────────────── */

function buildBlankForm(focusAt){
  const host = $("blankForm");
  if (!host) return;
  /* never rebuild under the person's fingers */
  if (focusAt == null && host.contains(document.activeElement)) return;
  const items = collectBlanks();
  $("blankCount").textContent = items.length ? items.length + " to fill" : "all filled";
  $("blankCard").classList.toggle("is-done", !items.length);
  host.innerHTML = "";
  if (!items.length){
    host.appendChild(el("p", "hint", "No blanks left. Every yellow blank in the document is filled in."));
    return;
  }
  let lastSection = null;
  items.forEach((it, i) => {
    if (it.section !== lastSection){
      host.appendChild(el("div", "bf-sec", esc(it.section || "Untitled section")));
      lastSection = it.section;
    }
    const row = el("label", "bf-row");
    row.appendChild(el("span", "bf-label", esc(it.label) + (it.context ? " <small>· " + esc(it.context) + "</small>" : "")));
    const inp = document.createElement("input");
    inp.placeholder = "Type, then Enter";
    inp.dataset.i = i;
    const commit = () => {
      const v = inp.value.trim();
      if (!v || inp.dataset.done) return;
      inp.dataset.done = "1";
      snapshot();
      if (!fillBlank(it, v)){ undoStack.pop(); toast("That blank has already been filled on the page."); }
      render(); buildOutline();
      buildBlankForm(i);
    };
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter"){ e.preventDefault(); commit(); }
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey && !inp.value)){
        const next = host.querySelector('input[data-i="' + (i + 1) + '"]');
        if (next){ e.preventDefault(); next.focus(); }
      }
    });
    inp.addEventListener("change", commit);
    /* show where it is on the page */
    inp.addEventListener("focus", () => showBlankOnPage(it));
    row.appendChild(inp);
    host.appendChild(row);
  });
  if (focusAt != null){
    const inputs = host.querySelectorAll("input");
    const target = inputs[Math.min(focusAt, inputs.length - 1)];
    if (target) target.focus();
  }
}
function showBlankOnPage(it){
  $$("#pages mark.is-current").forEach(m => m.classList.remove("is-current"));
  const marks = $$('#pages .blk-hit[data-bid="' + it.bid + '"] mark.blank, #pages .blk-hit[data-bid="' + it.bid + '"] mark.needs')
    .filter(m => m.textContent === it.raw);
  const m = marks[Math.min(it.occ, marks.length - 1)] || marks[0];
  if (!m) return;
  m.classList.add("is-current");
  m.scrollIntoView({block: "center", behavior: "smooth"});
}

/* ── 2. Copilot fills blanks from the notes ──────────────────────────────── */

/** The numbered list of blanks for the Copilot prompt. Blanks inside a box
    Copilot rewrites anyway (a slot) are left out. Remembers b1, b2 … on the deck. */
function blankPromptPart(){
  const items = collectBlanks().filter(it => !it.inSlot);
  deck.blankKeys = {};
  const shape = {};
  const lines = items.map((it, i) => {
    const key = "b" + (i + 1);
    deck.blankKeys[key] = {bid: it.bid, path: it.path, raw: it.raw, occ: it.occ};
    shape[key] = "";
    return "■ " + key + " — " + it.label + (it.context ? " (" + it.context + ")" : "") + " — in “" + it.section + "”";
  });
  return {lines, shape};
}
/** Copilot's {"b1": "…"} answers into the blanks. Returns how many were filled. */
function applyBlankAnswers(map){
  if (!map || typeof map !== "object" || !deck.blankKeys) return 0;
  /* fill from the last blank backwards, so two in one sentence do not shift each other */
  const keys = Object.keys(map).filter(k => deck.blankKeys[k]).sort((a, b) => +b.slice(1) - +a.slice(1));
  let n = 0;
  keys.forEach(k => {
    const v = String(map[k] == null ? "" : map[k]).trim();
    if (!v || /^\[\[.*\]\]$/.test(v) || /^(unknown|n\/a|none|not stated)$/i.test(v)) return;
    if (fillBlank(deck.blankKeys[k], v)){ markToCheck(deck.blankKeys[k].bid); n++; }
  });
  return n;
}

/* ── 3. "Check" marks on what Copilot wrote ──────────────────────────────── */

function markToCheck(bid){ deck.toCheck = deck.toCheck || {}; deck.toCheck[bid] = true; }
function clearToCheck(bid){ if (deck.toCheck && deck.toCheck[bid]){ delete deck.toCheck[bid]; return true; } return false; }
/** Ids still marked, in reading order (blocks that were deleted drop out). */
function toCheckIds(){
  const marks = deck.toCheck || {};
  const out = [];
  deck.sections.forEach(s => (s.blocks || []).forEach(b => { if (marks[b.id]) out.push(b.id); }));
  return out;
}
/** On screen only: a thin amber edge and a "check" tag (print CSS hides both). */
function decorateToCheck(){
  const marks = deck.toCheck || {};
  $$("#pages .blk-hit").forEach(w => {
    const on = !!marks[w.dataset.bid];
    w.classList.toggle("is-tocheck", on);
    if (on && !w.querySelector(":scope > .blk-check")){
      const tag = el("button", "blk-check", "Copilot wrote this &middot; <b>&#10003; Looks right</b>");
      tag.type = "button";
      tag.title = "Read it over; press when it is right (editing it clears the mark too)";
      tag.addEventListener("mousedown", e => e.preventDefault());
      tag.onclick = (e) => { e.stopPropagation(); snapshot(); clearToCheck(w.dataset.bid); render(); };
      w.appendChild(tag);
    }
  });
}
