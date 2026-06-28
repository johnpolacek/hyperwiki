# Plan Page Skeletons

Start from the skeleton that matches the page you are writing, then replace the content. These are complete, valid hyperwiki plan MDX pages. Keep the component structure; do not regress to bare `<section>` + heading + list prose. A substantial plan page with zero hyperwiki plan components fails the quality bar and hyperwiki validation.

Shared rules:

- Every plan page opens with `PlanHero` (title, status, one-sentence intent) followed by `PlanSummary`.
- `PlanSummary` children are a plain list of `- Label: value` items; hyperwiki renders them as a definition grid.
- `Flow`/`FlowStep` for pipelines and user/data flows. `StageTrack`/`StageItem` for stage or unit progress with links. Both are attribute-only: `label`, optional `detail`, `status` (`done`, `current`, `blocked`, `planned`), and `href` on `StageItem`.
- `status`/`severity` on `Card` adds a colored edge and badge (`recommended`, `current`, `blocked`, `high`, ...). `cols="2"`/`cols="3"` on `CardGroup` makes a comparison grid; omit `cols` for full-width stacked cards.
- `CodeBlock language="diff"` gets colored `+`/`-` lines; lines starting with `# ` render as margin-note annotations.
- Inline SVG renders on plan pages: author with `currentColor`/no fill colors so it themes, keep it small, and always set `aria-label`.
- `StageItem href` links are live: the app overrides the written `status` with the linked page's actual status, so the track stays truthful as units complete.
- Unresolved questions go in `<OpenDecision title="..." detail="...">` with `<DecisionOption label="..." detail="..." recommended />` children — the app renders options as buttons that start a modify-plan agent turn.
- Human checklists go in `<TaskList title="..."><ul><li>[ ] step</li></ul></TaskList>` — the app renders live checkboxes that persist back to the file. `CommandBlock` gets a send-to-terminal affordance, so put exact runnable commands there.

## 1. Feature Plan Leaf (`wiki/plans/features/<slug>.mdx`)

```mdx
---
title: "Invoice Export"
description: "hyperwiki plan page."
wikiKind: "plan"
---

<PlanHero title="Invoice Export" status="active" description="Let users export filtered invoices as CSV from the billing screen." />

<PlanSummary>
  - Status: active
  - Shape: compact feature plan
  - Current unit: export endpoint
  - Next action: implement CSV serializer
  - Blockers: none
  - Validation: manual download check plus serializer unit test
</PlanSummary>

<Scope>

- Billing screen export button, CSV only.
- Respect the active date and customer filters.

</Scope>

## Non-goals

- PDF export, scheduled exports, email delivery.

<Flow title="Export flow">
  <FlowStep label="Billing screen" detail="filters applied" status="done" />
  <FlowStep label="GET /api/invoices/export" status="current" />
  <FlowStep label="CSV stream" detail="content-disposition download" />
</Flow>

<ImplementationNotes>

- Reuse the invoice query in `src/lib/invoices.ts`; add a `format=csv` branch to the existing route.

</ImplementationNotes>

<Verification>
  <CommandBlock>pnpm test invoices</CommandBlock>
  - Manual: open Billing, set a date filter, click Export, confirm the CSV contains only filtered rows.
</Verification>

<CompletionGate>

- Serializer test passes and the manual download check above is recorded in `wiki/log.mdx`.

</CompletionGate>
```

## 2. Staged Plan Index (`wiki/plans/<slug>/index.mdx`)

```mdx
---
title: "Realtime Sync"
description: "hyperwiki plan page."
wikiKind: "plan"
---

<PlanHero title="Realtime Sync" status="active" description="Replace polling with a websocket sync channel across three stages." />

<PlanSummary>
  - Status: active
  - Shape: staged plan, 3 stages
  - Current stage: stage 01 transport
  - Next action: execute unit 02 reconnect handling
  - Blockers: none
  - Validation: per-stage verification gates below
</PlanSummary>

<StageTrack title="Stages">
  <StageItem label="Stage 01 — Transport" status="current" detail="1 of 2 units complete" href="./stage-01-transport.mdx" />
  <StageItem label="Stage 02 — Conflict resolution" status="planned" href="./stage-02-conflicts.mdx" />
  <StageItem label="Stage 03 — Rollout" status="planned" href="./stage-03-rollout.mdx" />
</StageTrack>

<Decision title="Websocket over SSE">
  SSE cannot carry client acks; websockets keep one bidirectional channel. Consequence: needs reconnect/backoff handling in stage 01.
</Decision>

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Proxy strips upgrade headers | high | document required proxy config in stage 03 |
| Message ordering under reconnect | medium | sequence numbers, covered in stage 02 |
```

## 3. Stage Page (`wiki/plans/<slug>/stage-XX-<name>.mdx`)

```mdx
---
title: "Stage 01 — Transport"
description: "hyperwiki plan page."
wikiKind: "plan"
---

<PlanHero title="Stage 01 — Transport" status="current" description="Stand up the websocket channel with reconnect handling." />

<PlanSummary>
  - Status: current
  - Plan: [Realtime Sync](./index.mdx)
  - Current unit: Unit 02 — Reconnect and backoff
  - Next action: implement backoff in the socket client
  - Blockers: none
  - Validation: per-unit verification below; stage completion gate covers the drop/reconnect check
</PlanSummary>

## Stage Goal

A client can hold a websocket session that survives server restarts and network drops.

<StageTrack title="Unit sequence">
  <StageItem label="Unit 01 — Socket server and handshake" status="done" href="./stage-01-transport/unit-01-socket-server.mdx" />
  <StageItem label="Unit 02 — Reconnect and backoff" status="current" href="./stage-01-transport/unit-02-reconnect.mdx" />
</StageTrack>

<Dependencies>
  Requires the auth token refresh endpoint from the platform plan; blocked units must not start before it ships.
</Dependencies>

<CompletionGate title="Completion gate">
  Both units verified, reconnect demo recorded in `wiki/log.mdx`, and stage 02 unblocked only after a reviewer confirms the drop/reconnect manual check.
</CompletionGate>
```

## 4. Unit Page (`wiki/plans/<slug>/stage-XX-<name>/unit-YY-<name>.mdx`)

```mdx
---
title: "Unit 02 — Reconnect and Backoff"
description: "hyperwiki plan page."
wikiKind: "plan"
---

<PlanHero title="Unit 02 — Reconnect and Backoff" status="current" description="Client reconnects with jittered backoff and resumes from the last acked sequence." />

<PlanSummary>
  - Status: current
  - Stage: [Stage 01 — Transport](../stage-01-transport.mdx)
  - Next action: implement backoff in the socket client
  - Blockers: none
  - Validation: automated reconnect test plus manual network-drop check
</PlanSummary>

## Intent

Drops and restarts must not lose messages or duplicate handlers.

<Scope>

- `src/lib/socket-client.ts` only; server handshake is unit 01.

</Scope>

<ImplementationNotes>

<CodeBlock title="src/lib/socket-client.ts" language="ts">
const delay = Math.min(30_000, base * 2 ** attempt) + jitter()
</CodeBlock>

- Resume with `?since=<lastAckedSeq>`; the server replays from its ring buffer.

</ImplementationNotes>

<Dependencies>

- Unit 01 socket server must be merged.

</Dependencies>

<Verification title="Verification">
  <CommandBlock>pnpm test socket-client</CommandBlock>
  - Manual: run `pnpm dev`, open the app, kill the dev server, restart it, and confirm the client reconnects within 30s and no duplicate messages render. Record the result in `wiki/log.mdx`.
</Verification>

<CompletionGate title="Completion gate">
  The user performs the manual network-drop check; unit 03 stays blocked until the success signal (reconnect under 30s, zero duplicates) is recorded.
</CompletionGate>

## Screen content & layout

Shared frame. Header is the live status panel's title bar; no nav changes. A conditional alert sits above the panel body and shows the last socket error without clearing connection history.

<Screen name="Connection panel" route="/dashboard">

Purpose. Show the current socket state and recent reconnect history.

<Mockup title="Connection panel">

```
┌─ Connection ───────────────────────┐
│ ● Connected        last ack: #1842  │
│ Reconnects                          │
│  • 14:02  recovered in 3.1s         │
│  • 13:40  recovered in 0.9s         │
└─────────────────────────────────────┘
```

</Mockup>

- Heading. "Connection"; subhead "Live sync status".
- Layout (top → bottom): (1) status pill — "Connected" / "Reconnecting…" / "Offline"; (2) last-acked sequence line; (3) reconnect history list (one row per drop, newest first), empty state "No reconnects yet".
- States. Connected (green pill, history may be empty), Reconnecting (amber pill, spinner), Offline (red pill, "Retrying in Ns").
- Backed by. The socket client's connection store; no user-committed mutation — the panel is read-only and updates from socket events.

</Screen>
```

Add a `## Screen content & layout` section to any unit that creates or changes screens: one `<Screen>` per screen (with `route`/`step`/`progress` when relevant), an optional `<Mockup>` ASCII wireframe, then the screen's purpose, canonical copy, top-to-bottom layout, states, and the action each control commits. Describe the shared frame once above the screens. Omit the whole section for non-UI units. See the **UI Units** section of `planning-contract.md`.

Add the optional `## Screenshot capture` section only to units with a browser-observable result. The execute agent reads it to know what to shoot and how to reach the state; it signs in (when auth is required) using the project's `previewCapture` profile in `.hyperwiki/config.json`. Omit it for non-UI units.

## 5. Architecture Comparison (inside any plan page)

```mdx
<CardGroup cols="3">
  <Card title="Websockets" status="recommended">
    Bidirectional, one channel, needs reconnect handling.
  </Card>
  <Card title="SSE + POST">
    Simpler infra; acks need a second channel.
  </Card>
  <Card title="Long polling" status="rejected">
    Works everywhere; highest latency and server load.
  </Card>
</CardGroup>

| Criteria | Websockets | SSE + POST | Long polling |
| --- | --- | --- | --- |
| Latency | low | low | high |
| Infra changes | proxy upgrade config | none | none |
| Client acks | native | second channel | native |

<Evidence title="Repo evidence">
  `src/server/http.ts` already terminates TLS in-process (confirmed from repo, high confidence), so websocket upgrades need no new infra locally.
</Evidence>

<Decision title="Selected: websockets">
  Acks and presence need bidirectional flow; reconnect cost is contained in one unit.
</Decision>

<svg viewBox="0 0 560 110" role="img" aria-label="Client connects to socket server which fans out to subscribers">
  <rect x="10" y="35" width="140" height="44" rx="8" fill="none" stroke="currentColor" />
  <text x="80" y="62" text-anchor="middle" fill="currentColor" font-size="14">Client</text>
  <path d="M150 57 H230" stroke="currentColor" />
  <rect x="230" y="35" width="150" height="44" rx="8" fill="none" stroke="currentColor" />
  <text x="305" y="62" text-anchor="middle" fill="currentColor" font-size="14">Socket server</text>
  <path d="M380 57 H460" stroke="currentColor" />
  <rect x="460" y="35" width="90" height="44" rx="8" fill="none" stroke="currentColor" />
  <text x="505" y="62" text-anchor="middle" fill="currentColor" font-size="14">Subs</text>
</svg>
```

## 6. Lifecycle Root (`wiki/plans/lifecycle/index.mdx`)

The canonical 6-phase product lifecycle spine. Seeded by the runtime; see `references/lifecycle-contract.md`. The root is a `StageTrack` of the six phases linking to phase pages.

```mdx
---
title: "Product Lifecycle"
description: "hyperwiki plan page."
wikiKind: "plan"
status: "active"
---

<PlanHero title="Product Lifecycle" status="active" description="The canonical 6-phase path from purpose to shipped MVP views." />

<PlanSummary>
  - Status: active
  - Shape: lifecycle plan, 6 phases
  - Current phase: Phase 1 — Purpose & User Stories
  - Next action: hand off to the Purpose agent (or Ask the Orchestrator)
  - Blockers: none
  - Validation: each phase clears its gate before the next begins
</PlanSummary>

<StageTrack title="Phases">
  <StageItem label="Phase 1 — Purpose & User Stories" status="current" href="./phase-01-purpose.mdx" />
  <StageItem label="Phase 2 — Design System" status="planned" href="./phase-02-design-system.mdx" />
  <StageItem label="Phase 3 — UI Mocks" status="planned" href="./phase-03-ui-mocks.mdx" />
  <StageItem label="Phase 4 — Backend Architecture" status="planned" href="./phase-04-backend-arch.mdx" />
  <StageItem label="Phase 5 — Onboarding" status="planned" href="./phase-05-onboarding.mdx" />
  <StageItem label="Phase 6 — MVP Views" status="planned" href="./phase-06-mvp-views.mdx" />
</StageTrack>
```

## 7. Lifecycle Phase (`wiki/plans/lifecycle/phase-NN-<id>.mdx`)

One stage page per phase. The frontmatter contract (`phaseId`/`phaseOrder`/`childPlan`/`gate`) is load-bearing — keep it in lockstep with the descriptor in `src/lib/lifecycle.ts`.

```mdx
---
title: "Phase 2 — Design System"
description: "hyperwiki plan page."
wikiKind: "plan"
status: "planned"
phaseId: "design-system"
phaseOrder: 2
childPlan: "/wiki/plans/design-system/index.mdx"
gate: "childPlan"
---

<PlanHero title="Phase 2 — Design System" status="planned" description="Establish design tokens, then a customized shadcn/ui layer built on them." />

<PlanSummary>
  - Status: planned
  - Lifecycle: [Product Lifecycle](./index.mdx)
  - Sub-agent: Design System (execute archetype)
  - Skills: tailwind-design-system, shadcn
  - Sub-plan: /wiki/plans/design-system/
  - Gate: childPlan
</PlanSummary>

## Phase goal

Tokens first (color, spacing, type, radius, dark mode), then a customized shadcn/ui component set consuming them.

## Entry gate

Phase 1 cleared.

## Sub-agent contract

- Skills: load tailwind-design-system then shadcn before changing tokens or components.
- Produces: design tokens, a customized shadcn/ui layer, and the `/wiki/plans/design-system/` sub-plan.

<CompletionGate title="Completion gate">
  The phase page is `complete` and `/wiki/plans/design-system/index.mdx` is `complete`. Then the next phase activates.
</CompletionGate>
```
