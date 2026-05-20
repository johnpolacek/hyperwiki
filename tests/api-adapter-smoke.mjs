import assert from "node:assert/strict";
import { createHyperwikiApi } from "../public/app-api.js";

const fetchApi = createHyperwikiApi({
  transport: "fetch",
  fetchImpl: async (path, options) => ({
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    async text() {
      return JSON.stringify({ path, method: options.method, body: options.body });
    }
  })
});

assert.deepEqual(await fetchApi.json("/api/workspace", { method: "POST", body: "{}" }), {
  path: "/api/workspace",
  method: "POST",
  body: "{}"
});

let invoked = null;
const tauriApi = createHyperwikiApi({
  transport: "tauri",
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
  transport: "fetch",
  fetchImpl: async () => ({
    ok: false,
    status: 418,
    headers: new Map(),
    async text() {
      return "teapot";
    }
  })
});

await assert.rejects(() => failingApi.json("/api/fail"), /teapot/);
