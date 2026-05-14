import { execFile } from "node:child_process";

export async function openWorkspace(workspaceUrl, options = {}) {
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
