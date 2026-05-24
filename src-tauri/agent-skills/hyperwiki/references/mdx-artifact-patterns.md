# MDX Artifact Patterns

Use this reference before creating or materially updating generated `wiki/**/*.mdx` artifacts. The goal is to make each page a purpose-built rendered MDX artifact that remains useful in a terminal.

## Quality Bar

Every substantial MDX artifact must pass a structure and readability bar before handoff:

- Start with minimal frontmatter: `title`, `description`, and `wikiKind`.
- Keep the first screen CLI-readable with a title, reader goal, status, next action, blockers, and key links when applicable.
- Use Markdown for ordinary prose and lists, and use semantic HTML/JSX only when it materially improves structure.
- Use Hyperwiki planning components on plan pages when they improve structure. For non-plan pages, prefer renderer-agnostic Markdown and semantic HTML/JSX unless the target project exposes a component registry.
- Do not rely on page-local CSS, inline scripts, remote assets, or framework-specific MDX features by default.
- Use renderer-native styling. The skill owns content structure, not theme implementation.
- Include at least one artifact-specific structure when the content supports it: evidence matrix, execution track, status table, decision panel, workflow diagram, annotated snippet, or roadmap rail.
- Check that raw MDX is readable with `sed`, `head`, or `less`.

If a generated page reads like a prose dump, revise it into clearer sections, tables, diagrams, or decision panels.

## Artifact Pattern Selector

| Pattern | Use When | Required Structures |
| --- | --- | --- |
| Planning/exploration | Comparing directions, choosing implementation shape, planning a feature, or exploring tradeoffs. | Status summary, option/tradeoff table, decision callout, next-unit checklist. |
| Code review/explainer | Explaining a PR, diff, subsystem, migration, bug, or risky implementation. | Read-this-first section, annotated snippets, findings table, module/call-flow diagram when useful. |
| Report/research | Summarizing investigation, repo history, incident context, system behavior, or team status. | Executive summary, evidence matrix, timeline, confidence labels, recommendations, open questions. |
| Design/prototype | Exploring UI direction, component states, animation, interaction, or visual system options. | State descriptions, interaction matrix, responsive/accessibility expectations, validation notes. |
| Custom editor/spec | Reordering, tuning, tagging, selecting, validating, or specifying structured information. | Inputs/outputs schema, validation rules, examples, export or handoff format. |

## Reader Goal

Every generated MDX page must define a reader goal near the top:

```mdx
## Reader Goal

After 2 minutes, the reader can [decide/understand/compare/review/export] [specific thing].
```

Use the goal to decide what belongs in the first 80 lines and what can move lower in the file.

## No Long Prose Rule

Avoid long prose blocks. If a section grows beyond a short paragraph, transform it:

- evidence, assumptions, or sources -> Markdown table
- system behavior, workflow, or architecture -> inline SVG or numbered flow
- alternatives -> comparison table
- implementation sequence -> execution track
- risks, blockers, unknowns -> status table
- code-heavy explanation -> annotated code block with file path and why-it-matters note
- decisions -> decision panel with selected option, rationale, and consequences

## Portable Structures

Prefer renderer-agnostic structures:

```mdx
<section aria-labelledby="current-state">

## Current State

| Field | Value |
| --- | --- |
| Status | Active |
| Current unit | Confirm schema boundary |
| Next action | Decide invoice export format |
| Blockers | Export destination unknown |

</section>
```

Use `<details>` for optional detail:

```mdx
<details>
<summary>Source evidence</summary>

| Source | Claim | Confidence |
| --- | --- | --- |
| `package.json` | App uses Next.js | high |

</details>
```

Inline SVG is allowed when a diagram materially improves clarity:

```mdx
<svg viewBox="0 0 640 120" role="img" aria-label="Import flow from source to validation to commit">
  <rect x="20" y="35" width="140" height="50" rx="8" />
  <text x="90" y="65" textAnchor="middle">Source</text>
  <path d="M160 60 H250" />
  <rect x="250" y="35" width="140" height="50" rx="8" />
  <text x="320" y="65" textAnchor="middle">Validate</text>
</svg>
```

## Code Snippet Treatment

For code-heavy artifacts:

- show file path and line references above each snippet
- keep snippets short
- explain why the snippet matters next to the snippet
- link to files or summarize omitted sections instead of dumping large blocks

~~~mdx
### `src/stream/send.ts:88`

Why this matters: readiness must be awaited before each write to avoid buffering under slow clients.

```ts
await writer.ready
writer.write(chunk)
```
~~~

## Evidence And Confidence UI

Source-heavy artifacts should show where claims came from and how certain they are.

Use consistent labels:

- `confirmed from repo`
- `confirmed from source doc`
- `inferred from prompt`
- `unknown`
- `contradicted`
- `needs decision`

Use confidence labels (`high`, `medium`, `low`) for briefs, reports, and plans when future agents may otherwise over-trust inferred context.

## Validation Checklist

Before handoff:

- no bracketed placeholder leakage except intentional `Unknown`
- top 80 lines explain purpose, status, next action, and blockers
- internal links use `.mdx` paths
- tables fit raw-file reading and rendered reading
- inline SVG, if present, is small and renderer-agnostic
- no custom component imports outside the Hyperwiki planning component registry unless target repo support was confirmed
- no inline scripts unless explicitly requested
- no stale references to generated standard `.html` wiki paths
- source-heavy claims have evidence or confidence labels
