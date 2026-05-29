import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codex = await readFile("src-tauri/src/domain/codex_app_server.rs", "utf8");
const command = await readFile("src-tauri/src/command.rs", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const importPlanning = await readFile("src-tauri/src/domain/import_planning.rs", "utf8");

for (const symbol of [
  "ImportOnboardingSessionRecord",
  "ImportOnboardingRunRecord",
  "ImportOnboardingEvent",
  "start_run_record",
  "complete_run_record",
  "fail_run_record",
  "retry_import_planning_turn",
  "cancel_import_planning_turn",
  "import-onboarding://event",
  "APP_SERVER_FIRST_EVENT_FALLBACK_AFTER",
  "run_exec_json_turn",
  "codex-exec-json",
  "exec_json_fallback",
]) {
  assert.match(codex, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${symbol}`);
}

assert.match(command, /\/api\/import-planning\/turn-cancel/);
assert.match(command, /\/api\/import-planning\/turn-retry/);
assert.match(command, /retry_import_planning_turn/);
assert.match(command, /cancel_import_planning_turn/);
assert.match(command, /record_human_input_request/);
assert.match(app, /interface ImportOnboardingSessionRecord/);
assert.match(app, /interface ImportOnboardingRunRecord/);
assert.match(app, /checkpointImportPlanningQuestion/);
assert.match(app, /requestId: item\.question\.requestId/);
assert.match(importPlanning, /HumanInputCheckpointRequest/);
assert.match(importPlanning, /human_input_request_path/);
assert.match(importPlanning, /stale question/);
assert.match(importPlanning, /StagedArtifactRecord/);
assert.match(importPlanning, /ImportPlanningArtifactValidation/);
assert.match(importPlanning, /validate_import_plan_artifacts/);
assert.match(importPlanning, /staged-artifacts\.json/);
assert.match(app, /artifactValidation/);
assert.match(app, /importPlanArtifactsAreComplete/);
assert.match(app, /activeImportPlanningRun/);
assert.match(app, /Cancel Run/);
assert.doesNotMatch(app, /monitorImportPlanningTurn/);
assert.match(app, /shouldAutoRepairImportPlanningDrift/);
assert.match(app, /importedProjectPlanningRepairPrompt/);
assert.match(app, /reason: "initial" \| "answer" \| "retry" \| "repair"/);
assert.match(app, /without a parseable question or generated plan/);

console.log("import onboarding manager static smoke passed");
