# Jackle

Jackle is a minimal CLI-first audio plugin generator. It keeps one plain C++ DSP
source and one plain HTML/CSS/JS GUI across its two v0.1 targets:

- Browser: Web Audio, AudioWorklet, and Emscripten WASM
- macOS: Steinberg VST3 SDK directly, with a WKWebView editor

Jackle is not an audio framework or GUI designer. It does not use JUCE, iPlug2,
React, Vue, Svelte, or Electron.

## Requirements

- Node.js 18 or newer
- Browser target: CMake and an activated Emscripten SDK
- macOS VST3: CMake, full Xcode/command-line tools, and the Steinberg VST3 SDK

## Generate

```sh
npx @hugelton/jackle
```

For the default sample:

```sh
npx @hugelton/jackle --yes --out JackleSine
cd JackleSine
```

Generate the SimpleSynth reference instrument:

```sh
npx @hugelton/jackle --yes --template simple-synth --out SimpleSynth
cd SimpleSynth
```

SimpleSynth is a monophonic sine instrument with stereo output, MIDI note input,
one `volume` parameter, optional browser Web MIDI, and a built-in test-note
button. It is intentionally a toolchain reference rather than a product synth.

Regenerate a project while preserving parameter and VST3 identities:

```sh
jackle --manifest ./jackle.manifest.json --out .
```

## Browser

```sh
npm run build:wasm
npm run dev
```

Open `http://127.0.0.1:8080`. The START overlay is browser-only; the underlying
GUI is shared with WKWebView.

## macOS VST3

```sh
export VST3_SDK_DIR=/absolute/path/to/vst3sdk
npm run export:vst3-mac
npm run build:vst3-mac
```

No Xcode GUI step is required.

## Generated Project

- `jackle.manifest.json`: stable plugin, class, and parameter identities
- `dsp/`: shared plain C++ DSP
- `gui/`: shared plain HTML/CSS/JS GUI
- `web/`: AudioWorklet, WASM bindings, and browser host
- `native/vst3/`: direct VST3 processor/controller, state, and WKWebView bridge
- `scripts/`: CLI build, export, dev-server, and cleanup commands

Parameters are generated from the manifest. v0.1 supports `float` and `bool`.
Browser and VST3 state share the JSON shape
`{"version":1,"parameters":{"parameter-id":value}}`.

## Validation

```sh
npm run smoke
```

The smoke suite generates effect fixtures plus SimpleSynth and checks their
tree, JSON, JavaScript, identities, state wiring, MIDI wiring, and toolchain
diagnostics.

## Non-goals for v0.1

Windows, Linux, AU, CLAP, LV2, AAX, MIDI output, polyphony, modulation, filters,
code signing, notarization, preset browsing, rich GUI design, and frontend
frameworks are intentionally excluded.
