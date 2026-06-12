import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

const source = await readSources("src/lib/agent.ts", "src/App.tsx");

assert.ok(
  source.includes("const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(defaultThinkingEffort);"),
  "Thinking effort should initialize from the low default on every app load.",
);
assert.ok(
  source.includes('window.localStorage.removeItem(thinkingEffortStorageKey);'),
  "Legacy persisted thinking effort should be cleared so old high-effort values cannot affect startup.",
);
assert.equal(
  source.includes("window.localStorage.getItem(thinkingEffortStorageKey)"),
  false,
  "Startup thinking effort must not be restored from localStorage.",
);

const launchHelperStart = source.indexOf("function agentLaunchCommand");
const launchHelperEnd = source.indexOf("function importAgentLaunchCommand", launchHelperStart);
assert.notEqual(launchHelperStart, -1, "agentLaunchCommand should exist");
assert.notEqual(launchHelperEnd, -1, "importAgentLaunchCommand should follow agentLaunchCommand");
const launchHelper = source.slice(launchHelperStart, launchHelperEnd);
assert.ok(
  launchHelper.includes("return codexCommandWithThinkingEffort(command, effort);"),
  "Agent launch commands should pass through the Codex thinking-effort override helper.",
);

const codexHelperStart = source.indexOf("function codexCommandWithThinkingEffort");
const codexHelperEnd = source.indexOf("function importedProjectQuestionScriptPrompt", codexHelperStart);
assert.notEqual(codexHelperStart, -1, "codexCommandWithThinkingEffort should exist");
assert.notEqual(codexHelperEnd, -1, "importedProjectQuestionScriptPrompt should follow Codex helper");
const codexHelper = source.slice(codexHelperStart, codexHelperEnd);
assert.ok(
  codexHelper.includes('if (!/^\\s*(?:[\\w./-]+\\/)?codex(?:\\s|$)/.test(command)) return command;'),
  "Non-Codex commands should remain unchanged.",
);
assert.ok(
  codexHelper.includes(".replace(codexModelReasoningEffortFlagPattern, \"\")")
    && codexHelper.includes(".replace(codexPlanModeReasoningEffortFlagPattern, \"\")"),
  "Codex command rewriting should remove existing effort flags before appending the selected effort.",
);
assert.ok(
  codexHelper.includes('model_reasoning_effort="${normalized}"') && codexHelper.includes('plan_mode_reasoning_effort="${normalized}"'),
  "Codex commands should receive both model and plan-mode reasoning effort overrides.",
);
assert.ok(
  source.includes("const codexModelReasoningEffortFlagPattern =")
    && source.includes("const codexPlanModeReasoningEffortFlagPattern ="),
  "Shared Codex effort-flag patterns should cover both model and plan-mode effort flags.",
);

for (const snippet of [
  "agentLaunchCommand(layout, thinkingEffort)",
  "agentLaunchCommand(projectLayout, thinkingEffort)",
  "agentLaunchCommand(layout, thinkingEffort)",
  "thinkingEffort={thinkingEffort}",
  "onThinkingEffortChange={setThinkingEffort}",
]) {
  assert.ok(source.includes(snippet), `App shell should route thinking effort through terminal launch path: ${snippet}`);
}

console.log("default low thinking mode static smoke passed");
