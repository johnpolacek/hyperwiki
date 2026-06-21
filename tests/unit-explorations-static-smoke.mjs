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
  explorationsRs.includes("metadata.json")
    && explorationsRs.includes("messages.json")
    && explorationsRs.includes("pub fn read_unit_design_messages")
    && explorationsRs.includes("pub fn append_unit_design_message")
    && explorationsRs.includes("design_messages_reject_traversal_paths"),
  "Exploration metadata and per-unit design chat messages should live beside candidate PNGs with traversal-safe helpers.",
);

const modRs = await readSources("src-tauri/src/domain/mod.rs");
assert.ok(modRs.includes("pub mod explorations;"), "explorations module should be registered.");

const commandRs = await readSources("src-tauri/src/command.rs");
assert.ok(
  commandRs.includes('"/api/unit-explorations/metadata"')
    && commandRs.includes('"/api/unit-explorations/select"')
    && commandRs.includes('"/api/unit-explorations"')
    && commandRs.includes('"/api/unit-design-messages"'),
  "command.rs should expose exploration metadata, selection, image list, and design-chat message routes.",
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
  "src/lib/design-chat.ts",
  "src/App.tsx",
  "src/components/MdxPlanRenderer.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/views/UnitDesignDrawer.tsx",
);

assert.ok(
  ts.includes('export const unitExplorationsRoot = ".hyperwiki/state/explorations"')
    && ts.includes("export function unitExplorationDir"),
  "Frontend path helpers should mirror the backend exploration directory contract.",
);
assert.ok(
  ts.includes("export interface UnitExplorationMetadata")
    && ts.includes("export interface UnitDesignChatMessage")
    && ts.includes("export async function fetchUnitExplorationImages")
    && ts.includes("export async function writeUnitExplorationMetadata")
    && ts.includes("export async function fetchUnitDesignMessages")
    && ts.includes("export async function appendUnitDesignMessage"),
  "Frontend should expose typed exploration metadata, image fetch, metadata write, and persistent design-chat helpers.",
);
assert.ok(
  ts.includes("export function UnitDesignDrawer")
    && ts.includes('data-unit-design-drawer="true"')
    && ts.includes('data-unit-design-image-selector="true"')
    && ts.includes('data-unit-design-chat="true"')
    && ts.includes("Detected:")
    && ts.includes("Unit iteration request from the Design drawer")
    && ts.includes("Attached current-state screenshots:")
    && ts.includes("Attached design targets/references:")
    && ts.includes("Attached uploaded reference images:")
    && ts.includes("onSaveReferenceImage")
    && ts.includes("aria-pressed={selected}")
    && ts.includes("Open larger view")
    && ts.includes("Queue feedback")
    && ts.includes("Looks good")
    && ts.includes("Execute next unit"),
  "The design drawer should combine image selection, persistent chat, auto-detected send mode, upload references, and screenshot review actions.",
);
assert.ok(
  ts.includes("detectUnitDesignChatIntent")
    && ts.includes("parseDesignVariantCount")
    && ts.includes('"implement-ui"')
    && ts.includes('"generate-designs"')
    && ts.includes("Ambiguous prompts") === false,
  "The auto-detect helpers should route drawer messages to generate-designs or implement-ui without embedding prose-only plan text.",
);
assert.ok(
  ts.includes('data-unit-visual-evidence="true"')
    && ts.includes("visualImageSummary")
    && ts.includes("No images created yet")
    && ts.includes("Open Design")
    && ts.includes("<span className=\"text-sm font-semibold\">Design</span>")
    && ts.includes('data-unit-visual-preview="true"')
    && ts.includes("latestUnitImage(unitExplorations)")
    && !ts.includes("Review Screenshots")
    && !ts.includes("Explore Design"),
  "Unit pages should expose one Design card entry point with counts, Open Design, and latest screenshot/design preview.",
);
assert.ok(
  !ts.includes('data-unit-explorations-section="true"') && !ts.includes("visualEvidenceSummary"),
  "Design exploration should open in the drawer, not render as a second inline section or timestamp summary.",
);
assert.ok(
  !ts.includes('data-unit-explorations="true"') && !ts.includes('data-unit-screenshot="true"'),
  "Design explorations and screenshots should not render as separate top-level unit cards.",
);
assert.ok(
  ts.includes("Mode: Image-Gen Design Exploration.")
    && ts.includes("Use the imagegen skill")
    && ts.includes("real local PNG files")
    && ts.includes("set -a; source .env.local; set +a")
    && ts.includes("OPENAI_API_KEY")
    && ts.includes('find "${outputDir}" -maxdepth 1 -type f -name \'*.png\' | sort')
    && ts.includes("do not implement product code")
    && ts.includes("metadata.json")
    && ts.includes("Source screenshots:")
    && ts.includes("Reference images:")
    && ts.includes("sourceScreenshotPaths")
    && ts.includes("Existing design candidates to preserve:")
    && ts.includes("Preserve every existing design candidate listed above exactly")
    && ts.includes("filenames that do not collide with preserved files")
    && ts.includes("click Open Design"),
  "The generation prompt should route image creation through the agent/imagegen path, include selected image context, preserve existing candidates, and avoid implementation work.",
);
assert.ok(
  !ts.includes("First remove existing PNGs"),
  "New explorations should add candidates without deleting previous design candidates.",
);
assert.ok(
  ts.includes("appendUnitDesignMessage")
    && ts.includes("sendDesignDrawerMessage")
    && ts.includes("sendDesignGenerationMessage")
    && ts.includes("sendDesignImplementationMessage")
    && ts.includes("stageExecuteUnitPromptForPath(unitPath, { prompt })")
    && ts.includes("User unit-iteration request:")
    && ts.includes("Inspect every attached image path before editing"),
  "Drawer chat messages should persist, then either generate additive designs or launch Execute Unit with attached image context.",
);
assert.ok(
  ts.includes('"exploration"')
    && ts.includes("setExplorationRefreshKey((value) => value + 1)")
    && ts.includes("setDesignDrawerUnitPath(unitPath)")
    && ts.includes("explorationAutoReviewTimers")
    && ts.includes("scheduleDesignExplorationAutoReview")
    && ts.includes("freshAfterCapturedAt")
    && ts.includes("preservedCandidateNames")
    && ts.includes("maybeOpenDesignExplorationReview(armedCompletion.planPath)")
    && ts.includes("Design exploration finished without saved candidate PNGs")
    && ts.includes("Design exploration has not saved fresh candidate PNGs yet")
    && ts.includes("Design exploration ready:"),
  "Exploration agent runs should be tracked separately, poll for saved PNGs, refresh unit state, and open saved candidates in the design drawer.",
);

console.log("unit explorations static smoke passed");
