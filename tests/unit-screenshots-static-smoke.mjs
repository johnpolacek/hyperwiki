import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

// Bundling — the agent-browser skill ships so `hyperwiki init` installs it.
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

// Guarded, non-fatal CLI install during project init.
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

// Agent guidance documents the per-unit screenshot directory.
const agentsMd = await readSources("AGENTS.md");
assert.ok(
  agentsMd.includes(".hyperwiki/state/screenshots/<unit-path>/"),
  "AGENTS.md should document the per-unit screenshot directory.",
);

// Backend — per-unit folder storage + listing live in one authoritative module.
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

// Capture — the shared dir mapping + multi-screenshot prompt instruction.
const tsSources = await readSources(
  "src/lib/wiki-pages.ts",
  "src/lib/api.ts",
  "src/lib/types.ts",
  "src/App.tsx",
  "src/components/ScreenshotCarousel.tsx",
  "src/components/MdxPlanRenderer.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/views/UnitGalleryView.tsx",
  "src/components/views/UnitScreenshotReviewDialog.tsx",
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

// Viewing — fetch helpers, carousel, inline display, gallery route + view, nav.
assert.ok(
  tsSources.includes("export async function fetchUnitScreenshotImages")
    && tsSources.includes("export async function fetchUnitScreenshots"),
  "api.ts should expose per-unit image fetch + gallery list helpers.",
);
assert.ok(
  tsSources.includes("export function ScreenshotCarousel"),
  "A shared ScreenshotCarousel should exist for step-through viewing.",
);
assert.ok(
  tsSources.includes('{ kind: "unit-gallery" }'),
  "ViewRoute should include the unit-gallery route.",
);
assert.ok(
  tsSources.includes("unitScreenshots") && tsSources.includes("<ScreenshotCarousel"),
  "MdxPlanRenderer should render the inline screenshots via the carousel.",
);
assert.ok(
  tsSources.includes("<UnitGalleryView"),
  "WorkspacePane should render the gallery view for the unit-gallery route.",
);
assert.ok(
  tsSources.includes('onNavigate({ kind: "unit-gallery" })'),
  "TopBar should offer a Screenshots nav entry.",
);

// Review gate — auto-open on execute completion, per-screenshot comments,
// report-issue back to the same agent, execute-next.
assert.ok(
  tsSources.includes("function maybeOpenScreenshotReview")
    && tsSources.includes('armedCompletion.kind === "execute"'),
  "App should open the review gate when an execute run finishes with fresh screenshots.",
);
assert.ok(
  tsSources.includes("function reportScreenshotIssues")
    && tsSources.includes("targetSessionId: review.sessionId"),
  "Report-issue should send the bundled comments back to the same execute session.",
);
assert.ok(
  tsSources.includes("export function UnitScreenshotReviewDialog")
    && tsSources.includes("<UnitScreenshotReviewDialog"),
  "The review dialog should exist and be rendered.",
);
assert.ok(
  tsSources.includes("function executeNextUnitFromReview"),
  "The review gate should be able to launch the next unit.",
);
assert.ok(
  tsSources.includes("function openScreenshotReviewManual") && tsSources.includes("onReviewScreenshots"),
  "A manual Review button should open the review dialog on demand for a unit with screenshots.",
);

// Gated previews — per-project previewCapture profile, env hints, guidance, prompt pointer.
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
  "AGENTS.md should cover the bot-challenge sign-up workaround (provision via backend API).",
);
assert.ok(
  tsSources.includes("previewCapture` profile in `.hyperwiki/config.json"),
  "The execute prompts should point the agent at the previewCapture profile for gated views.",
);

console.log("unit screenshots static smoke passed");
