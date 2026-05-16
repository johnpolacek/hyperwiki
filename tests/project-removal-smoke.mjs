import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-project-removal-root-"));
const home = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-project-removal-home-"));
const projectsDir = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-project-removal-projects-"));
const previousHome = process.env.HYPERWIKI_HOME;
const previousProjectsDir = process.env.HYPERWIKI_PROJECTS_DIR;
let browser = null;
let server = null;

process.env.HYPERWIKI_HOME = home;
process.env.HYPERWIKI_PROJECTS_DIR = projectsDir;

try {
  await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: "project-removal-root" }, null, 2)}\n`);
  await inithyperwiki(root, {
    yes: true,
    project_name: "Project Removal Root",
    summary: "Root project for project removal smoke coverage."
  });

  const serverInfo = await startDevServer(root, { host: "127.0.0.1", port: 0 });
  server = serverInfo.server;

  const registryOnly = await createProject(serverInfo.url, "Registry Only Project");
  const deleteFiles = await createProject(serverInfo.url, "Delete Files Project");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${serverInfo.url}/projects`, { waitUntil: "networkidle" });
  await expectSidebarHidden(page);
  await page.getByRole("button", { name: "Open project" }).click();
  await page.waitForURL(/\/workspace\/project-removal-root\/main#\/projects\/[^/]+\/wiki\/index\.html$/);
  await expectSidebarVisible(page);
  await page.goto(`${serverInfo.url}/projects`, { waitUntil: "networkidle" });
  await expectSidebarHidden(page);

  await removeProjectCard(page, "Registry Only Project", { deleteFiles: false });
  if (!existsSync(registryOnly.project.root)) {
    throw new Error("Expected registry-only removal to leave project files on disk.");
  }
  await expectProjectMissing(serverInfo.url, registryOnly.project.id);

  await removeProjectCard(page, "Delete Files Project", { deleteFiles: true });
  if (existsSync(deleteFiles.project.root)) {
    throw new Error("Expected checked delete-files removal to delete the project directory.");
  }
  await expectProjectMissing(serverInfo.url, deleteFiles.project.id);

  await page.goto(`${serverInfo.url}/settings`, { waitUntil: "networkidle" });
  await expectSidebarHidden(page);
  await page.goto(`${serverInfo.url}/projects/new`, { waitUntil: "networkidle" });
  await expectSidebarVisible(page);
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

console.log("project removal smoke test passed");

async function createProject(origin, title) {
  return json(`${origin}/api/projects/create`, {
    method: "POST",
    body: JSON.stringify({
      title,
      summary: `${title} smoke fixture.`
    })
  });
}

async function removeProjectCard(page, title, options) {
  const card = page.locator(".project-card").filter({ hasText: title });
  await card.getByRole("button", { name: `Remove ${title}` }).click();
  await card.locator(".project-remove-warning").waitFor();
  const deleteFiles = card.getByRole("checkbox", { name: /delete project files/i });
  if (await deleteFiles.isChecked()) {
    throw new Error("Expected delete-files checkbox to default to unchecked.");
  }
  if (options.deleteFiles) {
    await deleteFiles.check();
  }
  await card.getByRole("button", { name: `Confirm removing ${title}` }).click();
  await page.waitForFunction((projectTitle) =>
    ![...document.querySelectorAll(".project-card")].some((card) => card.textContent.includes(projectTitle)),
  title);
}

async function expectProjectMissing(origin, projectId) {
  const projects = await json(`${origin}/api/projects`);
  if (projects.projects.some((project) => project.id === projectId)) {
    throw new Error(`Expected removed project ${projectId} to be absent from registry.`);
  }
}

async function expectSidebarHidden(page) {
  await page.locator(".sidebar").evaluate((sidebar) => {
    if (getComputedStyle(sidebar).display !== "none") {
      throw new Error("Expected management pages to hide the wiki sidebar.");
    }
  });
}

async function expectSidebarVisible(page) {
  await page.locator(".sidebar").evaluate((sidebar) => {
    if (getComputedStyle(sidebar).display === "none") {
      throw new Error("Expected project pages to keep the wiki sidebar visible.");
    }
  });
}

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
