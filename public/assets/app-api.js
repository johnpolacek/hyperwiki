const tauriRequestCommand = "hyperwiki_request";

export const hyperwikiApi = createHyperwikiApi();

export function createHyperwikiApi(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  const invokeImpl = options.invokeImpl || globalThis.__TAURI__?.core?.invoke;
  const forceTransport = options.transport || "";

  async function request(path, options = {}) {
    const normalized = normalizeRequest(path, options);
    if (shouldUseTauri(forceTransport, invokeImpl)) {
      return requestTauri(invokeImpl, normalized);
    }
    return requestFetch(fetchImpl, normalized);
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

function shouldUseTauri(forceTransport, invokeImpl) {
  if (forceTransport === "fetch") return false;
  if (forceTransport === "tauri") return true;
  return typeof invokeImpl === "function";
}

async function requestTauri(invokeImpl, request) {
  if (typeof invokeImpl !== "function") {
    throw new Error("Tauri command transport is unavailable.");
  }
  const response = await invokeImpl(tauriRequestCommand, { request });
  return normalizeResponse(response);
}

async function requestFetch(fetchImpl, request) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch transport is unavailable.");
  }
  const response = await fetchImpl(request.path, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  const text = await response.text();
  return normalizeResponse({
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text
  });
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
