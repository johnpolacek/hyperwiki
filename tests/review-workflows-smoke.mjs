import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-review-workflows-smoke-"));
await writeFile(path.join(root, "package.json"), `${JSON.stringify({
  name: "review-workflows-smoke",
  packageManager: "pnpm@10.33.3",
  scripts: {
    check: "node --check index.js",
    "smoke:browser": "node browser-smoke.mjs"
  }
}, null, 2)}\n`);

await inithyperwiki(root, {
  yes: true,
  project_name: "Review Workflows Smoke",
  summary: "Project for review workflow smoke coverage.",
  agent_launch_command: "codex --yolo"
});

const { server, url } = await startDevServer(root, { host: "127.0.0.1", port: 0 });
try {
  const summary = await json(`${url}/api/review-workflows`);
  if (summary.version !== 1 || summary.kind !== "hyperwiki.review-workflows") {
    throw new Error(`Expected versioned review workflow summary, got ${JSON.stringify(summary)}`);
  }
  if (summary.boundary !== "runtime-only-until-recorded") {
    throw new Error(`Expected runtime-only boundary, got ${summary.boundary}`);
  }
  const ids = new Set(summary.workflows.map((workflow) => workflow.id));
  for (const id of ["diff-review", "architecture-review", "security-review", "test-gap-review"]) {
    if (!ids.has(id)) {
      throw new Error(`Expected workflow ${id}, got ${JSON.stringify(summary.workflows)}`);
    }
  }
  if (!summary.workflows.every((workflow) => workflow.requiresAgent && workflow.resultBoundary === "runtime-evidence")) {
    throw new Error(`Expected agent-native runtime workflows, got ${JSON.stringify(summary.workflows)}`);
  }
  if (summary.project.name !== "Review Workflows Smoke" || !summary.plan.currentPath) {
    throw new Error(`Expected project contract context in summary, got ${JSON.stringify(summary)}`);
  }

  const prepared = await postJson(`${url}/api/review-workflows/run`, {
    workflowId: "security-review",
    currentPage: "/wiki/plans/index.html",
    dryRun: true
  });
  if (!prepared.ok || prepared.sent !== false || prepared.workflow.id !== "security-review") {
    throw new Error(`Expected dry-run workflow preparation, got ${JSON.stringify(prepared)}`);
  }
  if (prepared.evidence.status !== "prepared" || prepared.evidence.boundary !== "runtime-evidence" || prepared.evidence.recorded !== false) {
    throw new Error(`Expected runtime evidence marker, got ${JSON.stringify(prepared.evidence)}`);
  }
  for (const text of [
    "Workflow: Security Review",
    "Project: Review Workflows Smoke",
    "Current plan:",
    "Verification loops:",
    "Do not edit wiki files, commit, or change code unless the user explicitly asks"
  ]) {
    if (!prepared.prompt.includes(text)) {
      throw new Error(`Expected prepared prompt to include ${text}, got ${prepared.prompt}`);
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("review workflows smoke test passed");

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
