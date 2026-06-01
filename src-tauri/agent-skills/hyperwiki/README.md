# hyperwiki Skill

A hyperwiki-specialized skill for AI coding agents that creates and maintains an MDX-based project memory layer. It helps agents capture source context, plans, roadmap state, decisions, verification records, and durable handoffs in renderer-friendly `wiki/` pages that remain useful from a terminal.

Use it when you want hyperwiki to initialize a project wiki, onboard an existing repo, run agent-guided plan creation, plan feature work, sync unplanned changes back into project memory, or audit an existing wiki.

This skill is derived from the Project MDX Wiki skill and adapted for hyperwiki's current MDX-first test-mode contract.

## Install

Install globally for your user account:

```bash
npx skills add https://github.com/johnpolacek/hyperwiki-skill -g
```

Or install only in the current project:

```bash
npx skills add https://github.com/johnpolacek/hyperwiki-skill
```

When run inside a repository, the Skills CLI installs project-locally by default. Use `-g` or `--global` when you want the skill available across projects.

## What This Skill Does

- Runs `intake_discovery` first when you have no project idea, repo, PRD, or notes.
- Bootstraps an MDX `wiki/` for new projects with enough source context.
- Imports existing repos without rewriting user-authored files or Git history.
- Maintains `wiki/sources.mdx`, `wiki/plans/`, `wiki/roadmap.mdx`, `wiki/log.mdx`, and local agent guidance.
- Creates source briefs only when evidence supports them.
- Keeps routine implementation history in Git and durable project context in `wiki/log.mdx`.
- Leaves app scaffold generation outside the core workflow. Treat scaffold requests as separate implementation work.

No generator or CLI runtime is required. This repository defines the skill contract, references, and validation smoke test.

## Use In A Project

Installing the skill does not modify a repository. Invoke it from an agent prompt when you want project wiki work.

### Start With No Source Context

```text
Use $hyperwiki to help me figure out a new project from scratch.
```

The skill should interview first and create no files during intake. After the intake summary has a working title, audience, purpose, outcome, rough interface type, and known constraints or explicit unknowns, it can proceed to bootstrap after confirmation.

### Initialize An Empty Project

```text
Use $hyperwiki to initialize this empty project directory.

Project idea: I want to build a small web app for tracking recurring home maintenance tasks.

Known context:
- Audience: me and my household
- Purpose: remember what needs to be done, when it was last done, and what is overdue
- Primary outcome: a simple task list with recurring schedules and completion history
- Interface type: web app
- Constraints: keep the first version local-first and simple, with no accounts or payments
- Unknowns to preserve: exact tech stack, data storage choice, notification approach

Please bootstrap the MDX project wiki, name the unknowns clearly, initialize Git if needed, and do not generate app scaffold code yet.
```

### Onboard An Existing Project

```text
Use $hyperwiki to onboard this existing project into the MDX project wiki flow.

Please inspect the repo first, preserve existing files and Git history, identify whether this is a live product, internal tool, library, archive, or unknown lifecycle, then create only the safe baseline wiki and agent-guidance artifacts.

Important constraints:
- Do not rewrite existing docs or agent guidance outside managed blocks.
- Do not create `wiki/plans/mvp/` unless repo evidence clearly says this is greenfield or pre-launch MVP work.
- Do not install dependencies, generate scaffold code, or choose a new stack.
- Catalog repository evidence and unknowns in `wiki/sources.mdx`.
- Report created, preserved, skipped, blocked, and `present_but_not_upgraded` artifacts.
```

For existing live products, internal tools, libraries, archives, maintenance-mode projects, or unknown lifecycle, the skill should treat the project as post-MVP unless source evidence says otherwise.

hyperwiki is in MDX-first test mode. Existing HTML wiki files are legacy artifacts; convert or replace them only when the user explicitly asks for a migration/reset, and otherwise report them as stale instead of preserving HTML as the current contract.

### Plan Or Continue Feature Work

Before meaningful product, architecture, schema, API, dependency, build, auth, integration, deployment, or durable UI changes in a project that uses this wiki, ask:

```text
Use $hyperwiki to plan this feature before implementation.
```

Useful variants:

```text
Use $hyperwiki to create a plan for billing export.
Use $hyperwiki to show me the current plan state for this project.
Use $hyperwiki to continue the current plan.
Use $hyperwiki to implement this plan and keep execution notes for decisions, tradeoffs, deviations, and validation surprises.
Use $hyperwiki to update the plan for the work we just completed.
```

Continue and resume prompts are orientation prompts by default. The skill should summarize the current plan, current unit, blockers, and next choices before any implementation work. New plan creation should use one-question-at-a-time grilling before writing MDX plan docs.

### Sync, Audit, Or Upgrade

```text
Use $hyperwiki to sync recent code changes back into the wiki.
Use $hyperwiki to audit this project's wiki and agent guidance files.
```

In all workflows, the skill should avoid inventing retrospective intent. If repository evidence shows what changed but not why, it should record the observed change and name the unknown decision.

## Automation Policy

By default, the skill asks before committing, pushing, or running long commands, and allows dependency installs automatically. To allow automatic commits for completed docs-only wiki changes in one repo, ask during initialization or audit:

```text
Use $hyperwiki to set this repo's automation policy to auto-commit docs-only wiki changes.
```

The policy lives in `wiki/AGENTS.mdx`:

```markdown
## Automation Policy

- Commit docs-only wiki changes: auto
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
```

## Repository Layout

- `SKILL.md`: installable skill entrypoint
- `references/canonical-bootstrap-contract.md`: bootstrap and import contract
- `references/intake-discovery-contract.md`: zero-context intake contract
- `references/generated-baseline-artifacts.md`: required artifact templates and managed-block markers
- `references/mdx-artifact-patterns.md`: MDX artifact pattern and validation guidance
- `references/planning-contract.md`: feature planning, plan updates, sync, and log guidance
- `references/upgrade-contract.md`: additive upgrade behavior
- `references/validation-checklist.md`: validation scenarios
- `scripts/bootstrap-smoke-test.mjs`: disposable bootstrap validation script

## Validation

Run the bootstrap smoke test:

```bash
node scripts/bootstrap-smoke-test.mjs
```

The script generates a disposable `Invoice Review` wiki under `.tmp/bootstrap-smoke/`, validates required MDX artifacts, checks key relative links, and fails on common placeholder or legacy HTML contract leakage.

## License

MIT
