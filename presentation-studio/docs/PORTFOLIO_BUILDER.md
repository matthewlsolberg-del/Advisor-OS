# Portfolio Builder — quick start

**Open `dist/MHWG_Portfolio_Builder.html` in Edge or Chrome.** One self-contained file, like
Presentation Studio. It never connects to the internet.

It does what the recording describes: put in each client's name, which accounts they have and
what each is worth, give every account a one-page model portfolio, and it produces the
household recommendation, checks that it lines up with the investor profile, and lays out a
polished document.

## Five steps, top to bottom on the left

1. **Household** — "Matt & Kelsey Solberg", who prepared it, the date.
2. **Investor profile** — Conservative Income, Balanced Income, Balanced, Balanced Growth,
   Growth or Aggressive Growth, each with an equity range.
3. **People & accounts** — each person's accounts (RRSP, TFSA, LIRA, spousal RRSP…) with the
   dollar value, plus joint accounts. Pick a model portfolio for each. New accounts start on the
   profile's matching model; **Use profile model for blanks** fills any that are empty.
4. **Does it line up?** — the household's combined mix, weighted by dollars, against the
   profile's equity range. Individual accounts may sit higher or lower on purpose (a growth
   TFSA, a conservative joint account); the household total is what's checked. Anything missing
   is listed — click it to go there.
5. **The document** — cover style, report or slides, which pages to include, an optional
   paragraph on how it all fits together, then **Export PDF**.

## The document

- Cover — "The Solberg Portfolio"
- **Your investor profile** — the profile, its equity range drawn as a bar, time horizon,
  objective, what to expect
- **Your portfolio at a glance** — total, combined equities, every account by person with its
  model and share, the combined asset-allocation donut, and where the household sits in the range
- **One locked model page per account** — the same one-page profiles as Presentation Studio
- Your team, and the standard disclosures (DRAFT until you switch it off)

## Investor profiles — confirm the ranges

The starting ranges were chosen so each TD Core asset-allocation model sits inside its own
profile (Conservative Income 10–30% equities … Aggressive Growth 75–100%). **They are not the
firm's official KYC definitions.** Use **Edit profiles** to set the ranges and wording to match
them; there's also an option to count real assets as equities. The change is kept in that browser.

## Copilot and automation

- Each account has **How it fits the plan** points, with a Copilot prompt for them.
- The summary paragraph has its own Copilot prompt (no client names go into it).
- **Paste JSON** loads a whole household from Copilot, a script or a spreadsheet:

```json
{
  "household": "Matt & Kelsey Solberg",
  "profile": "Balanced Growth",
  "people": [
    { "name": "Matt",   "accounts": [ { "type": "RRSP", "value": 250000, "portfolio": "Balanced Growth" },
                                      { "type": "TFSA", "value": 95000,  "portfolio": "Growth" },
                                      { "type": "LIRA", "value": 120000, "portfolio": "Balanced" } ] },
    { "name": "Kelsey", "accounts": [ { "type": "Spousal RRSP", "value": 180000, "portfolio": "Balanced Growth" },
                                      { "type": "TFSA", "value": 90000,  "portfolio": "Growth" } ] }
  ],
  "joint": [ { "type": "Joint Non-Registered Account", "value": 300000, "portfolio": "Balanced" } ]
}
```

Models can be named in full, by the end of the name ("Balanced Growth") or by ID. Values can be
`250000`, `"$250,000"` or `"250k"`.

## Saving and the library

**Save** writes a `.mhwg-portfolio.json` file you can **Open** later; the browser also keeps a
working copy. The **Portfolio library** is the same one Presentation Studio uses — on the same
computer and browser, a model added in one shows up in the other.
