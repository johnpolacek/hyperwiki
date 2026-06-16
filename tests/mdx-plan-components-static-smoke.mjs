import { readFile } from "node:fs/promises";
import path from "node:path";

const renderer = await readFile(path.resolve("src/components/MdxPlanRenderer.tsx"), "utf8");
const app = [await readFile(path.resolve("src/App.tsx"), "utf8"), await readFile(path.resolve("src/lib/theme.ts"), "utf8"), await readFile(path.resolve("src/components/layout/WikiSidebar.tsx"), "utf8")].join("\n");

const requiredImports = [
  "@/components/ui/accordion",
  "@/components/ui/alert",
  "@/components/ui/badge",
  "@/components/ui/button",
  "@/components/ui/card",
  "@/components/ui/collapsible",
  "@/components/ui/scroll-area",
  "@/components/ui/tabs",
  "@/components/ui/tooltip",
];

for (const importPath of requiredImports) {
  if (!renderer.includes(importPath)) {
    throw new Error(`MDX plan renderer must compose shadcn primitive: ${importPath}`);
  }
}

const requiredComponents = [
  "PlanHero",
  "PlanSummary",
  "PlanUnit",
  "Decision",
  "Evidence",
  "Verification",
  "Scope",
  "ImplementationNotes",
  "Dependencies",
  "CompletionGate",
  "Callout",
  "Note",
  "Tip",
  "Warning",
  "Danger",
  "Check",
  "Panel",
  "Frame",
  "Card",
  "CardGroup",
  "Columns",
  "Column",
  "Aside",
  "Flow",
  "FlowStep",
  "StageTrack",
  "StageItem",
  "OpenDecision",
  "DecisionOption",
  "RequestExample",
  "ResponseExample",
  "Steps",
  "Step",
  "Prompt",
  "Update",
  "TaskList",
  "StatusBadge",
  "ParamField",
  "ResponseField",
  "Tree",
  "TreeFolder",
  "TreeFile",
  "CodeBlock",
  "CommandBlock",
  "Visibility",
  "Tabs",
  "Tab",
  "AccordionGroup",
  "Accordion",
  "Tooltip",
];

for (const component of requiredComponents) {
  if (!renderer.includes(`"${component}"`)) {
    throw new Error(`MDX plan renderer must recognize <${component}>.`);
  }
}

const wikiRs = await readFile(path.resolve("src-tauri/src/domain/wiki.rs"), "utf8");
const frontendTagList = renderer.match(/const componentTags = \[([\s\S]*?)\];/)?.[1] || "";
const backendTagList = wikiRs.match(/const MDX_SECTION_TAGS: &\[&str\] = &\[([\s\S]*?)\];/)?.[1] || "";
const frontendTags = new Set([...frontendTagList.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]));
const backendTags = new Set([...backendTagList.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]));
// CodeBlock/CommandBlock/Visibility are handled by dedicated backend replacements, not MDX_SECTION_TAGS.
const backendExemptTags = new Set(["CodeBlock", "CommandBlock", "Visibility"]);
for (const tag of frontendTags) {
  if (!backendTags.has(tag) && !backendExemptTags.has(tag)) {
    throw new Error(`Component tag lists out of sync: <${tag}> is in MdxPlanRenderer.tsx but missing from wiki.rs MDX_SECTION_TAGS.`);
  }
}
for (const tag of backendTags) {
  if (!frontendTags.has(tag)) {
    throw new Error(`Component tag lists out of sync: <${tag}> is in wiki.rs MDX_SECTION_TAGS but missing from MdxPlanRenderer.tsx.`);
  }
}

if (!renderer.includes('audience.toLowerCase() === "agents" ? null')) {
  throw new Error("MDX plan renderer must hide agent-only Visibility blocks in the app.");
}

for (const visualContract of [
  "renderSummaryGrid",
  "bg-secondary/25 px-0 py-2",
  "grid gap-1",
  "grid gap-2 py-1",
  "validationWarnings",
  "inlineCodeClassName",
  "bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground",
]) {
  if (!renderer.includes(visualContract)) {
    throw new Error(`MDX plan renderer must keep the compact working-brief visual contract: ${visualContract}`);
  }
}

for (const exportContract of [
  "/api/wiki/export-markdown-zip",
  "/api/wiki/export-markdown-zip/download",
  "isReactRenderedMdxPath",
  "Download wiki Markdown zip",
  "wikiExportStatus",
  "isWikiExporting",
]) {
  if (!app.includes(exportContract)) {
    throw new Error(`App must expose the wiki Markdown export contract: ${exportContract}`);
  }
}

if (app.includes("downloadBase64File(") || app.includes("URL.createObjectURL")) {
  throw new Error("Sidebar wiki Markdown export must use the desktop save endpoint, not a browser Blob download.");
}

if (app.includes("Download project skill")) {
  throw new Error("App must not expose a separate project skill download button.");
}

for (const contrastContract of [
  '"--secondary-foreground": readableTextOn(secondary)',
  '? "bg-muted text-foreground',
]) {
  if (!app.includes(contrastContract)) {
    throw new Error(`App must keep secondary surfaces readable across theme presets: ${contrastContract}`);
  }
}

for (const generationContract of [
  "choose the planning composition pattern",
  "CardGroup cards for alternatives or work tracks",
  "avoid multi-column plan layouts",
  "RequestExample/ResponseExample/ParamField/ResponseField for contracts",
  "Prefer CodeBlock over raw fenced code blocks",
  "one CodeBlock per tab",
  "plan-page-skeletons.md",
  "start from the matching skeleton",
  "PlanHero followed by PlanSummary",
  "will fail validation",
]) {
  if (!app.includes(generationContract)) {
    throw new Error(`Plan generation prompt must advertise rich MDX composition: ${generationContract}`);
  }
}

const hyperwikiSkill = await readFile(path.resolve("src-tauri/agent-skills/hyperwiki/SKILL.md"), "utf8");
const mdxPatterns = await readFile(path.resolve("src-tauri/agent-skills/hyperwiki/references/mdx-artifact-patterns.md"), "utf8");

for (const codeBlockGuidance of [
  "Prefer `CodeBlock` over raw fenced code blocks",
  "one `CodeBlock` per tab",
]) {
  if (!hyperwikiSkill.includes(codeBlockGuidance) || !mdxPatterns.includes(codeBlockGuidance)) {
    throw new Error(`Hyperwiki skill guidance must prefer CodeBlock for rich visible code examples: ${codeBlockGuidance}`);
  }
}

console.log("mdx plan components static smoke test passed");
