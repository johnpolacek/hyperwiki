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
  const session = createManagedPtySession(root, metadata);
  session.attach(ws);
  return {
    id: session.id,
    write(data) {
      session.write(data);
    },
    close() {
      session.close();
    }
  };
}

export function createManagedPtySession(root, metadata = {}) {
  const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash");
  const id = metadata.id || randomUUID();
  const name = metadata.name || id;
  const registry = metadata.registry;
  const clients = new Set();
  let outputBuffer = "";
  let closed = false;

  function rememberOutput(data) {
    outputBuffer = `${outputBuffer}${String(data)}`.slice(-CODEX_READY_BUFFER_LIMIT);
  }

  function broadcast(data) {
    rememberOutput(data);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  function markAttached() {
    void registry?.upsert(id, {
      status: "active",
      connectedClients: clients.size,
      lastAttachedAt: new Date().toISOString()
    });
  }

  function markDetached() {
    if (closed) return;
    void registry?.upsert(id, {
      status: clients.size > 0 ? "active" : "detached",
      connectedClients: clients.size
    });
  }

  function attachSocket(ws, onMessage) {
    clients.add(ws);
    if (outputBuffer && ws.readyState === 1) {
      ws.send(outputBuffer);
    }
    markAttached();
    ws.on("message", onMessage);
    ws.on("close", () => {
      clients.delete(ws);
      markDetached();
    });
  }

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
      cwd: root,
      scope: metadata.scope || "global",
      scopeKind: metadata.scopeKind || "global",
      planPath: metadata.planPath || null,
      connectedClients: 0
    });
  } catch (error) {
    return createManagedPipeSession(root, shell, error, {
      id,
      name,
      registry,
      role: metadata.role || "shell",
      command: metadata.command ?? null,
      scope: metadata.scope || "global",
      scopeKind: metadata.scopeKind || "global",
      planPath: metadata.planPath || null
    });
  }

  const writeGate = createAgentWriteGate(metadata, (data) => terminal.write(data));

  terminal.onData((data) => {
    broadcast(data);
    writeGate.observe(data);
  });

  terminal.onExit(({ exitCode }) => {
    closed = true;
    void registry?.upsert(id, { status: "closed", connectedClients: 0 });
    broadcast(`\r\n[hyperwiki] session exited with code ${exitCode ?? "unknown"}\r\n`);
    for (const client of clients) {
      if (client.readyState === 1) client.close();
    }
    clients.clear();
    metadata.onClose?.(id);
  });

  function handleMessage(raw) {
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
  }

  return {
    id,
    attach(ws) {
      attachSocket(ws, handleMessage);
    },
    write(data) {
      writeGate.write(data);
    },
    close() {
      closed = true;
      void registry?.upsert(id, { status: "closed", connectedClients: 0 });
      terminal.kill();
      for (const client of clients) {
        if (client.readyState === 1) client.close();
      }
      clients.clear();
      metadata.onClose?.(id);
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

function createManagedPipeSession(root, shell, spawnError, metadata) {
  const clients = new Set();
  let outputBuffer = "";
  let closed = false;
  const child = spawn(shell, [], {
    cwd: root,
    env: { ...process.env, TERM: "xterm-256color" },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const warning = `\r\n[hyperwiki] PTY spawn failed; using pipe fallback for this session.\r\n[hyperwiki] ${spawnError.message}\r\n\r\n`;
  function rememberOutput(data) {
    outputBuffer = `${outputBuffer}${String(data)}`.slice(-CODEX_READY_BUFFER_LIMIT);
  }
  function broadcast(data) {
    rememberOutput(data);
    for (const client of clients) {
      if (client.readyState === 1) client.send(data);
    }
  }
  void metadata.registry?.upsert(metadata.id, {
    name: metadata.name,
    status: "active",
    mode: "pipe-fallback",
    role: metadata.role || "shell",
    command: metadata.command ?? null,
    shell,
    pid: child.pid,
    cwd: root,
    scope: metadata.scope || "global",
    scopeKind: metadata.scopeKind || "global",
    planPath: metadata.planPath || null,
    connectedClients: 0
  });

  const writeGate = createAgentWriteGate(metadata, (data) => child.stdin.write(data));
  child.stdout.on("data", (data) => {
    broadcast(data);
    writeGate.observe(data);
  });
  child.stderr.on("data", (data) => {
    broadcast(data);
    writeGate.observe(data);
  });
  child.on("exit", (code) => {
    closed = true;
    void metadata.registry?.upsert(metadata.id, { status: "closed", connectedClients: 0 });
    broadcast(`\r\n[hyperwiki] session exited with code ${code ?? "unknown"}\r\n`);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.close();
      }
    }
    clients.clear();
    metadata.onClose?.(metadata.id);
  });

  function handleMessage(raw) {
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
  }

  return {
    id: metadata.id,
    attach(ws) {
      clients.add(ws);
      if (ws.readyState === 1) {
        ws.send(`${warning}${outputBuffer}`);
      }
      void metadata.registry?.upsert(metadata.id, {
        status: "active",
        connectedClients: clients.size,
        lastAttachedAt: new Date().toISOString()
      });
      ws.on("message", handleMessage);
      ws.on("close", () => {
        clients.delete(ws);
        if (!closed) {
          void metadata.registry?.upsert(metadata.id, {
            status: clients.size > 0 ? "active" : "detached",
            connectedClients: clients.size
          });
        }
      });
    },
    write(data) {
      writeGate.write(data);
    },
    close() {
      closed = true;
      void metadata.registry?.upsert(metadata.id, { status: "closed", connectedClients: 0 });
      child.kill();
      for (const client of clients) {
        if (client.readyState === 1) client.close();
      }
      clients.clear();
      metadata.onClose?.(metadata.id);
    }
  };
}
