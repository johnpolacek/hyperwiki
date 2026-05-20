use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "previews",
        node_reference: "src/server.js",
        responsibilities: &[
            "Portless route parsing",
            "exact checkout preview status",
            "Run Dev lifecycle",
            "runtime URL detection from terminal output",
        ],
        parity_gate: "app-preview smoke equivalent and manual Portless dogfood",
    }
}
