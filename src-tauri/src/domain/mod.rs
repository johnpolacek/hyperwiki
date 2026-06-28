pub mod adopt;
pub mod agent_provider;
pub mod app_shell;
pub mod bugs;
pub mod claude_agent;
pub mod codex_app_server;
pub mod explorations;
pub mod feedback;
pub mod git;
pub mod import_onboarding_runtime;
pub mod import_planning;
pub mod lifecycle;
pub mod mcp;
pub mod previews;
pub mod project_env;
pub mod projects;
pub mod reviews;
pub mod screenshot_reviews;
pub mod screenshots;
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
    pub runtime_owner: &'static str,
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
        bugs::surface(),
        // Import onboarding is part of the import-planning surface and is
        // intentionally not listed as a separate user-facing domain.
        import_planning::surface(),
        sessions::surface(),
        terminals::surface(),
        previews::surface(),
        project_env::surface(),
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
    fn all_current_surfaces_have_rust_owners() {
        let ids = surface_ids();
        assert_eq!(
            ids,
            vec![
                "app-shell",
                "projects",
                "wiki",
                "settings",
                "git",
                "bugs",
                "import-planning",
                "sessions",
                "terminals",
                "previews",
                "project-env",
                "verification",
                "reviews",
                "mcp"
            ]
        );
    }

    #[test]
    fn surface_contract_is_serializable() {
        let value = serde_json::to_value(surfaces()).expect("surfaces should serialize");
        assert_eq!(value.as_array().expect("array").len(), 14);
        assert_eq!(value[0]["id"], "app-shell");
        assert_eq!(value[0]["runtimeOwner"], "rust-tauri");
    }
}
