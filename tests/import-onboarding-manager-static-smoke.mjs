import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codex = await readFile("src-tauri/src/domain/codex_app_server.rs", "utf8");
const command = await readFile("src-tauri/src/command.rs", "utf8");
const app = await readFile("src/App.tsx", "utf8");

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
]) {
  assert.match(codex, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${symbol}`);
}

assert.match(command, /\/api\/import-planning\/turn-cancel/);
assert.match(command, /\/api\/import-planning\/turn-retry/);
assert.match(command, /retry_import_planning_turn/);
assert.match(command, /cancel_import_planning_turn/);
assert.match(app, /interface ImportOnboardingSessionRecord/);
assert.match(app, /interface ImportOnboardingRunRecord/);

console.log("import onboarding manager static smoke passed");
