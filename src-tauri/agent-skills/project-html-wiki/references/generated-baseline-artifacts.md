# Generated Baseline Artifacts

Use this reference when creating the required baseline files for a bootstrapped project. Keep generated files compact and project-specific. Replace bracketed placeholders with real project context, or name the unknown when context is missing.

## Managed Block Markers

When updating existing root or wiki agent guidance such as `AGENTS.md`, `CLAUDE.md`, or `wiki/AGENTS.md`, preserve user-authored content and add or replace only this bounded block:

```markdown
<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
[managed project wiki guidance]
<!-- PROJECT-HTML-WIKI-SKILL:END -->
```

Do not create multiple managed blocks in the same file. If markers already exist, replace only the content between them.

## `AGENTS.md`

```markdown
# AGENTS.md instructions for [project-root]

<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
## [Project Name] Agent Guide

### Project Wiki

- Read `wiki/index.html` before answering project-specific questions or making structural changes.
- Keep durable project knowledge, plans, decisions, and project-context history under `wiki/`.
- Use `wiki/Sources.html` as the source index.
- Create or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- Do not create plans for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction.
- Sync recent codebase changes back into `wiki/log.html`, relevant plans, roadmap, and source docs when work happened before planning or made the wiki stale.
- Update `wiki/index.html` when adding or materially changing durable wiki pages.
- Update `wiki/log.html` after bootstrapping, planning, validation, or material project changes that affect durable project context.

### Working Rules

- Inspect existing files and Git state before writing.
- Preserve user-authored files and existing Git history.
- Do not create root-level `docs/` or `tasks/` for durable planning.
- Name unknowns and contradictions instead of inventing certainty.

### Automation Policy

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->
```

## `CLAUDE.md`

Create `CLAUDE.md` only when the repository already uses Claude Code guidance or the user explicitly requests Claude-specific local guidance. If both `AGENTS.md` and `CLAUDE.md` exist, keep the `CLAUDE.md` block compact and point to the shared Project HTML Wiki Skill guidance instead of duplicating the full contract.

```markdown
# CLAUDE.md instructions for [project-root]

<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
## [Project Name] Project Wiki

- Read `AGENTS.md`, `wiki/AGENTS.md`, and `wiki/index.html` before project-specific structural work.
- Keep durable project knowledge, plans, decisions, and project-context history under `wiki/`.
- Use `wiki/Sources.html` as the source index and `wiki/plans/` for maintained implementation plans.
- Sync durable project-context changes back into the wiki when implementation makes plans, source briefs, roadmap state, or the source index stale.
- Preserve user-authored instructions outside this managed block.
<!-- PROJECT-HTML-WIKI-SKILL:END -->
```

## `wiki/AGENTS.md`

```markdown
# [Project Name] Wiki Agent Guide

<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
This `wiki/` directory is the maintained knowledge and planning layer for `[Project Name]`.

## Source Of Truth

- `index.html` is the wiki front door.
- `log.html` is the project-context changelog. Git owns routine implementation history.
- `Sources.html` catalogs source material, repository evidence, and unknowns.
- `plans/index.html` defines the planning contract.
- `roadmap.html` tracks the next useful project direction.

## Rules

- Read `index.html` before structural wiki changes.
- Keep durable project knowledge, planning, decisions, and validation notes under `wiki/`.
- Preserve exact source material under `wiki/sources/` only when provenance matters.
- Update `index.html` when adding or materially changing durable pages.
- Update `log.html` after bootstrapping, planning, validation, or material project changes that affect durable project context.
- Use standalone HTML pages with embedded CSS, relative links, semantic structure, and accessible tables, diagrams, or controls when they improve readability.

## Boundaries

Do not create root-level `docs/` or `tasks/` for maintained project knowledge.

## Automation Policy

Default to asking before committing, pushing, or running long commands. Dependency installs are allowed automatically unless the user chooses a stricter repo policy.

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->
```

## HTML Artifact Standard

All generated `wiki/*.html` and `wiki/**/*.html` pages should be complete, standalone HTML documents:

- Before writing or materially restyling HTML, use `$frontend-design` when available. Choose a named visual concept based on the artifact's purpose, audience, domain, and density needs; avoid generic AI aesthetics, default font/color choices, and interchangeable card grids.
- Load [`html-artifact-patterns.md`](html-artifact-patterns.md) before substantial HTML work. Select the artifact pattern, define the reader goal, use visual structures instead of long prose, add copy/export controls when the page is interactive or decision-oriented, and run visual QA when feasible.
- Include `<!doctype html>`, `<html lang="en">`, `<head>`, UTF-8 charset, viewport meta, a project-specific `<title>`, embedded CSS, and semantic body structure.
- Prefer readable, information-dense layouts: summaries, callout panels, status chips, tables, timelines, diagrams, command bars, status rails, evidence matrices, and compact navigation over long prose-only pages.
- Match the design to the artifact type: quiet dense dashboards for planning state, annotated layouts for code review, editorial hierarchy for reports, comparison grids for exploration, and purpose-built controls for tuning or editing interfaces.
- Make each substantial page visually specific to the project. A finance operations wiki can use a command-center aesthetic with ledger-like evidence tables and status rails; an architecture report can use blueprint-style diagrams; a design brief can use editorial preview panels.
- The first viewport should show a useful status summary, reader goal, or working interface. Do not start substantial pages with only a title and paragraphs.
- Use relative links to other wiki artifacts. Link HTML pages with `.html` paths.
- Use accessible markup: headings in order, descriptive link text, visible focus states, sufficient color contrast, and tables with headers.
- Use inline SVG for diagrams when it clarifies flows, architecture, states, or relationships.
- Use small inline JavaScript only when it adds useful two-way interaction, such as filters, tabs, toggles, copy buttons, sliders, or generated export text.
- Use evidence and confidence badges for source-heavy claims, especially when repo evidence, source docs, prompts, unknowns, or contradictions differ.
- Treat code snippets as annotated review surfaces with file paths, line references, highlighted lines, and nearby "why this matters" notes.
- Keep files portable. Do not require a build step, external CDN, remote assets, or installed dependencies.
- Keep generated CSS scoped to the page, compact, and easy for future agents to edit, but still intentional: define CSS variables, choose typography deliberately, create clear visual hierarchy, and avoid one-note palettes.
- Use responsive constraints, `minmax()` grids, stacked mobile table patterns, and text wrapping rules so generated pages remain polished on mobile and desktop.
- Revise any page that looks like a plain default document, a generic card grid, or an unstyled Markdown export.
- Do not wrap page content in Markdown fences inside `.html` files.

The templates below are structural baselines. Do not copy them verbatim when richer project evidence supports a stronger artifact-specific design. Add a named visual concept, reader-goal panel, status rail, diagram, timeline, evidence matrix, command dashboard, or other fitting structure before handoff.

## `wiki/index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="visual-concept" content="[named visual concept, such as operator command center]">
  <title>[Project Name] Wiki</title>
  <style>
    :root { color-scheme: light; --bg: #f7f7f4; --panel: #fff; --ink: #1d2528; --muted: #647074; --line: #dfe4e2; --accent: #256d7b; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); line-height: 1.5; }
    main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    header { display: grid; gap: 12px; padding: 28px 0; border-bottom: 1px solid var(--line); }
    h1, h2 { margin: 0; line-height: 1.15; }
    h1 { font-size: clamp(2rem, 4vw, 3.5rem); }
    h2 { font-size: 1.05rem; }
    p { margin: 0; }
    .lede { max-width: 760px; color: var(--muted); font-size: 1.05rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 24px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .card a { color: var(--accent); font-weight: 700; text-decoration-thickness: 0.08em; }
    .meta { color: var(--muted); font-size: 0.92rem; }
    .focus { margin-top: 24px; padding: 18px; border-left: 4px solid var(--accent); background: #eef6f7; border-radius: 6px; }
    .reader-goal { margin-top: 24px; padding: 18px; border-radius: 8px; background: #172326; color: #f5f8f4; }
    .reader-goal .meta { color: #b6d5d6; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="meta">Project wiki</p>
      <h1>[Project Name]</h1>
      <p class="lede">[One short paragraph describing what the project is. If unknown, say what is known and what is missing.]</p>
    </header>

    <section class="reader-goal" aria-labelledby="reader-goal">
      <p class="meta">Reader Goal</p>
      <h2 id="reader-goal">[What the reader can decide or understand after 2 minutes]</h2>
      <p>[One sentence connecting the wiki's current state to the user's next action.]</p>
    </section>

    <section class="focus" aria-labelledby="current-focus">
      <h2 id="current-focus">Current Focus</h2>
      <p>[Current project focus, next decision, or bootstrap handoff state.]</p>
    </section>

    <section aria-labelledby="core-pages">
      <h2 id="core-pages" style="margin-top: 28px;">Core Pages</h2>
      <div class="grid">
        <article class="card"><h3><a href="AGENTS.md">Wiki Agent Guide</a></h3><p class="meta">Local wiki maintenance contract.</p></article>
        <article class="card"><h3><a href="log.html">Project Log</a></h3><p class="meta">Durable project-context changelog.</p></article>
        <article class="card"><h3><a href="Sources.html">Sources</a></h3><p class="meta">Source material, evidence, and unknowns.</p></article>
        <article class="card"><h3><a href="plans/index.html">Plans</a></h3><p class="meta">Planning dashboard and implementation contract.</p></article>
        <article class="card"><h3><a href="roadmap.html">Roadmap</a></h3><p class="meta">Current goal, next decision, and staged direction.</p></article>
      </div>
    </section>

    <section aria-labelledby="source-briefs">
      <h2 id="source-briefs" style="margin-top: 28px;">Source Briefs</h2>
      <p class="meta">[List generated source briefs when present. If none were generated, state that no separate source briefs were justified by current evidence.]</p>
    </section>
  </main>
</body>
</html>
```

## `wiki/log.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>[Project Name] Log</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1e2528; background: #f8f8f5; line-height: 1.5; }
    main { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    header { border-bottom: 1px solid #dfe4e2; padding-bottom: 20px; margin-bottom: 22px; }
    h1, h2 { margin: 0; line-height: 1.2; }
    h1 { font-size: clamp(2rem, 4vw, 3rem); }
    .note, .entry { background: #fff; border: 1px solid #dfe4e2; border-radius: 8px; padding: 18px; }
    .note { color: #5d686c; margin-bottom: 16px; }
    .entry { margin-top: 16px; }
    .badge { display: inline-block; border-radius: 999px; background: #e8f3f4; color: #1d6674; padding: 3px 10px; font-size: 0.82rem; font-weight: 700; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <main>
    <header>
      <a href="index.html">Back to wiki index</a>
      <h1>[Project Name] Log</h1>
    </header>

    <section class="note" aria-label="Log policy">
      <p>Append durable project-context changes here. Git owns routine implementation history. Use dated entries for bootstrap/import events, planning direction changes, codebase sync summaries after unplanned work, validation results that affect plans or roadmap, source-context changes, and important decisions discovered during implementation.</p>
      <p>Do not log routine commits, every code edit, every test run, formatting, minor refactors, or details already obvious from Git. If this file becomes hard to scan, summarize older entries into <a href="log-archive.html">log-archive.html</a> or a dated archive such as <code>log/YYYY.html</code>.</p>
    </section>

    <article class="entry">
      <span class="badge">bootstrap</span>
      <h2>[YYYY-MM-DD] Initialize Project Wiki</h2>
      <ul>
        <li>Created the HTML-first project wiki, source index, local agent guidance, and planning contract.</li>
        <li>Mode: <code>[bootstrap_new|import_existing]</code>.</li>
        <li>Git result: [initialized new repository | preserved existing repository | skipped by request | failed: reason].</li>
        <li>Source briefs: [none generated | generated <code>wiki/sources/prd.html</code> | generated <code>wiki/sources/design-brief.html</code> | generated ...].</li>
      </ul>
    </article>
  </main>
</body>
</html>
```

## `wiki/Sources.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="visual-concept" content="[named visual concept, such as evidence ledger]">
  <title>[Project Name] Sources</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2629; background: #f7f7f4; line-height: 1.5; }
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    h1 { margin: 8px 0 20px; font-size: clamp(2rem, 4vw, 3rem); }
    section { background: #fff; border: 1px solid #dfe4e2; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .reader-goal { background: #172326; color: #f5f8f4; }
    .reader-goal .kicker { color: #b6d5d6; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #e7ecea; padding: 10px; }
    th, td { overflow-wrap: anywhere; }
    th { color: #4b5a5f; font-size: 0.9rem; }
    @media (max-width: 700px) {
      main { width: min(100% - 24px, 1040px); }
      section { padding: 16px; }
      table.responsive-table, table.responsive-table thead, table.responsive-table tbody, table.responsive-table tr, table.responsive-table th, table.responsive-table td { display: block; width: 100%; }
      table.responsive-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      table.responsive-table tr { border-bottom: 1px solid #e7ecea; padding: 10px 0; }
      table.responsive-table td { border: 0; padding: 6px 0; }
      table.responsive-table td::before { content: attr(data-label); display: block; margin-bottom: 2px; color: #647074; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
    }
  </style>
</head>
<body>
  <main>
    <a href="index.html">Back to wiki index</a>
    <h1>Sources</h1>
    <p>This page catalogs source material, repository evidence, and unresolved unknowns for <strong>[Project Name]</strong>.</p>

    <section class="reader-goal" aria-labelledby="reader-goal">
      <p class="kicker">Reader Goal</p>
      <h2 id="reader-goal">[What the reader can verify from current evidence after 2 minutes]</h2>
      <p>[One sentence naming the highest-confidence source and the most important unknown.]</p>
    </section>

    <section aria-labelledby="source-material">
      <h2 id="source-material">Source Material</h2>
      <table class="responsive-table">
        <thead><tr><th>Source</th><th>What It Contributes</th><th>Confidence</th></tr></thead>
        <tbody><tr><td data-label="Source">[Prompt/source note/repository evidence]</td><td data-label="What It Contributes">[short description]</td><td data-label="Confidence">[high|medium|low]</td></tr></tbody>
      </table>
    </section>

    <section aria-labelledby="repo-evidence">
      <h2 id="repo-evidence">Repository Evidence</h2>
      <ul><li>[Observed file, manifest, stack, or Git state]</li></ul>
    </section>

    <section aria-labelledby="briefs">
      <h2 id="briefs">Generated Source Briefs</h2>
      <p>None generated yet. Current evidence does not justify separate source briefs.</p>
    </section>

    <section aria-labelledby="unknowns">
      <h2 id="unknowns">Unknowns</h2>
      <ul><li>[Unknown or contradiction that matters for future planning]</li></ul>
    </section>
  </main>
</body>
</html>
```

## `wiki/sources/design-brief.html`

Create this source brief only when project evidence justifies durable UI design memory. Do not create it for CLI tools, backend services, libraries, infra projects, or thin prompts without a meaningful interface signal.

All generated source briefs should include this status pattern near the top, replacing placeholders with current evidence or `Unknown`:

```html
<section class="status" aria-labelledby="status">
  <h2 id="status">Status</h2>
  <dl>
    <dt>Last reviewed</dt><dd>[YYYY-MM-DD]</dd>
    <dt>Evidence basis</dt><dd>[prompt | repo | source doc | implementation]</dd>
    <dt>Confidence</dt><dd>[high | medium | low]</dd>
    <dt>Known gaps</dt><dd>[Unknown | concise list]</dd>
  </dl>
</section>
```

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>[Project Name] Design Brief</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2629; background: #f6f7f4; line-height: 1.5; }
    main { width: min(1100px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    h1 { margin: 8px 0 18px; font-size: clamp(2rem, 4vw, 3rem); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    section { background: #fff; border: 1px solid #dfe4e2; border-radius: 8px; padding: 18px; }
    .status dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 14px; margin: 0; }
    dt { font-weight: 700; color: #4a5559; }
    dd { margin: 0; }
  </style>
</head>
<body>
  <main>
    <a href="../index.html">Back to wiki index</a>
    <h1>Design Brief</h1>

    <section class="status" aria-labelledby="status">
      <h2 id="status">Status</h2>
      <dl>
        <dt>Last reviewed</dt><dd>[YYYY-MM-DD]</dd>
        <dt>Evidence basis</dt><dd>[prompt | repo | source doc | implementation]</dd>
        <dt>Confidence</dt><dd>[high | medium | low]</dd>
        <dt>Known gaps</dt><dd>[Unknown | concise list]</dd>
      </dl>
    </section>

    <div class="grid" style="margin-top: 16px;">
      <section><h2>Product Surface</h2><p>[The UI, frontend, website, dashboard, visual workflow, design system, or interaction-heavy surface this brief covers.]</p></section>
      <section><h2>Interface Principles</h2><p>[Durable guidance for density, hierarchy, tone, navigation, workflow ergonomics, and what future UI work should preserve.]</p></section>
      <section><h2>Visual System</h2><p>[Colors, typography, spacing, component conventions, iconography, imagery, brand constraints, or unknowns.]</p></section>
      <section><h2>Interaction Patterns</h2><p>[Forms, tables, filters, navigation, empty states, loading states, errors, confirmations, keyboard behavior, and similar patterns.]</p></section>
      <section><h2>Responsive And Accessibility Expectations</h2><p>[Viewport priorities, contrast, focus states, reduced motion, assistive technology expectations, and known constraints.]</p></section>
      <section><h2>Validation</h2><p>[Manual design review, browser QA, screenshot checks, viewport checks, accessibility checks, or automated tests expected for UI work.]</p></section>
      <section><h2>Unknowns</h2><p>[Missing brand, target devices, design system decisions, reference screenshots, asset needs, or unresolved tradeoffs.]</p></section>
    </div>
  </main>
</body>
</html>
```

## `wiki/plans/index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="visual-concept" content="[named visual concept, such as execution control room]">
  <title>[Project Name] Plans</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2629; background: #f7f7f4; line-height: 1.5; }
    main { width: min(1100px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    h1 { margin: 8px 0 18px; font-size: clamp(2rem, 4vw, 3rem); }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 18px 0; }
    .metric, section { background: #fff; border: 1px solid #dfe4e2; border-radius: 8px; padding: 16px; }
    .reader-goal { background: #172326; color: #f5f8f4; }
    .reader-goal .label { color: #b6d5d6; }
    .label { display: block; color: #607075; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .value { display: block; margin-top: 4px; font-weight: 800; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <main>
    <a href="../index.html">Back to wiki index</a>
    <h1>Plans</h1>
    <p>This directory holds durable implementation plans for <strong>[Project Name]</strong>.</p>

    <section class="reader-goal" aria-labelledby="reader-goal">
      <span class="label">Reader Goal</span>
      <h2 id="reader-goal">[What the reader can decide or execute after 2 minutes]</h2>
      <p>[One sentence naming the active plan, current unit, blocker, or next decision.]</p>
    </section>

    <div class="summary" aria-label="Current planning state">
      <div class="metric"><span class="label">Active plan</span><span class="value">[none | features/example.html | mvp/index.html]</span></div>
      <div class="metric"><span class="label">Shape</span><span class="value">[none | compact feature plan | single-stage MVP | multi-stage MVP]</span></div>
      <div class="metric"><span class="label">Current unit</span><span class="value">[unit name or none]</span></div>
      <div class="metric"><span class="label">Next action</span><span class="value">[one concrete action or decision]</span></div>
    </div>

    <section aria-labelledby="planning-rule">
      <h2 id="planning-rule">Planning Rule</h2>
      <p>Create or update an HTML plan before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.</p>
      <p>Fast-path exception: for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction, do not create a plan. Make the change, validate it, and avoid wiki/log updates unless the fix reveals durable project knowledge.</p>
    </section>

    <section aria-labelledby="structure">
      <h2 id="structure">Structure</h2>
      <ul>
        <li>Use <code>features/</code> for focused feature plans that do not need a full numbered roadmap.</li>
        <li>Use <code>mvp/</code> only for greenfield, pre-launch, or explicitly MVP work that needs numbered roadmap implementation sessions.</li>
        <li>Use <code>zzz_completed/</code> for completed plans after all stages, units, completion gates, and verification records support completion.</li>
        <li>For imported or existing live projects, default to <a href="../roadmap.html">roadmap.html</a> plus focused <code>features/</code>, <code>maintenance/</code>, or <code>releases/</code> plans only when concrete workstreams justify them.</li>
        <li>Keep bugfix or cleanup planning in the closest relevant existing plan.</li>
        <li>Record completed work, decisions discovered during implementation, and verification in <a href="../log.html">log.html</a> only when they affect durable project context.</li>
      </ul>
    </section>

    <section aria-labelledby="completed">
      <h2 id="completed">Completed Plans</h2>
      <p>[No completed plans archived yet | Completed plans: <a href="zzz_completed/features/example.html">zzz_completed/features/example.html</a>]</p>
    </section>
  </main>
</body>
</html>
```

## `wiki/roadmap.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>[Project Name] Roadmap</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2629; background: #f7f7f4; line-height: 1.5; }
    main { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    h1 { margin: 8px 0 18px; font-size: clamp(2rem, 4vw, 3rem); }
    section { background: #fff; border: 1px solid #dfe4e2; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .next { border-left: 4px solid #256d7b; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <a href="index.html">Back to wiki index</a>
    <h1>Roadmap</h1>
    <section><h2>Current Goal</h2><p>[The first durable project outcome.]</p></section>
    <section class="next"><h2>Next Decision</h2><p>[The next decision needed before implementation or deeper planning.]</p></section>
    <section><h2>Next Steps</h2><ol><li>[Concrete next step]</li><li>[Concrete next step]</li><li>[Concrete next step]</li></ol></section>
    <section><h2>Deferred</h2><ul><li>[Known deferred work, non-goal, or future option]</li></ul></section>
  </main>
</body>
</html>
```

## `.agents/skills/project-wiki-maintainer/SKILL.md`

Use the local skill support decision tree in [`canonical-bootstrap-contract.md`](canonical-bootstrap-contract.md) before creating repo-local skills. Create `.agents/skills/project-wiki-maintainer/SKILL.md` only when repo-local skills are already in use or explicitly requested. For ordinary `bootstrap_new`, skip `.agents/skills/` creation when repo-local skills are not already in use or explicitly requested, and report the skip reason.

The `project-wiki-maintainer` skill should be short and project-local. It must instruct agents to maintain that project's `wiki/`, not this reusable skill repo.

Required traits:

- Frontmatter with `name: project-wiki-maintainer`.
- A description customized with the target project name that triggers on maintaining that project's wiki, plans, logs, source docs, local agent rules, and codebase-to-wiki sync.
- Workflow to read `wiki/AGENTS.md` and `wiki/index.html` first.
- Rule to use `$frontend-design` when available before generating or materially restyling HTML wiki artifacts.
- Rule to use the installed Project HTML Wiki artifact patterns for reader goals, artifact pattern selection, visual structures, copy/export controls, code snippet treatment, evidence UI, style systems, examples, and visual QA.
- Rules to update `wiki/index.html` and `wiki/log.html`.
- Rule to reconcile recent codebase changes into plans, roadmap, source docs, and the log when work happened before planning or made the wiki stale.
- Boundary against root-level `docs/` and `tasks/` for durable planning.

Do not generate additional repo-local skill stubs from this baseline. If the user explicitly asks for frontend, copywriting, browser, test, deployment, or other local skills, treat that as separate skill-authoring or skill-installation work and preserve any existing user-edited skill files.

```markdown
---
name: project-wiki-maintainer
description: Maintain [Project Name]'s wiki, plans, log, source index, source briefs, and local agent rules. Use when updating durable project knowledge, planning features, updating implementation plans, syncing recent codebase changes back into the wiki, recording validation or decisions, maintaining roadmap/log state, or answering from [Project Name]'s project wiki.
---

# Project Wiki Maintainer

Use this skill to maintain `[Project Name]`'s `wiki/` knowledge layer. Replace `[Project Name]` during bootstrap so the local skill is specific to the bootstrapped project.

## Workflow

1. Read `wiki/AGENTS.md` and `wiki/index.html` first.
2. Use `$frontend-design` when available before generating or materially restyling HTML wiki artifacts so pages have deliberate typography, color, spacing, hierarchy, and interaction choices.
3. Before substantial HTML work, choose the artifact pattern, define the 2-minute reader goal, avoid long prose by using visual structures, add copy/export controls for interactive or decision-oriented pages, and visually QA the result when feasible.
4. Preserve source context in `wiki/Sources.html`; create `wiki/sources/` briefs only when project evidence justifies them, including `design-brief.html` for durable UI design memory.
5. Create or update durable plans under `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes, except for small, local, reversible fixes that do not change durable project direction.
6. During implementation, keep execution notes in the active plan or unit for decisions, tradeoffs, deviations, discovered constraints, validation surprises, blockers, and follow-up decisions. Distill durable items into the plan, `wiki/log.html`, source docs, or roadmap before handoff.
7. Move fully complete plans into `wiki/plans/zzz_completed/` after all stages, units, completion gates, and verification records support completion; remove them from active current-plan slots while preserving compact archive links.
8. Sync recent codebase changes back into `wiki/log.html`, relevant plans, roadmap, and source docs when work happened before planning or made the wiki stale.
9. Update `wiki/index.html` when adding or materially changing durable pages.
10. Append `wiki/log.html` after planning, validation, or material project changes that affect durable project context.

## Boundaries

- Do not create root-level `docs/` or `tasks/` for durable planning.
- Do not overwrite user-authored wiki or skill files.
- Name unknowns and contradictions instead of inventing certainty.
```
