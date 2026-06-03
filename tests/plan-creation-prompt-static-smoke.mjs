import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");
const start = source.indexOf("function planCreationPrompt");
const end = source.indexOf("function workflowPrompt", start);
assert.notEqual(start, -1, "planCreationPrompt should exist");
assert.notEqual(end, -1, "workflowPrompt should follow planCreationPrompt");

const promptSource = source.slice(start, end);

const blankIntentHeading = promptSource.indexOf("Immediate blank-intent handling:");
const noIntentLine = promptSource.indexOf("- No initial user intent was provided.");
const askFocusLine = promptSource.indexOf("Your first response must ask one focused terminal question");
const noExplorationLine = promptSource.indexOf("Do not inspect the repo, read wiki files, run commands");
const readWikiLine = promptSource.indexOf("read wiki/index.mdx and wiki/plans/index.mdx first");

assert.ok(blankIntentHeading !== -1, "blank-intent prompt should have an immediate handling section");
assert.ok(noIntentLine > blankIntentHeading, "blank-intent prompt should say no initial intent was provided");
assert.ok(askFocusLine > noIntentLine, "blank-intent prompt should ask for planning focus first");
assert.ok(noExplorationLine > askFocusLine, "blank-intent prompt should block repo exploration before the first answer");
assert.ok(readWikiLine > noExplorationLine, "wiki-reading guidance should come after the blank-intent first-question guard");
assert.ok(
  promptSource.includes("except for the initial planning-focus question when the initial user intent is blank"),
  "repo-evidence guidance should preserve the blank-intent exception",
);
assert.ok(
  promptSource.includes("do not do any repo or wiki exploration before that first answer"),
  "blank initial user intent should explicitly forbid pre-question exploration",
);

console.log("plan creation prompt static smoke passed");
