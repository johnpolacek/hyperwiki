import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The `</>` diff viewer spans Rust (git stats + open-in-editor), the API client,
// the dialog, and the TopBar trigger. Pin the contract at each seam.

const git = await readFile("src-tauri/src/domain/git.rs", "utf8");
assert.ok(git.includes("pub fn working_tree_changes"), "git.rs should expose working_tree_changes.");
assert.ok(git.includes("pub fn recent_commits"), "git.rs should expose recent_commits.");
assert.ok(git.includes("pub fn commit_changes"), "git.rs should expose commit_changes.");
assert.ok(
  git.includes("ls-files") && git.includes("--others") && git.includes("--exclude-standard"),
  "working_tree_changes should fold in untracked files via ls-files.",
);
assert.ok(git.includes("--no-renames"), "diffs should disable rename detection for deterministic rows.");
assert.ok(
  git.includes("--end-of-options") && git.includes("{{commit}}"),
  "commit_changes should resolve and verify the ref before use.",
);

const appShell = await readFile("src-tauri/src/domain/app_shell.rs", "utf8");
assert.ok(appShell.includes("pub fn open_in_editor"), "app_shell.rs should expose open_in_editor.");
assert.ok(appShell.includes('"cursor"') && appShell.includes('"code"'), "open_in_editor should try known editor CLIs.");
assert.ok(appShell.includes("--goto"), "open_in_editor should jump to the file (and line) via --goto.");
assert.ok(
  appShell.includes("starts_with(&root)") && appShell.includes("outside the project"),
  "open_in_editor must contain the target to the project root.",
);

const command = await readFile("src-tauri/src/command.rs", "utf8");
assert.ok(command.includes('starts_with("/api/git/changes")'), "router should serve /api/git/changes.");
assert.ok(command.includes('starts_with("/api/git/commits")'), "router should serve /api/git/commits.");
assert.ok(command.includes('starts_with("/api/git/commit")'), "router should serve /api/git/commit.");
assert.ok(command.includes('starts_with("/api/app/open-in-editor")'), "router should serve /api/app/open-in-editor.");
const commitsAt = command.indexOf('starts_with("/api/git/commits")');
const commitAt = command.indexOf('starts_with("/api/git/commit")');
assert.ok(commitsAt !== -1 && commitsAt < commitAt, "the plural /api/git/commits route must be matched before the singular.");

const api = await readFile("src/lib/api.ts", "utf8");
for (const fn of ["fetchWorkingTreeChanges", "fetchRecentCommits", "fetchCommitChanges", "openFileInEditor"]) {
  assert.ok(api.includes(`export async function ${fn}`), `api.ts should export ${fn}.`);
}

const dialog = await readFile("src/components/views/DiffViewerDialog.tsx", "utf8");
assert.ok(dialog.includes("export function DiffViewerDialog"), "DiffViewerDialog should be exported.");
assert.ok(
  dialog.includes("fetchWorkingTreeChanges") && dialog.includes("fetchRecentCommits") && dialog.includes("fetchCommitChanges"),
  "the dialog should load working-tree and commit change sets.",
);
assert.ok(dialog.includes("openFileInEditor"), "the dialog should open files in the editor.");
assert.ok(
  dialog.includes("skipCleanWorkingTreePage") &&
    dialog.includes("workingTree?.isGit && workingTree.files.length === 0 && commits.length > 0") &&
    dialog.includes("const commitIndex = showWorkingTreePage ? pos - 1 : pos"),
  "the dialog should open clean Git working trees on the newest commit instead of an empty uncommitted-changes page.",
);
assert.ok(
  dialog.includes("current === undefined"),
  "the dialog should keep showing a loading state while the first visible commit changes are fetched.",
);

const workspace = await readFile("src/components/views/WorkspacePane.tsx", "utf8");
assert.ok(workspace.includes("function ViewChangesButton"), "the unit pane should define the icon-only diff trigger.");
assert.ok(workspace.includes("CodeXml"), "the diff trigger should use the </> code icon.");
assert.ok(workspace.includes('aria-label="View changes"') && workspace.includes('size="icon"'), "the diff trigger should be an icon-only button.");
assert.ok(workspace.includes("onOpenDiff"), "the unit pane should wire the diff-viewer trigger.");

const app = await readFile("src/App.tsx", "utf8");
assert.ok(app.includes("DiffViewerDialog"), "App should mount the DiffViewerDialog.");
assert.ok(app.includes("onOpenDiff={() => setDiffViewerOpen(true)}"), "App should open the diff viewer from the unit pane.");

console.log("diff viewer static smoke passed");
