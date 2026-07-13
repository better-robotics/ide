// The student-Python runtime: vendored MicroPython (WebAssembly port) running
// in the tab, bridged to robot-api.js. Python replaced JS as the student
// language (team decision — the laptop-side platform is Python); the browser
// stays the interpreter so the zero-install thesis holds: MicroPython-WASM is
// ~550 KB where Pyodide is ~10 MB, small enough that even the ESP32 hub can
// serve it.
//
// Bridge shape: one registered JS module (_hub) of plain functions taking
// ids/numbers and returning promises, with structured data crossing as JSON
// strings — never JsProxy object graphs, so student tracebacks stay Python-
// shaped. The Python face of the API (Robot class, sleep_ms, robots/robot) is
// defined in PRELUDE, prepended to every run.

let mpPromise = null;
let bridgeSession = null; // the live connection a run drives (set per run)

const PRELUDE = `import _hub, json

class Robot:
    def __init__(self, id):
        self.id = id
    async def move(self, left=0, right=0, duration_ms=400):
        await _hub.move(self.id, left, right, duration_ms)
    async def stop(self):
        await _hub.stop(self.id)
    async def led(self, on=True, red=0, green=0, blue=0):
        await _hub.led(self.id, on, red, green, blue)
    def identify(self):
        _hub.identify(self.id)
    @property
    def telemetry(self):
        return json.loads(_hub.telemetry(self.id))

async def sleep_ms(ms):
    await _hub.sleep_ms(ms)

robots = [Robot(i) for i in json.loads(_hub.robot_ids())]
robot = robots[0] if robots else None
`;
// Student tracebacks report line numbers offset by the prelude — subtract
// this when mapping an error line back to the editor.
export const PRELUDE_LINES = PRELUDE.split("\n").length;

function orderedIds() {
  const s = bridgeSession;
  if (!s) return [];
  // Own robot first even before its first telemetry — same ordering app.js
  // used for the JS runner (a team's username IS its robot id).
  return s.ownId
    ? [s.ownId, ...s.knownIds().filter((id) => id !== s.ownId)]
    : s.knownIds();
}

const hubModule = {
  move: (id, left, right, duration_ms) =>
    bridgeSession.robot(id).move({ left, right, durationMs: duration_ms }),
  stop: (id) => bridgeSession.robot(id).stop(),
  led: (id, on, red, green, blue) =>
    bridgeSession.robot(id).led(!!on, { red, green, blue }),
  identify: (id) => bridgeSession.robot(id).identify(),
  telemetry: (id) => JSON.stringify(bridgeSession.robot(id).telemetry),
  robot_ids: () => JSON.stringify(orderedIds()),
  sleep_ms: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function loadMP(printLine) {
  if (!mpPromise) {
    mpPromise = import("./vendor/micropython/micropython.mjs").then(async (m) => {
      const mp = await m.loadMicroPython({
        url: "vendor/micropython/micropython.wasm",
        stdout: printLine, // print() lands in the console pane, line-buffered
        stderr: printLine,
      });
      mp.registerJsModule("_hub", hubModule);
      return mp;
    });
  }
  return mpPromise;
}

// One interpreter for the page's lifetime (REPL semantics: student globals
// persist between runs; the prelude re-binds robot/robots fresh each run).
export async function runPython(body, { session, print }) {
  bridgeSession = session;
  const mp = await loadMP(print);
  await mp.runPythonAsync(PRELUDE + "\n" + body);
}
