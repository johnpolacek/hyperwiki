import { mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "bootstrap-smoke", "invoice-review");

const files = new Map([
  ["AGENTS.md", `# AGENTS.md instructions for Invoice Review

<!-- HYPERWIKI-SKILL:START v1 -->
## Invoice Review Agent Guide

- Read \`wiki/index.mdx\` before answering project-specific questions or making structural changes.
- Keep durable project knowledge, plans, decisions, and project-context history under \`wiki/\`.
- Use \`wiki/sources.mdx\` as the source index.
- Create or update \`wiki/plans/\` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.

### Automation Policy

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: auto
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- HYPERWIKI-SKILL:END -->
`],
  ["wiki/AGENTS.mdx", `---
title: "Invoice Review Wiki Agent Guide"
description: "Agent maintenance guidance for the Invoice Review wiki."
wikiKind: "agent-guide"
---

# Invoice Review Wiki Agent Guide

<!-- HYPERWIKI-SKILL:START v1 -->
This \`wiki/\` directory is the maintained MDX knowledge and planning layer for \`Invoice Review\`.

Read \`index.mdx\` before structural wiki changes. Keep durable project knowledge, planning, decisions, and validation notes under \`wiki/\`.
<!-- HYPERWIKI-SKILL:END -->
`],
  ["wiki/index.mdx", `---
title: "Invoice Review Wiki"
description: "Project memory, source context, plans, and handoff state for Invoice Review."
wikiKind: "index"
---

# Invoice Review

Internal finance-operator app for reviewing pending invoices, flagging missing vendor data, approving or rejecting invoices, and exporting approved invoice IDs.

## Reader Goal

After 2 minutes, the reader can identify the active review-queue plan, source briefs, and the four decisions blocking implementation.

## Current Focus

Confirm invoice schema, authentication/session boundary, audit persistence, and export destination before implementation changes.

## Core Pages

| Page | Purpose |
| --- | --- |
| [Wiki Agent Guide](AGENTS.md) | Local wiki maintenance contract. |
| [Project Log](log.mdx) | Durable project-context changelog. |
| [Sources](sources.mdx) | Source material, evidence, and unknowns. |
| [Plans](plans/index.mdx) | Plans index and implementation contract. |
| [Roadmap](roadmap.mdx) | Current goal, next decision, and staged direction. |

## Source Briefs

- [PRD](sources/prd.mdx)
- [Technical Brief](sources/technical-brief.mdx)
- [Design Brief](sources/design-brief.mdx)
`],
  ["wiki/log.mdx", `---
title: "Invoice Review Log"
description: "Durable project-context history for Invoice Review."
wikiKind: "log"
---

# Invoice Review Log

[Back to wiki index](index.mdx)

## Log Policy

Append durable project-context changes here. Git owns routine implementation history.

## Entries

### 2026-05-24 Initialize Project Wiki

Type: bootstrap

- Created the MDX project wiki, source index, local agent guidance, and planning contract.
- Mode: \`import_existing\`.
- Git result: preserved existing repository.
- Source briefs: generated \`wiki/sources/prd.mdx\`, \`wiki/sources/technical-brief.mdx\`, and \`wiki/sources/design-brief.mdx\`.
`],
  ["wiki/sources.mdx", `---
title: "Invoice Review Sources"
description: "Source material, repository evidence, and unknowns for Invoice Review."
wikiKind: "sources"
---

# Sources

[Back to wiki index](index.mdx)

## Reader Goal

After 2 minutes, the reader can tell which claims came from source notes, which came from repository evidence, and which decisions remain unknown.

## Source Material

| Source | What It Contributes | Confidence |
| --- | --- | --- |
| User source note | Internal invoice review queue, approve/reject/export workflows, auditability constraint, payment execution out of scope. | medium |
| Repository evidence | Next.js, React, TypeScript, Vitest, existing app and component directories. | high |

## Unknowns

- Exact invoice data source and schema.
- Existing authentication/session API boundary.
- Required audit log storage location.
- Export format and destination.
`],
  ["wiki/roadmap.mdx", `---
title: "Invoice Review Roadmap"
description: "Current goal, next decision, next steps, and deferred work for Invoice Review."
wikiKind: "roadmap"
---

# Roadmap

[Back to wiki index](index.mdx)

## Current Goal

Prepare the review queue implementation plan.

## Next Decision

Confirm schema, session boundary, audit persistence, and export destination.

## Next Steps

1. Resolve the open decisions.
2. Update the active feature plan.
3. Implement the first verified unit.

## Deferred

- Payment execution.
`],
  ["wiki/plans/index.mdx", `---
title: "Invoice Review Plans"
description: "Plans index and implementation contract for Invoice Review."
wikiKind: "plans-index"
---

# Plans

[Back to wiki index](../index.mdx)

## Reader Goal

After 2 minutes, the reader can open the active feature plan and name the next decision required before code changes.

## Current Planning State

| Field | Value |
| --- | --- |
| Active plan | [features/review-queue.mdx](features/review-queue.mdx) |
| Shape | Focused feature plan |
| Current unit | Confirm data and audit boundaries |
| Next action | Confirm invoice schema, auth/session access, audit persistence, and export destination. |
| Blockers | Invoice schema and export destination unknown. |

## Planning Rule

Create or update an MDX plan before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
`],
  ["wiki/plans/features/review-queue.mdx", `---
title: "Review Queue Plan"
description: "Focused feature plan for the invoice review queue."
wikiKind: "feature-plan"
---

# Review Queue Plan

## Summary

| Field | Value |
| --- | --- |
| Status | draft |
| Shape | compact feature plan |
| Current unit | Confirm data and audit boundaries |
| Next action | Confirm schema, session, audit, and export decisions. |
| Blockers | Four open decisions remain. |
| Validation | Typecheck, unit tests, and manual review workflow. |
`],
  ["wiki/sources/prd.mdx", `---
title: "Invoice Review PRD"
description: "Product intent and workflow for Invoice Review."
wikiKind: "source-brief"
---

# PRD

## Status

| Field | Value |
| --- | --- |
| Last reviewed | 2026-05-24 |
| Evidence basis | prompt |
| Confidence | medium |
| Known gaps | export destination |
`],
  ["wiki/sources/technical-brief.mdx", `---
title: "Invoice Review Technical Brief"
description: "Implementation surfaces and risks for Invoice Review."
wikiKind: "source-brief"
---

# Technical Brief

## Status

| Field | Value |
| --- | --- |
| Last reviewed | 2026-05-24 |
| Evidence basis | prompt and repository evidence |
| Confidence | medium |
| Known gaps | schema, auth/session boundary, audit storage |
`],
  ["wiki/sources/design-brief.mdx", `---
title: "Invoice Review Design Brief"
description: "Durable UI and interaction guidance for Invoice Review."
wikiKind: "source-brief"
---

# Design Brief

## Status

| Field | Value |
| --- | --- |
| Last reviewed | 2026-05-24 |
| Evidence basis | prompt and repository evidence |
| Confidence | medium |
| Known gaps | exact table fields and empty states |
`],
]);

const required = [
  "AGENTS.md",
  "wiki/AGENTS.mdx",
  "wiki/index.mdx",
  "wiki/log.mdx",
  "wiki/sources.mdx",
  "wiki/plans/index.mdx",
  "wiki/roadmap.mdx",
  "wiki/plans/features/review-queue.mdx",
  "wiki/sources/prd.mdx",
  "wiki/sources/technical-brief.mdx",
  "wiki/sources/design-brief.mdx",
];

async function writeOutput() {
  await rm(outDir, { recursive: true, force: true });
  for (const [relativePath, content] of files) {
    const filePath = path.join(outDir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else output.push(fullPath);
  }
  return output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validate() {
  for (const relativePath of required) {
    assert(existsSync(path.join(outDir, relativePath)), `Missing ${relativePath}`);
  }

  const allFiles = await walk(outDir);
  const textFiles = allFiles.filter((file) => /\.(md|mdx)$/.test(file));

  for (const file of textFiles) {
    const relativePath = path.relative(outDir, file);
    const content = await readFile(file, "utf8");

    assert(!/\[[^\]\n]+\]/.test(content.replace(/\[[^\]]+\]\([^)]+\)/g, "")), `Placeholder leakage in ${relativePath}`);
    assert(!/PROJECT-HTML-WIKI-SKILL/.test(content), `Legacy marker in ${relativePath}`);
    assert(!/project-html-wiki/.test(content), `Legacy skill name in ${relativePath}`);
    assert(!/wiki\/(?:index|log|Sources|roadmap|Architecture)\.html/.test(content), `Legacy standard wiki path in ${relativePath}`);
    assert(!/wiki\/(?:sources|plans)\/[^)\s`]+\.html/.test(content), `Legacy nested wiki path in ${relativePath}`);

    if (relativePath.endsWith(".mdx")) {
      assert(/^---\n[\s\S]*?\n---\n/.test(content), `Missing frontmatter in ${relativePath}`);
      assert(/title:/.test(content), `Missing title frontmatter in ${relativePath}`);
      assert(/description:/.test(content), `Missing description frontmatter in ${relativePath}`);
      assert(/wikiKind:/.test(content), `Missing wikiKind frontmatter in ${relativePath}`);
    }
  }

  const rootGuide = await readFile(path.join(outDir, "AGENTS.md"), "utf8");
  assert(rootGuide.includes("HYPERWIKI-SKILL:START v1"), "Missing MDX managed marker");
}

await writeOutput();
await validate();

console.log(`MDX bootstrap smoke test passed: ${path.relative(root, outDir)}`);
