use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "settings",
        node_reference: "src/settings.js",
        responsibilities: &[
            "global settings persistence",
            "theme token generation",
            "Soul and Memory controls",
            "managed AGENTS.md sync",
        ],
        parity_gate: "settings manual pass plus managed block replacement tests",
    }
}
