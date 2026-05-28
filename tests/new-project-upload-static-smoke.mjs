import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");
const input = source.match(/<input[^>]+data-testid="project-file-input"[^>]+>/s)?.[0] || "";

assert.ok(input, "New Project file input should exist");
assert.ok(/\bmultiple\b/.test(input), "New Project file input should allow multiple files");
assert.ok(input.includes(".md"), "New Project file input should accept Markdown files");
assert.ok(input.includes(".html"), "New Project file input should accept HTML files");
assert.ok(input.includes(".txt") && input.includes("text/*"), "New Project file input should accept text files");
assert.ok(source.includes("sourceDocuments"), "New Project create payload should include sourceDocuments");
assert.ok(source.includes("startImportPlanningTurn(activeProject, \"answer\""), "Import Q&A answers should start a fresh agent turn");
assert.ok(source.includes("/api/import-planning/turn"), "Import Q&A turns should use the Codex app-server import endpoint");
assert.ok(source.includes("/api/import-planning/turn-status"), "Import Q&A should poll app-server turns without blocking the app shell");
assert.ok(!source.includes("forceNew: true, requestId"), "Import Q&A turns should not force fresh terminal sessions");
assert.ok(source.includes("model_reasoning_effort=\"low\""), "Import Q&A agent turns should force low thinking effort");
assert.ok(source.includes("wiki/sources/import-state.mdx"), "Import Q&A intermediate prompts should use compact planning state");
assert.ok(source.includes("emit one JSON object containing type \\\"hyperwiki-question\\\""), "Import Q&A prompts should ask one question at a time");
assert.ok(!source.includes("Planning answer probe saw MVP plan path"), "Import Q&A should not treat prompt text MVP paths as completion");
assert.ok(source.includes("planningQuestionOptionFromValue"), "Import Q&A should normalize structured option objects before rendering");
assert.ok(source.includes("option.description"), "Import Q&A should render option descriptions inside their parent choice");

console.log("new project upload static smoke passed");
