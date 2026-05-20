import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-launch-smoke-a-"));
const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-launch-worktrees-"));
const secondRoot = path.join(workspaceRoot, "plan-unit-navigation");
const home = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-home-smoke-"));
const port = 4211;
await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "launch-smoke" }, null, 2)}\n`);
await mkdir(secondRoot);
await writeFile(path.join(secondRoot, "package.json"), `${JSON.stringify({ name: "launch-smoke" }, null, 2)}\n`);
await writeFile(path.join(secondRoot, ".git"), `gitdir: ${path.join(workspaceRoot, ".git", "worktrees", "plan-unit-navigation")}\n`);
let child = null;
let browser = null;

try {
  await runCli(["init", "--yes", "--agent-launch-command", "cat"], { cwd: root, env: { ...process.env, HYPERWIKI_HOME: home } });
  await runCli(["init", "--yes", "--no-git"], { cwd: secondRoot, env: { ...process.env, HYPERWIKI_HOME: home } });
  child = spawn(process.execPath, [path.resolve("src/cli.js"), "launch", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      HYPERWIKI_HOME: home,
      HYPERWIKI_OPEN_DRY_RUN: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitForText(() => output, "hyperwiki workspace:");
  const workspaceMatch = output.match(/hyperwiki workspace: (http:\/\/[^\s]+)/);
  const workspaceUrl = workspaceMatch?.[1];
  if (!workspaceUrl) {
    throw new Error(`Expected workspace URL output, got: ${output}`);
  }
  if (!workspaceUrl.endsWith("/workspace/launch-smoke/main")) {
    throw new Error(`Expected pretty main workspace URL, got ${workspaceUrl}`);
  }
  if (!output.includes(`Would open ${workspaceUrl}`)) {
    throw new Error(`Expected dry-run opener output, got: ${output}`);
  }

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
  if (health.app !== "hyperwiki") {
    throw new Error(`Expected hyperwiki health response, got ${JSON.stringify(health)}`);
  }

  const projects = await fetch(`http://127.0.0.1:${port}/api/projects`).then((response) => response.json());
  if (projects.projects.length !== 1 || projects.projects[0].name !== "launch-smoke") {
    throw new Error(`Expected registered launch-smoke project, got ${JSON.stringify(projects)}`);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${workspaceUrl}#/wiki/plans/index.html`, { waitUntil: "networkidle" });
  const initialTerminals = await page.locator(".terminal-panel").count();
  if (initialTerminals !== 0) {
    throw new Error(`Expected launch to start with no terminals, got ${initialTerminals}`);
  }
  await page.locator(".terminal-pane").evaluate((pane) => {
    if (getComputedStyle(pane).display === "none" || !pane.textContent.includes("new agent") || !pane.textContent.includes("new cli")) {
      throw new Error(`Expected visible terminal controls before Execute, got ${pane.textContent}`);
    }
  });
  const projectToggleVisible = await page.locator("#project-toggle").evaluate((element) => !element.hidden);
  if (!projectToggleVisible) {
    throw new Error("Expected project topbar action to be visible for registered checkouts.");
  }

  const sessions = await fetch(`http://127.0.0.1:${port}/api/sessions`).then((response) => response.json());
  if (sessions.sessions.some((session) => session.status === "active")) {
    throw new Error(`Expected launch to avoid active terminal sessions before Execute, got ${JSON.stringify(sessions)}`);
  }
  await page.locator("#execute-button").click();
  await page.locator("#execute-menu [data-execute-target=\"main\"]").click();
  await page.locator(".terminal-panel[data-name=\"agent\"]").waitFor();
  await page.goto(`${workspaceUrl}#/wiki/plans/mvp/stage-01-foundation.html`, { waitUntil: "networkidle" });
  await page.waitForURL(/#\/wiki\/plans\/mvp\/stage-01-foundation\.html$/);
  const scopedStageTerminals = await page.locator(".terminal-panel").count();
  if (scopedStageTerminals !== 0) {
    throw new Error(`Expected a fresh terminal scope on another plan, got ${scopedStageTerminals}`);
  }
  const detachedSessions = await fetch(`http://127.0.0.1:${port}/api/sessions`).then((response) => response.json());
  if (!detachedSessions.sessions.some((session) => session.name === "agent" && session.status === "detached" && session.scope === "plan:/wiki/plans/index.html")) {
    throw new Error(`Expected index agent to keep running detached, got ${JSON.stringify(detachedSessions)}`);
  }
  await page.goto(`${workspaceUrl}#/wiki/plans/index.html`, { waitUntil: "networkidle" });
  await page.locator(".terminal-panel[data-name=\"agent\"]").waitFor();
  const reattachedSessions = await fetch(`http://127.0.0.1:${port}/api/sessions?scope=${encodeURIComponent("plan:/wiki/plans/index.html")}`).then((response) => response.json());
  if (!reattachedSessions.sessions.some((session) => session.name === "agent" && session.status === "active")) {
    throw new Error(`Expected plan-scoped agent to reattach, got ${JSON.stringify(reattachedSessions)}`);
  }

  const secondOutput = await runCli(["launch", "--port", String(port)], {
    cwd: secondRoot,
    env: {
      ...process.env,
      HYPERWIKI_HOME: home,
      HYPERWIKI_OPEN_DRY_RUN: "1"
    }
  });
  const secondWorkspaceUrl = secondOutput.match(/hyperwiki workspace: (http:\/\/[^\s]+)/)?.[1];
  if (!secondWorkspaceUrl) {
    throw new Error(`Expected second workspace URL, got ${secondOutput}`);
  }
  if (!secondWorkspaceUrl.endsWith("/workspace/launch-smoke/plan-unit-navigation")) {
    throw new Error(`Expected pretty worktree workspace URL, got ${secondWorkspaceUrl}`);
  }
  await page.goto(secondWorkspaceUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#repo-branch")?.textContent === "plan-unit-navigation");
  await page.locator("#project-toggle").evaluate((element) => {
    if (element.hidden) throw new Error("Expected project switcher to expose registered worktrees.");
  });
  const groupedProjects = await fetch(`http://127.0.0.1:${port}/api/projects?projectSlug=launch-smoke&worktreeSlug=plan-unit-navigation`).then((response) => response.json());
  if (groupedProjects.projects.length !== 1 || groupedProjects.projects[0].name !== "launch-smoke") {
    throw new Error(`Expected same-project worktrees to collapse to one project row, got ${JSON.stringify(groupedProjects)}`);
  }
  if (groupedProjects.activeProjectId !== groupedProjects.projects[0].id || groupedProjects.projects[0].worktreeSlug !== "plan-unit-navigation") {
    throw new Error(`Expected active grouped project to preserve worktree runtime context, got ${JSON.stringify(groupedProjects)}`);
  }
  await page.goto(workspaceUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#repo-branch")?.textContent === "main");

  const registryBeforePrune = JSON.parse(await readFile(path.join(home, "projects.json"), "utf8"));
  const worktreeProject = registryBeforePrune.projects.find((project) => project.worktreeSlug === "plan-unit-navigation");
  if (!worktreeProject) {
    throw new Error(`Expected worktree project before prune, got ${JSON.stringify(registryBeforePrune)}`);
  }
  await rm(secondRoot, { recursive: true, force: true });
  const prunedProjects = await fetch(`http://127.0.0.1:${port}/api/projects?project=${encodeURIComponent(worktreeProject.id)}`).then((response) => response.json());
  if (prunedProjects.projects.some((project) => project.worktreeSlug === "plan-unit-navigation")) {
    throw new Error(`Expected missing worktree to be pruned, got ${JSON.stringify(prunedProjects)}`);
  }
  if (prunedProjects.activeProjectId !== prunedProjects.projects.find((project) => project.available)?.id) {
    throw new Error(`Expected pruned active project to fall back to an available project, got ${JSON.stringify(prunedProjects)}`);
  }
  const registryAfterPrune = JSON.parse(await readFile(path.join(home, "projects.json"), "utf8"));
  if (registryAfterPrune.projects.some((project) => project.worktreeSlug === "plan-unit-navigation")) {
    throw new Error(`Expected missing worktree to be removed from registry, got ${JSON.stringify(registryAfterPrune)}`);
  }

  registryAfterPrune.projects.push({
    id: "missing-main-project",
    root: path.join(workspaceRoot, "missing-main"),
    name: "Missing Main",
    projectSlug: "missing-main",
    worktreeSlug: "main",
    available: true,
    lastOpenedAt: new Date().toISOString()
  });
  await writeFile(path.join(home, "projects.json"), `${JSON.stringify(registryAfterPrune, null, 2)}\n`);
  const withMissingMain = await fetch(`http://127.0.0.1:${port}/api/projects`).then((response) => response.json());
  const missingMainProject = withMissingMain.projects.find((project) => project.id === "missing-main-project");
  if (!missingMainProject || missingMainProject.available) {
    throw new Error(`Expected missing main project to remain unavailable, got ${JSON.stringify(withMissingMain)}`);
  }
  if (withMissingMain.projects.some((project) => project.name.includes(" · "))) {
    throw new Error(`Expected Projects labels to omit worktree suffixes, got ${JSON.stringify(withMissingMain)}`);
  }
} finally {
  if (browser) {
    await browser.close();
  }
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await rm(root, { recursive: true, force: true });
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
}

console.log("one-command launch smoke test passed");

async function waitForText(read, text) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (read().includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${text}. Output: ${read()}`);
}

function runCli(args, options) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [path.resolve("src/cli.js"), ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    let output = "";
    childProcess.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    childProcess.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    childProcess.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output));
      }
    });
  });
}
