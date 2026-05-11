import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  await runCli(["init", "--yes"], { cwd: root, env: { ...process.env, HYPERWIKI_HOME: home } });
  await runCli(["init", "--yes"], { cwd: secondRoot, env: { ...process.env, HYPERWIKI_HOME: home } });
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

  await waitForText(() => output, "HyperWiki workspace:");
  const workspaceMatch = output.match(/HyperWiki workspace: (http:\/\/[^\s]+)/);
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
    throw new Error(`Expected HyperWiki health response, got ${JSON.stringify(health)}`);
  }

  const projects = await fetch(`http://127.0.0.1:${port}/api/projects`).then((response) => response.json());
  if (projects.projects.length !== 1 || projects.projects[0].name !== "launch-smoke") {
    throw new Error(`Expected registered launch-smoke project, got ${JSON.stringify(projects)}`);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(workspaceUrl, { waitUntil: "networkidle" });
  await page.locator(".terminal-tab[data-name=\"cli\"]").waitFor();
  const singleProjectToggle = await page.locator("#project-toggle").evaluate((element) => element.hidden);
  if (!singleProjectToggle) {
    throw new Error("Expected project topbar action to stay hidden for a single registered project.");
  }

  const sessions = await fetch(`http://127.0.0.1:${port}/api/sessions`).then((response) => response.json());
  if (!sessions.sessions.some((session) => session.name === "cli" && session.status === "active")) {
    throw new Error(`Expected launch to prepare cli wterm session, got ${JSON.stringify(sessions)}`);
  }

  const secondOutput = await runCli(["launch", "--port", String(port)], {
    cwd: secondRoot,
    env: {
      ...process.env,
      HYPERWIKI_HOME: home,
      HYPERWIKI_OPEN_DRY_RUN: "1"
    }
  });
  const secondWorkspaceUrl = secondOutput.match(/HyperWiki workspace: (http:\/\/[^\s]+)/)?.[1];
  if (!secondWorkspaceUrl) {
    throw new Error(`Expected second workspace URL, got ${secondOutput}`);
  }
  if (!secondWorkspaceUrl.endsWith("/workspace/launch-smoke/plan-unit-navigation")) {
    throw new Error(`Expected pretty worktree workspace URL, got ${secondWorkspaceUrl}`);
  }
  await page.goto(secondWorkspaceUrl, { waitUntil: "networkidle" });
  await page.locator("#project-toggle").evaluate((element) => {
    if (element.hidden) throw new Error("Expected project topbar action after registering two projects.");
  });
  await page.locator("#project-toggle").click();
  await page.locator("#project-panel").evaluate((element) => {
    if (element.hidden) throw new Error("Expected project panel to open.");
  });
  await page.locator("#settings-button").click();
  await page.locator("#settings-panel").evaluate((element) => {
    if (element.hidden) throw new Error("Expected settings panel to open.");
  });
  await page.locator("#project-panel").evaluate((element) => {
    if (!element.hidden) throw new Error("Expected settings panel to close project panel.");
  });
  await page.locator("#settings-button").click();
  await page.locator("#project-toggle").click();
  await page.locator("#project-list button[data-worktree-slug=\"main\"]").click();
  await page.locator("#project-list button.active[data-worktree-slug=\"main\"]").waitFor();
  if (!page.url().includes("/workspace/launch-smoke/main")) {
    throw new Error(`Expected switch to update pretty workspace URL, got ${page.url()}`);
  }
  await page.locator("#repo-branch").filter({ hasText: /.+/ }).waitFor();
  await page.goto(secondWorkspaceUrl, { waitUntil: "networkidle" });
  await page.locator("#project-toggle").click();
  await page.locator("#project-list button.active[data-worktree-slug=\"plan-unit-navigation\"]").waitFor();
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
