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
const upNextButton = document.getElementById("up-next-button");
const upNextPopover = document.getElementById("up-next-popover");
const settingsButton = document.getElementById("settings-button");
const settingsPanel = document.getElementById("settings-panel");
const upNextCompleted = document.getElementById("up-next-completed");
const upNextCurrent = document.getElementById("up-next-current");
const upNextNext = document.getElementById("up-next-next");
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

window.addEventListener("hashchange", () => {
  activateWikiPage(pageFromHash());
});

wikiFrame.addEventListener("load", () => {
  syncFrameLocation();
});

await loadProjects();
await loadRepoContext();
await loadWikiNav();
await loadWorkspaceSummary();
await loadGuardrails();
activateWikiPage(pageFromHash() || currentPlanPath);
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
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarPanels();
  }
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
    repoBranch.textContent = repo.git.branch || "detached";
    document.getElementById("server-status").title = repo.root;
  } catch {
    repoBranch.textContent = "Unavailable";
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
  upNextCompleted.textContent = status.completed || "No completed work found";
  upNextCurrent.textContent = status.current || "No current plan found";
  upNextNext.textContent = status.next || "No next action found";
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
  if (activeProject && !prettyWorkspacePath(location.pathname)) {
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
      button.textContent = `${project.name} · ${project.worktreeSlug || "main"}`;
      button.title = project.available ? project.root : `${project.root} unavailable`;
      button.className = project.id === activeProjectId ? "active" : "";
      button.disabled = !project.available;
      button.addEventListener("click", () => switchProject(project));
      return button;
    })
  );
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
  planPrompt.hidden = !terminalSessions.has("agent");
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
  const groups = [
    planTree,
    renderNavGroup("Project", pages.filter((page) =>
      ["/wiki/index.html", "/wiki/architecture.html", "/wiki/dev.html", "/wiki/roadmap.html"].some((suffix) => page.path.endsWith(suffix))
    ), false),
    renderNavGroup("Sources", pages.filter((page) => page.path.includes("/wiki/sources/")), false),
    renderNavGroup("Log", pages.filter((page) => page.path.endsWith("/wiki/log.html")), false)
  ];
  return groups.filter(Boolean);
}

function renderPlanTree(pages) {
  const details = document.createElement("details");
  details.className = "wiki-nav-group plan-tree";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Plans";
  details.append(summary);

  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const topLevel = sorted.filter((page) => isTopLevelPlanPage(page));
  for (const page of topLevel) {
    details.append(renderPlanNode(page, sorted));
  }
  return details;
}

function renderPlanNode(page, pages) {
  const children = childPlanPages(page, pages);
  const state = currentPlanState(page);
  if (children.length === 0) {
    return renderWikiLink(page, state);
  }
  const group = document.createElement("details");
  group.className = `wiki-nav-group plan-subtree${state ? ` ${state}` : ""}`;
  group.open = state || children.some((child) => currentPlanState(child) || hasCurrentDescendant(child, pages));
  const summary = document.createElement("summary");
  summary.append(renderWikiLink(page, state));
  group.append(summary, ...children.map((child) => renderPlanNode(child, pages)));
  return group;
}

function renderNavGroup(title, pages, open) {
  if (pages.length === 0) return null;
  const details = document.createElement("details");
  details.className = "wiki-nav-group";
  details.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.append(summary, ...pages.map(renderWikiLink));
  return details;
}

function isTopLevelPlanPage(page) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return true;
  return /^\/wiki\/plans\/[^/]+\.html$/.test(path) && !path.endsWith("/index.html");
}

function isUnitPage(page) {
  return /\/unit-\d+-[^/]+\.html$/.test(displayWikiPath(page.path));
}

function childPlanPages(parent, pages) {
  return pages.filter((candidate) => isImmediateChildPlanPage(parent, candidate));
}

function isImmediateChildPlanPage(parent, candidate) {
  const parentPath = displayWikiPath(parent.path);
  const candidatePath = displayWikiPath(candidate.path);
  if (parentPath === candidatePath) return false;
  if (parentPath.endsWith("/wiki/plans/mvp/index.html")) {
    return /^\/wiki\/plans\/mvp\/stage-[^/]+\.html$/.test(candidatePath);
  }
  const parentBase = parentPath.replace(/\.html$/, "");
  return candidatePath.startsWith(`${parentBase}/`) && !candidatePath.slice(parentBase.length + 1).includes("/");
}

function planSortKey(page) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return "01";
  if (path.startsWith("/wiki/plans/mvp/stage-")) return `01-${path}`;
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
  if (location.hash !== `#${nextPath}`) {
    history.replaceState(null, "", `#${nextPath}`);
  }
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
  if (!documentElement || documentElement.getElementById("hyperwiki-embedded-style")) return;
  const style = documentElement.createElement("style");
  style.id = "hyperwiki-embedded-style";
  style.textContent = `
    .wiki-header { display: none !important; }
    .wiki-page { padding-top: 32px !important; }
  `;
  documentElement.head.append(style);
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
