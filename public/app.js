import { WTerm, WebSocketTransport } from "/vendor/@wterm/dom/dist/index.js";

const wikiFrame = document.getElementById("wiki-frame");
const wikiNav = document.getElementById("wiki-nav");
const currentPage = document.getElementById("current-page");
const openPage = document.getElementById("open-page");
const terminals = document.getElementById("terminals");
const terminalTabs = document.getElementById("terminal-tabs");
const newAgentTerminalButton = document.getElementById("new-agent-terminal");
const newCliTerminalButton = document.getElementById("new-cli-terminal");
const repoBranch = document.getElementById("repo-branch");
const dashboardButton = document.getElementById("dashboard-button");
const dashboardPage = document.getElementById("dashboard-page");
const dashboardIdeas = document.getElementById("dashboard-ideas");
const dashboardProjects = document.getElementById("dashboard-projects");
const dashboardStatus = document.getElementById("dashboard-status");
const newIdeaToggle = document.getElementById("new-idea-toggle");
const newProjectToggle = document.getElementById("new-project-toggle");
const ideaImportForm = document.getElementById("idea-import-form");
const ideaTitleInput = document.getElementById("idea-title");
const ideaMarkdownInput = document.getElementById("idea-markdown");
const ideaMarkdownFile = document.getElementById("idea-markdown-file");
const projectImportForm = document.getElementById("project-import-form");
const projectTitleInput = document.getElementById("project-title");
const projectMarkdownInput = document.getElementById("project-markdown");
const projectMarkdownFile = document.getElementById("project-markdown-file");
const upNextButton = document.getElementById("up-next-button");
const upNextPopover = document.getElementById("up-next-popover");
const settingsButton = document.getElementById("settings-button");
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
const themePreset = document.getElementById("theme-preset");
const themeMode = document.getElementById("theme-mode");
const themePrimary = document.getElementById("theme-primary");
const themeSecondary = document.getElementById("theme-secondary");
const themeSecondaryToggle = document.getElementById("theme-secondary-toggle");
const themeSecondaryClear = document.getElementById("theme-secondary-clear");
const themeTerminalMode = document.getElementById("theme-terminal-mode");
const themeTerminalFont = document.getElementById("theme-terminal-font");
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
const terminalSessions = new Map();
const wikiPageTitles = new Map();
let agentTerminalCount = 0;
let cliTerminalCount = 0;
let requestedWikiPath = "/wiki/index.html";
let activeTerminalName = null;
let guardrails = null;
let terminalLayout = [];
let activeProjectId = new URLSearchParams(location.search).get("project");
let activeProjectSlug = workspaceSlugs().projectSlug;
let activeWorktreeSlug = workspaceSlugs().worktreeSlug;
let currentPlanPath = "/wiki/plans/index.html";
let dashboardAgentActive = false;
let settingsState = null;
let themeDraft = null;
let themeDraftSimple = null;
let agentDraft = null;
let agentsFileDraft = "";

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
    fontTokens: []
  }
];

const fontOptions = [
  { label: "Sometype Mono", value: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "" },
  { label: "Instrument Serif", value: "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif", google: "" },
  { label: "Inter", value: "\"Inter\", ui-sans-serif, system-ui, sans-serif", google: "Inter:wght@400;500;600;700" },
  { label: "IBM Plex Sans", value: "\"IBM Plex Sans\", ui-sans-serif, system-ui, sans-serif", google: "IBM+Plex+Sans:wght@400;500;600;700" },
  { label: "IBM Plex Mono", value: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "IBM+Plex+Mono:wght@400;500;600;700" },
  { label: "Newsreader", value: "\"Newsreader\", ui-serif, Georgia, serif", google: "Newsreader:wght@400;600;700" },
  { label: "Source Serif 4", value: "\"Source Serif 4\", ui-serif, Georgia, serif", google: "Source+Serif+4:wght@400;600;700" },
  { label: "Space Mono", value: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", google: "Space+Mono:wght@400;700" }
];

window.addEventListener("hashchange", () => {
  activateWorkspaceLocation(workspaceLocation());
});

wikiFrame.addEventListener("load", () => {
  syncFrameLocation();
});

await loadProjects();
await loadDashboard();
await loadSettings();
await loadRepoContext();
await loadWikiNav();
await loadWorkspaceSummary();
await loadGuardrails();
activateWorkspaceLocation(workspaceLocation() || currentPlanPath);
await restoreTerminals();
activateDefaultTerminal();

newAgentTerminalButton.addEventListener("click", async () => {
  const template = terminalTemplate("agent");
  const name = nextTerminalName("agent");
  await createTerminal(name, { ...template, name });
  activateTerminal(name);
});

newCliTerminalButton.addEventListener("click", async () => {
  const template = terminalTemplate("cli");
  const name = nextTerminalName("cli");
  await createTerminal(name, { ...template, name });
  activateTerminal(name);
});

planPromptInput.addEventListener("input", resizePlanPromptInput);
resizePlanPromptInput();

planPrompt.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = planPromptInput.value.trim();
  if (!prompt) return;
  planPromptStatus.textContent = "Sending...";
  try {
    await api(projectPath("/api/agent/prompt"), {
      method: "POST",
      body: JSON.stringify({
        prompt,
        currentPage: currentPage.title || requestedWikiPath
      })
    });
    planPromptInput.value = "";
    resizePlanPromptInput();
    planPromptStatus.textContent = "Sent to agent.";
    activateTerminal("agent");
  } catch (error) {
    planPromptStatus.textContent = error.message || "Agent unavailable.";
  }
});

function resizePlanPromptInput() {
  planPromptInput.style.height = "auto";
  const styles = window.getComputedStyle(planPromptInput);
  const maxLines = Number.parseInt(styles.getPropertyValue("--plan-prompt-max-lines"), 10);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const verticalBorder = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
  const maxHeight = maxLines * lineHeight + verticalPadding + verticalBorder;
  const nextHeight = Math.min(planPromptInput.scrollHeight, maxHeight);
  planPromptInput.style.height = `${nextHeight}px`;
  planPromptInput.style.overflowY = planPromptInput.scrollHeight > nextHeight ? "auto" : "hidden";
}

projectToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setTopbarPanelOpen("projects", projectPanel.hidden);
});

dashboardButton.addEventListener("click", async (event) => {
  event.stopPropagation();
  showDashboardPage();
});

upNextButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setTopbarPanelOpen("up-next", upNextPopover.hidden);
});

settingsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  void showSettingsPage();
});

projectPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

upNextPopover.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", () => {
  closeTopbarPanels();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarPanels();
  }
});

ideaMarkdownFile.addEventListener("change", () => {
  void importMarkdownFile(ideaMarkdownFile, ideaMarkdownInput, ideaTitleInput);
});

projectMarkdownFile.addEventListener("change", () => {
  void importMarkdownFile(projectMarkdownFile, projectMarkdownInput, projectTitleInput);
});

newIdeaToggle.addEventListener("click", () => {
  toggleDashboardForm(ideaImportForm, newIdeaToggle);
});

newProjectToggle.addEventListener("click", () => {
  toggleDashboardForm(projectImportForm, newProjectToggle);
});

ideaImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handOffIdeaMarkdown();
});

projectImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createProjectFromMarkdown();
});

themePreset.addEventListener("change", () => {
  if (!settingsState || !themeDraft) return;
  themeDraft.activePreset = themePreset.value;
  themeDraft.customTokens = {};
  themeDraftSimple = simpleThemeFromTokens(themeDraft.presets?.[themeDraft.activePreset]);
  renderThemeEditor();
  applyThemePreview(effectiveTheme({ theme: themeDraft }));
});

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
themeTerminalFont.addEventListener("change", updateThemeDraftFromSimpleControls);
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
  const [sessionData, layout] = await Promise.all([api(projectPath("/api/sessions")), api(projectPath("/api/layout"))]);
  terminalLayout = layout.panels;
  const layoutNames = new Set(layout.panels.map((panel) => panel.name));
  const reconnectable = sessionData.sessions
    .filter((session) => session.status !== "closed" && session.reconnectable && session.retained && layoutNames.has(session.name))
    .slice(-5);
  const panels = [...layout.panels, ...reconnectable];
  const seen = new Set();
  for (const panel of panels) {
    if (seen.has(panel.name)) continue;
    seen.add(panel.name);
    await createTerminal(panel.name, panel);
  }
  if (!terminalSessions.has("cli")) {
    await createTerminal("cli", { role: "shell", command: null });
  }
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
    wikiPageTitles.clear();
    data.pages.forEach((page) => {
      wikiPageTitles.set(page.path, cleanPageTitle(page));
      wikiPageTitles.set(displayWikiPath(page.path), cleanPageTitle(page));
    });
    currentPlanPath = data.pages.find((page) => page.path.endsWith("/wiki/plans/index.html"))?.path || currentPlanPath;
    wikiNav.replaceChildren(...groupWikiPages(data.pages));
  } catch {
    document.getElementById("server-status").textContent = "Offline";
  }
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
  const currentStageLink = wikiNav.querySelector("a.current-stage");
  const currentUnitLink = wikiNav.querySelector("a.current-unit");
  const navStage = currentStageLink?.querySelector(".wiki-nav-label")?.textContent?.trim() || "";
  const navUnit = currentUnitLink?.querySelector(".wiki-nav-label")?.textContent?.trim() || "";
  const navUnitPath = currentUnitLink?.dataset.path || "";
  const current = status.current || "";
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

async function showDashboardPage(options = {}) {
  closeTopbarPanels();
  await loadDashboard();
  settingsPage.hidden = true;
  dashboardPage.hidden = false;
  wikiFrame.hidden = true;
  planPrompt.hidden = true;
  dashboardButton.classList.add("active");
  settingsButton.classList.remove("active");
  workspace.classList.add("dashboard-mode");
  workspace.classList.remove("settings-mode");
  workspace.classList.toggle("dashboard-agent-active", dashboardAgentActive);
  currentPage.textContent = "Dashboard";
  currentPage.title = "/dashboard";
  openPage.href = "/dashboard";
  wikiNav.querySelectorAll("a").forEach((link) => link.classList.remove("active"));
  if (`${location.pathname}${location.hash}` !== "/dashboard") {
    const method = options.replace ? "replaceState" : "pushState";
    history[method](null, "", "/dashboard");
  }
}

async function showSettingsPage(options = {}) {
  closeTopbarPanels();
  await loadSettings();
  dashboardPage.hidden = true;
  settingsPage.hidden = false;
  wikiFrame.hidden = true;
  planPrompt.hidden = true;
  dashboardButton.classList.remove("active");
  settingsButton.classList.add("active");
  workspace.classList.remove("dashboard-mode", "dashboard-agent-active");
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

function hideDashboardPage() {
  dashboardPage.hidden = true;
  settingsPage.hidden = true;
  wikiFrame.hidden = false;
  dashboardButton.classList.remove("active");
  settingsButton.classList.remove("active");
  workspace.classList.remove("dashboard-mode", "dashboard-agent-active", "settings-mode");
  dashboardAgentActive = false;
  updatePlanPromptVisibility();
}

function activateWorkspaceLocation(path) {
  if (isDashboardPath(path)) {
    void showDashboardPage({ replace: true });
    return;
  }
  if (isSettingsPath(path)) {
    void showSettingsPage({ replace: true });
    return;
  }
  hideDashboardPage();
  activateWikiPage(path);
}

function isDashboardPath(path) {
  return path === "/dashboard" || path === "dashboard";
}

function isSettingsPath(path) {
  return path === "/settings" || path === "settings";
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
  if (activeProject && !prettyWorkspacePath(location.pathname) && location.pathname !== "/dashboard" && location.pathname !== "/settings") {
    history.replaceState(null, "", `${workspacePath(activeProject)}${location.hash}`);
  }
  if (data.projects.length <= 1) {
    projectToggle.hidden = true;
    projectPanel.hidden = true;
    workspace.classList.remove("has-projects");
    projectToggle.setAttribute("aria-expanded", "false");
    return;
  }
  projectToggle.hidden = false;
  workspace.classList.add("has-projects");
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

async function loadDashboard() {
  const [ideasResult, projectsResult] = await Promise.allSettled([
    api(projectPath("/api/ideas")),
    api(projectPath("/api/projects"))
  ]);
  if (ideasResult.status === "fulfilled") {
    renderDashboardIdeas(ideasResult.value.ideas || []);
  } else {
    dashboardIdeas.replaceChildren(emptyDashboardItem("No ideas added yet..."));
  }
  if (projectsResult.status === "fulfilled") {
    renderDashboardProjects(projectsResult.value.projects || []);
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
      dd.textContent = fontLabelForValue(tokens[token]);
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
  themeEditor.hidden = true;
  settingsLayout.hidden = false;
  settingsPage.classList.remove("theme-editing");
  clearThemePreview();
}

function renderThemeEditor() {
  const presets = themeDraft?.presets || {};
  themePreset.replaceChildren(...Object.entries(presets).map(([value, preset]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = preset.label || value;
    return option;
  }));
  themePreset.value = themeDraft?.activePreset || "paper";
  const theme = effectiveTheme({ theme: themeDraft });
  renderTerminalFontOptions();
  syncSimpleControls();
  themeControls.replaceChildren(...themeSurfaces.map((surface) => themeFontSection(surface, theme.tokens[surface.key] || {})).filter(Boolean));
  themeJson.value = JSON.stringify(themeDraft || {}, null, 2);
  loadGoogleFontsForTheme(theme);
}

function renderTerminalFontOptions() {
  themeTerminalFont.replaceChildren(...fontOptions
    .filter((font) => font.value.includes("mono"))
    .map((font) => {
      const option = document.createElement("option");
      option.value = font.value;
      option.textContent = font.label;
      return option;
    }));
}

function themeFontSection(surface, tokens) {
  if (surface.fontTokens.length === 0) return null;
  const section = document.createElement("section");
  section.className = "theme-control-section";
  const heading = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = surface.label;
  const description = document.createElement("span");
  description.textContent = surface.description;
  heading.append(title, description);
  const fonts = document.createElement("div");
  fonts.className = "theme-font-grid";
  surface.fontTokens.forEach((token) => {
    fonts.append(fontControl(surface.key, token, tokens[token]));
  });
  section.append(heading, fonts);
  return section;
}

function fontControl(surface, token, value) {
  const label = document.createElement("label");
  label.className = "settings-field";
  const name = document.createElement("span");
  name.textContent = readableTokenName(token);
  const select = document.createElement("select");
  fontOptions.forEach((font) => {
    const option = document.createElement("option");
    option.value = font.value;
    option.textContent = font.label;
    select.append(option);
  });
  select.value = fontOptions.some((font) => font.value === value) ? value : fontOptions[0].value;
  select.addEventListener("change", () => {
    setThemeDraftToken(surface, token, select.value);
  });
  label.append(name, select);
  return label;
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
  const theme = effectiveTheme({ theme: themeDraft });
  themeJson.value = JSON.stringify(themeDraft, null, 2);
  applyThemePreview(theme);
  loadGoogleFontsForTheme(theme);
}

function updateThemeDraftFromSimpleControls() {
  if (!themeDraft) return;
  themeDraftSimple = {
    mode: themeMode.value === "dark" ? "dark" : "light",
    primary: themePrimary.value,
    secondary: themeDraftSimple?.secondary === "" ? "" : normalizeColorOrEmpty(themeSecondary.value),
    terminalMode: ["light", "dark"].includes(themeTerminalMode.value) ? themeTerminalMode.value : "match",
    terminalFont: themeTerminalFont.value || defaultTerminalFont(),
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
  themeSecondaryToggle.style.setProperty("--secondary-color", normalizeColor(themeDraftSimple.secondary || derivedSecondary));
  themeSecondaryClear.hidden = !hasSecondary;
  themeTerminalMode.value = themeDraftSimple.terminalMode || "match";
  themeTerminalFont.value = fontOptions.some((font) => font.value === themeDraftSimple.terminalFont)
    ? themeDraftSimple.terminalFont
    : defaultTerminalFont();
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
  return fontOptions.find((font) => font.label === "Sometype Mono")?.value || fontOptions[0].value;
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

function renderDashboardIdeas(ideas) {
  if (ideas.length === 0) {
    dashboardIdeas.replaceChildren(emptyDashboardItem("No ideas added yet..."));
    return;
  }
  dashboardIdeas.replaceChildren(...ideas.map((idea) => {
    const item = document.createElement("article");
    item.className = "dashboard-item";
    const link = document.createElement("a");
    link.href = `#${idea.path}`;
    link.textContent = idea.title;
    link.addEventListener("click", closeTopbarPanels);
    const summary = document.createElement("p");
    summary.textContent = idea.summary || "Free-form idea";
    item.append(link, summary);
    if (idea.promoted) {
      const badge = document.createElement("span");
      badge.className = "dashboard-badge";
      badge.textContent = "Promoted";
      item.append(badge);
    } else {
      item.append(promoteIdeaButton(idea.path, idea.title, idea.targetRoot));
    }
    return item;
  }));
}

function renderDashboardProjects(projects) {
  if (projects.length === 0) {
    dashboardProjects.replaceChildren(emptyDashboardItem("No projects added yet..."));
    return;
  }
  dashboardProjects.replaceChildren(...projects.map((project) => {
    const item = document.createElement("article");
    item.className = "dashboard-item";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = project.name;
    button.disabled = !project.available;
    button.title = project.available ? project.root : `${project.root} unavailable`;
    button.addEventListener("click", () => switchProject(project));
    const meta = document.createElement("p");
    meta.textContent = project.available ? project.root : "Unavailable";
    item.append(button, meta);
    return item;
  }));
}

function emptyDashboardItem(text) {
  const item = document.createElement("p");
  item.className = "dashboard-empty";
  item.textContent = text;
  return item;
}

function toggleDashboardForm(form, button) {
  const open = form.hidden;
  form.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) {
    const firstInput = form.querySelector("input, textarea");
    requestAnimationFrame(() => firstInput?.focus());
  }
}

function promoteIdeaButton(ideaPath, title, targetRoot = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "promote-idea-button";
  button.textContent = "Initialize as project";
  button.addEventListener("click", async () => {
    await promoteIdea(ideaPath, title, button, targetRoot);
  });
  return button;
}

async function promoteIdea(ideaPath, title, button, targetRoot = "") {
  const projectName = title || "this idea";
  const target = targetRoot || await targetRootForIdea(ideaPath);
  const targetLine = target ? `\n\nTarget: ${target}` : "";
  if (!window.confirm(`Initialize "${projectName}" as a hyperwiki project?${targetLine}`)) {
    return;
  }
  button.disabled = true;
  button.textContent = "Initializing...";
  try {
    const result = await api(projectPath("/api/ideas/promote"), {
      method: "POST",
      body: JSON.stringify({ ideaPath })
    });
    await loadProjects();
    await loadDashboard();
    await loadWikiNav();
    if (result.workspaceUrl) {
      history.pushState(null, "", `${result.workspaceUrl}#/wiki/plans/index.html`);
      location.reload();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = "Initialize as project";
    window.alert(error.message || "Could not initialize project.");
  }
}

async function targetRootForIdea(ideaPath) {
  try {
    const data = await api(projectPath("/api/ideas"));
    const idea = (data.ideas || []).find((item) => displayWikiPath(item.path) === displayWikiPath(ideaPath));
    return idea?.targetRoot || "";
  } catch {
    return "";
  }
}

async function importMarkdownFile(fileInput, markdownInput, titleInput) {
  const [file] = fileInput.files || [];
  if (!file) return;
  const text = await file.text();
  markdownInput.value = text;
  if (!titleInput.value.trim()) {
    titleInput.value = titleFromMarkdown(text) || titleFromFilename(file.name);
  }
}

async function handOffIdeaMarkdown() {
  const title = ideaTitleInput.value.trim();
  const markdown = ideaMarkdownInput.value.trim();
  if (!title || !markdown) return;
  try {
    setDashboardStatus("Starting agent for idea import...");
    const slug = slugify(title);
    const prompt = [
      "Create a new hyperwiki idea page from this markdown.",
      "",
      `Title: ${title}`,
      `Required output path: wiki/ideas/${slug}.html`,
      "",
      "Instructions:",
      "- Read wiki/index.html and wiki/sources/design-brief.html before writing.",
      "- Create a unique HTML idea page under wiki/ideas/ using the existing wiki page structure and styling.",
      "- Preserve the user's intent from the markdown, but shape it into a useful durable idea page.",
      "- If the markdown is ambiguous enough that a Q&A would materially improve the page, ask concise questions in this terminal before writing.",
      "- Do not initialize this idea as a project yet; the idea page should keep its own Initialize as project action.",
      "- After writing, run the relevant hyperwiki checks and summarize the created path.",
      "",
      "Markdown:",
      "```markdown",
      markdown,
      "```"
    ].join("\n");
    await handOffDashboardPrompt(prompt, "/dashboard");
    setDashboardStatus(`Agent started for wiki/ideas/${slug}.html`);
  } catch (error) {
    setDashboardStatus(error.message || "Could not start the agent.");
  }
}

async function createProjectFromMarkdown() {
  const title = projectTitleInput.value.trim();
  const markdown = projectMarkdownInput.value.trim();
  if (!title || !markdown) return;
  try {
    setDashboardStatus("Initializing project...");
    const result = await api(projectPath("/api/projects/create"), {
      method: "POST",
      body: JSON.stringify({ title, summary: markdownSummary(markdown) })
    });
    closeAllTerminals();
    activeProjectId = result.project.id;
    activeProjectSlug = result.project.projectSlug;
    activeWorktreeSlug = result.project.worktreeSlug;
    history.pushState(null, "", "/dashboard");
    await loadProjects();
    await loadDashboard();
    await loadRepoContext();
    await loadWikiNav();
    await loadWorkspaceSummary();
    await loadGuardrails();
    await showDashboardPage({ replace: true });
    setDashboardStatus("Starting agent in the new project...");
    const prompt = [
      "Turn this markdown into the initial hyperwiki project pages.",
      "",
      `Project: ${title}`,
      `Repo root: ${result.project.root}`,
      "",
      "Instructions:",
      "- Read AGENTS.md, wiki/index.html, wiki/sources.html, wiki/sources/prd.html, wiki/sources/technical-brief.html, and wiki/sources/design-brief.html before writing.",
      "- Update the project wiki pages as if the user had typed this brief directly to you.",
      "- Create or revise source briefs, roadmap, and planning pages only where the markdown supports durable project context.",
      "- Ask concise Q&A in this terminal if the markdown lacks critical product, technical, or validation decisions.",
      "- Keep the project locally grounded and run relevant hyperwiki checks before finishing.",
      "",
      "Markdown:",
      "```markdown",
      markdown,
      "```"
    ].join("\n");
    await handOffDashboardPrompt(prompt, "/dashboard");
    setDashboardStatus(`Agent started in ${result.project.name}`);
  } catch (error) {
    setDashboardStatus(error.message || "Could not create the project.");
  }
}

async function handOffDashboardPrompt(prompt, currentPagePath) {
  dashboardAgentActive = true;
  workspace.classList.add("dashboard-agent-active");
  const agent = await ensureAgentTerminal();
  activateTerminal(agent.name);
  await postAgentPromptWithRetry(prompt, currentPagePath);
}

async function ensureAgentTerminal() {
  if (terminalSessions.has("agent")) {
    return terminalSessions.get("agent");
  }
  const template = terminalTemplate("agent");
  const session = await createTerminal("agent", { ...template, name: "agent", role: "agent" });
  updatePlanPromptVisibility();
  return session;
}

async function postAgentPromptWithRetry(prompt, currentPagePath) {
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

function setDashboardStatus(message) {
  dashboardStatus.textContent = message;
}

function titleFromMarkdown(markdown) {
  const heading = String(markdown).match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : "";
}

function titleFromFilename(name) {
  return String(name || "")
    .replace(/\.(md|markdown|txt)$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function markdownSummary(markdown) {
  const paragraph = String(markdown)
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^#+\s+/gm, "").trim())
    .find(Boolean) || "Imported from Dashboard markdown.";
  return paragraph.length > 220 ? `${paragraph.slice(0, 217).trim()}...` : paragraph;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "idea";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function switchProject(project) {
  if (project.id === activeProjectId) return;
  closeAllTerminals();
  activeProjectId = project.id;
  activeProjectSlug = project.projectSlug;
  activeWorktreeSlug = project.worktreeSlug;
  history.pushState(null, "", `${workspacePath(project)}#/wiki/index.html`);
  requestedWikiPath = "/wiki/index.html";
  await loadProjects();
  await loadDashboard();
  await loadRepoContext();
  await loadWikiNav();
  await loadWorkspaceSummary();
  await loadGuardrails();
  activateWikiPage(currentPlanPath);
  await restoreTerminals();
  activateDefaultTerminal();
}

function activateDefaultTerminal() {
  for (const name of ["agent", "dev", "cli", "shell"]) {
    if (terminalSessions.has(name)) {
      activateTerminal(name);
      return;
    }
  }
}

function updatePlanPromptVisibility() {
  planPrompt.hidden = workspace.classList.contains("dashboard-mode") || workspace.classList.contains("settings-mode") || !terminalSessions.has("agent");
}

function terminalTemplate(name) {
  const template = terminalLayout.find((panel) => panel.name === name || panel.role === name);
  if (template) return template;
  if (name === "agent") return { role: "agent", command: null };
  return { role: "shell", command: null };
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
  const topLevel = sorted.filter((page) => isTopLevelPlanPage(page));
  for (const page of topLevel) {
    section.append(renderPlanNode(page, sorted));
  }
  return section;
}

function renderPlanNode(page, pages) {
  const children = childPlanPages(page, pages);
  const state = currentPlanState(page);
  if (children.length === 0) {
    return renderWikiLink(page, state);
  }
  const group = document.createElement("details");
  group.className = `wiki-nav-group plan-subtree${state ? ` ${state}` : ""}`;
  group.dataset.path = displayWikiPath(page.path);
  group.open = state || children.some((child) => currentPlanState(child) || hasCurrentDescendant(child, pages));
  const summary = document.createElement("summary");
  summary.append(renderWikiLink(page, state));
  group.append(summary, ...children.map((child) => renderPlanNode(child, pages)));
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
      && !candidatePath.endsWith("/index.html")
      && !completedPlanHasChildDirectory(candidatePath, pages);
  }
  const parentBase = parentPath.replace(/\.html$/, "");
  return candidatePath.startsWith(`${parentBase}/`) && !candidatePath.slice(parentBase.length + 1).includes("/");
}

function completedPlanHasChildDirectory(planPath, pages) {
  const planBase = planPath.replace(/\.html$/, "");
  return pages.some((page) => displayWikiPath(page.path).startsWith(`${planBase}/`));
}

function planSortKey(page) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return "01";
  if (path.startsWith("/wiki/plans/mvp/stage-")) return `01-${path}`;
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return "99";
  if (path.startsWith("/wiki/plans/zzz_completed/")) return `99-${path}`;
  return `02-${path}`;
}

function currentPlanState(page) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return "current-plan";
  if (path.endsWith("/wiki/plans/mvp/stage-08-settings-soul-memory.html")) return "current-stage";
  if (path.endsWith("/wiki/plans/mvp/stage-08-settings-soul-memory/unit-01-global-settings-page.html")) return "current-unit";
  return "";
}

function hasCurrentDescendant(page, pages) {
  return childPlanPages(page, pages).some((child) => currentPlanState(child) || hasCurrentDescendant(child, pages));
}

function renderWikiLink(page, state = "") {
  const link = document.createElement("a");
  link.href = `#${page.path}`;
  const label = cleanPageTitle(page);
  const labelElement = document.createElement("span");
  labelElement.className = "wiki-nav-label";
  labelElement.textContent = label;
  link.append(labelElement);
  link.title = label;
  link.dataset.path = displayWikiPath(page.path);
  if (state) {
    link.classList.add(state);
  }
  link.addEventListener("click", closeTopbarPanels);
  return link;
}

function cleanPageTitle(page) {
  if (page.path.endsWith("/wiki/plans/index.html")) return "Planning Dashboard";
  if (page.path.endsWith("/wiki/plans/mvp/index.html")) return "MVP Plan";
  if (page.path.endsWith("/wiki/plans/zzz_completed/index.html")) return "Completed Plans";
  if (isUnitPage(page)) return page.title.replace(/^Unit (\d+) - /, "Unit $1 · ");
  if (page.path.includes("/stage-")) return page.title.replace(/^Stage (\d+) - /, "Stage-$1 ");
  if (page.title.toLowerCase() === "prd") return "PRD";
  if (displayWikiPath(page.path).includes("/wiki/plans/")) return page.title.replace(/\s+Plan$/, "");
  return page.title;
}

function activateWikiPage(path) {
  const nextPath = normalizeWikiPath(path);
  requestedWikiPath = nextPath;
  if (wikiFrame.getAttribute("src") !== nextPath) {
    wikiFrame.setAttribute("src", nextPath);
  }
  currentPage.textContent = titleForWikiPath(nextPath);
  currentPage.title = nextPath;
  openPage.href = nextPath;
  wikiNav.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.dataset.path === displayWikiPath(nextPath));
  });
  syncPlanTreeOpenState(nextPath);
  const nextUrl = `${currentWorkspacePath()}#${nextPath}`;
  if (location.pathname === "/dashboard" || `${location.pathname}${location.hash}` !== nextUrl) {
    history.replaceState(null, "", nextUrl);
  }
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
    const framePath = wikiFrame.contentWindow.location.pathname;
    hideEmbeddedWikiHeader();
    if (!isWikiPath(framePath) || framePath !== requestedWikiPath) {
      return;
    }
    currentPage.textContent = currentWikiTitle() || displayWikiPath(framePath);
    currentPage.title = framePath;
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

function hideEmbeddedWikiHeader() {
  const documentElement = wikiFrame.contentDocument;
  if (!documentElement) return;
  if (!documentElement.getElementById("hyperwiki-embedded-style")) {
    const style = documentElement.createElement("style");
    style.id = "hyperwiki-embedded-style";
    style.textContent = `
      .wiki-header { display: none !important; }
      .wiki-page { padding-top: 32px !important; }
    `;
    documentElement.head.append(style);
  }
  if (settingsState) applyWikiFrameTheme(effectiveTheme(settingsState));
  renderIdeaActionInFrame(documentElement);
}

function renderIdeaActionInFrame(documentElement) {
  const framePath = displayWikiPath(wikiFrame.contentWindow.location.pathname);
  if (!/^\/wiki\/ideas\/[^/]+\.html$/.test(framePath) || framePath.endsWith("/index.html")) {
    return;
  }
  if (documentElement.querySelector("[data-hyperwiki-promoted=\"true\"]") || documentElement.getElementById("hyperwiki-promote-idea")) {
    return;
  }
  const heading = documentElement.querySelector("main h1");
  if (!heading) return;
  const button = documentElement.createElement("button");
  button.id = "hyperwiki-promote-idea";
  button.type = "button";
  button.textContent = "Initialize as project";
  button.style.margin = "0 0 24px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid #171916";
  button.style.background = "#171916";
  button.style.color = "#fff";
  button.style.font = "13px/1.2 system-ui, sans-serif";
  button.style.cursor = "pointer";
  button.addEventListener("click", () => promoteIdea(framePath, heading.textContent.trim(), button));
  heading.insertAdjacentElement("afterend", button);
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
  if (location.pathname === "/settings") return "/settings";
  const hashPath = pageFromHash();
  if (hashPath) return hashPath;
  if (location.pathname === "/dashboard") return "/dashboard";
  return currentPlanPath;
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
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "terminal-close";
  closeButton.setAttribute("aria-label", `Close ${name} terminal`);
  closeButton.textContent = "x";
  header.append(headerTitle, headerCommand, closeButton);
  const el = document.createElement("div");
  el.className = "terminal theme-monokai";
  el.dataset.name = name;
  el.tabIndex = 0;
  panel.append(header, el);
  terminals.append(panel);
  header.addEventListener("click", () => activateTerminal(name));
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

  await term.init();
  transport.connect();

  const session = { id, name, role: options.role || "shell", command: options.command || null, panel, header, headerTitle, headerCommand, closeButton, el, tab, label, term, transport };
  terminalSessions.set(name, session);
  updateTerminalCloseButtons();
  return session;
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
  if (!session || terminalSessions.size <= 1) return;
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
  void api(projectPath(`/api/sessions/${session.id}`), { method: "DELETE" });
}

function updateTerminalCloseButtons() {
  const canClose = terminalSessions.size > 1;
  terminalSessions.forEach((session) => {
    session.closeButton.disabled = !canClose;
    session.closeButton.title = canClose ? "Close terminal" : "At least one terminal must stay open";
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
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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
