//! Agent provider detection and selection.
//!
//! hyperwiki supports more than one local coding agent CLI (Codex and Claude
//! Code). The single source of truth for which provider a project uses is the
//! `role == "agent"` panel command stored in `.hyperwiki/config.json`. The
//! terminal launches that command verbatim, and the programmatic import-planning
//! flow derives its transport from the same field. PATH auto-detection only
//! picks the default command at create time and gates the provider toggle; it
//! never overrides a stored command.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentProvider {
    Codex,
    Claude,
}

/// Canonical launch command for each provider when written into project config.
pub const CODEX_LAUNCH_COMMAND: &str = "codex --yolo";
pub const CLAUDE_LAUNCH_COMMAND: &str = "claude --dangerously-skip-permissions";

fn detection_cache() -> &'static Mutex<HashMap<String, bool>> {
    static CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Returns true when `bin` is available to spawned terminals — either resolvable
/// on the inherited PATH or present in a common per-user bin directory. The
/// latter mirrors how terminals augment PATH (see `terminals::augmented_path`)
/// so a CLI installed in `~/.local/bin` is detected even when a GUI-launched
/// hyperwiki inherits a PATH that omits it. Memoized for the process lifetime.
pub fn binary_on_path(bin: &str) -> bool {
    if let Ok(cache) = detection_cache().lock() {
        if let Some(found) = cache.get(bin) {
            return *found;
        }
    }
    let found = which_resolves(bin) || in_user_bin_dir(bin);
    if let Ok(mut cache) = detection_cache().lock() {
        cache.insert(bin.to_string(), found);
    }
    found
}

fn which_resolves(bin: &str) -> bool {
    Command::new("which")
        .arg(bin)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn in_user_bin_dir(bin: &str) -> bool {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return false;
    };
    [".local/bin", "bin", ".cargo/bin", ".bun/bin"]
        .iter()
        .any(|relative| home.join(relative).join(bin).is_file())
}

/// Resolve the provider a project is configured to use.
pub fn provider_for_project(project: &crate::domain::projects::ProjectRecord) -> AgentProvider {
    provider_from_command(agent_command_for_root(&project.root).as_deref())
}

/// Map an agent launch command to a provider by its leading binary name.
/// Anything that is not `claude` (including a missing command and `codex`)
/// resolves to Codex so existing projects keep their current behavior.
pub fn provider_from_command(command: Option<&str>) -> AgentProvider {
    match command.and_then(first_token_basename).as_deref() {
        Some("claude") => AgentProvider::Claude,
        _ => AgentProvider::Codex,
    }
}

fn agent_command_for_root(root: &Path) -> Option<String> {
    crate::domain::previews::layout_config_for_root(root)
        .panels
        .into_iter()
        .find(|panel| panel.role == "agent" || panel.name == "agent")
        .and_then(|panel| panel.command)
}

fn first_token_basename(command: &str) -> Option<String> {
    let token = command.split_whitespace().next()?;
    let base = token.rsplit(['/', '\\']).next().unwrap_or(token);
    if base.is_empty() {
        None
    } else {
        Some(base.to_string())
    }
}

/// Rewrite the `role == "agent"` panel command in `.hyperwiki/config.json`,
/// preserving all other config fields. Used by the provider toggle so both the
/// terminal command and the import-planning transport switch together.
pub fn set_agent_command(root: &Path, command: &str) -> Result<(), (u16, String)> {
    let config_path = root.join(".hyperwiki").join("config.json");
    let raw = fs::read_to_string(&config_path)
        .map_err(|error| (404, format!("Could not read project config: {error}")))?;
    let mut config: Value = serde_json::from_str(&raw)
        .map_err(|error| (500, format!("Invalid project config JSON: {error}")))?;
    if !config["layout"].is_object() {
        config["layout"] = json!({});
    }
    if !config["layout"]["panels"].is_array() {
        config["layout"]["panels"] = json!([]);
    }
    let panels = config["layout"]["panels"]
        .as_array_mut()
        .ok_or_else(|| (500, "Project config layout.panels is not an array.".to_string()))?;
    let mut updated = false;
    for panel in panels.iter_mut() {
        let role = panel["role"].as_str().or_else(|| panel["name"].as_str());
        if role == Some("agent") {
            panel["command"] = json!(command);
            updated = true;
            break;
        }
    }
    if !updated {
        panels.push(json!({ "name": "agent", "role": "agent", "command": command }));
    }
    let serialized = serde_json::to_string_pretty(&config)
        .map_err(|error| (500, format!("Failed to serialize project config: {error}")))?;
    fs::write(&config_path, format!("{serialized}\n"))
        .map_err(|error| (500, format!("Failed to write project config: {error}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_from_command_detects_claude() {
        assert_eq!(
            provider_from_command(Some("claude --dangerously-skip-permissions")),
            AgentProvider::Claude
        );
        assert_eq!(
            provider_from_command(Some("/opt/homebrew/bin/claude")),
            AgentProvider::Claude
        );
    }

    #[test]
    fn provider_from_command_defaults_to_codex() {
        assert_eq!(provider_from_command(Some("codex --yolo")), AgentProvider::Codex);
        assert_eq!(provider_from_command(Some("./bin/codex")), AgentProvider::Codex);
        assert_eq!(provider_from_command(Some("some-other-agent")), AgentProvider::Codex);
        assert_eq!(provider_from_command(None), AgentProvider::Codex);
        assert_eq!(provider_from_command(Some("")), AgentProvider::Codex);
    }
}
