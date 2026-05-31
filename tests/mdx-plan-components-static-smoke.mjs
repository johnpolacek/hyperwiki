import { readFile } from "node:fs/promises";
import path from "node:path";

const renderer = await readFile(path.resolve("src/components/MdxPlanRenderer.tsx"), "utf8");
const app = await readFile(path.resolve("src/App.tsx"), "utf8");

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

if (!renderer.includes('audience.toLowerCase() === "agents" ? null')) {
  throw new Error("MDX plan renderer must hide agent-only Visibility blocks in the app.");
}

for (const visualContract of [
  "renderSummaryGrid",
  "bg-secondary/25 px-0 py-2",
  "grid gap-1",
  "grid gap-2 py-1",
  "<Copy aria-hidden",
  "<span>Copy</span>",
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
  "/api/wiki/skill.md",
  "isReactRenderedMdxPath",
  "Download wiki Markdown zip",
  "Download project skill",
]) {
  if (!app.includes(exportContract)) {
    throw new Error(`App must expose the wiki Markdown export contract: ${exportContract}`);
  }
}

for (const contrastContract of [
  '"--secondary-foreground": readableTextOn(secondary)',
  'isSelected ? "bg-secondary text-secondary-foreground"',
]) {
  if (!app.includes(contrastContract)) {
    throw new Error(`App must keep secondary surfaces readable across theme presets: ${contrastContract}`);
  }
}

for (const generationContract of [
  "choose the planning composition pattern",
  "full-width CardGroup cards for alternatives or work tracks",
  "avoid multi-column plan layouts",
  "RequestExample/ResponseExample/ParamField/ResponseField for contracts",
]) {
  if (!app.includes(generationContract)) {
    throw new Error(`Plan generation prompt must advertise rich MDX composition: ${generationContract}`);
  }
}

console.log("mdx plan components static smoke test passed");
