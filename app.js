import { connect } from "./robot-api.js";
import { mountEditor, getValue, setValue, setReadOnly } from "./editor.js";
import { mountBlocks, getBlocksCode, resizeBlocks, blocksMounted } from "./blocks.js";
import { runPython } from "./py-runtime.js";

// "-py" so drafts from the JS-language era (pre-Python swap) can't load as
// Python and greet a returning student with a SyntaxError.
const DRAFT_KEY = "ide.draft-py";
const HOST_KEY = "ide.host";
const MODE_KEY = "ide.mode"; // "blocks" | "code"

const DEFAULT_SCRIPT = `# robot.move(left=…, right=…, duration_ms=…) drives; left/right are signed
# -255..255, duration_ms defaults to 400 and clamps at 4000 (the firmware's
# watchdog floor — CONTRACT.md § Safety floor). robot.telemetry reads the
# latest imu/sys sample. Ctrl/Cmd-Enter runs.
await robot.move(left=120, right=120, duration_ms=400)
await sleep_ms(500)
await robot.stop()
print("done")
`;

let session = null;
let running = false;
let mode = null; // set by setMode during init

function $(id) {
  return document.getElementById(id);
}

function log(...args) {
  const out = $("console");
  const line = document.createElement("div");
  line.textContent = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function setStatus(text, cls) {
  const chip = $("status-chip");
  chip.textContent = text;
  chip.className = `chip ${cls || ""}`;
}

function renderTelemetry(id, data) {
  $("telemetry").textContent = JSON.stringify({ id, ...data }, null, 2);
}

async function doConnect() {
  const host = $("host-input").value.trim() || location.hostname;
  localStorage.setItem(HOST_KEY, host);

  setStatus("connecting…", "pending");
  // No credentials at all — not empty ones. An empty username is still a
  // username on the wire; the rover firmware sends none, and so do we.
  const s = connect(host);
  s.client.on("error", (err) => {
    setStatus("connect error", "error");
    log("connect error:", err.message);
  });
  s.client.on("close", () => setStatus("disconnected", "error"));

  try {
    await s.ready;
    session = s;
    setStatus(`connected → ${host}`, "ok");
    session.onTelemetry(renderTelemetry);
  } catch (err) {
    setStatus("connect failed", "error");
    log("connect failed:", err.message || String(err));
  }
}

// Blocks and JS are two separate drafts, not two views of one document — a
// blocks→JS conversion is easy, but JS→blocks is lossy, so pretending they're
// the same file would eat hand edits. Run executes whichever view is active.
function refreshPreview() {
  if (mode !== "blocks") return;
  setValue("# the Python your blocks make\n" + getBlocksCode());
}

function setMode(next) {
  if (mode === next) return;
  if (mode === "code") localStorage.setItem(DRAFT_KEY, getValue());
  mode = next;
  localStorage.setItem(MODE_KEY, next);

  const isBlocks = next === "blocks";
  $("mode-blocks").setAttribute("aria-pressed", String(isBlocks));
  $("mode-code").setAttribute("aria-pressed", String(!isBlocks));
  $("editor-pane").classList.toggle("blocks", isBlocks);
  $("blockly").hidden = !isBlocks;
  $("preview-label").hidden = !isBlocks;

  if (isBlocks) {
    // Inject on first entry, not at startup — Blockly sizes itself from the
    // host div, which must be visible and laid out.
    if (!blocksMounted()) mountBlocks($("blockly"), { onChange: refreshPreview });
    resizeBlocks();
    setReadOnly(true);
    refreshPreview();
  } else {
    setReadOnly(false);
    setValue(localStorage.getItem(DRAFT_KEY) || DEFAULT_SCRIPT);
  }
}

async function runScript() {
  if (running) return;
  if (!session) {
    log("not connected — enter a hub host and Connect first");
    return;
  }
  running = true;
  const runBtn = $("run-btn");
  runBtn.disabled = true;
  runBtn.textContent = "Running…";
  $("console").replaceChildren();

  const body = mode === "blocks" ? getBlocksCode() : getValue();
  if (mode === "code") localStorage.setItem(DRAFT_KEY, body);

  try {
    // MicroPython-WASM in the tab (py-runtime.js) — top-level `await` works,
    // print() streams to the console pane. The safety boundary is the
    // firmware's drive watchdog, not interpreter sandboxing: a malformed or
    // malicious script can't out-run the motor timeout.
    await runPython(body, { session, print: log });
  } catch (err) {
    // MicroPython surfaces student errors as a JS Error carrying the
    // Python traceback text — show it whole, it's the teaching signal.
    log(err.message || String(err));
  } finally {
    running = false;
    runBtn.disabled = false;
    runBtn.textContent = "Run";
  }
}

// location.hostname is the right guess when hubd itself serves this page
// (loaded from hub.local/ide/ → already "hub.local", zero config — same
// shape dashboard.html uses). It's wrong specifically on the GH Pages copy,
// where the origin is better-robotics.github.io and has no broker of its
// own — "hub.local" is the one hostname this project's docs always use.
function defaultHost() {
  return /\.github\.io$/.test(location.hostname) ? "hub.local" : location.hostname;
}

// Framed by the hub dashboard's Code panel: the shell above already names the
// host and carries the identity, so our own header would be a second, emptier
// copy of chrome the user is already looking at.
const embedded = window.self !== window.top;

async function init() {
  // A shared link can carry the hub (/ide/?host=rover-abc.local): the link's
  // whole point is naming the host, so it outranks the remembered one —
  // which Connect then overwrites, persisting the link's host like any typed
  // host. On the Pages copy it only prefills: auto-connect stays off there,
  // since an https page can't open ws:// (mixed content) no matter what the
  // param says.
  const urlHost = new URLSearchParams(location.search).get("host");
  $("host-input").value =
    urlHost || localStorage.getItem(HOST_KEY) || defaultHost();
  if (embedded) {
    document.body.classList.add("embedded");
    // The chip lives inside the header we're hiding, so it MOVES rather than
    // getting restyled — "am I actually talking to a rover" is the one thing in
    // that header no shell can answer on our behalf.
    document.querySelector(".pane-bar").appendChild($("status-chip"));
  }

  $("conn-form").addEventListener("submit", (e) => {
    e.preventDefault();
    doConnect();
  });
  $("run-btn").addEventListener("click", runScript);
  $("mode-blocks").addEventListener("click", () => setMode("blocks"));
  $("mode-code").addEventListener("click", () => setMode("code"));
  // Ctrl/Cmd-Enter runs from blocks mode too (Monaco owns the shortcut only
  // while focused; runScript's `running` guard absorbs the double fire).
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runScript();
  });

  await mountEditor($("editor"), {
    initialValue: localStorage.getItem(DRAFT_KEY) || DEFAULT_SCRIPT,
    onRun: runScript,
  });
  // Blocks for first-timers — the classroom on-ramp; anyone with a typed
  // draft from before this view existed keeps landing in JS.
  setMode(
    localStorage.getItem(MODE_KEY) ||
      (localStorage.getItem(DRAFT_KEY) ? "code" : "blocks")
  );

  // Connect on load wherever the host needs no asking: hubd serving this page
  // means location.hostname IS the hub, and there are no credentials left to
  // collect, so a Connect click was a button that only ever had one answer.
  // The GH Pages copy is the exception — its origin has no broker, and the
  // hub.local guess would fail on load in front of someone just browsing.
  if (!/\.github\.io$/.test(location.hostname) && location.hostname) doConnect();
}

init();
