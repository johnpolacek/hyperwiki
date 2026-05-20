use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "terminals",
        node_reference: "src/pty.js, src/server.js",
        responsibilities: &[
            "PTY and pipe-backed process lifecycle",
            "terminal input, output, resize, and replay",
            "agent launch command enforcement",
            "prompt submission into active agent sessions",
        ],
        parity_gate: "PTY smoke plus agent execute launch guard browser coverage",
    }
}
