import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createProjectFiles, normalizeManifest } from "../lib/templates.mjs";

const expectedFiles = [
  "jackle.manifest.json",
  "package.json",
  "CMakeLists.txt",
  "README.md",
  "dsp/PluginDSP.h",
  "dsp/PluginDSP.cpp",
  "dsp/ParamIds.h",
  "gui/index.html",
  "gui/style.css",
  "gui/app.js",
  "gui/jackle-bridge.js",
  "web/main.js",
  "web/worklet.js",
  "web/wasm-bindings.cpp",
  "web/CMakeLists.txt",
  "native/vst3/PluginProcessor.h",
  "native/vst3/PluginProcessor.cpp",
  "native/vst3/PluginController.h",
  "native/vst3/PluginController.cpp",
  "native/vst3/PluginFactory.cpp",
  "native/vst3/PluginEditorView_mac.h",
  "native/vst3/PluginEditorView_mac.mm",
  "native/vst3/VST3ParamBridge.h",
  "native/vst3/VST3ParamBridge.cpp",
  "scripts/dev.mjs",
  "scripts/build-web.mjs",
  "scripts/build-wasm.mjs",
  "scripts/export-vst3-mac.mjs",
  "scripts/build-vst3-mac.mjs",
  "scripts/clean.mjs"
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jackle-v01-"));

try {
  const defaultDir = path.join(temporaryRoot, "default");
  await run(process.execPath, [
    path.join(root, "bin", "jackle.mjs"),
    "--yes",
    "--out",
    defaultDir
  ], root);
  await verifyProject(defaultDir, ["frequency", "level"]);

  const defaultManifest = JSON.parse(
    await readFile(path.join(defaultDir, "jackle.manifest.json"), "utf8")
  );
  assert.match(defaultManifest.vst3.processor_cid, /^[A-F0-9]{32}$/);
  assert.match(defaultManifest.vst3.controller_cid, /^[A-F0-9]{32}$/);
  assert.ok(defaultManifest.params.every((param) => Number.isInteger(param.param_id)));

  const simpleSynthDir = path.join(temporaryRoot, "simple-synth");
  await run(process.execPath, [
    path.join(root, "bin", "jackle.mjs"),
    "--yes",
    "--template",
    "simple-synth",
    "--out",
    simpleSynthDir
  ], root);
  await verifyProject(simpleSynthDir, ["volume"]);
  await verifySimpleSynth(simpleSynthDir);

  const gainManifest = fixtureManifest("GainOnly", [
    floatParam("gain", 0, 1, 0.75)
  ]);
  const gainDir = await writeFixture("gain", gainManifest);
  await verifyProject(gainDir, ["gain"]);
  await assertInfrastructureIsGeneric(gainDir);

  const multiManifest = fixtureManifest("ThreeParams", [
    floatParam("drive", 0, 2, 0.5),
    floatParam("tone-hz", 20, 20000, 1000),
    floatParam("mix", 0, 1, 1)
  ]);
  const multiDir = await writeFixture("multi", multiManifest);
  await verifyProject(multiDir, ["drive", "tone-hz", "mix"]);
  assert.match(
    await readFile(path.join(multiDir, "dsp", "ParamIds.h"), "utf8"),
    /tone_hz/
  );

  const boolManifest = fixtureManifest("BoolParam", [
    {
      id: "bypass",
      name: "Bypass",
      type: "bool",
      default: false
    }
  ]);
  const boolDir = await writeFixture("bool", boolManifest);
  await verifyProject(boolDir, ["bypass"]);
  assert.match(
    await readFile(path.join(boolDir, "gui", "app.js"), "utf8"),
    /type === "bool"/
  );
  assert.match(
    await readFile(path.join(boolDir, "native", "vst3", "PluginController.cpp"), "utf8"),
    /"Bypass".*, 1, 0\.0/
  );

  const reordered = normalizeManifest({
    ...multiManifest,
    params: [...multiManifest.params].reverse()
  });
  const original = normalizeManifest(multiManifest);
  for (const param of original.params) {
    assert.equal(
      reordered.params.find((candidate) => candidate.id === param.id).param_id,
      param.param_id,
      `reordering must preserve ${param.id} identity`
    );
  }

  assert.throws(
    () => normalizeManifest(fixtureManifest("Duplicate", [
      floatParam("gain", 0, 1, 0.5),
      floatParam("gain", 0, 2, 1)
    ])),
    /Duplicate parameter id: gain/
  );
  assert.throws(
    () => normalizeManifest(fixtureManifest("Collision", [
      floatParam("tone-hz", 20, 20000, 440),
      floatParam("tone.hz", 20, 20000, 440)
    ])),
    /C\+\+ identifier collision/
  );
  assert.throws(
    () => normalizeManifest({
      ...gainManifest,
      manufacturer_id: "bad"
    }),
    /manufacturer_id/
  );

  const renamed = normalizeManifest({
    ...gainManifest,
    name: "Renamed Display"
  });
  assert.deepEqual(renamed.vst3, gainManifest.vst3);

  const regenerationManifest = {
    ...multiManifest,
    name: "Regenerated Display",
    params: [...multiManifest.params].reverse()
  };
  const regenerationSource = path.join(temporaryRoot, "regeneration.json");
  const regenerationDir = path.join(temporaryRoot, "regenerated");
  await writeFile(regenerationSource, JSON.stringify(regenerationManifest));
  await run(process.execPath, [
    path.join(root, "bin", "jackle.mjs"),
    "--manifest",
    regenerationSource,
    "--out",
    regenerationDir
  ], root);
  const regenerated = JSON.parse(
    await readFile(path.join(regenerationDir, "jackle.manifest.json"), "utf8")
  );
  assert.deepEqual(regenerated.vst3, multiManifest.vst3);
  assert.deepEqual(
    regenerated.params.map((param) => param.param_id),
    [...original.params].reverse().map((param) => param.param_id)
  );

  const missingStableId = normalizeManifest({
    ...gainManifest,
    params: [{ ...gainManifest.params[0], param_id: undefined }]
  });
  assert.equal(
    missingStableId.params[0].param_id,
    normalizeManifest({
      ...gainManifest,
      params: [{ ...gainManifest.params[0], param_id: undefined }]
    }).params[0].param_id
  );
  const generatedClassIds = normalizeManifest({
    ...gainManifest,
    vst3: {}
  }).vst3;
  assert.match(generatedClassIds.processor_cid, /^[A-F0-9]{32}$/);
  assert.match(generatedClassIds.controller_cid, /^[A-F0-9]{32}$/);
  assert.notEqual(generatedClassIds.processor_cid, generatedClassIds.controller_cid);

  await verifyPreflightErrors(gainDir);
  console.log("Jackle smoke passed: effect fixtures, SimpleSynth, identities, state, and MIDI wiring verified");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function writeFixture(name, manifest) {
  const directory = path.join(temporaryRoot, name);
  for (const generated of createProjectFiles(manifest)) {
    const filename = path.join(directory, generated.path);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, generated.contents);
  }
  return directory;
}

async function verifyProject(directory, expectedParams) {
  for (const relativePath of expectedFiles) {
    const filename = path.join(directory, relativePath);
    const info = await stat(filename);
    assert.equal(info.isFile(), true, `${relativePath} must be a file`);
    assert.ok(info.size > 0, `${relativePath} must not be empty`);
  }

  JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const manifest = JSON.parse(
    await readFile(path.join(directory, "jackle.manifest.json"), "utf8")
  );
  assert.deepEqual(manifest.params.map((param) => param.id), expectedParams);

  for (const relativePath of expectedFiles.filter((filename) =>
    filename.endsWith(".js") || filename.endsWith(".mjs")
  )) {
    await run(process.execPath, ["--check", path.join(directory, relativePath)], root);
  }

  const paramIds = await readFile(path.join(directory, "dsp", "ParamIds.h"), "utf8");
  const gui = await readFile(path.join(directory, "gui", "app.js"), "utf8");
  const worklet = await readFile(path.join(directory, "web", "worklet.js"), "utf8");
  const controller = await readFile(
    path.join(directory, "native", "vst3", "PluginController.cpp"),
    "utf8"
  );
  const processor = await readFile(
    path.join(directory, "native", "vst3", "PluginProcessor.cpp"),
    "utf8"
  );

  for (const param of manifest.params) {
    assert.match(paramIds, new RegExp(String(param.param_id)));
    assert.match(gui, new RegExp(escapeRegex(param.id)));
    assert.match(worklet, new RegExp(escapeRegex(param.id)));
    assert.match(controller, new RegExp(`ParamIds::${param.cpp_id}`));
  }

  assert.match(worklet, /createJackleModule/);
  assert.match(worklet, /wasmBinary/);
  assert.match(processor, /getState/);
  assert.match(processor, /setState/);
  assert.match(processor, /\\"version\\":1/);
  assert.match(controller, /setComponentState/);
  assert.match(
    await readFile(path.join(directory, "web", "main.js"), "utf8"),
    /getState.*setState/s
  );
  assert.match(
    await readFile(path.join(directory, "native", "vst3", "PluginEditorView_mac.mm"), "utf8"),
    /WKWebView.*syncState/s
  );
}

async function assertInfrastructureIsGeneric(directory) {
  const infrastructure = [
    "gui/index.html",
    "gui/app.js",
    "gui/jackle-bridge.js",
    "web/main.js",
    "web/worklet.js",
    "web/wasm-bindings.cpp",
    "native/vst3/PluginController.cpp",
    "native/vst3/VST3ParamBridge.cpp"
  ];
  for (const relativePath of infrastructure) {
    const contents = await readFile(path.join(directory, relativePath), "utf8");
    assert.doesNotMatch(contents, /\bFrequency\b|\bLevel\b/);
  }
}

async function verifySimpleSynth(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "jackle.manifest.json"), "utf8")
  );
  assert.equal(manifest.name, "SimpleSynth");
  assert.equal(manifest.type, "instrument");
  assert.deepEqual(manifest.audio, { inputs: 0, outputs: 2 });
  assert.deepEqual(manifest.midi, { input: true, output: false });
  assert.equal(manifest.dsp.sample, "simple_synth");
  assert.equal(manifest.params[0].id, "volume");
  assert.equal(manifest.params[0].sample_role, "volume");

  const dspHeader = await readFile(path.join(directory, "dsp", "PluginDSP.h"), "utf8");
  const dspSource = await readFile(path.join(directory, "dsp", "PluginDSP.cpp"), "utf8");
  const gui = await readFile(path.join(directory, "gui", "index.html"), "utf8");
  const bridge = await readFile(path.join(directory, "gui", "jackle-bridge.js"), "utf8");
  const webMain = await readFile(path.join(directory, "web", "main.js"), "utf8");
  const worklet = await readFile(path.join(directory, "web", "worklet.js"), "utf8");
  const bindings = await readFile(path.join(directory, "web", "wasm-bindings.cpp"), "utf8");
  const processor = await readFile(
    path.join(directory, "native", "vst3", "PluginProcessor.cpp"),
    "utf8"
  );
  const factory = await readFile(
    path.join(directory, "native", "vst3", "PluginFactory.cpp"),
    "utf8"
  );

  assert.match(dspHeader, /noteOn\(int note, float velocity\)/);
  assert.match(dspSource, /midiNoteToFrequency/);
  assert.match(dspSource, /values_\[0\] \* ramp_/);
  assert.doesNotMatch(dspSource, /\bnew\b|std::vector|std::mutex/);
  assert.match(gui, /jackle-note/);
  assert.match(bridge, /Play test note \(A4\)/);
  assert.match(bridge, /sendNoteOn.*sendNoteOff/s);
  assert.match(webMain, /requestMIDIAccess/);
  assert.match(worklet, /_jackle_note_on.*_jackle_note_off/s);
  assert.match(bindings, /jackle_note_on.*jackle_note_off/s);
  assert.doesNotMatch(bindings, /std::vector/);
  assert.match(processor, /addEventInput\(STR16\("MIDI In"\), 16\)/);
  assert.match(processor, /Event::kNoteOnEvent/);
  assert.match(processor, /Event::kNoteOffEvent/);
  assert.match(factory, /Instrument\|Synth/);
}

async function verifyPreflightErrors(directory) {
  await assert.rejects(
    run(process.execPath, [path.join(directory, "scripts", "build-wasm.mjs")], directory, {
      ...process.env,
      PATH: "/definitely/missing"
    }),
    /Missing required command: cmake/
  );
  await assert.rejects(
    run(process.execPath, [path.join(directory, "scripts", "export-vst3-mac.mjs")], directory, {
      ...process.env,
      VST3_SDK_DIR: ""
    }),
    /Missing VST3_SDK_DIR/
  );
}

function fixtureManifest(name, params) {
  return {
    schema_version: 1,
    id: name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
    name,
    manufacturer: "Jackle Tests",
    manufacturer_id: "JAKL",
    plugin_id: "TEST",
    bundle_id: `dev.jackle.${name.toLowerCase()}`,
    version: "0.1.0",
    type: "effect",
    audio: { inputs: 2, outputs: 2 },
    midi: { input: false, output: false },
    gui: { entry: "gui/index.html", width: 640, height: 360 },
    dsp: {
      header: "dsp/PluginDSP.h",
      source: "dsp/PluginDSP.cpp",
      class_name: "PluginDSP"
    },
    vst3: {
      processor_cid: "00112233445566778899AABBCCDDEEFF",
      controller_cid: "FFEEDDCCBBAA99887766554433221100"
    },
    params
  };
}

function floatParam(id, min, max, defaultValue) {
  return {
    id,
    name: id,
    type: "float",
    min,
    max,
    default: defaultValue
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function run(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(
          `${command} ${args.join(" ")} exited with ${code}\n${stdout}${stderr}`
        ));
      }
    });
  });
}
