import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-plan-status-smoke-"));
process.env.HYPERWIKI_HOME = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-plan-status-home-"));

await inithyperwiki(root, {
  yes: true,
  project_name: "Plan Status Smoke",
  summary: "Project for plan status smoke coverage."
});

const dashboardPath = path.join(root, "wiki", "plans", "index.html");
let dashboard = await readFile(dashboardPath, "utf8");
dashboard = dashboard.replace("Current stage: Stage 01 - Project Direction And Setup", "Current stage: Stage 01 - Project Direction And Setup");
dashboard = dashboard.replace("Current unit: Unit 01 - Confirm Project Direction", "Current unit: Unit 01 - Confirm Project Direction");
await writeFile(dashboardPath, dashboard);

const stagePath = path.join(root, "wiki", "plans", "mvp", "stage-01-foundation.html");
let stage = await readFile(stagePath, "utf8");
stage = stage.replace(/<section class="summary">[\s\S]*?<\/section>\n/, "");
stage = stage.replace(
  /<p>Record automated[\s\S]*?<\/p>/,
  "<p>Completed 2026-05-17. All Stage 01 units are complete.</p>"
);
await writeFile(stagePath, stage);

const stageOneUnitRoot = path.join(root, "wiki", "plans", "mvp", "stage-01-foundation");
for (const filename of [
  "unit-01-confirm-project-direction.html",
  "unit-02-review-repository-setup.html",
  "unit-03-update-source-briefs.html",
  "unit-04-define-first-implementation-unit.html"
]) {
  const filePath = path.join(stageOneUnitRoot, filename);
  const html = await readFile(filePath, "utf8");
  await writeFile(filePath, html.replace("Status: pending", "Status: complete"));
}

const { server, url } = await startDevServer(root, { host: "127.0.0.1", port: 0 });
try {
  const workspace = await json(`${url}/api/workspace`);
  if (workspace.status.current !== "Unit 01 - Implement First Slice") {
    throw new Error(`Expected auto-advanced current unit, got ${JSON.stringify(workspace.status)}`);
  }
  if (workspace.status.stage !== "Stage 02 - First Implementation Track") {
    throw new Error(`Expected auto-advanced current stage, got ${JSON.stringify(workspace.status)}`);
  }
  if (!workspace.status.currentPath.endsWith("/wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.html")) {
    throw new Error(`Expected Stage 02 Unit 01 path, got ${workspace.status.currentPath}`);
  }
  if (!workspace.status.conflicts.some((conflict) => conflict.kind === "stale-current-unit")) {
    throw new Error(`Expected stale current unit conflict, got ${JSON.stringify(workspace.status.conflicts)}`);
  }

  const wiki = await json(`${url}/api/wiki`);
  const stageOne = wiki.pages.find((page) => page.path.endsWith("/wiki/plans/mvp/stage-01-foundation.html"));
  const staleUnit = wiki.pages.find((page) => page.path.endsWith("/wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html"));
  const currentUnit = wiki.pages.find((page) => page.currentState === "current-unit");
  if (stageOne?.status !== "complete") {
    throw new Error(`Expected Stage 01 to derive complete from children, got ${JSON.stringify(stageOne)}`);
  }
  if (staleUnit?.currentState) {
    throw new Error(`Expected completed stale unit to avoid current state, got ${JSON.stringify(staleUnit)}`);
  }
  if (currentUnit?.status === "complete" || !currentUnit?.path.endsWith("/stage-02-dev-workspace/unit-01-implement-first-slice.html")) {
    throw new Error(`Expected non-complete Stage 02 current unit, got ${JSON.stringify(currentUnit)}`);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("plan status smoke test passed");

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
