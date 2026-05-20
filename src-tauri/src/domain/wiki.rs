use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "wiki",
        node_reference: "src/server.js, src/init.js",
        responsibilities: &[
            "repo-visible HTML wiki file reads",
            "wiki page listing and title extraction",
            "project-scoped wiki links",
            "plan summary and status parsing",
        ],
        parity_gate: "project wiki links and plan status smoke equivalents",
    }
}
