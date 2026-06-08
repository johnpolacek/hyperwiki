import { readFileSync } from "node:fs";

const appSource = readFileSync("src/App.tsx", "utf8");
const commandSource = readFileSync("src-tauri/src/command.rs", "utf8");
const envSource = readFileSync("src-tauri/src/domain/project_env.rs", "utf8");

for (const needle of [
  "function ProjectEnvEditor",
  "withProjectQuery(\"/api/project-env\", activeProject)",
  "onOpenProjectEnv",
  "Missing env key detected",
  "detectEnvKeyFromTerminalText",
  "RUNTIME_ENV_KEY_HINT_DENYLIST",
  "\"PORTLESS_URL\"",
  "!isRuntimeEnvKeyHintIgnored(candidate)",
  "Store local keys in the active checkout's",
  "fixed bottom-3 left-3 z-50",
  "grid min-w-0 grid-cols-[minmax(0,1fr)_auto]",
  "h-9 min-w-0 rounded-md border bg-card",
  "PROJECT_ENV_AUTOSAVE_DELAY_MS",
  "Autosaves after a short pause.",
  "Autosaving .env.local",
  "type ProjectEnvStatusTone",
  "setStatus(mode === \"auto\"",
  "? \"Saved\"",
  "statusTone === \"success\" ? <Check",
  "isSaving ? <Loader2",
  "value set in .env.local",
  "showingStoredMask",
  "****************",
  "Paste to replace saved value",
  "setFocusedValueRows",
  "Secret is saved locally. Paste a new value only if you want to replace it.",
]) {
  if (!appSource.includes(needle)) {
    throw new Error(`Project env UI is missing ${needle}`);
  }
}

if (appSource.includes('isSaving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check')) {
  throw new Error("Project env manual save button should not show an idle check icon.");
}

if (appSource.includes('updateRow(row.id, { value: "****************"')) {
  throw new Error("Project env stored-value mask must not be written into row values.");
}

if (appSource.includes("fixed inset-0 z-50 grid place-items-center bg-black/45") || appSource.includes('aria-modal="true"')) {
  throw new Error("Project env editor must stay a non-modal bottom-left drawer so terminal instructions remain visible.");
}

if (!appSource.includes("env") || !appSource.includes("Add env var")) {
  throw new Error("Terminal pane should expose env and missing-key actions.");
}

if (!commandSource.includes("/api/project-env") || !commandSource.includes("update_project_env")) {
  throw new Error("Tauri command router must expose /api/project-env.");
}

for (const needle of [
  "ProjectEnvUpdateRequest",
  ".env.local is not ignored by Git",
  "ensure_env_local_ignored",
  "masked_value",
  "write_secret_file_atomically",
]) {
  if (!envSource.includes(needle)) {
    throw new Error(`Project env backend is missing ${needle}`);
  }
}

if (appSource.includes("sendInput(session.id, initialKey") || appSource.includes("sendInput(session.id, row.value")) {
  throw new Error("Project env values must not be sent through terminal input.");
}

if (!appSource.includes("if (terminalEnvHint && isRuntimeEnvKeyHintIgnored(terminalEnvHint.key))")) {
  throw new Error("Ignored runtime env hints should be cleared if already visible.");
}
