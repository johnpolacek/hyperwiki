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
const settingsPanel = document.getElementById("settings-panel");
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
let currentPlanPath = "/wiki/plans/index.html";
let dashboardAgentActive = false;

window.addEventListener("hashchange", () => {
  activateWorkspaceLocation(workspaceLocation());
});

wikiFrame.addEventListener("load", () => {
  syncFrameLocation();
});

await loadProjects();
await loadDashboard();
await loadRepoContext();
await loadWikiNav();
await loadWorkspaceSummary();
await loadGuardrails();
activateWorkspaceLocation(workspaceLocation() || currentPlanPath);
await restoreTerminals();

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
  setTopbarPanelOpen("settings", settingsPanel.hidden);
});

projectPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

upNextPopover.addEventListener("click", (event) => {
  event.stopPropagation();
});

settingsPanel.addEventListener("click", (event) => {
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

ideaMarkdownInput.addEventListener("input", () => {
  ideaMarkdownInput.dataset.documentType = "markdown";
});

projectMarkdownInput.addEventListener("input", () => {
  projectMarkdownInput.dataset.documentType = "markdown";
});

ideaMarkdownFile.addEventListener("change", () => {
  void importDocumentFile(ideaMarkdownFile, ideaMarkdownInput, ideaTitleInput)
    .then((imported) => {
      if (imported) return handOffIdeaMarkdown();
      return null;
    })
    .catch((error) => setDashboardStatus(error.message || "Could not import the document."));
});

projectMarkdownFile.addEventListener("change", () => {
  void importDocumentFile(projectMarkdownFile, projectMarkdownInput, projectTitleInput)
    .then((imported) => {
      if (imported) return createProjectFromMarkdown();
      return null;
    })
    .catch((error) => setDashboardStatus(error.message || "Could not import the document."));
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
  dashboardPage.hidden = false;
  wikiFrame.hidden = true;
  planPrompt.hidden = true;
  dashboardButton.classList.add("active");
  workspace.classList.add("dashboard-mode");
  workspace.classList.toggle("dashboard-agent-active", dashboardAgentActive);
  setCurrentPage("/dashboard", "Dashboard");
  openPage.href = "/dashboard";
  modifyPlanUi.hidden = true;
  modifyButton.setAttribute("aria-expanded", "false");
  setCommandBarCompleted(false);
  wikiNav.querySelectorAll("a").forEach((link) => link.classList.remove("active"));
  if (location.pathname !== "/dashboard") {
    const method = options.replace ? "replaceState" : "pushState";
    history[method](null, "", "/dashboard");
  }
}

function hideDashboardPage() {
  dashboardPage.hidden = true;
  wikiFrame.hidden = false;
  dashboardButton.classList.remove("active");
  workspace.classList.remove("dashboard-mode", "dashboard-agent-active");
  dashboardAgentActive = false;
  updatePlanPromptVisibility();
}

function activateWorkspaceLocation(path) {
  if (isDashboardPath(path)) {
    void showDashboardPage({ replace: true });
    return;
  }
  hideDashboardPage();
  activateWikiPage(path);
}

function isDashboardPath(path) {
  return path === "/dashboard" || path === "dashboard";
}

function setTopbarPanelOpen(panel, open) {
  const panels = {
    projects: { panel: projectPanel, button: projectToggle },
    "up-next": { panel: upNextPopover, button: upNextButton },
    settings: { panel: settingsPanel, button: settingsButton }
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
  settingsPanel.hidden = true;
  projectToggle.setAttribute("aria-expanded", "false");
  upNextButton.setAttribute("aria-expanded", "false");
  settingsButton.setAttribute("aria-expanded", "false");
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
  if (activeProject && !prettyWorkspacePath(location.pathname) && location.pathname !== "/dashboard") {
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

async function handOffIdeaMarkdown() {
  const title = ideaTitleInput.value.trim();
  const markdown = ideaMarkdownInput.value.trim();
  const documentType = ideaMarkdownInput.dataset.documentType || "markdown";
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
      "- Preserve the user's intent from the document, but shape it into a useful durable idea page.",
      "- If the document is ambiguous enough that a Q&A would materially improve the page, ask concise questions in this terminal before writing.",
      "- Do not initialize this idea as a project yet; the idea page should keep its own Initialize as project action.",
      "- After writing, run the relevant hyperwiki checks and summarize the created path.",
      "",
      `${documentContentLabel(documentType)}:`,
      `\`\`\`${documentType}`,
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
  const documentType = projectMarkdownInput.dataset.documentType || "markdown";
  if (!title || !markdown) return;
  try {
    setDashboardStatus("Initializing project...");
    const result = await api(projectPath("/api/projects/create"), {
      method: "POST",
      body: JSON.stringify({ title, summary: documentSummary(markdown, documentType) })
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
      "- Create or revise source briefs, roadmap, and planning pages only where the document supports durable project context.",
      "- Ask concise Q&A in this terminal if the document lacks critical product, technical, or validation decisions.",
      "- Keep the project locally grounded and run relevant hyperwiki checks before finishing.",
      "",
      `${documentContentLabel(documentType)}:`,
      `\`\`\`${documentType}`,
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
    .replace(/^-+|-+$/g, "") || "idea";
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
  if (project.id === activeProjectId) return;
  closeAllTerminals();
  hidePreviewLink();
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
}

function updatePlanPromptVisibility() {
  planPrompt.hidden = workspace.classList.contains("dashboard-mode") || !terminalSessions.has("agent");
}

function terminalTemplate(name) {
  const template = terminalLayout.find((panel) => panel.name === name || panel.role === name);
  if (template) return template;
  if (name === "agent") return { role: "agent", command: null };
  if (name === "dev") return { role: "dev", command: null };
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
  const completed = isCompletedPage(page);
  if (children.length === 0) {
    return renderWikiLink(page, state, { completed });
  }
  const group = document.createElement("details");
  group.className = `wiki-nav-group plan-subtree${state ? ` ${state}` : ""}${completed ? " completed-plan" : ""}`;
  group.dataset.path = displayWikiPath(page.path);
  group.open = state || children.some((child) => currentPlanState(child) || hasCurrentDescendant(child, pages));
  const summary = document.createElement("summary");
  summary.append(renderWikiLink(page, state, { completed }));
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
  if (path.endsWith("/wiki/plans/mvp/stage-07-agent-native-verification.html")) return "current-stage";
  if (path.endsWith("/wiki/plans/mvp/stage-07-agent-native-verification/unit-01-verification-loop-model.html")) return "current-unit";
  return "";
}

function hasCurrentDescendant(page, pages) {
  return childPlanPages(page, pages).some((child) => currentPlanState(child) || hasCurrentDescendant(child, pages));
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
  link.addEventListener("click", closeTopbarPanels);
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
  if (/\bstatus:\s*complete(d)?\b/i.test(summary)) return "complete";
  return "";
}

function isCompletedPage(page) {
  return pageStatus(page) === "complete";
}

function activateWikiPage(path) {
  const nextPath = normalizeWikiPath(path);
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
  const nextUrl = `${currentWorkspacePath()}#${nextPath}`;
  if (location.pathname === "/dashboard" || `${location.pathname}${location.hash}` !== nextUrl) {
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
  if (!documentElement || documentElement.getElementById("hyperwiki-embedded-style")) return;
  const style = documentElement.createElement("style");
  style.id = "hyperwiki-embedded-style";
  style.textContent = `
    .wiki-header { display: none !important; }
    .wiki-page { padding-top: 32px !important; }
    .wiki-page > h1 + p:has(a[href*="/wiki/plans/mvp/stage-"]) { display: none !important; }
  `;
  documentElement.head.append(style);
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
  if (path === "/dashboard") return [{ label: "Dashboard", path }];
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

  const session = { id, name, role: options.role || "shell", command: options.command || null, panel, header, headerTitle, headerCommand, collapseButton, closeButton, el, tab, label, term, transport };
  terminalSessions.set(name, session);
  workspace.classList.add("terminal-active");
  setTerminalCollapsed(name, Boolean(options.collapsed));
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
  workspace.classList.toggle("terminal-active", terminalSessions.size > 0);
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
  workspace.classList.remove("terminal-active");
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
