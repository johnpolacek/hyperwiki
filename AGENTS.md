# AGENTS.md instructions for /Users/johnpolacek/Projects/hyperwiki

Prefer to commit and pull whenever confident that the code is good and there are no questions about implementation.

Always use `pnpm` for package management and package scripts in this repository.

Prefer the `agent-browser` CLI for browser automation and visual checks when inspecting project previews.

Use Portless for user project previews and prefer named `.localhost` URLs over fixed ports when working across worktrees. Hyperwiki's own `pnpm dev` command starts the Tauri desktop app.

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
- Preserve Hyperwiki scaffold conventions when applying external project-wiki skills: lowercase `wiki/sources.mdx`, app-visible `wiki/AGENTS.mdx`, MDX plan components, and Localhost Tooling runtime boundaries. See `wiki/scaffold-contract.mdx`.
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
