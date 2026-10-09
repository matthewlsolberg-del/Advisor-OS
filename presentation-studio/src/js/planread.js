/* ═══════════════════════════════════════════════════════════════════════════
   planread.js — read a TD financial plan (Voyant-style "Wealth Plan" PDF)
   ───────────────────────────────────────────────────────────────────────────
   Input:  readPdf(file) (pdfread.js).   Output: readPlan(pdf) → {
     clients, preparedBy, date, planName, province,
     people:   [{name, age, birthYear, retireAge, retireYear, lifeExpectancy, lifeYear}],
     children: [{name, age, birthYear}],
     netWorth, assets, liabilities, assetMix: [{name, pct}],
     insights: {savingsNeed, savingsNeedNote, requiredReturn, affordableSpending,
                lumpSum, lumpSumYear, insurance:[{person, amount, survivor}]},
     goals:    [{name, amount, met, of}],          "met for 16 of 16 years"
     retirement: {shortfallYears, years},
     education: [{child, start, end, perYear, totalSpend, fromRESP, fromCashflow, shortfall}],
     income:   [{name, value}],  savings: [{name, value}],  pensions, property, debt,
     estate:   {year, netWorth, finalTaxes, afterTaxes},
     projection: [{year, netWorth}],
     assumptions: [{name, value}],
     found, missing, warnings
   }
   Figures are taken exactly as printed. Plans differ — some leave out the
   education or estate pages, some name things differently — so every part is
   optional and `found` / `missing` say what was read. The parser never fills
   a gap with a guess.
   ═══════════════════════════════════════════════════════════════════════════ */

const money$ = (t) => { const m = /-?\$\s?-?[\d,]+(?:\.\d+)?/.exec(String(t || "")); return m ? croesusNumber(m[0]) : null; };

/** Does this PDF look like a financial plan? */
function looksLikePlan(pdf){
  const t = pdf.text || "";
  return /Wealth Plan|Financial Plan|Retirement Summary|Plan Analysis Synopsis|Goal Funding/i.test(t) &&
    /Net Worth/i.test(t) && /Retirement/i.test(t);
}

function readPlan(pdf){
  const P = {people: [], children: [], assetMix: [], insights: {insurance: []}, goals: [], retirement: {},
             education: [], income: [], savings: [], pensions: [], property: [], debt: [], estate: null,
             projection: [], assumptions: [], found: [], missing: [], warnings: []};
  const L = [];
  pdf.pages.forEach((p, pi) => p.lines.forEach(l => L.push(Object.assign({page: pi}, l))));
  const text = pdf.text || "";
  const flat = text.replace(/\s+/g, " ");

  /* helpers over the lines -------------------------------------------- */
  const lineIdx = (re, from) => { for (let i = from || 0; i < L.length; i++) if (re.test(L[i].text)) return i; return -1; };
  /** the money figure in the cell right after a label on the same line */
  const rightOf = (re) => {
    for (const l of L){
      const k = l.cells.findIndex(c => re.test(c.text));
      if (k < 0) continue;
      const inCell = money$(l.cells[k].text.replace(re, ""));
      if (inCell !== null) return inCell;
      for (let j = k + 1; j < l.cells.length; j++){ const v = money$(l.cells[j].text); if (v !== null) return v; }
    }
    return null;
  };
  /** the money figure printed under a label (same column, within a few lines) */
  const below = (re, from, to) => {
    for (let i = from || 0; i < (to || L.length); i++){
      const c = L[i].cells.find(x => re.test(x.text));
      if (!c) continue;
      for (let j = i + 1; j < Math.min(i + 4, L.length); j++){
        const hit = L[j].cells.find(x => Math.abs(x.x - c.x) < 25 && money$(x.text) !== null);
        if (hit) return money$(hit.text);
      }
    }
    return null;
  };

  /* cover ------------------------------------------------------------- */
  const cover = pdf.pages[0] ? pdf.pages[0].lines.map(l => l.text) : [];
  const titleAt = cover.findIndex(t => /^(Wealth|Financial|Retirement) Plan$/i.test(t.trim()));
  if (titleAt >= 0 && cover[titleAt + 1]) P.clients = cover[titleAt + 1].trim();
  const prep = cover.findIndex(t => /^Prepared by$/i.test(t.trim()));
  if (prep >= 0 && cover[prep + 1]) P.preparedBy = cover[prep + 1].trim();
  const date = /Date\s*:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(text);
  if (date) P.date = date[1];
  const plan = /\n(?:TD Wealth\s+)?([A-Z][A-Za-z ]*?Plan(?: \d{4})?)\s*\|\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*\|/.exec(text);
  if (plan) P.planName = plan[1].replace(/^TD Wealth\s+/, "").trim();

  /* the people: "Members" table, else the household list -------------- */
  const mem = lineIdx(/^Name\s+Birth Year\s+Age\s+Life Expectancy/i);
  if (mem >= 0){
    for (let i = mem + 1; i < L.length; i++){
      const c = L[i].cells.map(x => x.text);
      if (c.length < 3 || !/^\d{4}$/.test(c[1])) break;
      P.people.push({name: c[0], birthYear: +c[1], age: +c[2], lifeExpectancy: +c[3] || null});
      if (c[4] && !P.province) P.province = c[4];
    }
  }
  const others = lineIdx(/^Name\s+Birth Year\s+Age\s+Person Type/i);
  if (others >= 0){
    for (let i = others + 1; i < L.length; i++){
      const c = L[i].cells.map(x => x.text);
      if (c.length < 3 || !/^\d{4}$/.test(c[1])) break;
      if (/child|dependant/i.test(c[3] || "")) P.children.push({name: c[0], birthYear: +c[1], age: +c[2]});
    }
  }
  if (!P.people.length){
    const hh = lineIdx(/^Name\s+End of Year Age\s+Birth Year/i);
    if (hh >= 0){
      for (let i = hh + 1; i < L.length; i++){
        const c = L[i].cells.map(x => x.text);
        if (c.length < 3 || !/^\d{4}$/.test(c[2])) break;
        P.people.push({name: c[0], age: +c[1], birthYear: +c[2]});
      }
    }
  }
  /* retirement and life expectancy, two people side by side under their
     names (the Retirement Summary page); match each to its name by position */
  const isName = (t) => /^[A-Z][a-z]+ [A-Z][a-z'-]+$/.test(t);
  for (let i = 0; i < L.length; i++){
    const rcells = L[i].cells.filter(c => /^Retirement Age:\s*\d+/.test(c.text));
    if (!rcells.length) continue;
    const names = L.slice(Math.max(0, i - 3), i).reverse().find(l => l.cells.length && l.cells.every(c => isName(c.text)));
    if (!names) continue;
    const life = L[i + 1] && L[i + 1].cells.some(c => /^Life Expectancy:/.test(c.text)) ? L[i + 1] : null;
    const nearest = (line, x) => line.cells.reduce((b, c) => Math.abs(c.x - x) < Math.abs(b.x - x) ? c : b);
    rcells.forEach(c => {
      const name = nearest(names, c.x).text;
      const m = /Retirement Age:\s*(\d+)(?:\s*\((\d{4})\))?/.exec(c.text);
      const lm = life && /Life Expectancy:\s*(\d+)(?:\s*\((\d{4})\))?/.exec(nearest(life, c.x).text);
      let person = P.people.find(p => p.name === name);
      if (!person){ person = {name}; P.people.push(person); }
      person.retireAge = +m[1]; if (m[2]) person.retireYear = +m[2];
      if (lm){ person.lifeExpectancy = person.lifeExpectancy || +lm[1]; if (lm[2]) person.lifeYear = +lm[2]; }
    });
    break;
  }

  /* financial summary ------------------------------------------------- */
  P.assets = rightOf(/^Assets\s*:/i);
  P.liabilities = rightOf(/^Liabilities\s*:/i);
  const nwAt = lineIdx(/^Net Worth\b.*Assets\s*:/i);
  if (nwAt >= 0){
    for (let i = nwAt; i < nwAt + 4 && i < L.length; i++){
      const c = L[i].cells.find(x => /^\$[\d,]+$/.test(x.text) && x.x < L[nwAt].cells[1].x);
      if (c){ P.netWorth = money$(c.text); break; }
    }
  }
  if (P.netWorth == null && P.assets != null && P.liabilities != null){
    P.warnings.push("Net worth was not printed where expected; it is not filled in (assets and liabilities were read).");
  }
  const mixAt = lineIdx(/^Goal Summary\s+Assets$/i);
  if (mixAt >= 0){
    for (let i = mixAt + 1; i < Math.min(mixAt + 12, L.length); i++){
      L[i].cells.forEach((c, k) => {
        const v = L[i].cells[k + 1];
        if (v && /^\d+(\.\d+)?%$/.test(v.text) && /^[A-Z][A-Za-z -]+$/.test(c.text)) P.assetMix.push({name: c.text, pct: parseFloat(v.text)});
      });
    }
  }

  /* insights ---------------------------------------------------------- */
  const I = P.insights;
  let m = /Save an additional (\$[\d,]+) (annually|per year|monthly)(?: until ([^,.]+?))?[,.]/i.exec(flat);
  if (m){ I.savingsNeed = money$(m[1]); I.savingsNeedNote = (m[3] || "").trim(); }
  m = /A ([\d.]+)% return is needed/i.exec(flat);
  if (m) I.requiredReturn = parseFloat(m[1]);
  m = /afford to spend (\$[\d,]+) annually/i.exec(flat);
  if (m) I.affordableSpending = money$(m[1]);
  /* two columns of prose can interleave here, so allow a few words between */
  m = /additional lump sum of\b[^$]{0,80}?(\$[\d,]+) in (\d{4})/i.exec(flat);
  if (m){ I.lumpSum = money$(m[1]); I.lumpSumYear = +m[2]; }
  const ins = /If (\w+) passed away today, an additional (\$[\d,]+)/gi;
  while ((m = ins.exec(flat))){
    if (I.insurance.some(x => x.person === m[1])) continue;
    const other = P.people.find(p => p.name && !p.name.startsWith(m[1]) && !P.children.some(c => c.name === p.name));
    I.insurance.push({person: m[1], amount: money$(m[2]), survivor: other ? other.name.split(" ")[0] : ""});
  }

  /* goals and how well they are funded --------------------------------- */
  for (let i = 0; i < L.length; i++){
    const c = L[i].cells;
    const k = c.findIndex(x => /Goal will be met for \d+ of \d+ Years/i.test(x.text));
    if (k < 1) continue;
    const g = /met for (\d+) of (\d+)/i.exec(c[k].text);
    const amt = L[i + 1] && /^\$[\d,]+\s*\/\s*yr$/i.test(L[i + 1].cells[0].text) ? money$(L[i + 1].cells[0].text) : null;
    const name = c[0].text;
    if (!P.goals.some(x => x.name === name)) P.goals.push({name, amount: amt, met: +g[1], of: +g[2]});
  }
  m = /shortfall in (\d+) of (\d+) retirement years/i.exec(flat);
  if (m){ P.retirement.shortfallYears = +m[1]; P.retirement.years = +m[2]; }

  /* education: one block per child ------------------------------------ */
  for (let i = 0; i < L.length; i++){
    const head = /^(.+?)'s Education Goals/i.exec(L[i].text);
    if (!head) continue;
    const child = head[1];
    if (P.education.some(e => e.child === child)) continue;
    const e = {child};
    const span = L.slice(i, i + 6).map(l => l.text).join(" ");
    const se = /(\d{4}) \(Age (\d+)\)\s+(\d{4}) \(Age (\d+)\)/.exec(span);
    if (se){ e.start = +se[1]; e.end = +se[3]; }
    const py = /(\$[\d,]+) per year/.exec(span);
    if (py) e.perYear = money$(py[1]);
    const brk = lineIdx(/^Spending Breakdown/i, i);
    if (brk >= 0 && brk - i < 30){
      const end = Math.min(brk + 30, L.length);
      e.totalSpend = below(/^Total Education Spend:?$/i, brk, end);
      e.fromRESP = below(/^RESP:$/i, brk, end);
      e.fromCashflow = below(/^Cashflow:$/i, brk, end);
      e.shortfall = below(/^Shortfall:$/i, brk, end);
      e.respBalance = (() => { for (let j = brk; j < end; j++){ const c = L[j].cells; const k = c.findIndex(x => /^Total Current Balance:/.test(x.text)); if (k >= 0 && c[k + 1]) return money$(c[k + 1].text); } return null; })();
    }
    P.education.push(e);
  }

  /* the plan's inputs: income, savings, pensions, property, debt ------- */
  const listUnder = (re, into) => {
    const at = lineIdx(re);
    if (at < 0) return;
    const hdr = L[at + 1] && /^Description/i.test(L[at + 1].text) ? at + 2 : at + 1;
    for (let i = hdr; i < L.length; i++){
      const c = L[i].cells;
      if (/^Total$/i.test(c[0].text)){ into.total = money$(c[c.length - 1].text); break; }
      if (L[i].page !== L[at].page && /^(Description|Plan Analysis)/i.test(c[0].text)) continue;
      const v = money$(c[c.length - 1].text);
      if (v === null || c.length < 2) continue;
      if (!/\(/.test(c[0].text) && c.length < 3) continue;           /* a wrapped "type" line */
      into.push({name: c[0].text.replace(/\s*\(\s*/g, " (").replace(/\s*\)/g, ")").replace(/\s*,\s*/g, ", "),
                 type: c.length >= 3 ? c[1].text : "", value: v});
    }
  };
  listUnder(/^Income$/i, P.income);
  listUnder(/^Savings and Investments$/i, P.savings);
  listUnder(/^Pensions$/i, P.pensions);
  listUnder(/^Property$/i, P.property);
  listUnder(/^Debt$/i, P.debt);

  /* estate (the first year column) ------------------------------------ */
  const ages = lineIdx(/^Age\s*:.*\|/i);
  if (ages >= 0){
    const years = L[ages - 1] ? L[ages - 1].cells.map(c => c.text).filter(t => /^\d{4}$/.test(t)) : [];
    const firstFig = (re) => { const i = lineIdx(re, ages); return i >= 0 ? money$(L[i].cells[1] && L[i].cells[1].text) : null; };
    P.estate = {year: years[0] ? +years[0] : null, netWorth: firstFig(/^Net Worth Before Death Benefits/i),
                finalTaxes: firstFig(/^Final Return Taxes Due/i), afterTaxes: firstFig(/^Estate after Taxes and Expenses/i)};
    if (P.estate.netWorth == null && P.estate.afterTaxes == null) P.estate = null;
  }

  /* projected net worth by year (the last figure on each row) --------- */
  const nwHead = L.filter(l => /^Years\s+Tax Free\s+Registered/i.test(l.text));
  nwHead.forEach(h => {
    for (let i = L.indexOf(h) + 1; i < L.length; i++){
      const c = L[i].cells;
      if (!/^\d{4}$/.test(c[0].text)) { if (/^TD Wealth|^\d+$/.test(c[0].text)) break; continue; }
      const v = money$(c[c.length - 1].text);
      if (v !== null && !P.projection.some(p => p.year === +c[0].text)) P.projection.push({year: +c[0].text, netWorth: v});
    }
  });

  /* key assumptions ---------------------------------------------------- */
  [["Inflation", /^Inflation$/i], ["Investment growth rate", /^Investment Growth Rate$/i],
   ["Savings growth rate", /^Savings Growth Rate$/i], ["Property growth rate", /^Property Growth Rate$/i],
   ["Salary growth rate", /^Salary Growth Rate$/i]].forEach(([name, re]) => {
    for (const l of L){
      const k = l.cells.findIndex(c => re.test(c.text));
      if (k >= 0 && l.cells[k + 1] && /^[\d.]+%$/.test(l.cells[k + 1].text)){ P.assumptions.push({name, value: l.cells[k + 1].text}); break; }
    }
  });

  /* what was found ----------------------------------------------------- */
  const say = (ok, yes, no) => (ok ? P.found : P.missing).push(ok ? yes : no);
  say(P.people.length, P.people.length + " planning client" + (P.people.length === 1 ? "" : "s") +
    (P.children.length ? " and " + P.children.length + " child" + (P.children.length === 1 ? "" : "ren") : ""), "the people in the plan");
  say(P.netWorth != null, "net worth " + fmtMoney(P.netWorth), "net worth");
  say(P.goals.length, P.goals.length + " goals with funding status", "goal funding status");
  say(I.requiredReturn != null || I.savingsNeed != null || I.affordableSpending != null, "the plan's insights", "the insights page");
  if (P.education.length) P.found.push("education for " + P.education.map(e => e.child).join(" and "));
  if (P.estate) P.found.push("estate summary");
  if (P.projection.length) P.found.push("net worth projection to " + P.projection[P.projection.length - 1].year);
  return P;
}
