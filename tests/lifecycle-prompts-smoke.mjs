// Snapshot-style assertions for the orchestrator and phase-agent prompts. Run via
//   node --import ./tests/alias-loader.mjs tests/lifecycle-prompts-smoke.mjs
import assert from "node:assert/strict";
import { lifecyclePhases } from "@/lib/lifecycle";
import { orchestratorPrompt, phaseAgentPrompt } from "@/lib/lifecycle-prompts";

function phasePage(order, phaseId, status) {
  return {
    title: phaseId,
    path: `/wiki/plans/lifecycle/phase-0${order}-${phaseId}.mdx`,
    status,
    frontmatter: { phaseId },
  };
}

const pages = [
  phasePage(1, "purpose", "active"),
  phasePage(2, "design-system", "planned"),
  phasePage(3, "ui-mocks", "planned"),
  phasePage(4, "backend-arch", "planned"),
  phasePage(5, "onboarding", "planned"),
  phasePage(6, "mvp-views", "planned"),
];
const phases = lifecyclePhases(pages);

// --- Orchestrator prompt: report-only, lists phases, names active --------------
{
  const prompt = orchestratorPrompt(phases);
  assert.match(prompt, /REPORT and RECOMMEND/, "orchestrator is report-only");
  assert.match(prompt, /Do not modify files/, "orchestrator must not edit");
  assert.match(prompt, /Active phase: Purpose & User Stories/, "names the active phase");
  for (const phase of phases) {
    assert.ok(prompt.includes(phase.label), `lists phase ${phase.label}`);
  }
  assert.match(prompt, /wiki\/plans\/lifecycle\/index\.mdx/, "points at the lifecycle plan");
}

// --- Execute phase (design-system): skills, sub-plan, screenshots --------------
{
  const design = phases.find((p) => p.phaseId === "design-system");
  const prompt = phaseAgentPrompt(design, { name: "Acme" });
  assert.match(prompt, /tailwind-design-system/, "loads tailwind-design-system");
  assert.match(prompt, /shadcn/, "loads shadcn");
  assert.ok(prompt.includes("/wiki/plans/design-system/index.mdx"), "names the sub-plan");
  assert.match(prompt, /Screenshot capture/, "execute phase captures screenshots");
  assert.match(prompt, /phase-02-design-system\.mdx/, "points at the phase contract page");
  assert.match(prompt, /Acme/, "uses the project name");
}

// --- Planning phase (backend-arch): no code, records a decision ----------------
{
  const backend = phases.find((p) => p.phaseId === "backend-arch");
  const prompt = phaseAgentPrompt(backend, null);
  assert.match(prompt, /decision\/planning phase/, "planning phase framing");
  assert.match(prompt, /Do not write product code/, "planning phase writes no code");
  assert.match(prompt, /wiki\/architecture\.mdx/, "records architecture decision");
  assert.match(prompt, /grill-with-docs/, "loads grill-with-docs");
}

// --- Purpose phase: PRD + import-planning reuse --------------------------------
{
  const purpose = phases.find((p) => p.phaseId === "purpose");
  const prompt = phaseAgentPrompt(purpose, null);
  assert.match(prompt, /wiki\/sources\/prd\.mdx/, "produces the PRD");
  assert.match(prompt, /import-planning interview/, "reuses the import-planning interview");
}

console.log("lifecycle-prompts-smoke: ok");
