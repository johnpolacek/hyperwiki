//! Backend mirror of src/lib/lifecycle.ts. Computes the canonical 6-phase product
//! lifecycle state (active phase + per-phase gate status) from the wiki pages, so
//! the project contract (and its MCP surface) reports phase state without agents
//! scraping rendered MDX. The gate algorithm here MUST stay behaviorally
//! equivalent to phaseGateCleared/activeLifecyclePhase in the TypeScript module.

use std::path::Path;

use serde::Serialize;

use crate::domain::wiki::{list_wiki_pages, WikiPage};

struct PhaseDescriptor {
    phase_id: &'static str,
    label: &'static str,
    phase_order: u8,
    gate: &'static str, // "childPlan" | "manual" | "import-validated"
    child_plan: Option<&'static str>,
}

const LIFECYCLE_PHASES: [PhaseDescriptor; 6] = [
    PhaseDescriptor {
        phase_id: "purpose",
        label: "Purpose & User Stories",
        phase_order: 1,
        gate: "import-validated",
        child_plan: None,
    },
    PhaseDescriptor {
        phase_id: "design-system",
        label: "Design System",
        phase_order: 2,
        gate: "childPlan",
        child_plan: Some("/wiki/plans/design-system/index.mdx"),
    },
    PhaseDescriptor {
        phase_id: "ui-mocks",
        label: "UI Mocks",
        phase_order: 3,
        gate: "childPlan",
        child_plan: Some("/wiki/plans/ui-mocks/index.mdx"),
    },
    PhaseDescriptor {
        phase_id: "backend-arch",
        label: "Backend Architecture",
        phase_order: 4,
        gate: "manual",
        child_plan: None,
    },
    PhaseDescriptor {
        phase_id: "onboarding",
        label: "Onboarding",
        phase_order: 5,
        gate: "childPlan",
        child_plan: Some("/wiki/plans/onboarding/index.mdx"),
    },
    PhaseDescriptor {
        phase_id: "mvp-views",
        label: "MVP Views",
        phase_order: 6,
        gate: "childPlan",
        child_plan: Some("/wiki/plans/mvp/index.mdx"),
    },
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LifecyclePhaseState {
    pub phase_id: String,
    pub phase_order: u8,
    pub label: String,
    pub gate: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub child_plan: Option<String>,
    pub gate_cleared: bool,
    pub status: String, // "complete" | "active" | "locked"
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_phase_id: Option<String>,
    pub phases: Vec<LifecyclePhaseState>,
}

pub fn lifecycle_state(root: impl AsRef<Path>, import_validated: bool) -> LifecycleState {
    let pages = list_wiki_pages(root.as_ref(), None).pages;
    lifecycle_state_from_pages(&pages, import_validated)
}

pub fn lifecycle_state_from_pages(pages: &[WikiPage], import_validated: bool) -> LifecycleState {
    let active = LIFECYCLE_PHASES
        .iter()
        .find(|phase| !gate_cleared(phase, pages, import_validated));
    let phases = LIFECYCLE_PHASES
        .iter()
        .map(|descriptor| {
            let cleared = gate_cleared(descriptor, pages, import_validated);
            let is_active = active.map_or(false, |phase| phase.phase_id == descriptor.phase_id);
            let status = if cleared {
                "complete"
            } else if is_active {
                "active"
            } else {
                "locked"
            };
            LifecyclePhaseState {
                phase_id: descriptor.phase_id.to_string(),
                phase_order: descriptor.phase_order,
                label: descriptor.label.to_string(),
                gate: descriptor.gate.to_string(),
                child_plan: descriptor.child_plan.map(str::to_string),
                gate_cleared: cleared,
                status: status.to_string(),
            }
        })
        .collect();
    LifecycleState {
        active_phase_id: active.map(|phase| phase.phase_id.to_string()),
        phases,
    }
}

fn gate_cleared(phase: &PhaseDescriptor, pages: &[WikiPage], import_validated: bool) -> bool {
    let phase_complete = find_phase_page(phase, pages).map_or(false, page_complete);
    match phase.gate {
        "manual" => phase_complete,
        "import-validated" => phase_complete || import_validated,
        "childPlan" => {
            if !phase_complete {
                return false;
            }
            match phase.child_plan {
                None => true,
                Some(child) => find_page_by_path(pages, child).map_or(false, page_complete),
            }
        }
        _ => false,
    }
}

fn page_complete(page: &WikiPage) -> bool {
    page.status
        .as_deref()
        .map(|status| status.replace("completed", "complete"))
        .as_deref()
        == Some("complete")
}

fn is_phase_page(page: &WikiPage) -> bool {
    page.path.contains("/wiki/plans/lifecycle/phase-")
}

fn find_phase_page<'a>(phase: &PhaseDescriptor, pages: &'a [WikiPage]) -> Option<&'a WikiPage> {
    if let Some(page) = pages.iter().find(|page| {
        is_phase_page(page) && page.frontmatter.get("phaseId").map(String::as_str) == Some(phase.phase_id)
    }) {
        return Some(page);
    }
    let prefix = format!("/wiki/plans/lifecycle/phase-0{}-", phase.phase_order);
    pages.iter().find(|page| page.path.contains(&prefix))
}

fn normalize_plan_key(path: &str) -> &str {
    path.strip_suffix("/index.mdx").unwrap_or(path)
}

fn find_page_by_path<'a>(pages: &'a [WikiPage], wiki_path: &str) -> Option<&'a WikiPage> {
    let target = normalize_plan_key(wiki_path);
    pages
        .iter()
        .find(|page| normalize_plan_key(&page.path).ends_with(target))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn page(path: &str, status: Option<&str>, phase_id: Option<&str>) -> WikiPage {
        let mut frontmatter = BTreeMap::new();
        if let Some(id) = phase_id {
            frontmatter.insert("phaseId".to_string(), id.to_string());
        }
        WikiPage {
            title: path.to_string(),
            summary: Vec::new(),
            path: path.to_string(),
            source_path: path.to_string(),
            format: "mdx".to_string(),
            frontmatter,
            headings: Vec::new(),
            links: Vec::new(),
            component_refs: Vec::new(),
            validation_warnings: Vec::new(),
            status: status.map(str::to_string),
        }
    }

    #[test]
    fn fresh_lifecycle_makes_purpose_active() {
        let pages = vec![
            page("/wiki/plans/lifecycle/index.mdx", Some("active"), None),
            page("/wiki/plans/lifecycle/phase-01-purpose.mdx", Some("active"), Some("purpose")),
            page("/wiki/plans/lifecycle/phase-02-design-system.mdx", Some("planned"), Some("design-system")),
        ];
        let state = lifecycle_state_from_pages(&pages, false);
        assert_eq!(state.active_phase_id.as_deref(), Some("purpose"));
        assert_eq!(state.phases.len(), 6);
        assert_eq!(state.phases[0].status, "active");
        assert_eq!(state.phases[1].status, "locked");
    }

    #[test]
    fn import_validated_clears_phase_one() {
        let pages = vec![page(
            "/wiki/plans/lifecycle/phase-01-purpose.mdx",
            Some("active"),
            Some("purpose"),
        )];
        let state = lifecycle_state_from_pages(&pages, true);
        assert_eq!(state.active_phase_id.as_deref(), Some("design-system"));
        assert_eq!(state.phases[0].status, "complete");
    }

    #[test]
    fn child_plan_gate_requires_subplan_complete() {
        let mut pages = vec![page(
            "/wiki/plans/lifecycle/phase-02-design-system.mdx",
            Some("complete"),
            Some("design-system"),
        )];
        // Phase 1 cleared so phase 2 is reachable.
        pages.push(page("/wiki/plans/lifecycle/phase-01-purpose.mdx", Some("complete"), Some("purpose")));
        // Sub-plan missing -> phase 2 not cleared.
        let state = lifecycle_state_from_pages(&pages, false);
        assert_eq!(state.active_phase_id.as_deref(), Some("design-system"));
        // Add a complete sub-plan -> phase 2 clears, active advances.
        pages.push(page("/wiki/plans/design-system/index.mdx", Some("complete"), None));
        let state = lifecycle_state_from_pages(&pages, false);
        assert_eq!(state.active_phase_id.as_deref(), Some("ui-mocks"));
    }
}
