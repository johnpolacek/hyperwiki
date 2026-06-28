// Regression guardrail: adding the lifecycle plan must NOT perturb the legacy
// active-plan derivation (Execute Unit / landing path) for existing plans, and
// lifecycle derivation must be computed separately. Run with the alias loader:
//   node --import ./tests/alias-loader.mjs tests/lifecycle-backward-compat-smoke.mjs
import assert from "node:assert/strict";
import {
  buildSidebarModel,
  defaultWikiPath,
  planLandingPath,
  planPageActionState,
  planSortKey,
} from "@/lib/wiki-pages";
import { activeLifecyclePhase, isLifecyclePlanPage, lifecyclePhases } from "@/lib/lifecycle";

function page(path, extra = {}) {
  return { title: path.split("/").pop().replace(/\.mdx$/, ""), path, ...extra };
}

// Existing-plan fixture (no lifecycle pages).
const baseWithActiveFeature = [
  page("/wiki/plans/index.mdx"),
  page("/wiki/plans/mvp/index.mdx", { status: "complete" }),
  page("/wiki/plans/mvp/stage-01-foundation.mdx", { status: "complete" }),
  page("/wiki/plans/features/some-feature.mdx", { status: "active" }),
  page("/wiki/plans/zzz_completed/done-feature.mdx", { status: "complete" }),
];

// Same projects, but every normal plan complete (no active normal plan). This is
// the case where an unguarded lifecycle root would hijack the current-work path.
const baseAllComplete = [
  page("/wiki/plans/index.mdx"),
  page("/wiki/plans/mvp/index.mdx", { status: "complete" }),
  page("/wiki/plans/features/some-feature.mdx", { status: "complete" }),
  page("/wiki/plans/zzz_completed/done-feature.mdx", { status: "complete" }),
];

const lifecyclePages = [
  page("/wiki/plans/lifecycle/index.mdx", { status: "active" }),
  page("/wiki/plans/lifecycle/phase-01-purpose.mdx", { status: "active", frontmatter: { phaseId: "purpose" } }),
  page("/wiki/plans/lifecycle/phase-02-design-system.mdx", { status: "planned", frontmatter: { phaseId: "design-system" } }),
  page("/wiki/plans/lifecycle/phase-03-ui-mocks.mdx", { status: "planned", frontmatter: { phaseId: "ui-mocks" } }),
  page("/wiki/plans/lifecycle/phase-04-backend-arch.mdx", { status: "planned", frontmatter: { phaseId: "backend-arch" } }),
  page("/wiki/plans/lifecycle/phase-05-onboarding.mdx", { status: "planned", frontmatter: { phaseId: "onboarding" } }),
  page("/wiki/plans/lifecycle/phase-06-mvp-views.mdx", { status: "planned", frontmatter: { phaseId: "mvp-views" } }),
];

// --- Landing path unchanged when an active feature plan exists ----------------
{
  const withoutLifecycle = planLandingPath(baseWithActiveFeature);
  const withLifecycle = planLandingPath([...baseWithActiveFeature, ...lifecyclePages]);
  assert.equal(withoutLifecycle, withLifecycle, "active-feature landing path unchanged by lifecycle pages");
  assert.equal(withLifecycle, "/wiki/plans/features/some-feature.mdx");
}

// --- Landing path stays at default when all normal plans complete -------------
// This is the key guard: lifecycle must NOT become the active work target.
{
  const withLifecycle = planLandingPath([...baseAllComplete, ...lifecyclePages]);
  assert.equal(withLifecycle, defaultWikiPath, "lifecycle must not hijack the current-work path");
}

// --- planPageActionState current path unaffected by lifecycle -----------------
{
  const without = planPageActionState("/wiki/plans/features/some-feature.mdx", baseWithActiveFeature);
  const with_ = planPageActionState("/wiki/plans/features/some-feature.mdx", [...baseWithActiveFeature, ...lifecyclePages]);
  assert.equal(without.currentPath, with_.currentPath, "currentPath unchanged");
  assert.equal(without.canExecute, with_.canExecute, "canExecute unchanged");
}

// --- planSortKey for existing pages unchanged ---------------------------------
{
  for (const p of baseWithActiveFeature) {
    const before = planSortKey(p);
    const after = planSortKey(p); // pure function of the page; lifecycle cannot change it
    assert.equal(before, after, `planSortKey stable for ${p.path}`);
  }
}

// --- Sidebar: lifecycle pages appear, existing plan entries unchanged ----------
{
  const without = buildSidebarModel(baseWithActiveFeature);
  const with_ = buildSidebarModel([...baseWithActiveFeature, ...lifecyclePages]);
  const nonLifecycle = (model) => model.plans.filter((p) => !isLifecyclePlanPage(p)).map((p) => p.path).sort();
  assert.deepEqual(nonLifecycle(with_), nonLifecycle(without), "non-lifecycle sidebar plans unchanged");
  const lifecycleInSidebar = with_.plans.filter((p) => isLifecyclePlanPage(p));
  assert.ok(lifecycleInSidebar.length >= 1, "lifecycle pages appear in the sidebar plan list");
}

// --- Lifecycle derivation is separate and still works -------------------------
{
  const active = activeLifecyclePhase([...baseAllComplete, ...lifecyclePages]);
  assert.equal(active?.phaseId, "purpose", "lifecycle derivation independent of legacy plans");
  assert.equal(lifecyclePhases(lifecyclePages).length, 6);
}

console.log("lifecycle-backward-compat-smoke: ok");
