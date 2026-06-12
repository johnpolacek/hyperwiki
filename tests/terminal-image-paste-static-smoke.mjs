import { readFileSync } from "node:fs";

const appSource = [readFileSync("src/App.tsx", "utf8"), readFileSync("src/components/terminal/TerminalPane.tsx", "utf8"), readFileSync("src/components/terminal/XtermSession.tsx", "utf8"), readFileSync("src/lib/terminal.ts", "utf8")].join("\n");

const xtermSession = readFileSync("src/components/terminal/XtermSession.tsx", "utf8");
if (!xtermSession.includes("function XtermSession")) {
  throw new Error("XtermSession should exist.");
}

for (const needle of [
  "const pasteListenerOptions: AddEventListenerOptions = { capture: true };",
  "container.addEventListener(\"paste\", handlePaste, pasteListenerOptions);",
  "container.removeEventListener(\"paste\", handlePaste, pasteListenerOptions);",
  "terminalClipboardImageFiles(event.clipboardData)",
  "event.preventDefault();",
  "event.stopPropagation();",
  "event.stopImmediatePropagation();",
  "event.clipboardData?.getData(\"text/plain\")",
  "saveTerminalDroppedFiles(activeProject, imageFiles)",
  "queueTerminalInput(terminalBracketedPaste(path));",
  "queueTerminalInput(terminalBracketedPaste(pastedText));",
  "Terminal image paste complete session=",
]) {
  if (!xtermSession.includes(needle)) {
    throw new Error(`XtermSession image paste bridge is missing ${needle}`);
  }
}

for (const needle of [
  "function terminalClipboardImageFiles",
  "item.kind === \"file\" && item.type.startsWith(\"image/\")",
  "item.getAsFile()",
  "Array.from(data.files || []).filter((file) => file.type.startsWith(\"image/\"))",
  "function saveTerminalDroppedFiles",
  "withProjectQuery(\"/api/terminal/drop\", activeProject)",
  "content: await fileToBase64(file)",
  ".map((file) => String(file.path || \"\").trim())",
  "function terminalPasteImageFileName",
  "function fileToBase64",
  "file.arrayBuffer()",
  "btoa(binary)",
  "function terminalBracketedPaste",
  "return `\\x1b[200~${text}\\x1b[201~`;",
]) {
  if (!appSource.includes(needle)) {
    throw new Error(`Terminal image paste helpers are missing ${needle}`);
  }
}

if (appSource.includes("data:image/png;base64") || appSource.includes("queueTerminalInput(await fileToBase64")) {
  throw new Error("Terminal image paste must send saved file paths to Codex, not data URLs or raw base64.");
}

console.log("terminal image paste static smoke passed");
