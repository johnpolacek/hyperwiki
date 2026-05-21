const tauriRequestCommand = "hyperwiki_request";

export const hyperwikiApi = createHyperwikiApi();

export function createHyperwikiApi(options = {}) {
  const invokeImpl = options.invokeImpl || globalThis.__TAURI__?.core?.invoke;

  async function request(path, options = {}) {
    const normalized = normalizeRequest(path, options);
    return requestTauri(invokeImpl, normalized);
  }

  return {
    request,
    async json(path, options = {}) {
      const response = await request(path, options);
      if (!response.ok) {
        throw new Error(response.text || `Request failed: ${response.status}`);
      }
      return response.json;
    },
    async text(path, options = {}) {
      const response = await request(path, options);
      if (!response.ok) {
        throw new Error(response.text || `Request failed: ${response.status}`);
      }
      return response.text;
    }
  };
}

function normalizeRequest(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };
  return {
    path,
    method: String(options.method || "GET").toUpperCase(),
    headers,
    body: typeof options.body === "string" ? options.body : options.body ? JSON.stringify(options.body) : null
  };
}

async function requestTauri(invokeImpl, request) {
  if (typeof invokeImpl !== "function") {
    throw new Error("Hyperwiki must run inside the Tauri desktop app. Tauri command transport is unavailable.");
  }
  const response = await invokeImpl(tauriRequestCommand, { request });
  return normalizeResponse(response);
}

function normalizeResponse(response = {}) {
  const text = typeof response.text === "string" ? response.text : "";
  return {
    ok: response.ok !== false && Number(response.status || 200) < 400,
    status: Number(response.status || 200),
    headers: response.headers || {},
    text,
    json: parseJson(text)
  };
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
