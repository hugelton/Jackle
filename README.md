# Jackle

A minimal CLI-first audio plugin generator for plain C++ DSP and plain HTML/CSS/JS GUI.
One DSP source and one GUI codebase compile to browser WASM and macOS VST3.

It is intentionally small: no JUCE, iPlug2, React, Vue, Svelte, or Electron.

## Generate

Interactive:

```sh
npx @hugelton/jackle
```

Default project without prompts:

```sh
npx @hugelton/jackle --yes --out JackleSine
cd JackleSine
```

Reference synth:

```sh
npx @hugelton/jackle --yes --template simple-synth --out SimpleSynth
cd SimpleSynth
```

Regenerate while preserving parameter and VST3 identities:

```sh
jackle --manifest ./jackle.manifest.json --out .
```

## Generated Project

- `jackle.manifest.json`: stable plugin, class, and parameter identities
- `dsp/`: shared plain C++ DSP
- `gui/`: shared plain HTML/CSS/JS GUI
- `web/`: AudioWorklet, WASM bindings, and browser host
- `native/vst3/`: VST3 processor/controller, state, and WKWebView bridge
- `scripts/`: build, dev server, export, and cleanup

Parameters are generated from the manifest. v0.1 supports `float` and `bool`.
Browser and VST3 state share the JSON shape:
`{"version":1,"parameters":{"parameter-id":value}}`.

## Browser

```sh
npm run build:wasm
npm run dev
```

Open `http://127.0.0.1:8080`.
The START overlay is browser-only; the underlying GUI is shared with WKWebView.

## macOS VST3

```sh
export VST3_SDK_DIR=/absolute/path/to/vst3sdk
npm run export:vst3-mac
npm run build:vst3-mac
```

This path targets macOS only. No Xcode GUI step is required.

## Validation

```sh
npm run smoke
```

The smoke suite generates effect fixtures plus SimpleSynth and checks their
structure, JSON, JavaScript, identities, state wiring, MIDI wiring, and
toolchain diagnostics.

## Non-goals for v0.1

Windows, Linux, AU, CLAP, LV2, AAX, MIDI output, polyphony, modulation, filters,
code signing, notarization, preset browsing, rich GUI design, and frontend
frameworks are intentionally excluded.
