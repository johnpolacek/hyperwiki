import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createPtySession } from "./pty.js";
import { SessionRegistry } from "./sessions.js";

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
  const sessionRegistry = new SessionRegistry(root);

  const server = createServer((request, response) => {
    void handleRequest(root, request, response, sessionRegistry);
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname !== "/pty") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const id = url.searchParams.get("id") || randomUUID();
      const name = url.searchParams.get("name") || id;
      const session = createPtySession(root, ws, { id, name, registry: sessionRegistry });
      sessionRegistry.setCloser(id, () => ws.close());
      ws.on("close", () => session.close());
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log(`HyperWiki dev server running at http://${host}:${port}`);
}

async function handleRequest(root, request, response, sessionRegistry) {
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
    if (url.pathname === "/api/wiki") {
      await sendJson(response, await listWikiPages(root));
      return;
    }
    if (url.pathname === "/api/repo") {
      await sendJson(response, await repoContext(root));
      return;
    }
    if (url.pathname === "/api/sessions") {
      await sendJson(response, { sessions: await sessionRegistry.list() });
      return;
    }
    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && request.method === "PATCH") {
      const body = await readJsonBody(request);
      await sendJson(response, { session: await sessionRegistry.rename(sessionMatch[1], body.name) });
      return;
    }
    if (sessionMatch && request.method === "DELETE") {
      await sendJson(response, { session: await sessionRegistry.close(sessionMatch[1]) });
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

async function repoContext(root) {
  const [gitRoot, branch, status, commonDir] = await Promise.all([
    git(root, ["rev-parse", "--show-toplevel"]),
    git(root, ["branch", "--show-current"]),
    git(root, ["status", "--short"]),
    git(root, ["rev-parse", "--git-common-dir"])
  ]);
  return {
    root,
    git: {
      root: gitRoot.ok ? gitRoot.stdout : null,
      branch: branch.ok && branch.stdout ? branch.stdout : "detached",
      dirty: status.ok ? status.stdout.length > 0 : null,
      status: status.ok ? status.stdout.split("\n").filter(Boolean) : [],
      isWorktree: commonDir.ok ? ![".git", path.join(root, ".git")].includes(commonDir.stdout) : null
    }
  };
}

function git(root, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: root }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

async function listWikiPages(root) {
  const wikiRoot = path.join(root, "wiki");
  if (!existsSync(wikiRoot)) {
    return { pages: [] };
  }
  const pages = [];
  await walkWiki(wikiRoot, wikiRoot, pages);
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return { pages };
}

async function walkWiki(baseRoot, directory, pages) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkWiki(baseRoot, fullPath, pages);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name) !== ".html") {
      continue;
    }
    const relativePath = path.relative(baseRoot, fullPath).split(path.sep).join("/");
    pages.push({
      title: titleFromWikiPath(relativePath),
      path: `/wiki/${relativePath}`
    });
  }
}

function titleFromWikiPath(relativePath) {
  const withoutExtension = relativePath.replace(/\.html$/, "");
  const segments = withoutExtension.split("/");
  const leaf = segments.at(-1) === "index" && segments.length > 1 ? segments.at(-2) : segments.at(-1);
  return leaf
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sendJson(response, value) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
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
