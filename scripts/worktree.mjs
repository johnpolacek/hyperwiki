#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = await gitTopLevel(process.cwd());
const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const projectName = packageJson.portless?.name || packageJson.name || path.basename(repoRoot);
const command = process.argv[2] || "help";
const args = process.argv.slice(3);

try {
  if (command === "doctor") {
    await doctor();
  } else if (command === "create") {
    await createWorktree(requiredArg("branch"));
  } else if (command === "list") {
    await listWorktrees();
  } else if (command === "resume") {
    await resumeWorktree(requiredArg("branch"));
  } else if (command === "open") {
    await openWorktree(requiredArg("branch"));
  } else if (command === "finish") {
    await finishWorktree(requiredArg("branch"));
  } else if (command === "prune") {
    await pruneWorktrees();
  } else {
    help();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function requiredArg(name) {
  const value = args[0];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

async function doctor() {
  const status = await git(["status", "--short", "--branch"], repoRoot);
  const portlessVersion = await run("pnpm", ["exec", "portless", "--version"], { cwd: repoRoot, ok: false });
  const routes = await run("pnpm", ["exec", "portless", "list"], { cwd: repoRoot, ok: false });
  const worktrees = await parseWorktrees();
  const ignoredState = await git(["check-ignore", ".hyperwiki/state", ".hyperwiki/sessions"], repoRoot, { ok: false });
  const integration = await defaultBranch();

  console.log("hyperwiki worktree doctor");
  console.log("");
  console.log(`Integration: ${integration}`);
  console.log(`Main URL: ${mainUrl()}`);
  console.log(`Worktree root: ${worktreeBaseDir()}`);
  console.log(`Portless: ${portlessVersion.ok ? portlessVersion.stdout : "unavailable"}`);
  console.log(`State isolation: ${ignoredState.ok ? ".hyperwiki/state and .hyperwiki/sessions are ignored" : "check .gitignore for .hyperwiki runtime state"}`);
  console.log("Backend isolation: no database, Docker, cache, queue, or env-backed mutable service config detected.");
  console.log("");
  console.log(status.stdout || "Working tree clean.");
  console.log("");
  printWorktrees(worktrees, integration);
  if (routes.stdout) {
    console.log("");
    console.log(routes.stdout.trim());
  }
}

async function createWorktree(branch) {
  const slug = branchSlug(branch);
  const target = path.join(worktreeBaseDir(), slug);
  if (existsSync(target)) {
    throw new Error(`Worktree path already exists: ${target}`);
  }
  await mkdir(path.dirname(target), { recursive: true });

  const integration = await defaultBranch();
  const originRef = `origin/${integration}`;
  const fetch = await git(["fetch", "origin", "--prune"], repoRoot, { ok: false });
  const baseRef = fetch.ok ? originRef : integration;

  await git(["worktree", "add", target, "-b", branch, baseRef], repoRoot);
  await inherited("pnpm", ["install"], target);

  console.log(`Branch: ${branch}`);
  console.log(`Path: ${target}`);
  console.log(`URL: ${worktreeUrl(slug)}`);
  console.log(`Start: pnpm dev`);
  console.log(`Doctor: pnpm wt:doctor`);
  console.log(`Resume: pnpm wt:resume ${branch}`);
  console.log(`Finish: pnpm wt:finish ${branch}`);
  console.log(`Plan: wiki/plans/${slug}.html`);
  console.log("State: .hyperwiki runtime state is worktree-local and ignored; no shared backend config was detected.");
}

async function listWorktrees() {
  printWorktrees(await parseWorktrees(), await defaultBranch());
}

async function resumeWorktree(branch) {
  const record = await findWorktree(branch);
  const integration = await defaultBranch();
  const slug = branchSlug(record.branch);
  const status = await git(["status", "--short", "--branch"], record.path);
  const log = await git(["log", "--oneline", "--decorate", "-5"], record.path, { ok: false });
  const plan = planPath(record.path, slug);

  console.log(`Branch: ${record.branch}`);
  console.log(`Path: ${record.path}`);
  console.log(`URL: ${urlForBranch(record.branch, integration)}`);
  console.log(`Start: pnpm dev`);
  console.log(`Doctor: pnpm wt:doctor`);
  console.log(`Finish: ${isIntegrationBranch(record.branch, integration) ? "not applicable for integration checkout" : `pnpm wt:finish ${record.branch}`}`);
  console.log(`Plan: ${existsSync(plan) ? `wiki/plans/${slug}.html` : "missing"}`);
  console.log("State: .hyperwiki runtime state is worktree-local and ignored; no shared backend config was detected.");
  console.log("");
  console.log(status.stdout || "Working tree clean.");
  if (log.stdout) {
    console.log("");
    console.log(log.stdout);
  }
}

async function openWorktree(branch) {
  const record = await findWorktree(branch);
  const slug = branchSlug(record.branch);
  const url = isIntegrationBranch(record.branch, await defaultBranch()) ? mainUrl() : worktreeUrl(slug);
  const routes = await run("pnpm", ["exec", "portless", "list"], { cwd: repoRoot, ok: false });

  if (!routes.stdout.includes(new URL(url).hostname)) {
    console.log(`Portless route is not active for ${url}.`);
    console.log(`Start it with: cd ${record.path} && pnpm dev`);
    return;
  }

  await openUrl(url);
  console.log(`Opened: ${url}`);
}

async function finishWorktree(branch) {
  const integration = await defaultBranch();
  const integrationRecord = (await parseWorktrees()).find((record) => isIntegrationBranch(record.branch, integration));
  if (!integrationRecord) {
    throw new Error(`Could not find integration worktree for ${integration}.`);
  }
  const featureRecord = await findWorktree(branch);
  if (isIntegrationBranch(featureRecord.branch, integration)) {
    throw new Error("Refusing to finish the integration branch.");
  }

  await assertClean(featureRecord.path, `feature worktree ${featureRecord.branch}`);
  await assertClean(integrationRecord.path, `integration worktree ${integration}`);
  await git(["pull", "--ff-only"], integrationRecord.path);
  await assertNoDirtyOverlap(featureRecord, integrationRecord);

  await completePlanIfPresent(featureRecord);
  await assertClean(featureRecord.path, `feature worktree ${featureRecord.branch}`);

  await git(["merge", "--no-ff", featureRecord.branch], integrationRecord.path);
  await git(["worktree", "remove", featureRecord.path], repoRoot);
  await git(["branch", "-d", featureRecord.branch], repoRoot);
  await git(["worktree", "prune"], repoRoot);

  console.log(`Merged ${featureRecord.branch} into ${integration}.`);
  console.log(`Removed worktree: ${featureRecord.path}`);
}

async function pruneWorktrees() {
  await git(["worktree", "prune"], repoRoot);
  const portless = await run("pnpm", ["exec", "portless", "prune"], { cwd: repoRoot, ok: false });
  if (portless.stdout) {
    console.log(portless.stdout.trim());
  }
  console.log("Pruned stale Git worktree metadata and Portless orphaned dev servers where supported.");
}

async function completePlanIfPresent(record) {
  const slug = branchSlug(record.branch);
  const active = planPath(record.path, slug);
  if (!existsSync(active)) return;

  const completedDir = path.join(record.path, "wiki", "plans", "zzz_completed", "worktrees");
  const completed = path.join(completedDir, `${slug}.html`);
  await mkdir(completedDir, { recursive: true });
  let content = await readFile(active, "utf8");
  content = content.replace("Status: active", "Status: completed");
  content = content.replace("</main>", `<section>
      <h2>Finish</h2>
      <ul>
        <li>Finish date: ${new Date().toISOString().slice(0, 10)}</li>
        <li>Branch: <code>${escapeHtml(record.branch)}</code></li>
        <li>Finish policy: merge</li>
      </ul>
    </section>
  </main>`);
  await writeFile(active, content, "utf8");
  await rename(active, completed);
  await git(["add", "-A", "wiki/plans"], record.path);
  await git(["commit", "-m", `Complete ${slug} worktree plan`], record.path);
}

async function assertNoDirtyOverlap(featureRecord, integrationRecord) {
  const changed = await git(["diff", "--name-only", `${integrationRecord.branch}...${featureRecord.branch}`], integrationRecord.path);
  const featureFiles = new Set(changed.stdout.split("\n").filter(Boolean));
  if (featureFiles.size === 0) return;

  const overlaps = [];
  for (const record of await parseWorktrees()) {
    if (record.path === featureRecord.path || record.path === integrationRecord.path) continue;
    const dirty = await git(["diff", "--name-only"], record.path, { ok: false });
    const staged = await git(["diff", "--name-only", "--cached"], record.path, { ok: false });
    for (const file of `${dirty.stdout}\n${staged.stdout}`.split("\n").filter(Boolean)) {
      if (featureFiles.has(file)) overlaps.push(`${record.branch}: ${file}`);
    }
  }
  if (overlaps.length > 0) {
    throw new Error(`Overlapping dirty files in other worktrees:\n${overlaps.join("\n")}`);
  }
}

async function assertClean(cwd, label) {
  const status = await git(["status", "--short"], cwd);
  if (status.stdout.trim()) {
    throw new Error(`Refusing to continue because ${label} is dirty:\n${status.stdout}`);
  }
}

async function findWorktree(branchOrSlug) {
  const slug = branchSlug(branchOrSlug);
  const worktrees = await parseWorktrees();
  const record = worktrees.find((item) => item.branch === branchOrSlug || branchSlug(item.branch) === slug || path.basename(item.path) === slug);
  if (!record) {
    throw new Error(`No worktree found for ${branchOrSlug}. Run pnpm wt:list.`);
  }
  return record;
}

async function parseWorktrees() {
  const result = await git(["worktree", "list", "--porcelain"], repoRoot);
  const records = [];
  let current = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) records.push(current);
      current = { path: line.slice("worktree ".length), branch: "(detached)", head: "" };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  if (current) records.push(current);
  return records;
}

function printWorktrees(worktrees, integration) {
  for (const record of worktrees) {
    console.log(`${record.branch}`);
    console.log(`  Path: ${record.path}`);
    console.log(`  URL: ${urlForBranch(record.branch, integration)}`);
    console.log(`  Start: cd ${record.path} && pnpm dev`);
  }
}

async function defaultBranch() {
  const remoteHead = await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repoRoot, { ok: false });
  if (remoteHead.ok && remoteHead.stdout.includes("/")) {
    return remoteHead.stdout.split("/").slice(1).join("/");
  }
  const current = await git(["branch", "--show-current"], repoRoot, { ok: false });
  return current.stdout || "main";
}

function isIntegrationBranch(branch, integration) {
  return branch === integration;
}

function worktreeBaseDir() {
  return path.resolve(repoRoot, "..", `${path.basename(repoRoot)}.worktrees`);
}

function planPath(root, slug) {
  return path.join(root, "wiki", "plans", `${slug}.html`);
}

function mainUrl() {
  return `https://${slugify(projectName)}.localhost`;
}

function worktreeUrl(slug) {
  return `https://${slug}.${slugify(projectName)}.localhost`;
}

function urlForBranch(branch, integration) {
  return isIntegrationBranch(branch, integration) ? mainUrl() : worktreeUrl(branchSlug(branch));
}

function branchSlug(branch) {
  return slugify(branch.replace(/^refs\/heads\//, ""));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "worktree";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function gitTopLevel(cwd) {
  const result = await git(["rev-parse", "--show-toplevel"], cwd);
  return result.stdout;
}

async function git(args, cwd, options = {}) {
  return run("git", args, { cwd, ...options });
}

function run(commandName, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(commandName, commandArgs, { cwd: options.cwd }, (error, stdout, stderr) => {
      const result = { ok: !error, stdout: stdout.trim(), stderr: stderr.trim(), code: error?.code || 0 };
      if (error && options.ok !== false) {
        reject(new Error(stderr.trim() || stdout.trim() || `${commandName} ${commandArgs.join(" ")} failed`));
        return;
      }
      resolve(result);
    });
  });
}

function inherited(commandName, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, commandArgs, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${commandName} ${commandArgs.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function openUrl(url) {
  if (process.env.HYPERWIKI_OPEN_DRY_RUN === "1") return;
  if (process.platform === "darwin") {
    await run("open", [url], { cwd: repoRoot });
  } else if (process.platform === "win32") {
    await run("cmd", ["/c", "start", "", url], { cwd: repoRoot });
  } else {
    await run("xdg-open", [url], { cwd: repoRoot });
  }
}

function help() {
  console.log(`hyperwiki worktree commands

Usage:
  pnpm wt:doctor
  pnpm wt:create <branch>
  pnpm wt:list
  pnpm wt:resume <branch>
  pnpm wt:open <branch>
  pnpm wt:finish <branch>
  pnpm wt:prune
`);
}
