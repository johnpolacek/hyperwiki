import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const fixture = JSON.parse(await readFile("tests/fixtures/tauri/parity-surfaces.json", "utf8"));
const checklist = await readFile(fixture.manualChecklist, "utf8");
const domainMod = await readFile("src-tauri/src/domain/mod.rs", "utf8");

for (const script of fixture.requiredScripts) {
  assert.ok(packageJson.scripts[script], `Missing package script ${script}`);
}

for (const surface of fixture.surfaces) {
  assert.match(domainMod, new RegExp(`"${surface}"`), `Missing Rust domain surface ${surface}`);
  assert.match(checklist, new RegExp(surface, "i"), `Missing dogfood checklist coverage for ${surface}`);
}

assert.match(checklist, /Manual Desktop Dogfood Checklist/);
assert.match(checklist, /macOS/);
assert.match(checklist, /Portless/);
