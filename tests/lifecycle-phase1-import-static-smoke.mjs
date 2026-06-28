// Phase 1 (Purpose) must reuse the existing import-planning interview for imported
// projects rather than spawning a new one. Static check over the App.tsx dispatch.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/App.tsx", "utf8");

const caseStart = source.indexOf('action === "lifecycle-phase"');
assert.notEqual(caseStart, -1, "lifecycle-phase dispatch case should exist");
const caseEnd = source.indexOf("} catch (error)", caseStart);
const block = source.slice(caseStart, caseEnd);

assert.ok(
  block.includes('phase.phaseId === "purpose"'),
  "Phase 1 import routing should be gated on the purpose phase",
);
assert.ok(
  block.includes('importStatus === "incomplete"') && block.includes('importStatus === "needsRepair"'),
  "should detect an imported project still in planning",
);
assert.ok(
  block.includes("startTerminalImportPlanning(activeProject"),
  "should resume the existing import-planning interview, not a new one",
);
assert.ok(
  /startTerminalImportPlanning\(activeProject,\s*"resume"\)/.test(block),
  "should call the interview with the resume reason",
);
// Guard against a parallel interview being created from the lifecycle path.
assert.ok(
  !block.includes("terminalImportPlanningPrompt("),
  "Phase 1 must not build a new interview prompt inline",
);

console.log("lifecycle-phase1-import-static-smoke: ok");
