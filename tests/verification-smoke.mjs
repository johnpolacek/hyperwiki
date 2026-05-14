import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";
import { startDevServer } from "../src/server.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-verification-smoke-"));
await writeFile(path.join(root, "package.json"), `${JSON.stringify({
  name: "verification-smoke",
  packageManager: "pnpm@10.33.3",
  scripts: {
    check: "node --check index.js",
    "smoke:browser": "node browser-smoke.mjs",
    "smoke:launch": "node launch-smoke.mjs"
  }
}, null, 2)}\n`);

await inithyperwiki(root, {
  yes: true,
  project_name: "Verification Smoke",
  summary: "Project for verification loop smoke coverage."
});

await mkdir(path.join(root, ".hyperwiki", "state"), { recursive: true });
await writeFile(path.join(root, ".hyperwiki", "state", "verification.json"), `${JSON.stringify({
  runs: [
    {
      loopId: "syntax-checks",
      status: "passed",
      ranAt: "2026-05-14T12:00:00.000Z",
      evidence: "node --check completed",
      kind: "automated"
    },
    {
      loopId: "syntax-checks",
      status: "failed",
      ranAt: "2026-05-14T11:00:00.000Z",
      evidence: "older result"
    }
  ]
}, null, 2)}\n`);

const configPath = path.join(root, ".hyperwiki", "config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
config.verification = {
  loops: [
    {
      id: "syntax-checks",
      label: "Syntax checks",
      command: "pnpm run check",
      scope: "codebase",
      trigger: "before commit",
      kind: "automated",
      source: ".hyperwiki/config.json"
    },
    {
      id: "manual-dogfood",
      label: "Manual dogfood",
      command: "npx hyperwiki",
      scope: "local-runtime",
      trigger: "before finish",
      kind: "manual",
      source: ".hyperwiki/config.json"
    }
  ]
};
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

const { server, url } = await startDevServer(root, { host: "127.0.0.1", port: 0 });
try {
  const verification = await json(`${url}/api/verification`);
  if (verification.version !== 1 || verification.boundary !== "runtime-only-until-recorded") {
    throw new Error(`Expected versioned runtime verification boundary, got ${JSON.stringify(verification)}`);
  }
  if (verification.statePath !== ".hyperwiki/state/verification.json") {
    throw new Error(`Expected ignored verification state path, got ${verification.statePath}`);
  }
  if (verification.loops.length !== 2) {
    throw new Error(`Expected configured verification loops, got ${JSON.stringify(verification.loops)}`);
  }

  const syntax = verification.loops.find((loop) => loop.id === "syntax-checks");
  if (!syntax || syntax.status !== "passed" || syntax.lastRun !== "2026-05-14T12:00:00.000Z") {
    throw new Error(`Expected latest runtime evidence to merge into syntax loop, got ${JSON.stringify(syntax)}`);
  }
  if (syntax.evidence !== "node --check completed" || syntax.boundary !== "runtime-evidence" || syntax.recorded !== false) {
    throw new Error(`Expected runtime-only syntax evidence, got ${JSON.stringify(syntax)}`);
  }

  const manual = verification.loops.find((loop) => loop.id === "manual-dogfood");
  if (!manual || manual.kind !== "manual" || manual.status !== "unknown" || manual.boundary !== "defined-loop") {
    throw new Error(`Expected manual loop with unknown status, got ${JSON.stringify(manual)}`);
  }

  const workspace = await json(`${url}/api/workspace`);
  if (!workspace.verification.some((loop) => loop.id === "syntax-checks" && loop.status === "passed")) {
    throw new Error(`Expected workspace summary to expose verification loops, got ${JSON.stringify(workspace.verification)}`);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("verification loop smoke test passed");

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}
