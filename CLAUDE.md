# Advisor-OS — notes for every Claude session

Tools for Medicine Hat Wealth Group (MHWG), a TD Wealth Private Investment Advice team.
Everything lives in `presentation-studio/`.

## What we're building

- **Presentation Studio** (`dist/MHWG_Presentation_Studio.html`) — turns dictated notes,
  dropped files (Croesus portfolio reports, financial plans, screenshots, Word docs) and
  Copilot answers into polished, on-brand client documents in minutes. The direction: a
  template that is already filled in, where the advisor fills in the blanks.
- **Portfolio Builder** (`dist/MHWG_Portfolio_Builder.html`) — household accounts → one model
  portfolio per account → combined allocation checked against the investor profile → document.
  Separate tool on purpose; it shares the engine. Don't merge the two unless asked.

## Hard constraints (never break these)

1. **One self-contained HTML file per tool.** It is emailed to a locked-down work PC and
   opened in Edge. No external files, no CDN, no installs.
2. **No network, ever.** The page's Content-Security-Policy forbids every request. Client
   data never leaves the machine. Copilot is used only by copy-paste: the app writes a
   prompt, the advisor runs it in Microsoft Copilot, and pastes the answer back.
3. **It must stay maintainable by Microsoft Copilot on the work PC.** The advisor keeps
   editing the dist HTML with Copilot. So:
   - Readable, commented, un-minified app code at the TOP of the file; the big embedded
     assets (fonts, brand marks, vendored pdf.js) at the BOTTOM, behind a clear marker.
   - Fix things by replacing whole functions, never by layering "patch" scripts that
     re-wire earlier code on a timer. v6.3 (in `archive/`) is what that turns into.
   - Keep `docs/COPILOT_MAINTENANCE.md` accurate when the file layout changes.
4. **Compliance**: documents stay marked DRAFT until the advisor removes it; standard
   disclosures stay on; never invent client figures. Gaps are written as
   `[NEEDS ADVISOR INPUT: …]` or `[[…]]` blanks and are caught before export.

## Working in the repo

```bash
cd presentation-studio
python3 build.py                      # builds both dist/ files from src/
NODE_PATH=$(npm root -g) node tests/smoke.mjs     # Studio end-to-end (headless Chromium)
NODE_PATH=$(npm root -g) node tests/builder.mjs   # Portfolio Builder end-to-end
```

- Edit `src/`, never `dist/` by hand; rebuild and commit both.
- Load order of modules is in `build.py` (`TARGETS`). Shared engine: `brand.js`, `parse.js`,
  `viz.js`, `render.js`, `ui.js`, `portfolios.js`.
- The deck object is the single source of truth; every edit changes it and the pages are
  laid out again from scratch.
- Look at the result: tests take screenshots when given a folder; check them.
- Real sample inputs (the advisor's own data) are NOT in the repo. Don't commit client data.

## Domain notes

- Croesus account-number suffixes: **A/B** non-registered (CAD/USD, can also be corporate),
  **S** RRSP / LIRA / spousal RRSP, **J** TFSA, **V** RESP; **E** has been seen as a margin
  (non-registered) account. Prefer the account-type text when present.
- Investor profiles (from the firm's PMP/IPS): Conservative Income, Balanced Income,
  Balanced, Balanced Growth, Growth, Aggressive Growth, each with a target and permitted
  equity / fixed-income range.
- Financial plans come from TD's planning software (Voyant-style "Wealth Plan" PDFs), but
  layouts vary — parsers must tolerate missing pieces and say what they found.
EOF
