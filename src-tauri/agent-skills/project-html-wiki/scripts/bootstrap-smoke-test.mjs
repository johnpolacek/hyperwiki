import { mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "bootstrap-smoke", "invoice-review");
const wikiDir = path.join(outDir, "wiki");

const pageCss = `
  :root {
    color-scheme: light;
    --bg: #f5f6f1;
    --panel: #ffffff;
    --ink: #1f2629;
    --muted: #5f6c70;
    --line: #dfe5e0;
    --accent: #1f6f78;
    --accent-2: #7a4e24;
    --good: #1f7a4d;
    --warn: #94670a;
    --risk: #9a3d32;
    --shadow: 0 18px 48px rgba(31, 38, 41, 0.08);
    --focus: 0 0 0 3px rgba(31, 111, 120, 0.22);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--ink);
    background: radial-gradient(circle at top left, rgba(31, 111, 120, 0.08), transparent 32rem), var(--bg);
    line-height: 1.5;
  }
  main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 52px; }
  header { display: grid; gap: 12px; padding: 26px 0 22px; border-bottom: 1px solid var(--line); }
  h1, h2, h3 { margin: 0; line-height: 1.18; }
  h1 { font-size: clamp(2rem, 4vw, 3.25rem); max-width: 14ch; }
  h2 { font-size: 1.08rem; }
  h3 { font-size: 1rem; }
  p { margin: 0; }
  a { color: var(--accent); font-weight: 700; text-decoration-thickness: 0.08em; text-underline-offset: 0.16em; }
  code { background: #eef1ed; border: 1px solid #d9ded8; border-radius: 5px; padding: 0.08rem 0.28rem; }
  .eyebrow, .label { color: var(--muted); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
  .lede { max-width: 780px; color: var(--muted); font-size: 1.05rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(235px, 1fr)); gap: 14px; margin-top: 18px; }
  a:focus-visible { outline: none; box-shadow: var(--focus); border-radius: 4px; }
  .panel, .card, .metric, section.callout, .reader-goal, .status-rail, .flow-map {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px;
  }
  .card { display: grid; gap: 8px; min-height: 118px; }
  .focus { margin-top: 20px; border-left: 4px solid var(--accent); background: #eef7f6; }
  .reader-goal { margin-top: 18px; background: #11191b; color: #f4f7f3; border-color: #11191b; box-shadow: var(--shadow); }
  .reader-goal .label { color: #a8c9c9; }
  .command-hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr); gap: 18px; align-items: stretch; }
  .status-rail { display: grid; gap: 10px; background: #fbfaf5; }
  .rail-item { display: grid; grid-template-columns: 12px 1fr; gap: 10px; align-items: start; }
  .rail-dot { width: 10px; height: 10px; margin-top: 7px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 4px rgba(31,111,120,.12); }
  .flow-map svg { width: 100%; height: auto; display: block; margin-top: 10px; }
  .flow-map rect { fill: #eef7f6; stroke: #9bc6c7; }
  .flow-map path { stroke: #7a4e24; stroke-width: 3; fill: none; stroke-linecap: round; }
  .flow-map text { fill: var(--ink); font-size: 13px; font-weight: 800; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: 18px 0; }
  .value { display: block; margin-top: 4px; font-weight: 850; overflow-wrap: anywhere; }
  .section-stack { display: grid; gap: 16px; margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.95rem; }
  th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #e7ece6; padding: 10px; }
  th { color: #46575b; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
  th, td { overflow-wrap: anywhere; }
  ul, ol { margin: 8px 0 0; padding-left: 1.2rem; }
  li { margin: 6px 0; }
  .tag { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 9px; font-size: 0.78rem; font-weight: 800; background: #eaf2f2; color: var(--accent); }
  .tag.warn { background: #fff2d7; color: var(--warn); }
  .tag.risk { background: #fae8e5; color: var(--risk); }
  .two-col { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr); gap: 16px; align-items: start; }
  .back { display: inline-block; margin-bottom: 14px; }
  @media (max-width: 760px) {
    main { width: min(100% - 24px, 1120px); padding-top: 22px; }
    header { padding-top: 14px; }
    .command-hero { grid-template-columns: 1fr; }
    .two-col { grid-template-columns: 1fr; }
    table.responsive-table, table.responsive-table thead, table.responsive-table tbody, table.responsive-table tr, table.responsive-table th, table.responsive-table td { display: block; width: 100%; }
    table.responsive-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    table.responsive-table tr { border-bottom: 1px solid #e1e7e2; padding: 10px 0; }
    table.responsive-table td { border: 0; padding: 6px 0; }
    table.responsive-table td::before { content: attr(data-label); display: block; margin-bottom: 2px; color: #647074; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
  }
`;

function html(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="visual-concept" content="operator command center">
  <title>${title}</title>
  <style>${pageCss}</style>
</head>
<body>${body}</body>
</html>
`;
}

const files = new Map([
  ["AGENTS.md", `# AGENTS.md instructions for Invoice Review

<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
## Invoice Review Agent Guide

### Project Wiki

- Read \`wiki/index.html\` before answering project-specific questions or making structural changes.
- Keep durable project knowledge, plans, decisions, and project-context history under \`wiki/\`.
- Use \`wiki/Sources.html\` as the source index.
- Create or update \`wiki/plans/\` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.

### Automation Policy

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->
`],
  ["wiki/AGENTS.md", `# Invoice Review Wiki Agent Guide

<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
This \`wiki/\` directory is the maintained knowledge and planning layer for \`Invoice Review\`.

Read \`index.html\` before structural wiki changes. Keep durable project knowledge, planning, decisions, and validation notes under \`wiki/\`. Use standalone HTML pages with embedded CSS, relative links, semantic structure, and accessible tables, diagrams, or controls when they improve readability.
<!-- PROJECT-HTML-WIKI-SKILL:END -->
`],
  ["wiki/index.html", html("Invoice Review Wiki", `<main>
  <header>
    <p class="eyebrow">Project wiki</p>
    <h1>Invoice Review</h1>
    <p class="lede">Internal finance-operator app for reviewing pending invoices, flagging missing vendor data, approving or rejecting invoices, and exporting approved invoice IDs.</p>
  </header>
  <section class="reader-goal" aria-labelledby="reader-goal">
    <span class="label">Reader Goal</span>
    <h2 id="reader-goal">Know what to inspect first</h2>
    <p>After 2 minutes, the reader can identify the active review-queue plan, source briefs, and the four decisions blocking implementation.</p>
  </section>
  <div class="command-hero">
    <section class="panel focus" aria-labelledby="current-focus">
      <h2 id="current-focus">Current Focus</h2>
      <p>Confirm invoice schema, authentication/session boundary, audit persistence, and export destination before implementation changes.</p>
    </section>
    <section class="status-rail" aria-labelledby="handoff-rail">
      <h2 id="handoff-rail">Handoff Rail</h2>
      <div class="rail-item"><span class="rail-dot"></span><p><strong>Evidence:</strong> source note plus existing Next.js app structure.</p></div>
      <div class="rail-item"><span class="rail-dot"></span><p><strong>Plan:</strong> focused feature plan, not MVP stages.</p></div>
      <div class="rail-item"><span class="rail-dot"></span><p><strong>Risk:</strong> audit persistence and export destination are still unknown.</p></div>
    </section>
  </div>
  <section aria-labelledby="core-pages">
    <h2 id="core-pages" style="margin-top: 28px;">Core Pages</h2>
    <div class="grid">
      <article class="card"><h3><a href="AGENTS.md">Wiki Agent Guide</a></h3><p>Local wiki maintenance contract.</p></article>
      <article class="card"><h3><a href="log.html">Project Log</a></h3><p>Durable project-context changelog.</p></article>
      <article class="card"><h3><a href="Sources.html">Sources</a></h3><p>Source material, evidence, and unknowns.</p></article>
      <article class="card"><h3><a href="plans/index.html">Plans</a></h3><p>Planning dashboard and implementation contract.</p></article>
      <article class="card"><h3><a href="roadmap.html">Roadmap</a></h3><p>Current goal, next decision, and staged direction.</p></article>
    </div>
  </section>
  <section aria-labelledby="source-briefs" class="panel" style="margin-top: 18px;">
    <h2 id="source-briefs">Source Briefs</h2>
    <p><a href="sources/prd.html">PRD</a>, <a href="sources/technical-brief.html">Technical Brief</a>, and <a href="sources/design-brief.html">Design Brief</a> were generated from source notes and repository evidence. No marketing brief was created because there is no public-entry signal.</p>
  </section>
</main>`)],
  ["wiki/Sources.html", html("Invoice Review Sources", `<main>
  <a class="back" href="index.html">Back to wiki index</a>
  <header>
    <p class="eyebrow">Source index</p>
    <h1>Sources</h1>
    <p class="lede">Catalog of source material, repository evidence, generated briefs, and unresolved unknowns for <strong>Invoice Review</strong>.</p>
  </header>
  <section class="reader-goal" aria-labelledby="source-reader-goal">
    <span class="label">Reader Goal</span>
    <h2 id="source-reader-goal">Separate evidence from assumptions</h2>
    <p>After 2 minutes, the reader can tell which claims came from source notes, which came from repository evidence, and which decisions remain unknown.</p>
  </section>
  <div class="section-stack">
    <section class="panel" aria-labelledby="source-material">
      <h2 id="source-material">Source Material</h2>
      <table class="responsive-table">
        <thead><tr><th>Source</th><th>What It Contributes</th><th>Confidence</th></tr></thead>
        <tbody>
          <tr><td data-label="Source">User source note</td><td data-label="What It Contributes">Internal invoice review queue, approve/reject/export workflows, auditability constraint, payment execution out of scope.</td><td data-label="Confidence"><span class="tag">medium</span></td></tr>
          <tr><td data-label="Source">Repository evidence</td><td data-label="What It Contributes">Next.js, React, TypeScript, Vitest, existing app and component directories.</td><td data-label="Confidence"><span class="tag">high</span></td></tr>
        </tbody>
      </table>
    </section>
    <section class="panel" aria-labelledby="repo-evidence">
      <h2 id="repo-evidence">Repository Evidence</h2>
      <ul>
        <li><code>package.json</code> uses Next.js, React, TypeScript, and Vitest.</li>
        <li><code>src/app/</code> and <code>src/components/</code> indicate an existing frontend app.</li>
        <li>Existing <code>AGENTS.md</code> has no recognized managed markers.</li>
      </ul>
    </section>
    <section class="panel" aria-labelledby="briefs">
      <h2 id="briefs">Generated Source Briefs</h2>
      <ul>
        <li><a href="sources/prd.html">PRD</a> for product intent and workflow.</li>
        <li><a href="sources/technical-brief.html">Technical Brief</a> for implementation surfaces and risks.</li>
        <li><a href="sources/design-brief.html">Design Brief</a> for operator workflow design principles.</li>
      </ul>
    </section>
    <section class="panel" aria-labelledby="unknowns">
      <h2 id="unknowns">Unknowns</h2>
      <ul>
        <li>Exact invoice data source and schema.</li>
        <li>Existing authentication/session API boundary.</li>
        <li>Required audit log storage location.</li>
        <li>Export format and destination.</li>
      </ul>
    </section>
  </div>
</main>`)],
  ["wiki/plans/index.html", html("Invoice Review Plans", `<main>
  <a class="back" href="../index.html">Back to wiki index</a>
  <header>
    <p class="eyebrow">Plan dashboard</p>
    <h1>Plans</h1>
    <p class="lede">Durable implementation plans for Invoice Review. Existing live-product work uses focused feature plans rather than an MVP folder by default.</p>
  </header>
  <section class="reader-goal" aria-labelledby="plans-reader-goal">
    <span class="label">Reader Goal</span>
    <h2 id="plans-reader-goal">Find the next executable unit</h2>
    <p>After 2 minutes, the reader can open the active feature plan and name the next decision required before code changes.</p>
  </section>
  <div class="metrics" aria-label="Current planning state">
    <div class="metric"><span class="label">Active plan</span><span class="value"><a href="features/review-queue.html">features/review-queue.html</a></span></div>
    <div class="metric"><span class="label">Shape</span><span class="value">Focused feature plan</span></div>
    <div class="metric"><span class="label">Current unit</span><span class="value">Confirm data and audit boundaries</span></div>
    <div class="metric"><span class="label">Next action</span><span class="value">Confirm invoice schema, auth/session access, audit persistence, and export destination.</span></div>
  </div>
  <div class="section-stack">
    <section class="panel" aria-labelledby="planning-rule">
      <h2 id="planning-rule">Planning Rule</h2>
      <p>Create or update an HTML plan before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes. Fast-path local reversible fixes do not need a plan unless they reveal durable project knowledge.</p>
    </section>
    <section class="panel" aria-labelledby="structure">
      <h2 id="structure">Structure</h2>
      <ul>
        <li><code>features/</code> holds focused feature plans.</li>
        <li><code>mvp/</code> is skipped for this imported existing app unless future source evidence says it is pre-launch MVP work; keep near-term direction in <a href="../roadmap.html">roadmap.html</a>.</li>
        <li><code>zzz_completed/</code> holds completed plans after verification and completion gates support archiving.</li>
        <li>Record durable plan changes and validation context in <a href="../log.html">log.html</a>.</li>
      </ul>
    </section>
    <section class="flow-map" aria-labelledby="planning-flow">
      <h2 id="planning-flow">Planning Flow</h2>
      <svg viewBox="0 0 760 160" role="img" aria-label="Planning flow from sources to active plan to validation and log">
        <rect x="20" y="48" width="150" height="58" rx="8"></rect><text x="95" y="82" text-anchor="middle">Sources</text>
        <path d="M170 77 H265"></path>
        <rect x="265" y="48" width="150" height="58" rx="8"></rect><text x="340" y="82" text-anchor="middle">Active Plan</text>
        <path d="M415 77 H510"></path>
        <rect x="510" y="48" width="150" height="58" rx="8"></rect><text x="585" y="82" text-anchor="middle">Validate + Log</text>
      </svg>
    </section>
    <section class="panel" aria-labelledby="completed">
      <h2 id="completed">Completed Plans</h2>
      <p>No completed plans archived yet.</p>
    </section>
  </div>
</main>`)],
  ["wiki/plans/features/review-queue.html", html("Review Queue Feature Plan", `<main>
  <a class="back" href="../index.html">Back to plans</a>
  <header>
    <p class="eyebrow">Feature plan</p>
    <h1>Review Queue</h1>
    <p class="lede">Finance operators can review pending invoices, flag missing vendor data, approve or reject invoices, and export approved invoice IDs.</p>
  </header>
  <section class="reader-goal" aria-labelledby="feature-reader-goal">
    <span class="label">Reader Goal</span>
    <h2 id="feature-reader-goal">Decide whether implementation can start</h2>
    <p>After 2 minutes, the reader can see scope, non-goals, blockers, and the next unit that must be resolved before code changes.</p>
  </section>
  <div class="metrics" aria-label="Plan state">
    <div class="metric"><span class="label">Status</span><span class="value">Planned</span></div>
    <div class="metric"><span class="label">Current unit</span><span class="value">Confirm data and audit boundaries</span></div>
    <div class="metric"><span class="label">Blockers</span><span class="value">Invoice schema, auth/session API, audit storage, export destination</span></div>
  </div>
  <div class="two-col">
    <div class="section-stack">
      <section class="panel"><h2>Scope</h2><ul><li>Queue view for pending invoices.</li><li>Invoice detail affordance sufficient for decisions.</li><li>Missing-vendor-data flag.</li><li>Approve and reject actions.</li><li>Export approved invoice IDs.</li></ul></section>
      <section class="panel"><h2>Non-Goals</h2><ul><li>Payment execution.</li><li>Authentication implementation.</li><li>Upstream invoice ingestion.</li></ul></section>
      <section class="panel"><h2>Validation</h2><ul><li>Unit tests for queue state, decision transitions, and export formatting.</li><li>Manual review of approve/reject/flag flow after data boundary is confirmed.</li></ul></section>
    </div>
    <aside class="panel">
      <h2>Design Considerations</h2>
      <p>Follow <a href="../../sources/design-brief.html">the design brief</a> for operator workflow density, status visibility, decision controls, browser validation, and accessibility checks.</p>
      <p style="margin-top: 12px;"><span class="tag warn">Next execution unit</span></p>
      <p style="margin-top: 8px;">Confirm invoice schema, auth/session access pattern, audit persistence, and export destination before code changes.</p>
    </aside>
  </div>
</main>`)],
  ["wiki/log.html", html("Invoice Review Log", `<main>
  <a class="back" href="index.html">Back to wiki index</a>
  <header><p class="eyebrow">Project-context log</p><h1>Invoice Review Log</h1></header>
  <article class="panel">
    <p><span class="tag">bootstrap</span></p>
    <h2 style="margin-top: 10px;">2026-05-15 Import Existing App</h2>
    <ul>
      <li>Imported existing Invoice Review repo into the Project HTML Wiki Skill workflow.</li>
      <li>Created source index, PRD, technical brief, design brief, roadmap, and focused review queue feature plan.</li>
      <li>Preserved source files and Git history.</li>
    </ul>
  </article>
</main>`)],
  ["wiki/roadmap.html", html("Invoice Review Roadmap", `<main>
  <a class="back" href="index.html">Back to wiki index</a>
  <header><p class="eyebrow">Roadmap</p><h1>Invoice Review Roadmap</h1></header>
  <div class="section-stack">
    <section class="panel"><h2>Current Goal</h2><p>Reach a validated review queue implementation path without inventing invoice schema, authentication, audit, or export details.</p></section>
    <section class="panel focus"><h2>Next Decision</h2><p>Confirm invoice data source, auth/session boundary, audit persistence, and export destination.</p></section>
    <section class="panel"><h2>Deferred</h2><ul><li>Payment execution remains out of scope.</li><li>Marketing and signup flows are not needed for this internal tool.</li></ul></section>
  </div>
</main>`)],
  ["wiki/sources/prd.html", html("Invoice Review PRD", `<main><a class="back" href="../index.html">Back to wiki index</a><header><p class="eyebrow">Source brief</p><h1>PRD</h1><p class="lede">Product intent for the internal invoice review workflow.</p></header><div class="section-stack"><section class="panel"><h2>Status</h2><p>Last reviewed: 2026-05-15. Evidence basis: prompt and repository evidence. Confidence: medium.</p></section><section class="panel"><h2>Problem</h2><p>Finance operators need a reliable way to review pending invoices, identify missing vendor data, and approve or reject invoices before downstream processing.</p></section></div></main>`)],
  ["wiki/sources/technical-brief.html", html("Invoice Review Technical Brief", `<main><a class="back" href="../index.html">Back to wiki index</a><header><p class="eyebrow">Source brief</p><h1>Technical Brief</h1><p class="lede">Implementation surfaces, stack evidence, validation posture, and handoff risks.</p></header><section class="panel"><h2>Status</h2><p>Last reviewed: 2026-05-15. Evidence basis: prompt and repository evidence. Confidence: medium.</p></section></main>`)],
  ["wiki/sources/design-brief.html", html("Invoice Review Design Brief", `<main><a class="back" href="../index.html">Back to wiki index</a><header><p class="eyebrow">Source brief</p><h1>Design Brief</h1><p class="lede">Operator workflow UI principles, interaction patterns, responsive expectations, and validation guidance.</p></header><div class="grid"><section class="panel"><h2>Interface Principles</h2><p>Prioritize dense, scannable operational workflows over marketing-style presentation.</p></section><section class="panel"><h2>Interaction Patterns</h2><p>Queue filtering and status changes should be efficient for repeated finance-operator use.</p></section><section class="panel"><h2>Validation</h2><p>Manually review the queue, detail affordance, and decision controls in browser.</p></section></div></main>`)],
]);

const required = [
  "AGENTS.md",
  "wiki/AGENTS.md",
  "wiki/index.html",
  "wiki/log.html",
  "wiki/Sources.html",
  "wiki/plans/index.html",
  "wiki/plans/features/review-queue.html",
  "wiki/roadmap.html",
  "wiki/sources/prd.html",
  "wiki/sources/technical-brief.html",
  "wiki/sources/design-brief.html",
];

const requiredLinks = {
  "wiki/index.html": ["AGENTS.md", "log.html", "Sources.html", "plans/index.html", "roadmap.html", "sources/prd.html", "sources/technical-brief.html", "sources/design-brief.html"],
  "wiki/Sources.html": ["index.html", "sources/prd.html", "sources/technical-brief.html", "sources/design-brief.html"],
  "wiki/plans/index.html": ["../index.html", "features/review-queue.html", "../roadmap.html", "../log.html"],
  "wiki/plans/features/review-queue.html": ["../index.html", "../../sources/design-brief.html"],
};

const designCheckedPages = [
  "wiki/index.html",
  "wiki/Sources.html",
  "wiki/plans/index.html",
  "wiki/plans/features/review-queue.html",
];

const designStructureTokens = [
  "reader-goal",
  "command-hero",
  "status-rail",
  "flow-map",
  "metrics",
  "responsive-table",
];

async function validateContracts() {
  const failures = [];
  const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
  const bootstrap = await readFile(path.join(root, "references/canonical-bootstrap-contract.md"), "utf8");
  const baseline = await readFile(path.join(root, "references/generated-baseline-artifacts.md"), "utf8");
  const intake = await readFile(path.join(root, "references/intake-discovery-contract.md"), "utf8");
  const planning = await readFile(path.join(root, "references/planning-contract.md"), "utf8");
  const validation = await readFile(path.join(root, "references/validation-checklist.md"), "utf8");
  const readme = await readFile(path.join(root, "README.md"), "utf8");

  for (const [label, content] of [
    ["SKILL.md", skill],
    ["canonical-bootstrap-contract.md", bootstrap],
    ["validation-checklist.md", validation],
    ["README.md", readme],
  ]) {
    if (!content.includes("intake_discovery")) failures.push(`${label} missing intake_discovery`);
  }

  for (const token of [
    "Do not create `wiki/`",
    "Do not create bootstrap artifacts from zero context",
    "Thin context",
    "Zero context",
  ]) {
    if (!skill.includes(token) && !bootstrap.includes(token)) failures.push(`zero/thin context contract missing ${token}`);
  }

  for (const token of [
    "project type",
    "audience",
    "problem",
    "desired outcome",
    "constraints",
    "interface shape",
    "first useful milestone",
    "Mode: `intake_discovery`",
    "Status: stopped before file creation",
  ]) {
    if (!intake.includes(token)) failures.push(`intake contract missing ${token}`);
  }

  for (const token of [
    "Zero Source Context",
    "Does not create `AGENTS.md`",
    "Thin Source Context",
    "Creates required bootstrap baseline files",
  ]) {
    if (!validation.includes(token)) failures.push(`validation checklist missing ${token}`);
  }

  for (const token of [
    "Execution Notes During Implementation",
    "decisions",
    "tradeoffs",
    "deviations",
    "validation surprises",
    "Do not create unindexed root-level `implementation-notes.html` by default.",
  ]) {
    if (!skill.includes(token) && !planning.includes(token) && !validation.includes(token)) {
      failures.push(`execution notes contract missing ${token}`);
    }
  }

  for (const token of [
    "During implementation, keep execution notes",
    "Distill durable items into the plan, `wiki/log.html`, source docs, or roadmap before handoff.",
  ]) {
    if (!baseline.includes(token)) failures.push(`generated baseline missing ${token}`);
  }

  for (const token of [
    "Start With No Source Context",
    "Use $project-html-wiki to help me figure out a new project from scratch.",
    "Thin context is different",
    "keep execution notes for decisions, tradeoffs, deviations, and validation surprises",
  ]) {
    if (!readme.includes(token)) failures.push(`README missing ${token}`);
  }

  return failures;
}

async function writeOutput() {
  await rm(outDir, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
  }
}

async function validateOutput() {
  const failures = [];

  for (const rel of required) {
    const file = path.join(outDir, rel);
    if (!existsSync(file)) {
      failures.push(`missing required artifact: ${rel}`);
      continue;
    }
    const info = await stat(file);
    if (info.size === 0) failures.push(`empty artifact: ${rel}`);
  }

  for (const [rel, links] of Object.entries(requiredLinks)) {
    const content = await readFile(path.join(outDir, rel), "utf8");
    for (const href of links) {
      if (!content.includes(`href="${href}"`)) failures.push(`${rel} missing link ${href}`);
      const target = path.normalize(path.join(path.dirname(path.join(outDir, rel)), href));
      if (!existsSync(target)) failures.push(`${rel} links to missing target ${href}`);
    }
  }

  for (const rel of required.filter((file) => file.endsWith(".html"))) {
    const content = await readFile(path.join(outDir, rel), "utf8");
    for (const token of ["[Project Name]", "[YYYY-MM-DD]", "[high|medium|low]", "[none |"]) {
      if (content.includes(token)) failures.push(`${rel} contains placeholder ${token}`);
    }
    for (const token of ["<!doctype html>", "<html lang=\"en\">", "<meta name=\"viewport\"", "<title>", "<main>"]) {
      if (!content.includes(token)) failures.push(`${rel} missing HTML standard token ${token}`);
    }
  }

  for (const rel of designCheckedPages) {
    const content = await readFile(path.join(outDir, rel), "utf8");
    if (!content.includes('name="visual-concept"')) failures.push(`${rel} missing visual concept metadata`);
    if (!content.includes("reader-goal")) failures.push(`${rel} missing reader goal panel`);
    if (!designStructureTokens.some((token) => content.includes(token))) {
      failures.push(`${rel} missing artifact-specific visual structure`);
    }
    for (const token of ["--shadow", "--focus", "grid-template-columns", "@media"]) {
      if (!content.includes(token)) failures.push(`${rel} missing design CSS token ${token}`);
    }
  }

  return failures;
}

await writeOutput();
const failures = await validateOutput();
failures.push(...await validateContracts());

if (failures.length) {
  console.error("Bootstrap smoke test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Bootstrap smoke test passed: ${required.length} artifacts generated at ${outDir}`);
console.log(`Preview: file://${path.join(wikiDir, "index.html")}`);
