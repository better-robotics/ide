// The wire client — reaches a hub over the WS-JSON adapter (port 9001 on both
// the Pi and the ESP32 hub role; CONTRACT.md § Discovery & isolation), which
// bridges to the hub's Zenoh fabric. It speaks the SAME envelope contract
// dashboard.html drives: pwm (envelopes/pwm.json), the set_led queryable
// (envelopes/rpc_set_led.json), imu/sys telemetry. Nothing here is a new device
// capability — this is a second client of an existing contract, so the rover
// firmware needs no changes to support it. The transport is a drop-in mqtt.js
// shape (zenoh-transport.js), so the code below reads unchanged from the MQTT
// era except set_led, which is now the contract's queryable get, not a pub.
//
// A board has TWO ids, and which one is the handle depends on the login
// (CONTRACT.md § Addressing one board when several share an identity):
//   - the TOPIC id — its name, or `unassigned` until it is named — which the
//     topic `robots/<id>/<channel>` is built from; and
//   - the BOARD id — the stable MAC-derived string in `sys.board`
//     (rover-b79c), which `target` is matched against (rover_role.c compares
//     target to s_id, the board field, NOT the topic).
// A team login is scoped to one board on its own topic, so the topic id is a
// unique handle and `target` is unnecessary — that path is unchanged. The
// fleet view (instructor / anonymous) sees several boards sharing one topic —
// the whole `unassigned` pool answers on `robots/unassigned/*` — so there the
// handle is the board id and every command carries `target`, or a single
// robot.move() drives every unnamed board on the desk at once.
import { zenohConnect } from "./zenoh-transport.js";

export function connect(host, { username, password, wsPort = 9001 } = {}) {
  const client = zenohConnect(`ws://${host}:${wsPort}`, { username, password });

  // Fleet view sees `robots/+/#`; a team login only its own subtree — same
  // scoping dashboard.html uses. This flag is also what decides the keying
  // below: shared topic → key by board id; own topic → key by topic id.
  const fleet = !username || username === "instructor";
  const filter = fleet ? "robots/+/#" : `robots/${username}/#`;

  const telemetry = new Map(); // handle -> merged {channel: data}
  const topicOf = new Map();   // handle -> topic id to publish on (== handle in team mode)
  const listeners = new Set(); // fn(handle, telemetry)

  function notify(handle) {
    const snapshot = telemetry.get(handle);
    for (const fn of listeners) fn(handle, snapshot);
  }

  const ready = new Promise((resolve, reject) => {
    client.on("connect", () => {
      client.subscribe(filter);
      resolve(client);
    });
    client.on("error", reject);
  });

  client.on("message", (topic, payload) => {
    const parts = topic.split("/"); // robots/<topicId>/<channel...>
    const topicId = parts[1];
    const channel = parts.slice(2).join("/");
    let data;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return; // non-JSON payload — not one of ours
    }

    // Which handle owns this message? Team mode: the topic id. Fleet mode: the
    // board id — which ONLY the sys beacon carries, so a board becomes
    // individually addressable the moment its first sys arrives (every 2 s).
    let handle;
    if (!fleet) {
      handle = topicId;
    } else if (channel === "sys" && typeof data.board === "string") {
      handle = data.board;
    } else {
      // A non-sys channel (imu, …) in the fleet view carries no board id, so
      // it is attributable only when exactly one known board publishes on this
      // topic. On the shared `unassigned` pool it is genuinely ambiguous —
      // drop it rather than smear one board's reading across the others.
      const here = [...topicOf].filter(([, t]) => t === topicId).map(([h]) => h);
      if (here.length !== 1) return;
      handle = here[0];
    }

    topicOf.set(handle, topicId);
    telemetry.set(handle, { ...(telemetry.get(handle) || {}), [channel]: data });
    notify(handle);
  });

  function makeRobot(handle) {
    // The topic to publish on, and whether to stamp `target`. In fleet mode a
    // handle we've heard from is a board id → publish to its topic, target it.
    // A handle we haven't (a team's own name, or a board that hasn't beaconed
    // yet) falls back to addressing the topic directly with no target — the
    // pre-2026-07-17 behaviour, correct whenever the topic isn't shared.
    const topicId = () => topicOf.get(handle) || handle;
    const targeted = () => fleet && topicOf.has(handle);
    const pub = (channel, payload, opts) => {
      const body = targeted() ? { ...payload, target: handle } : payload;
      client.publish(`robots/${topicId()}/${channel}`, JSON.stringify(body), opts);
    };
    return {
      id: handle,
      get telemetry() {
        return telemetry.get(handle) || {};
      },
      // Signed left/right, ±255 (rover_role.c motor_apply); the firmware
      // watchdog stops the motors durationMs after the last command
      // (400ms default, 4000ms clamp — CONTRACT.md § Safety floor) so a
      // dropped connection always coasts to a stop, not a runaway.
      async move({ left = 0, right = 0, durationMs = 400 } = {}) {
        pub("pwm", { left_motor: left, right_motor: right, duration_ms: durationMs });
      },
      async stop() {
        return this.move({ left: 0, right: 0 });
      },
      // set_led is the contract's queryable (CONTRACT.md § the set_led
      // queryable / envelopes/rpc_set_led.json): a `get` on robots/<id>/led
      // carrying the request, the reply riding back as the query answer. In
      // fleet mode the request carries `target` like a pub, so only the named
      // board acts. Firmware support is still open thread #4, so an unanswered
      // get resolves {ok:false, timedOut:true} rather than hanging.
      async led(on, { red = 0, green = 0, blue = 0, timeoutMs = 1500 } = {}) {
        const req = { method: "set_led", on, red, green, blue };
        const body = targeted() ? { ...req, target: handle } : req;
        try {
          const reply = await client.get(`robots/${topicId()}/led`, body, { timeoutMs });
          return { ok: true, ...(reply && typeof reply === "object" ? reply : {}) };
        } catch {
          return { ok: false, timedOut: true };
        }
      },
      // cmd/identify — blinks the board's LED (~6s) so it can be matched to
      // its on-screen id (CONTRACT.md § Control channels).
      identify() {
        pub("cmd/identify", {});
      },
    };
  }

  return {
    client,
    ready,
    // A team login's own username IS its robot's topic id (robots/<team>/… —
    // CONTRACT.md § Discovery & isolation) — known the moment Connect
    // succeeds, no telemetry required. In the fleet view there is no single
    // own robot, and a board's handle is its board id, which isn't known until
    // its first sys — so ownId stays null there and knownIds() carries the list.
    ownId: fleet ? null : username,
    onTelemetry: (fn) => listeners.add(fn),
    // Robots we've actually heard telemetry FROM — in fleet mode these are
    // board ids (rover-b79c), one per physical board, so robot(id) addresses
    // exactly one; empty right after connect until the first beacon lands.
    knownIds: () => [...telemetry.keys()],
    robot: (id) => makeRobot(id),
  };
}
