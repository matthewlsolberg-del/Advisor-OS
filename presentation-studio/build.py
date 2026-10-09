#!/usr/bin/env python3
"""Build the MHWG tools, each into one self-contained, offline HTML file.

    python3 build.py   -> dist/MHWG_Presentation_Studio.html
                          dist/MHWG_Portfolio_Builder.html

Both share the same engine (brand, page layout, charts, portfolio profiles).

The output has no outside dependencies at all: fonts, brand marks, scripts and
the standard portfolio profiles are all inlined, and the page's Content
Security Policy forbids any network request. Partners only ever need the one
file in dist/ — open it in Edge or Chrome.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

# Load order matters: each module uses what the ones before it define.
TARGETS = [
    {
        "out": "MHWG_Presentation_Studio.html", "page": "index.html", "version": "9.1",
        "css": ["css/studio.css"],
        "vendor": ["vendor/pdf.worker.min.js", "vendor/pdf.min.js"],   # pdf.js, at the very bottom
        "scripts": [
            "brand.js",       # house standards, block factory, templates
            "prompts.js",     # the Copilot prompt pack
            "parse.js",       # paste format, Word reading
            "pdfread.js",     # PDFs read with their layout (uses the embedded pdf.js)
            "facts.js",       # Croesus reports and financial plans -> facts
            "viz.js",         # charts and infographics as SVG
            "render.js",      # blocks to pages (the layout engine)
            "ui.js",          # toasts, modal, clipboard, files
            "examples.js",    # worked examples per section
            "docxout.js",     # the Word draft
            "workflow.js",    # status, paste-with-preview, the Finish check
            "portfolios.js",  # portfolio library and account recommendations
            "smart.js",       # pre-filled drafts from the facts, Copilot fills the words
            "content.js",     # ready-written wording: prospect meeting, planning topics
            "automation.js",  # Presentation JSON, smart paste, per-block Copilot
            "intake.js",      # the Start tab (reports in) and the one-button Copilot step
            "app.js",         # the studio itself
        ],
    },
    {
        "out": "MHWG_Portfolio_Builder.html", "page": "builder.html", "version": "1.0",
        "css": ["css/studio.css", "css/builder.css"],
        "scripts": [
            "brand.js", "parse.js", "viz.js", "render.js", "ui.js",
            "portfolios.js",  # the same library and one-page model profiles
            "builder.js",     # households, accounts, investor profiles, the document
        ],
    },
]


def read(rel):
    return (SRC / rel).read_text(encoding="utf-8")


def build(t, standard):
    js = "\n;\n".join(read("js/" + name) for name in t["scripts"])
    marker = "/*@STANDARD_PORTFOLIOS@*/[]"
    if marker not in js:
        sys.exit("build: portfolios.js is missing the STANDARD_PORTFOLIOS marker")
    js = js.replace(marker, json.dumps(standard, ensure_ascii=False, separators=(",", ":")))
    if "</script" in js.lower():
        sys.exit("build: a script contains '</script' and would end the tag early")

    html = read(t["page"])
    parts = {
        "{{FONTS}}": read("assets/fonts.css"),
        "{{STUDIO_CSS}}": "\n".join(read(c) for c in t["css"]),
        "{{DOC_CSS}}": read("css/document.css"),
        "{{BRAND_MARKS}}": read("assets/brand-marks.html"),
        "{{VERSION}}": t["version"],
        "{{SCRIPTS}}": js,
    }
    if t.get("vendor"):
        vendor = "\n".join(read(v) for v in t["vendor"])
        if "</script" in vendor.lower():
            sys.exit("build: a vendored script contains '</script'")
        parts["{{VENDOR}}"] = vendor
    for key, value in parts.items():
        if key not in html:
            sys.exit("build: " + t["page"] + " is missing " + key)
        html = html.replace(key, value)
    leftover = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if leftover:
        sys.exit("build: unreplaced placeholders " + ", ".join(leftover))

    out = ROOT / "dist" / t["out"]
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"built {out.relative_to(ROOT)}  ({out.stat().st_size / 1e6:.2f} MB, v{t['version']})")


def main():
    standard = json.loads(read("assets/standard-portfolios.json"))
    only = sys.argv[1:]
    for t in TARGETS:
        if not only or any(o.lower() in t["out"].lower() for o in only):
            build(t, standard)


if __name__ == "__main__":
    main()
