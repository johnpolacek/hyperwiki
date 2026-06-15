import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

// Backend — feedback store + routes.
const feedbackRs = await readSources("src-tauri/src/domain/feedback.rs");
assert.ok(
  feedbackRs.includes('".hyperwiki/state/feedback"')
    && feedbackRs.includes("pub fn enqueue")
    && feedbackRs.includes("pub fn list")
    && feedbackRs.includes("pub fn mark_dispatched")
    && feedbackRs.includes("pub fn remove"),
  "feedback.rs should own the queue store (enqueue/list/mark_dispatched/remove).",
);

const modRs = await readSources("src-tauri/src/domain/mod.rs");
assert.ok(modRs.includes("pub mod feedback;"), "feedback module should be registered.");

const commandRs = await readSources("src-tauri/src/command.rs");
assert.ok(
  commandRs.includes('"/api/feedback/dispatch"') && commandRs.includes('"/api/feedback"'),
  "command.rs should expose the feedback enqueue/list/dispatch/delete routes.",
);
assert.ok(
  commandRs.indexOf('"/api/feedback/dispatch"') < commandRs.indexOf('"/api/feedback"'),
  "The dispatch route must be matched before the generic /api/feedback prefix.",
);

// Frontend — types, api helpers, dialog enqueue, queue view, drain, TopBar.
const ts = await readSources(
  "src/lib/types.ts",
  "src/lib/api.ts",
  "src/App.tsx",
  "src/components/views/UnitScreenshotReviewDialog.tsx",
  "src/components/views/FeedbackQueueView.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/layout/TopBar.tsx",
);

assert.ok(
  ts.includes("interface FeedbackItem") && ts.includes('{ kind: "feedback-queue" }'),
  "types.ts should define FeedbackItem and the feedback-queue route.",
);
assert.ok(
  ts.includes("export async function queueFeedback")
    && ts.includes("export async function fetchFeedback")
    && ts.includes("export async function dispatchFeedback")
    && ts.includes("export async function deleteFeedbackItem"),
  "api.ts should expose the feedback queue helpers.",
);
assert.ok(
  ts.includes("onQueueFeedback") && ts.includes("Add Feedback"),
  "The review dialog should enqueue via an 'Add Feedback' button, not report immediately.",
);
assert.ok(
  ts.includes("function dispatchUnitFeedback") && ts.includes("dispatchFeedback(items.map"),
  "App should drain a unit's queued feedback to the agent and mark it dispatched.",
);
assert.ok(
  ts.includes("Send Feedback (") && ts.includes("function sendScreenshotFeedback"),
  "With comments present, the dialog should offer 'Send Feedback' (enqueue + dispatch now) in place of Execute next unit.",
);
assert.ok(
  ts.includes("export function FeedbackQueueView") && ts.includes("<FeedbackQueueView"),
  "The feedback queue view should exist and be routed.",
);
assert.ok(
  ts.includes('onNavigate({ kind: "feedback-queue" })') && ts.includes("Feedback ("),
  "TopBar should offer a Feedback nav entry with a pending count.",
);

console.log("feedback queue static smoke passed");
