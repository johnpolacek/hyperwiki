import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adopt = await readFile("src-tauri/src/domain/adopt.rs", "utf8");
const runtime = await readFile("src-tauri/src/domain/import_onboarding_runtime.rs", "utf8");
const command = await readFile("src-tauri/src/command.rs", "utf8");
const importPlanning = await readFile("src-tauri/src/domain/import_planning.rs", "utf8");
const claude = await readFile("src-tauri/src/domain/claude_agent.rs", "utf8");
const codex = await readFile("src-tauri/src/domain/codex_app_server.rs", "utf8");
const projects = await readFile("src-tauri/src/domain/projects.rs", "utf8");
const types = await readFile("src/lib/types.ts", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const newProject = await readFile("src/components/views/NewProjectView.tsx", "utf8");
const workspacePane = await readFile("src/components/views/WorkspacePane.tsx", "utf8");

function matches(haystack, needle, label) {
  assert.match(haystack, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${label}: ${needle}`);
}

// Backend adoption module surface.
for (const symbol of [
  "inspect_existing_project",
  "adopt_existing_project",
  "create_adoption_checkpoint",
  "validate_adopted_wiki",
  "read_adoption_state",
  "write_adoption_state",
  "AdoptInspectRequest",
  "AdoptProjectRequest",
  "AdoptProjectResponse",
  "AdoptionState",
  "confirm_replace",
  "pre-adoption checkpoint",
  "legacyMarkdown",
  "alreadyMdx",
  "write_project_scaffold",
  "git_toplevel_matches",
  "is_git_root",
  "write_minimal_index",
]) {
  matches(adopt, symbol, "adopt.rs symbol");
}
// Adoption must NEVER fabricate a fresh-project wiki/MVP-plan tree.
assert.doesNotMatch(adopt, /write_basic_wiki/, "adoption must not call write_basic_wiki");
assert.doesNotMatch(adopt, /init_hyperwiki_project/, "adoption must not call init_hyperwiki_project (would fabricate an MVP plan tree)");
// Repository-root guard for the checkpoint scope.
matches(adopt, "Git repository root", "adopt rejects non-root subdirectories");

// Runtime adopt turns.
for (const symbol of [
  "RuntimeTurnKind::Adopt",
  "RuntimeTurnKind::AdoptRepair",
  "running_adopt_turn",
  "running_adopt_repair_turn",
  "adopt_attempts",
  "start_wiki_adoption",
  "adopt_turn_prompt",
  "run_adopt_turn",
  "execute_provider_turn_with_window",
]) {
  matches(runtime, symbol, "runtime adopt symbol");
}
matches(runtime, "delete the original .md file", "adopt prompt delete instruction");
matches(runtime, "zzz-completed/ -> wiki/plans/zzz_completed/", "adopt prompt zzz rename");

// import_planning short-circuits to adoption status.
matches(importPlanning, "read_adoption_state", "import_planning adoption short-circuit");
matches(importPlanning, "adoption_import_planning_status", "adoption status helper");

// Timeout plumbing + fake-agent seam.
matches(codex, "timeout_secs", "CodexTurnRequest timeout_secs");
matches(claude, "HYPERWIKI_CLAUDE_BIN", "claude fake-agent seam");
matches(claude, "turn_timeout", "claude configurable timeout");

// Shared scaffold helper.
matches(projects, "pub(crate) fn write_project_scaffold", "shared scaffold helper");

// Routes — inspect must precede adopt (it is a path prefix).
matches(command, "/api/projects/adopt/inspect", "adopt inspect route");
matches(command, "/api/projects/adopt", "adopt route");
const inspectIdx = command.indexOf("/api/projects/adopt/inspect");
const adoptIdx = command.indexOf('starts_with("/api/projects/adopt")');
assert.ok(inspectIdx > -1 && adoptIdx > -1 && inspectIdx < adoptIdx, "inspect route must be matched before the adopt route");

// Frontend types + flow.
for (const symbol of ["AdoptInspectResponse", "AdoptProjectResponse", "AdoptionState", "WikiShape", "adopting", "adoptionFailed"]) {
  matches(types, symbol, "frontend type");
}
for (const symbol of [
  "adoptExistingProject",
  "inspectExistingProject",
  "waitForWikiAdoption",
  "isAdoptingProject",
  "confirmReplace",
  "running_adopt_turn",
]) {
  matches(app, symbol, "App.tsx adopt symbol");
}
for (const symbol of ["project-mode-toggle", "import-path-input", "confirm-adopt", "Convert & replace", "onAdoptProject", "onInspectProject", "isGitRoot"]) {
  matches(newProject, symbol, "NewProjectView adopt symbol");
}
matches(workspacePane, "onAdoptProject", "WorkspacePane forwards onAdoptProject");
matches(workspacePane, "onInspectProject", "WorkspacePane forwards onInspectProject");
matches(workspacePane, "AdoptingView", "WorkspacePane renders the adoption-progress view");
// A dedicated adoption-progress surface exists so the not-yet-existent wiki is never rendered mid-adopt.
matches(workspacePane, "adoptionFailed", "WorkspacePane handles adoptionFailed");

console.log("adopt existing project static smoke passed");
