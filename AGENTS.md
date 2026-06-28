# AGENTS.md instructions for /Users/johnpolacek/Projects/hyperwiki

Commit work when it is complete. As soon as a unit of work is finished and verified—code is good and there are no open questions about the implementation—commit it before moving on. When a commit completes a unit of work, include the wiki changes it produced—plan/stage/unit status updates and `wiki/log.mdx` entries—in that same commit so the wiki is committed alongside the code and never left dirty or out of sync. Do not leave completed changes sitting uncommitted in the working tree, and prefer focused, single-purpose commits over batching unrelated finished work together. Pull whenever confident the code is good.

Always use `pnpm` for package management and package scripts in this repository.

Prefer the `agent-browser` CLI for browser automation and visual checks when inspecting project previews.

When you finish an Execute Unit task that produces a browser-observable result, use the `agent-browser` skill to screenshot each distinct view/state of the running app. First remove any existing PNGs in the per-unit directory named in the Execute Unit prompt (under `.hyperwiki/state/screenshots/<unit-path>/`), then save the fresh set there as ordered PNGs (e.g. `01-home.png`, `02-settings.png`) so a redesign fully replaces the old shots rather than leaving stale ones. Skip cleanly when the unit has no visible UI result.

**Reaching gated previews for capture.** Before screenshotting, make sure the full app is up — `pnpm dev` must run the frontend *and* any backend (e.g. Convex) it depends on, and the preview URL must respond (`agent-browser wait --load networkidle`). If the view is behind authentication, read the `previewCapture` profile in `.hyperwiki/config.json` and the test credentials in `.env.local` (key names are in the profile), then sign in with `agent-browser`. For Clerk test instances this is automated: use a `+clerk_test` email and the fixed verification code `424242` (adapt to whatever the sign-in form shows — password field vs. code field). If the **sign-up** form shows a bot challenge (e.g. Cloudflare Turnstile) that won't solve headlessly, do not drive sign-up — ensure the test user exists out-of-band via the provider's backend API (e.g. the Clerk Backend API with `CLERK_SECRET_KEY`), then sign *in* (code `424242`); or disable bot sign-up protection on the dev/test instance. Honor any `## Screenshot capture` notes on the unit page for the route(s) and the steps to reach a deep state. Use test credentials only — never production secrets. If a gate genuinely cannot be cleared automatically, capture what you can and explain the blocker in the `Manual step required` section.

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

### Product Lifecycle

- hyperwiki guides each project through a canonical 6-phase product lifecycle at `wiki/plans/lifecycle/`: Purpose → Design System → UI Mocks → Backend Architecture → Onboarding → MVP Views. The runtime seeds it for every new and imported project.
- Meaningful new-product work flows through the active phase and its completion gate. The active phase is the first whose gate is not cleared; only the active phase hands off to its sub-agent. See `.agents/skills/hyperwiki/references/lifecycle-contract.md` for the phases, gates, and per-phase sub-agent contracts.
- Each phase loads specific repo-local skills (e.g. design system → `tailwind-design-system` + `shadcn`; UI mocks → `frontend-design`). Phase build work lives in the phase's own `childPlan` sub-plan (`plan > stages > units`); the lifecycle layer only tracks which phase is active.
- Preserve the lifecycle phase frontmatter (`phaseId`/`phaseOrder`/`childPlan`/`gate`) and keep it in lockstep with the descriptor in `src/lib/lifecycle.ts`.

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
