// Mounts vendored Monaco (vendor/monaco-editor/min/vs, via vendor.sh) through
// its AMD loader. No CDN fetch — the classroom hub has no internet uplink, so
// everything the loader requests must resolve under vendor/.
let editor = null;

function loadMonaco() {
  return new Promise((resolve) => {
    if (window.monaco) return resolve(window.monaco);
    const loader = document.createElement("script");
    loader.src = "vendor/monaco-editor/min/vs/loader.js";
    loader.onload = () => {
      require.config({ paths: { vs: "vendor/monaco-editor/min/vs" } });
      require(["vs/editor/editor.main"], () => resolve(window.monaco));
    };
    document.head.appendChild(loader);
  });
}

export async function mountEditor(host, { initialValue, onRun }) {
  const monaco = await loadMonaco();
  editor = monaco.editor.create(host, {
    value: initialValue,
    language: "python",
    theme: "vs-dark",
    minimap: { enabled: false },
    fontSize: 14,
    automaticLayout: true,
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
  return editor;
}

export function getValue() {
  return editor ? editor.getValue() : "";
}

export function setValue(value) {
  if (editor) editor.setValue(value);
}

// Blocks mode shows the generated JS here read-only — a preview, not a
// second editable copy that could drift from the blocks.
export function setReadOnly(readOnly) {
  if (editor) editor.updateOptions({ readOnly });
}
