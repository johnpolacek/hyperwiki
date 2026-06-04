# Planning Contract

Use this reference when creating, updating, auditing, or executing against project plans. The goal is to create just enough planning structure to make implementation safe without turning the wiki into a speculative backlog.

## Planning Modes

- `plan_feature`: create a decision-complete plan before meaningful feature, architecture, config, schema, dependency, test, build, or app behavior work.
- `update_plan`: revise the closest existing plan after decisions, scope changes, implementation discoveries, validation results, or roadmap changes.
- `sync_changes`: reconcile recent codebase changes, especially unplanned or partially planned changes, back into the wiki, plans, roadmap, source docs, and project-context log.
- `record_execution`: append durable project-context history to `wiki/log.mdx` after implementation, validation, or maintenance work changes plans, roadmap, source context, or important decisions.
- `audit_or_upgrade`: check whether the planning structure exists, points to one next planning target or execution unit, and preserves existing user-authored plans.

For bootstrap or import work, create `wiki/plans/index.mdx` as the baseline planning contract. Create deeper plan structure only when the project evidence justifies it. For imported or existing live projects, do not create `wiki/plans/mvp/` by default; treat the project as post-MVP unless source evidence or the user explicitly says it is pre-launch, greenfield, or building an MVP.

## Planning Gate

For projects using this wiki structure, meaningful code, config, dependency, schema, test, build, architecture, or app behavior changes should have a relevant plan first.

Fast-path exception: for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction, do not create a plan. Make the change, validate it, and avoid wiki/log updates unless the fix reveals durable project knowledge.

## Clarification Gate

Before creating a feature plan, inspect repository evidence, current wiki state, source briefs, roadmap, and existing plans. Then aim for maximum useful clarification before writing the plan. Ask questions whenever answers would improve one of:

- scope, non-goals, or acceptance criteria
- architecture, schema, APIs, auth, permissions, integrations, or dependencies
- UX, design direction, user workflow, or rollout behavior
- validation strategy, risk posture, rollout, sequencing, or the next execution unit

Prefer a focused batch of 3-7 high-leverage questions, grouped by theme when useful. Ask fewer only when the request is narrow or the repo/wiki/source evidence already answers the important planning questions. Do not proceed directly to a plan unless the user asked to skip questions, the work is a small fast-path fix, or the available evidence is already strong enough for a decision-complete plan. If an unknown is minor, reversible, or can be safely isolated, proceed and write the assumption explicitly in the plan's assumptions or unknowns section.

For frontend, UI, website, dashboard, visual workflow, or interaction-heavy work, inspect `wiki/sources/design-brief.mdx` when present before planning or implementation. If no design brief exists but current source context or repository evidence contains durable interface principles, visual system decisions, interaction patterns, responsive constraints, or accessibility expectations, create or update the design brief before substantial UI work.

Corrective work should update the closest relevant existing plan instead of creating a new sidecar plan by default. Create a new plan only when the work introduces a new durable feature track.

Do not create durable implementation plans in root-level `docs/`, root-level `tasks/`, issue-only notes, or unindexed scratch files. Keep them under `wiki/plans/` and update `wiki/index.mdx` if the new page is a durable wiki entry.

## Planning Examples

Usually no plan:

- Fix a typo, copy issue, formatting issue, or broken link.
- Change a Tailwind class or small visual detail without changing durable UI direction.
- Fix a local TypeScript, lint, or build error without changing behavior.
- Add or adjust a narrow test for existing behavior.
- Rename or refactor a private helper without changing public behavior.
- Update a dependency patch version when there is no API, build, runtime, or security posture change.

Usually plan required:

- Add or change routes, workflows, screens, APIs, schemas, auth, permissions, integrations, deployment config, or public behavior.
- Add a new environment variable or configuration surface.
- Change database schema, data model, migrations, or persistence behavior.
- Change authentication, authorization, privacy, auditability, or security posture.
- Introduce a new feature track or durable UI direction.
- Make a change future agents need to understand before continuing.

## Choose The Planning Shape

Before writing plan files, propose the smallest planning shape that matches the scope:

- no durable plan: small fast-path fixes with no durable project impact
- compact feature plan with one execution unit: one coherent implementation pass with durable intent
- compact feature plan with a short unit outline: one feature that needs a few ordered implementation passes but no phase gate
- single MVP stage with multiple units: one outcome phase that clearly needs multiple executable units
- multiple MVP stages with multiple units per stage: a larger roadmap where each stage has a real phase gate and several related units

When unsure, start smaller. A plan can be promoted later from feature plan to single-stage MVP, or from single-stage MVP to multi-stage MVP, after scope becomes clearer. Avoid creating placeholder stages for future themes; record those as deferred work or follow-up decisions instead.

For larger plans, the agent may first propose the outline of stages and units, then ask the user to confirm or adjust the planning shape before creating the detailed files.

When the accepted plan has explicit stages, a `Current stage`, a multi-stage implementation sequence, or more than one phase gate, the final artifacts must be navigable stage/unit MDX files. Do not write a single `wiki/plans/features/*.mdx` page with stage headings for that shape. Use `wiki/plans/<slug>/index.mdx`, child `stage-XX-*.mdx` pages, and unit pages under each stage directory. Create all currently planned stage and unit pages before handoff so the sidebar and Execute workflow have a precise current unit.

## CLI Plan Workflow

Plan files must be useful from a terminal. Optimize the first 80 lines of every active plan for quick inspection with `sed`, `head`, or `less`.

`wiki/plans/index.mdx` is a structural route target, not a visible top-level Plans page. Keep it minimal and do not add visible plan summaries, active-plan cards, current-unit detail, next action, blockers, or validation there. The app renders an empty "No active plans" state on this route when no incomplete plan exists; put current-unit detail, next action, blockers, and validation in the active plan page itself.

Completed plans should not remain in active current-plan or current-unit slots. When a whole plan is complete, move it under `wiki/plans/zzz_completed/`.

Every active plan should start with a compact summary section:

```mdx
## Summary

| Field | Value |
| --- | --- |
| Status | draft|active|blocked|complete|deferred |
| Shape | compact feature plan|single-stage MVP|multi-stage MVP |
| Current unit | [unit name or none] |
| Next action | [one concrete action or decision] |
| Blockers | [none or short list] |
| Validation | [key checks] |
```

When the user asks to inspect, continue, or execute a plan from the CLI, use this workflow:

1. Read `wiki/plans/index.mdx` first.
2. Identify the relevant active plan from the index, then read that plan for current-unit detail.
3. Read only the relevant plan or unit files needed for the next action.
4. Summarize current state in the response instead of dumping long MDX.
5. Provide exact paths and useful read commands, such as `sed -n '1,80p' wiki/plans/index.mdx`.
6. If no single current unit is clear after reading the active plan, ask the user to choose or update the active plan before implementation.

Resume and continue prompts are orientation prompts by default. If the user says "resume", "continue", "pick up", "look at", or "work on" a branch, worktree, feature, or plan, stop after orientation and ask what they want next unless they explicitly requested implementation or planning.

If no active plan exists for the branch, worktree, or feature:

- say that no active plan was found
- summarize the relevant branch/worktree state and any related wiki evidence
- ask clarifying questions before creating a plan
- do not infer design direction or implementation scope from the branch name alone
- do not edit code until the user approves the next action

Expected orientation response shape:

```text
Current branch/worktree: feature/header-design-enhancement
Git state: clean feature worktree; integration checkout has unrelated wiki changes
Active plan: none found for header design
Related context: [short list of files or wiki pages inspected]
Next choice:
1. create a plan after clarification
2. revise an existing plan
3. begin implementation from an approved plan
Questions before planning:
- [high-leverage question]
```

Good prompt patterns:

```text
Use $hyperwiki to show me the current plan state for this project.
Use $hyperwiki to continue the current plan.
Use $hyperwiki to update the current plan from recent changes.
Use $hyperwiki to plan this feature for CLI-friendly execution.
```

Planning handoffs should include:

```text
Current plan: wiki/plans/features/blog-authoring.mdx
Current unit: Unit 01 - Local Admin Authoring Foundation
Next action: implement guarded /admin editor shell
Read:
  sed -n '1,80p' wiki/plans/index.mdx
  sed -n '1,120p' wiki/plans/features/blog-authoring.mdx
Update after work:
  Use $hyperwiki to update the current plan from recent changes.
```

Avoid large MDX dumps unless the user explicitly asks to see the full file. Prefer a concise terminal summary plus file paths and commands.

## Feature Plans

Use a compact feature plan when the work is narrower than a full MVP stage but still needs durable intent.

Recommended shape:

```text
wiki/plans/
  index.mdx
  features/
    feature-slug.mdx
  zzz_completed/
    features/
      completed-feature.mdx
```

A feature plan should include:

- concise title and status
- intended outcome or behavior
- scope and non-goals
- dependencies and prior decisions
- implementation notes that constrain future work
- design considerations for UI work, preferably by linking to `../../sources/design-brief.mdx` or another relative path instead of duplicating the brief
- validation guidance covering acceptance, automated checks when possible, and manual review when needed
- next execution unit or next planning decision

Keep feature plans lean. If a plan becomes a sequence of multiple independent implementation sessions, either split it into smaller feature plans or promote it into an `mvp/` stage/unit structure.

When a feature plan reaches `Status: complete`, move the whole feature plan from `wiki/plans/features/` to `wiki/plans/zzz_completed/features/` only after all execution units or completion gates are complete and verification is recorded or explicitly deferred with a reason.

## Syncing Recent Codebase Changes

Use `sync_changes` when implementation happened before planning, when recent work may have made the wiki stale, or when the user asks to reconcile the wiki with current code.

Inspect repository evidence before writing:

- `git status --short`
- relevant `git diff` output for uncommitted changes
- recent commits when the sync target is committed work
- changed manifests, schemas, migrations, configs, public APIs, routes, tests, and user-facing files
- existing `wiki/index.mdx`, `wiki/roadmap.mdx`, `wiki/sources.mdx`, source briefs, plans, and `wiki/log.mdx`

Classify the change before updating wiki files:

- planned work: maps cleanly to an existing plan or unit
- unplanned minor work: does not need a durable plan, but should be logged if material
- unplanned durable work: introduced a feature, architecture, schema, API, product behavior, or future dependency that needs a plan or source update
- corrective work: fixes, narrows, redirects, or invalidates an existing plan
- unclear work: intent cannot be inferred from repository evidence and user context

Write the smallest durable sync:

- Prefer appending `wiki/log.mdx` for material completed work, validation, decisions, and follow-ups that affect durable project context.
- Update an existing plan when the change completed, invalidated, narrowed, expanded, or redirected that plan.
- Move a fully complete plan into `wiki/plans/zzz_completed/` when its top-level status, stages, units, completion gates, and verification records all support completion.
- Create a retrospective `wiki/plans/features/` plan only when the change introduced a durable feature track or future implementation dependency.
- Update `wiki/plans/mvp/index.mdx` or stage/unit status only when the current next unit or planning target changed.
- Update `wiki/roadmap.mdx` when the current goal, next decision, next steps, or deferred work changed.
- Update `wiki/sources.mdx` or source briefs when code changes reveal durable product, technical, integration, runtime, data, UI design, or public-entry facts.
- If implementation or new user direction contradicts an existing source brief, update its `Status` section, lower confidence, or record the contradiction instead of treating the brief as authoritative.
- Update `wiki/index.mdx` only when adding or materially changing durable wiki pages.

Do not invent retrospective intent. If the repository shows what changed but not why, record the observed change and the unknown decision instead of turning it into a confident plan narrative.

## When To Create `wiki/plans/mvp/`

Create `wiki/plans/mvp/` when the project has a clear greenfield, pre-launch, or explicitly MVP product or capability sequence that will need multiple implementation sessions.

Good signals:

- the project has more than one meaningful feature or subsystem to build
- work needs ordering across foundations, user-facing flows, polish, and hardening
- future agents need a canonical next execution unit instead of choosing from loose notes
- implementation should be gated by written decisions before code changes

For `import_existing`, first classify the lifecycle:

- greenfield or pre-launch MVP
- existing live product
- internal tool in active use
- library or package
- archive or maintenance mode
- unknown

Do not create `wiki/plans/mvp/` during import for existing live products, internal tools in active use, libraries, archives, maintenance-mode projects, or unknown lifecycle. Use `wiki/roadmap.mdx` for broad direction and create focused plans only when a concrete workstream exists:

- `wiki/plans/features/` for active or planned feature tracks
- `wiki/plans/maintenance/` for refactors, upgrades, cleanup, infra, migrations, reliability, or tech debt
- `wiki/plans/releases/` only when the project already plans around releases

Do not create `wiki/plans/mvp/` for a very small `bootstrap_new` handoff, one-file script, research note, existing live project, or project that only needs a compact `wiki/roadmap.mdx` plus `wiki/plans/index.mdx`.

## Stages And Units

Use stages for outcome-sized phases and units for executable slices.

Stages should group related units under a meaningful phase gate. Prefer one or two stages with several units each over many stages that each contain only one unit. Do not create a separate stage for every theme, backlog item, dependency, or optional future capability.

Create a new stage only when there is a real boundary such as:

- a completed foundation enables a later set of user-facing units
- a release, migration, provider decision, or external dependency gates later work
- the validation or completion criteria are meaningfully different from the previous phase
- the next group of units should not begin until the prior group is accepted

If a roadmap item is important but not ready to plan into multiple executable units, keep it as deferred work in `wiki/roadmap.mdx`, `wiki/plans/mvp/index.mdx`, or the current stage's follow-up section instead of creating a placeholder stage.

Recommended shape:

```text
wiki/plans/
  index.mdx
  mvp/
    index.mdx
    stage-01-foundation.mdx
    units/
      stage-01/
        01-define-stack.mdx
        02-create-minimal-app-shell.mdx
  zzz_completed/
    mvp/
      index.mdx
      stage-01-foundation.mdx
      units/
        stage-01/
          01-define-stack.mdx
```

`wiki/plans/mvp/index.mdx` should act as the live roadmap index. It should name the current status, most recent completed unit when known, and exactly one next execution unit or planning target.

Stage files should describe the stage goal, completion gate, and unit sequence. Unit files should be small enough for one implementation pass.
For complex plans, stage and unit pages should be detailed enough to enforce verification between steps. A stage page must include dependencies or blockers, a detailed unit sequence, completion gate, and verification expectations before later stages begin. A unit page must include Intent or Goal, Scope, Implementation Notes, Dependencies or Blockers, Verification, and Completion Gate. Verification must name concrete automated, manual, or explicitly deferred checks; the next unit should not start until the current unit records verification or a documented deferral with risk.

When all MVP stages and units are complete, move the whole `wiki/plans/mvp/` tree to `wiki/plans/zzz_completed/mvp/`. Do not move an MVP tree while any stage, unit, completion gate, or required verification remains incomplete, blocked, or unresolved.

Good stage shape:

```text
Stage 01: Authoring And Publishing Foundation
- Unit 01: Local Admin Authoring Foundation
- Unit 02: Draft/Public Preview Flow
- Unit 03: Validation And Save Hardening
- Deferred: export portability, media uploads, asset migration

Stage 02: Distribution And Asset Portability
- Unit 01: Export Copy Flows
- Unit 02: Media Upload Provider Integration
- Unit 03: Existing Asset Migration
```

Avoid this shape unless each stage has a real gate:

```text
Stage 01: Authoring Foundation
- Unit 01: Local Admin Authoring Foundation

Stage 02: Export And Portability
- Units pending

Stage 03: Media Uploads
- Units pending
```

## Decision-Complete Units

A unit is decision-complete when an implementer can execute it without inventing product, architecture, or validation decisions.

A good unit includes:

- a concise title and scope
- the intended outcome or behavior
- the key boundaries or non-goals
- any dependencies or prior decisions that matter
- design considerations when the unit touches UI, preferably linking to the design brief instead of restating it
- a `Verification` section with automated, manual, or explicitly deferred verification
- a `Completion Gate` section describing when the unit can be marked complete

Keep unit plans lean. If a unit needs many bullets, hidden assumptions, or several unrelated outcomes, split it into follow-up units before implementation starts.

## Unit Verification

Every execution unit must include a `Verification` section.

Use one or more of:

- Automated: tests, lint, typecheck, build, migration dry run, script output, or other repeatable checks.
- Manual: browser inspection, CLI flow, admin workflow, content review, accessibility check, visual review, or user acceptance pass.
- Deferred: only when verification cannot be run yet; explain why, what will verify it later, and what risk remains.

Do not mark a unit complete unless verification is recorded or explicitly deferred with a reason.

## Execution Notes

During implementation, keep execution notes for decisions, tradeoffs, deviations, discovered constraints, validation surprises, blockers, and follow-up decisions that were not settled by the plan. These notes help the agent avoid losing context while work is in progress.

Execution notes should live in the active plan or unit when one exists. If the user explicitly asks for a separate notes file, place it under `wiki/plans/` or the relevant feature plan folder and link it from the active plan. Do not create unindexed root-level `implementation-notes.mdx` by default.

Do not use execution notes for routine edits, import fixes, formatting, every test run, or commit summaries that Git already records.

Before handoff, distill execution notes into the smallest durable updates:

- update the active plan when scope, assumptions, unit status, verification, or next execution changed
- append `wiki/log.mdx` only for durable project-context decisions, validation outcomes, or follow-up planning targets
- update `wiki/sources.mdx` or source briefs when implementation changed source truth
- update `wiki/roadmap.mdx` when next steps, blockers, or deferred work changed

Recommended shape:

```mdx
# Unit 01 - Local Admin Authoring Foundation

## Goal

[Goal]

## Scope

[Scope]

## Non-Goals

[Non-goals]

## Execution Notes

[Decisions, tradeoffs, deviations, discovered constraints, validation surprises, blockers, and follow-up decisions discovered during implementation.]

## Verification

### Automated

- `npm run build`
- `npm run lint`

### Manual

- Open `/admin`.
- Create a draft post.
- Preview the draft.
- Confirm public posts are unchanged.

### Deferred

None.

## Completion Gate

This unit is complete when the guarded admin authoring shell can create, save, validate, and preview a draft without changing public publishing behavior.
```

## Completed Plan Archive

Use `wiki/plans/zzz_completed/` as the completed-plan archive. The `zzz_` prefix is intentional so active plan folders sort first in terminal listings.

Archive by moving the whole completed plan tree, not by copying it:

- `wiki/plans/features/feature-slug.mdx` moves to `wiki/plans/zzz_completed/features/feature-slug.mdx`.
- `wiki/plans/mvp/` moves to `wiki/plans/zzz_completed/mvp/`.
- Other future plan families, such as `maintenance/` or `releases/`, should preserve their family name under `zzz_completed/`.

Before moving a plan, confirm:

- the top-level plan status is `complete`
- every stage status is complete, when stages exist
- every unit status is complete, when units exist
- every unit has `Verification` recorded with automated, manual, or explicitly deferred verification
- no current blocker or next action remains inside the plan except follow-up work that has been moved to a new active plan, roadmap deferred work, or `wiki/log.mdx`

After moving a plan, update active plan indexes:

- remove the archived plan from active current-plan, current-stage, and current-unit fields
- move completed plan content out of active plan locations and rely on the app's Completed Plans navigation
- choose the next active plan or state that no active plan exists
- append `wiki/log.mdx` only when completion changes durable project context, validation status, source truth, roadmap direction, or future planning

## `wiki/log.mdx` As Project Context History

Keep plans focused on intent. Keep routine implementation history in Git. Use `wiki/log.mdx` only for durable project-context history.

Append a log entry after completing a unit or meaningful maintenance pass only when the work affects durable project context:

- what changed
- which plan or unit it completed or affected
- important decisions discovered during implementation
- verification results
- any follow-up planning target when the next step changed

Before appending to `wiki/log.mdx`, ask: would this entry help a future agent make a better project decision? If not, do not log it.

Do not log routine commits, every code edit, every test run, formatting, minor refactors, or details already obvious from Git. Prefer one log entry per meaningful project-context change, not one per commit.

Do not log routine notes such as "ran npm test", "fixed lint error", "updated import", "changed CSS class", or "committed changes" unless the result changes project direction, validation status, public behavior, or future planning.

Do not backfill long narrative history into unit plans unless the plan's scope or contract materially changed. If `wiki/log.mdx` becomes hard to scan, summarize older entries into `wiki/log-archive.mdx` or a dated archive such as `wiki/log/2026.mdx`, and leave a pointer from the current log.
