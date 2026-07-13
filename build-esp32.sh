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
cp vendor/mqtt.min.js dist-esp32/vendor/
cp -R vendor/blockly dist-esp32/vendor/blockly
cp -R vendor/micropython dist-esp32/vendor/micropython

total=$(du -sk dist-esp32 | cut -f1)
gz=$(tar -czf - -C dist-esp32 . | wc -c)
echo "✓ dist-esp32/: ${total} KB raw, $((gz / 1024)) KB gzipped (the ESP32 serves per-file gzip of this)"
