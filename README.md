# HyperWiki

HyperWiki is a repo-local HTML workspace for docs-driven agentic development. It turns project docs, plans, logs, source references, terminal panels, and verification status into a local development surface.

HyperWiki is early and experimental. The current package is useful for trying the workflow and reserving the `npx hyperwiki` command, but the terminal and agent-integration surfaces are still MVP-grade.

## Usage

Initialize a wiki in a project:

```bash
npx hyperwiki init --yes
```

Start the local workspace:

```bash
npx hyperwiki dev
```

Then open the printed local URL, usually:

```text
http://127.0.0.1:4177
```

## Commands

```bash
npx hyperwiki
npx hyperwiki init
npx hyperwiki dev
```

`init` creates:

```text
wiki/
.hyperwiki/config.json
.hyperwiki/state/
.hyperwiki/sessions/
```

The `wiki/` files are canonical repo-visible HTML. Runtime state under `.hyperwiki/state/` and `.hyperwiki/sessions/` should stay ignored unless intentionally exported.

## Local-Only Guardrails

- `dev` binds to localhost addresses only.
- Repo files and Git remain canonical.
- The browser workspace should not become a hidden source of truth.
- Terminal/session state is local runtime state by default.
- Agent and terminal controls should stay visible and auditable.

## Current Status

The MVP includes an HTML wiki scaffold, local static workspace, local dev server, visible Git/repo context, read-only plan/log/source/verification summaries, config-driven terminal layouts, session metadata under `.hyperwiki/sessions/`, and WebSocket PTY transport for terminal panels. Refresh restores terminal tabs from retained metadata and required layout panels, then starts fresh PTYs. Terminal session exports are returned to the caller as runtime data; HyperWiki does not write terminal state into repo-visible wiki files automatically.

Local verification:

```bash
npm run check
npm run smoke:browser
npm run smoke:init
npm run smoke:pty
npm run smoke:sessions
```
