# Image-Gen Design Explorations

> hyperwiki feature plan — exported from `wiki/plans/features/image-gen-design-explorations.mdx`.

## Summary

| Field | Value |
| --- | --- |
| Status | planned |
| Shape | compact feature plan (to refine before execution) |
| Current unit | none |
| Next action | refine the open questions (esp. the gpt-image-2 API), then execute. |
| Blockers | confirm the exact gpt-image-2 model id / endpoint / params and cost guardrails. |
| Validation | none yet; this is a design artifact. |

## Intent

Before (or while) the Codex agent implements a unit's UI, generate candidate UI **mockup images** so the user can explore directions and pick one. This adds a visual ideation step ahead of implementation, then hands the chosen direction to Codex, which implements it; agent-browser then captures the real result into the existing screenshot review/gate. Image-gen = ideation, Codex = implementation, agent-browser = verification.

This mirrors the per-unit screenshot infrastructure (folder storage, carousel, review dialog, awaiting/review gate, feedback queue) so most of it is a straight reuse — the only genuinely new piece is the image-generation step.

## Storage

- A per-unit **explorations** folder: `.hyperwiki/state/explorations/<unit-path>/NN-*.png` (gitignored runtime), mirroring `screenshots.rs`.
- New `src-tauri/src/domain/explorations.rs` with dir-map + list + clear, reusing the `screenshot_dir_for_unit` traversal-guarded pattern; routes mirror `/api/unit-screenshots` (GET list, GET ?path, DELETE ?path).

## Generate (Codex via CLI)

- A new command/prompt **"Explore designs"** sent to the Codex agent for a unit.
- The agent synthesizes a design brief from the unit's `Intent` / `Scope` / `Screen Content` sections, then calls the OpenAI Images API (**gpt-image-2**) via CLI using the project's `OPENAI_API_KEY` (already in `.env.local`), saving **N** candidate mockups (default ~4) into the explorations folder as ordered PNGs.
- Open question — confirm the exact gpt-image-2 model id, endpoint, params, and per-image cost at build time. This is the one step that is not a straight mirror of existing code; verify the API shape rather than assuming.

## Review and pick

- Reuse `ScreenshotCarousel` + a review dialog (an "explorations" variant) to step through candidates and annotate.
- The user **picks a direction** (and may add notes).

## Hand to Codex

- A "Use this direction" action injects the chosen exploration into the Execute Unit prompt — the image reference plus the user's notes, and/or a short textual description of the picked design (Codex is text-first; decide image-vs-text handoff during refinement).
- Codex implements → agent-browser captures the real result → the existing screenshot review and advance-gate take over.

## Reuse vs new

**Reuse:** per-unit folder storage, the carousel, the review dialog, the awaiting/review gate and feedback-queue patterns, the agent-driven `previewCapture` conventions, and the clear-then-write lifecycle.

**New:** the explorations store + routes, the "Explore designs" command, and the gpt-image-2 CLI generation step.

## Open questions to refine

- Confirm the gpt-image-2 model id / endpoint / params / cost; add cost guardrails (max images per run).
- How many variants per run (default ~4) and mockup prompt-engineering for usable UI concepts.
- Whether Codex consumes the chosen *image* directly or a textual brief synthesized from it.
- Entry points: design-first (new unit) vs redesign of an existing unit.
- Surface: reuse the screenshot carousel/dialog vs a dedicated "Explorations" view.
- Whether explorations are agent-generated only, or hyperwiki could also offer a backend path later.
