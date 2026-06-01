# Canonical Bootstrap Contract

This is the source contract for project wiki bootstrap. It defines what the Project MDX Wiki Skill, a CLI, or wrapper must create or preserve when turning a rough idea or existing folder into an MDX, agent-ready project.

Bootstrap requires at least thin source context. If the user has no project idea, no repo, no PRD, no notes, or only a vague prompt, run `intake_discovery` first using [`intake-discovery-contract.md`](intake-discovery-contract.md). Do not create bootstrap artifacts from zero context.

## Purpose

Bootstrap produces a trustworthy project handoff rather than an always-on development environment. A completed bootstrap leaves the user with a project folder that has durable MDX context, local agent guidance, documented implementation direction when known, and clear next actions in their editor or terminal.

The contract is adapter-neutral. A skill, CLI, desktop wrapper, or future automation can gather inputs differently, but they should converge on the same generated project shape and safety rules.

## Bootstrap Modes

- `bootstrap_new`: creates the wiki, source index, local guidance, Git posture, and handoff summary for a new project without installing dependencies or generating app code.
- `import_existing`: preservation mode; scans an existing repo, adds missing wiki and skill structure, preserves existing files, and names unknowns instead of inventing certainty.

`intake_discovery` is a pre-bootstrap mode, not a completed bootstrap. It gathers enough source context to decide whether `bootstrap_new` is appropriate.

## Required Inputs

- Project name.
- Project root path.
- Source type: new project or imported existing project.
- Rough idea, source document, repository evidence, or stated unknowns sufficient to create a source index and project handoff.
- Mode: `bootstrap_new` or `import_existing`.
- Public-entry or external-audience signal, when present.
- Optional stack preferences, treated as planning inputs rather than final scaffold decisions.

## Thin Context Versus Zero Context

Thin context is enough to bootstrap when it contains a rough but concrete idea, source document, repository evidence, or explicitly stated unknowns. A thin bootstrap may create the required wiki baseline, but it must make uncertainty visible in `wiki/sources.mdx`, `wiki/roadmap.mdx`, and any handoff rather than generating unsupported source briefs, roadmap certainty, scaffold choices, or implementation plans.

Zero context is not enough to bootstrap. Treat the request as zero context when the user only says they want to start a project, build something, brainstorm an app, or figure out what to make, and there is no repo or source material that establishes project direction. In zero context:

- do not create `AGENTS.md`, `wiki/`, source briefs, roadmap, plans, repo-local skills, or scaffold files
- ask focused intake questions first
- stop with an intake summary unless the user confirms enough direction to proceed
- hand off to `bootstrap_new` only after the user has confirmed minimum viable context

Minimum viable context for `bootstrap_new` after intake:

- project name or working title
- target user or audience
- project purpose or problem
- primary outcome the project should deliver
- rough product or interface type
- known constraints, or explicit unknowns that should be recorded

## Required Outputs

Every completed bootstrap must produce or preserve:

| Path | Kind | Required | Write Intent |
| --- | --- | --- | --- |
| `AGENTS.md` | root agent entrypoint | yes | create if missing or update managed block |
| `CLAUDE.md` | Claude Code guidance entrypoint | yes when already present or explicitly requested | create if explicitly requested, update managed block if present |
| `.agents/skills/project-wiki-maintainer/SKILL.md` | repo-local skill | yes when repo-local skills are already in use or explicitly requested | create if missing, preserve existing |
| `wiki/AGENTS.mdx` | wiki agent guide | yes | create if missing or update managed block |
| `wiki/index.mdx` | wiki index | yes | create if missing, preserve existing |
| `wiki/log.mdx` | wiki log | yes | create if missing, append for bootstrap |
| `wiki/sources.mdx` | human source index | yes | create if missing, preserve existing |
| `wiki/plans/index.mdx` | planning contract | yes | create if missing, preserve existing |
| `wiki/roadmap.mdx` | roadmap or next-step handoff | yes | create if missing, preserve existing |

Conditional outputs:

| Path | Condition | Write Intent |
| --- | --- | --- |
| `wiki/sources/prd.mdx` | product intent, audience, user journey, feature scope, constraints, or non-goals need durable preservation | create if missing, preserve existing |
| `wiki/sources/technical-brief.mdx` | implementation choices, architecture, stack defaults, integrations, runtime boundaries, testing posture, or handoff risks need durable preservation | create if missing, preserve existing |
| `wiki/sources/marketing-brief.mdx` | project has public-entry, launch, signup, download, customer acquisition, or external-audience needs | create if missing, preserve existing |
| `wiki/sources/design-brief.mdx` | project has a meaningful UI, frontend, website, dashboard, visual workflow, design system, or interaction-heavy product surface | create if missing, preserve existing |
| `wiki/architecture.mdx` | project has durable cross-cutting architecture decisions worth preserving | create if missing, preserve existing |
| `wiki/plans/mvp/` | project is greenfield, pre-launch, or explicitly framed as MVP and needs numbered roadmap execution units | create if needed, preserve existing |

## Project Lifecycle Classification

During `import_existing`, classify the project lifecycle before creating deeper planning structure:

- greenfield or pre-launch MVP
- existing live product
- internal tool in active use
- library or package
- archive or maintenance mode
- unknown

For existing live products, internal tools in active use, libraries, archives, maintenance-mode projects, or unknown lifecycle, do not create `wiki/plans/mvp/` during import. Treat the project as post-MVP unless source evidence or the user explicitly says it is pre-launch, greenfield, or building an MVP.

During `import_existing`, create only `wiki/plans/index.mdx` and `wiki/roadmap.mdx` unless there is a concrete active feature, maintenance, migration, or release track that needs a focused plan. Report skipped `wiki/plans/mvp/` with the reason when lifecycle evidence points away from MVP planning.

Use focused plan locations for existing projects:

- `wiki/plans/features/` for active or planned feature tracks
- `wiki/plans/maintenance/` for refactors, upgrades, cleanup, infra, migrations, reliability, or tech debt
- `wiki/plans/releases/` only when the project already plans around releases

## Local Skill Support

Use this decision tree for repo-local skill support:

1. If the target repo already has `.agents/skills/`, create missing repo-local skill files.
2. Else if the target repo has explicit agent-skill conventions compatible with the user's active agent, create missing repo-local skill files.
3. Else if the user explicitly requested repo-local skills, create missing repo-local skill files.
4. Else skip `.agents/skills/` creation and report the skip reason.

Do not create repo-local skill files solely because the active environment can load them. Ask about local skills only when the user explicitly asks for full repo-local skill integration and the expected convention is unclear. Do not ask during ordinary `bootstrap_new`; skip and report instead.

When repo-local skills are not already in use or explicitly requested, report `.agents/skills/project-wiki-maintainer/SKILL.md` as skipped with the reason: repo-local skills not already in use or explicitly requested.

Do not create additional repo-local skill stubs such as frontend, copywriting, browser, test, or deployment skills as part of this contract. If the user explicitly asks for other local skills, treat that as separate skill-authoring or skill-installation work and preserve any existing user-authored skill files.

## Agent Guidance Files

Use `AGENTS.md` as the default cross-agent guidance file. Preserve and update existing agent-specific guidance files, such as `CLAUDE.md`, when they are already present. Create agent-specific guidance files only when the user explicitly requests that agent convention or when the repository clearly already uses it.

When both `AGENTS.md` and an agent-specific file exist, keep the Project MDX Wiki Skill-managed guidance consistent without duplicating long content. Prefer a compact managed block in the agent-specific file that points to `AGENTS.md`, `wiki/AGENTS.mdx`, and `wiki/index.mdx`.

## Repo Automation Policy

During bootstrap, import, or audit, record a repo-level automation policy in `wiki/AGENTS.mdx`. If the user has not chosen a policy, use these defaults:

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only

Ask the user if they want a different repo posture when the workflow has enough context to make the choice meaningful. Do not ask repeatedly once a policy is recorded unless the user expresses friction or requests a change.

Allowed values:

- Commit docs-only wiki changes: ask | auto
- Commit code changes: ask | auto-after-verification | never
- Push changes: ask | auto | never
- Install dependencies: ask | auto | never
- Run long commands: ask | auto
- Create plans before code: always | meaningful-only

When committing automatically, stage only the intended files for the completed task and leave unrelated dirty files untouched. Never auto-push unless the policy explicitly allows it or the user asks.

## Monorepo And Workspace Detection

Before writing root-level agent guidance, `wiki/`, repo-local skills, roadmap, or planning files, inspect for workspace signals:

- Multiple package manifests at different depths, such as `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, or `.csproj`.
- Root workspace configuration, such as `workspaces` in `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, `rush.json`, or Cargo workspace members.
- Conventional workspace directories such as `apps/`, `packages/`, `services/`, `libs/`, or `crates/`.
- Nested deployable apps, packages, or Git-independent project roots.

If the user request or repository evidence points to exactly one intended project root, target that root and report the choice. If multiple plausible roots exist, stop and ask before creating or updating root agent guidance, `wiki/`, repo-local skills, roadmap, or planning files.

## Source Context Contract

`wiki/sources.mdx` is the required human source index. It should catalog source material, repository evidence, prompts, notes, briefs, proposals, links, and important unknowns. A thin source index is valid when input context is thin; it should name gaps rather than generate unsupported briefs.

Source briefs are conditional. Create them only when the project evidence justifies a separate durable artifact.

Every source brief should include a `## Status` section with last reviewed date, evidence basis, confidence, and known gaps when useful. Use confidence to show how authoritative the brief is:

- `high`: backed by current source docs and repo evidence, with no known contradictions.
- `medium`: backed by credible source context but some implementation details are unknown.
- `low`: inferred from thin prompt, stale docs, or partial repo evidence.

`wiki/sources/prd.mdx` is the canonical product and user-journey source. It should describe the problem, audience, value, primary workflows, constraints, and non-goals with enough specificity for later planning.

`wiki/sources/technical-brief.mdx` translates the PRD into implementation surfaces, runtime boundaries, stack defaults, storage assumptions, integration points, test posture, and handoff risks. It may clarify executable defaults but must not override the PRD.

`wiki/sources/marketing-brief.mdx` exists only when public-entry or external-audience signals justify it. It should stay compact and define hero content, CTA direction, proof or trust signals, audience language, and the minimal page shape.

`wiki/sources/design-brief.mdx` exists only when a durable UI, frontend, website, dashboard, visual workflow, design system, or interaction-heavy product surface justifies it. It should define interface principles, visual system direction, interaction patterns, responsive and accessibility expectations, design validation, and known design unknowns. It should guide future UI feature work without duplicating feature plans or replacing product and technical source briefs.

If the PRD, technical brief, wiki, and imported repository evidence conflict on scaffold-impacting decisions, bootstrap must name the contradiction and stop short of scaffold handoff recommendations until clarified.

## Existing Wiki Compatibility

When `wiki/` already exists, classify it before writing:

1. If it already follows the Project MDX Wiki Skill's project shape, add only missing artifacts and managed blocks that can be updated safely.
2. If it is a different documentation system, such as Docusaurus, MkDocs, generated API docs, or product docs, preserve it and do not normalize it.
3. If Project MDX Wiki Skill artifacts can coexist without conflict, create only clearly missing files and report the existing docs structure.
4. If creating `wiki/AGENTS.mdx`, `wiki/index.mdx`, `wiki/plans/`, or other Project MDX Wiki Skill files would conflict with the existing structure, report `blocked` or `present_but_not_upgraded` and ask for a target location.
5. Never migrate, rename, or reorganize an existing docs tree without explicit user approval.

## Scaffold Boundary

Starter app scaffold generation is outside this bootstrap contract. If the user explicitly asks for scaffold code after bootstrap or import, treat it as a separate implementation task that uses repo conventions, source docs, and the relevant stack-specific workflow. The project wiki may record scaffold intent, stack decisions, commands, validation, and follow-up plans, but this contract does not define scaffold file generation.

## Safety Rules

- Never overwrite existing project files during bootstrap.
- Never overwrite existing repo-local skill files.
- Append or replace only clearly bounded managed blocks where the target file supports them.
- Preserve imported project history and do not commit, push, or rewrite Git state without explicit later instruction.
- Initialize Git for newly created projects unless the user explicitly opts out.
- Treat `bootstrap_new` as a valid completed state without app scaffold code.
- Keep generator-owned app state out of generated project MDX.
- Name unknowns plainly when source context is thin.

## Failure And Escalation

When a required action cannot be completed safely, do not improvise a workaround or silently skip it. Classify the result:

- `failed`: attempted but did not complete, such as Git initialization failure, file write failure, or permission error.
- `skipped`: intentionally not attempted because a precondition was missing, such as repo-local skills not already in use or explicitly requested.
- `present_but_not_upgraded`: artifact exists but has no safe managed boundary, compatible structure, or user-approved normalization path.
- `blocked`: cannot proceed without user clarification, such as ambiguous target root, contradictory project-shaping evidence, or a required choice that cannot be inferred safely.

Escalate to the user when:

- the target root is ambiguous
- an existing file appears generated but has no managed markers or safe update boundary
- source docs or repository evidence conflict on project-shaping decisions
- required files cannot be written
- Git initialization fails
- repo-local skill support is requested but the expected convention cannot be inferred
- an upgrade would require rewriting user-authored content

If safe, create or update non-conflicting artifacts before reporting the blocker. If the blocker affects target root, overwrite risk, or source truth, stop before writing root-level agent guidance, `wiki/`, repo-local skills, roadmap, source briefs, or planning files.

## Handoff Contract

The final bootstrap summary should list project root path, bootstrap mode, artifact results, Git initialization result, generated source index, generated source briefs and skills when applicable, unresolved unknowns or contradictions, and next actions. Each `failed`, `skipped`, `blocked`, or `present_but_not_upgraded` artifact must include the reason and safest next action.

The primary next action should return the user to their normal tools: open editor, open folder, open terminal, open key files, or review documented starter commands.

## Upgrade Contract

Future versions may add missing standard files, managed reference blocks, or marker versions. Upgrades must remain additive by default and preserve user-authored wiki content. See [`upgrade-contract.md`](upgrade-contract.md) for detailed upgrade behavior.
