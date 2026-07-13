#!/usr/bin/env bash
# Fetch Monaco + mqtt.js into vendor/. The classroom hub has no internet
# uplink, so nothing the page loads at runtime may come from a CDN — same
# discipline as sdflash's extension/vendor.sh. Run once after clone (and
# again by CI before publishing), before opening index.html.
set -euo pipefail
cd "$(dirname "$0")"

MONACO_VERSION=0.55.1
MQTT_VERSION=5.15.2
BLOCKLY_VERSION=12.3.1
MICROPYTHON_VERSION=1.28.0-6   # @micropython/micropython-webassembly-pyscript

rm -rf vendor
mkdir -p vendor

echo "→ monaco-editor@${MONACO_VERSION} (min/vs only — no ESM/dev trees)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://registry.npmjs.org/monaco-editor/-/monaco-editor-${MONACO_VERSION}.tgz" -o "$tmp/monaco.tgz"
tar -xzf "$tmp/monaco.tgz" -C "$tmp"
mkdir -p vendor/monaco-editor
cp -R "$tmp/package/min" vendor/monaco-editor/min

echo "→ mqtt.js@${MQTT_VERSION} (browser UMD bundle — the same library dashboard.html inlines)"
curl -fsSL "https://cdn.jsdelivr.net/npm/mqtt@${MQTT_VERSION}/dist/mqtt.min.js" -o vendor/mqtt.min.js

echo "→ blockly@${BLOCKLY_VERSION} (UMD script bundles + en messages + media sprites)"
curl -fsSL "https://registry.npmjs.org/blockly/-/blockly-${BLOCKLY_VERSION}.tgz" -o "$tmp/blockly.tgz"
mkdir -p "$tmp/blockly"
tar -xzf "$tmp/blockly.tgz" -C "$tmp/blockly"
mkdir -p vendor/blockly/msg
cp "$tmp/blockly/package/blockly_compressed.js" \
   "$tmp/blockly/package/blocks_compressed.js" \
   "$tmp/blockly/package/python_compressed.js" vendor/blockly/
cp "$tmp/blockly/package/msg/en.js" vendor/blockly/msg/
# media/ must be vendored: Blockly's default media path is a remote URL, and
# the injection option in blocks.js points here instead.
cp -R "$tmp/blockly/package/media" vendor/blockly/media

echo "→ micropython-wasm@${MICROPYTHON_VERSION} (the student-Python runtime — CPython-compatible enough for rover scripts, ~1/30th of Pyodide)"
curl -fsSL "https://registry.npmjs.org/@micropython/micropython-webassembly-pyscript/-/micropython-webassembly-pyscript-${MICROPYTHON_VERSION}.tgz" -o "$tmp/mpy.tgz"
mkdir -p "$tmp/mpy"
tar -xzf "$tmp/mpy.tgz" -C "$tmp/mpy"
mkdir -p vendor/micropython
cp "$tmp/mpy/package/micropython.mjs" "$tmp/mpy/package/micropython.wasm" vendor/micropython/

echo "✓ vendored. Serve the repo root (e.g. \`npx serve\`) and open /index.html"
