/* ==========================================================================
   brand.js — the house standards, in one place.

   Colours and typography follow TD Brand Standards (2026 refresh, Premium
   palette) as captured in WORK/Content & Media/Files/Branding/
   TD_BRAND_STANDARDS.md. Disclosures, team block and contact details mirror
   the MHWG Tools studios (mhwgtools backend/app/studio) so every client-facing
   piece the team produces reads as one voice.

   Change something here and it changes everywhere in the document.
   ========================================================================== */

const BRAND = {
  colors: {
    deep:"#002B1A", shield:"#42BF19", greenDk:"#25A106", kick:"#1A7E0C",
    gold:"#CFBD91", agedGold:"#78704F", ink:"#1C1C1C", gray:"#3C4339",
    hair:"#E4E9E2", tint:"#F4F8F5", white:"#FFFFFF"
  },
  /* TD data-visualisation order: Shield Green leads, then Premium Green, gold,
     then secondary palette one at a time. */
  sequence:["#42BF19","#002B1A","#CFBD91","#3B5B72","#A4D6DD","#D99E14","#855991","#E4E9E2"],

  firm:"Medicine Hat Wealth Group",
  subbrand:"TD Wealth Private Investment Advice",
  address:"101, 2810 13th Ave SE, Medicine Hat, AB  T1A 3P9",
  phone:"(403) 504-2780",
  web:"advisors.td.com/medicinehatwealthgroup",
  tagline:"Your goals. Our guidance. One team.",

  team:[
    {name:"Neil Mardian",    desig:"CFP®, CIWM, M.Sc.", title:"Investment Advisor"},
    {name:"Matthew Solberg", desig:"CFP®, CIM®",   title:"Investment Advisor"},
    {name:"Brian Widmer",    desig:"CFP®, CIM®",   title:"Investment Advisor"},
    {name:"Shandie Froese",  desig:"B.Sc., CFP®",       title:"Investment Advisor"}
  ],

  draftTag:"DRAFT — pending branch/firm compliance pre-approval",

  /* Same standard wording the Education Studio attaches to every piece. */
  disclosures:[
    "This material has been prepared for the individual named on the cover and is provided for " +
    "general information and discussion purposes. It is not, and should not be construed as, " +
    "investment, tax, legal, or accounting advice, nor an offer or solicitation to buy or sell any " +
    "security. Recommendations discussed here are considered in the context of the information you " +
    "have provided; if your circumstances change, the analysis should be revisited.",

    "Any figures, rates, projections, or scenarios shown are hypothetical and illustrative only, and " +
    "are not a guarantee or prediction of future results. Tax, pension, and government benefit rules " +
    "are complex, vary by individual circumstance and jurisdiction, and change over time. Please " +
    "verify current details with the Canada Revenue Agency, the relevant authority, or a qualified " +
    "professional before relying on them.",

    "Past performance is not indicative of future results. All investments carry risk, including the " +
    "possible loss of principal.",

    "Before acting, please consult your advisor together with your own tax, legal, and accounting " +
    "professionals for advice specific to your situation.",

    "Medicine Hat Wealth Group is part of TD Wealth Private Investment Advice, a division of TD " +
    "Waterhouse Canada Inc., a subsidiary of The Toronto-Dominion Bank. TD Waterhouse Canada Inc. – " +
    "Member of the Canadian Investor Protection Fund."
  ]
};

/* ── Cover title suggestions ──────────────────────────────────────────────
   A house list per piece, plus a surname version built from "Prepared for"
   ("Robert & Anne Kowalchuk" -> "The Kowalchuk Plan"), which is the one that
   reads bespoke. The title field itself stays free text — these only fill it.

   Deliberately absent: anything that promises an outcome ("Your Path to
   Financial Freedom"). A title that promises gets read as advice.
   ------------------------------------------------------------------------ */

const TITLE_IDEAS = {
  plan_summary: ["The Plan", "The Whole Picture", "Where You Stand",
                 "By Design", "Your Financial Plan"],
  annual_review:["The Long View", "This Year, and Next", "The Checkpoint",
                 "Where You Stand", "Your Annual Review"],
  topic:        ["A Closer Look", "The Decision", "Worth a Look",
                 "The Question in Front of You"],
  proposal:     ["Working Together", "What We'd Do", "First Principles",
                 "The Start of Something"],
  portfolio_review:["The Portfolio Review", "How Your Money Is Invested",
                 "Your Portfolio Review", "The Investment Review", "Under the Hood"],
  blank:        ["The Plan", "A Closer Look", "The Whole Picture"]
};

/* Surname out of a "prepared for" line. Handles the two shapes that trip a
   plain last-word rule: entity tails ("The Solberg Family Trust") and name
   particles ("Ellen Van Der Berg"). */
const NAME_TAIL = /^(trust|family|foundation|estate|holdings?|inc|ltd|limited|corp|corporation|co|llp|professional|farms?|ranch(es)?|enterprises|ventures|partners|properties|investments|group)\.?$/i;
const NAME_PARTICLE = /^(van|von|der|den|de|del|della|di|du|da|la|le|los|st|saint|mac|mc|o'|ter|ten|bin|al)\.?$/i;

function surnameOf(client){
  const raw = String(client || "").trim();
  if (!raw) return "";
  const lastPerson = raw.split(/\s*(?:&|,| and )\s*/i).filter(Boolean).pop() || "";
  let words = lastPerson.trim().split(/\s+/)
    .map(w => w.replace(/[^A-Za-zÀ-ÿ'\-.]/g, ""))
    .filter(Boolean);
  while (words.length > 1 && NAME_TAIL.test(words[words.length - 1])) words.pop();
  if (!words.length) return "";
  /* pull any particles back in: Van Der Berg, St. Pierre, O'Neill */
  let i = words.length - 1;
  while (i > 0 && NAME_PARTICLE.test(words[i - 1])) i--;
  const name = words.slice(i).join(" ").replace(/\.$/, "");
  return name.length > 1 && !NAME_TAIL.test(name) ? name : "";
}

/** Suggestions for a piece, surname versions first when we have a name. */
function titleIdeas(kind, client){
  const out = [];
  const sn = surnameOf(client);
  if (sn){
    if (kind === "annual_review") out.push("The " + sn + " Review");
    else if (kind === "portfolio_review") out.push("The " + sn + " Portfolio Review");
    else if (kind === "plan_summary" || kind === "blank") out.push("The " + sn + " Plan");
  }
  return out.concat(TITLE_IDEAS[kind] || TITLE_IDEAS.plan_summary);
}

/* ── Block factory ────────────────────────────────────────────────────────
   Every block is a plain object: {id, type, ...fields}. Blocks are the only
   thing that ever gets rendered, so adding a type means touching exactly two
   places: this factory and render.js.
   ------------------------------------------------------------------------ */

let _seq = 0;
const uid = () => "b" + (Date.now().toString(36)) + (_seq++).toString(36);

const BLOCK_KINDS = [
  {type:"heading",   label:"Heading",        note:"section or sub-head"},
  {type:"paragraph", label:"Paragraph",      note:"body copy"},
  {type:"lead",      label:"Lead-in",        note:"larger opening line"},
  {type:"bullets",   label:"Bullet list",    note:"bullets, numbers, checks"},
  {type:"stats",     label:"Key numbers",    note:"2–4 stat cards"},
  {type:"facts",     label:"Fact rows",      note:"label → value"},
  {type:"table",     label:"Table",          note:"comparison grid"},
  {type:"callout",   label:"Callout",        note:"note / important / watch"},
  {type:"quote",     label:"Pull quote",     note:"one line, centred"},
  {type:"actions",   label:"Action plan",    note:"numbered next steps"},
  {type:"twocol",    label:"Two columns",    note:"side-by-side copy"},
  {type:"chart",     label:"Chart",          note:"bar, line, donut"},
  {type:"infographic",label:"Infographic",   note:"timeline, steps, pyramid"},
  {type:"image",     label:"Image",          note:"photo or screenshot"},
  {type:"rule",      label:"Divider rule",   note:"thin line"},
  {type:"space",     label:"Spacer",         note:"breathing room"},
  {type:"pagebreak", label:"Page break",     note:"start a new page"}
];

function newBlock(type){
  const b = {id:uid(), type};
  switch(type){
    case "heading":    Object.assign(b,{level:2, kicker:"", text:"Section heading"}); break;
    case "paragraph":  Object.assign(b,{text:"Write or paste the paragraph here."}); break;
    case "lead":       Object.assign(b,{text:"A short opening line that sets up the section."}); break;
    case "bullets":    Object.assign(b,{style:"bullet", items:["First point","Second point","Third point"]}); break;
    case "stats":      Object.assign(b,{cols:3, items:[
                          {num:"$1.2M", label:"Projected at 65", note:""},
                          {num:"2032",  label:"Target retirement", note:""},
                          {num:"92%",   label:"Plan success rate", note:""}]}); break;
    case "facts":      Object.assign(b,{items:[
                          {k:"Retirement date", v:"2032"},
                          {k:"Target income (today's dollars)", v:"$95,000"},
                          {k:"Registered assets", v:"$1,480,000"}]}); break;
    case "table":      Object.assign(b,{caption:"Illustrative — today's dollars, before tax",
                          headers:["Option","What it costs","What it gives you"],
                          rows:[["Option A","—","—"],["Option B","—","—"]],
                          totalRow:false}); break;
    case "callout":    Object.assign(b,{tone:"note", title:"Worth knowing", text:"The one thing to take away from this page."}); break;
    case "quote":      Object.assign(b,{text:"The plan is not the point — being able to change it is.", by:""}); break;
    case "actions":    Object.assign(b,{items:[
                          {t:"First action", d:"What happens and why.", who:"Us", when:"Next 30 days"},
                          {t:"Second action", d:"What happens and why.", who:"You", when:"Before year-end"}]}); break;
    case "twocol":     Object.assign(b,{aTitle:"What this does well", aText:"", bTitle:"What to watch", bText:""}); break;
    case "chart":      Object.assign(b,{chart:"bar", title:"", caption:"Illustrative",
                          labels:["Today","At 65","At 75"], series:[{name:"Assets", values:[1.2,2.1,1.7]}],
                          unit:"$M", size:"full"}); break;
    case "infographic":Object.assign(b,{graphic:"timeline", title:"", caption:"",
                          items:[{t:"2026",d:"Plan in place"},{t:"2032",d:"Retire"},{t:"2041",d:"RRIF minimums begin"}]}); break;
    case "image":      Object.assign(b,{src:"", caption:"", size:"full", frame:"line"}); break;
    case "rule":       break;
    case "space":      Object.assign(b,{h:18}); break;
    case "pagebreak":  break;
  }
  return b;
}

const blocks = (...defs) => defs.map(d => Object.assign(newBlock(d.type), d, {id:uid()}));

/* ── Templates ───────────────────────────────────────────────────────────── */

const TEMPLATES = {
  plan_summary:{
    title:"The Plan",
    subtitle:"A summary of where you stand today, what the plan projects, and what we do next.",
    kicker:"Financial plan summary",
    sections:[
      {title:"What we set out to do", blocks:blocks(
        {type:"lead", text:"You asked us to answer three questions: can you retire when you want to, will the money last, and what happens to what is left."},
        {type:"paragraph", text:"This summary pulls the full plan down to the parts that matter for the decisions in front of you. The detailed projections behind it are available any time you want to look under the hood."},
        {type:"bullets", style:"bullet", items:["Retire in 2032 without changing how you live","Keep enough set aside that a bad year does not force a decision","Leave the farm intact for the next generation"]}
      )},
      {title:"Where you stand today", blocks:blocks(
        {type:"stats", cols:3, items:[
          {num:"$2.4M", label:"Total net worth", note:"Including real estate"},
          {num:"$1.48M", label:"Investable assets", note:"Registered and non-registered"},
          {num:"$0", label:"Non-mortgage debt", note:""}]},
        {type:"facts", items:[
          {k:"Registered (RRSP / RRIF)", v:"$860,000"},
          {k:"TFSA", v:"$210,000"},
          {k:"Non-registered", v:"$410,000"},
          {k:"Corporate / holding company", v:"—"},
          {k:"Real estate (net of debt)", v:"$920,000"}]},
        {type:"paragraph", text:"Paste the balance-sheet commentary here."}
      )},
      {title:"What the plan projects", blocks:blocks(
        {type:"chart", chart:"bar", title:"Projected portfolio value", unit:"$M",
          labels:["2026","2032","2040","2050"], series:[{name:"Base case", values:[1.48,2.05,2.4,2.1]}],
          caption:"Illustrative only. Assumes a 5.0% average annual return and 2.1% inflation; actual results will differ."},
        {type:"paragraph", text:"Explain in plain language what the projection says — and what it does not."},
        {type:"callout", tone:"important", title:"The headline", text:"On these assumptions the plan supports your target income to age 95 with room to spare."}
      )},
      {title:"The planning topics we looked at", blocks:blocks(
        {type:"heading", level:3, text:"Topic one"},
        {type:"paragraph", text:""},
        {type:"heading", level:3, text:"Topic two"},
        {type:"paragraph", text:""}
      )},
      {title:"What we do next", blocks:blocks(
        {type:"actions", items:[
          {t:"Confirm the plan assumptions", d:"You review the income target and retirement date; tell us if either has moved.", who:"You", when:"Next 2 weeks"},
          {t:"Rebalance to the target mix", d:"We bring the portfolio back to the allocation the plan assumes.", who:"Us", when:"Next 30 days"},
          {t:"Update the estate documents", d:"Your lawyer refreshes the will and powers of attorney to match the plan.", who:"You + your lawyer", when:"Before year-end"}]},
        {type:"callout", tone:"note", title:"When we meet again", text:"We will review this plan together annually, and any time something changes."}
      )}
    ]
  },

  annual_review:{
    title:"The Long View",
    subtitle:"What changed this year, where the plan stands, and the decisions in front of us.",
    kicker:"Annual review",
    sections:[
      {title:"Today's agenda", blocks:blocks(
        {type:"bullets", style:"number", items:[
          "What changed for you this year",
          "How the portfolio behaved",
          "Where the plan stands now",
          "Decisions for the year ahead",
          "Anything on your mind"]}
      )},
      {title:"What changed this year", blocks:blocks(
        {type:"lead", text:"A short summary of the year in your words, not ours."},
        {type:"paragraph", text:""}
      )},
      {title:"How the portfolio behaved", blocks:blocks(
        {type:"stats", cols:3, items:[
          {num:"—", label:"Portfolio return", note:"Net of fees"},
          {num:"—", label:"Contributions", note:"This year"},
          {num:"—", label:"Withdrawals", note:"This year"}]},
        {type:"chart", chart:"donut", title:"Where you are invested", unit:"%",
          labels:["Canadian equity","U.S. equity","International","Fixed income","Cash"],
          series:[{name:"Allocation", values:[24,30,16,25,5]}],
          caption:"Illustrative allocation as at the review date."},
        {type:"paragraph", text:""}
      )},
      {title:"Where the plan stands", blocks:blocks(
        {type:"facts", items:[
          {k:"Plan success rate", v:"—"},
          {k:"Target retirement date", v:"—"},
          {k:"Target income", v:"—"},
          {k:"Change since last review", v:"—"}]},
        {type:"paragraph", text:""}
      )},
      {title:"Decisions for the year ahead", blocks:blocks(
        {type:"actions", items:[
          {t:"", d:"", who:"", when:""}]}
      )}
    ]
  },

  topic:{
    title:"A Closer Look",
    subtitle:"The situation, the options we considered, and what we recommend.",
    kicker:"Planning topic",
    sections:[
      {title:"The situation", blocks:blocks(
        {type:"lead", text:"State the question in one sentence, the way you would say it out loud."},
        {type:"paragraph", text:""},
        {type:"facts", items:[{k:"", v:""}]}
      )},
      {title:"What is at stake", blocks:blocks(
        {type:"stats", cols:3, items:[
          {num:"—", label:"", note:""},
          {num:"—", label:"", note:""},
          {num:"—", label:"", note:""}]},
        {type:"paragraph", text:""}
      )},
      {title:"The options we considered", blocks:blocks(
        {type:"table", caption:"Illustrative — figures rounded, before tax",
          headers:["Option","What it does","Cost / trade-off","Flexibility"],
          rows:[["Option A","","",""],["Option B","","",""],["Option C","","",""]]},
        {type:"twocol", aTitle:"What this does well", aText:"", bTitle:"What to watch", bText:""}
      )},
      {title:"What we recommend", blocks:blocks(
        {type:"callout", tone:"important", title:"Our recommendation", text:""},
        {type:"paragraph", text:""},
        {type:"actions", items:[{t:"", d:"", who:"", when:""}]}
      )},
      {title:"What could change this", blocks:blocks(
        {type:"bullets", style:"bullet", items:["","",""]},
        {type:"callout", tone:"watch", title:"Before you act", text:"Confirm the numbers with your accountant — tax rules change and the figures here are illustrative."}
      )}
    ]
  },

  proposal:{
    title:"Working Together",
    subtitle:"What we heard, what we would do, and how we work.",
    kicker:"Proposal",
    sections:[
      {title:"What we heard", blocks:blocks(
        {type:"lead", text:"Your words, played back — so you know we were listening."},
        {type:"bullets", style:"bullet", items:["","",""]},
        {type:"quote", text:"", by:""}
      )},
      {title:"What we would do first", blocks:blocks(
        {type:"actions", items:[
          {t:"Get the full picture", d:"", who:"Us", when:"Weeks 1–2"},
          {t:"Build the plan", d:"", who:"Us", when:"Weeks 3–4"},
          {t:"Put it to work", d:"", who:"Together", when:"Week 5"}]}
      )},
      {title:"How we work", blocks:blocks(
        {type:"infographic", graphic:"steps", title:"Our process",
          items:[{t:"Discover",d:"Understand the whole picture"},{t:"Plan",d:"Model the options"},
                 {t:"Implement",d:"Put the plan to work"},{t:"Review",d:"Adjust as life changes"}]},
        {type:"paragraph", text:""}
      )},
      {title:"The team behind the plan", blocks:blocks(
        {type:"paragraph", text:"You are not hiring one advisor — you are hiring a team, with a dedicated service group behind it."},
        {type:"stats", cols:3, items:[
          {num:"$1B+", label:"Assets under care", note:"*as at Nov 2023"},
          {num:"4", label:"Senior advisors", note:"All CFP®"},
          {num:"25+", label:"Years serving families", note:"In Medicine Hat"}]}
      )},
      {title:"What happens next", blocks:blocks(
        {type:"actions", items:[{t:"", d:"", who:"", when:""}]}
      )}
    ]
  },

  portfolio_review:{
    title:"Your Portfolio Review",
    subtitle:"How the money is invested, how it behaved, what we changed, and what it means for the plan.",
    kicker:"Portfolio review",
    sections:[
      {title:"What this review covers", blocks:blocks(
        {type:"bullets", style:"number", items:[
          "How your money is invested today",
          "How the portfolio behaved over the period",
          "What we changed, and why",
          "How this fits the plan",
          "What we recommend from here"]},
        {type:"callout", tone:"note", title:"How to read this",
         text:"Returns are shown net of fees for the period stated. Past performance does not tell you what comes next — it tells you whether the portfolio behaved the way it was built to."}
      )},
      {title:"How your money is invested", blocks:blocks(
        {type:"chart", chart:"donut", title:"Asset allocation", unit:"%",
          labels:["Canadian equity","U.S. equity","International equity","Fixed income","Cash"],
          series:[{name:"Allocation", values:[22,31,17,25,5]}],
          caption:"Allocation as at the review date."},
        {type:"facts", items:[
          {k:"Total invested assets", v:"—"},
          {k:"Registered (RRSP / RRIF / LIRA)", v:"—"},
          {k:"TFSA", v:"—"},
          {k:"Non-registered", v:"—"},
          {k:"Corporate", v:"—"}]},
        {type:"paragraph", text:"Explain in plain language what the mix is doing and why it looks the way it does."}
      )},
      {title:"How the portfolio behaved", blocks:blocks(
        {type:"stats", cols:3, items:[
          {num:"—", label:"Return this period", note:"Net of fees"},
          {num:"—", label:"Contributions", note:"This period"},
          {num:"—", label:"Withdrawals", note:"This period"}]},
        {type:"chart", chart:"bar", title:"Calendar-year returns", unit:"%",
          labels:["2023","2024","2025","2026 YTD"],
          series:[{name:"Portfolio", values:[8.1,11.4,-2.6,5.3]}],
          caption:"Net of fees. Past performance is not indicative of future results."},
        {type:"paragraph", text:"State factually what happened and what drove it. No forecasts."},
        {type:"callout", tone:"note", title:"What this does and does not tell us",
         text:"One period is a data point, not a verdict. What matters is whether the portfolio behaved the way its design says it should in the conditions we actually had."}
      )},
      {title:"What we changed, and why", blocks:blocks(
        {type:"table", caption:"Changes made during the period",
          headers:["When","What we did","Why"],
          rows:[["—","—","—"],["—","—","—"]],
          totalRow:false},
        {type:"paragraph", text:"One short paragraph on the thinking behind the changes as a group."}
      )},
      {title:"How this fits your plan", blocks:blocks(
        {type:"facts", items:[
          {k:"Target mix (from the plan)", v:"—"},
          {k:"Actual mix today", v:"—"},
          {k:"Drift since last review", v:"—"},
          {k:"Cash held for near-term spending", v:"—"}]},
        {type:"twocol", aTitle:"What is working", aText:"",
          bTitle:"What we are watching", bText:""},
        {type:"callout", tone:"important", title:"The headline",
         text:"One sentence: is the portfolio still the right vehicle for the plan?"}
      )},
      {title:"What we recommend", blocks:blocks(
        {type:"callout", tone:"important", title:"Our recommendation", text:""},
        {type:"actions", items:[
          {t:"", d:"", who:"", when:""}]}
      )}
    ]
  },

  blank:{ title:"", subtitle:"", kicker:"", sections:[{title:"Section one", blocks:blocks({type:"paragraph", text:""})}] }
};

;
