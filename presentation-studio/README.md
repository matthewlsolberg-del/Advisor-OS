# MHWG Presentation Studio

Drop in a **Croesus portfolio report** or a **financial plan**, add your notes, and get a
polished, on-brand client document in minutes: portfolio reviews, plan summaries, annual
reviews and investment recommendations, already written around the real figures, with
yellow `[[blanks]]` for what only the advisor knows. Copilot can write the words in one copy
and paste. One offline HTML file; nothing leaves the computer.

**To use it:** open [`dist/MHWG_Presentation_Studio.html`](dist/MHWG_Presentation_Studio.html)
in Edge. Partners start with [`docs/QUICK_START.md`](docs/QUICK_START.md). To change it with
Copilot on the work PC: [`docs/COPILOT_MAINTENANCE.md`](docs/COPILOT_MAINTENANCE.md).

## What's new in v10

- **Fill in the blanks** as one short form; Copilot fills the blanks it can from the notes,
  and marks what it wrote for a quick "✓ Looks right".
- **Generous templates, one-click trimming**: ✕ on every bullet, fact and step, block and section.
- **Pages run on** (no half-empty pages), headings stay with what follows.
- **Stronger cover** ("Prepared for / by", optional picture), team page with client service and
  specialists, wording from the MHWG website ("How we work with you", "How we help").
- **One ✦ Copilot button**, paste the answer anywhere; File menu; three big choices on Start.
- **Every figure has a source** (report and page); **what changed since last year** from two
  Croesus reports; a one-page **leave-behind** and an internal **prep sheet**.

## What came in v9

- **Reports read on the computer.** An embedded copy of pdf.js reads PDFs with their layout,
  and `facts.js` pulls the facts out of Croesus portfolio reports (accounts, typed by the
  account-number letter; holdings; returns; month-end values; asset mix) and TD / Voyant
  financial plans (net worth, people, goals and how well they are funded, the planner's
  insights, education, protection, estate, the projection, assumptions). Unrecognized
  reports go through a Copilot extraction prompt into the same shape.
- **Drafts that are already written** (`smart.js`): each document type is laid out from the
  facts, with house wording around every figure, data-driven suggestions, and `[[blanks]]`.
- **One-button Copilot**: one prompt carries the notes, the facts and every pre-written box;
  the answer comes back as JSON and fills them all. Rebuilding keeps written words.
- **Four tabs**: Start → Edit → Copilot → Finish.
- **v8.7's additions kept**: PMP/IPS investor profiles, the "Our recommendations" household
  summary page, account pages headed "account | amount", and recommendation pages kept out of
  the contents page.
- **Built for Copilot maintenance**: readable code first, embedded assets last behind a
  do-not-edit marker.

## Portfolio Builder (separate tool, same engine)

[`dist/MHWG_Portfolio_Builder.html`](dist/MHWG_Portfolio_Builder.html) — enter each client's
accounts and dollar values, assign a one-page model portfolio to each, and it produces the
household recommendation: investor profile page, portfolio-at-a-glance summary with the combined
asset allocation checked against the profile's equity range, and one locked model page per
account. See [`docs/PORTFOLIO_BUILDER.md`](docs/PORTFOLIO_BUILDER.md). It shares the brand, page
engine, model profiles and portfolio library with Presentation Studio but is not merged into it.

## What changed in v7 (history)

v6.3 had grown about twenty "patch" layers (v1.1 → v6.3), each hiding or re-wiring the previous
one on a timer — duplicate template pickers, two different recommendation builders, hidden tabs,
and even a global override of `JSON.parse`. v7 keeps the proven engine (layout, charts, Word and
PDF import, Word draft, PDF export, present mode) and replaces the whole interface:

- A **welcome screen**: what are you making, who for, and how do you want to fill it in.
- **Five numbered tabs** — Start, Build, Copilot & JSON, Style, Finish — each doing one job.
- **Tools on every block, right on the page**: add below, ✦ Copilot, move, duplicate, delete.
- **Per-block Copilot that closes the loop**: copy a prompt for one block, paste the answer, it
  replaces the block (v6 only copied the prompt).
- **One smart paste box** that recognises formatted text, Presentation JSON or a portfolio
  profile, and always previews before changing anything.
- **Presentation JSON** in and out (round-trips), forgiving of Copilot's usual JSON mistakes.
- **One account-recommendation system**, edited in the side panel. Each recommendation keeps a
  copy of its profile, so a saved file opens correctly on a partner's computer.
- **Undo/redo buttons**, progress chips on the tabs, and a Finish checklist.
- Fixes: the page view no longer jumps to the cover after every edit; recommendation pages no
  longer clip the holdings column or show a false "runs off the page" warning.

Saved `.mhwg.json` files, the browser working copy and the portfolio library from v6.x all carry
over (same storage keys; old recommendation sections are migrated on open).

## For developers

```
src/
  index.html          page shell (tabs, panels) with {{placeholders}}
  css/studio.css      the studio interface
  css/document.css    the printed document (pages, cover, blocks, recommendation page)
  js/brand.js         house standards, block factory, templates
  js/prompts.js       Copilot prompt pack and section briefs
  js/parse.js         paste format, Word (.docx) reading
  js/pdfread.js       PDFs read with their layout (embedded pdf.js)
  js/facts.js         Croesus reports and financial plans -> facts
  js/smart.js         pre-filled drafts from the facts; one-prompt Copilot fill
  js/content.js       ready-written wording: prospect meeting, planning topics
  js/intake.js        the Start tab and the Copilot step
  js/blanks.js        the "Fill in the blanks" form, Copilot's blank answers, ✓ Looks right marks
  js/views.js         the leave-behind and prep-sheet views, figure sources
  js/viz.js           charts and infographics as inline SVG
  js/render.js        the layout engine: blocks → measured, paginated pages
  js/examples.js      worked examples per section
  js/docxout.js       the Word draft download
  js/workflow.js      section status, paste-with-preview, the Finish check
  js/portfolios.js    portfolio library + account recommendation pages
  js/automation.js    Presentation JSON, smart paste, per-block Copilot
  js/ui.js            toasts, modal, clipboard, files (shared by both tools)
  js/app.js           Presentation Studio: state, undo, tabs, inspector, import/export, boot
  js/builder.js       Portfolio Builder: household, accounts, profiles, the check, the document
  builder.html        Portfolio Builder page shell
  css/builder.css     Portfolio Builder additions
  assets/             embedded fonts, brand marks, standard portfolio profiles
  vendor/             pdf.js 3.11.174 (Apache-2.0)
build.py              → dist/MHWG_Presentation_Studio.html and dist/MHWG_Portfolio_Builder.html
tests/smoke.mjs       Presentation Studio end-to-end test (headless Chromium)
tests/builder.mjs     Portfolio Builder end-to-end test (offline, checks the math by hand)
tests/intake.mjs      drops real reports in and checks the drafts (pass your own PDFs)
examples/             sample Presentation JSON
archive/              the v6.3 file this was rebuilt from
```

Build and test:

```bash
python3 build.py
NODE_PATH=$(npm root -g) node tests/smoke.mjs [screenshot-dir]     # needs Playwright + Chromium
NODE_PATH=$(npm root -g) node tests/builder.mjs [screenshot-dir]
NODE_PATH=$(npm root -g) node tests/intake.mjs croesus.pdf plan.pdf [screenshot-dir]
```

Edit the files in `src/`, never `dist/` directly, then rebuild. The deck object is the single
source of truth: every edit changes the deck, then the pages are laid out again from scratch.
