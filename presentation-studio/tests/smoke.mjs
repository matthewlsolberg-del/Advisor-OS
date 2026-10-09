// End-to-end smoke test for the built studio, in headless Chromium.
//   NODE_PATH=$(npm root -g) node tests/smoke.mjs [screenshot-dir]
// Exercises the welcome screen, typing on the page, Copilot text and JSON
// paste, account recommendations, per-block Copilot, JSON round trip, undo.
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const file = "file://" + path.resolve(here, "../dist/MHWG_Presentation_Studio.html");
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };
const deck = () => page.evaluate(() => JSON.parse(JSON.stringify(deck)));
const modalOpen = () => page.evaluate(() => !document.getElementById("modal").hidden);

await page.goto(file);
await page.waitForTimeout(800);

console.log("Start tab (no reports dropped: the plain template)");
ok(!(await modalOpen()) && await page.isVisible('.panel[data-panel="start"].is-active'), "opens on the Start tab, no pop-up");
await shot("01-start");
await page.click('#pieceGrid .piece-card:has-text("Portfolio review")');
await page.fill("#fldClient", "Robert & Anne Kowalchuk");
await page.locator("#fldClient").blur();
await page.click("#btnBuild");
let d = await deck();
ok(d.meta.kind === "portfolio_review", "template chosen: portfolio review");
ok(d.meta.title === "The Kowalchuk Portfolio Review", "surname title suggested: " + d.meta.title);
ok(await page.isVisible('.panel[data-panel="build"].is-active'), "Build my draft lands on Edit");
await shot("02-build");

console.log("Typing on the page");
const para = page.locator('#pages .blk-paragraph .is-editable').first();
await para.click();
await page.keyboard.press("Control+A");
await page.keyboard.type("Typed straight onto the page.");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
d = await deck();
ok(JSON.stringify(d).includes("Typed straight onto the page."), "inline edit reached the deck");

console.log("Quickbar + insert menu");
await page.locator('#pages .blk-paragraph').first().hover();
await page.locator('#pages .blk-paragraph >> .blk-quickbar >> text=+ Add below').first().click();
ok(await page.isVisible("#insertMenu"), "insert menu opens");
await shot("03-insert-menu");
await page.click('#insertMenu button:has-text("Callout")');
d = await deck();
ok(d.sections.some(s => s.blocks.some(b => b.type === "callout" && b.title === "Worth knowing")), "callout inserted below");
ok(await page.isVisible("#inspector"), "inspector opens for the new block");

console.log("Undo");
await page.click("#btnCloseInspector");
await page.click("#btnUndo");
d = await deck();
ok(!d.sections.some(s => s.blocks.some(b => b.type === "callout" && b.title === "Worth knowing")), "undo removed the callout");

console.log("Copilot tab: text answer");
await page.click('.rail-tab[data-panel="copilot"]');
await page.evaluate(() => { $("pasteBox").closest("details").open = true; });
await shot("04-copilot");
await page.check('input[name="promptKind"][value="text"]');
const prompt = await page.textContent("#promptPreview");
ok(prompt.includes("# How your money is invested"), "whole-piece prompt lists the sections");
ok(!prompt.includes("Kowalchuk"), "client name is not put into the prompt");
await page.fill("#pasteBox", "# How your money is invested\nThe portfolio is built for **steady growth** with some income.\n- Canadian equity anchors the mix\n- Bonds soften the swings\nTotal invested: $1,480,000\n\n# A brand new section\n> One sentence worth pulling out.");
await page.click("#btnSmartPaste");
ok(await modalOpen(), "preview shows before anything changes");
await shot("05-text-preview");
await page.click("#pvGo");
d = await deck();
ok(d.sections.some(s => s.title === "A brand new section"), "new section added from # heading");
const inv = d.sections.find(s => s.title === "How your money is invested");
ok(inv.blocks.some(b => b.type === "chart"), "matching section refilled, its chart kept");
ok(inv.blocks.some(b => b.type === "facts"), "Label: value became a fact row");

console.log("Copilot tab: JSON answer");
const json = {
  meta: { title: "The Kowalchuk Plan", subtitle: "Where you stand", date: "2026-10-08" },
  design: { format: "report", cover: "premium" },
  sections: [
    { title: "What we heard", blocks: [
      { type: "lead", text: "You want to retire in 2032 without changing how you live." },
      { type: "bullets", items: ["Retire at 62", "Help the grandkids with school"] },
      { type: "quote", text: "We just want to know it works.", by: "Anne" } ] },
    { title: "The numbers", blocks: [
      { type: "stats", items: [{ num: "$1.48M", label: "Investable assets" }, { num: "2032", label: "Retirement" }, { num: "92%", label: "Plan success" }] },
      { type: "chart", chart: "pie", title: "Asset mix", labels: ["Equity", "Bonds", "Cash"], series: [{ name: "Mix", values: ["60%", "35%", "5%"] }], unit: "%", caption: "As at Sep 30." },
      { type: "table", headers: ["Option", "Cost"], rows: [["Keep RRSP", "$0"], ["Convert to RRIF", "$1,200"]], caption: "Illustrative" },
      { type: "actions", items: [{ title: "Rebalance", detail: "Bring the mix back to target.", owner: "Us", when: "30 days" }] } ] },
    { title: "Written as text", text: "A paragraph in the paste format.\n- one\n- two" },
    { type: "recommendation", account: "TFSA", amount: "95000", portfolio: "Balanced Growth", howItFits: ["Tax-free growth for the long term.", "Matches a 15-year horizon."] },
    { type: "recommendation", account: "RRSP", amount: "$400,000", portfolio: "Not A Real Portfolio" }
  ]
};
await page.click('.rail-tab[data-panel="copilot"]');
await page.evaluate(() => { $("pasteBox").closest("details").open = true; });
await page.fill("#pasteBox", "Here is your JSON:\n```json\n" + JSON.stringify(json, null, 2) + "\n```");
await page.click("#btnSmartPaste");
ok(await modalOpen(), "JSON preview shows");
const warnText = await page.textContent("#modalBody");
ok(/not in this library/.test(warnText), "unknown portfolio is warned about");
await shot("06-json-preview");
await page.click('input[name="impMode"][value="replace"]');
await page.click("#impGo");
d = await deck();
ok(d.sections.length === 5, "five sections laid out (got " + d.sections.length + ")");
ok(d.meta.title === "The Kowalchuk Plan" && d.cover.style === "premium", "cover details applied");
const ch = d.sections[1].blocks.find(b => b.type === "chart");
ok(ch && ch.chart === "donut" && ch.series[0].values.join() === "60,35,5", "pie → donut, '60%' read as 60");
ok(d.sections[1].blocks.find(b => b.type === "actions").items[0].who === "Us", "action aliases (owner → who)");
const rec = d.sections[3];
ok(rec.accountRecommendation && rec.accountAmount === "$95,000" && rec.portfolioId === "TD_CORE_AA_BALANCED_GROWTH", "recommendation matched portfolio by partial name, amount formatted");
ok(d.options.draft === true, "DRAFT tag still on");
await page.waitForTimeout(300);
const recPages = await page.locator("#pages .page.recommendation-page").count();
ok(recPages === 2, "each recommendation on its own page (" + recPages + ")");
const overflow = await page.locator("#pages .page-overflow").count();
ok(overflow === 0, "nothing runs off a page (" + overflow + " warnings)");
await page.locator("#pages .page.recommendation-page").first().scrollIntoViewIfNeeded();
await shot("07-recommendation-page");

console.log("Recommendation inspector");
await page.locator("#pages .blk-recommendation").first().click();
ok(await page.isVisible("#inspector"), "clicking the recommendation opens its settings");
const before = await page.evaluate(() => document.getElementById("pages").scrollTop);
await page.locator("#inspectorBody select").nth(1).selectOption("TD_CORE_DIVIDEND_EQUITY");
await page.waitForTimeout(200);
const after = await page.evaluate(() => document.getElementById("pages").scrollTop);
ok(before > 300 && Math.abs(after - before) < 5, "the view stays put after an edit (" + before + " → " + after + ")");
d = await deck();
ok(d.sections[3].blocks[0].portfolioId === "TD_CORE_DIVIDEND_EQUITY", "portfolio changed from the inspector");
await shot("08-rec-inspector");

console.log("Per-block Copilot");
const lead = await page.evaluate(() => deck.sections[0].blocks[0].id);
await page.evaluate((id) => openBlockCopilot(id), lead);
await shot("09-block-copilot");
await page.fill("#bcAnswer", "You would like to retire in 2032 and keep living the way you do now.");
await page.click("#bcApply");
d = await deck();
ok(d.sections[0].blocks[0].type === "lead" && d.sections[0].blocks[0].text.startsWith("You would like"), "block answer replaced the lead, kept its type");

console.log("JSON round trip");
const rt = await page.evaluate(() => {
  const r = readPresentation(JSON.parse(presentationToJSON(false)));
  return { n: r.sections.length, recs: r.sections.filter(s => s.accountRecommendation).length, warnings: r.warnings };
});
ok(rt.n === 5 && rt.recs === 2, "export → import keeps all sections (" + rt.n + ")");

console.log("Portfolio library");
await page.evaluate(() => openPortfolioLibrary());
const libRows = await page.locator(".lib-row").count();
ok(libRows >= 8, "standard profiles are in the library (" + libRows + ")");
await shot("10-library");
await page.evaluate(() => hideModal());

console.log("Other tabs");
for (const [tab, n] of [["start", "11-start"], ["copilot", "12-copilot"], ["finish", "13-finish"]]) {
  await page.click(`.rail-tab[data-panel="${tab}"]`);
  await page.waitForTimeout(150);
  await shot(n);
}
const checks = await page.locator("#checkList .check-row").count();
ok(checks > 0, "Finish lists what is left (" + checks + " items)");

console.log("Slides format");
await page.click('.rail-tab[data-panel="start"]');
await page.click('#formatPick .fmt-swatch.is-slides');
await page.waitForTimeout(300);
ok((await deck()).design.format === "slides", "switched to slides");
const slideOverflow = await page.locator("#pages .page-overflow").count();
ok(slideOverflow === 0, "slides: nothing runs off a page (" + slideOverflow + ")");
await shot("14-slides");

console.log("Reload keeps the working copy");
await page.waitForTimeout(900);
await page.reload();
await page.waitForTimeout(700);
d = await deck();
ok(d.meta.title === "The Kowalchuk Plan" && !(await modalOpen()), "restored without the welcome screen");

console.log("Next blank");
await page.evaluate(() => {
  const b = newBlock("paragraph");
  b.text = "We meet again in [[month]] to review [[what we review]].";
  deck.sections[0].blocks.push(b);
  render();
});
await page.waitForTimeout(200);
ok(/2 blanks/.test(await page.textContent("#btnNextBlank")), "Next blank counts the blanks on the page");
await page.click("#btnNextBlank");
await page.waitForTimeout(300);
ok(await page.evaluate(() => window.getSelection().toString()) === "[[month]]", "first blank selected, ready to type over");
await page.keyboard.type("March");
await page.click("#btnNextBlank");
await page.waitForTimeout(400);
d = await deck();
ok(JSON.stringify(d).includes("We meet again in March to review"), "typing replaced the blank in the deck");
ok(await page.evaluate(() => window.getSelection().toString()) === "[[what we review]]", "the button moves on to the next blank");
await shot("15-next-blank");

console.log("Prospect meeting and planning topics");
page.on("dialog", dlg => dlg.accept());
await page.click('.rail-tab[data-panel="start"]');
await page.click('#pieceGrid .piece-card:has-text("Prospect meeting")');
await page.waitForTimeout(400);
d = await deck();
ok(d.meta.kind === "prospect" && d.meta.title === "Working Together", "prospect meeting laid out with its cover");
ok(["What we heard", "Your situation today", "What we would recommend", "What happens next", "What to bring"].every(t => d.sections.some(s => s.title === t)),
  "prospect sections: heard, situation, recommend, next, what to bring");
await page.click('.rail-tab[data-panel="build"]');
await page.selectOption("#presetPick", "t_cppoas");
await page.click("#btnAddSection");
await page.selectOption("#presetPick", "t_tfsarrsp");
await page.click("#btnAddSection");
await page.waitForTimeout(300);
d = await deck();
ok(d.sections.some(s => s.title === "When to start CPP and OAS") && d.sections.some(s => s.title === "TFSA or RRSP?"), "planning topics added from the list");
ok((await page.locator("#presetPick optgroup").count()) >= 5, "topics grouped in the list");
const over = await page.evaluate(() => [...document.querySelectorAll("#pages .page-overflow")].map(n => (n.closest(".page") || n).innerText.replace(/\s+/g, " ").slice(0, 80)));
if (over.length && shots) await page.locator("#pages .page-overflow").first().locator("xpath=ancestor::*[contains(@class,'page')][1]").screenshot({path: path.join(shots, "over.png")});
ok(over.length === 0, "prospect + topics, " + (await deck()).design.format + ": nothing runs off a page " + JSON.stringify(over));
const sp = await page.evaluate(() => slotPrompt());
ok(/prospect_heard/.test(sp) && /t_cppoas_you_/.test(sp), "Copilot prompt asks for the prospect and topic boxes");
await page.evaluate(() => {
  const ans = {slots: {}};
  slotBlocks().forEach(({b}) => { if (b.slot === "prospect_heard") ans.slots[b.slot] = ["Retire at 60 without worry", "Help the kids with university"]; });
  applySlotAnswer(JSON.stringify(ans));
});
d = await deck();
ok(JSON.stringify(d).includes("Help the kids with university"), "Copilot's answer filled the What we heard box");
await shot("16-prospect");

console.log("Fill in the blanks, and Copilot fills blanks from the notes");
await page.click('.rail-tab[data-panel="build"]');
await page.waitForTimeout(200);
const formRows = await page.locator("#blankForm .bf-row input").count();
const blanksBefore = await page.evaluate(() => collectBlanks().length);
ok(formRows > 10 && formRows === blanksBefore, "the form lists every blank (" + formRows + ")");
const firstLabel = await page.locator("#blankForm .bf-label").first().innerText();
await page.locator("#blankForm .bf-row input").first().fill("We met at the Chamber lunch in September.");
await page.locator("#blankForm .bf-row input").first().press("Enter");
await page.waitForTimeout(300);
ok(await page.evaluate(() => collectBlanks().length) === blanksBefore - 1 && (await page.textContent("#pages")).includes("We met at the Chamber lunch"),
  "typing in the form fills the page (" + firstLabel.split("\n")[0] + ")");
ok(await page.evaluate(() => document.activeElement && document.activeElement.closest && !!document.activeElement.closest("#blankForm")), "focus moves on down the form");
const bp = await page.evaluate(() => slotPrompt());
ok(/THE BLANKS/.test(bp) && /"blanks"/.test(bp) && /■ b1 — /.test(bp), "the Copilot prompt lists the blanks for Copilot to fill");
const meetKey = await page.evaluate(() => Object.keys(deck.blankKeys).find(k => /Meeting date/.test(JSON.stringify(collectBlanks().find(it => it.bid === deck.blankKeys[k].bid && it.raw === deck.blankKeys[k].raw) || {}))));
ok(!!meetKey, "a blank has a key Copilot can answer (" + meetKey + ")");
await page.evaluate((k) => {
  const blanks = {}; blanks[k] = "November 14"; blanks.b1 = blanks.b1 || "";
  const t = JSON.stringify({slots: {}, blanks});
  const ev = new ClipboardEvent("paste", {clipboardData: new DataTransfer(), bubbles: true, cancelable: true});
  ev.clipboardData.setData("text/plain", t);
  document.querySelector(".canvas").dispatchEvent(ev);
}, meetKey);
await page.waitForTimeout(300);
d = await deck();
ok(JSON.stringify(d).includes("November 14"), "Copilot's answer pasted anywhere filled the blank");
ok(Object.keys(d.toCheck || {}).length > 0 && await page.locator("#pages .blk-check").count() > 0, "what Copilot wrote is marked to read over");
await page.locator("#pages .blk-check").first().click();
await page.waitForTimeout(200);
ok((await deck()).toCheck && Object.keys((await deck()).toCheck).length === Object.keys(d.toCheck).length - 1, "“Looks right” clears the mark");
await shot("17-blank-form");

console.log("One-click trimming");
const itemsBefore = await page.evaluate(() => deck.sections.find(s => s.title === "What to bring").blocks.find(b => b.type === "bullets").items.length);
const bring = page.locator('#pages .blk-bullets li:has-text("Notices of Assessment")');
await bring.hover();
await bring.locator(".item-del").click();
await page.waitForTimeout(200);
ok(await page.evaluate(() => deck.sections.find(s => s.title === "What to bring").blocks.find(b => b.type === "bullets").items.length) === itemsBefore - 1, "✕ on a bullet removes just that bullet");
const secsBefore = (await deck()).sections.length;
await page.evaluate(() => removeSection(deck.sections.find(s => s.title === "What to bring").id));
ok((await deck()).sections.length === secsBefore - 1, "a whole section comes out in one click");
await page.keyboard.press("Escape");
await page.click("#btnUndo");
ok((await deck()).sections.length === secsBefore, "Undo brings it back");
ok(await page.evaluate(() => !JSON.stringify(deck).includes("✕")), "the ✕ never gets into the text");

console.log("Cover, team, views");
ok((await deck()).meta.advisor.startsWith("Matthew Solberg"), "Prepared by starts as Matthew Solberg");
ok((await page.textContent("#pages .cover-band")).includes("Senior Investment Advisor"), "the cover band names the advisor and title");
ok(!(await deck()).options.sectionBreak, "sections run on down the page by default");
await page.evaluate(() => setView("leave"));
await page.waitForTimeout(300);
ok(await page.locator("#pages .page").count() === 1 && (await page.textContent("#pages")).includes("Important disclosures"), "one-page leave-behind, with the disclosures");
await shot("18-leave-behind");
await page.evaluate(() => setView("prep"));
await page.waitForTimeout(300);
ok(await page.locator("#pages .page-internal").count() >= 1 && (await page.textContent("#pages")).includes("Questions to ask"), "prep sheet: internal on every page, with the questions to ask");
await page.evaluate(() => setView("doc"));
await page.waitForTimeout(200);
ok(await page.locator("#pages .cover").count() === 1, "back to the document");
await page.click("#btnFile");
ok(await page.isVisible("#btnSave"), "File menu holds New, Open, Save");
await page.keyboard.press("Escape");
await page.mouse.click(5, 300);

ok(errors.length === 0, "no script errors" + (errors.length ? ":\n    " + errors.join("\n    ") : ""));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
