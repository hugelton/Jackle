import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist", "web");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "gui"), path.join(output, "gui"), { recursive: true });
await cp(path.join(root, "web"), path.join(output, "web"), { recursive: true });
console.log("Web files exported to " + output);
