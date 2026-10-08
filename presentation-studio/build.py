#!/usr/bin/env python3
"""Build MHWG Presentation Studio into one self-contained, offline HTML file.

    python3 build.py            -> dist/MHWG_Presentation_Studio.html

The output has no outside dependencies at all: fonts, brand marks, scripts and
the standard portfolio profiles are all inlined, and the page's Content
Security Policy forbids any network request. Partners only ever need the one
file in dist/ — open it in Edge or Chrome.
"""
import json
import pathlib
import re
import sys

VERSION = "7.0"
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "MHWG_Presentation_Studio.html"

# Load order matters: each module uses what the ones before it define.
SCRIPTS = [
    "brand.js",       # house standards, block factory, templates
    "prompts.js",     # the Copilot prompt pack
    "parse.js",       # paste format, Word and PDF reading
    "viz.js",         # charts and infographics as SVG
    "render.js",      # blocks to pages (the layout engine)
    "examples.js",    # worked examples per section
    "docxout.js",     # the Word draft
    "workflow.js",    # status, paste-with-preview, the Finish check
    "portfolios.js",  # portfolio library and account recommendations
    "automation.js",  # Presentation JSON, smart paste, per-block Copilot
    "app.js",         # the studio itself
]


def read(rel):
    return (SRC / rel).read_text(encoding="utf-8")


def main():
    standard = json.loads(read("assets/standard-portfolios.json"))
    js = "\n;\n".join(read("js/" + name) for name in SCRIPTS)
    marker = "/*@STANDARD_PORTFOLIOS@*/[]"
    if marker not in js:
        sys.exit("build: portfolios.js is missing the STANDARD_PORTFOLIOS marker")
    js = js.replace(marker, json.dumps(standard, ensure_ascii=False, separators=(",", ":")))
    if "</script" in js.lower():
        sys.exit("build: a script contains '</script' and would end the tag early")

    html = read("index.html")
    parts = {
        "{{FONTS}}": read("assets/fonts.css"),
        "{{STUDIO_CSS}}": read("css/studio.css"),
        "{{DOC_CSS}}": read("css/document.css"),
        "{{BRAND_MARKS}}": read("assets/brand-marks.html"),
        "{{VERSION}}": VERSION,
        "{{SCRIPTS}}": js,
    }
    for key, value in parts.items():
        if key not in html:
            sys.exit("build: index.html is missing " + key)
        html = html.replace(key, value)
    leftover = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if leftover:
        sys.exit("build: unreplaced placeholders " + ", ".join(leftover))

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"built {OUT.relative_to(ROOT)}  ({OUT.stat().st_size / 1e6:.2f} MB, v{VERSION})")


if __name__ == "__main__":
    main()
