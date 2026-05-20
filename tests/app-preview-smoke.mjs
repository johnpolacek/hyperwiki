import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectRegistry } from "../src/projects.js";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const previousHome = process.env.HYPERWIKI_HOME;
const previousPath = process.env.PATH;
const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-preview-main-"));
const worktree = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-preview-feature-a-"));
const noDevRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-preview-no-dev-"));
const home = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-preview-home-"));
const bin = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-preview-bin-"));
const routeFile = path.join(bin, "routes.txt");
let server = null;

process.env.HYPERWIKI_HOME = home;
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

try {
  await writePackage(root);
  await writePackage(worktree);
  await writePackage(noDevRoot);
  await inithyperwiki(root, { yes: true, project_name: "Preview Smoke", skip_portless: true });
  await inithyperwiki(worktree, { yes: true, no_git: true, project_name: "Preview Smoke", skip_portless: true });
  await inithyperwiki(noDevRoot, { yes: true, no_git: true, project_name: "Preview Smoke No Dev", skip_portless: true });
  await removeDevCommand(noDevRoot);
  await writeFile(path.join(worktree, ".git"), "gitdir: /tmp/hyperwiki-preview-feature-a.git\n");
  await writeFakePnpm(bin, routeFile);
  const registry = new ProjectRegistry();
  await registry.register(root);
  const featureRecord = await registry.register(worktree);
  const noDevRecord = await registry.register(noDevRoot);
  const featureSlug = featureRecord.worktreeSlug;

  const serverInfo = await startDevServer(root, { host: "127.0.0.1", port: 0 });
  server = serverInfo.server;

  await writeFile(routeFile, "  https://preview-smoke.localhost:1355  ->  localhost:4010  (pid 111)\n");
  let previews = await json(`${serverInfo.url}/api/app-previews`);
  let main = previews.previews.find((preview) => preview.worktreeSlug === "main");
  let feature = previews.previews.find((preview) => preview.worktreeSlug === featureSlug);
  if (main?.status !== "running") {
    throw new Error(`Expected main to be running, got ${JSON.stringify(main)}`);
  }
  if (main.url !== "https://preview-smoke.localhost:1355" || main.expectedUrl !== "https://preview-smoke.localhost") {
    throw new Error(`Expected running preview to use actual Portless route URL and preserve expected URL, got ${JSON.stringify(main)}`);
  }
  if (feature?.status !== "stopped" || feature.running) {
    throw new Error(`Expected feature worktree to be stopped while main is running, got ${JSON.stringify(feature)}`);
  }

  await writeFile(routeFile, `  https://${featureSlug}.preview-smoke.localhost:1355  ->  localhost:4011  (pid 222)\n`);
  previews = await json(`${serverInfo.url}/api/app-previews`);
  main = previews.previews.find((preview) => preview.worktreeSlug === "main");
  feature = previews.previews.find((preview) => preview.worktreeSlug === featureSlug);
  if (main?.status !== "stopped" || main.running) {
    throw new Error(`Expected main to be stopped while feature route is running, got ${JSON.stringify(main)}`);
  }
  if (feature?.status !== "running") {
    throw new Error(`Expected feature worktree to be running, got ${JSON.stringify(feature)}`);
  }
  if (feature.url !== `https://${featureSlug}.preview-smoke.localhost:1355`
    || feature.expectedUrl !== `https://${featureSlug}.preview-smoke.localhost`) {
    throw new Error(`Expected feature preview to use actual Portless route URL and preserve expected URL, got ${JSON.stringify(feature)}`);
  }

  previews = await json(`${serverInfo.url}/api/app-previews`);
  const noDev = previews.previews.find((preview) => preview.projectName === "Preview Smoke No Dev");
  if (noDev?.status !== "stopped" || !noDev.canStart || noDev.running) {
    throw new Error(`Expected blank config command to fall back to package dev script, got ${JSON.stringify(noDev)}`);
  }
  if (noDev.url !== "https://preview-smoke-no-dev.localhost" || noDev.expectedUrl !== "https://preview-smoke-no-dev.localhost") {
    throw new Error(`Expected package-derived preview to preserve URL, got ${JSON.stringify(noDev)}`);
  }
  if (noDev.startCommand !== "pnpm run dev") {
    throw new Error(`Expected package manager aware dev command, got ${JSON.stringify(noDev)}`);
  }
  const noDevLayout = await json(`${serverInfo.url}/api/layout?project=${encodeURIComponent(noDevRecord.id)}`);
  const noDevPanel = noDevLayout.panels.find((panel) => panel.role === "dev");
  if (noDevLayout.dev.command !== "pnpm run dev" || noDevPanel?.command !== "pnpm run dev") {
    throw new Error(`Expected layout to derive dev command and panel from package.json, got ${JSON.stringify(noDevLayout)}`);
  }
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (previousHome === undefined) {
    delete process.env.HYPERWIKI_HOME;
  } else {
    process.env.HYPERWIKI_HOME = previousHome;
  }
  process.env.PATH = previousPath;
}

console.log("app preview smoke test passed");

async function writePackage(directory) {
  await writeFile(path.join(directory, "package.json"), `${JSON.stringify({
    name: "preview-smoke",
    scripts: { dev: "vite" },
    packageManager: "pnpm@10.33.3"
  }, null, 2)}\n`);
}

async function removeDevCommand(directory) {
  const configPath = path.join(directory, ".hyperwiki", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.dev.command = "";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function writeFakePnpm(directory, file) {
  const script = `#!/usr/bin/env node
if (process.argv[2] === "list") {
  const fs = require("node:fs");
  console.log("Active routes:\\n");
  process.stdout.write(fs.existsSync(${JSON.stringify(file)}) ? fs.readFileSync(${JSON.stringify(file)}, "utf8") : "");
  process.exit(0);
}
console.error("unexpected fake portless command", process.argv.slice(2).join(" "));
process.exit(1);
`;
  const target = path.join(directory, "portless");
  await writeFile(target, script);
  await chmod(target, 0o755);
}

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
