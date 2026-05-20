use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "verification",
        node_reference: "src/server.js",
        responsibilities: &[
            "workspace summary",
            "verification loop inference",
            "runtime verification evidence",
            "project contract composition",
        ],
        parity_gate: "verification and project-contract smoke equivalents",
    }
}
