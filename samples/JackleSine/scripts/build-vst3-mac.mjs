import { access, mkdir } from "node:fs/promises";
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
