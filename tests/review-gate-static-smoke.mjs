import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

// Backend — persisted reviewed-state store + routes.
const reviewsRs = await readSources("src-tauri/src/domain/screenshot_reviews.rs");
assert.ok(
  reviewsRs.includes('".hyperwiki/state/screenshot-reviews.json"')
    && reviewsRs.includes("pub fn mark_reviewed")
    && reviewsRs.includes("pub fn reviewed"),
  "screenshot_reviews.rs should persist the reviewed map (mark_reviewed/reviewed).",
);

const modRs = await readSources("src-tauri/src/domain/mod.rs");
assert.ok(modRs.includes("pub mod screenshot_reviews;"), "screenshot_reviews module should be registered.");

const commandRs = await readSources("src-tauri/src/command.rs");
assert.ok(
  commandRs.includes('"/api/screenshot-reviews"') && commandRs.includes("mark_reviewed(&project_root"),
  "command.rs should expose GET/POST /api/screenshot-reviews.",
);

// Frontend — api helpers, awaiting-review derivation, the execute gate, dialog marks.
const ts = await readSources(
  "src/lib/api.ts",
  "src/App.tsx",
  "src/components/views/UnitScreenshotReviewDialog.tsx",
);

assert.ok(
  ts.includes("export async function markScreenshotReviewed") && ts.includes("export async function fetchScreenshotReviews"),
  "api.ts should expose mark/fetch screenshot-review helpers.",
);
assert.ok(
  ts.includes("awaitingReviewUnits") && ts.includes("shot.capturedAt > (reviews[shot.unitPath] ?? 0)"),
  "App should derive the awaiting-review set from screenshots vs reviewed marks.",
);
assert.ok(
  ts.includes("skipReviewGate") && ts.includes("await openScreenshotReviewManual(awaitingReviewUnits[0])"),
  "execute-main should gate on awaiting review and auto-open the review dialog when blocked.",
);
assert.ok(
  ts.includes("function markReviewed") && ts.includes("function reviewScreenshotsReviewed"),
  "App should mark a unit reviewed on approve/close.",
);
assert.ok(
  ts.includes("Looks good") && ts.includes("onClick={onClose}"),
  "The review dialog should offer 'Looks good' and treat close as reviewed.",
);

console.log("review gate static smoke passed");
