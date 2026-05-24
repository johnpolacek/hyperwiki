---
name: project-html-wiki
description: Use this skill when the user explicitly wants to create, import, maintain, audit, or sync an HTML-first project wiki for a software project. Covers agent guidance such as AGENTS.md or CLAUDE.md, wiki/Sources.html, wiki/plans/, wiki/log.html, source briefs, roadmap state, repo-local project-wiki-maintainer skills, and codebase-to-wiki reconciliation. Do not use for ordinary coding tasks unless the project already uses this wiki structure or the user asks to update project wiki context.
---

# Project HTML Wiki Skill

Use this skill to create and maintain an HTML-first project memory layer for agentic development. Zero-context intake and bootstrapping are modes; ongoing feature planning, plan maintenance, codebase-to-wiki sync, decision capture, project-context logging, and wiki audits are also first-class work.

## HTML-First Output

Generated project wiki pages must be standalone `.html` artifacts, not Markdown documents renamed with an HTML extension. Use HTML because project memory often needs richer information density than prose-only notes: tables for source evidence, inline SVG for flows and architecture, visual status summaries, responsive layouts, annotated snippets, and lightweight controls such as tabs, filters, toggles, sliders, or copy buttons when interaction helps the user review or export decisions.

Keep the files portable and inspectable:

- include complete document structure, embedded CSS, semantic sections, accessible headings, and relative links
- use inline SVG diagrams, tables, callouts, timelines, and compact dashboards when they improve clarity
- use small inline JavaScript only for useful document interaction or export helpers
- avoid external dependencies, build steps, remote assets, and placeholder leakage
- preserve `AGENTS.md`, `CLAUDE.md`, and repo-local `SKILL.md` files as Markdown because those are agent guidance conventions

Before creating or materially restyling any generated HTML page, use `$frontend-design` when that skill is available. Apply it to choose a named visual direction for the artifact's purpose and audience, avoid generic AI-looking layouts, refine typography, color, spacing, hierarchy, responsive behavior, and motion, and keep the result production-grade rather than merely valid HTML. For utilitarian project wiki pages, the aesthetic can be restrained and work-focused, but it must still feel specifically designed for that project's domain. Plain white-card document pages, default system-font styling, and interchangeable dashboards are not acceptable final output.

Before writing a substantial HTML artifact, load [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md). Classify the page as planning/exploration, code review/explainer, report/research, design/prototype, custom editor, or a deliberate hybrid. Define the reader goal, choose a visual concept, avoid long prose by converting it into visual structures, add copy/export controls for interactive or decision-oriented pages, treat code snippets with annotations and line context, show evidence/confidence UI for source-heavy claims, use a local CSS style system, and perform visual QA or document why preview was not feasible.

## Core Workflow

1. Detect the target project root and whether the request is setup, planning, codebase sync, maintenance, project-context logging, or audit work.
2. Inspect before writing: root files, manifests, changed files, recent commits when relevant, existing agent guidance such as `AGENTS.md` or `CLAUDE.md`, existing `wiki/`, source notes, PRDs, briefs, proposals, plans, roadmap, project-context log, workspace structure, and current Git state.
3. Choose one mode:
   - `intake_discovery` for a pre-bootstrap interview when the user wants to start a software project but has no repo, no project idea, no PRD, no notes, or only a vague project prompt.
   - `bootstrap_new` for a new HTML-first project wiki, source index, local instructions, Git posture, and handoff.
   - `import_existing` for preservation-first retrofit of an existing repo.
   - `plan_feature` for creating a decision-complete plan before meaningful feature, architecture, config, schema, dependency, test, or app behavior work.
   - `update_plan` for refining an existing plan after decisions, scope changes, implementation discoveries, or validation results.
   - `sync_changes` for reconciling recent codebase changes, especially unplanned or partially planned changes, back into `wiki/log.html`, relevant plans, roadmap, source briefs, and source index.
   - `record_execution` for appending durable project-context, validation, and decision history to `wiki/log.html`.
   - `audit_or_upgrade` for checking or additively upgrading wiki artifacts, managed blocks, source indexes, plans, and local skill guidance.
4. Load only the references required for the chosen mode.
5. When writing generated `.html` wiki pages, load and apply `$frontend-design` if available before choosing layout, visual system, interaction patterns, or CSS. Name the visual concept in your working notes or handoff, and use it to drive typography, composition, color, status treatment, and first-viewport structure.
6. Create, update, or preserve wiki artifacts without overwriting user-authored files.
7. Record material planning, validation, maintenance, bootstrap, or implementation changes in `wiki/log.html` only when they affect durable project context, summarize unknowns, and leave clear next actions for the user's editor or terminal.

## Reference Loading

Load references by mode instead of by default:

| Mode | Read Before Writing |
| --- | --- |
| `intake_discovery` | [`references/intake-discovery-contract.md`](references/intake-discovery-contract.md) |
| `bootstrap_new` | [`references/canonical-bootstrap-contract.md`](references/canonical-bootstrap-contract.md), [`references/generated-baseline-artifacts.md`](references/generated-baseline-artifacts.md), [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md); also [`references/example-minimal-bootstrap.md`](references/example-minimal-bootstrap.md) for simple greenfield bootstraps |
| `import_existing` | [`references/canonical-bootstrap-contract.md`](references/canonical-bootstrap-contract.md), [`references/generated-baseline-artifacts.md`](references/generated-baseline-artifacts.md), [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md), [`references/validation-checklist.md`](references/validation-checklist.md) |
| `plan_feature` | [`references/planning-contract.md`](references/planning-contract.md), [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md) |
| `update_plan` | [`references/planning-contract.md`](references/planning-contract.md), [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md) |
| `sync_changes` | [`references/planning-contract.md`](references/planning-contract.md), [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md) when creating or materially updating HTML artifacts |
| `record_execution` | [`references/planning-contract.md`](references/planning-contract.md) only when linking to or updating plans, stages, units, or roadmap state; [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md) when creating or materially updating HTML artifacts; otherwise inspect the current `wiki/log.html` and relevant local wiki pages |
| `audit_or_upgrade` | [`references/validation-checklist.md`](references/validation-checklist.md), [`references/upgrade-contract.md`](references/upgrade-contract.md), [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md) when creating or materially updating HTML artifacts; load bootstrap or baseline references only when creating missing standard artifacts or repairing managed blocks |

Use the repo-local skill guidance embedded in [`references/generated-baseline-artifacts.md`](references/generated-baseline-artifacts.md) only when repo-local skills are already in use or explicitly requested. If inspection reveals a conditional trigger mid-workflow, pause file creation, read the newly relevant reference, then continue with that context.

## Zero-Context Intake

Use `intake_discovery` before bootstrap when the user has no project idea, no target repo, no source notes, no PRD, or only a vague prompt such as "I want to build something." Do not create `wiki/`, `AGENTS.md`, source briefs, plans, roadmap, repo-local skills, or scaffold files during intake.

Distinguish zero context from thin context:

- Zero context means there is not yet enough user-confirmed direction to name a project purpose, audience, primary outcome, product/interface type, or constraints. Run intake first.
- Thin context means the user supplied a rough but concrete idea, repo, note, source doc, or explicit unknowns. Bootstrap may create a minimal wiki that names gaps without inventing certainty.

During intake, ask focused questions to establish project type, audience, problem, desired outcome, constraints, interface shape, and first useful milestone. Stop with an intake summary unless the user confirms enough direction to bootstrap. A handoff to `bootstrap_new` needs at least a working title, target user/audience, project purpose, primary outcome, rough product/interface type, and known constraints or explicit unknowns.

## Project Root

This skill targets one project root. For monorepos or workspaces, identify whether the bootstrap applies to the repository root or a specific package/app root before writing. If the correct target root is ambiguous, stop and ask instead of creating root agent guidance or `wiki/` in the wrong place.

## Required Project Shape

Every completed bootstrap should create or preserve:

- `AGENTS.md`
- `CLAUDE.md` when the repository already uses Claude Code guidance or the user explicitly requests it
- `wiki/AGENTS.md`
- `wiki/index.html`
- `wiki/log.html`
- `wiki/Sources.html`
- `wiki/plans/index.html`
- `wiki/roadmap.html`
- repo-local `.agents/skills/project-wiki-maintainer/SKILL.md` when repo-local skills are already in use or explicitly requested

Generate source briefs only when the project evidence justifies them:

- `wiki/sources/prd.html` when product intent, audience, user journey, feature scope, constraints, or non-goals need durable preservation.
- `wiki/sources/technical-brief.html` when implementation choices, architecture, stack defaults, integrations, runtime boundaries, testing posture, or handoff risks need durable preservation.
- `wiki/sources/marketing-brief.html` when the project has a real public-entry, launch, signup, download, acquisition, or external-audience need.
- `wiki/sources/design-brief.html` when the project has a meaningful UI, frontend, website, dashboard, visual workflow, design system, or interaction-heavy product surface.
- `wiki/Architecture.html` when durable cross-cutting architecture decisions, system boundaries, data flow, integration surfaces, or runtime constraints need preservation.

Always create `wiki/plans/index.html`. During `import_existing`, classify lifecycle before creating deeper plan structure. Treat existing live products, internal tools in active use, libraries, archives, maintenance-mode projects, and unknown lifecycle as post-MVP unless source evidence or the user explicitly says the project is pre-launch, greenfield, or building an MVP. Do not create `wiki/plans/mvp/` by default for imported or existing live projects; use `wiki/roadmap.html`, `wiki/plans/features/`, `wiki/plans/maintenance/`, or `wiki/plans/releases/` only when concrete workstreams justify them. Create `wiki/plans/mvp/` only when the project clearly needs multiple ordered implementation sessions for greenfield, pre-launch, or explicitly MVP work. If unsure, do not create `wiki/plans/mvp/`; record it as a next planning decision. When using `mvp/`, prefer a small number of stages with multiple related units in each. Do not create many single-unit stages unless each has a real phase gate, external dependency, or distinct outcome boundary.

## Resume And Continue Guard

When the user asks to "resume", "continue", "pick up", "look at", or "work on" a plan, branch, worktree, or feature, do not assume permission to create plans or edit code.

First orient:

- inspect current branch, worktree, Git status, and changed files
- inspect `wiki/plans/index.html` and the closest relevant plans
- summarize current plan state, current unit, blockers, and ambiguity
- if no active plan exists, say that clearly
- ask whether the user wants to create a plan, revise a plan, or begin implementation

Do not create a new plan, infer design direction, or edit code until the user chooses the next action, unless the user explicitly requested planning or implementation. A branch or worktree name is not enough source context to decide scope.

## Feature Planning

Before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes in a project that uses this wiki structure, find the closest relevant plan under `wiki/plans/`. If none exists, create a decision-complete plan before implementation unless the user explicitly asked for exploratory analysis only.

Fast-path exception: for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction, do not create a plan. Make the change, validate it, and avoid wiki/log updates unless the fix reveals durable project knowledge.

Before creating a feature plan, inspect repo, wiki, and source context first, then aim for maximum useful clarification. Ask questions whenever answers would improve scope, non-goals, architecture, schema, UX, dependencies, validation, rollout, risks, sequencing, or the next execution unit. Prefer a focused batch of 3-7 high-leverage questions, grouped by theme when useful. Do not proceed directly to a plan unless the user asked to skip questions, the plan is a small fast-path fix, or the repo/wiki/source evidence already answers the important planning questions. If a remaining unknown is minor or can be handled safely, proceed and record the assumption in the plan.

Choose the planning shape before writing plan files. Depending on scope, propose one of: a compact feature plan with one execution unit, a single stage with multiple units, multiple stages with multiple units per stage, or no durable plan for fast-path work. Do not default to `mvp/` stages when a feature plan or single-stage unit list is clearer.

Optimize plans for CLI use. The first screen of `wiki/plans/index.html` and every active plan should show status, planning shape, current unit, blockers, next action, and useful read commands. When orienting or handing off, summarize the current plan state instead of dumping long HTML, and provide exact paths or `sed -n` commands for deeper reading.

For concrete plan/no-plan cases, use the Planning Examples in [`references/planning-contract.md`](references/planning-contract.md).

For frontend, UI, website, dashboard, or interaction-heavy work, inspect `wiki/sources/design-brief.html` when present before planning or implementation. If no design brief exists but repository evidence or source context contains durable UI design decisions, create or update the design brief before executing substantial UI work.

Plans should define intent, scope, non-goals, dependencies, validation, and the next execution unit. Every execution unit must include a `## Verification` section with automated, manual, or explicitly deferred verification. Do not mark a unit complete unless verification is recorded or deferred with a reason. Update an existing plan when corrective work or implementation discoveries change the intended path. Move fully complete plans into `wiki/plans/zzz_completed/` after the top-level plan, all stages, all units, completion gates, and verification records support completion; remove archived plans from active current-plan slots while preserving compact archive links. Create a new plan only when the work introduces a new durable feature track.

Keep routine implementation history in Git, not in plans or `wiki/log.html`. Append `wiki/log.html` only for material planning, validation, implementation, or maintenance work that changes durable project context, and link the entry back to the relevant plan or unit when one exists.

## Execution Notes During Implementation

When implementing planned work, keep running execution notes for information that the original spec or plan did not settle. Capture decisions required by missing context, deviations from the plan, tradeoffs, constraints discovered in code or tests, validation surprises, blockers, and follow-up decisions.

Do not use execution notes for routine edits, formatting, import fixes, every test run, commit summaries, or implementation details already obvious from Git. Execution notes are a working memory aid, not a second commit history.

Prefer adding execution notes to the active plan or unit when one exists. If the user explicitly asks for a separate notes file, keep it under `wiki/plans/` or the relevant feature plan folder and link it from the active plan. Do not create unindexed root-level `implementation-notes.html` by default.

At handoff, distill execution notes into durable wiki updates: update the active plan when scope, unit status, assumptions, or verification changed; append `wiki/log.html` only for durable project-context decisions; update `wiki/Sources.html` or source briefs when implementation changed source truth; update `wiki/roadmap.html` when next steps or blockers changed.

## Codebase Sync

When changes were made before a plan existed or when the wiki may be stale, reconcile from repository evidence before writing. Inspect Git status, changed files, relevant diffs, recent commits, tests or validation output when available, and the current wiki state.

Use `wiki/log.html` as the primary sync artifact for context changes, not as a duplicate commit history. Update existing plans only when the changes completed, invalidated, narrowed, expanded, or redirected planned work. Create a retrospective feature plan only when the changes introduced a durable feature track or future implementation dependency that needs a maintained plan.

## Log Policy

Git history owns routine implementation history. `wiki/log.html` owns durable project-context history: bootstrap/import events, planning direction changes, codebase sync summaries after unplanned work, validation results that affect plans or roadmap, source-context changes, and important decisions discovered during implementation.

Before appending to `wiki/log.html`, ask: would this entry help a future agent make a better project decision? If not, do not log it.

Do not add log entries for routine commits, every code edit, every test run, formatting, minor refactors, or implementation details already obvious from Git. Prefer one log entry per meaningful project-context change, not one per commit.

Do not log routine notes such as "ran npm test", "fixed lint error", "updated import", "changed CSS class", or "committed changes" unless the result changes project direction, validation status, public behavior, or future planning.

Keep `wiki/log.html` scan-friendly. If it becomes hard to scan, summarize older entries into `wiki/log-archive.html` or a dated archive such as `wiki/log/2026.html`, then leave a short pointer from the current log to the archive. Do not rewrite recent decision history unless the user explicitly asks for log cleanup.

Update `wiki/roadmap.html`, `wiki/Sources.html`, source briefs, or `wiki/index.html` only when the codebase changes reveal durable project knowledge, source evidence, architecture, product behavior, UI design direction, or next-step changes. Name unknowns when the reason or intent behind a change cannot be inferred from the repository and user context.

## Safety Rules

- Never overwrite existing project files or repo-local skill files.
- Use bounded managed blocks only when updating existing agent guidance.
- Follow existing agent guidance conventions. If the repo already uses `CLAUDE.md`, preserve and update that file with a managed block when appropriate; do not create extra agent-specific files unless the convention already exists or the user asks.
- Initialize Git for newly created projects unless the user opts out.
- Preserve existing Git history for imported repos.
- Do not commit, push, or generate scaffold code by default. Follow the repo automation policy for commits, pushes, dependency installs, and other actions.
- Do not create implementation plans in root-level `docs/`, `tasks/`, or ad hoc planning files outside `wiki/`.
- Never leave bracketed placeholders in generated project files. Replace them with project-specific content, or write `Unknown` when current evidence does not support a value.
- Name unknowns and contradictions instead of inventing certainty.
- Keep maintained project knowledge under `wiki/`; do not create root-level `docs/` or `tasks/` for durable planning.

## Repo Automation Policy

Use a repo-level automation policy to remember how much autonomy the user wants. Store it in `wiki/AGENTS.md` and, when useful, summarize or point to it from root `AGENTS.md` or `CLAUDE.md`.

Default policy when none exists:

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only

During bootstrap, import, or audit, ask whether the user wants to keep the default policy or allow different automation for that repo. Good common setting: `Commit docs-only wiki changes: auto`, while keeping code commits and pushes as `ask` and dependency installs as `auto`.

When auto-committing is allowed:

- inspect `git status --short` before committing
- include only intended files for the completed task
- for docs-only wiki commits, stage only `wiki/`, root agent guidance files, and other docs files intentionally changed by the Project HTML Wiki Skill
- leave unrelated dirty files untouched and mention them
- do not commit code changes unless the policy explicitly allows code commits and required verification is recorded
- do not push unless the policy explicitly allows auto-push or the user requests it
- use concise messages such as `Initialize project wiki`, `Update project wiki`, `Sync project wiki with recent changes`, or `Add feature plan`

## Source Context

`wiki/Sources.html` is always required as the human source index. It should catalog source material, repository evidence, prompts, notes, briefs, proposals, and unknowns without inventing certainty.

When source briefs are useful, `wiki/sources/prd.html` owns product intent and user journey. `wiki/sources/technical-brief.html` translates that intent into executable technical defaults and implementation surfaces without overriding the PRD. If public-facing acquisition, signup, download, or launch flow matters, add a compact `wiki/sources/marketing-brief.html`. If the project has a durable UI or visual interaction surface, `wiki/sources/design-brief.html` owns interface principles, visual system direction, interaction patterns, responsive expectations, accessibility expectations, design validation, and known design unknowns.

Every source brief should include a `## Status` section with `Last reviewed`, `Evidence basis`, and `Confidence: high|medium|low`. During `sync_changes`, if implementation or new user direction contradicts a source brief, update the brief status, lower confidence, or record the contradiction instead of treating the brief as authoritative.

If source docs contradict repo evidence or each other on scaffold-impacting choices, stop short of scaffold handoff recommendations and ask for clarification.

## Scaffold Boundary

App scaffold generation is not a core mode of this skill. If the user explicitly asks for scaffold code after bootstrap or import, treat it as a separate implementation task: use repo conventions, source docs, and the relevant stack-specific workflow, and keep `wiki/log.html`, plans, source briefs, and roadmap state updated when the scaffold changes durable project knowledge.

Do not choose a stack from thin context, install dependencies, or generate app files as part of ordinary Project HTML Wiki Skill bootstrap, import, planning, sync, or audit work.

## Handoff

End with a concise summary of created, updated, preserved, skipped, failed, blocked, and present-but-not-upgraded artifacts; Git result; unresolved unknowns; and next actions. Include the reason and safest next action for every non-success result. Prefer editor, folder, terminal, and key-file handoffs over keeping the user inside a custom app surface.

## Maintaining This Skill

Keep this skill concise and move detailed reusable guidance into `references/`. Keep `README.md` focused on public GitHub distribution. Do not overwrite user-authored files when testing the bootstrap workflow against another repo.

## References

- [`references/canonical-bootstrap-contract.md`](references/canonical-bootstrap-contract.md) for the full artifact and safety contract
- [`references/generated-baseline-artifacts.md`](references/generated-baseline-artifacts.md) for required artifact templates and managed-block markers
- [`references/intake-discovery-contract.md`](references/intake-discovery-contract.md) for zero-context intake questions, stopping rules, handoff shape, and minimum context before bootstrap
- [`references/html-artifact-patterns.md`](references/html-artifact-patterns.md) for artifact pattern selection, reader goals, visual structures, copy/export controls, code snippets, evidence UI, style systems, examples, and visual QA
- [`references/example-minimal-bootstrap.md`](references/example-minimal-bootstrap.md) for a filled minimal output example
- [`references/example-moderate-import.md`](references/example-moderate-import.md) for a moderate existing-repo import with source briefs, planning, warnings, and `present_but_not_upgraded`
- [`references/planning-contract.md`](references/planning-contract.md) for feature planning, plan updates, `wiki/plans/mvp/`, stages, units, and project-context log guidance
- [`references/upgrade-contract.md`](references/upgrade-contract.md) for additive upgrade behavior and managed marker versions
- [`references/validation-checklist.md`](references/validation-checklist.md) for greenfield and import validation scenarios
