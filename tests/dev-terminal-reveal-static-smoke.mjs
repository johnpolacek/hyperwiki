import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");

const terminalPaneStart = source.indexOf("function TerminalPane");
const terminalPaneEnd = source.indexOf("function TerminalSessionTab", terminalPaneStart);
assert.notEqual(terminalPaneStart, -1, "TerminalPane should exist.");
assert.notEqual(terminalPaneEnd, -1, "TerminalSessionTab should follow TerminalPane.");
const terminalPane = source.slice(terminalPaneStart, terminalPaneEnd);

assert.ok(
  terminalPane.includes("dev terminal"),
  "Running dev state should expose a dedicated dev terminal reveal control.",
);
assert.ok(
  terminalPane.includes("stop dev"),
  "Running managed dev state should keep a separate stop dev control.",
);
assert.equal(
  terminalPane.includes("onClick={canStopDev ? props.onStopDev : props.onRunDev}"),
  false,
  "The primary dev button should not toggle between reveal/run and destructive stop behavior.",
);
assert.ok(
  terminalPane.includes("collapsedSessionIds"),
  "TerminalPane should track collapsed terminal panes.",
);
assert.ok(
  terminalPane.includes("aria-expanded={!isCollapsed}"),
  "Collapsed terminal headers should expose expanded state.",
);
assert.ok(
  terminalPane.includes("scrollIntoView({ block: \"nearest\" })"),
  "Dev terminal reveal should scroll the selected pane into view.",
);

const showDevStart = source.indexOf("async function showDevTerminal");
const showDevEnd = source.indexOf("async function initializeGitFromTerminal", showDevStart);
assert.notEqual(showDevStart, -1, "App-level showDevTerminal should exist.");
assert.notEqual(showDevEnd, -1, "initializeGitFromTerminal should follow showDevTerminal.");
const showDev = source.slice(showDevStart, showDevEnd);
assert.ok(
  showDev.includes("selectDevTerminalSession(sessions, preview)"),
  "App-level dev reveal should reuse an existing visible dev session when available.",
);
assert.ok(
  showDev.includes("loadSessions({ selectSessionId: managedId })"),
  "App-level dev reveal should reload sessions and prefer the managed dev session id when needed.",
);

const detachedStart = source.indexOf("function DetachedDevSession");
const detachedEnd = source.indexOf("function XtermSession", detachedStart);
assert.notEqual(detachedStart, -1, "DetachedDevSession should exist.");
assert.notEqual(detachedEnd, -1, "XtermSession should follow DetachedDevSession.");
const detachedDev = source.slice(detachedStart, detachedEnd);
assert.ok(
  detachedDev.includes("Terminal output cannot be replayed"),
  "Detached dev sessions should clearly say terminal output cannot be replayed.",
);

console.log("dev terminal reveal static smoke passed");
