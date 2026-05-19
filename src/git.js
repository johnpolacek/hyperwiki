import { execFile } from "node:child_process";
import path from "node:path";

const baselineCommitMessage = "Initialize Hyperwiki project";
const fallbackAuthorName = "Hyperwiki";
const fallbackAuthorEmail = "hyperwiki@localhost";

export async function gitContext(root) {
  const [gitRoot, branch, status, commonDir] = await Promise.all([
    git(root, ["rev-parse", "--show-toplevel"]),
    git(root, ["branch", "--show-current"]),
    git(root, ["status", "--short"]),
    git(root, ["rev-parse", "--git-common-dir"])
  ]);
  return {
    root,
    git: {
      root: gitRoot.ok ? gitRoot.stdout : null,
      branch: branch.ok && branch.stdout ? branch.stdout : "detached",
      dirty: status.ok ? status.stdout.length > 0 : null,
      status: status.ok ? status.stdout.split("\n").filter(Boolean) : [],
      isWorktree: commonDir.ok ? ![".git", path.join(root, ".git")].includes(commonDir.stdout) : null
    }
  };
}

export async function gitOnboardingStatus(root) {
  const gitRoot = await git(root, ["rev-parse", "--show-toplevel"]);
  return {
    hasGit: gitRoot.ok,
    root: gitRoot.ok ? gitRoot.stdout : null
  };
}

export async function initializeGitOnboarding(root, options = {}) {
  const existing = await gitOnboardingStatus(root);
  if (existing.hasGit) {
    return { status: "already-initialized", gitRoot: existing.root, committed: false };
  }

  const init = await git(root, ["init"]);
  if (!init.ok) {
    throw new Error(`Could not initialize Git: ${init.stderr || init.stdout || "git init failed"}`);
  }

  if (options.commit === false) {
    const initialized = await gitOnboardingStatus(root);
    return { status: "initialized", gitRoot: initialized.root, committed: false };
  }

  await requireGit(root, ["add", "-A"], "stage initial files");
  const commit = await git(root, ["commit", "-m", baselineCommitMessage]);
  if (!commit.ok) {
    const fallbackCommit = await git(root, [
      "-c",
      `user.name=${fallbackAuthorName}`,
      "-c",
      `user.email=${fallbackAuthorEmail}`,
      "commit",
      "-m",
      baselineCommitMessage
    ]);
    if (!fallbackCommit.ok) {
      throw new Error(`Could not create initial Git commit: ${fallbackCommit.stderr || commit.stderr || fallbackCommit.stdout || commit.stdout}`);
    }
  }

  const initialized = await gitOnboardingStatus(root);
  return { status: "committed", gitRoot: initialized.root, committed: true, message: baselineCommitMessage };
}

export function gitOnboardingRequested(options = {}) {
  if (options.no_git || options.git === false || options.git === "false") return false;
  if (options.git || options.yes) return true;
  return "ask";
}

export async function git(root, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: root }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim()
      });
    });
  });
}

async function requireGit(root, args, action) {
  const result = await git(root, args);
  if (!result.ok) {
    throw new Error(`Could not ${action}: ${result.stderr || result.stdout}`);
  }
  return result;
}
