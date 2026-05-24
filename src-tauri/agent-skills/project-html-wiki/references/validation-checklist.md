# Validation Checklist

Use this checklist to validate project wiki bootstrap, planning, maintenance, and upgrade behavior against realistic targets before adding automation or changing templates. Validation can be manual; record durable findings in `wiki/log.html` only when they affect durable project context.

## Result Levels

- `pass`: behavior is present and no action is needed.
- `warn`: behavior is partially present, safely skipped, blocked by insufficient evidence, or `present_but_not_upgraded`; report the reason and next action.
- `fail`: behavior violates a safety rule, risks writing in the wrong root, overwrites or may overwrite user content, invents unsupported certainty, or leaves required artifacts missing when they could be safely created.
- `not_applicable`: item does not apply to this target or mode.

A validation run fails if any `fail` item is present. It may pass with warnings only when required artifacts and safety rules are satisfied, and each warning has a clear reason or follow-up.

## Global Fail Conditions

- Target root is wrong or ambiguous and the workflow writes root agent guidance, `wiki/`, repo-local skills, roadmap, or planning files anyway.
- User-authored files, existing wiki pages, existing repo-local skills, or existing Git history are overwritten or rewritten without explicit instruction.
- Required bootstrap artifacts are missing without a reported skip reason or blocker.
- Unsupported source briefs, roadmap certainty, feature plans, or retrospective intent are invented from thin or contradictory evidence.
- App scaffold files are generated, dependencies are installed, or stack choices are finalized during ordinary bootstrap/import.
- `wiki/log.html` duplicates routine Git history instead of durable project-context changes.
- Generated HTML artifacts are plain default-looking documents, unstyled Markdown exports, or interchangeable white-card pages with no artifact-specific visual concept.
- Final handoff omits created, updated, preserved, skipped, failed, blocked, `present_but_not_upgraded`, warning, or follow-up information.

## Validation Result Format

Use this compact format for a validation summary:

```markdown
## [YYYY-MM-DD] validation | [target or mode]

- Mode: `[intake_discovery|bootstrap_new|import_existing|plan_feature|update_plan|sync_changes|record_execution|audit_or_upgrade]`
- Target root: `[path]`
- Result: `[pass|warn|fail]`
- Checked: [short list]
- Created/updated: [short list or none]
- Preserved: [short list or none]
- Warnings: [short list or none]
- Failures: [short list or none]
- Follow-ups: [short list or none]
```

When a validation result is only useful for the current task and does not affect durable project context, report it in the handoff instead of appending `wiki/log.html`.

## General Checks

- Worktree inspection happens before writes.
- Existing user-authored files are preserved.
- Existing Git history is preserved for imported repos.
- New projects get Git initialized unless the user opted out.
- Repo automation policy is created or preserved in `wiki/AGENTS.md`.
- Commits, pushes, dependency installs, and long commands follow the recorded automation policy.
- Auto-commits stage only intended files and leave unrelated dirty files untouched.
- Final handoff lists created, updated, preserved, skipped, failed, blocked, and `present_but_not_upgraded` artifacts.
- Final handoff names unresolved unknowns and contradictions.

## Zero Source Context

- Chooses `intake_discovery` when the user has no project idea, no repo, no PRD, no notes, or only a vague "I want to build something" prompt.
- Does not create `AGENTS.md`, `CLAUDE.md`, `wiki/`, source briefs, roadmap files, plans, repo-local skills, dependency manifests, or scaffold files during intake.
- Asks focused questions about project type, audience, problem, desired outcome, constraints, interface shape, and first useful milestone.
- Does not invent product direction, stack, source briefs, roadmap certainty, or implementation plans from no context.
- Stops with an intake summary when minimum viable context is missing.
- Clearly says whether the workflow stopped at `intake_discovery` or proceeded from `intake_discovery` to `bootstrap_new`.
- Proceeds to `bootstrap_new` only after the user confirms enough direction or explicitly asks to proceed with named unknowns.

## HTML Design Quality Checks

- Uses `$frontend-design` when available before creating or materially restyling substantial HTML pages.
- Names a visual concept for each substantial artifact, either in handoff or in page metadata/comments.
- First viewport communicates reader goal, current state, priority, or working interface; it is not only title plus prose.
- Uses artifact-specific structures such as status rail, evidence matrix, timeline, SVG flow, roadmap rail, annotated snippet, decision panel, or working controls where content supports them.
- Avoids the same generic card grid across all pages.
- Uses deliberate CSS variables for color roles, status colors, spacing, typography, radius, border, shadow, and focus treatment.
- Avoids default system-font/plain-white-card output unless explicitly justified by a severe minimal concept and still refined.
- Renders cleanly at desktop and narrow mobile widths with no incoherent overlap, clipped text, or accidental horizontal page overflow.
- Keeps tables, code, diagrams, and long labels responsive through wrapping, stacked mobile layouts, or intentionally scrollable surfaces with clear affordance.
- Includes relative links and checks that key internal links resolve.

## Greenfield Docs-Only Project

- Creates required baseline artifacts from `generated-baseline-artifacts.md`.
- Creates `wiki/Sources.html` as the source index.
- Does not create `wiki/sources/prd.html`, `wiki/sources/technical-brief.html`, `wiki/sources/marketing-brief.html`, or `wiki/sources/design-brief.html` when the prompt is thin.
- Creates `.agents/skills/project-wiki-maintainer/SKILL.md` only when repo-local skills are already in use or explicitly requested; otherwise skips it with a reason.
- Does not install dependencies or generate app scaffold files during bootstrap.

## Existing Repo Without Wiki

- Preserves existing source files, manifests, README, and Git history.
- Creates missing wiki files and root agent guidance.
- Uses managed block markers when updating existing root agent guidance such as `AGENTS.md` or `CLAUDE.md`.
- Records repository evidence in `wiki/Sources.html`.
- Reports any existing project conventions that conflict with the generated wiki contract.

## Existing Repo With Existing `AGENTS.md`

- Adds one `PROJECT-HTML-WIKI-SKILL` managed block when markers are absent.
- Replaces only content inside existing markers when markers are present.
- Does not rewrite unrelated agent instructions.
- Keeps heading structure readable after insertion.
- If `AGENTS.md` contains generated-looking project wiki guidance without managed markers, preserves it and reports the file as `present_but_not_upgraded` unless the user explicitly approves normalization.

## Existing Repo With Existing `CLAUDE.md`

- Preserves user-authored Claude Code instructions.
- Adds or replaces only a compact `PROJECT-HTML-WIKI-SKILL` managed block when safe.
- Does not create `CLAUDE.md` for repos that do not already use it unless the user explicitly requests Claude-specific local guidance.
- Keeps any `CLAUDE.md` Project HTML Wiki Skill managed block consistent with `AGENTS.md`, `wiki/AGENTS.md`, and `wiki/index.html`.

## Existing Repo With Existing `wiki/`

- Preserves existing wiki pages.
- Creates only missing required baseline files.
- Updates `wiki/index.html` only when it can preserve existing catalog content.
- Appends to `wiki/log.html` instead of rewriting history.
- Reports `present_but_not_upgraded` artifacts when preservation prevents full alignment.

## Existing Repo With Incompatible `wiki/`

- Detects when an existing `wiki/` uses a different structure from the expected bootstrap shape.
- Preserves the existing wiki instead of normalizing it.
- Creates only clearly missing required files when doing so does not conflict with the existing structure.
- Reports incompatible or markerless artifacts as `present_but_not_upgraded`.
- Names the next decision needed before any structural wiki migration.

## Monorepo Or Workspace Target

- Detects workspace signals such as multiple package manifests at different depths, root workspace config, `packages/`, `apps/`, `services/`, `libs/`, `crates/`, or nested Git-independent project roots.
- Determines whether the bootstrap target is the repository root or a specific package/app root before writing.
- Treats multiple plausible package/app roots as ambiguous unless the user request or repository evidence clearly identifies one target.
- Stops and asks when the correct target root is ambiguous.
- Does not create root-level agent guidance or `wiki/` in a monorepo until the target root is clear.

## Thin Source Context

- Creates a thin but explicit `wiki/Sources.html`.
- Names missing product, technical, audience, and implementation details as unknowns.
- Avoids unsupported source briefs.
- Avoids app scaffold generation during bootstrap.
- Creates required bootstrap baseline files when target root is clear and the supplied rough idea or explicit unknowns provide enough context for a minimal handoff.

## Product Or Technical Source Context

- Creates `wiki/sources/prd.html` only when product intent, audience, user journey, feature scope, constraints, or non-goals need durable preservation.
- Creates `wiki/sources/technical-brief.html` only when implementation choices, architecture, stack defaults, integrations, runtime boundaries, testing posture, or handoff risks need durable preservation.
- Includes source brief status metadata: last reviewed date, evidence basis, confidence, and known gaps when useful.
- Ensures the technical brief does not override the PRD.
- Stops short of scaffold handoff recommendations when source docs and repository evidence contradict each other.

## Public-Entry Or Marketing Context

- Creates `wiki/sources/marketing-brief.html` only when the project has public-entry, launch, signup, download, acquisition, or external-audience needs.
- Keeps the marketing brief compact.
- Avoids marketing brief creation for purely internal tools unless an external-audience need is present.

## UI Or Design Context

- Creates `wiki/sources/design-brief.html` only when the project has a meaningful UI, frontend, website, dashboard, visual workflow, design system, or interaction-heavy product surface.
- Keeps the design brief focused on durable interface principles, visual system direction, interaction patterns, responsive and accessibility expectations, validation, and unknowns.
- Avoids design brief creation for CLI tools, backend services, libraries, infra projects, and thin prompts without a meaningful interface signal.
- Ensures frontend, UI, website, dashboard, visual workflow, or interaction-heavy feature plans consult the design brief when present.
- Updates the design brief during codebase sync only when recent changes reveal durable UI design direction or design constraints.

## HTML Design Quality

- Uses `$frontend-design` when available before generating or materially restyling HTML wiki artifacts.
- Classifies each substantial HTML artifact as planning/exploration, code review/explainer, report/research, design/prototype, custom editor, or a deliberate hybrid.
- Defines a 2-minute reader goal and reflects it in the first viewport or primary working interface.
- Converts long prose into tables, diagrams, cards, timelines, callouts, annotated code blocks, or decision panels.
- Includes copy/export controls for interactive, decision-oriented, or future-agent handoff pages.
- Chooses a deliberate visual direction suited to the artifact type and audience instead of generic document styling.
- Uses typography, color, spacing, hierarchy, and responsive behavior to improve scanability and comprehension.
- Uses interaction, SVG, tables, diagrams, or copy/export controls when they materially improve review or two-way use.
- Treats code snippets with file paths, line references, syntax-like styling, highlighted important lines, margin/adjacent annotations, and nearby "why this matters" notes.
- Shows evidence and confidence UI for source-heavy claims, including confirmed, inferred, unknown, contradicted, and needs-decision states when applicable.
- Defines a small page-scoped CSS style system with variables for color roles, status colors, spacing, typography, radius, borders, shadows, and focus states.
- Performs visual QA when feasible: no placeholder leakage, mobile-readable layout, no text overlap, readable contrast, useful first viewport, valid relative links where practical, unclipped diagrams, working interactions, usable copy/export fallback, and readable print/share view.
- Keeps HTML portable with embedded CSS/JS and no required build step or remote dependency.

## Planning Contract

- Creates only `wiki/plans/index.html` for small or uncertain projects.
- Creates `wiki/plans/features/` or a focused feature plan when feature work needs durable intent but not a full numbered roadmap.
- During `import_existing`, classifies lifecycle before creating deeper plan structure.
- Does not create `wiki/plans/mvp/` by default for existing live products, internal tools in active use, libraries, archives, maintenance-mode projects, or unknown lifecycle.
- Creates `wiki/plans/mvp/` only when the project is greenfield, pre-launch, or explicitly framed as MVP and needs multiple ordered implementation sessions.
- Sets exactly one next execution unit or planning target when `wiki/plans/mvp/index.html` exists.
- Includes design considerations in plans or units that touch UI, preferably by linking to `wiki/sources/design-brief.html` instead of duplicating it.
- Updates the closest existing plan for corrective work or implementation discoveries instead of creating unrelated sidecar plans.
- Moves fully complete plans into `wiki/plans/zzz_completed/` only after the top-level plan, all stages, all units, completion gates, and required verification records support completion.
- Removes archived plans from active current-plan/current-unit slots while preserving compact completed-plan links from `wiki/plans/index.html`.
- Preserves completed plan trees when archiving, such as moving `mvp/` as a whole instead of separating its stage and unit files.
- Records completed validation or implementation findings in `wiki/log.html` only when they affect durable project context.
- Keeps execution notes in the active plan or unit, or in a linked file under `wiki/plans/` when explicitly requested.
- Distills execution notes into the active plan, `wiki/log.html`, source docs, or roadmap before handoff when they affect durable project context.
- Does not create unindexed root-level `implementation-notes.html` by default.
- Does not use execution notes to duplicate routine Git history, every code edit, formatting, import fixes, or every test run.

## Codebase Sync

- Inspects Git status, relevant diffs, recent commits when applicable, and current wiki state before syncing.
- Classifies recent changes as planned, unplanned minor, unplanned durable, corrective, or unclear before writing wiki updates.
- Appends `wiki/log.html` as the primary sync artifact for material completed work, validation, decisions, and follow-ups that affect durable project context.
- Avoids duplicating routine Git history, every code edit, every test run, formatting, minor refactors, or details already obvious from Git.
- Provides an archive or summary strategy when `wiki/log.html` becomes hard to scan.
- Updates existing plans only when changes completed, invalidated, narrowed, expanded, or redirected planned work.
- Creates retrospective feature plans only when changes introduced a durable feature track or future implementation dependency.
- Updates roadmap, source index, source briefs, and wiki index only when recent code changes reveal durable project knowledge, UI design direction, or next-step changes.
- Updates source brief status, lowers confidence, or records contradictions when implementation or new user direction conflicts with existing briefs.
- Names unknown intent instead of inventing a retrospective plan narrative when repository evidence is insufficient.
