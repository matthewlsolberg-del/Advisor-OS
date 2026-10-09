/* ==========================================================================
   portfolios.js — the portfolio library and one-page account recommendations.

   Two separate things live here:

   · The PORTFOLIO LIBRARY. Approved portfolio profiles (name, approach,
     allocation, holdings…) kept in this browser, separate from any client
     file. The TD Core standard profiles are always available; your own come
     in from the Copilot portfolio-profile prompt as JSON.

   · ACCOUNT RECOMMENDATIONS. A section that says "for this account, this
     amount, this portfolio, and here is how it fits". It renders as one
     locked page built from the profile. The section keeps a copy of the
     profile, so a saved file still opens correctly on a partner's computer
     whose library does not have that portfolio.

   Replaces the v1.1 – v6.3 portfolio patches with one implementation.
   ========================================================================== */

const PORTFOLIO_STORE_KEY = "mhwg.presentation.portfolios.v1";
/* filled in by build.py from src/assets/standard-portfolios.json */
const STANDARD_PORTFOLIOS = /*@STANDARD_PORTFOLIOS@*/[];

const ACCOUNT_TYPES = [
  "Joint Non-Registered Account", "Individual Non-Registered Account", "Corporate Account",
  "TFSA", "RRSP", "Spousal RRSP", "RRIF", "LIRA", "LIF", "RESP", "FHSA", "RDSP"
];

let portfolioLibrary = [];

/* ── Library storage ────────────────────────────────────────────────────── */

function loadPortfolioLibrary(){
  let list = [];
  try { list = JSON.parse(localStorage.getItem(PORTFOLIO_STORE_KEY) || "[]"); } catch (e){ list = []; }
  if (!Array.isArray(list)) list = [];
  /* the standard profiles are always there; a saved copy (possibly edited) wins */
  const ids = new Set(list.map(p => String(p && p.portfolioId || "")));
  STANDARD_PORTFOLIOS.forEach(p => { if (!ids.has(p.portfolioId)) list.push(structuredClone(p)); });
  portfolioLibrary = list.filter(p => p && typeof p === "object").map(normalizePortfolio)
    .filter(p => p.portfolioName);
}
function savePortfolioLibrary(){
  try { localStorage.setItem(PORTFOLIO_STORE_KEY, JSON.stringify(portfolioLibrary)); return true; }
  catch (e){ toast("Could not save the portfolio library in this browser — export a backup.", 6000); return false; }
}
function sortedPortfolios(){
  return portfolioLibrary.slice().sort((a, b) => String(a.portfolioName).localeCompare(String(b.portfolioName)));
}
function portfolioById(id){
  return portfolioLibrary.find(p => String(p.portfolioId) === String(id)) || null;
}
function upsertPortfolio(p){
  const i = portfolioLibrary.findIndex(x => x.portfolioId === p.portfolioId);
  if (i >= 0) portfolioLibrary[i] = p; else portfolioLibrary.push(p);
  savePortfolioLibrary();
}

/* ── Reading a profile (from Copilot, a backup, or a saved file) ──────── */

function portfolioIdFromName(name){
  return String(name || "PORTFOLIO").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 64) || "PORTFOLIO";
}

/** Fill the gaps every older profile shape has, so one renderer handles all. */
function normalizePortfolio(p){
  p = Object.assign({}, p);
  const str = v => String(v == null ? "" : v).trim();
  p.portfolioName = str(p.portfolioName || p.name);
  p.portfolioId = str(p.portfolioId) || portfolioIdFromName(p.portfolioName);
  p.recommendationTitle = str(p.recommendationTitle) || p.portfolioName;
  p.investmentApproach = str(p.investmentApproach || p.approach);
  p.recommendationSummary = str(p.recommendationSummary) || p.investmentApproach;
  ["portfolioType", "riskLevel", "yield", "mer", "version", "effectiveDate", "disclosure", "profileType"]
    .forEach(k => { p[k] = str(p[k]); });
  if (!p.mer && p.MER) p.mer = str(p.MER);
  if (!p.effectiveDate) p.effectiveDate = str(p.asAtDate || p.date);
  const arr = v => Array.isArray(v) ? v : [];
  p.commentaryBlocks = arr(p.commentaryBlocks).length ? p.commentaryBlocks
    : arr(p.featureBlocks).length ? p.featureBlocks : arr(p.highlights);
  p.characteristics = arr(p.characteristics);
  p.topHoldings = arr(p.topHoldings).filter(x => x && (x.name || x.weight));
  p.fitTemplate = arr(p.fitTemplate).map(str).filter(Boolean);
  if (!Array.isArray(p.allocation)){
    p.allocation = p.allocation && typeof p.allocation === "object"
      ? Object.entries(p.allocation).map(([assetClass, percentage]) => ({assetClass, percentage:String(percentage)}))
      : arr(p.assetAllocation);
  }
  if (!p.allocation.length && arr(p.chartData).length)
    p.allocation = p.chartData.map(x => ({assetClass: x.label || x.name, percentage: String(x.percentage || x.value || "")}));
  if (!p.profileType) p.profileType = p.allocation.length ? "asset-allocation" : "custom";
  delete p.featureBlocks; delete p.highlights; delete p.assetAllocation;
  return p;
}

/** Copilot's answer -> a profile. Copes with ``` fences and chatter around the JSON. */
function parsePortfolioProfileText(text){
  let raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
  if (first < 0 || last < first) throw Error("No JSON object found. Paste the whole answer Copilot gave, starting with {");
  raw = raw.slice(first, last + 1);
  let p;
  try { p = JSON.parse(raw); } catch (e){ throw Error("That is not valid JSON (" + e.message + "). Ask Copilot to return valid JSON only."); }
  if (!p || typeof p !== "object" || Array.isArray(p)) throw Error("Paste one portfolio profile — a single { … } object.");
  p = normalizePortfolio(p);
  if (!p.portfolioName) throw Error("The profile has no portfolioName.");
  return p;
}
/** What a profile has and lacks, for the checklist shown before saving. */
function portfolioChecks(p){
  return [
    ["Portfolio name", !!p.portfolioName, true],
    ["Summary / investment approach", !!(p.recommendationSummary || p.investmentApproach), true],
    ["Commentary blocks", p.commentaryBlocks.length > 0, false],
    ["Asset allocation", allocationPairs(p).length > 0, false],
    ["Top holdings", p.topHoldings.length > 0, false],
    ["As-at date", !!p.effectiveDate, false]
  ];
}

const PORTFOLIO_PROMPT = `MHWG PORTFOLIO PROFILE GENERATOR

Review the attached approved portfolio PDF or fact sheet and return valid JSON only. Do not invent information. Leave unavailable fields blank. Use polished, client-friendly, factual and reusable wording. Do not include client-specific rationale.

Write a substantive recommendation summary and 4 portfolio-specific commentary blocks when the source supports them. Suitable titles include Investment Approach, Equity Emphasis, Income Focus, Security Selection, Fixed Income Foundation, Real Asset Exposure, Diversification, Disciplined Management.

Choose profileType from: asset-allocation, dividend-equity, equity-mandate, income-mandate, gic-ladder, custom.

ASSET ALLOCATION: use only Canadian Equity, U.S. Equity, International Equity, Fixed Income, Real Assets and Cash, and omit zero categories. If an Asset Class Breakdown chart shows Portfolio bars without printed percentages, estimate each Portfolio bar to the nearest whole percent so the total is 100% (ignore Benchmark bars). Do not estimate holdings, performance, yield, MER or any other figure.

Return exactly this structure:
{
  "portfolioId": "",
  "portfolioName": "",
  "profileType": "",
  "portfolioType": "",
  "riskLevel": "",
  "yield": "",
  "mer": "",
  "version": "",
  "effectiveDate": "",
  "recommendationSummary": "",
  "investmentApproach": "",
  "commentaryBlocks": [{"title": "", "description": ""}],
  "characteristics": [{"label": "Rebalancing", "value": ""}, {"label": "Holdings", "value": ""}],
  "allocation": [{"assetClass": "", "percentage": ""}],
  "topHoldings": [{"name": "", "weight": ""}],
  "fitTemplate": [""],
  "disclosure": ""
}`;

/* ── The one-page profile ───────────────────────────────────────────────── */

function escProfile(s){ return esc(String(s == null ? "" : s)); }
function preferredPortfolioTitle(p){ return String((p && p.portfolioName) || "").trim(); }
function numericProfileValue(v){
  const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function canonicalAllocationName(name){
  const n = String(name || "").toLowerCase();
  if (/cash|money market/.test(n)) return "Cash";
  if (/canadian equity|canada equity|canada|domestic equity|canadian stock/.test(n)) return "Canadian Equity";
  if (/u\.?s\.? equity|united states equity|united states|american equity|u\.?s\.? stock/.test(n)) return "U.S. Equity";
  if (/international|developed.*equity|equity.*developed|global equity|emerging/.test(n)) return "International Equity";
  if (/real estate|infrastructure|commodit|real asset/.test(n)) return "Real Assets";
  if (/bond|fixed income|government|corporate|high.?yield|credit/.test(n)) return "Fixed Income";
  return "Other";
}
const ALLOCATION_ORDER = ["Canadian Equity", "U.S. Equity", "International Equity", "Fixed Income", "Real Assets", "Cash"];
function allocationPairs(p){
  const sums = {};
  (p.allocation || []).forEach(x => {
    const v = numericProfileValue(x.percentage != null ? x.percentage : x.value);
    const k = canonicalAllocationName(x.assetClass || x.name || x.label);
    if (v > 0 && k !== "Other") sums[k] = (sums[k] || 0) + v;
  });
  return ALLOCATION_ORDER.filter(k => (sums[k] || 0) > .04).map(name => ({name, value: Math.round(sums[name] * 10) / 10}));
}
function donutMarkup(p){
  const actual = allocationPairs(p);
  const pairs = actual.length ? actual : [{name:"Allocation data unavailable", value:100}];
  const total = pairs.reduce((a, x) => a + x.value, 0) || 100, C = 2 * Math.PI * 45;
  const cols = actual.length ? BRAND.sequence : ["#D7DDD8"];
  let off = 0, circles = "";
  pairs.forEach((x, i) => {
    const len = C * x.value / total;
    circles += `<circle cx="50" cy="50" r="45" fill="none" stroke="${cols[i % cols.length]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
    off += len;
  });
  const svg = `<svg class="rec-donut" viewBox="0 0 100 100" role="img" aria-label="Asset Allocation"><circle cx="50" cy="50" r="45" fill="none" stroke="#E4E9E2" stroke-width="18"/>${circles}<circle cx="50" cy="50" r="31" fill="#fff"/></svg>`;
  const legend = pairs.map((x, i) => `<div class="rec-legend-row"><i class="rec-dot" style="background:${cols[i % cols.length]}"></i><span>${escProfile(x.name)}</span><b>${actual.length ? x.value + "%" : ""}</b></div>`).join("");
  return {svg, legend};
}
function portfolioCharacteristicValue(p, labels){
  const wanted = labels.map(x => x.toLowerCase());
  const item = (p.characteristics || []).find(x => x && wanted.includes(String(x.label || "").trim().toLowerCase()));
  return item ? String(item.value || "").trim() : "";
}
function portfolioStatsMarkup(p){
  const stats = [
    ["Rebalancing", p.rebalancing || portfolioCharacteristicValue(p, ["Rebalancing"]) || "Automatic"],
    ["Holdings", p.numberOfHoldings || p.holdingsCount || portfolioCharacteristicValue(p, ["Holdings", "Number of Holdings", "# Holdings"]) || "N/A"],
    ["Yield", p.yield || portfolioCharacteristicValue(p, ["Yield", "Distribution Yield", "Trailing 12-Month Distribution Yield"]) || "N/A"],
    ["MER", p.mer || portfolioCharacteristicValue(p, ["MER", "Management Expense Ratio"]) || "N/A"]
  ];
  return `<div class="rec-stats">${stats.map(x => `<div class="rec-stat"><div class="rec-stat-label">${escProfile(x[0])}</div><div class="rec-stat-value">${escProfile(x[1])}</div></div>`).join("")}</div>`;
}
function portfolioAsAt(p){
  const d = String(p.effectiveDate || "").trim();
  return d ? "Portfolio data shown as at " + d + ". Holdings and allocations change over time."
           : "Portfolio holdings and allocations change over time.";
}
function recommendationProfileMarkup(p, fit){
  p = normalizePortfolio(p);
  const d = donutMarkup(p);
  const blocks = p.commentaryBlocks.filter(x => x && (x.title || x.description)).slice(0, 4);
  const holdings = p.topHoldings.slice(0, 10);
  const fitItems = (fit && fit.length ? fit : p.fitTemplate.length ? p.fitTemplate
    : ["Client-specific rationale is added when this portfolio is selected for an account."]).slice(0, 4);
  const summary = p.recommendationSummary || p.investmentApproach || "";
  return `<div class="rec-profile"><div class="rec-label">Our Recommendation</div>` +
    `<div class="rec-recommendation-title">${escProfile(preferredPortfolioTitle(p))}</div>` +
    `<div class="rec-label">Investment Approach</div><p class="rec-summary">${escProfile(summary)}</p>` +
    (blocks.length ? `<div class="rec-commentary">${blocks.map(x => `<div class="rec-commentary-block"><b>${escProfile(x.title)}</b><span>${escProfile(x.description)}</span></div>`).join("")}</div>` : "") +
    portfolioStatsMarkup(p) +
    `<div class="rec-snapshot"><div class="rec-donut-wrap"><div class="rec-holdings-title rec-allocation-title">Asset Allocation</div>${d.svg}<div class="rec-legend">${d.legend}</div></div>` +
    `<div class="rec-holdings"><div class="rec-holdings-title">Representative Holdings</div><div class="rec-holdings-head"><span>Holding</span><span>Weight</span></div>` +
    holdings.map(x => `<div class="rec-holding"><span>${escProfile(x.name)}</span><span>${escProfile(x.weight)}</span></div>`).join("") + `</div></div>` +
    `<div class="rec-fit"><h3>How It Fits the Plan</h3><ul>${fitItems.map(x => `<li>${escProfile(x)}</li>`).join("")}</ul></div>` +
    `<div class="rec-asat">${escProfile(portfolioAsAt(p))}</div></div>`;
}

/* ── Recommendation blocks and sections ─────────────────────────────────── */

/** The profile a recommendation shows: the library's current one, else its own copy. */
function recProfile(b){
  return portfolioById(b.portfolioId) || (b.profile ? normalizePortfolio(b.profile) : null);
}
/** render.js calls this for a "recommendation" block. */
function recommendationHTML(b){
  const p = recProfile(b);
  if (!p) return '<div class="rec-profile"><div class="rec-label">Our Recommendation</div>' +
    '<div class="rec-recommendation-title">Choose a portfolio</div><p class="rec-summary">' +
    "This recommendation's portfolio is not in this computer's library. Click it and pick a portfolio on the right.</p></div>";
  return recommendationProfileMarkup(p, b.howItFits || []);
}

/** "$200000" -> "$200,000"; anything that is not a plain number is left as typed. */
function money(v){
  const t = String(v == null ? "" : v).trim();
  if (!t) return "";
  if (!/^\$?\s?[\d,]+(\.\d+)?$/.test(t)) return t;
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? new Intl.NumberFormat("en-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0}).format(n) : t;
}
function recSectionTitle(account, amount){
  return [account, amount].filter(Boolean).join("  |  ") || "Account Recommendation";
}
function fitLines(v){
  const list = Array.isArray(v) ? v : String(v || "").split(/\n+/);
  return list.map(x => String(x).replace(/^\s*[-•*·]\s*/, "").trim()).filter(Boolean).slice(0, 4);
}
/** A new recommendation section: {account, amount, portfolioId, howItFits}. */
function makeRecommendationSection(o){
  const p = portfolioById(o.portfolioId);
  const rec = Object.assign(newBlock("recommendation"), {
    portfolioId: o.portfolioId || "", howItFits: fitLines(o.howItFits),
    profile: p ? structuredClone(p) : (o.profile || null)
  });
  if (!rec.howItFits.length && p) rec.howItFits = p.fitTemplate.slice(0, 4);
  const sec = {id: uid(), kicker:"OUR RECOMMENDATIONS", summary:"", recommendation:true, accountRecommendation:true,
    accountName: String(o.account || "").trim(), accountAmount: money(o.amount), portfolioId: rec.portfolioId, blocks:[rec]};
  syncRecTitle(sec);
  return sec;
}
function syncRecTitle(sec){
  sec.title = recSectionTitle(sec.accountName, sec.accountAmount);
  sec.tocTitle = sec.runningTitle = sec.title;
}
function recSectionOf(blockId){
  return deck.sections.find(s => s.accountRecommendation && (s.blocks || []).some(b => b.id === blockId)) || null;
}
/** Older files: recommendation sections from v4–v6.3 come in with whatever they had. */
function migrateRecommendations(d){
  d.sections.forEach(sec => {
    const rec = (sec.blocks || []).find(b => b.type === "recommendation");
    if (!rec) return;
    sec.recommendation = true;
    sec.accountRecommendation = true;
    rec.portfolioId = rec.portfolioId || sec.portfolioId || (rec.profile && rec.profile.portfolioId) || "";
    sec.portfolioId = rec.portfolioId;
    rec.howItFits = fitLines(rec.howItFits);
    const lib = portfolioById(rec.portfolioId);
    if (lib) rec.profile = structuredClone(lib);
    if (!sec.kicker || sec.kicker === "WHAT WE RECOMMEND") sec.kicker = "OUR RECOMMENDATIONS";
    if (sec.accountName || sec.accountAmount) syncRecTitle(sec);
  });
}

/* ── Copilot help for "How it fits" ─────────────────────────────────────── */

function fitPrompt(p, account, amount){
  p = p || {};
  return `HOW IT FITS THE PLAN

Write exactly four concise, client-friendly bullets for the "How It Fits the Plan" box of an investment recommendation. Connect the portfolio to the role of this specific account in the household plan. Use only the facts below and in my notes. Do not invent facts, promise outcomes or repeat generic product marketing. One sentence per bullet. Return only the four bullets, each starting with "- ".

ACCOUNT
${account || "[account]"}${amount ? " | " + amount : ""}

PORTFOLIO
${p.portfolioName || "[portfolio]"}
${p.recommendationSummary || p.investmentApproach || ""}

MY NOTES ON THIS CLIENT AND ACCOUNT
[goals, time horizon, what this account is for, withdrawals, tax role, estate considerations]`;
}

/* ── UI: add / edit a recommendation ───────────────────────────────────── */

function portfolioOptions(selected){
  return '<option value="">— choose a portfolio —</option>' + sortedPortfolios().map(p =>
    `<option value="${esc(p.portfolioId)}"${p.portfolioId === selected ? " selected" : ""}>${esc(p.portfolioName)}</option>`).join("");
}
function accountOptions(selected){
  const list = ACCOUNT_TYPES.slice();
  if (selected && !list.includes(selected)) list.unshift(selected);
  return '<option value="">— choose an account —</option>' + list.map(a =>
    `<option${a === selected ? " selected" : ""}>${esc(a)}</option>`).join("");
}

/** The add-a-recommendation dialog. Editing an existing one happens in the right-hand panel. */
function openRecommendationDialog(){
  showModal("Add an account recommendation", `
    <p class="hint">One page per account: the portfolio's approved profile, plus your
    "how it fits" points. Add one for each account you are recommending.</p>
    <div class="form-grid">
      <label class="field"><span>Account</span><select id="rdAccount">${accountOptions("")}</select></label>
      <label class="field"><span>Amount</span><input id="rdAmount" placeholder="$200,000" inputmode="decimal"></label>
    </div>
    <label class="field"><span>Portfolio</span><select id="rdPortfolio">${portfolioOptions("")}</select></label>
    <p class="hint">Portfolio not listed? <a href="#" id="rdLib">Open the portfolio library</a> to add it.</p>
    <label class="field"><span>How it fits the plan — up to four points, one per line</span>
      <textarea id="rdFit" rows="5" placeholder="Leave blank to start from the portfolio's standard points"></textarea></label>
    <div class="btn-row">
      <button class="btn" id="rdPrompt">Copy a Copilot prompt for these points</button>
      <button class="btn" id="rdView">Preview the profile</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="rdCancel">Cancel</button>
      <button class="btn btn-primary" id="rdAdd">Add recommendation page</button>
    </div>`);
  const amt = $("rdAmount");
  amt.onblur = () => { amt.value = money(amt.value); };
  $("rdLib").onclick = (e) => { e.preventDefault(); openPortfolioLibrary(); };
  $("rdCancel").onclick = hideModal;
  $("rdPrompt").onclick = () => copyText(fitPrompt(portfolioById($("rdPortfolio").value), $("rdAccount").value, money(amt.value)),
    "Prompt copied. Run it in Copilot with your notes, then paste the four bullets into the box.");
  $("rdView").onclick = () => {
    const p = portfolioById($("rdPortfolio").value);
    if (!p){ toast("Choose a portfolio first."); return; }
    openPortfolioViewer(p, fitLines($("rdFit").value), true);
  };
  $("rdAdd").onclick = () => {
    const account = $("rdAccount").value, pid = $("rdPortfolio").value;
    if (!account){ toast("Choose the account."); $("rdAccount").focus(); return; }
    if (!pid){ toast("Choose the portfolio."); $("rdPortfolio").focus(); return; }
    snapshot();
    const sec = makeRecommendationSection({account, amount: amt.value, portfolioId: pid, howItFits: $("rdFit").value});
    deck.sections.push(sec);
    hideModal();
    selectedId = sec.blocks[0].id;
    syncPanels(); render(); selectBlock(selectedId, true);
    toast("Recommendation page added — adjust it in the panel on the right.");
  };
}

/** Inspector fields for a selected recommendation block. */
function buildRecommendationInspector(b, body){
  const sec = recSectionOf(b.id);
  const field = (label, html) => { const w = el("label", "field"); w.innerHTML = "<span>" + esc(label) + "</span>" + html; body.appendChild(w); return w; };
  body.appendChild(el("p", "insp-note", "The portfolio profile comes from the library and is locked so it always matches the approved wording. Change the account, amount, portfolio or your points here."));
  const acc = field("Account", `<select>${accountOptions(sec ? sec.accountName : "")}</select>`).querySelector("select");
  const amt = field("Amount", `<input placeholder="$200,000">`).querySelector("input");
  amt.value = sec ? sec.accountAmount || "" : "";
  const pf = field("Portfolio", `<select>${portfolioOptions(b.portfolioId)}</select>`).querySelector("select");
  const fit = field("How it fits the plan (one point per line, up to four)", "<textarea rows='7'></textarea>").querySelector("textarea");
  fit.value = (b.howItFits || []).join("\n");
  const commit = () => {
    snapshot();
    if (sec){ sec.accountName = acc.value; sec.accountAmount = money(amt.value); syncRecTitle(sec); }
    const p = portfolioById(pf.value);
    b.portfolioId = pf.value; if (sec) sec.portfolioId = pf.value;
    if (p) b.profile = structuredClone(p);
    b.howItFits = fitLines(fit.value);
    buildOutline(); render();
  };
  acc.onchange = commit; pf.onchange = commit;
  amt.onchange = () => { amt.value = money(amt.value); commit(); };
  fit.onchange = commit;
  const row = el("div", "btn-row btn-col");
  row.appendChild(inspBtn("Copy a Copilot prompt for “How it fits”", () =>
    copyText(fitPrompt(recProfile(b), acc.value, money(amt.value)), "Prompt copied — paste Copilot's four bullets into the box above.")));
  row.appendChild(inspBtn("View the full portfolio profile", () => { const p = recProfile(b); if (p) openPortfolioViewer(p, b.howItFits); }));
  row.appendChild(inspBtn("Open the portfolio library", openPortfolioLibrary));
  body.appendChild(row);
}

/* ── UI: the portfolio library ──────────────────────────────────────────── */

function openPortfolioViewer(p, fit, back){
  showModal(preferredPortfolioTitle(p), `
    <div class="profile-stage"><div class="doc profile-sheet" data-accent="gold" data-look="private">${recommendationProfileMarkup(p, fit || [])}</div></div>
    ${back ? "" : '<div class="modal-actions"><button class="btn" id="pvBack">Back to the library</button></div>'}`, {wide:true});
  if ($("pvBack")) $("pvBack").onclick = openPortfolioLibrary;
}

function openPortfolioLibrary(){
  showModal("Portfolio library", `
    <p class="hint">Approved portfolio profiles, kept in this browser and shared by every
    presentation. The TD Core standard profiles are built in. Add your own with the Copilot
    prompt below — attach the portfolio's fact sheet in Copilot and paste back what it returns.</p>
    <div class="lib-list" id="libList"></div>
    <details class="lib-add" id="libAdd">
      <summary>+ Add or update a portfolio</summary>
      <ol class="mini-steps">
        <li><button class="btn btn-mini" id="libPrompt">Copy the portfolio-profile prompt</button></li>
        <li>In Copilot, attach the approved fact sheet / PDF and paste the prompt.</li>
        <li>Paste Copilot's JSON answer here:</li>
      </ol>
      <textarea id="libJson" rows="10" spellcheck="false" placeholder='{ "portfolioName": "…", … }'></textarea>
      <div id="libChecks" class="lib-checks"></div>
      <div class="btn-row"><button class="btn" id="libCheck">Check it</button>
        <button class="btn btn-primary" id="libSave">Save to library</button></div>
    </details>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="libExport">Export library backup</button>
      <button class="btn btn-ghost" id="libImport">Import a backup</button>
      <button class="btn" id="libClose">Done</button>
    </div>`, {wide:true});

  const list = $("libList");
  sortedPortfolios().forEach(p => {
    const std = STANDARD_PORTFOLIOS.some(s => s.portfolioId === p.portfolioId);
    const used = deck.sections.filter(s => s.portfolioId === p.portfolioId).length;
    const row = el("div", "lib-row");
    row.innerHTML = `<div class="lib-main"><b>${esc(p.portfolioName)}</b><small>${esc([std ? "Standard" : "Your profile", p.effectiveDate && "as at " + p.effectiveDate, used && "used " + used + "× in this presentation"].filter(Boolean).join(" · "))}</small></div>`;
    const view = inspBtn("View", () => openPortfolioViewer(p));
    const edit = inspBtn("Edit JSON", () => {
      $("libAdd").open = true; $("libJson").value = JSON.stringify(p, null, 2); showChecks(); $("libJson").scrollIntoView({block:"center"});
    });
    const del = inspBtn("Remove", () => {
      if (!confirm("Remove " + p.portfolioName + " from this browser's library?" + (std ? "\n\nIt is a standard profile — it comes back the next time the program opens." : ""))) return;
      portfolioLibrary = portfolioLibrary.filter(x => x.portfolioId !== p.portfolioId);
      savePortfolioLibrary(); openPortfolioLibrary();
    }, "btn-danger");
    row.append(view, edit, del);
    list.appendChild(row);
  });

  const showChecks = () => {
    try {
      const p = parsePortfolioProfileText($("libJson").value);
      const exists = portfolioById(p.portfolioId);
      $("libChecks").innerHTML = portfolioChecks(p).map(([t, ok, must]) =>
        `<div class="${ok ? "ok" : must ? "bad" : "warn"}">${ok ? "✓" : must ? "✕" : "!"} ${esc(t)}${ok ? "" : must ? " — required" : " — missing"}</div>`).join("") +
        `<div class="ok">→ Saves as <b>${esc(p.portfolioName)}</b>${exists ? " (replaces the existing profile)" : " (new)"}</div>`;
      return p;
    } catch (e){
      $("libChecks").innerHTML = '<div class="bad">✕ ' + esc(e.message) + "</div>";
      return null;
    }
  };
  $("libPrompt").onclick = () => copyText(PORTFOLIO_PROMPT, "Portfolio-profile prompt copied — paste it into Copilot with the fact sheet attached.");
  $("libCheck").onclick = showChecks;
  $("libSave").onclick = () => {
    const p = showChecks();
    if (!p) return;
    if (!portfolioChecks(p).every(([, ok, must]) => ok || !must)) return;
    upsertPortfolio(p);
    toast("Saved " + p.portfolioName + " to the library.");
    openPortfolioLibrary();
  };
  $("libExport").onclick = () => downloadFile("MHWG Portfolio Library Backup.json", JSON.stringify(portfolioLibrary, null, 2));
  $("libImport").onclick = () => pickFile(".json", async f => {
    try {
      const incoming = JSON.parse(await readTextFile(f));
      if (!Array.isArray(incoming)) throw Error("A library backup is a list of portfolios.");
      incoming.map(normalizePortfolio).filter(p => p.portfolioName).forEach(p => {
        const i = portfolioLibrary.findIndex(x => x.portfolioId === p.portfolioId);
        if (i >= 0) portfolioLibrary[i] = p; else portfolioLibrary.push(p);
      });
      savePortfolioLibrary(); openPortfolioLibrary();
      toast("Backup merged into the library.");
    } catch (e){ alert("Could not import that backup.\n\n" + e.message); }
  });
  $("libClose").onclick = () => { hideModal(); syncPanels(); render(); };
}
