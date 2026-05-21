import { access, readFile } from "node:fs/promises";
import path from "node:path";

const requiredAssets = [
  "public/index.html",
  "public/assets/app.css",
  "public/assets/app.js",
  "public/assets/app-api.js",
  "public/assets/wiki.css",
  "public/assets/theme.css",
  "public/app.js",
  "public/app-api.js",
  "public/vendor/@xterm/xterm/lib/xterm.mjs",
  "public/vendor/@xterm/xterm/css/xterm.css",
  "public/vendor/@xterm/addon-fit/lib/addon-fit.mjs",
  "public/vendor/@xterm/addon-web-links/lib/addon-web-links.mjs"
];

for (const asset of requiredAssets) {
  await access(path.resolve(asset));
}

const mirroredAssets = [
  ["public/app.css", "public/assets/app.css"],
  ["public/app.js", "public/assets/app.js"],
  ["public/app-api.js", "public/assets/app-api.js"],
  ["public/wiki.css", "public/assets/wiki.css"]
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

const index = await readFile(path.resolve("public/index.html"), "utf8");
if (!index.includes("/vendor/@xterm/xterm/lib/xterm.mjs")) {
  throw new Error("Tauri static app no longer maps xterm to vendored browser assets.");
}

const app = await readFile(path.resolve("public/app.js"), "utf8");
if (!app.includes("wiki\\/plans\\/features") || !app.includes(".test(path)) return true")) {
  throw new Error("Plan tree must treat feature plans under wiki/plans/features/ as top-level plan entries.");
}

console.log("tauri static assets smoke test passed");
