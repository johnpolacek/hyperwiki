const tauriRequestCommand = "hyperwiki_request";

export const hyperwikiApi = createHyperwikiApi();

type TauriInvoke = (command: string, payload?: unknown) => Promise<unknown>;
type TauriGlobal = typeof globalThis & {
  __TAURI__?: {
    core?: {
      invoke?: TauriInvoke;
    };
  };
};

export interface HyperwikiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HyperwikiResponse<T = unknown> {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text: string;
  json: T | null;
}

export function createHyperwikiApi(options: { invokeImpl?: TauriInvoke | null } = {}) {
  const invokeImpl = options.invokeImpl || (globalThis as TauriGlobal).__TAURI__?.core?.invoke;

  async function request<T = unknown>(requestPath: string, requestOptions: HyperwikiRequestOptions = {}) {
    const normalized = normalizeRequest(requestPath, requestOptions);
    return requestTauri<T>(invokeImpl, normalized);
  }

  return {
    request,
    async json<T = unknown>(requestPath: string, requestOptions: HyperwikiRequestOptions = {}) {
      const response = await request<T>(requestPath, requestOptions);
      if (!response.ok) {
        throw new Error(response.text || `Request failed: ${response.status}`);
      }
      return response.json as T;
    },
    async text(requestPath: string, requestOptions: HyperwikiRequestOptions = {}) {
      const response = await request(requestPath, requestOptions);
      if (!response.ok) {
        throw new Error(response.text || `Request failed: ${response.status}`);
      }
      return response.text;
    },
  };
}

function normalizeRequest(path: string, options: HyperwikiRequestOptions = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {}),
  };
  return {
    path,
    method: String(options.method || "GET").toUpperCase(),
    headers,
    body: typeof options.body === "string" ? options.body : options.body ? JSON.stringify(options.body) : null,
  };
}

async function requestTauri<T>(invokeImpl: TauriInvoke | undefined | null, request: ReturnType<typeof normalizeRequest>): Promise<HyperwikiResponse<T>> {
  if (typeof invokeImpl !== "function") {
    throw new Error("Hyperwiki must run inside the Tauri desktop app. Tauri command transport is unavailable.");
  }
  const response = await invokeImpl(tauriRequestCommand, { request });
  return normalizeResponse<T>(response);
}

function normalizeResponse<T>(response: unknown): HyperwikiResponse<T> {
  const value = response && typeof response === "object" ? response as { ok?: boolean; status?: number; headers?: Record<string, string>; text?: string } : {};
  const text = typeof value.text === "string" ? value.text : "";
  return {
    ok: value.ok !== false && Number(value.status || 200) < 400,
    status: Number(value.status || 200),
    headers: value.headers || {},
    text,
    json: parseJson<T>(text),
  };
}

function parseJson<T>(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
