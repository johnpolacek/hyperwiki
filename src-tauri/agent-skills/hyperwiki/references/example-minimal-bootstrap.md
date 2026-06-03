# Example Minimal Bootstrap

Use this as a compact example for a thin but concrete greenfield project.

## Example `wiki/index.mdx`

```mdx
---
title: "Link Minder Wiki"
description: "Project memory, source context, plans, and handoff state for Link Minder."
wikiKind: "index"
---

# Link Minder

Link Minder is a small CLI for checking a list of URLs and reporting broken or redirected links.

## Reader Goal

After 2 minutes, the reader can identify the source index, Plans index, and next implementation decision.

## Current Focus

Confirm the input file format and output report shape before app scaffold work.

## Core Pages

| Page | Purpose |
| --- | --- |
| [Wiki Agent Guide](AGENTS.md) | Local wiki maintenance contract. |
| [Project Log](log.mdx) | Durable project-context changelog. |
| [Sources](sources.mdx) | Source material, evidence, and unknowns. |
| [Plans](plans/index.mdx) | Structural Plans route target. |
| [Roadmap](roadmap.mdx) | Current goal, next decision, and staged direction. |
```

## Example `wiki/sources.mdx`

```mdx
---
title: "Link Minder Sources"
description: "Source material, repository evidence, and unknowns for Link Minder."
wikiKind: "sources"
---

# Sources

[Back to wiki index](index.mdx)

## Reader Goal

After 2 minutes, the reader can separate confirmed project intent from unresolved implementation choices.

## Source Material

| Source | What It Contributes | Confidence |
| --- | --- | --- |
| User prompt | CLI that checks a list of URLs and reports broken or redirected links. | medium |

## Unknowns

- Input file format.
- Output report format.
- Redirect policy.
```

## Example `wiki/roadmap.mdx`

```mdx
---
title: "Link Minder Roadmap"
description: "Current goal, next decision, next steps, and deferred work for Link Minder."
wikiKind: "roadmap"
---

# Roadmap

[Back to wiki index](index.mdx)

## Current Goal

Create a minimal CLI that checks URLs from a local file.

## Next Decision

Choose the input file format and report output format.

## Next Steps

1. Confirm input and output formats.
2. Create a compact feature plan for the CLI foundation.
3. Implement the parser, checker, and report writer after the plan is accepted.

## Deferred

- Package publishing.
- Parallel link checking.
- Crawling linked pages beyond explicit input URLs.
```

## Example Handoff

```text
Created a `bootstrap_new` project wiki for `Link Minder`.

Created: `AGENTS.md`, `wiki/AGENTS.mdx`, `wiki/index.mdx`, `wiki/log.mdx`, `wiki/sources.mdx`, `wiki/plans/index.mdx`, `wiki/roadmap.mdx`.
Skipped: `.agents/skills/project-wiki-maintainer/SKILL.md` because repo-local skills were not already in use or explicitly requested.
Unknowns: input file format, output report format, redirect policy.
```
