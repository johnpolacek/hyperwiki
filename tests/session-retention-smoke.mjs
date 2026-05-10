import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionRegistry } from "../src/sessions.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-session-retention-"));
const registry = new SessionRegistry(root);

await registry.upsert("active", { name: "active", status: "active", mode: "pty" });
for (let index = 0; index < 30; index += 1) {
  await registry.upsert(`closed-${index}`, { name: `closed-${index}`, status: "closed", mode: "pty" });
}

const sessions = await registry.list();
const closed = sessions.filter((session) => session.status === "closed");
if (closed.length > 25) {
  throw new Error(`Expected at most 25 retained closed sessions, got ${closed.length}`);
}

const exported = await registry.export("active");
if (exported.boundary !== "runtime-only") {
  throw new Error(`Expected runtime-only export boundary, got ${exported.boundary}`);
}

const active = (await registry.list()).find((session) => session.id === "active");
if (!active.exportedAt) {
  throw new Error("Expected exported session metadata to record exportedAt.");
}

console.log("session retention smoke test passed");
