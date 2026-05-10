import { WTerm, WebSocketTransport } from "/vendor/@wterm/dom/dist/index.js";

const wikiFrame = document.getElementById("wiki-frame");
const wikiNav = document.getElementById("wiki-nav");
const currentPage = document.getElementById("current-page");
const openPage = document.getElementById("open-page");
const terminals = document.getElementById("terminals");
const terminalTabs = document.getElementById("terminal-tabs");
const newTerminalButton = document.getElementById("new-terminal");
const terminalSessions = new Map();
let terminalCount = 0;
let requestedWikiPath = "/wiki/index.html";

await loadWikiNav();
activateWikiPage(pageFromHash());
await createTerminal("shell");
await createTerminal("checks");
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

  const el = document.createElement("div");
  el.className = "terminal theme-monokai";
  el.dataset.name = name;
  terminals.append(el);

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "terminal-tab";
  tab.dataset.name = name;
  tab.innerHTML = `<span class="status" aria-hidden="true"></span><span>${name}</span>`;
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
    url: `${protocol}//${location.host}/pty?name=${encodeURIComponent(name)}`,
    onData: (data) => term.write(data)
  });

  await term.init();
  transport.connect();
  tab.classList.add("connected");
  term.onData = (data) => transport.send(data);

  const session = { el, tab, term, transport };
  terminalSessions.set(name, session);
  return session;
}

function activateTerminal(name) {
  terminalSessions.forEach((session, sessionName) => {
    const active = sessionName === name;
    session.el.classList.toggle("active", active);
    session.tab.classList.toggle("active", active);
    session.tab.setAttribute("aria-selected", String(active));
  });
  terminalSessions.get(name)?.term.focus();
}
