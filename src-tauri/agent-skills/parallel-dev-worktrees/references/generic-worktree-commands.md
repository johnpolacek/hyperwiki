# Generic Worktree Commands

Use this only when a repo does not provide its own worktree scripts. Prefer project scripts whenever they exist.

## Create

Use the raw branch name for git commands, such as `feature/my-task`, and a lowercase kebab-case `branch-slug` for paths, hostnames, profiles, and local state identifiers.

Concrete example:

```bash
branch="feature/login-rate-limit"
slug="login-rate-limit"
git worktree add ../myapp.worktrees/$slug -b "$branch" origin/main
```

Do not use the raw branch name where a path or hostname-safe slug is required.

```bash
git status --short --branch
git remote show origin
git fetch origin --prune
git worktree add ../<repo>.worktrees/<branch-slug> -b feature/<branch-name> origin/<default-branch>
```

Use the default branch reported by `git remote show origin`. If the repo is offline or has no remote, confirm the current branch is the integration branch before creating the worktree from the current checkout.

```bash
git branch --show-current
git status --short --branch
git worktree add ../<repo>.worktrees/<branch-slug> -b feature/<branch-name>
```

After creation:

- copy required local env files carefully
- install dependencies in the new worktree using the detected package manager
  - `pnpm install` when `pnpm-lock.yaml` or package metadata indicates pnpm
  - `npm install`, `yarn install`, or `bun install` for matching projects
- create isolated DB/cache/storage identifiers
- add a worktree-specific Portless name in env or package config

## Doctor Checklist

When no `wt:doctor` script exists, inspect before creating, running, finishing, or cleaning worktrees.

```bash
git status --short --branch
git worktree list --porcelain
if command -v portless >/dev/null 2>&1; then
  portless list
else
  echo "portless unavailable"
fi
```

If `portless` is unavailable, strongly recommend installing or configuring Portless before running multiple worktrees. Use numeric ports only as a temporary fallback for local-only tasks.

For each active worktree, check dirty state:

```bash
git -C <worktree-path> status --short --branch
```

Also check:

- stale or missing worktree paths reported by Git
- overlapping dirty files between active worktrees
- Portless routes that point to removed worktrees or stopped processes
- numeric dev ports only if the repo uses them as a temporary fallback
- env files and local state identifiers such as database names, cache prefixes, storage prefixes, and `WORKTREE_SLUG`
- runtime guard output before bypassing or stopping any process

## List And Resume

Use this when no `wt:list` or `wt:resume` script exists.

List active worktrees:

```bash
git worktree list --porcelain
```

For each worktree, inspect status:

```bash
git -C <worktree-path> status --short --branch
git -C <worktree-path> log --oneline --decorate -5
```

For a specific branch, derive the branch slug and check the active plan:

```bash
test -f wiki/plans/<branch-slug>.md && sed -n '1,180p' wiki/plans/<branch-slug>.md
```

If Portless is available, check current routes:

```bash
portless list
```

Report branch, path, URL, dirty status, active plan path, recent commits, start
command, doctor command, finish command, and next steps. Do not clean, prune,
merge, delete branches, remove worktrees, or overwrite local state during
resume unless explicitly requested.

## Open In Browser

Use this when no `wt:open` script exists.

Resolve the expected Portless URL from the branch slug and project name:

```bash
url="https://<branch-slug>.<project>.localhost"
```

Check whether Portless knows about the route:

```bash
portless list
```

If the route or dev server is not running, start the documented dev command
through Portless:

```bash
portless run --name <branch-slug>.<project> <dev-command>
```

Open the Portless URL with the available browser tool. Do not fall back to a
fixed numeric localhost port when a named Portless URL is available.

## Run With Portless

Prefer a package script. If none exists:

```bash
portless run --name <branch-slug>.<project> <dev-command>
```

For main:

```bash
portless run --name <project> <dev-command>
```

Do not hand off fixed numeric ports when a named Portless route is available.

## Finish Manually

Only use this if there is no project finish script:

If the integration branch has no upstream or the repo is offline, skip `git pull --ff-only` only after confirming the integration checkout is the intended base.

Before merging, check active worktrees for overlapping changed files. Run this only after confirming the feature worktree and integration checkout are clean; it is intended to find overlap with other active dirty worktrees.

```bash
feature_files="$(mktemp)"
dirty_files="$(mktemp)"
trap 'rm -f "$feature_files" "$dirty_files"' EXIT

git diff --name-only <integration-branch>...<feature-branch> | sort -u > "$feature_files"
git worktree list --porcelain | awk '/^worktree / {print substr($0, 10)}' |
  while read -r path; do
    git -C "$path" diff --name-only
    git -C "$path" diff --name-only --cached
  done | sort -u > "$dirty_files"
comm -12 "$feature_files" "$dirty_files"
```

If the final command prints files, inspect the overlap before merging.

If the repo keeps committed feature plans, update the active plan and move it to
the completed directory before merging:

```bash
mkdir -p wiki/plans/completed
git mv wiki/plans/<branch-slug>.md wiki/plans/completed/<branch-slug>.md
# Edit the completed plan with final status, finish date, branch, finish policy,
# resulting commit if known, and follow-ups before committing or squashing.
```

```bash
# In feature worktree
git status --short --branch
git add <intended-files>
git commit -m "<message>"

# In integration checkout
git status --short --branch
git pull --ff-only
git merge --no-ff feature/<branch-name>
git worktree remove ../<repo>.worktrees/<branch-slug>
git branch -d feature/<branch-name>
git worktree prune
```

If the repo explicitly documents a squash finish policy, replace the merge step
with a squash commit:

```bash
# In integration checkout after the clean-checkout and overlap checks above
git status --short --branch
git pull --ff-only
git merge --squash feature/<branch-name>
git commit -m "<single feature summary>"
git worktree remove ../<repo>.worktrees/<branch-slug>
git branch -d feature/<branch-name>
git worktree prune
```

Do not use the squash finish path unless the repo documents it or the user
explicitly asks for a single-commit finish.

## State Isolation Checklist

- SQLite file unique to worktree.
- Postgres database/schema unique to worktree.
- Docker Compose `COMPOSE_PROJECT_NAME` unique to worktree.
- Redis/cache key prefix or container unique to worktree.
- Object storage prefix unique to worktree.
- OAuth/webhook URLs use the worktree Portless URL.
- Browser automation profile/session unique to worktree.
