# ide

Monaco + Blockly in the browser, driving a rover over the existing wire — the
classroom code editor for [`better-robotics/hub`](https://github.com/better-robotics/hub).
Students write plain JS calling a small `robot` API — or snap blocks together
in a Scratch-like view that generates that same JS — and the script runs
entirely in the tab, talking to the hub over the same MQTT/WebSocket contract
`dashboard.html` already drives. **The rover firmware needs no changes to
support this** — it's a second client of an existing contract, not a new
device capability.

## How this differs from workbench

[`workbench`](https://github.com/better-robotics/workbench) pairs a robot
directly over BLE from its own bundled IDE and firmware. This project targets
`hub`'s MQTT/WS contract instead, so it drives **any** hub — Pi or ESP32 — with
zero firmware changes, and it's a second, independent front-end to
`CONTRACT.md`, the same relationship `dashboard.html` already has with the Pi
hub and the ESP32 hub role.

## How it works

| piece | job |
|---|---|
| `index.html` / `style.css` | the shell — connection bar, Blocks/JS toggle, editor pane, console + telemetry pane |
| `editor.js` | mounts vendored Monaco (AMD loader, no CDN) |
| `blocks.js` | the Blocks view — a Blockly workspace whose generators emit the same `robot`-API JavaScript the code view teaches |
| `robot-api.js` | the wire client — `mqtt.connect(ws://<host>:9001, …)`, the `robots/<id>/…` envelope contract (`pwm`, `led`, telemetry) |
| `app.js` | glue — connection UI, the Blocks/JS mode switch, the run-script model |
| `vendor.sh` → `vendor/` | Monaco + mqtt.js + Blockly, fetched once, never loaded from a CDN at runtime |

## Blocks mode

First-time visitors land in a Blockly workspace (Scratch-like zelos renderer)
with drive / wait / stop / LED / log / telemetry blocks plus stock loops,
logic, math, and variables. Below it, a read-only Monaco pane shows **the
JavaScript the blocks generate, live** — the ramp from blocks to typed code is
watching your program appear in the real API, then pressing **JS** to write it
by hand. Blocks and JS are two separate drafts (a JS→blocks conversion would
be lossy, so neither view can eat the other's edits); **Run executes whichever
view is active**, through the same runner.

## The `robot` API

```js
// robot.move({left, right, durationMs}) drives; left/right are signed
// -255..255. durationMs defaults to 400ms and clamps at 4000ms — the
// firmware's own watchdog floor (CONTRACT.md § Safety floor), so a dropped
// connection always coasts to a stop, never a runaway.
await robot.move({ left: 120, right: 120, durationMs: 400 });
await sleep(500);
await robot.stop();

// robot.telemetry reads the latest merged {imu, sys, …} sample.
console.log(robot.telemetry);

// robot.led(on, {red, green, blue}) is best-effort: the firmware's
// request/response correlation for set_led is an open thread
// (hub CONTRACT.md, #4), so this resolves {ok:false, timedOut:true}
// rather than hanging if no reply arrives.
await robot.led(true, { green: 255 });
```

Scripts run as a plain `AsyncFunction` in the page — no Worker sandbox, same
shape [`workbench`'s runner](https://github.com/better-robotics/workbench/blob/main/docs/scripts.js)
uses. The safety boundary is the firmware's drive watchdog, not JS isolation:
a malformed or malicious script can't out-run the motor timeout.

## Run it

```sh
./vendor.sh          # fetch Monaco + mqtt.js + Blockly into vendor/ (once, after clone)
npx serve .           # or: python3 -m http.server
```

Open the served URL, point **Hub host** at your hub (`hub.local`, or the Pi's
address), sign in with a team or professor credential (same accounts the
dashboard uses — CONTRACT.md's ACL model), and Connect.

## Where this is served

Static-dist only, no build step at serve time (`vendor.sh` is the only fetch,
and it's a pre-publish step, not a runtime one) — same discipline as
`dashboard.html` being vendored into both the Pi hub and the ESP32 hub role so
a classroom works with zero internet uplink:

- **GH Pages** (`better-robotics.github.io/ide`) — the tiers with no Pi at
  all: solo/home (a rover as its own island hub) and the small-group ESP32-hub
  tier, plus dev preview.
- **The Pi hub** (`hub.local/ide`) — the classroom-primary channel, planned:
  retarget `hubd`'s `HUB_IDE_DIR` (today serving workbench's `docs/` bundle)
  at this repo's build output, so it works with no internet uplink. Not yet
  wired — needs this repo pushed with a built artifact first.

## Falsifiability (build kill-criterion)

Payoff-when: a student connects to a real hub, edits and runs a script that
drives a rover, at least once. If unused by **2026-10**, archive it — the
lesson (the contract is transport-agnostic enough that a new client needs no
firmware changes) is the payoff regardless.
