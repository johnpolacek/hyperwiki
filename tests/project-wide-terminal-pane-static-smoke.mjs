import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");

const loadSessionsStart = source.indexOf("async function loadSessions(");
const loadSessionsEnd = source.indexOf("function navigate", loadSessionsStart);
assert.notEqual(loadSessionsStart, -1, "loadSessions should exist");
assert.notEqual(loadSessionsEnd, -1, "navigate should follow loadSessions");
const loadSessions = source.slice(loadSessionsStart, loadSessionsEnd);
assert.ok(
  loadSessions.includes('withProjectQuery("/api/sessions", activeProject)'),
  "Visible terminal pane loading should request all active project sessions.",
);
assert.equal(
  loadSessions.includes("/api/sessions?scope"),
  false,
  "Visible terminal pane loading must not filter sessions by route scope.",
);
assert.ok(
  loadSessions.includes("isCurrentTerminalProject(requestedProjectId"),
  "Visible terminal pane loading should guard stale async results by project.",
);
assert.ok(
  loadSessions.includes("selectSessionId: options.selectSessionId"),
  "Visible terminal pane loading should preserve explicit active-session selections through reloads.",
);

const loadEffect = source.slice(source.indexOf("if (hasLoadedProjects && !activeProject)"), source.indexOf("useEffect(() => {\n    if (!activeProject || terminalScope.scopeKind", source.indexOf("if (hasLoadedProjects && !activeProject)")));
assert.ok(loadEffect.includes("void loadSessions();"), "Project session load effect should call loadSessions.");
assert.equal(
  loadEffect.includes("terminalScope"),
  false,
  "Project session load effect must not reload or clear visible terminals on sidebar route changes.",
);

const applyStart = source.indexOf("function applyTerminalSessions");
const applyEnd = source.indexOf("function upsertTerminalSession", applyStart);
assert.notEqual(applyStart, -1, "applyTerminalSessions should exist");
assert.notEqual(applyEnd, -1, "upsertTerminalSession should follow applyTerminalSessions");
const applySessions = source.slice(applyStart, applyEnd);
assert.ok(
  applySessions.includes("const currentVisible = current.filter(isVisibleLiveTerminalSession);"),
  "Session application should preserve visible sessions across the whole project.",
);
assert.ok(
  applySessions.includes("selectActiveSessionId(nextSessions, options.selectSessionId, currentActive)"),
  "Active terminal selection should be project-wide, not scope-filtered.",
);

const selectStart = source.indexOf("function selectActiveSessionId");
const selectEnd = source.indexOf("function selectReusableAgentSession", selectStart);
assert.notEqual(selectStart, -1, "selectActiveSessionId should exist");
assert.notEqual(selectEnd, -1, "selectReusableAgentSession should follow selectActiveSessionId");
const selectActive = source.slice(selectStart, selectEnd);
assert.ok(
  selectActive.includes("const visible = sessions.filter(isVisibleLiveTerminalSession);"),
  "Active terminal selection should consider all visible live project sessions.",
);
assert.equal(
  selectActive.includes("sessionMatchesScope"),
  false,
  "Active pane selection should not scope-filter visible project terminals.",
);

const ensureStart = source.indexOf("async function ensureAgentSessionForProject");
const ensureEnd = source.indexOf("async function prewarmModifySessionForScope", ensureStart);
assert.notEqual(ensureStart, -1, "ensureAgentSessionForProject should exist");
assert.notEqual(ensureEnd, -1, "prewarmModifySessionForScope should follow ensureAgentSessionForProject");
const ensureAgent = source.slice(ensureStart, ensureEnd);
assert.ok(
  ensureAgent.includes("sessionMatchesScope(session, normalizedScope)"),
  "Prompt routing should still reuse only scope-matching agent sessions.",
);

const xtermStart = source.indexOf("function XtermSession");
const xtermEnd = source.indexOf("function routeFromLocation", xtermStart);
assert.notEqual(xtermStart, -1, "XtermSession should exist");
assert.notEqual(xtermEnd, -1, "routeFromLocation should follow XtermSession");
const xtermSession = source.slice(xtermStart, xtermEnd);
assert.equal(
  xtermSession.includes("scope.scope") || xtermSession.includes("scope.planPath") || xtermSession.includes("scope.scopeKind"),
  false,
  "Xterm sessions should not remount merely because sidebar navigation changes terminalScope.",
);

console.log("project-wide terminal pane static smoke passed");
