import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

const bugsRs = await readSources("src-tauri/src/domain/bugs.rs");
assert.ok(
  bugsRs.includes("pub fn list")
    && bugsRs.includes("pub fn create")
    && bugsRs.includes("pub fn update_status")
    && bugsRs.includes("pub fn open_bug_summaries"),
  "bugs.rs should own list/create/status-update/open-summary behavior.",
);
assert.ok(
  bugsRs.includes('wikiKind: "bug"')
    && bugsRs.includes("wiki/bugs/{slug}.mdx")
    && bugsRs.includes("ensure_bug_index")
    && bugsRs.includes("safe_route")
    && bugsRs.includes("safe_slug")
    && bugsRs.includes('"open" | "fixing" | "fixed" | "verified" | "closed"'),
  "bug reports should be durable wiki-backed MDX pages with safe context and canonical statuses.",
);
assert.ok(
  bugsRs.includes("bug_status_rank") && bugsRs.includes("severity_rank"),
  "bug listing should sort by workflow status and severity.",
);

const modRs = await readSources("src-tauri/src/domain/mod.rs");
assert.ok(modRs.includes("pub mod bugs;"), "bugs module should be registered.");

const commandRs = await readSources("src-tauri/src/command.rs");
assert.ok(
  commandRs.includes('"/api/bugs"')
    && commandRs.includes('"/api/bugs/status"')
    && commandRs.includes("crate::domain::bugs::create")
    && commandRs.includes("crate::domain::bugs::update_status"),
  "command.rs should expose bug list/create/status routes.",
);

const wikiRs = await readSources("src-tauri/src/domain/wiki.rs");
assert.ok(
  ['"open"', '"fixing"', '"fixed"', '"verified"', '"closed"'].every((status) => wikiRs.includes(status)),
  "wiki status parsing should recognize bug statuses.",
);

const verificationRs = await readSources("src-tauri/src/domain/verification.rs");
assert.ok(
  verificationRs.includes("ContractBugs")
    && verificationRs.includes("open_bug_summaries")
    && verificationRs.includes("Open bugs:"),
  "project contract context should include open bug summaries.",
);

const mcpRs = await readSources("src-tauri/src/domain/mcp.rs");
assert.ok(
  mcpRs.includes("hyperwiki://bugs") && mcpRs.includes("list_bugs"),
  "MCP context should expose a bugs resource and list_bugs tool.",
);

const ts = await readSources(
  "src/lib/types.ts",
  "src/lib/api.ts",
  "src/lib/wiki-pages.ts",
  "src/App.tsx",
  "src/components/layout/WikiSidebar.tsx",
  "src/components/views/BugReportDialog.tsx",
  "src/components/views/WorkspacePane.tsx",
  "src/components/MdxPlanRenderer.tsx",
);

assert.ok(
  ts.includes("export type BugStatus")
    && ts.includes("export type BugSeverity")
    && ts.includes("export interface BugRecord")
    && ts.includes("export interface BugCreateInput")
    && ts.includes("export interface BugStatusUpdateInput"),
  "frontend bug types should cover status, severity, records, creates, and status updates.",
);
assert.ok(
  ts.includes("export async function fetchBugs")
    && ts.includes("export async function createBug")
    && ts.includes("export async function updateBugStatus"),
  "api.ts should expose typed bug helpers.",
);
assert.ok(
  ts.includes("bugLandingPath")
    && ts.includes("isBugReportPage")
    && ts.includes("isClosedBugPage")
    && ts.includes("bugSortKey"),
  "wiki page helpers should detect, sort, and land on bug routes.",
);
assert.ok(
  ts.includes("ToggleGroup")
    && ts.includes("BugTree")
    && ts.includes("onOpenBugs")
    && ts.includes("Fixed Bugs"),
  "sidebar should switch between Plans and Bugs with an active/completed bug list.",
);
assert.ok(
  ts.includes("export function BugReportDialog")
    && ts.includes("Save Bug")
    && ts.includes("currentRoute: displayWikiPath(currentPath)")
    && ts.includes("linkedPlan: linkedPlan.trim()"),
  "bug dialog should build the quick bug creation payload from the current wiki route.",
);
assert.ok(
  ts.includes("BugActionBar")
    && ts.includes("Fix Bug")
    && ts.includes("Mark Verified")
    && ts.includes("Reopen"),
  "bug pages should expose direct fix and status actions.",
);
assert.ok(
  ts.includes('kind: "bug"')
    && ts.includes('scopeKind: "bug"')
    && ts.includes("bugFixPrompt")
    && ts.includes("Mode: Fix Bug.")
    && ts.includes("set frontmatter `status`, `PlanHero status`, and the summary Status item to `fixed`"),
  "Fix Bug should start a bug-scoped agent prompt with bug-page update instructions.",
);

console.log("sidebar bugs workflow static smoke passed");
