import { WTerm, WebSocketTransport } from "/vendor/@wterm/dom/dist/index.js";

const wikiFrame = document.getElementById("wiki-frame");
const wikiNav = document.getElementById("wiki-nav");
const currentPage = document.getElementById("current-page");
const openPage = document.getElementById("open-page");
const terminals = document.getElementById("terminals");
const terminalTabs = document.getElementById("terminal-tabs");
const newTerminalButton = document.getElementById("new-terminal");
const renameTerminalButton = document.getElementById("rename-terminal");
const restartTerminalButton = document.getElementById("restart-terminal");
const closeTerminalButton = document.getElementById("close-terminal");
const exportTerminalButton = document.getElementById("export-terminal");
const pruneSessionsButton = document.getElementById("prune-sessions");
const repoBranch = document.getElementById("repo-branch");
const repoDirty = document.getElementById("repo-dirty");
const planSummary = document.getElementById("plan-summary");
const guardrailMode = document.getElementById("guardrail-mode");
const canonicalBoundary = document.getElementById("canonical-boundary");
const runtimeBoundary = document.getElementById("runtime-boundary");
const activeSessionBoundary = document.getElementById("active-session-boundary");
const planPrompt = document.getElementById("plan-prompt");
const planPromptInput = document.getElementById("plan-prompt-input");
const planPromptStatus = document.getElementById("plan-prompt-status");
const workspace = document.querySelector(".workspace");
const projectSidebar = document.getElementById("project-sidebar");
const projectToggle = document.getElementById("project-toggle");
const projectList = document.getElementById("project-list");
const terminalSessions = new Map();
const wikiPageTitles = new Map();
let terminalCount = 0;
let requestedWikiPath = "/wiki/index.html";
let activeTerminalName = null;
let guardrails = null;
let activeProjectId = new URLSearchParams(location.search).get("project");
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

newTerminalButton.addEventListener("click", async () => {
  terminalCount += 1;
  const name = `term-${terminalCount}`;
  await createTerminal(name);
  activateTerminal(name);
});

renameTerminalButton.addEventListener("click", async () => {
  const session = terminalSessions.get(activeTerminalName);
  if (!session) return;
  const nextName = window.prompt("Terminal name", session.name);
  if (!nextName || nextName.trim() === session.name) return;
  await api(projectPath(`/api/sessions/${session.id}`), {
    method: "PATCH",
    body: JSON.stringify({ name: nextName.trim() })
  });
  terminalSessions.delete(session.name);
  session.name = nextName.trim();
  session.tab.dataset.name = session.name;
  session.panel.dataset.name = session.name;
  session.header.dataset.name = session.name;
  session.el.dataset.name = session.name;
  session.label.textContent = session.name;
  session.headerTitle.textContent = session.name;
  terminalSessions.set(session.name, session);
  activeTerminalName = session.name;
});

restartTerminalButton.addEventListener("click", async () => {
  const session = terminalSessions.get(activeTerminalName);
  if (!session) return;
  closeTerminal(session.name);
  await createTerminal(session.name);
  activateTerminal(session.name);
});

closeTerminalButton.addEventListener("click", async () => {
  if (terminalSessions.size <= 1 || !activeTerminalName) return;
  closeTerminal(activeTerminalName);
  const [nextName] = terminalSessions.keys();
  activateTerminal(nextName);
});

exportTerminalButton.addEventListener("click", async () => {
  const session = terminalSessions.get(activeTerminalName);
  if (!session) return;
  const exported = await api(projectPath(`/api/sessions/${session.id}/export`), { method: "POST" });
  window.alert(`Session export boundary: ${exported.boundary}\\n${exported.note}`);
});

pruneSessionsButton.addEventListener("click", async () => {
  await api(projectPath("/api/sessions/prune"), { method: "POST" });
});

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
    planPromptStatus.textContent = "Sent to agent.";
    activateTerminal("agent");
  } catch (error) {
    planPromptStatus.textContent = error.message || "Agent unavailable.";
  }
});

projectToggle.addEventListener("click", () => {
  const collapsed = !workspace.classList.contains("projects-collapsed");
  workspace.classList.toggle("projects-collapsed", collapsed);
  projectToggle.setAttribute("aria-expanded", String(!collapsed));
});

async function restoreTerminals() {
  const [sessionData, layout] = await Promise.all([api(projectPath("/api/sessions")), api(projectPath("/api/layout"))]);
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
    repoDirty.textContent = repo.git.dirty ? "Dirty" : "Clean";
    repoDirty.title = repo.git.status.join("\n") || "No git changes";
    document.getElementById("server-status").title = repo.root;
  } catch {
    repoBranch.textContent = "Unavailable";
    repoDirty.textContent = "Unknown";
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
    renderList(planSummary, compactPlanSummary(summary.plan.summary));
  } catch {
    renderList(planSummary, ["Workspace summary unavailable"]);
  }
}

async function loadGuardrails() {
  try {
    guardrails = await api(projectPath("/api/guardrails"));
    guardrailMode.textContent = guardrails.mode.label;
    guardrailMode.title = guardrails.mode.value;
    canonicalBoundary.textContent = guardrails.canonical.map((item) => item.path).join(" + ");
    canonicalBoundary.title = guardrails.canonical.map((item) => `${item.path}: ${item.detail}`).join("\n");
    runtimeBoundary.textContent = guardrails.runtime.map((item) => item.path).join(" + ");
    runtimeBoundary.title = guardrails.runtime.map((item) => `${item.path}: ${item.detail}`).join("\n");
  } catch {
    guardrailMode.textContent = "Unavailable";
  }
}

async function loadProjects() {
  const data = await api(projectPath("/api/projects"));
  activeProjectId = data.activeProjectId || data.projects.find((project) => project.available)?.id || activeProjectId;
  if (activeProjectId && !new URLSearchParams(location.search).get("project")) {
    const url = new URL(location.href);
    url.searchParams.set("project", activeProjectId);
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  if (data.projects.length <= 1) {
    projectSidebar.hidden = true;
    workspace.classList.remove("has-projects", "projects-collapsed");
    return;
  }
  projectSidebar.hidden = false;
  workspace.classList.add("has-projects");
  projectList.replaceChildren(
    ...data.projects.map((project) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = project.name;
      button.title = project.available ? project.root : `${project.root} unavailable`;
      button.className = project.id === activeProjectId ? "active" : "";
      button.disabled = !project.available;
      button.addEventListener("click", () => switchProject(project.id));
      return button;
    })
  );
}

async function switchProject(projectId) {
  if (projectId === activeProjectId) return;
  closeAllTerminals();
  activeProjectId = projectId;
  const url = new URL(location.href);
  url.searchParams.set("project", projectId);
  url.hash = "#/wiki/index.html";
  history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
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

function groupWikiPages(pages) {
  const groups = [
    { title: "Plans", pages: pages.filter((page) => page.path.includes("/wiki/plans/") && !page.path.includes("/stage-")) },
    { title: "Project", pages: pages.filter((page) => ["/wiki/index.html", "/wiki/architecture.html", "/wiki/dev.html", "/wiki/roadmap.html"].some((suffix) => page.path.endsWith(suffix))) },
    { title: "Completed Stages", pages: pages.filter((page) => page.path.includes("/wiki/plans/mvp/stage-")) },
    { title: "Sources", pages: pages.filter((page) => page.path.includes("/wiki/sources/")) },
    { title: "Log", pages: pages.filter((page) => page.path.endsWith("/wiki/log.html")) }
  ];
  return groups
    .filter((group) => group.pages.length > 0)
    .map((group) => {
      const details = document.createElement("details");
      details.className = "wiki-nav-group";
      details.open = group.title === "Plans";
      const summary = document.createElement("summary");
      summary.textContent = group.title;
      details.append(summary, ...group.pages.map(renderWikiLink));
      return details;
    });
}

function renderWikiLink(page) {
  const link = document.createElement("a");
  link.href = `#${page.path}`;
  link.textContent = cleanPageTitle(page);
  link.dataset.path = page.path;
  return link;
}

function cleanPageTitle(page) {
  if (page.path.endsWith("/wiki/plans/index.html")) return "Planning Dashboard";
  if (page.path.endsWith("/wiki/plans/mvp/index.html")) return "MVP Plan";
  if (page.path.includes("/stage-")) return page.title.replace(/^Stage (\d+) /, "Stage $1 · ");
  if (page.title.toLowerCase() === "prd") return "PRD";
  return page.title;
}

function compactPlanSummary(items) {
  return items
    .map((item) => item.replace(/^Next action:/, "Next:"))
    .filter((item) => /^Next:/.test(item))
    .slice(0, 1);
}

function renderList(target, items) {
  target.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement("li");
      li.innerHTML = item;
      return li;
    })
  );
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
  const header = document.createElement("button");
  header.type = "button";
  header.className = "terminal-panel-header";
  header.dataset.name = name;
  const headerTitle = document.createElement("strong");
  headerTitle.textContent = name;
  const headerCommand = document.createElement("span");
  headerCommand.textContent = terminalCommandLabel(options);
  header.append(headerTitle, headerCommand);
  const el = document.createElement("div");
  el.className = "terminal theme-monokai";
  el.dataset.name = name;
  el.tabIndex = 0;
  panel.append(header, el);
  terminals.append(panel);
  header.addEventListener("click", () => activateTerminal(name));

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
      lastLocalInputAt = performance.now();
      lastLocalInputWasEnter = data === "\r" || data === "\n";
      transport?.send(data);
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
  el.addEventListener("pointerdown", () => {
    requestAnimationFrame(() => term.focus());
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

  const session = { id, name, role: options.role || "shell", command: options.command || null, panel, header, headerTitle, headerCommand, el, tab, label, term, transport };
  terminalSessions.set(name, session);
  return session;
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
    updateActiveSessionBoundary(session);
    requestAnimationFrame(() => {
      session.term.focus();
      scrollTerminalToBottom(session.el);
    });
  }
}

function updateActiveSessionBoundary(session) {
  const command = session.command ? `Command: ${session.command}` : "Interactive shell";
  activeSessionBoundary.textContent = `${session.name} · ${command} · ${session.id.slice(0, 8)}`;
  activeSessionBoundary.title = guardrails
    ? `${guardrails.commandHistory.detail}\nSession metadata is retained locally under .hyperwiki/sessions/.`
    : "Session metadata is retained locally under .hyperwiki/sessions/.";
}

function terminalCommandLabel(options = {}) {
  if (options.command) return String(options.command);
  return options.role === "shell" || !options.role ? "interactive shell" : String(options.role);
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
  updatePlanPromptVisibility();
  void api(projectPath(`/api/sessions/${session.id}`), { method: "DELETE" });
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
  if (!activeProjectId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}project=${encodeURIComponent(activeProjectId)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
