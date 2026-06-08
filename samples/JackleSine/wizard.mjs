import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createProjectFiles } from "./templates.mjs";

const DEFAULTS = {
  project_name: "JackleSine",
  manufacturer: "Hugelton Instruments",
  manufacturer_id: "HUGL",
  plugin_id: "AUTO",
  plugin_type: "instrument",
  audio_inputs: 0,
  audio_outputs: 2,
  gui_width: 640,
  gui_height: 360,
  sample_project: true
};

export async function runJackleWizard(argv) {
  const options = parseArgs(argv);
  if (options.manifest) {
    return regenerateFromManifest(options);
  }
  const answers = options.yes
    ? makeDefaultAnswers(options)
    : await askQuestions(options);

  const projectDir = path.resolve(options.out ?? answers.project_name);
  const config = normalizeConfig(answers, projectDir);
  const files = createProjectFiles(config);

  await mkdir(projectDir, { recursive: true });
  for (const file of files) {
    const destination = path.join(projectDir, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.contents);
  }

  console.log(`\nCreated ${config.name} in ${projectDir}`);
  console.log("Next steps:");
  console.log(`  cd ${path.relative(process.cwd(), projectDir) || "."}`);
  console.log("  npm run dev");
  console.log("  npm run export:vst3-mac");

  if (config.installDependencies) {
    await runCommand("npm", ["install"], projectDir);
  }
}

function parseArgs(argv) {
  const options = { yes: false, out: undefined, manifest: undefined, template: "default" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--out") {
      options.out = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
    } else if (arg === "--manifest") {
      options.manifest = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--manifest=")) {
      options.manifest = arg.slice("--manifest=".length);
    } else if (arg === "--template") {
      options.template = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--template=")) {
      options.template = arg.slice("--template=".length);
    } else if (arg === "--simple-synth") {
      options.template = "simple-synth";
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.yes && options.manifest) {
    throw new Error("--yes and --manifest cannot be used together");
  }
  if (!["default", "simple-synth"].includes(options.template)) {
    throw new Error("--template must be default or simple-synth");
  }
  return options;
}

async function regenerateFromManifest(options) {
  const manifestPath = path.resolve(options.manifest);
  const projectDir = path.resolve(options.out ?? path.dirname(manifestPath));
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read manifest ${manifestPath}: ${error.message}`);
  }

  const files = createProjectFiles(manifest);
  const normalized = JSON.parse(files[0].contents);
  await mkdir(projectDir, { recursive: true });
  for (const generated of files) {
    const destination = path.join(projectDir, generated.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, generated.contents);
  }
  console.log(`\nRegenerated ${normalized.name} in ${projectDir}`);
}

async function askQuestions(options) {
  const rl = readline.createInterface({ input, output });
  try {
    const answers = {};
    answers.project_name = await askText(rl, "Plugin name?", DEFAULTS.project_name);
    answers.manufacturer = await askText(rl, "Manufacturer name?", DEFAULTS.manufacturer);
    answers.bundle_id = await askText(rl, "Bundle ID?", `com.hugelton.${slugify(answers.project_name)}`);
    answers.manufacturer_id = await askText(rl, "VST3 manufacturer ID / vendor code?", DEFAULTS.manufacturer_id);
    answers.plugin_id = await askText(rl, "VST3 plugin ID / class code?", DEFAULTS.plugin_id);
    answers.plugin_type = await askChoice(rl, "Plugin type?", ["effect", "instrument"], DEFAULTS.plugin_type);
    answers.audio_inputs = await askNumber(rl, "Audio input channels?", DEFAULTS.audio_inputs);
    answers.audio_outputs = await askNumber(rl, "Audio output channels?", DEFAULTS.audio_outputs);
    answers.midi_input = await askBoolean(
      rl,
      "Enable MIDI note input?",
      answers.plugin_type === "instrument"
    );
    answers.gui_width = await askNumber(rl, "GUI width?", DEFAULTS.gui_width);
    answers.gui_height = await askNumber(rl, "GUI height?", DEFAULTS.gui_height);
    answers.sample_project = await askBoolean(rl, "Generate example Sine DSP and GUI?", DEFAULTS.sample_project);
    if (answers.sample_project && answers.plugin_type === "instrument" && answers.midi_input) {
      answers.sample_template = "simple-synth";
    }
    answers.installDependencies = await askBoolean(rl, "Run npm install after generation?", false);
    return answers;
  } finally {
    rl.close();
  }
}

function makeDefaultAnswers(options) {
  if (options.template === "simple-synth") {
    return {
      ...DEFAULTS,
      project_name: "SimpleSynth",
      bundle_id: "com.hugelton.simple-synth",
      plugin_type: "instrument",
      audio_inputs: 0,
      audio_outputs: 2,
      midi_input: true,
      sample_project: true,
      sample_template: "simple-synth",
      installDependencies: false
    };
  }
  const projectName = DEFAULTS.project_name;
  return {
    ...DEFAULTS,
    bundle_id: `com.hugelton.${slugify(projectName)}`,
    midi_input: false,
    installDependencies: false
  };
}

async function askText(rl, prompt, fallback) {
  const answer = await rl.question(`${prompt} (${fallback}) `);
  return answer.trim() || fallback;
}

async function askChoice(rl, prompt, choices, fallback) {
  const answer = await askText(rl, `${prompt} [${choices.join("/")}]`, fallback);
  if (!choices.includes(answer)) {
    throw new Error(`${prompt} must be one of: ${choices.join(", ")}`);
  }
  return answer;
}

async function askNumber(rl, prompt, fallback) {
  const answer = await askText(rl, prompt, String(fallback));
  const value = Number(answer);
  if (!Number.isFinite(value)) {
    throw new Error(`${prompt} must be a number`);
  }
  return value;
}

async function askBoolean(rl, prompt, fallback) {
  const suffix = fallback ? "Y/n" : "y/N";
  const answer = (await rl.question(`${prompt} [${suffix}] `)).trim().toLowerCase();
  if (!answer) {
    return fallback;
  }
  if (["y", "yes", "true", "1"].includes(answer)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(answer)) {
    return false;
  }
  throw new Error(`${prompt} must be yes or no`);
}

function normalizeConfig(answers, projectDir) {
  const name = answers.project_name;
  const id = slugify(name);
  const simpleSynth = answers.sample_template === "simple-synth";
  const params = simpleSynth ? [
    {
      id: "volume",
      param_id: stableParamId("volume"),
      name: "Volume",
      type: "float",
      min: 0,
      max: 1,
      default: 0.25,
      step: 0.01,
      sample_role: "volume"
    }
  ] : answers.sample_project ? [
    {
      id: "frequency",
      param_id: stableParamId("frequency"),
      name: "Frequency",
      type: "float",
      min: 20,
      max: 2000,
      default: 440,
      unit: "Hz"
      ,
      sample_role: "frequency"
    },
    {
      id: "level",
      param_id: stableParamId("level"),
      name: "Level",
      type: "float",
      min: 0,
      max: 1,
      default: 0.25,
      sample_role: "level"
    }
  ] : [
    {
      id: "gain",
      param_id: stableParamId("gain"),
      name: "Gain",
      type: "float",
      min: 0,
      max: 1,
      default: 0.75
    }
  ];

  return {
    id,
    name,
    className: "PluginDSP",
    manufacturer: answers.manufacturer,
    manufacturerId: validateManufacturerId(answers.manufacturer_id),
    pluginId: answers.plugin_id === "AUTO" ? makePluginId(name) : fourChars(answers.plugin_id),
    bundleId: answers.bundle_id,
    version: "0.1.0",
    type: answers.plugin_type,
    audioInputs: Number(answers.audio_inputs),
    audioOutputs: Number(answers.audio_outputs),
    midiInput: Boolean(answers.midi_input),
    midiOutput: false,
    guiWidth: Number(answers.gui_width),
    guiHeight: Number(answers.gui_height),
    sampleProject: Boolean(answers.sample_project),
    dspSample: simpleSynth ? "simple_synth" : "oscillator",
    params,
    vst3: {
      processor_cid: makeClassId(),
      controller_cid: makeClassId()
    },
    installDependencies: Boolean(answers.installDependencies),
    projectDir
  };
}

function slugify(value) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "jackle-plugin";
}

function validateManufacturerId(value) {
  const id = String(value).trim();
  if (!/^[A-Z0-9]{4}$/.test(id)) {
    throw new Error("VST3 manufacturer ID must be exactly four uppercase ASCII letters or digits");
  }
  return id;
}

function makePluginId(name) {
  const compact = String(name).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (compact || "JACK").padEnd(4, "0").slice(0, 4);
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

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function printHelp() {
  console.log(`Usage: jackle [--yes] [--template NAME] [--out DIR]

Create a plain C++ DSP + plain HTML/CSS/JS audio plugin project.

Options:
  -y, --yes    Generate the default JackleSine project without prompts.
  --template simple-synth
               Generate the SimpleSynth reference MIDI instrument.
  --simple-synth
               Alias for --template simple-synth.
  --out DIR    Output directory. Defaults to the plugin name.
  --manifest FILE
               Regenerate from an existing jackle.manifest.json.
  -h, --help   Show this help.
`);
}
