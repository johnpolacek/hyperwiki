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
if (!appSource.includes("isAgentMcpStartupInProgress") || !appSource.includes("maxAttempts = options.maxAttempts || 120") || !appSource.includes("promptAfterStartup")) {
  throw new Error("Agent prompt readiness must wait through Codex MCP startup before submitting Modify Plan prompts.");
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
if (!appSource.includes('action === "modify" ? {} : { forceNewSession: true }')) {
  throw new Error("Execute must start a fresh general agent session while Modify keeps its prewarmed session behavior.");
}
if (!appSource.includes('name: "dev"') || !appSource.includes('role: "dev"') || !appSource.includes('const command = preview?.startCommand || ""')) {
  throw new Error("Run dev must start a configured dev terminal instead of an empty CLI or worktree agent handoff.");
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
if (!appSource.includes("terminalDisplayTextForXterm") || !appSource.includes("displayControlCarryRef") || !appSource.includes("stripTerminalDisplayControlSequences(data, carry)")) {
  throw new Error("Xterm rendering must strip Codex display control sequences with carry-over across output chunks.");
}

console.log("tauri static assets smoke test passed");
