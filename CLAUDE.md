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
~10 MB). JS survives only as
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

## No third-party CDN, ever, at runtime

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

The one deliberate exception is `shell.html` (below): the ESP32-hub tier is
**online-only by design**, and its fetch target is this repo's own GitHub
Pages deploy — first-party, versioned with the app — never a third-party CDN.
The offline-classroom rule above still binds the Pi tier absolutely.

## shell.html — the ESP32-hub loader (one app, no second build)

The ESP32 hub can't embed this app (619 KB gzipped was 32% of the firmware
image — dropped 2026-07-16 so two A/B OTA slots fit the 4 MB part), and students can't just use the Pages
copy against a local hub: an **https page may not open `ws://`** (mixed
content), and a hub has no CA-signed cert for an mDNS name, so `wss://` can
never exist. But mixed-content blocking keys on the *document's* scheme, not
the subresources' origin — so `shell.html` (~2 KB, served by the firmware at
`/ide/`) fetches `index.html` live from Pages, injects
`<base href="https://better-robotics.github.io/ide/">`, and `document.write`s
it: every relative asset resolves to Pages (the browser supplies the TLS the
firmware lacks), while the document stays `http://<hub>` — where
`ws://<hub>:9001` is allowed and `location.hostname` still names the hub, so
auto-connect works unchanged. `document.write` keeps markup and app
atomically consistent (both come from the same Pages deploy) and executes
scripts in parser order, preserving the UMD-before-AMD ordering above.

**The contract this puts on the app:** `index.html` must stay CORS-fetchable
(GitHub Pages sends `Access-Control-Allow-Origin: *`), keep a matchable
`<head>`, and never grow an absolute same-origin URL (`/foo`) — those would
resolve to the chip, not Pages. `better-robotics/robot` vendors `shell.html`
(`tools/sync-ide-shell.sh --check` gates drift, same shape as its dashboard
sync). The old `dist-esp32/` lite build (editor-lite.js, a textarea standing
in for Monaco) is gone — the shell serves the *full* editor, since the
student's browser has no flash budget.

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

Three tiers, one build, no per-destination logic (`README.md` § Where this
is served): the Pi's `HUB_IDE_DIR` serves the full bundle for the
classroom-primary offline case (wired: `hub/pi`'s `deploy/install.sh` /
`build-image` fetch the `ide-v*` release asset); GH Pages is the canonical
online copy — both a directly-usable dev/preview surface and the asset
origin the ESP32 hub's `shell.html` loads from; the ESP32 hub serves only
that shell (§ above), online-only by design.

## Not in this repo (deliberately)

Firmware (`better-robotics/robot`), the wire contract + Pi hub
(`better-robotics/hub`), the standalone BLE-paired workbench IDE
(`better-robotics/workbench` — drifting from the classroom model, not the
thing this project extends).
