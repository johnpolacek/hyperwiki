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

await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Planning Dashboard");
const sessionControlsHidden = await page.locator(".terminal-actions").evaluate((element) => !element.open);
if (!sessionControlsHidden) {
  throw new Error("Expected terminal session controls to be collapsed by default");
}
const guardrailsCollapsed = await page.locator(".terminal-guardrails").evaluate((element) => !element.open);
if (!guardrailsCollapsed) {
  throw new Error("Expected terminal guardrails to be collapsed by default");
}

const initialTabs = await page.locator(".terminal-tab").allTextContents();
for (const expected of ["agent", "cli"]) {
  if (!initialTabs.some((tab) => tab.includes(expected))) {
    throw new Error(`Expected dogfood layout tab ${expected}`);
  }
}
if (initialTabs.some((tab) => tab.includes("dev"))) {
  throw new Error("Expected HyperWiki dogfood layout to omit the conflicting dev panel");
}
await page.locator(".terminal-panel-header").filter({ hasText: /codex --yolo|HYPERWIKI_AGENT_DRY_RUN/ }).waitFor();
await page.locator(".terminal-panel-header").filter({ hasText: "interactive shell" }).waitFor();
await page.locator("#plan-prompt").evaluate((element) => {
  if (element.hidden) throw new Error("Expected plan prompt to be visible when an agent session exists.");
});
const promptInput = page.locator("#plan-prompt-input");
const initialPromptHeight = await promptInput.evaluate((element) => element.clientHeight);
await promptInput.fill(["one", "two", "three", "four", "five", "six"].join("\n"));
const expandedPromptMetrics = await promptInput.evaluate((element) => ({
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
  overflowY: getComputedStyle(element).overflowY
}));
if (expandedPromptMetrics.clientHeight <= initialPromptHeight) {
  throw new Error(`Expected plan prompt to expand, got ${expandedPromptMetrics.clientHeight}/${initialPromptHeight}`);
}
if (expandedPromptMetrics.clientHeight >= expandedPromptMetrics.scrollHeight || expandedPromptMetrics.overflowY !== "auto") {
  throw new Error("Expected plan prompt to cap at five lines and scroll beyond that.");
}
const promptButtonMetrics = await page.locator("#plan-prompt button").evaluate((button) => {
  const textarea = document.querySelector("#plan-prompt-input");
  const buttonRect = button.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  return {
    buttonTop: buttonRect.top,
    buttonHeight: buttonRect.height,
    textareaTop: textareaRect.top,
    textareaHeight: textareaRect.height
  };
});
if (Math.abs(promptButtonMetrics.buttonTop - promptButtonMetrics.textareaTop) > 1) {
  throw new Error(`Expected plan prompt button to align with textarea top, got ${promptButtonMetrics.buttonTop}/${promptButtonMetrics.textareaTop}`);
}
if (promptButtonMetrics.buttonHeight >= promptButtonMetrics.textareaHeight) {
  throw new Error(`Expected plan prompt button to keep one-line height, got ${promptButtonMetrics.buttonHeight}/${promptButtonMetrics.textareaHeight}`);
}
await promptInput.fill("HYPERWIKI_PLAN_PROMPT_SMOKE");
const contractedPromptHeight = await promptInput.evaluate((element) => element.clientHeight);
if (contractedPromptHeight >= expandedPromptMetrics.clientHeight) {
  throw new Error(`Expected plan prompt to contract, got ${contractedPromptHeight}/${expandedPromptMetrics.clientHeight}`);
}
await page.locator("#plan-prompt button").click();
await page.locator("#plan-prompt-status").filter({ hasText: "Sent to agent." }).waitFor();
await page.waitForFunction(() =>
  document.querySelector(".terminal[data-name=\"agent\"]")?.innerText.includes("HYPERWIKI_PLAN_PROMPT_SMOKE")
);

await page.locator("#wiki-nav a").filter({ hasText: "Planning Dashboard" }).click();
await page.waitForURL(/\/workspace\/.*#\/(projects\/[^/]+\/)?wiki\/plans\/index\.html/);

await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Planning Dashboard");
const currentPage = await page.locator("#current-page").innerText();
if (currentPage !== "Planning Dashboard") {
  throw new Error(`Expected Planning Dashboard, got ${currentPage}`);
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

await page.locator(".terminal-tab[data-name=\"cli\"]").click();
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
  const terminalRect = terminal.getBoundingClientRect();
  const parentRect = terminal.parentElement.getBoundingClientRect();
  return {
    clientHeight: terminal.clientHeight,
    scrollHeight: terminal.scrollHeight,
    offsetHeight: terminal.offsetHeight,
    parentHeight: terminal.parentElement.clientHeight,
    visualGutter: parentRect.bottom - terminalRect.bottom,
    background: getComputedStyle(terminal).backgroundColor,
    boxShadow: getComputedStyle(terminal).boxShadow,
    borderRadius: getComputedStyle(terminal).borderRadius,
    overflowY: getComputedStyle(terminal).overflowY,
    parentBackground: getComputedStyle(terminal.parentElement).backgroundColor
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
if (Math.abs(scrollMetrics.visualGutter) > 2) {
  throw new Error(`Expected terminal to fill its visible pane, got gutter ${scrollMetrics.visualGutter}`);
}
if (scrollMetrics.background !== "rgba(0, 0, 0, 0)") {
  throw new Error(`Expected transparent terminal background, got ${scrollMetrics.background}`);
}
if (scrollMetrics.parentBackground !== "rgb(39, 40, 34)") {
  throw new Error(`Expected gutter background to match terminal theme, got ${scrollMetrics.parentBackground}`);
}
if (scrollMetrics.boxShadow !== "none" || scrollMetrics.borderRadius !== "0px") {
  throw new Error(`Expected terminal gutter edge without shadow/radius, got ${scrollMetrics.boxShadow}/${scrollMetrics.borderRadius}`);
}
await page.evaluate(() => {
  const terminal = document.querySelector(".terminal.active");
  terminal.scrollTop = terminal.scrollHeight;
});
await page.waitForFunction(() => {
  const terminal = document.querySelector(".terminal.active");
  const rowHeight = Number.parseFloat(getComputedStyle(terminal).getPropertyValue("--term-row-height")) || 17;
  return terminal.scrollHeight - terminal.clientHeight - terminal.scrollTop < rowHeight * 2;
});
await page.waitForTimeout(450);
const beforeTypingAtBottom = await page.evaluate(() => {
  const terminal = document.querySelector(".terminal.active");
  const terminalRect = terminal.getBoundingClientRect();
  const parentRect = terminal.parentElement.getBoundingClientRect();
  return {
    scrollTop: terminal.scrollTop,
    visualGutter: parentRect.bottom - terminalRect.bottom
  };
});
await page.keyboard.type("e");
await page.waitForTimeout(150);
const afterTypingAtBottom = await page.evaluate(() => {
  const terminal = document.querySelector(".terminal.active");
  const terminalRect = terminal.getBoundingClientRect();
  const parentRect = terminal.parentElement.getBoundingClientRect();
  return {
    scrollTop: terminal.scrollTop,
    visualGutter: parentRect.bottom - terminalRect.bottom
  };
});
if (Math.abs(afterTypingAtBottom.visualGutter - beforeTypingAtBottom.visualGutter) > 2) {
  throw new Error(`Expected typing to preserve terminal pane geometry, got ${beforeTypingAtBottom.visualGutter} -> ${afterTypingAtBottom.visualGutter}`);
}
if (Math.abs(afterTypingAtBottom.scrollTop - beforeTypingAtBottom.scrollTop) > 2) {
  throw new Error(`Expected typing to preserve terminal scrollTop, got ${beforeTypingAtBottom.scrollTop} -> ${afterTypingAtBottom.scrollTop}`);
}
await page.keyboard.type("cho HYPERWIKI_BOTTOM_STABILITY_OK");
await page.keyboard.press("Enter");
await page.waitForFunction(() =>
  document.querySelector(".terminal.active")?.innerText.includes("HYPERWIKI_BOTTOM_STABILITY_OK")
);

await page.locator("#repo-branch").filter({ hasText: /.+/ }).waitFor();
await page.locator("#plan-summary li").first().waitFor();
await page.locator("#guardrail-mode").filter({ hasText: "Local-only" }).waitFor();
await page.locator("#active-session-boundary").filter({ hasText: "shell" }).waitFor();
const workspaceResponse = await fetch(`${origin}/api/workspace`);
const workspaceData = await workspaceResponse.json();
if (workspaceData.plan.summary.length === 0) {
  throw new Error("Expected workspace summary to include plan state");
}
if (workspaceData.sources.briefs.length < 3) {
  throw new Error(`Expected source briefs, got ${workspaceData.sources.briefs.length}`);
}
if (workspaceData.layout.panels.some((panel) => panel.name === "dev")) {
  throw new Error("Expected HyperWiki dogfood layout to omit dev panel");
}
if (!workspaceData.layout.panels.some((panel) => panel.name === "agent" && panel.command)) {
  throw new Error("Expected workspace layout to include configured agent panel");
}
const guardrailResponse = await fetch(`${origin}/api/guardrails`);
const guardrailData = await guardrailResponse.json();
if (guardrailData.mode.label !== "Local-only") {
  throw new Error(`Expected local-only guardrail mode, got ${guardrailData.mode.label}`);
}
if (!guardrailData.canonical.some((item) => item.path === "wiki/")) {
  throw new Error("Expected guardrails to identify wiki/ as canonical repo truth");
}
if (!guardrailData.runtime.some((item) => item.path === ".hyperwiki/sessions/")) {
  throw new Error("Expected guardrails to identify local session metadata");
}
if (!guardrailData.commandHistory.detail.includes("unless the user exports")) {
  throw new Error("Expected guardrails to document command history export boundary");
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
const projectParam = new URL(page.url()).searchParams.get("project");
const projectSuffix = projectParam ? `?project=${encodeURIComponent(projectParam)}` : "";
const renameResponse = await fetch(`${origin}/api/sessions/${renameTarget.id}${projectSuffix}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "renamed-smoke" })
});
if (!renameResponse.ok) {
  throw new Error(`Expected session rename to succeed, got ${renameResponse.status}`);
}

const exportResponse = await fetch(`${origin}/api/sessions/${renameTarget.id}/export${projectSuffix}`, { method: "POST" });
const exportData = await exportResponse.json();
if (exportData.boundary !== "runtime-only") {
  throw new Error(`Expected runtime-only export boundary, got ${exportData.boundary}`);
}

const pruneResponse = await fetch(`${origin}/api/sessions/prune${projectSuffix}`, { method: "POST" });
if (!pruneResponse.ok) {
  throw new Error(`Expected session prune to succeed, got ${pruneResponse.status}`);
}

if (errors.length > 0) {
  throw new Error(`Browser console errors: ${errors.join(" | ")}`);
}

await browser.close();
console.log("browser workspace smoke test passed");
