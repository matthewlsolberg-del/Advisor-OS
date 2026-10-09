# Vendored libraries

- `pdf.min.js`, `pdf.worker.min.js` — Mozilla pdf.js 3.11.174 (`pdfjs-dist`, build/), Apache-2.0
  (`PDFJS_LICENSE.txt`). Used only to read text out of dropped PDFs, on this computer.
  It runs in "fake worker" mode on the page itself (the page's security policy allows no
  workers or network), with `isEvalSupported: false`.
  Inlined at the very bottom of the built HTML; nobody should need to edit it.
