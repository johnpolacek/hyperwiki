import { chromium } from "playwright";

const url = process.env.HYPERWIKI_SMOKE_URL || "http://127.0.0.1:4177/workspace/";
const origin = new URL(url).origin;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(url, { waitUntil: "networkidle" });

await page.locator("#wiki-nav a").filter({ hasText: "Plans" }).click();
await page.waitForURL("**/workspace/#/wiki/plans/index.html");

await page.locator("#current-page").filter({ hasText: "/wiki/plans/index.html" }).waitFor();
const currentPage = await page.locator("#current-page").innerText();
if (currentPage !== "/wiki/plans/index.html") {
  throw new Error(`Expected /wiki/plans/index.html, got ${currentPage}`);
}

await page.locator("#new-terminal").click();
await page.locator(".terminal-tab").filter({ hasText: "term-1" }).waitFor();

const terminalTabs = await page.locator(".terminal-tab").count();
if (terminalTabs !== 3) {
  throw new Error(`Expected 3 terminal tabs, got ${terminalTabs}`);
}

const activeTabs = await page.locator(".terminal-tab.active").count();
if (activeTabs !== 1) {
  throw new Error(`Expected 1 active terminal tab, got ${activeTabs}`);
}

await page.locator("#repo-branch").filter({ hasText: /.+/ }).waitFor();

const sessionResponse = await fetch(`${origin}/api/sessions`);
const sessionData = await sessionResponse.json();
if (sessionData.sessions.length < 3) {
  throw new Error(`Expected at least 3 recorded sessions, got ${sessionData.sessions.length}`);
}

const renameTarget = sessionData.sessions.find((session) => session.name === "term-1");
if (!renameTarget) {
  throw new Error("Expected term-1 session metadata");
}
const renameResponse = await fetch(`${origin}/api/sessions/${renameTarget.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "renamed-smoke" })
});
if (!renameResponse.ok) {
  throw new Error(`Expected session rename to succeed, got ${renameResponse.status}`);
}

if (errors.length > 0) {
  throw new Error(`Browser console errors: ${errors.join(" | ")}`);
}

await browser.close();
console.log("browser workspace smoke test passed");
