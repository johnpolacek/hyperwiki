pub mod app_shell;
pub mod git;
pub mod mcp;
pub mod previews;
pub mod projects;
pub mod reviews;
pub mod sessions;
pub mod settings;
pub mod terminals;
pub mod verification;
pub mod wiki;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainSurface {
    pub id: &'static str,
    pub node_reference: &'static str,
    pub responsibilities: &'static [&'static str],
    pub parity_gate: &'static str,
}

pub fn surfaces() -> Vec<DomainSurface> {
    vec![
        app_shell::surface(),
        projects::surface(),
        wiki::surface(),
        settings::surface(),
        git::surface(),
        sessions::surface(),
        terminals::surface(),
        previews::surface(),
        verification::surface(),
        reviews::surface(),
        mcp::surface(),
    ]
}

pub fn surface_ids() -> Vec<&'static str> {
    surfaces().into_iter().map(|surface| surface.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_current_node_surfaces_have_rust_owners() {
        let ids = surface_ids();
        assert_eq!(
            ids,
            vec![
                "app-shell",
                "projects",
                "wiki",
                "settings",
                "git",
                "sessions",
                "terminals",
                "previews",
                "verification",
                "reviews",
                "mcp"
            ]
        );
    }

    #[test]
    fn surface_contract_is_serializable() {
        let value = serde_json::to_value(surfaces()).expect("surfaces should serialize");
        assert_eq!(value.as_array().expect("array").len(), 11);
        assert_eq!(value[0]["id"], "app-shell");
    }
}
