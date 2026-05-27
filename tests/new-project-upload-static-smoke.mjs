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

console.log("new project upload static smoke passed");
