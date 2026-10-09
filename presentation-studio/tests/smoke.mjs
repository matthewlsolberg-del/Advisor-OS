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

console.log("Welcome screen");
ok(await modalOpen(), "welcome screen shows on first open");
await shot("01-welcome");
await page.click('#wcKinds .piece-card:has-text("Portfolio review")');
await page.fill("#wcClient", "Robert & Anne Kowalchuk");
await page.click('.route-btn[data-route="type"]');
let d = await deck();
ok(d.meta.kind === "portfolio_review", "template chosen: portfolio review");
ok(d.meta.title === "The Kowalchuk Portfolio Review", "surname title suggested: " + d.meta.title);
ok(await page.isVisible('.panel[data-panel="build"].is-active'), "lands on Build");
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
await shot("04-copilot");
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
await page.fill("#pasteBox", "Here is your JSON:\n```json\n" + JSON.stringify(json, null, 2) + "\n```");
await page.click("#btnSmartPaste");
ok(await modalOpen(), "JSON preview shows");
const warnText = await page.textContent("#modalBody");
ok(/not in this library/.test(warnText), "unknown portfolio is warned about");
await shot("06-json-preview");
await page.click('input[name="impMode"][value="replace"]');
await page.click("#impGo");
d = await deck();
ok(d.sections.length === 6, "five sections plus Our recommendations laid out (got " + d.sections.length + ")");
ok(d.sections[3].recommendationOverview && d.sections[4].accountRecommendation, "Our recommendations sits just before the account page");
ok(d.meta.title === "The Kowalchuk Plan" && d.cover.style === "premium", "cover details applied");
const ch = d.sections[1].blocks.find(b => b.type === "chart");
ok(ch && ch.chart === "donut" && ch.series[0].values.join() === "60,35,5", "pie → donut, '60%' read as 60");
ok(d.sections[1].blocks.find(b => b.type === "actions").items[0].who === "Us", "action aliases (owner → who)");
const rec = d.sections.find(s => s.accountRecommendation);
ok(rec.accountRecommendation && rec.accountAmount === "$95,000" && rec.portfolioId === "TD_CORE_AA_BALANCED_GROWTH", "recommendation matched portfolio by partial name, amount formatted");
ok(d.options.draft === true, "DRAFT tag still on");
await page.waitForTimeout(300);
const recPages = await page.locator("#pages .page.recommendation-page").count();
ok(recPages === 2, "each recommendation on its own page (" + recPages + ")");
ok(await page.locator("#pages .page.household-summary-page").count() === 1, "one Our recommendations page");
await page.evaluate(() => { setInvestorProfile("Balanced Growth"); render(); });
const hhText = await page.textContent("#pages .household-summary-page");
ok(/Balanced Growth Investor/.test(hhText) && /\$495,000/.test(hhText), "summary shows the profile and the household total");
await page.locator("#pages .page.household-summary-page").scrollIntoViewIfNeeded();
await shot("06b-household-summary");
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
ok(d.sections.find(s => s.accountRecommendation).blocks[0].portfolioId === "TD_CORE_DIVIDEND_EQUITY", "portfolio changed from the inspector");
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
for (const [tab, n] of [["start", "11-start"], ["style", "12-style"], ["finish", "13-finish"]]) {
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

ok(errors.length === 0, "no script errors" + (errors.length ? ":\n    " + errors.join("\n    ") : ""));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
