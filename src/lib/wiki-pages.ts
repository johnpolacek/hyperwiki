import { normalizePlanDisplayTitle } from "@/lib/wiki-title";
import { slugify } from "@/lib/utils";
import type { PlanPageActionState, WikiPage } from "@/lib/types";

export const defaultWikiPath = "/wiki/plans/index.mdx";

export interface SidebarModel {
  plans: WikiPage[];
  projectPages: WikiPage[];
}

export function buildSidebarModel(pages: WikiPage[]): SidebarModel {
  const all = pages.length ? pages : [{ title: "Home", path: defaultWikiPath }];
  return {
    plans: all.filter((page) => page.path.includes("/wiki/plans/")),
    projectPages: all.filter((page) => isProjectWikiPage(page)),
  };
}

export function isProjectWikiPage(page: WikiPage) {
  const path = displayWikiPath(page.path);
  return [
    "/wiki/architecture.mdx",
    "/wiki/dev.mdx",
    "/wiki/roadmap.mdx",
    "/wiki/sources.mdx",
    "/wiki/log.mdx",
  ].some((suffix) => path.endsWith(suffix)) || path.includes("/wiki/sources/");
}

export function cleanPageTitle(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.mdx")) return "Plans";
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return "MVP Plan";
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return "Completed Plans";
  if (isUnitPage(page)) return normalizePlanDisplayTitle(page.title);
  if (path.includes("/stage-")) return normalizePlanDisplayTitle(page.title);
  if (page.title.toLowerCase() === "prd") return "PRD";
  if (path.includes("/wiki/plans/")) return page.title.replace(/\s+Plan$/, "");
  return page.title;
}

export function displayWikiPath(path: string) {
  return path
    .replace(/^\/workspace\/[^/]+\/[^/#?]+#/, "")
    .replace(/^\/projects\/[^/]+/, "")
}

export function isTopLevelPlanPage(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.mdx")) return true;
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return true;
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return true;
  if (/^\/wiki\/plans\/(?!zzz_completed\/)[^/]+\/index\.mdx$/.test(path)) return true;
  if (/^\/wiki\/plans\/features\/[^/]+\.mdx$/.test(path)) return true;
  return /^\/wiki\/plans\/[^/]+\.mdx$/.test(path) && !path.endsWith("/index.mdx");
}

export function isDeletablePlanRootPage(path: string, pages: WikiPage[]) {
  const displayPath = displayWikiPath(path);
  if (!displayPath.startsWith("/wiki/plans/") || !displayPath.endsWith(".mdx")) return false;
  if (
    displayPath.endsWith("/wiki/plans/index.mdx")
    || displayPath.endsWith("/wiki/plans/zzz_completed/index.mdx")
  ) {
    return false;
  }
  if (/\/stage-\d+[^/]*\.mdx$/.test(displayPath) || /\/unit-\d+[^/]*\.mdx$/.test(displayPath)) {
    return false;
  }
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === displayPath);
  return Boolean(page && isTopLevelPlanPage(page));
}

export function isPlansIndexPage(page: WikiPage) {
  return displayWikiPath(page.path).endsWith("/wiki/plans/index.mdx");
}

export function isCompletedTopLevelPlanPage(page: WikiPage) {
  return isTopLevelPlanPage(page) && !displayWikiPath(page.path).endsWith("/wiki/plans/zzz_completed/index.mdx") && isCompletedPage(page);
}

export function isUnitPage(page: WikiPage) {
  return /\/unit-\d+-[^/]+\.mdx$/.test(displayWikiPath(page.path));
}

export const unitScreenshotDir = ".hyperwiki/state/screenshots";

// Map a unit wiki page path to its screenshot file path, mirroring the unit's
// wiki-relative path under the gitignored runtime dir (drop the `wiki/` prefix,
// `.mdx` -> `.png`). Must stay in lockstep with `screenshot_path_for_unit` in
// src-tauri/src/domain/screenshots.rs so the execute prompt and the serving
// route agree on where the PNG lives.
export function unitScreenshotRelPath(unitPath: string) {
  const relative = displayWikiPath(unitPath)
    .replace(/^\//, "")
    .replace(/^wiki\//, "")
    .replace(/\.mdx$/i, ".png");
  return `${unitScreenshotDir}/${relative}`;
}

export function childPlanPages(parent: WikiPage, pages: WikiPage[]) {
  return pages.filter((candidate) => isImmediateChildPlanPage(parent, candidate) && !isDuplicateSlugChildPage(parent, candidate));
}

export function isDuplicateSlugChildPage(parent: WikiPage, candidate: WikiPage) {
  return slugify(cleanPageTitle(parent)) === slugify(candidate.title);
}

export function isImmediateChildPlanPage(parent: WikiPage, candidate: WikiPage) {
  const parentPath = displayWikiPath(parent.path);
  const candidatePath = displayWikiPath(candidate.path);
  if (parentPath === candidatePath) return false;
  if (parentPath.endsWith("/wiki/plans/zzz_completed/index.mdx")) {
    return (/^\/wiki\/plans\/zzz_completed\/[^/]+\.mdx$/.test(candidatePath) && !candidatePath.endsWith("/index.mdx")) || isCompletedTopLevelPlanPage(candidate);
  }
  if (parentPath.endsWith("/wiki/plans/mvp/index.mdx")) {
    return /^\/wiki\/plans\/mvp\/stage-\d+[^/]*\.mdx$/.test(candidatePath);
  }
  if (/^\/wiki\/plans\/features\/[^/]+\.mdx$/.test(parentPath)) return false;
  const stage = parentPath.match(/^(.*)\/stage-(\d+)[^/]*\.mdx$/);
  if (stage) {
    const legacyBase = parentPath.replace(/\.mdx$/, "");
    const legacyChild = candidatePath.startsWith(`${legacyBase}/`) && !candidatePath.slice(legacyBase.length + 1).includes("/");
    const unitBase = `${stage[1]}/units/stage-${stage[2]}`;
    const documentedChild = candidatePath.startsWith(`${unitBase}/`) && !candidatePath.slice(unitBase.length + 1).includes("/");
    return legacyChild || documentedChild;
  }
  const parentBase = planTreeBasePath(parentPath);
  return candidatePath.startsWith(`${parentBase}/`) && !candidatePath.slice(parentBase.length + 1).includes("/");
}

export function planTreeBasePath(path: string) {
  return path.endsWith("/index.mdx") ? path.slice(0, -"/index.mdx".length) : path.replace(/\.mdx$/, "");
}

export function planSortKey(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.mdx")) return "00";
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return "01";
  if (path.startsWith("/wiki/plans/mvp/stage-")) return `01-${path}`;
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return "99";
  if (path.startsWith("/wiki/plans/zzz_completed/")) return `99-${path}`;
  return `02-${path}`;
}

export function isCompletedPage(page: WikiPage) {
  return pageStatus(page) === "complete";
}

export function planPageActionState(path: string, pages: WikiPage[]): PlanPageActionState {
  const displayPath = displayWikiPath(path);
  const isPlanPage = displayPath.includes("/wiki/plans/") && displayPath.endsWith(".mdx");
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === displayPath);
  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const roots = sorted.filter((candidate) => isTopLevelPlanPage(candidate) && !isCompletedTopLevelPlanPage(candidate));
  const currentPath = currentPlanWorkPath(sorted, roots);
  const currentDisplayPath = displayWikiPath(currentPath);
  const currentPage = pages.find((candidate) => displayWikiPath(candidate.path) === currentDisplayPath);
  const isComplete = Boolean(page && isCompletedPage(page));
  const isStale = Boolean(isPlanPage && currentDisplayPath && displayPath !== currentDisplayPath && !displayPath.endsWith("/wiki/plans/index.mdx"));
  const canExecute = Boolean(currentDisplayPath && currentDisplayPath !== defaultWikiPath && currentPage && !isCompletedPage(currentPage));
  return {
    isPlanPage,
    isComplete,
    isStale,
    canExecute,
    currentPath,
    currentTitle: currentPage && canExecute ? cleanPageTitle(currentPage) : "",
    currentUnitLabel: currentPage && canExecute ? compactUnitLabel(currentPage) : "",
  };
}

export function compactUnitLabel(page: WikiPage) {
  const title = cleanPageTitle(page);
  const titleMatch = title.match(/\bunit\s+(\d+)\b/i);
  if (titleMatch?.[1]) return `Unit ${titleMatch[1].padStart(2, "0")}`;
  const pathMatch = displayWikiPath(page.path).match(/\/unit-(\d+)[^/]*\.mdx$/i);
  if (pathMatch?.[1]) return `Unit ${pathMatch[1].padStart(2, "0")}`;
  return title;
}

export function planScopeIsComplete(scope: { scope: string; scopeKind: string; planPath: string | null }, pages: WikiPage[]) {
  if (scope.scopeKind !== "plan" || !scope.planPath) return false;
  const scopePath = displayWikiPath(scope.planPath);
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === scopePath);
  return Boolean(page && isCompletedPage(page));
}

export function currentPlanWorkPath(pages: WikiPage[], roots: WikiPage[]) {
  const derived = firstIncompleteWorkPath(pages, roots);
  if (derived && derived !== defaultWikiPath) return derived;
  if (derived) return derived;
  return pages.find((page) => page.currentState === "current-unit" && !isCompletedPage(page))?.path || pages.find((page) => page.currentState === "current-plan" && !isCompletedPage(page))?.path || "";
}

export function planLandingPath(pages: WikiPage[]) {
  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const roots = sorted.filter((page) => isTopLevelPlanPage(page) && !isCompletedTopLevelPlanPage(page));
  const currentPath = currentPlanWorkPath(sorted, roots);
  if (currentPath && currentPath !== defaultWikiPath) return currentPath;
  return defaultWikiPath;
}

export function firstIncompleteWorkPath(pages: WikiPage[], roots: WikiPage[]) {
  for (const root of roots) {
    if (isCompletedPage(root)) continue;
    if (displayWikiPath(root.path).endsWith("/wiki/plans/index.mdx")) {
      const hasConcretePlan = roots.some((candidate) => candidate.path !== root.path);
      if (hasConcretePlan) continue;
    }
    const stages = childPlanPages(root, pages).filter((page) => !isCompletedPage(page));
    if (!stages.length) return root.path;
    const stage = stages[0];
    const units = childPlanPages(stage, pages).filter((page) => !isCompletedPage(page));
    return (units[0] || stage).path;
  }
  return "";
}

export function pathIsCompletedPage(path: string, pages: WikiPage[]) {
  const displayPath = displayWikiPath(path);
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === displayPath);
  return Boolean(page && isCompletedPage(page));
}

export function pageStatus(page: WikiPage) {
  return page.status ? String(page.status).replace("completed", "complete") : "";
}

export function pathContainsSelectedPage(path: string, selectedPath: string) {
  const normalizedPath = displayWikiPath(path);
  const normalizedSelected = displayWikiPath(selectedPath);
  if (normalizedSelected === normalizedPath) return true;
  const stage = normalizedPath.match(/^(.*)\/stage-(\d+)[^/]*\.mdx$/);
  if (stage && normalizedSelected.startsWith(`${stage[1]}/units/stage-${stage[2]}/`)) return true;
  const basePath = planTreeBasePath(normalizedPath);
  return normalizedSelected.startsWith(`${basePath}/`);
}

export function titleForPath(path: string, pages: WikiPage[]) {
  const page = pages.find((candidate) => candidate.path === path);
  return page ? cleanPageTitle(page) : normalizePlanDisplayTitle(path.split("/").pop() || "Wiki");
}

export function isReactRenderedMdxPath(path: string) {
  return displayWikiPath(path).startsWith("/wiki/") && path.endsWith(".mdx");
}
