import { WTerm, WebSocketTransport } from "/vendor/@wterm/dom/dist/index.js";

const wikiFrame = document.getElementById("wiki-frame");
const wikiNav = document.getElementById("wiki-nav");
const currentPage = document.getElementById("current-page");
const openPage = document.getElementById("open-page");
const completionBadge = document.getElementById("completion-badge");
const modifyButton = document.getElementById("modify-button");
const modifyPlanUi = document.getElementById("modify-plan-ui");
const modifyPlanInput = document.getElementById("modify-plan-input");
const modifyPlanStatus = document.getElementById("modify-plan-status");
const executeButton = document.getElementById("execute-button");
const executeMenu = document.getElementById("execute-menu");
const previewLink = document.getElementById("preview-link");
const terminals = document.getElementById("terminals");
const terminalTabs = document.getElementById("terminal-tabs");
const terminalPane = document.querySelector(".terminal-pane");
const wikiPane = document.querySelector(".wiki-pane");
const thinkingEffort = document.getElementById("thinking-effort");
const newAgentTerminalButton = document.getElementById("new-agent-terminal");
const newCliTerminalButton = document.getElementById("new-cli-terminal");
const repoBranch = document.getElementById("repo-branch");
const settingsButton = document.getElementById("settings-button");
const projectsPage = document.getElementById("projects-page");
const newProjectPage = document.getElementById("new-project-page");
const dashboardProjects = document.getElementById("dashboard-projects");
const projectsStatus = document.getElementById("projects-status");
const newProjectStatus = document.getElementById("new-project-status");
const newProjectPageLink = document.getElementById("new-project-page-link");
const projectImportForm = document.getElementById("project-import-form");
const projectTitleInput = document.getElementById("project-title");
const projectMarkdownInput = document.getElementById("project-markdown");
const projectMarkdownFile = document.getElementById("project-markdown-file");
const upNextButton = document.getElementById("up-next-button");
const upNextPopover = document.getElementById("up-next-popover");
const settingsPage = document.getElementById("settings-page");
const settingsStatus = document.getElementById("settings-status");
const settingsLayout = document.querySelector(".settings-layout");
const themeTitle = document.getElementById("theme-title");
const themeHeroSwatches = document.getElementById("theme-hero-swatches");
const themeSummary = document.getElementById("theme-summary");
const themeEdit = document.getElementById("theme-edit");
const themeEditor = document.getElementById("theme-editor");
const themeCancel = document.getElementById("theme-cancel");
const themeSave = document.getElementById("theme-save");
const themePresetBar = document.getElementById("theme-preset-bar");
const themePresetPicker = document.getElementById("theme-preset-picker");
const themeEditorLayout = document.getElementById("theme-editor-layout");
const themeMode = document.getElementById("theme-mode");
const themePrimary = document.getElementById("theme-primary");
const themeSecondary = document.getElementById("theme-secondary");
const themeSecondaryToggle = document.getElementById("theme-secondary-toggle");
const themeSecondaryClear = document.getElementById("theme-secondary-clear");
const themeTerminalMode = document.getElementById("theme-terminal-mode");
const themeTerminalAccent = document.getElementById("theme-terminal-accent");
const themeControls = document.getElementById("theme-controls");
const themeJson = document.getElementById("theme-json");
const agentSummary = document.getElementById("agent-summary");
const agentEdit = document.getElementById("agent-edit");
const agentEditor = document.getElementById("agent-editor");
const agentCancel = document.getElementById("agent-cancel");
const agentSave = document.getElementById("agent-save");
const agentCancelBottom = document.getElementById("agent-cancel-bottom");
const agentSaveBottom = document.getElementById("agent-save-bottom");
const agentsFilePath = document.getElementById("agents-file-path");
const agentsFileContent = document.getElementById("agents-file-content");
const soulPrinciples = document.getElementById("soul-principles");
const soulInterface = document.getElementById("soul-interface");
const soulAgent = document.getElementById("soul-agent");
const memoryList = document.getElementById("memory-list");
const memoryAdd = document.getElementById("memory-add");
const upNextCompleted = document.getElementById("up-next-completed");
const upNextStage = document.getElementById("up-next-stage");
const upNextCurrent = document.getElementById("up-next-current");
const upNextLink = document.getElementById("up-next-link");
const planPrompt = document.getElementById("plan-prompt");
const planPromptInput = document.getElementById("plan-prompt-input");
const planPromptStatus = document.getElementById("plan-prompt-status");
const workspace = document.querySelector(".workspace");
const projectToggle = document.getElementById("project-toggle");
const projectPanel = document.getElementById("project-panel");
const projectList = document.getElementById("project-list");
const manageProjectsLink = document.getElementById("manage-projects-link");
const newProjectLink = document.getElementById("new-project-link");
const terminalSessions = new Map();
const wikiPageTitles = new Map();
const wikiPageStatus = new Map();
let agentTerminalCount = 0;
let cliTerminalCount = 0;
let requestedWikiPath = "/wiki/index.html";
let activeTerminalName = null;
let guardrails = null;
let terminalLayout = [];
let activeProjectId = new URLSearchParams(location.search).get("project");
let activeProjectSlug = workspaceSlugs().projectSlug;
let activeWorktreeSlug = workspaceSlugs().worktreeSlug;
let pendingProjectRemovalId = null;
let currentPlanPath = "/wiki/plans/index.html";
let nonPlanPromptSubmitted = false;
let settingsState = null;
let themeDraft = null;
let themeDraftSimple = null;
let themePresetPickerOpen = false;
let agentDraft = null;
let agentsFileDraft = "";
let agentWikiRefreshTimer = null;
const thinkingEffortStorageKey = "hyperwiki.thinkingEffort";
const thinkingEffortLevels = new Set(["low", "medium", "high", "xhigh"]);

const themeSurfaces = [
  {
    key: "ui",
    label: "UI",
    description: "Sidebar and workspace chrome",
    colorTokens: ["bg", "panel", "border", "text", "muted", "accent"],
    fontTokens: ["sidebarFont"]
  },
  {
    key: "docs",
    label: "Docs",
    description: "Planning and wiki pages",
    colorTokens: ["bg", "panel", "border", "text", "muted", "link", "code"],
    fontTokens: ["serifFont", "monoFont"]
  },
  {
    key: "terminal",
    label: "Terminal",
    description: "Pane chrome and session frames",
    colorTokens: ["bg", "pane", "toolbar", "header", "border", "text", "muted", "accent"],
    fontTokens: ["font"]
  }
];

const fontOptions = [
  { label: "Inter", type: "sans", value: "\"Inter\", ui-sans-serif, system-ui, sans-serif", google: "Inter:wght@400;500;600;700" },
  { label: "Roboto", type: "sans", value: "\"Roboto\", ui-sans-serif, system-ui, sans-serif", google: "Roboto:wght@400;500;700" },
  { label: "Open Sans", type: "sans", value: "\"Open Sans\", ui-sans-serif, system-ui, sans-serif", google: "Open+Sans:wght@400;500;600;700" },
  { label: "Lato", type: "sans", value: "\"Lato\", ui-sans-serif, system-ui, sans-serif", google: "Lato:wght@400;700" },
  { label: "Montserrat", type: "sans", value: "\"Montserrat\", ui-sans-serif, system-ui, sans-serif", google: "Montserrat:wght@400;500;600;700" },
  { label: "Source Sans 3", type: "sans", value: "\"Source Sans 3\", ui-sans-serif, system-ui, sans-serif", google: "Source+Sans+3:wght@400;500;600;700" },
  { label: "Work Sans", type: "sans", value: "\"Work Sans\", ui-sans-serif, system-ui, sans-serif", google: "Work+Sans:wght@400;500;600;700" },
  { label: "IBM Plex Sans", type: "sans", value: "\"IBM Plex Sans\", ui-sans-serif, system-ui, sans-serif", google: "IBM+Plex+Sans:wght@400;500;600;700" },
  { label: "DM Sans", type: "sans", value: "\"DM Sans\", ui-sans-serif, system-ui, sans-serif", google: "DM+Sans:wght@400;500;600;700" },
  { label: "Noto Sans", type: "sans", value: "\"Noto Sans\", ui-sans-serif, system-ui, sans-serif", google: "Noto+Sans:wght@400;500;600;700" },
  { label: "Poppins", type: "sans", value: "\"Poppins\", ui-sans-serif, system-ui, sans-serif", google: "Poppins:wght@400;500;600;700" },
  { label: "Nunito", type: "sans", value: "\"Nunito\", ui-sans-serif, system-ui, sans-serif", google: "Nunito:wght@400;500;600;700" },
  { label: "Instrument Serif", type: "serif", value: "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif", google: "" },
  { label: "Merriweather", type: "serif", value: "\"Merriweather\", ui-serif, Georgia, serif", google: "Merriweather:wght@400;700" },
  { label: "Lora", type: "serif", value: "\"Lora\", ui-serif, Georgia, serif", google: "Lora:wght@400;500;600;700" },
  { label: "Playfair Display", type: "serif", value: "\"Playfair Display\", ui-serif, Georgia, serif", google: "Playfair+Display:wght@400;600;700" },
  { label: "Libre Baskerville", type: "serif", value: "\"Libre Baskerville\", ui-serif, Georgia, serif", google: "Libre+Baskerville:wght@400;700" },
  { label: "Crimson Pro", type: "serif", value: "\"Crimson Pro\", ui-serif, Georgia, serif", google: "Crimson+Pro:wght@400;500;600;700" },
  { label: "Newsreader", type: "serif", value: "\"Newsreader\", ui-serif, Georgia, serif", google: "Newsreader:wght@400;600;700" },
  { label: "Source Serif 4", type: "serif", value: "\"Source Serif 4\", ui-serif, Georgia, serif", google: "Source+Serif+4:wght@400;600;700" },
  { label: "EB Garamond", type: "serif", value: "\"EB Garamond\", ui-serif, Georgia, serif", google: "EB+Garamond:wght@400;500;600;700" },
  { label: "Cormorant Garamond", type: "serif", value: "\"Cormorant Garamond\", ui-serif, Georgia, serif", google: "Cormorant+Garamond:wght@400;500;600;700" },
  { label: "Literata", type: "serif", value: "\"Literata\", ui-serif, Georgia, serif", google: "Literata:wght@400;500;600;700" },
  { label: "Fraunces", type: "serif", value: "\"Fraunces\", ui-serif, Georgia, serif", google: "Fraunces:wght@400;500;600;700" },
  { label: "Sometype Mono", type: "mono", value: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "" },
  { label: "IBM Plex Mono", type: "mono", value: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "IBM+Plex+Mono:wght@400;500;600;700" },
  { label: "Space Mono", type: "mono", value: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "Space+Mono:wght@400;700" },
  { label: "JetBrains Mono", type: "mono", value: "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "JetBrains+Mono:wght@400;500;600;700" },
  { label: "Fira Code", type: "mono", value: "\"Fira Code\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "Fira+Code:wght@400;500;600;700" },
  { label: "Source Code Pro", type: "mono", value: "\"Source Code Pro\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "Source+Code+Pro:wght@400;500;600;700" },
  { label: "Roboto Mono", type: "mono", value: "\"Roboto Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "Roboto+Mono:wght@400;500;600;700" }
];

const serifFontOptions = fontOptions.filter((font) => font.type === "serif");
const sansFontOptions = fontOptions.filter((font) => font.type === "sans");
const monoFontOptions = fontOptions.filter((font) => font.type === "mono");

window.addEventListener("hashchange", () => {
  activateWorkspaceLocation(workspaceLocation());
});

wikiFrame.addEventListener("load", () => {
  installEmbeddedWikiNavigation();
  syncFrameLocation();
});

await loadProjects();
await loadProjectManagement();
await loadSettings();
await loadRepoContext();
await loadWikiNav();
await loadWorkspaceSummary();
await loadGuardrails();
initThinkingEffortPicker();
activateWorkspaceLocation(workspaceLocation() || currentPlanPath);
delete document.documentElement.dataset.initialRoute;
await restoreTerminals();

newAgentTerminalButton.addEventListener("click", async () => {
  if (workspace.classList.contains("non-plan-wiki-mode")) return;
  const template = agentTerminalTemplate();
  const name = nextTerminalName("agent");
  await createTerminal(name, { ...template, name });
  activateTerminal(name);
});

newCliTerminalButton.addEventListener("click", async () => {
  if (workspace.classList.contains("non-plan-wiki-mode")) return;
  const template = terminalTemplate("cli");
  const name = nextTerminalName("cli");
  await createTerminal(name, { ...template, name });
  activateTerminal(name);
});

executeButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = executeMenu.hidden;
  executeMenu.hidden = !open;
  executeButton.setAttribute("aria-expanded", String(open));
});

executeMenu.addEventListener("click", (event) => {
  const target = event.target.closest("[data-execute-target]");
  if (!target) return;
  executeMenu.hidden = true;
  executeButton.setAttribute("aria-expanded", "false");
  void executeTarget(target.dataset.executeTarget || "main");
});

modifyButton.addEventListener("click", () => {
  const open = modifyPlanUi.hidden;
  modifyPlanUi.hidden = !open;
  modifyButton.setAttribute("aria-expanded", String(open));
  if (open) {
    resizePlanTextarea(modifyPlanInput);
    requestAnimationFrame(() => modifyPlanInput.focus());
  }
});

modifyPlanInput.addEventListener("input", () => resizePlanTextarea(modifyPlanInput));
modifyPlanInput.addEventListener("keydown", submitFormWithCommandEnter);
resizePlanTextarea(modifyPlanInput);

modifyPlanUi.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = modifyPlanInput.value.trim();
  if (!prompt) return;
  modifyPlanStatus.textContent = "Sending...";
  try {
    await ensureAgentTerminal();
    await postAgentPromptWithRetry(modifyPlanPrompt(prompt), currentPage.title || requestedWikiPath);
    modifyPlanInput.value = "";
    resizePlanTextarea(modifyPlanInput);
    modifyPlanStatus.textContent = "Sent to agent.";
    activateTerminal("agent");
  } catch (error) {
    modifyPlanStatus.textContent = error.message || "Agent unavailable.";
  }
});

planPromptInput.addEventListener("input", resizePlanPromptInput);
planPromptInput.addEventListener("keydown", submitFormWithCommandEnter);
resizePlanPromptInput();

planPrompt.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = planPromptInput.value.trim();
  if (!prompt) return;
  planPromptStatus.textContent = "Sending...";
  try {
    const pagePath = currentPage.title || requestedWikiPath;
    const agentPrompt = isNonPlanWikiPath(pagePath)
      ? modifyWikiPagePrompt(prompt)
      : prompt;
    if (isNonPlanWikiPath(pagePath)) {
      nonPlanPromptSubmitted = true;
      planPrompt.hidden = true;
      workspace.classList.add("non-plan-agent-active");
      closeAllTerminals();
      await ensureAgentTerminal();
      activateTerminal("agent");
    }
    await postAgentPromptWithRetry(agentPrompt, pagePath);
    planPromptInput.value = "";
    resizePlanPromptInput();
    planPromptStatus.textContent = "Sent to agent.";
    if (terminalSessions.has("agent")) activateTerminal("agent");
  } catch (error) {
    if (isNonPlanWikiPath(currentPage.title || requestedWikiPath)) {
      nonPlanPromptSubmitted = false;
      workspace.classList.remove("non-plan-agent-active");
    }
    planPromptStatus.textContent = error.message || "Agent unavailable.";
    updatePlanPromptVisibility();
  }
});

function resizePlanPromptInput() {
  resizePlanTextarea(planPromptInput);
}

function resizePlanTextarea(textarea) {
  textarea.style.height = "auto";
  const styles = window.getComputedStyle(textarea);
  const minLines = Number.parseInt(styles.getPropertyValue("--plan-prompt-min-lines"), 10) || Number(textarea.getAttribute("rows")) || 1;
  const maxLines = Number.parseInt(styles.getPropertyValue("--plan-prompt-max-lines"), 10);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const verticalBorder = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
  const minHeight = minLines * lineHeight + verticalPadding + verticalBorder;
  const maxHeight = maxLines * lineHeight + verticalPadding + verticalBorder;
  const valueLines = textarea.value.split("\n").length;
  const contentHeight = Math.max(textarea.scrollHeight, valueLines * lineHeight + verticalPadding + verticalBorder);
  const nextHeight = Math.max(minHeight, Math.min(contentHeight, maxHeight));
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > nextHeight ? "auto" : "hidden";
}

function submitFormWithCommandEnter(event) {
  if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

projectToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setTopbarPanelOpen("projects", projectPanel.hidden);
});

settingsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void showSettingsPage();
});

upNextButton.addEventListener("click", async (event) => {
  event.stopPropagation();
  await loadWorkspaceSummary();
  setTopbarPanelOpen("up-next", upNextPopover.hidden);
});

projectPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

manageProjectsLink.addEventListener("click", () => {
  void showProjectsPage();
});

newProjectLink.addEventListener("click", () => {
  void showNewProjectPage();
});

newProjectPageLink.addEventListener("click", () => {
  void showNewProjectPage();
});

upNextPopover.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", () => {
  closeTopbarPanels();
  closeExecuteMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarPanels();
    closeExecuteMenu();
  }
});

projectMarkdownInput.addEventListener("input", () => {
  projectMarkdownInput.dataset.documentType = "markdown";
});

projectMarkdownFile.addEventListener("change", () => {
  void importDocumentFile(projectMarkdownFile, projectMarkdownInput, projectTitleInput)
    .then((imported) => {
      if (imported) return createProjectFromMarkdown();
      return null;
    })
    .catch((error) => setNewProjectStatus(error.message || "Could not import the document."));
});

projectImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createProjectFromMarkdown();
});

themePresetBar.addEventListener("click", (event) => {
  if (event.target.closest("#theme-preset-edit")) {
    themePresetPickerOpen = true;
    renderThemeEditor();
  }
});

themePresetPicker.addEventListener("click", (event) => {
  const card = event.target.closest(".theme-preset-card");
  if (!card) return;
  applyThemePreset(card.dataset.preset);
});

function applyThemePreset(preset) {
  if (!settingsState || !themeDraft) return;
  themeDraft.activePreset = preset;
  themeDraft.customTokens = {};
  themeDraftSimple = simpleThemeFromTokens(themeDraft.presets?.[themeDraft.activePreset]);
  renderThemeEditor();
  applyThemePreview(effectiveTheme({ theme: themeDraft }));
}

themeMode.addEventListener("change", updateThemeDraftFromSimpleControls);
themePrimary.addEventListener("input", updateThemeDraftFromSimpleControls);
themeSecondary.addEventListener("input", () => {
  if (!themeDraftSimple) return;
  themeDraftSimple.secondary = normalizeColorOrEmpty(themeSecondary.value);
  updateThemeDraftFromSimpleControls();
});
themeSecondaryToggle.addEventListener("click", () => {
  if (themeSecondary.showPicker) {
    themeSecondary.showPicker();
    return;
  }
  themeSecondary.click();
});
themeSecondaryClear.addEventListener("click", () => {
  if (!themeDraftSimple) return;
  themeDraftSimple.secondary = "";
  applyGeneratedThemeTokens();
  syncSimpleControls();
});
themeTerminalMode.addEventListener("change", updateThemeDraftFromSimpleControls);
themeTerminalAccent.addEventListener("input", updateThemeDraftFromSimpleControls);

themeJson.addEventListener("input", () => {
  if (!themeDraft) return;
  try {
    const parsed = JSON.parse(themeJson.value);
    themeDraft = parsed;
    themeDraftSimple = simpleThemeFromTokens(effectiveTheme({ theme: themeDraft }));
    syncSimpleControls();
    applyThemePreview(effectiveTheme({ theme: themeDraft }));
  } catch {
    // Keep the user's text while they are editing invalid JSON.
  }
});

themeEdit.addEventListener("click", () => {
  openThemeEditor();
});

themeCancel.addEventListener("click", () => {
  closeThemeEditor();
});

themeSave.addEventListener("click", async () => {
  await saveThemeDraft();
});

agentEdit.addEventListener("click", () => {
  openAgentEditor();
});

agentCancel.addEventListener("click", () => {
  closeAgentEditor();
});

agentCancelBottom.addEventListener("click", () => {
  closeAgentEditor();
});

agentSave.addEventListener("click", async () => {
  await saveAgentInstructions();
});

agentSaveBottom.addEventListener("click", async () => {
  await saveAgentInstructions();
});

soulPrinciples.addEventListener("input", updateAgentsFileDraftFromFields);
soulInterface.addEventListener("input", updateAgentsFileDraftFromFields);
soulAgent.addEventListener("input", updateAgentsFileDraftFromFields);

agentsFileContent.addEventListener("input", () => {
  agentsFileDraft = agentsFileContent.value;
});

memoryAdd.addEventListener("click", () => {
  if (!agentDraft) return;
  agentDraft.memory.entries ||= [];
  agentDraft.memory.entries.push({
    id: crypto.randomUUID(),
    title: "",
    content: "",
    enabled: true,
    updatedAt: new Date().toISOString()
  });
  renderMemory(agentDraft.memory.entries);
});

async function restoreTerminals() {
  const layout = await api(projectPath("/api/layout"));
  terminalLayout = layout.panels;
  workspace.classList.toggle("terminal-active", terminalSessions.size > 0);
  updatePlanPromptVisibility();
}

async function loadRepoContext() {
  try {
    const repo = await api(projectPath("/api/repo"));
    repoBranch.textContent = repo.git.worktree || "main";
    repoBranch.title = repo.root;
    document.getElementById("server-status").title = repo.root;
  } catch {
    repoBranch.textContent = "Unavailable";
    repoBranch.title = "";
  }
}

async function loadWikiNav() {
  try {
    const response = await fetch(projectPath("/api/wiki"));
    const data = await response.json();
    await hydrateWikiPageStatuses(data.pages || []);
    wikiPageTitles.clear();
    wikiPageStatus.clear();
    data.pages.forEach((page) => {
      wikiPageTitles.set(page.path, cleanPageTitle(page));
      wikiPageTitles.set(displayWikiPath(page.path), cleanPageTitle(page));
      const status = pageStatus(page);
      wikiPageStatus.set(page.path, status);
      wikiPageStatus.set(displayWikiPath(page.path), status);
    });
    currentPlanPath = data.pages.find((page) => page.path.endsWith("/wiki/plans/index.html"))?.path || currentPlanPath;
    wikiNav.replaceChildren(...groupWikiPages(data.pages));
  } catch {
    document.getElementById("server-status").textContent = "Offline";
  }
}

async function hydrateWikiPageStatuses(pages) {
  const candidates = pages.filter((page) => {
    const path = displayWikiPath(page.path);
    return path.includes("/wiki/plans/") && pageStatus(page) === "" && !path.endsWith("/wiki/plans/zzz_completed/index.html");
  });
  await Promise.all(candidates.map(async (page) => {
    try {
      const response = await fetch(page.path, { cache: "no-store" });
      if (!response.ok) return;
      const html = await response.text();
      page.summary = summaryItemsFromHtml(html);
    } catch {
      // Keep sidebar usable even if a wiki page cannot be inspected.
    }
  }));
}

function summaryItemsFromHtml(html) {
  const documentElement = new DOMParser().parseFromString(html, "text/html");
  return [...documentElement.querySelectorAll("section.summary li")].map((item) => item.textContent.trim());
}

async function loadWorkspaceSummary() {
  try {
    const summary = await api(projectPath("/api/workspace"));
    renderUpNext(summary.status);
  } catch {
    renderUpNext({
      completed: "Workspace summary unavailable",
      current: "Unknown",
      next: "Unknown"
    });
  }
}

function renderUpNext(status = {}) {
  const upNext = resolveUpNextStatus(status);
  upNextCompleted.textContent = status.completed || "No completed work found";
  upNextStage.textContent = upNext.stage || "No current stage found";
  upNextCurrent.textContent = upNext.unit || "No current unit found";
  if (upNext.path) {
    upNextLink.hidden = false;
    upNextLink.replaceChildren("Open unit", doubleChevronIcon());
    upNextLink.onclick = () => {
      closeTopbarPanels();
      activateWorkspaceLocation(upNext.path);
    };
  } else {
    upNextLink.hidden = true;
    upNextLink.onclick = null;
  }
}

function doubleChevronIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const pathData of ["m7 7 5 5-5 5", "m13 7 5 5-5 5"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}

function resolveUpNextStatus(status = {}) {
  const current = status.current || "";
  if (!status.currentPath && /^none$/i.test(current)) {
    return { stage: "none", unit: "none", path: "" };
  }
  const currentStageLink = wikiNav.querySelector("a.current-stage");
  const currentUnitLink = wikiNav.querySelector("a.current-unit");
  const navStage = currentStageLink?.querySelector(".wiki-nav-label")?.textContent?.trim() || "";
  const navUnit = currentUnitLink?.querySelector(".wiki-nav-label")?.textContent?.trim() || "";
  const navUnitPath = currentUnitLink?.dataset.path || "";
  const stage = status.stage || (isStageLabel(current) ? current : "") || navStage;
  const unit = status.currentPath
    ? current
    : navUnit || (isStageLabel(current) ? "" : current);
  return {
    stage: displayPlanLabel(stage),
    unit: displayPlanLabel(unit),
    path: status.currentPath || navUnitPath
  };
}

function isStageLabel(value = "") {
  return /stage\s*-?\s*0?\d+/i.test(value);
}

function displayPlanLabel(value = "") {
  return value
    .replace(/^Stage-(\d+)\s+/, "Stage $1 - ")
    .replace(/^Unit\s+(\d+)\s+·\s+/, "Unit $1 - ");
}

async function showProjectsPage(options = {}) {
  closeTopbarPanels();
  await loadProjectManagement();
  setUpNextAvailable(false);
  settingsPage.hidden = true;
  newProjectPage.hidden = true;
  projectsPage.hidden = false;
  wikiFrame.hidden = true;
  planPrompt.hidden = true;
  settingsButton.classList.remove("active");
  workspace.classList.add("projects-mode", "manage-projects-mode");
  workspace.classList.remove("settings-mode", "non-plan-wiki-mode", "non-plan-agent-active");
  setCurrentPage("/projects", "Projects");
  openPage.href = "/projects";
  modifyPlanUi.hidden = true;
  modifyButton.setAttribute("aria-expanded", "false");
  setCommandBarCompleted(false);
  wikiNav.querySelectorAll("a").forEach((link) => link.classList.remove("active"));
  if (`${location.pathname}${location.hash}` !== "/projects") {
    const method = options.replace ? "replaceState" : "pushState";
    history[method](null, "", "/projects");
  }
}

async function showNewProjectPage(options = {}) {
  closeTopbarPanels();
  setUpNextAvailable(false);
  settingsPage.hidden = true;
  projectsPage.hidden = true;
  newProjectPage.hidden = false;
  wikiFrame.hidden = true;
  planPrompt.hidden = true;
  settingsButton.classList.remove("active");
  workspace.classList.add("projects-mode");
  workspace.classList.remove("settings-mode", "manage-projects-mode", "non-plan-wiki-mode", "non-plan-agent-active");
  setCurrentPage("/projects/new", "New Project");
  openPage.href = "/projects/new";
  modifyPlanUi.hidden = true;
  modifyButton.setAttribute("aria-expanded", "false");
  setCommandBarCompleted(false);
  wikiNav.querySelectorAll("a").forEach((link) => link.classList.remove("active"));
  if (`${location.pathname}${location.hash}` !== "/projects/new") {
    const method = options.replace ? "replaceState" : "pushState";
    history[method](null, "", "/projects/new");
  }
}

async function showSettingsPage(options = {}) {
  closeTopbarPanels();
  await loadSettings();
  setUpNextAvailable(false);
  projectsPage.hidden = true;
  newProjectPage.hidden = true;
  settingsPage.hidden = false;
  wikiFrame.hidden = true;
  planPrompt.hidden = true;
  settingsButton.classList.add("active");
  workspace.classList.remove("projects-mode", "manage-projects-mode", "non-plan-wiki-mode", "non-plan-agent-active");
  workspace.classList.add("settings-mode");
  currentPage.textContent = "Settings";
  currentPage.title = "/settings";
  openPage.href = "/settings";
  wikiNav.querySelectorAll("a").forEach((link) => link.classList.remove("active"));
  if (`${location.pathname}${location.hash}` !== "/settings") {
    const method = options.replace ? "replaceState" : "pushState";
    history[method](null, "", "/settings");
  }
}

function hideAppPages() {
  setUpNextAvailable(true);
  projectsPage.hidden = true;
  newProjectPage.hidden = true;
  settingsPage.hidden = true;
  wikiFrame.hidden = false;
  settingsButton.classList.remove("active");
  workspace.classList.remove("settings-mode", "projects-mode", "manage-projects-mode");
  updatePlanPromptVisibility();
}

function setUpNextAvailable(available) {
  upNextButton.hidden = !available;
  if (!available) {
    upNextPopover.hidden = true;
    upNextButton.setAttribute("aria-expanded", "false");
  }
}

function activateWorkspaceLocation(path) {
  if (isProjectsPath(path)) {
    void showProjectsPage({ replace: true });
    return;
  }
  if (isNewProjectPath(path)) {
    void showNewProjectPage({ replace: true });
    return;
  }
  if (isSettingsPath(path)) {
    void showSettingsPage({ replace: true });
    return;
  }
  hideAppPages();
  activateWikiPage(path);
}

function isDashboardPath(path) {
  return normalizeAppPath(path) === "/dashboard" || normalizeAppPath(path) === "/ideas";
}

function isProjectsPath(path) {
  const normalized = normalizeAppPath(path);
  return normalized === "/projects" || normalized === "/ideas" || normalized === "/dashboard";
}

function isNewProjectPath(path) {
  return normalizeAppPath(path) === "/projects/new";
}

function isSettingsPath(path) {
  return normalizeAppPath(path) === "/settings";
}

function normalizeAppPath(path) {
  return `/${String(path || "").replace(/^\/+|\/+$/g, "")}`;
}

function isAppShellPath(path) {
  return isProjectsPath(path) || isNewProjectPath(path) || isSettingsPath(path);
}

function setTopbarPanelOpen(panel, open) {
  const panels = {
    projects: { panel: projectPanel, button: projectToggle },
    "up-next": { panel: upNextPopover, button: upNextButton }
  };
  Object.entries(panels).forEach(([name, item]) => {
    const isOpen = name === panel && open;
    item.panel.hidden = !isOpen;
    item.button.setAttribute("aria-expanded", String(isOpen));
  });
}

function closeTopbarPanels() {
  projectPanel.hidden = true;
  upNextPopover.hidden = true;
  projectToggle.setAttribute("aria-expanded", "false");
  upNextButton.setAttribute("aria-expanded", "false");
}

function closeExecuteMenu() {
  executeMenu.hidden = true;
  executeButton.setAttribute("aria-expanded", "false");
}

async function loadGuardrails() {
  try {
    guardrails = await api(projectPath("/api/guardrails"));
  } catch {
    guardrails = null;
  }
}

async function loadProjects() {
  const data = await api(projectPath("/api/projects"));
  const activeProject = data.projects.find((project) => project.id === data.activeProjectId)
    || data.projects.find((project) => project.available);
  activeProjectId = activeProject?.id || activeProjectId;
  activeProjectSlug = activeProject?.projectSlug || activeProjectSlug;
  activeWorktreeSlug = activeProject?.worktreeSlug || activeWorktreeSlug;
  if (activeProject && !prettyWorkspacePath(location.pathname) && !isAppShellPath(location.pathname)) {
    history.replaceState(null, "", `${workspacePath(activeProject)}${location.hash}`);
  }
  projectToggle.hidden = false;
  workspace.classList.add("has-projects");
  if (data.projects.length === 0) {
    projectList.replaceChildren(topbarEmpty("No projects registered."));
    return;
  }
  projectList.replaceChildren(
    ...data.projects.map((project) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.projectId = project.id;
      button.dataset.worktreeSlug = project.worktreeSlug || "main";
      button.textContent = project.name;
      button.title = project.available ? project.root : `${project.root} unavailable`;
      button.className = project.id === activeProjectId ? "active" : "";
      button.disabled = !project.available;
      button.addEventListener("click", () => switchProject(project));
      return button;
    })
  );
}

function topbarEmpty(text) {
  const item = document.createElement("p");
  item.className = "topbar-empty";
  item.textContent = text;
  return item;
}

async function loadProjectManagement() {
  const result = await Promise.allSettled([api(projectPath("/api/projects"))]);
  if (result[0].status === "fulfilled") {
    renderDashboardProjects(result[0].value.projects || []);
  } else {
    dashboardProjects.replaceChildren(emptyDashboardItem("No projects added yet..."));
  }
}

async function loadSettings() {
  try {
    settingsState = await api("/api/settings");
    renderSettings(settingsState);
    applyTheme(settingsState);
  } catch (error) {
    setSettingsStatus(error.message || "Settings unavailable.");
  }
}

function renderSettings(settings) {
  if (!settings) return;
  renderThemeSummary(settings);
  renderAgentSummary(settings);
  soulPrinciples.value = (settings.soul?.principles || []).join("\n");
  soulInterface.value = settings.soul?.interface || "";
  soulAgent.value = settings.soul?.agent || "";
  renderMemory(settings.memory?.entries || []);
}

function renderThemeSummary(settings) {
  const theme = effectiveTheme(settings);
  themeTitle.textContent = themeDisplayName(settings);
  const heroColors = [
    theme.tokens.ui.bg,
    theme.tokens.ui.panel,
    theme.tokens.ui.accent,
    theme.tokens.docs.bg,
    theme.tokens.docs.link,
    theme.tokens.terminal.bg,
    theme.tokens.terminal.accent
  ];
  themeHeroSwatches.replaceChildren(...heroColors.map((color) => {
    const swatch = document.createElement("span");
    swatch.style.background = color;
    return swatch;
  }));
  themeSummary.replaceChildren(...themeSurfaces.map((surface) => {
    const tokens = theme.tokens[surface.key] || {};
    const section = document.createElement("article");
    section.className = "theme-summary-surface";
    const heading = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = surface.label;
    const description = document.createElement("span");
    description.textContent = surface.description;
    heading.append(title, description);
    const swatches = document.createElement("div");
    swatches.className = "theme-swatches";
    surface.colorTokens.forEach((token) => {
      const swatch = document.createElement("span");
      swatch.title = `${token}: ${tokens[token] || ""}`;
      swatch.style.background = tokens[token] || "transparent";
      swatches.append(swatch);
    });
    const fonts = document.createElement("dl");
    fonts.className = "theme-font-list";
    surface.fontTokens.forEach((token) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = readableTokenName(token);
      const dd = document.createElement("dd");
      const fontName = document.createElement("span");
      fontName.className = "theme-font-name";
      fontName.textContent = fontLabelForValue(tokens[token]);
      const sample = document.createElement("span");
      sample.className = "theme-font-sample";
      sample.textContent = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
      sample.style.fontFamily = tokens[token] || "inherit";
      dd.append(fontName, sample);
      row.append(dt, dd);
      fonts.append(row);
    });
    section.append(heading, swatches);
    if (surface.fontTokens.length > 0) section.append(fonts);
    return section;
  }));
}

function renderAgentSummary(settings) {
  const principles = settings.soul?.principles || [];
  const enabledMemory = (settings.memory?.entries || []).filter((entry) => entry.enabled !== false && (entry.title || entry.content));
  const cards = [
    agentSummaryCard("Soul", `${principles.length} principles`, principles.slice(0, 3)),
    agentSummaryCard("Agent", "Guidance", [settings.soul?.agent || "No agent guidance recorded."]),
    agentSummaryCard("Memory", `${enabledMemory.length} enabled`, enabledMemory.slice(0, 3).map((entry) => entry.title || entry.content))
  ];
  agentSummary.replaceChildren(...cards);
}

function agentSummaryCard(title, meta, lines) {
  const card = document.createElement("article");
  card.className = "agent-summary-card";
  const header = document.createElement("header");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const status = document.createElement("span");
  status.textContent = meta;
  header.append(heading, status);
  const list = document.createElement("ul");
  const values = lines.length > 0 ? lines : ["No entries added yet."];
  values.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  });
  card.append(header, list);
  return card;
}

function themeDisplayName(settings) {
  if (hasThemeOverrides(settings.theme)) return "Custom";
  const preset = settings.theme?.presets?.[settings.theme?.activePreset || "paper"];
  return preset?.label || "Custom";
}

function hasThemeOverrides(theme) {
  return Object.keys(theme?.customTokens || {}).some((surface) =>
    Object.keys(theme.customTokens?.[surface] || {}).length > 0
  );
}

function fontLabelForValue(value = "") {
  return fontOptions.find((font) => font.value === value)?.label || value.split(",")[0].replaceAll("\"", "") || "Default";
}

function readableTokenName(token) {
  return token.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function renderMemory(entries) {
  const normalized = Array.isArray(entries) ? entries : [];
  if (normalized.length === 0) {
    memoryList.replaceChildren(emptyMemoryItem());
    return;
  }
  memoryList.replaceChildren(...normalized.map((entry, index) => memoryEntryRow(entry, index)));
}

function emptyMemoryItem() {
  const item = document.createElement("p");
  item.className = "memory-empty";
  item.textContent = "No memory entries added yet...";
  return item;
}

function memoryEntryRow(entry, index) {
  const row = document.createElement("article");
  row.className = "memory-entry";
  const title = document.createElement("input");
  title.value = entry.title || "";
  title.placeholder = "Title";
  title.addEventListener("input", () => {
    if (agentDraft) agentDraft.memory.entries[index].title = title.value;
  });
  const content = document.createElement("textarea");
  content.rows = 3;
  content.value = entry.content || "";
  content.placeholder = "Memory";
  content.addEventListener("input", () => {
    if (agentDraft) agentDraft.memory.entries[index].content = content.value;
  });
  const enabled = document.createElement("label");
  enabled.className = "memory-enabled";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = entry.enabled !== false;
  checkbox.addEventListener("change", () => {
    if (agentDraft) agentDraft.memory.entries[index].enabled = checkbox.checked;
  });
  enabled.append(checkbox, "Enabled");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "memory-remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    if (!agentDraft) return;
    agentDraft.memory.entries.splice(index, 1);
    renderMemory(agentDraft.memory.entries);
  });
  row.append(title, content, enabled, remove);
  return row;
}

async function saveSettings() {
  if (!settingsState) return;
  const next = {
    ...settingsState,
    soul: {
      principles: soulPrinciples.value.split("\n").map((line) => line.trim()).filter(Boolean),
      interface: soulInterface.value.trim(),
      agent: soulAgent.value.trim()
    },
    memory: {
      entries: (settingsState.memory?.entries || []).map((entry) => ({
        id: entry.id || crypto.randomUUID(),
        title: String(entry.title || "").trim(),
        content: String(entry.content || "").trim(),
        enabled: entry.enabled !== false,
        updatedAt: new Date().toISOString()
      })).filter((entry) => entry.title || entry.content)
    }
  };
  setSettingsStatus("Saving...");
  settingsState = await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify(next)
  });
  renderSettings(settingsState);
  applyTheme(settingsState);
  setSettingsStatus("Saved.");
}

function openAgentEditor() {
  if (!settingsState) return;
  agentDraft = {
    soul: structuredClone(settingsState.soul || {}),
    memory: structuredClone(settingsState.memory || { entries: [] })
  };
  settingsLayout.hidden = true;
  agentEditor.hidden = false;
  settingsPage.classList.add("agent-editing");
  renderAgentEditor();
  void loadAgentsFilePreview();
}

function closeAgentEditor() {
  agentDraft = null;
  agentsFileDraft = "";
  agentEditor.hidden = true;
  settingsLayout.hidden = false;
  settingsPage.classList.remove("agent-editing");
}

function renderAgentEditor() {
  if (!agentDraft) return;
  soulPrinciples.value = (agentDraft.soul?.principles || []).join("\n");
  soulInterface.value = agentDraft.soul?.interface || "";
  soulAgent.value = agentDraft.soul?.agent || "";
  renderMemory(agentDraft.memory?.entries || []);
}

function updateAgentsFileDraftFromFields() {
  if (!agentDraft) return;
  agentDraft.soul = currentSoulDraftFromFields();
  const block = renderAgentsManagedBlock({
    soul: agentDraft.soul,
    memory: agentDraft.memory || { entries: [] }
  });
  agentsFileDraft = replaceManagedAgentsBlock(agentsFileDraft || agentsFileContent.value, block);
  agentsFileContent.value = agentsFileDraft;
}

function currentSoulDraftFromFields() {
  return {
    principles: soulPrinciples.value.split("\n").map((line) => line.trim()).filter(Boolean),
    interface: soulInterface.value.trim(),
    agent: soulAgent.value.trim()
  };
}

function renderAgentsManagedBlock(settings) {
  const soul = settings.soul || {};
  const principles = Array.isArray(soul.principles) ? soul.principles.filter(Boolean) : [];
  const memories = (settings.memory?.entries || [])
    .filter((entry) => entry.enabled !== false && String(entry.content || "").trim())
    .map((entry) => ({
      title: String(entry.title || "").trim(),
      content: String(entry.content || "").trim()
    }));
  return `<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->
## HyperWiki Global Context

### Soul

${principles.length ? principles.map((item) => `- ${item}`).join("\n") : "- No global soul principles recorded."}

Interface guidance: ${soul.interface || "Use HyperWiki's default interface guidance."}

Agent guidance: ${soul.agent || "Use HyperWiki's default agent guidance."}

### Memory

${memories.length ? memories.map((entry) => `- ${entry.title ? `${entry.title}: ` : ""}${entry.content}`).join("\n") : "- No approved global memory entries recorded."}
<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->`;
}

function replaceManagedAgentsBlock(content, block) {
  const start = "<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->";
  const end = "<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->";
  if (content.includes(start) && content.includes(end)) {
    return content.replace(new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`), block);
  }
  return `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${block}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function saveAgentInstructions() {
  if (!settingsState || !agentDraft) return;
  agentSave.disabled = true;
  setSettingsStatus("Saving agent instructions...");
  const next = {
    ...settingsState,
    soul: currentSoulDraftFromFields(),
    memory: {
      entries: (agentDraft.memory?.entries || []).map((entry) => ({
        id: entry.id || crypto.randomUUID(),
        title: String(entry.title || "").trim(),
        content: String(entry.content || "").trim(),
        enabled: entry.enabled !== false,
        updatedAt: new Date().toISOString()
      })).filter((entry) => entry.title || entry.content)
    }
  };
  try {
    settingsState = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(next)
    });
    updateAgentsFileDraftFromFields();
    const result = await api(projectPath("/api/settings/sync-agents"), {
      method: "POST",
      body: JSON.stringify({ content: agentsFileContent.value })
    });
    renderSettings(settingsState);
    await loadAgentsFilePreview();
    closeAgentEditor();
    setSettingsStatus("Agent instructions saved", "success");
  } catch (error) {
    setSettingsStatus(error.message || "Could not save agent instructions.");
  } finally {
    agentSave.disabled = false;
  }
}

async function loadAgentsFilePreview() {
  agentsFilePath.textContent = "Loading";
  agentsFileContent.value = "";
  try {
    const result = await api(projectPath("/api/settings/agents-file"));
    agentsFilePath.textContent = result.path || "AGENTS.md";
    agentsFileDraft = result.content || "";
    updateAgentsFileDraftFromFields();
  } catch (error) {
    agentsFilePath.textContent = "Unavailable";
    agentsFileContent.value = error.message || "Could not load AGENTS.md.";
  }
}

function openThemeEditor() {
  if (!settingsState) return;
  themeDraft = structuredClone(settingsState.theme);
  themeDraftSimple = simpleThemeFromTokens(effectiveTheme({ theme: themeDraft }));
  settingsLayout.hidden = true;
  themeEditor.hidden = false;
  settingsPage.classList.add("theme-editing");
  renderThemeEditor();
  applyThemePreview(effectiveTheme({ theme: themeDraft }));
}

function closeThemeEditor() {
  themeDraft = null;
  themeDraftSimple = null;
  themePresetPickerOpen = false;
  themeEditor.hidden = true;
  settingsLayout.hidden = false;
  settingsPage.classList.remove("theme-editing");
  clearThemePreview();
}

function renderThemeEditor() {
  const presets = themeDraft?.presets || {};
  const activePreset = themeDraft?.activePreset || "paper";
  themePresetBar.replaceChildren(themeSelectedPreset(activePreset, presets[activePreset]));
  themePresetPicker.replaceChildren(...Object.entries(presets).map(([value, preset]) => themePresetCard(value, preset, "picker")));
  themePresetBar.hidden = themePresetPickerOpen;
  themePresetPicker.hidden = !themePresetPickerOpen;
  themeEditorLayout.hidden = themePresetPickerOpen;
  const theme = effectiveTheme({ theme: themeDraft });
  syncSimpleControls();
  themeControls.replaceChildren(themeTypographySection(theme.tokens));
  themeJson.value = JSON.stringify(themeDraft || {}, null, 2);
  loadGoogleFontsForTheme(theme);
}

function themeSelectedPreset(value, preset) {
  const wrapper = themePresetCard(value, preset, "selected");
  const edit = document.createElement("button");
  edit.type = "button";
  edit.id = "theme-preset-edit";
  edit.className = "theme-preset-edit";
  edit.textContent = "edit";
  wrapper.append(edit);
  return wrapper;
}

function themePresetCard(value, preset, variant = "") {
  const tokens = preset.tokens || {};
  const card = document.createElement(variant === "selected" ? "div" : "button");
  if (card instanceof HTMLButtonElement) {
    card.type = "button";
  }
  card.className = ["theme-preset-card", variant ? `theme-preset-card-${variant}` : ""].filter(Boolean).join(" ");
  card.dataset.preset = value;
  card.setAttribute("aria-pressed", value === themeDraft?.activePreset ? "true" : "false");

  const preview = document.createElement("span");
  preview.className = "theme-preset-preview";
  preview.style.setProperty("--preset-ui-bg", tokens.ui?.bg || "#f7f7f4");
  preview.style.setProperty("--preset-docs-bg", tokens.docs?.bg || "#fbfaf4");
  preview.style.setProperty("--preset-terminal-bg", tokens.terminal?.bg || "#272822");
  preview.style.setProperty("--preset-primary", tokens.ui?.accent || "#276ef1");
  preview.style.setProperty("--preset-secondary", tokens.docs?.link || tokens.ui?.accent || "#276ef1");
  preview.innerHTML = "<i></i><b></b><em></em><strong></strong>";

  const text = variant === "selected" ? themeSelectedPresetText(value, preset, tokens) : themeCompactPresetText(value, preset, tokens);
  card.append(preview, text);
  return card;
}

function themeCompactPresetText(value, preset, tokens) {
  const text = document.createElement("span");
  text.className = "theme-preset-text";
  const label = document.createElement("strong");
  label.textContent = preset.label || value;
  const docsFont = document.createElement("span");
  docsFont.className = "theme-preset-body-font";
  docsFont.textContent = fontLabel(tokens.docs?.serifFont);
  docsFont.style.fontFamily = tokens.docs?.serifFont || "var(--docs-serif-font)";
  const uiFont = document.createElement("span");
  uiFont.className = "theme-preset-mono-font";
  uiFont.textContent = fontLabel(tokens.ui?.sidebarFont);
  uiFont.style.fontFamily = tokens.ui?.sidebarFont || "var(--sidebar-font)";
  text.append(label, docsFont, uiFont);
  return text;
}

function themeSelectedPresetText(value, preset, tokens) {
  const text = document.createElement("span");
  text.className = "theme-preset-text theme-preset-text-selected";
  const header = document.createElement("span");
  header.className = "theme-preset-selected-header";
  const label = document.createElement("strong");
  label.textContent = preset.label || value;
  const previewSentence = "The quick brown fox jumps over the lazy dog...";
  const bodySpec = document.createElement("span");
  bodySpec.className = "theme-preset-selected-type theme-preset-selected-body";
  bodySpec.innerHTML = `<small>Text</small><b>AaBbCcDdEeFfGgHhIiJjKkLlMm</b><em>${previewSentence}</em>`;
  bodySpec.style.fontFamily = tokens.docs?.serifFont || "var(--docs-serif-font)";
  const monoSpec = document.createElement("span");
  monoSpec.className = "theme-preset-selected-type theme-preset-selected-mono";
  monoSpec.innerHTML = `<small>Mono</small><b>AaBbCcDdEeFfGgHhIiJjKkLlMm</b><em>${previewSentence}</em>`;
  monoSpec.style.fontFamily = tokens.docs?.monoFont || "var(--docs-mono-font)";
  header.append(label, bodySpec, monoSpec);

  const chips = document.createElement("span");
  chips.className = "theme-preset-selected-chips";
  [
    ["Background", tokens.docs?.bg],
    ["Surface", tokens.ui?.panel],
    ["Accent", tokens.ui?.accent],
    ["Ink", tokens.docs?.text]
  ].forEach(([name, color]) => {
    const chip = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.style.background = color || "transparent";
    const caption = document.createElement("small");
    caption.textContent = name;
    chip.append(swatch, caption);
    chips.append(chip);
  });
  text.append(header, chips);
  return text;
}

function fontLabel(value) {
  return fontOptions.find((font) => font.value === value)?.label || "Custom";
}

function themeTypographySection(tokens) {
  const section = document.createElement("section");
  section.className = "theme-control-section theme-typography-controls";
  const heading = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "Typography";
  const description = document.createElement("span");
  description.textContent = "Body, mono, and sidebar font behavior";
  heading.append(title, description);
  const controls = document.createElement("div");
  controls.className = "theme-typography-grid";
  const bodyFont = tokens.docs?.serifFont || defaultBodyFont("serif");
  const monoFont = tokens.docs?.monoFont || defaultTerminalFont();
  const bodyKind = bodyFont.includes("sans-serif") ? "sans" : "serif";
  const sidebarSource = tokens.ui?.sidebarFont === bodyFont ? "body" : "mono";
  controls.append(
    selectControl("Body Style", [
      { label: "Serif", value: "serif" },
      { label: "Sans Serif", value: "sans" }
    ], bodyKind, (value) => {
      const nextBody = defaultBodyFont(value);
      setThemeTypography({
        bodyFont: nextBody,
        monoFont: currentThemeTokens().docs?.monoFont || monoFont,
        sidebarSource: currentSidebarSource(currentThemeTokens(), bodyFont)
      });
    }),
    selectControl("Body Font", bodyFontOptions(bodyKind), bodyFont, (value) => {
      setThemeTypography({
        bodyFont: value,
        monoFont: currentThemeTokens().docs?.monoFont || monoFont,
        sidebarSource: currentSidebarSource(currentThemeTokens(), bodyFont)
      });
    }),
    selectControl("Mono Font", monoFontOptions, monoFont, (value) => {
      const current = currentThemeTokens();
      setThemeTypography({
        bodyFont: current.docs?.serifFont || bodyFont,
        monoFont: value,
        sidebarSource: currentSidebarSource(current, bodyFont)
      });
    }),
    selectControl("Sidebar", [
      { label: "Body copy font", value: "body" },
      { label: "Mono font", value: "mono" }
    ], sidebarSource, (value) => {
      const current = currentThemeTokens();
      setThemeTypography({
        bodyFont: current.docs?.serifFont || bodyFont,
        monoFont: current.docs?.monoFont || monoFont,
        sidebarSource: value
      });
    })
  );
  section.append(heading, controls);
  return section;
}

function selectControl(labelText, options, value, onChange) {
  const label = document.createElement("label");
  label.className = "settings-field";
  const name = document.createElement("span");
  name.textContent = labelText;
  const select = document.createElement("select");
  options.forEach((font) => {
    const option = document.createElement("option");
    option.value = font.value;
    option.textContent = font.label;
    select.append(option);
  });
  select.value = options.some((option) => option.value === value) ? value : options[0]?.value;
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  label.append(name, select);
  return label;
}

function setThemeTypography({ bodyFont, monoFont, sidebarSource }) {
  if (!themeDraft) return;
  const sidebarFont = sidebarSource === "body" ? bodyFont : monoFont;
  themeDraftSimple.terminalFont = monoFont;
  setThemeDraftToken("docs", "serifFont", bodyFont);
  setThemeDraftToken("docs", "monoFont", monoFont);
  setThemeDraftToken("terminal", "font", monoFont);
  setThemeDraftToken("ui", "sidebarFont", sidebarFont);
  const theme = effectiveTheme({ theme: themeDraft });
  themeControls.replaceChildren(themeTypographySection(theme.tokens));
  themeJson.value = JSON.stringify(themeDraft, null, 2);
  applyThemePreview(theme);
  loadGoogleFontsForTheme(theme);
}

function setThemeDraftToken(surface, token, value) {
  if (!themeDraft) return;
  themeDraft.customTokens ||= {};
  themeDraft.customTokens[surface] ||= {};
  const presetValue = themeDraft.presets?.[themeDraft.activePreset]?.tokens?.[surface]?.[token];
  if (value === presetValue) {
    delete themeDraft.customTokens[surface][token];
    if (Object.keys(themeDraft.customTokens[surface]).length === 0) {
      delete themeDraft.customTokens[surface];
    }
  } else {
    themeDraft.customTokens[surface][token] = value;
  }
}

function currentThemeTokens() {
  return effectiveTheme({ theme: themeDraft }).tokens;
}

function currentSidebarSource(tokens, fallbackBodyFont) {
  return tokens.ui?.sidebarFont === (tokens.docs?.serifFont || fallbackBodyFont) ? "body" : "mono";
}

function bodyFontOptions(kind) {
  return kind === "sans" ? sansFontOptions : serifFontOptions;
}

function defaultBodyFont(kind) {
  return (kind === "sans" ? sansFontOptions : serifFontOptions)[0]?.value || fontOptions[0].value;
}

function updateThemeDraftFromSimpleControls() {
  if (!themeDraft) return;
  themeDraftSimple = {
    mode: themeMode.value === "dark" ? "dark" : "light",
    primary: themePrimary.value,
    secondary: themeDraftSimple?.secondary === "" ? "" : normalizeColorOrEmpty(themeSecondary.value),
    terminalMode: ["light", "dark"].includes(themeTerminalMode.value) ? themeTerminalMode.value : "match",
    terminalFont: themeDraftSimple?.terminalFont || currentThemeTokens().terminal?.font || defaultTerminalFont(),
    terminalAccent: normalizeColor(themeTerminalAccent.value || themePrimary.value)
  };
  applyGeneratedThemeTokens();
}

function syncSimpleControls() {
  if (!themeDraftSimple) return;
  themeMode.value = themeDraftSimple.mode;
  themePrimary.value = normalizeColor(themeDraftSimple.primary);
  const derivedSecondary = derivedSecondaryColor(themeDraftSimple.primary, themeDraftSimple.mode);
  const hasSecondary = Boolean(themeDraftSimple.secondary);
  themeSecondary.value = normalizeColor(themeDraftSimple.secondary || derivedSecondary);
  themeSecondaryToggle.classList.toggle("is-empty", !hasSecondary);
  themeSecondaryToggle.style.setProperty("--secondary-color", hasSecondary ? normalizeColor(themeDraftSimple.secondary) : "transparent");
  themeSecondaryClear.hidden = !hasSecondary;
  themeTerminalMode.value = themeDraftSimple.terminalMode || "match";
  themeTerminalAccent.value = normalizeColor(themeDraftSimple.terminalAccent || themeDraftSimple.primary);
}

function applyGeneratedThemeTokens() {
  if (!themeDraft || !themeDraftSimple) return;
  const generated = generateThemeTokens(themeDraftSimple);
  themeDraft.customTokens = deepMerge(themeDraft.customTokens || {}, generated);
  themeJson.value = JSON.stringify(themeDraft, null, 2);
  const theme = effectiveTheme({ theme: themeDraft });
  applyThemePreview(theme);
  loadGoogleFontsForTheme(theme);
}

async function saveThemeDraft() {
  if (!settingsState || !themeDraft) return;
  setSettingsStatus("Saving theme...");
  const next = {
    ...settingsState,
    theme: structuredClone(themeDraft)
  };
  settingsState = await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify(next)
  });
  renderSettings(settingsState);
  applyTheme(settingsState);
  closeThemeEditor();
  setSettingsStatus("Theme saved.");
}

function setSettingsStatus(message, tone = "") {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle("status-success", tone === "success");
}

function applyTheme(settings) {
  const theme = effectiveTheme(settings);
  loadGoogleFontsForTheme(theme);
  const root = document.documentElement;
  root.style.colorScheme = theme.mode === "dark" ? "dark" : "light";
  setVars(root, {
    "--bg": theme.tokens.ui.bg,
    "--panel": theme.tokens.ui.panel,
    "--border": theme.tokens.ui.border,
    "--text": theme.tokens.ui.text,
    "--muted": theme.tokens.ui.muted,
    "--accent": theme.tokens.ui.accent,
    "--sidebar-font": theme.tokens.ui.sidebarFont,
    "--docs-bg": theme.tokens.docs.bg,
    "--docs-panel": theme.tokens.docs.panel,
    "--docs-border": theme.tokens.docs.border,
    "--docs-text": theme.tokens.docs.text,
    "--docs-muted": theme.tokens.docs.muted,
    "--docs-link": theme.tokens.docs.link,
    "--docs-code": theme.tokens.docs.code,
    "--docs-serif-font": theme.tokens.docs.serifFont,
    "--docs-mono-font": theme.tokens.docs.monoFont,
    "--terminal-bg": theme.tokens.terminal.bg,
    "--terminal-pane": theme.tokens.terminal.pane,
    "--terminal-toolbar": theme.tokens.terminal.toolbar,
    "--terminal-header": theme.tokens.terminal.header,
    "--terminal-border": theme.tokens.terminal.border,
    "--terminal-text": theme.tokens.terminal.text,
    "--terminal-muted": theme.tokens.terminal.muted,
    "--terminal-accent": theme.tokens.terminal.accent,
    "--terminal-font": theme.tokens.terminal.font || defaultTerminalFont()
  });
  applyWikiFrameTheme(theme);
}

function applyThemePreview(theme) {
  loadGoogleFontsForTheme(theme);
  const preview = document.querySelector(".theme-preview-shell");
  if (!preview) return;
  preview.style.colorScheme = theme.mode === "dark" ? "dark" : "light";
  setVars(preview, {
    "--bg": theme.tokens.ui.bg,
    "--panel": theme.tokens.ui.panel,
    "--border": theme.tokens.ui.border,
    "--text": theme.tokens.ui.text,
    "--muted": theme.tokens.ui.muted,
    "--accent": theme.tokens.ui.accent,
    "--sidebar-font": theme.tokens.ui.sidebarFont,
    "--docs-bg": theme.tokens.docs.bg,
    "--docs-panel": theme.tokens.docs.panel,
    "--docs-border": theme.tokens.docs.border,
    "--docs-text": theme.tokens.docs.text,
    "--docs-muted": theme.tokens.docs.muted,
    "--docs-link": theme.tokens.docs.link,
    "--docs-code": theme.tokens.docs.code,
    "--docs-serif-font": theme.tokens.docs.serifFont,
    "--docs-mono-font": theme.tokens.docs.monoFont,
    "--terminal-bg": theme.tokens.terminal.bg,
    "--terminal-pane": theme.tokens.terminal.pane,
    "--terminal-toolbar": theme.tokens.terminal.toolbar,
    "--terminal-header": theme.tokens.terminal.header,
    "--terminal-border": theme.tokens.terminal.border,
    "--terminal-text": theme.tokens.terminal.text,
    "--terminal-muted": theme.tokens.terminal.muted,
    "--terminal-accent": theme.tokens.terminal.accent,
    "--terminal-font": theme.tokens.terminal.font || defaultTerminalFont()
  });
}

function clearThemePreview() {
  document.querySelector(".theme-preview-shell")?.removeAttribute("style");
}

function normalizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
}

function normalizeColorOrEmpty(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function simpleThemeFromTokens(theme) {
  const mode = theme?.mode === "dark" ? "dark" : "light";
  const terminal = theme?.tokens?.terminal || {};
  return {
    mode,
    primary: normalizeColor(theme?.tokens?.ui?.accent || theme?.tokens?.docs?.link || "#276ef1"),
    secondary: "",
    terminalMode: inferTerminalMode(terminal, mode),
    terminalFont: terminal.font || defaultTerminalFont(),
    terminalAccent: normalizeColor(terminal.accent || theme?.tokens?.ui?.accent || "#276ef1")
  };
}

function generateThemeTokens(simple) {
  const mode = simple.mode === "dark" ? "dark" : "light";
  const primary = normalizeColor(simple.primary);
  const secondary = normalizeColorOrEmpty(simple.secondary) || derivedSecondaryColor(primary, mode);
  const terminalMode = ["light", "dark"].includes(simple.terminalMode) ? simple.terminalMode : mode;
  const terminalAccent = ensureAccent(normalizeColor(simple.terminalAccent || primary), terminalMode);
  const terminalFont = simple.terminalFont || defaultTerminalFont();
  const terminal = generateTerminalTokens(primary, terminalMode, terminalAccent, terminalFont);
  if (mode === "dark") {
    return {
      ui: {
        bg: mixHex(primary, "#070807", 0.08),
        panel: mixHex(primary, "#111310", 0.12),
        border: mixHex(primary, "#ffffff", 0.24),
        text: "#f4f5f0",
        muted: "#aeb5aa",
        accent: ensureAccent(primary, "dark")
      },
      docs: {
        bg: mixHex(primary, "#0d0e0b", 0.07),
        panel: mixHex(secondary, "#151611", 0.12),
        border: mixHex(secondary, "#ffffff", 0.22),
        text: "#f1ecdf",
        muted: "#b8b09f",
        link: ensureAccent(secondary, "dark"),
        code: mixHex(primary, "#1c1d17", 0.16)
      },
      terminal
    };
  }
  return {
    ui: {
      bg: mixHex(primary, "#f8f8f4", 0.06),
      panel: "#ffffff",
      border: mixHex(primary, "#d8d8d0", 0.14),
      text: "#20231f",
      muted: "#62675f",
      accent: ensureAccent(primary, "light")
    },
    docs: {
      bg: mixHex(secondary, "#fbfaf4", 0.07),
      panel: "#fffdf8",
      border: mixHex(secondary, "#ddd7c9", 0.14),
      text: "#24221d",
      muted: "#6f695d",
      link: ensureAccent(secondary, "light"),
      code: mixHex(secondary, "#efede4", 0.12)
    },
    terminal
  };
}

function derivedSecondaryColor(primary, mode) {
  return mixHex(normalizeColor(primary), mode === "dark" ? "#ffffff" : "#000000", 0.32);
}

function generateTerminalTokens(primary, mode, accent, font) {
  if (mode === "light") {
    return {
      bg: mixHex(primary, "#f8faf7", 0.05),
      pane: "#ffffff",
      toolbar: mixHex(primary, "#eff3ef", 0.08),
      header: mixHex(primary, "#e8eee9", 0.1),
      border: mixHex(primary, "#cbd5cc", 0.16),
      text: "#1d241f",
      muted: "#68736c",
      accent: ensureAccent(accent, "light"),
      font
    };
  }
  return {
    bg: mixHex(primary, "#090b09", 0.08),
    pane: "#090b09",
    toolbar: mixHex(primary, "#111410", 0.12),
    header: mixHex(primary, "#151914", 0.14),
    border: mixHex(primary, "#ffffff", 0.22),
    text: "#eff5ed",
    muted: "#a9b2a5",
    accent: ensureAccent(accent, "dark"),
    font
  };
}

function inferTerminalMode(terminal, fallbackMode) {
  if (!terminal?.bg) return fallbackMode;
  return relativeLuminance(hexToRgb(normalizeColor(terminal.bg))) > 0.55 ? "light" : "dark";
}

function defaultTerminalFont() {
  return monoFontOptions.find((font) => font.label === "Sometype Mono")?.value || monoFontOptions[0]?.value || fontOptions[0].value;
}

function ensureAccent(color, mode) {
  const normalized = normalizeColor(color);
  const contrastTarget = mode === "dark" ? "#111312" : "#ffffff";
  if (contrastRatio(normalized, contrastTarget) >= 4.5) return normalized;
  return mode === "dark" ? mixHex(normalized, "#ffffff", 0.45) : mixHex(normalized, "#000000", 0.38);
}

function mixHex(a, b, amount) {
  const left = hexToRgb(normalizeColor(a));
  const right = hexToRgb(normalizeColor(b));
  return rgbToHex({
    r: Math.round(left.r * (1 - amount) + right.r * amount),
    g: Math.round(left.g * (1 - amount) + right.g * amount),
    b: Math.round(left.b * (1 - amount) + right.b * amount)
  });
}

function contrastRatio(a, b) {
  const left = relativeLuminance(hexToRgb(a));
  const right = relativeLuminance(hexToRgb(b));
  const light = Math.max(left, right);
  const dark = Math.min(left, right);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(rgb) {
  const values = [rgb.r, rgb.g, rgb.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function loadGoogleFontsForTheme(theme) {
  const values = [
    theme.tokens.ui.sidebarFont,
    theme.tokens.docs.serifFont,
    theme.tokens.docs.monoFont,
    theme.tokens.terminal.font
  ];
  const families = fontOptions
    .filter((font) => font.google && values.includes(font.value))
    .map((font) => font.google);
  let link = document.getElementById("hyperwiki-google-fonts");
  if (families.length === 0) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.id = "hyperwiki-google-fonts";
    link.rel = "stylesheet";
    document.head.append(link);
  }
  link.href = `https://fonts.googleapis.com/css2?${families.map((family) => `family=${family}`).join("&")}&display=swap`;
}

function effectiveTheme(settings) {
  const activePreset = settings.theme?.activePreset || "paper";
  const preset = settings.theme?.presets?.[activePreset] || Object.values(settings.theme?.presets || {})[0] || {};
  return deepMerge(preset, { tokens: settings.theme?.customTokens || {} });
}

function applyWikiFrameTheme(theme) {
  try {
    const doc = wikiFrame.contentDocument;
    if (!doc) return;
    let style = doc.getElementById("hyperwiki-theme-vars");
    if (!style) {
      style = doc.createElement("style");
      style.id = "hyperwiki-theme-vars";
      doc.head.append(style);
    }
    style.textContent = `:root {
  color-scheme: ${theme.mode === "dark" ? "dark" : "light"};
  --docs-bg: ${theme.tokens.docs.bg};
  --docs-panel: ${theme.tokens.docs.panel};
  --docs-border: ${theme.tokens.docs.border};
  --docs-text: ${theme.tokens.docs.text};
  --docs-muted: ${theme.tokens.docs.muted};
  --docs-link: ${theme.tokens.docs.link};
  --docs-code: ${theme.tokens.docs.code};
  --docs-serif-font: ${theme.tokens.docs.serifFont};
  --docs-mono-font: ${theme.tokens.docs.monoFont};
}`;
  } catch {
    // Ignore frame timing and same-origin races.
  }
}

function setVars(target, vars) {
  Object.entries(vars).forEach(([name, value]) => {
    if (value) target.style.setProperty(name, value);
  });
}

function deepMerge(base, override) {
  const next = structuredClone(base || {});
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
      next[key] = deepMerge(next[key], value);
    } else {
      next[key] = structuredClone(value);
    }
  }
  return next;
}

function extensionlessWikiPath(path) {
  return String(path || "").replace(/\.html$/, "");
}

function renderDashboardProjects(projects) {
  if (projects.length === 0) {
    dashboardProjects.replaceChildren(emptyDashboardItem("No projects added yet..."));
    return;
  }
  dashboardProjects.replaceChildren(...projects.map((project) => {
    const item = document.createElement("article");
    item.className = `dashboard-item project-card${project.active ? " active" : ""}`;
    item.dataset.projectId = project.id;
    item.dataset.projectName = project.name;
    item.dataset.projectRoot = project.root;
    item.dataset.projectAvailable = String(project.available);
    item.dataset.projectActive = String(project.active);
    item.dataset.projectLastOpenedAt = project.lastOpenedAt || "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-card-title";
    button.textContent = project.name;
    button.disabled = !project.available;
    button.title = project.available ? project.root : `${project.root} unavailable`;
    button.addEventListener("click", () => switchProject(project));

    const status = document.createElement("span");
    status.className = `project-card-status${project.available ? "" : " unavailable"}`;
    status.textContent = project.available ? (project.active ? "Active" : "Available") : "Unavailable";

    const header = document.createElement("div");
    header.className = "project-card-header";
    header.append(button, status);

    const meta = document.createElement("p");
    meta.className = "project-card-path";
    meta.textContent = project.available ? project.root : "Unavailable";

    const details = document.createElement("div");
    details.className = "project-card-details";
    details.append(
      projectDetail("Last opened", formatProjectDate(project.lastOpenedAt))
    );

    const actions = document.createElement("div");
    actions.className = "dashboard-item-actions";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "project-open-button";
    openButton.textContent = project.active ? "Open project" : "Switch and open";
    openButton.disabled = !project.available;
    openButton.addEventListener("click", () => switchProject(project));
    actions.append(openButton);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "project-remove-button";
    removeButton.setAttribute("aria-label", `Remove ${project.name}`);
    removeButton.title = "Remove project";
    removeButton.append(icon(["m3 6 18 0", "m8 6 0-2 8 0 0 2", "m6 6 1 14 10 0 1-14", "m10 11 0 5", "m14 11 0 5"]));
    removeButton.addEventListener("click", () => {
      pendingProjectRemovalId = project.id;
      renderDashboardProjects(projects);
    });

    item.append(header, meta, details, actions);
    if (pendingProjectRemovalId === project.id) {
      item.append(projectRemovalConfirmation(project));
    } else {
      item.append(removeButton);
    }
    return item;
  }));
}

function projectRemovalConfirmation(project) {
  const panel = document.createElement("div");
  panel.className = "project-remove-confirmation";

  const warning = document.createElement("div");
  warning.className = "project-remove-warning";
  const warningTitle = document.createElement("strong");
  warningTitle.textContent = "Destructive option";
  const warningText = document.createElement("span");
  warningText.textContent = "Removing the project only forgets it in Hyperwiki. Checking file deletion permanently deletes the project folder.";
  warning.append(warningTitle, warningText);

  const deleteFilesLabel = document.createElement("label");
  deleteFilesLabel.className = "project-delete-files-toggle";
  const deleteFiles = document.createElement("input");
  deleteFiles.type = "checkbox";
  deleteFiles.checked = false;
  deleteFiles.disabled = !project.available;
  const deleteFilesText = document.createElement("span");
  deleteFilesText.textContent = project.available ? "Also delete project files" : "Project files unavailable";
  deleteFilesLabel.append(deleteFiles, deleteFilesText);

  const actions = document.createElement("div");
  actions.className = "project-remove-confirm-actions";
  const status = document.createElement("p");
  status.className = "project-remove-status";
  status.setAttribute("role", "status");

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "project-remove-cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    pendingProjectRemovalId = null;
    void loadProjectManagement();
  });

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "project-remove-confirm";
  confirm.textContent = "Confirm Remove";
  deleteFiles.addEventListener("change", () => {
    confirm.textContent = deleteFiles.checked ? "Confirm Delete" : "Confirm Remove";
  });
  confirm.addEventListener("click", async () => {
    const deletingFiles = deleteFiles.checked;
    confirm.disabled = true;
    cancel.disabled = true;
    deleteFiles.disabled = true;
    confirm.textContent = deletingFiles ? "Deleting..." : "Removing...";
    status.textContent = deletingFiles ? "Deleting project files..." : "Removing project...";
    try {
      await removeProject(project, deletingFiles);
    } catch (error) {
      confirm.disabled = false;
      cancel.disabled = false;
      deleteFiles.disabled = !project.available;
      confirm.textContent = deleteFiles.checked ? "Confirm Delete" : "Confirm Remove";
      status.textContent = error.message || "Project removal failed.";
      setProjectsStatus(error.message || "Project removal failed.");
    }
  });
  actions.append(cancel, confirm);

  panel.append(warning, deleteFilesLabel, status, actions);
  return panel;
}

async function removeProject(project, deleteFiles) {
  setProjectsStatus(deleteFiles ? "Deleting project files..." : "Removing project...");
  const result = await api(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "DELETE",
    body: JSON.stringify({ deleteFiles, root: project.root })
  });
  if (deleteFiles && result.deletedFiles !== true) {
    throw new Error("Project was removed from Hyperwiki, but file deletion was not confirmed.");
  }
  pendingProjectRemovalId = null;
  setProjectsStatus(deleteFiles ? "Project removed and files deleted." : "Project removed from Hyperwiki.");
  await loadProjects();
  await loadProjectManagement();
}

function projectDetail(label, value) {
  const item = document.createElement("span");
  item.className = "project-detail";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value || "Unknown";
  item.append(labelElement, valueElement);
  return item;
}

function icon(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const pathData of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}

function formatProjectDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function emptyDashboardItem(text) {
  const item = document.createElement("p");
  item.className = "dashboard-empty";
  item.textContent = text;
  return item;
}

async function importDocumentFile(fileInput, markdownInput, titleInput) {
  const [file] = fileInput.files || [];
  if (!file) return false;
  const text = await file.text();
  const type = isHtmlDocument(file, text) ? "html" : "markdown";
  markdownInput.value = text;
  markdownInput.dataset.documentType = type;
  titleInput.value = titleFromDocument(text, type) || titleFromFilename(file.name);
  return true;
}

async function createProjectFromMarkdown() {
  const title = projectTitleInput.value.trim();
  const markdown = projectMarkdownInput.value.trim();
  const documentType = projectMarkdownInput.dataset.documentType || "markdown";
  if (!title || !markdown) return;
  try {
    setNewProjectStatus("Initializing project...");
    const result = await api(projectPath("/api/projects/create"), {
      method: "POST",
      body: JSON.stringify({ title, summary: documentSummary(markdown, documentType) })
    });
    closeAllTerminals();
    activeProjectId = result.project.id;
    activeProjectSlug = result.project.projectSlug;
    activeWorktreeSlug = result.project.worktreeSlug;
    history.pushState(null, "", "/projects");
    await loadProjects();
    await loadProjectManagement();
    await loadRepoContext();
    await loadWikiNav();
    await loadWorkspaceSummary();
    await loadGuardrails();
    await showProjectsPage({ replace: true });
    setProjectsStatus("Starting agent in the new project...");
    const prompt = [
      "Turn this document into the initial Hyperwiki project pages.",
      "",
      `Project: ${title}`,
      `Repo root: ${result.project.root}`,
      "",
      "Instructions:",
      "- Read AGENTS.md, wiki/index.html, wiki/sources.html, wiki/sources/prd.html, wiki/sources/technical-brief.html, and wiki/sources/design-brief.html before writing.",
      "- Use the project-html-wiki workflow for source briefs, planning, log policy, and wiki maintenance when available.",
      "- Preserve Hyperwiki scaffold conventions: lowercase wiki/sources.html is canonical, wiki/AGENTS.html is the app-visible wiki guide, and generated pages use the app-served /assets/wiki.css unless the user asks for a standalone artifact.",
      "- Treat Hyperwiki as Localhost Tooling: the user's local machine, repo files, Git state, terminal sessions, credentials, and environment variables are the trust boundary.",
      "- Update the project wiki pages as if the user had typed this brief directly to you.",
      "- Create or revise source briefs, roadmap, and planning pages only where the document supports durable project context.",
      "- Ask concise Q&A in this terminal if the document lacks critical product, technical, or validation decisions.",
      "- Keep the project locally grounded and run relevant hyperwiki checks before finishing.",
      "",
      `${documentContentLabel(documentType)}:`,
      `\`\`\`${documentType}`,
      markdown,
      "```"
    ].join("\n");
    await handOffDashboardPrompt(prompt, "/projects");
    setProjectsStatus(`Agent started in ${result.project.name}`);
    setNewProjectStatus("");
  } catch (error) {
    setNewProjectStatus(error.message || "Could not create the project.");
  }
}

async function handOffDashboardPrompt(prompt, currentPagePath) {
  await ensureDevLogTerminal();
  const agent = await ensureAgentTerminal();
  activateTerminal(agent.name);
  await postAgentPromptWithRetry(prompt, currentPagePath);
}

async function executeTarget(target) {
  const pagePath = currentPage.title || requestedWikiPath;
  const pageTitle = currentPage.dataset.title || titleForWikiPath(pagePath);
  const slug = slugify(pageTitle || "worktree");
  workspace.dataset.executeTarget = target;
  if (target === "worktree") {
    workspace.dataset.executeWorkflow = "parallel-dev-worktrees";
    showPreviewLink(previewUrl(slug), `Preview: ${slug}`);
  } else {
    workspace.dataset.executeWorkflow = "main";
    showPreviewLink(previewUrl(activeProjectSlug || "hyperwiki"), "Preview: main");
  }
  await ensureDevLogTerminal();
  const agent = await ensureAgentTerminal();
  activateTerminal(agent.name);
  await postAgentPromptWithRetry(executePrompt(target, pageTitle, pagePath, slug), pagePath);
}

function executePrompt(target, pageTitle, pagePath, slug) {
  const lines = [
    `Execute the current hyperwiki context on ${target === "worktree" ? "a worktree" : "main"}.`,
    "",
    `Current page: ${pageTitle}`,
    `Current path: ${displayWikiPath(pagePath)}`,
    ""
  ];
  if (target === "worktree") {
    lines.push(
      "Instructions:",
      "- Use the parallel-dev-worktrees skill before changing files.",
      `- Derive the branch/worktree slug from the current page as "${slug}" unless that would be ambiguous.`,
      "- Ask a concise question only if the worktree or branch name is ambiguous.",
      "- Use Portless for the dev preview URL.",
      `- Expected preview URL: ${previewUrl(slug)}`,
      "- Include the Preview URL in your final handoff."
    );
  } else {
    lines.push(
      "Instructions:",
      "- Work in the current main checkout.",
      "- Keep changes grounded in the current wiki page and repo state.",
      "- Run the relevant checks before summarizing the result."
    );
  }
  return lines.join("\n");
}

async function ensureDevLogTerminal() {
  if (terminalSessions.has("dev")) return terminalSessions.get("dev");
  const template = terminalTemplate("dev");
  if (!template.command) return null;
  return createTerminal("dev", { ...template, name: "dev", collapsed: true });
}

async function ensureAgentTerminal() {
  if (terminalSessions.has("agent")) {
    return terminalSessions.get("agent");
  }
  const template = agentTerminalTemplate();
  const session = await createTerminal("agent", { ...template, name: "agent", role: "agent" });
  updatePlanPromptVisibility();
  return session;
}

async function postAgentPromptWithRetry(prompt, currentPagePath) {
  await waitForAgentPromptReady();
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await api(projectPath("/api/agent/prompt"), {
        method: "POST",
        body: JSON.stringify({ prompt, currentPage: currentPagePath })
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError || new Error("Agent unavailable.");
}

async function waitForAgentPromptReady() {
  const session = terminalSessions.get("agent");
  if (!shouldWaitForCodexReady(session)) return;
  if (session.codexReady || codexReadyFromOutput(session.outputBuffer || "")) {
    session.codexReady = true;
    return;
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.codexReadyWaiters = (session.codexReadyWaiters || []).filter((waiter) => waiter !== resolveReady);
      reject(new Error("Codex is still starting. Try sending again after the prompt appears."));
    }, 30000);
    function resolveReady() {
      clearTimeout(timer);
      resolve();
    }
    session.codexReadyWaiters = [...(session.codexReadyWaiters || []), resolveReady];
  });
}

function setProjectsStatus(message) {
  projectsStatus.textContent = message;
}

function setNewProjectStatus(message) {
  newProjectStatus.textContent = message;
}

function titleFromMarkdown(markdown) {
  const heading = String(markdown).match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : "";
}

function titleFromDocument(content, type) {
  return type === "html" ? titleFromHtml(content) : titleFromMarkdown(content);
}

function titleFromHtml(html) {
  const documentElement = new DOMParser().parseFromString(String(html), "text/html");
  const title = documentElement.querySelector("h1")?.textContent
    || documentElement.querySelector("title")?.textContent
    || documentElement.querySelector("h2, h3")?.textContent
    || "";
  return title.trim().replace(/\s+/g, " ");
}

function titleFromFilename(name) {
  return String(name || "")
    .replace(/\.(md|markdown|txt|html|htm)$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function documentSummary(content, type) {
  return type === "html" ? htmlSummary(content) : markdownSummary(content);
}

function markdownSummary(markdown) {
  const paragraph = plainTextFromMarkdown(markdown)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find(Boolean) || "Imported from Dashboard markdown.";
  return paragraph.length > 220 ? `${paragraph.slice(0, 217).trim()}...` : paragraph;
}

function htmlSummary(html) {
  const documentElement = new DOMParser().parseFromString(String(html), "text/html");
  const paragraph = documentElement.querySelector("p")?.textContent
    || documentElement.body?.textContent
    || "Imported from Dashboard HTML.";
  const cleaned = paragraph.trim().replace(/\s+/g, " ");
  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trim()}...` : cleaned;
}

function plainTextFromMarkdown(markdown) {
  return String(markdown).replace(/^#+\s+/gm, "");
}

function isHtmlDocument(file, text) {
  return /\.html?$/i.test(file.name)
    || String(file.type || "").toLowerCase() === "text/html"
    || /^\s*(<!doctype html|<html[\s>])/i.test(text);
}

function documentContentLabel(type) {
  return type === "html" ? "HTML" : "Markdown";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function previewUrl(slug) {
  const projectSlug = activeProjectSlug || "hyperwiki";
  const normalizedSlug = slugify(slug || "main");
  if (normalizedSlug === "main" || normalizedSlug === projectSlug) {
    return `https://${projectSlug}.localhost`;
  }
  return `https://${normalizedSlug}.${projectSlug}.localhost`;
}

function showPreviewLink(url, label = "Open preview") {
  previewLink.hidden = false;
  previewLink.href = url;
  previewLink.textContent = label;
  previewLink.title = url;
}

function hidePreviewLink() {
  previewLink.hidden = true;
  previewLink.href = "#";
  previewLink.textContent = "Open preview";
  previewLink.title = "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function switchProject(project) {
  closeTopbarPanels();
  if (project.id === activeProjectId) {
    history.pushState(null, "", `${workspacePath(project)}#/wiki/index.html`);
    activateWorkspaceLocation("/wiki/index.html");
    return;
  }
  closeAllTerminals();
  hidePreviewLink();
  activeProjectId = project.id;
  activeProjectSlug = project.projectSlug;
  activeWorktreeSlug = project.worktreeSlug;
  history.pushState(null, "", `${workspacePath(project)}#/wiki/index.html`);
  requestedWikiPath = "/wiki/index.html";
  await loadProjects();
  await loadProjectManagement();
  await loadRepoContext();
  await loadWikiNav();
  await loadWorkspaceSummary();
  await loadGuardrails();
  activateWikiPage(currentPlanPath);
  await restoreTerminals();
}

function updatePlanPromptVisibility() {
  if (workspace.classList.contains("non-plan-wiki-mode")) {
    planPrompt.hidden = nonPlanPromptSubmitted || terminalSessions.has("agent");
    return;
  }
  planPrompt.hidden = workspace.classList.contains("projects-mode")
    || workspace.classList.contains("settings-mode")
    || !terminalSessions.has("agent");
}

function terminalTemplate(name) {
  const template = terminalLayout.find((panel) => panel.name === name || panel.role === name);
  if (template) return template;
  if (name === "agent") return { role: "agent", command: null };
  if (name === "dev") return { role: "dev", command: null };
  return { role: "shell", command: null };
}

function agentTerminalTemplate() {
  const template = terminalTemplate("agent");
  return { ...template, command: commandWithThinkingEffort(template.command) };
}

function initThinkingEffortPicker() {
  if (!thinkingEffort) return;
  thinkingEffort.value = normalizedThinkingEffort(localStorage.getItem(thinkingEffortStorageKey));
  thinkingEffort.addEventListener("change", () => {
    localStorage.setItem(thinkingEffortStorageKey, normalizedThinkingEffort(thinkingEffort.value));
  });
}

function selectedThinkingEffort() {
  return normalizedThinkingEffort(thinkingEffort?.value);
}

function normalizedThinkingEffort(value) {
  const normalized = String(value || "low").trim().toLowerCase();
  return thinkingEffortLevels.has(normalized) ? normalized : "low";
}

function commandWithThinkingEffort(command) {
  const value = String(command || "").trim();
  if (!value || !/(^|\s)codex(\s|$)/.test(value)) return command;
  const effort = selectedThinkingEffort();
  const override = `-c model_reasoning_effort=\\"${effort}\\"`;
  if (/model_reasoning_effort\s*=/.test(value)) {
    return value.replace(/-c\s+model_reasoning_effort=(?:"[^"]*"|'[^']*'|\\?"[^"]*\\?"|\S+)/, override);
  }
  return `${value} ${override}`;
}

function nextTerminalName(kind) {
  if (kind === "agent") {
    if (!terminalSessions.has("agent")) return "agent";
    do {
      agentTerminalCount += 1;
    } while (terminalSessions.has(`agent-${agentTerminalCount}`));
    return `agent-${agentTerminalCount}`;
  }
  if (!terminalSessions.has("cli")) return "cli";
  do {
    cliTerminalCount += 1;
  } while (terminalSessions.has(`cli-${cliTerminalCount}`));
  return `cli-${cliTerminalCount}`;
}

function groupWikiPages(pages) {
  const planTree = renderPlanTree(pages.filter((page) => page.path.includes("/wiki/plans/")));
  const projectPages = pages.filter((page) =>
    [
      "/wiki/index.html",
      "/wiki/architecture.html",
      "/wiki/dev.html",
      "/wiki/roadmap.html",
      "/wiki/sources.html",
      "/wiki/log.html"
    ].some((suffix) => page.path.endsWith(suffix)) || page.path.includes("/wiki/sources/")
  );
  const groups = [
    planTree,
    renderNavGroup("Project", projectPages, false, "project-nav-group")
  ];
  return groups.filter(Boolean);
}

function renderPlanTree(pages) {
  const section = document.createElement("section");
  section.className = "wiki-nav-group plan-tree";
  const heading = document.createElement("div");
  heading.className = "plan-tree-heading";
  heading.textContent = "Plans";
  section.append(heading);

  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const currentTargets = currentPlanTargets(sorted);
  const topLevel = sorted.filter((page) => isTopLevelPlanPage(page));
  for (const page of topLevel) {
    section.append(renderPlanNode(page, sorted, currentTargets));
  }
  return section;
}

function renderPlanNode(page, pages, currentTargets) {
  const children = childPlanPages(page, pages);
  const state = currentPlanState(page, pages, currentTargets);
  const completed = isCompletedPage(page);
  if (children.length === 0) {
    return renderWikiLink(page, state, { completed });
  }
  const group = document.createElement("details");
  group.className = `wiki-nav-group plan-subtree${state ? ` ${state}` : ""}${completed ? " completed-plan" : ""}`;
  group.dataset.path = displayWikiPath(page.path);
  group.open = state || children.some((child) => currentPlanState(child, pages, currentTargets) || hasCurrentDescendant(child, pages, currentTargets));
  const summary = document.createElement("summary");
  summary.append(renderWikiLink(page, state, { completed }));
  group.append(summary, ...children.map((child) => renderPlanNode(child, pages, currentTargets)));
  return group;
}

function renderNavGroup(title, pages, open, className = "") {
  if (pages.length === 0) return null;
  const details = document.createElement("details");
  details.className = `wiki-nav-group${className ? ` ${className}` : ""}`;
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.append(summary, ...pages.map(renderWikiLink));
  return details;
}

function isTopLevelPlanPage(page) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return true;
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return true;
  return /^\/wiki\/plans\/[^/]+\.html$/.test(path) && !path.endsWith("/index.html");
}

function isUnitPage(page) {
  return /\/unit-\d+-[^/]+\.html$/.test(displayWikiPath(page.path));
}

function childPlanPages(parent, pages) {
  return pages.filter((candidate) => isImmediateChildPlanPage(parent, candidate, pages));
}

function isImmediateChildPlanPage(parent, candidate, pages) {
  const parentPath = displayWikiPath(parent.path);
  const candidatePath = displayWikiPath(candidate.path);
  if (parentPath === candidatePath) return false;
  if (parentPath.endsWith("/wiki/plans/mvp/index.html")) {
    return /^\/wiki\/plans\/mvp\/stage-[^/]+\.html$/.test(candidatePath);
  }
  if (parentPath.endsWith("/wiki/plans/zzz_completed/index.html")) {
    return /^\/wiki\/plans\/zzz_completed\/[^/]+\.html$/.test(candidatePath)
      && !candidatePath.endsWith("/index.html");
  }
  const parentBase = parentPath.replace(/\.html$/, "");
  return candidatePath.startsWith(`${parentBase}/`) && !candidatePath.slice(parentBase.length + 1).includes("/");
}

function planSortKey(page) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return "01";
  if (path.startsWith("/wiki/plans/mvp/stage-")) return `01-${path}`;
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return "99";
  if (path.startsWith("/wiki/plans/zzz_completed/")) return `99-${path}`;
  return `02-${path}`;
}

function currentPlanTargets(pages = []) {
  const dashboard = pages.find((page) => displayWikiPath(page.path).endsWith("/wiki/plans/index.html"));
  const currentStage = summaryValue(dashboard?.summary, "Current stage");
  const currentUnit = summaryValue(dashboard?.summary, "Current unit");
  const explicitStagePage = findPlanPageByLabel(pages, currentStage);
  const unitPage = findPlanPageByLabel(pages, currentUnit, explicitStagePage);
  const stagePage = explicitStagePage || parentStagePageForUnit(unitPage, pages);
  const hasCanonicalCurrent = Boolean(stagePage || unitPage);
  return {
    hasCanonicalCurrent,
    stagePath: stagePage ? displayWikiPath(stagePage.path) : "",
    unitPath: unitPage ? displayWikiPath(unitPage.path) : ""
  };
}

function currentPlanState(page, pages = [], currentTargets = currentPlanTargets(pages)) {
  const path = displayWikiPath(page.path);
  if (currentTargets.hasCanonicalCurrent) {
    if (currentTargets.unitPath && path === currentTargets.unitPath) return "current-unit";
    if (isStagePlanPath(path) && path === currentTargets.stagePath) return "current-stage";
    if (isTopLevelPlanPage(page) && planPathContains(path, currentTargets.unitPath || currentTargets.stagePath)) return "current-plan";
    return "";
  }
  if (isUnitPage(page) && pageStatus(page) === "active") return "current-unit";
  if (isStagePlanPath(path) && (pageStatus(page) === "active" || hasActiveDescendant(page, pages))) return "current-stage";
  if (isTopLevelPlanPage(page) && (pageStatus(page) === "active" || hasActiveDescendant(page, pages))) return "current-plan";
  return "";
}

function hasCurrentDescendant(page, pages, currentTargets = currentPlanTargets(pages)) {
  return childPlanPages(page, pages).some((child) => currentPlanState(child, pages, currentTargets) || hasCurrentDescendant(child, pages, currentTargets));
}

function hasActiveDescendant(page, pages) {
  return childPlanPages(page, pages).some((child) => pageStatus(child) === "active" || hasActiveDescendant(child, pages));
}

function findPlanPageByLabel(pages, label, parentPage = null) {
  if (!label || /^none|complete$/i.test(label)) return null;
  const normalized = normalizePlanLabel(label);
  const parentBase = parentPage ? displayWikiPath(parentPage.path).replace(/\.html$/, "") : "";
  return pages.find((page) => {
    const path = displayWikiPath(page.path);
    if (!path.includes("/wiki/plans/")) return false;
    if (parentBase && !path.startsWith(`${parentBase}/`)) return false;
    return normalizePlanLabel(page.title) === normalized;
  }) || null;
}

function parentStagePageForUnit(unitPage, pages) {
  if (!unitPage) return null;
  const unitPath = displayWikiPath(unitPage.path);
  const match = unitPath.match(/^(\/wiki\/plans\/mvp\/stage-[^/]+)\/unit-\d+-[^/]+\.html$/);
  if (!match) return null;
  const stagePath = `${match[1]}.html`;
  return pages.find((page) => displayWikiPath(page.path) === stagePath) || null;
}

function summaryValue(items = [], label) {
  const prefix = `${label}:`;
  const item = (Array.isArray(items) ? items : []).find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  return item ? item.slice(prefix.length).trim() : "";
}

function normalizePlanLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .trim()
    .toLowerCase();
}

function planPathContains(parentPath, childPath) {
  const parent = displayWikiPath(parentPath);
  const child = displayWikiPath(childPath);
  if (!parent || !child) return false;
  if (parent === child) return true;
  const basePath = parent.endsWith("/index.html")
    ? parent.replace(/\/index\.html$/, "")
    : parent.replace(/\.html$/, "");
  return child.startsWith(`${basePath}/`);
}

function renderWikiLink(page, state = "", options = {}) {
  const link = document.createElement("a");
  link.href = `#${page.path}`;
  const label = cleanPageTitle(page);
  const labelElement = document.createElement("span");
  labelElement.className = "wiki-nav-label";
  labelElement.textContent = label;
  link.title = label;
  link.dataset.path = displayWikiPath(page.path);
  if (options.completed) {
    link.title = `${label} - completed`;
    link.setAttribute("aria-label", `${label} completed`);
    link.classList.add("completed-plan-link");
  }
  link.append(labelElement);
  if (state) {
    link.classList.add(state);
  }
  link.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTopbarPanels();
    activateWorkspaceLocation(page.path);
  });
  return link;
}

function cleanPageTitle(page) {
  if (page.path.endsWith("/wiki/plans/index.html")) return "Planning Dashboard";
  if (page.path.endsWith("/wiki/plans/mvp/index.html")) return "MVP Plan";
  if (page.path.endsWith("/wiki/plans/zzz_completed/index.html")) return "Completed Plans";
  if (isUnitPage(page)) return page.title.replace(/^Unit (\d+) - /, (_match, unit) => `Unit-${unit.padStart(2, "0")} `);
  if (page.path.includes("/stage-")) return page.title.replace(/^Stage (\d+) - /, "Stage-$1 ");
  if (page.title.toLowerCase() === "prd") return "PRD";
  if (displayWikiPath(page.path).includes("/wiki/plans/")) return page.title.replace(/\s+Plan$/, "");
  return page.title;
}

function pageStatus(page) {
  const summary = `${page.summary || ""} ${page.title || ""} ${page.path || ""}`;
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return "";
  if (path.includes("/wiki/plans/zzz_completed/")) return "complete";
  const explicit = explicitPageStatus(page);
  if (explicit) return explicit;
  if (/\bstatus:\s*complete(d)?\b/i.test(summary)) return "complete";
  return "";
}

function explicitPageStatus(page) {
  const summary = Array.isArray(page.summary) ? page.summary : [];
  const statusItem = summary.find((item) => /^status:/i.test(item));
  if (!statusItem) return "";
  const status = statusItem.slice(statusItem.indexOf(":") + 1).trim().toLowerCase();
  return ["active", "pending", "complete", "completed", "draft", "blocked", "deferred"].includes(status)
    ? status.replace("completed", "complete")
    : "";
}

function isCompletedPage(page) {
  return pageStatus(page) === "complete";
}

function activateWikiPage(path) {
  const nextPath = normalizeWikiPath(path);
  configureWikiPageMode(nextPath);
  requestedWikiPath = nextPath;
  if (wikiFrame.getAttribute("src") !== nextPath) {
    wikiFrame.setAttribute("src", nextPath);
  }
  setCurrentPage(nextPath, titleForWikiPath(nextPath));
  setCommandBarCompleted(isCompletedPath(nextPath));
  openPage.href = nextPath;
  wikiNav.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.dataset.path === displayWikiPath(nextPath));
  });
  syncPlanTreeOpenState(nextPath);
  updatePlanPromptVisibility();
  const nextUrl = `${currentWorkspacePath()}#${nextPath}`;
  if (isAppShellPath(location.pathname) || `${location.pathname}${location.hash}` !== nextUrl) {
    history.replaceState(null, "", nextUrl);
  }
}

function modifyPlanPrompt(prompt) {
  const pagePath = currentPage.title || requestedWikiPath;
  const pageTitle = currentPage.dataset.title || titleForWikiPath(pagePath);
  return [
    "Modify the current hyperwiki plan from this instruction.",
    "",
    `Current page: ${pageTitle}`,
    `Current path: ${displayWikiPath(pagePath)}`,
    "",
    "Instructions:",
    "- Read the current page and relevant parent plan pages before editing.",
    "- Apply the requested plan change directly to the wiki HTML files.",
    "- Keep the change scoped to planning content unless the user explicitly asks for code.",
    "- Run the relevant checks after editing.",
    "",
    "Requested modification:",
    prompt
  ].join("\n");
}

function modifyWikiPagePrompt(prompt) {
  const pagePath = currentPage.title || requestedWikiPath;
  const pageTitle = currentPage.dataset.title || titleForWikiPath(pagePath);
  return [
    "Revise this hyperwiki wiki page from the user's instruction.",
    "",
    `Current page: ${pageTitle}`,
    `Current path: ${displayWikiPath(pagePath)}`,
    "",
    "Instructions:",
    "- Read AGENTS.md, wiki/index.html, wiki/sources.html, and the current wiki page before editing.",
    "- Preserve Hyperwiki scaffold conventions: lowercase wiki/sources.html, app-visible wiki/AGENTS.html, and app-served /assets/wiki.css unless the user explicitly asks for a standalone artifact.",
    "- Apply the requested change directly to this wiki HTML file.",
    "- Preserve concrete product, technical, and validation details already present on the page.",
    "- Run relevant checks after editing.",
    "",
    "Requested page revision:",
    prompt
  ].join("\n");
}

function configureWikiPageMode(path) {
  const nonPlan = isNonPlanWikiPath(path);
  workspace.classList.toggle("non-plan-wiki-mode", nonPlan);
  workspace.classList.remove("non-plan-agent-active");
  if (nonPlan) {
    nonPlanPromptSubmitted = false;
    setUpNextAvailable(false);
    closeAllTerminals();
    terminalPane.insertBefore(planPrompt, terminalPane.firstChild);
    planPrompt.querySelector("label").textContent = "Modify Page";
    planPromptInput.setAttribute("placeholder", "Describe how the agent should revise this page...");
    return;
  }
  setUpNextAvailable(true);
  if (planPrompt.parentElement !== wikiPane) {
    wikiPane.append(planPrompt);
  }
  planPrompt.querySelector("label").textContent = "Plan Prompt";
  planPromptInput.setAttribute("placeholder", "Ask the agent to revise this plan...");
}

function isNonPlanWikiPath(path) {
  const displayPath = displayWikiPath(path);
  return isWikiPath(displayPath) && !displayPath.includes("/wiki/plans/");
}

function syncPlanTreeOpenState(selectedPath) {
  const selected = displayWikiPath(selectedPath);
  wikiNav.querySelectorAll("details.plan-subtree").forEach((group) => {
    const groupPath = group.dataset.path;
    if (!groupPath) return;
    if (isStagePlanPath(groupPath)) {
      group.open = pathContainsSelectedPage(groupPath, selected)
        || shouldOpenCurrentStageByDefault(group, selected);
      return;
    }
    group.open = pathContainsSelectedPage(groupPath, selected)
      || group.querySelector("details[open], a.current-stage, a.current-unit");
  });
}

function shouldOpenCurrentStageByDefault(group, selectedPath) {
  if (!group.querySelector(":scope > summary a.current-stage")) return false;
  const normalizedSelected = displayWikiPath(selectedPath);
  if (normalizedSelected.endsWith("/wiki/plans/index.html")) return true;
  const currentStagePath = displayWikiPath(group.dataset.path || "");
  const currentPlanRoot = planRootPathForStage(currentStagePath);
  if (!currentPlanRoot) return false;
  if (normalizedSelected === currentPlanRoot) return true;
  const currentPlanBase = currentPlanRoot.replace(/\/index\.html$/, "");
  if (!normalizedSelected.startsWith(`${currentPlanBase}/`)) return false;
  return !normalizedSelected.startsWith(`${currentPlanBase}/stage-`);
}

function planRootPathForStage(path) {
  const normalizedPath = displayWikiPath(path);
  const match = normalizedPath.match(/^(\/wiki\/plans\/[^/]+)\/stage-[^/]+\.html$/);
  return match ? `${match[1]}/index.html` : "";
}

function isStagePlanPath(path) {
  return /^\/wiki\/plans\/mvp\/stage-[^/]+\.html$/.test(displayWikiPath(path));
}

function pathContainsSelectedPage(path, selectedPath) {
  const normalizedPath = displayWikiPath(path);
  const normalizedSelected = displayWikiPath(selectedPath);
  if (normalizedSelected === normalizedPath) return true;
  const basePath = normalizedPath.endsWith("/index.html")
    ? normalizedPath.slice(0, -"/index.html".length)
    : normalizedPath.replace(/\.html$/, "");
  return normalizedSelected.startsWith(`${basePath}/`);
}

function syncFrameLocation() {
  try {
    if (isAppShellPath(location.pathname)) {
      return;
    }
    const framePath = wikiFrame.contentWindow.location.pathname;
    hideEmbeddedWikiHeader();
    if (!isWikiPath(framePath) || framePath !== requestedWikiPath) {
      return;
    }
    setCurrentPage(framePath, currentWikiTitle() || displayWikiPath(framePath));
    setCommandBarCompleted(isCompletedPath(framePath) || embeddedWikiPageComplete());
    openPage.href = framePath;
    wikiNav.querySelectorAll("a").forEach((link) => {
      link.classList.toggle("active", link.dataset.path === displayWikiPath(framePath));
    });
    if (location.hash !== `#${framePath}`) {
      history.replaceState(null, "", `#${framePath}`);
    }
  } catch {
    // Same-origin wiki pages should be readable; ignore if a browser policy blocks it.
  }
}

function isCompletedPath(path) {
  return wikiPageStatus.get(path) === "complete" || wikiPageStatus.get(displayWikiPath(path)) === "complete";
}

function embeddedWikiPageComplete() {
  try {
    const documentElement = wikiFrame.contentDocument;
    if (!documentElement) return false;
    const path = displayWikiPath(wikiFrame.contentWindow.location.pathname);
    if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return false;
    if (path.includes("/wiki/plans/zzz_completed/")) return true;
    const summaryText = documentElement.querySelector("main .summary")?.textContent || "";
    return /\bstatus:\s*complete(d)?\b/i.test(summaryText);
  } catch {
    return false;
  }
}

function setCommandBarCompleted(completed) {
  completionBadge.hidden = !completed;
  modifyButton.hidden = completed;
  executeButton.hidden = completed;
  executeMenu.hidden = true;
  executeButton.setAttribute("aria-expanded", "false");
  if (completed) {
    modifyPlanUi.hidden = true;
    modifyButton.setAttribute("aria-expanded", "false");
  }
}

function hideEmbeddedWikiHeader() {
  const documentElement = wikiFrame.contentDocument;
  if (!documentElement) return;
  if (!documentElement.getElementById("hyperwiki-embedded-style")) {
    const style = documentElement.createElement("style");
    style.id = "hyperwiki-embedded-style";
    style.textContent = `
      .wiki-header { display: none !important; }
      .wiki-page { padding-top: 32px !important; }
      .wiki-page > h1 + p:has(a[href*="/wiki/plans/mvp/stage-"]) { display: none !important; }
    `;
    documentElement.head.append(style);
  }
  if (settingsState) applyWikiFrameTheme(effectiveTheme(settingsState));
}

function installEmbeddedWikiNavigation() {
  const documentElement = wikiFrame.contentDocument;
  if (!documentElement || documentElement.documentElement.dataset.hyperwikiNavigation === "installed") return;
  documentElement.documentElement.dataset.hyperwikiNavigation = "installed";
  documentElement.addEventListener("click", (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const url = new URL(link.getAttribute("href"), wikiFrame.contentWindow.location.href);
    if (url.origin !== window.location.origin || !isWikiPath(url.pathname)) {
      return;
    }
    event.preventDefault();
    activateWorkspaceLocation(url.pathname);
  });
}

function currentWikiTitle() {
  try {
    const heading = wikiFrame.contentDocument?.querySelector("main h1");
    return heading?.textContent?.trim() || "";
  } catch {
    return "";
  }
}

function pageFromHash() {
  return decodeURIComponent(location.hash.replace(/^#/, ""));
}

function workspaceLocation() {
  const hashPath = pageFromHash();
  if (hashPath) return hashPath;
  if (isNewProjectPath(location.pathname)) return "/projects/new";
  if (isProjectsPath(location.pathname)) return "/projects";
  if (isSettingsPath(location.pathname)) return "/settings";
  return "/projects";
}

function normalizeWikiPath(path) {
  if (path.startsWith("/wiki/") && activeProjectId) {
    return `/projects/${activeProjectId}${path}`;
  }
  if (!isWikiPath(path)) {
    return activeProjectId ? `/projects/${activeProjectId}/wiki/index.html` : "/wiki/index.html";
  }
  return path;
}

function isWikiPath(path) {
  return (path.startsWith("/wiki/") || (path.startsWith("/projects/") && path.includes("/wiki/"))) && path.endsWith(".html");
}

function displayWikiPath(path) {
  return path.replace(/^\/projects\/[^/]+/, "");
}

function titleForWikiPath(path) {
  return wikiPageTitles.get(displayWikiPath(path)) || displayWikiPath(path);
}

function setCurrentPage(path, title) {
  currentPage.title = path;
  currentPage.dataset.title = title || "";
  currentPage.replaceChildren(...breadcrumbItems(path, title));
}

function breadcrumbItems(path, title) {
  const displayPath = displayWikiPath(path);
  const crumbs = planBreadcrumbs(displayPath, title);
  if (crumbs.length === 0) {
    crumbs.push({ label: title || displayPath, path: displayPath });
  }
  const items = [];
  crumbs.forEach((crumb, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "wiki-breadcrumb-separator";
      separator.textContent = "|";
      items.push(separator);
    }
    const isCurrent = index === crumbs.length - 1;
    const element = isCurrent ? document.createElement("span") : document.createElement("a");
    element.className = isCurrent ? "wiki-breadcrumb-current" : "wiki-breadcrumb-link";
    element.textContent = crumb.label;
    if (!isCurrent) {
      element.href = `#${crumb.path}`;
      element.addEventListener("click", (event) => {
        event.preventDefault();
        activateWorkspaceLocation(crumb.path);
      });
    }
    items.push(element);
  });
  return items;
}

function planBreadcrumbs(path, title) {
  if (path === "/dashboard" || path === "/ideas" || path === "/projects") return [{ label: "Projects", path: "/projects" }];
  if (path === "/projects/new") return [{ label: "New Project", path }];
  if (path === "/projects") return [{ label: "Projects", path }];
  if (path.endsWith("/wiki/plans/mvp/index.html")) {
    return [{ label: "MVP Plan", path: "/wiki/plans/mvp/index.html" }];
  }
  const stageMatch = path.match(/^\/wiki\/plans\/mvp\/stage-(\d+)-[^/]+\.html$/);
  if (stageMatch) {
    return [
      { label: "MVP Plan", path: "/wiki/plans/mvp/index.html" },
      { label: `Stage ${stageMatch[1]}`, path }
    ];
  }
  const unitMatch = path.match(/^\/wiki\/plans\/mvp\/stage-(\d+)-([^/]+)\/unit-(\d+)-[^/]+\.html$/);
  if (unitMatch) {
    const stagePath = `/wiki/plans/mvp/stage-${unitMatch[1]}-${unitMatch[2]}.html`;
    return [
      { label: "MVP Plan", path: "/wiki/plans/mvp/index.html" },
      { label: `Stage ${unitMatch[1]}`, path: stagePath },
      { label: `Unit ${unitMatch[3]}`, path }
    ];
  }
  if (path.includes("/wiki/plans/")) {
    return [{ label: title || titleForWikiPath(path), path }];
  }
  return [];
}

async function createTerminal(name, options = {}) {
  if (terminalSessions.has(name)) {
    return terminalSessions.get(name);
  }

  const id = crypto.randomUUID();
  const panel = document.createElement("section");
  panel.className = "terminal-panel";
  panel.dataset.name = name;
  const header = document.createElement("div");
  header.className = "terminal-panel-header";
  header.dataset.name = name;
  const headerTitle = document.createElement("strong");
  headerTitle.textContent = name;
  const headerCommand = document.createElement("span");
  headerCommand.textContent = terminalCommandLabel(options);
  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.className = "terminal-collapse";
  collapseButton.setAttribute("aria-label", `Toggle ${name} terminal`);
  collapseButton.textContent = options.collapsed ? "expand" : "collapse";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "terminal-close";
  closeButton.setAttribute("aria-label", `Close ${name} terminal`);
  closeButton.textContent = "x";
  header.append(headerTitle, headerCommand, collapseButton, closeButton);
  const el = document.createElement("div");
  el.className = "terminal theme-monokai";
  el.dataset.name = name;
  el.tabIndex = 0;
  panel.append(header, el);
  terminals.append(panel);
  header.addEventListener("click", () => activateTerminal(name));
  collapseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTerminalCollapsed(name);
  });
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTerminal(name);
  });

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "terminal-tab";
  tab.dataset.name = name;
  const status = document.createElement("span");
  status.className = "status";
  status.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = name;
  const role = document.createElement("small");
  role.textContent = options.role || "shell";
  tab.append(status, label, role);
  terminalTabs.append(tab);
  tab.addEventListener("click", () => activateTerminal(name));

  let transport;
  let lastLocalInputAt = 0;
  let lastLocalInputWasEnter = false;
  const term = new WTerm(el, {
    cols: 100,
    rows: 24,
    cursorBlink: true,
    onData(data) {
      const normalized = normalizeTerminalInput(data);
      lastLocalInputAt = performance.now();
      lastLocalInputWasEnter = normalized === "\r" || normalized === "\n";
      transport?.send(normalized);
    },
    onResize(cols, rows) {
      transport?.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  });
  let session;
  term._scrollToBottom = () => {
    if (!isRecentLocalInput(lastLocalInputAt)) {
      scrollTerminalToBottom(el);
    }
  };
  el.addEventListener("focusin", () => {
    if (activeTerminalName !== name) {
      activateTerminal(name);
    }
  });
  el.addEventListener("pointerdown", () => {
    if (activeTerminalName === name) return;
    activateTerminal(name);
    requestAnimationFrame(() => term.focus());
  });
  el.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  el.addEventListener("drop", (event) => {
    event.preventDefault();
    void handleTerminalDrop(event, name, transport);
  });
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  transport = new WebSocketTransport({
    url: `${protocol}//${location.host}/pty?project=${encodeURIComponent(activeProjectId || "")}&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&role=${encodeURIComponent(options.role || "shell")}&command=${encodeURIComponent(options.command || "")}`,
    reconnect: false,
    onData: (data) => {
      recordTerminalOutput(session, data);
      const shouldFollowOutput = isTerminalNearBottom(el);
      const shouldHoldForLocalEcho = isRecentLocalEcho(lastLocalInputAt, lastLocalInputWasEnter);
      const scrollTopBeforeEcho = el.scrollTop;
      term.write(data);
      if (shouldHoldForLocalEcho) {
        scheduleTerminalScrollRestore(el, scrollTopBeforeEcho);
      } else if (shouldFollowOutput) {
        scheduleTerminalScrollToBottom(el);
      }
    },
    onOpen: () => {
      tab.classList.add("connected");
      tab.classList.remove("closed", "error");
    },
    onClose: () => {
      tab.classList.remove("connected");
      tab.classList.add("closed");
    },
    onError: () => {
      tab.classList.remove("connected");
      tab.classList.add("error");
    }
  });

  session = { id, name, role: options.role || "shell", command: options.command || null, panel, header, headerTitle, headerCommand, collapseButton, closeButton, el, tab, label, term, transport, outputBuffer: "", codexReady: false, codexReadyWaiters: [] };
  terminalSessions.set(name, session);
  await term.init();
  transport.connect();
  workspace.classList.add("terminal-active");
  setTerminalCollapsed(name, Boolean(options.collapsed));
  updateTerminalCloseButtons();
  return session;
}

function recordTerminalOutput(session, data) {
  if (!session) return;
  session.outputBuffer = `${session.outputBuffer || ""}${String(data)}`.slice(-20000);
  scheduleAgentWikiRefresh(session);
  if (!shouldWaitForCodexReady(session) || session.codexReady || !codexReadyFromOutput(session.outputBuffer)) return;
  session.codexReady = true;
  const waiters = session.codexReadyWaiters || [];
  session.codexReadyWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function scheduleAgentWikiRefresh(session) {
  if (session.name !== "agent" || workspace.classList.contains("projects-mode")) return;
  clearTimeout(agentWikiRefreshTimer);
  agentWikiRefreshTimer = setTimeout(() => {
    if (wikiFrame.hidden) return;
    const path = displayWikiPath(requestedWikiPath);
    if (!isWikiPath(path)) return;
    wikiFrame.setAttribute("src", `${path}?agentRefresh=${Date.now()}`);
  }, 1500);
}

function shouldWaitForCodexReady(session) {
  return session?.role === "agent" && /\bcodex\b/.test(String(session.command || ""));
}

function codexReadyFromOutput(output) {
  const clean = stripTerminalControl(String(output || ""));
  const bannerIndex = clean.lastIndexOf("OpenAI Codex");
  if (bannerIndex === -1) return false;
  return clean.slice(bannerIndex).includes("›");
}

function stripTerminalControl(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "");
}

function normalizeTerminalInput(data) {
  if (data === "\x1b\x1b[D") return "\x1bb";
  if (data === "\x1b\x1b[C") return "\x1bf";
  return data;
}

function activateTerminal(name) {
  activeTerminalName = name;
  terminalSessions.forEach((session, sessionName) => {
    const active = sessionName === name;
    session.panel.classList.toggle("active", active);
    session.el.classList.toggle("active", active);
    session.tab.classList.toggle("active", active);
    session.tab.setAttribute("aria-selected", String(active));
  });
  const session = terminalSessions.get(name);
  if (session) {
    requestAnimationFrame(() => {
      session.term.focus();
      scrollTerminalToBottom(session.el);
    });
  }
}

function toggleTerminalCollapsed(name) {
  const session = terminalSessions.get(name);
  if (!session) return;
  setTerminalCollapsed(name, !session.panel.classList.contains("collapsed"));
}

function setTerminalCollapsed(name, collapsed) {
  const session = terminalSessions.get(name);
  if (!session) return;
  session.panel.classList.toggle("collapsed", collapsed);
  session.collapseButton.textContent = collapsed ? "expand" : "collapse";
  session.collapseButton.setAttribute("aria-expanded", String(!collapsed));
}

function terminalCommandLabel(options = {}) {
  if (options.command) return String(options.command);
  return options.role === "shell" || !options.role ? "interactive shell" : String(options.role);
}

async function handleTerminalDrop(event, name, transport) {
  activateTerminal(name);
  const droppedPaths = filePathsFromDropText(event.dataTransfer);
  const droppedFiles = [...event.dataTransfer.files];
  const savedPaths = droppedFiles.length > 0
    ? await saveDroppedFiles(droppedFiles)
    : [];
  const paths = [...droppedPaths, ...savedPaths];
  if (paths.length === 0) {
    return;
  }
  transport?.send(paths.map(shellQuote).join(" "));
}

function filePathsFromDropText(dataTransfer) {
  const uriList = dataTransfer.getData("text/uri-list");
  return uriList
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => line.startsWith("file://"))
    .map((line) => decodeURIComponent(new URL(line).pathname));
}

async function saveDroppedFiles(files) {
  const payload = {
    files: await Promise.all(files.map(async (file) => ({
      name: file.name,
      type: file.type,
      content: await fileToBase64(file)
    })))
  };
  const result = await api(projectPath("/api/terminal/drop"), {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.files.map((file) => file.path);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function scheduleTerminalScrollToBottom(el) {
  for (const delay of [0, 32, 96, 180, 320]) {
    setTimeout(() => scrollTerminalToBottom(el), delay);
  }
}

function scheduleTerminalScrollRestore(el, scrollTop) {
  for (const delay of [0, 32, 96]) {
    setTimeout(() => {
      el.scrollTop = scrollTop;
    }, delay);
  }
}

function scrollTerminalToBottom(el) {
  const maxScroll = el.scrollHeight - el.clientHeight;
  if (maxScroll > 0) {
    el.scrollTop = maxScroll;
  }
}

function isTerminalNearBottom(el) {
  const rowHeight = Number.parseFloat(getComputedStyle(el).getPropertyValue("--term-row-height")) || 17;
  return el.scrollHeight - el.clientHeight - el.scrollTop < rowHeight * 2;
}

function isRecentLocalEcho(lastLocalInputAt, lastLocalInputWasEnter) {
  return !lastLocalInputWasEnter && performance.now() - lastLocalInputAt < 1000;
}

function isRecentLocalInput(lastLocalInputAt) {
  return performance.now() - lastLocalInputAt < 1000;
}

function closeTerminal(name) {
  const session = terminalSessions.get(name);
  if (!session) return;
  session.transport.close();
  session.term.destroy();
  session.panel.remove();
  session.tab.remove();
  terminalSessions.delete(name);
  if (activeTerminalName === name) {
    const [nextName] = terminalSessions.keys();
    activeTerminalName = null;
    if (nextName) activateTerminal(nextName);
  }
  updatePlanPromptVisibility();
  updateTerminalCloseButtons();
  workspace.classList.toggle("terminal-active", terminalSessions.size > 0);
  void api(projectPath(`/api/sessions/${session.id}`), { method: "DELETE" });
}

function updateTerminalCloseButtons() {
  terminalSessions.forEach((session) => {
    session.closeButton.disabled = false;
    session.closeButton.title = "Close terminal";
  });
}

function closeAllTerminals() {
  for (const name of [...terminalSessions.keys()]) {
    const session = terminalSessions.get(name);
    session?.transport.close();
    session?.term.destroy();
    session?.panel.remove();
    session?.tab.remove();
    terminalSessions.delete(name);
  }
  updatePlanPromptVisibility();
  activeTerminalName = null;
  workspace.classList.remove("terminal-active");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

function projectPath(path) {
  const params = activeProjectId
    ? { project: activeProjectId }
    : activeProjectSlug
      ? { projectSlug: activeProjectSlug }
      : null;
  if (!params) return path;
  if (activeWorktreeSlug) {
    params.worktreeSlug = activeWorktreeSlug;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${new URLSearchParams(params).toString()}`;
}

function workspaceSlugs() {
  const match = location.pathname.match(/^\/workspace\/([^/]+)(?:\/([^/]+))?\/?$/);
  return {
    projectSlug: match ? decodeURIComponent(match[1]) : null,
    worktreeSlug: match?.[2] ? decodeURIComponent(match[2]) : null
  };
}

function workspacePath(project) {
  return `/workspace/${encodeURIComponent(project.projectSlug)}/${encodeURIComponent(project.worktreeSlug)}`;
}

function currentWorkspacePath() {
  if (activeProjectSlug && activeWorktreeSlug) {
    return `/workspace/${encodeURIComponent(activeProjectSlug)}/${encodeURIComponent(activeWorktreeSlug)}`;
  }
  return "/workspace/";
}

function prettyWorkspacePath(pathname) {
  return /^\/workspace\/[^/]+\/[^/]+\/?$/.test(pathname);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
