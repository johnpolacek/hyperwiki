import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = [await readFile("src/App.tsx", "utf8"), await readFile("src/components/views/SettingsView.tsx", "utf8"), await readFile("src/lib/terminal-notifications.ts", "utf8"), await readFile("src/components/terminal/TerminalPane.tsx", "utf8"), await readFile("src/components/terminal/XtermSession.tsx", "utf8"), await readFile("src/lib/terminal.ts", "utf8")].join("\n");
const settings = await readFile("src-tauri/src/domain/settings.rs", "utf8");
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const capability = await readFile("src-tauri/capabilities/main.json", "utf8");
const tauriLib = await readFile("src-tauri/src/lib.rs", "utf8");
const terminals = await readFile("src-tauri/src/domain/terminals.rs", "utf8");
const command = await readFile("src-tauri/src/command.rs", "utf8");

assert.ok(source.includes("@tauri-apps/plugin-notification"), "React app should import the Tauri notification plugin.");
assert.ok(source.includes("listenTerminalCompletion") && source.includes('"terminal://completion"'), "React app should listen for terminal completion events.");
assert.ok(source.includes("isPermissionGranted") && source.includes("requestPermission") && source.includes("sendNotification"), "React app should request permission and send OS notifications.");
assert.ok(source.includes("document.hasFocus()"), "Terminal completion notifications should be gated by app focus.");
assert.ok(source.includes("armAgentCompletion(session, label)") && source.includes('reason: "agent-ready"'), "Agent prompt submissions should arm agent-ready completion notifications.");
assert.ok(source.includes("terminalCompletionNotificationSettings") && source.includes("Only when hyperwiki is unfocused"), "Settings UI should expose terminal completion notification preferences.");

assert.ok(settings.includes('"notifications"') && settings.includes('"terminalCompletion"') && settings.includes('"onlyWhenUnfocused": true'), "Settings defaults should include terminal completion notification preferences.");
assert.ok(cargo.includes("tauri-plugin-notification"), "Rust dependencies should include the notification plugin.");
assert.ok(capability.includes("notification:default"), "Main Tauri capability should grant notification plugin permissions.");
assert.ok(tauriLib.includes("tauri_plugin_notification::init()"), "Tauri app builder should initialize the notification plugin.");

assert.ok(terminals.includes("TERMINAL_COMPLETION_EVENT") && terminals.includes("TerminalCompletionEvent"), "Terminal domain should define completion events.");
assert.ok(terminals.includes("reap_completed_sessions") && terminals.includes("try_wait"), "Terminal domain should reap naturally exited child processes.");
assert.ok(command.includes("manager.reap_completed_sessions(app.as_ref())"), "Session listing should emit completion events when live terminal processes exit.");

console.log("terminal completion notifications static smoke passed");
