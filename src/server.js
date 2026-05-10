import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
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
  const config = await readConfig(root);

  const server = createServer((request, response) => {
    void handleRequest(root, request, response, sessionRegistry, config);
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
      const role = url.searchParams.get("role") || "shell";
      const command = url.searchParams.get("command") || null;
      const session = createPtySession(root, ws, { id, name, role, command, registry: sessionRegistry });
      sessionRegistry.setCloser(id, () => ws.close());
      ws.on("close", () => session.close());
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const url = `http://${host}:${port}`;
  console.log(`HyperWiki dev server running at ${url}`);
  return { server, host, port, url, workspaceUrl: `${url}/workspace/` };
}

async function handleRequest(root, request, response, sessionRegistry, config) {
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
    if (url.pathname === "/api/health") {
      await sendJson(response, {
        ok: true,
        app: "hyperwiki",
        root,
        workspace: "/workspace/"
      });
      return;
    }
    if (url.pathname === "/api/workspace") {
      await sendJson(response, await workspaceSummary(root, config));
      return;
    }
    if (url.pathname === "/api/guardrails") {
      await sendJson(response, guardrailSummary(root));
      return;
    }
    if (url.pathname === "/api/layout") {
      await sendJson(response, layoutConfig(config));
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
    if (url.pathname === "/api/sessions/prune" && request.method === "POST") {
      await sessionRegistry.prune();
      await sendJson(response, { sessions: await sessionRegistry.list({ prune: false }) });
      return;
    }
    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    const exportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export$/);
    if (exportMatch && request.method === "POST") {
      await sendJson(response, await sessionRegistry.export(exportMatch[1]));
      return;
    }
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

async function workspaceSummary(root, config) {
  const packageManager = await packageManagerForRoot(root);
  const planDashboard = await htmlSummary(root, "wiki/plans/index.html");
  const logEntries = await htmlHeadings(root, "wiki/log.html", "h2", 5);
  const sourceBriefs = await sourceBriefSummary(root);
  return {
    plan: {
      title: planDashboard.title || "Plans",
      path: "/wiki/plans/index.html",
      summary: planDashboard.summary
    },
    log: {
      path: "/wiki/log.html",
      entries: logEntries
    },
    sources: {
      path: "/wiki/sources.html",
      briefs: sourceBriefs
    },
    verification: [
      { label: "Syntax checks", command: `${packageManager} run check` },
      { label: "Browser workspace smoke", command: `${packageManager} run smoke:browser` },
      { label: "One-command launch smoke", command: `${packageManager} run smoke:launch` },
      { label: "Local workspace launch", command: "npx hyperwiki launch" }
    ],
    layout: layoutConfig(config)
  };
}

async function packageManagerForRoot(root) {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (typeof pkg.packageManager === "string") {
      return pkg.packageManager.split("@")[0];
    }
  } catch {
    // Fall through to lockfile checks.
  }
  if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(root, "bun.lockb")) || existsSync(path.join(root, "bun.lock"))) return "bun";
  return "npm";
}

function guardrailSummary(root) {
  return {
    mode: {
      label: "Local-only",
      value: "Dev server binds to localhost addresses and serves repo-local files."
    },
    canonical: [
      { label: "Wiki truth", path: "wiki/", detail: "Repo-visible HTML docs, plans, source briefs, and project log." },
      { label: "Git truth", path: ".git", detail: "Durable implementation history and reviewable changes." }
    ],
    runtime: [
      { label: "Runtime state", path: ".hyperwiki/state/", detail: "Ignored local workspace state." },
      { label: "Session metadata", path: ".hyperwiki/sessions/", detail: "Ignored retained terminal metadata for restore, export, and pruning." }
    ],
    commandHistory: {
      label: "Command history boundary",
      detail: "HyperWiki stores session metadata and terminal lifecycle state. Shell history and scrollback are runtime data unless the user exports or records them in wiki files."
    },
    actions: [
      { label: "Rename", detail: "Updates retained local session metadata." },
      { label: "Restart", detail: "Closes the current PTY and opens a fresh local session with the same panel name." },
      { label: "Close", detail: "Marks the session closed and keeps bounded retained metadata for auditability." },
      { label: "Export", detail: "Returns a runtime-only session export to the caller; it does not write repo-visible wiki files." },
      { label: "Prune", detail: "Removes old closed retained session metadata beyond the local retention limit." }
    ],
    root
  };
}

async function readConfig(root) {
  const configPath = path.join(root, ".hyperwiki", "config.json");
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(await readFile(configPath, "utf8"));
}

function layoutConfig(config) {
  const panels = Array.isArray(config.layout?.panels) && config.layout.panels.length > 0
    ? config.layout.panels
    : [
        { name: "shell", role: "shell", command: null },
        { name: "checks", role: "checks", command: null },
        { name: "dev-server", role: "dev-server", command: null },
        { name: "git", role: "git", command: "git status --short --branch" },
        { name: "agent", role: "agent", command: null }
      ];
  return {
    panels: panels.map((panel) => ({
      name: String(panel.name),
      role: String(panel.role || panel.name),
      command: panel.command ? String(panel.command) : null
    }))
  };
}

async function sourceBriefSummary(root) {
  const sourceRoot = path.join(root, "wiki", "sources");
  if (!existsSync(sourceRoot)) {
    return [];
  }
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const briefs = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) {
      continue;
    }
    const relative = `wiki/sources/${entry.name}`;
    const summary = await htmlSummary(root, relative);
    briefs.push({
      title: summary.title || titleFromWikiPath(`sources/${entry.name}`),
      path: `/${relative}`,
      summary: summary.summary
    });
  }
  return briefs.sort((a, b) => a.title.localeCompare(b.title));
}

async function htmlSummary(root, relativePath) {
  const html = await readRepoFile(root, relativePath);
  return {
    title: firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is),
    summary: listItemsFromFirstSummary(html)
  };
}

async function htmlHeadings(root, relativePath, heading, limit) {
  const html = await readRepoFile(root, relativePath);
  const expression = new RegExp(`<${heading}[^>]*>(.*?)<\\/${heading}>`, "gis");
  return [...html.matchAll(expression)].slice(0, limit).map((match) => stripHtml(match[1]));
}

async function readRepoFile(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const rootPath = path.resolve(root);
  if (!resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("File is outside project root.");
  }
  return readFile(resolved, "utf8");
}

function listItemsFromFirstSummary(html) {
  const summaryList = html.match(/<section class="summary"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (!summaryList) {
    return [];
  }
  return [...summaryList[1].matchAll(/<li[^>]*>(.*?)<\/li>/gis)].map((match) => stripHtml(match[1]));
}

function firstMatch(value, expression) {
  const match = value.match(expression);
  return match ? stripHtml(match[1]) : "";
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replace(/\s+/g, " ")
    .trim();
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
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentType(resolved)
  });
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
