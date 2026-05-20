use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "sessions",
        node_reference: "src/sessions.js",
        responsibilities: &[
            "ignored session metadata",
            "terminal layout retention",
            "session rename, close, export, and prune",
            "plan-scoped restore state",
        ],
        parity_gate: "session-retention smoke equivalent",
    }
}
