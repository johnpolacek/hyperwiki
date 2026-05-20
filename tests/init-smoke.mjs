import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-init-smoke-"));
const agentRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-init-agent-smoke-"));
const guidedRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-init-guided-smoke-"));
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
const gitRoot = await git(root, ["rev-parse", "--show-toplevel"]);
const gitLog = await git(root, ["log", "--oneline", "-1"]);
const realRoot = await realpath(root);

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
if (!agents.includes("If this project needs an app preview") || !agents.includes("Portless-backed `dev` script")) {
  throw new Error("Generated AGENTS.md did not explicitly require a dev script for previewable apps.");
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
if (!gitRoot.ok || await realpath(gitRoot.stdout) !== realRoot) {
  throw new Error(`Expected --yes init to initialize Git, got ${JSON.stringify(gitRoot)}`);
}
if (!gitLog.stdout.includes("Initialize Hyperwiki project")) {
  throw new Error(`Expected initial Hyperwiki commit, got ${gitLog.stdout}`);
}

await inithyperwiki(agentRoot, { yes: true, no_git: true, agent_launch_command: "custom-agent --workspace" });
const agentConfig = JSON.parse(await readFile(path.join(agentRoot, ".hyperwiki", "config.json"), "utf8"));
const skippedGit = await git(agentRoot, ["rev-parse", "--show-toplevel"]);
if (agentConfig.agent.launchCommand !== "custom-agent --workspace") {
  throw new Error("Expected explicit agent launch command to be written to config.");
}
if (!agentConfig.layout.panels.some((panel) => panel.name === "agent" && panel.command === "custom-agent --workspace")) {
  throw new Error("Expected explicit agent launch command to create an agent panel.");
}
if (skippedGit.ok) {
  throw new Error("Expected no_git init to skip Git initialization.");
}

const sourceDocument = `<!doctype html>
<html>
<body>
  <h1>MarkdownStack</h1>
  <section>
    <h2>Problem</h2>
    <p>Markdown examples for agentic coding are scattered across repos, posts, gists, docs, and private teams.</p>
  </section>
  <section>
    <h2>Audience</h2>
    <p>Developers, technical founders, AI tool builders, engineering teams, and agent power users.</p>
  </section>
  <section>
    <h2>Shape</h2>
    <p>Community pattern library and searchable gallery for Markdown used in agentic coding.</p>
  </section>
  <section>
    <h2>Desired Features</h2>
    <ul>
      <li>Curated collection of real Markdown files and workflows.</li>
      <li>Search and tags for planning, code review, onboarding, evals, memory, prompts, and handoffs.</li>
      <li>Source and rendered preview with explanation side by side.</li>
      <li>Save, fork, or adapt patterns into starter templates.</li>
    </ul>
  </section>
  <section>
    <h2>Implementation Notes</h2>
    <ul>
      <li>Start static or mostly static before accounts and submissions.</li>
      <li>Entries are Markdown with frontmatter for title, tool, use case, tags, source URL, author, license, and updated date.</li>
      <li>Use local indexed search before crawler or GitHub import.</li>
      <li>Review secrets, proprietary content, and unclear licensing.</li>
    </ul>
  </section>
  <section>
    <h2>Promotion Criteria</h2>
    <ul>
      <li>At least 30 strong examples from different tools, repos, and workflows.</li>
      <li>Prototype gallery is easy to search, compare, and copy.</li>
    </ul>
  </section>
</body>
</html>`;

await inithyperwiki(guidedRoot, {
  yes: true,
  project_name: "MarkdownStack",
  summary: "A place for people to discover and share Markdown patterns for agentic coding.",
  source_document: sourceDocument,
  source_document_type: "html",
  planning_answers: {
    promise: {
      label: "Discover curated examples",
      value: "Help developers discover curated Markdown-for-agent examples",
      detail: "Build the first version around finding strong examples fast.",
      tradeoff: "Postpones creator workflows."
    },
    prototype: {
      label: "Static searchable gallery",
      value: "Static gallery with seeded examples, local search, and pattern detail pages",
      detail: "A mostly static gallery with local search and filters.",
      tradeoff: "Dynamic community features wait."
    },
    community: {
      label: "Curated only",
      value: "Curated only; defer accounts and public submissions",
      detail: "Keep the MVP editorial and controlled.",
      tradeoff: "Does not validate contributor workflows."
    },
    validation: {
      label: "30 strong examples",
      value: "30 strong examples from different tools, repos, and workflows",
      detail: "Prove breadth across the category.",
      tradeoff: "Requires more curation before launch."
    }
  }
});

const guidedMvp = await readFile(path.join(guidedRoot, "wiki", "plans", "mvp", "index.html"), "utf8");
const guidedPrd = await readFile(path.join(guidedRoot, "wiki", "sources", "prd.html"), "utf8");
const guidedTechnical = await readFile(path.join(guidedRoot, "wiki", "sources", "technical-brief.html"), "utf8");
const guidedDesign = await readFile(path.join(guidedRoot, "wiki", "sources", "design-brief.html"), "utf8");
const guidedInterview = await readFile(path.join(guidedRoot, "wiki", "sources", "planning-interview.html"), "utf8");
const guidedImplementationSpec = await readFile(path.join(guidedRoot, "wiki", "plans", "mvp", "implementation-spec.html"), "utf8");
const guidedStageTwo = await readFile(path.join(guidedRoot, "wiki", "plans", "mvp", "stage-02-dev-workspace.html"), "utf8");
const guidedStageThreeUnit = await readFile(path.join(guidedRoot, "wiki", "plans", "mvp", "stage-03-dogfood-hardening", "unit-02-harden-workflows.html"), "utf8");
const guidedRoadmap = await readFile(path.join(guidedRoot, "wiki", "roadmap.html"), "utf8");
const guidedArchitecture = await readFile(path.join(guidedRoot, "wiki", "architecture.html"), "utf8");
const guidedDev = await readFile(path.join(guidedRoot, "wiki", "dev.html"), "utf8");

if (!guidedMvp.includes("Concrete MVP") || !guidedMvp.includes("static gallery with seeded examples")) {
  throw new Error("Guided MVP plan did not name the concrete first slice.");
}
if (!guidedMvp.includes("Start static and curated") || !guidedMvp.includes("Moderation, licensing, attribution")) {
  throw new Error("Guided MVP plan did not preserve static-first tradeoff and acceptance criteria.");
}
if (!guidedPrd.includes("Core Use Cases") || !guidedPrd.includes("Non-goals For The First Slice") || !guidedPrd.includes("30 strong examples")) {
  throw new Error("Guided product brief did not preserve product evidence and success criteria.");
}
if (!guidedTechnical.includes("Static-first Architecture") || !guidedTechnical.includes("Minimum Entry Fields") || !guidedTechnical.includes("Review every source for secrets")) {
  throw new Error("Guided technical brief did not capture static architecture and trust requirements.");
}
if (!guidedDesign.includes("Primary Screens") || !guidedDesign.includes("Compare view")) {
  throw new Error("Guided design brief did not capture gallery/detail/compare UI direction.");
}
if (!guidedInterview.includes("Selected Decisions") || !guidedInterview.includes("outside runtime terminal session metadata")) {
  throw new Error("Guided project did not preserve planning answers in a durable wiki page.");
}
if (!guidedImplementationSpec.includes("MVP Implementation Spec") || !guidedImplementationSpec.includes("content/patterns/*.md") || !guidedImplementationSpec.includes("Frontmatter Contract")) {
  throw new Error("Guided project did not generate a decision-complete implementation spec.");
}
if (!guidedImplementationSpec.includes("First Seed Categories") || !guidedImplementationSpec.includes("Search And Filter Behavior") || !guidedImplementationSpec.includes("Copy And Compare Behavior")) {
  throw new Error("Guided implementation spec did not capture seed categories and interaction behavior.");
}
if (!guidedImplementationSpec.includes("Promotion threshold") || !guidedImplementationSpec.includes("30 strong examples")) {
  throw new Error("Guided implementation spec did not preserve the source promotion threshold.");
}
if (!guidedStageTwo.includes("Stage 02 - Static Gallery And Pattern Details")) {
  throw new Error("Guided stage titles remained generic.");
}
if (!guidedStageThreeUnit.includes("Document Licensing Moderation And Submission Boundaries")) {
  throw new Error("Guided trust/moderation unit was not generated.");
}
if (!guidedRoadmap.includes("Ship the first slice") || !guidedArchitecture.includes("content/taxonomy.json") || !guidedDev.includes("Implementation Order")) {
  throw new Error("Guided roadmap, architecture, and dev pages remained too generic.");
}
if (!guidedDev.includes("package.json") || !guidedDev.includes("dev:app")) {
  throw new Error("Guided dev page did not explicitly require a runnable preview dev script.");
}

console.log("init smoke test passed");

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim()
      });
    });
  });
}
