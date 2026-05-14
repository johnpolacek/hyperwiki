import { openWorkspace } from "./open.js";
import { ProjectRegistry } from "./projects.js";
import { startDevServer } from "./server.js";

export async function launchhyperwiki(root, options = {}) {
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 4177);
  const registry = new ProjectRegistry();
  const project = await registry.register(root);
  const baseUrl = `http://${host}:${port}`;
  const workspaceUrl = `${baseUrl}${workspacePath(project)}`;
  const existing = await existinghyperwiki(baseUrl);
  const serverInfo = existing ? null : await startDevServer(root, { host, port, projectId: project.id });

  await waitForWorkspace(workspaceUrl);
  const opened = options.open === false ? false : await openWorkspace(workspaceUrl, options);
  console.log(`hyperwiki workspace: ${workspaceUrl}`);
  if (existing) {
    console.log("Attached to existing hyperwiki server.");
  }
  if (!opened && options.open !== false) {
    console.log("Browser open skipped; open the workspace URL manually.");
  }

  return {
    url: baseUrl,
    workspaceUrl,
    project,
    existing,
    opened,
    server: serverInfo?.server || null
  };
}

function workspacePath(project) {
  return `/workspace/${encodeURIComponent(project.projectSlug)}/${encodeURIComponent(project.worktreeSlug)}`;
}

async function existinghyperwiki(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.app === "hyperwiki";
  } catch {
    return false;
  }
}

async function waitForWorkspace(workspaceUrl) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 5000) {
    try {
      const response = await fetch(workspaceUrl);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Workspace returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${workspaceUrl}: ${lastError?.message || "unknown error"}`);
}
