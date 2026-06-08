import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");

const terminalPaneStart = source.indexOf("function TerminalPane");
const terminalPaneEnd = source.indexOf("function TerminalSessionTab", terminalPaneStart);
assert.notEqual(terminalPaneStart, -1, "TerminalPane should exist.");
assert.notEqual(terminalPaneEnd, -1, "TerminalSessionTab should follow TerminalPane.");
const terminalPane = source.slice(terminalPaneStart, terminalPaneEnd);

assert.ok(
  terminalPane.includes("<strong className=\"shrink-0 font-mono text-[11px] font-medium lowercase text-[#eef2ec]\">dev</strong>"),
  "TerminalPane should render a consolidated dev status bar.",
);
assert.ok(
  terminalPane.includes("devIsRunning ? \"running\" : \"not running\""),
  "The dev bar should show running/not running status.",
);
assert.ok(
  terminalPane.includes("pid {devPid}"),
  "The dev bar should show the managed dev PID when available.",
);
assert.ok(
  terminalPane.includes("devIsRunning ? (") && />\s*stop\s*<\/Button>/.test(terminalPane) && />\s*start\s*<\/Button>/.test(terminalPane),
  "The dev bar should consolidate start/stop into the same row.",
);
assert.equal(
  />\s*dev terminal\s*<\/Button>/.test(terminalPane) || />\s*stop dev\s*<\/Button>/.test(terminalPane) || terminalPane.includes("No terminals running"),
  false,
  "TerminalPane should not keep separate dev terminal, stop dev, or empty-state UI.",
);
assert.ok(
  terminalPane.includes("collapsedSessionIds"),
  "TerminalPane should track collapsed terminal panes.",
);
assert.ok(
  terminalPane.includes("devPaneNeedsTerminalSpace") && terminalPane.includes('devPaneNeedsTerminalSpace && "min-h-0 flex-1"'),
  "Detached dev panes should not reserve the whole terminal area when expanded.",
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

assert.ok(
  source.includes("previewDetachedDevSession(props.preview, props.activeProject)"),
  "TerminalPane should synthesize a detached dev pane from preview metadata after app restart.",
);
assert.ok(
  source.includes("function previewDetachedDevSession") && source.includes("managed.conflictPid"),
  "Preview-managed dev metadata should provide a fallback detached pane and PID.",
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
assert.ok(
  detachedDev.includes("Hyperwiki can restart it") && />\s*restart\s*<\/Button>/.test(detachedDev) && !/>\s*stop\s*<\/Button>/.test(detachedDev),
  "Detached dev sessions should offer restart instead of stop.",
);

console.log("dev terminal reveal static smoke passed");
