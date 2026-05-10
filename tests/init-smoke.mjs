import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initHyperWiki } from "../src/init.js";

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-init-smoke-"));
await writeFile(
  path.join(root, "package.json"),
  `${JSON.stringify({
    name: "sample-product",
    description: "Sample product for generated wiki verification.",
    scripts: {
      dev: "vite",
      test: "vitest"
    },
    packageManager: "pnpm@10.33.3"
  }, null, 2)}\n`
);
await writeFile(path.join(root, "README.md"), "# Sample Product\n");

await initHyperWiki(root, { yes: true });

const index = await readFile(path.join(root, "wiki", "index.html"), "utf8");
const dev = await readFile(path.join(root, "wiki", "dev.html"), "utf8");
const prd = await readFile(path.join(root, "wiki", "sources", "prd.html"), "utf8");

if (!index.includes("<h1>sample-product</h1>")) {
  throw new Error("Generated index did not use the project name.");
}
if (!index.includes("Sample product for generated wiki verification.")) {
  throw new Error("Generated index did not use the package description.");
}
if (!dev.includes("pnpm run dev") || !dev.includes("pnpm run test")) {
  throw new Error("Generated dev page did not include package scripts.");
}
if (!dev.includes("npx hyperwiki")) {
  throw new Error("Generated dev page did not include the default HyperWiki launch command.");
}
if (prd.includes("HyperWiki turns repo-local project docs")) {
  throw new Error("Generated PRD still contains HyperWiki-specific product copy.");
}

console.log("init smoke test passed");
