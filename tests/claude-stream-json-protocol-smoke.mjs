import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

// Claude Code is optional in CI. Skip cleanly when the CLI is not installed so
// this smoke only runs where a `claude` binary is available.
const probe = spawnSync("which", ["claude"], { stdio: "ignore" });
if (probe.status !== 0) {
  console.log("claude stream-json protocol smoke skipped (claude not on PATH)");
  process.exit(0);
}

const cwd = process.cwd();
const deadlineMs = Number(process.env.HYPERWIKI_CLAUDE_STREAM_SMOKE_TIMEOUT_MS || 60000);
const child = spawn(
  "claude",
  [
    "-p",
    "Reply with exactly: ok",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--model",
    "sonnet",
  ],
  { cwd, stdio: ["ignore", "pipe", "pipe"] },
);

let buffer = "";
let sawInit = false;
let sawAssistant = false;
let result = null;
let failed = "";

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split(/\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      failed ||= `non-JSON stream line: ${line} (${error})`;
      continue;
    }
    handleMessage(message);
  }
});

child.stderr.on("data", (chunk) => {
  if (process.env.HYPERWIKI_CLAUDE_STREAM_SMOKE_VERBOSE === "1") {
    process.stderr.write(chunk);
  }
});

child.on("exit", (code) => {
  if (!result && !failed) failed = `claude exited early with code ${code}`;
});

const timeout = setTimeout(() => {
  failed ||= `timed out; sawInit=${sawInit} sawAssistant=${sawAssistant} result=${result ? "yes" : "no"}`;
  child.kill();
}, deadlineMs);

while (!result && !failed) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

clearTimeout(timeout);
child.kill();

assert.equal(failed, "");
assert.equal(sawInit, true, "stream should emit a system/init event carrying a session_id");
assert.equal(sawAssistant, true, "stream should emit at least one assistant message");
assert.ok(result, "stream should emit a terminal result event");
assert.notEqual(result.is_error, true, `result should not be an error: ${JSON.stringify(result)}`);
console.log("claude stream-json protocol smoke passed");

function handleMessage(message) {
  switch (message.type) {
    case "system":
      if (message.subtype === "init" && typeof message.session_id === "string") sawInit = true;
      break;
    case "assistant":
      sawAssistant = true;
      break;
    case "result":
      result = message;
      break;
    default:
      break;
  }
}
