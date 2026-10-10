/* ==========================================================================
   facts.js — turning a dropped report into facts.

   Two kinds of report are read on this computer, no AI involved:
     · a Croesus portfolio report     -> portfolio facts (accounts, holdings,
                                          performance, monthly values)
     · a financial plan (TD Wealth /  -> plan facts (net worth, goals, insights,
       Voyant-style "Wealth Plan")       education, estate, projections…)

   Reports differ from client to client, so every piece is optional: a parser
   takes what it can find and lists what it found ("found"), and the templates
   only build the parts the facts support. Anything else can go through
   Copilot (see extractionPrompt) and come back as the same JSON shape.
   ========================================================================== */

/* ── Shared helpers over pdfread.js lines ───────────────────────────────── */

const MONEY_RE = /^\$?\s?-?\(?\$?\s?[\d,]+(\.\d+)?\)?$/;
const isMoney = (s) => MONEY_RE.test(String(s || "").trim()) && /\d/.test(s);
const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());

/** Index of the first line whose text matches. */
function lineIndex(lines, re, from){
  for (let i = from || 0; i < lines.length; i++) if (re.test(lines[i].text)) return i;
  return -1;
}
/** The cell right after a label cell on the same line, or (if none) the first matching
    cell on the next couple of lines near the same left edge. */
function valueNear(lines, labelRe, test, from){
  const ok = test || isMoney;
  for (let i = from || 0; i < lines.length; i++){
    const c = lines[i].cells, k = c.findIndex(x => labelRe.test(x.s));
    if (k < 0) continue;
    const inCell = c[k].s.replace(labelRe, "").trim();
    if (inCell && ok(inCell)) return inCell;
    /* only the cell straight after the label: a label in between means another column */
    if (c[k + 1] && ok(c[k + 1].s)) return c[k + 1].s;
    for (let d = 1; d <= 2 && i + d < lines.length; d++){
      const near = lines[i + d].cells.find(x => ok(x.s) && Math.abs(x.x - c[k].x) < 60);
      if (near) return near.s;
    }
  }
  return null;
}

/* ── What kind of document is this? ─────────────────────────────────────── */

function detectReport(doc){
  const t = doc.text;
  if (/PORTFOLIO (EVALUATION|PERFORMANCE)/i.test(t) && /Market Value/i.test(t)) return "croesus";
  if (/(Wealth Plan|Financial Summary|Plan Analysis Synopsis|Goal Funding Status|Retirement Summary)/i.test(t) &&
      /(Net Worth|Retirement)/i.test(t)) return "plan";
  return "";
}

/* ── Account types ──────────────────────────────────────────────────────────
   Croesus account numbers end in a letter that says what the account is:
   A/B non-registered (CAD/USD, also corporate), S RRSP/LIRA/spousal RRSP,
   J TFSA, V RESP; E has been seen on margin accounts. The account-type text
   wins when the report has it; the letter is the fallback.
   ------------------------------------------------------------------------ */
const CORP_RE = /\b(inc|ltd|limited|corp|corporation|holdings?|ltée|ltee|enterprises|ventures|company|co\.|professional corporation|pc)\b\.?/i;
function accountKind(typeRaw, number, name){
  const t = String(typeRaw || "").toLowerCase();
  const suf = String(number || "").trim().slice(-1).toUpperCase();
  if (/tax[- ]?free|tfsa/.test(t)) return "TFSA";
  if (/\bresp\b|education/.test(t)) return "RESP";
  if (/rrif|retirement income fund/.test(t)) return "RRIF";
  if (/\blif\b|life income/.test(t)) return "LIF";
  if (/lira|locked[- ]in/.test(t)) return "LIRA";
  if (/fhsa|first home/.test(t)) return "FHSA";
  if (/rdsp|disability/.test(t)) return "RDSP";
  if (/spous/.test(t)) return "Spousal RRSP";
  if (/rrsp|retirement savings|\brsp\b/.test(t)) return "RRSP";
  if (!t){
    if (suf === "J") return "TFSA";
    if (suf === "V") return "RESP";
    if (suf === "S") return "RRSP";
  }
  const corp = CORP_RE.test(String(name || ""));
  const usd = suf === "B" || /\busd\b|u\$|\(us/i.test(t);
  return (corp ? "Corporate" : "Non-Registered") + (usd ? " (USD)" : "");
}
const REGISTERED = ["RRSP", "Spousal RRSP", "LIRA", "RRIF", "LIF", "TFSA", "RESP", "FHSA", "RDSP"];

/** "Solberg, Matt & Kelsey" -> {display:"Matt & Kelsey Solberg", firsts:["Matt","Kelsey"], last:"Solberg"} */
function householdFrom(raw){
  const s = String(raw || "").replace(/\([^)]*\)\s*$/, "").trim();
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m){
    const last = titleCase(m[1].trim()), firsts = m[2].split(/\s*(?:&|and|,)\s*/i).map(x => titleCase(x.trim())).filter(Boolean);
    return {display: firsts.join(" & ") + " " + last, firsts, last};
  }
  const parts = s.split(/\s*(?:&| and )\s*/i).map(x => titleCase(x.trim())).filter(Boolean);
  const last = (parts[parts.length - 1] || "").split(/\s+/).slice(-1)[0] || "";
  return {display: titleCase(s), firsts: parts.map(p => p.split(/\s+/)[0]), last};
}
/** "MR. MATTHEW L SOLBERG" -> "Matt" when the household calls him Matt. */
function ownerFirstName(name, firsts){
  const clean = String(name || "").replace(/\b(MR|MRS|MS|MISS|DR|MME|M)\.?\s+/gi, "").trim();
  const first = titleCase(clean.split(/\s+/)[0] || "");
  const nick = (firsts || []).find(n => n && (first.toLowerCase().startsWith(n.toLowerCase()) || n.toLowerCase().startsWith(first.toLowerCase())));
  return nick || first;
}
function accountLabelFor(kind, ownerNames, joint, corpName){
  if (/^Corporate/.test(kind)) return (corpName ? titleCase(corpName) + " — " : "") + kind.replace("Corporate", "Corporate account");
  if (kind === "RESP") return joint || ownerNames.length !== 1 ? "Family RESP" : ownerNames[0] + "'s RESP";
  if (joint) return "Joint " + kind;
  return (ownerNames[0] ? ownerNames[0] + "'s " : "") + kind;
}

/* ── Croesus portfolio report ───────────────────────────────────────────── */

const MAIN_CLASS_RE = /^(Cash & Cash Equivalents|Cash and Cash Equivalents|Fixed Income|Canadian Equity|American Equity|U\.?S\.? Equity|Foreign Equity|International Equity|Global Equity|Alternative[s]?(?: Investments)?|Preferred (?:Shares|Equity)|Other(?: Assets)?|Mixed|Balanced)$/i;

/* The "Your asset allocation" chart on the performance page. Croesus draws its labels
   and numbers as shapes, not text, so each category is known by its colour and its
   share is measured from the chart (pdfread.js → pdfDonuts), then rounded to one
   decimal exactly as the report prints it. Legend order is the report's order. */
const CROESUS_ALLOCATION_COLORS = {
  "#00b624": "Cash & Cash Equivalents",
  "#c8009c": "Medium-Term Fixed Income",
  "#0063be": "Long-Term Fixed Income",
  "#ffc82e": "Other Fixed Income",
  "#007770": "Canadian Equity",
  "#e70033": "American Equity",
  "#00257b": "Foreign Equity",
  "#f07b05": "Other"
};
function croesusAllocation(doc, warnings){
  const d = (doc.donuts || [])[0];
  if (!d) return [];
  const order = d.legend.map(l => l.color);
  d.slices.forEach(s => { if (!order.includes(s.color)) order.push(s.color); });
  let unknown = 0;
  const out = order.map(color => {
    const s = d.slices.find(x => x.color === color);
    const name = CROESUS_ALLOCATION_COLORS[color];
    if (!name) unknown++;
    return {name: name || "[[asset class, as named in the report]]", pct: s ? Math.round(s.pct * 10) / 10 : 0, color};
  });
  if (unknown) warnings.push("The asset allocation chart has " + unknown + " categor" + (unknown === 1 ? "y" : "ies") + " this program does not know by colour: check the name against the report.");
  return out;
}

function parseCroesus(doc){
  const L = doc.lines, found = [];
  const f = {kind:"portfolio-facts", source:"Croesus portfolio report", accounts:[], holdings:[], classes:[], periods:[], years:[], monthly:[]};

  /* who, when, by whom: the page header */
  const hhLine = L.find(l => l.cells.some(c => /^[^,]{2,40},\s*.+\(\w{3,8}\)$/.test(c.s)));
  if (hhLine){
    const raw = hhLine.cells.find(c => /\(\w{3,8}\)$/.test(c.s)).s;
    const hh = householdFrom(raw);
    f.household = hh.display; f.firstNames = hh.firsts; f.lastName = hh.last;
    f.householdCode = (raw.match(/\((\w+)\)$/) || [])[1] || "";
    const prev = L[L.indexOf(hhLine) - 1];
    if (prev && prev.page === hhLine.page && prev.cells.length === 1 && /^[A-Z][a-z]+ [A-Z][\w'-]+$/.test(prev.cells[0].s)) f.advisor = prev.cells[0].s;
  }
  const asOf = doc.text.match(/As of ([A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (asOf){ f.asOf = asOf[1]; const d = new Date(asOf[1]); if (!isNaN(d)) f.asOfISO = d.toISOString().slice(0, 10); }

  /* headline totals */
  const tv = valueNear(L, /^Total Portfolio Value/i); if (tv){ f.total = num(tv); found.push("total value"); }
  const ni = valueNear(L, /^Net Investment as of/i); if (ni) f.netInvestment = num(ni);
  const nv = valueNear(L, /^Net Investment Variation/i); if (nv) f.growth = num(nv);

  /* performance per period / per year / monthly — read cell pairs anywhere on page 1-2 */
  const PERIOD_RE = /^(\d+ Months?|Year to Date|YTD|\d+ Years?|Since Inception|Inception to Date)$/i;
  L.forEach((l, i) => {
    l.cells.forEach((c, k) => {
      const nx = l.cells[k + 1];
      if (PERIOD_RE.test(c.s) && nx && /^\(?-?[\d.]+\)?$/.test(nx.s) && !f.periods.some(p => p.label === c.s)){
        const p = {label: c.s, value: num(nx.s)};
        if (/inception/i.test(c.s)){
          const d = (L[i + 1] && L[i + 1].cells.find(x => /^\(\d{2}\/\d{2}\/\d{4}\)$/.test(x.s))) || null;
          if (d){ p.since = d.s.replace(/[()]/g, ""); f.inception = p.since; }
        }
        f.periods.push(p);
      }
      if (/^(19|20)\d{2}$/.test(c.s) && nx && /^\(?-?[\d.]+\)?$/.test(nx.s) && Math.abs(nx.x - c.x) < 200 && !f.years.some(y => y.year === +c.s))
        f.years.push({year: +c.s, value: num(nx.s)});
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(c.s) && nx && isMoney(nx.s)){
        const [m, d, y] = c.s.split("/");
        if (!f.monthly.some(x => x.date === c.s))
          f.monthly.push({date: c.s, iso: y + "-" + m + "-" + d, value: num(nx.s),
            flow: l.cells[k + 2] && isMoney(l.cells[k + 2].s) ? num(l.cells[k + 2].s) : null,
            mwr: l.cells[k + 3] ? num(l.cells[k + 3].s) : null});
      }
    });
  });
  f.years.sort((a, b) => a.year - b.year);
  f.monthly.sort((a, b) => a.iso.localeCompare(b.iso));
  if (f.periods.length) found.push("returns for " + f.periods.length + " periods");
  if (f.years.length) found.push(f.years.length + " calendar-year returns");
  if (f.monthly.length) found.push(f.monthly.length + " month-end values");

  /* accounts: number | type | name | currency | value */
  const ACCT_RE = /^[0-9A-Z]{5,9}$/;
  const hh = {firsts: f.firstNames || []};
  L.forEach(l => {
    const c = l.cells;
    if (c.length < 4 || c.length > 6 || !ACCT_RE.test(c[0].s) || !/\d/.test(c[0].s) || !isMoney(c[c.length - 1].s)) return;
    if (c.filter(x => isMoney(x.s)).length > 1) return;             /* a holding row, not an account row */
    const number = c[0].s;
    if (f.accounts.some(a => a.number === number)) return;
    const cur = c.find(x => /^(CAD|USD)$/.test(x.s));
    const typeRaw = c[1].s, nameRaw = c.slice(2).find(x => x !== cur && !isMoney(x.s) && x.s.length > 3);
    const name = nameRaw ? nameRaw.s : "";
    const joint = /\b(OR|AND|ET)\b|&|\bJT\b|JTWROS/.test(name.toUpperCase());
    const owners = name.split(/\s+(?:OR|AND|ET)\s+|\s*&\s*/i).map(n => ownerFirstName(n, hh.firsts)).filter(Boolean);
    const kind = accountKind(typeRaw, number, name);
    const corpName = /^Corporate/.test(kind) ? name : "";
    f.accounts.push({number, typeRaw, kind, nameRaw: name, owners, joint: joint && owners.length > 1,
      currency: cur ? cur.s : "CAD", value: num(c[c.length - 1].s),
      label: accountLabelFor(kind, owners, joint && owners.length > 1, corpName)});
  });
  if (f.accounts.length) found.push(f.accounts.length + " accounts");

  /* holdings, page by page: columns come from that page's header row */
  let main = "", sub = "", header = null, last = null;
  L.forEach(l => {
    const c = l.cells;
    if (c.some(x => /^Description$/i.test(x.s)) && c.some(x => /^Symbol$/i.test(x.s))){
      header = {};
      c.forEach(x => { header[x.s.toLowerCase()] = x; });
      header._list = c;
      return;
    }
    if (!header) return;
    if (/^Total\b/i.test(c[0].s)){
      const name = c[0].s.replace(/^Total\s+/i, "");
      const pct = c.find(x => /%$/.test(x.s) && /\d/.test(x.s));
      const val = c.find(x => isMoney(x.s));
      if (MAIN_CLASS_RE.test(name) && val) f.classes.push({name: name.replace(/^Cash and/i, "Cash &"), value: num(val.s), pct: pct ? num(pct.s) : null});
      if (/^Total$/i.test(c[0].s) && val){ f.bookTotal = num(val.s); }
      last = null;
      return;
    }
    if (c.length === 1 && !isNum(c[0].s) && c[0].x < 60){
      if (MAIN_CLASS_RE.test(c[0].s)){ main = c[0].s.replace(/^Cash and/i, "Cash &"); sub = ""; } else sub = c[0].s;
      last = null;
      return;
    }
    if (ACCT_RE.test(c[0].s) && /\d/.test(c[0].s) && c.length >= 5 && c.filter(x => isMoney(x.s) || /^n\/d$/i.test(x.s)).length >= 3){
      const symX = (header.symbol || {}).x || 169;
      const desc = c.filter(x => x.x > c[0].x + c[0].w && x.x < symX - 4).map(x => x.s).join(" ");
      const sym = c.find(x => Math.abs(x.x - symX) < 12);
      /* a number belongs to the header column whose right edge is closest to its own */
      const col = (x) => {
        let best = null, d = 1e9;
        header._list.forEach(h => { const dd = Math.abs((h.x + h.w) - (x.x + x.w)); if (dd < d){ d = dd; best = h.s.toLowerCase(); } });
        return d < 40 ? best : null;
      };
      const h = {account: c[0].s, name: desc, symbol: sym ? sym.s : "", assetClass: main, category: sub};
      c.forEach(x => {
        if (x === c[0] || x === sym || !(isNum(x.s) || /^n\/d$/i.test(x.s))) return;
        const k = col(x);
        if (!k) return;
        if (k === "market value") h.value = num(x.s);
        else if (k === "% of") h.pct = num(x.s);
        else if (k === "book cost") h.book = num(x.s);
        else if (k === "unrealized") h.gain = num(x.s);
        else if (k === "annual") h.income = num(x.s);
        else if (k === "current") h.yield = num(x.s);
        else if (k === "quantity") h.qty = num(x.s);
      });
      if (c.some(x => /^n\/d$/i.test(x.s)) && h.value == null){ h.value = 0; h.nd = true; }
      const acct = f.accounts.find(a => a.number === h.account);
      h.accountLabel = acct ? acct.label : h.account;
      f.holdings.push(h);
      last = h;
      return;
    }
    /* a description that wrapped onto its own line */
    if (last && c.length === 1 && c[0].x > 60 && c[0].x < ((header.symbol || {}).x || 169)) last.name += " " + c[0].s;
  });
  f.holdings = f.holdings.filter(h => !/^ACCOUNT BALANCE/i.test(h.name) || h.value);
  if (f.holdings.length) found.push(f.holdings.length + " holdings");
  if (f.classes.length) found.push("asset mix");
  f.warnings = [];
  f.allocation = croesusAllocation(doc, f.warnings);
  if (f.allocation.length) found.push("asset allocation");

  const fx = doc.text.match(/USD\s*1\.000\s*=\s*CAD\s*([\d.]+)/); if (fx) f.usdcad = +fx[1];
  const inc = f.holdings.reduce((n, h) => n + (h.income || 0), 0);
  if (inc){ f.income = Math.round(inc * 100) / 100; if (f.total) f.yield = Math.round(inc / f.total * 10000) / 100; }
  if (!f.total && f.accounts.length) f.total = f.accounts.reduce((n, a) => n + (a.value || 0), 0);
  f.found = found;
  return f;
}

/* ── Financial plan (TD Wealth / Voyant "Wealth Plan") ──────────────────── */

function parsePlan(doc){
  const L = doc.lines, T = L.map(l => l.text).join("\n"), found = [];
  const f = {kind:"plan-facts", source:"Financial plan", people:[], children:[], goals:[], assetMix:[], education:[],
             income:[], savings:[], pensions:[], property:[], debt:[], netWorthByYear:[], assumptions:[], insights:{}};
  const money = (s) => num(String(s || "").replace(/\/(yr|mo)$/i, ""));

  const plan = T.match(/(Base Plan[^|\n]*?)\s*\|\s*([A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (plan){ f.planName = plan[1].trim(); f.date = plan[2]; }
  const dt = T.match(/Date\s*:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/); if (dt) f.date = dt[1];
  const title = L.slice(0, 12).find(l => /^[A-Z][\w'-]+ (and|&) [A-Z][\w'-]+ [A-Z][\w'-]+$/.test(l.text.trim()));
  if (title) f.household = title.text.trim().replace(/ and /, " & ");
  const prep = L.findIndex(l => /^Prepared by$/i.test(l.text.trim()));
  if (prep >= 0 && L[prep + 1]) f.advisor = L[prep + 1].text.trim();

  /* members table: Name | Birth Year | Age | Life Expectancy | Province */
  const mem = lineIndex(L, /^Members$/);
  if (mem >= 0){
    for (let i = mem + 2; i < Math.min(L.length, mem + 10); i++){
      const c = L[i].cells;
      if (c.length < 3 || !/^\d{4}$/.test((c[1] || {}).s)) break;
      f.people.push({name: c[0].s, first: c[0].s.split(" ")[0], birthYear: +c[1].s, age: +c[2].s,
        lifeExpectancy: c[3] ? +c[3].s : null, province: c[4] ? c[4].s : ""});
    }
  }
  const oth = lineIndex(L, /^Others$/);
  if (oth >= 0){
    for (let i = oth + 2; i < Math.min(L.length, oth + 12); i++){
      const c = L[i].cells;
      if (c.length < 3 || !/^\d{4}$/.test((c[1] || {}).s)) break;
      f.children.push({name: c[0].s, first: c[0].s.split(" ")[0], birthYear: +c[1].s, age: +c[2].s, type: c[3] ? c[3].s : ""});
    }
  }
  /* synopsis household table, if the facts pages were not included */
  if (!f.people.length){
    const hh = lineIndex(L, /^Household$/);
    if (hh >= 0) for (let i = hh + 2; i < Math.min(L.length, hh + 10); i++){
      const c = L[i].cells;
      if (c.length !== 3 || !/^\d{4}$/.test(c[2].s)) break;
      (f.people.length < 2 && +c[1].s >= 18 ? f.people : f.children).push({name: c[0].s, first: c[0].s.split(" ")[0], age: +c[1].s, birthYear: +c[2].s});
    }
  }
  /* retirement ages come in the same order as the people */
  const ra = [...T.matchAll(/Retirement Age:\s*(\d{2})(?:\s*\((\d{4})\))?/g)];
  f.people.forEach((p, i) => {
    const m = ra.find(x => x[2]) && ra.filter(x => x[2])[i] || ra[i];
    if (m){ p.retireAge = +m[1]; if (m[2]) p.retireYear = +m[2]; }
  });
  if (f.people.length) found.push(f.people.length + " people" + (f.children.length ? " and " + f.children.length + " children" : ""));

  /* net worth */
  const assets = valueNear(L, /^Assets\s*:?$/), liab = valueNear(L, /^Liabilities\s*:?$/);
  if (assets) f.assets = money(assets);
  if (liab) f.liabilities = money(liab);
  if (f.assets != null && f.liabilities != null){ f.netWorth = f.assets - f.liabilities; found.push("net worth"); }
  const mixAt = L.findIndex(l => l.cells.some(c => /^Assets$/.test(c.s)) && l.cells.some(c => /Goal Summary/.test(c.s)));
  if (mixAt >= 0) for (let i = mixAt + 1; i < Math.min(L.length, mixAt + 10); i++){
    const c = L[i].cells.filter(x => x.x > 250);
    if (c.length >= 2 && /%$/.test(c[c.length - 1].s)) f.assetMix.push({name: c[0].s, pct: num(c[c.length - 1].s)});
  }

  /* goals and how well they are funded */
  L.forEach((l, i) => {
    const m = l.cells.find(c => /Goal will be met for (\d+) of (\d+) Years/i.test(c.s));
    if (!m) return;
    const r = m.s.match(/(\d+) of (\d+)/), name = l.cells[0].s;
    const amt = L[i + 1] && L[i + 1].cells.find(c => /^\$[\d,]+/.test(c.s));
    f.goals.push({name, amount: amt ? money(amt.s) : null, per: amt && /mo/.test(amt.s) ? "mo" : "yr", met: +r[1], of: +r[2]});
  });
  /* years for each goal ("Year(s): 2027 -2043") */
  /* the years for each goal sit under its name, in the same column: "Year(s): 2028 -2032" */
  f.goals.forEach(g => {
    L.forEach((l, i) => {
      if (g.start) return;
      const cell = l.cells.find(c => c.s.indexOf(g.name) === 0 && /\(/.test(c.s));
      const next = cell && L[i + 1] && L[i + 1].cells.find(c => Math.abs(c.x - cell.x) < 30 && /Year\(s\):\s*\d{4}/.test(c.s));
      const m = next && next.s.match(/(\d{4})\s*-\s*(\d{4})/);
      if (m){ g.start = +m[1]; g.end = +m[2]; }
    });
  });
  if (f.goals.length) found.push(f.goals.length + " goals");

  /* the planner's own insights */
  const I = f.insights; let m;
  if ((m = T.match(/Save an additional\s+\$([\d,]+)\s+annually until ([^,\n]+)/))){ I.saveMore = money(m[1]); I.saveUntil = m[2].trim(); }
  if ((m = T.match(/([\d.]+)%\s+return is needed/))) I.returnNeeded = +m[1];
  if ((m = T.match(/afford to spend\s+\$([\d,]+)/))) I.spendCapacity = money(m[1]);
  if ((m = T.match(/lump sum of\s+\$([\d,]+)\s+in\s+(\d{4})/))){ I.lumpSum = money(m[1]); I.lumpYear = +m[2]; }
  I.protection = [...T.matchAll(/If (\w+) passed away today, an additional\s+\$([\d,]+)/g)].map(x => {
    const other = f.people.find(p => p.first && p.first !== x[1]);
    return {if: x[1], amount: money(x[2]), for: other ? other.first : ""};
  });
  if ((m = T.match(/shortfall in (\d+) of (\d+) retirement years/i))) f.retirementShortfall = {years: +m[1], of: +m[2]};
  if (Object.keys(I).some(k => k !== "protection" && I[k] != null) || I.protection.length) found.push("planner insights");

  /* education, one block per child */
  L.forEach((l, i) => {
    if (!/Education Goals$/.test(l.cells[0] ? l.cells[0].s : "")) return;
    const child = l.cells[0].s.replace(/'s Education Goals$/, "");
    const row = L[i + 1] && L[i + 1].cells[0] ? L[i + 1].cells[0].s : child + "'s Post Secondary";
    const yrs = L.slice(i + 1, i + 4).map(x => x.text).join(" ").match(/(\d{4})\s*\(Age\s*(\d+)\)[\s\S]*?(\d{4})\s*\(Age\s*(\d+)\)/);
    const per = L.slice(i + 1, i + 6).map(x => x.text).join(" ").match(/\$([\d,]+) per year/);
    const e = {child, goal: row, start: yrs ? +yrs[1] : null, end: yrs ? +yrs[3] : null, annual: per ? money(per[1]) : null};
    const next = lineIndex(L, /Spending Breakdown/, i);
    if (next > 0 && next - i < 40){
      const v = (re) => { const x = valueNear(L.slice(next, next + 30), re); return x == null ? null : money(x); };
      Object.assign(e, {total: v(/Total Education Spend/), resp: v(/^RESP:?$/), cashflow: v(/^Cashflow:?$/), shortfall: v(/^Shortfall:?$/),
        contributions: v(/^Contributions:?$/), cesgReceived: v(/CESG Grants Received/), balance: v(/Total Current Balance/),
        cesgAvailable: v(/^Available amount:?$/), room: v(/RESP Contribution Room Available/)});
      const pb = L.slice(next, next + 30).map(x => x.text).join("\n").match(/Projected balance by (\d{4}):\s*\$([\d,]+)/);
      if (pb){ e.projectedYear = +pb[1]; e.projectedBalance = money(pb[2]); }
    }
    f.education.push(e);
  });
  if (f.education.length) found.push("education for " + f.education.length);

  /* synopsis tables: Income, Savings and Investments, Pensions, Property, Debt */
  const table = (title, key) => {
    const at = L.findIndex(l => l.cells.length === 1 && l.cells[0].s === title);
    if (at < 0 || !/^Description/.test((L[at + 1] || {text:""}).text)) return;
    const rows = [], seg = [];
    for (let i = at + 2; i < L.length && seg.length < 30; i++){
      if (/^Total\b/.test(L[i].text) || (L[i].page !== L[at].page && L[i].cells.length === 1 && /Synopsis/.test(L[i].text))) break;
      if (/TD Wealth|Base Plan/.test(L[i].text)) continue;
      seg.push(L[i]);
    }
    const anchors = seg.filter(l => l.cells.some(c => c.x > 380 && isMoney(c.s.replace(/\/(yr|mo)$/, ""))));
    anchors.forEach(a => {
      const desc = a.cells.find(c => c.x < 200);
      const val = a.cells.slice().reverse().find(c => isMoney(c.s));
      const near = seg.filter(l => l === a || (!anchors.includes(l) && anchors.reduce((best, b) => Math.abs(b.y - l.y) < Math.abs(best.y - l.y) ? b : best, a) === a));
      const type = near.flatMap(l => l.cells.filter(c => c.x >= 200 && c.x < 380 && !isMoney(c.s)).map(c => c.s)).join(" ").trim();
      rows.push({desc: desc ? desc.s.replace(/\s*\(\s*([^)]*?)\s*\)\s*$/, "") : (rows.length ? rows[rows.length - 1].desc + " — " + type : type),
                 owner: desc ? ((desc.s.match(/\(\s*([^)]*?)\s*\)\s*$/) || [])[1] || "").replace(/\s*,\s*/g, " & ") : "",
                 type, value: money(val.s)});
    });
    f[key] = rows;
  };
  table("Income", "income"); table("Savings and Investments", "savings"); table("Pensions", "pensions");
  table("Property", "property"); table("Debt", "debt");
  if (f.savings.length) found.push(f.savings.length + " accounts");

  /* estate */
  const est = lineIndex(L, /^Estate Summary$/);
  if (est >= 0){
    const yrs = L.slice(est, est + 15).find(l => l.cells.length >= 2 && l.cells.every(c => /^\d{4}$/.test(c.s)));
    const row = (re) => { const l = L.slice(est, est + 80).find(x => re.test(x.cells[0] ? x.cells[0].s : "")); return l ? l.cells.slice(1).map(c => money(c.s)) : []; };
    if (yrs) f.estate = {years: yrs.cells.map(c => +c.s), afterTax: row(/^Estate after Taxes/), beforeTax: row(/^Estate before Taxes/),
      finalTaxes: row(/^Final Return Taxes/)[0] || null};
    if (f.estate) found.push("estate");
  }

  /* net worth year by year */
  const nwHead = L.find(l => l.cells[0] && /^Years$/.test(l.cells[0].s) && l.cells.some(c => /Net Worth/.test(c.s)));
  if (nwHead){
    const cols = nwHead.cells.slice(1);
    L.forEach(l => {
      if (l.page < nwHead.page || !/^(19|20)\d{2}$/.test((l.cells[0] || {}).s) || !l.cells.slice(1).every(c => isMoney(c.s)) || l.cells.length < 2) return;
      const yr = +l.cells[0].s;
      if (f.netWorthByYear.some(r => r.year === yr)) return;
      const r = {year: yr};
      l.cells.slice(1).forEach(c => {
        const h = cols.reduce((b, x) => Math.abs(x.x - c.x) < Math.abs(b.x - c.x) ? x : b, cols[0]);
        r[h.s.replace(/\s+/g, "").replace(/^./, s => s.toLowerCase())] = money(c.s);
      });
      r.net = money(l.cells[l.cells.length - 1].s);
      f.netWorthByYear.push(r);
    });
    if (f.netWorthByYear.length) found.push("net worth projection to " + f.netWorthByYear[f.netWorthByYear.length - 1].year);
  }

  /* assumptions */
  [["Inflation", /^Inflation$/], ["Investment growth", /^Investment Growth Rate$/], ["Savings growth", /^Savings Growth Rate$/],
   ["Property growth", /^Property Growth Rate$/], ["Salary growth", /^Salary Growth Rate$/], ["CPP/OAS indexing", /^CPP\/QPP and OAS COLA Rate$/]]
    .forEach(([k, re]) => { const v = valueNear(L, re, s => /^[\d.]+%$/.test(s)); if (v) f.assumptions.push({k, v}); });
  if (f.assumptions.length) found.push("assumptions");

  f.found = found;
  return f;
}

/* ── Copilot fallback: any other report, read by Copilot into the same shape ── */

const FACTS_SHAPES = {
  /* invented example values — the shape is what matters */
  portfolio: `{
  "kind": "portfolio-facts",
  "household": "Robert & Anne Kowalchuk",
  "asOf": "March 31, 2026",
  "total": 1250400.00,
  "netInvestment": 820000.00,
  "periods": [{"label": "Year to Date", "value": 3.20}, {"label": "1 Year", "value": 9.85}],
  "years": [{"year": 2025, "value": 11.40}],
  "monthly": [{"date": "03/31/2026", "value": 1250400.00}],
  "accounts": [{"number": "1ABC23S", "kind": "RRSP", "label": "Robert's RRSP", "owners": ["Robert"], "joint": false, "currency": "CAD", "value": 540000.00}],
  "holdings": [{"account": "1ABC23S", "name": "EXAMPLE CDN EQUITY ETF", "symbol": "XYZ", "assetClass": "Canadian Equity", "value": 85000.00, "pct": 6.80, "income": 2550.00, "yield": 3.00}],
  "classes": [{"name": "Canadian Equity", "value": 610000.00, "pct": 48.78}],
  "allocation": [{"name": "Canadian Equity", "pct": 35.4}]
}`,
  plan: `{
  "kind": "plan-facts",
  "household": "Robert & Anne Kowalchuk",
  "date": "March 31, 2026",
  "people": [{"name": "Robert Kowalchuk", "first": "Robert", "age": 58, "retireAge": 63, "retireYear": 2031, "lifeExpectancy": 95}],
  "children": [{"name": "Emma Kowalchuk", "first": "Emma", "age": 16}],
  "assets": 2400000, "liabilities": 150000, "netWorth": 2250000,
  "assetMix": [{"name": "Registered", "pct": 45.0}],
  "goals": [{"name": "Retirement Goal", "amount": 120000, "per": "yr", "met": 30, "of": 32, "start": 2031, "end": 2063}],
  "insights": {"saveMore": 12000, "returnNeeded": 5.4, "spendCapacity": 115000, "lumpSum": 150000, "lumpYear": 2026,
               "protection": [{"if": "Robert", "amount": 400000, "for": "Anne"}]},
  "education": [{"child": "Emma", "start": 2028, "end": 2032, "annual": 20000, "total": 90000, "resp": 70000, "shortfall": 0, "room": 15000}],
  "savings": [{"desc": "Robert's TFSA", "owner": "Robert", "type": "TFSA - Tax-Free Savings Account", "value": 95000}],
  "pensions": [], "property": [], "debt": [],
  "netWorthByYear": [{"year": 2026, "net": 2250000}],
  "assumptions": [{"k": "Inflation", "v": "2%"}]
}`
};
function extractionPrompt(kind){
  const what = kind === "plan" ? "financial plan" : "portfolio / investment statement";
  return `Read the attached ${what} and return the key facts as JSON, exactly in the shape below.

RULES
- Use only what is in the document. Copy every number exactly; do not calculate, estimate or round.
- Leave out any field the document does not have. Do not invent values.
- Numbers are plain numbers (no $ or %), e.g. 1250400.00 and 9.85.
- Return ONLY the JSON, nothing before or after it.

SHAPE
${FACTS_SHAPES[kind === "plan" ? "plan" : "portfolio"]}`;
}

/** Facts pasted back from Copilot: tidy the shape so the templates can rely on it. */
function normalizeFacts(v){
  if (!v || typeof v !== "object") throw Error("That is not a facts object.");
  const arrs = v.kind === "plan-facts"
    ? ["people", "children", "goals", "assetMix", "education", "income", "savings", "pensions", "property", "debt", "netWorthByYear", "assumptions"]
    : ["accounts", "holdings", "classes", "allocation", "periods", "years", "monthly"];
  arrs.forEach(k => { if (!Array.isArray(v[k])) v[k] = []; });
  if (v.kind === "plan-facts"){ v.insights = v.insights || {}; v.insights.protection = v.insights.protection || []; }
  else {
    const hh = householdFrom(v.household || "");
    v.accounts.forEach(a => {
      a.kind = a.kind || accountKind(a.typeRaw || a.type, a.number, a.nameRaw);
      a.owners = a.owners || [];
      a.label = a.label || accountLabelFor(a.kind, a.owners, a.joint, "");
      a.value = typeof a.value === "number" ? a.value : num(a.value);
    });
    v.holdings.forEach(h => { const a = v.accounts.find(x => x.number === h.account); h.accountLabel = h.accountLabel || (a ? a.label : h.account || ""); });
    if (v.total == null) v.total = v.accounts.reduce((n, a) => n + (a.value || 0), 0);
    if (!v.firstNames) v.firstNames = hh.firsts;
  }
  v.source = v.source || "Copilot (from your document)";
  v.found = v.found || ["read by Copilot"];
  return v;
}
