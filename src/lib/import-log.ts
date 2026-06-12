const importLogStorageKey = "hyperwiki.importLog";

export function readImportLog() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(importLogStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-16) : [];
  } catch {
    return [];
  }
}

export function appendImportLog(message: string, error?: unknown) {
  const line = `${new Date().toLocaleTimeString()} ${message}`;
  try {
    const next = [...readImportLog(), line].slice(-16);
    window.sessionStorage.setItem(importLogStorageKey, JSON.stringify(next));
  } catch {
    // Import logging is diagnostic only.
  }
  if (error) {
    console.error(`[hyperwiki] import ui ${message}`, error);
  } else {
    console.info(`[hyperwiki] import ui ${message}`);
  }
}

export function clearImportLog() {
  try {
    window.sessionStorage.removeItem(importLogStorageKey);
  } catch {
    // Ignore diagnostic cleanup failures.
  }
}
