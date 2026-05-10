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
const logSummary = document.getElementById("log-summary");
const verificationSummary = document.getElementById("verification-summary");
const terminalSessions = new Map();
let terminalCount = 0;
let requestedWikiPath = "/wiki/index.html";
let activeTerminalName = null;

await loadRepoContext();
await loadWikiNav();
await loadWorkspaceSummary();
activateWikiPage(pageFromHash());
await restoreTerminals();
activateTerminal("shell");

window.addEventListener("hashchange", () => {
  activateWikiPage(pageFromHash());
});

wikiFrame.addEventListener("load", () => {
  syncFrameLocation();
});

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
  await api(`/api/sessions/${session.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: nextName.trim() })
  });
  terminalSessions.delete(session.name);
  session.name = nextName.trim();
  session.tab.dataset.name = session.name;
  session.el.dataset.name = session.name;
  session.label.textContent = session.name;
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
  const exported = await api(`/api/sessions/${session.id}/export`, { method: "POST" });
  window.alert(`Session export boundary: ${exported.boundary}\\n${exported.note}`);
});

pruneSessionsButton.addEventListener("click", async () => {
  await api("/api/sessions/prune", { method: "POST" });
});

async function restoreTerminals() {
  const data = await api("/api/sessions");
  const reconnectable = data.sessions.filter((session) => session.reconnectable && session.retained).slice(-4);
  const names = reconnectable.length > 0 ? reconnectable.map((session) => session.name) : ["shell", "checks"];
  const uniqueNames = [...new Set(names)];
  for (const name of uniqueNames) {
    await createTerminal(name);
  }
  if (!terminalSessions.has("shell")) {
    await createTerminal("shell");
  }
}

async function loadRepoContext() {
  try {
    const repo = await api("/api/repo");
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
    const response = await fetch("/api/wiki");
    const data = await response.json();
    wikiNav.replaceChildren(
      ...data.pages.map((page) => {
        const link = document.createElement("a");
        link.href = `#${page.path}`;
        link.textContent = page.title;
        link.dataset.path = page.path;
        return link;
      })
    );
  } catch {
    document.getElementById("server-status").textContent = "Offline";
  }
}

async function loadWorkspaceSummary() {
  try {
    const summary = await api("/api/workspace");
    renderList(planSummary, summary.plan.summary.slice(0, 4));
    renderList(logSummary, summary.log.entries.slice(0, 4));
    renderList(
      verificationSummary,
      summary.verification.map((item) => `<code>${escapeHtml(item.command)}</code>`)
    );
  } catch {
    renderList(planSummary, ["Workspace summary unavailable"]);
  }
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
  currentPage.textContent = nextPath;
  openPage.href = nextPath;
  wikiNav.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.dataset.path === nextPath);
  });
  if (location.hash !== `#${nextPath}`) {
    history.replaceState(null, "", `#${nextPath}`);
  }
}

function syncFrameLocation() {
  try {
    const framePath = wikiFrame.contentWindow.location.pathname;
    if (!framePath.startsWith("/wiki/") || framePath !== requestedWikiPath) {
      return;
    }
    currentPage.textContent = framePath;
    openPage.href = framePath;
    wikiNav.querySelectorAll("a").forEach((link) => {
      link.classList.toggle("active", link.dataset.path === framePath);
    });
    if (location.hash !== `#${framePath}`) {
      history.replaceState(null, "", `#${framePath}`);
    }
  } catch {
    // Same-origin wiki pages should be readable; ignore if a browser policy blocks it.
  }
}

function pageFromHash() {
  return decodeURIComponent(location.hash.replace(/^#/, "")) || "/wiki/index.html";
}

function normalizeWikiPath(path) {
  if (!path.startsWith("/wiki/") || !path.endsWith(".html")) {
    return "/wiki/index.html";
  }
  return path;
}

async function createTerminal(name) {
  if (terminalSessions.has(name)) {
    return terminalSessions.get(name);
  }

  const id = crypto.randomUUID();
  const el = document.createElement("div");
  el.className = "terminal theme-monokai";
  el.dataset.name = name;
  terminals.append(el);

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "terminal-tab";
  tab.dataset.name = name;
  const status = document.createElement("span");
  status.className = "status";
  status.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = name;
  tab.append(status, label);
  terminalTabs.append(tab);
  tab.addEventListener("click", () => activateTerminal(name));

  let transport;
  const term = new WTerm(el, {
    cols: 100,
    rows: 24,
    cursorBlink: true,
    onResize(cols, rows) {
      transport?.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  });

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  transport = new WebSocketTransport({
    url: `${protocol}//${location.host}/pty?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`,
    reconnect: false,
    onData: (data) => term.write(data),
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
  term.onData = (data) => transport.send(data);

  const session = { id, name, el, tab, label, term, transport };
  terminalSessions.set(name, session);
  return session;
}

function activateTerminal(name) {
  activeTerminalName = name;
  terminalSessions.forEach((session, sessionName) => {
    const active = sessionName === name;
    session.el.classList.toggle("active", active);
    session.tab.classList.toggle("active", active);
    session.tab.setAttribute("aria-selected", String(active));
  });
  terminalSessions.get(name)?.term.focus();
}

function closeTerminal(name) {
  const session = terminalSessions.get(name);
  if (!session) return;
  session.transport.close();
  session.term.destroy();
  session.el.remove();
  session.tab.remove();
  terminalSessions.delete(name);
  void api(`/api/sessions/${session.id}`, { method: "DELETE" });
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
