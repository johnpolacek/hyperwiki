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
import { openWorkspace } from "./open.js";
import { createPtySession } from "./pty.js";
import { inithyperwiki } from "./init.js";
import { ProjectRegistry, worktreeSlug } from "./projects.js";
import { SessionRegistry } from "./sessions.js";
import { readSettings, resetThemeSettings, syncAgentsFile, themeCss, writeSettings } from "./settings.js";

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
    throw new Error("hyperwiki dev server only binds to localhost addresses.");
  }
  const configuredPort = options.port ?? process.env.PORT ?? 4177;
  const port = configuredPort === 0 || configuredPort === "0" ? 0 : Number(configuredPort);
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
  const workspaceBaseUrl = process.env.PORTLESS_URL || url;
  const workspaceUrl = `${workspaceBaseUrl}/workspace/`;
  console.log(`hyperwiki dev server running at ${url}`);
  if (process.env.PORTLESS_URL) {
    console.log(`hyperwiki Portless preview: ${workspaceUrl}`);
  }
  if (options.open === true || options.open === "true") {
    const opened = await openWorkspace(workspaceUrl, options);
    if (!opened) {
      console.log("Browser open skipped; open the workspace URL manually.");
    }
  }
  return { server, host, port: actualPort, url, workspaceUrl };
}

async function handleRequest(defaultRoot, request, response, context) {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      redirect(response, "/workspace/");
      return;
    }
    if (workspaceRoute(url.pathname) || appShellRoute(url.pathname)) {
      await sendFile(response, path.join(publicRoot, "index.html"), publicRoot);
      return;
    }
    if (url.pathname === "/api/settings") {
      if (request.method === "GET") {
        await sendJson(response, await readSettings());
        return;
      }
      if (request.method === "PUT") {
        await sendJson(response, await writeSettings(await readJsonBody(request)));
        return;
      }
    }
    if (url.pathname === "/api/settings/reset-theme" && request.method === "POST") {
      await sendJson(response, await resetThemeSettings());
      return;
    }
    if (url.pathname === "/api/settings/sync-agents" && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const body = await readJsonBody(request);
      await sendJson(response, await syncAgentsFile(project.root, typeof body.content === "string" ? body.content : null));
      return;
    }
    if (url.pathname === "/api/settings/agents-file") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await agentsFile(project.root));
      return;
    }
    if (url.pathname === "/assets/theme.css") {
      await sendText(response, themeCss(await readSettings()), "text/css; charset=utf-8");
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
    if (url.pathname === "/favicon.ico") {
      await sendFile(response, path.join(publicRoot, "favicon.ico"), publicRoot);
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
    if (url.pathname === "/api/workspace") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await workspaceSummary(project.root, await readConfig(project.root)));
      return;
    }
    if (url.pathname === "/api/verification") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await verificationSummary(project.root, await readConfig(project.root)));
      return;
    }
    if (url.pathname === "/api/project-contract") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await projectContract(project.root, await readConfig(project.root)));
      return;
    }
    if (url.pathname === "/api/review-workflows") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await reviewWorkflowSummary(project.root, await readConfig(project.root)));
      return;
    }
    if (url.pathname === "/api/mcp-surface") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      await sendJson(response, await mcpSurfaceSummary(project.root, await readConfig(project.root)));
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
    if (url.pathname === "/api/review-workflows/run" && request.method === "POST") {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const sessionRegistry = sessionRegistryFor(context.sessionRegistries, project.root);
      const inputs = sessionInputFor(context.sessionInputs, project.root);
      const body = await readJsonBody(request);
      const result = await runReviewWorkflow(project, sessionRegistry, inputs, body);
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
      await sendWikiFile(response, path.join(wikiRoot, projectWikiMatch[2]), wikiRoot, { projectId: project.id });
      return;
    }
    if (url.pathname.startsWith("/wiki/")) {
      const project = await resolveProject(context.projectRegistry, url, context.activeProjectId, defaultRoot);
      const wikiRoot = path.join(project.root, "wiki");
      await sendWikiFile(response, path.join(project.root, url.pathname), wikiRoot);
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

function appShellRoute(pathname) {
  return /^\/(?:dashboard|ideas|projects(?:\/new)?|settings)\/?$/.test(pathname);
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
    "Please handle this hyperwiki workspace request.",
    "",
    `Project: ${project.name}`,
    `Repo root: ${project.root}`,
    `Current wiki page: ${currentPage}`,
    "If AGENTS.md contains a HyperWiki Global Context managed block, treat it as active Soul and Memory guidance.",
    "Keep durable project knowledge in wiki/ HTML pages and Git-visible files. Run relevant checks before finishing.",
    "When creating a new plan page, do not append \"Plan\" to the page title; the plans sidebar already supplies that context.",
    "",
    prompt,
    ""
  ].join("\n");
  const writeAgentInput = inputs.get(agentSession.id);
  writeAgentInput(codexPasteInput(message));
  setTimeout(() => writeAgentInput("\r"), 75);
  return {
    ok: true,
    session: {
      id: agentSession.id,
      name: agentSession.name
    }
  };
}

function codexPasteInput(message) {
  return `\x1b[200~${message}\x1b[201~`;
}

const reviewWorkflowDefinitions = [
  {
    id: "diff-review",
    label: "Diff Review",
    scope: "changed-files",
    description: "Review the current Git diff for behavioral regressions, missing edge cases, accidental churn, and commit readiness.",
    evidenceType: "review.findings.diff",
    instructions: [
      "Inspect the current Git diff and repo status before giving findings.",
      "Prioritize bugs, regressions, unintended behavior changes, and missing tests.",
      "Report findings first with file and line references where possible.",
      "Call out whether the changes look ready to commit after verification."
    ]
  },
  {
    id: "architecture-review",
    label: "Architecture Consistency Review",
    scope: "project-architecture",
    description: "Check whether the current work matches the documented wiki architecture, source briefs, plan intent, and existing code patterns.",
    evidenceType: "review.findings.architecture",
    instructions: [
      "Compare the current implementation against the active plan, source briefs, and nearby code patterns.",
      "Identify drift from documented architecture, duplicated concepts, misplaced responsibilities, or unclear boundaries.",
      "Prefer small corrective changes that preserve the existing system shape.",
      "Name any plan or source page that needs a durable update."
    ]
  },
  {
    id: "security-review",
    label: "Security Review",
    scope: "trust-boundaries",
    description: "Review localhost tooling trust boundaries, filesystem access, terminal handoff behavior, user input handling, and runtime state.",
    evidenceType: "review.findings.security",
    instructions: [
      "Focus on concrete security risks in the changed behavior and exposed local endpoints.",
      "Check trust boundaries around files, credentials, environment variables, terminal sessions, runtime state, and generated prompts.",
      "Separate confirmed issues from theoretical concerns.",
      "Recommend minimal mitigations and tests for each confirmed issue."
    ]
  },
  {
    id: "test-gap-review",
    label: "Test Gap Review",
    scope: "verification-coverage",
    description: "Find missing automated or manual verification coverage for the current plan, changed code paths, and user-visible workflows.",
    evidenceType: "review.findings.test-gaps",
    instructions: [
      "Map the active plan acceptance criteria to existing checks and smoke tests.",
      "Identify important paths that are untested or only manually tested.",
      "Recommend focused tests or manual verification loops, avoiding broad low-value coverage.",
      "Call out any known failing smoke coverage separately from new gaps."
    ]
  }
];

export async function reviewWorkflowSummary(root, config) {
  const contract = await projectContract(root, config);
  return {
    version: 1,
    kind: "hyperwiki.review-workflows",
    generatedAt: new Date().toISOString(),
    boundary: "runtime-only-until-recorded",
    source: "built-in review workflow definitions plus the current project contract",
    resultTruth: "Review findings are runtime evidence until a human or agent records them in wiki files or Git.",
    workflows: reviewWorkflowDefinitions.map((workflow) => reviewWorkflowView(workflow)),
    project: contract.project,
    plan: contract.plan
  };
}

async function runReviewWorkflow(project, sessionRegistry, inputs, body) {
  const workflowId = typeof body.workflowId === "string" ? body.workflowId : "";
  const workflow = reviewWorkflowDefinitions.find((item) => item.id === workflowId);
  if (!workflow) {
    const error = new Error("Unknown review workflow.");
    error.statusCode = 404;
    throw error;
  }
  const contract = await projectContract(project.root, await readConfig(project.root));
  const currentPage = typeof body.currentPage === "string" ? body.currentPage : contract.plan.currentPath || "/wiki/plans/index.html";
  const prompt = reviewWorkflowPrompt(workflow, contract, currentPage);
  const evidence = {
    workflowId: workflow.id,
    status: body.dryRun === true ? "prepared" : "queued",
    boundary: "runtime-evidence",
    recorded: false,
    evidenceType: workflow.evidenceType
  };
  if (body.dryRun === true) {
    return {
      ok: true,
      sent: false,
      workflow: reviewWorkflowView(workflow),
      boundary: "runtime-only-until-recorded",
      evidence,
      prompt
    };
  }
  const result = await sendAgentPrompt(project, sessionRegistry, inputs, { prompt, currentPage });
  return {
    ...result,
    sent: true,
    workflow: reviewWorkflowView(workflow),
    boundary: "runtime-only-until-recorded",
    evidence
  };
}

function reviewWorkflowView(workflow) {
  return {
    id: workflow.id,
    label: workflow.label,
    scope: workflow.scope,
    description: workflow.description,
    requiresAgent: true,
    resultBoundary: "runtime-evidence",
    evidenceType: workflow.evidenceType
  };
}

function reviewWorkflowPrompt(workflow, contract, currentPage) {
  return [
    `Workflow: ${workflow.label}`,
    `Workflow ID: ${workflow.id}`,
    `Scope: ${workflow.scope}`,
    `Current wiki page: ${currentPage}`,
    "",
    "Project contract:",
    contract.agentContext,
    "",
    "Review instructions:",
    ...workflow.instructions.map((instruction) => `- ${instruction}`),
    "",
    "Result boundary:",
    "- Treat the review result as runtime evidence.",
    "- Do not edit wiki files, commit, or change code unless the user explicitly asks you to act on a finding.",
    "- If a finding should become durable project knowledge, say exactly where it should be recorded."
  ].join("\n");
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

async function agentsFile(root) {
  const filePath = path.join(root, "AGENTS.md");
  return {
    path: filePath,
    content: existsSync(filePath) ? await readFile(filePath, "utf8") : ""
  };
}

function safeDropName(name) {
  const fallback = "dropped-file";
  return path.basename(String(name || fallback)).replace(/[^a-zA-Z0-9._-]/g, "-") || fallback;
}

export async function workspaceSummary(root, config) {
  const packageManager = await packageManagerForRoot(root);
  const planDashboard = await htmlSummary(root, "wiki/plans/index.html");
  const wikiPages = await listWikiPages(root);
  const logEntries = await htmlHeadings(root, "wiki/log.html", "h2", 5);
  const sourceBriefs = await sourceBriefSummary(root);
  const status = workspaceStatus(planDashboard.summary, logEntries, wikiPages.pages);
  const verification = await verificationLoops(root, config, packageManager);
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
    verification,
    layout: layoutConfig(config)
  };
}

export async function verificationSummary(root, config) {
  const packageManager = await packageManagerForRoot(root);
  const loops = await verificationLoops(root, config, packageManager);
  return {
    version: 1,
    boundary: "runtime-only-until-recorded",
    source: "derived from package scripts and .hyperwiki/config.json",
    statePath: ".hyperwiki/state/verification.json",
    recordedTruth: "Verification runs are runtime evidence until a human or agent records the result into wiki files or Git.",
    loops
  };
}

export async function projectContract(root, config) {
  const [workspace, verification, repo, wiki, sources, guardrails] = await Promise.all([
    workspaceSummary(root, config),
    verificationSummary(root, config),
    repoContext(root),
    listWikiPages(root),
    sourceBriefSummary(root),
    Promise.resolve(guardrailSummary(root))
  ]);
  const project = {
    name: String(config.projectName || path.basename(root)),
    root,
    canonicalWiki: String(config.canonicalWiki || "html"),
    runtimeState: String(config.runtimeState || ".hyperwiki/state"),
    sessions: String(config.sessions || ".hyperwiki/sessions")
  };
  const plan = {
    dashboard: workspace.plan,
    status: workspace.status,
    currentPath: workspace.status.currentPath || workspace.plan.path
  };
  const agent = {
    launchCommand: config.agent?.launchCommand ? String(config.agent.launchCommand) : "",
    handoff: "Use visible terminal handoffs; do not treat runtime evidence as canonical until it is recorded in wiki files or Git."
  };
  const contract = {
    version: 1,
    kind: "hyperwiki.project-contract",
    generatedAt: new Date().toISOString(),
    boundary: "localhost-tooling",
    project,
    repo,
    plan,
    sources: {
      indexPath: "/wiki/sources.html",
      briefs: sources
    },
    verification,
    guardrails,
    layout: workspace.layout,
    wiki: {
      indexPath: "/wiki/index.html",
      pages: wiki.pages
    },
    agent,
    canonicalTruth: [
      "wiki/",
      ".git"
    ],
    runtimeTruth: [
      project.runtimeState,
      project.sessions,
      verification.statePath
    ]
  };
  contract.agentContext = agentContextFromContract(contract);
  return contract;
}

export async function mcpSurfaceSummary(root, config) {
  const contract = await projectContract(root, config);
  return {
    version: 1,
    kind: "hyperwiki.mcp-surface",
    generatedAt: new Date().toISOString(),
    boundary: "localhost-tooling",
    transportStatus: "stdio-served",
    contract: {
      sourceEndpoint: "/api/project-contract",
      kind: contract.kind,
      version: contract.version
    },
    project: contract.project,
    canonicalTruth: contract.canonicalTruth,
    runtimeTruth: contract.runtimeTruth,
    resources: mcpResources(contract),
    tools: mcpTools(contract),
    useCases: [
      "Start an agent with current project, plan, source, guardrail, and verification context.",
      "Let an MCP-capable agent discover verification loops before finishing work.",
      "Prepare consistent diff, architecture, security, and test-gap review prompts.",
      "Expose Localhost Tooling trust boundaries without asking agents to scrape the UI.",
      "Keep runtime evidence separate from durable wiki and Git truth."
    ],
    implementationNotes: [
      "This is the stable surface contract for the local stdio MCP server.",
      "Read resources are served through `hyperwiki mcp` and may also be read from corresponding local HTTP API payloads.",
      "Action tools must preserve the same permission boundaries as the local HTTP handlers.",
      "Prompt submission and review workflow execution require an active visible agent session unless dry-run preparation is requested."
    ]
  };
}

export function mcpResources(contract) {
  return [
    {
      uri: "hyperwiki://project-contract",
      name: "Project Contract",
      description: "Machine-readable project facts, current plan state, source briefs, guardrails, verification loops, layout, wiki pages, and runtime boundaries.",
      mimeType: "application/json",
      boundary: "localhost-tooling",
      readOnly: true,
      sourceEndpoint: "/api/project-contract",
      contractPath: "$"
    },
    {
      uri: "hyperwiki://current-plan",
      name: "Current Plan",
      description: "Current planning dashboard status and active plan/unit path derived from repo-visible wiki HTML.",
      mimeType: "application/json",
      boundary: "canonical-wiki",
      readOnly: true,
      sourceEndpoint: "/api/project-contract",
      contractPath: "$.plan"
    },
    {
      uri: "hyperwiki://source-index",
      name: "Source Index",
      description: "Source index and generated source briefs that define durable product and technical context.",
      mimeType: "application/json",
      boundary: "canonical-wiki",
      readOnly: true,
      sourceEndpoint: "/api/project-contract",
      contractPath: "$.sources"
    },
    {
      uri: "hyperwiki://verification-loops",
      name: "Verification Loops",
      description: "Configured or inferred verification loops plus latest local runtime evidence.",
      mimeType: "application/json",
      boundary: "runtime-evidence",
      readOnly: true,
      sourceEndpoint: "/api/verification",
      contractPath: "$"
    },
    {
      uri: "hyperwiki://guardrails",
      name: "Guardrails",
      description: "Localhost Tooling trust boundary, canonical truth, runtime state, and terminal/session action boundaries.",
      mimeType: "application/json",
      boundary: "localhost-tooling",
      readOnly: true,
      sourceEndpoint: "/api/guardrails",
      contractPath: "$"
    },
    {
      uri: "hyperwiki://review-workflows",
      name: "Review Workflows",
      description: "Named agent review workflows for diff, architecture consistency, security, and test-gap review.",
      mimeType: "application/json",
      boundary: "runtime-only-until-recorded",
      readOnly: true,
      sourceEndpoint: "/api/review-workflows",
      contractPath: "$"
    },
    {
      uri: "hyperwiki://wiki-pages",
      name: "Wiki Pages",
      description: "Repo-visible HTML wiki page index for canonical project knowledge.",
      mimeType: "application/json",
      boundary: "canonical-wiki",
      readOnly: true,
      sourceEndpoint: "/api/wiki",
      contractPath: "$.wiki"
    }
  ];
}

export function mcpTools(contract) {
  return [
    {
      name: "get_project_contract",
      title: "Get Project Contract",
      description: "Return the complete machine-readable project contract.",
      readOnly: true,
      idempotent: true,
      destructive: false,
      boundary: "localhost-tooling",
      mapsTo: {
        method: "GET",
        endpoint: "/api/project-contract"
      },
      inputSchema: objectSchema({})
    },
    {
      name: "get_current_plan",
      title: "Get Current Plan",
      description: "Return the active plan and current unit derived from the wiki.",
      readOnly: true,
      idempotent: true,
      destructive: false,
      boundary: "canonical-wiki",
      mapsTo: {
        method: "GET",
        endpoint: "/api/project-contract",
        responsePath: "$.plan"
      },
      inputSchema: objectSchema({})
    },
    {
      name: "list_verification_loops",
      title: "List Verification Loops",
      description: "Return verification loops and latest local runtime evidence.",
      readOnly: true,
      idempotent: true,
      destructive: false,
      boundary: "runtime-evidence",
      mapsTo: {
        method: "GET",
        endpoint: "/api/verification"
      },
      inputSchema: objectSchema({})
    },
    {
      name: "list_review_workflows",
      title: "List Review Workflows",
      description: "Return available named agent review workflows.",
      readOnly: true,
      idempotent: true,
      destructive: false,
      boundary: "runtime-only-until-recorded",
      mapsTo: {
        method: "GET",
        endpoint: "/api/review-workflows"
      },
      inputSchema: objectSchema({})
    },
    {
      name: "prepare_review_workflow",
      title: "Prepare Review Workflow",
      description: "Build a project-contract-aware review prompt without sending it to a terminal session.",
      readOnly: false,
      idempotent: true,
      destructive: false,
      boundary: "runtime-evidence",
      mapsTo: {
        method: "POST",
        endpoint: "/api/review-workflows/run",
        fixedBody: {
          dryRun: true
        }
      },
      inputSchema: objectSchema({
        workflowId: {
          type: "string",
          enum: reviewWorkflowDefinitions.map((workflow) => workflow.id),
          description: "Review workflow to prepare."
        },
        currentPage: {
          type: "string",
          description: "Current wiki page path to include in the handoff."
        }
      }, ["workflowId"])
    },
    {
      name: "submit_agent_prompt",
      title: "Submit Agent Prompt",
      description: "Send a bounded prompt into the active visible agent terminal session.",
      readOnly: false,
      idempotent: false,
      destructive: false,
      boundary: "visible-agent-session",
      requiresActiveAgentSession: true,
      mapsTo: {
        method: "POST",
        endpoint: "/api/agent/prompt"
      },
      inputSchema: objectSchema({
        prompt: {
          type: "string",
          description: "Prompt text to route through the visible terminal handoff."
        },
        currentPage: {
          type: "string",
          description: "Current wiki page path to include in the handoff."
        }
      }, ["prompt"])
    }
  ].map((tool) => ({
    ...tool,
    projectRoot: contract.project.root
  }));
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required
  };
}

function agentContextFromContract(contract) {
  const verification = contract.verification.loops
    .map((loop) => `- ${loop.label}: ${loop.command || "manual"} [${loop.status}; ${loop.trigger}]`)
    .join("\n");
  return [
    `Project: ${contract.project.name}`,
    `Root: ${contract.project.root}`,
    `Branch: ${contract.repo.git.branch}`,
    `Current plan: ${contract.plan.status.current}`,
    `Current path: ${contract.plan.currentPath || "Unknown"}`,
    `Boundary: ${contract.boundary}; canonical truth lives in ${contract.canonicalTruth.join(" and ")}.`,
    "Verification loops:",
    verification || "- None configured",
    `Runtime evidence remains local until recorded: ${contract.verification.statePath}.`
  ].join("\n");
}

async function verificationLoops(root, config, packageManager) {
  const configured = Array.isArray(config.verification?.loops) ? config.verification.loops : [];
  const loops = configured.length > 0 ? configured : await defaultVerificationLoops(root, packageManager);
  const runState = await verificationRunState(root);
  return loops.map((loop) => normalizeVerificationLoop(loop, runState.get(String(loop.id || slugify(loop.label || loop.command || "verification")))));
}

async function defaultVerificationLoops(root, packageManager) {
  const scripts = await packageScripts(root);
  const loops = [];
  if (scripts.has("check")) {
    loops.push({
      id: "syntax-checks",
      label: "Syntax checks",
      command: `${packageManager} run check`,
      scope: "codebase",
      trigger: "before commit and finish",
      kind: "automated",
      source: "package.json scripts.check"
    });
  }
  if (scripts.has("smoke:browser")) {
    loops.push({
      id: "browser-workspace-smoke",
      label: "Browser workspace smoke",
      command: `${packageManager} run smoke:browser`,
      scope: "workspace-ui",
      trigger: "after browser-visible workflow changes",
      kind: "automated",
      source: "package.json scripts.smoke:browser"
    });
  }
  if (scripts.has("smoke:launch")) {
    loops.push({
      id: "one-command-launch-smoke",
      label: "One-command launch smoke",
      command: `${packageManager} run smoke:launch`,
      scope: "launch-flow",
      trigger: "after launch, registry, or route changes",
      kind: "automated",
      source: "package.json scripts.smoke:launch"
    });
  }
  loops.push({
    id: "local-workspace-launch",
    label: "Local workspace launch",
    command: "npx hyperwiki",
    scope: "local-runtime",
    trigger: "manual dogfood",
    kind: "manual",
    source: "hyperwiki CLI"
  });
  return loops;
}

async function packageScripts(root) {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    return new Set(Object.keys(pkg.scripts || {}));
  } catch {
    return new Set();
  }
}

async function verificationRunState(root) {
  const statePath = path.join(root, ".hyperwiki", "state", "verification.json");
  if (!existsSync(statePath)) return new Map();
  try {
    const data = JSON.parse(await readFile(statePath, "utf8"));
    const runs = Array.isArray(data.runs) ? data.runs : [];
    const latest = new Map();
    for (const run of runs) {
      const loopId = String(run.loopId || run.id || "");
      if (!loopId) continue;
      const previous = latest.get(loopId);
      if (!previous || String(previous.ranAt || "") < String(run.ranAt || "")) {
        latest.set(loopId, run);
      }
    }
    return latest;
  } catch {
    return new Map();
  }
}

function normalizeVerificationLoop(loop, run = null) {
  const id = String(loop.id || slugify(loop.label || loop.command || "verification"));
  return {
    id,
    label: String(loop.label || id),
    command: String(loop.command || ""),
    scope: String(loop.scope || "project"),
    trigger: String(loop.trigger || "manual"),
    status: String(run?.status || loop.status || "unknown"),
    lastRun: run?.ranAt || loop.lastRun || null,
    evidence: run?.evidence || loop.evidence || null,
    kind: String(run?.kind || loop.kind || "automated"),
    source: String(loop.source || "configuration"),
    recorded: Boolean(run?.recorded || loop.recorded || false),
    boundary: run ? "runtime-evidence" : "defined-loop"
  };
}

function workspaceStatus(planSummary, logEntries, pages = []) {
  const currentUnit = summaryValue(planSummary, "Current unit");
  const currentStage = summaryValue(planSummary, "Current stage");
  const currentStagePage = findPlanPageByLabel(pages, currentStage) || findActivePlanPage(pages, isStagePath);
  const currentUnitPage = findPlanPageByLabel(pages, currentUnit, currentStagePage)
    || findActivePlanPage(pages, isUnitPath, currentStagePage)
    || (!currentStagePage ? findActivePlanPage(pages, isUnitPath) : null);
  const current = currentUnit || currentUnitPage?.title || currentStage || currentStagePage?.title || summaryValue(planSummary, "Status") || "Unknown";
  return {
    completed: completedStatus(planSummary, logEntries),
    stage: currentStage || currentStagePage?.title || "Unknown",
    current,
    currentPath: currentUnitPage?.path || currentStagePage?.path || ""
  };
}

function findPlanPageByLabel(pages, label, parentPage = null) {
  if (!label || /^none|complete$/i.test(label)) return null;
  const normalized = normalizePlanLabel(label);
  const parentBase = parentPage ? parentPage.path.replace(/\.html$/, "") : "";
  return pages.find((page) => {
    if (!page.path.includes("/wiki/plans/")) return false;
    if (parentBase && !page.path.startsWith(`${parentBase}/`)) return false;
    return normalizePlanLabel(page.title) === normalized;
  }) || null;
}

function findActivePlanPage(pages, predicate, parentPage = null) {
  const parentBase = parentPage ? parentPage.path.replace(/\.html$/, "") : "";
  return pages.find((page) => {
    if (parentBase && !page.path.startsWith(`${parentBase}/`)) return false;
    return predicate(page.path) && pageSummaryStatus(page) === "active";
  }) || null;
}

function isStagePath(pathValue) {
  return /\/wiki\/plans\/mvp\/stage-[^/]+\.html$/.test(pathValue);
}

function isUnitPath(pathValue) {
  return /\/unit-\d+-[^/]+\.html$/.test(pathValue);
}

function normalizePlanLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .trim()
    .toLowerCase();
}

function pageSummaryStatus(page) {
  return summaryValue(page.summary || [], "Status").toLowerCase();
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

export function guardrailSummary(root) {
  return {
    mode: {
      label: "Localhost Tooling",
      value: "Dev server binds to localhost addresses and keeps the developer's machine, repo files, Git state, terminal sessions, credentials, and environment variables inside the local trust boundary."
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
      detail: "hyperwiki stores session metadata and terminal lifecycle state. Shell history and scrollback are runtime data unless the user exports or records them in wiki files."
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

export async function readConfig(root) {
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
    })),
    dev: {
      command: config.dev?.command ? String(config.dev.command) : "",
      previewUrl: config.dev?.previewUrl ? String(config.dev.previewUrl) : ""
    },
    worktrees: {
      workflow: config.worktrees?.workflow ? String(config.worktrees.workflow) : "parallel-dev-worktrees",
      previewUrlPattern: config.worktrees?.previewUrlPattern ? String(config.worktrees.previewUrlPattern) : ""
    }
  };
}

function fallbackPanels(config) {
  const panels = [];
  if (config.agent?.launchCommand) {
    panels.push({ name: "agent", role: "agent", command: String(config.agent.launchCommand) });
  }
  if (config.dev?.command) {
    panels.push({ name: "dev", role: "dev", command: String(config.dev.command) });
  }
  panels.push({ name: "cli", role: "shell", command: null });
  return panels;
}

export async function sourceBriefSummary(root) {
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
  await inithyperwiki(projectRoot, {
    yes: true,
    project_name: title,
    summary
  });
  const record = await projectRegistry.register(projectRoot);
  const workspaceUrl = `/workspace/${encodeURIComponent(record.projectSlug)}/${encodeURIComponent(record.worktreeSlug)}`;
  return { project: record, workspaceUrl };
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

function wikiLayout(projectName, title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(projectName)}</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="stylesheet" href="/assets/wiki.css">
  <link rel="stylesheet" href="/assets/theme.css">
</head>
<body>
  <header class="wiki-header">
    <a href="/wiki/index.html">${escapeHtml(projectName)}</a>
    <nav>
      <a href="/wiki/architecture.html">Architecture</a>
      <a href="/wiki/dev.html">Dev</a>
      <a href="/wiki/plans/index.html">Plans</a>
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

export async function repoContext(root) {
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

export async function listWikiPages(root, projectId = null) {
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
      summary: listItemsFromFirstSummary(html),
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

function sendText(response, value, contentTypeHeader) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypeHeader
  });
  response.end(value);
}

async function sendWikiFile(response, filePath, allowedRoot, options = {}) {
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
  let html = await readFile(resolved, "utf8");
  if (!html.includes("/favicon.ico")) {
    html = html.replace("</head>", "  <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"any\">\n</head>");
  }
  if (!html.includes("/assets/theme.css")) {
    html = html.replace("</head>", "  <link rel=\"stylesheet\" href=\"/assets/theme.css\">\n</head>");
  }
  if (options.projectId) {
    html = rewriteProjectScopedWikiLinks(html, options.projectId);
  }
  sendText(response, html, "text/html; charset=utf-8");
}

function rewriteProjectScopedWikiLinks(html, projectId) {
  const projectWikiPrefix = `/projects/${encodeURIComponent(projectId)}/wiki/`;
  return html.replaceAll(/(href|src)="\/wiki\//g, `$1="${projectWikiPrefix}`);
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
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}
