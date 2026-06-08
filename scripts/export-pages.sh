#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 1 ]; then
  INPUT_DIR="$1"
else
  INPUT_DIR="samples/JackleSine"
fi

if [ ! -d "$INPUT_DIR" ]; then
  echo "Missing input directory: $INPUT_DIR"
  exit 1
fi

rm -rf pages
mkdir -p pages

cp "$INPUT_DIR"/gui/index.html pages/index.html
cp "$INPUT_DIR"/gui/style.css pages/style.css
cp "$INPUT_DIR"/gui/app.js pages/app.js
cp "$INPUT_DIR"/gui/jackle-bridge.js pages/jackle-bridge.js
cp "$INPUT_DIR"/web/jackle-dsp.js pages/jackle-dsp.js
cp "$INPUT_DIR"/web/jackle-dsp.wasm pages/jackle-dsp.wasm
