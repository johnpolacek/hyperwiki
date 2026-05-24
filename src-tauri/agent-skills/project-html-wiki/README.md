# Project HTML Wiki Skill

A skill for AI coding agents that creates and maintains an HTML-first project memory layer. It helps agents capture source context, plans, roadmap state, decisions, and durable handoffs in browser-readable `wiki/` pages.

Use it when you want to initialize a project wiki, onboard an existing repo, plan feature work, sync unplanned changes back into project memory, or audit an existing wiki.

Inspired by [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), [Thariq's The Unreasonable Effectiveness of HTML](https://x.com/trq212/status/2052809885763747935), and the practice of using standalone HTML artifacts for agent-generated specs, explainers, reports, and plans.

## Install

Install globally for your user account:

```bash
npx skills add https://github.com/johnpolacek/project-html-wiki-skill -g
```

Or install only in the current project:

```bash
npx skills add https://github.com/johnpolacek/project-html-wiki-skill
```

When run inside a repository, the Skills CLI installs project-locally by default. Use `-g` or `--global` when you want the skill available across projects.

This repository contains one root-level skill, so no `--skill` flag is needed. Repositories that publish multiple skills use `--skill <skill-name>` to select one skill from the collection, for example `npx skills add https://github.com/vercel-labs/skills --skill find-skills`.

## What This Skill Does

- Runs `intake_discovery` first when you have no project idea, repo, PRD, or notes.
- Bootstraps an HTML-first `wiki/` for new projects with enough source context.
- Imports existing repos without rewriting user-authored files or Git history.
- Maintains `wiki/Sources.html`, `wiki/plans/`, `wiki/roadmap.html`, `wiki/log.html`, and local agent guidance.
- Creates source briefs only when evidence supports them.
- Keeps routine implementation history in Git and durable project context in `wiki/log.html`.
- Leaves app scaffold generation outside the core workflow. Treat scaffold requests as separate implementation work.

No generator or CLI runtime is required. This repository defines the skill contract, references, and validation smoke test.

## Use In A Project

Installing the skill does not modify a repository. Invoke it from an agent prompt when you want project wiki work.

### Start With No Source Context

If you want to start a project but do not yet have a repo, PRD, notes, or concrete idea, ask:

```text
Use $project-html-wiki to help me figure out a new project from scratch.
```

The skill should interview first and create no files during intake. After the intake summary has a working title, audience, purpose, outcome, rough interface type, and known constraints or explicit unknowns, it can proceed to bootstrap after confirmation.

Thin context is different. If you already have a rough but concrete idea or explicit unknowns, the skill may bootstrap a minimal wiki that names gaps instead of inventing certainty.

### Initialize An Empty Project

For an empty project directory with a rough idea, provide enough thin context to bootstrap without intake:

```text
Use $project-html-wiki to initialize this empty project directory.

Project idea: I want to build a small web app for tracking recurring home maintenance tasks.

Known context:
- Audience: me and my household
- Purpose: remember what needs to be done, when it was last done, and what is overdue
- Primary outcome: a simple task list with recurring schedules and completion history
- Interface type: web app
- Constraints: keep the first version local-first and simple, with no accounts or payments
- Unknowns to preserve: exact tech stack, data storage choice, notification approach

Please bootstrap the HTML-first project wiki, name the unknowns clearly, initialize Git if needed, and do not generate app scaffold code yet.
```

### Onboard An Existing Project

For an existing repo with source files but no HTML-first wiki yet, make the import posture explicit:

```text
Use $project-html-wiki to onboard this existing project into the HTML-first project wiki flow.

Please inspect the repo first, preserve existing files and Git history, identify whether this is a live product, internal tool, library, archive, or unknown lifecycle, then create only the safe baseline wiki and agent-guidance artifacts.

Important constraints:
- Do not rewrite existing docs or agent guidance outside managed blocks.
- Do not create `wiki/plans/mvp/` unless repo evidence clearly says this is greenfield or pre-launch MVP work.
- Do not install dependencies, generate scaffold code, or choose a new stack.
- Catalog repository evidence and unknowns in `wiki/Sources.html`.
- Report created, preserved, skipped, blocked, and `present_but_not_upgraded` artifacts.
```

For existing live products, internal tools, libraries, archives, maintenance-mode projects, or unknown lifecycle, the skill should treat the project as post-MVP unless source evidence says otherwise.

### Plan Or Continue Feature Work

Before meaningful product, architecture, schema, API, dependency, build, auth, integration, deployment, or durable UI changes in a project that uses this wiki, ask:

```text
Use $project-html-wiki to plan this feature before implementation.
```

Useful variants:

```text
Use $project-html-wiki to create a plan for billing export.
Use $project-html-wiki to show me the current plan state for this project.
Use $project-html-wiki to continue the current plan.
Use $project-html-wiki to implement this plan and keep execution notes for decisions, tradeoffs, deviations, and validation surprises.
Use $project-html-wiki to update the plan for the work we just completed.
```

Continue and resume prompts are orientation prompts by default. The skill should summarize the current plan, current unit, blockers, and next choices before any implementation work.

### Sync, Audit, Or Upgrade

Use sync after code changed before planning or when project memory may be stale:

```text
Use $project-html-wiki to sync recent code changes back into the wiki.
```

Use audit when you want the skill to check required files, managed blocks, source indexes, planning structure, log policy, monorepo target safety, and repo-local skill behavior:

```text
Use $project-html-wiki to audit this project's wiki and agent guidance files.
```

In all workflows, the skill should avoid inventing retrospective intent. If repository evidence shows what changed but not why, it should record the observed change and name the unknown decision.

## Automation Policy

By default, the skill asks before committing, pushing, or running long commands, and allows dependency installs automatically. To allow automatic commits for completed docs-only wiki changes in one repo, ask during initialization or audit:

```text
Use $project-html-wiki to set this repo's automation policy to auto-commit docs-only wiki changes.
```

The policy lives in `wiki/AGENTS.md`:

```markdown
## Automation Policy

- Commit docs-only wiki changes: auto
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
```

With that policy, the skill may commit completed docs-only project wiki changes automatically and install dependencies when needed for requested work. It should stage only intended wiki, docs, and agent-guidance files. It should not push unless the repo policy allows it or the user asks.

## Repository Layout

- `SKILL.md`: installable skill entrypoint
- `references/canonical-bootstrap-contract.md`: bootstrap and import contract
- `references/intake-discovery-contract.md`: zero-context intake contract
- `references/generated-baseline-artifacts.md`: required artifact templates and managed-block markers
- `references/html-artifact-patterns.md`: HTML artifact pattern and visual QA guidance
- `references/planning-contract.md`: feature planning, plan updates, sync, and log guidance
- `references/upgrade-contract.md`: additive upgrade behavior
- `references/validation-checklist.md`: validation scenarios
- `scripts/bootstrap-smoke-test.mjs`: disposable bootstrap validation script

## Validation

Run the bootstrap smoke test:

```bash
node scripts/bootstrap-smoke-test.mjs
```

The script generates a disposable `Invoice Review` wiki under `.tmp/bootstrap-smoke/`, validates required artifacts, checks key relative links, and fails on common placeholder leakage in generated HTML.

## License

MIT
