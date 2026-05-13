# AGENTS.md instructions for /Users/johnpolacek/Projects/hyperwiki

Prefer to commit and pull whenever confident that the code is good and there are no questions about implementation.

Always use `pnpm` for package management and package scripts in this repository.

Prefer the `agent-browser` CLI for browser automation and visual checks before falling back to Playwright.

## hyperwiki Agent Guide

### Project Wiki

- Read `wiki/index.html` before answering project-specific questions or making structural changes.
- hyperwiki intentionally adapts the project-wiki workflow to an HTML-first wiki. Durable project knowledge, plans, decisions, and project-context history live under `wiki/` as HTML.
- Use `wiki/sources.html` as the source index.
- Create or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- Do not create plans for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction.
- Sync recent codebase changes back into `wiki/log.html`, relevant plans, roadmap, and source pages when work happened before planning or made the wiki stale.
- Update `wiki/index.html` when adding or materially changing durable wiki pages.

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
