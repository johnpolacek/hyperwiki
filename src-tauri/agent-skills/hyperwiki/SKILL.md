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

Generated wiki pages must be `.mdx` source artifacts. The test is meaning-in-source, not plainness: every decision a reader needs — status, copy, layout intent, the next action — must live in the file's text or component attributes, so an agent reading raw MDX learns the same thing a human sees rendered. This is not a constraint on visuals. Rich components, mockups, diagrams, and generated previews are welcome; only meaning that exists *only* as rendered pixels (an image-only mockup, a layout encoded purely in CSS) is disallowed. Optimize the opening lines for quick terminal inspection, but compose freely below them.

- Use minimal frontmatter: `title`, `description`, and `wikiKind`.
- Start pages with CLI-readable status, reader goal, current state, next action, and blockers.
- Prefer Markdown, tables, semantic HTML/JSX, `<details>`, and small inline SVG for ordinary docs.
- Use hyperwiki planning components for plan pages when they improve structure: `PlanHero`, `PlanSummary`, `PlanUnit`, `Decision`, `OpenDecision`, `DecisionOption`, `Evidence`, `Verification`, `Scope`, `ImplementationNotes`, `Dependencies`, `CompletionGate`, `Screen`, `Mockup`, `Callout`, `Note`, `Tip`, `Warning`, `Danger`, `Check`, `Panel`, `Frame`, `Card`, `CardGroup`, `Columns`, `Column`, `Aside`, `Flow`, `FlowStep`, `StageTrack`, `StageItem`, `RequestExample`, `ResponseExample`, `Steps`, `Step`, `Prompt`, `Update`, `TaskList`, `StatusBadge`, `ParamField`, `ResponseField`, `Tree`, `TreeFolder`, `TreeFile`, `CodeBlock`, `CommandBlock`, `Tabs`, `Tab`, `AccordionGroup`, `Accordion`, `Tooltip`, and `Visibility`.
- Before writing a plan, choose the planning composition pattern that fits the content: feature plan, architecture comparison, API/MCP contract, implementation unit, or verification handoff. Then start from the matching skeleton in `references/plan-page-skeletons.md`.
- Every plan page opens with `PlanHero` followed by `PlanSummary`. A substantial plan page with zero hyperwiki plan components fails the quality bar and hyperwiki plan validation.
- Prefer `PlanHero` for title and intent, `PlanSummary` for status/current unit/next action/blockers/validation, `Decision` for accepted choices, `Evidence` for source-grounded facts, `Verification` for checks, `Steps`/`Step` for stage or unit sequences, `StageTrack`/`StageItem` for stage and unit progress with links, `Flow`/`FlowStep` for pipelines and user/data flows, `CardGroup`/`Columns` for alternatives or work tracks (`cols="2"`/`cols="3"` for comparison grids), `CodeBlock` for file snippets/schema/config/API examples, `CommandBlock` for exact local commands, `RequestExample`/`ResponseExample`/`ParamField`/`ResponseField` for contracts, and `Aside` for compact secondary context. Use the dedicated section components for the canonical unit sections: `Scope`, `ImplementationNotes`, `Dependencies`, `Verification`, and `CompletionGate`. Each self-titles from its tag name (pass `title="..."` only to override the default label).
- Prefer `CodeBlock` over raw fenced code blocks for visible plan examples when a title, language label, copy affordance, or tabbed alternatives would help. For alternatives, compose `Tabs`/`Tab` with one `CodeBlock` per tab instead of dumping repeated fences.
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
   - `terminal_import_planning`: run imported-project Q&A in the terminal, then create MVP plan docs.
   - `plan_feature`: create a decision-complete implementation plan before meaningful app changes.
   - `update_plan`: revise an existing plan after decisions, implementation discoveries, or validation.
   - `sync_changes`: reconcile recent code changes back into wiki/log/plans/source briefs.
   - `record_execution`: append durable project-context history to `wiki/log.mdx`.
   - `audit_or_upgrade`: check or repair hyperwiki conventions.
3. Load only the references needed for the chosen mode.
4. Write the smallest durable wiki update that preserves future implementation clarity.
5. Record material planning, validation, maintenance, bootstrap, or implementation context in `wiki/log.mdx` only when it affects future decisions.

When executing a unit (`record_execution`) whose result is browser-observable, capture visual evidence with the `agent-browser` skill: screenshot each distinct view/state of the running app. First remove any existing PNGs in the per-unit directory named in the Execute Unit prompt (under `.hyperwiki/state/screenshots/<unit-path>/`), then save the fresh set there as ordered PNGs (e.g. `01-home.png`, `02-settings.png`) so a redesign fully replaces the old shots. Skip cleanly when the unit has no visible UI result.

When applying review feedback to an already-completed unit, append a `## Revisions` section at the end of the unit page (create it if absent, otherwise add a new dated entry) listing the feedback you addressed and a short summary of what changed, preserving the page's existing plan components. Then regenerate the screenshots: first remove any existing PNGs in the unit's screenshot directory, then capture the current views fresh into it so the set fully reflects the new state (no stale shots) and can be reviewed.

Reaching gated previews: before capturing, ensure the full app is running — `pnpm dev` must start the frontend and any backend it needs (e.g. push Convex functions), and the preview URL must respond. If the view requires auth, read the `previewCapture` profile in `.hyperwiki/config.json` plus the test credentials in `.env.local` (key names live in the profile) and sign in with `agent-browser`; for Clerk test instances use a `+clerk_test` email and verification code `424242`, adapting to the form shown. If the sign-up form shows a bot challenge (e.g. Cloudflare Turnstile) that won't solve headlessly, do not drive sign-up — ensure the test user via the provider's backend API (e.g. the Clerk Backend API with `CLERK_SECRET_KEY`), then sign in (code `424242`); or disable bot sign-up protection on the dev/test instance. Honor any `## Screenshot capture` section on the unit page for the route(s) and the steps needed to reach a deep state. Test credentials only.

## Reference Loading

| Mode | Read Before Writing |
| --- | --- |
| `intake_discovery` | `references/intake-discovery-contract.md` |
| `bootstrap_new` | `references/canonical-bootstrap-contract.md`, `references/generated-baseline-artifacts.md`, `references/mdx-artifact-patterns.md` |
| `import_existing` | `references/canonical-bootstrap-contract.md`, `references/generated-baseline-artifacts.md`, `references/mdx-artifact-patterns.md`, `references/validation-checklist.md` |
| `terminal_import_planning` | `references/planning-contract.md`, `references/mdx-artifact-patterns.md`, `references/plan-page-skeletons.md` |
| `plan_feature` | `references/planning-contract.md`, `references/mdx-artifact-patterns.md`, `references/plan-page-skeletons.md` |
| `update_plan` | `references/planning-contract.md`, `references/mdx-artifact-patterns.md`, `references/plan-page-skeletons.md` |
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
If a plan has explicit stages, a current stage, a multi-stage sequence, or more than one phase gate, create a plan-root directory with separate stage and unit MDX pages instead of collapsing the stages into headings inside one page. Stage pages must name the stage goal, dependencies or blockers, detailed unit sequence, completion gate, and verification expectations. Unit pages must include Intent or Goal plus the `Scope`, `ImplementationNotes`, `Dependencies`, `Verification`, and `CompletionGate` section components, with concrete automated, manual, or explicitly deferred verification before the next unit starts. Manual verification must be user-actionable: identify who performs it, exact commands/settings/UI paths when known, expected success signals, and what to rerun afterward.

When a unit creates or changes user-facing screens, specify the UI in the unit page before implementation instead of only naming it. Add a `## Screen content & layout` section that describes the shared frame once (header, nav, progress, action row, error region), then one `<Screen name="..." route="..." step="..." progress="...">` per screen or step. Inside each `Screen`, give: its purpose; the canonical copy as final wording (headings, subheads, field labels and placeholders, button text, empty/error/success messages — not paraphrase); the top-to-bottom order of regions and controls; the states it can show (loading, empty, error, success); and the action or mutation each primary control commits and where it advances. Use `<Mockup>` with an ASCII/text wireframe when a quick visual of the layout helps — keep the wireframe as plain text so it reads in a terminal and renders as a framed preview in-app. This section is the design-decision record the execute agent implements against, so settle product and visual choices here (or in `wiki/sources/design-brief.mdx`) rather than leaving them to implementation. The later `## Screenshot capture` section then verifies these screens were built as specified.

When a unit produces a browser-observable result, add an optional `## Screenshot capture` section to the unit page so the execute agent can capture it. List: the route(s) to capture (e.g. `/onboarding`), whether auth is required (and who, e.g. owner), any preconditions/steps to reach a deep state (e.g. "complete Step 1 first"), and the distinct views to shoot (one ordered PNG each). The agent reads this section, signs in per the project's `previewCapture` profile if needed, navigates to the state, and saves the screenshots. Omit the section for units with no UI.

For agent-guided plan creation:

- Use grill-with-docs-style questioning: ask one focused question at a time.
- Check repository/wiki evidence before asking questions the repo can answer.
- Surface terminology conflicts and contradictions.
- Continue until there are no blocking unknowns.
- Write summarized evidence, decisions, assumptions, unknowns, plan structure, and verification targets into MDX.
- Keep full chat transcript in ignored runtime state unless the user explicitly asks to preserve it.

## Terminal Import Planning

Use `terminal_import_planning` for newly imported projects that already have source material under `wiki/sources/`.

- Read `wiki/index.mdx`, `wiki/sources.mdx`, `wiki/sources/import.mdx`, and relevant source briefs before asking questions.
- Ask exactly one focused question at a time in normal terminal prose, then stop and wait for the user's answer.
- Do not emit `hyperwiki-question` JSON, `hyperwiki-question-batch` JSON, or app-rendered question objects.
- Record summarized decisions and answers in `wiki/sources/import-qna.mdx`; update `wiki/sources/import-state.mdx` when it clarifies readiness, blockers, or next action.
- When no blocking unknowns remain, create `wiki/plans/mvp/index.mdx` plus separate stage and executable unit files under `wiki/plans/mvp/`.
- Keep `wiki/plans/index.mdx` structural only and update `wiki/log.mdx` only for durable import-planning decisions or plan creation history.

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
- `references/plan-page-skeletons.md`
- `references/example-minimal-bootstrap.md`
- `references/example-moderate-import.md`
- `references/planning-contract.md`
- `references/upgrade-contract.md`
- `references/validation-checklist.md`
