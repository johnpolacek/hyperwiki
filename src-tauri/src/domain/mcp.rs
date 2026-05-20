use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "mcp",
        node_reference: "src/mcp.js, src/server.js",
        responsibilities: &[
            "MCP surface contract",
            "read-only resource and tool definitions",
            "stdio Content-Length JSON-RPC transport",
            "permissioned action tool boundaries",
        ],
        parity_gate: "MCP surface and transport smoke equivalents",
    }
}
