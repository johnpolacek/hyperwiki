import assert from "node:assert/strict";
import { readSources } from "./lib/read-sources.mjs";

const topBar = await readSources("src/components/layout/TopBar.tsx");
assert.ok(
  topBar.includes('onNavigate({ kind: "projects" })') && topBar.includes("Projects"),
  "TopBar should route the Projects button to the full Projects view.",
);
assert.ok(
  !topBar.includes("Popover") && !topBar.includes("ProjectsMenu") && !topBar.includes("isProjectsOpen"),
  "TopBar should not keep the old Projects popover/menu path.",
);

const app = await readSources("src/App.tsx");
assert.ok(!app.includes("isProjectsOpen") && !app.includes("setIsProjectsOpen"), "App should not keep obsolete Projects popover state.");
assert.ok(app.includes("onSwitchProject={switchProject}"), "WorkspacePane should keep project switching wired through switchProject.");

const projectsView = await readSources("src/components/views/ProjectsView.tsx");
assert.ok(
  projectsView.includes('role="button"')
    && projectsView.includes("tabIndex={selected ? 0 : -1}")
    && projectsView.includes("aria-label={`Switch to ${title}`}"),
  "Project cards should expose an accessible card-level switch target.",
);
assert.ok(
  projectsView.includes("function openSelectedProject()")
    && projectsView.includes("function handleCardKeyDown")
    && projectsView.includes('event.key !== "Enter" && event.key !== " "')
    && projectsView.includes("onClick={openSelectedProject}")
    && projectsView.includes("onKeyDown={handleCardKeyDown}"),
  "Project cards should switch on click, Enter, and Space.",
);
assert.ok(
  projectsView.includes("function stopCardActivation")
    && projectsView.includes("stopCardActivation(event);")
    && projectsView.includes("onClick={stopCardActivation}")
    && projectsView.includes("onKeyDown={stopCardActivation}"),
  "Nested project-card controls should stop card activation.",
);
assert.ok(
  projectsView.includes("setIsConfirmingRemoval(true)")
    && projectsView.includes("Confirm Remove")
    && projectsView.includes("Confirm Delete")
    && projectsView.includes("setDeleteFiles(event.target.checked)"),
  "Project removal controls should remain available inside the card.",
);

console.log("project grid switcher static smoke passed");
