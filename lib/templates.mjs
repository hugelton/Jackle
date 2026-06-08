import { randomBytes } from "node:crypto";

export function createProjectFiles(config) {
  const manifest = normalizeManifest(makeManifest(config));
  return [
    file("jackle.manifest.json", json(manifest)),
    file("package.json", packageJson(manifest)),
    file("README.md", readme(manifest)),
    file("CMakeLists.txt", rootCmake(manifest)),
    file("dsp/ParamIds.h", paramIds(manifest)),
    file("dsp/PluginDSP.h", pluginDspHeader(manifest)),
    file("dsp/PluginDSP.cpp", pluginDspSource(manifest)),
    file("gui/index.html", guiIndex(manifest)),
    file("gui/style.css", guiStyle()),
    file("gui/app.js", guiApp(manifest)),
    file("gui/jackle-bridge.js", guiBridge(manifest)),
    file("web/main.js", webMain(manifest)),
    file("web/worklet.js", worklet(manifest)),
    file("web/wasm-bindings.cpp", wasmBindings()),
    file("web/CMakeLists.txt", webCmake()),
    file("native/vst3/PluginProcessor.h", vst3ProcessorHeader(manifest)),
    file("native/vst3/PluginProcessor.cpp", vst3ProcessorSource(manifest)),
    file("native/vst3/PluginController.h", vst3ControllerHeader(manifest)),
    file("native/vst3/PluginController.cpp", vst3ControllerSource(manifest)),
    file("native/vst3/PluginFactory.cpp", vst3Factory(manifest)),
    file("native/vst3/PluginEditorView_mac.h", editorHeader(manifest)),
    file("native/vst3/PluginEditorView_mac.mm", editorImpl(manifest)),
    file("native/vst3/VST3ParamBridge.h", paramBridgeHeader()),
    file("native/vst3/VST3ParamBridge.cpp", paramBridgeSource(manifest)),
    file("scripts/dev.mjs", devScript()),
    file("scripts/build-web.mjs", buildWebScript()),
    file("scripts/build-wasm.mjs", buildWasmScript()),
    file("scripts/export-vst3-mac.mjs", exportVst3Script()),
    file("scripts/build-vst3-mac.mjs", buildVst3Script()),
    file("scripts/clean.mjs", cleanScript())
  ];
}

export function normalizeManifest(input) {
  const manifest = structuredClone(input);
  if (!["effect", "instrument"].includes(manifest.type)) {
    throw new Error("manifest.type must be effect or instrument");
  }
  if (!Number.isInteger(manifest.audio?.inputs) || manifest.audio.inputs < 0) {
    throw new Error("manifest.audio.inputs must be a non-negative integer");
  }
  if (!Number.isInteger(manifest.audio?.outputs) || manifest.audio.outputs < 1) {
    throw new Error("manifest.audio.outputs must be a positive integer");
  }
  manifest.midi ||= { input: false, output: false };
  manifest.midi.input = Boolean(manifest.midi.input);
  manifest.midi.output = Boolean(manifest.midi.output);
  validateManufacturerId(manifest.manufacturer_id);
  manifest.vst3 ||= {};
  manifest.vst3.processor_cid ||= makeClassId();
  manifest.vst3.controller_cid ||= makeClassId();
  validateClassId(manifest.vst3?.processor_cid, "vst3.processor_cid");
  validateClassId(manifest.vst3?.controller_cid, "vst3.controller_cid");

  if (!Array.isArray(manifest.params) || manifest.params.length === 0) {
    throw new Error("manifest.params must contain at least one parameter");
  }

  const ids = new Set();
  const numericIds = new Set();
  const cppNames = new Set();
  manifest.params = manifest.params.map((inputParam) => {
    const param = { ...inputParam };
    if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(String(param.id || ""))) {
      throw new Error(
        `Parameter id "${param.id}" must start with a letter and contain only letters, digits, ., _, or -`
      );
    }
    if (ids.has(param.id)) {
      throw new Error(`Duplicate parameter id: ${param.id}`);
    }
    ids.add(param.id);

    param.cpp_id = cppParamIdentifier(param.id);
    if (cppNames.has(param.cpp_id)) {
      throw new Error(`Parameter C++ identifier collision after sanitization: ${param.cpp_id}`);
    }
    cppNames.add(param.cpp_id);

    if (param.param_id === undefined) {
      param.param_id = stableParamId(param.id);
    }
    if (!Number.isInteger(param.param_id) || param.param_id <= 0 || param.param_id > 0xffffffff) {
      throw new Error(`Parameter ${param.id} param_id must be an integer from 1 to 4294967295`);
    }
    if (numericIds.has(param.param_id)) {
      throw new Error(`Duplicate parameter param_id: ${param.param_id}`);
    }
    numericIds.add(param.param_id);

    if (!["float", "bool"].includes(param.type)) {
      throw new Error(`Parameter ${param.id} type must be float or bool (enum is planned after v0.1)`);
    }
    if (param.type === "bool") {
      param.min = 0;
      param.max = 1;
      param.default = Boolean(param.default);
      param.step = 1;
    } else {
      for (const field of ["min", "max", "default"]) {
        if (!Number.isFinite(Number(param[field]))) {
          throw new Error(`Parameter ${param.id} ${field} must be a finite number`);
        }
        param[field] = Number(param[field]);
      }
      if (param.max <= param.min) {
        throw new Error(`Parameter ${param.id} max must be greater than min`);
      }
      if (param.default < param.min || param.default > param.max) {
        throw new Error(`Parameter ${param.id} default must be within min/max`);
      }
      param.step = Number.isFinite(Number(param.step))
        ? Number(param.step)
        : sensibleStep(param.min, param.max);
    }
    return param;
  });
  return manifest;
}

function file(path, contents) {
  return { path, contents };
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function makeManifest(config) {
  if (config.params && config.vst3 && config.audio && config.gui && config.dsp) {
    return config;
  }
  return {
    schema_version: 1,
    id: config.id,
    name: config.name,
    manufacturer: config.manufacturer,
    manufacturer_id: config.manufacturerId,
    plugin_id: config.pluginId,
    bundle_id: config.bundleId,
    version: config.version,
    type: config.type,
    audio: {
      inputs: config.audioInputs,
      outputs: config.audioOutputs
    },
    midi: {
      input: Boolean(config.midiInput),
      output: Boolean(config.midiOutput)
    },
    gui: {
      entry: "gui/index.html",
      width: config.guiWidth,
      height: config.guiHeight
    },
    dsp: {
      header: "dsp/PluginDSP.h",
      source: "dsp/PluginDSP.cpp",
      class_name: config.className,
      sample: config.dspSample
    },
    vst3: config.vst3,
    params: config.params
  };
}

function packageJson(manifest) {
  return json({
    name: manifest.id,
    version: manifest.version,
    private: true,
    type: "module",
    scripts: {
      dev: "node ./scripts/dev.mjs",
      "build:web": "node ./scripts/build-web.mjs",
      "build:wasm": "node ./scripts/build-wasm.mjs",
      "export:vst3-mac": "node ./scripts/export-vst3-mac.mjs",
      "build:vst3-mac": "node ./scripts/build-vst3-mac.mjs",
      clean: "node ./scripts/clean.mjs"
    }
  });
}

function readme(manifest) {
  return `# ${manifest.name}

Generated by Jackle v0.1. The same plain C++ DSP is compiled for browser WASM and
macOS VST3. The same plain HTML/CSS/JS GUI runs in the browser and WKWebView.

## Browser

\`\`\`sh
npm run build:wasm
npm run dev
\`\`\`

Open \`http://127.0.0.1:8080\` and click the browser-only START overlay.
\`npm run build:web\` exports the browser files to \`dist/web\`.

The browser requires CMake and Emscripten (\`emcmake\` and \`em++\` on PATH, or
an activated \`EMSDK\` environment).

## macOS VST3

Download the Steinberg VST3 SDK, then:

\`\`\`sh
export VST3_SDK_DIR=/absolute/path/to/vst3sdk
npm run export:vst3-mac
npm run build:vst3-mac
\`\`\`

The build is CLI-first and requires CMake plus Xcode command-line tools.
The resulting bundle is produced under \`build/vst3-mac/VST3/Release\`.

## Architecture

- \`jackle.manifest.json\`: stable plugin, class, and parameter identities.
- \`dsp/\`: shared C++ DSP used by WASM and VST3.
- \`gui/\`: shared HTML/CSS/JS GUI. Controls are created from manifest metadata.
- \`web/\`: AudioWorklet host and Emscripten bindings.
- \`native/vst3/\`: direct VST3 SDK processor/controller and WKWebView bridge.

Browser and VST3 state use the same JSON shape:
\`{"version":1,"parameters":{"parameter-id":value}}\`.

The bridge sends plain parameter values. Target adapters normalize only at the
VST3 boundary. Enum parameters are a documented post-v0.1 TODO.
${manifest.midi.input ? `
## MIDI

This instrument accepts note input. In the browser, click the test-note button
or grant Web MIDI access after starting audio. The VST3 exposes a 16-channel
event input bus and is categorized as \`Instrument|Synth\`.
` : ""}
`;
}

function rootCmake(manifest) {
  const target = cmakeIdentifier(manifest.id);
  const guiResources = [
    "gui/index.html",
    "gui/style.css",
    "gui/app.js",
    "gui/jackle-bridge.js"
  ].join("\n    ");
  return `cmake_minimum_required(VERSION 3.20)
project(${target} VERSION ${manifest.version} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(jackle_dsp STATIC dsp/PluginDSP.cpp)
target_include_directories(jackle_dsp PUBLIC dsp)

if(EMSCRIPTEN)
  add_subdirectory(web)
endif()

if(APPLE AND DEFINED VST3_SDK_DIR)
  enable_language(OBJCXX)
  set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
  set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(SMTG_BUILD_UNIVERSAL_BINARY OFF CACHE BOOL "" FORCE)
  set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)
  add_subdirectory("\${VST3_SDK_DIR}" "\${CMAKE_BINARY_DIR}/vst3-sdk")
  smtg_add_vst3plugin(${target}
    native/vst3/PluginProcessor.cpp
    native/vst3/PluginController.cpp
    native/vst3/PluginFactory.cpp
    native/vst3/PluginEditorView_mac.mm
    native/vst3/VST3ParamBridge.cpp
    "\${VST3_SDK_DIR}/public.sdk/source/main/macmain.cpp"
  )
  target_include_directories(${target} PRIVATE dsp native/vst3)
  target_link_libraries(${target} PRIVATE jackle_dsp sdk "-framework WebKit")
  smtg_target_add_plugin_resources(${target}
    RESOURCES
    ${guiResources}
  )
  set_target_properties(${target} PROPERTIES
    MACOSX_BUNDLE_GUI_IDENTIFIER "${manifest.bundle_id}"
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${manifest.bundle_id}"
  )
endif()
`;
}

function paramIds(manifest) {
  const constants = manifest.params.map((param) =>
    `constexpr uint32_t ${param.cpp_id} = ${param.param_id}u;`
  ).join("\n");
  const rows = manifest.params.map((param) =>
    `  { ${param.cpp_id}, "${escapeCpp(param.id)}", Type::${param.type === "bool" ? "Bool" : "Float"}, ` +
    `${plainNumber(param.min)}, ${plainNumber(param.max)}, ${plainNumber(param.default)}, "${escapeCpp(param.unit || "")}" }`
  ).join(",\n");
  return `#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>

namespace ParamIds {

enum class Type { Float, Bool };

struct Info {
  uint32_t id;
  const char* key;
  Type type;
  double minValue;
  double maxValue;
  double defaultValue;
  const char* unit;
};

${constants}

constexpr std::array<Info, ${manifest.params.length}> all = {{
${rows}
}};
constexpr uint32_t count = static_cast<uint32_t>(all.size());

inline int indexOf(uint32_t id) {
  for (std::size_t index = 0; index < all.size(); ++index) {
    if (all[index].id == id) return static_cast<int>(index);
  }
  return -1;
}

inline int indexOf(const char* key) {
  if (!key) return -1;
  for (std::size_t index = 0; index < all.size(); ++index) {
    const char* left = all[index].key;
    const char* right = key;
    while (*left && *right && *left == *right) { ++left; ++right; }
    if (*left == 0 && *right == 0) return static_cast<int>(index);
  }
  return -1;
}

inline double clampPlain(std::size_t index, double value) {
  const auto& info = all[index];
  if (info.type == Type::Bool) return value >= 0.5 ? 1.0 : 0.0;
  return std::clamp(value, info.minValue, info.maxValue);
}

inline double normalizedToPlain(std::size_t index, double normalized) {
  const auto& info = all[index];
  if (info.type == Type::Bool) return normalized >= 0.5 ? 1.0 : 0.0;
  return info.minValue + std::clamp(normalized, 0.0, 1.0) *
    (info.maxValue - info.minValue);
}

inline double plainToNormalized(std::size_t index, double plain) {
  const auto& info = all[index];
  if (info.type == Type::Bool) return plain >= 0.5 ? 1.0 : 0.0;
  return (clampPlain(index, plain) - info.minValue) /
    (info.maxValue - info.minValue);
}

} // namespace ParamIds
`;
}

function pluginDspHeader(manifest) {
  const synthMembers = isSimpleSynth(manifest)
    ? `  double frequency_ = 440.0;
  float velocity_ = 0.0f;
  float ramp_ = 0.0f;
  int currentNote_ = -1;
  bool noteActive_ = false;
`
    : "";
  return `#pragma once

#include "ParamIds.h"

#include <array>
#include <cstdint>

class PluginDSP {
public:
  PluginDSP();
  void prepare(double sampleRate, uint32_t maxBlockSize);
  void reset();
  void setParameter(uint32_t id, float plainValue);
  float getParameter(uint32_t id) const;
  void noteOn(int note, float velocity);
  void noteOff(int note);
  void process(float** inputs, float** outputs, uint32_t numInputs,
               uint32_t numOutputs, uint32_t numFrames);

private:
  double sampleRate_ = 44100.0;
  double phase_ = 0.0;
${synthMembers}  std::array<float, ${manifest.params.length}> values_{};
};
`;
}

function pluginDspSource(manifest) {
  if (isSimpleSynth(manifest)) {
    return simpleSynthDspSource(manifest);
  }
  const pitchIndex = manifest.params.findIndex((param) => param.sample_role === "frequency");
  const levelIndex = manifest.params.findIndex((param) => param.sample_role === "level");
  const gainIndex = manifest.params.findIndex((param) => param.sample_role === "gain");
  const defaults = manifest.params.map((param) => `${plainNumber(param.default)}f`).join(", ");
  const sampleBody = pitchIndex >= 0 && levelIndex >= 0
    ? `const double pitch = values_[${pitchIndex}];
    const float amplitude = values_[${levelIndex}];
    const float generated = static_cast<float>(std::sin(phase_)) * amplitude;
    phase_ += kTwoPi * pitch / sampleRate_;`
    : `const float amplitude = ${gainIndex >= 0 ? `values_[${gainIndex}]` : "values_[0]"};
    const float generated = static_cast<float>(std::sin(phase_)) * amplitude;
    phase_ += kTwoPi * 220.0 / sampleRate_;`;
  return `#include "PluginDSP.h"

#include <cmath>

namespace {
constexpr double kTwoPi = 6.28318530717958647692;
}

PluginDSP::PluginDSP()
: values_{ ${defaults} } {}

void PluginDSP::prepare(double sampleRate, uint32_t) {
  sampleRate_ = sampleRate > 0.0 ? sampleRate : 44100.0;
  reset();
}

void PluginDSP::reset() {
  phase_ = 0.0;
}

void PluginDSP::setParameter(uint32_t id, float plainValue) {
  const int index = ParamIds::indexOf(id);
  if (index >= 0) {
    values_[static_cast<std::size_t>(index)] =
      static_cast<float>(ParamIds::clampPlain(index, plainValue));
  }
}

float PluginDSP::getParameter(uint32_t id) const {
  const int index = ParamIds::indexOf(id);
  return index >= 0 ? values_[static_cast<std::size_t>(index)] : 0.0f;
}

void PluginDSP::noteOn(int, float) {}

void PluginDSP::noteOff(int) {}

void PluginDSP::process(float** inputs, float** outputs, uint32_t numInputs,
                        uint32_t numOutputs, uint32_t numFrames) {
  for (uint32_t frame = 0; frame < numFrames; ++frame) {
    // Sample DSP only. Parameter transport remains metadata-driven.
    ${sampleBody}
    if (phase_ >= kTwoPi) phase_ -= kTwoPi;

    for (uint32_t channel = 0; channel < numOutputs; ++channel) {
      const float input = channel < numInputs && inputs && inputs[channel]
        ? inputs[channel][frame]
        : 0.0f;
      outputs[channel][frame] = numInputs > 0 ? input * amplitude : generated;
    }
  }
}
`;
}

function simpleSynthDspSource(manifest) {
  const volumeIndex = manifest.params.findIndex((param) => param.sample_role === "volume");
  if (volumeIndex < 0) {
    throw new Error("SimpleSynth DSP requires a parameter with sample_role: volume");
  }
  const defaults = manifest.params.map((param) => `${plainNumber(param.default)}f`).join(", ");
  return `#include "PluginDSP.h"

#include <algorithm>
#include <cmath>

namespace {
constexpr double kTwoPi = 6.28318530717958647692;

double midiNoteToFrequency(int note) {
  return 440.0 * std::pow(2.0, (static_cast<double>(note) - 69.0) / 12.0);
}
}

PluginDSP::PluginDSP()
: values_{ ${defaults} } {}

void PluginDSP::prepare(double sampleRate, uint32_t) {
  sampleRate_ = sampleRate > 0.0 ? sampleRate : 44100.0;
  reset();
}

void PluginDSP::reset() {
  phase_ = 0.0;
  velocity_ = 0.0f;
  ramp_ = 0.0f;
  currentNote_ = -1;
  noteActive_ = false;
}

void PluginDSP::setParameter(uint32_t id, float plainValue) {
  const int index = ParamIds::indexOf(id);
  if (index >= 0) {
    values_[static_cast<std::size_t>(index)] =
      static_cast<float>(ParamIds::clampPlain(index, plainValue));
  }
}

float PluginDSP::getParameter(uint32_t id) const {
  const int index = ParamIds::indexOf(id);
  return index >= 0 ? values_[static_cast<std::size_t>(index)] : 0.0f;
}

void PluginDSP::noteOn(int note, float velocity) {
  currentNote_ = std::clamp(note, 0, 127);
  frequency_ = midiNoteToFrequency(currentNote_);
  velocity_ = std::clamp(velocity, 0.0f, 1.0f);
  noteActive_ = velocity_ > 0.0f;
}

void PluginDSP::noteOff(int note) {
  if (note == currentNote_) {
    noteActive_ = false;
    currentNote_ = -1;
  }
}

void PluginDSP::process(float**, float** outputs, uint32_t,
                        uint32_t numOutputs, uint32_t numFrames) {
  const float rampStep = static_cast<float>(1.0 / std::max(1.0, sampleRate_ * 0.002));
  for (uint32_t frame = 0; frame < numFrames; ++frame) {
    const float target = noteActive_ ? velocity_ : 0.0f;
    if (ramp_ < target) ramp_ = std::min(target, ramp_ + rampStep);
    else if (ramp_ > target) ramp_ = std::max(target, ramp_ - rampStep);

    const float sample = static_cast<float>(std::sin(phase_)) *
      values_[${volumeIndex}] * ramp_;
    phase_ += kTwoPi * frequency_ / sampleRate_;
    if (phase_ >= kTwoPi) phase_ -= kTwoPi;

    for (uint32_t channel = 0; channel < numOutputs; ++channel) {
      outputs[channel][frame] = sample;
    }
  }
}
`;
}

function guiIndex(manifest) {
  const noteStatus = manifest.midi.input
    ? `    <div class="note-status">
      <span>Note</span>
      <strong id="jackle-note">None</strong>
      <span id="jackle-midi-status">MIDI ready</span>
    </div>
`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.name)}</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="panel">
    <h1>${escapeHtml(manifest.name)}</h1>
    <div id="jackle-parameters"></div>
${noteStatus}    <div id="jackle-browser-controls"></div>
    <p id="jackle-status" aria-live="polite">Ready</p>
  </main>
  <script src="./jackle-bridge.js"></script>
  <script src="./app.js"></script>
</body>
</html>
`;
}

function guiStyle() {
  return `:root {
  color-scheme: dark;
  font-family: system-ui, sans-serif;
  background: #111318;
  color: #f4f5f7;
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; }
body { display: grid; place-items: center; }
.panel {
  width: min(560px, calc(100% - 32px));
  padding: 28px;
  border: 1px solid #343943;
  border-radius: 16px;
  background: #1a1d24;
}
h1 { margin: 0 0 24px; font-size: 24px; }
.parameter {
  display: grid;
  grid-template-columns: 110px 1fr 90px;
  gap: 12px;
  align-items: center;
  margin: 18px 0;
}
.parameter input[type="range"] { width: 100%; }
.parameter input[type="checkbox"] { justify-self: start; }
output { text-align: right; font-variant-numeric: tabular-nums; }
.note-status {
  display: grid;
  grid-template-columns: 70px 1fr auto;
  gap: 12px;
  align-items: center;
  margin-top: 24px;
  color: #b7c0cf;
}
#jackle-note { color: #fff; }
.jackle-test-note {
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  border: 1px solid #596273;
  border-radius: 8px;
  background: #282e39;
  color: #fff;
  cursor: pointer;
}
.jackle-test-note:active { background: #3a4352; }
#jackle-status { min-height: 1.25em; margin: 24px 0 0; color: #9ba5b7; }
.jackle-start-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  border: 0;
  background: rgba(10, 12, 16, 0.88);
  color: white;
  font: 600 18px system-ui, sans-serif;
  cursor: pointer;
}
`;
}

function guiApp(manifest) {
  const metadata = manifest.params.map(publicParam);
  return `(() => {
  const parameters = ${JSON.stringify(metadata, null, 2)};
  const container = document.querySelector("#jackle-parameters");
  const controls = new Map();

  const plainValue = (param, control) =>
    param.type === "bool" ? control.checked : Number(control.value);

  const formatValue = (param, value) => {
    if (param.type === "bool") return value ? "On" : "Off";
    const numeric = Number(value);
    const text = Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(2);
    return param.unit ? text + " " + param.unit : text;
  };

  const setControl = (param, value) => {
    const entry = controls.get(param.id);
    if (!entry) return;
    if (param.type === "bool") entry.control.checked = Boolean(value);
    else entry.control.value = String(value);
    entry.output.textContent = formatValue(param, value);
  };

  for (const param of parameters) {
    const row = document.createElement("label");
    row.className = "parameter";
    const name = document.createElement("span");
    name.textContent = param.name;
    const control = document.createElement("input");
    control.dataset.param = param.id;
    control.type = param.type === "bool" ? "checkbox" : "range";
    if (param.type === "float") {
      control.min = String(param.min);
      control.max = String(param.max);
      control.step = String(param.step);
      control.value = String(param.default);
    } else {
      control.checked = Boolean(param.default);
    }
    const output = document.createElement("output");
    controls.set(param.id, { control, output });
    setControl(param, param.default);
    control.addEventListener("input", () => {
      const value = plainValue(param, control);
      output.textContent = formatValue(param, value);
      window.JackleBridge.setParameter(param.id, value);
    });
    row.append(name, control, output);
    container.appendChild(row);
  }

  window.addEventListener("jackle-parameter", (event) => {
    const param = parameters.find((item) => item.id === event.detail.id);
    if (param) setControl(param, event.detail.value);
  });

  window.addEventListener("jackle-state", (event) => {
    for (const param of parameters) {
      if (Object.hasOwn(event.detail.parameters || {}, param.id)) {
        setControl(param, event.detail.parameters[param.id]);
      }
    }
  });

  window.JackleBridge.ready();
})();
`;
}

function guiBridge(manifest) {
  const browserMidiControls = manifest.midi.input
    ? `
    const controls = document.querySelector("#jackle-browser-controls");
    const testNote = document.createElement("button");
    testNote.type = "button";
    testNote.className = "jackle-test-note";
    testNote.textContent = "Play test note (A4)";
    let noteTimer = 0;
    testNote.addEventListener("click", () => {
      window.clearTimeout(noteTimer);
      window.JackleBridge.sendNoteOn(69, 0.8);
      noteTimer = window.setTimeout(() => {
        window.JackleBridge.sendNoteOff(69);
      }, 500);
    });
    controls?.appendChild(testNote);
`
    : "";
  return `(() => {
  const status = () => document.querySelector("#jackle-status");
  let webTargetReady = null;

  const postNative = (message) => {
    const handler = window.webkit?.messageHandlers?.jackle;
    if (handler) {
      handler.postMessage(message);
      return true;
    }
    return false;
  };

  const loadWebTarget = () => {
    if (!webTargetReady) {
      webTargetReady = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "../web/main.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load the browser target"));
        document.head.appendChild(script);
      });
    }
    return webTargetReady;
  };

  window.JackleBridge = {
    setParameter(id, value) {
      if (!postNative({ type: "parameter", id, value })) {
        window.dispatchEvent(new CustomEvent("jackle-gui-parameter", {
          detail: { id, value }
        }));
      }
    },
    sendNoteOn(note, velocity = 1) {
      if (!postNative({ type: "noteOn", note, velocity })) {
        window.dispatchEvent(new CustomEvent("jackle-gui-note", {
          detail: { type: "noteOn", note, velocity }
        }));
      }
    },
    sendNoteOff(note) {
      if (!postNative({ type: "noteOff", note })) {
        window.dispatchEvent(new CustomEvent("jackle-gui-note", {
          detail: { type: "noteOff", note }
        }));
      }
    },
    receiveNote(note, active) {
      const display = document.querySelector("#jackle-note");
      if (display) display.textContent = active ? midiNoteName(note) : "None";
    },
    receiveParameter(id, value) {
      window.dispatchEvent(new CustomEvent("jackle-parameter", {
        detail: { id, value }
      }));
    },
    setState(state) {
      window.dispatchEvent(new CustomEvent("jackle-state", { detail: state }));
    },
    getState() {
      return window.JackleWeb?.getState?.() || null;
    },
    ready() {
      postNative({ type: "ready" });
    },
    setStatus(message) {
      const target = status();
      if (target) target.textContent = message;
    }
  };

  if (!window.__JACKLE_NATIVE__) {
${browserMidiControls}
    const overlay = document.createElement("button");
    overlay.type = "button";
    overlay.className = "jackle-start-overlay";
    overlay.textContent = "Click to start audio";
    overlay.addEventListener("click", async () => {
      overlay.disabled = true;
      window.JackleBridge.setStatus("Starting audio...");
      try {
        await loadWebTarget();
        await window.JackleWeb.start();
        overlay.remove();
        window.JackleBridge.setStatus("WASM audio running");
      } catch (error) {
        overlay.disabled = false;
        window.JackleBridge.setStatus(error.message);
      }
    });
    document.body.appendChild(overlay);
  }

  function midiNoteName(note) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return names[note % 12] + String(Math.floor(note / 12) - 1);
  }
})();
`;
}

function webMain(manifest) {
  const defaults = Object.fromEntries(
    manifest.params.map((param) => [param.id, param.default])
  );
  return `(() => {
  let context = null;
  let node = null;
  let state = ${JSON.stringify({ version: 1, parameters: defaults }, null, 2)};
  const midiEnabled = ${manifest.midi.input};

  const sendState = () => {
    if (node) node.port.postMessage({ type: "state", state });
    window.JackleBridge.setState(state);
  };

  async function start() {
    if (context) {
      await context.resume();
      return;
    }
    context = new AudioContext();
    await context.audioWorklet.addModule("../web/worklet.js");
    node = new AudioWorkletNode(context, "jackle-processor", {
      outputChannelCount: [${manifest.audio.outputs || 2}]
    });
    node.connect(context.destination);
    node.port.onmessage = (event) => {
      if (event.data?.type === "status") {
        window.JackleBridge.setStatus(event.data.message);
      }
    };
    const wasmResponse = await fetch("../web/jackle-dsp.wasm");
    if (!wasmResponse.ok) {
      throw new Error("Could not load WASM: HTTP " + wasmResponse.status);
    }
    const wasmBinary = await wasmResponse.arrayBuffer();
    node.port.postMessage({ type: "wasm", wasmBinary }, [wasmBinary]);
    window.addEventListener("jackle-gui-parameter", (event) => {
      state.parameters[event.detail.id] = event.detail.value;
      node.port.postMessage({
        type: "parameter",
        id: event.detail.id,
        value: event.detail.value
      });
    });
    if (midiEnabled) {
      window.addEventListener("jackle-gui-note", (event) => {
        node.port.postMessage(event.detail);
        window.JackleBridge.receiveNote(
          event.detail.note,
          event.detail.type === "noteOn"
        );
      });
      await connectWebMidi();
    }
    sendState();
    await context.resume();
  }

  async function connectWebMidi() {
    const status = document.querySelector("#jackle-midi-status");
    if (!navigator.requestMIDIAccess) {
      if (status) status.textContent = "Web MIDI unavailable";
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      const connectInputs = () => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = (event) => {
            const command = event.data[0] & 0xf0;
            const note = event.data[1];
            const velocity = event.data[2] / 127;
            if (command === 0x90 && velocity > 0) {
              node.port.postMessage({ type: "noteOn", note, velocity });
              window.JackleBridge.receiveNote(note, true);
            } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
              node.port.postMessage({ type: "noteOff", note });
              window.JackleBridge.receiveNote(note, false);
            }
          };
        }
        if (status) {
          status.textContent = access.inputs.size
            ? "Web MIDI connected"
            : "Web MIDI ready";
        }
      };
      access.onstatechange = connectInputs;
      connectInputs();
    } catch {
      if (status) status.textContent = "Web MIDI permission denied";
    }
  }

  function getState() {
    return structuredClone(state);
  }

  function setState(nextState) {
    if (!nextState || nextState.version !== 1 || !nextState.parameters) {
      throw new Error("Invalid Jackle state");
    }
    state = structuredClone(nextState);
    sendState();
  }

  window.JackleWeb = { start, getState, setState };
})();
`;
}

function worklet(manifest) {
  const metadata = manifest.params.map(publicParam);
  return `import createJackleModule from "./jackle-dsp.js";

const parameters = ${JSON.stringify(metadata, null, 2)};
const byId = new Map(parameters.map((param) => [param.id, param]));

class JackleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.processBlock = null;
    this.setParameter = null;
    this.noteOn = null;
    this.noteOff = null;
    this.outputPointer = 0;
    this.outputCapacity = 0;
    this.pending = new Map(parameters.map((param) => [param.id, param.default]));
    this.pendingNotes = [];
    this.port.onmessage = (event) => this.receive(event.data);
  }

  async load(wasmBinary) {
    try {
      this.module = await createJackleModule({
        wasmBinary,
        locateFile: (name) => name
      });
      this.module._jackle_prepare(sampleRate, 128);
      this.processBlock = this.module._jackle_process;
      this.setParameter = this.module._jackle_set_parameter;
      this.noteOn = this.module._jackle_note_on;
      this.noteOff = this.module._jackle_note_off;
      for (const [id, value] of this.pending) this.applyParameter(id, value);
      for (const note of this.pendingNotes) this.applyNote(note);
      this.pendingNotes.length = 0;
      this.port.postMessage({ type: "status", message: "WASM DSP ready" });
    } catch (error) {
      this.port.postMessage({
        type: "status",
        message: "WASM load failed: " + error.message
      });
    }
  }

  receive(message) {
    if (message?.type === "parameter") {
      this.pending.set(message.id, message.value);
      this.applyParameter(message.id, message.value);
    } else if (message?.type === "state") {
      for (const [id, value] of Object.entries(message.state.parameters || {})) {
        this.pending.set(id, value);
        this.applyParameter(id, value);
      }
    } else if (message?.type === "wasm" && message.wasmBinary) {
      this.load(message.wasmBinary);
    } else if (message?.type === "noteOn" || message?.type === "noteOff") {
      if (this.noteOn && this.noteOff) this.applyNote(message);
      else this.pendingNotes.push(message);
    }
  }

  applyNote(message) {
    if (message.type === "noteOn") this.noteOn(message.note, message.velocity);
    else this.noteOff(message.note);
  }

  applyParameter(id, value) {
    const param = byId.get(id);
    if (param && this.setParameter) {
      this.setParameter(param.param_id, param.type === "bool" ? Number(Boolean(value)) : Number(value));
    }
  }

  ensureOutput(frames, channels) {
    const samples = frames * channels;
    if (samples <= this.outputCapacity) return;
    if (this.outputPointer) this.module._free(this.outputPointer);
    this.outputPointer = this.module._malloc(samples * Float32Array.BYTES_PER_ELEMENT);
    this.outputCapacity = samples;
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!this.module || !this.processBlock || !output?.length) return true;
    const frames = output[0].length;
    this.ensureOutput(frames, output.length);
    this.processBlock(this.outputPointer, frames, output.length);
    const start = this.outputPointer >> 2;
    for (let channel = 0; channel < output.length; channel += 1) {
      for (let frame = 0; frame < frames; frame += 1) {
        output[channel][frame] =
          this.module.HEAPF32[start + frame * output.length + channel];
      }
    }
    return true;
  }
}

registerProcessor("jackle-processor", JackleProcessor);
`;
}

function wasmBindings() {
  return `#include "../dsp/PluginDSP.h"

#include <algorithm>
#include <array>
#include <cstdint>

namespace {
PluginDSP dsp;
constexpr uint32_t kMaxChannels = 2;
constexpr uint32_t kMaxFrames = 2048;
std::array<std::array<float, kMaxFrames>, kMaxChannels> storage{};
std::array<float*, kMaxChannels> channels{};
}

extern "C" {

void jackle_prepare(double sampleRate, uint32_t maxBlockSize) {
  dsp.prepare(sampleRate, maxBlockSize);
}

void jackle_reset() {
  dsp.reset();
}

void jackle_set_parameter(uint32_t id, float plainValue) {
  dsp.setParameter(id, plainValue);
}

float jackle_get_parameter(uint32_t id) {
  return dsp.getParameter(id);
}

void jackle_note_on(int note, float velocity) {
  dsp.noteOn(note, velocity);
}

void jackle_note_off(int note) {
  dsp.noteOff(note);
}

void jackle_process(float* interleavedOutput, uint32_t numFrames,
                    uint32_t numChannels) {
  const uint32_t frames = std::min(numFrames, kMaxFrames);
  const uint32_t outputChannels = std::min(numChannels, kMaxChannels);
  for (uint32_t channel = 0; channel < outputChannels; ++channel) {
    channels[channel] = storage[channel].data();
  }
  dsp.process(nullptr, channels.data(), 0, outputChannels, frames);
  for (uint32_t frame = 0; frame < frames; ++frame) {
    for (uint32_t channel = 0; channel < numChannels; ++channel) {
      interleavedOutput[frame * numChannels + channel] =
        channel < outputChannels ? storage[channel][frame] : 0.0f;
    }
  }
  for (uint32_t frame = frames; frame < numFrames; ++frame) {
    for (uint32_t channel = 0; channel < numChannels; ++channel) {
      interleavedOutput[frame * numChannels + channel] = 0.0f;
    }
  }
}

}
`;
}

function webCmake() {
  return `add_executable(jackle-dsp wasm-bindings.cpp)
target_link_libraries(jackle-dsp PRIVATE jackle_dsp)
set_target_properties(jackle-dsp PROPERTIES OUTPUT_NAME "jackle-dsp" SUFFIX ".js")
target_link_options(jackle-dsp PRIVATE
  "-O3"
  "-sWASM=1"
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sENVIRONMENT=web,worker"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_jackle_prepare','_jackle_reset','_jackle_set_parameter','_jackle_get_parameter','_jackle_note_on','_jackle_note_off','_jackle_process']"
)
`;
}

function vst3ProcessorHeader(manifest) {
  const className = cppIdentifier(manifest.name);
  return `#pragma once

#include "public.sdk/source/vst/vstaudioeffect.h"
#include "../../dsp/PluginDSP.h"

#include <array>

class ${className}Processor final : public Steinberg::Vst::AudioEffect {
public:
  ${className}Processor();
  static Steinberg::FUnknown* createInstance(void*);
  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) override;
  Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) override;
  Steinberg::tresult PLUGIN_API setupProcessing(
    Steinberg::Vst::ProcessSetup& setup) override;
  Steinberg::tresult PLUGIN_API process(
    Steinberg::Vst::ProcessData& data) override;
  Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* state) override;
  Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* state) override;

private:
  void applyParameter(std::size_t index, double plainValue);
  PluginDSP dsp_;
  std::array<double, ParamIds::count> values_{};
};
`;
}

function vst3ProcessorSource(manifest) {
  const className = cppIdentifier(manifest.name);
  const defaults = manifest.params.map((param) => plainNumber(param.default)).join(", ");
  return `#include "PluginProcessor.h"
#include "PluginController.h"

#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"

#include <algorithm>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <string>

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
std::string readState(IBStream* stream) {
  std::string result;
  char buffer[512];
  int32 read = 0;
  while (stream && stream->read(buffer, sizeof(buffer), &read) == kResultOk && read > 0) {
    result.append(buffer, static_cast<std::size_t>(read));
  }
  return result;
}

bool findNumber(const std::string& json, const char* key, double& value) {
  const std::string token = std::string("\\\"") + key + "\\\"";
  const auto keyAt = json.find(token);
  if (keyAt == std::string::npos) return false;
  const auto colon = json.find(':', keyAt + token.size());
  if (colon == std::string::npos) return false;
  const char* start = json.c_str() + colon + 1;
  while (*start == ' ' || *start == '\\t' || *start == '\\n') ++start;
  if (std::strncmp(start, "true", 4) == 0) { value = 1.0; return true; }
  if (std::strncmp(start, "false", 5) == 0) { value = 0.0; return true; }
  char* end = nullptr;
  value = std::strtod(start, &end);
  return end != start;
}
}

${className}Processor::${className}Processor()
: values_{ ${defaults} } {
  setControllerClass(${className}Controller::cid);
  for (std::size_t index = 0; index < values_.size(); ++index) {
    applyParameter(index, values_[index]);
  }
}

FUnknown* ${className}Processor::createInstance(void*) {
  return static_cast<IAudioProcessor*>(new ${className}Processor());
}

tresult PLUGIN_API ${className}Processor::initialize(FUnknown* context) {
  const tresult result = AudioEffect::initialize(context);
  if (result != kResultOk) return result;
  ${audioBusLines(manifest)}
  return kResultOk;
}

tresult PLUGIN_API ${className}Processor::setupProcessing(ProcessSetup& setup) {
  dsp_.prepare(setup.sampleRate, static_cast<uint32_t>(setup.maxSamplesPerBlock));
  return AudioEffect::setupProcessing(setup);
}

tresult PLUGIN_API ${className}Processor::setActive(TBool state) {
  if (state) dsp_.reset();
  return AudioEffect::setActive(state);
}

void ${className}Processor::applyParameter(std::size_t index, double plainValue) {
  values_[index] = ParamIds::clampPlain(index, plainValue);
  dsp_.setParameter(ParamIds::all[index].id, static_cast<float>(values_[index]));
}

tresult PLUGIN_API ${className}Processor::process(ProcessData& data) {
  if (data.inputParameterChanges) {
    const int32 count = data.inputParameterChanges->getParameterCount();
    for (int32 queueIndex = 0; queueIndex < count; ++queueIndex) {
      IParamValueQueue* queue = data.inputParameterChanges->getParameterData(queueIndex);
      if (!queue || queue->getPointCount() == 0) continue;
      int32 sampleOffset = 0;
      ParamValue normalized = 0.0;
      queue->getPoint(queue->getPointCount() - 1, sampleOffset, normalized);
      const int index = ParamIds::indexOf(queue->getParameterId());
      if (index >= 0) applyParameter(index, ParamIds::normalizedToPlain(index, normalized));
    }
  }
  if (data.numOutputs == 0 || !data.outputs) return kResultOk;
  auto& output = data.outputs[0];
  float** inputs = data.numInputs > 0 && data.inputs ? data.inputs[0].channelBuffers32 : nullptr;
  const uint32 inputChannels = data.numInputs > 0 && data.inputs
    ? static_cast<uint32>(data.inputs[0].numChannels) : 0;
  const uint32 outputChannels = static_cast<uint32>(output.numChannels);
  const uint32 totalFrames = static_cast<uint32>(data.numSamples);
  uint32 processed = 0;
  const int32 eventCount = data.inputEvents ? data.inputEvents->getEventCount() : 0;

  auto processFrames = [&](uint32 frames) {
    if (frames == 0) return;
    std::array<float*, 32> inputPointers{};
    std::array<float*, 32> outputPointers{};
    for (uint32 channel = 0; channel < inputChannels && channel < inputPointers.size(); ++channel) {
      inputPointers[channel] = inputs[channel] + processed;
    }
    for (uint32 channel = 0; channel < outputChannels && channel < outputPointers.size(); ++channel) {
      outputPointers[channel] = output.channelBuffers32[channel] + processed;
    }
    dsp_.process(inputPointers.data(), outputPointers.data(), inputChannels,
                 outputChannels, frames);
    processed += frames;
  };

  for (int32 eventIndex = 0; eventIndex < eventCount; ++eventIndex) {
    Event event{};
    if (data.inputEvents->getEvent(eventIndex, event) != kResultOk) continue;
    const uint32 eventOffset = static_cast<uint32>(
      std::clamp(event.sampleOffset, 0, data.numSamples));
    if (eventOffset > processed) processFrames(eventOffset - processed);
    if (event.type == Event::kNoteOnEvent) {
      dsp_.noteOn(event.noteOn.pitch, event.noteOn.velocity);
    } else if (event.type == Event::kNoteOffEvent) {
      dsp_.noteOff(event.noteOff.pitch);
    }
  }
  if (processed < totalFrames) processFrames(totalFrames - processed);
  return kResultOk;
}

tresult PLUGIN_API ${className}Processor::getState(IBStream* state) {
  if (!state) return kInvalidArgument;
  std::string json = "{\\\"version\\\":1,\\\"parameters\\\":{";
  for (std::size_t index = 0; index < values_.size(); ++index) {
    if (index) json += ",";
    json += "\\\"" + std::string(ParamIds::all[index].key) + "\\\":";
    if (ParamIds::all[index].type == ParamIds::Type::Bool) {
      json += values_[index] >= 0.5 ? "true" : "false";
    } else {
      char number[64];
      std::snprintf(number, sizeof(number), "%.17g", values_[index]);
      json += number;
    }
  }
  json += "}}";
  int32 written = 0;
  return state->write(json.data(), static_cast<int32>(json.size()), &written);
}

tresult PLUGIN_API ${className}Processor::setState(IBStream* state) {
  const std::string json = readState(state);
  if (json.find("\\\"version\\\":1") == std::string::npos) return kResultFalse;
  for (std::size_t index = 0; index < values_.size(); ++index) {
    double value = values_[index];
    if (findNumber(json, ParamIds::all[index].key, value)) applyParameter(index, value);
  }
  return kResultOk;
}
`;
}

function vst3ControllerHeader(manifest) {
  const className = cppIdentifier(manifest.name);
  return `#pragma once

#include "public.sdk/source/vst/vsteditcontroller.h"

class ${className}Controller final : public Steinberg::Vst::EditController {
public:
  static const Steinberg::FUID cid;
  static Steinberg::FUnknown* createInstance(void*);
  Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown* context) override;
  Steinberg::tresult PLUGIN_API setComponentState(Steinberg::IBStream* state) override;
  Steinberg::IPlugView* PLUGIN_API createView(Steinberg::FIDString name) override;
};
`;
}

function vst3ControllerSource(manifest) {
  const className = cppIdentifier(manifest.name);
  const registrations = manifest.params.map((param, index) => {
    const flags = "ParameterInfo::kCanAutomate";
    const stepCount = param.type === "bool" ? 1 : 0;
    return `  parameters.addParameter(STR16("${escapeCpp(param.name)}"), ` +
      `${param.unit ? `STR16("${escapeCpp(param.unit)}")` : "nullptr"}, ${stepCount}, ` +
      `${normalizedDefault(param)}, ${flags}, ParamIds::${param.cpp_id});`;
  }).join("\n");
  return `#include "PluginController.h"
#include "PluginEditorView_mac.h"
#include "../../dsp/ParamIds.h"

#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivstplugview.h"

#include <cstdlib>
#include <cstring>
#include <string>

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
std::string readState(IBStream* stream) {
  std::string result;
  char buffer[512];
  int32 read = 0;
  while (stream && stream->read(buffer, sizeof(buffer), &read) == kResultOk && read > 0) {
    result.append(buffer, static_cast<std::size_t>(read));
  }
  return result;
}

bool findNumber(const std::string& json, const char* key, double& value) {
  const std::string token = std::string("\\\"") + key + "\\\"";
  const auto keyAt = json.find(token);
  if (keyAt == std::string::npos) return false;
  const auto colon = json.find(':', keyAt + token.size());
  if (colon == std::string::npos) return false;
  const char* start = json.c_str() + colon + 1;
  while (*start == ' ' || *start == '\\t' || *start == '\\n') ++start;
  if (std::strncmp(start, "true", 4) == 0) { value = 1.0; return true; }
  if (std::strncmp(start, "false", 5) == 0) { value = 0.0; return true; }
  char* end = nullptr;
  value = std::strtod(start, &end);
  return end != start;
}
}

const FUID ${className}Controller::cid(${fuidWords(manifest.vst3.controller_cid)});

FUnknown* ${className}Controller::createInstance(void*) {
  return static_cast<IEditController*>(new ${className}Controller());
}

tresult PLUGIN_API ${className}Controller::initialize(FUnknown* context) {
  const tresult result = EditController::initialize(context);
  if (result != kResultOk) return result;
${registrations}
  return kResultOk;
}

tresult PLUGIN_API ${className}Controller::setComponentState(IBStream* state) {
  const std::string json = readState(state);
  if (json.find("\\\"version\\\":1") == std::string::npos) return kResultFalse;
  for (std::size_t index = 0; index < ParamIds::all.size(); ++index) {
    double plain = ParamIds::all[index].defaultValue;
    if (findNumber(json, ParamIds::all[index].key, plain)) {
      setParamNormalized(ParamIds::all[index].id,
                         ParamIds::plainToNormalized(index, plain));
    }
  }
  return kResultOk;
}

IPlugView* PLUGIN_API ${className}Controller::createView(FIDString name) {
  return name && std::strcmp(name, ViewType::kEditor) == 0
    ? new PluginEditorView(this)
    : nullptr;
}
`;
}

function vst3Factory(manifest) {
  const className = cppIdentifier(manifest.name);
  return `#include "PluginProcessor.h"
#include "PluginController.h"

#include "public.sdk/source/main/pluginfactory.h"

#define stringPluginName "${escapeCpp(manifest.name)}"

using namespace Steinberg;
using namespace Steinberg::Vst;

static const FUID kProcessorCID(${fuidWords(manifest.vst3.processor_cid)});

BEGIN_FACTORY_DEF("${escapeCpp(manifest.manufacturer)}",
                  "https://example.invalid",
                  "mailto:support@example.invalid")

DEF_CLASS2(INLINE_UID_FROM_FUID(kProcessorCID),
           PClassInfo::kManyInstances, kVstAudioEffectClass, stringPluginName,
           Vst::kDistributable,
           "${manifest.type === "instrument" ? "Instrument|Synth" : "Fx"}",
           "${escapeCpp(manifest.version)}", kVstVersionString,
           ${className}Processor::createInstance)

DEF_CLASS2(INLINE_UID_FROM_FUID(${className}Controller::cid),
           PClassInfo::kManyInstances, kVstComponentControllerClass,
           stringPluginName " Controller", 0, "",
           "${escapeCpp(manifest.version)}", kVstVersionString,
           ${className}Controller::createInstance)

END_FACTORY
`;
}

function editorHeader(manifest) {
  return `#pragma once

#include "public.sdk/source/common/pluginview.h"
#include "public.sdk/source/vst/vsteditcontroller.h"

class VST3ParamBridge;

class PluginEditorView final : public Steinberg::CPluginView {
public:
  explicit PluginEditorView(Steinberg::Vst::EditController* controller);
  ~PluginEditorView() override;
  Steinberg::tresult PLUGIN_API isPlatformTypeSupported(
    Steinberg::FIDString type) override;
  Steinberg::tresult PLUGIN_API attached(void* parent,
                                        Steinberg::FIDString type) override;
  Steinberg::tresult PLUGIN_API removed() override;

private:
  Steinberg::Vst::EditController* controller_ = nullptr;
  void* webView_ = nullptr;
  void* messageHandler_ = nullptr;
  VST3ParamBridge* bridge_ = nullptr;
};
`;
}

function editorImpl(manifest) {
  return `#include "PluginEditorView_mac.h"
#include "VST3ParamBridge.h"

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

#include "pluginterfaces/gui/iplugview.h"

#include <cstring>

using namespace Steinberg;

@interface JackleMessageHandler : NSObject <WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, assign) VST3ParamBridge* bridge;
@property(nonatomic, assign) WKWebView* webView;
- (void)syncState;
@end

@implementation JackleMessageHandler
- (void)syncState {
  if (!self.bridge || !self.webView) return;
  const std::string json = self.bridge->stateJson();
  NSString* script = [NSString stringWithFormat:
    @"window.JackleBridge && window.JackleBridge.setState(%s);", json.c_str()];
  [self.webView evaluateJavaScript:script completionHandler:nil];
}

- (void)userContentController:(WKUserContentController*)controller
      didReceiveScriptMessage:(WKScriptMessage*)message {
  NSDictionary* body = [message.body isKindOfClass:[NSDictionary class]]
    ? (NSDictionary*)message.body : nil;
  NSString* type = body[@"type"];
  if ([type isEqualToString:@"parameter"]) {
    NSString* key = body[@"id"];
    NSNumber* value = body[@"value"];
    if (key && value) self.bridge->setParameter([key UTF8String], [value doubleValue]);
  } else if ([type isEqualToString:@"ready"]) {
    [self syncState];
  }
}

- (void)webView:(WKWebView*)webView
      didFinishNavigation:(WKNavigation*)navigation {
  [self syncState];
}
@end

PluginEditorView::PluginEditorView(Vst::EditController* controller)
: CPluginView(nullptr), controller_(controller) {
  setRect(ViewRect(0, 0, ${manifest.gui.width}, ${manifest.gui.height}));
}

PluginEditorView::~PluginEditorView() {
  removed();
}

tresult PLUGIN_API PluginEditorView::isPlatformTypeSupported(FIDString type) {
  return type && std::strcmp(type, kPlatformTypeNSView) == 0
    ? kResultTrue : kResultFalse;
}

tresult PLUGIN_API PluginEditorView::attached(void* parent, FIDString type) {
  if (isPlatformTypeSupported(type) != kResultTrue || !parent) return kResultFalse;

  NSView* parentView = (__bridge NSView*)parent;
  WKWebViewConfiguration* configuration = [[WKWebViewConfiguration alloc] init];
  WKUserContentController* content = [[WKUserContentController alloc] init];
  configuration.userContentController = content;
  [content addUserScript:[[WKUserScript alloc]
    initWithSource:@"window.__JACKLE_NATIVE__ = true;"
    injectionTime:WKUserScriptInjectionTimeAtDocumentStart
    forMainFrameOnly:YES]];

  bridge_ = new VST3ParamBridge(controller_);
  JackleMessageHandler* handler = [[JackleMessageHandler alloc] init];
  handler.bridge = bridge_;
  [content addScriptMessageHandler:handler name:@"jackle"];

  WKWebView* view = [[WKWebView alloc] initWithFrame:parentView.bounds
                                      configuration:configuration];
  [content release];
  [configuration release];
  handler.webView = view;
  view.navigationDelegate = handler;
  view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [parentView addSubview:view];
  messageHandler_ = (void*)handler;
  webView_ = (void*)view;

  NSBundle* bundle = [NSBundle bundleForClass:[JackleMessageHandler class]];
  NSURL* guiURL = [bundle URLForResource:@"index" withExtension:@"html"];
  if (guiURL) {
    [view loadFileURL:guiURL
      allowingReadAccessToURL:[guiURL URLByDeletingLastPathComponent]];
  } else {
    [view loadHTMLString:@"<html><body>Jackle GUI resource missing.</body></html>"
                 baseURL:nil];
  }
  return kResultOk;
}

tresult PLUGIN_API PluginEditorView::removed() {
  if (webView_) {
    WKWebView* view = (WKWebView*)webView_;
    [view.configuration.userContentController removeScriptMessageHandlerForName:@"jackle"];
    [view removeFromSuperview];
    [view release];
    webView_ = nullptr;
  }
  if (messageHandler_) {
    JackleMessageHandler* handler = (JackleMessageHandler*)messageHandler_;
    handler.bridge = nullptr;
    handler.webView = nil;
    [handler release];
    messageHandler_ = nullptr;
  }
  delete bridge_;
  bridge_ = nullptr;
  return CPluginView::removed();
}
`;
}

function paramBridgeHeader() {
  return `#pragma once

#include "public.sdk/source/vst/vsteditcontroller.h"

#include <string>

class VST3ParamBridge {
public:
  explicit VST3ParamBridge(Steinberg::Vst::EditController* controller);
  void setParameter(const char* key, double plainValue);
  std::string stateJson() const;

private:
  Steinberg::Vst::EditController* controller_ = nullptr;
};
`;
}

function paramBridgeSource(manifest) {
  return `#include "VST3ParamBridge.h"
#include "../../dsp/ParamIds.h"

#include <cstdio>

using namespace Steinberg;
using namespace Steinberg::Vst;

VST3ParamBridge::VST3ParamBridge(EditController* controller)
: controller_(controller) {}

void VST3ParamBridge::setParameter(const char* key, double plainValue) {
  if (!controller_) return;
  const int index = ParamIds::indexOf(key);
  if (index < 0) return;
  const ParamID id = ParamIds::all[index].id;
  const ParamValue normalized = ParamIds::plainToNormalized(index, plainValue);
  controller_->beginEdit(id);
  controller_->performEdit(id, normalized);
  controller_->setParamNormalized(id, normalized);
  controller_->endEdit(id);
}

std::string VST3ParamBridge::stateJson() const {
  std::string json = "{\\\"version\\\":1,\\\"parameters\\\":{";
  for (std::size_t index = 0; index < ParamIds::all.size(); ++index) {
    if (index) json += ",";
    const double normalized = controller_
      ? controller_->getParamNormalized(ParamIds::all[index].id)
      : ParamIds::plainToNormalized(index, ParamIds::all[index].defaultValue);
    const double plain = ParamIds::normalizedToPlain(index, normalized);
    json += "\\\"" + std::string(ParamIds::all[index].key) + "\\\":";
    if (ParamIds::all[index].type == ParamIds::Type::Bool) {
      json += plain >= 0.5 ? "true" : "false";
    } else {
      char number[64];
      std::snprintf(number, sizeof(number), "%.17g", plain);
      json += number;
    }
  }
  json += "}}";
  return json;
}
`;
}

function devScript() {
  return `import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 8080);
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".wasm": "application/wasm"
};

const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.writeHead(302, { Location: "/gui/index.html" }).end();
    return;
  }
  const pathname = request.url;
  const relative = decodeURIComponent(pathname.split("?")[0]).replace(/^\\/+/, "");
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filename);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": types[path.extname(filename)] || "application/octet-stream",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    });
    createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log("Jackle dev server: http://127.0.0.1:" + port);
});
`;
}

function buildWebScript() {
  return `import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist", "web");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "gui"), path.join(output, "gui"), { recursive: true });
await cp(path.join(root, "web"), path.join(output, "web"), { recursive: true });
console.log("Web files exported to " + output);
`;
}

function buildWasmScript() {
  return `import { access, cp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const buildDir = path.join(root, "build", "wasm");
const outputDir = path.join(root, "web");

requireCommand("cmake", "Install CMake and ensure cmake is on PATH.");
requireCommand("emcmake",
  "Activate the Emscripten SDK environment (source emsdk_env.sh) so emcmake and em++ are on PATH.");
requireCommand("em++",
  "Activate the Emscripten SDK environment (source emsdk_env.sh) so emcmake and em++ are on PATH.");

await mkdir(buildDir, { recursive: true });
await run("emcmake", ["cmake", "-S", root, "-B", buildDir]);
await run("cmake", ["--build", buildDir, "--config", "Release"]);

for (const extension of [".js", ".wasm"]) {
  const candidates = [
    path.join(buildDir, "web", "jackle-dsp" + extension),
    path.join(buildDir, "web", "Release", "jackle-dsp" + extension)
  ];
  const source = await firstExisting(candidates);
  if (!source) {
    throw new Error("WASM build completed but jackle-dsp" + extension + " was not produced.");
  }
  await cp(source, path.join(outputDir, "jackle-dsp" + extension));
}
console.log("WASM AudioWorklet module built in " + outputDir);

function requireCommand(command, fix) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (result.error?.code === "ENOENT") {
    throw new Error("Missing required command: " + command + ". " + fix);
  }
}

async function firstExisting(candidates) {
  for (const filename of candidates) {
    try {
      await access(filename, constants.R_OK);
      return filename;
    } catch {}
  }
  return null;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => reject(new Error(
      "Could not run " + command + ": " + error.message
    )));
    child.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(command + " " + args.join(" ") + " exited with " + code)));
  });
}
`;
}

function exportVst3Script() {
  return `import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const sdk = process.env.VST3_SDK_DIR;
if (!sdk) {
  throw new Error(
    "Missing VST3_SDK_DIR. Set it to the absolute Steinberg VST3 SDK path before export."
  );
}
await access(path.join(sdk, "CMakeLists.txt")).catch(() => {
  throw new Error(
    "Invalid VST3_SDK_DIR: " + sdk + ". Expected CMakeLists.txt in the SDK root."
  );
});

const root = process.cwd();
const output = path.join(root, "dist", "vst3-mac-source");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ["CMakeLists.txt", "dsp", "gui", "native", "jackle.manifest.json"]) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
console.log("VST3 macOS source exported to " + output);
`;
}

function buildVst3Script() {
  return `import { access, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

if (process.platform !== "darwin") {
  throw new Error("build:vst3-mac requires macOS.");
}
requireCommand("cmake", ["--version"], "Install CMake and ensure cmake is on PATH.");
requireCommand("xcode-select", ["-p"],
  "Install Xcode command-line tools with: xcode-select --install");
requireCommand("xcodebuild", ["-version"],
  "Install full Xcode and select it with: sudo xcode-select -s /Applications/Xcode.app");

const sdk = process.env.VST3_SDK_DIR;
if (!sdk) {
  throw new Error(
    "Missing VST3_SDK_DIR. Set it to the absolute Steinberg VST3 SDK path."
  );
}
await access(path.join(sdk, "CMakeLists.txt")).catch(() => {
  throw new Error(
    "Invalid VST3_SDK_DIR: " + sdk + ". Expected CMakeLists.txt in the SDK root."
  );
});

const root = process.cwd();
const buildDir = path.join(root, "build", "vst3-mac");
const architecture = process.arch === "arm64" ? "arm64" : "x86_64";
await mkdir(buildDir, { recursive: true });
await run("cmake", [
  "-S", root, "-B", buildDir, "-GXcode",
  "-DVST3_SDK_DIR=" + sdk,
  "-DCMAKE_OSX_ARCHITECTURES=" + architecture
]);
await run("cmake", ["--build", buildDir, "--config", "Release"]);

function requireCommand(command, args, fix) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  if (result.error?.code === "ENOENT" || result.status !== 0) {
    throw new Error("Missing or unusable command: " + command + ". " + fix);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => reject(new Error(
      "Could not run " + command + ": " + error.message
    )));
    child.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(command + " " + args.join(" ") + " exited with " + code)));
  });
}
`;
}

function cleanScript() {
  return `import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await Promise.all([
  rm(path.join(root, "build"), { recursive: true, force: true }),
  rm(path.join(root, "dist"), { recursive: true, force: true }),
  rm(path.join(root, "web", "jackle-dsp.js"), { force: true }),
  rm(path.join(root, "web", "jackle-dsp.wasm"), { force: true })
]);
console.log("Removed generated build artifacts");
`;
}

function publicParam(param) {
  return {
    id: param.id,
    param_id: param.param_id,
    name: param.name,
    type: param.type,
    min: param.min,
    max: param.max,
    default: param.default,
    step: param.step,
    unit: param.unit || ""
  };
}

function sensibleStep(min, max) {
  const range = max - min;
  if (range >= 100) return 1;
  if (range >= 10) return 0.1;
  return 0.01;
}

function stableParamId(id) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(String(id), "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 1;
}

function makeClassId() {
  return randomBytes(16).toString("hex").toUpperCase();
}

function validateManufacturerId(value) {
  if (!/^[A-Z0-9]{4}$/.test(String(value || ""))) {
    throw new Error(
      "VST3 manufacturer_id must be exactly four uppercase ASCII letters or digits"
    );
  }
}

function validateClassId(value, field) {
  if (!/^[A-F0-9]{32}$/.test(String(value || ""))) {
    throw new Error(`${field} must be exactly 32 uppercase hexadecimal characters`);
  }
}

function cppParamIdentifier(value) {
  const result = String(value).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(result) ? result : `param_${result}`;
}

function cppIdentifier(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9_]/g, "");
  if (!cleaned) return "JacklePlugin";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `Jackle${cleaned}`;
}

function cmakeIdentifier(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `jackle_${cleaned}`;
}

function fuidWords(hex) {
  return [0, 8, 16, 24]
    .map((offset) => `0x${hex.slice(offset, offset + 8)}`)
    .join(", ");
}

function normalizedDefault(param) {
  if (param.type === "bool") return param.default ? "1.0" : "0.0";
  return plainNumber((param.default - param.min) / (param.max - param.min));
}

function plainNumber(value) {
  if (typeof value === "boolean") return value ? "1.0" : "0.0";
  const number = Number(value);
  return Number.isInteger(number) ? `${number}.0` : String(number);
}

function audioBusLines(manifest) {
  const lines = [];
  if (manifest.audio.inputs > 0) {
    lines.push(`addAudioInput(STR16("Audio In"), ${speakerArrangement(manifest.audio.inputs)});`);
  }
  lines.push(`addAudioOutput(STR16("Audio Out"), ${speakerArrangement(manifest.audio.outputs)});`);
  if (manifest.midi.input) {
    lines.push(`addEventInput(STR16("MIDI In"), 16);`);
  }
  if (manifest.midi.output) {
    lines.push(`addEventOutput(STR16("MIDI Out"), 16);`);
  }
  return lines.join("\n  ");
}

function speakerArrangement(channels) {
  if (channels === 1) return "SpeakerArr::kMono";
  if (channels === 2) return "SpeakerArr::kStereo";
  throw new Error("v0.1 generated VST3 audio buses support only mono or stereo channels");
}

function isSimpleSynth(manifest) {
  return manifest.dsp?.sample === "simple_synth";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeCpp(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
