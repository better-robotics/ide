#!/usr/bin/env bash
# Fetch Monaco + mqtt.js into vendor/. The classroom hub has no internet
# uplink, so nothing the page loads at runtime may come from a CDN — same
# discipline as sdflash's extension/vendor.sh. Run once after clone (and
# again by CI before publishing), before opening index.html.
set -euo pipefail
cd "$(dirname "$0")"

MONACO_VERSION=0.55.1
MQTT_VERSION=5.15.2

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

echo "✓ vendored. Serve the repo root (e.g. \`npx serve\`) and open /index.html"
