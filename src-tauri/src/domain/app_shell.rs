use super::DomainSurface;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "app-shell",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "desktop startup and app window lifecycle",
            "compatibility CLI entrypoints",
            "workspace route resolution",
            "external URL and project-folder opening",
        ],
        parity_gate: "launch smoke equivalent plus packaged desktop launch dogfood",
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppShellSummary {
    pub product_name: &'static str,
    pub window_title: &'static str,
    pub runtime: &'static str,
    pub local_only: bool,
    pub actions: Vec<AppShellAction>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppShellAction {
    pub id: &'static str,
    pub label: &'static str,
    pub boundary: &'static str,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFilesRequest {
    #[serde(default)]
    pub files: Vec<DroppedFile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFile {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DroppedFilesResponse {
    pub files: Vec<SavedDroppedFile>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SavedDroppedFile {
    pub name: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTargetRequest {
    pub target: String,
}

pub fn app_shell_summary() -> AppShellSummary {
    AppShellSummary {
        product_name: "hyperwiki",
        window_title: "hyperwiki",
        runtime: "tauri",
        local_only: true,
        actions: vec![
            action("open-preview", "Open Preview", "external-url"),
            action("reveal-project", "Reveal Project", "local-filesystem"),
            action("save-drop", "Save Dropped File", "ignored-runtime-state"),
        ],
    }
}

pub fn save_dropped_files(
    root: impl AsRef<Path>,
    request: DroppedFilesRequest,
) -> Result<DroppedFilesResponse, String> {
    let drop_root = root.as_ref().join(".hyperwiki").join("state").join("drops");
    fs::create_dir_all(&drop_root).map_err(|error| error.to_string())?;
    let mut saved = Vec::new();
    for file in request.files {
        let name = safe_drop_name(&file.name);
        if file.content.is_empty() {
            continue;
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.content.as_bytes())
            .map_err(|error| error.to_string())?;
        let file_path =
            drop_root.join(format!("{}-{}-{name}", timestamp_prefix(), random_suffix()));
        fs::write(&file_path, bytes).map_err(|error| error.to_string())?;
        saved.push(SavedDroppedFile {
            name,
            path: file_path,
        });
    }
    Ok(DroppedFilesResponse { files: saved })
}

pub fn open_external_target(target: &str) -> Result<serde_json::Value, String> {
    if !(target.starts_with("http://") || target.starts_with("https://")) {
        return Err("Only http and https URLs can be opened externally.".to_string());
    }
    #[cfg(target_os = "macos")]
    let result = open_url_in_default_browser(target);
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(target).output();
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", target]).output();
    result
        .map_err(|error| error.to_string())
        .and_then(|output| {
            output
                .status
                .success()
                .then_some(())
                .ok_or_else(|| String::from_utf8_lossy(&output.stderr).trim().to_string())
        })?;
    Ok(serde_json::json!({ "ok": true, "target": target }))
}

#[cfg(target_os = "macos")]
fn open_url_in_default_browser(target: &str) -> std::io::Result<std::process::Output> {
    if let Some(bundle_id) = default_browser_bundle_id() {
        let result = Command::new("open")
            .args(["-b", bundle_id.as_str(), target])
            .output();
        if result.as_ref().is_ok_and(|output| output.status.success()) {
            return result;
        }
    }
    Command::new("open").arg(target).output()
}

#[cfg(target_os = "macos")]
fn default_browser_bundle_id() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let launch_services =
        Path::new(&home).join("Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist");
    let output = Command::new("plutil")
        .args(["-extract", "LSHandlers", "json", "-o", "-"])
        .arg(launch_services)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let handlers = serde_json::from_slice::<serde_json::Value>(&output.stdout).ok()?;
    handlers.as_array()?.iter().find_map(|handler| {
        let scheme = handler.get("LSHandlerURLScheme")?.as_str()?;
        if scheme != "https" && scheme != "http" {
            return None;
        }
        let bundle_id = handler.get("LSHandlerRoleAll")?.as_str()?.trim();
        (!bundle_id.is_empty() && bundle_id != "-").then(|| bundle_id.to_string())
    })
}

pub fn reveal_project_folder(root: impl AsRef<Path>) -> Result<serde_json::Value, String> {
    let root = root.as_ref();
    if !root.is_dir() {
        return Err("Project folder is unavailable.".to_string());
    }
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(root).output();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(root).output();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(root).output();
    result
        .map_err(|error| error.to_string())
        .and_then(|output| {
            output
                .status
                .success()
                .then_some(())
                .ok_or_else(|| String::from_utf8_lossy(&output.stderr).trim().to_string())
        })?;
    Ok(serde_json::json!({ "ok": true, "path": root }))
}

fn action(id: &'static str, label: &'static str, boundary: &'static str) -> AppShellAction {
    AppShellAction {
        id,
        label,
        boundary,
    }
}

fn safe_drop_name(name: &str) -> String {
    let fallback = "dropped-file";
    let leaf = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(fallback);
    let safe = leaf
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    if safe.is_empty() {
        fallback.to_string()
    } else {
        safe
    }
}

fn timestamp_prefix() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn random_suffix() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("{:08x}", (duration.as_nanos() & 0xffff_ffff) as u64))
        .unwrap_or_else(|_| "00000000".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn app_shell_summary_exposes_local_desktop_actions() {
        let summary = app_shell_summary();
        assert_eq!(summary.product_name, "hyperwiki");
        assert_eq!(summary.window_title, "hyperwiki");
        assert_eq!(summary.runtime, "tauri");
        assert!(summary.local_only);
        assert!(summary
            .actions
            .iter()
            .any(|action| action.id == "save-drop"));
    }

    #[test]
    fn saves_dropped_files_under_ignored_runtime_state() {
        let root = temp_root("drop");
        let response = save_dropped_files(
            &root,
            DroppedFilesRequest {
                files: vec![DroppedFile {
                    name: "../unsafe name.txt".to_string(),
                    content: "aGVsbG8=".to_string(),
                }],
            },
        )
        .unwrap();

        assert_eq!(response.files.len(), 1);
        assert_eq!(response.files[0].name, "unsafe-name.txt");
        assert!(response.files[0]
            .path
            .starts_with(root.join(".hyperwiki").join("state").join("drops")));
        assert_eq!(
            fs::read_to_string(&response.files[0].path).unwrap(),
            "hello"
        );
    }

    #[test]
    fn external_open_rejects_non_url_targets_before_shelling_out() {
        let error = open_external_target("/tmp/not-a-url").unwrap_err();
        assert!(error.contains("Only http and https"));
    }

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-tauri-{label}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
