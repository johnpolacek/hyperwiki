import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");
const input = source.match(/<input[^>]+data-testid="project-file-input"[^>]+>/s)?.[0] || "";

assert.ok(input, "New Project file input should exist");
assert.ok(/\bmultiple\b/.test(input), "New Project file input should allow multiple files");
assert.ok(input.includes(".mdx"), "New Project file input should accept MDX files");
assert.ok(source.includes("sourceDocuments"), "New Project create payload should include sourceDocuments");

console.log("new project upload static smoke passed");
