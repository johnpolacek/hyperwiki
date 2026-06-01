import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const requiredAssets = [
  "dist/index.html",
  "dist/assets/wiki.css",
  "dist/assets/theme.css",
  "dist/favicon.ico",
  "dist/vendor/fonts/instrument-serif/InstrumentSerif-Regular.ttf",
  "dist/vendor/fonts/sometype-mono/SometypeMono-Regular.ttf",
  "dist/vendor/fonts/rethink-sans/RethinkSans-Regular.ttf",
  "dist/vendor/fonts/figtree/Figtree-Regular.ttf",
  "dist/vendor/fonts/eb-garamond/EBGaramond-400.ttf",
  "dist/vendor/fonts/source-code-pro/SourceCodePro-400.ttf"
];

for (const asset of requiredAssets) {
  await access(path.resolve(asset));
}

const forbiddenAssets = [
  "dist/.DS_Store",
  "dist/app.css",
  "dist/app.js",
  "dist/app-api.js",
  "dist/wiki.css",
  "dist/assets/app.css",
  "dist/assets/app.js",
  "dist/assets/app-api.js",
  "dist/vendor/@xterm/xterm/lib/xterm.mjs",
  "dist/vendor/@xterm/xterm/css/xterm.css",
  "dist/vendor/@xterm/addon-fit/lib/addon-fit.mjs",
  "dist/vendor/@xterm/addon-web-links/lib/addon-web-links.mjs"
];

for (const asset of forbiddenAssets) {
  try {
    await access(path.resolve(asset));
    throw new Error(`Obsolete static frontend asset must not be bundled: ${asset}`);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
}

const index = await readFile(path.resolve("dist/index.html"), "utf8");
const appSource = await readFile(path.resolve("src/App.tsx"), "utf8");
const distAssets = await readdir(path.resolve("dist/assets"));
if (!distAssets.some((asset) => /^index-.*\.js$/.test(asset)) || !distAssets.some((asset) => /^index-.*\.css$/.test(asset))) {
  throw new Error("Vite build must emit hashed app JS and CSS assets for the Tauri bundle.");
}
if (!index.includes("/assets/index-")) {
  throw new Error("Tauri dist index must load Vite app assets.");
}

const appAssets = await Promise.all(
  distAssets
    .filter((asset) => /^index-.*\.js$/.test(asset))
    .map((asset) => readFile(path.resolve("dist/assets", asset), "utf8"))
);
const app = appAssets.join("\n");
if (!app.includes("wiki\\/plans\\/features") || !app.includes("/api/wiki/source")) {
  throw new Error("Plan tree must treat feature plans under wiki/plans/features/ as top-level plan entries.");
}
if (app.includes("Docs-only: Modify Plan is limited to app-visible wiki planning files.")) {
  throw new Error("Command bar modify action must not bundle the retired Modify Plan pane.");
}
if (!app.includes("We are executing") || !app.includes("strictly planning/wiki-only operation") || !app.includes("sessionId") || !app.includes("forceNew")) {
  throw new Error("Command bar modify action must start a fresh visible agent terminal with the docs-only Modify Plan prompt.");
}
if (!app.includes("/api/wiki/fingerprint") || !app.includes("Wiki fingerprint changed") || !app.includes("Wiki changes loaded")) {
  throw new Error("App must refresh wiki sidebar state when plan agents or focus checks detect wiki file changes.");
}
if (!appSource.includes('parentPath.endsWith("/wiki/plans/mvp/index.mdx")') || !appSource.includes('/^\\/wiki\\/plans\\/mvp\\/stage-\\d+[^/]*\\.mdx$/.test(candidatePath)')) {
  throw new Error("MVP plan sidebar root must only nest stage pages, not stray generated support pages.");
}
if (!appSource.includes("terminalPlanRootPath(route.path)") || !appSource.includes("normalized.match(/^(.*)\\/unit-\\d+[^/]*\\.mdx$/)")) {
  throw new Error("Terminal scope must normalize plan unit pages to their parent plan root.");
}

console.log("tauri static assets smoke test passed");
