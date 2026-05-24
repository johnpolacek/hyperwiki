# Example Moderate Import

Use this example for the messy middle case: an existing repo with enough product and technical evidence to justify source briefs and a focused feature plan, but not enough certainty to normalize every artifact.

## Scenario

`Invoice Review` is an existing internal web app repository.

Repository evidence:

- `package.json` with `next`, `react`, `typescript`, and `vitest`.
- `src/app/` and `src/components/` exist.
- `README.md` describes local development commands.
- `AGENTS.md` exists with generated-looking guidance but no `PROJECT-HTML-WIKI-SKILL` managed markers.
- No `wiki/` directory exists.

Source note:

> Build an internal invoice review queue for finance operators. Users need to see pending invoices, flag missing vendor data, approve or reject invoices, and export approved invoice IDs. Keep auditability high. Authentication already exists in the surrounding platform. Do not add payment execution.

## Expected Classification

- Mode: `import_existing`.
- Target root: repository root, because the repo has one app manifest and no workspace signals.
- Existing `AGENTS.md`: preserve and report as `present_but_not_upgraded` unless the user approves normalization or a safe managed-block insertion.
- Source briefs: create `wiki/sources/prd.html` and `wiki/sources/technical-brief.html`.
- Design brief: create `wiki/sources/design-brief.html` because this is an internal frontend app with operator workflows and repeated review interactions.
- Marketing brief: skip because this is an internal tool with no public-entry signal.
- Planning: create a focused feature plan for the review queue, not `wiki/plans/mvp/`, unless the user asks for a multi-session roadmap.
- Log: append one import/context entry; do not duplicate Git history.

The following examples show page content that should be rendered inside the standalone HTML templates from `generated-baseline-artifacts.md`; they are abbreviated for scenario clarity.

## Example `wiki/Sources.html`

```text
# Sources

This page catalogs source material, repository evidence, and unresolved unknowns for `Invoice Review`.

## Source Material

- User source note: internal invoice review queue for finance operators, with approve/reject/export workflows and auditability constraints.

## Repository Evidence

- `package.json` uses Next.js, React, TypeScript, and Vitest.
- `src/app/` and `src/components/` indicate an existing frontend app.
- `README.md` contains local development commands.
- Existing `AGENTS.md` has no recognized managed markers.
- No existing `wiki/` directory was found.

## Generated Source Briefs

- `sources/prd.html` - product intent, users, workflows, constraints, and non-goals.
- `sources/technical-brief.html` - implementation surfaces, stack evidence, validation posture, and handoff risks.
- `sources/design-brief.html` - operator workflow UI principles, interaction patterns, responsive expectations, and design validation.

## Unknowns

- Exact invoice data source and schema.
- Existing authentication/session API boundary.
- Required audit log storage location.
- Export format and destination.
```

## Example `wiki/sources/prd.html`

```text
# PRD

## Status

- Last reviewed: [YYYY-MM-DD]
- Evidence basis: prompt, repo
- Confidence: medium
- Known gaps: exact invoice schema, audit persistence, export destination

## Problem

Finance operators need a reliable way to review pending invoices, identify missing vendor data, and approve or reject invoices before downstream processing.

## Users

- Finance operators reviewing invoice readiness.
- Finance leads who need confidence that approval decisions are auditable.

## Core Workflow

1. View pending invoices in a review queue.
2. Open invoice details.
3. Flag missing vendor data when required information is absent.
4. Approve or reject an invoice.
5. Export approved invoice IDs.

## Constraints

- Authentication already exists in the surrounding platform.
- Auditability is important for approval and rejection decisions.
- Payment execution is out of scope.

## Non-Goals

- No payment initiation.
- No public marketing or signup flow.
- No replacement for the upstream invoice data system.
```

## Example `wiki/sources/technical-brief.html`

```text
# Technical Brief

## Status

- Last reviewed: [YYYY-MM-DD]
- Evidence basis: prompt, repo
- Confidence: medium
- Known gaps: auth/session API boundary, audit storage, invoice data source

## Repository Evidence

- Next.js, React, TypeScript, and Vitest are present in `package.json`.
- `src/app/` and `src/components/` are the likely implementation surfaces.
- Existing authentication is assumed from source context but the API boundary is unknown.

## Implementation Surfaces

- Review queue route under `src/app/`.
- Reusable invoice table and status controls under `src/components/`.
- Tests with Vitest for filtering, status transitions, and export formatting.

## Boundaries

- Do not implement authentication unless the existing boundary is identified.
- Do not implement payment execution.
- Do not invent invoice schema details beyond observed repository evidence or user-provided source context.

## Validation Posture

- Add focused unit tests for queue state and export formatting.
- Manually verify approve/reject/flag flows in the app once data boundaries are known.

## Handoff Risks

- Invoice source, audit persistence, and export destination remain unknown.
```

## Example `wiki/sources/design-brief.html`

```text
# Design Brief

## Product Surface

`Invoice Review` is an internal operator web app for reviewing invoice readiness, making approval decisions, and exporting approved invoice IDs.

## Interface Principles

- Prioritize dense, scannable operational workflows over marketing-style presentation.
- Keep invoice status, missing vendor data, and approval state visible without unnecessary navigation.
- Make destructive or irreversible decisions explicit and auditable.

## Visual System

- Use the existing component and styling conventions found in `src/components/`.
- Prefer restrained status colors, clear table hierarchy, and compact controls.
- Do not introduce a new design system until the existing frontend conventions are inspected.

## Interaction Patterns

- Queue filtering and status changes should be efficient for repeated finance-operator use.
- Approve, reject, and missing-data actions should expose clear state changes and confirmation or undo expectations when required by audit policy.
- Empty, loading, and error states should preserve the operator's current review context.

## Responsive And Accessibility Expectations

- Desktop review workflows are primary unless target devices prove otherwise.
- Preserve keyboard access, visible focus states, readable contrast, and non-color-only status indicators.

## Validation

- Manually review the queue, detail affordance, and decision controls in browser.
- Check table density, status visibility, error states, and narrow viewport behavior.

## Unknowns

- Existing design system and component conventions.
- Whether finance operators need mobile or tablet support.
- Required confirmation, undo, or audit-note behavior for decisions.
```

## Example `wiki/plans/features/review-queue.html`

```text
# Review Queue Feature Plan

Status: planned

## Outcome

Finance operators can review pending invoices, flag missing vendor data, approve or reject invoices, and export approved invoice IDs.

## Scope

- Queue view for pending invoices.
- Invoice detail affordance sufficient for review decisions.
- Missing-vendor-data flag.
- Approve and reject actions.
- Export of approved invoice IDs.

## Non-Goals

- Payment execution.
- Authentication implementation.
- Upstream invoice ingestion.

## Dependencies

- Confirm invoice data source and schema.
- Confirm existing authentication/session boundary.
- Confirm audit log storage expectations.

## Design Considerations

- Follow `../../sources/design-brief.html` for operator workflow density, status visibility, decision controls, and browser validation.

## Validation

- Unit tests for queue state, decision transitions, and export formatting.
- Manual review of approve/reject/flag flow after data boundary is confirmed.

## Next Execution Unit

Confirm invoice schema, auth/session access pattern, and audit persistence before code changes.
```

## Example `wiki/log.html` Entry

```text
## [YYYY-MM-DD] import | initialize project wiki

- Imported existing `Invoice Review` repo into the Project HTML Wiki Skill structure.
- Created source index, PRD, technical brief, design brief, roadmap, and focused review queue feature plan.
- Preserved existing source files and Git history.
- Existing `AGENTS.md` has no recognized managed markers and was reported as `present_but_not_upgraded`.
- No marketing brief was created because there is no public-entry signal.
- Follow-up: confirm invoice schema, auth/session boundary, audit persistence, and export destination.
```

## Example Handoff Summary

```text
Imported `Invoice Review` into the Project HTML Wiki Skill workflow.

Created: `wiki/AGENTS.md`, `wiki/index.html`, `wiki/log.html`, `wiki/Sources.html`, `wiki/sources/prd.html`, `wiki/sources/technical-brief.html`, `wiki/sources/design-brief.html`, `wiki/plans/index.html`, `wiki/plans/features/review-queue.html`, `wiki/roadmap.html`.
Preserved: source files, `README.md`, Git history.
`present_but_not_upgraded`: `AGENTS.md` because it has generated-looking guidance but no managed markers.
Skipped: `wiki/sources/marketing-brief.html` because there is no public-entry signal.
Git: preserved existing repository.
Warnings: invoice schema, auth/session boundary, audit persistence, and export destination are unknown.
Next action: confirm data and audit boundaries before implementing the review queue.
```
