import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");

const requiredSnippets = [
  "function canonicalTerminalScopePath(path: string)",
  "function normalizeTerminalScope(scope: TerminalScope): TerminalScope",
  "function sessionMatchesScope(session: SessionRecord, scope: TerminalScope)",
  "function selectReusableAgentSession",
  'options.purpose === "modify" && options.promote',
  "newestSession(liveWithCommand.filter(isStandbySession))",
  'kind === "modify"',
  '{ maxAttempts: 8, intervalMs: 250, reason: "modify-submit" }',
  'kind === "execute"',
  '{ maxAttempts: 60, intervalMs: 250, reason: "execute-submit" }',
  "waitForAgentPromptReady(session.id, { maxAttempts: 20, intervalMs: 250, reason: \"modify-prewarm\" })",
  "Explain this codebase",
  "Write tests for @filename",
  "reason=${options.reason || \"default\"}",
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`Modify agent fast path is missing expected source: ${snippet}`);
  }
}

const prewarmStart = source.indexOf("async function prewarmModifySessionForScope");
const prewarmEnd = source.indexOf("async function promoteSession", prewarmStart);
const prewarmBody = source.slice(prewarmStart, prewarmEnd);
if (prewarmBody.includes("const ready = await waitForAgentPromptReady")) {
  throw new Error("Modify prewarm must not block on the full readiness wait.");
}

const routeFromLocation = source.slice(source.indexOf("function routeFromLocation"), source.indexOf("function urlForRoute"));
if (!routeFromLocation.includes('window.location.hash.startsWith("#/")') || !routeFromLocation.includes("displayWikiPath(rawHashPath)")) {
  throw new Error("Route parsing must normalize project-prefixed wiki hashes.");
}

const scopeForRoute = source.slice(source.indexOf("function scopeForRoute"), source.indexOf("function trimPlanningQuestionBuffer"));
if (!scopeForRoute.includes("const wikiPath = displayWikiPath(route.path)") || !scopeForRoute.includes("terminalPlanRootPath(wikiPath)")) {
  throw new Error("Terminal scope creation must use canonical wiki paths.");
}

console.log("modify agent fast path static smoke test passed");
