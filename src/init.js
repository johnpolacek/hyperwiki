import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const pages = new Map([
  ["wiki/index.html", indexPage],
  ["wiki/AGENTS.html", agentsPage],
  ["wiki/log.html", logPage],
  ["wiki/sources.html", sourcesPage],
  ["wiki/ideas/index.html", ideasIndexPage],
  ["wiki/roadmap.html", roadmapPage],
  ["wiki/architecture.html", architecturePage],
  ["wiki/dev.html", devPage],
  ["wiki/plans/index.html", plansIndexPage],
  ["wiki/plans/mvp/index.html", mvpIndexPage],
  ["wiki/plans/mvp/stage-01-foundation.html", stageOnePage],
  ["wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html", stageUnitPage("Stage 01 - Project Direction And Setup", "wiki/plans/mvp/stage-01-foundation.html", "Unit 01 - Confirm Project Direction", "Confirm project goals, audience, non-goals, and success criteria.")],
  ["wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.html", stageUnitPage("Stage 01 - Project Direction And Setup", "wiki/plans/mvp/stage-01-foundation.html", "Unit 02 - Review Repository Setup", "Review repository setup and development commands.")],
  ["wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.html", stageUnitPage("Stage 01 - Project Direction And Setup", "wiki/plans/mvp/stage-01-foundation.html", "Unit 03 - Update Source Briefs", "Update source briefs and roadmap from real project evidence.")],
  ["wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.html", stageUnitPage("Stage 01 - Project Direction And Setup", "wiki/plans/mvp/stage-01-foundation.html", "Unit 04 - Define First Implementation Unit", "Define the first implementation unit and verification path.")],
  ["wiki/plans/mvp/stage-02-dev-workspace.html", stageTwoPage],
  ["wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.html", stageUnitPage("Stage 02 - First Implementation Track", "wiki/plans/mvp/stage-02-dev-workspace.html", "Unit 01 - Implement First Slice", "Implement the first approved feature or architecture slice.")],
  ["wiki/plans/mvp/stage-02-dev-workspace/unit-02-sync-plan-status.html", stageUnitPage("Stage 02 - First Implementation Track", "wiki/plans/mvp/stage-02-dev-workspace.html", "Unit 02 - Sync Plan Status", "Keep plan status and source context synchronized with discoveries.")],
  ["wiki/plans/mvp/stage-02-dev-workspace/unit-03-record-validation.html", stageUnitPage("Stage 02 - First Implementation Track", "wiki/plans/mvp/stage-02-dev-workspace.html", "Unit 03 - Record Validation", "Record validation that changes project confidence or next steps.")],
  ["wiki/plans/mvp/stage-02-dev-workspace/unit-04-preserve-canonical-truth.html", stageUnitPage("Stage 02 - First Implementation Track", "wiki/plans/mvp/stage-02-dev-workspace.html", "Unit 04 - Preserve Canonical Truth", "Avoid hidden UI-only state; keep repo files and Git canonical.")],
  ["wiki/plans/mvp/stage-03-dogfood-hardening.html", stageThreePage],
  ["wiki/plans/mvp/stage-03-dogfood-hardening/unit-01-close-verification-gaps.html", stageUnitPage("Stage 03 - Hardening And Release Readiness", "wiki/plans/mvp/stage-03-dogfood-hardening.html", "Unit 01 - Close Verification Gaps", "Close gaps found during implementation and verification.")],
  ["wiki/plans/mvp/stage-03-dogfood-hardening/unit-02-harden-workflows.html", stageUnitPage("Stage 03 - Hardening And Release Readiness", "wiki/plans/mvp/stage-03-dogfood-hardening.html", "Unit 02 - Harden Workflows", "Harden setup, test, security, accessibility, or release workflows as relevant.")],
  ["wiki/plans/mvp/stage-03-dogfood-hardening/unit-03-update-durable-docs.html", stageUnitPage("Stage 03 - Hardening And Release Readiness", "wiki/plans/mvp/stage-03-dogfood-hardening.html", "Unit 03 - Update Durable Docs", "Update durable docs and source briefs from final implementation evidence.")],
  ["wiki/plans/mvp/stage-03-dogfood-hardening/unit-04-record-handoff-notes.html", stageUnitPage("Stage 03 - Hardening And Release Readiness", "wiki/plans/mvp/stage-03-dogfood-hardening.html", "Unit 04 - Record Handoff Notes", "Record completion criteria and release or handoff notes.")],
  ["wiki/sources/prd.html", prdPage],
  ["wiki/sources/technical-brief.html", technicalBriefPage],
  ["wiki/sources/design-brief.html", designBriefPage]
]);

export async function inithyperwiki(root, options = {}) {
  const context = await inspectProject(root, options);
  await ensurePortlessPackage(root, context, options);
  await mkdir(path.join(root, ".hyperwiki", "state"), { recursive: true });
  await mkdir(path.join(root, ".hyperwiki", "sessions"), { recursive: true });
  await writeIfSafe(
    path.join(root, ".hyperwiki", "config.json"),
    `${JSON.stringify({
      projectName: context.projectName,
      canonicalWiki: "html",
      dev: {
        host: "127.0.0.1",
        port: 4177,
        command: context.scripts.includes("dev") ? "portless" : "",
        previewUrl: `https://${slugify(context.projectName)}.localhost`
      },
      worktrees: {
        previewUrlPattern: `https://<branch-slug>.${slugify(context.projectName)}.localhost`,
        workflow: "parallel-dev-worktrees"
      },
      agent: {
        launchCommand: context.agentLaunchCommand
      },
      layout: {
        panels: defaultPanels(context)
      },
      runtimeState: ".hyperwiki/state",
      sessions: ".hyperwiki/sessions"
    }, null, 2)}\n`,
    options
  );

  await writeIfSafe(path.join(root, "AGENTS.md"), agentsMarkdown(context), options);

  for (const [relativePath, render] of pages) {
    await writeIfSafe(path.join(root, relativePath), render(context), options);
  }

  console.log(`Initialized hyperwiki for ${context.projectName}`);
  console.log("Run: npx hyperwiki");
}

function defaultPanels(context) {
  const panels = [];
  if (context.agentLaunchCommand) {
    panels.push({ name: "agent", role: "agent", command: context.agentLaunchCommand });
  }
  if (context.scripts.includes("dev")) {
    panels.push({ name: "dev", role: "dev", command: "portless" });
  }
  panels.push({ name: "cli", role: "shell", command: null });
  return panels;
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
      "Project summary is not known yet. Update this page after the repository purpose is clarified."
  );
  const scripts = packageJson?.scripts ? Object.keys(packageJson.scripts).sort() : [];
  const readme = ["README.md", "readme.md", "README"].find((file) => existsSync(path.join(root, file))) || null;
  const gitBranch = await git(root, ["branch", "--show-current"]);
  const gitStatus = await git(root, ["status", "--short"]);
  const gitRoot = await git(root, ["rev-parse", "--show-toplevel"]);
  return {
    projectName,
    summary,
    date: new Date().toISOString().slice(0, 10),
    scripts,
    readme,
    hasPackageJson: Boolean(packageJson),
    packageManager: detectPackageManager(root, packageJson),
    agentLaunchCommand: String(options.agent_launch_command || ""),
    git: {
      root: gitRoot.ok ? gitRoot.stdout : null,
      branch: gitBranch.ok && gitBranch.stdout ? gitBranch.stdout : null,
      dirty: gitStatus.ok ? gitStatus.stdout.length > 0 : null,
      status: gitStatus.ok ? gitStatus.stdout.split("\n").filter(Boolean) : []
    }
  };
}

async function ensurePortlessPackage(root, context, options) {
  if (options.skip_portless || !context.hasPackageJson) return;
  const packagePath = path.join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const hasPortless = Boolean(packageJson.dependencies?.portless || packageJson.devDependencies?.portless);
  if (!hasPortless) {
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      portless: "latest"
    };
  }
  if (packageJson.scripts?.dev && packageJson.scripts.dev !== "portless" && !packageJson.scripts["dev:app"]) {
    packageJson.scripts = {
      ...packageJson.scripts,
      "dev:app": packageJson.scripts.dev,
      dev: "portless"
    };
    packageJson.portless = {
      ...(packageJson.portless || {}),
      script: "dev:app"
    };
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

function detectPackageManager(root, packageJson) {
  const declared = typeof packageJson?.packageManager === "string" ? packageJson.packageManager.split("@")[0] : null;
  if (declared) return declared;
  if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(root, "bun.lockb")) || existsSync(path.join(root, "bun.lock"))) return "bun";
  return "npm";
}

function packageRun(context, script) {
  return `${context.packageManager} run ${script}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function agentsMarkdown(context) {
  return `# AGENTS.md instructions for ${context.projectName}

Read \`wiki/index.html\` before project-specific work and use \`wiki/sources.html\` as the source index.

Use \`pnpm\` when this repository declares pnpm; otherwise follow the package manager in \`package.json\`.

Use Portless for local dev previews. Prefer \`portless\` / \`${context.packageManager} run dev\` over fixed localhost ports so main and worktree previews get stable .localhost URLs.

Use the \`parallel-dev-worktrees\` skill for worktree execution. Feature worktrees should use the preview pattern \`https://<branch-slug>.${slugify(context.projectName)}.localhost\`.

Create or update \`wiki/plans/\` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
`;
}

function git(root, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: root }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
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
      <a href="/wiki/ideas/index.html">Ideas</a>
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
  return layout(context, "Home", `<h1>${escapeHtml(context.projectName)}</h1>
<p>${escapeHtml(context.summary)}</p>
<section>
  <h2>Current Focus</h2>
  <p>Use this wiki to keep project plans, source context, architecture notes, development workflows, and verification status visible beside the local workspace.</p>
</section>
<section>
  <h2>Core Pages</h2>
  <ul>
    <li><a href="/wiki/architecture.html">Architecture</a></li>
    <li><a href="/wiki/dev.html">Development workflow</a></li>
    <li><a href="/wiki/plans/index.html">Planning dashboard</a></li>
    <li><a href="/wiki/ideas/index.html">Idea incubation</a></li>
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
  <li>Use Portless for local dev previews and stable <code>.localhost</code> URLs.</li>
  <li>Use the <code>parallel-dev-worktrees</code> workflow for worktree execution.</li>
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
  <li>Initialization context: generated by <code>hyperwiki init</code> on ${context.date}.</li>
  ${context.readme ? `<li>Repository README: <code>${escapeHtml(context.readme)}</code>.</li>` : "<li>Repository README: Unknown.</li>"}
  ${context.hasPackageJson ? "<li>Repository manifest: <code>package.json</code>.</li>" : "<li>Repository manifest: Unknown.</li>"}
</ul>
<h2>Generated Source Briefs</h2>
<ul>
  <li><a href="/wiki/sources/prd.html">Product brief</a></li>
  <li><a href="/wiki/sources/technical-brief.html">Technical brief</a></li>
  <li><a href="/wiki/sources/design-brief.html">Design brief</a></li>
</ul>
<h2>Unknowns</h2>
<ul>
  <li>Project audience, scope, and non-goals need confirmation if they are not already documented in source files.</li>
  <li>Architecture and verification expectations should be refined as implementation evidence grows.</li>
</ul>`);
}

function ideasIndexPage(context) {
  return layout(context, "Ideas", `<h1>Ideas</h1>
<p>Use this area for free-form concepts that are not full projects yet. When an idea is ready, initialize it as a hyperwiki project from the workspace dashboard.</p>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: incubating</li>
    <li>Shape: free-form idea pages</li>
    <li>Next action: add one HTML page per idea under <code>wiki/ideas/</code>.</li>
  </ul>
</section>`);
}

function roadmapPage(context) {
  return layout(context, "Roadmap", `<h1>Roadmap</h1>
<ol>
  <li>Confirm project goals, non-goals, and source material.</li>
  <li>Keep the active implementation plan current under <a href="/wiki/plans/index.html">plans</a>.</li>
  <li>Record durable decisions and validation results in <a href="/wiki/log.html">log</a>.</li>
  <li>Update architecture and development workflow pages as repository evidence changes.</li>
</ol>`);
}

function architecturePage(context) {
  return layout(context, "Architecture", `<h1>Architecture</h1>
<p>This page maps durable architecture decisions and repository boundaries for ${escapeHtml(context.projectName)}.</p>
<h2>Boundaries</h2>
<ul>
  <li>Repository root: <code>${escapeHtml(context.git.root || "Unknown")}</code>.</li>
  <li>Primary manifest: <code>${context.hasPackageJson ? "package.json" : "Unknown"}</code>.</li>
  <li>Current Git branch at initialization: <code>${escapeHtml(context.git.branch || "Unknown")}</code>.</li>
  <li>The wiki is canonical repo-visible HTML for maintained project context.</li>
  <li>Runtime state is ignored under <code>.hyperwiki/state/</code> and <code>.hyperwiki/sessions/</code>.</li>
</ul>`);
}

function devPage(context) {
  const commands = context.scripts.length
    ? context.scripts.map((script) => packageRun(context, script))
    : ["Project commands are unknown. Add setup, development, test, and verification commands here."];
  return layout(context, "Development", `<h1>Development</h1>
<h2>Commands</h2>
<pre><code>${commands.map(escapeHtml).join("\n")}</code></pre>
<h2>hyperwiki</h2>
<pre><code>npx hyperwiki</code></pre>
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
    <li>Current unit: Unit 01 - Confirm Project Direction</li>
    <li>Next action: review generated source briefs, confirm missing project intent, and refine the first implementation plan.</li>
    <li>Blockers: none</li>
    <li>Validation: project-specific checks to be added after repository commands are confirmed</li>
  </ul>
</section>
<p>Read the <a href="/wiki/plans/mvp/index.html">MVP plan</a>.</p>`);
}

function mvpIndexPage(context) {
  return layout(context, "MVP Plan", `<h1>MVP Plan</h1>
<p>This plan tracks the first useful project outcome for ${escapeHtml(context.projectName)}. Refine it after confirming product intent, technical constraints, and verification commands.</p>
<ol>
  <li><a href="/wiki/plans/mvp/stage-01-foundation.html">Stage 01 - Project direction and setup</a></li>
  <li><a href="/wiki/plans/mvp/stage-02-dev-workspace.html">Stage 02 - First implementation track</a></li>
  <li><a href="/wiki/plans/mvp/stage-03-dogfood-hardening.html">Stage 03 - Hardening and release readiness</a></li>
</ol>`);
}

function stageOnePage(context) {
  return stagePage(context, "Stage 01 - Project Direction And Setup", [
    ["Unit 01 - Confirm Project Direction", "wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html"],
    ["Unit 02 - Review Repository Setup", "wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.html"],
    ["Unit 03 - Update Source Briefs", "wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.html"],
    ["Unit 04 - Define First Implementation Unit", "wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.html"]
  ], "Confirm project goals, audience, non-goals, and success criteria.");
}

function stageTwoPage(context) {
  return stagePage(context, "Stage 02 - First Implementation Track", [
    ["Unit 01 - Implement First Slice", "wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.html"],
    ["Unit 02 - Sync Plan Status", "wiki/plans/mvp/stage-02-dev-workspace/unit-02-sync-plan-status.html"],
    ["Unit 03 - Record Validation", "wiki/plans/mvp/stage-02-dev-workspace/unit-03-record-validation.html"],
    ["Unit 04 - Preserve Canonical Truth", "wiki/plans/mvp/stage-02-dev-workspace/unit-04-preserve-canonical-truth.html"]
  ], "Implement the first approved feature or architecture slice.");
}

function stageThreePage(context) {
  return stagePage(context, "Stage 03 - Hardening And Release Readiness", [
    ["Unit 01 - Close Verification Gaps", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-01-close-verification-gaps.html"],
    ["Unit 02 - Harden Workflows", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-02-harden-workflows.html"],
    ["Unit 03 - Update Durable Docs", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-03-update-durable-docs.html"],
    ["Unit 04 - Record Handoff Notes", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-04-record-handoff-notes.html"]
  ], "Close gaps found during implementation and verification.");
}

function stagePage(context, title, units, intent) {
  return layout(context, title, `<h1>${escapeHtml(title)}</h1>
<h2>Intent</h2>
<p>${escapeHtml(intent)}</p>
<h2>Execution Units</h2>
<ol>${units.map(([label, href]) => `<li><a href="/${href}">${escapeHtml(label)}</a></li>`).join("")}</ol>
<h2>Verification</h2>
<p>Record automated or manual validation in <a href="/wiki/log.html">log.html</a> before marking this stage complete.</p>`);
}

function stageUnitPage(stageTitle, stagePath, unitTitle, intent) {
  return (context) => layout(context, unitTitle, `<h1>${escapeHtml(unitTitle)}</h1>
<p><a href="/${stagePath}">${escapeHtml(stageTitle)}</a></p>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: pending</li>
    <li>${escapeHtml(intent)}</li>
    <li>Verification: record automated or manual validation in <a href="/wiki/log.html">log.html</a>.</li>
  </ul>
</section>`);
}

function prdPage(context) {
  return layout(context, "Product Brief", `<h1>Product Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: repository metadata and init prompt</li>
  <li>Confidence: low</li>
</ul>
<h2>Product Intent</h2>
<p>${escapeHtml(context.summary)}</p>
<h2>Primary Flow</h2>
<ol>
  <li>Confirm the user journey and primary project workflow.</li>
  <li>Identify the first implementation slice that creates user-visible value.</li>
  <li>Keep acceptance criteria and non-goals current as evidence improves.</li>
</ol>`);
}

function technicalBriefPage(context) {
  return layout(context, "Technical Brief", `<h1>Technical Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: repository metadata at initialization</li>
  <li>Confidence: low</li>
</ul>
<h2>Defaults</h2>
<ul>
  <li>Package manifest present: <code>${context.hasPackageJson ? "yes" : "no"}</code>.</li>
  <li>Known scripts: <code>${escapeHtml(context.scripts.join(", ") || "Unknown")}</code>.</li>
  <li>Git branch at initialization: <code>${escapeHtml(context.git.branch || "Unknown")}</code>.</li>
  <li>Dev preview command: <code>${context.scripts.includes("dev") ? "portless" : "Unknown"}</code>.</li>
  <li>Worktree preview pattern: <code>https://&lt;branch-slug&gt;.${escapeHtml(slugify(context.projectName))}.localhost</code>.</li>
  <li>Canonical wiki files are HTML under <code>wiki/</code>.</li>
  <li>Local runtime state belongs under ignored <code>.hyperwiki/</code> paths.</li>
</ul>`);
}

function designBriefPage(context) {
  return layout(context, "Design Brief", `<h1>Design Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: initialization defaults</li>
  <li>Confidence: low</li>
</ul>
<h2>Interface Principles</h2>
<ul>
  <li>Document durable UI principles here if this project has a user-facing interface.</li>
  <li>Keep visual and interaction decisions grounded in product audience and workflow.</li>
  <li>Record accessibility, responsive layout, and design-system expectations when known.</li>
  <li>Unknown design direction should stay explicit instead of inferred.</li>
</ul>`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
