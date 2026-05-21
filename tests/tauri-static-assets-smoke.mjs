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

const index = await readFile(path.resolve("public/index.html"), "utf8");
if (!index.includes("/vendor/@xterm/xterm/lib/xterm.mjs")) {
  throw new Error("Tauri static app no longer maps xterm to vendored browser assets.");
}

console.log("tauri static assets smoke test passed");
