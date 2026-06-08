import { access, cp, mkdir } from "node:fs/promises";
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
