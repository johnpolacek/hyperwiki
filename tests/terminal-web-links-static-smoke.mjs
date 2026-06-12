import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = [await readFile("src/App.tsx", "utf8"), await readFile("src/components/terminal/TerminalPane.tsx", "utf8"), await readFile("src/components/terminal/XtermSession.tsx", "utf8"), await readFile("src/lib/terminal.ts", "utf8")].join("\n");

const xtermStart = source.indexOf("function XtermSession");
const xtermEnd = source.indexOf("function terminalDisplayDebugTail", xtermStart);
assert.notEqual(xtermStart, -1, "XtermSession should exist.");
assert.notEqual(xtermEnd, -1, "terminal display helpers should follow XtermSession.");
const xtermSession = source.slice(xtermStart, xtermEnd);

assert.ok(
  xtermSession.includes("new WebLinksAddon((event, uri) =>"),
  "Terminal web links should use an activation callback, not hover-only detection.",
);
assert.ok(
  xtermSession.includes("event.preventDefault();"),
  "Terminal web link clicks should prevent default in-webview navigation.",
);
assert.ok(
  xtermSession.includes("event.stopPropagation();") && xtermSession.includes("event.stopImmediatePropagation();"),
  "Terminal web link clicks should not propagate to any webview or terminal fallback handler.",
);
assert.ok(
  xtermSession.includes("void openTerminalWebLink(uri);"),
  "Terminal web link clicks should delegate to the app-shell external opener.",
);

const openerStart = source.indexOf("async function openTerminalWebLink");
const openerEnd = source.indexOf("function terminalTranscriptTextForDisplay", openerStart);
assert.notEqual(openerStart, -1, "openTerminalWebLink should exist.");
assert.notEqual(openerEnd, -1, "terminal transcript helpers should follow openTerminalWebLink.");
const opener = source.slice(openerStart, openerEnd);

assert.ok(
  opener.includes('hyperwikiApi.request("/api/app/open-external"'),
  "Terminal web link opening should reuse the app-shell external URL endpoint.",
);
assert.ok(
  opener.includes("body: { target: uri }"),
  "Terminal web link opening should pass the clicked URI to the backend opener.",
);

console.log("terminal web links static smoke passed");
