import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const renderer = await readFile("src/components/MdxPlanRenderer.tsx", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const command = await readFile("src-tauri/src/command.rs", "utf8");
const wiki = await readFile("src-tauri/src/domain/wiki.rs", "utf8");

for (const contract of [
  "canDeletePlan",
  "onDeletePlan",
  "setIsDeleteConfirming",
  "<X aria-hidden",
  "Cancel",
  "Delete Plan",
]) {
  assert.ok(renderer.includes(contract), `Plan renderer must expose inline delete confirmation: ${contract}`);
}

for (const contract of [
  "isDeletablePlanRootPage",
  "canDeletePlan={isDeletablePlanRootPage(props.wikiPath, props.wikiPages)}",
  "/api/wiki/plan?path=",
  "/wiki/plans/index.mdx",
  "/wiki/plans/zzz_completed/index.mdx",
  "/\\/stage-\\d+[^/]*\\.mdx$/",
  "/\\/unit-\\d+[^/]*\\.mdx$/",
]) {
  assert.ok(app.includes(contract), `App must scope plan deletion to top-level plan pages: ${contract}`);
}

assert.ok(command.includes('request.method == "DELETE" && request.path.starts_with("/api/wiki/plan")'), "Tauri router must expose a guarded wiki plan delete endpoint.");
assert.ok(wiki.includes("Only top-level plan pages can be deleted."), "Wiki domain must reject non-plan-root deletions.");
assert.ok(wiki.includes("associated_plan_directory_relative_path"), "Wiki domain must delete associated child plan directories.");

console.log("plan delete control static smoke passed");
