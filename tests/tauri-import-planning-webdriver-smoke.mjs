import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const required = process.env.HYPERWIKI_TAURI_WEBDRIVER_REQUIRED === "1";

if (process.platform === "darwin") {
  skip("Tauri desktop WebDriver is not supported on macOS WKWebView. Run this smoke on Linux or Windows with tauri-driver.");
}

const tauriDriverPath = process.env.TAURI_DRIVER || commandPath("tauri-driver");
if (!tauriDriverPath) {
  skip("tauri-driver is not installed. Install with `cargo install tauri-driver --locked`.");
}

const application = process.env.HYPERWIKI_TAURI_APP || defaultApplicationPath();
if (!existsSync(application)) {
  const build = spawnSync("pnpm", ["tauri", "build", "--debug", "--no-bundle"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0 || !existsSync(application)) {
    throw new Error(`Could not build or find Tauri app binary at ${application}`);
  }
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-tauri-import-smoke-"));
const projectsDir = path.join(tempRoot, "Projects");
const homeDir = path.join(tempRoot, "home");
const port = Number(process.env.TAURI_DRIVER_PORT || 4444);
let driverProcess;
let sessionId;

try {
  driverProcess = spawn(tauriDriverPath, ["--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      HYPERWIKI_HOME: homeDir,
      HYPERWIKI_PROJECTS_DIR: projectsDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  driverProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));
  driverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
  driverProcess.on("exit", (code) => {
    if (sessionId) console.error(`tauri-driver exited early with code ${code}`);
  });

  await waitForDriver(port);
  sessionId = await createSession(port, application);

  const routechatFixture = path.resolve("tests/fixtures/routechat.html");
  const fileInput = await findElement(port, sessionId, "[data-testid='project-file-input']");
  await sendKeys(port, sessionId, fileInput, routechatFixture);

  await waitFor(port, sessionId, async () => {
    const url = await currentUrl(port, sessionId);
    return url.includes("/workspace/routechat/main") && url.includes("#/wiki/plans/index.mdx");
  }, "workspace planning dashboard URL");

  await waitForText(port, sessionId, "Planning Dashboard");
  await waitForText(port, sessionId, "No plan pages.");
  await waitForText(port, sessionId, "Agent");

  const text = await bodyText(port, sessionId);
  assert.ok(!text.includes("New Project"), "import form must not remain visible after handoff");

  const projects = JSON.parse(await readFile(path.join(homeDir, ".hyperwiki", "projects.json"), "utf8"));
  const project = projects.projects.find((entry) => entry.name === "routechat");
  assert.ok(project, "routechat project should be registered");
  const sessionsDir = path.join(project.root, ".hyperwiki", "sessions");
  const sessionFiles = await import("node:fs/promises").then((fs) => fs.readdir(sessionsDir));
  const sessions = await Promise.all(sessionFiles.map(async (file) => JSON.parse(await readFile(path.join(sessionsDir, file), "utf8"))));
  assert.ok(sessions.some((session) => session.role === "agent" && session.scope === "/wiki/plans/index.mdx"), "agent planning session should be persisted for the dashboard");

  console.log("tauri import planning WebDriver smoke test passed");
} finally {
  if (sessionId) {
    await webdriver(port, "DELETE", `/session/${sessionId}`).catch(() => null);
  }
  if (driverProcess) {
    driverProcess.kill();
  }
  await rm(tempRoot, { recursive: true, force: true });
}

function skip(message) {
  if (required) throw new Error(message);
  console.log(`SKIP: ${message}`);
  process.exit(0);
}

function commandPath(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [command] : ["-v", command], {
    encoding: "utf8",
    shell: process.platform !== "win32",
  });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : "";
}

function defaultApplicationPath() {
  if (process.platform === "win32") return path.resolve("src-tauri/target/debug/hyperwiki.exe");
  return path.resolve("src-tauri/target/debug/hyperwiki");
}

async function waitForDriver(port) {
  await waitFor(port, null, async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/status`);
      return true;
    } catch {
      return false;
    }
  }, "tauri-driver status");
}

async function createSession(port, application) {
  const response = await webdriver(port, "POST", "/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "wry",
        "tauri:options": { application },
      },
    },
  });
  return response.sessionId || response.value?.sessionId;
}

async function findElement(port, sessionId, selector) {
  const response = await webdriver(port, "POST", `/session/${sessionId}/element`, {
    using: "css selector",
    value: selector,
  });
  return elementId(response.value ?? response);
}

async function sendKeys(port, sessionId, element, text) {
  await webdriver(port, "POST", `/session/${sessionId}/element/${element}/value`, {
    text,
    value: [...text],
  });
}

async function currentUrl(port, sessionId) {
  const response = await webdriver(port, "GET", `/session/${sessionId}/url`);
  return String(response.value || "");
}

async function bodyText(port, sessionId) {
  const body = await findElement(port, sessionId, "body");
  const response = await webdriver(port, "GET", `/session/${sessionId}/element/${body}/text`);
  return String(response.value || "");
}

async function waitForText(port, sessionId, text) {
  await waitFor(port, sessionId, async () => (await bodyText(port, sessionId)).includes(text), `text ${text}`);
}

async function waitFor(port, sessionId, predicate, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(250);
  }
  const detail = sessionId ? ` Current text:\n${await bodyText(port, sessionId).catch(() => "")}` : "";
  throw new Error(`Timed out waiting for ${label}.${detail}`);
}

async function webdriver(port, method, endpoint, body) {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${text}`);
  }
  return json.value && typeof json.value === "object" && !Array.isArray(json.value) ? json.value : json;
}

function elementId(value) {
  if (!value || typeof value !== "object") throw new Error(`Invalid element response: ${JSON.stringify(value)}`);
  return value["element-6066-11e4-a52e-4f735466cecf"] || value.ELEMENT;
}
