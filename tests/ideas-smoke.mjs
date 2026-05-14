import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-ideas-smoke-"));
const home = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-ideas-home-"));
const projectsDir = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-ideas-projects-"));
process.env.HYPERWIKI_HOME = home;
process.env.HYPERWIKI_PROJECTS_DIR = projectsDir;

await inithyperwiki(root, { yes: true, project_name: "Ideas Origin", summary: "Origin project for idea promotion." });
await writeFile(path.join(root, "wiki", "ideas", "portable-builder.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Portable Builder - Ideas Origin</title>
</head>
<body>
  <main class="wiki-page">
    <h1>Portable Builder</h1>
    <p>A tiny local builder that starts as an idea and becomes a project.</p>
    <h2>Notes</h2>
    <p>Keep the first slice small.</p>
  </main>
</body>
</html>
`);

const { server, url } = await startDevServer(root, { host: "127.0.0.1", port: 0 });
try {
  const ideas = await json(`${url}/api/ideas`);
  if (ideas.ideas.length !== 1 || ideas.ideas[0].title !== "Portable Builder") {
    throw new Error(`Expected one idea, got ${JSON.stringify(ideas)}`);
  }
  if (!ideas.ideas[0].summary.includes("tiny local builder")) {
    throw new Error("Expected idea summary to come from the first paragraph.");
  }
  if (!ideas.ideas[0].targetRoot.startsWith(projectsDir)) {
    throw new Error(`Expected idea target preview under test projects dir, got ${ideas.ideas[0].targetRoot}`);
  }

  const markdownIdea = await json(`${url}/api/ideas/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Portable Builder",
      content: "# Portable Builder\n\nA second builder idea from **markdown**.\n\n- Keep it local\n- Keep it small",
      documentType: "markdown"
    })
  });
  if (markdownIdea.idea?.path !== "/wiki/ideas/portable-builder-2.html") {
    throw new Error(`Expected duplicate title to auto-suffix, got ${JSON.stringify(markdownIdea)}`);
  }
  const markdownIdeaHtml = await readFile(path.join(root, "wiki", "ideas", "portable-builder-2.html"), "utf8");
  if (!markdownIdeaHtml.includes("<h2>Portable Builder</h2>") || !markdownIdeaHtml.includes("<strong>markdown</strong>") || !markdownIdeaHtml.includes("<li>Keep it local</li>")) {
    throw new Error("Expected created markdown idea to be converted to HTML.");
  }

  const htmlIdea = await json(`${url}/api/ideas/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "HTML Imported Idea",
      content: "<article><h1>HTML Imported Idea</h1><p>A preserved <strong>HTML</strong> idea.</p></article>",
      documentType: "html"
    })
  });
  if (htmlIdea.idea?.path !== "/wiki/ideas/html-imported-idea.html") {
    throw new Error(`Expected created HTML idea path, got ${JSON.stringify(htmlIdea)}`);
  }
  const htmlIdeaHtml = await readFile(path.join(root, "wiki", "ideas", "html-imported-idea.html"), "utf8");
  if (!htmlIdeaHtml.includes("<article>") || !htmlIdeaHtml.includes("<strong>HTML</strong>") || !htmlIdeaHtml.includes("A preserved")) {
    throw new Error("Expected imported HTML idea content to be preserved.");
  }

  const invalidIdea = await fetch(`${url}/api/ideas/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "", content: "Missing title", documentType: "markdown" })
  });
  if (invalidIdea.status !== 400) {
    throw new Error(`Expected invalid idea create to be rejected, got ${invalidIdea.status}`);
  }

  const blocked = await fetch(`${url}/api/ideas/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ideaPath: "/wiki/plans/index.html" })
  });
  if (blocked.status !== 400) {
    throw new Error(`Expected outside idea path to be rejected, got ${blocked.status}`);
  }

  const promoted = await json(`${url}/api/ideas/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ideaPath: "/wiki/ideas/portable-builder.html" })
  });
  if (!promoted.project?.root.startsWith(projectsDir) || !promoted.workspaceUrl.includes("/workspace/")) {
    throw new Error(`Expected promoted project under test projects dir, got ${JSON.stringify(promoted)}`);
  }

  const promotedIndex = await readFile(path.join(promoted.project.root, "wiki", "index.html"), "utf8");
  const promotedPlan = await readFile(path.join(promoted.project.root, "wiki", "plans", "index.html"), "utf8");
  const originIdea = await readFile(path.join(root, "wiki", "ideas", "portable-builder.html"), "utf8");
  if (!promotedIndex.includes("Idea Snapshot") || !promotedIndex.includes("tiny local builder")) {
    throw new Error("Expected promoted project index to include the idea snapshot.");
  }
  if (!promotedPlan.includes("promoted idea planning package")) {
    throw new Error("Expected promoted project to include a planning package.");
  }
  if (!originIdea.includes('data-hyperwiki-promoted="true"') || !originIdea.includes(promoted.project.root)) {
    throw new Error("Expected origin idea page to be replaced with a promoted note.");
  }

  const after = await json(`${url}/api/ideas`);
  const promotedAfter = after.ideas.find((idea) => idea.path.endsWith("/wiki/ideas/portable-builder.html"));
  if (promotedAfter) {
    throw new Error("Expected promoted idea to disappear from API output.");
  }

  const dashboardProject = await json(`${url}/api/projects/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Dashboard Markdown Project",
      summary: "Created from markdown on the Dashboard."
    })
  });
  if (!dashboardProject.project?.root.startsWith(projectsDir) || !dashboardProject.workspaceUrl.includes("/workspace/")) {
    throw new Error(`Expected Dashboard-created project under test projects dir, got ${JSON.stringify(dashboardProject)}`);
  }
  const dashboardIndex = await readFile(path.join(dashboardProject.project.root, "wiki", "index.html"), "utf8");
  if (!dashboardIndex.includes("Dashboard Markdown Project") || !dashboardIndex.includes("Created from markdown on the Dashboard.")) {
    throw new Error("Expected Dashboard-created project to use the provided title and summary.");
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("ideas smoke test passed");

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
