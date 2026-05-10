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
      available: true,
      lastOpenedAt: now
    };
    registry.projects = [record, ...registry.projects.filter((item) => item.id !== record.id)];
    await this.#write(registry);
    return record;
  }

  async list(activeId = null) {
    const registry = await this.#read();
    const projects = [];
    for (const item of registry.projects) {
      const project = await projectFromRoot(item.root);
      projects.push({
        ...item,
        name: project.name || item.name,
        available: project.available,
        active: item.id === activeId
      });
    }
    return { projects, activeProjectId: activeId };
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
