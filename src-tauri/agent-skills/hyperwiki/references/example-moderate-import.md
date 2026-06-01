# Example Moderate Import

This example shows the expected import posture for an existing frontend app with enough evidence to create source briefs and one focused feature plan.

## Source Situation

- Existing Next.js app with `package.json`, `src/app/`, and `src/components/`.
- User says the app is an internal invoice review queue for finance operators.
- `AGENTS.md` exists with generated-looking guidance but no `HYPERWIKI-SKILL` managed markers.
- No existing `wiki/` directory.

## Import Decisions

- Lifecycle: internal tool in active use.
- Planning shape: focused feature plan, not `wiki/plans/mvp/`.
- Source briefs: create `wiki/sources/prd.mdx` and `wiki/sources/technical-brief.mdx`.
- Design brief: create `wiki/sources/design-brief.mdx` because this is an internal frontend app with repeated operator workflows.
- Existing `AGENTS.md`: preserve existing content and report `present_but_not_upgraded` unless the user approves adding a managed block.

## Example `wiki/plans/index.mdx`

```mdx
---
title: "Invoice Review Plans"
description: "Plans index and implementation contract for Invoice Review."
wikiKind: "plans-index"
---

# Plans

[Back to wiki index](../index.mdx)

## Reader Goal

After 2 minutes, the reader can open the active review queue plan and name the next decision required before code changes.

## Current Planning State

| Field | Value |
| --- | --- |
| Active plan | [features/review-queue.mdx](features/review-queue.mdx) |
| Shape | Focused feature plan |
| Current unit | Confirm data and audit boundaries |
| Next action | Confirm invoice schema, auth/session access, audit persistence, and export destination. |
| Blockers | Invoice schema and export destination unknown. |

## Planning Rule

Create or update an MDX plan before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.

## Structure

- `features/` holds focused feature plans.
- `mvp/` is skipped for this imported existing app unless future source evidence says it is pre-launch MVP work.
- `zzz_completed/` holds completed plans after verification and completion gates support archiving.
```

## Example `wiki/sources/technical-brief.mdx`

```mdx
---
title: "Invoice Review Technical Brief"
description: "Implementation surfaces, constraints, and risks for Invoice Review."
wikiKind: "source-brief"
---

# Technical Brief

[Back to wiki index](../index.mdx)

## Status

| Field | Value |
| --- | --- |
| Last reviewed | 2026-05-24 |
| Evidence basis | prompt and repository evidence |
| Confidence | medium |
| Known gaps | invoice schema, auth/session boundary, audit storage, export destination |

## Implementation Surfaces

| Surface | Evidence | Confidence |
| --- | --- | --- |
| App framework | `package.json` indicates Next.js and React. | high |
| Review queue UI | User source note describes pending invoice review workflow. | medium |
| Audit trail | User source note requires durable approve/reject history. | medium |

## Open Decisions

- Exact invoice data source and schema.
- Existing authentication/session API boundary.
- Required audit log storage location.
- Export format and destination.
```

## Example Handoff

```text
Imported Invoice Review into the MDX project wiki flow.

Created: `wiki/AGENTS.mdx`, `wiki/index.mdx`, `wiki/log.mdx`, `wiki/sources.mdx`, `wiki/plans/index.mdx`, `wiki/roadmap.mdx`, `wiki/sources/prd.mdx`, `wiki/sources/technical-brief.mdx`, `wiki/sources/design-brief.mdx`, `wiki/plans/features/review-queue.mdx`.
Preserved: existing Git history and app source files.
Present but not upgraded: `AGENTS.md` has no safe managed block boundary.
Skipped: `wiki/plans/mvp/` because this is an existing internal tool.
Next decision: confirm schema, auth/session access, audit persistence, and export destination.
```
