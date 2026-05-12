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

await page.locator(".topbar-brand").filter({ hasText: "HyperWiki" }).waitFor();
await page.locator("#dashboard-button").click();
await page.locator("#dashboard-panel").evaluate((panel) => {
  const text = panel.textContent || "";
  if (!text.includes("Ideas") || !text.includes("Projects")) {
    throw new Error(`Expected dashboard to include ideas and projects, got ${text}`);
  }
});
await page.keyboard.press("Escape");
await page.locator("#up-next-button svg path").nth(1).evaluate((element) => {
  const path = element.getAttribute("d") || "";
  if (!path.includes("M13 5v4H8v6h5v4l7-7Z")) {
    throw new Error(`Expected Up Next to use arrow-big-right-dash icon path, got ${path}`);
  }
});
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Planning Dashboard");
await page.locator(".terminal-toolbar").evaluate((toolbar) => {
  const text = toolbar.textContent || "";
  if (!toolbar.querySelector(".terminal-branch svg") || !text.includes("new agent") || !text.includes("new cli")) {
    throw new Error(`Expected compact terminal toolbar, got ${text}`);
  }
});
const initialTabs = await page.locator(".terminal-panel-header").allTextContents();
for (const expected of ["agent", "cli"]) {
  if (!initialTabs.some((tab) => tab.includes(expected))) {
    throw new Error(`Expected dogfood layout terminal ${expected}`);
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

await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Planning Dashboard");
const currentPage = await page.locator("#current-page").innerText();
if (currentPage !== "Planning Dashboard") {
  throw new Error(`Expected Planning Dashboard, got ${currentPage}`);
}
await page.locator("#wiki-nav details.plan-tree").evaluate((element) => {
  if (!element.open) throw new Error("Expected plan navigation tree to be expanded by default");
  if (element.textContent.includes("Planning Dashboard")) throw new Error("Expected plan navigation to omit Planning Dashboard");
});
await page.locator("#wiki-nav a.current-plan").filter({ hasText: "MVP Plan" }).waitFor();
await page.locator("#wiki-nav a.current-stage").filter({ hasText: "Stage-07" }).waitFor();
await page.locator("#wiki-nav a").filter({ hasText: "Stage-01 CLI and Repository Foundation" }).waitFor();
await page.locator(".workspace").evaluate((workspaceElement) => {
  const sidebar = document.querySelector(".sidebar");
  const directPlanLink = document.querySelector(".plan-tree > .plan-subtree > summary a");
  const nestedPlanGroup = document.querySelector(".plan-tree .plan-subtree .plan-subtree");
  if (!sidebar || !directPlanLink || !nestedPlanGroup) {
    throw new Error("Expected sidebar plan navigation elements");
  }
  if (getComputedStyle(document.querySelector(".topbar")).backgroundColor !== "rgb(251, 251, 250)") {
    throw new Error("Expected topbar to use the white sidebar surface");
  }
  if (getComputedStyle(document.querySelector(".wiki-pane")).backgroundColor !== "rgb(255, 255, 255)") {
    throw new Error("Expected wiki pane to use a white main panel surface");
  }
  const gridColumns = getComputedStyle(workspaceElement).gridTemplateColumns;
  if (!gridColumns.startsWith("300px ")) {
    throw new Error(`Expected 300px sidebar column, got ${gridColumns}`);
  }
  if (getComputedStyle(sidebar).paddingLeft !== "0px") {
    throw new Error(`Expected 0px sidebar left padding so selected rail reaches window edge, got ${getComputedStyle(sidebar).paddingLeft}`);
  }
  if (getComputedStyle(directPlanLink).marginLeft !== "0px") {
    throw new Error(`Expected direct plan links to have no left margin, got ${getComputedStyle(directPlanLink).marginLeft}`);
  }
  const chevronStyle = getComputedStyle(directPlanLink.closest("summary"), "::before");
  if (chevronStyle.width !== "22px" || chevronStyle.paddingLeft !== "3px" || chevronStyle.left !== "4px") {
    throw new Error("Expected compact accordion chevron spacing");
  }
  const brandRule = getComputedStyle(document.querySelector(".brand"), "::after").content;
  if (brandRule !== "none") {
    throw new Error(`Expected empty brand separator to be removed, got ${brandRule}`);
  }
  const navLabels = [...document.querySelectorAll("#wiki-nav .wiki-nav-label")];
  const stageOneLabel = navLabels.find((label) => label.textContent.includes("Stage-01"));
  const stageSevenLabel = navLabels.find((label) => label.textContent.includes("Stage-07"));
  const ideaIncubationLabel = navLabels.find((label) => label.textContent.includes("Idea Incubation"));
  const terminalHeaderLabel = navLabels.find((label) => label.textContent.includes("Terminal Header Simplification"));
  const longUnitLabel = navLabels.find((label) => label.textContent.includes("Unit 03"));
  if (!stageOneLabel || !stageSevenLabel || !ideaIncubationLabel || !terminalHeaderLabel || !longUnitLabel) {
    throw new Error("Expected stage and unit labels in plan navigation");
  }
  if (stageOneLabel.getBoundingClientRect().top >= stageSevenLabel.getBoundingClientRect().top) {
    throw new Error("Expected Stage 01 to appear before Stage 07 in plan navigation");
  }
  const stageOneLink = stageOneLabel.closest("a");
  const stageSevenLink = stageSevenLabel.closest("a");
  const stageOneBefore = getComputedStyle(stageOneLink, "::before");
  const stageSevenBefore = getComputedStyle(stageSevenLink, "::before");
  if (stageOneBefore.backgroundColor !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Expected inactive stage dot to be transparent, got ${stageOneBefore.backgroundColor}`);
  }
  if (stageSevenBefore.backgroundColor !== "rgb(37, 162, 68)") {
    throw new Error(`Expected current stage dot to be green, got ${stageSevenBefore.backgroundColor}`);
  }
  if (Math.round(stageOneLabel.getBoundingClientRect().left) !== Math.round(stageSevenLabel.getBoundingClientRect().left)) {
    throw new Error("Expected active and inactive stage labels to align");
  }
  if (
    Math.round(ideaIncubationLabel.getBoundingClientRect().left) !== Math.round(stageOneLabel.getBoundingClientRect().left)
    || Math.round(terminalHeaderLabel.getBoundingClientRect().left) !== Math.round(stageOneLabel.getBoundingClientRect().left)
  ) {
    throw new Error("Expected non-expandable plan links to align with expandable plan labels");
  }
  if (getComputedStyle(stageSevenLink, "::after").backgroundColor !== "rgba(0, 0, 0, 0)") {
    throw new Error("Expected selected rail to be reserved for the active page, not the current-stage marker");
  }
  const stageOneGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-01-foundation.html\"]");
  const stageSevenGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-07-agent-native-verification.html\"]");
  if (!stageOneGroup || !stageSevenGroup || stageOneGroup.open || stageSevenGroup.open) {
    throw new Error("Expected stage unit branches to stay collapsed until a stage is selected");
  }
  if (getComputedStyle(longUnitLabel).textOverflow !== "ellipsis") {
    throw new Error("Expected plan navigation labels to use text overflow ellipses");
  }
});
await page.locator("#wiki-nav a").filter({ hasText: "Stage-07 Agent-native Verification" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Stage 07 - Agent-native Verification");
await page.locator("#wiki-nav").evaluate(() => {
  const navLabels = [...document.querySelectorAll("#wiki-nav .wiki-nav-label")];
  const stageSevenLabel = navLabels.find((label) => label.textContent.includes("Stage-07"));
  const currentUnitLabel = navLabels.find((label) => label.textContent.includes("Verification Loop Model"));
  const stageSevenGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-07-agent-native-verification.html\"]");
  const selectedSummary = stageSevenLabel.closest("summary");
  const selectedRail = getComputedStyle(selectedSummary, "::after").backgroundColor;
  const selectedRailLeft = Number.parseFloat(getComputedStyle(selectedSummary, "::after").left);
  const selectedRailWidth = Number.parseFloat(getComputedStyle(selectedSummary, "::after").width);
  const selectedSummaryBg = getComputedStyle(selectedSummary).backgroundColor;
  if (!stageSevenGroup?.open) {
    throw new Error("Expected selected Stage 07 to expand");
  }
  if (selectedRail !== "rgb(23, 25, 22)") {
    throw new Error(`Expected selected stage to show a dark left rail, got ${selectedRail}`);
  }
  if (selectedRailLeft !== 0 || selectedRailWidth !== 2) {
    throw new Error(`Expected selected stage rail to reach the window edge, got ${selectedRailLeft}`);
  }
  if (selectedSummaryBg !== "rgb(240, 240, 237)") {
    throw new Error(`Expected selected stage background to span the whole summary row, got ${selectedSummaryBg}`);
  }
  if (!currentUnitLabel || currentUnitLabel.getBoundingClientRect().left <= stageSevenLabel.getBoundingClientRect().left) {
    throw new Error("Expected unit labels to be indented under their stage");
  }
});
await page.locator("#wiki-nav a").filter({ hasText: "Unit 01 · Verification Loop Model" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Unit 01 - Verification Loop Model");
await page.locator("#wiki-nav").evaluate(() => {
  const unitLabel = [...document.querySelectorAll("#wiki-nav .wiki-nav-label")]
    .find((label) => label.textContent.includes("Verification Loop Model"));
  const unitLink = unitLabel.closest("a");
  const unitBox = unitLink.getBoundingClientRect();
  const unitRail = getComputedStyle(unitLink, "::after");
  if (Math.round(unitBox.left) !== 0 || getComputedStyle(unitLink).backgroundColor !== "rgb(240, 240, 237)") {
    throw new Error("Expected selected unit background to reach the window edge");
  }
  if (unitRail.backgroundColor !== "rgb(23, 25, 22)" || Number.parseFloat(unitRail.left) !== 0 || Number.parseFloat(unitRail.width) !== 2) {
    throw new Error("Expected selected unit to show a 2px black left rail at the window edge");
  }
});
const stageOneUnitLinks = await page.locator("#wiki-nav a").filter({ hasText: "Unit 01 · Package And CLI Bin" }).count();
if (stageOneUnitLinks !== 1) {
  throw new Error(`Expected migrated Stage 01 unit link, got ${stageOneUnitLinks}`);
}
await page.locator("#wiki-nav a").filter({ hasText: "Stage-01 CLI and Repository Foundation" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Stage 01 - CLI and Repository Foundation");
await page.locator("#wiki-nav").evaluate(() => {
  const stageOneGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-01-foundation.html\"]");
  const stageSevenGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-07-agent-native-verification.html\"]");
  if (!stageOneGroup?.open || stageSevenGroup?.open) {
    throw new Error("Expected selected Stage 01 to expand and Stage 07 to collapse");
  }
});
await page.locator("#wiki-nav details").filter({ hasText: /^Project/ }).evaluate((element) => {
  if (element.open) throw new Error("Expected project navigation group to be collapsed by default");
});
await page.locator("#wiki-nav a").filter({ hasText: "Stage-07 Agent-native Verification" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Stage 07 - Agent-native Verification");
await page.locator("#wiki-nav a").filter({ hasText: "Unit 01 · Verification Loop Model" }).click();
await page.waitForURL(/\/workspace\/.*#\/(projects\/[^/]+\/)?wiki\/plans\/mvp\/stage-07-agent-native-verification\/unit-01-verification-loop-model\.html/);
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "Unit 01 - Verification Loop Model");
await page.locator("#wiki-nav a").filter({ hasText: "MVP Plan" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.textContent === "MVP Plan");

await page.locator("#new-cli-terminal").click();
await page.locator(".terminal-panel-header").filter({ hasText: "cli-1" }).waitFor();

const terminalPanels = await page.locator(".terminal-panel").count();
if (terminalPanels < 3) {
  throw new Error(`Expected at least 3 terminal panels, got ${terminalPanels}`);
}

const activePanels = await page.locator(".terminal-panel.active").count();
if (activePanels !== 1) {
  throw new Error(`Expected 1 active terminal panel, got ${activePanels}`);
}

await page.locator(".terminal-panel-header[data-name=\"cli\"]").click();
await page.locator(".terminal.active").click();
await page.keyboard.type("printf HYPERWIKI_UI_INPUT_OK");
await page.keyboard.press("Enter");
await page.waitForFunction(() =>
  document.querySelector(".terminal.active")?.innerText.includes("HYPERWIKI_UI_INPUT_OK")
);
await page.keyboard.type("printf HYPERWIKI_OPTION_LEFT_OK");
await page.keyboard.press("Alt+ArrowLeft");
await page.keyboard.press("Alt+ArrowRight");
await page.keyboard.press("Enter");
await page.waitForFunction(() =>
  document.querySelector(".terminal.active")?.innerText.includes("HYPERWIKI_OPTION_LEFT_OK")
);
const optionArrowLeak = await page.locator(".terminal.active").evaluate((terminal) => terminal.innerText.includes("[D") || terminal.innerText.includes("[C"));
if (optionArrowLeak) {
  throw new Error("Expected Option+Arrow to navigate instead of leaking [D/[C into the terminal.");
}

await page.locator(".terminal-panel-header[data-name=\"agent\"]").click();
await page.locator(".terminal[data-name=\"cli\"]").click();
await page.keyboard.type("printf HYPERWIKI_DIRECT_PANE_INPUT_OK");
await page.keyboard.press("Enter");
await page.waitForFunction(() =>
  document.querySelector(".terminal[data-name=\"cli\"]")?.innerText.includes("HYPERWIKI_DIRECT_PANE_INPUT_OK")
);
const directPaneActive = await page.locator(".terminal[data-name=\"cli\"]").evaluate((terminal) => terminal.classList.contains("active"));
if (!directPaneActive) {
  throw new Error("Expected clicking directly inside a terminal pane to activate it for input.");
}

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
const firstTerminalRow = await page.locator(".terminal.active .term-row").filter({ hasText: "HYPERWIKI_UI_INPUT_OK" }).first().boundingBox();
if (!firstTerminalRow) {
  throw new Error("Expected terminal row for selection test.");
}
await page.evaluate(() => window.getSelection()?.removeAllRanges());
await page.mouse.move(firstTerminalRow.x + 4, firstTerminalRow.y + firstTerminalRow.height / 2);
await page.mouse.down();
await page.mouse.move(firstTerminalRow.x + 160, firstTerminalRow.y + firstTerminalRow.height / 2, { steps: 8 });
await page.mouse.up();
const selectionText = await page.evaluate(() => window.getSelection()?.toString() || "");
if (!selectionText.trim()) {
  throw new Error("Expected terminal text to be selectable with pointer drag.");
}
await page.evaluate(() => window.getSelection()?.removeAllRanges());
await page.locator(".terminal.active").click();
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
const urlBeforeDrop = page.url();
await page.locator(".terminal-tab[data-name=\"cli\"]").evaluate((tab) => tab.click());
await page.locator(".terminal[data-name=\"cli\"]").dispatchEvent("drop", {
  dataTransfer: await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["fake image bytes"], "drop-test.png", { type: "image/png" }));
    return dataTransfer;
  })
});
await page.waitForFunction(() =>
  document.querySelector(".terminal[data-name=\"cli\"]")?.innerText.includes(".hyperwiki/state/drops/")
  && document.querySelector(".terminal[data-name=\"cli\"]")?.innerText.includes("drop-test.png")
);
if (page.url() !== urlBeforeDrop) {
  throw new Error(`Expected terminal file drop to stay on the workspace URL, got ${page.url()}`);
}
await page.keyboard.press(process.platform === "darwin" ? "Meta+Backspace" : "Control+U");

await page.locator("#repo-branch").filter({ hasText: /.+/ }).waitFor();
await page.locator("#up-next-button").click();
await page.locator("#up-next-popover").evaluate((element) => {
  if (element.hidden) throw new Error("Expected Up Next popover to open");
});
await page.locator("#up-next-button").evaluate((element) => {
  if (element.getAttribute("aria-expanded") !== "true") {
    throw new Error("Expected Up Next button to expose expanded state");
  }
});
await page.locator("#up-next-current").filter({ hasText: /Stage 07|active/i }).waitFor();
await page.locator("#up-next-next").filter({ hasText: /define|split|next/i }).waitFor();
await page.keyboard.press("Escape");
await page.locator("#up-next-popover").evaluate((element) => {
  if (!element.hidden) throw new Error("Expected Up Next popover to close on Escape");
});
await page.locator("#up-next-button").evaluate((element) => {
  if (element.getAttribute("aria-expanded") !== "false") {
    throw new Error("Expected Up Next button to expose collapsed state");
  }
});
const workspaceResponse = await fetch(`${origin}/api/workspace`);
const workspaceData = await workspaceResponse.json();
if (workspaceData.plan.summary.length === 0) {
  throw new Error("Expected workspace summary to include plan state");
}
if (!workspaceData.status?.current || !workspaceData.status?.next || !workspaceData.status?.completed) {
  throw new Error(`Expected structured Up Next status, got ${JSON.stringify(workspaceData.status)}`);
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

const renameTarget = sessionData.sessions.find((session) => session.name === "cli-1");
if (!renameTarget) {
  throw new Error("Expected cli-1 session metadata");
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

await page.locator(".terminal-panel[data-name=\"cli-1\"] .terminal-close").click();
await page.locator(".terminal-panel[data-name=\"cli-1\"]").waitFor({ state: "detached" });
await page.locator(".terminal-panel[data-name=\"agent\"] .terminal-close").click();
await page.locator(".terminal-panel[data-name=\"agent\"]").waitFor({ state: "detached" });
const finalCloseDisabled = await page.locator(".terminal-panel[data-name=\"cli\"] .terminal-close").evaluate((button) => button.disabled);
if (!finalCloseDisabled) {
  throw new Error("Expected the last remaining terminal close button to be disabled.");
}

if (errors.length > 0) {
  throw new Error(`Browser console errors: ${errors.join(" | ")}`);
}

await browser.close();
console.log("browser workspace smoke test passed");
