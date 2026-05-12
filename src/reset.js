import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { ProjectRegistry, projectFromRoot } from "./projects.js";

export async function resethyperwiki(root, options = {}) {
  const dryRun = Boolean(options.dry_run || options.dryRun);
  const registry = new ProjectRegistry();
  const registryData = await registry.readRaw();
  const targets = await resetTargets(root, registryData.projects);
  const actions = [
    { type: "file", path: registry.filePath },
    ...targets.flatMap((target) => [
      { type: "dir-contents", path: path.join(target.root, ".hyperwiki", "state") },
      { type: "dir-contents", path: path.join(target.root, ".hyperwiki", "sessions") }
    ])
  ];

  for (const action of actions) {
    console.log(`${dryRun ? "Would reset" : "Reset"} ${action.path}`);
    if (dryRun) continue;
    if (action.type === "file") {
      await rm(action.path, { force: true });
    } else {
      await removeDirectoryContents(action.path);
    }
  }

  console.log(dryRun ? "hyperwiki reset dry run complete." : "hyperwiki local state reset complete.");
}

async function resetTargets(root, registeredProjects) {
  const byRoot = new Map();
  for (const item of registeredProjects || []) {
    const project = await projectFromRoot(item.root);
    if (project.available) {
      byRoot.set(project.root, project);
    }
  }

  const currentProject = await projectFromRoot(root);
  if (currentProject.available) {
    byRoot.set(currentProject.root, currentProject);
  }

  return [...byRoot.values()].sort((a, b) => a.root.localeCompare(b.root));
}

async function removeDirectoryContents(directory) {
  if (!existsSync(directory)) {
    return;
  }
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map((entry) => rm(path.join(directory, entry.name), { recursive: true, force: true })));
}
