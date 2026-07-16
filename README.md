# ide

Python + Blockly in the browser, driving a rover over the existing wire — the
classroom code editor for [`better-robotics/hub`](https://github.com/better-robotics/hub).
Students write Python calling a small `robot` API — or snap blocks together
in a Scratch-like view that generates that same Python — and the script runs
entirely in the tab (MicroPython compiled to WebAssembly; no interpreter to
install), talking to the hub over the same MQTT/WebSocket contract
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
| `index.html` / `style.css` | the shell — connection bar, Blocks/Python toggle, editor pane, console + telemetry pane |
| `editor.js` | mounts vendored Monaco (AMD loader, no CDN) |
| `blocks.js` | the Blocks view — a Blockly workspace whose generators emit the same `robot`-API Python the code view teaches |
| `py-runtime.js` | the Python runtime — vendored MicroPython-WASM in the tab, bridged to `robot-api.js`; `print()` streams to the console pane |
| `robot-api.js` | the wire client — `mqtt.connect(ws://<host>:9001, …)`, the `robots/<id>/…` envelope contract (`pwm`, `led`, telemetry) |
| `app.js` | glue — connection UI, the Blocks/Python mode switch, the run-script model |
| `vendor.sh` → `vendor/` | Monaco + mqtt.js + Blockly + MicroPython-WASM, fetched once, never loaded from a CDN at runtime |
| `editor-lite.js` / `build-esp32.sh` → `dist-esp32/` | the ESP32-hub bundle — same app minus Monaco (a textarea ships as `editor.js`), small enough for a 4 MB-flash hub to embed and serve |

## Blocks mode

First-time visitors land in a Blockly workspace (Scratch-like zelos renderer)
with drive / wait / stop / LED / print / telemetry blocks plus stock loops,
logic, math, and variables. Below it, a read-only Monaco pane shows **the
Python the blocks generate, live** — the ramp from blocks to typed code is
watching your program appear in the real API, then pressing **Python** to
write it by hand. Blocks and Python are two separate drafts (a Python→blocks
conversion would be lossy, so neither view can eat the other's edits); **Run
executes whichever view is active**, through the same runner.

## The `robot` API

```python
# robot.move(left=…, right=…, duration_ms=…) drives; left/right are signed
# -255..255. duration_ms defaults to 400 and clamps at 4000 — the firmware's
# own watchdog floor (CONTRACT.md § Safety floor), so a dropped connection
# always coasts to a stop, never a runaway.
await robot.move(left=120, right=120, duration_ms=400)
await sleep_ms(500)
await robot.stop()

# robot.telemetry reads the latest merged {imu, sys, …} sample as a dict.
print(robot.telemetry)

# robot.led(on, red=…, green=…, blue=…) is best-effort: the firmware's
# request/response correlation for set_led is an open thread
# (hub CONTRACT.md, #4), so it returns rather than hanging if no reply
# arrives. Multi-robot is a for loop over `robots`.
await robot.led(True, green=255)
```

Scripts run in MicroPython compiled to WebAssembly, in the page —
top-level `await` works, `print()` streams to the console pane, and the
Python-side API (`Robot`, `sleep_ms`, `robots`/`robot`) is a small prelude
over the same wire client the old JS runner used. The safety boundary is the
firmware's drive watchdog, not interpreter sandboxing: a malformed or
malicious script can't out-run the motor timeout.

## Run it

```sh
./vendor.sh          # fetch Monaco + mqtt.js + Blockly + MicroPython into vendor/ (once, after clone)
npx serve .           # or: python3 -m http.server
```

Open the served URL and point **Hub host** at your hub (`hub.local`, or the
Pi's address). There is nothing to sign in to: every hub admits every client
with no MQTT auth at all — anonymous carries read+write on `robots/#`, and the
rover firmware sends no credentials either (hub `CONTRACT.md` § Discovery &
isolation). Only `instructor` needs a password, and only to write `fleet/estop`,
which this app never touches.

Served by a hub, it connects on load — the page's own origin *is* the broker's
host, so there is nothing left to ask. The GitHub Pages copy still needs a host
typed in: that origin has no broker of its own.

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
