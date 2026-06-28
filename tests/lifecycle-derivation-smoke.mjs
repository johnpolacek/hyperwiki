// Behavioral test for the lifecycle derivation helpers. Run with the alias loader:
//   node --import ./tests/alias-loader.mjs tests/lifecycle-derivation-smoke.mjs
import assert from "node:assert/strict";
import {
  LIFECYCLE_PHASES,
  activeLifecyclePhase,
  lifecyclePhases,
  phaseGateCleared,
  phaseDescriptor,
} from "@/lib/lifecycle";

function page(path, extra = {}) {
  return { title: path, path, ...extra };
}

function phasePage(order, phaseId, status) {
  return page(`/wiki/plans/lifecycle/phase-0${order}-${phaseId}.mdx`, {
    status,
    frontmatter: { phaseId, phaseOrder: String(order) },
  });
}

// --- Descriptor shape ---------------------------------------------------------
assert.equal(LIFECYCLE_PHASES.length, 6, "there must be exactly 6 lifecycle phases");
LIFECYCLE_PHASES.forEach((phase, index) => {
  assert.equal(phase.phaseOrder, index + 1, `phaseOrder must be sequential 1..6 (${phase.phaseId})`);
  assert.ok(["planning", "execute"].includes(phase.archetype), `archetype valid for ${phase.phaseId}`);
  assert.ok(["childPlan", "manual", "import-validated"].includes(phase.gate), `gate valid for ${phase.phaseId}`);
  assert.ok(Array.isArray(phase.skills) && phase.skills.length > 0, `skills present for ${phase.phaseId}`);
});
assert.equal(LIFECYCLE_PHASES[0].phaseId, "purpose");
assert.equal(LIFECYCLE_PHASES[0].gate, "import-validated");
assert.equal(phaseDescriptor("backend-arch")?.gate, "manual");
assert.equal(phaseDescriptor("design-system")?.childPlan, "/wiki/plans/design-system/index.mdx");

// --- Empty wiki: phase 1 is active, all else locked ---------------------------
{
  const phases = lifecyclePhases([]);
  assert.equal(activeLifecyclePhase([])?.phaseId, "purpose", "purpose is active with no pages");
  assert.equal(phases[0].status, "active");
  assert.ok(phases.slice(1).every((p) => p.status === "locked"), "downstream phases locked");
}

// --- import-validated gate (phase 1) ------------------------------------------
{
  const purpose = phaseDescriptor("purpose");
  assert.equal(phaseGateCleared(purpose, []), false, "purpose not cleared by default");
  assert.equal(
    phaseGateCleared(purpose, [], { importValidated: true }),
    true,
    "purpose clears via importValidated signal",
  );
  assert.equal(
    phaseGateCleared(purpose, [phasePage(1, "purpose", "complete")]),
    true,
    "purpose clears when its page is complete",
  );
  // With phase 1 cleared by signal, active advances to design-system.
  assert.equal(activeLifecyclePhase([], { importValidated: true })?.phaseId, "design-system");
}

// --- manual gate (phase 4) ----------------------------------------------------
{
  const backend = phaseDescriptor("backend-arch");
  assert.equal(phaseGateCleared(backend, [phasePage(4, "backend-arch", "active")]), false, "manual gate not cleared while active");
  assert.equal(phaseGateCleared(backend, [phasePage(4, "backend-arch", "complete")]), true, "manual gate clears when page complete");
}

// --- childPlan gate (phase 2) -------------------------------------------------
{
  const design = phaseDescriptor("design-system");
  // Phase page complete but child sub-plan missing -> not cleared.
  assert.equal(
    phaseGateCleared(design, [phasePage(2, "design-system", "complete")]),
    false,
    "childPlan gate needs the linked sub-plan to be complete",
  );
  // Phase page complete AND child sub-plan complete -> cleared.
  const withChild = [
    phasePage(2, "design-system", "complete"),
    page("/wiki/plans/design-system/index.mdx", { status: "complete" }),
  ];
  assert.equal(phaseGateCleared(design, withChild), true, "childPlan gate clears when sub-plan complete");
  // Child present but incomplete -> not cleared.
  const childIncomplete = [
    phasePage(2, "design-system", "complete"),
    page("/wiki/plans/design-system/index.mdx", { status: "active" }),
  ];
  assert.equal(phaseGateCleared(design, childIncomplete), false, "incomplete sub-plan keeps the gate closed");
}

// --- monotonic active-phase progression ---------------------------------------
{
  const pages = [
    phasePage(1, "purpose", "complete"),
    phasePage(2, "design-system", "complete"),
    page("/wiki/plans/design-system/index.mdx", { status: "complete" }),
    phasePage(3, "ui-mocks", "active"),
  ];
  const active = activeLifecyclePhase(pages);
  assert.equal(active?.phaseId, "ui-mocks", "active advances to the first uncleared phase");
  const resolved = lifecyclePhases(pages);
  assert.equal(resolved.find((p) => p.phaseId === "purpose").status, "complete");
  assert.equal(resolved.find((p) => p.phaseId === "design-system").status, "complete");
  assert.equal(resolved.find((p) => p.phaseId === "ui-mocks").status, "active");
  assert.equal(resolved.find((p) => p.phaseId === "backend-arch").status, "locked");
}

console.log("lifecycle-derivation-smoke: ok");
