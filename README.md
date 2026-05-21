# hyperwiki

hyperwiki is Localhost Tooling for docs-driven agentic development. It runs as a local app over the developer's own repo, files, Git state, terminal sessions, credentials, and environment variables, keeping that machine-local environment as the trust boundary.

It turns project docs, plans, logs, source references, terminal panels, and verification status into a repo-local development surface.

hyperwiki is early and experimental. The current product direction is a Tauri desktop app with a Rust-owned local runtime. The legacy Node localhost server remains in the repo as migration reference and smoke-test coverage, not as the shipping desktop backend.

## Usage

Initialize a wiki in a project:

```bash
npx hyperwiki init --yes
```

Build the desktop app:

```bash
pnpm run tauri:build
```

The verified macOS bundle target is:

```text
src-tauri/target/release/bundle/macos/Hyperwiki.app
```

Launch the compatibility CLI from a built binary:

```bash
src-tauri/target/release/hyperwiki
```

The Rust binary opens the desktop app without browser chrome. It also provides compatibility commands for `init`, `reset`, `dev`, `launch`, and `mcp`.

```bash
src-tauri/target/release/hyperwiki init --yes
src-tauri/target/release/hyperwiki reset --dry-run
src-tauri/target/release/hyperwiki mcp
```

For local development in this repo, use Portless:

```bash
pnpm dev
```

Main previews use `https://hyperwiki.localhost`. Feature worktree previews use `https://<branch-slug>.hyperwiki.localhost`. `pnpm dev` remains the local development preview for this repository and currently runs the legacy Node reference server through Portless.

## Commands

```bash
hyperwiki
hyperwiki init
hyperwiki reset
hyperwiki dev
hyperwiki launch
hyperwiki mcp
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

The Tauri rewrite includes an HTML wiki scaffold, local static workspace, visible Git/repo context, read-only plan/log/source/verification summaries, config-driven terminal layouts, session metadata under `.hyperwiki/sessions/`, Rust PTY-backed terminal panels, app preview status, review workflows, stdio MCP, and multi-project switching through a user-level registry. Terminal session exports are returned to the caller as runtime data; hyperwiki does not write terminal state into repo-visible wiki files automatically.

Local verification:

```bash
pnpm run check
pnpm run check:all
pnpm run tauri:build
pnpm wt:doctor
pnpm run smoke:tauri-static-assets
```

Parallel feature worktrees:

```bash
pnpm wt:create feature/my-change
cd ../hyperwiki.worktrees/feature-my-change
pnpm dev
pnpm wt:finish feature/my-change
```
