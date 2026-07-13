// The Blockly layer — a block vocabulary that generates the SAME JavaScript a
// student would type in the code view (await robot.move(...), sleep(...), …),
// fed to the same run model in app.js. Blocks are an on-ramp to the `robot`
// API, never a second API: if a block can't be expressed as readable
// generated JS against robot-api.js, it doesn't belong here.
//
// Reads the globals the vendored UMD bundles define (vendor/blockly/*, script
// tags in index.html): `Blockly` and `javascript` (the JS generator).

const BLOCKS_KEY = "ide.blocks";

let workspace = null;

const generator = javascript.javascriptGenerator;
const Order = javascript.Order;

// The run model injects these names (app.js runScript); a student variable
// named `robot` would shadow the real one.
generator.addReservedWords("robot,robots,sleep,log");

const ROBOT_HUE = 217; // matches --accent

Blockly.defineBlocksWithJsonArray([
  {
    type: "robot_move",
    message0: "drive left %1 right %2 for %3 ms",
    args0: [
      { type: "input_value", name: "LEFT", check: "Number" },
      { type: "input_value", name: "RIGHT", check: "Number" },
      { type: "input_value", name: "MS", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: ROBOT_HUE,
    tooltip:
      "Wheel speeds, -255..255 each (negative = backwards). The rover stops on its own after the duration — 4000 ms max.",
  },
  {
    type: "robot_stop",
    message0: "stop",
    previousStatement: null,
    nextStatement: null,
    colour: ROBOT_HUE,
    tooltip: "Stop both motors now.",
  },
  {
    type: "robot_wait",
    message0: "wait %1 ms",
    args0: [{ type: "input_value", name: "MS", check: "Number" }],
    previousStatement: null,
    nextStatement: null,
    colour: ROBOT_HUE,
    tooltip: "Pause the script (the rover keeps doing its last command).",
  },
  {
    type: "robot_led_on",
    message0: "LED on %1",
    args0: [
      {
        type: "field_dropdown",
        name: "COLOR",
        options: [
          ["red", "RED"],
          ["green", "GREEN"],
          ["blue", "BLUE"],
          ["yellow", "YELLOW"],
          ["magenta", "MAGENTA"],
          ["cyan", "CYAN"],
          ["white", "WHITE"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ROBOT_HUE,
    tooltip: "Turn the rover's LED on in a color (best-effort — see robot.led()).",
  },
  {
    type: "robot_led_off",
    message0: "LED off",
    previousStatement: null,
    nextStatement: null,
    colour: ROBOT_HUE,
    tooltip: "Turn the rover's LED off.",
  },
  {
    type: "robot_log",
    message0: "log %1",
    args0: [{ type: "input_value", name: "VALUE" }],
    previousStatement: null,
    nextStatement: null,
    colour: ROBOT_HUE,
    tooltip: "Print a value to the console pane.",
  },
  {
    type: "robot_telemetry",
    message0: "telemetry",
    output: null,
    colour: ROBOT_HUE,
    tooltip: "The latest imu/sys sample from the rover — try log-ing it.",
  },
]);

generator.forBlock["robot_move"] = (block, gen) => {
  const left = gen.valueToCode(block, "LEFT", Order.NONE) || "0";
  const right = gen.valueToCode(block, "RIGHT", Order.NONE) || "0";
  const ms = gen.valueToCode(block, "MS", Order.NONE) || "400";
  return `await robot.move({ left: ${left}, right: ${right}, durationMs: ${ms} });\n`;
};
generator.forBlock["robot_stop"] = () => "await robot.stop();\n";
generator.forBlock["robot_wait"] = (block, gen) =>
  `await sleep(${gen.valueToCode(block, "MS", Order.NONE) || "0"});\n`;

const LED_COLORS = {
  RED: "{ red: 255 }",
  GREEN: "{ green: 255 }",
  BLUE: "{ blue: 255 }",
  YELLOW: "{ red: 255, green: 255 }",
  MAGENTA: "{ red: 255, blue: 255 }",
  CYAN: "{ green: 255, blue: 255 }",
  WHITE: "{ red: 255, green: 255, blue: 255 }",
};
generator.forBlock["robot_led_on"] = (block) =>
  `await robot.led(true, ${LED_COLORS[block.getFieldValue("COLOR")]});\n`;
generator.forBlock["robot_led_off"] = () => "await robot.led(false);\n";
generator.forBlock["robot_log"] = (block, gen) =>
  `log(${gen.valueToCode(block, "VALUE", Order.NONE) || '""'});\n`;
generator.forBlock["robot_telemetry"] = () => ["robot.telemetry", Order.MEMBER];

const num = (n) => ({ shadow: { type: "math_number", fields: { NUM: n } } });

const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Robot",
      colour: `${ROBOT_HUE}`,
      contents: [
        { kind: "block", type: "robot_move", inputs: { LEFT: num(120), RIGHT: num(120), MS: num(400) } },
        { kind: "block", type: "robot_stop" },
        { kind: "block", type: "robot_wait", inputs: { MS: num(500) } },
        { kind: "block", type: "robot_led_on" },
        { kind: "block", type: "robot_led_off" },
        {
          kind: "block",
          type: "robot_log",
          inputs: { VALUE: { shadow: { type: "text", fields: { TEXT: "hello" } } } },
        },
        { kind: "block", type: "robot_telemetry" },
      ],
    },
    {
      kind: "category",
      name: "Loops",
      colour: "120",
      contents: [
        { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: num(3) } },
        { kind: "block", type: "controls_whileUntil" },
      ],
    },
    {
      kind: "category",
      name: "Logic",
      colour: "210",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_boolean" },
      ],
    },
    {
      kind: "category",
      name: "Math",
      colour: "230",
      contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic", inputs: { A: num(1), B: num(1) } },
        { kind: "block", type: "math_random_int", inputs: { FROM: num(1), TO: num(100) } },
      ],
    },
    {
      kind: "category",
      name: "Text",
      colour: "160",
      contents: [{ kind: "block", type: "text" }, { kind: "block", type: "text_join" }],
    },
    { kind: "category", name: "Variables", custom: "VARIABLE", colour: "330" },
  ],
};

// Same program as app.js DEFAULT_SCRIPT, as blocks: drive, wait, stop, log.
const DEFAULT_WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "robot_move",
        x: 30,
        y: 30,
        inputs: { LEFT: num(120), RIGHT: num(120), MS: num(400) },
        next: {
          block: {
            type: "robot_wait",
            inputs: { MS: num(500) },
            next: {
              block: {
                type: "robot_stop",
                next: {
                  block: {
                    type: "robot_log",
                    inputs: { VALUE: { shadow: { type: "text", fields: { TEXT: "done" } } } },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};

const DARK_THEME = Blockly.Theme.defineTheme("ide-dark", {
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#1e1e1e",
    toolboxBackgroundColour: "#252526",
    toolboxForegroundColour: "#d4d4d4",
    flyoutBackgroundColour: "#252526",
    flyoutForegroundColour: "#d4d4d4",
    flyoutOpacity: 0.95,
    scrollbarColour: "#3c3c3c",
    insertionMarkerColour: "#d4d4d4",
    cursorColour: "#3b82f6",
  },
});

export function mountBlocks(host, { onChange } = {}) {
  workspace = Blockly.inject(host, {
    toolbox: TOOLBOX,
    theme: DARK_THEME,
    // Vendored — Blockly's default media path is a remote URL, which the
    // offline classroom hub can't reach.
    media: "vendor/blockly/media/",
    renderer: "zelos", // the Scratch-like renderer — this view is the kid on-ramp
    zoom: { controls: true, wheel: true, startScale: 0.8 },
    trashcan: true,
  });

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(BLOCKS_KEY));
  } catch {
    /* corrupt draft — fall through to the default program */
  }
  Blockly.serialization.workspaces.load(saved || DEFAULT_WORKSPACE, workspace);

  workspace.addChangeListener((e) => {
    if (e.isUiEvent) return;
    localStorage.setItem(
      BLOCKS_KEY,
      JSON.stringify(Blockly.serialization.workspaces.save(workspace))
    );
    if (onChange) onChange();
  });
  return workspace;
}

export function getBlocksCode() {
  return workspace ? generator.workspaceToCode(workspace) : "";
}

export function resizeBlocks() {
  if (workspace) Blockly.svgResize(workspace);
}

export function blocksMounted() {
  return workspace !== null;
}
