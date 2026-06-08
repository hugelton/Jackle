#!/usr/bin/env bash
set -euo pipefail

if command -v emcc >/dev/null 2>&1; then
  emcc --version
  exit 0
fi

git clone https://github.com/emscripten-core/emsdk.git /tmp/emsdk
cd /tmp/emsdk
./emsdk install latest
./emsdk activate latest
echo "/tmp/emsdk" >> "$GITHUB_PATH"
echo "EMSDK=/tmp/emsdk" >> "$GITHUB_ENV"
