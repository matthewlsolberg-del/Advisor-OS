/* ==========================================================================
   render.js — blocks to DOM, and DOM to pages.

   The layout engine measures every block off-screen at the exact content
   width, then fills US Letter pages one at a time, splitting paragraphs,
   lists, tables and action plans across a page break where it can. That is
   what makes the output consistent: the same content always lands the same
   way, and what is on screen is exactly what prints.
   ========================================================================== */

const PAGE_BODY_H = (doc) => {
  /* page height less the top and bottom margins in force on this document */
  const probe = doc || document.querySelector(".doc") || document.body;
  const cs = getComputedStyle(probe);
  const ph = parseFloat(cs.getPropertyValue("--ph")) || 1056;
  const mt = parseFloat(cs.getPropertyValue("--mt")) || 92;
  const mb = parseFloat(cs.getPropertyValue("--mb")) || 64;
  return ph - mt - mb;
};

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const wordmark = () => {
  const src = document.getElementById("wordmark-source");
  return src ? src.firstElementChild.cloneNode(true) : el("span");
};
const tdShield = () => {
  const src = document.getElementById("shield-source");
  const img = src ? src.firstElementChild.cloneNode(true) : null;
  const wrap = el("span", "td-shield");
  if (img) wrap.appendChild(img);
  return wrap;
};
const brandPair = () => {
  const row = el("div", "brand-pair");
  row.appendChild(tdShield());
  row.appendChild(wordmark());
  return row;
};

/* ── Blocks ─────────────────────────────────────────────────────────────── */

/** Extra block types: BLOCK_RENDERERS.myType = (block, wrap) => { …fill wrap… } */
const BLOCK_RENDERERS = {};

/** editable(<tag>, class, richtext, blockId, path) */
function editable(tag, cls, text, bid, path){
  const n = el(tag, cls + " is-editable", richToHtml(text || ""));
  n.dataset.bid = bid; n.dataset.path = path;
  n.setAttribute("data-ph", "");
  return n;
}

function renderBlock(b){
  const wrap = el("div", "blk blk-hit blk-" + b.type + (b.runOn ? " is-runon" : ""));
  wrap.dataset.bid = b.id;
  wrap.dataset.type = b.type;
  if (b._off != null){ wrap.dataset.off = b._off; wrap.dataset.len = b._len; }
  const tag = el("span", "blk-tag", BLOCK_KINDS.find(k => k.type === b.type)?.label || b.type);
  wrap.appendChild(tag);

  switch (b.type){
    case "heading": {
      if (b.num) wrap.appendChild(el("div","blk-secnum", String(b.num).padStart(2, "0")));
      if (b.kicker) wrap.appendChild(editable("div","blk-kicker", b.kicker, b.id, "kicker"));
      wrap.appendChild(editable(b.level === 3 ? "h3" : "h2",
        b.level === 3 ? "blk-h3" : "blk-h2", b.text, b.id, "text"));
      break;
    }
    case "paragraph": wrap.appendChild(editable("p","blk-p", b.text, b.id, "text")); break;
    case "lead":      wrap.appendChild(editable("p","blk-lead", b.text, b.id, "text")); break;

    case "bullets": {
      const ul = el("ul", "blk-list is-" + (b.style || "bullet"));
      /* the second page of a split numbered list carries on counting (doc.css "li") */
      if (b._off) ul.style.counterReset = "li " + b._off;
      (b.items || []).forEach((it, i) => {
        const li = editable("li","", it, b.id, "items." + i);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      break;
    }
    case "stats": {
      const g = el("div", "blk-stats");
      g.dataset.cols = String(b.cols || Math.min(4, Math.max(2, (b.items || []).length)));
      (b.items || []).forEach((s, i) => {
        const c = el("div", "stat");
        c.appendChild(editable("div","s-num", s.num, b.id, "items." + i + ".num"));
        c.appendChild(editable("div","s-label", s.label, b.id, "items." + i + ".label"));
        if (s.note) c.appendChild(editable("div","s-note", s.note, b.id, "items." + i + ".note"));
        g.appendChild(c);
      });
      wrap.appendChild(g);
      break;
    }
    case "facts": {
      const g = el("div", "blk-facts");
      (b.items || []).forEach((f, i) => {
        const r = el("div", "fact");
        r.appendChild(editable("span","f-k", f.k, b.id, "items." + i + ".k"));
        r.appendChild(el("span","f-dots"));
        r.appendChild(editable("span","f-v", f.v, b.id, "items." + i + ".v"));
        g.appendChild(r);
      });
      wrap.appendChild(g);
      break;
    }
    case "table": {
      const box = el("div", "blk-table");
      const t = el("table");
      const thead = el("thead"), htr = el("tr");
      (b.headers || []).forEach((h, i) => {
        const th = editable("th", i > 0 && b.numeric !== false && looksNumericHeader(b, i) ? "num" : "", h, b.id, "headers." + i);
        htr.appendChild(th);
      });
      thead.appendChild(htr); t.appendChild(thead);
      const tb = el("tbody");
      (b.rows || []).forEach((row, ri) => {
        const tr = el("tr");
        if (b.totalRow && ri === b.rows.length - 1) tr.className = "total";
        row.forEach((c, ci) => {
          tr.appendChild(editable("td", looksNumericHeader(b, ci) && ci > 0 ? "num" : "", c, b.id, "rows." + ri + "." + ci));
        });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      box.appendChild(t);
      if (b.caption) box.appendChild(editable("div","blk-cap", b.caption, b.id, "caption"));
      wrap.appendChild(box);
      break;
    }
    case "callout": {
      const c = el("div", "blk-callout");
      c.dataset.tone = b.tone || "note";
      if (b.title) c.appendChild(editable("div","co-title", b.title, b.id, "title"));
      c.appendChild(editable("div","co-text", b.text, b.id, "text"));
      wrap.appendChild(c);
      break;
    }
    case "quote": {
      const q = el("div", "blk-quote");
      q.appendChild(el("div","q-rule"));
      q.appendChild(editable("p","q-text", b.text, b.id, "text"));
      if (b.by) q.appendChild(editable("div","q-by", b.by, b.id, "by"));
      wrap.appendChild(q);
      break;
    }
    case "actions": {
      const g = el("div", "blk-actions");
      (b.items || []).forEach((a, i) => {
        const r = el("div", "action");
        r.appendChild(el("div","a-n", String(i + 1 + (b._off || 0))));
        const body = el("div","a-body");
        body.appendChild(editable("div","a-t", a.t, b.id, "items." + i + ".t"));
        body.appendChild(editable("div","a-d", a.d, b.id, "items." + i + ".d"));
        const meta = [a.who, a.when].filter(Boolean).join(" · ");
        if (meta) body.appendChild(el("div","a-meta", richToHtml(meta)));
        r.appendChild(body);
        g.appendChild(r);
      });
      wrap.appendChild(g);
      break;
    }
    case "twocol": {
      const g = el("div", "blk-two");
      const a = el("div","col"), c = el("div","col");
      a.appendChild(editable("div","col-h is-a", b.aTitle, b.id, "aTitle"));
      a.appendChild(editable("p","blk-p", b.aText, b.id, "aText"));
      c.appendChild(editable("div","col-h", b.bTitle, b.id, "bTitle"));
      c.appendChild(editable("p","blk-p", b.bText, b.id, "bText"));
      g.appendChild(a); g.appendChild(c);
      wrap.appendChild(g);
      break;
    }
    case "chart": {
      const box = el("div", "blk-viz");
      if (b.title) box.appendChild(editable("div","viz-title", b.title, b.id, "title"));
      box.appendChild(el("div","", chartSVG(b)));
      if (b.caption) box.appendChild(editable("div","blk-cap", b.caption, b.id, "caption"));
      wrap.appendChild(box);
      break;
    }
    case "infographic": {
      const box = el("div", "blk-viz");
      if (b.title) box.appendChild(editable("div","viz-title", b.title, b.id, "title"));
      box.appendChild(el("div","", infographicSVG(b)));
      if (b.caption) box.appendChild(editable("div","blk-cap", b.caption, b.id, "caption"));
      wrap.appendChild(box);
      break;
    }
    case "image": {
      const box = el("div", "blk-fig");
      box.dataset.size = b.size || "full";
      box.dataset.frame = b.frame || "line";
      const fig = el("figure");
      if (b.src){
        const img = el("img");
        img.src = b.src; img.alt = b.caption || "";
        fig.appendChild(img);
      } else {
        fig.appendChild(el("div","blk-cap","No image chosen yet — select this block and pick a file."));
      }
      if (b.caption) fig.appendChild(editable("figcaption","blk-cap", b.caption, b.id, "caption"));
      box.appendChild(fig);
      wrap.appendChild(box);
      break;
    }
    case "rule":  wrap.appendChild(el("div","blk-rule")); break;
    case "space": { const s = el("div","blk-space"); s.style.height = (b.h || 18) + "px"; wrap.appendChild(s); break; }
    case "pagebreak": wrap.appendChild(el("div","blk-cap","— page break —")); break;
    /* an account recommendation: the locked one-page portfolio profile (portfolios.js) */
    case "recommendation": wrap.insertAdjacentHTML("beforeend", recommendationHTML(b)); break;
    default:
      /* block types a page adds for itself (Portfolio Builder's summary blocks) */
      if (BLOCK_RENDERERS[b.type]){ BLOCK_RENDERERS[b.type](b, wrap); break; }
      wrap.appendChild(el("p","blk-p", esc(JSON.stringify(b))));
  }
  /* where the figures came from (smart.js sets it on report charts and tables) */
  if (b.source && (b.type === "chart" || b.type === "table")) wrap.appendChild(el("div","blk-src", "Source: " + esc(b.source)));
  return wrap;
}

function looksNumericHeader(b, ci){
  const col = (b.rows || []).map(r => r[ci]).filter(v => v != null && v !== "" && v !== "—");
  if (!col.length) return false;
  return col.every(v => /^[\s$€£+\-−(]{0,2}[\d.,]+\s*[%kKMB)]*$/.test(String(v).trim()));
}

/* ── Splitting a block across a page break ──────────────────────────────── */

/* Sentences, for breaking a paragraph across pages. A full stop after "U.S.",
   "Inc." or "Dr." is not the end of a sentence, and neither is one followed by a
   lower-case word, so those pieces are glued back to the next. */
const NOT_A_STOP = /(?:^|\s)(?:[A-Z]|U\.S|U\.K|Inc|Corp|Co|Ltd|Dr|Mr|Mrs|Ms|Jr|Sr|St|vs|etc|e\.g|i\.e|No|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/;
function sentences(text){
  const raw = String(text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  const out = [];
  raw.forEach(piece => {
    const prev = out[out.length - 1];
    if (prev && (NOT_A_STOP.test(prev) || /^[a-z]/.test(piece))) out[out.length - 1] = prev + " " + piece;
    else out.push(piece);
  });
  return out;
}
const SPLITTABLE = {
  paragraph:{
    units: b => sentences(b.text),
    build: (b, u) => Object.assign({}, b, {text: u.join(" ")})
  },
  lead:{
    units: b => sentences(b.text),
    build: (b, u) => Object.assign({}, b, {text: u.join(" ")})
  },
  bullets:{ units: b => b.items || [], build: (b, u) => Object.assign({}, b, {items:u}) },
  facts:{   units: b => b.items || [], build: (b, u) => Object.assign({}, b, {items:u}) },
  actions:{ units: b => b.items || [], build: (b, u) => Object.assign({}, b, {items:u}) },
  table:{   units: b => b.rows || [],  build: (b, u, first) =>
              Object.assign({}, b, {rows:u, caption: first ? "" : b.caption}) }
};

/* ── Measuring ──────────────────────────────────────────────────────────── */

function makeMeasurer(doc){
  let m = document.getElementById("measure");
  if (!m){
    m = el("div", "doc");
    m.id = "measure";
    m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;";
    document.body.appendChild(m);
  }
  m.className = "doc";
  m.dataset.accent = doc.dataset.accent;
  m.dataset.density = doc.dataset.density;
  m.dataset.look = doc.dataset.look;
  m.dataset.format = doc.dataset.format;
  const cs = getComputedStyle(doc);
  const w = parseFloat(cs.getPropertyValue("--pw")) - 2 * parseFloat(cs.getPropertyValue("--mx"));
  m.style.width = w + "px";
  m.innerHTML = "";
  /* A sentinel keeps the measured block from being :last-child, which would
     otherwise zero its bottom margin and under-measure every block by one gap. */
  const sentinel = el("i", "measure-end");
  m.appendChild(sentinel);
  return {
    node: m,
    height(node){
      m.insertBefore(node, sentinel);
      const st = getComputedStyle(node);
      const h = node.offsetHeight + (parseFloat(st.marginBottom) || 0);
      m.removeChild(node);
      return h;
    }
  };
}

/* ── Page shells ────────────────────────────────────────────────────────── */

function newPage(deck, ctx){
  const p = el("div", "page");
  if (ctx && ctx.recommendation) p.classList.add("recommendation-page");
  if (ctx && ctx.householdSummary) p.classList.add("household-summary-page");
  if (deck.options.watermark){
    const wm = el("div","page-watermark");
    wm.appendChild(wordmark());
    p.appendChild(wm);
  }
  if (deck.options.runningHead){
    const h = el("div","page-head");
    h.appendChild(el("span","ph-rule"));
    h.appendChild(el("span","ph-left", esc(ctx.section || deck.meta.kicker || "")));
    h.appendChild(el("span","ph-right", esc(deck.meta.title || "")));
    p.appendChild(h);
  }
  const inner = el("div","page-inner");
  const body = el("div","page-body");
  inner.appendChild(body);
  p.appendChild(inner);

  const foot = el("div","page-foot");
  const left = deck.options.confidential && deck.meta.client
    ? "Confidential — prepared for " + deck.meta.client
    : BRAND.firm;
  foot.appendChild(el("span","", esc(left)));
  foot.appendChild(el("span","pf-num", ""));
  p.appendChild(foot);

  if (deck.options.draft) p.appendChild(el("div","page-draft", esc(BRAND.draftTag)));
  /* the prep sheet (views.js): never mistaken for something to hand over */
  if (deck.internal) p.appendChild(el("div","page-internal","Internal — for the advisor only, not for the client"));
  p._body = body;
  return p;
}

function coverPage(deck){
  const p = el("div","page");
  const c = el("div","cover");
  c.dataset.style = deck.cover.style || "premium";
  if (deck.cover.style === "photo" && deck.cover.image){
    const ph = el("div","cover-photo");
    ph.style.backgroundImage = "url(" + deck.cover.image + ")";
    c.appendChild(ph);
    c.appendChild(el("div","cover-scrim"));
  }
  c.appendChild(el("div","cover-frame"));
  const wm = el("div","cover-wm");
  wm.appendChild(wordmark());
  c.appendChild(wm);
  const sh = el("div","cover-shield");
  sh.appendChild(tdShield());
  c.appendChild(sh);

  c.appendChild(el("div","cover-gap gap-a"));

  const body = el("div","cover-body");
  if (deck.meta.kicker) body.appendChild(el("div","cover-kick", esc(deck.meta.kicker)));
  body.appendChild(el("h1","cover-title", esc(deck.meta.title || "Untitled")));
  body.appendChild(el("div","cover-rule"));
  if (deck.meta.subtitle) body.appendChild(el("p","cover-sub", esc(deck.meta.subtitle)));
  c.appendChild(body);
  c.appendChild(el("div","cover-gap gap-b"));

  /* an optional picture between the title and the band; an empty one is a
     placeholder on screen only (render.js never prints an empty frame) */
  if (deck.cover.style === "picture"){
    const pic = el("div", "cover-pic" + (deck.cover.image ? "" : " is-empty"));
    if (deck.cover.image) pic.style.backgroundImage = "url(" + deck.cover.image + ")";
    else pic.appendChild(el("span", "", "Team photo or a Medicine Hat picture goes here.<br>Finish &rarr; Look &amp; pages &rarr; Choose the cover picture."));
    c.appendChild(pic);
  }

  /* the deep-green band: who it is for, when, and who prepared it */
  const band = el("div","cover-band");
  const forBox = el("div","cb-for");
  if (deck.meta.client){
    forBox.appendChild(el("span","cf-label","Prepared for"));
    forBox.appendChild(el("div","cf-name", esc(deck.meta.client)));
  }
  if (deck.meta.date) forBox.appendChild(el("div","cb-date", esc(prettyDate(deck.meta.date))));
  band.appendChild(forBox);
  const by = el("div","cb-by");
  const who = preparedBy(deck);
  if (who){
    by.appendChild(el("span","cf-label","Prepared by"));
    by.appendChild(el("div","cb-name", esc(who.name)));
    if (who.title) by.appendChild(el("div","cb-title", esc(who.title)));
  }
  by.appendChild(el("div","cb-firm", esc(BRAND.firm) + " &middot; " + esc(BRAND.subbrand)));
  if (deck.contact && deck.contact.phone) by.appendChild(el("div","cb-phone", esc(deck.contact.phone)));
  band.appendChild(by);
  c.appendChild(band);
  if (deck.options.draft) c.appendChild(el("div","cover-draft", esc(BRAND.draftTag)));

  p.appendChild(c);
  return p;
}

function dividerPage(deck, section, n){
  const p = el("div","page");
  const d = el("div","divider");
  d.appendChild(el("div","divider-frame"));
  d.appendChild(el("div","divider-num", "SECTION " + String(n).padStart(2,"0")));
  d.appendChild(el("h2","divider-title", esc(section.title || "")));
  d.appendChild(el("div","divider-rule"));
  if (section.summary) d.appendChild(el("p","divider-sub", esc(section.summary)));
  const wm = el("div","divider-wm");
  wm.appendChild(wordmark());
  d.appendChild(wm);
  p.appendChild(d);
  if (deck.options.draft) p.appendChild(el("div","page-draft is-on-dark", esc(BRAND.draftTag)));
  return p;
}

function prettyDate(iso){
  if (!iso) return "";
  const [y,m,d] = String(iso).split("-").map(Number);
  if (!y) return iso;
  const months = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  return months[(m || 1) - 1] + " " + (d || 1) + ", " + y;
}

/* ── The layout pass ────────────────────────────────────────────────────── */

/**
 * Lay the whole deck out into pages inside `host`.
 * Returns {pages, sectionPages} so the table of contents can be numbered.
 */
/* the deck being laid out right now (a view's copy, or the document itself) */
let layoutDeck = null;

function layout(deck, host){
  layoutDeck = deck;
  host.innerHTML = "";
  const doc = host;
  doc.dataset.accent = deck.design.accent || "gold";
  doc.dataset.density = deck.design.density || "comfortable";
  doc.dataset.look = deck.design.look || "private";
  doc.dataset.format = deck.design.format || "report";

  const M = makeMeasurer(doc);
  const LIMIT = PAGE_BODY_H(doc);
  const pages = [];
  const sectionPages = {};

  /* front matter -------------------------------------------------------- */
  if (!deck.noCover) pages.push({node: coverPage(deck), numbered:false});

  /* account pages are listed once, under "Our recommendations", not one by one */
  const tocSections = deck.sections.filter(s => !s.accountRecommendation);
  const tocCount = deck.options.toc
    ? Math.max(1, Math.ceil(tocSections.length / tocPerPage(deck)))
    : 0;
  const tocSlots = [];
  for (let i = 0; i < tocCount; i++){
    const p = newPage(deck, {section:"Contents"});
    tocSlots.push(p);
    pages.push({node:p, numbered:false});
  }

  /* content ------------------------------------------------------------- */
  let page = null, used = 0, ctx = {section:""};
  const startPage = () => {
    page = newPage(deck, ctx);
    pages.push({node:page, numbered:true});
    used = 0;
    return page;
  };
  const place = (node, h) => { page._body.appendChild(node); used += h; };

  /* Lay a splittable block out from the current page on, `room` px being what is
     left here. Returns false (placing nothing) when not even its first unit fits. */
  const splitAcross = (b, rule, room) => {
    const units = rule.units(b);
    if (units.length < 2) return false;
    /* every fragment remembers where it starts in the original block, so an
       inline edit on it writes back into its own part only (see app.js focusout) */
    const frag = (from, to) => {
      const f = rule.build(b, units.slice(from, to), from === 0);
      f.id = b.id; f._off = from; f._len = to - from;
      if (b.type === "table" && to < units.length){ f.totalRow = false; f.caption = ""; f.source = ""; }
      return f;
    };
    let best = 0;
    for (let k = 1; k < units.length; k++){
      if (M.height(renderBlock(frag(0, k))) <= room) best = k; else break;
    }
    if (best === 0) return false;
    /* never leave one line, row or item on its own at the top of the next page */
    if (units.length - best === 1 && best >= 2) best--;
    place(renderBlock(frag(0, best)), room);
    startPage();
    let start = best;
    let tnode = renderBlock(frag(start, units.length)), th = M.height(tnode);
    /* the tail may still be taller than a page — keep peeling */
    while (th > LIMIT){
      let fit = 1;
      for (let k = 1; k < units.length - start; k++){
        if (M.height(renderBlock(frag(start, start + k))) <= LIMIT) fit = k; else break;
      }
      place(renderBlock(frag(start, start + fit)), LIMIT);
      startPage();
      start += fit;
      tnode = renderBlock(frag(start, units.length)); th = M.height(tnode);
    }
    place(tnode, th);
    return true;
  };

  /* Slides always give each section its own slide. On paper, short sections run
     on (no half-empty pages) unless "Each section starts a new page" is ticked. */
  const breakEach = deck.options.sectionBreak || deck.design.format === "slides";

  deck.sections.forEach((section, si) => {
    const recPart = section.recommendationOverview || section.recommendation;
    ctx = {section: recPart ? "OUR RECOMMENDATIONS" : (section.runningTitle || section.title || ""),
           recommendation: !!section.recommendation, householdSummary: !!section.recommendationOverview};
    const ownPage = section.recommendation || section.recommendationOverview || (deck.sections[si - 1] || {}).recommendation;
    if (deck.options.dividers){
      pages.push({node: dividerPage(deck, section, si + 1), numbered:true});
      sectionPages[section.id] = pages.length;   /* provisional; fixed below */
      page = null;
    } else if ((breakEach || ownPage) && si > 0){
      page = null;              /* each section opens a page; a recommendation always has its own */
    }
    let items = (section.blocks || []).slice();
    if (section.noHeading){
      /* a view's page (views.js) brings its own heading */
    } else if (!deck.options.dividers && !section.recommendation && !section.recommendationOverview){
      items = [Object.assign(newBlock("heading"),
                {id:"sec-" + section.id, level:2, kicker: section.kicker || "", text: section.title || "", num: si + 1})]
              .concat(items);
    } else if (!deck.options.dividers && section.recommendation && !section.recommendationOverview){
      /* an account page: the account and amount as its heading, then the locked profile */
      items = [Object.assign(newBlock("heading"),
                {id:"sec-" + section.id, level:2, kicker:"", text: section.title || "Account Recommendation"})]
              .concat(items);
    }
    /* the household summary carries its own title, so title and summary never split */

    /* Running on: the section starts part way down the page. It moves to a fresh
       page when little room is left, or when it is short enough to keep whole
       on the next page but would be split here (unless nearly half the page
       is still empty: then it starts here, rather than leave a gap). */
    let pre = null;
    if (page && used > 0 && !deck.options.dividers && items.length && items[0].type === "heading"){
      items[0] = Object.assign({}, items[0], {runOn: true});
      pre = items.map(b => { const node = renderBlock(b); return {node, h: M.height(node)}; });
      /* the last block's bottom margin need not fit on the page */
      const gap = parseFloat(getComputedStyle(doc).getPropertyValue("--gap")) || 15;
      const total = pre.reduce((n, x) => n + x.h, 0) - gap, room = LIMIT - used;
      if (room < LIMIT * 0.22 || (total > room && total <= LIMIT * 0.6 && room < LIMIT * 0.45)){
        page = null;
        items[0] = Object.assign({}, items[0], {runOn: false});
        pre = null;
      }
    }

    items.forEach((b, bi) => {
      if (b.type === "pagebreak"){ page = null; return; }
      if (!page) { startPage(); if (!sectionPages[section.id]) sectionPages[section.id] = pages.length; }
      if (!sectionPages[section.id]) sectionPages[section.id] = pages.length;

      let node, h;
      if (pre && pre[bi]){ node = pre[bi].node; h = pre[bi].h; }
      else { node = renderBlock(b); h = M.height(node); }

      if (h <= LIMIT - used){
        /* a heading is never the last thing on a page: it keeps with what follows */
        const isHeading = b.type === "heading";
        if (isHeading && bi < items.length - 1){
          const nextH = pre && pre[bi + 1] ? pre[bi + 1].h : M.height(renderBlock(items[bi + 1]));
          const room = LIMIT - used - h;
          /* a list or paragraph can start here and carry on; a chart or picture cannot */
          const next = items[bi + 1], splits = SPLITTABLE[next.type] && SPLITTABLE[next.type].units(next).length > 1;
          if (splits ? room < Math.min(nextH, 130) : (room < nextH && nextH <= LIMIT - h)){
            startPage();
            if (bi === 0) sectionPages[section.id] = pages.length;
            if (b.runOn) b = Object.assign({}, b, {runOn: false});
            node = renderBlock(b); h = M.height(node);
          }
        }
        place(node, h);
        return;
      }

      /* does not fit — try to split it into the room left on this page; if not
         even its first part fits there, start a fresh page and try again */
      const rule = SPLITTABLE[b.type];
      const room = LIMIT - used;
      if (rule && room > 70 && splitAcross(b, rule, room)) return;
      if (used > 0) startPage();
      if (b.runOn) b = Object.assign({}, b, {runOn: false});
      node = renderBlock(b);
      h = M.height(node);
      if (h > LIMIT && rule && splitAcross(b, rule, LIMIT)) return;
      /* not splittable: it sits on a page of its own */
      place(node, h);
      if (h > LIMIT) page._body.parentElement.parentElement
        .appendChild(el("div","page-overflow","This block is taller than one page — shrink the image or split the text."));
    });
  });

  /* back matter --------------------------------------------------------- */
  if (deck.options.team || deck.options.disclosures){
    closingPages(deck, M, LIMIT).forEach(p => pages.push({node:p, numbered:true}));
  }

  /* numbering ----------------------------------------------------------- */
  let n = 0;
  pages.forEach(p => {
    if (!p.numbered) return;
    n++;
    const slot = p.node.querySelector(".pf-num");
    if (slot) slot.textContent = deck.options.pageNumbers ? String(n) : "";
    p.number = n;
  });
  /* sectionPages currently holds an index into `pages`; convert to printed no. */
  Object.keys(sectionPages).forEach(k => {
    const idx = sectionPages[k] - 1;
    sectionPages[k] = pages[idx] ? (pages[idx].number || "") : "";
  });

  /* table of contents (now that the numbers are known) ------------------- */
  if (tocSlots.length) fillToc(deck, tocSlots, sectionPages);

  pages.forEach(p => host.appendChild(p.node));

  /* Belt and braces: if anything still runs past the bottom of a page, say so
     on the page rather than letting it silently clip in the PDF. */
  pages.forEach(p => {
    const body = p.node.querySelector(".page-body");
    /* a recommendation page has slimmer margins, so judge each page by its own body */
    if (body && body.scrollHeight > Math.max(LIMIT, body.clientHeight) + 2 && !p.node.querySelector(".page-overflow")){
      p.node.appendChild(el("div","page-overflow",
        "Runs past the page — shorten this text or split the block."));
    }
  });
  return {pages, sectionPages};
}

/* How many entries fit on one contents page. Past a handful the list is set
   tighter (.toc-list.is-long) so a long document still fits. */
function tocPerPage(deck){ return deck.design.format === "slides" ? 7 : 13; }

function fillToc(deck, slots, sectionPages){
  const perPage = tocPerPage(deck);
  const long = deck.sections.filter(s => !s.accountRecommendation).length > (deck.design.format === "slides" ? 5 : 9);
  slots.forEach((p, pi) => {
    const body = p._body;
    body.innerHTML = "";
    if (pi === 0){
      body.appendChild(el("h2","toc-title","Contents"));
      body.appendChild(el("div","toc-rule"));
    }
    const list = el("ol","toc-list" + (long ? " is-long" : ""));
    deck.sections.filter(s => !s.accountRecommendation).slice(pi * perPage, (pi + 1) * perPage).forEach((s, i) => {
      const li = el("li","toc-item");
      li.appendChild(el("span","toc-num", String(pi * perPage + i + 1).padStart(2,"0")));
      li.appendChild(el("span","toc-name", esc(s.title || "")));
      li.appendChild(el("span","toc-dots"));
      li.appendChild(el("span","toc-page", String(sectionPages[s.id] || "")));
      list.appendChild(li);
    });
    body.appendChild(list);
    if (pi === slots.length - 1 && deck.options.disclosures){
      body.appendChild(el("div","toc-note",
        "Important disclosures appear at the back of this document and form part of it."));
    }
  });
}

/** Team members of one group: "advisor", "service" or "specialist" (brand.js). */
function teamGroup(deck, group){
  return (deck.team && deck.team.length ? deck.team : BRAND.team).filter(m => (m.group || "advisor") === group && m.name);
}
/** The cover's "Prepared by": the advisor as chosen, with their title from the team list. */
function preparedBy(deck){
  const who = String(deck.meta.advisor || "").trim();
  if (!who) return null;
  const m = (deck.team || []).find(x => x.name && who.toLowerCase().startsWith(x.name.toLowerCase()));
  return {name: who, title: m && m.title && who !== BRAND.firm ? m.title : ""};
}

function closingPages(deck, M, LIMIT){
  const out = [];
  const deckPage = (section) => {
    const p = newPage(deck, {section});
    out.push(p);
    return p;
  };
  let p = null, used = 0;
  const put = (node) => {
    const h = M.height(node) + 3;   /* small allowance: margins between these pieces collapse unevenly */
    if (h > LIMIT - used && used > 0){ const sec = p._section; p = deckPage(sec); p._section = sec; used = 0; }
    p._body.appendChild(node);
    used += h;
  };
  const grid = (members, cls) => {
    const g = el("div", "team-grid " + (cls || ""));
    members.forEach(m => {
      const c = el("div","team-cell");
      c.appendChild(el("div","t-name", esc(m.name)));
      if (m.desig) c.appendChild(el("div","t-desig", esc(m.desig)));
      if (m.title) c.appendChild(el("div","t-title", esc(m.title)));
      g.appendChild(c);
    });
    return g;
  };

  if (deck.options.team){
    p = deckPage("Your team"); p._section = "Your team"; used = 0;
    put(el("h2","closing-h","Your Wealth Management Team"));
    put(el("p","closing-sub", esc(BRAND.tagline)));
    put(el("div","closing-rule"));
    put(grid(teamGroup(deck, "advisor")));
    const service = teamGroup(deck, "service");
    if (service.length){
      put(el("div","team-sub","Your client service team"));
      put(grid(service, "is-small"));
    }
    const specialists = teamGroup(deck, "specialist");
    if (deck.options.specialists && specialists.length){
      put(el("div","team-sub","TD specialists we bring in"));
      put(grid(specialists, "is-small"));
    }

    const contact = el("div","contact");
    contact.appendChild(el("div","c-firm", esc(deck.contact.firm || BRAND.firm)));
    const line = el("div","c-line");
    line.innerHTML = [esc(deck.contact.address), esc(deck.contact.phone), esc(deck.contact.web)]
      .filter(Boolean).join("<br>");
    contact.appendChild(line);
    put(contact);
  }

  if (deck.options.disclosures){
    /* the disclosures have a back page of their own */
    p = deckPage("Important disclosures"); p._section = "Important disclosures"; used = 0;
    put(el("div","disc-h is-page","Important disclosures"));
    if (deck.options.draft) put(el("div","disc-draft", esc("[" + BRAND.draftTag + "]")));
    (deck.disclosures || []).forEach(d => put(el("p","disc-p", esc(d))));
  }
  return out;
}
