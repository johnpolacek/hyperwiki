import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const requiredAssets = [
  "dist/index.html",
  "dist/assets/wiki.css",
  "dist/assets/theme.css",
  "dist/favicon.ico",
  "dist/vendor/fonts/instrument-serif/InstrumentSerif-Regular.ttf",
  "dist/vendor/fonts/sometype-mono/SometypeMono-Regular.ttf"
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
if (!app.includes("Modify Plan") || !app.includes("Describe how the agent should revise this page")) {
  throw new Error("Command bar modify action must bundle the visible Modify Plan pane.");
}

console.log("tauri static assets smoke test passed");
