import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const pages = new Map([
  ["wiki/index.html", indexPage],
  ["wiki/AGENTS.html", agentsPage],
  ["wiki/log.html", logPage],
  ["wiki/sources.html", sourcesPage],
  ["wiki/scaffold-contract.html", scaffoldContractPage],
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
  ["wiki/sources/design-brief.html", designBriefPage],
  ["wiki/sources/import.html", importedSourcePage]
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
        command: context.scripts.includes("dev") ? packageRun(context, "dev") : "",
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
    panels.push({ name: "dev", role: "dev", command: packageRun(context, "dev") });
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
  const sourceDocument = String(options.source_document || "");
  const sourceDocumentType = String(options.source_document_type || "");
  const sourceEvidence = extractSourceEvidence(sourceDocument, sourceDocumentType, summary);
  const planningAnswers = normalizePlanningAnswers(options.planning_answers);
  const scripts = packageJson?.scripts ? Object.keys(packageJson.scripts).sort() : [];
  const readme = ["README.md", "readme.md", "README"].find((file) => existsSync(path.join(root, file))) || null;
  const gitBranch = await git(root, ["branch", "--show-current"]);
  const gitStatus = await git(root, ["status", "--short"]);
  const gitRoot = await git(root, ["rev-parse", "--show-toplevel"]);
  return {
    projectName,
    summary,
    sourceDocument,
    sourceDocumentType,
    sourceEvidence,
    planningAnswers,
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

function normalizePlanningAnswers(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    promise: String(source.promise || ""),
    prototype: String(source.prototype || ""),
    community: String(source.community || ""),
    validation: String(source.validation || "")
  };
}

function extractSourceEvidence(sourceDocument, sourceDocumentType, fallbackSummary) {
  const sections = sectionMap(sourceDocument, sourceDocumentType);
  return {
    hasSource: Boolean(sourceDocument.trim()),
    basis: sourceDocument.trim() ? `imported ${sourceDocumentType || "document"} with ${sections.length} detected sections plus human planning answers` : "repository metadata and init prompt",
    problem: sectionText(sections, "problem"),
    audience: sectionText(sections, "audience"),
    shape: sectionText(sections, "shape"),
    features: listItemsFor(sections, ["shape", "core features", "features"]),
    implementationNotes: listItemsFor(sections, ["implementation notes", "implementation"]),
    promotionCriteria: listItemsFor(sections, ["promotion criteria", "validation", "success criteria"]),
    summary: fallbackSummary
  };
}

function sectionMap(sourceDocument, sourceDocumentType) {
  if (!sourceDocument.trim()) return [];
  if (sourceDocumentType === "html" || /^\s*(<!doctype html|<html[\s>])/i.test(sourceDocument)) return htmlSections(sourceDocument);
  return markdownSections(sourceDocument);
}

function htmlSections(html) {
  const sections = [];
  for (const match of String(html).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)) {
    const chunk = match[1];
    const heading = textFromHtml((chunk.match(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i) || [""])[0]);
    if (!heading) continue;
    sections.push({
      heading: normalizeHeading(heading),
      text: textFromHtml(chunk),
      items: [...chunk.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((item) => textFromHtml(item[1])).filter(Boolean)
    });
  }
  return sections;
}

function markdownSections(markdown) {
  const sections = [];
  let current = null;
  for (const line of String(markdown).split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      current = { heading: normalizeHeading(heading[1]), text: "", items: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    current.text += `${line}\n`;
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) current.items.push(item[1].trim());
  }
  return sections.map((section) => ({ ...section, text: section.text.trim() }));
}

function textFromHtml(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeading(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sectionText(sections, heading) {
  const section = sections.find((item) => item.heading === heading);
  return section ? section.text.replace(new RegExp(`^${heading}\\s*`, "i"), "").trim() : "";
}

function listItemsFor(sections, headings) {
  const normalized = headings.map(normalizeHeading);
  return sections
    .filter((section) => normalized.includes(section.heading))
    .flatMap((section) => section.items.length ? section.items : [section.text])
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasGuidedPlan(context) {
  return Boolean(context.sourceEvidence?.hasSource && context.planningAnswers?.promise);
}

function listHtml(items) {
  return items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>Unknown.</li>";
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
    const existingPortless = typeof packageJson.portless === "object" && !Array.isArray(packageJson.portless) ? packageJson.portless : {};
    packageJson.portless = {
      ...existingPortless,
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

This project uses Hyperwiki's product scaffold for an HTML-first wiki:

- \`wiki/sources.html\` is the canonical source index. Do not add a duplicate \`wiki/Sources.html\`.
- \`wiki/AGENTS.html\` is the app-visible wiki agent guide. Root \`AGENTS.md\` remains the machine-readable agent entrypoint.
- Generated wiki pages link to Hyperwiki's app-served \`/assets/wiki.css\`; standalone embedded-CSS artifacts are an export or custom-artifact decision, not the default scaffold.
- Hyperwiki is Localhost Tooling: the local machine, repo files, Git state, terminal sessions, credentials, and environment variables are the trust boundary.

Use \`pnpm\` when this repository declares pnpm; otherwise follow the package manager in \`package.json\`.

Use Portless for local dev previews. Prefer \`${context.packageManager} run dev\` over fixed localhost ports so main and worktree previews get stable .localhost URLs.

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
  <link rel="icon" href="/favicon.ico" sizes="any">
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
  return layout(context, "Home", `<h1>${escapeHtml(context.projectName)}</h1>
<p>${escapeHtml(context.summary)}</p>
<section>
  <h2>Current Focus</h2>
  <p>Use this Localhost Tooling workspace to keep project plans, source context, architecture notes, development workflows, and verification status visible beside local files, Git state, terminal sessions, and agent handoffs.</p>
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
  <li>Use Portless for local dev previews and stable <code>.localhost</code> URLs.</li>
  <li>Use the <code>parallel-dev-worktrees</code> workflow for worktree execution.</li>
  <li>Keep runtime state out of the wiki unless it is intentionally exported.</li>
</ul>`);
}

function scaffoldContractPage(context) {
  return layout(context, "Scaffold Contract", `<h1>Scaffold Contract</h1>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: active product convention</li>
    <li>Source index: <code>wiki/sources.html</code></li>
    <li>Wiki agent guide: <code>wiki/AGENTS.html</code></li>
    <li>Default styling: app-served <code>/assets/wiki.css</code></li>
    <li>Runtime boundary: Localhost Tooling</li>
  </ul>
</section>
<h2>Decisions</h2>
<ul>
  <li><code>wiki/sources.html</code> is canonical for generated Hyperwiki projects. Do not create <code>wiki/Sources.html</code> unless a compatibility migration explicitly asks for it.</li>
  <li><code>wiki/AGENTS.html</code> is the visible wiki guide. Root <code>AGENTS.md</code> remains the agent entrypoint for CLI and editor tools.</li>
  <li>Generated pages use Hyperwiki's shared wiki stylesheet through <code>/assets/wiki.css</code>. Standalone embedded-CSS HTML belongs to custom artifacts or future export flows.</li>
  <li>Hyperwiki projects are local-first: repo files, Git state, terminal sessions, credentials, and environment variables stay inside the developer's local trust boundary.</li>
</ul>
<h2>Skill Compatibility</h2>
<p>When an agent uses an external project wiki skill, apply the planning, source, log, and audit workflow while preserving these Hyperwiki scaffold names and app-serving conventions.</p>`);
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
  const evidence = context.sourceEvidence;
  return layout(context, "Sources", `<h1>Sources</h1>
<section class="summary">
  <h2>Scaffold Contract</h2>
  <ul>
    <li>This lowercase <code>wiki/sources.html</code> file is the canonical Hyperwiki source index.</li>
    <li>Use <a href="/wiki/scaffold-contract.html">Scaffold Contract</a> before applying external wiki-skill templates that expect different filenames.</li>
  </ul>
</section>
<h2>Source Material</h2>
<ul>
  <li>Initialization context: generated by <code>hyperwiki init</code> on ${context.date}.</li>
  ${evidence?.hasSource ? `<li>Imported document: <a href="/wiki/sources/import.html">source import</a>.</li>` : ""}
  ${context.readme ? `<li>Repository README: <code>${escapeHtml(context.readme)}</code>.</li>` : "<li>Repository README: Unknown.</li>"}
  ${context.hasPackageJson ? "<li>Repository manifest: <code>package.json</code>.</li>" : "<li>Repository manifest: Unknown.</li>"}
</ul>
${hasGuidedPlan(context) ? `<h2>Planning Interview Answers</h2>
<ul>
  <li>First MVP promise: ${escapeHtml(context.planningAnswers.promise)}</li>
  <li>Prototype shape: ${escapeHtml(context.planningAnswers.prototype)}</li>
  <li>Community scope: ${escapeHtml(context.planningAnswers.community)}</li>
  <li>Validation target: ${escapeHtml(context.planningAnswers.validation)}</li>
</ul>` : ""}
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
  <li>hyperwiki is Localhost Tooling: the developer's machine, repo files, Git state, terminal sessions, credentials, and environment variables define the trust boundary.</li>
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
  if (hasGuidedPlan(context)) {
    return layout(context, "Plans", `<h1>Planning Dashboard</h1>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: active</li>
    <li>Shape: human-steered multi-stage MVP</li>
    <li>Current unit: Unit 01 - Lock Interview Decisions And Taxonomy</li>
    <li>Next action: implement the prototype path selected in the planning interview.</li>
    <li>Planning source: imported document plus in-app steering answers</li>
  </ul>
</section>
<p>Read the <a href="/wiki/plans/mvp/index.html">MVP plan</a>.</p>`);
  }
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
  if (hasGuidedPlan(context)) {
    return layout(context, "MVP Plan", `<h1>MVP Plan</h1>
<p>This plan was created after a source brief review and human planning interview. It treats the user's answers as durable product direction, not a transient prompt.</p>
<section class="summary">
  <h2>Interview Decisions</h2>
  <ul>
    <li>First MVP promise: ${escapeHtml(context.planningAnswers.promise)}</li>
    <li>Prototype shape: ${escapeHtml(context.planningAnswers.prototype)}</li>
    <li>Community scope: ${escapeHtml(context.planningAnswers.community)}</li>
    <li>Validation target: ${escapeHtml(context.planningAnswers.validation)}</li>
  </ul>
</section>
<ol>
  <li><a href="/wiki/plans/mvp/stage-01-foundation.html">Stage 01 - Interview decisions and taxonomy</a></li>
  <li><a href="/wiki/plans/mvp/stage-02-dev-workspace.html">Stage 02 - Selected prototype path</a></li>
  <li><a href="/wiki/plans/mvp/stage-03-dogfood-hardening.html">Stage 03 - Trust and validation readiness</a></li>
</ol>
<h2>Source-Grounded Direction</h2>
<p>${escapeHtml(context.sourceEvidence.shape || context.sourceEvidence.summary)}</p>`);
  }
  return layout(context, "MVP Plan", `<h1>MVP Plan</h1>
<p>This plan tracks the first useful project outcome for ${escapeHtml(context.projectName)}. Refine it after confirming product intent, technical constraints, and verification commands.</p>
<ol>
  <li><a href="/wiki/plans/mvp/stage-01-foundation.html">Stage 01 - Project direction and setup</a></li>
  <li><a href="/wiki/plans/mvp/stage-02-dev-workspace.html">Stage 02 - First implementation track</a></li>
  <li><a href="/wiki/plans/mvp/stage-03-dogfood-hardening.html">Stage 03 - Hardening and release readiness</a></li>
</ol>`);
}

function stageOnePage(context) {
  if (hasGuidedPlan(context)) {
    return stagePage(context, "Stage 01 - Interview Decisions And Taxonomy", [
      ["Unit 01 - Lock Interview Decisions And Taxonomy", "wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html"],
      ["Unit 02 - Define Pattern Entry Requirements", "wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.html"],
      ["Unit 03 - Sync Source Briefs With Answers", "wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.html"],
      ["Unit 04 - Define Prototype Acceptance Criteria", "wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.html"]
    ], "Turn the imported source and human steering answers into a decision-complete taxonomy, content model, and first prototype gate.");
  }
  return stagePage(context, "Stage 01 - Project Direction And Setup", [
    ["Unit 01 - Confirm Project Direction", "wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html"],
    ["Unit 02 - Review Repository Setup", "wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.html"],
    ["Unit 03 - Update Source Briefs", "wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.html"],
    ["Unit 04 - Define First Implementation Unit", "wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.html"]
  ], "Confirm project goals, audience, non-goals, and success criteria.");
}

function stageTwoPage(context) {
  if (hasGuidedPlan(context)) {
    return stagePage(context, "Stage 02 - Selected Prototype Path", [
      ["Unit 01 - Build The Selected MVP Promise", "wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.html"],
      ["Unit 02 - Add Source And Preview Detail Pages", "wiki/plans/mvp/stage-02-dev-workspace/unit-02-sync-plan-status.html"],
      ["Unit 03 - Seed Examples For The Validation Target", "wiki/plans/mvp/stage-02-dev-workspace/unit-03-record-validation.html"],
      ["Unit 04 - Keep Content Canonical In Repo Files", "wiki/plans/mvp/stage-02-dev-workspace/unit-04-preserve-canonical-truth.html"]
    ], context.planningAnswers.prototype);
  }
  return stagePage(context, "Stage 02 - First Implementation Track", [
    ["Unit 01 - Implement First Slice", "wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.html"],
    ["Unit 02 - Sync Plan Status", "wiki/plans/mvp/stage-02-dev-workspace/unit-02-sync-plan-status.html"],
    ["Unit 03 - Record Validation", "wiki/plans/mvp/stage-02-dev-workspace/unit-03-record-validation.html"],
    ["Unit 04 - Preserve Canonical Truth", "wiki/plans/mvp/stage-02-dev-workspace/unit-04-preserve-canonical-truth.html"]
  ], "Implement the first approved feature or architecture slice.");
}

function stageThreePage(context) {
  if (hasGuidedPlan(context)) {
    return stagePage(context, "Stage 03 - Trust And Validation Readiness", [
      ["Unit 01 - Close Prototype Verification Gaps", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-01-close-verification-gaps.html"],
      ["Unit 02 - Apply Community Scope Decision", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-02-harden-workflows.html"],
      ["Unit 03 - Update Durable Docs From Validation", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-03-update-durable-docs.html"],
      ["Unit 04 - Record Comparison And Handoff Notes", "wiki/plans/mvp/stage-03-dogfood-hardening/unit-04-record-handoff-notes.html"]
    ], `${context.planningAnswers.community}; validate against ${context.planningAnswers.validation}.`);
  }
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
  return (context) => {
    const guidedUnit = hasGuidedPlan(context) ? guidedUnitFor(stagePath, unitTitle, intent, context) : { stageTitle, unitTitle, intent };
    return layout(context, guidedUnit.unitTitle, `<h1>${escapeHtml(guidedUnit.unitTitle)}</h1>
<p><a href="/${stagePath}">${escapeHtml(guidedUnit.stageTitle)}</a></p>
<section class="summary">
  <h2>Summary</h2>
  <ul>
    <li>Status: pending</li>
    <li>${escapeHtml(guidedUnit.intent)}</li>
    <li>Verification: record automated or manual validation in <a href="/wiki/log.html">log.html</a>.</li>
  </ul>
</section>`);
  };
}

function guidedUnitFor(stagePath, unitTitle, fallbackIntent, context) {
  const answers = context.planningAnswers;
  const key = `${stagePath}::${unitTitle}`;
  const units = {
    "wiki/plans/mvp/stage-01-foundation.html::Unit 01 - Confirm Project Direction": ["Stage 01 - Interview Decisions And Taxonomy", "Unit 01 - Lock Interview Decisions And Taxonomy", `Preserve the selected MVP promise: ${answers.promise}.`],
    "wiki/plans/mvp/stage-01-foundation.html::Unit 02 - Review Repository Setup": ["Stage 01 - Interview Decisions And Taxonomy", "Unit 02 - Define Pattern Entry Requirements", "Define fields for task, tool, stack, file type, maturity, source URL, author, license, freshness, source Markdown, rendered preview, explanation, tradeoffs, and assumptions."],
    "wiki/plans/mvp/stage-01-foundation.html::Unit 03 - Update Source Briefs": ["Stage 01 - Interview Decisions And Taxonomy", "Unit 03 - Sync Source Briefs With Answers", "Update source briefs so the imported source and interview answers both remain visible to future agents."],
    "wiki/plans/mvp/stage-01-foundation.html::Unit 04 - Define First Implementation Unit": ["Stage 01 - Interview Decisions And Taxonomy", "Unit 04 - Define Prototype Acceptance Criteria", `Lock acceptance around this selected prototype shape: ${answers.prototype}.`],
    "wiki/plans/mvp/stage-02-dev-workspace.html::Unit 01 - Implement First Slice": ["Stage 02 - Selected Prototype Path", "Unit 01 - Build The Selected MVP Promise", answers.promise],
    "wiki/plans/mvp/stage-02-dev-workspace.html::Unit 02 - Sync Plan Status": ["Stage 02 - Selected Prototype Path", "Unit 02 - Add Source And Preview Detail Pages", "Show source Markdown, rendered preview, explanation, tradeoffs, assumptions, author, license, and freshness together."],
    "wiki/plans/mvp/stage-02-dev-workspace.html::Unit 03 - Record Validation": ["Stage 02 - Selected Prototype Path", "Unit 03 - Seed Examples For The Validation Target", answers.validation],
    "wiki/plans/mvp/stage-02-dev-workspace.html::Unit 04 - Preserve Canonical Truth": ["Stage 02 - Selected Prototype Path", "Unit 04 - Keep Content Canonical In Repo Files", "Store examples as repo-visible Markdown or structured files instead of hidden UI-only state."],
    "wiki/plans/mvp/stage-03-dogfood-hardening.html::Unit 01 - Close Verification Gaps": ["Stage 03 - Trust And Validation Readiness", "Unit 01 - Close Prototype Verification Gaps", "Verify browse, search, comparison, and copy/adapt workflows against the selected MVP promise."],
    "wiki/plans/mvp/stage-03-dogfood-hardening.html::Unit 02 - Harden Workflows": ["Stage 03 - Trust And Validation Readiness", "Unit 02 - Apply Community Scope Decision", answers.community],
    "wiki/plans/mvp/stage-03-dogfood-hardening.html::Unit 03 - Update Durable Docs": ["Stage 03 - Trust And Validation Readiness", "Unit 03 - Update Durable Docs From Validation", "Update product, technical, design, and roadmap docs from prototype evidence."],
    "wiki/plans/mvp/stage-03-dogfood-hardening.html::Unit 04 - Record Handoff Notes": ["Stage 03 - Trust And Validation Readiness", "Unit 04 - Record Comparison And Handoff Notes", "Record whether this human-steered flow produced a more trustworthy MVP plan than automatic generation."]
  };
  const fallbackStageTitle = stagePath.includes("stage-01")
    ? "Stage 01 - Interview Decisions And Taxonomy"
    : stagePath.includes("stage-02")
      ? "Stage 02 - Selected Prototype Path"
      : "Stage 03 - Trust And Validation Readiness";
  const [nextStageTitle, nextUnitTitle, nextIntent] = units[key] || [fallbackStageTitle, unitTitle, fallbackIntent];
  return { stageTitle: nextStageTitle, unitTitle: nextUnitTitle, intent: nextIntent };
}

function prdPage(context) {
  if (hasGuidedPlan(context)) {
    return layout(context, "Product Brief", `<h1>Product Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: ${escapeHtml(context.sourceEvidence.basis)}</li>
  <li>Confidence: medium</li>
</ul>
<h2>Problem</h2>
<p>${escapeHtml(context.sourceEvidence.problem || context.sourceEvidence.summary)}</p>
<h2>Audience</h2>
<p>${escapeHtml(context.sourceEvidence.audience || "Unknown.")}</p>
<h2>Human-Steered MVP Promise</h2>
<p>${escapeHtml(context.planningAnswers.promise)}</p>
<h2>Core Features</h2>
<ul>${listHtml(context.sourceEvidence.features)}</ul>
<h2>Validation Target</h2>
<p>${escapeHtml(context.planningAnswers.validation)}</p>`);
  }
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
  if (hasGuidedPlan(context)) {
    return layout(context, "Technical Brief", `<h1>Technical Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: imported source plus planning interview</li>
  <li>Confidence: medium</li>
</ul>
<h2>Selected Prototype Shape</h2>
<p>${escapeHtml(context.planningAnswers.prototype)}</p>
<h2>Imported Implementation Notes</h2>
<ul>${listHtml(context.sourceEvidence.implementationNotes)}</ul>
<h2>Technical Defaults</h2>
<ul>
  <li>Keep content canonical in repo-visible Markdown or structured files.</li>
  <li>Start with local indexed content before crawler or GitHub import workflows.</li>
  <li>Defer backend-heavy community features unless the interview selected them explicitly.</li>
</ul>`);
  }
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
  <li>Dev preview command: <code>${context.scripts.includes("dev") ? escapeHtml(packageRun(context, "dev")) : "Unknown"}</code>.</li>
  <li>Worktree preview pattern: <code>https://&lt;branch-slug&gt;.${escapeHtml(slugify(context.projectName))}.localhost</code>.</li>
  <li>Canonical wiki files are HTML under <code>wiki/</code>, with the source index at <code>wiki/sources.html</code>.</li>
  <li>The app-visible wiki guide is <code>wiki/AGENTS.html</code>; root <code>AGENTS.md</code> remains the agent entrypoint.</li>
  <li>Generated wiki pages link to Hyperwiki's app-served <code>/assets/wiki.css</code> by default.</li>
  <li>Local runtime state belongs under ignored <code>.hyperwiki/</code> paths.</li>
</ul>`);
}

function designBriefPage(context) {
  if (hasGuidedPlan(context)) {
    return layout(context, "Design Brief", `<h1>Design Brief</h1>
<h2>Status</h2>
<ul>
  <li>Last reviewed: ${context.date}</li>
  <li>Evidence basis: imported source plus human-steered plan</li>
  <li>Confidence: medium</li>
</ul>
<h2>Interface Direction</h2>
<ul>
  <li>Design direction: developer planning desk, optimized for comparing Markdown source, rendered preview, and workflow context.</li>
  <li>Browse surfaces should support fast scanning by task, tool, stack, maturity, freshness, and license.</li>
  <li>The UI should feel like a reference library for project infrastructure, not a generic prompt marketplace.</li>
</ul>`);
  }
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

function importedSourcePage(context) {
  if (!context.sourceEvidence?.hasSource) {
    return layout(context, "Imported Source", `<h1>Imported Source</h1><p>No imported source document was provided during initialization.</p>`);
  }
  return layout(context, "Imported Source", `<h1>Imported Source</h1>
<section class="summary">
  <h2>Planning Interview</h2>
  <ul>
    <li>First MVP promise: ${escapeHtml(context.planningAnswers.promise || "Unknown")}</li>
    <li>Prototype shape: ${escapeHtml(context.planningAnswers.prototype || "Unknown")}</li>
    <li>Community scope: ${escapeHtml(context.planningAnswers.community || "Unknown")}</li>
    <li>Validation target: ${escapeHtml(context.planningAnswers.validation || "Unknown")}</li>
  </ul>
</section>
<pre><code>${escapeHtml(context.sourceDocument)}</code></pre>`);
}
