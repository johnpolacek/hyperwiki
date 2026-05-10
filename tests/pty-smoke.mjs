import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPtySession } from "../src/pty.js";
import { SessionRegistry } from "../src/sessions.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-pty-smoke-"));
const registry = new SessionRegistry(root);
const port = 4199;
const wss = new WebSocketServer({ port });

wss.on("connection", (ws) => {
  const session = createPtySession(root, ws, { id: "pty-smoke", name: "pty-smoke", registry });
  ws.on("close", () => session.close());
});

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
let output = "";

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`PTY smoke timed out: ${output}`)), 5000);
  ws.on("open", () => ws.send("printf HYPERWIKI_REAL_PTY_OK\\n\nexit\n"));
  ws.on("message", (chunk) => {
    output += chunk.toString();
    if (output.includes("HYPERWIKI_REAL_PTY_OK")) {
      clearTimeout(timer);
      resolve();
    }
  });
  ws.on("error", reject);
});

await done;
ws.close();
wss.close();

const session = (await registry.list()).find((item) => item.id === "pty-smoke");
if (!session) {
  throw new Error("Missing PTY smoke session metadata.");
}
if (session.mode !== "pty") {
  throw new Error(`Expected real PTY mode, got ${session.mode}.`);
}

console.log("real PTY smoke test passed");
