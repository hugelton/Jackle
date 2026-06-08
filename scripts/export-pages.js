import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputDir = path.join(root, "samples", "JackleSine");
const outputDir = path.join(root, "pages");

await mkdir(outputDir, { recursive: true });

await cp(path.join(inputDir, "gui", "index.html"), path.join(outputDir, "index.html"));
await cp(path.join(inputDir, "gui", "style.css"), path.join(outputDir, "style.css"));
await cp(path.join(inputDir, "gui", "app.js"), path.join(outputDir, "app.js"));
await cp(path.join(inputDir, "gui", "jackle-bridge.js"), path.join(outputDir, "jackle-bridge.js"));
await cp(path.join(inputDir, "web", "jackle-dsp.js"), path.join(outputDir, "jackle-dsp.js"));
await cp(path.join(inputDir, "web", "jackle-dsp.wasm"), path.join(outputDir, "jackle-dsp.wasm"));

console.log("Pages export complete in " + outputDir);
