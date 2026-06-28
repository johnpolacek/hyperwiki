# Validation Checklist

Use this checklist to validate project wiki bootstrap, planning, maintenance, and upgrade behavior against realistic targets before adding automation or changing templates. Validation can be manual; record durable findings in `wiki/log.mdx` only when they affect durable project context.

## Hard Failures

- Target root is wrong or ambiguous and the workflow writes root agent guidance, `wiki/`, repo-local skills, roadmap, or planning files anyway.
- User-authored files, existing wiki pages, existing repo-local skills, or existing Git history are overwritten without explicit instruction.
- Zero-context intake creates `AGENTS.md`, `wiki/`, source briefs, roadmap, plans, repo-local skills, or scaffold files.
- Generated files contain bracketed placeholders instead of project-specific content or `Unknown`.
- Generated standard wiki links point to `.html` instead of `.mdx`.
- `wiki/log.mdx` duplicates routine Git history instead of durable project-context changes.
- Generated MDX imports custom components, relies on inline scripts, or assumes a CSS/theme contract without target repo evidence or explicit user request.

## General MDX Quality Checks

- Each generated `wiki/**/*.mdx` page has frontmatter with `title`, `description`, and `wikiKind`.
- The first 80 lines of standard pages are useful in a terminal.
- Each substantial page has a `Reader Goal`.
- Long prose is converted into tables, status matrices, decision panels, execution tracks, `<details>`, or inline SVG diagrams when useful.
- Source-heavy claims include evidence or confidence labels.
- Internal links are relative and point to `.mdx` paths.
- Existing HTML wiki files, if present, are preserved unless the user explicitly requests conversion.

## Intake Discovery

- Classifies zero context correctly.
- Does not create files during intake.
- Stops with an intake summary unless the user confirms enough context to bootstrap.
- Handoff to bootstrap includes working title, audience, purpose, primary outcome, product/interface type, and constraints or explicit unknowns.

## New Project Bootstrap

- Creates `AGENTS.md`, `wiki/AGENTS.mdx`, `wiki/index.mdx`, `wiki/log.mdx`, `wiki/sources.mdx`, `wiki/plans/index.mdx`, and `wiki/roadmap.mdx`.
- Creates `.agents/skills/project-wiki-maintainer/SKILL.md` only when repo-local skills are already in use or explicitly requested.
- Creates source briefs only when evidence justifies them.
- Records source evidence and unknowns in `wiki/sources.mdx`.
- Initializes Git for new projects unless the user opts out.
- Does not generate app scaffold code as part of bootstrap.

## Existing Repo Import

- Preserves existing files and Git history.
- Classifies lifecycle before creating deeper plan structure.
- Treats existing live products, internal tools, libraries, archives, maintenance-mode projects, and unknown lifecycle as post-MVP unless evidence says otherwise.
- Creates only `wiki/plans/index.mdx` by default; adds focused feature/maintenance/release plans only when concrete workstreams justify them.
- Does not create `wiki/plans/mvp/` by default for imported existing projects.
- Reports existing docs structures that conflict with the generated wiki contract.

## Managed Blocks

- Adds one `HYPERWIKI-SKILL` managed block when markers are absent and insertion is safe.
- Replaces only the content inside existing recognized managed markers.
- Preserves user-authored content outside markers.
- Reports `present_but_not_upgraded` when a generated-looking file lacks a safe update boundary.
- Keeps any `CLAUDE.md` managed block consistent with `AGENTS.md`, `wiki/AGENTS.mdx`, and `wiki/index.mdx`.

## Planning

- Creates or updates plans before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- Skips durable plans for small, local, reversible fixes with no durable project impact.
- Keeps `wiki/plans/index.mdx` structural and optimizes active plans for terminal inspection.
- Sets exactly one next execution unit or planning target when `wiki/plans/mvp/index.mdx` exists.
- Includes design considerations in plans or units that touch UI, preferably by linking to `wiki/sources/design-brief.mdx`.
- Manual verification and completion gates include exact user steps, commands/settings paths when known, expected success signals, and what to rerun afterward.
- Moves fully complete plans into `wiki/plans/zzz_completed/` only after status, units, gates, and verification support completion.
- Removes archived plans from active current-plan/current-unit slots while relying on the app's Completed Plans navigation.

## Sync And Log

- Inspects Git status, relevant diffs, recent commits when applicable, and current wiki state before syncing.
- Classifies recent changes as planned, unplanned minor, unplanned durable, corrective, or unclear before writing wiki updates.
- Appends `wiki/log.mdx` as the primary sync artifact only for material completed work, validation, decisions, and follow-ups that affect durable project context.
- Updates roadmap, source index, source briefs, and wiki index only when recent code changes reveal durable project knowledge, UI design direction, or next-step changes.
- Does not invent retrospective intent when the repo shows what changed but not why.

## Product Lifecycle

- `wiki/plans/lifecycle/` exists with `index.mdx` plus exactly six phase pages in canonical `phaseOrder` (1–6): purpose, design-system, ui-mocks, backend-arch, onboarding, mvp-views.
- Each phase page carries `phaseId`, `phaseOrder`, and `gate` frontmatter; `childPlan` is present for execute phases (2, 3, 5, 6) and intentionally omitted for purpose (1) and backend-arch (4).
- Phase frontmatter matches the canonical descriptor in `src/lib/lifecycle.ts` / `src-tauri/src/domain/lifecycle.rs` (no divergence in id, order, gate, or childPlan).
- `phaseOrder` values are monotonic and unique; gate values are one of `childPlan`, `manual`, `import-validated`.
- The lifecycle plan is preserved on import/upgrade — never overwrite or delete its phase frontmatter.

## Smoke Test Expectations

- Disposable output is written under `.tmp/`.
- Required MDX artifacts exist.
- Required agent guidance markers use `HYPERWIKI-SKILL`.
- Generated baseline output contains no bracketed placeholder leakage.
- Generated baseline output contains no standard `.html` wiki paths.
