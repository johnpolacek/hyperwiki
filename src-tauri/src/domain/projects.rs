use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "projects",
        node_reference: "src/projects.js, src/init.js, src/reset.js",
        responsibilities: &[
            "user-level project registry",
            "project and worktree slug resolution",
            "project creation from briefs",
            "project removal and stale-root handling",
        ],
        parity_gate: "project removal, project links, init, and reset smoke equivalents",
    }
}
