// WS-JSON transport — the browser edge of the hub's Zenoh fabric. A browser
// can't speak native Zenoh, so it speaks the hub's small WS-JSON op protocol
// over one WebSocket to the ws-adapter (Pi: `pi/ws-adapter/ws_zenoh_adapter.py`;
// ESP hub: `robot/src/ws_zenoh_bridge.c`), which maps it onto a Zenoh session.
//
// This is a drop-in for the mqtt.js client this IDE used before the MQTT→Zenoh
// migration — same surface (`.on`/`.subscribe`/`.publish`/`.end`/`.connected`),
// message payloads delivered as JSON strings, and mqtt topic wildcards mapped to
// Zenoh key-exprs (`+`→`*`, `#`→`**`). Ported from the hub dashboard's own
// transport so both browser clients speak the adapter identically — the canonical
// version and the protocol table live in `sprocket-robotics/hub`
// (`dashboard.html` zenohConnect, `pi/ws-adapter/README.md`, `CONTRACT.md`).
//
// Protocol (client → adapter):
//   {op:"sub"|"unsub", key}          declare/drop a key filter
//   {op:"pub",  key, val}            put   (fleet/estop gated on auth)
//   {op:"get",  key, val, id} → {op:"reply", id, val}   query (the set_led queryable)
//   {op:"hello", clientId}           bind an opaque browser id (harmless for anon)
//   adapter → client: {key, val}     a delivered subscription sample

const CLIENT_ID_KEY = "ide.client-id";

// Opaque per-browser id for the adapter's `{op:hello}` (the claim gate's bearer
// key). The IDE doesn't claim robots, but hello is sent on every connection and
// costs nothing; a stable id means a refresh keeps any future claim.
function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : "ide-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch { return "ide-anon"; }
}

// mqtt topic wildcards → Zenoh key-expr wildcards. `+` (one level) → `*`,
// `#` (many levels) → `**`; a literal segment passes through.
function mqttToZenoh(t) {
  return t.split("/").map((s) => (s === "+" ? "*" : s === "#" ? "**" : s)).join("/");
}

// Returns an mqtt.js-shaped client over the WS-JSON adapter. opts.username set →
// authenticate as operator ({op:auth}); anonymous otherwise (connects on WS-open).
export function zenohConnect(url, opts = {}) {
  const handlers = {};
  const pendingGets = {}; // id → {resolve, timer}
  let ws, gseq = 0;
  const needAuth = !!(opts && opts.username);

  const client = {
    connected: false,
    on(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); return client; },
    _emit(ev, ...a) { (handlers[ev] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } }); },
    _send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); },
    subscribe(topic) { client._send({ op: "sub", key: mqttToZenoh(topic) }); },
    unsubscribe(topic) { client._send({ op: "unsub", key: mqttToZenoh(topic) }); },
    publish(topic, payload) {
      let val; try { val = JSON.parse(payload); } catch { val = payload; }
      client._send({ op: "pub", key: mqttToZenoh(topic), val });
    },
    // Request/response over the contract's queryable primitive (set_led, and any
    // future `get`): resolves with the first reply sample, rejects on timeout.
    get(topic, val, { timeoutMs = 4000 } = {}) {
      const key = mqttToZenoh(topic);
      return new Promise((resolve, reject) => {
        const id = "g" + gseq++;
        const timer = setTimeout(() => { delete pendingGets[id]; reject(new Error("get timeout")); }, timeoutMs);
        pendingGets[id] = { resolve, timer };
        client._send({ op: "get", id, key, val });
      });
    },
    end() { try { ws && ws.close(); } catch { /* already closing */ } },
  };

  try { ws = new WebSocket(url); }
  catch (e) { setTimeout(() => client._emit("error", e), 0); return client; }

  ws.onopen = () => {
    client._send({ op: "hello", clientId: clientId() });
    if (needAuth) client._send({ op: "auth", role: opts.username, password: opts.password });
    else { client.connected = true; client._emit("connect"); }
  };
  ws.onmessage = (e) => {
    let d; try { d = JSON.parse(e.data); } catch { return; }
    if (d.op === "auth") {
      if (d.ok) { client.connected = true; client._emit("connect"); }
      else client._emit("error", new Error("auth rejected"));
    } else if (d.op === "reply") {
      const p = pendingGets[d.id];
      if (p) { clearTimeout(p.timer); delete pendingGets[d.id]; p.resolve(d.val); }
    } else if (d.op === "error" || d.op === "owners" || d.op === "owner") {
      /* adapter refusal / ownership frames — the IDE drives the open floor and
         doesn't claim, so these are advisory; ignore. */
    } else if (d.key !== undefined) {
      client._emit("message", d.key, JSON.stringify(d.val));
    }
  };
  ws.onerror = () => client._emit("error", new Error("ws error"));
  ws.onclose = () => { client.connected = false; client._emit("close"); };
  return client;
}
