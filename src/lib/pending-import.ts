import { slugify } from "@/lib/utils";
import type { ProjectRecord } from "@/lib/types";

export function pendingImportedProject(title: string): ProjectRecord {
  const slug = slugify(title);
  return {
    id: `pending-${slug}`,
    name: title,
    root: "",
    projectSlug: slug,
    worktreeSlug: "main",
    available: true,
  };
}

export const pendingImportStorageKey = "hyperwiki.pendingImportProject";

export function readPendingImportProject() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(pendingImportStorageKey) || "null") as ProjectRecord | null;
    if (!parsed?.projectSlug || !parsed?.worktreeSlug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingImportProject(project: ProjectRecord) {
  try {
    window.sessionStorage.setItem(pendingImportStorageKey, JSON.stringify(project));
  } catch {
    // Session storage is best-effort; route fallback still works without it.
  }
}

export function clearPendingImportProject() {
  try {
    window.sessionStorage.removeItem(pendingImportStorageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}
