/* ==========================================================================
   examples.js — worked examples, one per house section.

   These are what "Show me an example" in the guide puts in front of the
   associate: a finished version of the section, written in the paste format,
   so it shows what good output looks like AND lays out correctly if pasted.

   The clients are invented and every figure is illustrative. Robert & Anne
   Kowalchuk (farmland near Medicine Hat) carry the plan, annual review and
   portfolio review; Tom & Lisa Brandt (owners of a local mechanical
   contracting company) carry the planning topic and the proposal.

   Keyed by section TITLE, exactly as in TEMPLATES (brand.js) and
   SECTION_BRIEFS (prompts.js). A title shared by two templates has one entry
   written to suit both. Rename a section and its example stops showing.
   ========================================================================== */

const SAMPLE_SECTIONS = {

  /* ── The Plan ─────────────────────────────────────────────────────────── */

  "What we set out to do":
`You asked us to answer three questions: can you retire in 2032, will the money last, and what happens to the land.

- Retire in 2032 without changing how you live day to day
- Keep enough set aside that one bad year does not force a decision
- Keep the home quarter in the family, ideally with your daughter farming it
- Treat both children fairly, even though only one of them farms

This summary pulls the full plan down to the parts that matter for those decisions. The detailed projections are behind it, and we are happy to walk through any of them with you.`,

  "Where you stand today":
`$2.41M | Total net worth | Including land and home
$1.48M | Investable assets | Registered and non-registered
$0 | Non-mortgage debt | Debt free since 2024

RRSPs (Robert / Anne): $612,000 / $248,000
TFSAs: $210,000
Non-registered: $410,000
Home quarter (NW 14-12-6 W4): $740,000
Estimated annual spending: $92,000

The balance sheet is unusually clean for this stage: no debt, a healthy registered
base, and one large illiquid asset. **The land is the planning problem and the
planning opportunity at the same time** — it is roughly a third of your net worth
and none of it is easily divisible.

> Just under a third of net worth sits in one quarter section. That is fine while it is producing rent and appreciating — it becomes a problem only if the estate has to raise cash quickly.`,

  "What the plan projects":
`$2.05M | Portfolio at retirement | Illustrative, 2032
$92,000 | Target income | In today's dollars
95 | Age the money lasts to | Illustrative, base case

The projection asks one question. If the portfolio earns an average of 5.0% a year after fees and prices rise 2.1% a year, does it pay for the life you have now, from 2032 to age 95? On those assumptions it does, with a margin left over.

It rests on three things holding roughly true. You keep spending close to $92,000, you both take CPP and OAS at 65, and the land stays in the family rather than being sold to fund retirement.

What it does not prove is that the future will look like the assumptions. Returns arrive unevenly, and a weak stretch just after 2032 would matter more than one later on. That is why the plan holds a cash reserve, and why we rerun the numbers every year. All figures here are illustrative.

> On these assumptions the plan supports your target income to age 95 without selling the land.`,

  "The planning topics we looked at":
`## When to take CPP and OAS

Taking both at 65 gives steady income from the start of retirement. Waiting to 70 raises the payments for life, by 42% for CPP and 36% for OAS, but means drawing more from the RRSPs in the early years.

For you, waiting makes the most sense for Robert, whose RRSP is larger and will be taxed heavily as a RRIF later anyway.

| Option | Income from 65 | Trade-off |
| Both at 65 | Highest early | Lower payments for life |
| Robert at 70, Anne at 65 | Lower early | Larger RRSP draws to age 70 |

## Passing on the home quarter

The quarter may qualify for the lifetime capital gains exemption on qualified farm property, which could shelter most of the gain when it passes to your daughter.

Whether it qualifies depends on how the land has been used, so the next step is your accountant's written opinion. Fairness to your son is handled separately, through life insurance and the investment accounts.`,

  "What we do next":
`1. Confirm the spending number - you track actual spending for two months so the plan runs on a real figure. (Owner: You, When: By November)
2. Answer the LCGE question - your accountant confirms whether the quarter meets the use test, in writing. (Owner: You + your accountant, When: Before year-end)
3. Build the cash reserve - we move to two years of spending in short-term holdings over the next four quarters. (Owner: Us, When: Through 2027)`,

  /* ── The Long View (annual review) ────────────────────────────────────── */

  "Today's agenda":
`1. What changed for you this year
2. How the portfolio behaved
3. Where the plan stands now
4. Decisions for the year ahead
5. Anything on your mind`,

  "What changed this year":
`This was the year the farm started to change hands.

Your daughter Kate took over the day-to-day work on the home quarter in April, and she now rents the other two quarters from you on a three-year lease. That rent, about $38,000 a year, replaces the income you used to earn running the land yourselves.

Robert also turned 63 in June, and Anne retired from her part-time bookkeeping work in the fall. Your spending came in at about $89,000, a little under the $92,000 the plan assumes. Nothing about your goals has changed, but your income now looks much more like it will in retirement.`,

  "How the portfolio behaved":
`6.4% | Return this period | Net of fees
$24,000 | Contributions | This period
$0 | Withdrawals | This period

The portfolio returned 6.4% net of fees for the twelve months ended 31 August 2026.
Equities did most of the work; the fixed income sleeve did what it is there to do,
which is not fall when equities wobbled in March.

> One period is a data point, not a verdict. What matters is whether the portfolio behaved the way its design says it should in the conditions we actually had.`,

  "Where the plan stands":
`Plan success rate: 88% (illustrative)
Target retirement date: June 2032, unchanged
Target income: $92,000 a year in today's dollars
Change since last review: Up from 84%

The plan is a little stronger than it was a year ago. The main reasons are that your spending came in under target and the rent from Kate gives you a steady income that the last plan did not count on. The portfolio return over the year played a smaller part. Nothing here changes the retirement date or the income target, and the extra margin gives you some room if land values or rents soften. All projected figures are illustrative.`,

  "Decisions for the year ahead":
`1. Put the lease in writing - your lawyer drafts the three-year lease with Kate so the rent is documented for tax and estate purposes. (Owner: You + your lawyer, When: By January)
2. Top up both TFSAs - we move $14,000 from the non-registered account to use the 2027 room for each of you. (Owner: Us, When: January 2027)
3. Start the cash reserve - we begin building two years of spending in short-term holdings, as the plan sets out. (Owner: Us, When: Through 2027)
4. Decide on the CPP timing - we bring a side-by-side comparison so you can choose before Robert's 64th birthday. (Owner: Together, When: Spring 2027)`,

  /* ── A Closer Look (planning topic) ───────────────────────────────────── */

  "The situation":
`What should we do with the cash building up in the holding company?

Tom and Lisa, your company has had three strong years, and the profits you did not need have been moved up to Brandt Holdings Ltd. as dividends. That money has been sitting in a business savings account, earning very little, while you decide what it is for.

You have told us you want it to support your retirement in about 12 years, without paying more personal tax now than you need to. You would also like it to be available if the business ever needs a cushion.

Cash in Brandt Holdings: $640,000
Added each year (recent average): $150,000
Your ages: Tom 52, Lisa 50
Unused TFSA room (combined): $41,000
Planned retirement: 2038`,

  "What is at stake":
`$640,000 | Cash in the holding company | As at 30 September 2026
$150,000 | Added each year | Recent three-year average
12 yrs | Until planned retirement | Tom and Lisa, 2038

This money is on track to become the largest single piece of your retirement. How it is invested, and how and when it comes out of the company, will shape how much tax you pay on it over the next 30 years. Leaving it in cash is a decision too, and its cost grows with every year the balance does.`,

  "The options we considered":
`| Option | What it does | Cost / trade-off | Flexibility |
| Leave it in cash | Keeps every dollar available | Earns little; falls behind inflation | High |
| Invest inside the company | Grows the money for retirement | Investment income taxed in the company | High |
| Pay it out to fill TFSAs | Moves some money to tax-free growth | Personal tax on the dividends now | Medium |
| Individual pension plan | Builds a company-funded pension | Set-up and annual costs; locked in | Low |

**Leaving it in cash** is simple, but over 12 years it is the option most likely to lose ground to rising prices.

**Investing inside the company** keeps the money flexible and grows it, but the income it earns is taxed at a high corporate rate until it is paid out.

**Paying out enough to fill your TFSAs** costs some tax now, but every dollar that lands there grows tax free.

**An individual pension plan** can shelter more, but locks the money in and adds yearly costs.

## What this does well
- Combining the middle two options grows the money while keeping it reachable

## What to watch
- The rules on passive income in a company can affect the business's small business tax rate`,

  "What we recommend":
`> We recommend investing the company's surplus cash in a balanced mix matched to your plan, and paying out enough each year to fill both TFSAs.

This keeps most of the money inside the company, where it stays flexible and available if the business ever needs it, while moving a steady amount each year into accounts that grow tax free. A balanced mix fits a 12-year horizon and the plan's needs; it is not a view on where markets go next. We would keep one year of the company's usual cash needs in short-term holdings so nothing has to be sold at a bad time.

1. Confirm the passive income limit - your accountant checks how much investment income the company can earn before the small business rate is affected. (Owner: You + your accountant, When: Next 30 days)
2. Open the corporate account - we set up the investment account for Brandt Holdings and agree the target mix. (Owner: Us, When: Next 30 days)
3. Fill both TFSAs - the company pays a dividend large enough to use your combined $41,000 of room. (Owner: You, When: Before year-end)`,

  /* the portfolio review's version of the shared title (see sectionExample) */
  "portfolio_review:What we recommend":
`> We recommend keeping the current mix and finishing the cash reserve over the next two quarters.

The portfolio behaved the way it was built to over the period, and nothing in your plan has changed enough to call for a different design. The one open item is the reserve: two years of spending held in short-term holdings, so a weak market never forces a sale to fund your income. It is about two-thirds built.

1. Finish the cash reserve - we move the remaining amount from the equity sleeve in two steps. (Owner: Us, When: By March)
2. Rebalance the RRSPs - bring the fixed income weight back to its target after this year's drift. (Owner: Us, When: Next 30 days)
3. Confirm your spending figure - so the reserve is sized on a real number, not an estimate. (Owner: You, When: Before our next meeting)`,

  "What could change this":
`- A change to the tax rules on passive income held in private companies
- A plan to sell the business, which could make the lifetime capital gains exemption the bigger question
- The business needing the cash for a major equipment purchase or a slow year

Before acting on any of this, please confirm the figures with your own accountant. Tax rules change, and the numbers here are illustrative.`,

  /* ── Working Together (proposal) ──────────────────────────────────────── */

  "What we heard":
`Here is what you told us matters most, in your own words as closely as we could get them.

- The business has done well, but you have never had time to plan what comes after it
- Cash keeps piling up in the holding company and you are not sure what it is for
- You would like to stop working full time by your early sixties
- You want your two kids treated fairly, whether or not either joins the business
- You are tired of hearing about products and want someone to look at the whole picture
- Lisa wants a plan she can understand without Tom in the room

> We want to know that if we stopped tomorrow, we would be fine.`,

  "What we would do first":
`1. Get the full picture - we gather your accounts, company statements and existing insurance, and meet with your accountant. (Owner: Us, When: Weeks 1 to 2)
2. Build the plan - we model retirement, the holding company cash and the estate, and walk you through the results. (Owner: Us, When: Weeks 3 to 6)
3. Put it to work - we open the accounts, move the money and set up the first year's actions. (Owner: Together, When: Weeks 7 to 12)`,

  "How we work":
`- **Discover.** We learn your whole picture, including the business, the family and what you want.
- **Plan.** We model the options and show you the trade-offs in plain language.
- **Implement.** We put the plan to work and coordinate with your accountant and lawyer.
- **Review.** We meet at least once a year and adjust as life changes.

What this feels like on your side is fewer, better meetings. You will always know what we are working on, what we need from you, and when we will next be in touch. Between meetings, one call or email reaches the whole team, and someone who knows your file will answer it. When something changes in your life or the business, the plan changes with it, so you are never working from an old version.`,

  "The team behind the plan":
`You are not hiring one advisor. You are hiring a team of four senior advisors with a dedicated service group behind them, so your file is never in one person's head and there is always someone who knows it. Each of us brings a different strength, from retirement income to business owner planning, and your plan gets all of them.

$1B | Assets under care | More than $1B, as at Nov 2023
4 | Senior advisors | All CFP®
25 yrs | Serving families | 25+ years in Medicine Hat`,

  "What happens next":
`1. Send us your documents - you share recent statements, the company's year-end financials and your wills, using the checklist we provide. (Owner: You, When: Next 2 weeks)
2. Meet your accountant - we set up a short call with your accountant to understand the company structure. (Owner: Us, When: Next 3 weeks)
3. Discovery meeting - we sit down together for about two hours to go through the full picture. (Owner: Together, When: Within 30 days)`,

  /* ── Your Portfolio Review ────────────────────────────────────────────── */

  "What this review covers":
`1. How your money is invested today
2. How the portfolio behaved over the period
3. What we changed, and why
4. How this fits the plan
5. What we recommend from here

> Returns are shown net of fees for the period stated, and tell us whether the portfolio behaved as it was built to, not what comes next.`,

  "How your money is invested":
`Total invested assets: $1,512,000
Registered (RRSP / RRIF / LIRA): $872,000
TFSA: $224,000
Non-registered: $416,000
Corporate: None

As at 31 August 2026, about 70% of the portfolio is in Canadian, U.S. and international stocks and 30% is in bonds and cash. The stocks are there to grow the money over the 25 or more years it needs to last. The bonds and cash are there to steady it, and to fund your first years of retirement without having to sell stocks after a fall.

The mix is deliberately not trying to beat the market in any one year or to guess which region will do best. It is spread widely so that no single company, sector or country decides the outcome. The land already gives you a large stake in Alberta agriculture, so the portfolio holds little of it on purpose.`,

  "What we changed, and why":
`| When | What we did | Why |
| March 2026 | Sold some U.S. stocks, bought bonds | Stocks had grown past the plan's target mix |
| June 2026 | Started a short-term bond holding | First step in building the two-year cash reserve |
| August 2026 | Moved $7,000 into each TFSA | Used the year's new contribution room |

Each of these changes came from the plan, not from a view on markets. Rebalancing in March brought the mix back to the 70/30 split the plan assumes. The short-term holding begins the cash reserve that protects the first years of retirement. Topping up the TFSAs moves money to where future growth is not taxed. None of them depended on guessing what markets would do next.`,

  "How this fits your plan":
`Target mix (from the plan): 70% stocks / 30% bonds and cash
Actual mix today: 71% stocks / 29% bonds and cash
Drift since last review: 1 point, within our 5-point range
Cash held for near-term spending: $46,000 (six months)

## What is working
- The mix is within a point of target after the March rebalance
- Bonds steadied the portfolio when stocks fell in the spring
- Both TFSAs are fully used

## What we are watching
- The cash reserve is at six months against a two-year goal
- Robert's RRSP will need converting to a RRIF by the end of the year he turns 71

> Yes. The portfolio is still the right vehicle for the plan, and the main work ahead is finishing the cash reserve.`

};

;
