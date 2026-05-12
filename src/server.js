import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createPtySession } from "./pty.js";
import { initHyperWiki } from "./init.js";
import { ProjectRegistry, worktreeSlug } from "./projects.js";
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
  const port = options.port === 0 || options.port === "0" ? 0 : Number(options.port || 4177);
  const projectRegistry = new ProjectRegistry();
  let activeProjectId = options.projectId || null;
  if (!activeProjectId) {
    try {
      activeProjectId = (await projectRegistry.register(root)).id;
    } catch {
      activeProjectId = null;
    }
  }
  const sessionRegistries = new Map();
  const sessionInputs = new Map();

  const server = createServer((request, response) => {
    void handleRequest(root, request, response, { projectRegistry, sessionRegistries, sessionInputs, activeProjectId });
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname !== "/pty") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      void (async () => {
        const project = await resolveProject(projectRegistry, url, activeProjectId, root);
        const sessionRegistry = sessionRegistryFor(sessionRegistries, project.root);
        const inputs = sessionInputFor(sessionInputs, project.root);
        const id = url.searchParams.get("id") || randomUUID();
        const name = url.searchParams.get("name") || id;
        const role = url.searchParams.get("role") || "shell";
        const command = url.searchParams.get("command") || null;
        const session = createPtySession(project.root, ws, { id, name, role, command, registry: sessionRegistry });
        inputs.set(id, session.write);
        sessionRegistry.setCloser(id, () => ws.close());
        ws.on("close", () => {
          inputs.delete(id);
          session.close();
        });
      })().catch(() => ws.close());
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;
  console.log(`HyperWiki dev server running at ${url}`);
  return { server, host, port: actualPort, url, workspaceUrl: `${url}/workspace/` };
}

async function handleRequest(defaultRoot, request, response, context) {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      redirect(response, "/workspace/");
      return;
    }
    if (workspaceRoute(url.pathname) || url.pathname === "/dashboard") {
      await sendFile(response, path.join(publicRoot, "index.html"), publicRoot);
      return;
    }
    if (url.pathname === "/api/wiki") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await listWikiPages(project.root, project.id));
      return;
    }
    if (url.pathname === "/api/health") {
      await sendJson(response, {
        ok: true,
        app: "hyperwiki",
        root: defaultRoot,
        activeProjectId: context.activeProjectId,
        workspace: "/workspace/"
      });
      return;
    }
    if (url.pathname === "/api/projects") {
      await sendJson(response, await context.projectRegistry.list(await requestedProjectId(context.projectRegistry, url, context.activeProjectId, defaultRoot)));
      return;
    }
    if (url.pathname === "/api/projects/create" && request.method === "POST") {
      const body = await readJsonBody(request);
      await sendJson(response, await createProjectFromDashboard(context.projectRegistry, body));
      return;
    }
    if (url.pathname === "/api/ideas") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await listIdeas(project.root, project.id));
      return;
    }
    if (url.pathname === "/api/ideas/promote" && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const body = await readJsonBody(request);
      await sendJson(response, await promoteIdea(project, context.projectRegistry, body));
      return;
    }
    if (url.pathname === "/api/workspace") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await workspaceSummary(project.root, await readConfig(project.root)));
      return;
    }
    if (url.pathname === "/api/guardrails") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, guardrailSummary(project.root));
      return;
    }
    if (url.pathname === "/api/layout") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, layoutConfig(await readConfig(project.root)));
      return;
    }
    if (url.pathname === "/api/repo") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await repoContext(project.root));
      return;
    }
    if (url.pathname === "/api/sessions") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      await sendJson(response, { sessions: await sessionRegistry.list() });
      return;
    }
    if (url.pathname === "/api/sessions/prune" && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      await sessionRegistry.prune();
      await sendJson(response, { sessions: await sessionRegistry.list({ prune: false }) });
      return;
    }
    if (url.pathname === "/api/agent/prompt" && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      const inputs = sessionInputFor(context.sessionInputs, project.root);
      const body = await readJsonBody(request);
      const result = await sendAgentPrompt(project, sessionRegistry, inputs, body);
      await sendJson(response, result);
      return;
    }
    if (url.pathname === "/api/terminal/drop" && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const body = await readJsonBody(request);
      await sendJson(response, await saveDroppedFiles(project.root, body));
      return;
    }
    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    const exportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/export$/);
    if (exportMatch && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      await sendJson(response, await sessionRegistry.export(exportMatch[1]));
      return;
    }
    if (sessionMatch && request.method === "PATCH") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      const body = await readJsonBody(request);
      await sendJson(response, { session: await sessionRegistry.rename(sessionMatch[1], body.name) });
      return;
    }
    if (sessionMatch && request.method === "DELETE") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      await sendJson(response, { session: await sessionRegistry.close(sessionMatch[1]) });
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      await sendFile(response, path.join(publicRoot, url.pathname.replace("/assets/", "")), publicRoot);
      return;
    }
    if (url.pathname.startsWith("/vendor/fonts/")) {
      await sendFile(response, path.join(publicRoot, url.pathname.slice(1)), publicRoot);
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
    const projectWikiMatch = url.pathname.match(/^\/projects\/([^/]+)\/wiki\/(.+)$/);
    if (projectWikiMatch) {
      const project = await context.projectRegistry.resolve(projectWikiMatch[1], defaultRoot);
      const wikiRoot = path.join(project.root, "wiki");
      await sendFile(response, path.join(wikiRoot, projectWikiMatch[2]), wikiRoot);
      return;
    }
    if (url.pathname.startsWith("/wiki/")) {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const wikiRoot = path.join(project.root, "wiki");
      await sendFile(response, path.join(project.root, url.pathname), wikiRoot);
      return;
    }
    notFound(response);
  } catch (error) {
    response.writeHead(error.statusCode || 500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
}

async function resolveProject(projectRegistry, url, activeProjectId, fallbackRoot) {
  const projectId = url.searchParams.get("project");
  if (projectId) {
    return projectRegistry.resolve(projectId, fallbackRoot);
  }
  const projectSlug = url.searchParams.get("projectSlug");
  if (projectSlug) {
    return projectRegistry.resolveBySlug(projectSlug, url.searchParams.get("worktreeSlug"), fallbackRoot);
  }
  return projectRegistry.resolve(activeProjectId, fallbackRoot);
}

async function requestedProjectId(projectRegistry, url, activeProjectId, fallbackRoot) {
  const projectId = url.searchParams.get("project");
  if (projectId) {
    return projectId;
  }
  const projectSlug = url.searchParams.get("projectSlug");
  if (projectSlug) {
    try {
      return (await projectRegistry.resolveBySlug(projectSlug, url.searchParams.get("worktreeSlug"), fallbackRoot)).id;
    } catch {
      return null;
    }
  }
  return activeProjectId;
}

function workspaceRoute(pathname) {
  return /^\/workspace(?:\/[^/]+(?:\/[^/]+)?)?\/?$/.test(pathname);
}

function sessionRegistryFor(registries, root) {
  const key = path.resolve(root);
  if (!registries.has(key)) {
    registries.set(key, new SessionRegistry(key));
  }
  return registries.get(key);
}

function sessionInputFor(inputsByRoot, root) {
  const key = path.resolve(root);
  if (!inputsByRoot.has(key)) {
    inputsByRoot.set(key, new Map());
  }
  return inputsByRoot.get(key);
}

async function sendAgentPrompt(project, sessionRegistry, inputs, body) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    const error = new Error("Prompt is required.");
    error.statusCode = 400;
    throw error;
  }
  const sessions = await sessionRegistry.list({ prune: false });
  const agentSession = [...sessions].reverse().find((session) =>
    session.status === "active" &&
    session.role === "agent" &&
    inputs.has(session.id)
  );
  if (!agentSession) {
    const error = new Error("No active agent session is available.");
    error.statusCode = 409;
    throw error;
  }
  const currentPage = typeof body.currentPage === "string" ? body.currentPage : "/wiki/plans/index.html";
  const message = [
    "",
    "Please handle this HyperWiki workspace request.",
    "",
    `Project: ${project.name}`,
    `Repo root: ${project.root}`,
    `Current wiki page: ${currentPage}`,
    "Keep durable project knowledge in wiki/ HTML pages and Git-visible files. Run relevant checks before finishing.",
    "When creating a new plan page, do not append \"Plan\" to the page title; the plans sidebar already supplies that context.",
    "",
    prompt,
    ""
  ].join("\n");
  inputs.get(agentSession.id)(`${message}\n`);
  return {
    ok: true,
    session: {
      id: agentSession.id,
      name: agentSession.name
    }
  };
}

async function saveDroppedFiles(root, body) {
  const files = Array.isArray(body.files) ? body.files : [];
  const saved = [];
  const dropRoot = path.join(root, ".hyperwiki", "state", "drops");
  await mkdir(dropRoot, { recursive: true });
  for (const file of files) {
    const name = safeDropName(file?.name);
    const content = typeof file?.content === "string" ? file.content : "";
    if (!content) {
      continue;
    }
    const prefix = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(dropRoot, `${prefix}-${randomUUID().slice(0, 8)}-${name}`);
    await writeFile(filePath, Buffer.from(content, "base64"));
    saved.push({ name, path: filePath });
  }
  return { files: saved };
}

function safeDropName(name) {
  const fallback = "dropped-file";
  return path.basename(String(name || fallback)).replace(/[^a-zA-Z0-9._-]/g, "-") || fallback;
}

async function workspaceSummary(root, config) {
  const packageManager = await packageManagerForRoot(root);
  const planDashboard = await htmlSummary(root, "wiki/plans/index.html");
  const logEntries = await htmlHeadings(root, "wiki/log.html", "h2", 5);
  const sourceBriefs = await sourceBriefSummary(root);
  const status = workspaceStatus(planDashboard.summary, logEntries);
  return {
    plan: {
      title: planDashboard.title || "Plans",
      path: "/wiki/plans/index.html",
      summary: planDashboard.summary
    },
    status,
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
      { label: "Local workspace launch", command: "npx hyperwiki" }
    ],
    layout: layoutConfig(config)
  };
}

function workspaceStatus(planSummary, logEntries) {
  const currentUnit = summaryValue(planSummary, "Current unit");
  const currentStage = summaryValue(planSummary, "Current stage");
  const current = currentUnit || currentUnitLabelForStage(currentStage) || currentStage || summaryValue(planSummary, "Status") || "Unknown";
  return {
    completed: completedStatus(planSummary, logEntries),
    stage: currentStage || "Unknown",
    current,
    currentPath: currentUnitPath(current)
  };
}

function currentUnitLabelForStage(stage) {
  if (/stage\s*0?7|agent-native verification/i.test(stage || "")) {
    return "Unit 01 - Verification Loop Model";
  }
  return "";
}

function currentUnitPath(current) {
  if (/unit\s*0?1/i.test(current) || /verification loop/i.test(current)) {
    return "/wiki/plans/mvp/stage-07-agent-native-verification/unit-01-verification-loop-model.html";
  }
  if (/stage\s*0?7|agent-native verification/i.test(current)) {
    return "/wiki/plans/mvp/stage-07-agent-native-verification.html";
  }
  return "";
}

function completedStatus(planSummary, logEntries) {
  const recent = planSummary.find((item) => /completed|implemented|mapped|added/i.test(item));
  return recent || logEntries[0] || "No completed work found";
}

function summaryValue(items, label) {
  const prefix = `${label}:`;
  const item = items.find((entry) => entry.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : "";
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
    : fallbackPanels(config);
  return {
    panels: panels.map((panel) => ({
      name: String(panel.name),
      role: String(panel.role || panel.name),
      command: panel.role === "agent" && process.env.HYPERWIKI_AGENT_DRY_RUN === "1"
        ? "printf HYPERWIKI_AGENT_DRY_RUN\\n"
        : panel.command ? String(panel.command) : null
    }))
  };
}

function fallbackPanels(config) {
  const panels = [];
  if (config.agent?.launchCommand) {
    panels.push({ name: "agent", role: "agent", command: String(config.agent.launchCommand) });
  }
  panels.push({ name: "cli", role: "shell", command: null });
  return panels;
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

async function listIdeas(root, projectId = null) {
  const ideasRoot = path.join(root, "wiki", "ideas");
  if (!existsSync(ideasRoot)) {
    return { ideas: [] };
  }
  const entries = await readdir(ideasRoot, { withFileTypes: true });
  const ideas = [];
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".html" || entry.name === "index.html") {
      continue;
    }
    const relative = `wiki/ideas/${entry.name}`;
    const html = await readRepoFile(root, relative);
    const title = firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is) || titleFromWikiPath(`ideas/${entry.name}`);
    ideas.push({
      title,
      path: projectId ? `/projects/${projectId}/wiki/ideas/${entry.name}` : `/wiki/ideas/${entry.name}`,
      summary: ideaSummary(html),
      promoted: isPromotedIdea(html),
      targetRoot: await uniqueProjectRoot(title)
    });
  }
  return { ideas: ideas.sort((a, b) => a.title.localeCompare(b.title)) };
}

async function promoteIdea(project, projectRegistry, body) {
  const ideaPath = normalizeIdeaPath(body.ideaPath || body.path);
  if (!ideaPath) {
    const error = new Error("Idea path must point to a page under wiki/ideas/.");
    error.statusCode = 400;
    throw error;
  }
  const relativePath = ideaPath.replace(/^\/wiki\//, "wiki/");
  const sourceFile = path.join(project.root, relativePath);
  const ideasRoot = path.join(project.root, "wiki", "ideas");
  const resolvedSource = path.resolve(sourceFile);
  if (!resolvedSource.startsWith(`${path.resolve(ideasRoot)}${path.sep}`) || !existsSync(resolvedSource)) {
    const error = new Error("Idea page not found.");
    error.statusCode = 404;
    throw error;
  }
  const html = await readFile(resolvedSource, "utf8");
  if (isPromotedIdea(html)) {
    const error = new Error("Idea has already been promoted.");
    error.statusCode = 409;
    throw error;
  }

  const title = firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is) || titleFromWikiPath(relativePath);
  const summary = ideaSummary(html) || "Promoted from a HyperWiki idea.";
  const content = extractMainHtml(html);
  const projectRoot = await uniqueProjectRoot(title);
  await mkdir(projectRoot, { recursive: true });
  await initHyperWiki(projectRoot, {
    yes: true,
    project_name: title,
    summary
  });
  await writePromotedProjectPackage(projectRoot, {
    title,
    summary,
    content,
    originProject: project,
    originPath: `/wiki/ideas/${path.basename(relativePath)}`
  });
  const record = await projectRegistry.register(projectRoot);
  const workspaceUrl = `/workspace/${encodeURIComponent(record.projectSlug)}/${encodeURIComponent(record.worktreeSlug)}`;
  await writeFile(resolvedSource, promotedIdeaPage(project, title, summary, record, workspaceUrl), "utf8");
  return { idea: { title, path: `/wiki/ideas/${path.basename(relativePath)}`, promoted: true }, project: record, workspaceUrl };
}

async function createProjectFromDashboard(projectRegistry, body) {
  const title = String(body?.title || "").trim();
  if (!title) {
    const error = new Error("Project title is required.");
    error.statusCode = 400;
    throw error;
  }
  const summary = String(body?.summary || "").trim() || "Imported from Dashboard markdown.";
  const projectRoot = await uniqueProjectRoot(title);
  await mkdir(projectRoot, { recursive: true });
  await initHyperWiki(projectRoot, {
    yes: true,
    project_name: title,
    summary
  });
  const record = await projectRegistry.register(projectRoot);
  const workspaceUrl = `/workspace/${encodeURIComponent(record.projectSlug)}/${encodeURIComponent(record.worktreeSlug)}`;
  return { project: record, workspaceUrl };
}

function normalizeIdeaPath(value) {
  const pathValue = String(value || "");
  const projectMatch = pathValue.match(/^\/projects\/[^/]+\/wiki\/ideas\/([^/]+\.html)$/);
  if (projectMatch && projectMatch[1] !== "index.html") return `/wiki/ideas/${projectMatch[1]}`;
  const wikiMatch = pathValue.match(/^\/wiki\/ideas\/([^/]+\.html)$/);
  if (wikiMatch && wikiMatch[1] !== "index.html") return `/wiki/ideas/${wikiMatch[1]}`;
  return "";
}

function ideaSummary(html) {
  const paragraphs = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gis)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
  const summary = paragraphs.find((paragraph) => !/^promoted to /i.test(paragraph)) || paragraphs[0] || "";
  return summary.length > 180 ? `${summary.slice(0, 177).trim()}...` : summary;
}

function isPromotedIdea(html) {
  return /data-hyperwiki-promoted=["']true["']/i.test(html) || /<h1[^>]*>Promoted Idea<\/h1>/i.test(html);
}

function extractMainHtml(html) {
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  return match ? match[1].trim() : html.trim();
}

async function uniqueProjectRoot(title) {
  const baseDir = path.resolve(process.env.HYPERWIKI_PROJECTS_DIR || path.join(os.homedir(), "Projects"));
  const baseSlug = slugify(title);
  let candidate = path.join(baseDir, baseSlug);
  let count = 2;
  while (existsSync(candidate)) {
    candidate = path.join(baseDir, `${baseSlug}-${count}`);
    count += 1;
  }
  return candidate;
}

async function writePromotedProjectPackage(projectRoot, context) {
  await writeFile(path.join(projectRoot, "wiki", "index.html"), wikiLayout(context.title, "Home", `<h1>${escapeHtml(context.title)}</h1>
<p>${escapeHtml(context.summary)}</p>
<section>
  <h2>Origin</h2>
  <p>Promoted from <code>${escapeHtml(context.originProject.name)}</code> idea <code>${escapeHtml(context.originPath)}</code>.</p>
</section>
<section>
  <h2>Idea Snapshot</h2>
  ${context.content}
</section>`), "utf8");
  await writeFile(path.join(projectRoot, "wiki", "sources", "idea-origin.html"), wikiLayout(context.title, "Idea Origin", `<h1>Idea Origin</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${new Date().toISOString().slice(0, 10)}</li>
  <li>Evidence basis: promoted HyperWiki idea from <code>${escapeHtml(context.originProject.name)}</code>.</li>
  <li>Confidence: medium</li>
</ul>
<h2>Origin</h2>
<p>Source idea: <code>${escapeHtml(context.originPath)}</code>.</p>
<h2>Promoted Content</h2>
${context.content}`), "utf8");
  await writeFile(path.join(projectRoot, "wiki", "sources.html"), wikiLayout(context.title, "Sources", `<h1>Sources</h1>
<h2>Source Material</h2>
<ul>
  <li>Promoted idea from <code>${escapeHtml(context.originProject.name)}</code>: <code>${escapeHtml(context.originPath)}</code>.</li>
</ul>
<h2>Generated Source Briefs</h2>
<ul>
  <li><a href="/wiki/sources/idea-origin.html">Idea origin</a></li>
  <li><a href="/wiki/sources/prd.html">Product brief</a></li>
  <li><a href="/wiki/sources/technical-brief.html">Technical brief</a></li>
  <li><a href="/wiki/sources/design-brief.html">Design brief</a></li>
</ul>`), "utf8");
  await writeFile(path.join(projectRoot, "wiki", "roadmap.html"), wikiLayout(context.title, "Roadmap", `<h1>Roadmap</h1>
<ol>
  <li>Refine the promoted idea into concrete product goals, non-goals, and acceptance criteria.</li>
  <li>Turn the first useful slice into an implementation unit under <a href="/wiki/plans/index.html">plans</a>.</li>
  <li>Record validation and durable decisions in <a href="/wiki/log.html">log</a>.</li>
</ol>`), "utf8");
  await writeFile(path.join(projectRoot, "wiki", "plans", "index.html"), wikiLayout(context.title, "Plans", `<h1>Planning Dashboard</h1>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: active</li>
    <li>Shape: promoted idea planning package</li>
    <li>Current unit: none</li>
    <li>Next action: refine the promoted idea into the first implementation unit.</li>
    <li>Blockers: product scope and verification path need confirmation.</li>
    <li>Validation: project-specific checks to be defined after scope is refined.</li>
  </ul>
</section>
<p>Read the <a href="/wiki/sources/idea-origin.html">idea origin</a> before planning implementation.</p>`), "utf8");
}

function promotedIdeaPage(project, title, summary, record, workspaceUrl) {
  return wikiLayout(project.name, "Promoted Idea", `<article data-hyperwiki-promoted="true">
  <h1>Promoted Idea</h1>
  <p><strong>${escapeHtml(title)}</strong> was initialized as a HyperWiki project.</p>
  <ul>
    <li>Project: <a href="${workspaceUrl}">${escapeHtml(record.name)}</a></li>
    <li>Root: <code>${escapeHtml(record.root)}</code></li>
    <li>Summary: ${escapeHtml(summary)}</li>
  </ul>
</article>`);
}

function wikiLayout(projectName, title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(projectName)}</title>
  <link rel="stylesheet" href="/assets/wiki.css">
</head>
<body>
  <header class="wiki-header">
    <a href="/wiki/index.html">${escapeHtml(projectName)}</a>
    <nav>
      <a href="/wiki/architecture.html">Architecture</a>
      <a href="/wiki/dev.html">Dev</a>
      <a href="/wiki/plans/index.html">Plans</a>
      <a href="/wiki/ideas/index.html">Ideas</a>
      <a href="/wiki/log.html">Log</a>
      <a href="/wiki/sources.html">Sources</a>
    </nav>
  </header>
  <main class="wiki-page">
    ${body}
  </main>
</body>
</html>
`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const [gitRoot, branch, status, commonDir, worktree] = await Promise.all([
    git(root, ["rev-parse", "--show-toplevel"]),
    git(root, ["branch", "--show-current"]),
    git(root, ["status", "--short"]),
    git(root, ["rev-parse", "--git-common-dir"]),
    worktreeSlug(root)
  ]);
  return {
    root,
    git: {
      root: gitRoot.ok ? gitRoot.stdout : null,
      branch: branch.ok && branch.stdout ? branch.stdout : "detached",
      worktree,
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

async function listWikiPages(root, projectId = null) {
  const wikiRoot = path.join(root, "wiki");
  if (!existsSync(wikiRoot)) {
    return { pages: [] };
  }
  const pages = [];
  await walkWiki(wikiRoot, wikiRoot, pages, projectId);
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return { pages };
}

async function walkWiki(baseRoot, directory, pages, projectId) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkWiki(baseRoot, fullPath, pages, projectId);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name) !== ".html") {
      continue;
    }
    const relativePath = path.relative(baseRoot, fullPath).split(path.sep).join("/");
    const html = await readFile(fullPath, "utf8");
    pages.push({
      title: firstMatch(html, /<h1[^>]*>(.*?)<\/h1>/is) || titleFromWikiPath(relativePath),
      path: projectId ? `/projects/${projectId}/wiki/${relativePath}` : `/wiki/${relativePath}`
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
