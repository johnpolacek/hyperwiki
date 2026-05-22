import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const requiredAssets = [
  "dist/index.html",
  "dist/assets/app.css",
  "dist/assets/app.js",
  "dist/assets/app-api.js",
  "dist/assets/wiki.css",
  "dist/assets/theme.css",
  "dist/app.js",
  "dist/app-api.js",
  "dist/vendor/@xterm/xterm/lib/xterm.mjs",
  "dist/vendor/@xterm/xterm/css/xterm.css",
  "dist/vendor/@xterm/addon-fit/lib/addon-fit.mjs",
  "dist/vendor/@xterm/addon-web-links/lib/addon-web-links.mjs"
];

for (const asset of requiredAssets) {
  await access(path.resolve(asset));
}

const mirroredAssets = [
  ["public/app.css", "dist/assets/app.css"],
  ["public/app.js", "dist/assets/app.js"],
  ["public/app-api.js", "dist/assets/app-api.js"],
  ["public/wiki.css", "dist/assets/wiki.css"]
];

for (const [source, mirror] of mirroredAssets) {
  const [sourceText, mirrorText] = await Promise.all([
    readFile(path.resolve(source), "utf8"),
    readFile(path.resolve(mirror), "utf8")
  ]);
  if (sourceText !== mirrorText) {
    throw new Error(`Tauri static asset mirror is stale: ${mirror} must match ${source}`);
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

const app = await readFile(path.resolve("dist/assets/app.js"), "utf8");
if (!app.includes("wiki\\/plans\\/features") || !app.includes(".test(path)) return true")) {
  throw new Error("Plan tree must treat feature plans under wiki/plans/features/ as top-level plan entries.");
}

console.log("tauri static assets smoke test passed");
