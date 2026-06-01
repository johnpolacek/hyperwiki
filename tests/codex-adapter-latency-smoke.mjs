import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const cwd = process.cwd();
const timeoutMs = Number(process.env.HYPERWIKI_CODEX_ADAPTER_SMOKE_TIMEOUT_MS || 60000);
const transports = (process.env.HYPERWIKI_CODEX_ADAPTER_SMOKE_TRANSPORTS || "app-server,exec")
  .split(",")
  .map((transport) => transport.trim())
  .filter(Boolean);

const results = [];

if (transports.includes("app-server")) {
  results.push(await smokeAppServer());
}
if (transports.includes("exec")) {
  results.push(await smokeExecJson());
}

assert.ok(results.length, "at least one Codex transport should be smoked");
console.log(JSON.stringify({ ok: true, results }, null, 2));

async function smokeAppServer() {
  const startedAt = performance.now();
  const child = spawnCodex([
    "app-server",
    "--listen",
    "stdio://",
    "-c",
    "model=\"gpt-5.5\"",
    "-c",
    "model_reasoning_effort=\"low\"",
    "-c",
    "plan_mode_reasoning_effort=\"low\"",
  ]);
  const metrics = {
    transport: "codex-app-server",
    providerStartedMs: 0,
    initializedMs: null,
    threadReadyMs: null,
    turnRequestedMs: null,
    firstEventMs: null,
    firstDeltaMs: null,
    completedMs: null,
    events: 0,
  };
  let buffer = "";
  let threadId = "";
  let failed = "";
  let completed = false;

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      handleAppServerMessage(JSON.parse(line));
    }
  });
  child.stderr.on("data", maybeWriteVerbose);

  child.on("exit", (code) => {
    if (!completed && !failed) failed = `codex app-server exited early with code ${code}`;
  });

  send(child, 1, "initialize", {
    clientInfo: { name: "hyperwiki-adapter-latency-smoke", version: "0" },
    capabilities: null,
  });

  const timeout = setTimeout(() => {
    failed ||= `timed out waiting for app-server; thread=${threadId || "none"} completed=${completed}`;
    child.kill();
  }, timeoutMs);

  while (!completed && !failed) {
    await delay(50);
  }

  clearTimeout(timeout);
  child.kill();
  assert.equal(failed, "");
  assert.ok(threadId, "app-server thread/start should return a thread id");
  assert.ok(metrics.firstEventMs !== null, "app-server should emit turn events");
  assert.ok(metrics.firstDeltaMs !== null, "app-server should emit assistant deltas");
  assert.ok(metrics.completedMs !== null, "app-server should complete");
  return metrics;

  function handleAppServerMessage(message) {
    if (message.error) {
      failed ||= JSON.stringify(message.error);
      child.kill();
      return;
    }
    if (message.id === 1) {
      metrics.initializedMs = elapsed(startedAt);
      send(child, 2, "thread/start", {
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
      return;
    }
    if (message.id === 2) {
      threadId = message.result?.thread?.id || "";
      metrics.threadReadyMs = elapsed(startedAt);
      if (!threadId) {
        failed ||= `thread/start response missing thread id: ${JSON.stringify(message)}`;
        child.kill();
        return;
      }
      send(child, 3, "turn/start", {
        threadId,
        input: [{ type: "text", text: "Reply with exactly: ok", text_elements: [] }],
        cwd,
        model: "gpt-5.5",
        effort: "low",
        approvalPolicy: "never",
        sandboxPolicy: { type: "dangerFullAccess" },
      });
      metrics.turnRequestedMs = elapsed(startedAt);
      return;
    }
    if (!message.method || message.params?.threadId !== threadId) return;
    metrics.events += 1;
    metrics.firstEventMs ??= elapsed(startedAt);
    if (message.method === "item/agentMessage/delta") {
      metrics.firstDeltaMs ??= elapsed(startedAt);
    }
    if (message.method === "turn/completed") {
      metrics.completedMs = elapsed(startedAt);
      completed = true;
    }
  }
}

async function smokeExecJson() {
  const startedAt = performance.now();
  const child = spawnCodex([
    "exec",
    "--json",
    "--model",
    "gpt-5.5",
    "--skip-git-repo-check",
    "--",
    "Reply with exactly: ok",
  ]);
  child.stdin.end();
  const metrics = {
    transport: "codex-exec-json",
    providerStartedMs: 0,
    firstEventMs: null,
    firstAssistantItemMs: null,
    completedMs: null,
    events: 0,
  };
  let buffer = "";
  let failed = "";
  let completed = false;

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      handleExecMessage(JSON.parse(line));
    }
  });
  child.stderr.on("data", maybeWriteVerbose);
  child.on("exit", (code) => {
    if (!completed && !failed) failed = `codex exec exited early with code ${code}`;
  });

  const timeout = setTimeout(() => {
    failed ||= `timed out waiting for codex exec; completed=${completed}`;
    child.kill();
  }, timeoutMs);

  while (!completed && !failed) {
    await delay(50);
  }

  clearTimeout(timeout);
  child.kill();
  assert.equal(failed, "");
  assert.ok(metrics.firstEventMs !== null, "codex exec should emit json events");
  assert.ok(metrics.firstAssistantItemMs !== null, "codex exec should emit an agent message");
  assert.ok(metrics.completedMs !== null, "codex exec should complete");
  return metrics;

  function handleExecMessage(message) {
    metrics.events += 1;
    metrics.firstEventMs ??= elapsed(startedAt);
    if (message.type === "item.completed" && message.item?.type === "agent_message") {
      metrics.firstAssistantItemMs ??= elapsed(startedAt);
    }
    if (message.type === "turn.completed") {
      metrics.completedMs = elapsed(startedAt);
      completed = true;
    }
  }
}

function spawnCodex(args) {
  return spawn("codex", args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function send(child, id, method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
}

function elapsed(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeWriteVerbose(chunk) {
  if (process.env.HYPERWIKI_CODEX_ADAPTER_SMOKE_VERBOSE === "1") {
    process.stderr.write(chunk);
  }
}
