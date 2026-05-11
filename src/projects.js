import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export class ProjectRegistry {
  constructor(options = {}) {
    this.home = options.home || process.env.HYPERWIKI_HOME || path.join(os.homedir(), ".hyperwiki");
    this.filePath = path.join(this.home, "projects.json");
  }

  async register(root) {
    const project = await projectFromRoot(root);
    if (!project.available) {
      throw new Error("HyperWiki project not found. Run `npx hyperwiki init` in this repo first.");
    }
    const registry = await this.#read();
    const existing = registry.projects.find((item) => samePath(item.root, project.root));
    const now = new Date().toISOString();
    const record = {
      id: existing?.id || randomUUID(),
      root: project.root,
      name: project.name,
      projectSlug: existing?.projectSlug || slugify(project.name),
      worktreeSlug: await worktreeSlug(project.root),
      available: true,
      lastOpenedAt: now
    };
    registry.projects = withUniqueSlugs([record, ...registry.projects.filter((item) => item.id !== record.id)]);
    await this.#write(registry);
    return record;
  }

  async list(activeId = null) {
    const registry = await this.#read();
    const records = withUniqueSlugs(registry.projects);
    const projectsToList = records.filter((item) => !missingWorktree(item));
    if (projectsToList.length !== records.length) {
      await this.#write({ version: 1, projects: projectsToList });
    }
    const projects = [];
    for (const item of projectsToList) {
      const project = await projectFromRoot(item.root);
      const record = {
        ...item,
        name: project.available ? project.name : item.name || project.name,
        projectSlug: item.projectSlug || slugify(project.name || item.name),
        worktreeSlug: item.worktreeSlug || await worktreeSlug(item.root),
        available: project.available
      };
      projects.push({
        ...record,
        active: record.id === activeId
      });
    }
    const activeProject = projects.find((project) => project.id === activeId && project.available)
      || projects.find((project) => project.available)
      || projects[0]
      || null;
    return {
      projects: projects.map((project) => ({
        ...project,
        active: project.id === activeProject?.id
      })),
      activeProjectId: activeProject?.id || null
    };
  }

  async latestAgentLaunchCommand() {
    const registry = await this.#read();
    const projects = [...registry.projects].sort((a, b) => String(b.lastOpenedAt || "").localeCompare(String(a.lastOpenedAt || "")));
    for (const item of projects) {
      const command = await agentLaunchCommandForRoot(item.root);
      if (command) return command;
    }
    return null;
  }

  async resolve(id, fallbackRoot = null) {
    const registry = await this.#read();
    const fallback = fallbackRoot ? registry.projects.find((item) => samePath(item.root, fallbackRoot)) : null;
    const record = id
      ? registry.projects.find((item) => item.id === id)
      : fallback || registry.projects[0];
    if (!record) {
      throw new Error("No HyperWiki projects are registered.");
    }
    const project = await projectFromRoot(record.root);
    if (!project.available) {
      const error = new Error("Project is unavailable.");
      error.statusCode = 404;
      throw error;
    }
    return { ...record, name: project.name, available: true };
  }

  async resolveBySlug(projectSlug, worktreeSlug = null, fallbackRoot = null) {
    const registry = await this.#read();
    const projects = withUniqueSlugs(registry.projects);
    const candidates = projects.filter((item) => item.projectSlug === projectSlug);
    const record = worktreeSlug
      ? candidates.find((item) => item.worktreeSlug === worktreeSlug)
      : candidates[0];
    if (!record) {
      const error = new Error("Project is unavailable.");
      error.statusCode = 404;
      throw error;
    }
    return this.resolve(record.id, fallbackRoot);
  }

  async readRaw() {
    return this.#read();
  }

  async #read() {
    if (!existsSync(this.filePath)) {
      return { version: 1, projects: [] };
    }
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      return { version: 1, projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
    } catch {
      return { version: 1, projects: [] };
    }
  }

  async #write(registry) {
    await mkdir(this.home, { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }
}

export async function agentLaunchCommandForRoot(root) {
  const configPath = path.join(path.resolve(root), ".hyperwiki", "config.json");
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    return config.agent?.launchCommand ? String(config.agent.launchCommand) : null;
  } catch {
    return null;
  }
}

export async function projectFromRoot(root) {
  const resolved = path.resolve(root);
  const configPath = path.join(resolved, ".hyperwiki", "config.json");
  const wikiPath = path.join(resolved, "wiki");
  const available = existsSync(configPath) && existsSync(wikiPath);
  return {
    root: resolved,
    available,
    name: available ? await projectName(resolved, configPath) : path.basename(resolved)
  };
}

async function projectName(root, configPath) {
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (config.projectName) return String(config.projectName);
  } catch {
    // Fall through.
  }
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (pkg.name) return String(pkg.name);
  } catch {
    // Fall through.
  }
  return path.basename(root);
}

function samePath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

function missingWorktree(project) {
  return project.worktreeSlug && project.worktreeSlug !== "main" && !existsSync(path.resolve(project.root));
}

function withUniqueSlugs(projects) {
  const pairs = new Map();
  return projects.map((item) => {
    const projectSlug = item.projectSlug || slugify(item.name || path.basename(item.root));
    const worktreeBase = item.worktreeSlug || slugify(path.basename(item.root)) || "main";
    const pair = `${projectSlug}/${worktreeBase}`;
    const count = (pairs.get(pair) || 0) + 1;
    pairs.set(pair, count);
    return {
      ...item,
      projectSlug,
      worktreeSlug: count === 1 ? worktreeBase : `${worktreeBase}-${count}`
    };
  });
}

async function worktreeSlug(root) {
  const gitPath = path.join(path.resolve(root), ".git");
  if (!existsSync(gitPath)) {
    return "main";
  }
  try {
    const marker = await readFile(gitPath, "utf8");
    if (marker.startsWith("gitdir:")) {
      return slugify(path.basename(root));
    }
  } catch {
    // A directory .git marks the primary checkout.
  }
  return "main";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}
