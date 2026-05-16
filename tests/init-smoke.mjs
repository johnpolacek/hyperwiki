import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-init-smoke-"));
const agentRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-init-agent-smoke-"));
await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({
    name: "sample-product",
    description: "Sample product for generated wiki verification.",
    scripts: {
      dev: "vite",
      test: "vitest"
    },
    packageManager: "pnpm@10.33.3"
  }, null, 2)}\n`
);
await writeFile(path.join(root, "README.md"), "# Sample Product\n");

await inithyperwiki(root, { yes: true });

const index = await readFile(path.join(root, "wiki", "index.html"), "utf8");
const dev = await readFile(path.join(root, "wiki", "dev.html"), "utf8");
const generatedStage = await readFile(path.join(root, "wiki", "plans", "mvp", "stage-01-foundation.html"), "utf8");
const generatedUnit = await readFile(path.join(root, "wiki", "plans", "mvp", "stage-01-foundation", "unit-01-confirm-project-direction.html"), "utf8");
const scaffoldContract = await readFile(path.join(root, "wiki", "scaffold-contract.html"), "utf8");
const prd = await readFile(path.join(root, "wiki", "sources", "prd.html"), "utf8");
const sources = await readFile(path.join(root, "wiki", "sources.html"), "utf8");
const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
const config = JSON.parse(await readFile(path.join(root, ".hyperwiki", "config.json"), "utf8"));

if (!index.includes("<h1>sample-product</h1>")) {
  throw new Error("Generated index did not use the project name.");
}
if (!index.includes("Sample product for generated wiki verification.")) {
  throw new Error("Generated index did not use the package description.");
}
if (!dev.includes("pnpm run dev") || !dev.includes("pnpm run test")) {
  throw new Error("Generated dev page did not include package scripts.");
}
if (!dev.includes("npx hyperwiki")) {
  throw new Error("Generated dev page did not include the default hyperwiki launch command.");
}
if (!generatedStage.includes("unit-01-confirm-project-direction.html")) {
  throw new Error("Generated stage page did not link to unit pages.");
}
if (!generatedUnit.includes("<h1>Unit 01 - Confirm Project Direction</h1>")) {
  throw new Error("Generated unit page did not render its own HTML page.");
}
if (!scaffoldContract.includes("wiki/sources.html") || !scaffoldContract.includes("wiki/AGENTS.html")) {
  throw new Error("Generated scaffold contract page did not document Hyperwiki wiki conventions.");
}
if (!sources.includes("lowercase <code>wiki/sources.html</code>")) {
  throw new Error("Generated sources page did not document the canonical lowercase source index.");
}
if (!agents.includes("Do not add a duplicate `wiki/Sources.html`")) {
  throw new Error("Generated AGENTS.md did not preserve the Hyperwiki source-index convention.");
}
if (prd.includes("hyperwiki turns repo-local project docs")) {
  throw new Error("Generated PRD still contains hyperwiki-specific product copy.");
}
if (config.agent.launchCommand !== "") {
  throw new Error(`Expected fresh init to leave agent launch command empty, got ${config.agent.launchCommand}`);
}
if (config.layout.panels.some((panel) => panel.name === "agent")) {
  throw new Error("Expected fresh init to omit the agent panel until an agent command is configured.");
}

await inithyperwiki(agentRoot, { yes: true, agent_launch_command: "custom-agent --workspace" });
const agentConfig = JSON.parse(await readFile(path.join(agentRoot, ".hyperwiki", "config.json"), "utf8"));
if (agentConfig.agent.launchCommand !== "custom-agent --workspace") {
  throw new Error("Expected explicit agent launch command to be written to config.");
}
if (!agentConfig.layout.panels.some((panel) => panel.name === "agent" && panel.command === "custom-agent --workspace")) {
  throw new Error("Expected explicit agent launch command to create an agent panel.");
}

console.log("init smoke test passed");
