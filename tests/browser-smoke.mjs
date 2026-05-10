import { chromium } from "playwright";

const url = process.env.HYPERWIKI_SMOKE_URL || "http://127.0.0.1:4177/workspace/";
const origin = new URL(url).origin;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(url, { waitUntil: "networkidle" });

const initialTabs = await page.locator(".terminal-tab").allTextContents();
for (const expected of ["shell", "checks", "dev-server", "git", "agent"]) {
  if (!initialTabs.some((tab) => tab.includes(expected))) {
    throw new Error(`Expected dogfood layout tab ${expected}`);
  }
}

await page.locator("#wiki-nav a").filter({ hasText: "Plans" }).click();
await page.waitForURL("**/workspace/#/wiki/plans/index.html");

await page.locator("#current-page").filter({ hasText: "/wiki/plans/index.html" }).waitFor();
const currentPage = await page.locator("#current-page").innerText();
if (currentPage !== "/wiki/plans/index.html") {
  throw new Error(`Expected /wiki/plans/index.html, got ${currentPage}`);
}

await page.locator("#new-terminal").click();
await page.locator(".terminal-tab").filter({ hasText: "term-1" }).waitFor();

const terminalTabs = await page.locator(".terminal-tab").count();
if (terminalTabs < 3) {
  throw new Error(`Expected at least 3 terminal tabs, got ${terminalTabs}`);
}

const activeTabs = await page.locator(".terminal-tab.active").count();
if (activeTabs !== 1) {
  throw new Error(`Expected 1 active terminal tab, got ${activeTabs}`);
}

await page.locator(".terminal-tab[data-name=\"shell\"]").click();
await page.locator(".terminal.active").click();
await page.keyboard.type("printf HYPERWIKI_UI_INPUT_OK");
await page.keyboard.press("Enter");
await page.waitForFunction(() =>
  document.querySelector(".terminal.active")?.innerText.includes("HYPERWIKI_UI_INPUT_OK")
);

await page.keyboard.type("seq 1 120");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".terminal.active")?.classList.contains("has-scrollback"));
const scrollMetrics = await page.evaluate(() => {
  const terminal = document.querySelector(".terminal.active");
  return {
    clientHeight: terminal.clientHeight,
    scrollHeight: terminal.scrollHeight,
    offsetHeight: terminal.offsetHeight,
    parentHeight: terminal.parentElement.clientHeight,
    overflowY: getComputedStyle(terminal).overflowY
  };
});
if (scrollMetrics.clientHeight > scrollMetrics.parentHeight + 2) {
  throw new Error(`Expected terminal viewport to stay inside parent, got ${scrollMetrics.clientHeight}/${scrollMetrics.parentHeight}`);
}
if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
  throw new Error("Expected terminal to have scrollable output");
}
if (scrollMetrics.overflowY !== "auto") {
  throw new Error(`Expected terminal overflow-y auto, got ${scrollMetrics.overflowY}`);
}

await page.locator("#repo-branch").filter({ hasText: /.+/ }).waitFor();
await page.locator("#plan-summary li").first().waitFor();
await page.locator("#verification-summary").filter({ hasText: "npm run check" }).waitFor();
const workspaceResponse = await fetch(`${origin}/api/workspace`);
const workspaceData = await workspaceResponse.json();
if (workspaceData.plan.summary.length === 0) {
  throw new Error("Expected workspace summary to include plan state");
}
if (workspaceData.sources.briefs.length < 3) {
  throw new Error(`Expected source briefs, got ${workspaceData.sources.briefs.length}`);
}
if (!workspaceData.layout.panels.some((panel) => panel.name === "dev-server")) {
  throw new Error("Expected workspace layout to include dev-server panel");
}

const sessionResponse = await fetch(`${origin}/api/sessions`);
const sessionData = await sessionResponse.json();
if (sessionData.sessions.length < 3) {
  throw new Error(`Expected at least 3 recorded sessions, got ${sessionData.sessions.length}`);
}

const renameTarget = sessionData.sessions.find((session) => session.name === "term-1");
if (!renameTarget) {
  throw new Error("Expected term-1 session metadata");
}
if (!["pty", "pipe-fallback"].includes(renameTarget.mode)) {
  throw new Error(`Expected explicit terminal mode, got ${renameTarget.mode}`);
}
const renameResponse = await fetch(`${origin}/api/sessions/${renameTarget.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "renamed-smoke" })
});
if (!renameResponse.ok) {
  throw new Error(`Expected session rename to succeed, got ${renameResponse.status}`);
}

const exportResponse = await fetch(`${origin}/api/sessions/${renameTarget.id}/export`, { method: "POST" });
const exportData = await exportResponse.json();
if (exportData.boundary !== "runtime-only") {
  throw new Error(`Expected runtime-only export boundary, got ${exportData.boundary}`);
}

const pruneResponse = await fetch(`${origin}/api/sessions/prune`, { method: "POST" });
if (!pruneResponse.ok) {
  throw new Error(`Expected session prune to succeed, got ${pruneResponse.status}`);
}

if (errors.length > 0) {
  throw new Error(`Browser console errors: ${errors.join(" | ")}`);
}

await browser.close();
console.log("browser workspace smoke test passed");
