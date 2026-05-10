import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pty from "node-pty";

export function createPtySession(root, ws, metadata = {}) {
  const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash");
  const id = metadata.id || randomUUID();
  const name = metadata.name || id;
  const registry = metadata.registry;
  let terminal;
  try {
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
      shell,
      pid: terminal.pid,
      cwd: root
    });
  } catch (error) {
    return createPipeSession(root, shell, ws, error, { id, name, registry });
  }

  terminal.onData((data) => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
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
    close() {
      void registry?.upsert(id, { status: "closed" });
      terminal.kill();
    }
  };
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
    shell,
    pid: child.pid,
    cwd: root
  });

  child.stdout.on("data", (data) => ws.readyState === 1 && ws.send(data));
  child.stderr.on("data", (data) => ws.readyState === 1 && ws.send(data));
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
    close() {
      void metadata.registry?.upsert(metadata.id, { status: "closed" });
      child.kill();
    }
  };
}
