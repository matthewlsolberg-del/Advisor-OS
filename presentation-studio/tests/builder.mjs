// End-to-end test for the Portfolio Builder, in headless Chromium, offline.
//   NODE_PATH=$(npm root -g) node tests/builder.mjs [screenshot-dir]
// Uses the household from the recording: a Balanced Growth investor; Matt has an
// RRSP, TFSA and LIRA; Kelsey a spousal RRSP and TFSA; jointly a non-registered account.
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const file = "file://" + path.resolve(here, "../dist/MHWG_Portfolio_Builder.html");
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, offline: true });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await ctx.newPage();
const errors = [], requests = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("request", r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };
const A = () => page.evaluate(() => { const a = analyse(); return {total: a.total, equity: a.equity, status: a.status,
  issues: a.issues.map(i => i.level + ": " + i.t), combined: a.combined}; });

await page.goto(file);
await page.waitForTimeout(800);

console.log("Starting state");
let a = await A();
ok(await page.locator(".pb-acct").count() === 4, "starts with a sample household of four accounts");
ok(await page.evaluate(() => hh.accounts.every(x => x.portfolioId === "TD_CORE_AA_BALANCED_GROWTH")), "new accounts start on the profile's matching model");
await shot("b01-start");

console.log("Typing it in by hand");
await page.fill("#fldHousehold", "Matt & Kelsey Solberg");
const names = page.locator(".pb-person-head input");
await names.nth(0).fill("Matt");
await names.nth(1).fill("Kelsey");
const vals = page.locator(".pb-val");
await vals.nth(0).fill("250000"); await vals.nth(0).blur();
ok(await vals.nth(0).inputValue() === "$250,000", "amount formats as dollars on leaving the box");
await page.waitForTimeout(400);
a = await A();
ok(a.total === 250000, "household total updates (" + a.total + ")");
ok(a.issues.some(i => /no dollar amount/.test(i)), "accounts without an amount are flagged");

console.log("Loading the recording's household as JSON");
await page.evaluate(() => openPasteJSON());
await shot("b02-paste-json");
await page.fill("#pjBox", "Sure! Here it is:\n```json\n" + JSON.stringify({
  household: "Matt & Kelsey Solberg", profile: "Balanced Growth",
  people: [
    { name: "Matt", accounts: [
      { type: "RRSP", value: 250000, portfolio: "Balanced Growth" },
      { type: "TFSA", value: "95k", portfolio: "Growth" },
      { type: "LIRA", value: "$120,000", portfolio: "Balanced" } ] },
    { name: "Kelsey", accounts: [
      { type: "Spousal RRSP", value: 180000, portfolio: "Balanced Growth" },
      { type: "TFSA", value: 90000, portfolio: "Growth" } ] } ],
  joint: [ { type: "Joint Non-Registered Account", value: 300000, portfolio: "Balanced", howItFits: ["Money you may draw on first."] } ]
}, null, 2) + "\n```");
await page.click("#pjGo");
await page.waitForTimeout(500);
a = await A();
ok(a.total === 1035000, "total of the six accounts is $1,035,000 (" + a.total + ")");
// by hand: equity of each TD Core model x dollars
const eq = { bg: 17.9 + 25.6 + 15.9, g: 20.7 + 29.7 + 18.8, b: 12.0 + 19.3 + 11.9 };
const tot = { bg: 100.0, g: 100.1, b: 99.9 }; // each model's published allocation adds to this (rounding)
const e = v => eq[v] / tot[v] * 100;
const expect = (250000 * e("bg") + 95000 * e("g") + 120000 * e("b") + 180000 * e("bg") + 90000 * e("g") + 300000 * e("b")) / 1035000;
ok(Math.abs(a.equity - expect) < 0.05, "combined equities " + a.equity.toFixed(2) + "% match a hand calculation (" + expect.toFixed(2) + "%)");
ok(a.status === "within", "Balanced Growth household lines up with the 50–70% range");
const pages = await page.locator("#pages .page").count();
const recPages = await page.locator("#pages .page.recommendation-page").count();
ok(recPages === 6, "one model page per account (" + recPages + "), " + pages + " pages in all");
ok(await page.locator("#pages .page-overflow").count() === 0, "nothing runs off a page");
ok(await page.locator("#pages .pb-profile").count() === 1 && await page.locator("#pages .pb-table").count() === 1, "investor profile page and household table are drawn");
ok((await page.textContent("#pages")).includes("Spousal RRSP"), "Kelsey's spousal RRSP is in the document");
await shot("b03-loaded");
for (const [i, n] of [[0, "b04-cover"], [1, "b05-profile"], [2, "b06-summary"], [3, "b07-model-page"]]) {
  await page.locator("#pages .page").nth(i).scrollIntoViewIfNeeded();
  if (shots) await page.locator("#pages .page").nth(i).screenshot({ path: path.join(shots, n + ".png") });
}

console.log("Out of range");
await page.locator(".pb-model").nth(5).selectOption("TD_CORE_NORTH_AMERICAN_EQUITY");
await page.locator(".pb-model").nth(2).selectOption("TD_CORE_NORTH_AMERICAN_EQUITY");
await page.waitForTimeout(300);
a = await A();
ok(a.status === "above" && a.issues[0].startsWith("bad:"), "switching to equity-only models flags the household as above range (" + a.equity.toFixed(1) + "%)");
await page.locator("#checkCard").scrollIntoViewIfNeeded();
await shot("b08-out-of-range");
await page.click("#btnUndo"); await page.click("#btnUndo");
a = await A();
ok(a.status === "within", "undo puts it back");

console.log("Profiles");
await page.click('.profile-card:has-text("Conservative Income")');
a = await A();
ok(a.status === "above", "same accounts are too aggressive for Conservative Income");
await page.click('.profile-card:has-text("Balanced Growth")');
await page.click("#btnProfiles");
await shot("b09-profiles");
await page.fill('.pe-row[data-i="3"] input[data-k="equityMax"]', "52");
await page.click("#peSave");
a = await A();
ok(a.status === "above", "an edited range is used straight away");
await page.evaluate(() => { investorProfiles = structuredClone(DEFAULT_PROFILES); saveProfiles(); rebuildRail(); render(); });

console.log("Save and reopen");
const saved = await page.evaluate(() => JSON.stringify(hh));
await page.evaluate(() => { hh = newHousehold(); rebuildRail(); render(); });
await page.evaluate(t => loadHouseholdText(t), saved);
a = await A();
ok(a.total === 1035000, "a saved household file opens again");
await page.reload(); await page.waitForTimeout(600);
a = await A();
ok(a.total === 1035000, "the working copy survives a reload");

ok(requests.length === 0, "no network requests (" + requests.length + ")");
ok(errors.length === 0, "no script errors" + (errors.length ? ":\n    " + errors.join("\n    ") : ""));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
