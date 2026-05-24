# HTML Artifact Patterns

Use this reference before creating or materially updating generated `wiki/**/*.html` artifacts. The goal is to make each page a purpose-built, well-designed artifact, not a generic document with nicer styling.

## Design Quality Bar

Every substantial HTML artifact must pass a design bar before handoff:

- Define a named visual concept such as `operator command center`, `editorial field report`, `migration control room`, `architecture blueprint`, or another direction specific to the project's domain.
- Make the first viewport useful and memorable: it should communicate state, priority, and navigation without feeling like a README rendered in HTML.
- Use a deliberate composition, not the same repeated card grid on every page. Mix dashboards, split panes, status rails, timelines, evidence matrices, diagrams, anchored navigation, or working controls based on the artifact pattern.
- Choose typography, color, spacing, borders, shadows, and status treatments intentionally. Avoid default system-font/plain-white-card output unless the concept explicitly calls for severe minimalism and the details are still refined.
- Include at least one artifact-specific visual structure when the content supports it: SVG flow, execution track, evidence matrix, status map, roadmap rail, decision board, annotated snippet, compact chart, or state preview.
- Use domain language and visual metaphors sparingly but concretely. An internal finance tool should feel operational and scannable; a design system brief may feel more editorial; an architecture report may feel like a blueprint.
- Check narrow and desktop viewports. Text must not overlap, clip, or force awkward horizontal scrolling unless the page intentionally includes a scrollable code/table surface with visible affordance.

If a generated page looks plain, boring, or interchangeable with any other project wiki, revise it before handoff.

## Artifact Pattern Selector

Before writing HTML, classify the artifact into one primary pattern. Use a hybrid only when the reader goal truly needs it.

| Pattern | Use When | Required Structures |
| --- | --- | --- |
| Planning/exploration | Comparing directions, choosing implementation shape, planning a feature, or exploring tradeoffs. | Option grid, tradeoff cards, data-flow SVG, mockup or state sketch, decision callout, next-unit checklist. |
| Code review/explainer | Explaining a PR, diff, subsystem, migration, bug, or risky implementation. | Read-this-first path, annotated diff or snippets, severity bands, module/call-flow SVG, findings table, review checklist. |
| Report/research | Summarizing investigation, repo history, incident context, system behavior, or leadership/team status. | Executive summary, evidence matrix, charts or tables, timeline, confidence badges, recommendations, open questions. |
| Design/prototype | Exploring UI direction, component states, animation, interaction, or visual system options. | State previews, adjustable controls, animation knobs when relevant, copyable chosen settings, responsive preview notes. |
| Custom editor | Reordering, tuning, tagging, selecting, validating, or editing structured information. | Form or drag/drop UI, live validation, dependency warnings, preview pane, copy as JSON/prompt/diff/export text. |

Do not default to the same card grid for every pattern. Let the pattern determine information architecture, density, controls, visual motif, and first viewport.

## Reader Goal

Every generated HTML page must define a reader goal before layout decisions:

> After 2 minutes, the reader should be able to [decide/understand/compare/review/export] [specific thing].

Put the goal near the top of the page as a compact `Reader Goal` or `Read This First` panel unless the page is a custom editor where the first viewport is the working interface. Use the goal to decide:

- which information appears in the first viewport
- whether the page needs navigation, tabs, filters, or copy/export controls
- which diagrams or tables replace prose
- what can be deferred to lower sections

Pair the reader goal with the visual concept. The goal decides what the reader needs; the concept decides how the page should feel and how information should be composed.

## No Long Prose Rule

Avoid long prose blocks in HTML artifacts. If a section grows beyond a short paragraph, transform it into a visual structure:

- evidence, assumptions, or sources -> table or evidence matrix
- system behavior, workflow, or architecture -> inline SVG diagram
- alternatives -> comparison grid or tradeoff cards
- implementation sequence -> timeline or numbered execution track
- risks, blockers, unknowns -> callout panels with severity/status
- code-heavy explanation -> annotated code blocks with file paths and margin notes
- decisions -> decision panel with selected option, rationale, and consequences

Use prose to connect ideas, not to carry the whole artifact.

## Copy And Export Controls

When the artifact is interactive, decision-oriented, or meant to feed a future agent prompt, include a copy/export affordance. Keep JavaScript inline and small.

Good outputs:

- copy selected option as prompt
- copy implementation checklist
- copy PR summary
- copy config diff
- copy JSON
- copy changed keys
- copy final ordering
- copy chosen animation/design parameters

Use a visible button with clear success feedback such as changing its label to `Copied` briefly. If clipboard access may fail from `file://`, include a fallback readonly `<textarea>` with the generated export text.

## Visual QA Checklist

Before handoff, inspect the generated HTML when feasible. For richer pages, open it in a browser or use screenshot/browser QA.

Required checks:

- no bracketed placeholder leakage except intentional `Unknown`
- mobile-readable layout at narrow widths
- no incoherent text or UI overlap
- readable contrast for text, badges, diagrams, and code
- clear visual concept visible in the first viewport
- no default-looking plain document styling unless explicitly justified
- useful first viewport that states the reader goal or exposes the working interface
- all internal links are relative and valid where practical to check
- inline SVG diagrams render without clipping
- interactive controls work without a build step
- copy/export controls provide a usable output or fallback
- print/share view remains readable enough for review

If browser preview is not feasible, state that in the handoff and perform static checks for links, placeholders, viewport meta, and obvious layout risks.

## Code Snippet Treatment

For code-heavy artifacts, use code-specific layout instead of plain `<pre>` dumps:

- show file path and line references above each snippet
- use syntax-like visual styling even without a highlighter
- highlight important lines with a class such as `.hotline`
- place margin annotations or adjacent notes near the relevant lines
- explain why the snippet matters next to the code, not in a distant paragraph
- keep snippets short; link to files or summarize omitted sections

Recommended structure:

```html
<figure class="code-note">
  <figcaption><code>src/stream/backpressure.ts:42</code> <span class="badge risk-high">High risk</span></figcaption>
  <pre><code><mark>await writer.ready</mark>
writer.write(chunk)</code></pre>
  <aside>Why this matters: backpressure is awaited before each write, so moving this call can change memory behavior.</aside>
</figure>
```

## Evidence And Confidence UI

Source-heavy artifacts should show where claims came from and how certain they are. Use badges or table columns consistently:

- `confirmed from repo`
- `confirmed from source doc`
- `inferred from prompt`
- `unknown`
- `contradicted`
- `needs decision`

Use confidence labels (`high`, `medium`, `low`) for briefs, reports, and plans when future agents may otherwise over-trust inferred context. Contradictions should be visually distinct and should name the conflicting sources.

## HTML Style System

Every substantial artifact should define a small local style system in CSS variables. Keep it page-scoped and dependency-free.

Include variables for:

- color roles: background, surface, text, muted text, border, accent
- status colors: success, warning, danger, info, unknown
- spacing scale: small, medium, large, section gap
- typography scale: display, heading, body, small, code
- radius, border, shadow, focus ring
- diagram colors when SVG is used

Do not rely on default browser styles. Avoid generic font/color defaults, one-note palettes, and interchangeable layouts. Use `$frontend-design` when available to choose a deliberate visual direction that fits the artifact.

Recommended local CSS primitives:

- `.hero`, `.command-bar`, `.status-rail`, `.evidence-matrix`, `.timeline`, `.flow-map`, `.decision-panel`, `.reader-goal`, `.metric-strip`, or similarly semantic classes that match the artifact.
- Responsive grid tracks with `minmax()` and explicit mobile fallbacks.
- Typography scales and accent treatments that make scan order obvious.
- Focus, hover, and active states for links and controls.
- Print-aware or reduced-motion-safe styles when motion or rich backgrounds are used.

## Use-Case Examples

These examples are abbreviated patterns, not full templates. Use the full HTML artifact standard from `generated-baseline-artifacts.md` around them.

### Feature Plan With SVG Data Flow

```html
<section class="reader-goal">
  <h2>Reader Goal</h2>
  <p>After 2 minutes, the reader can decide whether the import pipeline plan is ready for Unit 01 implementation.</p>
</section>
<section class="plan-hero">
  <div><span class="badge status-active">Active</span><h1>CSV Import Pipeline</h1></div>
  <dl><dt>Current unit</dt><dd>Validate upload and preview rows</dd><dt>Blocker</dt><dd>Confirm max file size</dd></dl>
</section>
<section class="flow">
  <h2>Data Flow</h2>
  <svg viewBox="0 0 760 180" role="img" aria-label="CSV import flow from upload to validation to preview to commit">
    <rect x="20" y="55" width="130" height="70" rx="8"></rect><text x="85" y="95" text-anchor="middle">Upload</text>
    <path d="M150 90 H250"></path>
    <rect x="250" y="55" width="130" height="70" rx="8"></rect><text x="315" y="95" text-anchor="middle">Validate</text>
    <path d="M380 90 H480"></path>
    <rect x="480" y="55" width="130" height="70" rx="8"></rect><text x="545" y="95" text-anchor="middle">Preview</text>
    <path d="M610 90 H720"></path>
  </svg>
</section>
<section class="execution-track">
  <h2>Execution Units</h2>
  <ol><li><strong>Unit 01</strong> Upload validation and preview.</li><li><strong>Unit 02</strong> Commit accepted rows with audit log.</li></ol>
</section>
```

### PR Explainer With Annotated Diff

```html
<section class="read-first">
  <h2>Read This First</h2>
  <p>The review should focus on backpressure behavior and retry semantics. UI changes are mechanical.</p>
</section>
<section class="findings">
  <article class="finding high"><span class="severity">High</span><p>Moving the await below write may buffer unbounded chunks under slow clients.</p></article>
</section>
<figure class="diff-note">
  <figcaption><code>src/stream/send.ts:88</code> <span class="badge confirmed">confirmed from diff</span></figcaption>
  <pre><code><span class="del">- await writer.ready</span>
<span class="add">+ writer.write(chunk)</span>
<span class="add hotline">+ await writer.ready</span></code></pre>
  <aside>Why this matters: readiness is now checked after writing, so memory pressure can rise before backpressure applies.</aside>
</figure>
```

### Research Report With Evidence Table

```html
<section class="executive-summary">
  <h1>Rate Limiter Research</h1>
  <p>After 2 minutes, the reader can explain which quota path is authoritative and which behavior still needs verification.</p>
</section>
<table class="evidence-matrix">
  <thead><tr><th>Claim</th><th>Evidence</th><th>Confidence</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>Token bucket resets per workspace.</td><td><code>services/rate-limit.ts:42</code></td><td>High</td><td><span class="badge repo">confirmed from repo</span></td></tr>
    <tr><td>Burst limit applies to API imports.</td><td>Not visible in current routes.</td><td>Low</td><td><span class="badge decision">needs decision</span></td></tr>
  </tbody>
</table>
<section class="timeline"><h2>Implementation Timeline</h2><ol><li>2026-04-12: Added workspace quota.</li><li>2026-04-20: Split API and UI limiters.</li></ol></section>
```

### Custom Prompt Or Config Editor With Copy Button

```html
<section class="workspace">
  <label for="prompt">Prompt Template</label>
  <textarea id="prompt">Write a release note for {{feature}} aimed at {{audience}}.</textarea>
  <label for="feature">Feature</label>
  <input id="feature" value="CSV import">
  <label for="audience">Audience</label>
  <input id="audience" value="finance operators">
  <output id="preview"></output>
  <button id="copyPrompt" type="button">Copy filled prompt</button>
  <textarea id="fallback" readonly hidden></textarea>
</section>
<script>
  const promptBox = document.querySelector('#prompt');
  const feature = document.querySelector('#feature');
  const audience = document.querySelector('#audience');
  const preview = document.querySelector('#preview');
  const fallback = document.querySelector('#fallback');
  function render() {
    preview.value = promptBox.value.replace('{{feature}}', feature.value).replace('{{audience}}', audience.value);
  }
  document.querySelectorAll('textarea,input').forEach((el) => el.addEventListener('input', render));
  document.querySelector('#copyPrompt').addEventListener('click', async (event) => {
    render();
    try { await navigator.clipboard.writeText(preview.value); event.target.textContent = 'Copied'; }
    catch { fallback.hidden = false; fallback.value = preview.value; fallback.select(); }
  });
  render();
</script>
```
