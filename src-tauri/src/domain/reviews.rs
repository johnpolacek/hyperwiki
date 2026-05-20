use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "reviews",
        node_reference: "src/server.js",
        responsibilities: &[
            "named review workflow discovery",
            "review prompt preparation",
            "dry-run review payloads",
            "review prompt routing to active agent sessions",
        ],
        parity_gate: "review-workflows smoke equivalent",
    }
}
