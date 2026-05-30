# Generated Baseline Artifacts

Use this reference when creating the required baseline files for a bootstrapped project. Keep generated files compact, project-specific, CLI-readable, and renderer-friendly. Replace bracketed placeholders with real project context, or name the unknown when context is missing.

## Managed Block Markers

When updating existing root or wiki agent guidance such as `AGENTS.md`, `CLAUDE.md`, or `wiki/AGENTS.mdx`, preserve user-authored content and add or replace only this bounded block:

```markdown
<!-- HYPERWIKI-SKILL:START v1 -->
[managed project wiki guidance]
<!-- HYPERWIKI-SKILL:END -->
```

Do not create multiple managed blocks in the same file. If markers already exist, replace only the content between them.

## `AGENTS.md`

```markdown
# AGENTS.md instructions for [project-root]

<!-- HYPERWIKI-SKILL:START v1 -->
## [Project Name] Agent Guide

### Project Wiki

- Read `wiki/index.mdx` before answering project-specific questions or making structural changes.
- Keep durable project knowledge, plans, decisions, and project-context history under `wiki/`.
- Use `wiki/sources.mdx` as the source index.
- Create or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- Do not create plans for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction.
- Sync recent codebase changes back into `wiki/log.mdx`, relevant plans, roadmap, and source docs when work happened before planning or made the wiki stale.
- Update `wiki/index.mdx` when adding or materially changing durable wiki pages.
- Update `wiki/log.mdx` after bootstrapping, planning, validation, or material project changes that affect durable project context.

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
<!-- HYPERWIKI-SKILL:END -->
```

## `CLAUDE.md`

Create `CLAUDE.md` only when the repository already uses Claude Code guidance or the user explicitly requests Claude-specific local guidance.

```markdown
# CLAUDE.md instructions for [project-root]

<!-- HYPERWIKI-SKILL:START v1 -->
## [Project Name] Project Wiki

- Read `AGENTS.md`, `wiki/AGENTS.mdx`, and `wiki/index.mdx` before project-specific structural work.
- Keep durable project knowledge, plans, decisions, and project-context history under `wiki/`.
- Use `wiki/sources.mdx` as the source index and `wiki/plans/` for maintained implementation plans.
- Sync durable project-context changes back into the wiki when implementation makes plans, source briefs, roadmap state, or the source index stale.
- Preserve user-authored instructions outside this managed block.
<!-- HYPERWIKI-SKILL:END -->
```

## `wiki/AGENTS.mdx`

```markdown
# [Project Name] Wiki Agent Guide

<!-- HYPERWIKI-SKILL:START v1 -->
This `wiki/` directory is the maintained MDX knowledge and planning layer for `[Project Name]`.

## Source Of Truth

- `index.mdx` is the wiki front door.
- `log.mdx` is the project-context changelog. Git owns routine implementation history.
- `sources.mdx` catalogs source material, repository evidence, and unknowns.
- `plans/index.mdx` defines the planning contract.
- `roadmap.mdx` tracks the next useful project direction.

## Rules

- Read `index.mdx` before structural wiki changes.
- Keep durable project knowledge, planning, decisions, and validation notes under `wiki/`.
- Preserve exact source material under `wiki/sources/` only when provenance matters.
- Update `index.mdx` when adding or materially changing durable pages.
- Update `log.mdx` after bootstrapping, planning, validation, or material project changes that affect durable project context.
- Use renderer-agnostic MDX with Markdown, semantic HTML/JSX, tables, `<details>`, and inline SVG when structure improves readability.
- Use Hyperwiki planning components for plan pages when available; avoid other custom imports unless the target repo explicitly supports them.

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
<!-- HYPERWIKI-SKILL:END -->
```

## MDX Artifact Standard

All generated `wiki/*.mdx` and `wiki/**/*.mdx` pages should be renderer-agnostic MDX source documents:

- Include frontmatter with `title`, `description`, and `wikiKind`.
- Start with a CLI-readable top section that states reader goal, current status, next action, blockers, and key links when applicable.
- Use Markdown for ordinary content and semantic HTML/JSX only for richer structures.
- Prefer summaries, tables, status matrices, execution tracks, decision panels, evidence matrices, `<details>`, and inline SVG diagrams over long prose.
- Keep internal links relative and point to `.mdx` paths.
- Use Hyperwiki planning components for plan pages when available: `PlanHero`, `PlanSummary`, `PlanUnit`, `Decision`, `Evidence`, `Verification`, `Callout`, `Note`, `Tip`, `Warning`, `Danger`, `Check`, `Panel`, `Frame`, `Steps`, `Step`, `Prompt`, `Update`, `TaskList`, `StatusBadge`, `ParamField`, `ResponseField`, `Tree`, `TreeFolder`, `TreeFile`, `CodeBlock`, `Tabs`, `Tab`, `AccordionGroup`, `Accordion`, `Tooltip`, and `Visibility`.
- Use `Visibility for="agents"` for long source context, raw Q&A, or handoff detail that should remain in Markdown derivatives but stay hidden in the rendered app.
- Do not use inline scripts by default.
- Do not define a skill-owned CSS/theme contract. Styling belongs to the target MDX renderer.
- Load [`mdx-artifact-patterns.md`](mdx-artifact-patterns.md) before substantial MDX work.
- Never leave bracketed placeholders in generated files.

## `wiki/index.mdx`

```mdx
---
title: "[Project Name] Wiki"
description: "Project memory, source context, plans, and handoff state for [Project Name]."
wikiKind: "index"
---

# [Project Name]

[One short paragraph describing what the project is. If unknown, say what is known and what is missing.]

## Reader Goal

After 2 minutes, the reader can identify the current project focus, the authoritative source index, and the next project action.

## Current Focus

[Current project focus, next decision, or bootstrap handoff state.]

## Core Pages

| Page | Purpose |
| --- | --- |
| [Wiki Agent Guide](AGENTS.md) | Local wiki maintenance contract. |
| [Project Log](log.mdx) | Durable project-context changelog. |
| [Sources](sources.mdx) | Source material, evidence, and unknowns. |
| [Plans](plans/index.mdx) | Plans index and implementation contract. |
| [Roadmap](roadmap.mdx) | Current goal, next decision, and staged direction. |

## Source Briefs

[List generated source briefs when present. If none were generated, state that no separate source briefs were justified by current evidence.]
```

## `wiki/log.mdx`

```mdx
---
title: "[Project Name] Log"
description: "Durable project-context history for [Project Name]."
wikiKind: "log"
---

# [Project Name] Log

[Back to wiki index](index.mdx)

## Log Policy

Append durable project-context changes here. Git owns routine implementation history. Do not log routine commits, every code edit, every test run, formatting, minor refactors, or details already obvious from Git.

## Entries

### [YYYY-MM-DD] Initialize Project Wiki

Type: bootstrap

- Created the MDX project wiki, source index, local agent guidance, and planning contract.
- Mode: `[bootstrap_new|import_existing]`.
- Git result: [initialized new repository | preserved existing repository | skipped by request | failed: reason].
- Source briefs: [none generated | generated `wiki/sources/prd.mdx` | generated `wiki/sources/design-brief.mdx` | generated ...].
```

## `wiki/sources.mdx`

```mdx
---
title: "[Project Name] Sources"
description: "Source material, repository evidence, and unknowns for [Project Name]."
wikiKind: "sources"
---

# Sources

[Back to wiki index](index.mdx)

This page catalogs source material, repository evidence, and unresolved unknowns for **[Project Name]**.

## Reader Goal

After 2 minutes, the reader can tell what is confirmed, what is inferred, and what remains unknown.

## Source Material

| Source | What It Contributes | Confidence |
| --- | --- | --- |
| [Prompt/source note/repository evidence] | [short description] | [high|medium|low] |

## Repository Evidence

- [Observed file, manifest, stack, or Git state]

## Generated Source Briefs

None generated yet. Current evidence does not justify separate source briefs.

## Unknowns

- [Unknown or contradiction that matters for future planning]
```

## `wiki/sources/design-brief.mdx`

Create this source brief only when project evidence justifies durable UI design memory. Do not create it for CLI tools, backend services, libraries, infra projects, or thin prompts without a meaningful interface signal.

All generated source briefs should include this status pattern near the top:

```mdx
## Status

| Field | Value |
| --- | --- |
| Last reviewed | [YYYY-MM-DD] |
| Evidence basis | [prompt | repo | source doc | implementation] |
| Confidence | [high | medium | low] |
| Known gaps | [Unknown | concise list] |
```

```mdx
---
title: "[Project Name] Design Brief"
description: "Durable UI and interaction guidance for [Project Name]."
wikiKind: "source-brief"
---

# Design Brief

[Back to wiki index](../index.mdx)

## Status

| Field | Value |
| --- | --- |
| Last reviewed | [YYYY-MM-DD] |
| Evidence basis | [prompt | repo | source doc | implementation] |
| Confidence | [high | medium | low] |
| Known gaps | [Unknown | concise list] |

## Product Surface

[The UI, frontend, website, dashboard, visual workflow, design system, or interaction-heavy surface this brief covers.]

## Interface Principles

[Durable guidance for density, hierarchy, tone, navigation, workflow ergonomics, and what future UI work should preserve.]

## Visual System

[Colors, typography, spacing, component conventions, iconography, imagery, brand constraints, or unknowns.]

## Interaction Patterns

[Forms, tables, filters, navigation, empty states, loading states, errors, confirmations, keyboard behavior, and similar patterns.]

## Responsive And Accessibility Expectations

[Viewport priorities, contrast, focus states, reduced motion, assistive technology expectations, and known constraints.]

## Validation

[Manual design review, rendered MDX checks, screenshot checks, viewport checks, accessibility checks, or automated tests expected for UI work.]

## Unknowns

[Missing brand, target devices, design system decisions, reference screenshots, asset needs, or unresolved tradeoffs.]
```

## `wiki/plans/index.mdx`

```mdx
---
title: "[Project Name] Plans"
description: "Plans index and implementation contract for [Project Name]."
wikiKind: "plans-index"
---

# Plans

[Back to wiki index](../index.mdx)

This directory holds durable implementation plans for **[Project Name]**.

## Reader Goal

After 2 minutes, the reader can identify the active plan, current unit, blocker, or next decision.

## Current Planning State

| Field | Value |
| --- | --- |
| Active plan | [none | features/example.mdx | mvp/index.mdx] |
| Shape | [none | compact feature plan | single-stage MVP | multi-stage MVP] |
| Current unit | [unit name or none] |
| Next action | [one concrete action or decision] |
| Blockers | [none or short list] |

## Planning Rule

Create or update an MDX plan before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.

Fast-path exception: for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction, do not create a plan.

## Structure

- Use `features/` for focused feature plans that do not need a full numbered roadmap.
- Use `mvp/` only for greenfield, pre-launch, or explicitly MVP work that needs numbered roadmap implementation sessions.
- Use `zzz_completed/` for completed plans after all stages, units, completion gates, and verification records support completion.
- For imported or existing live projects, default to [roadmap](../roadmap.mdx) plus focused `features/`, `maintenance/`, or `releases/` plans only when concrete workstreams justify them.
- Record completed work, decisions discovered during implementation, and verification in [log](../log.mdx) only when they affect durable project context.

## Completed Plans

[No completed plans archived yet | Completed plans: `zzz_completed/features/example.mdx`]
```

## `wiki/roadmap.mdx`

```mdx
---
title: "[Project Name] Roadmap"
description: "Current goal, next decision, next steps, and deferred work for [Project Name]."
wikiKind: "roadmap"
---

# Roadmap

[Back to wiki index](index.mdx)

## Current Goal

[The first durable project outcome.]

## Next Decision

[The next decision needed before implementation or deeper planning.]

## Next Steps

1. [Concrete next step]
2. [Concrete next step]
3. [Concrete next step]

## Deferred

- [Known deferred work, non-goal, or future option]
```

## `.agents/skills/project-wiki-maintainer/SKILL.md`

Use the local skill support decision tree in [`canonical-bootstrap-contract.md`](canonical-bootstrap-contract.md) before creating repo-local skills. Create `.agents/skills/project-wiki-maintainer/SKILL.md` only when repo-local skills are already in use or explicitly requested.

```markdown
---
name: project-wiki-maintainer
description: Maintain [Project Name]'s MDX wiki, plans, log, source index, source briefs, and local agent rules. Use when updating durable project knowledge, planning features, updating implementation plans, syncing recent codebase changes back into the wiki, recording validation or decisions, maintaining roadmap/log state, or answering from [Project Name]'s project wiki.
---

# Project Wiki Maintainer

Use this skill to maintain `[Project Name]`'s `wiki/` knowledge layer.

## Workflow

1. Read `wiki/AGENTS.mdx` and `wiki/index.mdx` first.
2. Before substantial MDX work, choose the artifact pattern, define the 2-minute reader goal, keep the top section CLI-readable, avoid long prose by using structured MDX, and validate links/placeholders.
3. Preserve source context in `wiki/sources.mdx`; create `wiki/sources/` briefs only when project evidence justifies them, including `design-brief.mdx` for durable UI design memory.
4. Create or update durable plans under `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes, except for small, local, reversible fixes that do not change durable project direction.
5. During implementation, keep execution notes in the active plan or unit for decisions, tradeoffs, deviations, discovered constraints, validation surprises, blockers, and follow-up decisions. Distill durable items into the plan, `wiki/log.mdx`, source docs, or roadmap before handoff.
6. Move fully complete plans into `wiki/plans/zzz_completed/` after all stages, units, completion gates, and verification records support completion.
7. Sync recent codebase changes back into `wiki/log.mdx`, relevant plans, roadmap, and source docs when work happened before planning or made the wiki stale.
8. Update `wiki/index.mdx` when adding or materially changing durable pages.
9. Append `wiki/log.mdx` after planning, validation, or material project changes that affect durable project context.

## Boundaries

- Do not create root-level `docs/` or `tasks/` for durable planning.
- Do not overwrite user-authored wiki or skill files.
- Name unknowns and contradictions instead of inventing certainty.
```
