import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createPtySession } from "./pty.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(here, "..", "public");
const require = createRequire(import.meta.url);
const vendorRoots = new Map([
  ["@wterm/dom", path.dirname(require.resolve("@wterm/dom"))],
  ["@wterm/core", path.dirname(require.resolve("@wterm/core"))]
]);

export async function startDevServer(root, options = {}) {
  const host = String(options.host || "127.0.0.1");
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("HyperWiki dev server only binds to localhost addresses.");
  }
  const port = Number(options.port || 4177);

  const server = createServer((request, response) => {
    void handleRequest(root, request, response);
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname !== "/pty") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const session = createPtySession(root, ws);
      ws.on("close", () => session.close());
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log(`HyperWiki dev server running at http://${host}:${port}`);
}

async function handleRequest(root, request, response) {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      redirect(response, "/workspace/");
      return;
    }
    if (url.pathname === "/workspace/") {
      await sendFile(response, path.join(publicRoot, "index.html"), publicRoot);
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      await sendFile(response, path.join(publicRoot, url.pathname.replace("/assets/", "")), publicRoot);
      return;
    }
    for (const [name, packageDistRoot] of vendorRoots) {
      const prefix = `/vendor/${name}/`;
      if (url.pathname.startsWith(prefix)) {
        const packageRoot = path.resolve(packageDistRoot, "..");
        const relative = url.pathname.replace(prefix, "");
        await sendFile(response, path.join(packageRoot, relative), packageRoot);
        return;
      }
    }
    if (url.pathname.startsWith("/wiki/")) {
      await sendFile(response, path.join(root, url.pathname), root);
      return;
    }
    notFound(response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
}

async function sendFile(response, filePath, allowedRoot) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(allowedRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  if (!existsSync(resolved) || !(await stat(resolved)).isFile()) {
    notFound(response);
    return;
  }
  response.writeHead(200, { "content-type": contentType(resolved) });
  createReadStream(resolved).pipe(response);
}

function redirect(response, location) {
  response.writeHead(302, { location });
  response.end();
}

function notFound(response) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}
