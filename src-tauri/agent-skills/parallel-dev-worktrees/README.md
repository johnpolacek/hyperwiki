# Parallel Dev Worktrees Skill

A skill for AI coding agents working safely in parallel feature branches using git worktrees, Portless named local URLs, and isolated local state.

## Install

Install globally or from your project directory:

```bash
npx skills add johnpolacek/parallel-dev-worktrees-skill
```

This skill uses Portless for branch-specific `.localhost` URLs. We recommend also installing the official Portless skill:

```bash
npx skills add https://github.com/vercel-labs/portless --skill portless
```

Installing the skill teaches the agent the workflow. It does not automatically
modify every project. To add repo-local scripts, Portless naming, and project
documentation, initialize each project from that repo.

During project initialization, the agent should check whether the Portless skill
and `portless` CLI are available. If either is missing, it should install or
report the exact setup command before adding project scripts that depend on
Portless.

## Initialize A Project

From the project you want to use with parallel dev workspaces, run this prompt:

```text
Use $parallel-dev-worktrees to initialize this project.
```

To prefer a single-commit finish workflow in a specific project, say so during
initialization:

```text
Use $parallel-dev-worktrees to initialize this project with a squash finish policy.
```

The agent should inspect the project first, verify Portless is available, then
add project-specific commands and documentation for creating, listing, running,
finishing, and cleaning worktree-based workspaces. It should also check whether
the project can run independent local databases per worktree; if not, that is a
blocker for safe parallel development on schema, migration, seed, or persisted
state changes. Feature plans are committed as project history in `wiki/plans/`,
then moved to `wiki/plans/completed/` when finished.

## Start Work

After a project has been initialized, start a feature in its own worktree:

```text
Create a new worktree for feature/my-task.
```

The agent should create a sibling worktree, run the repo's dependency install
command in that worktree, set up worktree-local env/state where needed, start or
describe the dev command, and hand back the branch, path, Portless URL, plan
path, doctor command, finish command, and any remaining state setup. For pnpm
projects, creation should run `pnpm install` automatically.

## Resume Work

To see what is already in progress:

```text
Show my active worktrees.
```

To continue a specific branch:

```text
Resume work on feature/billing-export.
```

The agent should list or resume worktrees without cleaning, pruning, merging,
or deleting anything. It should report branch, path, dirty status, Portless URL,
plan path, recent commits, start command, finish command, and next steps from
the active plan when available.

## Test Data Cleanup

During development and testing, the agent should track data it creates and
remove generated test data before handoff or finish. This includes database
rows, uploads, object storage keys, cache entries, queue jobs, browser profiles,
screenshots, recordings, emails/messages, webhook deliveries, and temporary
fixtures created only for testing.

Cleanup should use project reset or cleanup commands when available. If test
data lands in shared infrastructure, the agent should stop and report the
affected resources instead of guessing at broad destructive cleanup. Intentional
seed data, migrations, fixtures, snapshots, or artifacts that are part of the
code change should be preserved.

## Review In Browser

To open the current worktree in a browser:

```text
Open a web browser for this worktree.
```

To open a specific branch:

```text
Open feature/billing-export in the browser.
```

The agent should resolve the worktree's Portless URL, check whether the dev
server or route appears to be running, start or report the documented start
command when needed, and open the URL with the available browser tool.

## Finish Work

When the feature is complete, ask:

```text
Use $parallel-dev-worktrees to finish and clean up this feature branch.
```

The agent should commit intended changes in the feature worktree, verify the
feature and integration checkouts are clean, fast-forward the integration branch,
check for overlap with other active worktrees, merge the feature branch, remove
the linked worktree, delete only the merged feature branch, and prune stale
worktree metadata/routes when supported. If a plan exists in `wiki/plans/`, it
should be updated and moved to `wiki/plans/completed/` as part of the finished
feature history.

The default finish policy is a normal merge, not a guaranteed squash or
single-commit merge. If a project was initialized with a squash finish policy,
`wt:finish` should land the completed worktree as one commit on the integration
branch before removing and pruning the worktree.

## Sample Workflows

Default behavior preserves feature branch history when finishing:

```text
Use $parallel-dev-worktrees to initialize this project.
Create a new worktree for feature/billing-export.
Resume work on feature/billing-export.
Open feature/billing-export in the browser.
Use $parallel-dev-worktrees to finish and clean up this feature branch.
```

In the default flow, finish should run the safety checks, merge the feature
branch using the project's documented merge policy, remove the linked worktree,
delete only the merged feature branch, and prune stale metadata/routes when
supported.

For projects where you want completed worktrees automatically landed as one
commit on the integration branch, initialize with a squash finish policy:

```text
Use $parallel-dev-worktrees to initialize this project with a squash finish policy.
Create a new worktree for feature/billing-export.
Resume work on feature/billing-export.
Open feature/billing-export in the browser.
Use $parallel-dev-worktrees to finish and clean up this feature branch.
```

In the squash flow, finish should still run the same clean-checkout,
fast-forward, overlap, and validation checks before creating the single
integration-branch commit, removing the worktree, deleting the merged branch,
and pruning stale metadata/routes.

## Requirements

- Git worktrees.
- Portless for named local dev URLs. Numeric ports are only a temporary fallback for local-only tasks.

## What It Helps With

- Creating one worktree per feature branch.
- Preferring repo-local worktree scripts when available.
- Running worktrees through stable Portless URLs.
- Listing and resuming active worktrees after restarting an agent session.
- Opening a worktree's Portless URL in the browser for review.
- Avoiding fixed localhost ports in handoffs and browser tests.
- Protecting dirty worktrees from accidental cleanup.
- Finishing feature branches through safe merge and cleanup checks.
- Supporting an opt-in squash finish policy for projects that want one commit per completed worktree.
- Keeping mutable state isolated across worktrees.
- Detecting whether independent local databases are supported before declaring a project ready for parallel workspaces.
- Keeping active and completed feature plans in `wiki/plans/` as committed project history.

## When To Use

Use this skill when worktrees are mentioned, when juggling multiple local feature branches, or when asking an AI coding agent to create, inspect, run, hand off, finish, or clean up a feature worktree.

Example prompts:

```text
Use $parallel-dev-worktrees to create a safe feature worktree for this task.
Use $parallel-dev-worktrees to inspect active worktrees before I merge.
Use $parallel-dev-worktrees to finish and clean up this feature branch.
```

More examples are in `examples/prompts.md`.

## What The Agent Does

The agent reads repo-local instructions first, prefers existing `wt:*` scripts, checks dirty worktrees, uses Portless URLs for handoffs, verifies env/state isolation, and finishes only from clean checkouts. If no project workflow exists, it falls back to `references/generic-worktree-commands.md` and recommends adding project scripts later.

## Works Best With

- Project-specific scripts or documented conventions for isolated databases, caches, browser profiles, and backend state.

## License

MIT
