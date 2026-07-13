// The ESP32 build's editor — a plain <textarea> behind the same interface
// editor.js exposes, so app.js is byte-identical across builds. Monaco is
// ~15 MB of vendor tree; a 4 MB-flash hub can't carry it, and on that tier
// the Python view is a fallback (Blocks is the primary surface).
// build-esp32.sh ships this file AS editor.js in the slim bundle — never both.
let textarea = null;

export async function mountEditor(host, { initialValue, onRun }) {
  textarea = document.createElement("textarea");
  textarea.id = "editor-lite";
  textarea.value = initialValue;
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", "Script editor");
  textarea.addEventListener("keydown", (e) => {
    // Run is triggered by app.js's document-level listener; just keep the
    // keystroke from also inserting a newline.
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") e.preventDefault();
  });
  host.appendChild(textarea);
  return textarea;
}

export function getValue() {
  return textarea ? textarea.value : "";
}

export function setValue(value) {
  if (textarea) textarea.value = value;
}

export function setReadOnly(readOnly) {
  if (textarea) textarea.readOnly = readOnly;
}
