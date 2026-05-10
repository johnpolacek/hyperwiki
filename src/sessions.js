import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export class SessionRegistry {
  constructor(root) {
    this.root = root;
    this.sessionsDir = path.join(root, ".hyperwiki", "sessions");
    this.sessions = new Map();
    this.closers = new Map();
  }

  async list() {
    await this.#ensureDir();
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
      shell: updates.shell || existing.shell || null,
      pid: updates.pid ?? existing.pid ?? null,
      cwd: updates.cwd || existing.cwd || this.root,
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
