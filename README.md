# hyperwiki

hyperwiki is Localhost Tooling for docs-driven agentic development. It runs as a local app over the developer's own repo, files, Git state, terminal sessions, credentials, and environment variables, keeping that machine-local environment as the trust boundary.

It turns project docs, plans, logs, source references, terminal panels, and verification status into a repo-local development surface.

hyperwiki is early and experimental. The current package is useful for trying the workflow and reserving the `npx hyperwiki` command, but the terminal and agent-integration surfaces are still MVP-grade.

## Usage

Initialize a wiki in a project:

```bash
npx hyperwiki init --yes
```

Launch the local workspace from any hyperwiki project:

```bash
npx hyperwiki
```

The command registers the current hyperwiki-initialized project in your user-level project registry, starts or attaches to the local server, opens the browser workspace, and restores the configured wterm panels. Use <code>npx hyperwiki launch</code> when you want the explicit subcommand. It also prints the workspace URL, usually:

```text
http://127.0.0.1:4177
```

For local development in this repo, use Portless:

```bash
pnpm dev
```

Main previews use `https://hyperwiki.localhost`. Feature worktree previews use `https://<branch-slug>.hyperwiki.localhost`.

## Commands

```bash
npx hyperwiki
npx hyperwiki init
npx hyperwiki dev
npx hyperwiki launch
```

`init` creates:

```text
wiki/
.hyperwiki/config.json
.hyperwiki/state/
.hyperwiki/sessions/
```

The `wiki/` files are canonical repo-visible HTML. Runtime state under `.hyperwiki/state/` and `.hyperwiki/sessions/` should stay ignored unless intentionally exported.
Known local projects are tracked outside repos in `~/.hyperwiki/projects.json` so the workspace can switch between initialized projects without modifying their manifests.

## Local-Only Guardrails

- hyperwiki identifies as Localhost Tooling, not a hosted project dashboard.
- `dev` binds to localhost addresses only.
- Repo files and Git remain canonical.
- The browser workspace should not become a hidden source of truth.
- Terminal/session state is local runtime state by default.
- Agent and terminal controls should stay visible and auditable.
- Hosted sync, telemetry, and remote execution are not default product assumptions.

## Current Status

The MVP includes an HTML wiki scaffold, local static workspace, local dev server, visible Git/repo context, read-only plan/log/source/verification summaries, config-driven terminal layouts, session metadata under `.hyperwiki/sessions/`, WebSocket PTY transport for terminal panels, and multi-project switching through a user-level registry. Refresh restores active retained terminal tabs plus required layout panels, then starts fresh PTYs. Terminal session exports are returned to the caller as runtime data; hyperwiki does not write terminal state into repo-visible wiki files automatically.

Local verification:

```bash
pnpm run check
pnpm wt:doctor
pnpm run smoke:browser
pnpm run smoke:init
pnpm run smoke:launch
pnpm run smoke:pty
pnpm run smoke:sessions
```

Parallel feature worktrees:

```bash
pnpm wt:create feature/my-change
cd ../hyperwiki.worktrees/feature-my-change
pnpm dev
pnpm wt:finish feature/my-change
```
