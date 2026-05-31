import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codex = await readFile("src-tauri/src/domain/codex_app_server.rs", "utf8");
const runtime = await readFile("src-tauri/src/domain/import_onboarding_runtime.rs", "utf8");
const command = await readFile("src-tauri/src/command.rs", "utf8");
const app = await readFile("src/App.tsx", "utf8");
const importPlanning = await readFile("src-tauri/src/domain/import_planning.rs", "utf8");

for (const symbol of [
  "ImportOnboardingSession",
  "ImportOnboardingRun",
  "ImportOnboardingEventRecord",
  "ImportOnboardingCheckpoint",
  "events.jsonl",
  "checkpoints",
  "answer_import_onboarding",
  "retry_import_onboarding",
  "cancel_import_onboarding",
  "record_human_input_request",
  "record_import_planning_answer",
  "contract_warning",
  "contract_error",
  "hyperwiki-ready-to-plan",
  "running_plan_repair_turn",
  "hyperwiki-plan-artifacts",
  "compile_import_mvp_plan_artifacts",
  "plan_compiler_started",
  "plan_artifacts_compiled",
  "plan_artifacts_written",
  "plan_validation_passed",
]) {
  assert.match(runtime, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing runtime symbol ${symbol}`);
}
assert.doesNotMatch(runtime, /complete_plan_from_runtime_context/);
assert.doesNotMatch(runtime, /Unit 01 - Confirmed MVP Slice/);
assert.doesNotMatch(
  runtime,
  /spawn_runtime_turn\(\s*project,\s*RuntimeTurnKind::PlanRepair,\s*ready,/,
  "ready-to-plan should compile artifacts directly instead of spawning the normal hidden plan repair turn",
);

for (const endpoint of [
  "/api/import-onboarding/prewarm",
  "/api/import-onboarding/start",
  "/api/import-onboarding/status",
  "/api/import-onboarding/answer",
  "/api/import-onboarding/retry",
  "/api/import-onboarding/cancel",
]) {
  assert.match(command, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing endpoint ${endpoint}`);
  assert.match(app, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `frontend should use ${endpoint}`);
}
assert.match(command, /\/api\/import-onboarding\/events/, "missing import onboarding events endpoint");

assert.match(codex, /APP_SERVER_FIRST_EVENT_FALLBACK_AFTER/);
assert.match(codex, /run_exec_json_turn/);
assert.match(codex, /codex-exec-json/);
assert.match(codex, /exec_json_fallback/);
assert.match(codex, /EXEC_JSON_FIRST_ASSISTANT_TIMEOUT_MESSAGE/);
assert.match(codex, /CodexPrewarmResponse/);
assert.match(codex, /spawn_codex_provider_prewarm/);
assert.match(codex, /prewarm_import_thread/);
assert.match(codex, /APP_SERVER_WARM_FIRST_EVENT_FALLBACK_AFTER/);

assert.match(app, /interface ImportOnboardingStatusResponse/);
assert.match(app, /interface ImportOnboardingPrewarmResponse/);
assert.match(app, /prewarmImportOnboarding/);
assert.match(app, /applyImportOnboardingStatus/);
assert.match(app, /applyImportOnboardingEventLines/);
assert.match(app, /startImportOnboardingRuntime/);
assert.match(app, /waitForImportOnboardingRuntime/);
assert.match(app, /importOnboardingPhaseLabel/);
assert.match(app, /activeImportPlanningRun/);
assert.match(app, /Cancel Run/);
assert.match(app, /importPlanningWorkstreamLimit = 1000/);
assert.match(app, /const showActivityPane = !isRetryableFailure/);
assert.match(app, /questions\.length \? "Planning activity" : waitingLabel/);
assert.match(app, /PlanHero, PlanSummary, PlanUnit/);
assert.match(app, /Visibility for=\\"agents\\"/);
assert.doesNotMatch(app, /monitorImportPlanningTurn/);
assert.doesNotMatch(app, /hyperwiki-local-answer-fallback/);

assert.match(importPlanning, /HumanInputCheckpointRequest/);
assert.match(importPlanning, /ImportPlanningQuestionOption/);
assert.match(importPlanning, /recommended_answer/);
assert.match(importPlanning, /human_input_request_path/);
assert.match(importPlanning, /stale question/);
assert.match(importPlanning, /StagedArtifactRecord/);
assert.match(importPlanning, /ImportPlanningArtifactValidation/);
assert.match(importPlanning, /validate_import_plan_artifacts/);
assert.match(importPlanning, /staged-artifacts\.json/);
assert.match(runtime, /Use built-in Hyperwiki MDX plan components/);
assert.match(runtime, /Visibility for=\\"agents\\"/);
assert.match(runtime, /<PlanHero/);
assert.match(runtime, /<PlanSummary>/);
assert.match(runtime, /<CardGroup>/);
assert.match(runtime, /<Columns>/);
assert.match(runtime, /<TaskList title=\\"Acceptance checks\\"/);
assert.match(runtime, /<CommandBlock title=\\"Manual check\\">/);
assert.match(runtime, /<Aside title=\\"Unlocks next\\">/);
assert.match(runtime, /<Card title=\\"Build\\"/);
assert.match(runtime, /<Card title=\\"Where\\"/);
assert.match(runtime, /<Card title=\\"Ready when\\"/);
assert.match(runtime, /<h2>Implementation Notes<\/h2>/);

console.log("import onboarding manager static smoke passed");
