import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-mcp-surface-smoke-"));
await writeFile(path.join(root, "package.json"), `${JSON.stringify({
  name: "mcp-surface-smoke",
  packageManager: "pnpm@10.33.3",
  scripts: {
    check: "node --check index.js",
    "smoke:browser": "node browser-smoke.mjs"
  }
}, null, 2)}\n`);

await inithyperwiki(root, {
  yes: true,
  project_name: "MCP Surface Smoke",
  summary: "Project for MCP surface smoke coverage.",
  agent_launch_command: "codex --yolo"
});

const { server, url } = await startDevServer(root, { host: "127.0.0.1", port: 0 });
try {
  const surface = await json(`${url}/api/mcp-surface`);
  if (surface.version !== 1 || surface.kind !== "hyperwiki.mcp-surface") {
    throw new Error(`Expected versioned MCP surface, got ${JSON.stringify(surface)}`);
  }
  if (surface.boundary !== "localhost-tooling" || surface.transportStatus !== "stdio-served") {
    throw new Error(`Expected local stdio-served surface, got ${JSON.stringify(surface)}`);
  }
  if (surface.contract.sourceEndpoint !== "/api/project-contract" || surface.project.name !== "MCP Surface Smoke") {
    throw new Error(`Expected project contract mapping, got ${JSON.stringify(surface.contract)}`);
  }

  const resourceUris = new Set(surface.resources.map((resource) => resource.uri));
  for (const uri of [
    "hyperwiki://project-contract",
    "hyperwiki://current-plan",
    "hyperwiki://source-index",
    "hyperwiki://verification-loops",
    "hyperwiki://guardrails",
    "hyperwiki://review-workflows",
    "hyperwiki://wiki-pages"
  ]) {
    if (!resourceUris.has(uri)) {
      throw new Error(`Expected resource ${uri}, got ${JSON.stringify(surface.resources)}`);
    }
  }
  if (!surface.resources.every((resource) => resource.readOnly && resource.sourceEndpoint && resource.mimeType === "application/json")) {
    throw new Error(`Expected read-only JSON resources with source endpoints, got ${JSON.stringify(surface.resources)}`);
  }

  const tools = new Map(surface.tools.map((tool) => [tool.name, tool]));
  for (const name of [
    "get_project_contract",
    "get_current_plan",
    "list_verification_loops",
    "list_review_workflows",
    "prepare_review_workflow",
    "submit_agent_prompt"
  ]) {
    if (!tools.has(name)) {
      throw new Error(`Expected tool ${name}, got ${JSON.stringify(surface.tools)}`);
    }
  }
  if (!tools.get("get_project_contract").readOnly || tools.get("get_project_contract").destructive) {
    throw new Error(`Expected read-only project contract tool, got ${JSON.stringify(tools.get("get_project_contract"))}`);
  }
  const prepare = tools.get("prepare_review_workflow");
  if (prepare.readOnly || prepare.mapsTo.endpoint !== "/api/review-workflows/run" || prepare.mapsTo.fixedBody.dryRun !== true) {
    throw new Error(`Expected dry-run review preparation tool, got ${JSON.stringify(prepare)}`);
  }
  if (!prepare.inputSchema.required.includes("workflowId") || !prepare.inputSchema.properties.workflowId.enum.includes("security-review")) {
    throw new Error(`Expected workflowId schema with review workflows, got ${JSON.stringify(prepare.inputSchema)}`);
  }
  const prompt = tools.get("submit_agent_prompt");
  if (!prompt.requiresActiveAgentSession || prompt.readOnly || prompt.idempotent || prompt.mapsTo.endpoint !== "/api/agent/prompt") {
    throw new Error(`Expected controlled prompt submission tool, got ${JSON.stringify(prompt)}`);
  }
  if (!surface.useCases.some((useCase) => useCase.includes("verification loops"))) {
    throw new Error(`Expected use cases to explain verification usage, got ${JSON.stringify(surface.useCases)}`);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("mcp surface smoke test passed");

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
