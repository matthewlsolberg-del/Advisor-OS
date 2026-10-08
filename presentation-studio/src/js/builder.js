/* ==========================================================================
   builder.js — the Portfolio Builder.

   A household (one or more people), the accounts each person holds (type and
   dollar value), plus joint accounts. Every account gets one of the one-page
   model portfolios from the library. From that the builder works out the
   household's combined asset allocation, checks it against the investor
   profile ("Balanced Growth: equities 50–70%"), and lays out the document:

     cover → investor profile → portfolio at a glance → one page per account
           → team → disclosures

   It uses the same page engine, brand, model profiles and portfolio library
   as Presentation Studio, so the two documents look like one family.
   ========================================================================== */

const BUILDER_KEY  = "mhwg.portfolio-builder.working-copy";
const PROFILES_KEY = "mhwg.portfolio-builder.profiles.v1";

/* ── Investor profiles ─────────────────────────────────────────────────────
   Starting ranges only. They line up with the TD Core asset-allocation models
   (each model sits inside its own profile's range), but the ranges themselves
   must be confirmed against the firm's KYC definitions: "Edit profiles" changes
   them, and the change is kept in this browser.
   ------------------------------------------------------------------------ */
const DEFAULT_PROFILES = [
  {id:"conservative_income", name:"Conservative Income", equityMin:10, equityMax:30,
   horizon:"Short to medium term", objective:"Income and preserving capital",
   volatility:"Low — small swings in value",
   description:"Protecting what you have and producing steady income matter most. Growth is a secondary goal, and the portfolio leans heavily on fixed income."},
  {id:"balanced_income", name:"Balanced Income", equityMin:25, equityMax:45,
   horizon:"Medium term", objective:"Income, with some growth",
   volatility:"Low to moderate",
   description:"Income comes first, with a measured amount of equity to help the portfolio keep pace with inflation over time."},
  {id:"balanced", name:"Balanced", equityMin:35, equityMax:55,
   horizon:"Medium to long term", objective:"A balance of growth and income",
   volatility:"Moderate",
   description:"An even-handed mix of equities and fixed income: room to grow, with enough stability that a difficult year does not force a decision."},
  {id:"balanced_growth", name:"Balanced Growth", equityMin:50, equityMax:70,
   horizon:"Long term", objective:"Long-term growth, with some stability",
   volatility:"Moderate to higher",
   description:"Growth is the main goal, with a meaningful fixed-income foundation to moderate the ups and downs along the way."},
  {id:"growth", name:"Growth", equityMin:60, equityMax:80,
   horizon:"Long term", objective:"Long-term growth",
   volatility:"Higher — larger swings in value",
   description:"Long-term growth is the priority. You are comfortable with larger short-term swings in exchange for higher expected long-term returns."},
  {id:"aggressive_growth", name:"Aggressive Growth", equityMin:75, equityMax:100,
   horizon:"Long term", objective:"Maximum long-term growth",
   volatility:"Highest",
   description:"Built almost entirely for growth. Suited to money that will not be needed for many years and to an investor at ease with significant swings."}
];
let investorProfiles = [];
let realAssetsAsEquity = false;

function loadProfiles(){
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) || "null");
    if (saved && Array.isArray(saved.profiles) && saved.profiles.length){
      investorProfiles = saved.profiles; realAssetsAsEquity = !!saved.realAssetsAsEquity; return;
    }
  } catch (e){}
  investorProfiles = structuredClone(DEFAULT_PROFILES);
}
function saveProfiles(){
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify({profiles: investorProfiles, realAssetsAsEquity})); } catch (e){}
}
function profileOf(id){ return investorProfiles.find(p => p.id === id) || investorProfiles[0]; }

/* ── State ──────────────────────────────────────────────────────────────── */

let hh = null;        /* the household being built: the single source of truth */
let deck = null;      /* the document generated from it, for the page engine */
let undoStack = [], redoStack = [];
let zoom = 0, relayoutTimer = null, lastSaved = "";

const pid = () => "p" + uid();
function todayISO(){
  const t = new Date();
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function newHousehold(){
  const a = pid(), b = pid();
  return {
    kind:"mhwg-portfolio", version:1,
    household:{name:"", advisor:"", date:todayISO()},
    profileId:"balanced_growth",
    people:[{id:a, name:""}, {id:b, name:""}],
    accounts:[
      {id:uid(), owner:a, type:"RRSP", value:"", portfolioId:"", howItFits:[]},
      {id:uid(), owner:a, type:"TFSA", value:"", portfolioId:"", howItFits:[]},
      {id:uid(), owner:b, type:"RRSP", value:"", portfolioId:"", howItFits:[]},
      {id:uid(), owner:"joint", type:"Joint Non-Registered Account", value:"", portfolioId:"", howItFits:[]}
    ],
    notes:"",
    doc:{cover:"white", format:"report", profilePage:true, summaryPage:true, modelPages:true,
         toc:false, team:true, disclosures:true, draft:true}
  };
}
function migrateHousehold(h){
  const d = newHousehold();
  h = Object.assign({}, d, h);
  h.household = Object.assign({}, d.household, h.household);
  h.doc = Object.assign({}, d.doc, h.doc);
  h.people = (h.people || []).map(p => ({id: p.id || pid(), name: String(p.name || "")}));
  const ids = new Set(h.people.map(p => p.id).concat("joint"));
  h.accounts = (h.accounts || []).map(a => ({id: a.id || uid(), owner: ids.has(a.owner) ? a.owner : (h.people[0] || {}).id || "joint",
    type: String(a.type || ""), value: String(a.value == null ? "" : a.value), portfolioId: String(a.portfolioId || ""),
    howItFits: Array.isArray(a.howItFits) ? a.howItFits : []}));
  if (!investorProfiles.some(p => p.id === h.profileId)) h.profileId = investorProfiles[0].id;
  return h;
}

function snapshot(){
  undoStack.push(JSON.stringify(hh));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  updateUndo();
}
function undo(){
  if (!undoStack.length){ toast("Nothing to undo"); return; }
  redoStack.push(JSON.stringify(hh)); hh = JSON.parse(undoStack.pop());
  rebuildRail(); render(); toast("Undone");
}
function redo(){
  if (!redoStack.length){ toast("Nothing to redo"); return; }
  undoStack.push(JSON.stringify(hh)); hh = JSON.parse(redoStack.pop());
  rebuildRail(); render(); toast("Redone");
}
function updateUndo(){ $("btnUndo").disabled = !undoStack.length; $("btnRedo").disabled = !redoStack.length; }

/* ── Numbers ────────────────────────────────────────────────────────────── */

/** "$250,000", "250k", "1.2M" -> 250000 / 1200000; anything unreadable -> 0. */
function moneyValue(v){
  let t = String(v == null ? "" : v).replace(/[$,\s]/g, "");
  let m = 1;
  const s = t.match(/^([\d.]+)([kKmM])$/);
  if (s){ t = s[1]; m = /k/i.test(s[2]) ? 1e3 : 1e6; }
  const n = parseFloat(t) * m;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
const CAD = new Intl.NumberFormat("en-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0});
const fmt$ = n => CAD.format(Math.round(n));
const pct = (n, dp) => (Math.round(n * Math.pow(10, dp || 0)) / Math.pow(10, dp || 0)) + "%";

const EQUITY_CLASSES = ["Canadian Equity", "U.S. Equity", "International Equity"];
function isEquity(name){ return EQUITY_CLASSES.includes(name) || (realAssetsAsEquity && name === "Real Assets"); }
/** A model's allocation as shares of 100. */
function mixOf(p){
  const pairs = p ? allocationPairs(p) : [];
  const total = pairs.reduce((a, x) => a + x.value, 0);
  const out = {};
  if (total > 0) pairs.forEach(x => { out[x.name] = x.value / total * 100; });
  return out;
}
function equityOf(mix){ return Object.keys(mix).filter(isEquity).reduce((a, k) => a + mix[k], 0); }

function personName(id){
  if (id === "joint") return "Joint";
  const p = hh.people.find(x => x.id === id);
  const i = hh.people.indexOf(p);
  return p && p.name.trim() ? p.name.trim() : "Person " + (i + 1);
}
function accountLabel(a){ return personName(a.owner) + " — " + (a.type || "Account"); }

/** Everything the summary, the check and the document need, worked out once. */
function analyse(){
  const prof = profileOf(hh.profileId);
  const rows = hh.accounts.map(a => {
    const model = a.portfolioId ? portfolioById(a.portfolioId) : null;
    const value = moneyValue(a.value);
    const mix = mixOf(model);
    const eq = model && Object.keys(mix).length ? equityOf(mix) : null;
    const fit = eq == null ? "" : eq < prof.equityMin - 0.5 ? "below" : eq > prof.equityMax + 0.5 ? "above" : "within";
    return {a, model, value, mix, eq, fit};
  });
  const counted = rows.filter(r => r.value > 0 && r.model && r.eq != null);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const countedTotal = counted.reduce((s, r) => s + r.value, 0);
  const combined = {};
  counted.forEach(r => Object.keys(r.mix).forEach(k => { combined[k] = (combined[k] || 0) + r.mix[k] * r.value / countedTotal; }));
  const equity = countedTotal ? equityOf(combined) : null;
  const status = equity == null ? "none" : equity < prof.equityMin - 0.5 ? "below" : equity > prof.equityMax + 0.5 ? "above" : "within";

  const issues = [];
  if (!hh.household.name.trim()) issues.push({level:"info", t:"No household name for the cover yet.", go:"fldHousehold"});
  if (!hh.accounts.length) issues.push({level:"warn", t:"No accounts yet — add them under People & accounts."});
  rows.forEach(r => {
    const id = "acc-" + r.a.id;
    if (!r.value) issues.push({level:"warn", t: accountLabel(r.a) + ": no dollar amount.", go:id});
    if (!r.a.portfolioId) issues.push({level:"warn", t: accountLabel(r.a) + ": no model portfolio chosen.", go:id});
    else if (!r.model) issues.push({level:"warn", t: accountLabel(r.a) + ": its model is not in this computer's library.", go:id});
    else if (r.eq == null) issues.push({level:"info", t: accountLabel(r.a) + ": the model has no allocation data, so it is left out of the combined mix.", go:id});
  });
  if (status === "above" || status === "below")
    issues.unshift({level:"bad", t:"The combined portfolio is " + pct(equity) + " equities — " + (status === "above" ? "above" : "below") +
      " the " + prof.name + " range of " + prof.equityMin + "–" + prof.equityMax + "%."});
  return {prof, rows, total, countedTotal, combined, equity, status, issues};
}

/* ── The document ───────────────────────────────────────────────────────── */

function docTitle(){
  const sn = surnameOf(hh.household.name);
  return sn ? "The " + sn + " Portfolio" : "Your Portfolio";
}
function buildDeck(A){
  const doc = hh.doc, prof = A.prof;
  const sections = [];
  if (doc.profilePage) sections.push({id:"s-profile", title:"Your investor profile", kicker:"", blocks:[
    {id:"b-profile", type:"investorprofile", profile: prof}
  ]});
  if (doc.summaryPage){
    const blocks = [
      {id:"b-stats", type:"stats", cols:3, items:[
        {num: fmt$(A.total), label:"Total invested", note: hh.accounts.length + " account" + (hh.accounts.length === 1 ? "" : "s")},
        {num: A.equity == null ? "—" : pct(A.equity), label:"Combined equities", note:"weighted by account value"},
        {num: prof.equityMin + "–" + prof.equityMax + "%", label:"Equity range", note: prof.name + " profile"}]},
      {id:"b-table", type:"householdtable"}
    ];
    const names = Object.keys(A.combined);
    if (names.length) blocks.push({id:"b-mix", type:"chart", chart:"donut", title:"Combined asset allocation",
      labels: names, series:[{name:"Allocation", values: names.map(n => Math.round(A.combined[n] * 10) / 10)}], unit:"%",
      caption:"Weighted by account value, from each model portfolio's allocation as at its profile date. Allocations change over time."});
    if (A.equity != null) blocks.push({id:"b-range", type:"rangecheck"});
    if (hh.notes.trim()) blocks.push({id:"b-notes", type:"paragraph", text: hh.notes.trim()});
    sections.push({id:"s-summary", title:"Your portfolio at a glance", kicker:"", blocks});
  }
  if (doc.modelPages){
    A.rows.filter(r => r.a.portfolioId).forEach(r => {
      const sec = makeRecommendationSection({account: accountLabel(r.a), amount: r.value ? fmt$(r.value) : "",
        portfolioId: r.a.portfolioId, howItFits: r.a.howItFits});
      sec.id = "s-" + r.a.id; sec.blocks[0].id = "rec-" + r.a.id;
      sections.push(sec);
    });
  }
  return {
    version:1,
    meta:{kind:"portfolio", title: docTitle(), kicker:"Portfolio recommendation",
      subtitle:"Your investor profile, how your accounts work together, and the portfolio we recommend for each one.",
      client: hh.household.name.trim(), advisor: hh.household.advisor, date: hh.household.date},
    cover:{style: doc.cover, image:""},
    design:{accent:"gold", density:"comfortable", look:"private", format: doc.format},
    options:{toc: doc.toc, dividers:false, sectionBreak:true, team: doc.team, disclosures: doc.disclosures,
      draft: doc.draft, confidential:true, pageNumbers:true, watermark:false, runningHead:true},
    sections, team: BRAND.team, contact:{firm:BRAND.firm, address:BRAND.address, phone:BRAND.phone, web:BRAND.web},
    disclosures: BRAND.disclosures
  };
}

/* the three blocks only this document has, drawn by the shared page engine */
let currentAnalysis = null;
function rangeBar(min, max, marker){
  const pos = v => Math.max(0, Math.min(100, v)) + "%";
  return `<div class="pb-range"><div class="pb-range-track">` +
    `<div class="pb-range-band" style="left:${pos(min)};width:${Math.max(0, Math.min(100, max) - Math.max(0, min))}%"></div>` +
    (marker == null ? "" : `<div class="pb-range-mark" style="left:${pos(marker)}"><span>${esc(pct(marker))}</span></div>`) +
    `</div><div class="pb-range-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>` +
    `<div class="pb-range-key"><i></i>${esc(min + "–" + max + "% equities")}${marker == null ? "" : '<b></b>this portfolio'}</div></div>`;
}
BLOCK_RENDERERS.investorprofile = (b, wrap) => {
  const p = b.profile;
  wrap.insertAdjacentHTML("beforeend",
    `<div class="pb-profile"><div class="pb-prof-kicker">You are a</div><div class="pb-prof-name">${esc(p.name)} investor</div>` +
    `<p class="blk-lead">${esc(p.description)}</p>` +
    `<div class="pb-prof-label">How much of the portfolio may be in equities</div>${rangeBar(p.equityMin, p.equityMax, null)}` +
    `<div class="blk-facts">` + [["Equities allowed", p.equityMin + "% – " + p.equityMax + "%"], ["Time horizon", p.horizon],
      ["Primary objective", p.objective], ["What to expect", p.volatility]].filter(r => r[1]).map(r =>
      `<div class="fact"><span class="f-k">${esc(r[0])}</span><span class="f-dots"></span><span class="f-v">${esc(r[1])}</span></div>`).join("") +
    `</div><p class="pb-fineprint">Your investor profile comes from what you have told us about your goals, time horizon and comfort with risk. ` +
    `If any of that changes, the profile — and the portfolio — should be revisited.</p></div>`);
};
BLOCK_RENDERERS.householdtable = (b, wrap) => {
  const A = currentAnalysis;
  const owners = hh.people.map(p => p.id).concat("joint");
  let body = "";
  owners.forEach(o => {
    const rows = A.rows.filter(r => r.a.owner === o);
    if (!rows.length) return;
    const sub = rows.reduce((s, r) => s + r.value, 0);
    body += `<tr class="pb-group"><td colspan="5">${esc(personName(o))}</td></tr>`;
    rows.forEach(r => {
      body += `<tr><td>${esc(r.a.type || "Account")}</td><td>${esc(r.model ? r.model.portfolioName.replace(/^TD Core Managed (Asset Allocation )?Portfolios - /, "TD Core ") : "—")}</td>` +
        `<td class="num">${r.eq == null ? "—" : esc(pct(r.eq))}</td><td class="num">${r.value ? esc(fmt$(r.value)) : "—"}</td>` +
        `<td class="num">${A.total ? esc(pct(r.value / A.total * 100, 1)) : "—"}</td></tr>`;
    });
    if (rows.length > 1) body += `<tr class="pb-sub"><td colspan="3">${esc(personName(o))} total</td><td class="num">${esc(fmt$(sub))}</td><td class="num">${A.total ? esc(pct(sub / A.total * 100, 1)) : ""}</td></tr>`;
  });
  body += `<tr class="total"><td colspan="2">Household total</td><td class="num">${A.equity == null ? "" : esc(pct(A.equity))}</td><td class="num">${esc(fmt$(A.total))}</td><td class="num">100%</td></tr>`;
  wrap.insertAdjacentHTML("beforeend", `<div class="blk-table pb-table"><table><thead><tr><th>Account</th><th>Model portfolio</th>` +
    `<th class="num">Equities</th><th class="num">Amount</th><th class="num">Share</th></tr></thead><tbody>${body}</tbody></table></div>`);
};
BLOCK_RENDERERS.rangecheck = (b, wrap) => {
  const A = currentAnalysis, p = A.prof;
  const said = A.status === "within"
    ? `At <b>${esc(pct(A.equity))}</b> equities, the combined portfolio sits within the ${esc(p.name)} range of ${p.equityMin}–${p.equityMax}%.`
    : `At <b>${esc(pct(A.equity))}</b> equities, the combined portfolio is ${A.status === "above" ? "above" : "below"} the ${esc(p.name)} range of ${p.equityMin}–${p.equityMax}%.`;
  wrap.insertAdjacentHTML("beforeend", `<div class="pb-check is-${A.status}"><div class="pb-prof-label">How the household lines up with your profile</div>` +
    rangeBar(p.equityMin, p.equityMax, A.equity) + `<p>${said} Individual accounts may sit higher or lower on purpose — it is the household as a whole that matters.</p></div>`);
};

function render(){
  const A = currentAnalysis = analyse();
  deck = buildDeck(A);
  const host = $("pages");
  const top = host.scrollTop;
  const result = layout(deck, host);
  host.scrollTop = top;
  $("pageCount").textContent = result.pages.length + (result.pages.length === 1 ? " page" : " pages");
  $$("#pages .blk-recommendation").forEach(n => {
    n.title = "Click to go to this account";
    n.onclick = () => {
      const id = n.dataset.bid.replace(/^rec-/, "");
      const row = $("acc-" + id);
      if (row){ row.scrollIntoView({block:"center", behavior:"smooth"}); row.classList.add("is-flash"); setTimeout(() => row.classList.remove("is-flash"), 1200); }
    };
  });
  applyZoom();
  renderCheck(A);
  updateStatuses(A);
  updateUndo();
  const now = JSON.stringify(hh);
  if (now !== lastSaved){ $("saveState").textContent = "unsaved changes"; autosave(); }
}
function relayoutSoon(){ clearTimeout(relayoutTimer); relayoutTimer = setTimeout(render, 220); }
function applyZoom(){
  const host = $("pages");
  const w = parseFloat(getComputedStyle(host).getPropertyValue("--pw")) || 816;
  const z = zoom || Math.min(1, Math.max(0.2, (host.clientWidth - 48) / w));
  $$(".page", host).forEach(p => { p.style.zoom = z; });
  $("zoomLabel").textContent = zoom ? Math.round(z * 100) + "%" : "Fit";
}
function autosave(){ try { localStorage.setItem(BUILDER_KEY, JSON.stringify(hh)); } catch (e){} }
function markSaved(text){ lastSaved = JSON.stringify(hh); $("saveState").textContent = text; }

/* ── The rail ───────────────────────────────────────────────────────────── */

function syncPanels(){ rebuildRail(); }          /* the portfolio library calls this after a change */

function rebuildRail(){
  const h = hh.household;
  $("fldHousehold").value = h.name;
  $("fldDate").value = h.date;
  const adv = $("fldAdvisor");
  const opts = [""].concat(BRAND.team.map(m => m.name + (m.desig ? ", " + m.desig : ""))).concat([BRAND.firm]);
  if (h.advisor && !opts.includes(h.advisor)) opts.push(h.advisor);
  adv.innerHTML = opts.map(o => '<option value="' + esc(o) + '">' + esc(o || "— choose —") + "</option>").join("");
  adv.value = h.advisor;
  $("fldNotes").value = hh.notes;
  $("optCover").value = hh.doc.cover; $("optFormat").value = hh.doc.format;
  [["optProfilePage","profilePage"],["optSummaryPage","summaryPage"],["optModelPages","modelPages"],["optToc","toc"],
   ["optTeam","team"],["optDisc","disclosures"],["optDraft","draft"]].forEach(([id, k]) => { $(id).checked = !!hh.doc[k]; });
  buildProfileGrid();
  buildPeople();
}

function buildProfileGrid(){
  const grid = $("profileGrid");
  grid.innerHTML = "";
  investorProfiles.forEach(p => {
    const b = el("button", "profile-card" + (p.id === hh.profileId ? " is-on" : ""),
      "<b>" + esc(p.name) + "</b><span>Equities " + p.equityMin + "–" + p.equityMax + "%</span>");
    b.type = "button";
    b.onclick = () => { snapshot(); hh.profileId = p.id; buildProfileGrid(); render(); };
    grid.appendChild(b);
  });
  const prof = profileOf(hh.profileId);
  const model = suggestedModel(prof);
  $("profileNote").innerHTML = esc(prof.description) + (model ? "<br><b>Matching model:</b> " + esc(model.portfolioName) : "");
}
function suggestedModel(prof){
  const n = prof.name.toLowerCase();
  return portfolioLibrary.find(p => p.portfolioName.toLowerCase().endsWith("- " + n)) ||
         portfolioLibrary.find(p => p.portfolioName.toLowerCase().includes(n)) || null;
}

function modelOptions(selected){
  const list = sortedPortfolios();
  let html = '<option value="">— choose a model portfolio —</option>';
  if (selected && !portfolioById(selected)) html += '<option value="' + esc(selected) + '" selected>(not in this library) ' + esc(selected) + "</option>";
  return html + list.map(p => {
    const eq = equityOf(mixOf(p));
    return '<option value="' + esc(p.portfolioId) + '"' + (p.portfolioId === selected ? " selected" : "") + ">" +
      esc(p.portfolioName.replace(/^TD Core Managed (Asset Allocation )?Portfolios - /, "TD Core · ")) +
      (Object.keys(mixOf(p)).length ? "  (" + Math.round(eq) + "% equity)" : "") + "</option>";
  }).join("");
}
function typeOptions(selected, joint){
  const list = joint ? ACCOUNT_TYPES.filter(t => /joint|corporate|non-registered|resp/i.test(t)).concat(["Other"])
                     : ACCOUNT_TYPES.filter(t => !/^joint/i.test(t)).concat(["Other"]);
  if (selected && !list.includes(selected)) list.unshift(selected);
  return list.map(t => "<option" + (t === selected ? " selected" : "") + ">" + esc(t) + "</option>").join("");
}

/** A text box that snapshots once per editing burst, so Undo takes back a whole edit. */
function bindText(input, get, set, after){
  input.value = get();
  let armed = false;
  input.onfocus = () => { armed = true; };
  input.oninput = () => { if (armed){ snapshot(); armed = false; } set(input.value); (after || relayoutSoon)(); };
}

function buildPeople(){
  const host = $("people");
  host.innerHTML = "";
  const owners = hh.people.map(p => p.id).concat("joint");
  owners.forEach((o, i) => {
    const grp = el("div", "pb-person" + (o === "joint" ? " is-joint" : ""));
    const head = el("div", "pb-person-head");
    if (o === "joint"){
      head.appendChild(el("span", "pb-person-name", "Joint accounts"));
    } else {
      const p = hh.people.find(x => x.id === o);
      const name = document.createElement("input");
      name.placeholder = "Person " + (i + 1) + "'s first name";
      bindText(name, () => p.name, v => { p.name = v; });
      head.appendChild(name);
      const del = el("button", "o-del", "✕"); del.type = "button"; del.title = "Remove this person and their accounts";
      del.onclick = () => {
        const n = hh.accounts.filter(a => a.owner === o).length;
        if (n && !confirm("Remove " + personName(o) + " and their " + n + " account" + (n === 1 ? "" : "s") + "?")) return;
        snapshot(); hh.people = hh.people.filter(x => x.id !== o); hh.accounts = hh.accounts.filter(a => a.owner !== o);
        buildPeople(); render();
      };
      head.appendChild(del);
    }
    grp.appendChild(head);
    hh.accounts.filter(a => a.owner === o).forEach(a => grp.appendChild(accountRow(a, o === "joint")));
    const add = el("button", "btn btn-mini btn-ghost pb-add", o === "joint" ? "+ Add a joint account" : "+ Add an account");
    add.type = "button";
    add.onclick = () => {
      snapshot();
      const used = hh.accounts.filter(x => x.owner === o).map(x => x.type);
      const pick = (o === "joint" ? ["Joint Non-Registered Account", "Corporate Account", "RESP"] : ["RRSP", "TFSA", "RRIF", "LIRA", "Spousal RRSP", "FHSA", "Individual Non-Registered Account"]).find(t => !used.includes(t)) || "Other";
      const m = suggestedModel(profileOf(hh.profileId));
      const acc = {id:uid(), owner:o, type:pick, value:"", portfolioId: m ? m.portfolioId : "", howItFits:[]};
      hh.accounts.push(acc);
      buildPeople(); render();
      const row = $("acc-" + acc.id); if (row) row.querySelector(".pb-val").focus();
    };
    grp.appendChild(add);
    host.appendChild(grp);
  });
}

function accountRow(a, joint){
  const row = el("div", "pb-acct"); row.id = "acc-" + a.id;
  const line = el("div", "pb-acct-line");
  const type = document.createElement("select"); type.className = "pb-type"; type.innerHTML = typeOptions(a.type, joint);
  type.onchange = () => { snapshot(); a.type = type.value; render(); };
  const val = document.createElement("input"); val.className = "pb-val"; val.placeholder = "$ value"; val.inputMode = "decimal";
  bindText(val, () => a.value, v => { a.value = v; });
  val.onblur = () => { const n = moneyValue(val.value); if (n){ a.value = fmt$(n); val.value = a.value; } };
  const del = el("button", "o-del", "✕"); del.type = "button"; del.title = "Remove this account";
  del.onclick = () => { snapshot(); hh.accounts = hh.accounts.filter(x => x !== a); buildPeople(); render(); };
  line.append(type, val, del);
  const model = document.createElement("select"); model.className = "pb-model"; model.innerHTML = modelOptions(a.portfolioId);
  model.onchange = () => { snapshot(); a.portfolioId = model.value; render(); };
  const status = el("div", "pb-status"); status.id = "st-" + a.id;
  const more = document.createElement("details"); more.className = "pb-more";
  more.innerHTML = "<summary>How it fits the plan" + (a.howItFits.length ? " (" + a.howItFits.length + ")" : "") + "</summary>";
  const fit = document.createElement("textarea"); fit.rows = 4;
  fit.placeholder = "Up to four points, one per line. Leave blank to use the model's standard points.";
  bindText(fit, () => a.howItFits.join("\n"), v => { a.howItFits = fitLines(v); });
  const tools = el("div", "btn-row");
  tools.appendChild(inspBtn("Copy a Copilot prompt for these points", () =>
    copyText(fitPrompt(portfolioById(a.portfolioId), a.type, moneyValue(a.value) ? fmt$(moneyValue(a.value)) : ""),
      "Prompt copied — paste Copilot's four bullets into the box.")));
  tools.appendChild(inspBtn("View model", () => { const p = portfolioById(a.portfolioId); if (p) openPortfolioViewer(p, a.howItFits, true); else toast("Choose a model first."); }));
  more.append(fit, tools);
  row.append(line, model, status, more);
  return row;
}

function updateStatuses(A){
  A.rows.forEach(r => {
    const s = $("st-" + r.a.id);
    if (!s) return;
    if (!r.a.portfolioId){ s.className = "pb-status is-empty"; s.textContent = "Choose a model portfolio"; return; }
    if (!r.model){ s.className = "pb-status is-warn"; s.textContent = "This model is not in this computer's library"; return; }
    const share = A.total && r.value ? " · " + pct(r.value / A.total * 100, 1) + " of the household" : "";
    if (r.eq == null){ s.className = "pb-status"; s.textContent = "No allocation data" + share; return; }
    const word = r.fit === "within" ? "inside the profile range" : r.fit === "above" ? "more growth than the profile range" : "more conservative than the profile range";
    s.className = "pb-status is-" + r.fit;
    s.textContent = pct(r.eq) + " equities — " + word + share;
  });
}

function renderCheck(A){
  const body = $("checkBody");
  const p = A.prof;
  let html = '<div class="pb-totals"><div><span>Household total</span><b>' + esc(fmt$(A.total)) + "</b></div>" +
    "<div><span>Combined equities</span><b>" + (A.equity == null ? "—" : esc(pct(A.equity, 1))) + "</b></div>" +
    "<div><span>" + esc(p.name) + " range</span><b>" + p.equityMin + "–" + p.equityMax + "%</b></div></div>";
  html += '<div class="doc pb-mini pb-check is-' + A.status + '">' + rangeBar(p.equityMin, p.equityMax, A.equity) + "</div>";
  if (A.status === "within") html += '<div class="check-ok"><b>Lines up.</b> The household as a whole sits inside the ' + esc(p.name) + " range.</div>";
  else if (A.status === "none") html += '<p class="hint">Add amounts and models to see the combined mix.</p>';
  A.issues.forEach(is => {
    html += '<button class="check-row is-' + is.level + '"' + (is.go ? ' data-go="' + esc(is.go) + '"' : "") + ">" + esc(is.t) + "</button>";
  });
  body.innerHTML = html;
  $$("#checkBody .check-row[data-go]").forEach(b => b.onclick = () => {
    const t = $(b.dataset.go); if (!t) return;
    t.scrollIntoView({block:"center", behavior:"smooth"});
    (t.matches("input,select") ? t : t.querySelector("input,select")).focus({preventScroll:true});
  });
}

/* ── Profiles editor ────────────────────────────────────────────────────── */

function openProfilesEditor(){
  const rows = investorProfiles.map((p, i) => `
    <div class="pe-row" data-i="${i}">
      <input data-k="name" value="${esc(p.name)}" aria-label="Name">
      <input data-k="equityMin" type="number" min="0" max="100" value="${p.equityMin}" aria-label="Minimum equity %">
      <input data-k="equityMax" type="number" min="0" max="100" value="${p.equityMax}" aria-label="Maximum equity %">
      <input data-k="horizon" value="${esc(p.horizon)}" aria-label="Time horizon">
      <input data-k="objective" value="${esc(p.objective)}" aria-label="Objective">
      <input data-k="volatility" value="${esc(p.volatility)}" aria-label="What to expect">
      <textarea data-k="description" rows="2" aria-label="Description">${esc(p.description)}</textarea>
    </div>`).join("");
  showModal("Investor profiles", `
    <div class="import-warn"><b>Confirm these with compliance.</b> The ranges are starting points chosen so each
      TD Core model sits inside its own profile. Change them to match the firm's KYC definitions — the change is kept in this browser.</div>
    <div class="pe-head"><span>Profile</span><span>Equity min %</span><span>Equity max %</span><span>Time horizon</span><span>Objective</span><span>What to expect</span><span>Description (printed on the profile page)</span></div>
    <div id="peRows">${rows}</div>
    <label class="check"><input type="checkbox" id="peReal" ${realAssetsAsEquity ? "checked" : ""}> Count real assets (real estate, infrastructure, commodities) as equities</label>
    <div class="modal-actions"><button class="btn btn-ghost" id="peReset">Restore the starting profiles</button>
      <button class="btn" id="peCancel">Cancel</button><button class="btn btn-primary" id="peSave">Save profiles</button></div>`, {wide:true});
  $("peCancel").onclick = hideModal;
  $("peReset").onclick = () => {
    if (!confirm("Put back the starting profiles and ranges?")) return;
    investorProfiles = structuredClone(DEFAULT_PROFILES); realAssetsAsEquity = false; saveProfiles();
    hideModal(); rebuildRail(); render();
  };
  $("peSave").onclick = () => {
    const next = investorProfiles.map(p => Object.assign({}, p));
    let bad = "";
    $$("#peRows .pe-row").forEach(r => {
      const p = next[+r.dataset.i];
      $$("[data-k]", r).forEach(inp => { const k = inp.dataset.k; p[k] = /equity/.test(k) ? Number(inp.value) : inp.value.trim(); });
      if (!(p.equityMin >= 0 && p.equityMax <= 100 && p.equityMin < p.equityMax)) bad = p.name;
    });
    if (bad){ toast("Check the range for " + bad + ": the minimum must be below the maximum, within 0–100."); return; }
    investorProfiles = next; realAssetsAsEquity = $("peReal").checked; saveProfiles();
    hideModal(); rebuildRail(); render(); toast("Profiles saved");
  };
}

/* ── Copilot: the "how it fits together" paragraph ──────────────────────── */

function notesPrompt(){
  const A = analyse();
  const who = id => id === "joint" ? "Joint" : "Person " + (hh.people.findIndex(p => p.id === id) + 1);
  const lines = A.rows.map(r => "- " + who(r.a.owner) + " " + (r.a.type || "account") + ": " + (r.value ? fmt$(r.value) : "amount not set") +
    " in " + (r.model ? r.model.portfolioName : "no model yet") + (r.eq == null ? "" : " (" + pct(r.eq) + " equities)"));
  return `I am an investment advisor writing the summary page of a household portfolio recommendation.

Write one short paragraph (3 to 4 sentences) explaining, in plain Canadian English, how these accounts work together as one portfolio for a ${A.prof.name} investor. Mention the role the registered and non-registered accounts play where it is clear from the facts. Use only the facts below. No promises, forecasts or advice language aimed at the reader ("you should"). Return only the paragraph.

INVESTOR PROFILE
${A.prof.name}: equities ${A.prof.equityMin}–${A.prof.equityMax}%. ${A.prof.description}

ACCOUNTS
${lines.join("\n")}

COMBINED
Total ${fmt$(A.total)}; ${A.equity == null ? "equity share not yet known" : pct(A.equity, 1) + " equities"}.

MY NOTES (optional)
[goals, which account is drawn on first, tax or estate considerations]`;
}

/* ── Files ──────────────────────────────────────────────────────────────── */

function fileStem(){
  return ((hh.household.name || "household").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 50) || "household") + "_" + hh.household.date;
}
function saveHousehold(){
  downloadFile(fileStem() + ".mhwg-portfolio.json", JSON.stringify(hh, null, 2));
  markSaved("saved to your Downloads folder");
}

/** A saved file, or a friendlier hand-written / Copilot / script shape:
    { "household":"…", "profile":"Balanced Growth",
      "people":[{"name":"Matt","accounts":[{"type":"RRSP","value":250000,"portfolio":"Balanced Growth"}]}],
      "joint":[{"type":"Joint Non-Registered Account","value":300000,"portfolio":"…"}] } */
function readHousehold(v){
  if (v && v.kind === "mhwg-portfolio") return migrateHousehold(v);
  if (!v || typeof v !== "object" || !Array.isArray(v.people)) throw Error('This is not a household file. It needs a "people" list.');
  const h = newHousehold();
  h.people = []; h.accounts = [];
  const findModel = ref => {
    const r = String(ref || "").trim().toLowerCase();
    if (!r) return "";
    const p = portfolioLibrary.find(x => x.portfolioId.toLowerCase() === r || x.portfolioName.toLowerCase() === r)
           || portfolioLibrary.find(x => x.portfolioName.toLowerCase().endsWith("- " + r))
           || portfolioLibrary.find(x => x.portfolioName.toLowerCase().includes(r));
    return p ? p.portfolioId : String(ref);
  };
  const acct = (owner, x) => ({id:uid(), owner, type:String(x.type || x.account || "Other"),
    value: moneyValue(x.value != null ? x.value : x.amount) ? fmt$(moneyValue(x.value != null ? x.value : x.amount)) : "",
    portfolioId: findModel(x.portfolioId || x.portfolio || x.model), howItFits: fitLines(x.howItFits || [])});
  v.people.forEach(p => {
    const id = pid();
    h.people.push({id, name:String(p.name || "")});
    (p.accounts || []).forEach(x => h.accounts.push(acct(id, x)));
  });
  (v.joint || []).forEach(x => h.accounts.push(acct("joint", x)));
  h.household.name = String(v.household || v.name || (v.meta && v.meta.client) || "");
  if (v.advisor) h.household.advisor = String(v.advisor);
  if (v.profile){
    const r = String(v.profile).toLowerCase().replace(/[\s-]+/g, "_");
    const prof = investorProfiles.find(p => p.id === r || p.name.toLowerCase() === String(v.profile).toLowerCase());
    if (prof) h.profileId = prof.id;
  }
  if (v.notes) h.notes = String(v.notes);
  return h;
}
function loadHouseholdText(text){
  let v;
  try {
    /* the outermost { … }, whatever Copilot wrapped around it */
    const raw = String(text), a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    v = JSON.parse(raw.slice(a, b + 1).replace(/,\s*([}\]])/g, "$1"));
  } catch (e){ alert("That is not valid JSON.\n\n" + e.message); return false; }
  try {
    const h = readHousehold(v);
    snapshot(); hh = h;
    rebuildRail(); render(); markSaved("opened");
    const missing = hh.accounts.filter(a => a.portfolioId && !portfolioById(a.portfolioId)).length;
    toast(missing ? missing + " account(s) name a model that is not in the library — choose one for each." : "Household loaded.", missing ? 6000 : 2600);
    return true;
  } catch (e){ alert(e.message); return false; }
}
function openPasteJSON(){
  showModal("Paste household JSON", `
    <p class="hint">From Copilot, a script or a spreadsheet. Models can be named by their full name, the end of it
      ("Balanced Growth") or their ID. This replaces the current household (Undo brings it back).</p>
    <pre class="prompt-preview">{
  "household": "Matt &amp; Kelsey Solberg",
  "profile": "Balanced Growth",
  "people": [
    { "name": "Matt",   "accounts": [ { "type": "RRSP", "value": 250000, "portfolio": "Balanced Growth" },
                                      { "type": "TFSA", "value": 95000,  "portfolio": "Growth" },
                                      { "type": "LIRA", "value": 120000, "portfolio": "Balanced" } ] },
    { "name": "Kelsey", "accounts": [ { "type": "Spousal RRSP", "value": 180000, "portfolio": "Balanced Growth" },
                                      { "type": "TFSA", "value": 90000,  "portfolio": "Growth" } ] }
  ],
  "joint": [ { "type": "Joint Non-Registered Account", "value": 300000, "portfolio": "Balanced" } ]
}</pre>
    <textarea id="pjBox" rows="10" spellcheck="false" placeholder="Paste the JSON here"></textarea>
    <div class="modal-actions"><button class="btn btn-ghost" id="pjCopy">Copy this format</button>
      <button class="btn" id="pjCancel">Cancel</button><button class="btn btn-primary" id="pjGo">Load it</button></div>`, {wide:true});
  $("pjCancel").onclick = hideModal;
  $("pjCopy").onclick = () => copyText($("modalBody").querySelector("pre").textContent, "Format copied.");
  $("pjGo").onclick = () => { if (loadHouseholdText($("pjBox").value)) hideModal(); };
}

function exportPdf(){
  const A = analyse();
  const blockers = A.issues.filter(i => i.level !== "info");
  const intro = blockers.length ? `<div class="import-warn"><b>Worth fixing first</b><ul>${blockers.map(i => "<li>" + esc(i.t) + "</li>").join("")}</ul></div>` : "";
  const slides = hh.doc.format === "slides";
  showModal("Export the PDF", `${intro}
    <h3>In the print window</h3>
    <ol>
      <li><b>Destination:</b> Save as PDF</li>
      <li><b>Layout:</b> ${slides ? "Landscape" : "Portrait"} · <b>Margins:</b> None · <b>Scale:</b> Default (100%)</li>
      <li>Under <b>More settings</b>: <b>Background graphics ON</b>, <b>Headers and footers OFF</b></li>
    </ol>
    <div class="modal-actions"><button class="btn" id="exCancel">Cancel</button>
      <button class="btn btn-primary" id="exGo">${blockers.length ? "Export anyway" : "Open the print window"}</button></div>`);
  $("exCancel").onclick = hideModal;
  $("exGo").onclick = () => {
    hideModal();
    let st = $("printPageSize");
    if (!st){ st = document.createElement("style"); st.id = "printPageSize"; document.head.appendChild(st); }
    st.textContent = slides ? "@page{size:13.333in 7.5in;margin:0}" : "@page{size:letter;margin:0}";
    setTimeout(() => window.print(), 60);
  };
}

function showHelp(){
  showModal("How the Portfolio Builder works", `
    <ol>
      <li><b>Household</b> — who it is for. This goes on the cover.</li>
      <li><b>Investor profile</b> — Conservative Income through Aggressive Growth, each with its equity range.
        <b>Edit profiles</b> sets the ranges and wording to the firm's definitions.</li>
      <li><b>People &amp; accounts</b> — each person's accounts with their dollar values, plus joint accounts. Give every
        account a model portfolio from the library. New accounts start on the profile's matching model.</li>
      <li><b>Does it line up?</b> — the household's combined mix, weighted by dollars, against the profile's range. Individual
        accounts can sit higher or lower on purpose (say, a growth TFSA); the household total is what is checked.</li>
      <li><b>The document</b> — cover, investor profile, portfolio at a glance, one locked model page per account, team, disclosures.</li>
    </ol>
    <h3>Copilot and automation</h3>
    <p>Each account has a Copilot prompt for its "How it fits the plan" points, and the summary paragraph has one too. To load a
      whole household from Copilot or a script, use <b>Paste household JSON</b>.</p>
    <h3>The portfolio library</h3>
    <p>The same library Presentation Studio uses, kept in this browser. Add a model with the portfolio-profile prompt and the
      fact sheet; share it with <b>Export library backup</b>.</p>
    <h3>Nothing leaves this computer</h3>
    <p>The page cannot make network requests. <b>Save</b> writes a <code>.mhwg-portfolio.json</code> file you can open again.</p>
    <div class="modal-actions"><button class="btn" id="hpPaste">Paste household JSON</button>
      <button class="btn btn-primary" id="hpClose">Got it</button></div>`, {wide:true});
  $("hpPaste").onclick = openPasteJSON;
  $("hpClose").onclick = hideModal;
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */

function wire(){
  $("btnUndo").onclick = undo; $("btnRedo").onclick = redo;
  $("btnNew").onclick = () => {
    if (!confirm("Start a new household? (Undo brings this one back.)")) return;
    snapshot(); hh = newHousehold();
    const m = suggestedModel(profileOf(hh.profileId));
    if (m) hh.accounts.forEach(a => { a.portfolioId = m.portfolioId; });
    rebuildRail(); render(); markSaved("not saved yet");
    $("fldHousehold").focus();
  };
  $("btnOpen").onclick = () => pickFile(".json", async f => loadHouseholdText(await readTextFile(f)));
  $("btnSave").onclick = saveHousehold; $("btnSave2").onclick = saveHousehold;
  $("btnHelp").onclick = showHelp;
  $("btnPasteJSON").onclick = openPasteJSON;
  $("btnExport").onclick = exportPdf; $("btnExport2").onclick = exportPdf;
  $("btnModalClose").onclick = hideModal;
  $("modal").addEventListener("mousedown", e => { if (e.target === $("modal")) hideModal(); });
  $("btnProfiles").onclick = openProfilesEditor;
  $("btnLibrary").onclick = openPortfolioLibrary;

  bindText($("fldHousehold"), () => hh.household.name, v => { hh.household.name = v; });
  $("fldAdvisor").onchange = () => { snapshot(); hh.household.advisor = $("fldAdvisor").value; render(); };
  $("fldDate").onchange = () => { snapshot(); hh.household.date = $("fldDate").value; render(); };
  bindText($("fldNotes"), () => hh.notes, v => { hh.notes = v; });
  $("btnNotesPrompt").onclick = () => copyText(notesPrompt(), "Prompt copied — paste Copilot's paragraph into the box.");
  $("optCover").onchange = () => { snapshot(); hh.doc.cover = $("optCover").value; render(); };
  $("optFormat").onchange = () => { snapshot(); hh.doc.format = $("optFormat").value; zoom = 0; render(); };
  [["optProfilePage","profilePage"],["optSummaryPage","summaryPage"],["optModelPages","modelPages"],["optToc","toc"],
   ["optTeam","team"],["optDisc","disclosures"],["optDraft","draft"]].forEach(([id, k]) => {
    $(id).onchange = () => { snapshot(); hh.doc[k] = $(id).checked; render(); };
  });
  $("btnAddPerson").onclick = () => {
    snapshot(); const id = pid(); hh.people.push({id, name:""}); buildPeople(); render();
    const inputs = $$("#people .pb-person-head input"); if (inputs.length) inputs[inputs.length - 1].focus();
  };
  $("btnFillModels").onclick = () => {
    const m = suggestedModel(profileOf(hh.profileId));
    if (!m){ toast("No model in the library matches this profile's name."); return; }
    const blank = hh.accounts.filter(a => !a.portfolioId);
    if (!blank.length){ toast("Every account already has a model."); return; }
    snapshot(); blank.forEach(a => { a.portfolioId = m.portfolioId; });
    buildPeople(); render(); toast(blank.length + " account(s) set to " + m.portfolioName);
  };

  $("btnZoomIn").onclick = () => { zoom = Math.min(1.6, (zoom || 0.6) + 0.1); applyZoom(); };
  $("btnZoomOut").onclick = () => { zoom = Math.max(0.3, (zoom || 0.6) - 0.1); applyZoom(); };
  $("zoomLabel").onclick = () => { zoom = 0; applyZoom(); };
  window.addEventListener("resize", () => { if (!zoom) applyZoom(); });

  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s"){ e.preventDefault(); saveHousehold(); }
    if (mod && e.key.toLowerCase() === "p"){ e.preventDefault(); exportPdf(); }
    if (mod && e.key.toLowerCase() === "z" && !typing){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (mod && e.key.toLowerCase() === "y" && !typing){ e.preventDefault(); redo(); }
    if (e.key === "Escape" && !$("modal").hidden) hideModal();
  });
  window.addEventListener("beforeunload", autosave);
}

function boot(){
  loadPortfolioLibrary();
  loadProfiles();
  let restored = null;
  try { restored = JSON.parse(localStorage.getItem(BUILDER_KEY) || "null"); } catch (e){}
  if (restored && restored.kind === "mhwg-portfolio") hh = migrateHousehold(restored);
  else {
    hh = newHousehold();
    const m = suggestedModel(profileOf(hh.profileId));
    if (m) hh.accounts.forEach(a => { a.portfolioId = m.portfolioId; });
  }
  $$("[data-wordmark]").forEach(n => n.appendChild(wordmark()));
  wire();
  rebuildRail();
  render();
  markSaved(restored ? "restored from this browser" : "not saved yet");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
}
document.addEventListener("DOMContentLoaded", boot);
