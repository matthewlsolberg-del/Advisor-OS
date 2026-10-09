/* ═══════════════════════════════════════════════════════════════════════════
   autofill.js — turn what was read from the files into finished pages
   ───────────────────────────────────────────────────────────────────────────
   The idea: most of a client document is the same every time. So each kind
   of document is written out here already — in MHWG's words — with the
   client's real figures dropped in from the Croesus report and the financial
   plan, and [[blanks]] left only where the advisor has something to say.

     buildDocument(kind, sources)  →  {meta, sections, filled, blanks}
       kind:    "portfolio_review" | "plan_summary" | "annual_review" | …
       sources: {croesus: readCroesus(…) or null, plan: readPlan(…) or null}

   The figures are copied exactly as the report prints them. Where a
   subtotal is added up here (the account groups), the caption says so.
   Sections whose figures are missing are left out, never invented.

   To change the standard wording, edit the text in the functions below.
   Anything in [[double brackets]] shows as a yellow blank to fill in.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Small helpers ─────────────────────────────────────────────────────── */

/** A block from the block factory, with fields filled in. */
const blk = (type, fields) => Object.assign(newBlock(type), fields || {}, {id: uid()});
/** A section: title, blocks, and which file it came from (so a new file can refresh it). */
const autoSection = (title, blocks, auto) => ({id: uid(), title, blocks: blocks.filter(Boolean), auto: auto || ""});

const money0 = (n) => fmtMoney(n, 0);          /* $638,535      */
const money2 = (n) => fmtMoney(n, 2);          /* $638,534.59   */
const pctText = (n) => fmtPct(n);              /* 17.79%, −15.19% */
const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));

/** "Solberg, Matt & Kelsey" → "Matt & Kelsey Solberg"; "Matt and Kelsey Solberg" stays. */
function clientNameFrom(sources){
  const p = sources.plan, c = sources.croesus;
  if (p && p.clients) return p.clients.replace(/\s+and\s+/i, " & ");
  if (c && c.household){
    const m = /^([^,]+),\s*(.+)$/.exec(c.household);
    return m ? m[2] + " " + m[1] : c.household;
  }
  return "";
}
/** First names for the prose: "Matt and Kelsey". */
function firstNamesFrom(sources, client){
  const p = sources.plan;
  if (p && p.people.length) return p.people.map(x => (x.name || "").split(" ")[0]).filter(Boolean).join(" and ");
  const names = String(client || "").replace(/\s+[A-Z][a-z'-]+$/, "").split(/\s*&\s*/);
  return names.filter(Boolean).join(" and ");
}

/* ── Portfolio pages (from Croesus) ────────────────────────────────────── */

function portfolioGlance(r){
  const ytd = r.periods.find(p => /year to date/i.test(p.label));
  const inc = r.periods.find(p => /inception/i.test(p.label));
  const oneYr = r.periods.find(p => /^1 Year$/i.test(p.label));
  const stats = [
    r.totalValue != null && {num: money0(r.totalValue), label: "Total portfolio value", note: r.asOf ? "As of " + r.asOf : ""},
    ytd && {num: pctText(ytd.value), label: "Return, year to date", note: "Money-weighted, net of fees"},
    (inc || oneYr) && {num: pctText((inc || oneYr).value), label: inc ? "Return since inception" : "Return, 1 year",
      note: inc ? "Annualized" + (r.inception ? ", since " + r.inception : "") : "Net of fees"}
  ].filter(Boolean);
  const lead = r.totalValue != null
    ? `As of ${r.asOf || "the report date"}, your portfolio was worth **${money2(r.totalValue)}**` +
      (r.accounts.length ? ` across ${plural(r.accounts.length, "account")}.` : ".")
    : "[[A one-line summary of where the portfolio stands today.]]";
  const growth = (r.netInvested != null && r.netInvestmentChange != null)
    ? `You have invested a net ${money2(r.netInvested)} (deposits less withdrawals). The remaining ` +
      `${money2(r.netInvestmentChange)} is what your investments have earned on top of that — growth and income, after fees.`
    : null;
  return autoSection("Your portfolio at a glance", [
    stats.length && blk("stats", {cols: stats.length, items: stats}),
    blk("lead", {text: lead}),
    growth && blk("paragraph", {text: growth}),
    blk("paragraph", {text: "[[In a sentence or two: how the portfolio is doing against what it is meant to do for you.]]"})
  ], "croesus");
}

function accountsSection(r){
  if (!r.accounts.length) return null;
  const rows = r.accounts.map(a => [a.label, a.number, a.typeText || a.type, money2(a.value)]);
  rows.push(["Total", "", "", money2(r.totalValue != null ? r.totalValue : r.accounts.reduce((n, a) => n + a.value, 0))]);
  /* roll the accounts up the way the review talks about them */
  const order = ["Registered", "Tax-free", "Non-registered", "Corporate", "Education", "Other"];
  const groups = order.map(g => {
    const list = r.accounts.filter(a => a.group === g);
    return list.length ? {k: g === "Education" ? "Education (RESP)" : g, v: money2(list.reduce((n, a) => n + a.value, 0))} : null;
  }).filter(Boolean);
  return autoSection("Your accounts", [
    blk("table", {headers: ["Account", "Number", "Type", "Market value"], rows, totalRow: true,
      caption: "Market values in " + (r.currency || "CAD") + " as of " + (r.asOf || "the report date") + ", from your portfolio report."}),
    groups.length > 1 && blk("facts", {items: groups}),
    groups.length > 1 && blk("paragraph", {text: "Subtotals add up the account values above by type of account."}),
    blk("paragraph", {text: "[[What each account is for — for example, retirement savings in the RRSPs, education in the RESP, flexible savings in the TFSA.]]"})
  ], "croesus");
}

function allocationSection(r){
  if (!r.classes.length) return null;
  const cls = r.classes.filter(c => c.pct != null && c.pct > 0);
  /* the product categories inside the classes, largest first */
  const subs = {};
  r.holdings.forEach(h => {
    if (!h.sub || h.marketValue == null) return;
    const k = h.sub;
    subs[k] = subs[k] || {mv: 0, pct: 0};
    subs[k].mv += h.marketValue; subs[k].pct += h.pct || 0;
  });
  const subRows = Object.keys(subs).sort((a, b) => subs[b].mv - subs[a].mv)
    .map(k => [k, money2(subs[k].mv), subs[k].pct ? subs[k].pct.toFixed(2) + "%" : ""]);
  return autoSection("How your money is invested", [
    blk("chart", {chart: "donut", title: "Asset classes", unit: "%",
      labels: cls.map(c => c.name), series: [{name: "Share of portfolio", values: cls.map(c => c.pct)}],
      caption: "Share of total market value as of " + (r.asOf || "the report date") + ", using the asset classes in your portfolio report."}),
    subRows.length > 1 && blk("table", {headers: ["Type of investment", "Market value", "Share"], rows: subRows,
      caption: "Grouped as in your portfolio report; each line adds up the holdings in that group."}),
    blk("paragraph", {text: "[[Explain in plain language what the mix is doing and why it looks the way it does. Note anything the report's categories hide — for example, balanced funds hold bonds as well as stocks.]]"})
  ], "croesus");
}

function performanceSection(r){
  if (!r.periods.length && !r.years.length) return null;
  const blocks = [];
  if (r.periods.length){
    blocks.push(blk("table", {headers: ["Period", "Return"],
      rows: r.periods.map(p => [p.label + (/inception/i.test(p.label) && r.inception ? " (" + r.inception + ")" : ""), pctText(p.value)]),
      caption: "Money-weighted returns, net of fees, to " + (r.asOf || "the report date") + ". Periods longer than a year are annualized."}));
  }
  if (r.years.length > 1){
    const years = r.years.slice().sort((a, b) => a.year - b.year);
    const thisYear = (r.asOf || "").slice(-4);
    blocks.push(blk("chart", {chart: "bar", title: "Calendar-year returns", unit: "%",
      labels: years.map(y => y.year === thisYear ? y.year + " YTD" : y.year),
      series: [{name: "Portfolio", values: years.map(y => y.value)}],
      caption: "Money-weighted, net of fees" + (thisYear ? "; " + thisYear + " is year to date" : "") +
        ". Past performance is not indicative of future results."}));
  }
  blocks.push(blk("paragraph", {text: "[[What happened in markets and in the portfolio over the period, and what drove it. Facts, not forecasts.]]"}));
  blocks.push(blk("callout", {tone: "note", title: "What this does and does not tell us",
    text: "One period is a data point, not a verdict. What matters is whether the portfolio behaved the way it was built to in the conditions we actually had."}));
  return autoSection("How the portfolio has performed", blocks, "croesus");
}

function holdingsSection(r){
  const priced = r.holdings.filter(h => h.marketValue != null && h.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue);
  if (!priced.length) return null;
  const acct = (n) => (r.accounts.find(a => a.number === n) || {}).label || n;
  const top = priced.slice(0, 10);
  const stats = [
    r.totals.income != null && {num: money0(r.totals.income), label: "Projected annual income", note: "Interest and dividends; not guaranteed"},
    r.totals.yield != null && {num: r.totals.yield.toFixed(2) + "%", label: "Portfolio yield", note: "At today's market value"},
    r.totals.gain != null && {num: money0(r.totals.gain), label: "Unrealized gain", note: "Market value above book cost"}
  ].filter(Boolean);
  return autoSection("Your largest holdings", [
    blk("table", {headers: ["Holding", "Account", "Market value", "Share"],
      rows: top.map(h => [h.description + (h.symbol && !/^1CAD$/.test(h.symbol) ? " (" + h.symbol + ")" : ""), acct(h.account),
        money2(h.marketValue), h.pct != null ? h.pct.toFixed(2) + "%" : ""]),
      caption: (priced.length > 10 ? "The 10 largest of " + priced.length + " positions" : "All positions") +
        ", by market value as of " + (r.asOf || "the report date") + "."}),
    stats.length && blk("stats", {cols: stats.length, items: stats}),
    blk("paragraph", {text: "[[Anything worth saying about individual holdings — a position we are watching, one we added, one we plan to trim.]]"})
  ], "croesus");
}

/* ── Plan pages (from the financial plan) ──────────────────────────────── */

const firstOf = (name) => String(name || "").split(" ")[0];
function retireLine(p){
  const ad = p.people.filter(x => x.retireAge);
  if (!ad.length) return null;
  return ad.map(x => firstOf(x.name) + " at " + x.retireAge + (x.retireYear ? " (" + x.retireYear + ")" : "")).join(", ");
}

function planGlance(p){
  const ret = p.goals.find(g => /^retirement goal$/i.test(g.name)) || p.goals.find(g => /retirement/i.test(g.name) && !/pre/i.test(g.name));
  const stats = [
    p.netWorth != null && {num: money0(p.netWorth), label: "Net worth today", note: p.date ? "From the plan, " + p.date : ""},
    retireLine(p) && {num: p.people.filter(x => x.retireAge).map(x => x.retireAge).join(" / "), label: "Planned retirement ages",
      note: p.people.filter(x => x.retireAge).map(x => firstOf(x.name)).join(" / ")},
    ret && {num: ret.met + " of " + ret.of, label: "Retirement years fully funded", note: "On today's plan"}
  ].filter(Boolean);
  const lead = ret
    ? (ret.met === ret.of
        ? `On the plan as it stands, your retirement goal of ${money0(ret.amount)} a year is fully funded in every year.`
        : `On the plan as it stands, your retirement goal of ${money0(ret.amount)} a year is fully funded in ${ret.met} of ${ret.of} years. The rest of this summary shows what would close the gap.`)
    : "[[The one thing to take away from the plan, in a sentence.]]";
  return autoSection("Your plan at a glance", [
    stats.length && blk("stats", {cols: stats.length, items: stats}),
    blk("lead", {text: lead}),
    blk("paragraph", {text: "[[What you told us matters most, in your words — the reason this plan exists.]]"})
  ], "plan");
}

function standToday(p){
  if (p.assets == null && !p.savings.length) return null;
  const facts = [
    p.assets != null && {k: "Total assets", v: money0(p.assets)},
    p.liabilities != null && {k: "Total liabilities", v: money0(p.liabilities)},
    p.netWorth != null && {k: "Net worth", v: money0(p.netWorth)}
  ].filter(Boolean);
  const lines = [].concat(p.savings, p.property, p.debt.map(d => Object.assign({}, d, {value: -d.value})));
  return autoSection("Where you stand today", [
    facts.length && blk("facts", {items: facts}),
    p.assetMix.length > 1 && blk("chart", {chart: "donut", title: "What you own", unit: "%",
      labels: p.assetMix.map(a => a.name), series: [{name: "Assets", values: p.assetMix.map(a => a.pct)}],
      caption: "Share of total assets, from the plan" + (p.date ? " dated " + p.date : "") + "."}),
    lines.length && blk("table", {headers: ["Asset or debt", "Value"],
      rows: lines.map(x => [x.name, x.value < 0 ? "(" + money0(-x.value) + ")" : money0(x.value)]),
      caption: "Values used in the plan. Debts are shown in brackets."}),
    blk("paragraph", {text: "[[Comment on the balance sheet — what is working, what stands out (for example, how much of the net worth is the home).]]"})
  ], "plan");
}

function goalsSection(p){
  if (!p.goals.length) return null;
  const rows = p.goals.map(g => [g.name, g.amount != null ? money0(g.amount) + " a year" : "",
    g.met + " of " + g.of + " years" + (g.met === g.of ? " ✓" : "")]);
  const short = p.goals.filter(g => g.met < g.of);
  return autoSection("Your goals", [
    blk("table", {headers: ["Goal", "Amount (today's dollars)", "Fully funded in"], rows,
      caption: "From the plan's goal funding status. A goal funded in fewer than all of its years falls short in the others."}),
    short.length
      ? blk("callout", {tone: "important", title: "Where the plan falls short",
          text: short.map(g => `${g.name}: funded in ${g.met} of ${g.of} years` +
            (/retirement/i.test(g.name) && p.retirement.shortfallYears ? ` (a shortfall in ${p.retirement.shortfallYears} years)` : "")).join(". ") + "."})
      : blk("callout", {tone: "note", title: "Every goal is funded", text: "On today's assumptions, each goal in the plan is met in every year."}),
    blk("paragraph", {text: "[[Which goals matter most to you, and whether any of them have changed since we built the plan.]]"})
  ], "plan");
}

function closeGapSection(p){
  const I = p.insights;
  const ret = p.goals.find(g => /^retirement goal$/i.test(g.name));
  const options = [
    I.savingsNeed != null && {num: money0(I.savingsNeed), label: "Extra savings a year", note: I.savingsNeedNote ? "Until " + I.savingsNeedNote : ""},
    I.lumpSum != null && {num: money0(I.lumpSum), label: "Or a one-time lump sum", note: I.lumpSumYear ? "Invested in " + I.lumpSumYear : ""},
    I.requiredReturn != null && {num: I.requiredReturn + "%", label: "Or this return a year", note: "Needed to avoid a shortfall"}
  ].filter(Boolean);
  if (!options.length && I.affordableSpending == null) return null;
  const blocks = [];
  if (ret && ret.met < ret.of && options.length){
    blocks.push(blk("lead", {text: "The plan shows " + ["one way", "two ways", "three ways"][options.length - 1] +
      " to close the retirement gap. Any one of them on its own would do it; in practice we usually combine smaller steps."}));
    blocks.push(blk("stats", {cols: options.length, items: options}));
  } else if (options.length){
    blocks.push(blk("stats", {cols: options.length, items: options}));
  }
  if (I.affordableSpending != null){
    blocks.push(blk("callout", {tone: "note", title: "What the plan supports today",
      text: `With no changes, the plan supports spending of about ${money0(I.affordableSpending)} a year in retirement (before tax)` +
        (ret && ret.amount ? `, against the goal of ${money0(ret.amount)}.` : ".")}));
  }
  blocks.push(blk("paragraph", {text: "[[Which path we recommend, and why — or which combination (for example, retiring a year later and saving a little more).]]"}));
  return autoSection("What it would take", blocks, "plan");
}

function educationSection(p){
  if (!p.education.length) return null;
  const rows = p.education.map(e => [e.child, (e.start && e.end) ? e.start + "–" + e.end : "",
    e.totalSpend != null ? money0(e.totalSpend) : "", e.fromRESP != null ? money0(e.fromRESP) : "",
    e.fromCashflow != null ? money0(e.fromCashflow) : "", e.shortfall != null ? money0(e.shortfall) : ""]);
  return autoSection("Education", [
    blk("table", {headers: ["Child", "School years", "Total cost", "From the RESP", "From cash flow", "Shortfall"], rows,
      caption: "Projected costs and sources from the plan's education summary."}),
    blk("paragraph", {text: "[[RESP strategy: contributions to keep collecting the grant, and how the money will come out.]]"})
  ], "plan");
}

function protectionSection(p){
  const ins = p.insights.insurance.filter(x => x.amount != null);
  if (!ins.length) return null;
  return autoSection("Protecting the family", [
    blk("facts", {items: ins.map(x => ({k: "If " + x.person + " passed away today", v: money0(x.amount) + " more needed" + (x.survivor ? " for " + x.survivor : "")}))}),
    blk("paragraph", {text: "These are the additional amounts the plan estimates would be needed to maintain the survivor's lifestyle, on top of what is already in place."}),
    blk("callout", {tone: "watch", title: "Insurance advice",
      text: "TD Wealth does not provide specific insurance advice. If you decide an insurance need exists, we will connect you with a licensed insurance specialist."}),
    blk("paragraph", {text: "[[What coverage is in place today, and what we suggest reviewing.]]"})
  ], "plan");
}

function estateSection(p){
  if (!p.estate) return null;
  const e = p.estate;
  return autoSection("Your estate", [
    blk("facts", {items: [
      e.netWorth != null && {k: "Net worth before death benefits (" + e.year + ")", v: money0(e.netWorth)},
      e.finalTaxes != null && {k: "Final taxes due", v: money0(e.finalTaxes)},
      e.afterTaxes != null && {k: "Estate after taxes and expenses", v: money0(e.afterTaxes)}].filter(Boolean)}),
    blk("paragraph", {text: "[[Wills, powers of attorney and beneficiary designations: what is in place, and what needs updating.]]"})
  ], "plan");
}

function projectionSection(p){
  if (p.projection.length < 4) return null;
  /* every fifth year keeps the chart readable */
  const pts = p.projection.filter((x, i) => i % 5 === 0 || i === p.projection.length - 1);
  return autoSection("Where the plan is heading", [
    blk("chart", {chart: "line", title: "Projected net worth", unit: "$M",
      labels: pts.map(x => String(x.year)), series: [{name: "Net worth", values: pts.map(x => Math.round(x.netWorth / 10000) / 100)}],
      caption: "Projected net worth from the plan, in millions of dollars. Illustrative only; based on the plan's assumptions, and actual results will differ."}),
    p.assumptions.length && blk("facts", {items: p.assumptions.map(a => ({k: a.name, v: a.value}))}),
    blk("paragraph", {text: "[[What the projection says in plain language — and what it does not.]]"})
  ], "plan");
}

/* ── Standard sections (no figures needed) ─────────────────────────────── */

const STANDARD = {
  reviewAgenda: () => autoSection("What this review covers", [
    blk("bullets", {style: "number", items: ["Where your portfolio stands today", "How it has performed",
      "How your money is invested", "What we changed, and why", "What we recommend from here"]}),
    blk("callout", {tone: "note", title: "How to read this",
      text: "Returns are shown net of fees for the periods stated. Past performance does not tell you what comes next; it tells you whether the portfolio behaved the way it was built to."})
  ]),
  planIntro: (names) => autoSection("What we set out to do", [
    blk("lead", {text: (names ? names + ", you" : "You") + " asked us to answer a few questions: [[can you retire when you want to, will the money last, what happens to what is left]]."}),
    blk("paragraph", {text: "This summary pulls the full plan down to the parts that matter for the decisions in front of you. The detailed projections behind it are available any time you want to look under the hood."})
  ]),
  changes: () => autoSection("What we changed, and why", [
    blk("table", {caption: "Changes made since our last review", headers: ["When", "What we did", "Why"],
      rows: [["[[date]]", "[[change]]", "[[reason]]"]], totalRow: false}),
    blk("paragraph", {text: "[[The thinking behind the changes as a group, in two or three sentences.]]"})
  ]),
  recommend: () => autoSection("What we recommend", [
    blk("callout", {tone: "important", title: "Our recommendation", text: "[[The recommendation in one or two sentences.]]"}),
    blk("actions", {items: [
      {t: "[[First step]]", d: "[[What happens and why.]]", who: "Us", when: "[[When]]"},
      {t: "[[Second step]]", d: "[[What happens and why.]]", who: "You", when: "[[When]]"}]})
  ]),
  nextSteps: () => autoSection("What we do next", [
    blk("actions", {items: [
      {t: "Confirm the plan assumptions", d: "You review the goals, retirement dates and income; tell us if anything has moved.", who: "You", when: "Next 2 weeks"},
      {t: "[[Our first step]]", d: "[[What we will do and why.]]", who: "Us", when: "[[When]]"},
      {t: "[[Your first step]]", d: "[[What you will do and why.]]", who: "You", when: "[[When]]"}]}),
    blk("callout", {tone: "note", title: "When we meet again", text: "We will review this plan together at least once a year, and any time something changes."})
  ])
};

/* ── Putting a document together ───────────────────────────────────────── */

const KIND_TITLES = {
  portfolio_review: {kicker: "Portfolio review", subtitle: "Where your portfolio stands, how it has performed, and what we recommend."},
  plan_summary:     {kicker: "Financial plan summary", subtitle: "Where you stand today, what the plan projects, and what we do next."},
  annual_review:    {kicker: "Annual review", subtitle: "Your portfolio and your plan, side by side, and the decisions for the year ahead."}
};

/** Build a whole document from the files. Kinds without a recipe here come back
    null, and the caller falls back to the regular template. */
function buildDocument(kind, sources){
  const r = sources.croesus, p = sources.plan;
  const client = clientNameFrom(sources);
  const names = firstNamesFrom(sources, client);
  const portfolio = r ? [portfolioGlance(r), performanceSection(r), allocationSection(r), accountsSection(r), holdingsSection(r)] : [];
  const planParts = p ? [planGlance(p), standToday(p), goalsSection(p), closeGapSection(p), educationSection(p),
                         protectionSection(p), estateSection(p), projectionSection(p)] : [];
  let sections;
  if (kind === "portfolio_review"){
    if (!r && !p) return null;
    sections = [STANDARD.reviewAgenda()].concat(portfolio, p ? [planGlance(p), goalsSection(p)] : [], [STANDARD.changes(), STANDARD.recommend()]);
  } else if (kind === "plan_summary"){
    if (!p && !r) return null;
    sections = [STANDARD.planIntro(names)].concat(planParts, r ? [portfolioGlance(r), allocationSection(r)] : [], [STANDARD.nextSteps()]);
  } else if (kind === "annual_review"){
    if (!r && !p) return null;
    sections = [STANDARD.reviewAgenda()].concat(portfolio, planParts.slice(0, 4), [STANDARD.changes(), STANDARD.recommend()]);
  } else return null;
  sections = sections.filter(Boolean);
  const T = KIND_TITLES[kind];
  const date = (r && r.asOf) || (p && p.date) || "";
  return {
    meta: {client, kicker: T.kicker, subtitle: T.subtitle, title: (titleIdeas(kind, client)[0] || ""),
           advisor: (p && p.preparedBy) || (r && r.advisor) || ""},
    sections,
    asOf: date,
    blanks: gapCount(sections.map(s => s.blocks))
  };
}
