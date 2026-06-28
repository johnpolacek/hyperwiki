import { displayWikiPath, isCompletedPage } from "@/lib/wiki-pages";
import type { LifecyclePhaseId, WikiPage } from "@/lib/types";

// The canonical 6-phase product lifecycle. This descriptor array is the single
// source of truth for phase identity, order, gating, and the repo-local skills a
// phase sub-agent loads. The wiki pages under `wiki/plans/lifecycle/` mirror this
// (via frontmatter) for the orchestrator reading raw MDX, and the Rust project
// contract mirrors the same gate algorithm — see
// src-tauri/src/domain/verification.rs. Phase pages only supply *status*; phase
// identity/order/gate/childPlan come from here so the two tiers cannot drift.

export type LifecycleArchetype = "planning" | "execute";
export type LifecycleGateKind = "childPlan" | "manual" | "import-validated";
export type LifecyclePhaseStatus = "complete" | "active" | "locked";

export interface LifecyclePhaseDescriptor {
  phaseId: LifecyclePhaseId;
  label: string;
  phaseOrder: number; // 1..6, canonical order
  archetype: LifecycleArchetype;
  skills: string[];
  childPlan?: string; // wiki path of the linked sub-plan, when any
  gate: LifecycleGateKind;
}

export const lifecycleRootPath = "/wiki/plans/lifecycle/index.mdx";

export const LIFECYCLE_PHASES: LifecyclePhaseDescriptor[] = [
  {
    phaseId: "purpose",
    label: "Purpose & User Stories",
    phaseOrder: 1,
    archetype: "planning",
    skills: ["grill-with-docs"],
    gate: "import-validated",
  },
  {
    phaseId: "design-system",
    label: "Design System",
    phaseOrder: 2,
    archetype: "execute",
    skills: ["tailwind-design-system", "shadcn"],
    childPlan: "/wiki/plans/design-system/index.mdx",
    gate: "childPlan",
  },
  {
    phaseId: "ui-mocks",
    label: "UI Mocks",
    phaseOrder: 3,
    archetype: "execute",
    skills: ["frontend-design", "make-interfaces-feel-better"],
    childPlan: "/wiki/plans/ui-mocks/index.mdx",
    gate: "childPlan",
  },
  {
    phaseId: "backend-arch",
    label: "Backend Architecture",
    phaseOrder: 4,
    archetype: "planning",
    skills: ["grill-with-docs"],
    gate: "manual",
  },
  {
    phaseId: "onboarding",
    label: "Onboarding",
    phaseOrder: 5,
    archetype: "execute",
    skills: ["frontend-design"],
    childPlan: "/wiki/plans/onboarding/index.mdx",
    gate: "childPlan",
  },
  {
    phaseId: "mvp-views",
    label: "MVP Views",
    phaseOrder: 6,
    archetype: "execute",
    skills: ["frontend-design", "parallel-dev-worktrees"],
    childPlan: "/wiki/plans/mvp/index.mdx",
    gate: "childPlan",
  },
];

// External signals the pure page list cannot express. `importValidated` reflects
// the Rust `validate_import_plan_artifacts` result, surfaced through the project
// contract; it lets Phase 1 clear from imported-project planning.
export interface LifecycleSignals {
  importValidated?: boolean;
}

export interface LifecyclePhaseState {
  descriptor: LifecyclePhaseDescriptor;
  phaseId: LifecyclePhaseId;
  phaseOrder: number;
  label: string;
  gate: LifecycleGateKind;
  childPlan?: string;
  page: WikiPage | null;
  gateCleared: boolean;
  isActive: boolean;
  status: LifecyclePhaseStatus;
}

export function isLifecycleRootPage(page: WikiPage): boolean {
  return displayWikiPath(page.path).endsWith("/wiki/plans/lifecycle/index.mdx");
}

export function isLifecyclePhasePage(page: WikiPage): boolean {
  return /\/wiki\/plans\/lifecycle\/phase-\d+-[^/]+\.mdx$/.test(displayWikiPath(page.path));
}

export function isLifecyclePlanPage(page: WikiPage): boolean {
  const path = displayWikiPath(page.path);
  return path.includes("/wiki/plans/lifecycle/") && path.endsWith(".mdx");
}

function normalizePlanKey(path: string): string {
  return displayWikiPath(path).replace(/\/index\.mdx$/, "");
}

function findPageByPath(pages: WikiPage[], wikiPath: string): WikiPage | null {
  const target = normalizePlanKey(wikiPath);
  return pages.find((page) => normalizePlanKey(page.path) === target) ?? null;
}

// Match a descriptor to its wiki page: prefer the explicit `phaseId` frontmatter,
// then fall back to the `phase-NN-` filename convention so a page that omits
// frontmatter still resolves.
function findPhasePage(phase: LifecyclePhaseDescriptor, pages: WikiPage[]): WikiPage | null {
  const byFrontmatter = pages.find(
    (page) => isLifecyclePhasePage(page) && page.frontmatter?.phaseId === phase.phaseId,
  );
  if (byFrontmatter) return byFrontmatter;
  const byFilename = new RegExp(`/wiki/plans/lifecycle/phase-0*${phase.phaseOrder}-`);
  return pages.find((page) => isLifecyclePhasePage(page) && byFilename.test(displayWikiPath(page.path))) ?? null;
}

export function phaseGateCleared(
  phase: LifecyclePhaseDescriptor,
  pages: WikiPage[],
  signals: LifecycleSignals = {},
): boolean {
  const phasePage = findPhasePage(phase, pages);
  const phaseComplete = phasePage ? isCompletedPage(phasePage) : false;
  switch (phase.gate) {
    case "manual":
      return phaseComplete;
    case "import-validated":
      return phaseComplete || Boolean(signals.importValidated);
    case "childPlan": {
      if (!phaseComplete) return false;
      if (!phase.childPlan) return true;
      const child = findPageByPath(pages, phase.childPlan);
      return Boolean(child && isCompletedPage(child));
    }
    default:
      return false;
  }
}

// The active phase is the first phase, in canonical order, whose gate is not yet
// cleared. Returns null only when every phase has cleared (lifecycle complete).
export function activeLifecyclePhase(
  pages: WikiPage[],
  signals: LifecycleSignals = {},
): LifecyclePhaseDescriptor | null {
  const ordered = orderedPhases();
  return ordered.find((phase) => !phaseGateCleared(phase, pages, signals)) ?? null;
}

export function lifecyclePhases(
  pages: WikiPage[],
  signals: LifecycleSignals = {},
): LifecyclePhaseState[] {
  const active = activeLifecyclePhase(pages, signals);
  return orderedPhases().map((descriptor) => {
    const gateCleared = phaseGateCleared(descriptor, pages, signals);
    const isActive = active?.phaseId === descriptor.phaseId;
    const status: LifecyclePhaseStatus = gateCleared ? "complete" : isActive ? "active" : "locked";
    return {
      descriptor,
      phaseId: descriptor.phaseId,
      phaseOrder: descriptor.phaseOrder,
      label: descriptor.label,
      gate: descriptor.gate,
      childPlan: descriptor.childPlan,
      page: findPhasePage(descriptor, pages),
      gateCleared,
      isActive,
      status,
    };
  });
}

export function phaseDescriptor(phaseId: LifecyclePhaseId): LifecyclePhaseDescriptor | null {
  return LIFECYCLE_PHASES.find((phase) => phase.phaseId === phaseId) ?? null;
}

function orderedPhases(): LifecyclePhaseDescriptor[] {
  return [...LIFECYCLE_PHASES].sort((a, b) => a.phaseOrder - b.phaseOrder);
}
