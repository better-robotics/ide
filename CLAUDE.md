# ide — project context

The classroom code editor for [`better-robotics/hub`](https://github.com/better-robotics/hub):
Monaco + a thin `robot` API, running entirely in the browser tab, talking to a
hub over its existing MQTT/WebSocket contract. See `README.md` for the pitch;
this file is implementation conventions.

## The one rule this repo exists to prove

**Everything possible lives client-side; the firmware gets nothing new.** A
script's `robot.move()`/`.led()`/`.telemetry` calls are just `mqtt.publish`/
`subscribe` against topics `dashboard.html` already uses (`envelopes/pwm.json`,
`envelopes/rpc_set_led.json`, imu/sys). Before adding any feature that would
need a firmware change, ask whether it can instead be expressed as an existing
envelope from a new angle — the rover doesn't know or care that a request came
from a code editor instead of a joystick.

## No CDN, ever, at runtime

`vendor.sh` fetches Monaco (`min/vs`, AMD loader), mqtt.js (UMD bundle), and
Blockly (UMD bundles + `msg/en` + `media/`) into `vendor/` — gitignored,
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

`blocks.js` generators must emit the same readable JS a student would type
against `robot-api.js` (`await robot.move({...})`, `sleep`, `log`) — if a
block needs anything the code view doesn't teach, it doesn't belong. Blocks
and JS are two separate localStorage drafts (`ide.blocks` / `ide.draft`),
never two views of one document: blocks→JS is the read-only preview under the
workspace; JS→blocks doesn't exist (lossy). Run executes whichever view is
active through the same `AsyncFunction` runner.

## Run model — no sandbox, and that's deliberate

Student scripts run as a plain `AsyncFunction` in the page (`app.js`
`runScript`), not a Worker or an `iframe` sandbox. The safety boundary is the
firmware's per-message drive watchdog (400ms default / 4000ms clamp,
`rover_role.c` `motor_apply`) — it holds against a malformed *or* malicious
payload by design (CONTRACT.md § Safety floor), so the browser side doesn't
need its own isolation to keep a bad script from running a rover away.

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
