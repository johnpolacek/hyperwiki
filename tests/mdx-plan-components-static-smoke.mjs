import { readFile } from "node:fs/promises";
import path from "node:path";

const renderer = await readFile(path.resolve("src/components/MdxPlanRenderer.tsx"), "utf8");

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
  "bg-secondary/25 px-0 py-3",
  "grid gap-1",
  "grid gap-2 py-1",
]) {
  if (!renderer.includes(visualContract)) {
    throw new Error(`MDX plan renderer must keep the compact working-brief visual contract: ${visualContract}`);
  }
}

console.log("mdx plan components static smoke test passed");
