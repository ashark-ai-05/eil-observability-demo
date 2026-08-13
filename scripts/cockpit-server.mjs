import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitModel } from "./cockpit-model.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/api/run") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(await cockpitModel(root)));
      return;
    }
    const relative = request.url === "/" ? "index.html" : request.url.slice(1);
    if (!/^(index\.html|app\.js|styles\.css)$/.test(relative)) throw new Error("not found");
    response.writeHead(200, { "content-type": types[extname(relative)] ?? "application/octet-stream" });
    response.end(await readFile(resolve(root, "cockpit", relative)));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`COMMAND CENTER http://127.0.0.1:${port}`));
