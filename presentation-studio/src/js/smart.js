/* ==========================================================================
   smart.js — drafts that are already written.

   "Build my draft" turns the facts read from dropped reports (facts.js), the
   advisor's notes, and the chosen kind of document into a finished-looking
   draft:
     · every figure comes straight from the reports — never typed, never guessed
     · the house wording is already written around those figures
     · [[blanks]] mark only what the advisor has to supply
     · "What we recommend" starts with suggestions drawn from the data

   Text the advisor may want reworded sits in "slots" (block.slot = key).
   Copilot can fill every slot in one go (slotPrompt / applySlotAnswer), and
   rebuilding the draft keeps any slot the advisor has already edited.
   ========================================================================== */

/* ── Formatting ─────────────────────────────────────────────────────────── */

const CAD0 = new Intl.NumberFormat("en-CA", {style:"currency", currency:"CAD", maximumFractionDigits:0});
const fm$ = (n) => n == null || isNaN(n) ? "[[amount]]" : CAD0.format(Math.round(n));
const fmPct = (n, dp) => n == null || isNaN(n) ? "[[%]]" : (Math.round(n * Math.pow(10, dp == null ? 2 : dp)) / Math.pow(10, dp == null ? 2 : dp)) + "%";
const fmM = (n) => n == null ? "" : n >= 1e6 ? "$" + (Math.round(n / 1e5) / 10) + "M" : "$" + Math.round(n / 1e3) + "K";
const yearOf = (d) => (String(d || "").match(/(19|20)\d{2}/) || [""])[0];
const andList = (xs) => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
const cleanFund = (s) => String(s || "").replace(/\s*\/NL\b/g, "").replace(/\s{2,}/g, " ").trim();

/** A block with all its content given (the factory's sample text never leaks in). */
function mk(type, props){ return Object.assign(newBlock(type), {seed: false}, props); }
/** A block of pre-written words the advisor (or Copilot) may reword. */
function slot(type, key, hint, props){ return Object.assign(mk(type, props), {slot: key, slotHint: hint, seed: true}); }
function sec(title, blocks, extra){
  return Object.assign({id: uid(), title, brief: title, kicker: "", summary: "", smart: true, blocks: blocks.filter(Boolean)}, extra || {});
}

/* ── Investor profiles (the firm's PMP / IPS definitions, carried from v8.7) ── */

const INVESTOR_PROFILES = {
  "Conservative Income": {objective:"Income with modest growth potential", tolerance:"Low to moderate", horizon:"Medium to long-term", equity:20, equityMin:0, equityMax:40, fixedIncome:80, fixedMin:0, fixedMax:100, description:"Seeks returns primarily from fixed income investments, with some potential for capital growth and dividends from very modest equity exposure."},
  "Balanced Income": {objective:"Income with modest capital growth", tolerance:"Low to moderate", horizon:"Medium to long-term", equity:35, equityMin:10, equityMax:50, fixedIncome:65, fixedMin:40, fixedMax:90, description:"Seeks returns from a majority of fixed income investments, with some potential for capital growth from a modest exposure to equities."},
  "Balanced": {objective:"Income and moderate long-term growth", tolerance:"Moderate", horizon:"Long-term", equity:50, equityMin:25, equityMax:75, fixedIncome:50, fixedMin:25, fixedMax:75, description:"Seeks returns from fixed income investments while also pursuing moderate long-term capital growth through equity exposure."},
  "Balanced Growth": {objective:"Long-term capital growth with income", tolerance:"Moderate to high", horizon:"Long-term", equity:65, equityMin:40, equityMax:80, fixedIncome:35, fixedMin:20, fixedMax:60, description:"Seeks long-term capital growth from equities while retaining the opportunity to earn income from fixed income investments."},
  "Growth": {objective:"Long-term capital growth", tolerance:"High", horizon:"Long-term", equity:75, equityMin:50, equityMax:90, fixedIncome:25, fixedMin:0, fixedMax:50, description:"Seeks long-term capital growth from equities, with some potential to earn modest returns from fixed income investments."},
  "Aggressive Growth": {objective:"Maximum long-term capital growth", tolerance:"Very high", horizon:"Long-term", equity:90, equityMin:60, equityMax:100, fixedIncome:10, fixedMin:0, fixedMax:40, description:"Seeks long-term capital growth primarily from equities and may experience substantial portfolio volatility and loss of capital."}
};
/** The model whose name matches the profile ("… - Balanced Growth"), if the library has one. */
function modelForProfile(name){
  const n = String(name || "").toLowerCase();
  if (!n) return null;
  return portfolioLibrary.find(p => p.portfolioName.toLowerCase().endsWith("- " + n)) || null;
}

/* ── The kinds of document, and what each one is built from ─────────────── */

const SMART_KINDS = [
  {kind:"portfolio_review", name:"Portfolio review", note:"Drop the Croesus report — accounts, holdings and returns fill themselves", uses:["portfolio"]},
  {kind:"plan_summary", name:"Financial plan summary", note:"Drop the financial plan — goals, net worth and the gaps, summarized", uses:["plan"]},
  {kind:"annual_review", name:"Annual review", note:"Both: the portfolio and where the plan stands", uses:["portfolio", "plan"]},
  {kind:"recommendation", name:"Investment recommendation", note:"Investor profile, the household summary and one page per account", uses:["portfolio"]},
  {kind:"proposal", name:"New-client proposal", note:"What we heard, what we would do, how we work", uses:[]},
  {kind:"topic", name:"Topic write-up", note:"One question: options, recommendation, caveats", uses:[]},
  {kind:"blank", name:"Start blank", note:"Build the sections yourself", uses:[]}
];

/* ── Portfolio review ──────────────────────────────────────────────────── */

function periodValue(P, re){ const p = (P.periods || []).find(x => re.test(x.label)); return p ? p.value : null; }
/** Holdings combined by fund across accounts, largest first. */
function combinedHoldings(P){
  const map = new Map();
  (P.holdings || []).filter(h => h.value > 0 && !/^ACCOUNT BALANCE|^Cash balance/i.test(h.name)).forEach(h => {
    const key = h.symbol || h.name;
    const x = map.get(key) || {name: cleanFund(h.name), symbol: h.symbol, value: 0, income: 0, accounts: []};
    x.value += h.value; x.income += h.income || 0;
    if (!x.accounts.includes(h.accountLabel)) x.accounts.push(h.accountLabel);
    map.set(key, x);
  });
  return [...map.values()].sort((a, b) => b.value - a.value);
}

function portfolioSuggestions(P){
  const out = [], total = P.total || 0;
  const firsts = P.firstNames || [];
  const legacy = (P.holdings || []).filter(h => h.nd || (h.value != null && h.value < 100 && !/ACCOUNT BALANCE/i.test(h.name)));
  if (legacy.length) out.push({t:"Tidy up legacy positions",
    d: (legacy.length > 4 ? legacy.slice(0, 3).map(h => cleanFund(h.name)).join(", ") + " and " + (legacy.length - 3) + " others" : andList(legacy.map(h => cleanFund(h.name)))) +
       (legacy.length === 1 ? " has" : " have") + " little or no market value. We will review whether to sell them or have them written off.", who:"Us", when:"[[timing]]"});
  const big = combinedHoldings(P).find(h => total && h.value / total > 0.25);
  if (big) out.push({t:"Review a large position",
    d: big.name + " is " + fmPct(big.value / total * 100, 1) + " of the portfolio" + (big.accounts.length > 1 ? ", across " + andList(big.accounts) : "") +
       ". [[keep, trim or diversify — and why]]", who:"Us", when:"[[timing]]"});
  (P.accounts || []).filter(a => a.value != null && a.value < 2000 && !REGISTERED.includes(a.kind)).forEach(a =>
    out.push({t:"Small account: " + a.label, d:"It holds " + fm$(a.value) + ". [[consolidate, top up or close]]", who:"Together", when:"[[timing]]"}));
  const tfsaOwners = (P.accounts || []).filter(a => a.kind === "TFSA").flatMap(a => a.owners || []);
  const noTfsa = firsts.filter(n => !tfsaOwners.includes(n));
  if (noTfsa.length && firsts.length) out.push({t:"TFSA for " + andList(noTfsa),
    d: andList(noTfsa) + (noTfsa.length === 1 ? " does" : " do") + " not have a TFSA with us. [[open one / transfer in / not needed]]", who:"You", when:"[[timing]]"});
  if ((P.accounts || []).some(a => a.kind === "TFSA")) out.push({t:"Use this year's TFSA room", d:"Contribute [[amount]] to " + andList((P.accounts || []).filter(a => a.kind === "TFSA").map(a => a.label)) + ".", who:"You", when:"[[when]]"});
  if ((P.accounts || []).some(a => /RRSP/.test(a.kind))) out.push({t:"RRSP contributions", d:"[[amount]] for the [[year]] tax year, before the contribution deadline.", who:"You", when:"[[deadline]]"});
  if ((P.accounts || []).some(a => a.kind === "RESP")) out.push({t:"Keep collecting the RESP grant", d:"The Canada Education Savings Grant adds 20% on the first $2,500 contributed each year per child. [[planned contribution]]", who:"You", when:"[[when]]"});
  const crypto = (P.holdings || []).filter(h => /BITC|ETHER|CRYPTO|BTC|ETH\b/i.test(h.name + " " + h.symbol));
  const cv = crypto.reduce((n, h) => n + (h.value || 0), 0);
  if (cv) out.push({t:"Speculative holdings", d:"About " + fm$(cv) + " is in crypto-asset funds. [[keep as a small position / reduce]]", who:"Together", when:"[[timing]]"});
  return out;
}

function buildPortfolioReview(P, notes, opts){
  const asOf = P.asOf || "[[date]]";
  const ytd = periodValue(P, /year to date|ytd/i), y1 = periodValue(P, /^1 Year/i), y5 = periodValue(P, /^5 Years?/i);
  const si = periodValue(P, /inception/i), siYear = yearOf(P.inception);
  const accts = (P.accounts || []).slice().sort((a, b) => (b.value || 0) - (a.value || 0));
  const total = P.total || accts.reduce((n, a) => n + (a.value || 0), 0);
  const reg = accts.filter(a => REGISTERED.includes(a.kind)).reduce((n, a) => n + (a.value || 0), 0);
  const top = combinedHoldings(P);
  const S = [];

  S.push(sec("Your portfolio at a glance", [
    mk("stats", {cols: 3, items: [
      {num: fm$(total), label: "Total value", note: "As at " + asOf},
      {num: ytd != null ? fmPct(ytd) : y1 != null ? fmPct(y1) : "[[return]]", label: ytd != null ? "Return this year" : "Return, past year", note: "Net of fees"},
      {num: si != null ? fmPct(si) : y5 != null ? fmPct(y5) : "[[return]]", label: si != null ? "A year since " + (siYear || "inception") : "A year over 5 years", note: "Annualized, net of fees"}]}),
    slot("lead", "glance", "One or two sentences: what the portfolio is worth and how it has done. Keep every figure exactly.", {text:
      "Your portfolio was worth " + fm$(total) + " on " + asOf + "." +
      (ytd != null ? " Net of fees, it has returned " + fmPct(ytd) + " so far this year" + (si != null ? ", and " + fmPct(si) + " a year since " + (siYear || "it began") : "") + "." : "")}),
    (P.netInvestment != null || P.growth != null || P.income) ? mk("facts", {items: [
      P.netInvestment != null && {k: "Money you have put in (deposits less withdrawals)", v: fm$(P.netInvestment)},
      P.growth != null && {k: "Growth on top of that", v: fm$(P.growth)},
      P.income && {k: "Estimated income the portfolio pays each year", v: fm$(P.income) + (P.yield ? " (" + fmPct(P.yield) + " yield)" : "")}].filter(Boolean)}) : null,
    slot("callout", "headline", "The one message the client should take away from this review, in one sentence.", {tone: "important", title: "The headline",
      text: "[[the one thing you want them to take away from this review]]"})
  ], {kicker: "As at " + asOf}));

  if (accts.length) S.push(sec("Your accounts", [
    mk("table", {headers: ["Account", "Type", "Value", "Share"], totalRow: true,
      caption: "Market values as at " + asOf + (P.usdcad && accts.some(a => a.currency === "USD" || /USD/.test(a.kind)) ? ". U.S.-dollar accounts converted at " + P.usdcad + "." : "."),
      rows: accts.map(a => [a.label, a.kind, fm$(a.value), total ? fmPct((a.value || 0) / total * 100, 1) : ""])
        .concat([["Total", "", fm$(total), "100%"]])}),
    accts.length > 1 ? mk("chart", {chart: "hbar", title: "Where the money sits", labels: accts.map(a => a.label),
      series: [{name: "Value", values: accts.map(a => Math.round((a.value || 0) / 1000))}], unit: "$K", caption: "Market value by account, in thousands of dollars.", size: "full"}) : null,
    slot("paragraph", "accounts", "A short paragraph on how the accounts are organized and what each is for.", {text:
      "You hold " + accts.length + " account" + (accts.length === 1 ? "" : "s") + " with us. " +
      (reg && total ? (reg / total > 0.995 ? "Almost all" : fmPct(reg / total * 100, 0)) + " of the money is in registered plans (" + andList([...new Set(accts.filter(a => REGISTERED.includes(a.kind)).map(a => a.kind))]) + "), where it grows tax-sheltered. " : "") +
      "[[what each account is for]]"})
  ]));

  if ((P.classes || []).length || top.length){
    const cls = (P.classes || []).filter(c => c.pct || c.value);
    S.push(sec("How your money is invested", [
      cls.length ? mk("chart", {chart: "donut", title: "Asset mix", labels: cls.map(c => c.name),
        series: [{name: "Share", values: cls.map(c => c.pct != null ? c.pct : Math.round(c.value / total * 1000) / 10)}], unit: "%",
        caption: "As classified in the portfolio report, as at " + asOf + ".", size: "full"}) : null,
      top.length ? mk("table", {headers: ["Largest holdings", "Held in", "Value", "Share"], totalRow: false,
        caption: "The ten largest holdings, combined across accounts.",
        rows: top.slice(0, 10).map(h => [h.name, andList(h.accounts), fm$(h.value), total ? fmPct(h.value / total * 100, 1) : ""])}) : null,
      slot("paragraph", "mix", "What the mix is designed to do, and anything notable about the largest holdings.", {text:
        (top[0] && total ? "The largest single holding is " + top[0].name + ", at " + fmPct(top[0].value / total * 100, 1) + " of the portfolio. " : "") +
        "[[what the mix is designed to do for you]]"})
    ]));
  }

  if ((P.periods || []).length || (P.years || []).length){
    const months = (P.monthly || []).slice(-24);
    const mname = (iso) => { const d = new Date(iso + "T12:00:00"); return d.toLocaleString("en-CA", {month: "short"}) + " " + String(d.getFullYear()).slice(2); };
    S.push(sec("How it has performed", [
      (P.periods || []).length ? mk("table", {headers: ["Period", "Return, net of fees"], totalRow: false,
        caption: "Money-weighted returns; periods over one year are annualized." + (P.inception ? " Since inception means since " + P.inception + "." : ""),
        rows: P.periods.map(p => [p.label, fmPct(p.value)])}) : null,
      (P.years || []).length > 1 ? mk("chart", {chart: "bar", title: "Calendar-year returns", labels: P.years.map(y => String(y.year)),
        series: [{name: "Return", values: P.years.map(y => y.value)}], unit: "%",
        caption: "Net of fees. " + P.years[P.years.length - 1].year + " is year to date. Past performance is not indicative of future results.", size: "full"}) : null,
      months.length > 3 ? mk("chart", {chart: "line", title: "Month-end value", labels: months.map(m => mname(m.iso)),
        series: [{name: "Value", values: months.map(m => Math.round(m.value / 1000))}], unit: "$K",
        caption: "Total value at each month-end, in thousands of dollars, including deposits and withdrawals.", size: "full"}) : null,
      slot("paragraph", "performance", "Plain, factual commentary on performance: what happened and what drove it. No forecasts.", {text:
        (y1 != null ? "Over the past year the portfolio returned " + fmPct(y1) + " net of fees" + (y5 != null ? "; over five years, " + fmPct(y5) + " a year" : "") + ". " : "") +
        "[[what drove the results]]"}),
      mk("callout", {tone: "note", title: "How to read these numbers",
        text: "Returns are money-weighted and net of fees, so they reflect when money went in and out as well as how the investments did. One period is a data point, not a verdict."})
    ]));
  }

  const sug = portfolioSuggestions(P);
  S.push(sec("What we recommend", [
    slot("lead", "recommend_intro", "One sentence introducing the recommendations.", {text: "[[the main change we are recommending, in one sentence]]"}),
    slot("actions", "recommendations", "The recommendations as an action plan: title, what happens and why, who, when. Start from the suggestions; remove any that do not apply.",
      {items: sug.length ? sug.slice(0, 6) : [{t: "[[recommendation]]", d: "[[what happens and why]]", who: "Us", when: "[[timing]]"}]})
  ]));
  S.push(sec("What happens next", [
    mk("actions", {items: [
      {t: "Confirm the recommendations", d: "Let us know which changes you would like to go ahead with.", who: "You", when: "[[date]]"},
      {t: "Put them in place", d: "We complete the paperwork and the trades, and confirm back to you.", who: "Us", when: "Within [[x]] business days"},
      {t: "Next review", d: "We meet again to check progress against the plan.", who: "Together", when: "[[month year]]"}]})
  ]));
  return S;
}

/* ── Financial plan summary ─────────────────────────────────────────────── */

function planSuggestions(F){
  const out = [], I = F.insights || {};
  const ret = (F.goals || []).find(g => /retire/i.test(g.name) && !/pre-?retire/i.test(g.name));
  if (ret && ret.met < ret.of) out.push({t: "Decide how to close the retirement gap",
    d: "Choose a mix of saving more, a lump sum, adjusting the retirement date or spending. [[the option we will model next]]", who: "Together", when: "[[timing]]"});
  if ((I.protection || []).some(p => p.amount > 0)) out.push({t: "Review life insurance coverage",
    d: "Compare existing coverage with the amounts the plan shows would be needed. We can connect you with a licensed insurance specialist.", who: "Together", when: "[[timing]]"});
  if ((F.education || []).some(e => e.cesgAvailable > 0)) out.push({t: "Collect the remaining education grant",
    d: andList(F.education.filter(e => e.cesgAvailable > 0).map(e => e.child + " (" + fm$(e.cesgAvailable) + " left)")) + " — contribute to the RESP to receive it.", who: "You", when: "Each year"});
  if (F.estate) out.push({t: "Keep wills and powers of attorney current", d: "Review them with your lawyer, especially after any change in family or finances.", who: "You", when: "[[timing]]"});
  out.push({t: "Revisit the plan", d: "Update the plan whenever something important changes, and at least once a year.", who: "Together", when: "[[month year]]"});
  return out;
}

function buildPlanSummary(F){
  const S = [], I = F.insights || {};
  const people = F.people || [], kids = F.children || [];
  const firstRetire = people.map(p => p.retireYear).filter(Boolean).sort()[0];
  const mixTop = (F.assetMix || []).slice().sort((a, b) => b.pct - a.pct)[0];

  S.push(sec("Where you stand today", [
    mk("stats", {cols: 3, items: [
      {num: fm$(F.netWorth), label: "Net worth", note: F.date ? "As at " + F.date : ""},
      {num: fm$(F.assets), label: "What you own", note: ""},
      {num: fm$(F.liabilities), label: "What you owe", note: ""}]}),
    people.length ? mk("facts", {items: people.map(p => ({k: p.first || p.name,
      v: "age " + p.age + (p.retireAge ? ", retiring at " + p.retireAge + (p.retireYear ? " (" + p.retireYear + ")" : "") : "")}))
      .concat(kids.length ? [{k: "Children", v: kids.map(c => c.first + " (" + c.age + ")").join(", ")}] : [])}) : null,
    (F.assetMix || []).length ? mk("chart", {chart: "donut", title: "What you own", labels: F.assetMix.map(a => a.name),
      series: [{name: "Share", values: F.assetMix.map(a => a.pct)}], unit: "%", caption: "Share of total assets, from the plan.", size: "full"}) : null,
    slot("paragraph", "stand", "A short, plain paragraph on the household's position today.", {text:
      (F.assets != null ? "Today you own " + fm$(F.assets) + " and owe " + fm$(F.liabilities) + ", for a net worth of " + fm$(F.netWorth) + ". " : "") +
      (mixTop ? "The largest part — " + fmPct(mixTop.pct, 1) + " — is " + mixTop.name.toLowerCase() + ". " : "") + "[[anything notable about where you stand]]"})
  ], {kicker: F.planName || ""}));

  if ((F.goals || []).length){
    const unfunded = F.goals.filter(g => g.of && g.met < g.of);
    S.push(sec("Your goals", [
      mk("table", {headers: ["Goal", "Amount (today's dollars)", "Years", "On track?"], totalRow: false,
        caption: "From the plan. Funded years show how many years the goal is fully paid for on current assumptions.",
        rows: F.goals.map(g => [g.name, g.amount != null ? fm$(g.amount) + "/" + (g.per || "yr") : "", g.start ? g.start + "–" + g.end : "",
          g.of ? (g.met >= g.of ? "Yes — all " + g.of + " years" : g.met + " of " + g.of + " years") : ""])}),
      unfunded.length ? mk("callout", {tone: "watch", title: "Where the plan falls short",
        text: unfunded.map(g => "The " + g.name.toLowerCase() + " of " + fm$(g.amount) + " a year is funded in " + g.met + " of " + g.of + " years.").join(" ")}) :
        mk("callout", {tone: "important", title: "On track", text: "On today's assumptions, every goal in the plan is fully funded."}),
      slot("paragraph", "goals", "What the goals mean for the client, in plain words.", {text: "[[what these goals mean for you]]"})
    ]));
  }

  if (I.saveMore || I.lumpSum || I.spendCapacity || I.returnNeeded){
    const growth = (F.assumptions || []).find(a => /investment growth/i.test(a.k));
    S.push(sec("Closing the gap", [
      mk("stats", {cols: 3, items: [
        I.saveMore && {num: fm$(I.saveMore), label: "More saved each year", note: I.saveUntil ? "until " + I.saveUntil : ""},
        I.lumpSum && {num: fm$(I.lumpSum), label: "Or a lump sum", note: I.lumpYear ? "invested in " + I.lumpYear : ""},
        I.spendCapacity && {num: fm$(I.spendCapacity), label: "Or spend this a year", note: "in retirement, before tax"}].filter(Boolean)}),
      I.returnNeeded ? mk("facts", {items: [{k: "Return needed to close the gap with no other change", v: fmPct(I.returnNeeded)}]
        .concat(growth ? [{k: "Return the plan assumes", v: growth.v}] : [])}) : null,
      slot("paragraph", "gap", "How the client might close the gap, in plain language. No advice language aimed at the reader.", {text:
        "There are three ways to close the gap: save more each year, add a lump sum, or plan to spend less in retirement. In practice the answer is usually a mix. [[the levers that fit you best]]"})
    ]));
  }

  if ((F.netWorthByYear || []).length > 3){
    const rows = F.netWorthByYear;
    const at = (y) => (rows.find(r => r.year === y) || {}).net;
    const infl = (F.assumptions || []).find(a => /inflation/i.test(a.k)), gr = (F.assumptions || []).find(a => /investment growth/i.test(a.k));
    S.push(sec("What the plan projects", [
      mk("chart", {chart: "line", title: "Projected net worth", labels: rows.map(r => String(r.year)),
        series: [{name: "Net worth", values: rows.map(r => Math.round(r.net / 1e4) / 100)}], unit: "$M",
        caption: "Illustrative only. Assumes " + (infl ? infl.v + " inflation" : "the plan's inflation rate") + (gr ? " and " + gr.v + " investment growth" : "") + "; actual results will differ.", size: "full"}),
      mk("facts", {items: [
        {k: "Net worth, " + rows[0].year, v: fm$(rows[0].net)},
        firstRetire && at(firstRetire) != null && {k: "At retirement (" + firstRetire + ")", v: fm$(at(firstRetire))},
        {k: "End of plan (" + rows[rows.length - 1].year + ")", v: fm$(rows[rows.length - 1].net)}].filter(Boolean)}),
      slot("paragraph", "projection", "What the projection shows and what it does not prove.", {text:
        "The projection shows how your net worth could change if the plan's assumptions hold. It is a guide for decisions, not a forecast. [[what stands out to you in the projection]]"})
    ]));
  }

  if ((F.education || []).length){
    const E = F.education;
    S.push(sec("Education", [
      mk("table", {headers: ["", "University", "Total cost", "From the RESP", "From cash flow", "Shortfall"], totalRow: false,
        caption: "From the plan, in future dollars.",
        rows: E.map(e => [e.child, e.start ? e.start + "–" + e.end : "", fm$(e.total), fm$(e.resp), fm$(e.cashflow), e.shortfall ? fm$(e.shortfall) : "None"])}),
      mk("facts", {items: [
        E[0].balance != null && {k: "RESP balance today", v: fm$(E[0].balance)},
        E.some(e => e.cesgAvailable != null) && {k: "Education grant still available", v: E.map(e => e.child + " " + fm$(e.cesgAvailable)).join(" · ")},
        E.some(e => e.room != null) && {k: "Contribution room left", v: E.map(e => e.child + " " + fm$(e.room)).join(" · ")}].filter(Boolean)}),
      slot("paragraph", "education", "A short note on education funding.", {text:
        (E.every(e => !e.shortfall) ? "On current assumptions, education costs are fully covered between the RESP and cash flow. " : "") + "[[anything to change]]"})
    ]));
  }

  if ((I.protection || []).length){
    S.push(sec("Protecting your family", [
      mk("stats", {cols: Math.min(3, Math.max(2, I.protection.length)), items: I.protection.map(p => ({num: fm$(p.amount),
        label: "Needed if " + p.if + " passed away", note: "to maintain " + (p.for || "the family") + "'s lifestyle"}))}),
      mk("callout", {tone: "watch", title: "Before you act",
        text: "These are the additional amounts the plan estimates would be needed. They are not insurance advice; a licensed insurance specialist can review the coverage you have."}),
      slot("paragraph", "protection", "A short, sensitive paragraph on protecting the family.", {text: "[[existing coverage and the next step]]"})
    ]));
  }

  if (F.estate && (F.estate.years || []).length){
    const E = F.estate;
    S.push(sec("Your estate", [
      mk("table", {headers: ["", ...E.years.map(String)], totalRow: false, caption: "Estimated, from the plan, before any estate planning.",
        rows: [["Estate before taxes and expenses", ...E.beforeTax.map(fm$)], ["Estate after taxes and expenses", ...E.afterTax.map(fm$)]]}),
      slot("paragraph", "estate", "A short paragraph on the estate.", {text:
        (E.finalTaxes ? "If the estate were settled in " + E.years[0] + ", final-return taxes would be about " + fm$(E.finalTaxes) + ". " : "") +
        "Keeping your wills and powers of attorney current is the most important first step. [[estate wishes or next step]]"})
    ]));
  }

  if ((F.assumptions || []).length) S.push(sec("The assumptions behind the plan", [
    mk("facts", {items: F.assumptions.map(a => ({k: a.k, v: a.v}))
      .concat(people.filter(p => p.lifeExpectancy).map(p => ({k: p.first + "'s planning age", v: String(p.lifeExpectancy)})))}),
    mk("paragraph", {text: "Projections depend on these assumptions. Small changes add up over many years, so we revisit them every time we update the plan."})
  ]));

  S.push(sec("What we do next", [
    slot("actions", "plan_actions", "Next steps as an action plan. Start from the suggestions; remove any that do not apply.", {items: planSuggestions(F)})
  ]));
  return S;
}

/* ── Annual review: the portfolio and the plan together ─────────────────── */

function buildAnnualReview(P, F){
  const S = [sec("Today's agenda", [mk("bullets", {style: "number", items: [
    "What has changed for you this year", P ? "How the portfolio has done" : null, F ? "Where the plan stands" : null,
    "Our recommendations", "Anything on your mind"].filter(Boolean)}),
    slot("paragraph", "changes", "What changed in the client's life this year, from the advisor's notes.", {text: "[[what has changed for you this year]]"})])];
  if (P) buildPortfolioReview(P).filter(s => !/What we recommend|What happens next/.test(s.title)).forEach(s => S.push(s));
  if (F) buildPlanSummary(F).filter(s => /Where you stand|Your goals|Closing the gap|What the plan projects/.test(s.title)).forEach(s => S.push(s));
  const items = (P ? portfolioSuggestions(P) : []).concat(F ? planSuggestions(F) : []).slice(0, 7);
  S.push(sec("Our recommendations", [slot("actions", "recommendations", "The recommendations for the year ahead, as an action plan.",
    {items: items.length ? items : [{t: "[[recommendation]]", d: "[[what happens and why]]", who: "Us", when: "[[timing]]"}]})]));
  return S;
}

/* ── Investment recommendation: profile, household summary, one page per account ── */

function buildRecommendation(P, profileName){
  const S = [];
  const model = modelForProfile(profileName);
  S.push(sec("Where we are starting", [
    slot("lead", "rec_intro", "Why we are making these recommendations, in one or two sentences.", {text: "[[why we are recommending these changes now]]"}),
    P && (P.accounts || []).length ? mk("table", {headers: ["Account today", "Type", "Value"], totalRow: true, caption: "Current market values" + (P.asOf ? " as at " + P.asOf : "") + ".",
      rows: P.accounts.map(a => [a.label, a.kind, fm$(a.value)]).concat([["Total", "", fm$(P.total)]])}) : null
  ]));
  (P && P.accounts && P.accounts.length ? P.accounts : [{label: "[[account]]", value: null}]).forEach(a => {
    const s = makeRecommendationSection({account: a.label, amount: a.value != null ? fm$(a.value) : "", portfolioId: model ? model.portfolioId : "", howItFits: []});
    s.smart = true;
    if (a.value != null) s.accountValue = a.value;     /* exact, so the household total matches the report to the dollar */
    S.push(s);
  });
  return S;
}

/* the household summary page that leads into the account pages (from v8.7) */
function householdEquity(pairs){ return pairs.filter(x => /Equity/.test(x.name)).reduce((n, x) => n + x.value, 0); }
function householdPairs(d){
  const recs = d.sections.filter(s => s.accountRecommendation).map(s => {
    const b = (s.blocks || []).find(x => x.type === "recommendation") || {};
    const typed = Number(String(s.accountAmount || "").replace(/[^0-9.]/g, "")) || 0;
    /* the exact value from the report, unless the advisor has since typed a different amount */
    const exact = s.accountValue != null && Math.round(s.accountValue) === Math.round(typed) ? s.accountValue : typed;
    return {s, p: recProfile(b), amount: exact};
  });
  const total = recs.reduce((n, r) => n + r.amount, 0), sums = {};
  /* the mix is of the accounts that have a portfolio; one still to choose does not dilute it */
  const placed = recs.filter(r => r.p && r.amount).reduce((n, r) => n + r.amount, 0);
  recs.forEach(r => { if (r.p && r.amount) allocationPairs(r.p).forEach(x => { sums[x.name] = (sums[x.name] || 0) + r.amount * x.value / 100; }); });
  return {recs, total, pairs: ALLOCATION_ORDER.map(name => ({name, value: placed ? Math.round((sums[name] || 0) / placed * 1000) / 10 : 0})).filter(x => x.value > .04)};
}
function householdSummaryHTML(){
  const {recs, total, pairs} = householdPairs(deck);
  const name = deck.profile || "", prof = INVESTOR_PROFILES[name] || null;
  const C = 2 * Math.PI * 45, sumP = pairs.reduce((n, x) => n + x.value, 0) || 100;
  let off = 0, arcs = "";
  (pairs.length ? pairs : [{name: "", value: 100}]).forEach((x, i) => {
    const len = C * x.value / sumP;
    arcs += `<circle cx="50" cy="50" r="45" fill="none" stroke="${pairs.length ? BRAND.sequence[i % BRAND.sequence.length] : "#D7DDD8"}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`;
    off += len;
  });
  const eq = householdEquity(pairs);
  const fit = !prof || !pairs.length ? "" : eq < prof.equityMin ? "below" : eq > prof.equityMax ? "above" : "within";
  const meta = prof ? [["Objective", prof.objective], ["Volatility level", prof.tolerance], ["Time horizon", prof.horizon],
    ["Target equity", prof.equity + "% <small>(" + prof.equityMin + "%–" + prof.equityMax + "%)</small>"],
    ["Target fixed income", prof.fixedIncome + "% <small>(" + prof.fixedMin + "%–" + prof.fixedMax + "%)</small>"]]
    .map(([k, v]) => `<div><span>${esc(k)}</span><b>${k.startsWith("Target") ? v : esc(v)}</b></div>`).join("") : `<div><span>Status</span><b>Choose the investor profile</b></div>`;
  return `<div class="hh-wrap"><div class="hh-page-kicker">Our Recommendations</div><div class="hh-page-title">Our recommendations</div><div class="hh-page-rule"></div>` +
    `<p class="hh-intro">Based on the objectives, time horizon and investor profile discussed, these account recommendations are designed to work as one coordinated household portfolio.</p>` +
    `<div class="hh-profile"><div class="hh-profile-copy"><div class="rec-label">Investor Profile</div><h3>${esc(name ? name + " Investor" : "Choose an investor profile")}</h3>` +
    `<p>${esc(prof ? prof.description : "Click this page and choose the household's investor profile on the right.")}</p></div>` +
    `<div class="hh-total-card"><span>Total Household Portfolio</span><b>${esc(fm$(total))}</b></div><div class="hh-profile-meta">${meta}</div></div>` +
    `<div class="hh-main"><div class="hh-allocation-panel"><div class="hh-chart-side"><div class="hh-title">Total Household Asset Allocation</div>` +
    `<svg class="hh-donut" viewBox="0 0 100 100" role="img" aria-label="Household asset allocation"><circle cx="50" cy="50" r="45" fill="none" stroke="#E4E9E2" stroke-width="18"/>${arcs}<circle cx="50" cy="50" r="31" fill="#fff"/></svg></div>` +
    `<div class="hh-legend">${pairs.map((x, i) => `<div class="hh-leg"><i class="hh-dot" style="background:${BRAND.sequence[i % BRAND.sequence.length]}"></i><span>${esc(x.name)}</span><b>${x.value}%</b></div>`).join("") ||
      '<div class="hh-leg"><span>Choose a portfolio for each account to see the combined mix.</span></div>'}</div></div>` +
    `<div class="hh-structure"><div class="hh-title">Recommended Account Structure</div><table class="hh-table"><thead><tr><th>Account</th><th>Amount</th><th>Portfolio</th></tr></thead><tbody>` +
    recs.map(r => `<tr><td>${esc(r.s.accountName || "Account")}</td><td>${esc(r.s.accountAmount || "")}</td><td>${esc(r.p ? preferredPortfolioTitle(r.p) : "Choose a portfolio")}</td></tr>`).join("") +
    `</tbody></table><div class="hh-total"><span>Total Household Portfolio</span><b>${esc(fm$(total))}</b></div></div></div>` +
    `<div class="hh-note"><div><b>Coordinated</b><span>Each account has a defined role within one household strategy.</span></div>` +
    `<div><b>Diversified</b><span>The combined allocation uses the six approved asset categories.</span></div>` +
    `<div><b>Aligned</b><span>${fit ? "Combined equities of " + fmPct(eq, 1) + (fit === "within" ? " sit within" : fit === "above" ? " are above" : " are below") +
      " the " + prof.equityMin + "–" + prof.equityMax + "% range for this profile." : "The assigned models are assessed together against the selected investor profile."}</span></div></div></div>`;
}
BLOCK_RENDERERS.householdSummary = (b, wrap) => wrap.insertAdjacentHTML("beforeend", householdSummaryHTML());

/** The household page sits in front of the first account page whenever there are account pages. */
function ensureHouseholdSummary(d){
  const first = d.sections.findIndex(s => s.accountRecommendation);
  let ov = d.sections.find(s => s.recommendationOverview);
  if (first < 0){ if (ov) d.sections = d.sections.filter(s => s !== ov); return; }
  if (!ov) ov = {id: uid(), title: "Our recommendations", tocTitle: "Our recommendations", kicker: "OUR RECOMMENDATIONS",
    recommendationOverview: true, blocks: [{id: "household-summary", type: "householdSummary"}]};
  d.sections = d.sections.filter(s => s !== ov);
  d.sections.splice(d.sections.findIndex(s => s.accountRecommendation), 0, ov);
}

/* ── Building (and rebuilding) the draft ────────────────────────────────── */

function smartSections(kind, facts){
  const P = facts && facts.portfolio, F = facts && facts.plan;
  if (kind === "portfolio_review") return P ? buildPortfolioReview(P) : null;
  if (kind === "plan_summary") return F ? buildPlanSummary(F) : null;
  if (kind === "annual_review") return (P || F) ? buildAnnualReview(P, F) : null;
  if (kind === "recommendation") return buildRecommendation(P, deck.profile);
  return null;
}

/** Lay out a fresh draft from the facts. Words already written in a slot are kept,
    and sections the advisor added by hand stay at the end. */
function buildDraft(){
  const kind = deck.meta.kind;
  const facts = deck.facts || {};
  let fresh = smartSections(kind, facts);
  if (!fresh){
    const t = newDeck(TEMPLATES[kind] ? kind : "plan_summary");
    fresh = t.sections;
  }
  const kept = {};
  deck.sections.forEach(s => (s.blocks || []).forEach(b => { if (b.slot && !b.seed) kept[b.slot] = b; }));
  fresh.forEach(s => s.blocks.forEach((b, i) => {
    const k = b.slot && kept[b.slot];
    if (k && k.type === b.type) s.blocks[i] = Object.assign({}, k, {id: b.id});
  }));
  const handmade = deck.sections.filter(s => !s.smart && !s.recommendationOverview && !(s.accountRecommendation && kind === "recommendation") && sectionStatus(s) !== "empty" && !(s.blocks || []).every(b => b.seed));
  snapshot();
  deck.sections = fresh.concat(handmade);
  if (deck.pendingImages && deck.pendingImages.length){
    deck.sections.push(sec("Supporting material", deck.pendingImages.map(src => mk("image", {src, caption: "", size: "full", frame: "line"}))));
    deck.pendingImages = [];
  }
  ensureHouseholdSummary(deck);
  /* cover wording to suit the piece */
  const P = facts.portfolio, F = facts.plan;
  const names = {portfolio_review: "Your Portfolio Review", plan_summary: "Your Financial Plan", annual_review: "Your Annual Review", recommendation: "Our Recommendations", prospect: "Working Together"};
  const kicker = {portfolio_review: "Portfolio review", plan_summary: "Financial plan summary", annual_review: "Annual review", recommendation: "Investment recommendation", prospect: "Our first conversation"};
  if (names[kind]){
    const sn = surnameOf(deck.meta.client);
    if (!deck.meta.title || Object.values(names).includes(deck.meta.title) || /^The .+ (Plan|Review|Portfolio Review|Portfolio|Recommendation)$/.test(deck.meta.title) || Object.values(TITLE_IDEAS).some(l => l.includes(deck.meta.title)))
      deck.meta.title = kind === "prospect" ? names[kind] : sn ? (kind === "plan_summary" ? "The " + sn + " Plan" : kind === "recommendation" ? "The " + sn + " Portfolio" : "The " + sn + " " + (kind === "annual_review" ? "Review" : "Portfolio Review")) : names[kind];
    deck.meta.kicker = kicker[kind];
    deck.meta.subtitle = {
      portfolio_review: "How your money is invested, how it has done, and what we recommend." + (P && P.asOf ? " As at " + P.asOf + "." : ""),
      plan_summary: "Where you stand, where the plan is headed, and what we do next.",
      annual_review: "The year in review, where the plan stands, and the decisions ahead.",
      recommendation: "Your investor profile, the household portfolio, and the portfolio we recommend for each account.",
      prospect: TEMPLATES.prospect.subtitle}[kind];
  }
  selectedId = null; openSectionId = null;
  syncPanels(); render();
}

/* ── Copilot: fill every slot with one prompt ───────────────────────────── */

function factsDigest(facts){
  const out = [], P = facts && facts.portfolio, F = facts && facts.plan;
  if (P){
    out.push("PORTFOLIO (as at " + (P.asOf || "?") + "): total " + fm$(P.total) + (P.netInvestment != null ? ", net invested " + fm$(P.netInvestment) : ""));
    (P.periods || []).forEach(p => out.push("- Return " + p.label + ": " + fmPct(p.value)));
    if ((P.years || []).length) out.push("- Calendar years: " + P.years.map(y => y.year + " " + fmPct(y.value)).join(", "));
    (P.accounts || []).forEach(a => out.push("- Account " + a.label + " (" + a.kind + "): " + fm$(a.value)));
    combinedHoldings(P).slice(0, 8).forEach(h => out.push("- Holding " + h.name + ": " + fm$(h.value) + " (" + fmPct(h.value / P.total * 100, 1) + ")"));
    (P.classes || []).forEach(c => out.push("- Asset class " + c.name + ": " + fmPct(c.pct, 2)));
    if (P.income) out.push("- Estimated annual income " + fm$(P.income) + ", yield " + fmPct(P.yield));
  }
  if (F){
    out.push("FINANCIAL PLAN (" + (F.planName || "") + ", " + (F.date || "") + "): net worth " + fm$(F.netWorth) + ", assets " + fm$(F.assets) + ", debts " + fm$(F.liabilities));
    (F.goals || []).forEach(g => out.push("- Goal " + g.name + ": " + fm$(g.amount) + "/" + (g.per || "yr") + (g.start ? ", " + g.start + "–" + g.end : "") + ", funded " + g.met + " of " + g.of + " years"));
    const I = F.insights || {};
    if (I.saveMore) out.push("- To close the gap: save " + fm$(I.saveMore) + " more a year, or a lump sum of " + fm$(I.lumpSum) + (I.lumpYear ? " in " + I.lumpYear : "") + ", or spend " + fm$(I.spendCapacity) + "/yr; return needed " + fmPct(I.returnNeeded));
    (I.protection || []).forEach(p => out.push("- If " + p.if + " passed away, an additional " + fm$(p.amount) + " would be needed"));
    (F.education || []).forEach(e => out.push("- Education " + e.child + ": total " + fm$(e.total) + ", RESP covers " + fm$(e.resp) + ", shortfall " + fm$(e.shortfall || 0)));
    (F.assumptions || []).forEach(a => out.push("- Assumption " + a.k + ": " + a.v));
  }
  return out.join("\n");
}
function slotBlocks(){
  const out = [];
  deck.sections.forEach(s => (s.blocks || []).forEach(b => { if (b.slot) out.push({s, b}); }));
  return out;
}
function slotCurrent(b){
  if (b.type === "actions") return (b.items || []).map(x => ({t: x.t, d: x.d, who: x.who, when: x.when}));
  if (b.type === "bullets") return b.items || [];
  return b.text || "";
}
function slotPrompt(){
  const slots = slotBlocks();
  const piece = (SMART_KINDS.find(k => k.kind === deck.meta.kind) || {name: "client document"}).name.toLowerCase();
  const notes = String(deck.notes || "").trim();
  const shape = {};
  slots.forEach(({b}) => { shape[b.slot] = b.type === "actions" ? [{t: "…", d: "…", who: "Us", when: "…"}] : b.type === "bullets" ? ["…"] : "…"; });
  return `I am an investment advisor finishing a ${piece} for a client. The document is already laid out and the figures are already in it. Write the words for the boxes listed below.

HOW TO WRITE
- Plain Canadian English, grade 9 reading level, warm and direct. Short sentences. No jargon, no exclamation marks.
- No promises, forecasts or guarantees, and no advice language aimed at the reader ("you should").
- Use ONLY the facts below and my notes. Copy every figure exactly. Never invent a number, name or date.
- Where you do not know something, keep a blank like [[what is missing]].
- Keep each box about as long as its current text unless my notes need more.
- Use the client's first names where natural.

MY NOTES (dictated)
${notes || "[none — use the facts only]"}

FACTS FROM THE REPORTS
${factsDigest(deck.facts) || "[none]"}

THE BOXES TO WRITE (key — what goes there — current text)
${slots.map(({s, b}) => "■ " + b.slot + " (in “" + s.title + "”) — " + (b.slotHint || "") + "\n  current: " + JSON.stringify(slotCurrent(b))).join("\n")}

Return ONLY this JSON, with every key filled in, nothing before or after it:
${JSON.stringify({slots: shape}, null, 2)}`;
}
/** Copilot's answer -> the slots. Returns how many boxes changed. */
function applySlotAnswer(text){
  const v = parseJSONLoose(text);
  const answers = v && (v.slots || v);
  if (!answers || typeof answers !== "object") throw Error("I could not find the boxes in that answer.");
  let n = 0;
  snapshot();
  slotBlocks().forEach(({b}) => {
    const a = answers[b.slot];
    if (a == null || a === "") return;
    if (b.type === "actions"){
      const items = (Array.isArray(a) ? a : parseText(String(a)).flatMap(x => x.items || [])).map(x => typeof x === "string" ? {t: x, d: "", who: "", when: ""}
        : {t: String(x.t || x.title || ""), d: String(x.d || x.detail || x.description || ""), who: String(x.who || x.owner || ""), when: String(x.when || x.timing || "")}).filter(x => x.t);
      if (!items.length) return;
      b.items = items;
    } else if (b.type === "bullets"){
      b.items = (Array.isArray(a) ? a : String(a).split(/\n+/)).map(x => String(x).replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
    } else {
      b.text = Array.isArray(a) ? a.join(" ") : String(a).trim();
    }
    delete b.seed;
    n++;
  });
  if (!n) undoStack.pop();
  syncPanels(); render();
  return n;
}
