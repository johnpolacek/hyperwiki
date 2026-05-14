import { chromium } from "playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const url = process.env.HYPERWIKI_SMOKE_URL || "http://127.0.0.1:4177/workspace/";
const origin = new URL(url).origin;
const dashboardUrl = `${origin}/dashboard`;
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-browser-smoke-"));
const ideaHtmlPath = path.join(tempRoot, "imported-idea.html");
await writeFile(ideaHtmlPath, "<!doctype html><html><head><title>Fallback Title</title></head><body><h1>HTML Smoke Idea</h1><p>A brief imported from HTML.</p></body></html>");

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

await page.locator(".topbar-brand").filter({ hasText: "hyperwiki" }).waitFor();
await page.locator("#dashboard-button").click();
await page.waitForURL(dashboardUrl);
await page.locator("#dashboard-page").evaluate((panel) => {
  const text = panel.textContent || "";
  if (!text.includes("New Idea") || !text.includes("New Project") || !text.includes("Ideas") || !text.includes("Projects")) {
    throw new Error(`Expected dashboard to include ideas and projects, got ${text}`);
  }
  const ideasHeader = panel.querySelector(".dashboard-section-header");
  if (!ideasHeader || !ideasHeader.textContent.includes("Ideas") || !ideasHeader.textContent.includes("+ New Idea")) {
    throw new Error("Expected Ideas section header with a New Idea button.");
  }
  if (!document.querySelector("#idea-import-form")?.hidden || !document.querySelector("#project-import-form")?.hidden) {
    throw new Error("Expected dashboard forms to start collapsed.");
  }
});
await page.locator("#settings-button").click();
await page.waitForURL(`${origin}/settings`);
await page.locator("#settings-page").evaluate((panel) => {
  const text = panel.textContent || "";
  if (!text.includes("Theme") || !text.includes("Agent Instructions")) {
    throw new Error(`Expected Settings to include Theme and Agent Instructions, got ${text}`);
  }
  if (!document.querySelector("#settings-button")?.classList.contains("active")) {
    throw new Error("Expected topbar Settings button to be active on Settings.");
  }
  if (!document.querySelector(".workspace")?.classList.contains("settings-mode")) {
    throw new Error("Expected Settings to be a workspace page mode.");
  }
  if (!document.querySelector(".terminal-pane") || getComputedStyle(document.querySelector(".terminal-pane")).display !== "none") {
    throw new Error("Expected terminal pane to be hidden on Settings.");
  }
  if (getComputedStyle(document.querySelector(".wiki-command-bar")).display !== "none") {
    throw new Error("Expected Settings to hide the wiki command bar.");
  }
  if (getComputedStyle(panel).gridRowStart !== "1" || getComputedStyle(panel).gridRowEnd !== "-1") {
    throw new Error("Expected Settings page to span the full wiki pane area.");
  }
  const titleSize = Number.parseFloat(getComputedStyle(document.querySelector("#theme-title")).fontSize);
  if (titleSize < 48) {
    throw new Error(`Expected larger theme title, got ${titleSize}px.`);
  }
  const fontSample = document.querySelector(".theme-font-sample");
  if (!fontSample || !fontSample.textContent.includes("AaBbCc") || !fontSample.textContent.includes("YyZz")) {
    throw new Error("Expected font preview samples in the theme summary.");
  }
});
await page.locator("#agent-edit").click();
await page.locator("#memory-add").click();
await page.waitForFunction(() => document.querySelectorAll(".memory-entry").length > 0);
await page.locator("#agent-cancel").click();
await page.locator("#dashboard-button").click();
await page.waitForURL(dashboardUrl);
await page.locator("#new-idea-toggle").click();
await page.locator("#idea-import-form").evaluate((form) => {
  const text = form.textContent || "";
  const fileInput = form.querySelector("#idea-markdown-file");
  const importButton = form.querySelector(".dashboard-import-button");
  if (!text.includes("OR") || !text.includes("Import idea") || !text.includes("Choose File") || !text.includes("Markdown or HTML") || text.includes("Send to agent")) {
    throw new Error(`Expected custom document import affordance without Send to agent, got ${text}`);
  }
  if (!fileInput?.accept.includes(".html") || !fileInput.accept.includes("text/html")) {
    throw new Error(`Expected idea import to accept HTML, got ${fileInput?.accept}`);
  }
  if (getComputedStyle(importButton).backgroundColor !== "rgb(251, 251, 248)") {
    throw new Error(`Expected import button to match dashboard surface, got ${getComputedStyle(importButton).backgroundColor}`);
  }
  if (getComputedStyle(fileInput).opacity !== "0") {
    throw new Error("Expected native file input to be visually hidden.");
  }
});
await page.locator("#idea-title").fill("Smoke Test Idea");
await page.locator("#idea-markdown").fill("# Smoke Test Idea\n\nA test markdown brief.");
await page.evaluate(() => {
  if (!document.querySelector(".workspace")?.classList.contains("dashboard-mode")) {
    throw new Error("Expected Dashboard to be a workspace page mode.");
  }
  if (!document.querySelector(".terminal-pane") || getComputedStyle(document.querySelector(".terminal-pane")).display === "none") {
    throw new Error("Expected terminal pane chrome to stay visible before a Dashboard agent handoff.");
  }
});
await page.locator("#wiki-nav a").filter({ hasText: "Stage-08 Settings, Soul, and Memory" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Stage 08 - Settings, Soul, and Memory");
await page.locator("#wiki-nav a").filter({ hasText: "Unit-01 Global Settings Page" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Unit 01 - Global Settings Page");
await page.goto(`${origin}/workspace/#/wiki/plans/index.html`, { waitUntil: "networkidle" });
await page.waitForURL(/\/workspace\/.*#\/(projects\/[^/]+\/)?wiki\/plans\/index\.html$/);
await page.locator("#up-next-button svg path").nth(1).evaluate((element) => {
  const path = element.getAttribute("d") || "";
  if (!path.includes("M13 5v4H8v6h5v4l7-7Z")) {
    throw new Error(`Expected Up Next to use arrow-big-right-dash icon path, got ${path}`);
  }
});
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Planning Dashboard");
const workspaceSummary = await page.evaluate(async () => {
  const response = await fetch("/api/workspace");
  return response.json();
});
if (workspaceSummary.status.current !== "Unit 01 - Global Settings Page") {
  throw new Error(`Expected workspace status to derive current unit from wiki, got ${workspaceSummary.status.current}`);
}
if (workspaceSummary.status.currentPath !== "/wiki/plans/mvp/stage-08-settings-soul-memory/unit-01-global-settings-page.html") {
  throw new Error(`Expected workspace current path for Stage 08 Unit 01, got ${workspaceSummary.status.currentPath}`);
}
await page.locator("#current-page").evaluate((element) => {
  if (!element.textContent.includes("Planning Dashboard")) {
    throw new Error(`Expected current page breadcrumb for Planning Dashboard, got ${element.textContent}`);
  }
});
await page.locator("#execute-button").filter({ hasText: "Execute" }).waitFor();
await page.locator("#modify-button").filter({ hasText: "Modify" }).click();
await page.locator("#modify-plan-ui").evaluate((form) => {
  if (form.hidden || !form.textContent.includes("Send")) {
    throw new Error("Expected Modify Plan UI with Send action.");
  }
});
const modifyInput = page.locator("#modify-plan-input");
const initialModifyHeight = await modifyInput.evaluate((element) => element.clientHeight);
await modifyInput.fill(["tighten scope", "add verification", "note follow-up", "record assumption"].join("\n"));
await modifyInput.evaluate((element) => element.dispatchEvent(new Event("input", { bubbles: true })));
const expandedModifyHeight = await modifyInput.evaluate((element) => element.clientHeight);
if (expandedModifyHeight <= initialModifyHeight) {
  throw new Error(`Expected Modify textarea to expand, got ${expandedModifyHeight}/${initialModifyHeight}`);
}
await page.locator("#modify-button").click();
await page.locator("#modify-plan-ui").evaluate((form) => {
  if (!form.hidden) throw new Error("Expected Modify Plan UI to collapse.");
});
const initialTerminalCount = await page.locator(".terminal-panel").count();
if (initialTerminalCount !== 0) {
  throw new Error(`Expected no terminals before Execute, got ${initialTerminalCount}`);
}
await page.locator(".terminal-pane").evaluate((pane) => {
  if (getComputedStyle(pane).display === "none") {
    throw new Error("Expected terminal pane chrome before Execute.");
  }
  if (!pane.textContent.includes("new agent") || !pane.textContent.includes("new cli") || !pane.textContent.includes("No terminals running")) {
    throw new Error(`Expected terminal chrome with empty state before Execute, got ${pane.textContent}`);
  }
});
await page.locator(".terminal-toolbar").evaluate((toolbar) => {
  const text = toolbar.textContent || "";
  if (!toolbar.querySelector(".terminal-branch svg") || !text.includes("new agent") || !text.includes("new cli")) {
    throw new Error(`Expected compact terminal toolbar, got ${text}`);
  }
});
await page.locator("#execute-button").click();
await page.locator("#execute-menu [data-execute-target=\"main\"]").click();
await page.locator(".terminal-panel-header[data-name=\"agent\"]").waitFor();
await page.locator(".terminal-panel-header").filter({ hasText: /codex --yolo|HYPERWIKI_AGENT_DRY_RUN/ }).waitFor();
await page.locator(".terminal-panel[data-name=\"dev\"].collapsed").waitFor();
await page.locator(".terminal-pane").evaluate((pane) => {
  const toolbar = pane.querySelector(".terminal-toolbar");
  const firstPanel = pane.querySelector(".terminal-panel");
  if (!toolbar || !firstPanel) {
    throw new Error("Expected terminal toolbar and panels after Execute.");
  }
  if (firstPanel.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom > 2) {
    throw new Error("Expected terminal panels to align directly below the toolbar.");
  }
});
await page.locator("#plan-prompt").evaluate((element) => {
  if (element.hidden) throw new Error("Expected plan prompt to be visible when an agent session exists.");
});
await page.locator("#execute-button").click();
await page.locator("#execute-menu [data-execute-target=\"worktree\"]").click();
await page.locator("#preview-link").evaluate((link) => {
  if (link.hidden || !link.href.includes(".hyperwiki.localhost")) {
    throw new Error(`Expected worktree preview link, got ${link.href}`);
  }
});
await page.locator(".workspace").evaluate((workspaceElement) => {
  if (workspaceElement.dataset.executeTarget !== "worktree" || workspaceElement.dataset.executeWorkflow !== "parallel-dev-worktrees") {
    throw new Error(`Expected worktree execution workflow, got ${workspaceElement.dataset.executeTarget}/${workspaceElement.dataset.executeWorkflow}`);
  }
});
const promptInput = page.locator("#plan-prompt-input");
const initialPromptHeight = await promptInput.evaluate((element) => element.clientHeight);
await promptInput.fill(["one", "two", "three", "four", "five", "six"].join("\n"));
await promptInput.evaluate((element) => element.dispatchEvent(new Event("input", { bubbles: true })));
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
const promptButtonMetrics = await page.locator("#plan-prompt-submit").evaluate((button) => {
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
await page.locator("#plan-prompt-submit").click();
await page.locator("#plan-prompt-status").filter({ hasText: "Sent to agent." }).waitFor();

await page.locator("#dashboard-button").click();
await page.waitForURL(dashboardUrl);
if (await page.locator("#idea-import-form").evaluate((form) => form.hidden)) {
  await page.locator("#new-idea-toggle").click();
}
await page.locator("#idea-markdown-file").setInputFiles(ideaHtmlPath);
await page.waitForFunction(() => document.querySelector("#idea-title")?.value === "HTML Smoke Idea");
await page.locator("#idea-markdown").evaluate((textarea) => {
  if (textarea.dataset.documentType !== "html" || !textarea.value.includes("<h1>HTML Smoke Idea</h1>")) {
    throw new Error("Expected imported HTML content and document type.");
  }
});
await page.locator("#dashboard-status").filter({ hasText: "Agent started for wiki/ideas/html-smoke-idea.html" }).waitFor();
await page.evaluate(() => {
  location.hash = "#/wiki/plans/index.html";
});
await page.waitForURL(/#\/wiki\/plans\/index\.html$/);

await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Planning Dashboard");
const currentPage = await page.locator("#current-page").evaluate((element) => element.dataset.title);
if (currentPage !== "Planning Dashboard") {
  throw new Error(`Expected Planning Dashboard, got ${currentPage}`);
}
await page.locator("#wiki-nav .plan-tree").evaluate((element) => {
  if (element.tagName === "DETAILS") throw new Error("Expected plan navigation heading not to be collapsible");
  if (element.textContent.includes("Planning Dashboard")) throw new Error("Expected plan navigation to omit Planning Dashboard");
  if (!element.textContent.includes("Completed Plans")) throw new Error("Expected completed plans archive in plan navigation");
  if (!element.textContent.includes("Agent Workspace Enablers")) throw new Error("Expected extracted enabler plan in completed plans archive");
  const topLevelLabels = [...element.children]
    .filter((child) => !child.classList.contains("plan-tree-heading"))
    .map((child) => child.querySelector(":scope > summary .wiki-nav-label, :scope > .wiki-nav-label")?.textContent || child.textContent || "");
  if (topLevelLabels.includes("Plan Unit Navigation")) {
    throw new Error(`Expected completed plans to move out of the active plan list, got ${topLevelLabels.join(", ")}`);
  }
  const completedArchiveLink = [...element.querySelectorAll("a")]
    .find((link) => link.textContent.includes("Completed Plans"));
  if (!completedArchiveLink || completedArchiveLink.classList.contains("completed-plan-link")) {
    throw new Error("Expected Completed Plans archive row to stay unmarked.");
  }
});
await page.locator("#wiki-nav a.current-plan").filter({ hasText: "MVP Plan" }).waitFor();
await page.locator("#wiki-nav a.current-stage").filter({ hasText: "Stage-08" }).waitFor();
await page.locator("#wiki-nav a").filter({ hasText: "Stage-01 CLI and Repository Foundation" }).waitFor();
await page.locator(".workspace").evaluate((workspaceElement) => {
  const sidebar = document.querySelector(".sidebar");
  const directPlanLink = document.querySelector(".plan-tree > .plan-subtree > summary a");
  const nestedPlanGroup = document.querySelector(".plan-tree .plan-subtree .plan-subtree");
  if (!sidebar || !directPlanLink || !nestedPlanGroup) {
    throw new Error("Expected sidebar plan navigation elements");
  }
  const topbarBg = getComputedStyle(document.querySelector(".topbar")).backgroundColor;
  if (!["rgb(251, 251, 250)", "rgb(255, 255, 255)", "rgb(255, 253, 248)"].includes(topbarBg)) {
    throw new Error(`Expected topbar to use the light UI surface, got ${topbarBg}`);
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
  const planHeading = document.querySelector(".plan-tree-heading");
  if (!planHeading) {
    throw new Error("Expected Plans heading");
  }
  if (getComputedStyle(planHeading).paddingLeft !== "13px") {
    throw new Error(`Expected Plans heading to align with plan chevrons, got ${getComputedStyle(planHeading).paddingLeft}`);
  }
  if (getComputedStyle(sidebar).paddingTop !== "6px") {
    throw new Error(`Expected compact sidebar top padding, got ${getComputedStyle(sidebar).paddingTop}`);
  }
  if (sidebar.scrollWidth > sidebar.clientWidth + 1) {
    throw new Error(`Expected sidebar labels to clip without horizontal overflow, got ${sidebar.scrollWidth}/${sidebar.clientWidth}`);
  }
  const brandRule = getComputedStyle(document.querySelector(".brand"), "::after").content;
  if (brandRule !== "none") {
    throw new Error(`Expected empty brand separator to be removed, got ${brandRule}`);
  }
  const navLabels = [...document.querySelectorAll("#wiki-nav .wiki-nav-label")];
  const stageOneLabel = navLabels.find((label) => label.textContent.includes("Stage-01"));
  const stageSevenLabel = navLabels.find((label) => label.textContent.includes("Stage-08"));
  const ideaIncubationLabel = navLabels.find((label) => label.textContent.includes("Idea Incubation"));
  const terminalHeaderLabel = navLabels.find((label) => label.textContent.includes("Terminal Header Simplification"));
  const longUnitLabel = navLabels.find((label) => label.textContent.includes("Unit-03"));
  if (!stageOneLabel || !stageSevenLabel || !ideaIncubationLabel || !terminalHeaderLabel || !longUnitLabel) {
    throw new Error("Expected stage and unit labels in plan navigation");
  }
  if (stageOneLabel.getBoundingClientRect().top >= stageSevenLabel.getBoundingClientRect().top) {
    throw new Error("Expected Stage 01 to appear before Stage 08 in plan navigation");
  }
  const unitIndent = longUnitLabel.getBoundingClientRect().left - stageSevenLabel.getBoundingClientRect().left;
  if (unitIndent < 10 || unitIndent > 16) {
    throw new Error(`Expected unit rows to sit slightly under stages, got ${unitIndent}px`);
  }
  const stageOneLink = stageOneLabel.closest("a");
  const stageSevenLink = stageSevenLabel.closest("a");
  const currentPlanLink = document.querySelector("#wiki-nav a.current-plan");
  const currentStageLinks = [...document.querySelectorAll("#wiki-nav a.current-stage")];
  if (currentStageLinks.length !== 1 || !currentStageLinks[0].textContent.includes("Stage-08")) {
    throw new Error(`Expected exactly one current stage marker for Stage 08, got ${currentStageLinks.map((link) => link.textContent.trim()).join(", ")}`);
  }
  const stageOneBefore = getComputedStyle(stageOneLink, "::before");
  const stageSevenBefore = getComputedStyle(stageSevenLink, "::before");
  const currentPlanBefore = getComputedStyle(currentPlanLink, "::before");
  if (stageOneBefore.backgroundColor !== "rgb(211, 216, 207)") {
    throw new Error(`Expected completed stage dot to be light gray, got ${stageOneBefore.backgroundColor}`);
  }
  if (currentPlanBefore.backgroundColor !== "rgb(37, 162, 68)") {
    throw new Error(`Expected current plan dot to be green, got ${currentPlanBefore.backgroundColor}`);
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
  if (getComputedStyle(stageSevenLink, "::after").content !== "none") {
    throw new Error("Expected current-stage marker not to show the selected-page indicator before the stage is selected");
  }
  const stageOneGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-01-foundation.html\"]");
  const stageSevenGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-08-settings-soul-memory.html\"]");
  if (!stageOneGroup || !stageSevenGroup || stageOneGroup.open || !stageSevenGroup.open) {
    throw new Error("Expected current stage branch to expand by default under the current plan");
  }
  if (getComputedStyle(longUnitLabel).textOverflow !== "ellipsis") {
    throw new Error("Expected plan navigation labels to use text overflow ellipses");
  }
  if (getComputedStyle(longUnitLabel).flexGrow !== "1") {
    throw new Error("Expected plan navigation labels to flex within their row for ellipses");
  }
  if (longUnitLabel.scrollWidth <= longUnitLabel.clientWidth) {
    throw new Error(`Expected long plan label to overflow within a clipped label box, got ${longUnitLabel.scrollWidth}/${longUnitLabel.clientWidth}`);
  }
});
await page.locator("#wiki-nav a").filter({ hasText: "Stage-08 Settings, Soul, and Memory" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Stage 08 - Settings, Soul, and Memory");
await page.locator("#wiki-nav").evaluate(() => {
  const stageSevenGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-07-agent-native-verification.html\"]");
  const stageSevenText = stageSevenGroup?.textContent || "";
  if (stageSevenText.includes("Workspace Framing Update") || stageSevenText.includes("Sidebar Project Pin") || stageSevenText.includes("Execute Target Workflow")) {
    throw new Error(`Expected Stage 07 to omit extracted completed enabler units, got ${stageSevenText}`);
  }
  if (!stageSevenText.includes("Verification Loop Model") || !stageSevenText.includes("MCP Surface Definition")) {
    throw new Error(`Expected Stage 07 to keep core verification units, got ${stageSevenText}`);
  }
  const navLabels = [...document.querySelectorAll("#wiki-nav .wiki-nav-label")];
  const stageEightLabel = navLabels.find((label) => label.textContent.includes("Stage-08"));
  const currentUnitLabel = navLabels.find((label) => label.textContent.includes("Global Settings Page"));
  const longExpandedUnitLabel = navLabels.find((label) => label.textContent.includes("Soul and Memory Controls"));
  const stageEightGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-08-settings-soul-memory.html\"]");
  const selectedSummary = stageEightLabel.closest("summary");
  const selectedSummaryBg = getComputedStyle(selectedSummary).backgroundColor;
  const selectedDot = getComputedStyle(selectedSummary.querySelector("a"), "::before").backgroundColor;
  const selectedIndicator = getComputedStyle(selectedSummary, "::after");
  if (!stageEightGroup?.open) {
    throw new Error("Expected selected Stage 08 to expand");
  }
  if (selectedDot !== "rgb(37, 162, 68)") {
    throw new Error(`Expected selected stage dot to be green, got ${selectedDot}`);
  }
  if (selectedSummaryBg === "rgba(0, 0, 0, 0)" || selectedIndicator.content === "none") {
    throw new Error("Expected selected stage to show a visible selected-page indicator");
  }
  const containingPlanGroup = stageEightGroup.closest(".plan-tree > .plan-subtree");
  if (getComputedStyle(containingPlanGroup).borderBottomStyle !== "solid" || getComputedStyle(containingPlanGroup).paddingBottom !== "10px") {
    throw new Error("Expected expanded plan branch to separate from following plan rows");
  }
  if (!currentUnitLabel || currentUnitLabel.getBoundingClientRect().left <= stageEightLabel.getBoundingClientRect().left) {
    throw new Error("Expected unit labels to be indented under their stage");
  }
  if (!longExpandedUnitLabel || getComputedStyle(longExpandedUnitLabel).textOverflow !== "ellipsis") {
    throw new Error("Expected expanded unit labels to keep text-overflow ellipses");
  }
  if (longExpandedUnitLabel.scrollWidth <= longExpandedUnitLabel.clientWidth) {
    throw new Error(`Expected expanded long unit label to overflow inside a clipped box, got ${longExpandedUnitLabel.scrollWidth}/${longExpandedUnitLabel.clientWidth}`);
  }
  const sidebar = document.querySelector(".sidebar");
  if (sidebar.scrollWidth > sidebar.clientWidth + 1) {
    throw new Error(`Expected expanded sidebar labels to clip without horizontal overflow, got ${sidebar.scrollWidth}/${sidebar.clientWidth}`);
  }
});
await page.locator("#wiki-nav a").filter({ hasText: "Unit-01 Global Settings Page" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Unit 01 - Global Settings Page");
await page.locator("#wiki-nav").evaluate(() => {
  const unitLabel = [...document.querySelectorAll("#wiki-nav .wiki-nav-label")]
    .find((label) => label.textContent.includes("Global Settings Page"));
  const unitLink = unitLabel.closest("a");
  const unitDot = getComputedStyle(unitLink, "::before").backgroundColor;
  const unitIndicator = getComputedStyle(unitLink, "::after");
  if (getComputedStyle(unitLink).backgroundColor === "rgba(0, 0, 0, 0)" || unitIndicator.content === "none") {
    throw new Error("Expected selected unit to show a visible selected-page indicator");
  }
  if (unitDot !== "rgb(37, 162, 68)") {
    throw new Error(`Expected selected unit dot to be green, got ${unitDot}`);
  }
});
const stageOneUnitLinks = await page.locator("#wiki-nav a").filter({ hasText: "Unit-01 Package And CLI Bin" }).count();
if (stageOneUnitLinks !== 1) {
  throw new Error(`Expected migrated Stage 01 unit link, got ${stageOneUnitLinks}`);
}
await page.locator("#wiki-nav a").filter({ hasText: "Unit-01 Package And CLI Bin" }).evaluate((link) => {
  const marker = getComputedStyle(link, "::before");
  if (!link.classList.contains("completed-plan-link") || marker.backgroundColor !== "rgb(211, 216, 207)") {
    throw new Error(`Expected completed unit sidebar link to use muted completion styling, got ${marker.backgroundColor}`);
  }
});
await page.locator("#wiki-nav a").filter({ hasText: "Stage-01 CLI and Repository Foundation" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Stage 01 - CLI and Repository Foundation");
await page.locator(".wiki-command-bar").evaluate((bar) => {
  if (bar.querySelector("#completion-badge")?.hidden || !bar.querySelector("#modify-button")?.hidden || !bar.querySelector("#execute-button")?.hidden) {
    throw new Error("Expected completed stage to replace Modify/Execute with Completed.");
  }
});
await page.locator("#wiki-nav").evaluate(() => {
  const stageOneGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-01-foundation.html\"]");
  const stageSevenGroup = document.querySelector("details.plan-subtree[data-path=\"/wiki/plans/mvp/stage-08-settings-soul-memory.html\"]");
  if (!stageOneGroup?.open || stageSevenGroup?.open) {
    throw new Error("Expected selected Stage 01 to expand and Stage 08 to collapse");
  }
  const stageOneLink = stageOneGroup.querySelector(":scope > summary a");
  if (!stageOneLink.classList.contains("completed-plan-link")) {
    throw new Error("Expected completed stage sidebar link to be marked as completed.");
  }
  if (stageOneLink.getAttribute("aria-label") !== "Stage-01 CLI and Repository Foundation completed") {
    throw new Error(`Expected completed stage accessible label, got ${stageOneLink.getAttribute("aria-label")}`);
  }
  if (getComputedStyle(stageOneLink, "::before").backgroundColor !== "rgb(211, 216, 207)") {
    throw new Error("Expected completed stage sidebar link to use muted completion styling.");
  }
  if (getComputedStyle(stageOneLink).color !== "rgb(141, 146, 138)") {
    throw new Error(`Expected completed stage to be lighter, got ${getComputedStyle(stageOneLink).color}`);
  }
});
await page.locator("#wiki-nav details").filter({ hasText: /^Project/ }).evaluate((element) => {
  if (element.open) throw new Error("Expected project navigation group to be collapsed by default");
  if (!element.classList.contains("project-nav-group")) {
    throw new Error("Expected project navigation to have bottom-pinned styling hook");
  }
  const sidebar = document.querySelector(".sidebar");
  const nav = document.querySelector("#wiki-nav");
  const planTree = document.querySelector("#wiki-nav .plan-tree");
  if (!sidebar || !nav || !planTree) {
    throw new Error("Expected sidebar navigation elements");
  }
  const elementRect = element.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  if (Math.abs(elementRect.bottom - sidebarRect.bottom) > 3) {
    throw new Error(`Expected project navigation pinned to sidebar bottom, got ${elementRect.bottom}/${sidebarRect.bottom}`);
  }
  if (Math.abs(elementRect.right - sidebarRect.right) > 2) {
    throw new Error(`Expected Project divider to reach sidebar right border, got ${elementRect.right}/${sidebarRect.right}`);
  }
  const projectSummary = element.querySelector(":scope > summary");
  const projectChevronStyle = getComputedStyle(projectSummary, "::after");
  if (projectChevronStyle.width !== "22px" || projectChevronStyle.paddingRight !== "3px" || projectChevronStyle.textAlign !== "right") {
    throw new Error("Expected Project navigation chevron to sit on the right edge");
  }
  const plansHeading = planTree.querySelector(":scope > .plan-tree-heading");
  if (Math.abs(projectSummary.getBoundingClientRect().left - plansHeading.getBoundingClientRect().left) > 1) {
    throw new Error("Expected Project label to align with Plans label");
  }
  const planRect = planTree.getBoundingClientRect();
  if (elementRect.top <= planRect.top) {
    throw new Error("Expected project navigation to render after plan navigation");
  }
  const firstPlanItem = planTree.querySelector(":scope > .plan-subtree, :scope > a");
  if (!plansHeading || !firstPlanItem) {
    throw new Error("Expected plans heading and first plan item");
  }
  const plansGap = firstPlanItem.getBoundingClientRect().top - plansHeading.getBoundingClientRect().bottom;
  if (plansGap > 16) {
    throw new Error(`Expected plan items directly below Plans heading, got ${plansGap}px gap`);
  }
  const text = element.textContent || "";
  if (!text.includes("Sources") || !text.includes("Log")) {
    throw new Error(`Expected Sources and Log under Project, got ${text}`);
  }
  element.open = true;
  if (Number(getComputedStyle(element).zIndex) <= Number(getComputedStyle(planTree).zIndex || 0)) {
    throw new Error("Expected expanded project navigation to stack above plans");
  }
  element.open = false;
});
await page.locator("#wiki-nav a").filter({ hasText: "Stage-08 Settings, Soul, and Memory" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Stage 08 - Settings, Soul, and Memory");
await page.locator("#wiki-nav a").filter({ hasText: "Unit-01 Global Settings Page" }).click();
await page.waitForURL(/\/workspace\/.*#\/(projects\/[^/]+\/)?wiki\/plans\/mvp\/stage-08-settings-soul-memory\/unit-01-global-settings-page\.html/);
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "Unit 01 - Global Settings Page");
await page.locator("#wiki-nav a").filter({ hasText: "MVP Plan" }).click();
await page.waitForFunction(() => document.querySelector("#current-page")?.dataset.title === "MVP Plan");

await page.locator("#new-cli-terminal").click();
await page.locator(".terminal-panel-header").filter({ hasText: "interactive shell" }).waitFor();
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
  && document.querySelector(".terminal[data-name=\"cli\"]")?.innerText.includes("p-test.png")
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
await page.locator("#up-next-popover dt").filter({ hasText: "Up Next" }).waitFor();
await page.locator("#up-next-stage").filter({ hasText: /Stage 08/i }).waitFor();
await page.locator("#up-next-current").filter({ hasText: /Unit 01|Global Settings Page/i }).waitFor();
await page.locator("#up-next-link").filter({ hasText: "Open unit" }).waitFor();
const nextRowCount = await page.locator("#up-next-popover dt").filter({ hasText: /^Next$/ }).count();
if (nextRowCount !== 0) {
  throw new Error("Expected Up Next popover to omit separate Next row");
}
await page.locator("#up-next-link").click();
await page.waitForURL(/\/wiki\/plans\/mvp\/stage-08-settings-soul-memory/);
await page.locator("#up-next-button").click();
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
if (!workspaceData.status?.stage || !workspaceData.status?.current || !workspaceData.status?.currentPath || !workspaceData.status?.completed) {
  throw new Error(`Expected structured Up Next status, got ${JSON.stringify(workspaceData.status)}`);
}
if (workspaceData.sources.briefs.length < 3) {
  throw new Error(`Expected source briefs, got ${workspaceData.sources.briefs.length}`);
}
if (!workspaceData.layout.panels.some((panel) => panel.name === "dev" && panel.command === "pnpm dev")) {
  throw new Error("Expected hyperwiki dogfood layout to include configured Portless dev panel");
}
if (!workspaceData.layout.panels.some((panel) => panel.name === "agent" && panel.command)) {
  throw new Error("Expected workspace layout to include configured agent panel");
}
const guardrailResponse = await fetch(`${origin}/api/guardrails`);
const guardrailData = await guardrailResponse.json();
if (guardrailData.mode.label !== "Localhost Tooling") {
  throw new Error(`Expected Localhost Tooling guardrail mode, got ${guardrailData.mode.label}`);
}
if (!guardrailData.mode.value.includes("local trust boundary")) {
  throw new Error(`Expected guardrails to document the local trust boundary, got ${guardrailData.mode.value}`);
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
await page.locator(".terminal-panel[data-name=\"cli\"] .terminal-close").click();
await page.locator(".terminal-panel[data-name=\"cli\"]").waitFor({ state: "detached" });
while (await page.locator(".terminal-panel .terminal-close").count() > 0) {
  await page.locator(".terminal-panel .terminal-close").first().click();
}
await page.locator(".terminal-pane").evaluate((pane) => {
  if (document.querySelectorAll(".terminal-panel").length !== 0) {
    throw new Error("Expected every terminal to be removable.");
  }
  if (!pane.textContent.includes("No terminals running")) {
    throw new Error(`Expected empty terminal pane message after closing every terminal, got ${pane.textContent}`);
  }
  const empty = pane.querySelector(".terminal-empty");
  const toolbar = pane.querySelector(".terminal-toolbar");
  if (!empty || !toolbar) {
    throw new Error("Expected terminal empty state and toolbar.");
  }
  if (empty.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom > 24) {
    throw new Error("Expected empty terminal state to align near the top of the pane.");
  }
});

if (errors.length > 0) {
  throw new Error(`Browser console errors: ${errors.join(" | ")}`);
}

await browser.close();
console.log("browser workspace smoke test passed");
