use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub plan: WorkspacePlan,
    pub status: WorkspaceStatus,
    pub log: WorkspaceLog,
    pub sources: WorkspaceSources,
    pub verification: Vec<VerificationLoop>,
    pub layout: crate::domain::previews::LayoutConfig,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePlan {
    pub title: String,
    pub path: String,
    pub summary: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStatus {
    pub completed: String,
    pub stage: String,
    pub current: String,
    pub current_path: String,
    pub conflicts: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLog {
    pub path: String,
    pub entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSources {
    pub path: String,
    pub briefs: Vec<SourceBrief>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceBrief {
    pub title: String,
    pub path: String,
    pub summary: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VerificationSummary {
    pub version: u16,
    pub boundary: String,
    pub source: String,
    pub state_path: String,
    pub recorded_truth: String,
    pub loops: Vec<VerificationLoop>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VerificationLoop {
    pub id: String,
    pub label: String,
    pub command: String,
    pub scope: String,
    pub trigger: String,
    pub status: String,
    pub last_run: Option<String>,
    pub evidence: Option<String>,
    pub kind: String,
    pub source: String,
    pub recorded: bool,
    pub boundary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailSummary {
    pub mode: GuardrailMode,
    pub canonical: Vec<GuardrailItem>,
    pub runtime: Vec<GuardrailItem>,
    pub command_history: GuardrailItem,
    pub actions: Vec<GuardrailItem>,
    pub root: PathBuf,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailMode {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuardrailItem {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub detail: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HyperwikiConfig {
    #[serde(default)]
    verification: Option<VerificationConfig>,
}

#[derive(Debug, Deserialize)]
struct VerificationConfig {
    #[serde(default)]
    loops: Vec<ConfiguredLoop>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfiguredLoop {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    trigger: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    last_run: Option<String>,
    #[serde(default)]
    evidence: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    recorded: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunRecord {
    #[serde(default)]
    loop_id: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    ran_at: Option<String>,
    #[serde(default)]
    evidence: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    recorded: Option<bool>,
}

pub fn workspace_summary(root: impl AsRef<Path>) -> WorkspaceSummary {
    let root = root.as_ref();
    let plan_dashboard = html_summary(root, "wiki/plans/index.html");
    let wiki_pages = crate::domain::wiki::list_wiki_pages(root, None).pages;
    let log_entries = html_headings(root, "wiki/log.html", "h2", 5);
    let source_briefs = source_brief_summary(root);
    let status = workspace_status(&plan_dashboard.summary, &log_entries, &wiki_pages);
    WorkspaceSummary {
        plan: WorkspacePlan {
            title: if plan_dashboard.title.is_empty() {
                "Plans".to_string()
            } else {
                plan_dashboard.title
            },
            path: "/wiki/plans/index.html".to_string(),
            summary: plan_dashboard.summary,
        },
        status,
        log: WorkspaceLog {
            path: "/wiki/log.html".to_string(),
            entries: log_entries,
        },
        sources: WorkspaceSources {
            path: "/wiki/sources.html".to_string(),
            briefs: source_briefs,
        },
        verification: verification_loops(root),
        layout: crate::domain::previews::layout_config_for_root(root),
    }
}

pub fn verification_summary(root: impl AsRef<Path>) -> VerificationSummary {
    VerificationSummary {
        version: 1,
        boundary: "runtime-only-until-recorded".to_string(),
        source: "derived from package scripts and .hyperwiki/config.json".to_string(),
        state_path: ".hyperwiki/state/verification.json".to_string(),
        recorded_truth: "Verification runs are runtime evidence until a human or agent records the result into wiki files or Git.".to_string(),
        loops: verification_loops(root),
    }
}

pub fn guardrail_summary(root: impl AsRef<Path>) -> GuardrailSummary {
    GuardrailSummary {
        mode: GuardrailMode {
            label: "Localhost Tooling".to_string(),
            value: "Dev server binds to localhost addresses and keeps the developer's machine, repo files, Git state, terminal sessions, credentials, and environment variables inside the local trust boundary.".to_string(),
        },
        canonical: vec![
            guardrail_path("Wiki truth", "wiki/", "Repo-visible HTML docs, plans, source briefs, and project log."),
            guardrail_path("Git truth", ".git", "Durable implementation history and reviewable changes."),
        ],
        runtime: vec![
            guardrail_path("Runtime state", ".hyperwiki/state/", "Ignored local workspace state."),
            guardrail_path("Session metadata", ".hyperwiki/sessions/", "Ignored retained terminal metadata for restore, export, and pruning."),
        ],
        command_history: GuardrailItem {
            label: "Command history boundary".to_string(),
            path: None,
            detail: "hyperwiki stores session metadata and terminal lifecycle state. Shell history and scrollback are runtime data unless the user exports or records them in wiki files.".to_string(),
        },
        actions: vec![
            guardrail_action("Rename", "Updates retained local session metadata."),
            guardrail_action("Restart", "Closes the current PTY and opens a fresh local session with the same panel name."),
            guardrail_action("Close", "Marks the session closed and keeps bounded retained metadata for auditability."),
            guardrail_action("Export", "Returns a runtime-only session export to the caller; it does not write repo-visible wiki files."),
            guardrail_action("Prune", "Removes old closed retained session metadata beyond the local retention limit."),
        ],
        root: root.as_ref().to_path_buf(),
    }
}

fn verification_loops(root: impl AsRef<Path>) -> Vec<VerificationLoop> {
    let root = root.as_ref();
    let config = read_config(root);
    let configured = config
        .verification
        .map(|verification| verification.loops)
        .unwrap_or_default();
    let package_manager = package_manager_for_root(root);
    let loops = if configured.is_empty() {
        default_verification_loops(root, &package_manager)
    } else {
        configured
    };
    let run_state = verification_run_state(root);
    loops
        .into_iter()
        .map(|loop_config| {
            let id = loop_config.id.clone().unwrap_or_else(|| {
                slugify(
                    &loop_config
                        .label
                        .clone()
                        .or(loop_config.command.clone())
                        .unwrap_or_else(|| "verification".to_string()),
                )
            });
            normalize_verification_loop(loop_config, run_state.get(&id))
        })
        .collect()
}

fn default_verification_loops(root: &Path, package_manager: &str) -> Vec<ConfiguredLoop> {
    let scripts = package_scripts(root);
    let mut loops = Vec::new();
    if scripts.contains("check") {
        loops.push(configured_loop(
            "syntax-checks",
            "Syntax checks",
            &format!("{package_manager} run check"),
            "codebase",
            "before commit and finish",
            "automated",
            "package.json scripts.check",
        ));
    }
    if scripts.contains("smoke:browser") {
        loops.push(configured_loop(
            "browser-workspace-smoke",
            "Browser workspace smoke",
            &format!("{package_manager} run smoke:browser"),
            "workspace-ui",
            "after browser-visible workflow changes",
            "automated",
            "package.json scripts.smoke:browser",
        ));
    }
    if scripts.contains("smoke:launch") {
        loops.push(configured_loop(
            "one-command-launch-smoke",
            "One-command launch smoke",
            &format!("{package_manager} run smoke:launch"),
            "launch-flow",
            "after launch, registry, or route changes",
            "automated",
            "package.json scripts.smoke:launch",
        ));
    }
    loops.push(configured_loop(
        "local-workspace-launch",
        "Local workspace launch",
        "npx hyperwiki",
        "local-runtime",
        "manual dogfood",
        "manual",
        "hyperwiki CLI",
    ));
    loops
}

fn configured_loop(
    id: &str,
    label: &str,
    command: &str,
    scope: &str,
    trigger: &str,
    kind: &str,
    source: &str,
) -> ConfiguredLoop {
    ConfiguredLoop {
        id: Some(id.to_string()),
        label: Some(label.to_string()),
        command: Some(command.to_string()),
        scope: Some(scope.to_string()),
        trigger: Some(trigger.to_string()),
        status: None,
        last_run: None,
        evidence: None,
        kind: Some(kind.to_string()),
        source: Some(source.to_string()),
        recorded: None,
    }
}

fn normalize_verification_loop(
    loop_config: ConfiguredLoop,
    run: Option<&RunRecord>,
) -> VerificationLoop {
    let id = loop_config.id.unwrap_or_else(|| {
        slugify(
            &loop_config
                .label
                .clone()
                .or(loop_config.command.clone())
                .unwrap_or_else(|| "verification".to_string()),
        )
    });
    VerificationLoop {
        label: loop_config.label.unwrap_or_else(|| id.clone()),
        command: loop_config.command.unwrap_or_default(),
        scope: loop_config.scope.unwrap_or_else(|| "project".to_string()),
        trigger: loop_config.trigger.unwrap_or_else(|| "manual".to_string()),
        status: run
            .and_then(|run| run.status.clone())
            .or(loop_config.status)
            .unwrap_or_else(|| "unknown".to_string()),
        last_run: run
            .and_then(|run| run.ran_at.clone())
            .or(loop_config.last_run),
        evidence: run
            .and_then(|run| run.evidence.clone())
            .or(loop_config.evidence),
        kind: run
            .and_then(|run| run.kind.clone())
            .or(loop_config.kind)
            .unwrap_or_else(|| "automated".to_string()),
        source: loop_config
            .source
            .unwrap_or_else(|| "configuration".to_string()),
        recorded: run
            .and_then(|run| run.recorded)
            .or(loop_config.recorded)
            .unwrap_or(false),
        boundary: if run.is_some() {
            "runtime-evidence".to_string()
        } else {
            "defined-loop".to_string()
        },
        id,
    }
}

fn verification_run_state(root: &Path) -> BTreeMap<String, RunRecord> {
    let state_path = root
        .join(".hyperwiki")
        .join("state")
        .join("verification.json");
    let Some(runs) = fs::read_to_string(state_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|data| data.get("runs").and_then(|runs| runs.as_array()).cloned())
    else {
        return BTreeMap::new();
    };
    let mut latest = BTreeMap::<String, RunRecord>::new();
    for value in runs {
        let Ok(run) = serde_json::from_value::<RunRecord>(value) else {
            continue;
        };
        let id = run.loop_id.clone().or(run.id.clone()).unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let should_replace = latest
            .get(&id)
            .map(|previous| {
                previous.ran_at.as_deref().unwrap_or("") < run.ran_at.as_deref().unwrap_or("")
            })
            .unwrap_or(true);
        if should_replace {
            latest.insert(id, run);
        }
    }
    latest
}

fn read_config(root: &Path) -> HyperwikiConfig {
    fs::read_to_string(root.join(".hyperwiki").join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<HyperwikiConfig>(&raw).ok())
        .unwrap_or(HyperwikiConfig { verification: None })
}

fn package_scripts(root: &Path) -> BTreeSet<String> {
    fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|package| {
            package
                .get("scripts")
                .and_then(|scripts| scripts.as_object())
                .cloned()
        })
        .map(|scripts| scripts.keys().cloned().collect())
        .unwrap_or_default()
}

fn package_manager_for_root(root: &Path) -> String {
    let package = fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    if let Some(manager) = package
        .as_ref()
        .and_then(|package| package.get("packageManager"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.split('@').next())
    {
        return manager.to_string();
    }
    if root.join("pnpm-lock.yaml").exists() {
        "pnpm".to_string()
    } else if root.join("yarn.lock").exists() {
        "yarn".to_string()
    } else if root.join("bun.lock").exists() || root.join("bun.lockb").exists() {
        "bun".to_string()
    } else {
        "npm".to_string()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HtmlSummary {
    title: String,
    summary: Vec<String>,
}

fn html_summary(root: &Path, relative_path: &str) -> HtmlSummary {
    let html = read_repo_file(root, relative_path).unwrap_or_default();
    HtmlSummary {
        title: first_heading(&html, "h1"),
        summary: list_items_from_first_summary(&html),
    }
}

fn html_headings(root: &Path, relative_path: &str, heading: &str, limit: usize) -> Vec<String> {
    let html = read_repo_file(root, relative_path).unwrap_or_default();
    let open = format!("<{heading}");
    let close = format!("</{heading}>");
    let mut items = Vec::new();
    let mut rest = html.as_str();
    while items.len() < limit {
        let Some(item) = first_between_case_insensitive(rest, &open, &close) else {
            break;
        };
        let content = item
            .split_once('>')
            .map(|(_, content)| content)
            .unwrap_or(&item);
        items.push(strip_html(content));
        if let Some((_, next)) = rest.split_once(&close) {
            rest = next;
        } else {
            break;
        }
    }
    items
}

fn source_brief_summary(root: &Path) -> Vec<SourceBrief> {
    let source_root = root.join("wiki").join("sources");
    let Ok(entries) = fs::read_dir(&source_root) else {
        return Vec::new();
    };
    let mut briefs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("html") {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let relative = format!("wiki/sources/{name}");
        let summary = html_summary(root, &relative);
        briefs.push(SourceBrief {
            title: if summary.title.is_empty() {
                title_from_path(name)
            } else {
                summary.title
            },
            path: format!("/{relative}"),
            summary: summary.summary,
        });
    }
    briefs.sort_by(|left, right| left.title.cmp(&right.title));
    briefs
}

fn workspace_status(
    plan_summary: &[String],
    log_entries: &[String],
    pages: &[crate::domain::wiki::WikiPage],
) -> WorkspaceStatus {
    let current_stage = summary_value(plan_summary, "Current stage");
    let current_unit = summary_value(plan_summary, "Current unit");
    let active_plan = pages
        .iter()
        .find(|page| {
            display_wiki_path(&page.path).contains("/wiki/plans/")
                && page.status.as_deref() == Some("active")
        })
        .cloned();
    WorkspaceStatus {
        completed: completed_status(plan_summary, log_entries),
        stage: if current_stage.is_empty() {
            active_plan
                .as_ref()
                .map(|page| page.title.clone())
                .unwrap_or_else(|| "none".to_string())
        } else {
            current_stage
        },
        current: if current_unit.is_empty() {
            active_plan
                .as_ref()
                .map(|page| page.title.clone())
                .or_else(|| {
                    let status = summary_value(plan_summary, "Status");
                    (!status.is_empty()).then_some(status)
                })
                .unwrap_or_else(|| "none".to_string())
        } else {
            current_unit
        },
        current_path: active_plan
            .map(|page| display_wiki_path(&page.path))
            .unwrap_or_default(),
        conflicts: Vec::new(),
    }
}

fn completed_status(plan_summary: &[String], log_entries: &[String]) -> String {
    plan_summary
        .iter()
        .find(|item| {
            item.to_lowercase().contains("completed")
                || item.to_lowercase().contains("implemented")
                || item.to_lowercase().contains("mapped")
                || item.to_lowercase().contains("added")
        })
        .cloned()
        .or_else(|| log_entries.first().cloned())
        .unwrap_or_else(|| "No completed work found".to_string())
}

fn summary_value(items: &[String], label: &str) -> String {
    let prefix = format!("{label}:");
    items
        .iter()
        .find_map(|item| {
            item.to_lowercase()
                .starts_with(&prefix.to_lowercase())
                .then(|| item[prefix.len()..].trim().to_string())
        })
        .unwrap_or_default()
}

fn read_repo_file(root: &Path, relative_path: &str) -> Result<String, String> {
    let resolved = root.join(relative_path);
    let canonical_root = root.canonicalize().map_err(|error| error.to_string())?;
    let canonical_file = resolved.canonicalize().map_err(|error| error.to_string())?;
    if !canonical_file.starts_with(canonical_root) {
        return Err("File is outside project root.".to_string());
    }
    fs::read_to_string(canonical_file).map_err(|error| error.to_string())
}

fn list_items_from_first_summary(html: &str) -> Vec<String> {
    let Some(section) =
        first_between_case_insensitive(html, "<section class=\"summary\"", "</section>")
    else {
        return Vec::new();
    };
    let mut items = Vec::new();
    let mut rest = section.as_str();
    while let Some(item) = first_between_case_insensitive(rest, "<li", "</li>") {
        let content = item
            .split_once('>')
            .map(|(_, content)| content)
            .unwrap_or(&item);
        items.push(strip_html(content));
        if let Some((_, next)) = rest.split_once("</li>") {
            rest = next;
        } else {
            break;
        }
    }
    items
}

fn first_heading(html: &str, heading: &str) -> String {
    first_between_case_insensitive(html, &format!("<{heading}"), &format!("</{heading}>"))
        .map(|value| {
            let content = value
                .split_once('>')
                .map(|(_, content)| content)
                .unwrap_or(&value);
            strip_html(content)
        })
        .unwrap_or_default()
}

fn first_between_case_insensitive(value: &str, start: &str, end: &str) -> Option<String> {
    let lower = value.to_lowercase();
    let start_index = lower.find(&start.to_lowercase())?;
    let end_index = lower[start_index..].find(&end.to_lowercase())? + start_index;
    Some(value[start_index..end_index].to_string())
}

fn strip_html(value: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn display_wiki_path(path: &str) -> String {
    let Some(index) = path.find("/wiki/") else {
        return path.to_string();
    };
    path[index..].to_string()
}

fn title_from_path(path: &str) -> String {
    path.trim_end_matches(".html")
        .split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn guardrail_path(label: &str, path: &str, detail: &str) -> GuardrailItem {
    GuardrailItem {
        label: label.to_string(),
        path: Some(path.to_string()),
        detail: detail.to_string(),
    }
}

fn guardrail_action(label: &str, detail: &str) -> GuardrailItem {
    GuardrailItem {
        label: label.to_string(),
        path: None,
        detail: detail.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn verification_summary_merges_latest_runtime_evidence() {
        let root = temp_root("verification");
        make_project(&root);
        fs::write(
            root.join("package.json"),
            serde_json::json!({
                "packageManager": "pnpm@10.33.3",
                "scripts": {
                    "check": "node --check index.js",
                    "smoke:browser": "node browser-smoke.mjs"
                }
            })
            .to_string(),
        )
        .unwrap();
        fs::create_dir_all(root.join(".hyperwiki").join("state")).unwrap();
        fs::write(
            root.join(".hyperwiki")
                .join("state")
                .join("verification.json"),
            serde_json::json!({
                "runs": [
                    {
                        "loopId": "syntax-checks",
                        "status": "failed",
                        "ranAt": "2026-05-14T11:00:00.000Z",
                        "evidence": "older"
                    },
                    {
                        "loopId": "syntax-checks",
                        "status": "passed",
                        "ranAt": "2026-05-14T12:00:00.000Z",
                        "evidence": "node --check completed",
                        "kind": "automated"
                    }
                ]
            })
            .to_string(),
        )
        .unwrap();

        let summary = verification_summary(&root);
        let syntax = summary
            .loops
            .iter()
            .find(|loop_item| loop_item.id == "syntax-checks")
            .expect("syntax loop should exist");

        assert_eq!(summary.version, 1);
        assert_eq!(summary.boundary, "runtime-only-until-recorded");
        assert_eq!(summary.state_path, ".hyperwiki/state/verification.json");
        assert_eq!(syntax.status, "passed");
        assert_eq!(syntax.last_run.as_deref(), Some("2026-05-14T12:00:00.000Z"));
        assert_eq!(syntax.evidence.as_deref(), Some("node --check completed"));
        assert_eq!(syntax.boundary, "runtime-evidence");
        assert!(summary
            .loops
            .iter()
            .any(|loop_item| loop_item.id == "browser-workspace-smoke"));
    }

    #[test]
    fn configured_verification_loops_override_defaults_and_feed_workspace() {
        let root = temp_root("verification-configured");
        make_project(&root);
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({
                "projectName": "Verification Configured",
                "verification": {
                    "loops": [
                        {
                            "id": "manual-dogfood",
                            "label": "Manual dogfood",
                            "command": "npx hyperwiki",
                            "scope": "local-runtime",
                            "trigger": "before finish",
                            "kind": "manual",
                            "source": ".hyperwiki/config.json"
                        }
                    ]
                }
            })
            .to_string(),
        )
        .unwrap();

        let verification = verification_summary(&root);
        let workspace = workspace_summary(&root);

        assert_eq!(verification.loops.len(), 1);
        assert_eq!(verification.loops[0].id, "manual-dogfood");
        assert_eq!(verification.loops[0].kind, "manual");
        assert_eq!(verification.loops[0].status, "unknown");
        assert!(workspace
            .verification
            .iter()
            .any(|loop_item| loop_item.id == "manual-dogfood"));
        assert_eq!(workspace.plan.path, "/wiki/plans/index.html");
    }

    #[test]
    fn guardrails_preserve_localhost_tooling_boundary() {
        let root = temp_root("guardrails");
        let guardrails = guardrail_summary(&root);

        assert_eq!(guardrails.mode.label, "Localhost Tooling");
        assert!(guardrails.mode.value.contains("local trust boundary"));
        assert!(guardrails
            .canonical
            .iter()
            .any(|item| item.path.as_deref() == Some("wiki/")));
        assert!(guardrails
            .runtime
            .iter()
            .any(|item| item.path.as_deref() == Some(".hyperwiki/sessions/")));
        assert!(guardrails
            .command_history
            .detail
            .contains("unless the user exports"));
    }

    fn make_project(root: &Path) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({ "projectName": "Verification" }).to_string(),
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.html"),
            "<h1>Plans</h1><section class=\"summary\"><ul><li>Current stage: Stage 01</li><li>Current unit: Unit 01</li><li>Added baseline.</li></ul></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("log.html"),
            "<h1>Log</h1><h2>Latest entry</h2>",
        )
        .unwrap();
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
