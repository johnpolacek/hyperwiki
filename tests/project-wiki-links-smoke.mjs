import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-project-links-root-"));
const home = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-project-links-home-"));
const projectsDir = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-project-links-projects-"));
const previousHome = process.env.HYPERWIKI_HOME;
const previousProjectsDir = process.env.HYPERWIKI_PROJECTS_DIR;
let browser = null;
let server = null;

process.env.HYPERWIKI_HOME = home;
process.env.HYPERWIKI_PROJECTS_DIR = projectsDir;

try {
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "project-links-root" }, null, 2)}\n`);
  await inithyperwiki(root, {
    yes: true,
    project_name: "Project Links Root",
    summary: "Root project for project-scoped wiki link smoke coverage."
  });

  const serverInfo = await startDevServer(root, { host: "127.0.0.1", port: 0 });
  server = serverInfo.server;

  const created = await json(`${serverInfo.url}/api/projects/create`, {
    method: "POST",
    body: JSON.stringify({
      title: "MarkdownStack",
      summary: "A place for people to discover and share Markdown patterns for agentic coding."
    })
  });
  const projectId = created.project.id;
  const createdGitRoot = await git(created.project.root, ["rev-parse", "--show-toplevel"]);
  const createdGitLog = await git(created.project.root, ["log", "--oneline", "-1"]);
  if (!createdGitRoot.ok || await realpath(createdGitRoot.stdout) !== await realpath(created.project.root)) {
    throw new Error(`Expected created project to initialize Git, got ${JSON.stringify(createdGitRoot)}`);
  }
  if (!createdGitLog.stdout.includes("Initialize Hyperwiki project")) {
    throw new Error(`Expected created project initial commit, got ${createdGitLog.stdout}`);
  }
  const stagePath = `/projects/${projectId}/wiki/plans/mvp/stage-01-foundation.html`;
  const unitPath = `/projects/${projectId}/wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html`;

  const stageHtml = await text(`${serverInfo.url}${stagePath}`);
  if (!stageHtml.includes(`href="${unitPath}"`)) {
    throw new Error("Expected project-scoped stage page to rewrite Unit 01 href.");
  }
  if (stageHtml.includes('href="/wiki/')) {
    throw new Error("Expected project-scoped stage page to avoid root /wiki hrefs.");
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${serverInfo.url}${created.workspaceUrl}#${stagePath}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Stage 01 - Project Direction And Setup");
  await page.frameLocator("#wiki-frame").getByRole("link", { name: "Unit 01 - Confirm Project Direction" }).click();
  await page.waitForURL(new RegExp(`#${unitPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await page.waitForFunction((expected) => {
    const frame = document.querySelector("#wiki-frame");
    return document.querySelector("#current-page")?.dataset.title === "Unit 01 - Confirm Project Direction"
      && frame?.contentWindow?.location.pathname === expected;
  }, unitPath);
} finally {
  if (browser) {
    await browser.close();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (previousHome === undefined) {
    delete process.env.HYPERWIKI_HOME;
  } else {
    process.env.HYPERWIKI_HOME = previousHome;
  }
  if (previousProjectsDir === undefined) {
    delete process.env.HYPERWIKI_PROJECTS_DIR;
  } else {
    process.env.HYPERWIKI_PROJECTS_DIR = previousProjectsDir;
  }
  await rm(root, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
  await rm(projectsDir, { recursive: true, force: true });
}

console.log("project-scoped wiki links smoke test passed");

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim()
      });
    });
  });
}

async function text(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.text();
}
