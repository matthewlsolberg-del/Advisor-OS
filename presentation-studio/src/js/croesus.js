/* ═══════════════════════════════════════════════════════════════════════════
   croesus.js — read a Croesus portfolio report (PDF) into plain figures
   ───────────────────────────────────────────────────────────────────────────
   Input:  the result of readPdf(file) (pdfread.js): pages → lines → cells.
   Output: readCroesus(pdf) → {
     household, householdCode, advisor, asOf, currency,
     totalValue, netInvested, netInvestmentChange,
     periods:  [{label:"1 Year", value:17.79}, …]        money-weighted, net
     inception: "05/04/2017",
     years:    [{year:"2026", value:16.37}, …]            calendar-year returns
     months:   [{date:"10/07/2026", value, cashFlow, ret}, …]
     accounts: [{number, typeText, type, group, owner, currency, value, label}, …]
     classes:  [{name:"Canadian Equity", value, pct}, …]   Croesus' own asset classes
     holdings: [{account, description, symbol, cls, sub, quantity, bookCost, marketValue,
                 pct, gain, income, yield}, …]
     totals:   {bookCost, marketValue, gain, income, yield},
     fx:       "USD 1.000 = CAD 1.425500",
     found:    ["5 accounts", …],   missing: ["…"], warnings: []
   }
   Every figure is the text printed in the report turned into a number — no
   rounding, no arithmetic — so it always matches the source. Pieces the
   report does not have are simply absent, and `missing` says which.

   Account letters (the last character of the account number), used only when
   the report's own account-type text does not settle it:
     A / B  non-registered, CAD / USD (can also be a corporate account)
     S      RRSP, LIRA or spousal RRSP
     J      TFSA          V   RESP          E   margin (non-registered)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Small helpers ─────────────────────────────────────────────────────── */

/** "$ 1,234.56" → 1234.56 · "(15.19)" → -15.19 · "0.64 %" → 0.64 · "n/d" → null */
function croesusNumber(t){
  let s = String(t == null ? "" : t).trim();
  if (!s || /^n\/?d$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || /^-|\$\s*-/.test(s);
  s = s.replace(/[()$%\s,]/g, "").replace(/^-/, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return neg ? -n : n;
}
const isFigure = (t) => croesusNumber(t) !== null || /^n\/?d$/i.test(String(t).trim());

/** Account numbers look like 7XBN90S: letters and digits, ending in a letter. */
const ACCOUNT_RE = /^[0-9A-Z]{5,10}$/;
const looksLikeAccount = (t) => ACCOUNT_RE.test(t) && /\d/.test(t) && /[A-Z]$/.test(t);

/** "MR. MATTHEW L SOLBERG" → "Matthew Solberg" */
function tidyPersonName(raw){
  return String(raw || "")
    .replace(/\b(MR|MRS|MS|MISS|DR|MESSRS)\.?\s+/gi, "")
    .split(/\s+/).filter(w => w && !/^[A-Z]\.?$/i.test(w))          /* drop middle initials */
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .map(w => w.replace(/(^|[-'])(\w)/g, (m, a, b) => a + b.toUpperCase()))
    .join(" ").trim();
}
const firstName = (full) => String(full || "").split(" ")[0] || "";

/* ── What kind of account is it? ───────────────────────────────────────── */

/* group: how the review rolls accounts up — Registered, Tax-free, Non-registered,
   Corporate, Education. type: the short name shown on the page. */
const ACCOUNT_TEXT_RULES = [
  [/spousal/i,                                        "Spousal RRSP", "Registered"],
  [/locked.?in|\blira\b|\blrsp\b/i,                   "LIRA",         "Registered"],
  [/retirement income fund|\brrif\b/i,                "RRIF",         "Registered"],
  [/life income fund|\blif\b/i,                       "LIF",          "Registered"],
  [/retirement savings|\brrsp\b|\brsp\b/i,            "RRSP",         "Registered"],
  [/tax.?free savings|\btfsa\b/i,                     "TFSA",         "Tax-free"],
  [/first home|\bfhsa\b/i,                            "FHSA",         "Tax-free"],
  [/education|\bresp\b/i,                             "RESP",         "Education"],
  [/disability|\brdsp\b/i,                            "RDSP",         "Registered"],
  [/corporat|holding/i,                               "Corporate",    "Corporate"],
  [/margin/i,                                         "Non-registered (margin)", "Non-registered"],
  [/cash|non.?reg|individual|joint|investment/i,      "Non-registered", "Non-registered"]
];
const ACCOUNT_LETTERS = {
  A: ["Non-registered (CAD)", "Non-registered"],
  B: ["Non-registered (USD)", "Non-registered"],
  S: ["RRSP / LIRA / spousal RRSP", "Registered"],
  J: ["TFSA", "Tax-free"],
  V: ["RESP", "Education"],
  E: ["Non-registered (margin)", "Non-registered"]
};

function classifyAccount(number, typeText, owner){
  let type = "", group = "";
  for (const [re, t, g] of ACCOUNT_TEXT_RULES){
    if (re.test(typeText || "")){ type = t; group = g; break; }
  }
  const letter = String(number || "").slice(-1).toUpperCase();
  if (!type && ACCOUNT_LETTERS[letter]) [type, group] = ACCOUNT_LETTERS[letter];
  /* a non-registered account in a company's name is a corporate account */
  if (group === "Non-registered" && /\b(inc|ltd|limited|corp|corporation|holdings?|enterprises?)\b\.?/i.test(owner || "")){
    type = "Corporate"; group = "Corporate";
  }
  if (!type){ type = typeText || "Account"; group = "Other"; }
  return {type, group};
}

/** "MR. MATTHEW SOLBERG OR MRS. KELSEY SOLBERG" → {owner:"Joint", people:["Matthew","Kelsey"]} */
function accountOwner(name){
  const parts = String(name || "").split(/\s+(?:OR|AND|&)\s+/i).map(tidyPersonName).filter(Boolean);
  if (parts.length > 1) return {owner: "Joint", people: parts, display: parts.map(firstName).join(" & ")};
  if (/\b(inc|ltd|limited|corp|holdings?)\b/i.test(name || "")) return {owner: tidyPersonName(name), people: [], display: tidyPersonName(name)};
  return {owner: parts[0] || "", people: parts, display: firstName(parts[0])};
}

/** The name people use for an account: "Matthew's RRSP", "Joint Non-registered (margin)". */
function accountLabel(a){
  if (a.group === "Corporate") return (a.ownerInfo.display || "Corporate") + " — Corporate account";
  if (a.ownerInfo.owner === "Joint") return "Joint " + a.type.replace(/^Non-registered/, "non-registered");
  const who = a.ownerInfo.display;
  return who ? who + "'s " + a.type : a.type;
}

/* ── The report itself ─────────────────────────────────────────────────── */

/** Is this PDF a Croesus portfolio report? */
function looksLikeCroesus(pdf){
  const t = pdf.text || "";
  return /PORTFOLIO (EVALUATION|PERFORMANCE)|ACCOUNT DETAILS/i.test(t) && /Market Value/i.test(t) &&
    /As of [A-Z][a-z]+ \d{1,2}, \d{4}/.test(t);
}

function readCroesus(pdf){
  const R = {periods: [], years: [], months: [], accounts: [], classes: [], holdings: [],
             totals: {}, found: [], missing: [], warnings: []};
  const allLines = [];
  pdf.pages.forEach((p, pi) => p.lines.forEach(l => allLines.push(Object.assign({page: pi}, l))));
  const text = pdf.text || "";

  /* header: advisor, household (code), as-of date, currency */
  const hh = allLines.find(l => /\(([0-9A-Z]{3,8})\)\s*$/.test(l.text) && !/PORTFOLIO|Page/i.test(l.text));
  if (hh){
    const m = /^(.*?)\s*\(([0-9A-Z]{3,8})\)\s*$/.exec(hh.text);
    R.household = m[1].trim(); R.householdCode = m[2];
    const i = allLines.indexOf(hh);
    const prev = allLines[i - 1];
    if (prev && prev.page === hh.page && !/TD Wealth|PORTFOLIO/i.test(prev.text)) R.advisor = prev.text.trim();
  }
  const asOf = /As of ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(text);
  if (asOf) R.asOf = asOf[1];
  const cur = /PORTFOLIO [A-Z ()]+\((CAD|USD)\)/.exec(text);
  R.currency = cur ? cur[1] : "CAD";

  /* the summary figures, wherever they sit on the line */
  const figureAfter = (re) => {
    for (const l of allLines){
      const k = l.cells.findIndex(c => re.test(c.text));
      if (k >= 0 && l.cells[k + 1] && croesusNumber(l.cells[k + 1].text) !== null) return croesusNumber(l.cells[k + 1].text);
    }
    return null;
  };
  R.totalValue = figureAfter(/^Total Portfolio Value as of/i);
  R.netInvested = figureAfter(/^Net Investment as of/i);
  R.netInvestmentChange = figureAfter(/^Net Investment Variation/i);
  if (R.totalValue == null){
    const tv = /Total Portfolio Value:?\s*\$?\s*([\d,]+(?:\.\d+)?)/i.exec(text);
    if (tv) R.totalValue = croesusNumber(tv[1]);
  }

  /* performance per period: "6 Months 11.02", "Since Inception 14.57" */
  const PERIOD_RE = /^(\d+\s+(?:Months?|Years?)|Year to Date|Month to Date|Quarter to Date|Since Inception)$/i;
  const seenPeriod = new Set();
  allLines.forEach((l, li) => {
    l.cells.forEach((c, k) => {
      if (!PERIOD_RE.test(c.text) || seenPeriod.has(c.text.toLowerCase())) return;
      const next = l.cells[k + 1];
      const v = next && croesusNumber(next.text);
      if (v === null || v === undefined || Math.abs(v) > 1000) return;
      seenPeriod.add(c.text.toLowerCase());
      R.periods.push({label: c.text.replace(/\s+/g, " "), value: v});
      if (/inception/i.test(c.text)){
        const below = allLines[li + 1];
        const d = below && below.cells.find(x => /^\(\d{2}\/\d{2}\/\d{4}\)$/.test(x.text));
        if (d) R.inception = d.text.slice(1, -1);
      }
    });
  });

  /* calendar-year returns: a cell that is just a year, then a percentage */
  const perYearAt = allLines.findIndex(l => /PERFORMANCE PER YEAR/i.test(l.text));
  if (perYearAt >= 0){
    const page = allLines[perYearAt].page;
    allLines.slice(perYearAt).filter(l => l.page === page).forEach(l => {
      l.cells.forEach((c, k) => {
        if (!/^(19|20)\d\d$/.test(c.text)) return;
        const v = l.cells[k + 1] && croesusNumber(l.cells[k + 1].text);
        if (v === null || v === undefined || Math.abs(v) > 500) return;
        if (!R.years.some(y => y.year === c.text)) R.years.push({year: c.text, value: v});
      });
    });
  }

  /* month-end values: "09/30/2026  636,317.83  2,345.00  0.09" */
  allLines.forEach(l => {
    l.cells.forEach((c, k) => {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(c.text)) return;
      const nums = l.cells.slice(k + 1, k + 4).map(x => croesusNumber(x.text));
      if (nums.length < 3 || nums.some(n => n === null)) return;
      if (R.months.some(m => m.date === c.text)) return;
      R.months.push({date: c.text, value: nums[0], cashFlow: nums[1], ret: nums[2]});
    });
  });

  /* accounts: the ACCOUNT DETAILS table (it can appear twice; read it once) */
  const detailHeads = allLines.filter(l => l.cells[0] && /^Account Number$/i.test(l.cells[0].text));
  detailHeads.forEach(head => {
    const col = (re) => { const c = head.cells.find(x => re.test(x.text)); return c ? c.x : null; };
    const xType = col(/Account Type/i), xName = col(/^Name$/i), xCur = col(/Currency/i);
    let i = allLines.indexOf(head) + 1;
    for (; i < allLines.length; i++){
      const l = allLines[i];
      if (l.page !== head.page) break;
      if (!looksLikeAccount(l.cells[0].text)){ if (R.accounts.length && !/^\s*$/.test(l.text)) break; else continue; }
      const number = l.cells[0].text;
      if (R.accounts.some(a => a.number === number)) continue;
      const near = (x) => l.cells.find(c => x != null && Math.abs(c.x - x) < 12);
      const value = croesusNumber(l.cells[l.cells.length - 1].text);
      const typeText = (near(xType) || l.cells[1] || {}).text || "";
      const owner = (near(xName) || l.cells[2] || {}).text || "";
      const currency = (near(xCur) || {}).text || R.currency;
      const ownerInfo = accountOwner(owner);
      const kind = classifyAccount(number, typeText, owner);
      const a = {number, typeText, type: kind.type, group: kind.group, owner, ownerInfo, currency, value};
      a.label = accountLabel(a);
      R.accounts.push(a);
    }
  });

  readCroesusHoldings(allLines, R);

  /* exchange rate */
  const fx = /(USD\s+1\.0+)\s*=\s*(CAD\s+[\d.]+)/.exec(text.replace(/\s{2,}/g, " "));
  if (fx) R.fx = fx[1] + " = " + fx[2];

  /* what was found, and what was not */
  if (R.accounts.length) R.found.push(R.accounts.length + " account" + (R.accounts.length === 1 ? "" : "s"));
  else R.missing.push("the account list (ACCOUNT DETAILS)");
  if (R.totalValue != null) R.found.push("total value " + fmtMoney(R.totalValue, 2) + (R.asOf ? " as of " + R.asOf : ""));
  else R.missing.push("the total portfolio value");
  if (R.periods.length) R.found.push("returns for " + R.periods.length + " periods");
  else R.missing.push("performance by period");
  if (R.years.length) R.found.push(R.years.length + " calendar-year returns");
  if (R.holdings.length) R.found.push(R.holdings.length + " holdings in " + R.classes.length + " asset classes");
  else R.missing.push("the holdings (PORTFOLIO EVALUATION)");
  if (R.accounts.length && R.totalValue != null){
    const sum = R.accounts.reduce((n, a) => n + (a.value || 0), 0);
    if (Math.abs(sum - R.totalValue) > 1) R.warnings.push("The accounts add up to " + fmtMoney(sum, 2) +
      ", not the report's total of " + fmtMoney(R.totalValue, 2) + ". Check the account list.");
  }
  return R;
}

/* The PORTFOLIO EVALUATION table: asset-class headings, holdings, "Total …" rows.
   Columns are matched by position: each figure belongs to the column whose
   right edge it lines up with (figures are right-aligned under their heading). */
function readCroesusHoldings(allLines, R){
  const KEYS = [
    ["accum", /accum/i], ["currentYield", /current/i], ["quantity", /quantity/i], ["acb", /^acb$/i],
    ["bookCost", /book/i], ["invested", /invested/i], ["price", /price/i], ["marketValue", /market value/i],
    ["pct", /%|total$/i], ["gain", /unrealized|g\/l/i], ["income", /annual|income/i], ["marketYield", /yield/i]
  ];
  let cols = null, xDesc = null, xSymbol = null;
  const stack = [];             /* open headings: [{name, depth}] */
  let inTable = false, last = null;

  const readFigures = (cells) => {
    const out = {};
    cells.forEach(c => {
      if (!isFigure(c.text)) return;
      let best = null, gap = 9;
      cols.forEach(col => { const g = Math.abs(col.x2 - c.x2); if (g < gap){ gap = g; best = col; } });
      if (best && !(best.key in out)) out[best.key] = croesusNumber(c.text);
    });
    return out;
  };

  for (let i = 0; i < allLines.length; i++){
    const l = allLines[i], first = l.cells[0].text;

    /* the column header (repeated on every page of the table) */
    if (/^Account$/i.test(first) && l.cells.some(c => /Description/i.test(c.text))){
      const second = allLines[i + 1] && allLines[i + 1].page === l.page ? allLines[i + 1] : null;
      const heads = l.cells.concat(second && !looksLikeAccount(second.cells[0].text) ? second.cells : []);
      const groups = [];
      heads.forEach(h => {
        if (/^(Account|Description|Symbol)$/i.test(h.text)) return;
        const g = groups.find(x => Math.abs(x.x2 - h.x2) < 4);
        if (g) g.label += " " + h.text; else groups.push({x2: h.x2, label: h.text});
      });
      const used = new Set();
      cols = [];
      groups.sort((a, b) => a.x2 - b.x2).forEach(g => {
        const k = KEYS.find(([key, re]) => !used.has(key) && re.test(g.label));
        if (k){ used.add(k[0]); cols.push({key: k[0], x2: g.x2, label: g.label}); }
      });
      const d = l.cells.find(c => /^Description$/i.test(c.text)), s = l.cells.find(c => /^Symbol$/i.test(c.text));
      xDesc = d ? d.x : null; xSymbol = s ? s.x : null;
      inTable = true;
      if (second && !looksLikeAccount(second.cells[0].text)) i++;
      continue;
    }
    if (!inTable || !cols) continue;
    /* the table ends at the exchange rates; a page footer pauses it until the
       next page's column header (the page heading lines in between are skipped) */
    if (/^(EXCHANGE RATES|ACCOUNT DETAILS|Total Portfolio Value|DISCLAIMER)/i.test(first) || /Page:\s*\d/.test(l.text)){
      inTable = false;
      continue;
    }

    if (looksLikeAccount(first)){
      /* a holding */
      const text = l.cells.filter(c => !isFigure(c.text) && c !== l.cells[0] && !/^[*x]$/.test(c.text));
      let description = "", symbol = "";
      text.forEach(c => {
        if (xSymbol != null && c.x >= xSymbol - 4) symbol = symbol || c.text;
        else if (xSymbol != null && c.x2 > xSymbol + 2){
          /* description ran into the symbol column: its last word is the symbol */
          const m = /^(.*\S)\s+(\S+)$/.exec(c.text);
          if (m){ description = m[1]; symbol = m[2]; } else description = c.text;
        } else description = description ? description + " " + c.text : c.text;
      });
      const f = readFigures(l.cells.slice(1));
      const top = stack[0] ? stack[0].name : "", sub = stack.length > 1 ? stack[stack.length - 1].name : "";
      last = {account: first, description: description.replace(/\s+/g, " ").trim(), symbol, cls: top, sub,
        quantity: f.quantity ?? null, bookCost: f.bookCost ?? null, marketValue: f.marketValue ?? null,
        pct: f.pct ?? null, gain: f.gain ?? null, income: f.income ?? null, yield: f.currentYield ?? null};
      R.holdings.push(last);
      continue;
    }

    if (/^Total\b/i.test(first)){
      const name = first.replace(/^Total\s*/i, "").trim();
      const f = readFigures(l.cells.slice(1));
      if (!name){
        R.totals = {bookCost: f.bookCost ?? null, marketValue: f.marketValue ?? null, gain: f.gain ?? null,
                    income: f.income ?? null, yield: f.marketYield ?? f.currentYield ?? null};
      } else {
        const at = stack.map(s => s.name.toLowerCase()).lastIndexOf(name.toLowerCase());
        if (at === 0) R.classes.push({name, value: f.marketValue ?? null, pct: f.pct ?? null,
                                     income: f.income ?? null, gain: f.gain ?? null});
        if (at >= 0) stack.length = at;
      }
      last = null;
      continue;
    }

    /* one text cell: a heading, or the second line of the last holding's description */
    if (l.cells.length === 1 && !isFigure(first)){
      if (last && xDesc != null && l.cells[0].x >= xDesc - 4){ last.description += " " + first; continue; }
      stack.push({name: first});
      last = null;
    }
  }
  /* a class that has a single holding has no Total row of its own in some
     reports: fall back to adding up its holdings (marked as computed) */
  const named = new Set(R.classes.map(c => c.name));
  R.holdings.forEach(h => {
    if (h.cls && !named.has(h.cls)){
      named.add(h.cls);
      const hs = R.holdings.filter(x => x.cls === h.cls);
      R.classes.push({name: h.cls, value: hs.reduce((n, x) => n + (x.marketValue || 0), 0),
        pct: hs.reduce((n, x) => n + (x.pct || 0), 0), computed: true});
    }
  });
}

/** 638534.59 → "$638,534.59" (dp 2) or "$638,535" (dp 0) */
function fmtMoney(n, dp){
  if (n == null || !isFinite(n)) return "";
  const d = dp == null ? 0 : dp;
  const s = Math.abs(n).toLocaleString("en-CA", {minimumFractionDigits: d, maximumFractionDigits: d});
  return (n < 0 ? "−$" : "$") + s;
}
/** 17.79 → "17.79%", -15.19 → "−15.19%" */
function fmtPct(n){
  if (n == null || !isFinite(n)) return "";
  return (n < 0 ? "−" : "") + Math.abs(n).toFixed(2) + "%";
}
