// Drops real reports into the built Studio (offline) and checks the drafts it lays out.
//   NODE_PATH=$(npm root -g) node tests/intake.mjs <croesus.pdf> <plan.pdf> [screenshot-dir]
// Client reports are never committed to the repo; pass your own copies.
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const file = "file://" + path.resolve(here, "../dist/MHWG_Presentation_Studio.html");
const [croesus, plan, shots] = process.argv.slice(2);
if (!croesus || !plan) { console.log("usage: intake.mjs <croesus.pdf> <plan.pdf> [shots]"); process.exit(2); }
if (shots) fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, offline: true });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await ctx.newPage();
const errors = [], requests = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error" && !/Content Security Policy|eval/.test(m.text())) errors.push(m.text()); });
page.on("request", r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + ".png") }); };
const pageShot = async (i, n) => { if (!shots) return; const p = page.locator("#pages .page").nth(i); await p.scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(shots, n + ".png") }); };
const D = () => page.evaluate(() => JSON.parse(JSON.stringify(deck)));
const titles = async () => (await D()).sections.map(s => s.title);

await page.goto(file);
await page.waitForTimeout(700);
ok(await page.isVisible('.panel[data-panel="start"].is-active'), "opens on Start");
await shot("i01-start");

console.log("Croesus report");
await page.setInputFiles("#fileInput", croesus);
await page.waitForFunction(() => deck.facts && deck.facts.portfolio, null, { timeout: 20000 });
await page.waitForTimeout(400);
let d = await D();
const P = d.facts.portfolio;
const money = n => "$" + Math.round(n).toLocaleString("en-CA");
ok(P.accounts.length > 0 && P.holdings.length > 0 && P.periods.length > 0, "report read: " + P.found.join(", "));
ok(d.meta.client && d.meta.client === P.household, "client name filled from the report");
ok(d.meta.kind === "portfolio_review", "kind: portfolio review");
ok(d.sections.length >= 5, "draft laid out: " + (await titles()).join(" / "));
const txt = await page.textContent("#pages");
ok(txt.includes(money(P.total)) && P.periods.every(x => txt.includes(x.value + "%")), "headline figures on the page");
ok(P.accounts.every(a => txt.includes(a.label) && txt.includes(money(a.value))), "every account on the page, named the house way");
ok(/What we recommend/.test(txt) && d.sections.find(s => s.title === "What we recommend").blocks.some(b => b.type === "actions" && b.items.length), "data-driven suggestions present");
ok(await page.locator("#pages .page-overflow").count() === 0, "nothing runs off a page");
ok(await page.locator("#sourceList .source-row").count() === 1, "the report is listed as read");
await shot("i02-portfolio-draft");
const n = await page.locator("#pages .page").count();
for (let i = 0; i < Math.min(n, 9); i++) await pageShot(i, "i03-portfolio-p" + (i + 1));

console.log("Financial plan added");
await page.setInputFiles("#fileInput", plan);
await page.waitForFunction(() => deck.facts && deck.facts.plan, null, { timeout: 30000 });
await page.waitForTimeout(400);
d = await D();
ok(d.meta.kind === "portfolio_review", "kind stays portfolio review (it already uses a report)");
await page.click('#pieceGrid .piece-card:has-text("Financial plan summary")');
await page.waitForTimeout(400);
ok((await titles()).includes("Your goals") && (await titles()).includes("Closing the gap"), "plan summary: " + (await titles()).join(" / "));
const ptxt = await page.textContent("#pages");
const F = (await D()).facts.plan;
ok(ptxt.includes(money(F.netWorth)) && F.goals.every(g => ptxt.includes(g.name)) &&
   (!F.insights.saveMore || ptxt.includes(money(F.insights.saveMore))) && F.insights.protection.every(x => ptxt.includes(money(x.amount))), "plan figures on the page");
ok(await page.locator("#pages .page-overflow").count() === 0, "nothing runs off a page");
const pn = await page.locator("#pages .page").count();
for (let i = 0; i < Math.min(pn, 12); i++) await pageShot(i, "i04-plan-p" + (i + 1));

console.log("Annual review (both)");
await page.click('#pieceGrid .piece-card:has-text("Annual review")');
await page.waitForTimeout(400);
ok((await titles()).includes("Your accounts") && (await titles()).includes("Your goals"), "annual review uses both: " + (await titles()).length + " sections");
ok(await page.locator("#pages .page-overflow").count() === 0, "nothing runs off a page");

console.log("Copilot: one prompt, one answer");
await page.click('.rail-tab[data-panel="copilot"]');
await shot("i05-copilot");
const prompt = await page.evaluate(() => slotPrompt());
ok(prompt.includes("FACTS FROM THE REPORTS") && prompt.includes("■ glance") && prompt.includes(money(P.total)), "prompt carries the facts and the boxes");
ok(!P.accounts.some(a => prompt.includes(a.number)), "account numbers are not in the prompt");
const keys = await page.evaluate(() => slotBlocks().map(x => x.b.slot));
const answer = { slots: {} };
keys.forEach(k => { answer.slots[k] = k === "recommendations" ? [{ t: "Open a new TFSA", d: "Start with this year's room.", who: "You", when: "This month" }] : "Copilot wrote " + k + "."; });
await page.fill("#slotAnswer", "Here you go:\n```json\n" + JSON.stringify(answer) + "\n```");
await page.click("#btnApplySlots");
await page.waitForTimeout(300);
d = await D();
const filled = d.sections.flatMap(s => s.blocks).filter(b => b.slot && !b.seed).length;
ok(filled === keys.length, "every box filled (" + filled + "/" + keys.length + ")");
ok((await page.textContent("#pages")).includes("Open a new TFSA"), "the action plan came through");

console.log("Rebuild keeps written words");
await page.click('.rail-tab[data-panel="start"]');
page.once("dialog", dlg => dlg.accept());
await page.click("#btnBuild");
await page.waitForTimeout(300);
ok((await page.textContent("#pages")).includes("Copilot wrote glance."), "a rebuilt draft keeps Copilot's words");

console.log("Investment recommendation");
await page.click('.rail-tab[data-panel="start"]');
page.once("dialog", dlg => dlg.accept());
await page.click('#pieceGrid .piece-card:has-text("Investment recommendation")');
await page.waitForTimeout(300);
ok(await page.isVisible("#profileCard"), "investor profile card appears");
await page.selectOption("#fldProfile", "Balanced Growth");
await page.waitForTimeout(300);
d = await D();
const recs = d.sections.filter(s => s.accountRecommendation);
ok(recs.length === P.accounts.length && recs.every(s => s.portfolioId === "TD_CORE_AA_BALANCED_GROWTH"), "one page per account, on the Balanced Growth model");
ok(d.sections.some(s => s.recommendationOverview), "household summary page in front");
const rtxt = await page.textContent("#pages");
ok(rtxt.includes("Balanced Growth Investor") && (await page.textContent(".hh-total-card")).includes(money(P.total)), "summary shows the profile and the household total, to the dollar");
ok(await page.locator("#pages .page-overflow").count() === 0, "nothing runs off a page");
const rn = await page.locator("#pages .page").count();
for (let i = 0; i < Math.min(rn, 6); i++) await pageShot(i, "i06-rec-p" + (i + 1));

console.log("Finish");
await page.click('.rail-tab[data-panel="finish"]');
await shot("i07-finish");
ok(await page.locator("#checkList .check-row").count() > 0, "finish lists what is left");

ok(requests.length === 0, "no network requests (" + requests.length + ")");
ok(errors.length === 0, "no script errors" + (errors.length ? ":\n    " + errors.join("\n    ") : ""));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
