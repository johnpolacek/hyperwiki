import { execFile } from "node:child_process";
import { ProjectRegistry } from "./projects.js";
import { startDevServer } from "./server.js";

export async function launchHyperWiki(root, options = {}) {
  const host = String(options.host || "127.0.0.1");
  const port = Number(options.port || 4177);
  const registry = new ProjectRegistry();
  const project = await registry.register(root);
  const baseUrl = `http://${host}:${port}`;
  const workspaceUrl = `${baseUrl}/workspace/?project=${encodeURIComponent(project.id)}`;
  const existing = await existingHyperWiki(baseUrl);
  const serverInfo = existing ? null : await startDevServer(root, { host, port, projectId: project.id });

  await waitForWorkspace(workspaceUrl);
  const opened = options.open === false ? false : await openWorkspace(workspaceUrl, options);
  console.log(`HyperWiki workspace: ${workspaceUrl}`);
  if (existing) {
    console.log("Attached to existing HyperWiki server.");
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

async function existingHyperWiki(baseUrl) {
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

async function openWorkspace(workspaceUrl, options = {}) {
  if (options.dry_run || process.env.HYPERWIKI_OPEN_DRY_RUN === "1") {
    console.log(`Would open ${workspaceUrl}`);
    return true;
  }
  const opener = process.env.HYPERWIKI_BROWSER_OPENER;
  if (opener) {
    await exec(opener, [workspaceUrl]);
    return true;
  }
  const platform = process.platform;
  if (platform === "darwin") {
    await exec("open", [workspaceUrl]);
    return true;
  }
  if (platform === "win32") {
    await exec("cmd", ["/c", "start", "", workspaceUrl]);
    return true;
  }
  if (platform === "linux") {
    await exec("xdg-open", [workspaceUrl]);
    return true;
  }
  return false;
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
