import { access, cp, mkdir, rm } from "node:fs/promises";
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
