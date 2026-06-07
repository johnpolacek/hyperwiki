import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src-tauri/src/domain/app_shell.rs", "utf8");

const openStart = source.indexOf("pub fn open_external_target");
const openEnd = source.indexOf("pub fn reveal_project_folder", openStart);
assert.notEqual(openStart, -1, "open_external_target should exist.");
assert.notEqual(openEnd, -1, "reveal_project_folder should follow URL opening helpers.");
const opener = source.slice(openStart, openEnd);

assert.ok(
  opener.includes("let result = open_url_in_default_browser(target);"),
  "macOS external URL opening should route through the default browser helper.",
);
assert.ok(
  opener.includes('"LSHandlers"') && opener.includes('"LSHandlerURLScheme"') && opener.includes('"LSHandlerRoleAll"'),
  "macOS external URL opening should resolve the user's configured default web browser from Launch Services.",
);
assert.ok(
  opener.includes('.args(["-b", bundle_id.as_str(), target])'),
  "macOS external URL opening should target the default browser bundle id explicitly.",
);
assert.ok(
  opener.includes('Command::new("open").arg(target).output()'),
  "macOS external URL opening should keep the plain open fallback.",
);

console.log("app-shell open browser static smoke passed");
