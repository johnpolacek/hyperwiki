/// <reference types="vite/client" />

interface Window {
  __TAURI__?: {
    core?: {
      invoke?: (command: string, payload?: unknown) => Promise<unknown>;
    };
  };
}
