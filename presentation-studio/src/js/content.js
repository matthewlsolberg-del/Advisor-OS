/* ==========================================================================
   content.js — MHWG's ready-written wording.

   1. PROSPECT MEETING — the template for a first meeting with a prospect:
      what we heard, their situation, what we recommend, what happens next.
   2. PLANNING TOPICS — sections you add from Edit → "+ Add" (RRIF
      conversion, CPP and OAS timing, TFSA or RRSP, RESP, life insurance,
      corporate-owned life insurance …). Each is written
      in plain language with yellow [[blanks]] for what only you know.

   To change the wording, edit the text here; to add a topic, copy one entry
   in PLANNING_TOPICS and change it. Rules for anything written here:
   - General education only, no "you should". Every figure about the client
     is a [[blank]]; never put a client number in this file.
   - Government amounts that change every year (TFSA limit, OAS clawback
     threshold, CPP maximums) are left out or written as [[blanks]], so the
     wording never goes stale. Amounts below are ones fixed in law.
   - A block with `slot` is one Copilot writes from your notes (Copilot tab).
     `slotHint` tells Copilot what goes there.
   ========================================================================== */

/* ── 1. Prospect meeting ─────────────────────────────────────────────────── */

/* "How we work with you": the six steps from the team website's What We Do
   page (step names as on the site; the one-line descriptions are ours). */
function HOW_WE_WORK_BLOCKS(){ return [
  {type: "lead", text: "Working with us follows six clear steps, so you always know what comes next."},
  {type: "actions", items: [
    {t: "Initial Discovery", d: "We get to know you: your goals, your family, what worries you, and what you have today.", who: "", when: ""},
    {t: "Personal Wealth Strategy Meeting", d: "We present a strategy built around you: your plan, your investor profile and our recommendations.", who: "", when: ""},
    {t: "Welcome to TD Wealth Private Investment Advice", d: "We open your accounts, move your assets over and look after the paperwork.", who: "", when: ""},
    {t: "Meet your Team", d: "You meet the people who look after you day to day, so you always know who to call.", who: "", when: ""},
    {t: "Ongoing Proactive Service", d: "We watch your portfolio and your plan, and reach out when something needs attention.", who: "", when: ""},
    {t: "Regular Review Meetings", d: "We meet regularly to review progress, update your plan and adjust as life changes.", who: "", when: ""}]},
  {type: "facts", items: [
    {k: "Meetings", v: "[[How often we meet, and how]]"},
    {k: "Reporting", v: "[[The statements and reports you receive]]"}]},
  {type: "paragraph", text: "You are not hiring one advisor. You are hiring a team, with a dedicated client service group behind it, so there is always someone who knows your file."}
]; }
/* "How we can help": the services listed on the team website. */
function HOW_WE_HELP_BLOCKS(){ return [
  {type: "lead", text: "A comprehensive approach that reaches beyond investment advice. We coordinate every part of your financial life, and bring in TD specialists where they add value."},
  {type: "bullets", style: "check", items: [
    "**Investment management:** portfolios built around your investor profile, monitored and rebalanced.",
    "**Retirement planning:** when you can retire, and a tax-efficient income that lasts.",
    "**Tax strategies:** using every account and credit available to you, in the right order.",
    "**Business succession:** planning the sale or transfer of your business, and life after it.",
    "**Private banking:** banking, lending and credit arranged alongside your investments.",
    "**Estate and trust:** wills, trusts and executor support, with TD Wealth Private Trust.",
    "**Asset protection:** insurance and structures that protect what you have built.",
    "**Philanthropic planning:** giving to the causes you care about, tax-efficiently."]}
]; }

TEMPLATES.prospect = {
  title: "Working Together",
  subtitle: "What we heard, where you stand today, what we would recommend, and what happens next.",
  kicker: "Our first conversation",
  sections: [
    {title: "Thank you for meeting with us", blocks: blocks(
      {type: "lead", text: "Thank you for taking the time to meet with us. This summary plays back what we heard, sets out where you stand today, and explains what we would recommend and how we would get started."},
      {type: "paragraph", slot: "prospect_intro", slotHint: "one or two sentences: how we met and what prompted the conversation",
        text: "[[How we met, and what prompted the conversation]]"}
    )},
    {title: "What we heard", blocks: blocks(
      {type: "lead", text: "Your words, played back, so you know we were listening."},
      {type: "bullets", style: "bullet", slot: "prospect_heard", slotHint: "3 to 5 bullets: their priorities, worries and questions, in their own words where possible",
        items: ["[[What matters most to you]]", "[[A worry or question you raised]]", "[[Something you want to be sure of]]"]},
      {type: "quote", text: "[[A line in your own words, from the meeting]]", by: ""}
    )},
    {title: "Your situation today", blocks: blocks(
      {type: "lead", slot: "prospect_situation", slotHint: "one or two sentences on where they are in life: family, work, and the next big change",
        text: "[[Where you are in life: family, work, and the next big change]]"},
      {type: "facts", items: [
        {k: "Family", v: "[[Ages, children, anyone you support]]"},
        {k: "Work", v: "[[Occupation, employer or business]]"},
        {k: "Planned retirement", v: "[[Age or year]]"},
        {k: "Household income", v: "[[Approximate]]"},
        {k: "Investments", v: "[[Approximate total, and where it is held]]"},
        {k: "Pensions", v: "[[Workplace pension, if any]]"},
        {k: "Debt", v: "[[Mortgage and other loans]]"}]},
      {type: "twocol", aTitle: "What is working well", aText: "[[What you have already done right]]",
        bTitle: "What we would look at more closely", bText: "[[Gaps, risks or questions to answer]]"}
    )},
    {title: "What matters most to you", blocks: blocks(
      {type: "bullets", style: "number", slot: "prospect_goals", slotHint: "their goals, each with a when and a rough amount if they gave one",
        items: ["[[Goal, and when]]", "[[Goal, and when]]", "[[Goal, and when]]"]},
      {type: "callout", tone: "note", title: "How we use this",
        text: "We plan around your goals, not around products. Every recommendation that follows ties back to one of these."}
    )},
    {title: "What we would recommend", blocks: blocks(
      {type: "lead", text: "Based on what you have shared so far, here is where we would start."},
      {type: "bullets", style: "number", slot: "prospect_recommend", slotHint: "3 to 5 first recommendations, each with one line on why it matters for them",
        items: ["[[Recommendation, and why it matters for you]]", "[[Recommendation, and why it matters for you]]", "[[Recommendation, and why it matters for you]]"]},
      {type: "callout", tone: "note", title: "A first view",
        text: "These recommendations come from our first conversation. We confirm them once we have your full information and have completed your financial plan."}
    )},
    {title: "How we would invest", blocks: blocks(
      {type: "paragraph", text: "We start by agreeing on your investor profile: a mix of growth and stability that suits your goals, your time horizon and your comfort with ups and downs. Each account is then invested in a portfolio suited to its purpose and its tax treatment, and the household as a whole is kept within the range your profile allows."},
      {type: "infographic", graphic: "steps", title: "From profile to portfolio",
        items: [{t: "Profile", d: "Agree on the mix that fits you"}, {t: "Portfolio", d: "Match each account to a model portfolio"},
                {t: "Monitor", d: "Watch the mix and rebalance"}, {t: "Review", d: "Meet regularly and adjust"}]},
      {type: "paragraph", slot: "prospect_invest", slotHint: "anything specific about how we would invest for them; leave as a blank if the notes say nothing",
        text: "[[Anything specific about how we would invest for you]]"}
    )},
    {title: "Planning beyond the investments", blocks: blocks(
      {type: "lead", text: "Your investments are one piece. We look at the whole picture so the pieces work together."},
      {type: "bullets", style: "bullet", items: [
        "**Retirement income:** when you can retire, and how to draw income in a tax-efficient order.",
        "**Tax:** using RRSPs, TFSAs and your other accounts in the order that keeps more in your hands.",
        "**Family:** education savings, helping children get started, and caring for parents.",
        "**Protection:** insurance sized to what your family would actually need.",
        "**Estate:** wills, powers of attorney and beneficiaries kept up to date and working together."]}
    )},
    {title: "What happens next", blocks: blocks(
      {type: "actions", items: [
        {t: "Send us your documents", d: "Your recent statements and the items on the list that follows.", who: "You", when: "[[By when]]"},
        {t: "We build your plan", d: "We put together your financial plan and our investment recommendation.", who: "Us", when: "[[By when]]"},
        {t: "Review it together", d: "We walk through the plan and answer your questions. Nothing moves until you are comfortable.", who: "Together", when: "[[Meeting date]]"},
        {t: "Open accounts and transfer", d: "We open the accounts and handle the transfers from your current institutions.", who: "Us", when: "Once you approve"}]}
    )},
    {title: "What to bring", blocks: blocks(
      {type: "lead", text: "The more complete the picture, the better the plan. Bring what you have; we can help find the rest."},
      {type: "bullets", style: "bullet", items: [
        "Recent statements for every investment account, at every institution",
        "Workplace pension statements, and any pension option or commuted-value letters",
        "Your last two Notices of Assessment from the Canada Revenue Agency",
        "Life, disability and critical illness insurance policies, and group benefits booklets",
        "Mortgage and loan balances, rates and renewal dates",
        "Your wills, powers of attorney and personal directives, if you have them",
        "Corporate financial statements, if you own a business"]}
    )},
    {title: "How we work with you", blocks: blocks(...HOW_WE_WORK_BLOCKS())}
  ]
};
TITLE_IDEAS.prospect = ["Working Together", "Our First Conversation", "Where We Would Start", "What We Heard"];
SMART_KINDS.unshift({kind: "prospect", name: "Prospect meeting", note: "What we heard, their situation, what we recommend, what happens next", uses: []});

/* ── 2. Planning topics (Edit → + Add) ───────────────────────────────────── */

/** A copy of one prospect-meeting section, found by its title. */
function prospectSection(title){
  const src = TEMPLATES.prospect.sections.find(x => x.title === title);
  return {title, blocks: blocks(...src.blocks.map(b => structuredClone(b)))};
}

/* [id, name in the list, group, () => {title, blocks}]. app.js adds these to
   the "+ Add" list (SECTION_PRESETS), shown under their group. */
const PLANNING_TOPICS = [
  ["t_situation", "Your situation today", "Prospect meeting", () => prospectSection("Your situation today")],
  ["t_recommend", "What we would recommend", "Prospect meeting", () => prospectSection("What we would recommend")],
  ["t_bring", "What to bring", "Prospect meeting", () => prospectSection("What to bring")],
  ["t_beyond", "Planning beyond the investments", "Prospect meeting", () => prospectSection("Planning beyond the investments")],

  ["t_howwework", "How we work with you (six steps)", "About us", () => ({title: "How we work with you", blocks: blocks(...HOW_WE_WORK_BLOCKS())})],
  ["t_howwehelp", "How we can help", "About us", () => ({title: "How we can help", blocks: blocks(...HOW_WE_HELP_BLOCKS())})],

  ["t_rrif", "RRSP to RRIF", "Retirement", () => ({title: "Turning your RRSP into income", blocks: blocks(
    {type: "lead", text: "An RRSP has to become a source of income by the end of the year you turn 71. Most people convert it to a RRIF, and the timing and order of withdrawals can make a real difference to the tax you pay."},
    {type: "bullets", style: "bullet", items: [
      "A RRIF keeps your money invested, tax-deferred, while it pays you an income.",
      "A minimum amount must come out each year from the year after you open it. The minimum is a percentage of the balance that rises with age, and it can be based on a younger spouse's age to keep it lower.",
      "Withdrawals are taxed as income. Tax is withheld only on amounts above the minimum.",
      "From age 65, RRIF income qualifies for the pension income credit and can be split with a spouse.",
      "Converting earlier than 71, or drawing a little each year before then, can smooth your taxable income over retirement."]},
    {type: "paragraph", slot: "t_rrif_you", slotHint: "what this means for this client: when to convert, and why", text: "[[What this means for you: when to convert, and why]]"}
  )})],
  ["t_cppoas", "CPP and OAS timing", "Retirement", () => ({title: "When to start CPP and OAS", blocks: blocks(
    {type: "lead", text: "You choose when your government pensions start, and the choice is permanent. Starting later means a larger cheque for life."},
    {type: "table", caption: "Set in law; your own amounts come from your Service Canada statement", headers: ["", "Earliest", "Standard", "Latest", "Effect of waiting"],
      rows: [["Canada Pension Plan", "60", "65", "70", "0.6% less a month before 65; 0.7% more a month after 65"],
             ["Old Age Security", "65", "65", "70", "0.6% more a month for each month you wait past 65"]]},
    {type: "bullets", style: "bullet", items: [
      "Waiting suits people in good health who can live on other savings for a few years.",
      "Starting earlier can make sense when health, cash flow or a shorter outlook point that way.",
      "OAS is reduced when income passes a threshold set each year, so the rest of your retirement income affects how much of it you keep.",
      "OAS rises by 10% at age 75."]},
    {type: "paragraph", slot: "t_cppoas_you", slotHint: "what we suggest for this client and why", text: "[[What we suggest for you, and why]]"}
  )})],
  ["t_pension", "Pension options", "Retirement", () => ({title: "Your pension options", blocks: blocks(
    {type: "lead", text: "Leaving an employer often means choosing between keeping a pension for life or taking its value as a lump sum. Each has real strengths."},
    {type: "twocol", aTitle: "Keeping the pension", aText: "A guaranteed income for life, with survivor and indexing options set by the plan. Nothing to manage, and no risk of outliving it.",
      bTitle: "Taking the commuted value", bText: "The value moves into a locked-in account (LIRA) you control and can leave to your family. Any amount above the tax-free transfer limit is paid as taxable cash."},
    {type: "bullets", style: "bullet", items: ["Your health and family history", "What your spouse would need if you died first", "How strong the pension plan is", "How much other guaranteed income you have", "How you feel about managing investments"]},
    {type: "paragraph", slot: "t_pension_you", slotHint: "what we suggest for this client and why", text: "[[What we suggest for you, and why]]"}
  )})],
  ["t_income", "Retirement income plan", "Retirement", () => ({title: "Your retirement income plan", blocks: blocks(
    {type: "lead", text: "Retirement income comes from several places. The order you draw from them decides how much tax you pay and how long the money lasts."},
    {type: "facts", items: [{k: "Government pensions", v: "[[CPP and OAS, and when they start]]"}, {k: "Workplace pension", v: "[[Amount, if any]]"},
      {k: "RRSP / RRIF", v: "[[Planned withdrawals]]"}, {k: "TFSA", v: "[[Role: flexible, tax-free top-up]]"}, {k: "Non-registered", v: "[[Planned withdrawals]]"}]},
    {type: "bullets", style: "bullet", items: [
      "Fill lower tax brackets early in retirement, before government pensions and RRIF minimums begin.",
      "Keep the TFSA for flexibility: large one-time costs and later years.",
      "Split eligible pension income with a spouse to even out your tax.",
      "Keep a cash reserve so a market dip never forces a sale at the wrong time."]},
    {type: "paragraph", slot: "t_income_you", slotHint: "the order we recommend for this client", text: "[[The order we recommend for you]]"}
  )})],

  ["t_tfsarrsp", "TFSA or RRSP", "Saving & tax", () => ({title: "TFSA or RRSP?", blocks: blocks(
    {type: "lead", text: "Both grow tax-free while invested. The difference is when you pay the tax, and that depends on your tax rate today compared with in retirement."},
    {type: "table", caption: "How the two accounts compare", headers: ["", "RRSP", "TFSA"],
      rows: [["Going in", "Deductible: lowers your tax this year", "No deduction"],
             ["Coming out", "Taxed as income", "Tax-free"],
             ["Room", "18% of last year's earned income, to an annual maximum", "A set amount each year; unused room carries forward"],
             ["Withdraw and re-contribute", "Room is not returned", "Room comes back the next January"],
             ["Effect on OAS and benefits", "Withdrawals count as income", "Withdrawals do not"]]},
    {type: "callout", tone: "note", title: "The rule of thumb", text: "Higher income today than you expect in retirement: the RRSP usually wins. Lower income today, or a need for flexibility: the TFSA usually wins. Many people use both."},
    {type: "paragraph", slot: "t_tfsarrsp_you", slotHint: "what we suggest for this client and why", text: "[[What we suggest for you, and why]]"}
  )})],
  ["t_spousal", "Spousal RRSP and income splitting", "Saving & tax", () => ({title: "Evening out your incomes", blocks: blocks(
    {type: "lead", text: "Two moderate incomes pay less tax than one high income and one low one. Planning ahead can even out what each of you draws in retirement."},
    {type: "bullets", style: "bullet", items: [
      "**Spousal RRSP:** the higher earner contributes and takes the deduction; the money is later withdrawn and taxed in the spouse's hands. Withdrawals within three calendar years of a contribution are taxed back to the contributor.",
      "**Pension income splitting:** up to half of eligible pension income can be shared with a spouse on your tax returns.",
      "**CPP sharing:** spouses can share their CPP retirement pensions.",
      "**TFSAs:** you can give a spouse money to fund their own TFSA."]},
    {type: "paragraph", slot: "t_spousal_you", slotHint: "how this applies to this couple", text: "[[How this applies to you]]"}
  )})],
  ["t_taxloss", "Tax-loss selling", "Saving & tax", () => ({title: "Tax-loss selling", blocks: blocks(
    {type: "lead", text: "Selling an investment at a loss in a non-registered account can offset capital gains, while staying invested."},
    {type: "bullets", style: "bullet", items: [
      "Capital losses offset capital gains this year, can be carried back three years, or carried forward with no time limit.",
      "The superficial loss rule denies the loss if you, your spouse, or an account you control (including an RRSP or TFSA) buys the same investment within 30 days before or after the sale.",
      "We can buy a similar, but not identical, investment so the money stays at work.",
      "For the loss to count this year, the trade must settle by the last business day of December."]},
    {type: "paragraph", slot: "t_taxloss_you", slotHint: "what we propose for this client", text: "[[What we propose for you]]"}
  )})],
  ["t_debt", "Paying down debt or investing", "Saving & tax", () => ({title: "Pay down debt, or invest?", blocks: blocks(
    {type: "lead", text: "Paying off debt earns a guaranteed return equal to its interest rate. Investing may earn more, but with no guarantee."},
    {type: "twocol", aTitle: "Pay down debt when", aText: "The rate is high, the debt is not tax-deductible, or being debt-free matters to you more than the last dollar of return.",
      bTitle: "Invest when", bText: "The rate is low, you can use RRSP or TFSA room, or there is an employer match or government grant on the table."},
    {type: "paragraph", slot: "t_debt_you", slotHint: "what we suggest for this client", text: "[[What we suggest for you]]"}
  )})],
  ["t_corp", "Investing inside a corporation", "Saving & tax", () => ({title: "Investing inside your corporation", blocks: blocks(
    {type: "lead", text: "Leaving profits in your company to invest can defer personal tax, but corporate investment income has its own rules."},
    {type: "bullets", style: "bullet", items: [
      "Passive investment income above $50,000 a year starts to reduce the small business deduction on active business income.",
      "Capital gains and Canadian dividends are taxed more lightly than interest inside a company, so what you hold matters.",
      "The capital dividend account lets the tax-free half of capital gains come out to you tax-free.",
      "How and when you pay yourself, salary or dividends, affects RRSP room, CPP and your overall tax."]},
    {type: "paragraph", slot: "t_corp_you", slotHint: "what this means for this client's company", text: "[[What this means for your company]]"}
  )})],

  ["t_resp", "RESP and grants", "Family", () => ({title: "Saving for education", blocks: blocks(
    {type: "lead", text: "An RESP is the most effective way to save for a child's education, because the government adds to what you put in."},
    {type: "stats", cols: 3, items: [{num: "20%", label: "Canada Education Savings Grant", note: "On the first $2,500 a year"},
      {num: "$500", label: "Grant a year", note: "Up to $1,000 with catch-up room"}, {num: "$7,200", label: "Lifetime grant", note: "Per child"}]},
    {type: "bullets", style: "bullet", items: [
      "Growth is tax-sheltered. When the money comes out for school, the grant and growth are taxed in the student's hands, usually at little or no tax.",
      "Unused grant room carries forward, so it is not too late to catch up.",
      "Families with lower incomes may also qualify for the Canada Learning Bond.",
      "Lifetime contributions are capped at $50,000 per child."]},
    {type: "paragraph", slot: "t_resp_you", slotHint: "what we suggest for this family's children", text: "[[What we suggest for your children]]"}
  )})],
  ["t_fhsa", "First home savings (FHSA)", "Family", () => ({title: "Saving for a first home", blocks: blocks(
    {type: "lead", text: "The First Home Savings Account combines the best of an RRSP and a TFSA for first-time buyers."},
    {type: "bullets", style: "bullet", items: [
      "Contributions are deductible, like an RRSP: up to $8,000 a year and $40,000 in total.",
      "Withdrawals for a qualifying first home are tax-free, like a TFSA.",
      "Up to $8,000 of unused room carries forward to the next year.",
      "If the home never happens, the money can move to an RRSP without using RRSP room.",
      "The account can stay open for up to 15 years."]},
    {type: "paragraph", slot: "t_fhsa_you", slotHint: "how this could work for this client or their children", text: "[[How this could work for you or your children]]"}
  )})],

  ["t_estate", "Wills, powers of attorney and beneficiaries", "Estate & protection", () => ({title: "Your estate plan", blocks: blocks(
    {type: "lead", text: "A good estate plan makes sure the right people receive what you leave, with as little tax, delay and cost as possible."},
    {type: "bullets", style: "bullet", items: [
      "**Will:** names your executor and says who receives what. Review it after any marriage, separation, birth or move.",
      "**Enduring power of attorney:** someone you trust to handle your finances if you cannot.",
      "**Personal directive:** your wishes for health and personal care, and who speaks for you.",
      "**Beneficiaries:** RRSPs, RRIFs, TFSAs and insurance can name beneficiaries directly, and a spouse can be a TFSA successor holder. This keeps them out of the estate and can save time and fees.",
      "**Joint ownership:** can simplify things, but has tax and family risks worth talking through."]},
    {type: "facts", items: [{k: "Wills", v: "[[Date last updated]]"}, {k: "Powers of attorney", v: "[[In place?]]"}, {k: "Beneficiaries", v: "[[Checked on every account?]]"}]},
    {type: "paragraph", slot: "t_estate_you", slotHint: "what this client should look at next", text: "[[What to look at next]]"}
  )})],
  ["t_insurance", "Insurance needs", "Estate & protection", () => ({title: "Protecting your family", blocks: blocks(
    {type: "lead", text: "Insurance replaces what your family would lose if something happened to you. The right amount comes from your plan, not a rule of thumb."},
    {type: "table", caption: "What each kind of insurance is for", headers: ["Coverage", "What it protects"],
      rows: [["Life", "Income, debts and goals your family would need covered"], ["Disability", "Your income if you cannot work"],
             ["Critical illness", "A lump sum to cover costs during a serious illness"], ["Long-term care", "The cost of care later in life"]]},
    {type: "facts", items: [{k: "Coverage today", v: "[[What you have now]]"}, {k: "What the plan shows", v: "[[What would be needed]]"}]},
    {type: "paragraph", slot: "t_insurance_you", slotHint: "what we suggest for this client", text: "[[What we suggest for you]]"}
  )})],

  ["t_life", "Life insurance: how much, and what kind", "Life insurance", () => ({title: "Life insurance", blocks: blocks(
    {type: "lead", text: "Life insurance makes sure the people who depend on you can carry on with the plan if you are not there. How much you need, and for how long, comes from your plan."},
    {type: "bullets", style: "bullet", items: [
      "**Debts:** the mortgage and any loans, so the family keeps the home.",
      "**Income:** replacing the income your family would lose, for as long as they would need it.",
      "**Goals:** education for the children and the retirement your spouse was counting on.",
      "**Final costs and taxes:** funeral costs, and the tax due on death on RRSPs, RRIFs and investments that have grown.",
      "**Legacy:** what you want to leave to family or to charity."]},
    {type: "table", caption: "The main kinds of life insurance", headers: ["", "Term", "Permanent (whole life or universal life)"],
      rows: [["How long it lasts", "A set period, such as 10 or 20 years, often renewable", "For life, as long as the policy is kept in force"],
             ["Cost", "Lower to start; rises at renewal", "Higher, but can be set to stay level"],
             ["Cash value", "None", "Builds a cash value that grows tax-sheltered within limits"],
             ["Best suited to", "Needs that end: the mortgage, the working years, the children at home", "Needs that last: tax on death, estate equalization, legacy"]]},
    {type: "facts", items: [{k: "Coverage today", v: "[[Personal and group coverage you have now]]"}, {k: "What the plan shows", v: "[[Coverage needed, and for how long]]"},
      {k: "Gap", v: "[[Difference]]"}]},
    {type: "callout", tone: "note", title: "Group coverage", text: "Coverage through work usually ends when you leave the job, and is often a multiple of salary rather than what the family would actually need."},
    {type: "paragraph", slot: "t_life_you", slotHint: "what we suggest for this client's life insurance and why", text: "[[What we suggest for you, and why]]"}
  )})],
  ["t_life_estate", "Life insurance in your estate plan", "Life insurance", () => ({title: "Life insurance and your estate", blocks: blocks(
    {type: "lead", text: "Life insurance can do things in an estate plan that savings cannot: it pays out in cash, at the moment it is needed, tax-free to the people you name."},
    {type: "bullets", style: "bullet", items: [
      "**Paying the tax on death:** on death, RRSPs and RRIFs are generally taxed as income and investments as if sold, unless they pass to a spouse. A policy can cover that bill so assets do not have to be sold.",
      "**Straight to your beneficiaries:** a death benefit paid to a named beneficiary goes directly to them, outside the estate, without waiting for probate.",
      "**Equalizing an estate:** when a cottage, farm or business goes to one child, insurance can leave an equal share to the others.",
      "**Joint last-to-die:** one policy on a couple that pays on the second death, when the estate's tax is usually due.",
      "**Giving to charity:** a policy can fund a larger gift than you could make from savings, with tax receipts for the estate or along the way."]},
    {type: "paragraph", slot: "t_life_estate_you", slotHint: "how this applies to this client's estate", text: "[[How this applies to your estate]]"}
  )})],
  ["t_corp_life", "Corporate-owned life insurance", "Life insurance", () => ({title: "Life insurance owned by your corporation", blocks: blocks(
    {type: "lead", text: "If you own a business, the company can own and pay for life insurance. Because premiums are paid with corporate dollars, which are often taxed at a lower rate than personal income, this can be an efficient way to pay for coverage you need anyway."},
    {type: "bullets", style: "bullet", items: [
      "**The capital dividend account:** when the company receives a death benefit, the amount above the policy's adjusted cost basis is added to its capital dividend account. That amount can then be paid out to the shareholders or the estate as a tax-free capital dividend.",
      "**Tax on the shares at death:** a death benefit can give the company the cash to deal with the tax on your shares, without selling the business or its assets.",
      "**Buy-sell agreements:** insurance on each owner funds the purchase of a partner's shares, so the surviving owners keep the business and the family is paid fairly.",
      "**Key person coverage:** protects the company if the loss of an owner or key employee would hurt the business.",
      "**Surplus earnings:** the cash value of an exempt permanent policy grows tax-sheltered inside the company, and that growth does not count as passive investment income for the small business deduction."]},
    {type: "callout", tone: "note", title: "Premiums", text: "Premiums for a corporate-owned policy are generally not tax-deductible. Who owns the policy, who pays, and who is named as beneficiary all matter for tax, and are set with your accountant."},
    {type: "facts", items: [{k: "Corporation", v: "[[Name and what it holds]]"}, {k: "Coverage in the company today", v: "[[Policies, if any]]"},
      {k: "Shareholders", v: "[[Who owns the shares]]"}, {k: "Agreements", v: "[[Buy-sell or shareholder agreement in place?]]"}]},
    {type: "paragraph", slot: "t_corp_life_you", slotHint: "how corporate-owned insurance could fit this client's company", text: "[[How this could fit your company]]"}
  )})],
  ["t_life_strategies", "Insured retirement and estate strategies", "Life insurance", () => ({title: "Insured retirement and estate strategies", blocks: blocks(
    {type: "lead", text: "For business owners and families with more than they will spend, permanent life insurance can serve the estate and, in some cases, retirement as well."},
    {type: "table", caption: "Illustrative strategies; every one depends on health, age, tax and the company's structure", headers: ["Strategy", "How it works", "What to weigh"],
      rows: [["Corporate estate transfer", "Surplus money the company does not need is moved, over time, from taxable investments into an exempt permanent policy. At death, the benefit flows through the capital dividend account.", "Money moved into the policy is less flexible than investments. Suits money meant for the next generation."],
             ["Insured retirement program", "The policy's cash value builds up. In retirement, a lender may lend against it, and the loan is repaid from the death benefit.", "Loans are at the lender's discretion and interest rates can change. Policy values are not guaranteed to grow as illustrated. Tax rules can change."],
             ["Shareholder-owned, company-paid", "The owner holds the policy and the company pays the premiums.", "Usually a taxable benefit to the shareholder; ownership is decided with your accountant."]]},
    {type: "callout", tone: "note", title: "How we would approach it", text: "We start from your plan: what the company and family need, and what is surplus. We then work with [[the insurance specialist we work with]] and your accountant before anything is put in place."},
    {type: "paragraph", slot: "t_life_strategies_you", slotHint: "which strategy might suit this client and what we would look at next", text: "[[Which strategy might suit you, and what we would look at next]]"}
  )})],

  ["t_market", "Market update", "Markets & fees", () => ({title: "The markets this period", blocks: blocks(
    {type: "lead", slot: "t_market_lead", slotHint: "one sentence on how markets behaved this period, from the notes only", text: "[[The period in one sentence]]"},
    {type: "bullets", style: "bullet", slot: "t_market_points", slotHint: "3 to 4 points on what drove markets, from the notes or the firm's commentary only",
      items: ["[[What moved markets]]", "[[Interest rates and inflation]]", "[[Canada and the rest of the world]]"]},
    {type: "callout", tone: "note", title: "What it means for you", text: "[[What it means for your portfolio and plan]]"},
    {type: "paragraph", text: "Markets move up and down in the short term. Your portfolio is built for your goals and time horizon, so we change it when your life changes, not because of the headlines."}
  )})],
  ["t_fees", "Fees and how we are paid", "Markets & fees", () => ({title: "What you pay, and what you receive", blocks: blocks(
    {type: "lead", text: "You will always know what you pay and what you receive for it. Here it is in plain language."},
    {type: "facts", items: [{k: "How we are paid", v: "[[Fee arrangement, as in the account agreement]]"}, {k: "What it costs", v: "[[Fee schedule as agreed]]"},
      {k: "Fund costs", v: "[[Management expense ratios of the funds held, if any]]"}, {k: "Tax", v: "[[Whether fees are deductible on non-registered accounts]]"}]},
    {type: "bullets", style: "bullet", items: ["Your financial plan, reviewed and updated as life changes", "Portfolio management and rebalancing", "Tax, retirement, education and estate planning", "A team you can reach, who knows your file"]},
    {type: "paragraph", text: "Every fee appears on your statements and in the annual report on charges and compensation."}
  )})]
];

