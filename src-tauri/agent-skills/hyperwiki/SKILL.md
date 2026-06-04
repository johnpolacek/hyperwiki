---
name: hyperwiki
description: Use this skill for hyperwiki project memory, MDX wiki pages, MDX planning docs, project import/planning, source sync, roadmap/log maintenance, and agent-guided plan creation. Applies to projects initialized by hyperwiki or any repo with a `wiki/` directory following hyperwiki conventions. Do not use for ordinary coding tasks unless wiki/planning state must be created, revised, audited, or reconciled.
---

# hyperwiki Skill

Use this skill to maintain a hyperwiki project wiki: an MDX-first project memory layer for agentic development. hyperwiki owns source context, planning state, execution handoffs, verification records, and durable project decisions under `wiki/`.

## Current Contract

hyperwiki is in MDX-first test mode. Do not preserve old HTML wiki conventions.

- App-rendered wiki pages are `.mdx`.
- Root `AGENTS.md`, optional `CLAUDE.md`, and `.agents/skills/*/SKILL.md` remain Markdown because external tools expect those paths.
- Use lowercase `wiki/sources.mdx` as the source index.
- Use app-visible `wiki/AGENTS.mdx` for wiki agent guidance.
- Keep local runtime state under ignored `.hyperwiki/state/` and `.hyperwiki/sessions/`.
- Do not create `wiki/Sources.mdx`, `wiki/index.html`, `wiki/log.html`, or `wiki/AGENTS.html`.

## MDX Output

Generated wiki pages must be `.mdx` source artifacts. Keep raw MDX useful in a terminal and rendered MDX useful inside hyperwiki.

- Use minimal frontmatter: `title`, `description`, and `wikiKind`.
- Start pages with CLI-readable status, reader goal, current state, next action, and blockers.
- Prefer Markdown, tables, semantic HTML/JSX, `<details>`, and small inline SVG for ordinary docs.
- Use hyperwiki planning components for plan pages when they improve structure: `PlanHero`, `PlanSummary`, `PlanUnit`, `Decision`, `Evidence`, `Verification`, `Callout`, `Note`, `Tip`, `Warning`, `Danger`, `Check`, `Panel`, `Frame`, `Card`, `CardGroup`, `Columns`, `Column`, `Aside`, `RequestExample`, `ResponseExample`, `Steps`, `Step`, `Prompt`, `Update`, `TaskList`, `StatusBadge`, `ParamField`, `ResponseField`, `Tree`, `TreeFolder`, `TreeFile`, `CodeBlock`, `CommandBlock`, `Tabs`, `Tab`, `AccordionGroup`, `Accordion`, `Tooltip`, and `Visibility`.
- Before writing a plan, choose the planning composition pattern that fits the content: feature plan, architecture comparison, API/MCP contract, implementation unit, or verification handoff.
- Prefer `PlanHero` for title and intent, `PlanSummary` for status/current unit/next action/blockers/validation, `Decision` for accepted choices, `Evidence` for source-grounded facts, `Verification` for checks, `Steps`/`Step` for stage or unit sequences, `CardGroup`/`Columns` for alternatives or work tracks, `RequestExample`/`ResponseExample`/`ParamField`/`ResponseField` for contracts, and `Aside` for compact secondary context. Use plain semantic sections for routine headings like Scope, Implementation Notes, and Completion Gate.
- Use `Visibility for="agents"` for long source context, raw Q&A, or handoff details that agents need but humans should not see in the rendered app. Use `Visibility for="humans"` only for app-visible explanation that should be stripped from agent Markdown.
- Every executable plan unit must include a `Verification` section or `Verification` component.
- Avoid inline scripts and remote assets.
- Do not invent source truth; name unknowns and contradictions.

Before substantial MDX artifact work, read `references/mdx-artifact-patterns.md`.

## Workflow

1. Inspect first: root files, Git state, manifests, changed files, existing `wiki/`, source briefs, plans, roadmap, log, and agent guidance.
2. Choose the mode:
   - `intake_discovery`: interview before files exist or project direction is too vague.
   - `bootstrap_new`: create a fresh MDX hyperwiki scaffold.
   - `import_existing`: add hyperwiki memory to an existing repo without overwriting user files.
   - `plan_feature`: create a decision-complete implementation plan before meaningful app changes.
   - `update_plan`: revise an existing plan after decisions, implementation discoveries, or validation.
   - `sync_changes`: reconcile recent code changes back into wiki/log/plans/source briefs.
   - `record_execution`: append durable project-context history to `wiki/log.mdx`.
   - `audit_or_upgrade`: check or repair hyperwiki conventions.
3. Load only the references needed for the chosen mode.
4. Write the smallest durable wiki update that preserves future implementation clarity.
5. Record material planning, validation, maintenance, bootstrap, or implementation context in `wiki/log.mdx` only when it affects future decisions.

## Reference Loading

| Mode | Read Before Writing |
| --- | --- |
| `intake_discovery` | `references/intake-discovery-contract.md` |
| `bootstrap_new` | `references/canonical-bootstrap-contract.md`, `references/generated-baseline-artifacts.md`, `references/mdx-artifact-patterns.md` |
| `import_existing` | `references/canonical-bootstrap-contract.md`, `references/generated-baseline-artifacts.md`, `references/mdx-artifact-patterns.md`, `references/validation-checklist.md` |
| `plan_feature` | `references/planning-contract.md`, `references/mdx-artifact-patterns.md` |
| `update_plan` | `references/planning-contract.md`, `references/mdx-artifact-patterns.md` |
| `sync_changes` | `references/planning-contract.md`; add `references/mdx-artifact-patterns.md` when creating or materially revising MDX |
| `record_execution` | `references/planning-contract.md` when touching plans/roadmap; otherwise inspect current wiki files |
| `audit_or_upgrade` | `references/validation-checklist.md`, `references/upgrade-contract.md`, `references/mdx-artifact-patterns.md` |

## Planning Rules

Before meaningful code, config, schema, dependency, architecture, test, build, public API, security, or app behavior changes, find or create the closest relevant plan under `wiki/plans/`.

Planning shape is flexible:

- compact feature plan with one or more units
- plan with stages and units
- MVP plan with multiple stages
- maintenance or release plan when that better fits the work

The structure must still support `plan > stages > units`. Compact plans may use one implicit stage, but executable units always need verification.
If a plan has explicit stages, a current stage, a multi-stage sequence, or more than one phase gate, create a plan-root directory with separate stage and unit MDX pages instead of collapsing the stages into headings inside one page. Stage pages must name the stage goal, dependencies or blockers, detailed unit sequence, completion gate, and verification expectations. Unit pages must include Intent or Goal, Scope, Implementation Notes, Dependencies or Blockers, Verification, and Completion Gate, with concrete automated, manual, or explicitly deferred verification before the next unit starts.

For agent-guided plan creation:

- Use grill-with-docs-style questioning: ask one focused question at a time.
- Check repository/wiki evidence before asking questions the repo can answer.
- Surface terminology conflicts and contradictions.
- Continue until there are no blocking unknowns.
- Write summarized evidence, decisions, assumptions, unknowns, plan structure, and verification targets into MDX.
- Keep full chat transcript in ignored runtime state unless the user explicitly asks to preserve it.

## Required Project Shape

A completed hyperwiki scaffold should create or preserve:

- `AGENTS.md`
- `CLAUDE.md` only when already used or explicitly requested
- `wiki/AGENTS.mdx`
- `wiki/index.mdx`
- `wiki/log.mdx`
- `wiki/sources.mdx`
- `wiki/plans/index.mdx`
- `wiki/roadmap.mdx`

Generate source briefs only when evidence justifies them:

- `wiki/sources/prd.mdx`
- `wiki/sources/technical-brief.mdx`
- `wiki/sources/design-brief.mdx`
- `wiki/sources/marketing-brief.mdx`
- `wiki/architecture.mdx`

## Safety

- Never overwrite user-authored files.
- Preserve existing Git history.
- Keep durable project knowledge under `wiki/`.
- Do not create root-level `docs/` or `tasks/` for maintained plans.
- Never leave bracketed placeholders.
- Do not push unless explicitly requested.
- Commit docs-only changes only when repo policy or the active hyperwiki workflow says to do so.

## Handoff

End with a concise summary of created, updated, preserved, skipped, failed, blocked, and present-but-not-upgraded artifacts; Git result; unresolved unknowns; and next actions.

## References

- `references/canonical-bootstrap-contract.md`
- `references/generated-baseline-artifacts.md`
- `references/intake-discovery-contract.md`
- `references/mdx-artifact-patterns.md`
- `references/example-minimal-bootstrap.md`
- `references/example-moderate-import.md`
- `references/planning-contract.md`
- `references/upgrade-contract.md`
- `references/validation-checklist.md`
