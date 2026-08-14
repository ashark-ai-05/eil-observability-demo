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
    // The platform map and observability plane are served from their own
    // directory, on the same exact-match allowlist as the cockpit assets --
    // a prefix or extension test here would be a path-traversal hole.
    const platform = request.url.match(
      /^\/platform\/(system-map\.html|observability-plane\.html|eil-platform\.html)$/,
    );
    if (platform) {
      response.writeHead(200, { "content-type": types[".html"] });
      response.end(await readFile(resolve(root, "platform", platform[1])));
      return;
    }
    // The deck imports the same metric modules the terminal views use, so a
    // figure cannot differ between surfaces. Served from scripts/, still by
    // exact name — a prefix test here would be a path-traversal hole.
    const shared = request.url.match(/^\/(platform-metrics\.mjs|token-metrics\.mjs)$/);
    if (shared) {
      response.writeHead(200, { "content-type": types[".js"] });
      response.end(await readFile(resolve(root, "scripts", shared[1])));
      return;
    }
    const relative = request.url === "/" ? "index.html" : request.url.slice(1);
    if (!/^(index\.html|app\.js|styles\.css|presenter\.css)$/.test(relative)) throw new Error("not found");
    response.writeHead(200, { "content-type": types[extname(relative)] ?? "application/octet-stream" });
    response.end(await readFile(resolve(root, "cockpit", relative)));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`COMMAND CENTER http://127.0.0.1:${port}`));
