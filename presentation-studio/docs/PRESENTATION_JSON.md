# Presentation JSON — format reference (version 1)

Presentation Studio can build a whole presentation from one JSON object. Paste it into
**Copilot & JSON → step 3** (or drop a `.json` file on the page). You always see a preview and
choose **Replace**, **Fill matching sections** or **Add to the end** before anything changes.

The same reference is inside the program: **Copilot & JSON → JSON format**. To get the current
presentation as JSON (a good starting point for a script), use **Copy as JSON** or
**Download .json** — the output imports straight back in.

A complete working example: [`../examples/sample-presentation.json`](../examples/sample-presentation.json).

## Top level

Only `sections` is required.

```json
{
  "meta": {
    "kind": "plan_summary | annual_review | portfolio_review | topic | proposal | blank",
    "client": "Robert & Anne Kowalchuk",
    "title": "The Kowalchuk Plan",
    "subtitle": "A summary of where you stand and what comes next",
    "advisor": "Matthew Solberg, CFP®, CIM®",
    "date": "2026-10-08"
  },
  "design": {
    "format": "report | slides",
    "cover": "white | premium | ivory",
    "look": "private | classic",
    "accent": "gold | shield",
    "density": "comfortable | compact"
  },
  "options": { "toc": true, "dividers": false, "sectionBreak": true, "team": true,
               "disclosures": true, "pageNumbers": true, "confidential": true },
  "sections": [ … ]
}
```

Also accepted: a bare list of sections, a bare list of blocks (becomes one section), or a single
block.

## Sections

Three shapes:

```json
{ "title": "What we heard", "kicker": "optional small line", "blocks": [ … ] }

{ "title": "Where you stand today", "text": "Paste-format text:\n- bullet\nLabel: value" }

{ "type": "recommendation", "account": "TFSA", "amount": "$95,000",
  "portfolio": "TD Core Managed Asset Allocation Portfolios - Balanced Growth",
  "howItFits": ["Point one", "Point two", "Point three", "Point four"] }
```

`portfolio` can be the portfolio's name, part of its name, or its `portfolioId` from the library.
Unknown portfolios are reported in the preview and can be chosen afterwards.

## Blocks

| type | fields |
|---|---|
| `heading` | `text`, `level` (2 large, 3 sub-heading — default 3), `kicker` |
| `paragraph` | `text` |
| `lead` | `text` — larger opening line |
| `bullets` | `items` (strings), `style`: `bullet` \| `number` \| `check` |
| `stats` | `items`: `[{ "num", "label", "note" }]` — 2–4 key-number cards |
| `facts` | `items`: `[{ "k", "v" }]` — label → value rows |
| `table` | `headers` (strings), `rows` (lists of strings), `caption`, `totalRow` |
| `callout` | `tone`: `note` \| `important` \| `watch` \| `quiet`, `title`, `text` |
| `quote` | `text`, `by` |
| `actions` | `items`: `[{ "t", "d", "who", "when" }]` — numbered action plan |
| `twocol` | `aTitle`, `aText`, `bTitle`, `bText` |
| `chart` | `chart`: `bar` \| `stack` \| `line` \| `donut` \| `hbar`, `title`, `labels`, `series`: `[{ "name", "values" }]`, `unit`, `caption` |
| `infographic` | `graphic`: `timeline` \| `steps` \| `pyramid` \| `gauge` \| `compare`, `title`, `items`: `[{ "t", "d" }]` (`compare`: `{ "t", "a", "b" }`), `caption` |
| `rule` | thin divider |
| `space` | `h` (pixels) |
| `pagebreak` | start a new page |

Text fields accept `**bold**` and `==one highlighted phrase==`.

## Forgiving by design

Copilot's output is rarely perfect JSON, so the reader:

- finds the JSON inside a ```` ```json ```` fence or after a sentence of chatter;
- forgives trailing commas;
- accepts common aliases — `pie` → `donut`, `list`/`numbered` → `bullets`, `kpi` → `stats`,
  `title`/`detail`/`owner` in action items, `label`/`value` in facts, and so on;
- reads numbers written as `1250`, `"1,250"`, `"$1.2M"`, `"4.5%"` or `"(3.2)"`;
- reports anything it could not use, in plain English, in the preview.

## Rules it enforces

- **No pictures by link.** The program never fetches anything; drop the picture file onto the page.
- **The DRAFT tag cannot be switched off from JSON.** That is done on Finish, after review.
- Write `[NEEDS ADVISOR INPUT: what is missing]` or `[SOURCE CONFLICT: …]` where a fact is
  missing or disputed — it is highlighted on the page and caught before export.
