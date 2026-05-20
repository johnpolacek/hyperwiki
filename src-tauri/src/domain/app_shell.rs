use super::DomainSurface;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "app-shell",
        node_reference: "src/cli.js, src/launch.js, src/open.js, src/server.js",
        responsibilities: &[
            "desktop startup and app window lifecycle",
            "compatibility CLI entrypoints",
            "workspace route resolution",
            "external URL and project-folder opening",
        ],
        parity_gate: "launch smoke equivalent plus packaged desktop launch dogfood",
    }
}
