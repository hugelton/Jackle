import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await Promise.all([
  rm(path.join(root, "build"), { recursive: true, force: true }),
  rm(path.join(root, "dist"), { recursive: true, force: true }),
  rm(path.join(root, "web", "jackle-dsp.js"), { force: true }),
  rm(path.join(root, "web", "jackle-dsp.wasm"), { force: true })
]);
console.log("Removed generated build artifacts");
