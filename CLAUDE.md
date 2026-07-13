# ide — project context

The classroom code editor for [`better-robotics/hub`](https://github.com/better-robotics/hub):
Blockly + Monaco + a thin Python `robot` API, running entirely in the browser
tab, talking to a hub over its existing MQTT/WebSocket contract. See
`README.md` for the pitch; this file is implementation conventions.

## Python is the student language (team decision)

Students write Python (or blocks that generate it) — the Better Robotics
team's platform decision (server-side Python; see `duke/robotics/CLAUDE.md`
§ V1 Roadmap). The browser stays the interpreter so zero-install holds:
`py-runtime.js` runs vendored **MicroPython-WASM** (~550 KB vs Pyodide's
~10 MB — small enough that the ESP32 hub serves it too). JS survives only as
implementation (`robot-api.js`, the shell) — no student-facing JS surface,
and the JS-era draft key is retired (`ide.draft-py`) so old drafts can't load
as Python.

## The one rule this repo exists to prove

**Everything possible lives client-side; the firmware gets nothing new.** A
script's `robot.move()`/`.led()`/`.telemetry` calls are just `mqtt.publish`/
`subscribe` against topics `dashboard.html` already uses (`envelopes/pwm.json`,
`envelopes/rpc_set_led.json`, imu/sys). Before adding any feature that would
need a firmware change, ask whether it can instead be expressed as an existing
envelope from a new angle — the rover doesn't know or care that a request came
from a code editor instead of a joystick.

## No CDN, ever, at runtime

`vendor.sh` fetches Monaco (`min/vs`, AMD loader), mqtt.js (UMD bundle),
Blockly (UMD bundles + `msg/en` + `media/`), and MicroPython-WASM
(`micropython.mjs` + `.wasm` — servers must send `.mjs` as JS and `.wasm` as
`application/wasm`, or the ES-module import fails) into `vendor/` — gitignored,
fetched once locally, and re-fetched by CI before publishing. The classroom
hub has no internet uplink; a page that reaches out to a CDN mid-session
breaks the exact case this project is for. (Workbench's own editor pane
CDN-loads CodeMirror from esm.sh — don't repeat that here.) Two Blockly
specifics: its default `media` path is a **remote URL** — `blocks.js` must
keep pointing injection at `vendor/blockly/media/`; and its UMD wrappers take
the AMD branch if `window.define` exists, which Monaco's loader defines — the
script ordering that prevents this is commented in `index.html`.

## Two builds, one app

`build-esp32.sh` stages `dist-esp32/`: the identical app with
`editor-lite.js` (a textarea behind `editor.js`'s exact interface) shipped
*as* `editor.js`, and no Monaco — ~400 KB gzipped, sized for embedding in the
ESP32 hub role's firmware (`better-robotics/robot`, 4 MB flash). Build-time
file selection keeps runtime code free of per-destination logic; anything
added to the editor interface must be implemented in BOTH editor files.
`release.yml` publishes it as a second asset, `ide-esp32-dist.tar.gz`.

## Blocks view — an on-ramp, not a second API

`blocks.js` generators must emit the same readable Python a student would
type against the runtime prelude (`await robot.move(left=…)`, `sleep_ms`,
`print`) — if a block needs anything the code view doesn't teach, it doesn't
belong. Blocks and Python are two separate localStorage drafts (`ide.blocks`
/ `ide.draft-py`), never two views of one document: blocks→Python is the
read-only preview under the workspace; Python→blocks doesn't exist (lossy).
Run executes whichever view is active through the same MicroPython runner.

## Run model — no sandbox, and that's deliberate

Student scripts run in the page's MicroPython interpreter (`py-runtime.js`
`runPython`; one interpreter per page lifetime, REPL semantics — the prelude
re-binds `robot`/`robots` fresh each run). Structured data crosses the
JS↔Python bridge as JSON strings, never JsProxy graphs, so tracebacks stay
Python-shaped; student line numbers are offset by `PRELUDE_LINES`. The safety
boundary is the firmware's per-message drive watchdog (400ms default / 4000ms
clamp, `rover_role.c` `motor_apply`) — it holds against a malformed *or*
malicious payload by design (CONTRACT.md § Safety floor), so the browser side
doesn't need its own isolation to keep a bad script from running a rover away.

## Envelope contract — read `hub/CONTRACT.md` first

Topics, envelope shapes, and the ACL scoping model are owned there, not here.
`robot-api.js` is a client of that contract, never a second source of truth
for it — if a topic or field name needs to change, change it in `hub` and
mirror it here, same direction `robot` (the ESP32 firmware) already follows.

Known gap: `set_led`'s request/response correlation isn't wired
firmware-side yet (`hub` CONTRACT.md, open thread #4) — `robot.led()` times
out gracefully rather than assuming a reply arrives.

## Where this is served

Two destinations, one build, no per-destination logic (`README.md` § Where
this is served): GH Pages for the no-Pi tiers, the Pi's `HUB_IDE_DIR` for the
classroom-primary offline case. The Pi side isn't wired yet — it needs this
repo pushed with a built artifact (tag or `gh-pages` branch) before
`hub/pi`'s `deploy/install.sh` / `build-image` can point at it.

## Not in this repo (deliberately)

Firmware (`better-robotics/robot`), the wire contract + Pi hub
(`better-robotics/hub`), the standalone BLE-paired workbench IDE
(`better-robotics/workbench` — drifting from the classroom model, not the
thing this project extends).
