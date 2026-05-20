use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutConfig {
    pub panels: Vec<LayoutPanel>,
    pub dev: DevConfig,
    pub worktrees: WorktreeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPanel {
    pub name: String,
    pub role: String,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DevConfig {
    pub command: String,
    pub preview_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeConfig {
    pub workflow: String,
    pub preview_url_pattern: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreviewSummary {
    pub previews: Vec<AppPreview>,
    pub groups: Vec<AppPreviewGroup>,
    pub active_preview: Option<AppPreview>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreviewGroup {
    pub project_slug: String,
    pub name: String,
    pub previews: Vec<AppPreview>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreview {
    pub project_id: String,
    pub project_name: String,
    pub project_slug: String,
    pub worktree_slug: String,
    pub root: PathBuf,
    pub active: bool,
    pub available: bool,
    pub url: String,
    pub expected_url: String,
    pub start_command: String,
    pub status: String,
    pub running: bool,
    pub can_start: bool,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<PortlessRoute>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortlessRoute {
    pub url: String,
    pub hostname: String,
    pub target: String,
    pub pid: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PortlessRoutes {
    available: bool,
    routes: Vec<PortlessRoute>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HyperwikiConfig {
    #[serde(default)]
    project_name: Option<String>,
    #[serde(default)]
    dev: Option<RawDevConfig>,
    #[serde(default)]
    worktrees: Option<RawWorktreeConfig>,
    #[serde(default)]
    layout: Option<RawLayoutConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDevConfig {
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    preview_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawWorktreeConfig {
    #[serde(default)]
    workflow: Option<String>,
    #[serde(default)]
    preview_url_pattern: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLayoutConfig {
    #[serde(default)]
    panels: Vec<RawLayoutPanel>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLayoutPanel {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    command: Option<String>,
}

pub fn layout_config_for_root(root: impl AsRef<Path>) -> LayoutConfig {
    let root = root.as_ref();
    let config = read_config(root);
    let package_command = package_dev_command(root);
    let dev_command = config
        .dev
        .as_ref()
        .and_then(|dev| dev.command.as_deref())
        .filter(|command| !command.trim().is_empty())
        .map(ToString::to_string)
        .unwrap_or(package_command);
    let configured_panels = config
        .layout
        .as_ref()
        .map(|layout| layout.panels.as_slice())
        .unwrap_or_default();
    let panels = if configured_panels.is_empty() {
        fallback_panels(&config, &dev_command)
    } else {
        reconcile_configured_panels(configured_panels, &dev_command)
    };
    LayoutConfig {
        panels,
        dev: DevConfig {
            command: dev_command,
            preview_url: config
                .dev
                .and_then(|dev| dev.preview_url)
                .unwrap_or_default(),
        },
        worktrees: WorktreeConfig {
            workflow: config
                .worktrees
                .as_ref()
                .and_then(|worktrees| worktrees.workflow.clone())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "parallel-dev-worktrees".to_string()),
            preview_url_pattern: config
                .worktrees
                .and_then(|worktrees| worktrees.preview_url_pattern)
                .unwrap_or_default(),
        },
    }
}

pub fn app_preview_summary(
    registry: &crate::domain::projects::ProjectRegistry,
    active_project_id: Option<&str>,
) -> AppPreviewSummary {
    let projects = registry.list(active_project_id);
    let previews = projects
        .checkouts
        .iter()
        .map(app_preview_for_project)
        .collect::<Vec<_>>();
    AppPreviewSummary {
        active_preview: previews.iter().find(|preview| preview.active).cloned(),
        groups: group_previews(&previews),
        previews,
    }
}

pub fn app_preview_for_project(project: &crate::domain::projects::ProjectRecord) -> AppPreview {
    let layout = layout_config_for_root(&project.root);
    let expected_url = preview_url_for_project(project, &layout);
    let start_command = layout.dev.command.clone();
    let can_start = !start_command.is_empty();
    if expected_url.is_empty() {
        return preview_state(
            project,
            PreviewFields {
                url: String::new(),
                expected_url,
                start_command,
                status: "not-configured".to_string(),
                running: false,
                can_start: false,
                reason: "No app preview URL is configured.".to_string(),
                route: None,
            },
        );
    }

    let routes = portless_routes(&project.root);
    let hostname = hostname_for_url(&expected_url);
    let route = hostname
        .as_deref()
        .and_then(|hostname| {
            routes
                .routes
                .iter()
                .find(|route| route.hostname == hostname)
        })
        .cloned();
    if let Some(route) = route {
        return preview_state(
            project,
            PreviewFields {
                url: route.url.clone(),
                expected_url,
                start_command,
                status: "running".to_string(),
                running: true,
                can_start,
                reason: format!("Portless route is active for {}.", route.url),
                route: Some(route),
            },
        );
    }
    if !routes.available {
        return preview_state(
            project,
            PreviewFields {
                url: expected_url.clone(),
                expected_url,
                start_command,
                status: "unknown".to_string(),
                running: false,
                can_start,
                reason: routes
                    .error
                    .unwrap_or_else(|| "Portless route status is unavailable.".to_string()),
                route: None,
            },
        );
    }
    let reason = if can_start {
        format!(
            "No active Portless route for {}.",
            hostname.unwrap_or_default()
        )
    } else {
        "No dev command is configured for this project.".to_string()
    };
    preview_state(
        project,
        PreviewFields {
            url: expected_url.clone(),
            expected_url,
            start_command,
            status: if can_start {
                "stopped"
            } else {
                "not-startable"
            }
            .to_string(),
            running: false,
            can_start,
            reason,
            route: None,
        },
    )
}

pub fn parse_portless_routes(output: &str) -> Vec<PortlessRoute> {
    output
        .lines()
        .filter_map(parse_portless_route_line)
        .collect()
}

fn read_config(root: &Path) -> HyperwikiConfig {
    fs::read_to_string(root.join(".hyperwiki").join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<HyperwikiConfig>(&raw).ok())
        .unwrap_or(HyperwikiConfig {
            project_name: None,
            dev: None,
            worktrees: None,
            layout: None,
        })
}

fn package_dev_command(root: &Path) -> String {
    let Some(package_json) = fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
    else {
        return String::new();
    };
    if package_json
        .pointer("/scripts/dev")
        .and_then(|value| value.as_str())
        .is_none()
    {
        return String::new();
    }
    let manager = package_json
        .get("packageManager")
        .and_then(|value| value.as_str())
        .and_then(|value| value.split('@').next())
        .unwrap_or_default();
    if manager == "pnpm" {
        return "pnpm run dev".to_string();
    }
    if manager == "yarn" {
        return "yarn dev".to_string();
    }
    if manager == "bun" {
        return "bun run dev".to_string();
    }
    if root.join("pnpm-lock.yaml").exists() || command_available("pnpm", root) {
        return "pnpm run dev".to_string();
    }
    if root.join("yarn.lock").exists() {
        return "yarn dev".to_string();
    }
    if root.join("bun.lock").exists() || root.join("bun.lockb").exists() {
        return "bun run dev".to_string();
    }
    "npm run dev".to_string()
}

fn command_available(command: &str, cwd: &Path) -> bool {
    Command::new(command)
        .arg("--version")
        .current_dir(cwd)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn fallback_panels(config: &HyperwikiConfig, dev_command: &str) -> Vec<LayoutPanel> {
    let name = config.project_name.as_deref().unwrap_or("hyperwiki");
    let mut panels = Vec::from([
        LayoutPanel {
            name: "agent".to_string(),
            role: "agent".to_string(),
            command: None,
        },
        LayoutPanel {
            name: "shell".to_string(),
            role: "shell".to_string(),
            command: Some(format!("cd {}", shell_escape(name))),
        },
    ]);
    if !dev_command.is_empty() {
        panels.insert(
            1,
            LayoutPanel {
                name: "dev".to_string(),
                role: "dev".to_string(),
                command: Some(dev_command.to_string()),
            },
        );
    }
    panels
}

fn reconcile_configured_panels(panels: &[RawLayoutPanel], dev_command: &str) -> Vec<LayoutPanel> {
    let mut normalized = panels
        .iter()
        .map(|panel| {
            let role = panel
                .role
                .as_deref()
                .or(panel.name.as_deref())
                .unwrap_or("shell")
                .to_string();
            let command = if role == "dev"
                && panel.command.as_deref().unwrap_or("").is_empty()
                && !dev_command.is_empty()
            {
                Some(dev_command.to_string())
            } else {
                panel
                    .command
                    .clone()
                    .filter(|command| !command.trim().is_empty())
            };
            LayoutPanel {
                name: panel.name.clone().unwrap_or_else(|| role.clone()),
                role,
                command,
            }
        })
        .collect::<Vec<_>>();
    if !dev_command.is_empty() && !normalized.iter().any(|panel| panel.role == "dev") {
        let dev_panel = LayoutPanel {
            name: "dev".to_string(),
            role: "dev".to_string(),
            command: Some(dev_command.to_string()),
        };
        let cli_index = normalized.iter().position(|panel| panel.role == "shell");
        match cli_index {
            Some(index) => normalized.insert(index, dev_panel),
            None => normalized.push(dev_panel),
        }
    }
    normalized
}

fn preview_url_for_project(
    project: &crate::domain::projects::ProjectRecord,
    layout: &LayoutConfig,
) -> String {
    let worktree_slug = if project.worktree_slug.is_empty() {
        "main"
    } else {
        &project.worktree_slug
    };
    if worktree_slug != "main" && !layout.worktrees.preview_url_pattern.is_empty() {
        return layout
            .worktrees
            .preview_url_pattern
            .replace("<branch-slug>", worktree_slug);
    }
    layout.dev.preview_url.clone()
}

struct PreviewFields {
    url: String,
    expected_url: String,
    start_command: String,
    status: String,
    running: bool,
    can_start: bool,
    reason: String,
    route: Option<PortlessRoute>,
}

fn preview_state(
    project: &crate::domain::projects::ProjectRecord,
    preview: PreviewFields,
) -> AppPreview {
    AppPreview {
        project_id: project.id.clone(),
        project_name: project.name.clone(),
        project_slug: project.project_slug.clone(),
        worktree_slug: if project.worktree_slug.is_empty() {
            "main".to_string()
        } else {
            project.worktree_slug.clone()
        },
        root: project.root.clone(),
        active: project.active,
        available: project.available,
        url: preview.url,
        expected_url: preview.expected_url,
        start_command: preview.start_command,
        status: preview.status,
        running: preview.running,
        can_start: preview.can_start,
        reason: preview.reason,
        route: preview.route,
    }
}

fn portless_routes(cwd: &Path) -> PortlessRoutes {
    match Command::new("portless")
        .arg("list")
        .current_dir(cwd)
        .output()
    {
        Ok(output) if output.status.success() => PortlessRoutes {
            available: true,
            routes: parse_portless_routes(&String::from_utf8_lossy(&output.stdout)),
            error: None,
        },
        Ok(output) => PortlessRoutes {
            available: false,
            routes: Vec::new(),
            error: Some(
                non_empty_lossy(&output.stderr)
                    .or_else(|| non_empty_lossy(&output.stdout))
                    .unwrap_or_else(|| "Could not run `portless list`.".to_string()),
            ),
        },
        Err(error) => PortlessRoutes {
            available: false,
            routes: Vec::new(),
            error: Some(error.to_string()),
        },
    }
}

fn non_empty_lossy(bytes: &[u8]) -> Option<String> {
    let value = String::from_utf8_lossy(bytes).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn parse_portless_route_line(line: &str) -> Option<PortlessRoute> {
    let (left, right) = line.trim().split_once("->")?;
    let url = left.trim();
    let hostname = hostname_for_url(url)?;
    let right = right.trim();
    let (target, pid_part) = right.split_once("(pid")?;
    let pid = pid_part
        .trim()
        .trim_end_matches(')')
        .trim()
        .parse::<u32>()
        .ok()?;
    Some(PortlessRoute {
        url: url.to_string(),
        hostname,
        target: target.trim().to_string(),
        pid,
    })
}

fn hostname_for_url(value: &str) -> Option<String> {
    let without_scheme = value.split_once("://")?.1;
    let host_port = without_scheme.split('/').next().unwrap_or_default();
    let host = host_port.split(':').next().unwrap_or_default();
    (!host.is_empty()).then_some(host.to_string())
}

fn group_previews(previews: &[AppPreview]) -> Vec<AppPreviewGroup> {
    let mut groups = BTreeMap::<String, AppPreviewGroup>::new();
    for preview in previews {
        groups
            .entry(preview.project_slug.clone())
            .or_insert_with(|| AppPreviewGroup {
                project_slug: preview.project_slug.clone(),
                name: preview.project_name.clone(),
                previews: Vec::new(),
            })
            .previews
            .push(preview.clone());
    }
    groups
        .into_values()
        .map(|mut group| {
            group.previews.sort_by_key(checkout_sort_key);
            group
        })
        .collect()
}

fn checkout_sort_key(preview: &AppPreview) -> String {
    if preview.worktree_slug == "main" {
        "000-main".to_string()
    } else {
        format!("100-{}", preview.worktree_slug)
    }
}

fn shell_escape(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_portless_routes_with_exact_hostnames() {
        let routes = parse_portless_routes(
            "Active routes:\n  https://preview-smoke.localhost:1355  ->  localhost:4010  (pid 111)\n  https://feature-a.preview-smoke.localhost:1355  ->  localhost:4011  (pid 222)\n",
        );

        assert_eq!(routes.len(), 2);
        assert_eq!(routes[0].url, "https://preview-smoke.localhost:1355");
        assert_eq!(routes[0].hostname, "preview-smoke.localhost");
        assert_eq!(routes[0].target, "localhost:4010");
        assert_eq!(routes[0].pid, 111);
        assert_eq!(routes[1].hostname, "feature-a.preview-smoke.localhost");
    }

    #[test]
    fn layout_derives_package_manager_dev_command_and_panel() {
        let root = temp_root("layout");
        make_project(
            &root,
            serde_json::json!({
                "projectName": "Preview Smoke",
                "dev": {
                    "command": "",
                    "previewUrl": "https://preview-smoke.localhost"
                },
                "worktrees": {
                    "previewUrlPattern": "https://<branch-slug>.preview-smoke.localhost"
                },
                "layout": {
                    "panels": [
                        { "name": "agent", "role": "agent" },
                        { "name": "shell", "role": "shell", "command": "zsh" }
                    ]
                }
            }),
        );
        fs::write(
            root.join("package.json"),
            serde_json::json!({
                "name": "preview-smoke",
                "scripts": { "dev": "vite" },
                "packageManager": "pnpm@10.33.3"
            })
            .to_string(),
        )
        .unwrap();

        let layout = layout_config_for_root(&root);

        assert_eq!(layout.dev.command, "pnpm run dev");
        assert_eq!(layout.dev.preview_url, "https://preview-smoke.localhost");
        assert_eq!(layout.panels[1].role, "dev");
        assert_eq!(layout.panels[1].command.as_deref(), Some("pnpm run dev"));
    }

    #[test]
    fn preview_status_uses_exact_portless_hostname_for_main_and_worktree() {
        let main = temp_root("preview-main");
        let worktree = temp_root("preview-feature-a");
        make_project(
            &main,
            serde_json::json!({
                "projectName": "Preview Smoke",
                "dev": {
                    "command": "pnpm run dev",
                    "previewUrl": "https://preview-smoke.localhost"
                },
                "worktrees": {
                    "previewUrlPattern": "https://<branch-slug>.preview-smoke.localhost"
                }
            }),
        );
        make_project(
            &worktree,
            serde_json::json!({
                "projectName": "Preview Smoke",
                "dev": {
                    "command": "pnpm run dev",
                    "previewUrl": "https://preview-smoke.localhost"
                },
                "worktrees": {
                    "previewUrlPattern": "https://<branch-slug>.preview-smoke.localhost"
                }
            }),
        );

        let main_record = record(
            "main",
            &main,
            "Preview Smoke",
            "preview-smoke",
            "main",
            true,
        );
        let feature_record = record(
            "feature",
            &worktree,
            "Preview Smoke",
            "preview-smoke",
            "feature-a",
            false,
        );
        let fake_portless = fake_portless(
            "  https://feature-a.preview-smoke.localhost:1355  ->  localhost:4011  (pid 222)\n",
        );
        let _path_guard = PathGuard::prepend(fake_portless);

        let main_preview = app_preview_for_project(&main_record);
        let feature_preview = app_preview_for_project(&feature_record);

        assert_eq!(main_preview.status, "stopped");
        assert!(!main_preview.running);
        assert_eq!(main_preview.url, "https://preview-smoke.localhost");
        assert_eq!(feature_preview.status, "running");
        assert!(feature_preview.running);
        assert_eq!(
            feature_preview.url,
            "https://feature-a.preview-smoke.localhost:1355"
        );
        assert_eq!(
            feature_preview.expected_url,
            "https://feature-a.preview-smoke.localhost"
        );
    }

    fn record(
        id: &str,
        root: &Path,
        name: &str,
        project_slug: &str,
        worktree_slug: &str,
        active: bool,
    ) -> crate::domain::projects::ProjectRecord {
        crate::domain::projects::ProjectRecord {
            id: id.to_string(),
            root: root.to_path_buf(),
            name: name.to_string(),
            project_slug: project_slug.to_string(),
            worktree_slug: worktree_slug.to_string(),
            available: true,
            last_opened_at: None,
            active,
        }
    }

    fn make_project(root: &Path, config: serde_json::Value) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::to_string_pretty(&config).unwrap(),
        )
        .unwrap();
    }

    fn fake_portless(routes: &str) -> PathBuf {
        let bin = temp_root("portless-bin");
        let script = format!(
            "#!/usr/bin/env sh\nif [ \"$1\" = \"list\" ]; then\n  cat <<'EOF'\n{}\nEOF\n  exit 0\nfi\nexit 1\n",
            routes
        );
        let path = bin.join("portless");
        fs::write(&path, script).unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            permissions.set_mode(0o755);
        }
        fs::set_permissions(&path, permissions).unwrap();
        bin
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

    struct PathGuard {
        previous: Option<std::ffi::OsString>,
    }

    impl PathGuard {
        fn prepend(path: PathBuf) -> Self {
            let previous = std::env::var_os("PATH");
            let mut paths = vec![path];
            if let Some(previous) = previous.clone() {
                paths.extend(std::env::split_paths(&previous));
            }
            std::env::set_var("PATH", std::env::join_paths(paths).unwrap());
            Self { previous }
        }
    }

    impl Drop for PathGuard {
        fn drop(&mut self) {
            match self.previous.take() {
                Some(value) => std::env::set_var("PATH", value),
                None => std::env::remove_var("PATH"),
            }
        }
    }
}
