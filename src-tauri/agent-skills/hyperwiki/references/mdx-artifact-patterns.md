# MDX Artifact Patterns

Use this reference before creating or materially updating generated `wiki/**/*.mdx` artifacts. The goal is to make each page a purpose-built rendered MDX artifact that remains useful in a terminal. For plan pages, start from the matching skeleton in `references/plan-page-skeletons.md`.

## Quality Bar

Every substantial MDX artifact must pass a structure and readability bar before handoff:

- Start with minimal frontmatter: `title`, `description`, and `wikiKind`.
- Keep the first screen CLI-readable with a title, reader goal, status, next action, blockers, and key links when applicable.
- Use Markdown for ordinary prose and lists, and use semantic HTML/JSX only when it materially improves structure.
- Use hyperwiki planning components on plan pages when they improve structure. For non-plan pages, prefer renderer-agnostic Markdown and semantic HTML/JSX unless the target project exposes a component registry.
- Do not rely on page-local CSS, inline scripts, remote assets, or framework-specific MDX features by default.
- Use renderer-native styling. The skill owns content structure, not theme implementation.
- Include at least one artifact-specific structure when the content supports it: evidence matrix, execution track, status table, decision panel, workflow diagram, annotated snippet, or roadmap rail.
- Check that raw MDX is readable with `sed`, `head`, or `less`.

If a generated page reads like a prose dump, revise it into clearer sections, tables, diagrams, or decision panels. A substantial plan page with zero hyperwiki plan components fails the quality bar and fails hyperwiki plan validation — start from a skeleton in `references/plan-page-skeletons.md` instead of writing bare sections.

## hyperwiki Plan Components

Plan MDX can use these built-in components without imports:

`PlanHero`, `PlanSummary`, `PlanUnit`, `Decision`, `OpenDecision`, `DecisionOption`, `Evidence`, `Verification`, `Scope`, `ImplementationNotes`, `Dependencies`, `CompletionGate`, `Callout`, `Note`, `Tip`, `Warning`, `Danger`, `Check`, `Panel`, `Frame`, `Card`, `CardGroup`, `Columns`, `Column`, `Aside`, `Flow`, `FlowStep`, `StageTrack`, `StageItem`, `RequestExample`, `ResponseExample`, `Steps`, `Step`, `Prompt`, `Update`, `TaskList`, `StatusBadge`, `ParamField`, `ResponseField`, `Tree`, `TreeFolder`, `TreeFile`, `CodeBlock`, `CommandBlock`, `Tabs`, `Tab`, `AccordionGroup`, `Accordion`, `Tooltip`, and `Visibility`.

Use them conservatively:

| Need | Component |
| --- | --- |
| Page title, intent, concise setup | `PlanHero` |
| Status, current unit, next action, blockers, validation | `PlanSummary` |
| Accepted choices and consequences | `Decision` |
| Unresolved decisions with selectable options | `OpenDecision` containing `DecisionOption` entries (the app renders options as buttons that start a modify-plan turn) |
| Human-actionable checklists | `TaskList` with `[ ]`/`[x]` list items (the app renders live checkboxes that persist back to the file) |
| Source-grounded facts, imported Q&A, confidence | `Evidence` |
| Canonical unit sections | `Scope`, `ImplementationNotes`, `Dependencies` (self-titling section headers) |
| Acceptance checks | `Verification` |
| When the unit can be marked complete | `CompletionGate` |
| Stage or unit sequence | `Steps` and `Step` |
| Stage/unit progress with status and links | `StageTrack` and `StageItem` |
| Pipelines, user flows, data flows | `Flow` and `FlowStep` |
| Alternatives, risks, dependencies, work tracks | `CardGroup`, `Card`, `Columns`, `Column` |
| Comparison grid of options | `CardGroup cols="2"` or `cols="3"` with `Card status="..."` |
| API, MCP, command, event, or schema contracts | `RequestExample`, `ResponseExample`, `ParamField`, `ResponseField` |
| File snippets, schemas, config, API examples | `CodeBlock` |
| Exact shell commands | `CommandBlock` |
| Compact secondary context | `Aside` |
| Important notes, constraints, risks | `Callout`, `Note`, `Tip`, `Warning`, `Danger`, `Check` |
| Long source context for agents only | `Visibility for="agents"` |

Use the dedicated section components for the canonical unit sections: `Scope`, `ImplementationNotes`, `Dependencies`, `Verification`, and `CompletionGate`. Each self-titles from its tag name and renders a consistent, scannable section header, so write `<Scope>...</Scope>` rather than a bare `## Scope` heading; pass `title="..."` only to override the default label. Do not dump long imported source bundles into visible paragraphs. Summarize visibly, then preserve the raw source/Q&A/handoff detail inside `Visibility for="agents"` so the rendered app stays readable while the Markdown derivative remains complete for agents.

Prefer `CodeBlock` over raw fenced code blocks for visible examples when a title, language label, copy affordance, or tabbed alternatives would help. For alternatives, compose `Tabs`/`Tab` with one `CodeBlock` per tab instead of dumping repeated fences. Use `CodeBlock language="diff"` for before/after changes; `+`/`-` lines render color-coded.

## Planning Composition Cookbook

Choose one primary composition pattern before writing a substantial plan. Do not use every component just because it exists.

### Feature Plan

Use for focused product, workflow, UI, runtime, or maintenance work.

- `PlanHero` with title, status, and one-sentence outcome.
- `PlanSummary` with status, shape, current unit, next action, blockers, and validation.
- `Scope` and `ImplementationNotes` section components; keep `Non-goals` as a plain `## Non-goals` section.
- `Flow` with `FlowStep` chips for the user or data flow when the feature has a pipeline shape.
- `Steps` for execution order when there is more than one unit; `StageTrack` with linked `StageItem` entries on staged plan indexes and stage pages.
- `TaskList` only for small concrete checklists that will be updated by humans or agents.
- `Verification` with acceptance checks and automated/manual commands.

### Architecture Comparison

Use when choosing between approaches.

- `CardGroup` with one `Card` per option, each naming the tradeoff plainly.
- `Evidence` for repo/source facts and confidence labels.
- A comparison table for decision criteria.
- `Decision` for the selected path, rationale, and consequences.
- `Aside` for constraints that matter but should not dominate the page.

```mdx
<CardGroup cols="3">
  <Card title="Candidate 1">
    Fastest path, smallest runtime change, known tradeoff.
  </Card>
  <Card title="Candidate 2">
    Stronger boundary, higher migration cost.
  </Card>
</CardGroup>
```

### API Or MCP Contract

Use for endpoints, Tauri commands, MCP tools/resources, generated schemas, or event payloads.

- `RequestExample` and `ResponseExample` for concrete examples.
- `ParamField` and `ResponseField` for required fields and response shape.
- `CodeBlock` for file snippets, schema/config examples, handler snippets, and API payloads.
- `CommandBlock` for exact local commands or manual command-line checks.
- `Verification` for contract tests and manual probes.

```mdx
<RequestExample title="Page Markdown">
  <CodeBlock language="http">GET /api/wiki/page-markdown?path=/wiki/plans/index.mdx</CodeBlock>
</RequestExample>

<ResponseExample title="Markdown response">
  <ResponseField name="markdown" type="string" required>
    Agent-readable Markdown derivative.
  </ResponseField>
</ResponseExample>
```

Use `Tabs` and `Tab` around multiple `CodeBlock` examples when the same contract needs alternate languages, files, or clients:

```mdx
<Tabs default="tsx">
  <Tab title="React" value="tsx">
    <CodeBlock title="Page.tsx" language="tsx">export default function Page() {
  return <main>Hello</main>
}</CodeBlock>
  </Tab>
  <Tab title="curl" value="curl">
    <CodeBlock title="Probe" language="bash">curl http://127.0.0.1:1421/api/wiki</CodeBlock>
  </Tab>
</Tabs>
```

### Implementation Unit

Use for executable unit pages.

- `PlanHero` and `PlanSummary` first.
- `Scope`, `ImplementationNotes`, `Dependencies`, and `CompletionGate` section components; keep Intent as a plain section or fold it into the `PlanHero` intent.
- `Evidence` only when the unit depends on source-grounded facts.
- `Verification` is mandatory before marking complete.
- Manual verification or completion gates must include exact user steps, commands/settings paths when known, expected success signals, and what to rerun afterward.

### Verification Handoff

Use for review, testing, release, or dogfood plans.

- `PlanSummary` with current evidence, gaps, and next check.
- `Columns` for automated checks vs manual checks.
- `CommandBlock` for exact local commands and `RequestExample` or `CodeBlock` for local API probes.
- `Update` entries for important verification events.

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

For pipelines and sequential flows, prefer `Flow`/`FlowStep` over hand-authored SVG:

```mdx
<Flow title="Import pipeline">
  <FlowStep label="Read sources" detail="wiki/sources/import.mdx" status="done" />
  <FlowStep label="Q&A interview" status="current" />
  <FlowStep label="Write MVP plan" detail="wiki/plans/mvp/" />
</Flow>
```

Inline SVG is for spatial or topology diagrams a linear flow cannot express. Author it theme-safe: `aria-label` is required, use `fill="none" stroke="currentColor"` on shapes and `fill="currentColor"` on text (never hard-coded colors), and keep it small:

```mdx
<svg viewBox="0 0 640 120" role="img" aria-label="Import flow from source to validation to commit">
  <rect x="20" y="35" width="140" height="50" rx="8" fill="none" stroke="currentColor" />
  <text x="90" y="65" text-anchor="middle" fill="currentColor" font-size="14">Source</text>
  <path d="M160 60 H250" stroke="currentColor" />
  <rect x="250" y="35" width="140" height="50" rx="8" fill="none" stroke="currentColor" />
  <text x="320" y="65" text-anchor="middle" fill="currentColor" font-size="14">Validate</text>
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
- no custom component imports outside the hyperwiki planning component registry unless target repo support was confirmed
- no inline scripts unless explicitly requested
- no stale references to generated standard `.html` wiki paths
- source-heavy claims have evidence or confidence labels
