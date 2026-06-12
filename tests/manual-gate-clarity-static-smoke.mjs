import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile("src/App.tsx", "utf8");
const hyperwikiSkill = await readFile("src-tauri/agent-skills/hyperwiki/SKILL.md", "utf8");
const planningContract = await readFile("src-tauri/agent-skills/hyperwiki/references/planning-contract.md", "utf8");
const mdxPatterns = await readFile("src-tauri/agent-skills/hyperwiki/references/mdx-artifact-patterns.md", "utf8");
const validationChecklist = await readFile("src-tauri/agent-skills/hyperwiki/references/validation-checklist.md", "utf8");

const workflowStart = appSource.indexOf("function workflowPrompt");
const worktreeStart = appSource.indexOf("function existingWorktreePrompt", workflowStart);
const workflowSource = appSource.slice(workflowStart, worktreeStart);
const worktreeSource = appSource.slice(worktreeStart, appSource.indexOf("function completionPrompt", worktreeStart));
const planCreationStart = appSource.indexOf("function planCreationPrompt");
const planCreationSource = appSource.slice(planCreationStart, workflowStart);
const importPlanningStart = appSource.indexOf("function terminalImportPlanningPrompt");
const importPlanningSource = appSource.slice(importPlanningStart, appSource.indexOf("function importedProjectQuestionScriptPrompt", importPlanningStart));

assert.notEqual(workflowStart, -1, "workflowPrompt should exist");
assert.notEqual(worktreeStart, -1, "existingWorktreePrompt should exist");
assert.notEqual(planCreationStart, -1, "planCreationPrompt should exist");
assert.notEqual(importPlanningStart, -1, "terminalImportPlanningPrompt should exist");

for (const [label, source] of [
  ["main execute prompt", workflowSource],
  ["worktree execute prompt", worktreeSource],
]) {
  assert.ok(source.includes("Manual step required"), `${label} must require an explicit manual-step section`);
  assert.ok(source.includes("what is blocked") && source.includes("why it is blocked"), `${label} must require blocked/why detail`);
  assert.ok(source.includes("exact commands/settings/UI path when known"), `${label} must require exact command/settings/UI path`);
  assert.ok(source.includes("expected success signal/output"), `${label} must require expected success output`);
  assert.ok(source.includes("what button or command the user should rerun"), `${label} must tell the user how to resume`);
}

for (const [label, source] of [
  ["plan creation prompt", planCreationSource],
  ["import planning prompt", importPlanningSource],
]) {
  assert.ok(source.includes("Manual checks must include exact user-facing steps") || source.includes("spell out the exact user action"), `${label} must require exact manual verification steps`);
  assert.ok(source.includes("expected success signal"), `${label} must require expected manual success evidence`);
  assert.ok(source.includes("what to rerun afterward") || source.includes("what to rerun after"), `${label} must require resume instructions after manual steps`);
}

for (const [label, source] of [
  ["hyperwiki skill", hyperwikiSkill],
  ["planning contract", planningContract],
  ["MDX artifact patterns", mdxPatterns],
  ["validation checklist", validationChecklist],
]) {
  assert.ok(source.includes("exact") && source.includes("expected success signal"), `${label} must keep manual verification user-actionable`);
}

console.log("manual gate clarity static smoke passed");
