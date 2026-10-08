# Presentation Studio — quick start for partners

**Open `dist/MHWG_Presentation_Studio.html` in Edge or Chrome.** That one file is the whole
program. It never connects to the internet; client information stays on your computer.

The first time it opens you'll see a welcome screen: pick what you're making, type the client's
name, and choose how you want to fill it in. You can mix all three ways in one presentation.

---

## The five tabs (left to right)

| Tab | What you do there |
|---|---|
| **1 Start** | Pick the template, fill in the cover (client, title, advisor, date), choose report or slides. |
| **2 Build** | See every section and whether it's written. Add sections, blocks and account recommendations. |
| **3 Copilot & JSON** | Copy a prompt into Copilot, paste the answer back. Or paste JSON. |
| **4 Style** | Cover style, page style, which pages are included, team, contact, disclosures. |
| **5 Finish** | A checklist of what's left, the DRAFT tag, Save, Export PDF. |

The numbers on the tabs tell you how far along you are: **Build 3/6** means three of six sections
are written; **Finish 2** means two things still need attention.

---

## Way 1 — Type it yourself

1. **Click any text on the page and type over it.** Press Enter (or click away) when you're done.
2. **Point at a block** on the page and a small toolbar appears: **+ Add below**, **✦ Copilot**,
   move up/down, duplicate, delete.
3. **Click a block** to open all its settings on the right (chart numbers, table rows, bullet
   style…).
4. On **Build**, add a whole section from the list (Executive summary, What we heard, Cash flow…).

Made a mistake? **Undo** (↶ in the top bar, or Ctrl+Z). Undo also brings back a deleted section
or a replaced template.

## Way 2 — Copilot writes it

On **Copilot & JSON**:

1. *(Optional)* Type the one thing the client should take away, and the key figures. These go
   into every prompt so Copilot uses your numbers exactly.
2. Choose **Whole presentation — as text** and press **Copy the prompt**.
3. In Copilot, paste the prompt and add your notes (or attach the plan, meeting notes and
   statements) where it says NOTES.
4. Copy Copilot's whole answer, paste it into box 3, press **Preview & lay it out**.
5. You'll see what it found before anything changes. Press the button and it's laid out.

Want to redo one section? Choose **One section**, or point at the section heading on the page
and press **✦ Copilot**. Want to improve one paragraph, list or chart? Point at it and press
**✦ Copilot** — you get a prompt for just that block and a box to paste the answer.

Charts, tables and pictures you've already built are **kept** when Copilot's words come in.

## Way 3 — Paste JSON

For a coder, a spreadsheet macro, or Copilot asked for **Whole presentation — as JSON** (which
also lets Copilot build charts and choose block types). Paste it into the same box 3. See
[`PRESENTATION_JSON.md`](PRESENTATION_JSON.md) for the format, and
[`../examples/sample-presentation.json`](../examples/sample-presentation.json) for a full example.

---

## Account recommendations

**Build → + Account recommendation page.** Choose the account, the amount and the portfolio,
then up to four "How it fits the plan" points (there's a Copilot prompt for those too). Each one
is a locked, one-page portfolio profile — the approved wording always matches the library.

To change one later, click it on the page: the account, amount, portfolio and points are on the
right.

**Portfolio library** (Copilot & JSON → Portfolio library): the eight TD Core standard profiles are
built in. To add another, copy the portfolio-profile prompt, run it in Copilot with the fact sheet
attached, and paste the JSON back. Use **Export library backup** to share your library with a
partner; they use **Import a backup**.

---

## Finishing

1. **Finish** lists anything left: empty sections, sample numbers, `[NEEDS ADVISOR INPUT]` notes
   from Copilot, charts without captions, anything that would be cut off. Click an item to go to it.
2. Leave **DRAFT** on until compliance has reviewed it.
3. **Save** writes a `.mhwg.json` working file to Downloads — that's the file you **Open** next time.
4. **Export PDF** opens the print window. Choose *Save as PDF*, margins *None*, and turn
   *Background graphics* **on**.

The browser also keeps a working copy, so closing the window by accident loses nothing — but the
saved file is your real backup.

## Paste-format cheat sheet

```
# Section heading          ## Sub-heading
- bullet                   1. numbered
> One sentence             → a callout
Label: value               → a fact row
$1.2M | Projected at 65 | note    → a key-number card
| Option | Cost |          → a table (or paste cells from Excel)
1. Title - what happens. (Owner: Us, When: 30 days)   → an action plan
**bold**   ==one highlighted phrase==
```
