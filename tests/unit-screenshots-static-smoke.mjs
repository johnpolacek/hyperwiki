import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

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

const agentsMd = await readSources("AGENTS.md");
assert.ok(
  agentsMd.includes(".hyperwiki/state/screenshots/<unit-path>/"),
  "AGENTS.md should document the per-unit screenshot directory.",
);

const screenshotsRs = await readSources("src-tauri/src/domain/screenshots.rs");
assert.ok(
  screenshotsRs.includes('".hyperwiki/state/screenshots"')
    && screenshotsRs.includes("pub fn screenshot_dir_for_unit")
    && screenshotsRs.includes("pub fn read_unit_screenshots")
    && screenshotsRs.includes("pub fn list_unit_screenshots"),
  "screenshots.rs should own the per-unit directory mapping + listing helpers.",
);
assert.ok(
  screenshotsRs.includes('strip_prefix("unit-").unwrap_or(leaf)'),
  "Gallery unit detection should accept both unit-NN and imported NN- folder names.",
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
assert.ok(
  commandRs.includes("read_unit_screenshots(project_root, &unit_path)"),
  "/api/unit-screenshots?path should return every screenshot for the unit.",
);
assert.ok(
  screenshotsRs.includes("pub fn clear_unit_screenshots")
    && commandRs.includes('request.method == "DELETE" && request.path.starts_with("/api/unit-screenshots")'),
  "A redesign can clear a unit's screenshots (clear_unit_screenshots + DELETE route).",
);

const tsSources = await readSources(
  "src/lib/wiki-pages.ts",
  "src/lib/api.ts",
  "src/lib/types.ts",
  "src/App.tsx",
  "src/components/ScreenshotCarousel.tsx",
  "src/components/MdxPlanRenderer.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/views/UnitDesignDrawer.tsx",
  "src/components/layout/TopBar.tsx",
);

assert.ok(
  tsSources.includes("export function unitScreenshotDir")
    && tsSources.includes('export const unitScreenshotsRoot = ".hyperwiki/state/screenshots"'),
  "wiki-pages.ts should expose the per-unit screenshot directory helper mirroring Rust.",
);
assert.ok(
  tsSources.includes('path.includes("/units/")'),
  "isUnitPage should recognize the imported NN-slug.mdx-under-units/ convention so the inline card shows.",
);
assert.ok(
  tsSources.includes("use the agent-browser skill to screenshot each distinct view/state"),
  "The execute prompts should instruct the agent to capture one screenshot per view.",
);
assert.ok(
  tsSources.includes("First remove any existing PNGs") && tsSources.includes("export async function clearUnitScreenshots"),
  "Capture should clear the unit folder first (clean replace) and expose a clear helper.",
);
assert.ok(
  tsSources.includes("Discard") && tsSources.includes("function discardScreenshotReview"),
  "The design drawer should offer a manual screenshot discard reset.",
);
assert.ok(
  tsSources.includes("setScreenshotRefreshKey((value) => value + 1)")
    && tsSources.includes("screenshotRefreshKey: number")
    && tsSources.includes("props.screenshotRefreshKey]"),
  "Discarding should bump a refresh key the workspace effect depends on, so stale inline previews refetch.",
);

assert.ok(
  tsSources.includes("export async function fetchUnitScreenshotImages")
    && tsSources.includes("export async function fetchUnitScreenshots"),
  "api.ts should expose per-unit image fetch + gallery list helpers.",
);
assert.ok(
  tsSources.includes("export function ScreenshotCarousel") && tsSources.includes("<ScreenshotCarousel"),
  "A shared ScreenshotCarousel should exist and power drawer screenshot review.",
);
assert.ok(
  tsSources.includes('data-unit-visual-evidence="true"')
    && tsSources.includes('data-unit-visual-preview="true"')
    && tsSources.includes("latestVisualEvidence")
    && tsSources.includes("latestUnitImage(unitScreenshots)")
    && tsSources.includes("latestUnitImage(unitExplorations)")
    && tsSources.includes("Open Design")
    && tsSources.includes("<span className=\"text-sm font-semibold\">Design</span>")
    && tsSources.includes("No images created yet")
    && !tsSources.includes("Review Screenshots")
    && !tsSources.includes("Explore Design"),
  "The unified design card should include one Open Design entry point plus the newest screenshot/design preview or empty state.",
);
assert.ok(
  !tsSources.includes("visualEvidenceSummary") && !tsSources.includes("formatCapturedAt"),
  "The design card should not render timestamp summary copy in the topbar.",
);
assert.ok(
  !tsSources.includes('data-unit-screenshot="true"') && !tsSources.includes('data-unit-explorations="true"'),
  "Screenshots and design explorations should no longer render as separate top-level cards.",
);
assert.ok(
  !tsSources.includes('{ kind: "unit-gallery" }') && !tsSources.includes("UnitGalleryView"),
  "The Screenshots gallery view/route should be removed.",
);

assert.ok(
  tsSources.includes("function maybeOpenScreenshotReview")
    && tsSources.includes('armedCompletion.kind === "execute"')
    && tsSources.includes("await openDesignDrawer(unitPath, { review: true"),
  "App should open the design drawer review state when an execute run finishes with fresh screenshots.",
);
assert.ok(
  tsSources.includes('data-unit-design-review="true"')
    && tsSources.includes("function queueScreenshotFeedback")
    && tsSources.includes("onQueueScreenshotFeedback")
    && tsSources.includes("Queue feedback")
    && tsSources.includes("Review required before executing")
    && tsSources.includes("Execute is paused until these screenshots are approved"),
  "Screenshot review should live inside the design drawer and queue feedback.",
);
assert.ok(
  !tsSources.includes("export function UnitScreenshotReviewDialog")
    && !tsSources.includes("<UnitScreenshotReviewDialog"),
  "The separate screenshot review dialog should be removed.",
);
assert.ok(
  tsSources.includes("function executeNextUnitFromReview"),
  "The drawer review gate should be able to launch the next unit.",
);
assert.ok(
  tsSources.includes("function openScreenshotReviewManual")
    && tsSources.includes("await openDesignDrawer(unitPath, { review: true"),
  "Manual review should open the design drawer review state for a unit with screenshots.",
);
assert.ok(
  tsSources.includes('aria-label="Copy page Markdown"') && tsSources.includes("copyPageMarkdown"),
  "Copy Markdown should be an icon-only button in the unit page header, not a floating overlay.",
);

assert.ok(
  projectsRs.includes('"previewCapture"') && projectsRs.includes('"authMode"') && projectsRs.includes('"authEmailEnv"'),
  "Init should scaffold a previewCapture profile in .hyperwiki/config.json.",
);
const projectEnvRs = await readSources("src-tauri/src/domain/project_env.rs");
assert.ok(
  projectEnvRs.includes("HYPERWIKI_PREVIEW_AUTH_EMAIL") && projectEnvRs.includes("HYPERWIKI_PREVIEW_AUTH_PASSWORD"),
  "Env-key hints should suggest the preview auth credentials.",
);
assert.ok(
  agentsMd.includes("Reaching gated previews for capture"),
  "AGENTS.md should document how to reach auth/deploy-gated previews.",
);
assert.ok(
  agentsMd.includes("Cloudflare Turnstile") && agentsMd.includes("backend API"),
  "AGENTS.md should cover the bot-challenge sign-up workaround.",
);
assert.ok(
  tsSources.includes("previewCapture` profile in `.hyperwiki/config.json"),
  "The execute prompts should point the agent at the previewCapture profile for gated views.",
);

console.log("unit screenshots static smoke passed");
