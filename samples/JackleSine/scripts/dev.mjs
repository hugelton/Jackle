import { createReadStream } from "node:fs";
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
  const relative = decodeURIComponent(pathname.split("?")[0]).replace(/^\/+/, "");
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
