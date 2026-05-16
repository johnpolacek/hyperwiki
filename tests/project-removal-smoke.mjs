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
  const staleCard = await createProject(serverInfo.url, "Stale Card Project");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${serverInfo.url}/projects`, { waitUntil: "networkidle" });
  await expectSidebarHidden(page);
  await expectManagementShellFullWidth(page, "#projects-page");
  await page.getByRole("button", { name: "Open project" }).click();
  await page.waitForURL(/\/workspace\/project-removal-root\/main#\/projects\/[^/]+\/wiki\/index\.html$/);
  await expectSidebarVisible(page);
  await page.getByRole("button", { name: "Projects" }).click();
  await page.locator("#project-panel").waitFor();
  await page.getByRole("button", { name: "Registry Only Project" }).click();
  await page.waitForURL(/\/workspace\/registry-only-project\/main#\/wiki\/index\.html$/);
  await page.locator("#project-panel").evaluate((panel) => {
    if (!panel.hidden) throw new Error("Expected project dropdown to close after selecting a project.");
  });
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

  const staleRemoval = await json(`${serverInfo.url}/api/projects/stale-card-id`, {
    method: "DELETE",
    body: JSON.stringify({ deleteFiles: true, root: staleCard.project.root })
  });
  if (staleRemoval.project.id !== staleCard.project.id || staleRemoval.deletedFiles !== true) {
    throw new Error(`Expected stale-id removal to match by root, got ${JSON.stringify(staleRemoval)}`);
  }
  if (existsSync(staleCard.project.root)) {
    throw new Error("Expected stale-id delete-files removal to delete the project directory.");
  }
  await expectProjectMissing(serverInfo.url, staleCard.project.id);

  await page.goto(`${serverInfo.url}/settings`, { waitUntil: "networkidle" });
  await expectSidebarHidden(page);
  await expectManagementShellFullWidth(page, "#settings-page");
  await page.goto(`${serverInfo.url}/projects/new`, { waitUntil: "networkidle" });
  await expectSidebarHidden(page);
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
  if (await card.getByRole("button", { name: `Remove ${title}` }).count() !== 0) {
    throw new Error("Expected trash remove button to be hidden while confirming removal.");
  }
  const deleteFiles = card.getByRole("checkbox", { name: /delete project files/i });
  if (await deleteFiles.isChecked()) {
    throw new Error("Expected delete-files checkbox to default to unchecked.");
  }
  await card.getByRole("button", { name: "Cancel" }).waitFor();
  await card.getByRole("button", { name: "Confirm Remove" }).waitFor();
  if (options.deleteFiles) {
    await deleteFiles.check();
    await card.getByRole("button", { name: "Confirm Delete" }).waitFor();
  }
  await card.getByRole("button", { name: options.deleteFiles ? "Confirm Delete" : "Confirm Remove" }).click();
  await card.getByText(options.deleteFiles ? "Deleting project files..." : "Removing project...").waitFor();
  if (await deleteFiles.isEnabled()) {
    throw new Error("Expected delete-files checkbox to be disabled while removal is in progress.");
  }
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

async function expectManagementShellFullWidth(page, pageSelector) {
  await page.locator(pageSelector).evaluate((pageElement) => {
    const topbar = document.querySelector(".topbar");
    const viewportWidth = window.innerWidth;
    const topbarRect = topbar.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    if (Math.abs(topbarRect.left) > 1 || Math.abs(topbarRect.width - viewportWidth) > 2) {
      throw new Error(`Expected topbar to span viewport, got left ${topbarRect.left} width ${topbarRect.width} viewport ${viewportWidth}.`);
    }
    if (Math.abs(pageRect.left) > 1 || Math.abs(pageRect.width - viewportWidth) > 2) {
      throw new Error(`Expected management page to span viewport, got left ${pageRect.left} width ${pageRect.width} viewport ${viewportWidth}.`);
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
