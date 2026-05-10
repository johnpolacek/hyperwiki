import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-launch-smoke-"));
const port = 4211;
const workspaceUrl = `http://127.0.0.1:${port}/workspace/`;
let child = null;
let browser = null;

try {
  child = spawn(process.execPath, [path.resolve("src/cli.js"), "launch", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      HYPERWIKI_OPEN_DRY_RUN: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitForText(() => output, "HyperWiki workspace:");
  if (!output.includes(`Would open ${workspaceUrl}`)) {
    throw new Error(`Expected dry-run opener output, got: ${output}`);
  }

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
  if (health.app !== "hyperwiki") {
    throw new Error(`Expected HyperWiki health response, got ${JSON.stringify(health)}`);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(workspaceUrl, { waitUntil: "networkidle" });
  await page.locator(".terminal-tab[data-name=\"shell\"]").waitFor();

  const sessions = await fetch(`http://127.0.0.1:${port}/api/sessions`).then((response) => response.json());
  if (!sessions.sessions.some((session) => session.name === "shell" && session.status === "active")) {
    throw new Error(`Expected launch to prepare shell wterm session, got ${JSON.stringify(sessions)}`);
  }
} finally {
  if (browser) {
    await browser.close();
  }
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await rm(root, { recursive: true, force: true });
}

console.log("one-command launch smoke test passed");

async function waitForText(read, text) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (read().includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${text}. Output: ${read()}`);
}
