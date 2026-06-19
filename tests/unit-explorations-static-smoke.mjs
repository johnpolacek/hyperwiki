import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

const explorationsRs = await readSources("src-tauri/src/domain/explorations.rs");
assert.ok(
  explorationsRs.includes('".hyperwiki/state/explorations"')
    && explorationsRs.includes("pub fn exploration_dir_for_unit")
    && explorationsRs.includes("pub fn read_unit_exploration_images")
    && explorationsRs.includes("pub fn list_unit_explorations")
    && explorationsRs.includes("pub fn select_unit_exploration"),
  "explorations.rs should own the per-unit design exploration storage, listing, metadata, and selection contract.",
);
assert.ok(
  explorationsRs.includes("metadata.json") && explorationsRs.includes("strip_prefix(\"unit-\").unwrap_or(leaf)"),
  "Exploration metadata and imported NN-slug unit folders should be supported.",
);

const modRs = await readSources("src-tauri/src/domain/mod.rs");
assert.ok(modRs.includes("pub mod explorations;"), "explorations module should be registered.");

const commandRs = await readSources("src-tauri/src/command.rs");
assert.ok(
  commandRs.includes('"/api/unit-explorations/metadata"')
    && commandRs.includes('"/api/unit-explorations/select"')
    && commandRs.includes('"/api/unit-explorations"'),
  "command.rs should expose exploration metadata, selection, and image list routes.",
);
assert.ok(
  commandRs.indexOf('"/api/unit-explorations/metadata"') < commandRs.indexOf('"/api/unit-explorations"')
    && commandRs.indexOf('"/api/unit-explorations/select"') < commandRs.indexOf('"/api/unit-explorations"'),
  "Specific exploration routes must be matched before the generic /api/unit-explorations prefix.",
);

const ts = await readSources(
  "src/lib/types.ts",
  "src/lib/api.ts",
  "src/lib/wiki-pages.ts",
  "src/App.tsx",
  "src/components/MdxPlanRenderer.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/views/UnitDesignExplorationDialog.tsx",
);

assert.ok(
  ts.includes('export const unitExplorationsRoot = ".hyperwiki/state/explorations"')
    && ts.includes("export function unitExplorationDir"),
  "Frontend path helpers should mirror the backend exploration directory contract.",
);
assert.ok(
  ts.includes("export interface UnitExplorationMetadata")
    && ts.includes("export async function fetchUnitExplorationImages")
    && ts.includes("export async function writeUnitExplorationMetadata")
    && ts.includes("export async function selectUnitExploration"),
  "Frontend should expose typed exploration metadata, image fetch, metadata write, and selection helpers.",
);
assert.ok(
  ts.includes("export function UnitDesignExplorationDialog")
    && ts.includes("redesign-from-screenshot")
    && ts.includes("ToggleGroup")
    && ts.includes("1 candidate")
    && ts.includes("4 candidates"),
  "The design exploration dialog should support mode selection and a 1-4 candidate control.",
);
assert.ok(
  ts.includes('data-unit-visual-evidence="true"')
    && ts.includes("onExploreDesigns")
    && ts.includes("Review Screenshots")
    && ts.includes("Explore Design")
    && ts.includes("<span className=\"text-sm font-semibold\">Design</span>")
    && ts.includes("No screenshots captured yet"),
  "Unit pages should expose design exploration from the unified design card topbar.",
);
assert.ok(
  !ts.includes('data-unit-explorations-section="true"') && !ts.includes("visualEvidenceSummary"),
  "Design exploration should open in its dialog, not render as a second inline section or timestamp summary.",
);
assert.ok(
  !ts.includes('data-unit-explorations="true"') && !ts.includes('data-unit-screenshot="true"'),
  "Design explorations and screenshots should not render as separate top-level unit cards.",
);
assert.ok(
  ts.includes("Mode: Image-Gen Design Exploration.")
    && ts.includes("Use the imagegen skill")
    && ts.includes("do not implement product code")
    && ts.includes("metadata.json"),
  "The generation prompt should route image creation through the agent/imagegen path and avoid implementation work.",
);
assert.ok(
  ts.includes("Selected design exploration:")
    && ts.includes("Candidate image:")
    && ts.includes("Execute Unit will include it"),
  "Selected candidates should be persisted and included in future Execute Unit prompts.",
);
assert.ok(
  ts.includes('"exploration"') && ts.includes("setExplorationRefreshKey((value) => value + 1)"),
  "Exploration agent runs should be tracked separately and refresh unit exploration state.",
);

console.log("unit explorations static smoke passed");
