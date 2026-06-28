import type { LifecyclePhaseState } from "@/lib/lifecycle";
import type { ProjectRecord } from "@/lib/types";

// Prompt builders for the lifecycle orchestrator and the per-phase sub-agents.
// These are pure string builders alongside workflowPrompt/planCreationPrompt in
// App.tsx. The orchestrator prompt is wiki-only (report + recommend, never edit);
// the phase prompts brief a sub-agent on its contract and the skills it loads.

function phaseLine(phase: LifecyclePhaseState): string {
  const sub = phase.childPlan ? `, sub-plan: ${phase.childPlan}` : "";
  const cleared = phase.gateCleared ? "cleared" : "open";
  return `${phase.phaseOrder}. ${phase.label} — ${phase.status} (gate: ${phase.gate}${sub}; ${cleared})`;
}

export function orchestratorPrompt(phases: LifecyclePhaseState[]): string {
  const active = phases.find((phase) => phase.isActive);
  const lines = [
    "You are the hyperwiki lifecycle orchestrator. Your job is to REPORT and RECOMMEND — not to execute.",
    "",
    "Read wiki/plans/lifecycle/index.mdx and the phase pages. A project advances through 6 phases in order; the active phase is the first whose gate is not yet cleared.",
    "",
    "Current lifecycle state:",
    ...phases.map(phaseLine),
    "",
    active ? `Active phase: ${active.label} (gate: ${active.gate}).` : "All phases cleared — the lifecycle is complete.",
    "",
    "In the terminal, WITHOUT editing any files or running build/test commands:",
    "1. Confirm the active phase and restate its completion gate verbatim from the phase page.",
    "2. Name exactly what is blocking that gate (e.g. the linked sub-plan is incomplete, the PRD lacks user stories, the architecture decision is unrecorded).",
    "3. Recommend the single next handoff: which phase sub-agent to run and which repo-local skills it loads.",
    "",
    "This is a planning-only report. Do not modify files. Do not advance phases yourself — the human triggers each phase handoff.",
  ];
  return lines.join("\n");
}

function phaseObjective(phase: LifecyclePhaseState): string {
  switch (phase.phaseId) {
    case "purpose":
      return "Settle the product purpose and the MVP user stories, and record them in wiki/sources/prd.mdx (an explicit user-stories section). For an imported project, resume the existing import-planning interview rather than starting a new one.";
    case "design-system":
      return "Establish design tokens first (color, spacing, type, radius, dark mode), then a customized shadcn/ui component layer that consumes those tokens — not default shadcn.";
    case "ui-mocks":
      return "Mock every main user-story flow with the Phase 2 components, refine the design system where mocks expose gaps, and extract recurring sections into reusable blocks.";
    case "backend-arch":
      return "Choose the backend architecture (data model, auth, hosting, realtime/sync as needed) grounded in the UI mocks' requirements, and record it in wiki/architecture.mdx with Decision/DecisionOption records.";
    case "onboarding":
      return "Build the onboarding flow (sign-up/sign-in, first-run setup, first-value step) on the design system and the chosen backend.";
    case "mvp-views":
      return "Build the core MVP views that deliver the Phase 1 user stories, on the design system, mocks, and backend from the prior phases.";
    default:
      return "Advance this phase toward its completion gate.";
  }
}

export function phaseAgentPrompt(phase: LifecyclePhaseState, project: ProjectRecord | null): string {
  const order = String(phase.phaseOrder).padStart(2, "0");
  const lines = [
    `You are the "${phase.label}" sub-agent for the ${project?.name || "project"} product lifecycle (Phase ${phase.phaseOrder} of 6).`,
    "",
    `Read wiki/plans/lifecycle/phase-${order}-${phase.phaseId}.mdx for the full phase contract before doing anything.`,
    "",
    `Goal: ${phaseObjective(phase)}`,
    `Load these repo-local skills first: ${phase.descriptor.skills.join(", ")}.`,
    "",
  ];

  if (phase.descriptor.archetype === "execute") {
    if (phase.childPlan) {
      lines.push(
        `Work happens in the sub-plan at ${phase.childPlan}. If that sub-plan does not exist yet, create it first as a hyperwiki plan (plan > stages > units) using the hyperwiki skill, then execute its units one at a time.`,
        "For each unit: implement it, verify it, and capture screenshots per the unit's `## Screenshot capture` section. Keep wiki and code in sync per AGENTS.md.",
      );
    } else {
      lines.push("Implement the phase's deliverables, verifying each and capturing screenshots for browser-observable results.");
    }
  } else {
    lines.push("This is a decision/planning phase: settle the choices and record them in the artifact named in the phase contract. Do not write product code in this phase.");
  }

  lines.push(
    "",
    "Completion: mark the phase page `complete` only when its CompletionGate is satisfied. Do not advance past this phase — the next phase activates automatically once this gate clears.",
  );
  return lines.join("\n");
}
