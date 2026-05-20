import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export class SessionRegistry {
  constructor(root) {
    this.root = root;
    this.sessionsDir = path.join(root, ".hyperwiki", "sessions");
    this.sessions = new Map();
    this.closers = new Map();
  }

  async list(options = {}) {
    await this.#ensureDir();
    if (options.prune !== false) {
      await this.prune();
    }
    const persisted = await this.#readPersisted();
    const merged = new Map(persisted.map((session) => [session.id, session]));
    for (const [id, session] of this.sessions) {
      merged.set(id, { ...merged.get(id), ...session });
    }
    return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsert(id, updates = {}, closer = null) {
    await this.#ensureDir();
    const now = new Date().toISOString();
    const existing = this.sessions.get(id) || (await this.#readOne(id)) || {};
    const session = {
      id,
      name: updates.name || existing.name || id,
      kind: updates.kind || existing.kind || "terminal",
      status: updates.status || existing.status || "active",
      mode: updates.mode || existing.mode || "unknown",
      role: updates.role || existing.role || "shell",
      command: updates.command ?? existing.command ?? null,
      shell: updates.shell || existing.shell || null,
      pid: updates.pid ?? existing.pid ?? null,
      cwd: updates.cwd || existing.cwd || this.root,
      scope: updates.scope || existing.scope || "global",
      scopeKind: updates.scopeKind || existing.scopeKind || "global",
      planPath: updates.planPath ?? existing.planPath ?? null,
      connectedClients: updates.connectedClients ?? existing.connectedClients ?? 0,
      lastAttachedAt: updates.lastAttachedAt ?? existing.lastAttachedAt ?? null,
      retained: updates.retained ?? existing.retained ?? true,
      reconnectable: updates.reconnectable ?? existing.reconnectable ?? true,
      exportedAt: updates.exportedAt ?? existing.exportedAt ?? null,
      createdAt: existing.createdAt || now,
      updatedAt: now,
      closedAt: updates.status === "closed" ? now : existing.closedAt || null
    };
    this.sessions.set(id, session);
    if (closer) {
      this.closers.set(id, closer);
    }
    await this.#writeOne(session);
    return session;
  }

  setCloser(id, closer) {
    if (closer) {
      this.closers.set(id, closer);
    }
  }

  async rename(id, name) {
    if (!name || typeof name !== "string") {
      throw new Error("Session name is required.");
    }
    return this.upsert(id, { name: name.trim() || id });
  }

  async close(id) {
    const closer = this.closers.get(id);
    if (closer) {
      closer();
      this.closers.delete(id);
    }
    return this.upsert(id, { status: "closed" });
  }

  async export(id) {
    const session = this.sessions.get(id) || (await this.#readOne(id));
    if (!session) {
      throw new Error("Session not found.");
    }
    await this.upsert(id, { exportedAt: new Date().toISOString() });
    return {
      exportedAt: new Date().toISOString(),
      boundary: "runtime-only",
      note: "This export is returned to the caller. hyperwiki does not write terminal runtime state into repo-visible wiki files automatically.",
      session
    };
  }

  async prune() {
    await this.#ensureDir();
    const sessions = await this.#readPersisted();
    const closed = sessions
      .filter((session) => session.status === "closed")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const keepClosed = new Set(closed.slice(0, 25).map((session) => session.id));
    for (const session of sessions) {
      if (session.status === "closed" && !keepClosed.has(session.id)) {
        await rm(path.join(this.sessionsDir, `${safeId(session.id)}.json`), { force: true });
        this.sessions.delete(session.id);
      }
    }
  }

  async #ensureDir() {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  async #readPersisted() {
    if (!existsSync(this.sessionsDir)) {
      return [];
    }
    const entries = await readdir(this.sessionsDir, { withFileTypes: true });
    const sessions = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const session = await this.#readOne(entry.name.replace(/\.json$/, ""));
        if (session) {
          sessions.push(session);
        }
      }
    }
    return sessions;
  }

  async #readOne(id) {
    const filePath = path.join(this.sessionsDir, `${safeId(id)}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  async #writeOne(session) {
    const filePath = path.join(this.sessionsDir, `${safeId(session.id)}.json`);
    await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "-");
}
