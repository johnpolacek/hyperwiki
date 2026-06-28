# Lifecycle Contract

The canonical 6-phase product lifecycle is the default path a hyperwiki project advances through, from purpose to shipped MVP. It lives at `wiki/plans/lifecycle/`: a root page (`index.mdx`) and six phase pages (`phase-01-purpose.mdx` … `phase-06-mvp-views.mdx`). The hyperwiki runtime seeds these for every new and imported project. This file is the master playbook for the `lifecycle_orchestrate` mode and the per-phase sub-agent contracts.

The lifecycle is a thin orchestration spine. The heavy work of each phase lives in that phase's own sub-plan (a normal `plan > stages > units` plan), linked by `childPlan` frontmatter. The lifecycle layer only tracks **which phase is active and whether its gate is cleared**.

## Phase page frontmatter

Every `wiki/plans/lifecycle/phase-NN-*.mdx` carries:

```yaml
phaseId: "design-system"      # stable id (see the table below)
phaseOrder: 2                 # 1..6, canonical order
childPlan: "/wiki/plans/design-system/index.mdx"   # omit when the phase has no sub-plan
gate: "childPlan"             # one of: childPlan | manual | import-validated
status: "planned"             # active | planned | complete (drives the gate)
```

The descriptor (`phaseId`, `phaseOrder`, `gate`, `childPlan`, the loaded skills) is canonical in code: `src/lib/lifecycle.ts` (frontend) and `src-tauri/src/domain/lifecycle.rs` (project contract). Keep the page frontmatter in lockstep with that descriptor — they must not diverge.

## Gate algorithm

The **active phase** is the first phase, in `phaseOrder`, whose gate is not cleared:

- `gate: childPlan` — cleared when the phase page is `complete` **and** its `childPlan` page is `complete`.
- `gate: manual` — cleared when the phase page is marked `complete` (used for the Phase 4 architecture decision, which has no sub-plan).
- `gate: import-validated` — cleared when `wiki/sources/prd.mdx` has user stories, **or** the imported-project plan artifacts validate (`validate_import_plan_artifacts`).

Only the active phase may hand off to its sub-agent. Earlier (cleared) phases may be explicitly reopened; later phases are locked until the prior gate clears.

## The six phases

| Phase | phaseId | archetype | skills | childPlan | gate | produces |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Purpose & User Stories | `purpose` | planning | grill-with-docs (import-planning interview when importing) | — | import-validated | `wiki/sources/prd.mdx` with user stories |
| 2 Design System | `design-system` | execute | tailwind-design-system, shadcn | `/wiki/plans/design-system/` | childPlan | tokens + customized shadcn layer |
| 3 UI Mocks | `ui-mocks` | execute | frontend-design, make-interfaces-feel-better | `/wiki/plans/ui-mocks/` | childPlan | mock screens, refined components, blocks |
| 4 Backend Architecture | `backend-arch` | planning | grill-with-docs | — | manual | `wiki/architecture.mdx` Decision records |
| 5 Onboarding | `onboarding` | execute | frontend-design | `/wiki/plans/onboarding/` | childPlan | onboarding views |
| 6 MVP Views | `mvp-views` | execute | frontend-design, parallel-dev-worktrees | `/wiki/plans/mvp/` | childPlan | the MVP build sub-plan + views |

**Phase 1 owns purpose; Phase 6 owns the MVP build sub-plan.** Phase 1's `childPlan` is intentionally absent: it produces the PRD and user stories. The `wiki/plans/mvp/` build plan is authored later, under Phase 6 — keeping "establish purpose" distinct from "build the views".

## Orchestrator contract (`lifecycle_orchestrate`)

The master orchestrator **reports and recommends; it does not execute.** Given the lifecycle state it:

1. Confirms the active phase and restates its completion gate verbatim from the phase page.
2. Names exactly what is blocking the gate (incomplete sub-plan, missing user stories, unrecorded architecture decision).
3. Recommends the single next handoff: which phase sub-agent to run and which repo-local skills it loads.

It never edits files, never runs build/test commands, and never advances a phase itself — the human triggers each handoff from the lifecycle dashboard.

## Phase sub-agent contract

Each phase sub-agent reads its phase page, loads the named skills, and:

- **execute archetype** (phases 2, 3, 5, 6): work in the phase's `childPlan` sub-plan. If it does not exist, create it as a hyperwiki plan (`plan > stages > units`), then execute its units, verifying each and capturing screenshots per the unit's `## Screenshot capture` section.
- **planning archetype** (phases 1, 4): settle decisions and record them in the named artifact (`wiki/sources/prd.mdx` for purpose, `wiki/architecture.mdx` for backend architecture). Do not write product code in these phases.

A phase is complete only when its `CompletionGate` is satisfied; mark the phase page `complete` then, and the next phase activates automatically.
