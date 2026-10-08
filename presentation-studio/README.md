# MHWG Presentation Studio

A single, offline HTML file that turns notes, Copilot output or JSON into polished, on-brand
client presentations and reports — cover, contents, sections, account recommendations, team
page and disclosures — and exports them to PDF.

**To use it:** open [`dist/MHWG_Presentation_Studio.html`](dist/MHWG_Presentation_Studio.html)
in Edge or Chrome. Partners start with [`docs/QUICK_START.md`](docs/QUICK_START.md).

- **Nothing leaves the computer.** The page's Content Security Policy blocks every network
  request. Copilot is used by copying prompts out and pasting answers back.
- **Three ways to fill it in**, mixable: type on the page; have Copilot write it (text or JSON);
  paste Presentation JSON from a script ([format](docs/PRESENTATION_JSON.md)).

## What changed in v7

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
  js/parse.js         paste format, Word (.docx) and PDF text reading
  js/viz.js           charts and infographics as inline SVG
  js/render.js        the layout engine: blocks → measured, paginated pages
  js/examples.js      worked examples per section
  js/docxout.js       the Word draft download
  js/workflow.js      section status, paste-with-preview, the Finish check
  js/portfolios.js    portfolio library + account recommendation pages
  js/automation.js    Presentation JSON, smart paste, per-block Copilot
  js/app.js           state, undo, tabs, inspector, import/export, boot
  assets/             embedded fonts, brand marks, standard portfolio profiles
build.py              → dist/MHWG_Presentation_Studio.html (one self-contained file)
tests/smoke.mjs       end-to-end test in headless Chromium
examples/             sample Presentation JSON
archive/              the v6.3 file this was rebuilt from
```

Build and test:

```bash
python3 build.py
NODE_PATH=$(npm root -g) node tests/smoke.mjs [screenshot-dir]   # needs Playwright + Chromium
```

Edit the files in `src/`, never `dist/` directly, then rebuild. The deck object is the single
source of truth: every edit changes the deck, then the pages are laid out again from scratch.
