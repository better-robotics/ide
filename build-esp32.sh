#!/usr/bin/env bash
# Stage the ESP32-hub bundle into dist-esp32/ — the same app minus Monaco,
# which is ~15 MB against the ESP32's 4 MB flash. editor-lite.js (a textarea
# behind editor.js's interface) ships AS editor.js, so app.js and index.html
# are byte-identical across builds: build-time file selection, no runtime
# per-destination logic. Requires vendor/ (run ./vendor.sh first).
set -euo pipefail
cd "$(dirname "$0")"

[[ -d vendor/blockly ]] || { echo "vendor/ missing — run ./vendor.sh first" >&2; exit 1; }

rm -rf dist-esp32
mkdir -p dist-esp32/vendor

cp index.html style.css app.js blocks.js robot-api.js py-runtime.js dist-esp32/
cp editor-lite.js dist-esp32/editor.js
cp -R vendor/micropython dist-esp32/vendor/micropython
# Blockly media stays a directory (fetched lazily, few at a time), but the
# five upfront parser scripts concatenate into ONE bundle: the ESP32 hub's
# LWIP socket pool is 16 for the whole chip (broker + WS bridge + DNS +
# mDNS included), and a browser fanning out 8 parallel asset requests
# starved mosquitto's accept loop on first page load. Same execution
# semantics — each file is a UMD/plain script, order preserved.
mkdir -p dist-esp32/vendor/blockly
cp -R vendor/blockly/media dist-esp32/vendor/blockly/media
for f in vendor/mqtt.min.js vendor/blockly/blockly_compressed.js \
         vendor/blockly/blocks_compressed.js vendor/blockly/python_compressed.js \
         vendor/blockly/msg/en.js; do
  cat "$f"; printf '\n;\n'
done > dist-esp32/vendor/bundle.js
python3 - <<'EOF'
import re
p = "dist-esp32/index.html"
s = open(p).read()
s, n = re.subn(
    r'  <script src="vendor/mqtt\.min\.js"></script>.*?<script src="vendor/blockly/msg/en\.js"></script>',
    '  <script src="vendor/bundle.js"></script>',
    s, flags=re.S)
assert n == 1, "script-tag block not found — index.html drifted from build-esp32.sh"
open(p, "w").write(s)
EOF

total=$(du -sk dist-esp32 | cut -f1)
gz=$(tar -czf - -C dist-esp32 . | wc -c)
echo "✓ dist-esp32/: ${total} KB raw, $((gz / 1024)) KB gzipped (the ESP32 serves per-file gzip of this)"
