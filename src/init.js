import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const pages = new Map([
  ["wiki/index.html", indexPage],
  ["wiki/AGENTS.html", agentsPage],
  ["wiki/log.html", logPage],
  ["wiki/sources.html", sourcesPage],
  ["wiki/roadmap.html", roadmapPage],
  ["wiki/architecture.html", architecturePage],
  ["wiki/dev.html", devPage],
  ["wiki/plans/index.html", plansIndexPage],
  ["wiki/plans/mvp/index.html", mvpIndexPage],
  ["wiki/plans/mvp/stage-01-foundation.html", stageOnePage],
  ["wiki/plans/mvp/stage-02-dev-workspace.html", stageTwoPage],
  ["wiki/plans/mvp/stage-03-dogfood-hardening.html", stageThreePage],
  ["wiki/sources/prd.html", prdPage],
  ["wiki/sources/technical-brief.html", technicalBriefPage],
  ["wiki/sources/design-brief.html", designBriefPage]
]);

export async function initHyperWiki(root, options = {}) {
  const context = await inspectProject(root, options);
  await mkdir(path.join(root, ".hyperwiki", "state"), { recursive: true });
  await mkdir(path.join(root, ".hyperwiki", "sessions"), { recursive: true });
  await writeIfSafe(
    path.join(root, ".hyperwiki", "config.json"),
    `${JSON.stringify({
      projectName: context.projectName,
      canonicalWiki: "html",
      dev: { host: "127.0.0.1", port: 4177 },
      runtimeState: ".hyperwiki/state",
      sessions: ".hyperwiki/sessions"
    }, null, 2)}\n`,
    options
  );

  for (const [relativePath, render] of pages) {
    await writeIfSafe(path.join(root, relativePath), render(context), options);
  }

  console.log(`Initialized HyperWiki for ${context.projectName}`);
  console.log("Run: npx hyperwiki dev");
}

async function inspectProject(root, options) {
  const packagePath = path.join(root, "package.json");
  let packageJson = null;
  if (existsSync(packagePath)) {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  }
  const projectName = String(options.project_name || packageJson?.name || path.basename(root));
  const summary = String(
    options.summary ||
      packageJson?.description ||
      "HyperWiki is a repo-local HTML workspace for docs-driven agentic development."
  );
  return {
    projectName,
    summary,
    date: new Date().toISOString().slice(0, 10)
  };
}

async function writeIfSafe(filePath, content, options) {
  if (existsSync(filePath) && !options.overwrite) {
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function layout(context, title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - ${escapeHtml(context.projectName)}</title>
  <link rel="stylesheet" href="/assets/wiki.css">
</head>
<body>
  <header class="wiki-header">
    <a href="/wiki/index.html">${escapeHtml(context.projectName)}</a>
    <nav>
      <a href="/wiki/architecture.html">Architecture</a>
      <a href="/wiki/dev.html">Dev</a>
      <a href="/wiki/plans/index.html">Plans</a>
      <a href="/wiki/log.html">Log</a>
      <a href="/wiki/sources.html">Sources</a>
    </nav>
  </header>
  <main class="wiki-page">
    ${body}
  </main>
</body>
</html>
`;
}

function indexPage(context) {
  return layout(context, "Home", `<h1>HyperWiki</h1>
<p>${escapeHtml(context.summary)}</p>
<section>
  <h2>Current Focus</h2>
  <p>Build the single-package CLI, HTML wiki scaffold, local dev workspace, and wterm-backed terminal panels needed to dogfood HyperWiki in this repository.</p>
</section>
<section>
  <h2>Core Pages</h2>
  <ul>
    <li><a href="/wiki/architecture.html">Architecture</a></li>
    <li><a href="/wiki/dev.html">Development workflow</a></li>
    <li><a href="/wiki/plans/index.html">Planning dashboard</a></li>
    <li><a href="/wiki/log.html">Project-context log</a></li>
    <li><a href="/wiki/sources.html">Source index</a></li>
  </ul>
</section>`);
}

function agentsPage(context) {
  return layout(context, "Wiki Agent Guide", `<h1>Wiki Agent Guide</h1>
<p>This directory is the maintained HTML-first knowledge and planning layer for ${escapeHtml(context.projectName)}.</p>
<h2>Rules</h2>
<ul>
  <li>Read <a href="/wiki/index.html">index.html</a> before structural wiki changes.</li>
  <li>Use <a href="/wiki/sources.html">sources.html</a> as the source index.</li>
  <li>Use <a href="/wiki/plans/index.html">plans/index.html</a> before meaningful implementation work.</li>
  <li>Keep runtime state out of the wiki unless it is intentionally exported.</li>
</ul>`);
}

function logPage(context) {
  return layout(context, "Log", `<h1>Project Log</h1>
<p>Git owns routine implementation history. This log owns durable project-context history.</p>
<article>
  <h2>${context.date} bootstrap | initialize HTML-first project wiki</h2>
  <ul>
    <li>Mode: bootstrap_new.</li>
    <li>Canonical wiki format: HTML.</li>
    <li>Planning workflow: project-wiki conventions adapted to HTML files.</li>
    <li>Source briefs: PRD, technical brief, and design brief created for MVP planning.</li>
  </ul>
</article>`);
}

function sourcesPage(context) {
  return layout(context, "Sources", `<h1>Sources</h1>
<h2>Source Material</h2>
<ul>
  <li>User product definition for HyperWiki, including CLI, local dev app, wterm direction, guardrails, and promotion criteria.</li>
  <li>Project-wiki skill contract for planning discipline, source indexing, roadmap state, and log policy.</li>
</ul>
<h2>Generated Source Briefs</h2>
<ul>
  <li><a href="/wiki/sources/prd.html">Product brief</a></li>
  <li><a href="/wiki/sources/technical-brief.html">Technical brief</a></li>
  <li><a href="/wiki/sources/design-brief.html">Design brief</a></li>
</ul>
<h2>Unknowns</h2>
<ul>
  <li>Exact long-term MCP tool set after the MVP.</li>
  <li>Retention defaults for exported PTY logs beyond local ignored session state.</li>
</ul>`);
}

function roadmapPage(context) {
  return layout(context, "Roadmap", `<h1>Roadmap</h1>
<ol>
  <li>Establish the CLI, config, HTML wiki scaffold, and local-only server.</li>
  <li>Serve a useful static HyperWiki workspace over the repo wiki.</li>
  <li>Add real wterm-backed PTY panels and dogfood this repository.</li>
  <li>Follow with structured MCP integration after the core local workflow is credible.</li>
</ol>`);
}

function architecturePage(context) {
  return layout(context, "Architecture", `<h1>Architecture</h1>
<p>HyperWiki is a single npm package with three surfaces: a CLI, repo-local canonical wiki files, and a localhost-only dev runtime.</p>
<h2>Boundaries</h2>
<ul>
  <li>The CLI performs repeatable filesystem operations and starts the dev runtime.</li>
  <li>The wiki is canonical repo-visible HTML.</li>
  <li>The dev runtime renders the wiki and terminal workspace but is not a hidden source of truth.</li>
  <li>Runtime state is ignored under <code>.hyperwiki/state/</code> and <code>.hyperwiki/sessions/</code>.</li>
</ul>`);
}

function devPage(context) {
  return layout(context, "Development", `<h1>Development</h1>
<h2>Commands</h2>
<pre><code>npm install
npm run check
npm run dev
npx hyperwiki init
npx hyperwiki dev</code></pre>
<h2>Workflow</h2>
<p>Plan meaningful work in <a href="/wiki/plans/index.html">plans</a>, keep source truth in repo files and Git, and use the dev workspace to inspect wiki pages and terminal sessions.</p>`);
}

function plansIndexPage(context) {
  return layout(context, "Plans", `<h1>Planning Dashboard</h1>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: active</li>
    <li>Shape: multi-stage MVP</li>
    <li>Current unit: Stage 01 - CLI and repository foundation</li>
    <li>Next action: implement and verify the foundation scaffold</li>
    <li>Blockers: none</li>
    <li>Validation: CLI checks, init smoke test, dev server smoke test, PTY smoke test</li>
  </ul>
</section>
<p>Read the <a href="/wiki/plans/mvp/index.html">MVP plan</a>.</p>`);
}

function mvpIndexPage(context) {
  return layout(context, "MVP Plan", `<h1>MVP Plan</h1>
<p>The MVP proves repo-aware HTML wiki initialization, a local wiki workspace, and real wterm-backed terminal panels.</p>
<ol>
  <li><a href="/wiki/plans/mvp/stage-01-foundation.html">Stage 01 - CLI and repository foundation</a></li>
  <li><a href="/wiki/plans/mvp/stage-02-dev-workspace.html">Stage 02 - HTML wiki and dev workspace</a></li>
  <li><a href="/wiki/plans/mvp/stage-03-dogfood-hardening.html">Stage 03 - wterm dogfood and hardening</a></li>
</ol>`);
}

function stageOnePage(context) {
  return stagePage(context, "Stage 01 - CLI and Repository Foundation", [
    "Create the npm package and CLI bin.",
    "Implement init and dev commands.",
    "Create config, ignored runtime state, and HTML wiki scaffold.",
    "Verify syntax and command smoke tests."
  ]);
}

function stageTwoPage(context) {
  return stagePage(context, "Stage 02 - HTML Wiki and Dev Workspace", [
    "Serve static assets and canonical wiki files from the CLI dev server.",
    "Render navigation, plans, log, source, and architecture views.",
    "Keep the workspace a viewer and controller, not a hidden source of truth.",
    "Verify local-only serving and path traversal protection."
  ]);
}

function stageThreePage(context) {
  return stagePage(context, "Stage 03 - wterm Dogfood and Hardening", [
    "Connect @wterm/dom to a local WebSocket PTY backend.",
    "Support multiple named terminal panels.",
    "Persist transparent session metadata under ignored state.",
    "Use this repository as the first HyperWiki dogfood target."
  ]);
}

function stagePage(context, title, items) {
  return layout(context, title, `<h1>${escapeHtml(title)}</h1>
<h2>Intent</h2>
<p>${escapeHtml(items[0])}</p>
<h2>Execution Units</h2>
<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
<h2>Verification</h2>
<p>Record automated or manual validation in <a href="/wiki/log.html">log.html</a> before marking this stage complete.</p>`);
}

function prdPage(context) {
  return layout(context, "Product Brief", `<h1>Product Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: user prompt and planning decisions</li>
  <li>Confidence: medium</li>
</ul>
<h2>Product Intent</h2>
<p>HyperWiki turns repo-local project docs, plans, logs, verification status, terminals, and agent sessions into a local development environment.</p>
<h2>Primary Flow</h2>
<ol>
  <li>Install or invoke the CLI.</li>
  <li>Initialize an HTML wiki from repository context.</li>
  <li>Run the local dev workspace.</li>
  <li>Use wiki pages and terminal panels to drive agentic development transparently.</li>
</ol>`);
}

function technicalBriefPage(context) {
  return layout(context, "Technical Brief", `<h1>Technical Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: user prompt, npm package checks, and implementation plan</li>
  <li>Confidence: medium</li>
</ul>
<h2>Defaults</h2>
<ul>
  <li>Single Node npm package.</li>
  <li>HTML canonical wiki files.</li>
  <li>Vanilla browser JS workspace.</li>
  <li>@wterm/dom for terminal rendering and node-pty plus WebSocket for local PTY sessions.</li>
  <li>Local-only server binding by default.</li>
</ul>`);
}

function designBriefPage(context) {
  return layout(context, "Design Brief", `<h1>Design Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: product definition and dogfood plan</li>
  <li>Confidence: medium</li>
</ul>
<h2>Interface Principles</h2>
<ul>
  <li>Dense, quiet, work-focused local development surface.</li>
  <li>Wiki navigation and terminal panels must remain scannable together.</li>
  <li>Visible controls only; no hidden agent automation.</li>
  <li>Repo files and Git are canonical, so the UI should reveal file paths and runtime boundaries.</li>
</ul>`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
