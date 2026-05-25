import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(path.resolve("src/lib/api.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = path.join(os.tmpdir(), `hyperwiki-api-smoke-${process.pid}`);
await mkdir(tempDir, { recursive: true });
const tempModule = path.join(tempDir, "api.mjs");
await writeFile(tempModule, compiled);

const { createHyperwikiApi } = await import(pathToFileURL(tempModule).href);

let invoked = null;
const tauriApi = createHyperwikiApi({
  invokeImpl: async (command, payload) => {
    invoked = { command, payload };
    return {
      ok: true,
      status: 200,
      text: JSON.stringify({ ok: true, path: payload.request.path })
    };
  }
});

assert.deepEqual(await tauriApi.json("/api/projects"), { ok: true, path: "/api/projects" });
assert.equal(invoked.command, "hyperwiki_request");
assert.equal(invoked.payload.request.method, "GET");

const failingApi = createHyperwikiApi({
  invokeImpl: async () => ({ ok: false, status: 418, text: "teapot" })
});

await assert.rejects(() => failingApi.json("/api/fail"), /teapot/);
await assert.rejects(
  () => createHyperwikiApi({ invokeImpl: null }).json("/api/projects"),
  /Tauri desktop app/
);
