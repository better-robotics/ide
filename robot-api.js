// The wire client — connects to a hub's MQTT-over-WebSocket broker
// (CONTRACT.md § Discovery & isolation, port 9001 on both the Pi and the
// ESP32 hub role) and speaks the SAME envelope contract dashboard.html
// drives: pwm (envelopes/pwm.json), the set_led RPC (envelopes/rpc_set_led.json),
// imu/sys telemetry. Nothing here is a new device capability — this is a
// second client of an existing contract, so the rover firmware needs no
// changes to support it.
export function connect(host, { username, password, wsPort = 9001 } = {}) {
  const client = mqtt.connect(`ws://${host}:${wsPort}`, { username, password });

  const telemetry = new Map();   // id -> merged {channel: data} for imu/sys/etc
  const listeners = new Set();  // fn(id, telemetry)
  const pendingLed = new Map(); // id -> {resolve, timer} — awaiting robots/<id>/led/reply

  function notify(id) {
    const snapshot = telemetry.get(id);
    for (const fn of listeners) fn(id, snapshot);
  }

  // Team logins see only their own rover's subtree; professor/anonymous
  // (blank username) see the whole fleet — same scoping dashboard.html uses.
  const filter = !username || username === "professor" ? "robots/+/#" : `robots/${username}/#`;

  const ready = new Promise((resolve, reject) => {
    client.on("connect", () => {
      client.subscribe(filter);
      resolve(client);
    });
    client.on("error", reject);
  });

  client.on("message", (topic, payload) => {
    const parts = topic.split("/"); // robots/<id>/<channel...>
    const id = parts[1];
    const channel = parts.slice(2).join("/");
    let data;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      return; // non-JSON payload — not one of ours
    }
    if (channel === "led/reply") {
      const pending = pendingLed.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingLed.delete(id);
        pending.resolve({ ok: true, ...data });
      }
      return;
    }
    telemetry.set(id, { ...(telemetry.get(id) || {}), [channel]: data });
    notify(id);
  });

  function publish(id, channel, payload, opts) {
    client.publish(`robots/${id}/${channel}`, JSON.stringify(payload), opts);
  }

  function makeRobot(id) {
    return {
      id,
      get telemetry() {
        return telemetry.get(id) || {};
      },
      // Signed left/right, ±255 (rover_role.c motor_apply); the firmware
      // watchdog stops the motors durationMs after the last command
      // (400ms default, 4000ms clamp — CONTRACT.md § Safety floor) so a
      // dropped connection always coasts to a stop, not a runaway.
      async move({ left = 0, right = 0, durationMs = 400 } = {}) {
        publish(id, "pwm", { left_motor: left, right_motor: right, duration_ms: durationMs });
      },
      async stop() {
        return this.move({ left: 0, right: 0 });
      },
      // Best-effort: the firmware's request/response correlation for
      // set_led is an open thread (hub CONTRACT.md, #4), so this resolves
      // {ok:false, timedOut:true} rather than hanging if no reply arrives.
      led(on, { red = 0, green = 0, blue = 0, timeoutMs = 1500 } = {}) {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            pendingLed.delete(id);
            resolve({ ok: false, timedOut: true });
          }, timeoutMs);
          pendingLed.set(id, { resolve, timer });
          publish(id, "led", { method: "set_led", on, red, green, blue });
        });
      },
      // cmd/identify — blinks the board's LED (~6s) so it can be matched to
      // its on-screen id (CONTRACT.md § Control channels).
      identify() {
        publish(id, "cmd/identify", {});
      },
    };
  }

  return {
    client,
    ready,
    // A team login's own username IS its robot's id (robots/<team>/… — the
    // topic scheme, CONTRACT.md § Discovery & isolation) — known the moment
    // Connect succeeds, no telemetry required. null for professor/anonymous,
    // which have no single robot of their own.
    ownId: !username || username === "professor" ? null : username,
    onTelemetry: (fn) => listeners.add(fn),
    // Robots we've actually heard telemetry FROM — real for a fleet view,
    // but empty right after connect if nothing has published yet.
    knownIds: () => [...telemetry.keys()],
    robot: (id) => makeRobot(id),
  };
}
