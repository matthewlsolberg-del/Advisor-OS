# Changing Presentation Studio with Copilot (on the work PC)

The finished tool is **one HTML file**. You can keep improving it on your work PC with
Microsoft Copilot and a text editor (Notepad works; Notepad++ or VS Code is nicer). This guide
shows where things are and how to ask Copilot for changes **without breaking the file**.

> **The one rule:** ask Copilot to **replace a whole function**, never to "add a patch" that
> re-wires earlier code. Version 6.3 became unusable because of about twenty stacked patches.

---

## How the file is laid out

Open `MHWG_Presentation_Studio.html` in your editor. From top to bottom:

| Part | What it is | Edit it? |
|---|---|---|
| `<head>` styles | The look of the studio, then the look of the printed document | Yes |
| `<body>` markup | The four tabs (Start, Edit, Copilot, Finish) and the page canvas | Yes |
| One big `<script>` | The program, in sections. Each starts with a banner like `/* ===… smart.js — drafts that are already written.` | Yes, one section at a time |
| **`EMBEDDED ASSETS — DO NOT EDIT ANYTHING BELOW THIS LINE`** | Fonts, logos, the PDF reader. Megabytes of machine-generated code | **Never** |

Everything you would change sits in roughly the first eighth of the file. Search for
`DO NOT EDIT` to find the marker, and stay above it.

## Where to change what

Search (Ctrl+F) for the name in the right-hand column.

| You want to change… | Section | Search for |
|---|---|---|
| Pre-written wording in a portfolio review | smart.js | `function buildPortfolioReview` |
| Pre-written wording in a plan summary | smart.js | `function buildPlanSummary` |
| The suggested recommendations (TFSA, legacy positions…) | smart.js | `function portfolioSuggestions` / `function planSuggestions` |
| Investor profiles (targets and ranges) | smart.js | `const INVESTOR_PROFILES` |
| What Copilot is told when it writes the words | smart.js | `function slotPrompt` |
| Croesus account types (A/B, S, J, V…) and labels | facts.js | `function accountKind` / `function accountLabelFor` |
| Reading the Croesus report | facts.js | `function parseCroesus` |
| Reading the financial plan | facts.js | `function parsePlan` |
| Team members, address, phone, disclosures | brand.js | `const BRAND` |
| Colours and fonts on the printed pages | `<style>` (document part) | `.doc{` |
| The account-recommendation page and the household summary | portfolios.js / smart.js | `function recommendationProfileMarkup` / `function householdSummaryHTML` |
| The approved model portfolios | not in the code | Use **Portfolio library** in the app, then **Export library backup** to share |
| The Start tab's options and Copilot's three steps | the `<body>` markup, and intake.js | `data-panel="start"` / `function wireIntake` |

Section sizes: most are 10–45 KB, which fits in one Copilot message. app.js (78 KB) is the
largest, so for app.js copy just the one function you need.

## How to ask Copilot for a change

1. In the HTML file, find the function you need (table above). Select from its first line
   (`function name(…){`) down to its closing `}` at the start of a line. Copy it.
2. In Copilot, paste this, filling in the parts in brackets:

   ```
   Below is one JavaScript function from a single-file HTML tool. Change it so that
   [describe the change]. Keep everything else exactly as it is. Do not add new
   functions that override this one, do not use setTimeout to re-wire things, and do
   not add any network requests. Return ONLY the complete replacement function.

   [paste the function]
   ```
3. In your editor, select the old function exactly as you copied it and paste Copilot's
   version over it. Save.
4. Open the file in Edge and test (see below). If anything is wrong, undo in the editor.

**Always keep a copy of the last working file** (for example `…_v9.0_good.html`) before you edit.

## Test after every change (2 minutes)

1. Open the file in Edge. Press **F12 → Console**. There should be no red errors.
2. Drop in a Croesus report: the draft should lay out, with the figures filled in.
3. Drop in a financial plan and pick **Financial plan summary**.
4. Click some text on a page and type; press **Ctrl+Z**.
5. **Export PDF** and look at the print preview.

## Recipes

**Change an investor profile's range**: search `const INVESTOR_PROFILES`, then edit the
numbers on that profile's line, e.g. `equityMin:40, equityMax:80`. No Copilot needed.

**A new Croesus account letter** (say `R` for RRIF): search `function accountKind`, and ask
Copilot "add: when there is no account-type text, an account number ending in R is a RRIF."

**Reword a pre-filled sentence**: search for a few words of the sentence (they are in
smart.js), and edit the text between the quotes. Keep any `fm$(…)` or `fmPct(…)` parts as
they are: those insert the figures.

**A new suggestion**: copy `function portfolioSuggestions` to Copilot and describe the rule,
for example "if any account is a LIRA, suggest reviewing the unlocking options".

**Team, phone or disclosures**: search `const BRAND` and edit the text in quotes.

## What must never change

- The `Content-Security-Policy` line at the top: it is what guarantees nothing leaves the PC.
- Anything below the `DO NOT EDIT` marker.
- The DRAFT and disclosures behaviour on the Finish tab.
