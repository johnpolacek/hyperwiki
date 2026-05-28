import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const cwd = process.cwd();
const deadlineMs = Number(process.env.HYPERWIKI_CODEX_APP_SERVER_SMOKE_TIMEOUT_MS || 30000);
const child = spawn("codex", [
  "app-server",
  "--listen",
  "stdio://",
  "-c",
  "model=\"gpt-5.5\"",
  "-c",
  "model_reasoning_effort=\"low\"",
  "-c",
  "plan_mode_reasoning_effort=\"low\"",
], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let threadId = "";
let turnStarted = false;
let sawDelta = false;
let completed = false;
let failed = "";

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split(/\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    handleMessage(JSON.parse(line));
  }
});

child.stderr.on("data", (chunk) => {
  if (process.env.HYPERWIKI_CODEX_APP_SERVER_SMOKE_VERBOSE === "1") {
    process.stderr.write(chunk);
  }
});

child.on("exit", (code) => {
  if (!completed && !failed) failed = `codex app-server exited early with code ${code}`;
});

send(1, "initialize", {
  clientInfo: { name: "hyperwiki-protocol-smoke", version: "0" },
  capabilities: null,
});

setTimeout(() => {
  send(2, "thread/start", {
    cwd,
    model: "gpt-5.5",
    config: {
      model_reasoning_effort: "low",
      plan_mode_reasoning_effort: "low",
    },
    sandbox: "danger-full-access",
    approvalPolicy: "never",
    threadSource: "user",
    ephemeral: true,
  });
}, 150);

const timeout = setTimeout(() => {
  failed ||= `timed out waiting for app-server turn; thread=${threadId || "none"} turnStarted=${turnStarted} sawDelta=${sawDelta} completed=${completed}`;
  child.kill();
}, deadlineMs);

while (!completed && !failed) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

clearTimeout(timeout);
child.kill();

assert.equal(failed, "");
assert.ok(threadId, "thread/start should return a thread id");
assert.equal(turnStarted, true, "turn/start should produce a turn response");
assert.equal(sawDelta, true, "turn should stream an agent message delta");
assert.equal(completed, true, "turn should complete");
console.log("codex app-server protocol smoke passed");

function handleMessage(message) {
  if (message.error) {
    failed ||= JSON.stringify(message.error);
    child.kill();
    return;
  }
  if (message.id === 2) {
    threadId = message.result?.thread?.id || "";
    if (!threadId) {
      failed ||= `thread/start response missing thread id: ${JSON.stringify(message)}`;
      child.kill();
      return;
    }
    send(3, "turn/start", {
      threadId,
      input: [{ type: "text", text: "Reply with exactly: ok", text_elements: [] }],
      cwd,
      model: "gpt-5.5",
      effort: "low",
      approvalPolicy: "never",
      sandboxPolicy: { type: "dangerFullAccess" },
    });
  }
  if (message.id === 3) turnStarted = true;
  if (message.method === "item/agentMessage/delta") sawDelta = true;
  if (message.method === "turn/completed") completed = true;
}

function send(id, method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
}
