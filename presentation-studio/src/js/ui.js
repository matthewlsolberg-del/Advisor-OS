/* ==========================================================================
   ui.js — small interface helpers shared by Presentation Studio and
   Portfolio Builder: element lookup, toasts, the modal, clipboard, files.
   Both pages provide #modal, #modalTitle, #modalBody and #toast.
   ========================================================================== */

const $  = (id) => document.getElementById(id);

const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function toast(msg, ms){
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms || 2600);
}

async function copyText(text, msg, ms){
  try { await navigator.clipboard.writeText(text); toast(msg || "Copied", ms); }
  catch {
    /* some locked-down browsers refuse the clipboard: show it, selected, to copy by hand */
    showModal("Copy this", "<p class='hint'>Press <b>Ctrl+C</b> to copy the selected text.</p><textarea id='copyBox' rows='16' class='mono'></textarea>");
    $("copyBox").value = text; $("copyBox").focus(); $("copyBox").select();
  }
}

function downloadFile(name, text, type){
  const blob = new Blob([text], {type: type || "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function inspBtn(text, on, cls){
  const b = el("button", "btn btn-mini " + (cls || ""));
  b.type = "button";
  b.textContent = text;
  b.onclick = on;
  return b;
}

function pickFile(accept, cb){
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = accept;
  inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); };
  inp.click();
}

function showModal(title, html, opts){
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").querySelector(".modal-card").classList.toggle("is-wide", !!(opts && opts.wide));
  $("modal").hidden = false;
  $("modalBody").scrollTop = 0;
}

function hideModal(){ $("modal").hidden = true; }
