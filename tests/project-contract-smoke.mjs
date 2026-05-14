import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-contract-smoke-"));
process.env.HYPERWIKI_HOME = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-contract-home-"));
await writeFile(path.join(root, "package.json"), `${JSON.stringify({
  name: "contract-smoke",
  packageManager: "pnpm@10.33.3",
  scripts: {
    check: "node --check index.js",
    "smoke:browser": "node browser-smoke.mjs"
  }
}, null, 2)}\n`);

await inithyperwiki(root, {
  yes: true,
  project_name: "Contract Smoke",
  summary: "Project for contract smoke coverage.",
  agent_launch_command: "codex --yolo"
});

const { server, url } = await startDevServer(root, { host: "127.0.0.1", port: 0 });
try {
  const contract = await json(`${url}/api/project-contract`);
  if (contract.version !== 1 || contract.kind !== "hyperwiki.project-contract") {
    throw new Error(`Expected versioned project contract, got ${JSON.stringify(contract)}`);
  }
  if (contract.boundary !== "localhost-tooling") {
    throw new Error(`Expected localhost-tooling boundary, got ${contract.boundary}`);
  }
  if (contract.project.name !== "Contract Smoke" || contract.project.root !== root || contract.project.canonicalWiki !== "html") {
    throw new Error(`Expected project facts from config/root, got ${JSON.stringify(contract.project)}`);
  }
  if (!contract.repo.git || contract.repo.git.root !== null && !contract.repo.git.root.startsWith(root)) {
    throw new Error(`Expected repo context in contract, got ${JSON.stringify(contract.repo)}`);
  }
  if (contract.plan.dashboard.path !== "/wiki/plans/index.html" || !contract.plan.status.current) {
    throw new Error(`Expected current plan state, got ${JSON.stringify(contract.plan)}`);
  }
  if (!contract.sources.briefs.some((brief) => brief.path === "/wiki/sources/prd.html")) {
    throw new Error(`Expected source brief metadata, got ${JSON.stringify(contract.sources)}`);
  }
  if (!contract.verification.loops.some((loop) => loop.id === "syntax-checks" && loop.scope && loop.trigger)) {
    throw new Error(`Expected verification loops in contract, got ${JSON.stringify(contract.verification)}`);
  }
  if (!contract.guardrails.canonical.some((item) => item.path === "wiki/")) {
    throw new Error(`Expected guardrails in contract, got ${JSON.stringify(contract.guardrails)}`);
  }
  if (!contract.layout.panels.some((panel) => panel.name === "agent" && panel.command === "codex --yolo")) {
    throw new Error(`Expected layout/agent command in contract, got ${JSON.stringify(contract.layout)}`);
  }
  if (!contract.wiki.pages.some((page) => page.path === "/wiki/index.html")) {
    throw new Error(`Expected wiki page index in contract, got ${JSON.stringify(contract.wiki)}`);
  }
  if (!contract.agentContext.includes("Project: Contract Smoke") || !contract.agentContext.includes("Verification loops:")) {
    throw new Error(`Expected copy-pasteable agent context, got ${contract.agentContext}`);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("project contract smoke test passed");

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
