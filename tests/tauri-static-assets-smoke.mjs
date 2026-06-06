import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const requiredAssets = [
  "dist/index.html",
  "dist/assets/wiki.css",
  "dist/assets/theme.css",
  "dist/favicon.ico",
  "dist/vendor/fonts/instrument-serif/InstrumentSerif-Regular.ttf",
  "dist/vendor/fonts/sometype-mono/SometypeMono-Regular.ttf",
  "dist/vendor/fonts/rethink-sans/RethinkSans-Regular.ttf",
  "dist/vendor/fonts/figtree/Figtree-Regular.ttf",
  "dist/vendor/fonts/eb-garamond/EBGaramond-400.ttf",
  "dist/vendor/fonts/source-code-pro/SourceCodePro-400.ttf"
];

for (const asset of requiredAssets) {
  await access(path.resolve(asset));
}

const forbiddenAssets = [
  "dist/.DS_Store",
  "dist/app.css",
  "dist/app.js",
  "dist/app-api.js",
  "dist/wiki.css",
  "dist/assets/app.css",
  "dist/assets/app.js",
  "dist/assets/app-api.js",
  "dist/vendor/@xterm/xterm/lib/xterm.mjs",
  "dist/vendor/@xterm/xterm/css/xterm.css",
  "dist/vendor/@xterm/addon-fit/lib/addon-fit.mjs",
  "dist/vendor/@xterm/addon-web-links/lib/addon-web-links.mjs"
];

for (const asset of forbiddenAssets) {
  try {
    await access(path.resolve(asset));
    throw new Error(`Obsolete static frontend asset must not be bundled: ${asset}`);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
}

const index = await readFile(path.resolve("dist/index.html"), "utf8");
const appSource = await readFile(path.resolve("src/App.tsx"), "utf8");
const distAssets = await readdir(path.resolve("dist/assets"));
if (!distAssets.some((asset) => /^index-.*\.js$/.test(asset)) || !distAssets.some((asset) => /^index-.*\.css$/.test(asset))) {
  throw new Error("Vite build must emit hashed app JS and CSS assets for the Tauri bundle.");
}
if (!index.includes("/assets/index-")) {
  throw new Error("Tauri dist index must load Vite app assets.");
}

const appAssets = await Promise.all(
  distAssets
    .filter((asset) => /^index-.*\.js$/.test(asset))
    .map((asset) => readFile(path.resolve("dist/assets", asset), "utf8"))
);
const app = appAssets.join("\n");
if (!app.includes("wiki\\/plans\\/features") || !app.includes("/api/wiki/source")) {
  throw new Error("Plan tree must treat feature plans under wiki/plans/features/ as top-level plan entries.");
}
if (app.includes("Docs-only: Modify Plan is limited to app-visible wiki planning files.")) {
  throw new Error("Command bar modify action must not bundle the retired Modify Plan pane.");
}
if (!app.includes("Mode: Modify Plan, planning/wiki-only.") || !app.includes("Standby behavior: do not edit files or run checks") || !app.includes("sessionId") || !app.includes("purpose") || !app.includes("standby")) {
  throw new Error("Command bar modify action must promote a prewarmed modify agent with the docs-only Modify Plan prompt.");
}
if (!appSource.includes('purpose: "modify"') || !appSource.includes('visibility: "standby"') || !appSource.includes("isVisibleLiveTerminalSession")) {
  throw new Error("Modify prewarm must keep standby sessions hidden until promotion.");
}
if (appSource.includes('action === "modify" ? { forceNewSession: true')) {
  throw new Error("Modify must reuse the plan's prewarmed modify session instead of forcing a fresh launch.");
}
if (!app.includes("/api/wiki/fingerprint") || !app.includes("Wiki fingerprint changed") || !app.includes("Wiki changes loaded")) {
  throw new Error("App must refresh wiki sidebar state when plan agents or focus checks detect wiki file changes.");
}
if (!appSource.includes("agentPromptReadinessSnapshot") || !appSource.includes("agentPromptReadinessLogKey") || !appSource.includes("isCodexPromptPlaceholderReady") || !appSource.includes("queuedfollow-upinputs") || !appSource.includes("lastModelLoading") || !appSource.includes("lastModelReady") || !appSource.includes("maxAttempts = options.maxAttempts || 120") || !appSource.includes("prompt-before-mcp-complete") || !appSource.includes("prompt-after-stale-mcp") || !appSource.includes("mcp-starting-no-count") || !appSource.includes("Run \\/review on my current changes") || !appSource.includes("Use \\/skills to list available skills") || !appSource.includes("startingmcp") || !appSource.includes("mcp.latestCount.current < mcp.latestCount.total")) {
  throw new Error("Agent prompt readiness must wait through Codex model and MCP startup before submitting agent prompts.");
}
if (!appSource.includes("planningPromptContext") || !appSource.includes("displayWikiPath(currentPage)") || !appSource.includes("Report only repo-visible non-wiki changes as a caution")) {
  throw new Error("Modify Plan prompts must normalize paths, derive visible unit context, and reduce runtime dirty-state noise.");
}
if (appSource.includes("activePlanState.isComplete || activePlanState.isStale")) {
  throw new Error("Execute must not be disabled only because the visible plan page is stale.");
}
if (!appSource.includes('const executionPage = action === "execute-main" ? activePlanState.currentPath || normalizedCurrentPage : normalizedCurrentPage') || !appSource.includes('const executionScope = action === "execute-main" ? scopeForRoute({ kind: "wiki", path: executionPage }) : terminalScope')) {
  throw new Error("Execute must target the resolved current unit path and scope, not the stale visible page.");
}
if (!appSource.includes("currentUnitLabel") || !appSource.includes("compactUnitLabel(currentPage)") || !appSource.includes("activePlanState.currentUnitLabel ? `execute ${activePlanState.currentUnitLabel.toLowerCase()}` : \"execute\"")) {
  throw new Error("Execute button label must show only the compact current unit label, not the full unit title.");
}
if (appSource.includes("SidePanelMode") || appSource.includes("AgentActivityPane") || appSource.includes("HeadlessTerminalListener")) {
  throw new Error("Agent handoffs must stay terminal-first without restoring the separate activity feed panel.");
}
if (appSource.includes('kind: "plan-create"') || appSource.includes("PlanCreationView") || appSource.includes('return `${projectPrefix}/plans/new`;')) {
  throw new Error("Regular + plan must not restore the full-page plan-create route.");
}
if (!appSource.includes('if (window.location.pathname.endsWith("/plans/new") || window.location.pathname === "/plans/new") return { kind: "wiki", path: "/wiki/plans/index.mdx" }')) {
  throw new Error("Direct /plans/new URLs must fall back to the Plans index.");
}
if (!appSource.includes('planCreationPrompt(activeProject)') || !appSource.includes('kind: "planning"') || !appSource.includes('label: "Create Plan"') || !appSource.includes("forceNewSession: true,")) {
  throw new Error("Regular + plan must start a fresh visible planning agent terminal.");
}
if (!appSource.includes("async function openVisibleAgentPromptSession") || !appSource.includes("await openVisibleAgentPromptSession({") || appSource.includes("navigate(planIndexRoute);")) {
  throw new Error("Regular + plan must use the canonical visible terminal prompt handoff, not a separate navigate-then-prompt sequence.");
}
if (!appSource.includes("function hasExplicitWikiRouteLocation") || !appSource.includes("if (hasExplicitWikiRouteLocation()) return;")) {
  throw new Error("Explicit Plans index routes must not be redirected to the active plan before + plan can show its terminal.");
}
if (!appSource.includes("const isImportPlanningView = false") || !appSource.includes("terminalImportPlanningPrompt") || !appSource.includes("Mode: terminal_import_planning.") || !appSource.includes("Do not emit hyperwiki-question JSON")) {
  throw new Error("Imported-project planning must use the terminal-owned planning handoff instead of the app-rendered Q&A layout.");
}
if (!appSource.includes("activePlanScopeComplete || isImportedPlanningActive") || !appSource.includes("isImportedPlanningActive, layout, sessions")) {
  throw new Error("Import planning intake must not prewarm hidden Modify sessions before the visible terminal-owned import handoff.");
}
if (!appSource.includes("terminal-native one-question-at-a-time planning interview") || !appSource.includes("ask the user for the planning focus first and wait") || appSource.includes("For every user-facing question, emit only one JSON object containing type \\\"hyperwiki-question\\\"")) {
  throw new Error("Regular + plan prompt must use terminal-native Q&A instead of app-rendered JSON questions.");
}
if (appSource.includes('action === "modify" ? {} : { forceNewSession: true }')) {
  throw new Error("Execute must reuse a warm general agent when available instead of forcing a fresh launch.");
}
if (!appSource.includes("generalAgentPrewarmTarget = 2") || !appSource.includes("Prewarming general agent pool") || !appSource.includes("scheduleGeneralAgentPrewarmRefill") || !appSource.includes("General prewarm refill scheduled") || !appSource.includes('"execute-submit"')) {
  throw new Error("Execute must use the bounded general-agent prewarm pool and schedule a refill after prompt handoff.");
}
if (!appSource.includes("const promotedPurpose = options.purpose || existing.purpose || \"general\"") || !appSource.includes("oldestSession(liveWithCommand.filter(isStandbySession))")) {
  throw new Error("Promoted general prewarm sessions must preserve purpose and prefer the warmest standby slot.");
}
if (!appSource.includes('name: "dev"') || !appSource.includes('role: "dev"') || !appSource.includes('const command = preview?.startCommand || ""')) {
  throw new Error("Run dev must start a configured dev terminal instead of an empty CLI or worktree agent handoff.");
}
if (!appSource.includes("latestTerminalContext") || !appSource.includes("Ignoring stale project session load") || !appSource.includes("function isCurrentTerminalProject")) {
  throw new Error("Async session loads must not replace the terminal pane after the project changes.");
}
if (!appSource.includes("function applyTerminalSessions") || !appSource.includes("preserved = currentVisible.filter") || !appSource.includes("function upsertTerminalSession") || !appSource.includes("function selectActiveSessionId")) {
  throw new Error("Terminal pane sessions must use one canonical apply/upsert path that preserves newly started visible sessions.");
}
if (!appSource.includes("function terminalStartupNotice") || !appSource.includes("Starting agent terminal") || !appSource.includes("if (isStandbySession(session)) return \"\";") || !appSource.includes("startupNoticeVisible") || !appSource.includes("setStartupNoticeVisible(startupNoticeIsVisible)") || !appSource.includes("pointer-events-none absolute")) {
  throw new Error("Visible command terminals must show an immediate React startup notice until real replay/output arrives.");
}
if (!appSource.includes("function prewarmAgentSessionsForScope") || !appSource.includes("Prewarm batch scheduled") || !appSource.includes("function prewarmGeneralSessionForScope") || !appSource.includes('purpose: "general"') || !appSource.includes("isGeneralPrewarmSession") || !appSource.includes("Manual agent promoting prewarmed general session")) {
  throw new Error("Manual + agent should use a separate hidden general prewarm path before spawning a fresh Codex terminal.");
}
if (!appSource.includes("function PendingTerminalSession") || !appSource.includes("Starting Codex") || !appSource.includes("Terminal first output session=") || !appSource.includes("Manual terminal backend start returned")) {
  throw new Error("Manual + agent should render an instant pending pane and log startup timing milestones.");
}
if (!appSource.includes("ensureAgentSession optimistic pane inserted") || !appSource.includes("optimistic-agent-start-failed") || !appSource.includes('const agentPurpose = kind === "modify" ? "modify" : "general"')) {
  throw new Error("Execute, planning, review, and worktree handoffs should use the shared optimistic agent startup path.");
}
if (!appSource.includes("const clearStartupNotice = () =>") || !appSource.includes("writeDisplayText(\"output\", bytes.length, payload.seq, displayText, text);") || !appSource.includes("writeDisplayText(\"replay\", bytes.length, replay.seq, displayText, text);") || !appSource.includes("terminalDisplayHasVisibleText") || !appSource.includes("Terminal display empty session=")) {
  throw new Error("Visible command terminal startup notices must clear only after displayable replay/output reaches xterm.");
}
if (!appSource.includes("Terminal xterm render check") || !appSource.includes("Terminal xterm render unresolved") || !appSource.includes("keeping=xterm") || !appSource.includes("effect=${effectRun}") || !appSource.includes("xtermRenderSnapshot") || !appSource.includes("countVisibleCanvasPixels") || !appSource.includes("domChars=${snapshot.domTextLength}") || !appSource.includes("helperTextarea=${snapshot.hasHelperTextarea}") || !appSource.includes("interactive=${snapshot.interactive}") || !appSource.includes("rendered=${snapshot.rendered}")) {
  throw new Error("Terminal render checks must stay diagnostic-only and include canvas, DOM renderer, and input-layer health.");
}
if (!appSource.includes("terminalXtermScrollback = 100000") || !appSource.includes("terminalTranscriptRef") || !appSource.includes("appendTerminalTranscriptText") || appSource.includes("nextText = text.trimEnd().slice(-12000)") || appSource.includes("lines.slice(-180)") || appSource.includes(".split(\"\\n\").slice(-180)") || appSource.includes(".slice(-12000);")) {
  throw new Error("Terminal transcript cache and xterm scrollback must preserve full live output history instead of tail-slicing early output.");
}
if (appSource.includes('aria-label="Terminal transcript"') || appSource.includes("terminalInputForKeyboardEvent") || appSource.includes("handleFallbackKeyDown") || appSource.includes("handleFallbackPaste") || appSource.includes("tabIndex={0}")) {
  throw new Error("Live terminal panes must not cover xterm with a fallback transcript or faux keyboard bridge.");
}
if (!appSource.includes("Agent handoff start kind=") || !appSource.includes("Agent handoff session ready") || !appSource.includes("elapsedMs=${Date.now() - handoffStartedAt}") || !appSource.includes("elapsedMs=${Date.now() - startedAt}")) {
  throw new Error("Agent handoffs and readiness waits must log elapsed timing for startup troubleshooting.");
}
if (appSource.includes("Run relevant checks before finishing.")) {
  throw new Error("Agent prompt preamble must not require checks for no-edit standby turns.");
}
if (!appSource.includes('parentPath.endsWith("/wiki/plans/mvp/index.mdx")') || !appSource.includes('/^\\/wiki\\/plans\\/mvp\\/stage-\\d+[^/]*\\.mdx$/.test(candidatePath)')) {
  throw new Error("MVP plan sidebar root must only nest stage pages, not stray generated support pages.");
}
if (!appSource.includes("terminalPlanRootPath(wikiPath)") || !appSource.includes("canonicalTerminalScopePath(path)") || !appSource.includes("normalized.match(/^(.*)\\/unit-\\d+[^/]*\\.mdx$/)")) {
  throw new Error("Terminal scope must normalize plan unit pages to their parent plan root.");
}
if (!appSource.includes("const completedRoots = sorted.filter((page) => isCompletedTopLevelPlanPage(page))") || !appSource.includes("<summary className=\"cursor-pointer list-none px-2 py-1 text-[11px] font-bold uppercase text-muted-foreground\">Completed Plans</summary>")) {
  throw new Error("Completed top-level plans must remain reachable from the sidebar.");
}
if (!appSource.includes("terminalDisplayTextForXterm") || !appSource.includes("displayControlCarryRef") || !appSource.includes("stripTerminalDisplayControlSequences(data, carry)")) {
  throw new Error("Xterm rendering must strip Codex display control sequences with carry-over across output chunks.");
}

console.log("tauri static assets smoke test passed");
