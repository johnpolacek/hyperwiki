import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-reset-smoke-a-"));
const secondRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-reset-smoke-b-"));
const unsafeRoot = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-reset-smoke-unsafe-"));
const home = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-reset-home-"));

try {
  await runCli(["init", "--yes"], { cwd: root, env: { ...process.env, HYPERWIKI_HOME: home } });
  await runCli(["init", "--yes"], { cwd: secondRoot, env: { ...process.env, HYPERWIKI_HOME: home } });
  await mkdir(path.join(home), { recursive: true });
  await writeFile(
    path.join(home, "projects.json"),
    `${JSON.stringify({
      version: 1,
      projects: [
        { id: "one", root, name: "one", lastOpenedAt: "2026-05-10T00:00:00.000Z" },
        { id: "two", root: secondRoot, name: "two", lastOpenedAt: "2026-05-10T00:00:01.000Z" },
        { id: "unsafe", root: unsafeRoot, name: "unsafe", lastOpenedAt: "2026-05-10T00:00:02.000Z" }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  await writeRuntimeFile(root, "state", "workspace.json");
  await writeRuntimeFile(root, "sessions", "cli.json");
  await writeRuntimeFile(secondRoot, "state", "workspace.json");
  await writeRuntimeFile(secondRoot, "sessions", "cli.json");
  await writeRuntimeFile(unsafeRoot, "state", "danger.json");

  const dryRunOutput = await runCli(["reset", "--dry-run"], { cwd: root, env: { ...process.env, HYPERWIKI_HOME: home } });
  if (!dryRunOutput.includes("Would reset") || !existsSync(path.join(home, "projects.json"))) {
    throw new Error(`Expected dry run to leave registry intact, got ${dryRunOutput}`);
  }
  if (!existsSync(path.join(root, ".hyperwiki", "state", "workspace.json"))) {
    throw new Error("Expected dry run to leave runtime state intact.");
  }

  const resetOutput = await runCli(["reset"], { cwd: root, env: { ...process.env, HYPERWIKI_HOME: home } });
  if (!resetOutput.includes("hyperwiki local state reset complete.")) {
    throw new Error(`Expected reset completion output, got ${resetOutput}`);
  }
  if (existsSync(path.join(home, "projects.json"))) {
    throw new Error("Expected reset to remove user-level project registry.");
  }
  await assertEmpty(path.join(root, ".hyperwiki", "state"));
  await assertEmpty(path.join(root, ".hyperwiki", "sessions"));
  await assertEmpty(path.join(secondRoot, ".hyperwiki", "state"));
  await assertEmpty(path.join(secondRoot, ".hyperwiki", "sessions"));
  if (!existsSync(path.join(root, ".hyperwiki", "config.json")) || !existsSync(path.join(root, "wiki", "index.html"))) {
    throw new Error("Expected reset to preserve project config and wiki.");
  }
  const unsafeState = await readFile(path.join(unsafeRoot, ".hyperwiki", "state", "danger.json"), "utf8");
  if (unsafeState !== "runtime\n") {
    throw new Error("Expected reset to ignore non-hyperwiki registered roots.");
  }
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(secondRoot, { recursive: true, force: true });
  await rm(unsafeRoot, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
}

console.log("reset smoke test passed");

async function writeRuntimeFile(rootPath, dir, file) {
  const directory = path.join(rootPath, ".hyperwiki", dir);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, file), "runtime\n", "utf8");
}

async function assertEmpty(directory) {
  const entries = await readdir(directory);
  if (entries.length > 0) {
    throw new Error(`Expected ${directory} to be empty, got ${entries.join(", ")}`);
  }
}

function runCli(args, options) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [path.resolve("src/cli.js"), ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    let output = "";
    childProcess.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    childProcess.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    childProcess.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output));
      }
    });
  });
}
