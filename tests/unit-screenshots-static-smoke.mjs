import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

// Part A — the agent-browser skill is bundled so `hyperwiki init` installs it.
const buildRs = await readSources("src-tauri/build.rs");
assert.ok(
  buildRs.includes('name: "agent-browser"'),
  "build.rs should bundle the agent-browser skill.",
);

const skillStub = await readSources("src-tauri/agent-skills/agent-browser/SKILL.md");
assert.ok(
  skillStub.includes("name: agent-browser") && skillStub.includes("agent-browser skills get core"),
  "Vendored agent-browser SKILL.md should be the discovery stub.",
);

// Part A — guarded, non-fatal CLI install during project init.
const projectsRs = await readSources("src-tauri/src/domain/projects.rs");
assert.ok(
  projectsRs.includes("fn ensure_agent_browser_cli()") && projectsRs.includes("ensure_agent_browser_cli();"),
  "Init flow should call the guarded agent-browser CLI installer.",
);
assert.ok(
  projectsRs.includes('binary_on_path("agent-browser")'),
  "CLI install should skip when agent-browser already resolves on PATH.",
);
assert.ok(
  projectsRs.includes("cfg!(test)") && projectsRs.includes("HYPERWIKI_SKIP_AGENT_BROWSER_INSTALL"),
  "CLI install must stay hermetic under tests / when a harness opts out.",
);

// Part A — agent guidance documents the screenshot expectation.
const agentsMd = await readSources("AGENTS.md");
assert.ok(
  agentsMd.includes(".hyperwiki/state/screenshots/"),
  "AGENTS.md should document the unit screenshot location.",
);

// Part C — backend routes + storage convention live in one authoritative module.
const screenshotsRs = await readSources("src-tauri/src/domain/screenshots.rs");
assert.ok(
  screenshotsRs.includes('".hyperwiki/state/screenshots"')
    && screenshotsRs.includes("pub fn screenshot_path_for_unit")
    && screenshotsRs.includes("pub fn list_unit_screenshots"),
  "screenshots.rs should own the mapping and listing helpers.",
);

const commandRs = await readSources("src-tauri/src/command.rs");
assert.ok(
  commandRs.includes('"/api/unit-screenshots"') && commandRs.includes('"/api/unit-screenshot"'),
  "command.rs should expose the screenshot list + single-image routes.",
);
assert.ok(
  commandRs.indexOf('"/api/unit-screenshots"') < commandRs.indexOf('"/api/unit-screenshot"'),
  "The plural list route must be matched before the singular prefix route.",
);

// Part B — the path mapping is shared and the execute prompts instruct capture.
const tsSources = await readSources(
  "src/lib/wiki-pages.ts",
  "src/lib/api.ts",
  "src/lib/types.ts",
  "src/App.tsx",
  "src/components/MdxPlanRenderer.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/views/UnitGalleryView.tsx",
  "src/components/layout/TopBar.tsx",
);

assert.ok(
  tsSources.includes("export function unitScreenshotRelPath")
    && tsSources.includes('export const unitScreenshotDir = ".hyperwiki/state/screenshots"'),
  "wiki-pages.ts should expose the unit screenshot path helper mirroring the Rust mapping.",
);
assert.ok(
  tsSources.includes("use the agent-browser skill to screenshot the relevant page of the running app"),
  "The execute prompts should instruct the agent to capture a screenshot.",
);

// Part D — fetch helpers, inline display, gallery route + view, and nav entry.
assert.ok(
  tsSources.includes("export async function fetchUnitScreenshot")
    && tsSources.includes("export async function fetchUnitScreenshots"),
  "api.ts should expose both screenshot fetch helpers.",
);
assert.ok(
  tsSources.includes('{ kind: "unit-gallery" }'),
  "ViewRoute should include the unit-gallery route.",
);
assert.ok(
  tsSources.includes("unitScreenshot") && tsSources.includes("Latest screenshot"),
  "MdxPlanRenderer should render the inline screenshot card via the unitScreenshot prop.",
);
assert.ok(
  tsSources.includes("<UnitGalleryView"),
  "WorkspacePane should render the gallery view for the unit-gallery route.",
);
assert.ok(
  tsSources.includes('onNavigate({ kind: "unit-gallery" })'),
  "TopBar should offer a Screenshots nav entry.",
);

console.log("unit screenshots static smoke passed");
