import { WTerm, WebSocketTransport } from "/vendor/@wterm/dom/dist/index.js";

const terminals = document.getElementById("terminals");
const names = ["shell", "checks"];

for (const name of names) {
  const el = document.createElement("div");
  el.className = "terminal theme-monokai";
  el.dataset.name = name;
  terminals.append(el);

  const term = new WTerm(el, {
    cols: 100,
    rows: 24,
    cursorBlink: true,
    onResize(cols, rows) {
      transport.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  });

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const transport = new WebSocketTransport({
    url: `${protocol}//${location.host}/pty?name=${encodeURIComponent(name)}`,
    onData: (data) => term.write(data)
  });

  await term.init();
  transport.connect();
  term.onData = (data) => transport.send(data);
}

document.querySelectorAll("[data-terminal]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = terminals.querySelector(`[data-name="${button.dataset.terminal}"]`);
    target?.scrollIntoView({ block: "nearest" });
    target?.focus();
  });
});
