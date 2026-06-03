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
if (!appSource.includes("isAgentMcpStartupInProgress") || !appSource.includes("isAgentStartupInProgress") || !appSource.includes("isCodexPromptPlaceholderReady") || !appSource.includes("queuedfollow-upinputs") || !appSource.includes("model:\\s*loading") || !appSource.includes("maxAttempts = options.maxAttempts || 120") || !appSource.includes("promptAfterStartup") || !appSource.includes("Run \\/review on my current changes") || !appSource.includes("Use \\/skills to list available skills")) {
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
if (!appSource.includes('planCreationPrompt(activeProject)') || !appSource.includes('"planning"') || !appSource.includes('"Create Plan"') || !appSource.includes('{ forceNewSession: true }')) {
  throw new Error("Regular + plan must start a fresh visible planning agent terminal.");
}
if (!appSource.includes("async function openVisibleAgentPromptSession") || !appSource.includes("await openVisibleAgentPromptSession({") || appSource.includes("navigate(planIndexRoute);")) {
  throw new Error("Regular + plan must use the canonical visible terminal prompt handoff, not a separate navigate-then-prompt sequence.");
}
if (!appSource.includes("function hasExplicitWikiRouteLocation") || !appSource.includes("if (hasExplicitWikiRouteLocation()) return;")) {
  throw new Error("Explicit Plans index routes must not be redirected to the active plan before + plan can show its terminal.");
}
if (!appSource.includes("Boolean(activeProject?.importPlanning && isImportedPlanningActive)") || appSource.includes("const isImportPlanningView = isImportedPlanningActive || isImportPlanningStarting || isImportPlanningResume")) {
  throw new Error("Regular Plans index planning must not be captured by the imported-project Q&A layout that hides the terminal pane.");
}
if (!appSource.includes("terminal-native one-question-at-a-time planning interview") || !appSource.includes("ask the user for the planning focus first and wait") || appSource.includes("For every user-facing question, emit only one JSON object containing type \\\"hyperwiki-question\\\"")) {
  throw new Error("Regular + plan prompt must use terminal-native Q&A instead of app-rendered JSON questions.");
}
if (!appSource.includes('action === "modify" ? {} : { forceNewSession: true }')) {
  throw new Error("Execute must start a fresh general agent session while Modify keeps its prewarmed session behavior.");
}
if (!appSource.includes('name: "dev"') || !appSource.includes('role: "dev"') || !appSource.includes('const command = preview?.startCommand || ""')) {
  throw new Error("Run dev must start a configured dev terminal instead of an empty CLI or worktree agent handoff.");
}
if (!appSource.includes("latestTerminalContext") || !appSource.includes("Ignoring stale project session load") || !appSource.includes("function isCurrentTerminalContext")) {
  throw new Error("Async session loads must not replace the terminal pane after the route or project scope changes.");
}
if (!appSource.includes("function applyTerminalSessions") || !appSource.includes("preserved = currentVisible.filter") || !appSource.includes("function upsertTerminalSession") || !appSource.includes("function selectActiveSessionId")) {
  throw new Error("Terminal pane sessions must use one canonical apply/upsert path that preserves newly started visible sessions.");
}
if (!appSource.includes("function terminalStartupNotice") || !appSource.includes("Starting agent terminal...") || !appSource.includes("startupNoticeVisible") || !appSource.includes("terminal.clear();")) {
  throw new Error("Visible command terminals must show an immediate startup notice until real replay/output arrives.");
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
