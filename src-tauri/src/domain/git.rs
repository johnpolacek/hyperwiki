use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "git",
        node_reference: "src/git.js, scripts/worktree.mjs",
        responsibilities: &[
            "repo context and dirty state",
            "Git initialization onboarding",
            "branch and worktree detection",
            "worktree creation command orchestration",
        ],
        parity_gate: "git onboarding and worktree launch smoke equivalents",
    }
}
