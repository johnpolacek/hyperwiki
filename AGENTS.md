# AGENTS.md instructions for /Users/johnpolacek/Projects/hyperwiki

Commit work when it is complete. As soon as a unit of work is finished and verified—code is good and there are no open questions about the implementation—commit it before moving on. Do not leave completed changes sitting uncommitted in the working tree, and prefer focused, single-purpose commits over batching unrelated finished work together. Pull whenever confident the code is good.

Always use `pnpm` for package management and package scripts in this repository.

Prefer the `agent-browser` CLI for browser automation and visual checks when inspecting project previews.

Use Portless for user project previews and prefer named `.localhost` URLs over fixed ports when working across worktrees. hyperwiki's own `pnpm dev` command starts the Tauri desktop app.

For hyperwiki-managed projects, `pnpm dev` is always the local run command. If a project needs frontend, backend, workers, or other long-running services, keep `pnpm dev` as the single entrypoint and orchestrate those services inside the package `dev` script, commonly with `concurrently`.

Use the `parallel-dev-worktrees` skill for worktree execution. Feature worktree previews should use `https://<branch-slug>.hyperwiki.localhost`.

Use repo-local worktree commands when operating parallel feature work:

- `pnpm wt:doctor`
- `pnpm wt:create <branch>`
- `pnpm wt:list`
- `pnpm wt:resume <branch>`
- `pnpm wt:open <branch>`
- `pnpm wt:finish <branch>`
- `pnpm wt:prune`

Feature worktrees live under `../hyperwiki.worktrees/<branch-slug>`. The finish policy is merge, preserving feature branch history.

For frontend rewrite work, use the repo-local `shadcn` and `tailwind-design-system` skills before changing React, Tailwind, shadcn/ui, or MDX plan code. They are installed under `.agents/skills/` and pinned by `skills-lock.json`.

## hyperwiki Agent Guide

### Project Wiki

- Read `wiki/index.mdx` before answering project-specific questions or making structural changes.
- hyperwiki now uses an MDX-first wiki. Durable project knowledge, plans, decisions, and project-context history live under `wiki/` as MDX.
- Use `wiki/sources.mdx` as the source index.
- Preserve hyperwiki scaffold conventions when applying external project-wiki skills: lowercase `wiki/sources.mdx`, app-visible `wiki/AGENTS.mdx`, MDX plan components, and Localhost Tooling runtime boundaries. See `wiki/scaffold-contract.mdx`.
- Create or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- For the React, shadcn, Tailwind v4, and MDX rewrite, read `wiki/plans/features/react-shadcn-mdx-rewrite.mdx` first and execute only the current stage or batch named there.
- Do not create plans for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction.
- Sync recent codebase changes back into `wiki/log.mdx`, relevant plans, roadmap, and source pages when work happened before planning or made the wiki stale.
- Update `wiki/index.mdx` when adding or materially changing durable wiki pages.

### Working Rules

- Inspect existing files and Git state before writing.
- Preserve user-authored files and existing Git history.
- Keep runtime state under ignored `.hyperwiki/state/` and `.hyperwiki/sessions/`.
- Name unknowns and contradictions instead of inventing certainty.

### Automation Policy

- Commit docs-only wiki changes: auto
- Commit code changes: auto-after-verification
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
