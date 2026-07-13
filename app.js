import { connect } from "./robot-api.js";
import { mountEditor, getValue } from "./editor.js";

const DRAFT_KEY = "ide.draft";
const HOST_KEY = "ide.host";
const CREDS_KEY = "ide.creds"; // {username} only — never persist the password

const DEFAULT_SCRIPT = `// robot.move({left, right, durationMs}) drives; left/right are signed
// -255..255, durationMs defaults to 400 and clamps at 4000 (the firmware's
// watchdog floor — CONTRACT.md § Safety floor). robot.telemetry reads the
// latest imu/sys sample. Ctrl/Cmd-Enter runs.
await robot.move({ left: 120, right: 120, durationMs: 400 });
await sleep(500);
await robot.stop();
log("done");
`;

let session = null;
let running = false;

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
  const username = $("team-input").value.trim();
  const password = $("pass-input").value;
  localStorage.setItem(HOST_KEY, host);
  localStorage.setItem(CREDS_KEY, JSON.stringify({ username }));

  setStatus("connecting…", "pending");
  const s = connect(host, { username, password });
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

  const body = getValue();
  localStorage.setItem(DRAFT_KEY, body);
  // A team's own robot (session.ownId) is known the moment we're connected —
  // list it first regardless of whether telemetry has arrived yet, so
  // `robot` (robots[0]) is never null just because the rover hasn't
  // published its first imu/sys sample.
  const ids = session.ownId
    ? [session.ownId, ...session.knownIds().filter((id) => id !== session.ownId)]
    : session.knownIds();
  const robots = ids.map(session.robot);
  const robot = robots[0] || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    // AsyncFunction so a top-level `await` works in the student's script —
    // same shape workbench/docs/scripts.js runs user code in. The safety
    // boundary is the firmware's drive watchdog, not a JS sandbox here: a
    // malformed or malicious script can't out-run the motor timeout.
    const fn = new (Object.getPrototypeOf(async function () {}).constructor)(
      "robot",
      "robots",
      "sleep",
      "log",
      body
    );
    const ret = await fn(robot, robots, sleep, log);
    if (ret !== undefined) log("→", ret);
  } catch (err) {
    log("Error:", err.message || String(err));
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

async function init() {
  $("host-input").value = localStorage.getItem(HOST_KEY) || defaultHost();
  const savedCreds = JSON.parse(localStorage.getItem(CREDS_KEY) || "{}");
  if (savedCreds.username) $("team-input").value = savedCreds.username;

  $("conn-form").addEventListener("submit", (e) => {
    e.preventDefault();
    doConnect();
  });
  $("run-btn").addEventListener("click", runScript);

  await mountEditor($("editor"), {
    initialValue: localStorage.getItem(DRAFT_KEY) || DEFAULT_SCRIPT,
    onRun: runScript,
  });
}

init();
