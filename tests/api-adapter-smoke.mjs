import assert from "node:assert/strict";
import { createHyperwikiApi } from "../public/app-api.js";

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
