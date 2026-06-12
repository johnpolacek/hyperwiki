import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

const source = await readSources("src/lib/agent.ts", "src/App.tsx");

// Claude launch commands must pass through unchanged — Claude Code has no
// Codex-style reasoning-effort flags.
const claudeHelperStart = source.indexOf("function claudeCommandWithThinkingEffort");
assert.notEqual(claudeHelperStart, -1, "claudeCommandWithThinkingEffort should exist");
const claudeHelperEnd = source.indexOf("function agentProviderFromCommand", claudeHelperStart);
assert.notEqual(claudeHelperEnd, -1, "agentProviderFromCommand should follow the Claude helper");
const claudeHelper = source.slice(claudeHelperStart, claudeHelperEnd);
assert.ok(
  claudeHelper.includes("return command;"),
  "Claude launch commands should be returned unchanged.",
);
assert.equal(
  claudeHelper.includes("model_reasoning_effort"),
  false,
  "Claude commands must not receive Codex reasoning-effort flags.",
);

// Default agent command keeps Codex as the back-compat default and only falls
// back to Claude when it is the sole installed agent.
const defaultHelperStart = source.indexOf("function defaultAgentCommand");
assert.notEqual(defaultHelperStart, -1, "defaultAgentCommand should exist");
const defaultHelper = source.slice(defaultHelperStart, source.indexOf("function agentLaunchCommand", defaultHelperStart));
assert.ok(
  defaultHelper.includes("!providers.codexAvailable && providers.claudeAvailable"),
  "Claude default should only apply when Codex is unavailable and Claude is available.",
);
assert.ok(
  defaultHelper.includes('"claude --dangerously-skip-permissions"') && defaultHelper.includes('"codex --yolo"'),
  "defaultAgentCommand should know both canonical launch commands.",
);

// agentLaunchCommand routes its fallback through the detection-aware default.
assert.ok(
  source.includes("|| defaultAgentCommand(providers)"),
  "agentLaunchCommand fallback should use the detection-aware default command.",
);

// Detection + persistence endpoints are wired on the frontend.
assert.ok(source.includes('"/api/agent-providers"'), "App should fetch agent provider availability.");
assert.ok(source.includes('"/api/agent-provider"'), "App should persist the selected agent provider.");

// Provider toggle UI: shown only when both CLIs are available, and the
// thinking-effort control is hidden while Claude is selected.
assert.ok(
  source.includes("props.agentProviders.codexAvailable && props.agentProviders.claudeAvailable"),
  "Provider toggle should render only when both Codex and Claude are installed.",
);
assert.ok(
  source.includes('<option value="codex">codex</option>') && source.includes('<option value="claude">claude</option>'),
  "Provider toggle should offer both Codex and Claude options.",
);
assert.ok(
  source.includes('props.agentProvider === "claude" ? null : ('),
  "Thinking-effort control should be hidden when Claude is the selected provider.",
);

console.log("claude agent default static smoke passed");
