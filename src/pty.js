import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import pty from "node-pty";

const require = createRequire(import.meta.url);
const CODEX_READY_BUFFER_LIMIT = 20000;

export function codexReadyFromOutput(output) {
  const clean = stripAnsi(String(output || ""));
  const bannerIndex = clean.lastIndexOf("OpenAI Codex");
  if (bannerIndex === -1) return false;
  return clean.slice(bannerIndex).includes("›");
}

function stripAnsi(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "");
}

function createAgentWriteGate(metadata, writeDirect) {
  const command = String(metadata.command || "");
  const shouldWaitForCodex = metadata.role === "agent" && /\bcodex\b/.test(command);
  let ready = !shouldWaitForCodex;
  let outputBuffer = "";
  const pendingWrites = [];

  function flushPendingWrites() {
    while (pendingWrites.length > 0) {
      writeDirect(pendingWrites.shift());
    }
  }

  return {
    observe(data) {
      if (ready) return;
      outputBuffer = `${outputBuffer}${String(data)}`.slice(-CODEX_READY_BUFFER_LIMIT);
      if (codexReadyFromOutput(outputBuffer)) {
        ready = true;
        flushPendingWrites();
      }
    },
    write(data) {
      const value = String(data);
      if (ready) {
        writeDirect(value);
        return;
      }
      pendingWrites.push(value);
    }
  };
}

export function createPtySession(root, ws, metadata = {}) {
  const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash");
  const id = metadata.id || randomUUID();
  const name = metadata.name || id;
  const registry = metadata.registry;
  let terminal;
  try {
    ensureNodePtyHelperExecutable();
    terminal = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: root,
      env: { ...process.env, TERM: "xterm-256color" }
    });
    void registry?.upsert(id, {
      name,
      status: "active",
      mode: "pty",
      role: metadata.role || "shell",
      command: metadata.command ?? null,
      shell,
      pid: terminal.pid,
      cwd: root
    });
  } catch (error) {
    return createPipeSession(root, shell, ws, error, {
      id,
      name,
      registry,
      role: metadata.role || "shell",
      command: metadata.command ?? null
    });
  }

  const writeGate = createAgentWriteGate(metadata, (data) => terminal.write(data));

  terminal.onData((data) => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
    writeGate.observe(data);
  });

  ws.on("message", (raw) => {
    const message = raw.toString();
    if (message.startsWith("{")) {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === "resize") {
          terminal.resize(Number(parsed.cols) || 100, Number(parsed.rows) || 30);
          return;
        }
      } catch {
        // Fall through and write raw data below.
      }
    }
    terminal.write(message);
  });
  return {
    id,
    write(data) {
      writeGate.write(data);
    },
    close() {
      void registry?.upsert(id, { status: "closed" });
      terminal.kill();
    }
  };
}

function ensureNodePtyHelperExecutable() {
  if (os.platform() !== "darwin") {
    return;
  }
  const packageRoot = path.dirname(require.resolve("node-pty/package.json"));
  const helperPath = path.join(packageRoot, "prebuilds", `${os.platform()}-${os.arch()}`, "spawn-helper");
  if (existsSync(helperPath)) {
    chmodSync(helperPath, constants.S_IRUSR | constants.S_IWUSR | constants.S_IXUSR | constants.S_IRGRP | constants.S_IXGRP | constants.S_IROTH | constants.S_IXOTH);
  }
}

function createPipeSession(root, shell, ws, spawnError, metadata) {
  const child = spawn(shell, [], {
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const warning = `\r\n[hyperwiki] PTY spawn failed; using pipe fallback for this session.\r\n[hyperwiki] ${spawnError.message}\r\n\r\n`;
  ws.send(warning);
  void metadata.registry?.upsert(metadata.id, {
    name: metadata.name,
    status: "active",
    mode: "pipe-fallback",
    role: metadata.role || "shell",
    command: metadata.command ?? null,
    shell,
    pid: child.pid,
    cwd: root
  });

  const writeGate = createAgentWriteGate(metadata, (data) => child.stdin.write(data));
  child.stdout.on("data", (data) => {
    if (ws.readyState === 1) ws.send(data);
    writeGate.observe(data);
  });
  child.stderr.on("data", (data) => {
    if (ws.readyState === 1) ws.send(data);
    writeGate.observe(data);
  });
  child.on("exit", (code) => {
    void metadata.registry?.upsert(metadata.id, { status: "closed" });
    if (ws.readyState === 1) {
      ws.send(`\r\n[hyperwiki] session exited with code ${code ?? "unknown"}\r\n`);
      ws.close();
    }
  });

  ws.on("message", (raw) => {
    const message = raw.toString();
    if (message.startsWith("{")) {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === "resize") {
          return;
        }
      } catch {
        // Fall through and write raw data below.
      }
    }
    child.stdin.write(message);
  });
  return {
    id: metadata.id,
    write(data) {
      writeGate.write(data);
    },
    close() {
      void metadata.registry?.upsert(metadata.id, { status: "closed" });
      child.kill();
    }
  };
}
