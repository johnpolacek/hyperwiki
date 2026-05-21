use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "projects",
        node_reference: "src/projects.js, src/init.js, src/reset.js",
        responsibilities: &[
            "user-level project registry",
            "project and worktree slug resolution",
            "project creation from briefs",
            "project removal and stale-root handling",
        ],
        parity_gate: "project removal, project links, init, and reset smoke equivalents",
    }
}

#[derive(Debug, Clone)]
pub struct ProjectRegistry {
    file_path: PathBuf,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryFile {
    pub version: u16,
    pub projects: Vec<ProjectRecord>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub root: PathBuf,
    pub name: String,
    #[serde(default)]
    pub project_slug: String,
    #[serde(default)]
    pub worktree_slug: String,
    #[serde(default)]
    pub available: bool,
    #[serde(default)]
    pub last_opened_at: Option<String>,
    #[serde(default)]
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroup {
    pub project_slug: String,
    pub name: String,
    pub checkouts: Vec<ProjectRecord>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectList {
    pub projects: Vec<ProjectRecord>,
    pub checkouts: Vec<ProjectRecord>,
    pub project_groups: Vec<ProjectGroup>,
    pub active_project_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateRequest {
    pub title: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub document: Option<String>,
    #[serde(default)]
    pub document_type: Option<String>,
    #[serde(default)]
    pub initialize_git: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateResponse {
    pub project: ProjectRecord,
    pub workspace_url: String,
    pub git: crate::domain::git::GitInitResult,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRemoveRequest {
    #[serde(default)]
    pub delete_files: bool,
    #[serde(default)]
    pub root: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRemoveResponse {
    pub project: ProjectRecord,
    pub deleted_files: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectInfo {
    pub root: PathBuf,
    pub available: bool,
    pub name: String,
}

impl ProjectRegistry {
    pub fn from_environment() -> Self {
        let home = std::env::var_os("HYPERWIKI_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".hyperwiki")))
            .unwrap_or_else(|| PathBuf::from(".hyperwiki"));
        Self::new(home)
    }

    pub fn new(home: impl Into<PathBuf>) -> Self {
        Self {
            file_path: home.into().join("projects.json"),
        }
    }

    pub fn read_raw(&self) -> RegistryFile {
        read_registry_file(&self.file_path)
    }

    pub fn register(&self, root: impl AsRef<Path>) -> Result<ProjectRecord, String> {
        let root = root.as_ref().to_path_buf();
        let project = project_from_root(&root);
        if !project.available {
            return Err(
                "hyperwiki project not found. Run `npx hyperwiki init` in this repo first."
                    .to_string(),
            );
        }
        let mut registry = self.read_raw();
        let existing = registry
            .projects
            .iter()
            .find(|item| same_path(&item.root, &root))
            .cloned();
        let record = ProjectRecord {
            id: existing
                .as_ref()
                .map(|item| item.id.clone())
                .unwrap_or_else(generated_id),
            root,
            name: project.name.clone(),
            project_slug: existing
                .as_ref()
                .map(|item| item.project_slug.clone())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| slugify(&project.name)),
            worktree_slug: worktree_slug(&project.root),
            available: true,
            last_opened_at: Some(now_isoish()),
            active: false,
        };
        registry.projects = prune_missing_worktrees(with_unique_slugs(
            std::iter::once(record.clone())
                .chain(
                    registry
                        .projects
                        .into_iter()
                        .filter(|item| item.id != record.id),
                )
                .collect(),
        ));
        write_registry_file(&self.file_path, &registry)?;
        Ok(record)
    }

    pub fn list(&self, active_id: Option<&str>) -> ProjectList {
        let records = with_unique_slugs(self.read_raw().projects);
        let projects_to_list = prune_missing_worktrees(records);
        let mut projects = Vec::new();

        for item in projects_to_list {
            let project = project_from_root(&item.root);
            let name = if project.available {
                project.name
            } else {
                item.name.clone()
            };
            let project_slug = if item.project_slug.is_empty() {
                slugify(&name)
            } else {
                item.project_slug.clone()
            };
            let worktree_slug = if item.worktree_slug.is_empty() {
                worktree_slug(&item.root)
            } else {
                item.worktree_slug.clone()
            };
            projects.push(ProjectRecord {
                name,
                project_slug,
                worktree_slug,
                available: project.available,
                active: false,
                ..item
            });
        }

        let active_project_id = active_project_id(&projects, active_id);
        let checkouts = projects
            .iter()
            .map(|project| ProjectRecord {
                active: Some(project.id.as_str()) == active_project_id.as_deref(),
                ..project.clone()
            })
            .collect::<Vec<_>>();
        let projects = grouped_projects(&checkouts, active_project_id.as_deref());

        ProjectList {
            projects,
            project_groups: project_groups(&checkouts),
            checkouts,
            active_project_id,
        }
    }

    pub fn resolve_by_slug(
        &self,
        project_slug: &str,
        worktree_slug: Option<&str>,
    ) -> Option<ProjectRecord> {
        let projects = with_unique_slugs(self.read_raw().projects);
        let record = projects
            .iter()
            .find(|item| {
                item.project_slug == project_slug
                    && worktree_slug.map_or(true, |slug| item.worktree_slug == slug)
            })?
            .clone();
        let project = project_from_root(&record.root);
        project.available.then_some(ProjectRecord {
            name: project.name,
            available: true,
            ..record
        })
    }

    pub fn resolve(&self, id: Option<&str>, fallback_root: Option<&Path>) -> Option<ProjectRecord> {
        let registry = self.read_raw();
        let fallback = fallback_root.and_then(|root| {
            registry
                .projects
                .iter()
                .find(|item| same_path(&item.root, root))
        });
        let record = id
            .and_then(|id| registry.projects.iter().find(|item| item.id == id))
            .or(fallback)
            .or_else(|| registry.projects.first())?
            .clone();
        let project = project_from_root(&record.root);
        project.available.then_some(ProjectRecord {
            name: project.name,
            available: true,
            ..record
        })
    }

    pub fn remove(&self, id: &str, delete_files: bool) -> Result<Option<ProjectRecord>, String> {
        let mut registry = self.read_raw();
        let Some(index) = registry
            .projects
            .iter()
            .position(|project| project.id == id)
        else {
            return Ok(None);
        };
        let removed = registry.projects.remove(index);
        if delete_files && unsafe_removal_root(&removed.root) {
            return Err("Refusing to delete unsafe project root.".to_string());
        }
        write_registry_file(&self.file_path, &registry)?;
        if delete_files {
            fs::remove_dir_all(&removed.root).map_err(|error| error.to_string())?;
        }
        Ok(Some(removed))
    }

    pub fn remove_with_root_fallback(
        &self,
        id: &str,
        request: ProjectRemoveRequest,
    ) -> Result<ProjectRemoveResponse, (u16, String)> {
        let mut registry = self.read_raw();
        let requested_root = request.root.as_deref();
        let Some(index) = registry.projects.iter().position(|project| {
            project.id == id
                || requested_root
                    .map(|root| same_path(&project.root, root))
                    .unwrap_or(false)
        }) else {
            return Err((404, "Project not found.".to_string()));
        };
        let removed = registry.projects.remove(index);
        if request.delete_files && unsafe_removal_root(&removed.root) {
            return Err((400, "Refusing to delete unsafe project root.".to_string()));
        }
        write_registry_file(&self.file_path, &registry).map_err(|error| (500, error))?;
        if request.delete_files {
            fs::remove_dir_all(&removed.root).map_err(|error| (500, error.to_string()))?;
        }
        Ok(ProjectRemoveResponse {
            project: removed,
            deleted_files: request.delete_files,
        })
    }
}

pub fn create_project_from_dashboard(
    registry: &ProjectRegistry,
    request: ProjectCreateRequest,
) -> Result<ProjectCreateResponse, (u16, String)> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err((400, "Project title is required.".to_string()));
    }
    let summary = request
        .summary
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Imported from Dashboard markdown.");
    let project_root = unique_project_root(title).map_err(|error| (500, error))?;
    fs::create_dir_all(&project_root).map_err(|error| (500, error.to_string()))?;
    init_hyperwiki_project(
        &project_root,
        InitProjectOptions {
            project_name: title.to_string(),
            summary: summary.to_string(),
            source_document: request.document.unwrap_or_default(),
            source_document_type: request.document_type.unwrap_or_default(),
            agent_launch_command: String::new(),
            dev_command: String::new(),
            package_scripts: Vec::new(),
            overwrite: false,
        },
    )
    .map_err(|error| (500, error))?;
    let git = if request.initialize_git == Some(false) {
        crate::domain::git::GitInitResult {
            status: "skipped".to_string(),
            git_root: None,
            committed: false,
            message: None,
        }
    } else {
        crate::domain::git::initialize_git_onboarding(&project_root)
            .map_err(|error| (500, error))?
            .result
    };
    let record = registry
        .register(&project_root)
        .map_err(|error| (500, error))?;
    let workspace_url = format!(
        "/workspace/{}/{}",
        percent_encode_path_segment(&record.project_slug),
        percent_encode_path_segment(&record.worktree_slug)
    );
    Ok(ProjectCreateResponse {
        project: record,
        workspace_url,
        git,
    })
}

#[derive(Debug, Clone)]
pub struct InitProjectOptions {
    pub project_name: String,
    pub summary: String,
    pub source_document: String,
    pub source_document_type: String,
    pub agent_launch_command: String,
    pub dev_command: String,
    pub package_scripts: Vec<String>,
    pub overwrite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResetAction {
    pub kind: &'static str,
    pub path: PathBuf,
}

pub fn init_hyperwiki_project(
    root: impl AsRef<Path>,
    options: InitProjectOptions,
) -> Result<(), String> {
    let root = root.as_ref();
    let slug = slugify(&options.project_name);
    let layout_panels = layout_panels(&options)?;
    fs::create_dir_all(root.join(".hyperwiki").join("state")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join(".hyperwiki").join("sessions"))
        .map_err(|error| error.to_string())?;
    write_if_safe(
        &root.join(".hyperwiki").join("config.json"),
        &format!(
            "{}\n",
            serde_json::to_string_pretty(&serde_json::json!({
                "projectName": options.project_name,
                "canonicalWiki": "html",
                "dev": {
                    "host": "127.0.0.1",
                    "port": 4177,
                    "command": options.dev_command,
                    "previewUrl": format!("https://{slug}.localhost")
                },
                "worktrees": {
                    "previewUrlPattern": format!("https://<branch-slug>.{slug}.localhost"),
                    "workflow": "parallel-dev-worktrees"
                },
                "agent": {
                    "launchCommand": options.agent_launch_command
                },
                "layout": {
                    "panels": layout_panels
                },
                "runtimeState": ".hyperwiki/state",
                "sessions": ".hyperwiki/sessions"
            }))
            .map_err(|error| error.to_string())?
        ),
        options.overwrite,
    )?;
    write_if_safe(
        &root.join("AGENTS.md"),
        &agents_markdown(&options),
        options.overwrite,
    )?;
    write_basic_wiki(root, &options)?;
    Ok(())
}

pub fn reset_hyperwiki_state(
    root: impl AsRef<Path>,
    registry: &ProjectRegistry,
    dry_run: bool,
) -> Result<Vec<ResetAction>, String> {
    let mut targets = BTreeMap::<PathBuf, ProjectInfo>::new();
    for record in registry.read_raw().projects {
        let project = project_from_root(record.root);
        if project.available {
            targets.insert(project.root.clone(), project);
        }
    }
    let current = project_from_root(root);
    if current.available {
        targets.insert(current.root.clone(), current);
    }
    let mut actions = vec![ResetAction {
        kind: "file",
        path: registry.file_path.clone(),
    }];
    for project in targets.values() {
        actions.push(ResetAction {
            kind: "dir-contents",
            path: project.root.join(".hyperwiki").join("state"),
        });
        actions.push(ResetAction {
            kind: "dir-contents",
            path: project.root.join(".hyperwiki").join("sessions"),
        });
    }
    if dry_run {
        return Ok(actions);
    }
    let _ = fs::remove_file(&registry.file_path);
    for action in actions
        .iter()
        .filter(|action| action.kind == "dir-contents")
    {
        remove_directory_contents(&action.path)?;
    }
    Ok(actions)
}

pub fn project_from_root(root: impl AsRef<Path>) -> ProjectInfo {
    let root = root.as_ref().to_path_buf();
    let config_path = root.join(".hyperwiki").join("config.json");
    let wiki_path = root.join("wiki");
    let available = config_path.is_file() && wiki_path.is_dir();
    let name = if available {
        project_name(&root, &config_path)
    } else {
        root.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("project")
            .to_string()
    };
    ProjectInfo {
        root,
        available,
        name,
    }
}

pub fn worktree_slug(root: impl AsRef<Path>) -> String {
    let root = root.as_ref();
    let git_path = root.join(".git");
    if !git_path.exists() {
        return "main".to_string();
    }
    if git_path.is_file()
        && fs::read_to_string(&git_path)
            .map(|marker| marker.starts_with("gitdir:"))
            .unwrap_or(false)
    {
        return slugify(
            root.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("main"),
        );
    }
    "main".to_string()
}

fn read_registry_file(file_path: &Path) -> RegistryFile {
    let Ok(raw) = fs::read_to_string(file_path) else {
        return empty_registry();
    };
    serde_json::from_str::<RegistryFile>(&raw).unwrap_or_else(|_| empty_registry())
}

fn write_registry_file(file_path: &Path, registry: &RegistryFile) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(registry).map_err(|error| error.to_string())?;
    fs::write(file_path, format!("{raw}\n")).map_err(|error| error.to_string())
}

fn empty_registry() -> RegistryFile {
    RegistryFile {
        version: 1,
        projects: Vec::new(),
    }
}

fn project_name(root: &Path, config_path: &Path) -> String {
    if let Some(config) = fs::read_to_string(config_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
    {
        if let Some(name) = config.get("projectName").and_then(|value| value.as_str()) {
            return name.to_string();
        }
    }
    if let Some(package_json) = fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
    {
        if let Some(name) = package_json.get("name").and_then(|value| value.as_str()) {
            return name.to_string();
        }
    }
    root.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project")
        .to_string()
}

fn active_project_id(projects: &[ProjectRecord], active_id: Option<&str>) -> Option<String> {
    projects
        .iter()
        .find(|project| Some(project.id.as_str()) == active_id && project.available)
        .or_else(|| projects.iter().find(|project| project.available))
        .or_else(|| projects.first())
        .map(|project| project.id.clone())
}

fn missing_worktree(project: &ProjectRecord) -> bool {
    !project.worktree_slug.is_empty() && project.worktree_slug != "main" && !project.root.exists()
}

fn prune_missing_worktrees(projects: Vec<ProjectRecord>) -> Vec<ProjectRecord> {
    projects
        .into_iter()
        .filter(|project| !missing_worktree(project))
        .collect()
}

fn grouped_projects(projects: &[ProjectRecord], active_id: Option<&str>) -> Vec<ProjectRecord> {
    let mut groups: BTreeMap<String, Vec<ProjectRecord>> = BTreeMap::new();
    for project in projects {
        groups
            .entry(project.project_slug.clone())
            .or_default()
            .push(project.clone());
    }
    groups
        .into_values()
        .filter_map(|group| {
            group
                .iter()
                .find(|project| Some(project.id.as_str()) == active_id)
                .or_else(|| group.iter().find(|project| project.available))
                .or_else(|| group.first())
                .cloned()
        })
        .collect()
}

fn project_groups(projects: &[ProjectRecord]) -> Vec<ProjectGroup> {
    let mut groups: BTreeMap<String, ProjectGroup> = BTreeMap::new();
    for project in projects {
        let group = groups
            .entry(project.project_slug.clone())
            .or_insert_with(|| ProjectGroup {
                project_slug: project.project_slug.clone(),
                name: project.name.clone(),
                checkouts: Vec::new(),
            });
        group.checkouts.push(project.clone());
    }
    groups
        .into_values()
        .map(|mut group| {
            group.checkouts.sort_by_key(checkout_sort_key);
            group
        })
        .collect()
}

fn checkout_sort_key(project: &ProjectRecord) -> String {
    let slug = if project.worktree_slug.is_empty() {
        "main"
    } else {
        &project.worktree_slug
    };
    if slug == "main" {
        "000-main".to_string()
    } else {
        format!("100-{slug}")
    }
}

fn with_unique_slugs(projects: Vec<ProjectRecord>) -> Vec<ProjectRecord> {
    let mut pairs = BTreeMap::<String, u16>::new();
    projects
        .into_iter()
        .map(|mut item| {
            let project_slug = if item.project_slug.is_empty() {
                slugify(if item.name.is_empty() {
                    item.root
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("project")
                } else {
                    &item.name
                })
            } else {
                item.project_slug
            };
            let worktree_base = if item.worktree_slug.is_empty() {
                slugify(
                    item.root
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("main"),
                )
            } else {
                item.worktree_slug
            };
            let pair = format!("{project_slug}/{worktree_base}");
            let count = pairs
                .entry(pair)
                .and_modify(|count| *count += 1)
                .or_insert(1);
            item.project_slug = project_slug;
            item.worktree_slug = if *count == 1 {
                worktree_base
            } else {
                format!("{worktree_base}-{count}")
            };
            item
        })
        .collect()
}

fn unsafe_removal_root(root: &Path) -> bool {
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    let home = std::env::var_os("HOME").map(PathBuf::from);
    root.parent().is_none()
        || home
            .as_ref()
            .map(|home| root == *home || root == home.parent().unwrap_or(home))
            .unwrap_or(false)
}

fn same_path(left: &Path, right: &Path) -> bool {
    left.canonicalize().ok() == right.canonicalize().ok()
}

fn unique_project_root(title: &str) -> Result<PathBuf, String> {
    let base_dir = std::env::var_os("HYPERWIKI_PROJECTS_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Projects")))
        .unwrap_or_else(|| PathBuf::from("Projects"));
    let base_slug = slugify(title);
    let mut candidate = base_dir.join(&base_slug);
    let mut count = 2;
    while candidate.exists() {
        candidate = base_dir.join(format!("{base_slug}-{count}"));
        count += 1;
    }
    Ok(candidate)
}

fn write_basic_wiki(root: &Path, options: &InitProjectOptions) -> Result<(), String> {
    let pages = [
        ("wiki/index.html", index_page(options)),
        ("wiki/AGENTS.html", wiki_agent_page(options)),
        ("wiki/log.html", log_page(options)),
        ("wiki/sources.html", sources_page(options)),
        (
            "wiki/scaffold-contract.html",
            scaffold_contract_page(options),
        ),
        (
            "wiki/roadmap.html",
            simple_page(
                options,
                "Roadmap",
                "Confirm project goals, implement the first slice, and record validation.",
            ),
        ),
        (
            "wiki/architecture.html",
            simple_page(
                options,
                "Architecture",
                "Document the project architecture as implementation evidence grows.",
            ),
        ),
        ("wiki/dev.html", dev_page(options)),
        ("wiki/plans/index.html", plans_index_page(options)),
        (
            "wiki/plans/mvp/index.html",
            simple_page(
                options,
                "MVP Plan",
                "Track MVP stages and implementation units.",
            ),
        ),
        (
            "wiki/plans/mvp/implementation-spec.html",
            simple_page(
                options,
                "Implementation Spec",
                "Capture implementation scope, constraints, and verification expectations.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation.html",
            stage_page(options),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html",
            unit_page(
                options,
                "Unit 01 - Confirm Project Direction",
                "Confirm project goals, audience, non-goals, and success criteria.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.html",
            unit_page(
                options,
                "Unit 02 - Review Repository Setup",
                "Review repository setup and development commands.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.html",
            unit_page(
                options,
                "Unit 03 - Update Source Briefs",
                "Update source briefs and roadmap from real project evidence.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.html",
            unit_page(
                options,
                "Unit 04 - Define First Implementation Unit",
                "Define the first implementation unit and verification path.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace.html",
            simple_page(
                options,
                "Stage 02 - First Implementation Track",
                "Implement the first approved feature or architecture slice.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.html",
            unit_page(
                options,
                "Unit 01 - Implement First Slice",
                "Implement the first approved feature or architecture slice.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-02-sync-plan-status.html",
            unit_page(
                options,
                "Unit 02 - Sync Plan Status",
                "Keep plan status and source context synchronized with discoveries.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-03-record-validation.html",
            unit_page(
                options,
                "Unit 03 - Record Validation",
                "Record validation that changes project confidence or next steps.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-04-preserve-canonical-truth.html",
            unit_page(
                options,
                "Unit 04 - Preserve Canonical Truth",
                "Avoid hidden UI-only state; keep repo files and Git canonical.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening.html",
            simple_page(
                options,
                "Stage 03 - Hardening And Release Readiness",
                "Close verification gaps and update durable docs.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-01-close-verification-gaps.html",
            unit_page(
                options,
                "Unit 01 - Close Verification Gaps",
                "Close gaps found during implementation and verification.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-02-harden-workflows.html",
            unit_page(
                options,
                "Unit 02 - Harden Workflows",
                "Harden setup, test, security, accessibility, or release workflows as relevant.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-03-update-durable-docs.html",
            unit_page(
                options,
                "Unit 03 - Update Durable Docs",
                "Update durable docs and source briefs from final implementation evidence.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-04-record-handoff-notes.html",
            unit_page(
                options,
                "Unit 04 - Record Handoff Notes",
                "Record completion criteria and release or handoff notes.",
            ),
        ),
        (
            "wiki/sources/prd.html",
            source_page(options, "Product Brief"),
        ),
        (
            "wiki/sources/technical-brief.html",
            source_page(options, "Technical Brief"),
        ),
        (
            "wiki/sources/design-brief.html",
            source_page(options, "Design Brief"),
        ),
        (
            "wiki/sources/planning-interview.html",
            source_page(options, "Planning Interview"),
        ),
        ("wiki/sources/import.html", import_page(options)),
    ];
    for (relative, content) in pages {
        write_if_safe(&root.join(relative), &content, options.overwrite)?;
    }
    Ok(())
}

fn write_if_safe(path: &Path, content: &str, overwrite: bool) -> Result<(), String> {
    if path.exists() && !overwrite {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

fn layout_panels(options: &InitProjectOptions) -> Result<Vec<serde_json::Value>, String> {
    let mut panels = Vec::new();
    if !options.agent_launch_command.trim().is_empty() {
        panels.push(serde_json::json!({
            "name": "agent",
            "role": "agent",
            "command": options.agent_launch_command
        }));
    }
    if !options.dev_command.trim().is_empty() {
        panels.push(serde_json::json!({
            "name": "dev",
            "role": "dev",
            "command": options.dev_command
        }));
    }
    panels.push(serde_json::json!({
        "name": "cli",
        "role": "shell",
        "command": null
    }));
    Ok(panels)
}

fn remove_directory_contents(directory: &Path) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Ok(());
    };
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn layout(options: &InitProjectOptions, title: &str, body: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{} - {}</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="stylesheet" href="/assets/wiki.css">
</head>
<body>
  <header class="wiki-header">
    <a href="/wiki/index.html">{}</a>
    <nav>
      <a href="/wiki/architecture.html">Architecture</a>
      <a href="/wiki/dev.html">Dev</a>
      <a href="/wiki/plans/index.html">Plans</a>
      <a href="/wiki/log.html">Log</a>
      <a href="/wiki/sources.html">Sources</a>
    </nav>
  </header>
  <main class="wiki-page">
    {body}
  </main>
</body>
</html>
"#,
        escape_html(title),
        escape_html(&options.project_name),
        escape_html(&options.project_name),
    )
}

fn index_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Home",
        &format!(
            "<h1>{}</h1><p>{}</p><section><h2>Core Pages</h2><ul><li><a href=\"/wiki/plans/mvp/index.html\">MVP plan</a></li><li><a href=\"/wiki/sources/prd.html\">Product brief</a></li></ul></section>",
            escape_html(&options.project_name),
            escape_html(&options.summary)
        ),
    )
}

fn plans_index_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Plans",
        "<h1>Planning Dashboard</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>Current stage: Stage 01 - Project Direction And Setup</li><li>Current unit: Unit 01 - Confirm Project Direction</li></ul></section><ul><li><a href=\"/wiki/plans/mvp/stage-01-foundation.html\">Stage 01 - Project Direction And Setup</a></li></ul>",
    )
}

fn stage_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Stage 01 - Project Direction And Setup",
        "<h1>Stage 01 - Project Direction And Setup</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li></ul></section><ul><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.html\">Unit 01 - Confirm Project Direction</a></li><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.html\">Unit 02 - Review Repository Setup</a></li><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.html\">Unit 03 - Update Source Briefs</a></li><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.html\">Unit 04 - Define First Implementation Unit</a></li></ul>",
    )
}

fn unit_page(options: &InitProjectOptions, title: &str, summary: &str) -> String {
    layout(
        options,
        title,
        &format!(
            "<h1>{}</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>{}</li></ul></section>",
            escape_html(title),
            escape_html(summary)
        ),
    )
}

fn source_page(options: &InitProjectOptions, title: &str) -> String {
    layout(
        options,
        title,
        &format!(
            "<h1>{}</h1><section class=\"summary\"><h2>Summary</h2><ul><li>{}</li></ul></section>",
            escape_html(title),
            escape_html(&options.summary)
        ),
    )
}

fn import_page(options: &InitProjectOptions) -> String {
    let body = if options.source_document.is_empty() {
        "<h1>Source Import</h1><p>No source document was imported.</p>".to_string()
    } else {
        format!(
            "<h1>Source Import</h1><p>Type: {}</p><pre>{}</pre>",
            escape_html(&options.source_document_type),
            escape_html(&options.source_document)
        )
    };
    layout(options, "Source Import", &body)
}

fn simple_page(options: &InitProjectOptions, title: &str, text: &str) -> String {
    layout(
        options,
        title,
        &format!(
            "<h1>{}</h1><p>{}</p>",
            escape_html(title),
            escape_html(text)
        ),
    )
}

fn scaffold_contract_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Scaffold Contract",
        "<h1>Scaffold Contract</h1><p>Hyperwiki scaffold conventions for HTML-first project wikis.</p><ul><li>Use lowercase <code>wiki/sources.html</code> as the source index.</li><li>Use app-visible <code>wiki/AGENTS.html</code> for wiki agent guidance.</li><li>Serve wiki styling from <code>/assets/wiki.css</code>.</li><li>Keep runtime state under ignored <code>.hyperwiki/state</code> and <code>.hyperwiki/sessions</code>.</li></ul>",
    )
}

fn dev_page(options: &InitProjectOptions) -> String {
    let mut items = Vec::new();
    if !options.dev_command.is_empty() {
        items.push(format!(
            "<li><code>{}</code></li>",
            escape_html(&options.dev_command)
        ));
    }
    for script in &options.package_scripts {
        items.push(format!("<li><code>{}</code></li>", escape_html(script)));
    }
    items.push("<li><code>npx hyperwiki</code></li>".to_string());
    layout(
        options,
        "Development Workflow",
        &format!(
            "<h1>Development Workflow</h1><p>Use local commands, Git, Portless previews, and Hyperwiki plans for implementation work.</p><h2>Commands</h2><ul>{}</ul>",
            items.join("")
        ),
    )
}

fn log_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Log",
        "<h1>Project Log</h1><article><h2>bootstrap | initialize HTML-first project wiki</h2><ul><li>Mode: bootstrap_new.</li><li>Canonical wiki format: HTML.</li></ul></article>",
    )
}

fn sources_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Sources",
        "<h1>Sources</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Source index for this Hyperwiki project.</li><li>Canonical source index path: lowercase <code>wiki/sources.html</code>.</li></ul></section><ul><li><a href=\"/wiki/sources/prd.html\">Product brief</a></li><li><a href=\"/wiki/sources/technical-brief.html\">Technical brief</a></li><li><a href=\"/wiki/sources/design-brief.html\">Design brief</a></li><li><a href=\"/wiki/sources/planning-interview.html\">Planning interview</a></li><li><a href=\"/wiki/sources/import.html\">Imported source</a></li></ul>",
    )
}

fn wiki_agent_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Wiki Agent Guide",
        "<h1>Wiki Agent Guide</h1><p>Read wiki/index.html before project-specific work and use wiki/sources.html as the source index.</p>",
    )
}

fn agents_markdown(options: &InitProjectOptions) -> String {
    format!(
        "# AGENTS.md instructions for {}\n\nRead `wiki/index.html` before project-specific work and use `wiki/sources.html` as the source index.\n\nDo not add a duplicate `wiki/Sources.html`; Hyperwiki uses lowercase `wiki/sources.html`.\n\nIf this project needs an app preview, add or maintain a Portless-backed `dev` script and keep preview instructions in `.hyperwiki/config.json`.\n\nUse Portless for local dev previews. Prefer package-manager-backed `dev` scripts over fixed localhost ports.\n\nCreate or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.\n",
        options.project_name
    )
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn percent_encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn generated_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("project-{nanos}")
}

fn now_isoish() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("{seconds}")
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
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "project".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn lists_existing_registry_records_and_groups_checkouts() {
        let home = temp_root("list");
        let main = home.join("Hyper Wiki");
        let worktree = home.join("hyperwiki.worktrees").join("feature-one");
        make_project(&main, "Hyper Wiki");
        make_project(&worktree, "Hyper Wiki");
        fs::write(
            worktree.join(".git"),
            "gitdir: ../.git/worktrees/feature-one",
        )
        .unwrap();
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![
                    record("main", &main, "Hyper Wiki", "hyper-wiki", "main"),
                    record(
                        "feature",
                        &worktree,
                        "Hyper Wiki",
                        "hyper-wiki",
                        "feature-one",
                    ),
                ],
            },
        )
        .unwrap();

        let list = ProjectRegistry::new(&home).list(Some("feature"));
        assert_eq!(list.active_project_id.as_deref(), Some("feature"));
        assert_eq!(list.checkouts.len(), 2);
        assert_eq!(list.project_groups.len(), 1);
        assert_eq!(list.project_groups[0].checkouts[0].worktree_slug, "main");
        assert_eq!(
            list.project_groups[0].checkouts[1].worktree_slug,
            "feature-one"
        );
    }

    #[test]
    fn prunes_missing_worktree_records_without_losing_main() {
        let home = temp_root("prune");
        let main = home.join("Main Project");
        let missing = home.join("missing-worktree");
        make_project(&main, "Main Project");
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![
                    record("main", &main, "Main Project", "main-project", "main"),
                    record(
                        "missing",
                        &missing,
                        "Main Project",
                        "main-project",
                        "feature-missing",
                    ),
                ],
            },
        )
        .unwrap();

        let list = ProjectRegistry::new(&home).list(None);
        assert_eq!(list.checkouts.len(), 1);
        assert_eq!(list.checkouts[0].id, "main");
    }

    #[test]
    fn resolves_by_project_and_worktree_slug() {
        let home = temp_root("resolve");
        let main = home.join("Resolve Project");
        make_project(&main, "Resolve Project");
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![record(
                    "main",
                    &main,
                    "Resolve Project",
                    "resolve-project",
                    "main",
                )],
            },
        )
        .unwrap();

        let resolved = ProjectRegistry::new(&home)
            .resolve_by_slug("resolve-project", Some("main"))
            .expect("project should resolve");
        assert_eq!(resolved.id, "main");
        assert!(resolved.available);
    }

    #[test]
    fn resolves_by_id_with_available_project_data() {
        let home = temp_root("resolve-id");
        let root = home.join("Resolve By Id");
        make_project(&root, "Resolve By Id");
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![record("project-id", &root, "Old Name", "old-name", "main")],
            },
        )
        .unwrap();

        let resolved = ProjectRegistry::new(&home)
            .resolve(Some("project-id"), None)
            .expect("project should resolve by id");
        assert_eq!(resolved.name, "Resolve By Id");
        assert!(resolved.available);
    }

    #[test]
    fn removes_registry_record_without_deleting_files_by_default() {
        let home = temp_root("remove");
        let root = home.join("Remove Project");
        make_project(&root, "Remove Project");
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![record(
                    "remove",
                    &root,
                    "Remove Project",
                    "remove-project",
                    "main",
                )],
            },
        )
        .unwrap();

        let removed = ProjectRegistry::new(&home)
            .remove("remove", false)
            .expect("remove should succeed")
            .expect("record should exist");
        assert_eq!(removed.id, "remove");
        assert!(root.exists());
        assert!(ProjectRegistry::new(&home).read_raw().projects.is_empty());
    }

    #[test]
    fn creates_dashboard_project_with_wiki_git_and_registry_record() {
        let previous_projects_dir = std::env::var_os("HYPERWIKI_PROJECTS_DIR");
        let projects_dir = temp_root("create-projects-dir");
        let home = temp_root("create-home");
        std::env::set_var("HYPERWIKI_PROJECTS_DIR", &projects_dir);
        let registry = ProjectRegistry::new(&home);

        let created = create_project_from_dashboard(
            &registry,
            ProjectCreateRequest {
                title: "MarkdownStack".to_string(),
                summary: Some("A Markdown pattern library.".to_string()),
                document: Some("# Source\n".to_string()),
                document_type: Some("markdown".to_string()),
                initialize_git: Some(true),
            },
        )
        .unwrap();

        match previous_projects_dir {
            Some(value) => std::env::set_var("HYPERWIKI_PROJECTS_DIR", value),
            None => std::env::remove_var("HYPERWIKI_PROJECTS_DIR"),
        }
        assert_eq!(created.project.name, "MarkdownStack");
        assert_eq!(created.project.project_slug, "markdownstack");
        assert_eq!(created.workspace_url, "/workspace/markdownstack/main");
        assert_eq!(created.git.status, "committed");
        assert!(created
            .project
            .root
            .join("wiki")
            .join("index.html")
            .is_file());
        assert!(created
            .project
            .root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-foundation.html")
            .is_file());
        assert!(created
            .project
            .root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-03-dogfood-hardening")
            .join("unit-04-record-handoff-notes.html")
            .is_file());
        let agents = fs::read_to_string(created.project.root.join("AGENTS.md")).unwrap();
        let sources =
            fs::read_to_string(created.project.root.join("wiki").join("sources.html")).unwrap();
        let contract = fs::read_to_string(
            created
                .project
                .root
                .join("wiki")
                .join("scaffold-contract.html"),
        )
        .unwrap();
        assert!(agents.contains("Do not add a duplicate `wiki/Sources.html`"));
        assert!(agents.contains("Portless-backed `dev` script"));
        assert!(sources.contains("lowercase <code>wiki/sources.html</code>"));
        assert!(contract.contains("wiki/AGENTS.html"));
        assert!(registry
            .list(Some(&created.project.id))
            .checkouts
            .iter()
            .any(|project| project.id == created.project.id));
    }

    #[test]
    fn removes_project_by_root_fallback_and_deletes_files_when_requested() {
        let home = temp_root("remove-root-home");
        let root = temp_root("remove-root-project");
        make_project(&root, "Remove Root Project");
        let registry = ProjectRegistry::new(&home);
        let registered = registry.register(&root).unwrap();

        let removed = registry
            .remove_with_root_fallback(
                "stale-id",
                ProjectRemoveRequest {
                    delete_files: true,
                    root: Some(root.clone()),
                },
            )
            .unwrap();

        assert_eq!(removed.project.id, registered.id);
        assert!(removed.deleted_files);
        assert!(!root.exists());
        assert!(registry.read_raw().projects.is_empty());
    }

    #[test]
    fn reset_clears_registry_and_runtime_state_without_touching_wiki() {
        let home = temp_root("reset-home");
        let root = temp_root("reset-current");
        let other = temp_root("reset-other");
        let unsafe_root = temp_root("reset-unsafe");
        make_project(&root, "Reset Current");
        make_project(&other, "Reset Other");
        fs::create_dir_all(root.join(".hyperwiki").join("state")).unwrap();
        fs::create_dir_all(root.join(".hyperwiki").join("sessions")).unwrap();
        fs::create_dir_all(other.join(".hyperwiki").join("state")).unwrap();
        fs::create_dir_all(other.join(".hyperwiki").join("sessions")).unwrap();
        fs::create_dir_all(unsafe_root.join(".hyperwiki").join("state")).unwrap();
        fs::write(
            unsafe_root
                .join(".hyperwiki")
                .join("state")
                .join("danger.json"),
            "runtime\n",
        )
        .unwrap();
        fs::write(
            root.join(".hyperwiki").join("state").join("workspace.json"),
            "runtime\n",
        )
        .unwrap();
        fs::write(
            other.join(".hyperwiki").join("sessions").join("cli.json"),
            "runtime\n",
        )
        .unwrap();
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![
                    record("one", &root, "Reset Current", "reset-current", "main"),
                    record("two", &other, "Reset Other", "reset-other", "main"),
                    record("unsafe", &unsafe_root, "Unsafe", "unsafe", "main"),
                ],
            },
        )
        .unwrap();
        let registry = ProjectRegistry::new(&home);

        let dry_run = reset_hyperwiki_state(&root, &registry, true).unwrap();
        assert!(dry_run
            .iter()
            .any(|action| action.path == home.join("projects.json")));
        assert!(home.join("projects.json").exists());
        assert!(root
            .join(".hyperwiki")
            .join("state")
            .join("workspace.json")
            .exists());

        let actions = reset_hyperwiki_state(&root, &registry, false).unwrap();
        assert!(actions
            .iter()
            .any(|action| action.path == other.join(".hyperwiki").join("sessions")));
        assert!(!home.join("projects.json").exists());
        assert!(root.join(".hyperwiki").join("config.json").exists());
        assert!(root.join("wiki").exists());
        assert!(fs::read_dir(root.join(".hyperwiki").join("state"))
            .unwrap()
            .next()
            .is_none());
        assert!(fs::read_dir(other.join(".hyperwiki").join("sessions"))
            .unwrap()
            .next()
            .is_none());
        assert!(unsafe_root
            .join(".hyperwiki")
            .join("state")
            .join("danger.json")
            .exists());
    }

    fn record(
        id: &str,
        root: &Path,
        name: &str,
        project_slug: &str,
        worktree_slug: &str,
    ) -> ProjectRecord {
        ProjectRecord {
            id: id.to_string(),
            root: root.to_path_buf(),
            name: name.to_string(),
            project_slug: project_slug.to_string(),
            worktree_slug: worktree_slug.to_string(),
            available: true,
            last_opened_at: None,
            active: false,
        }
    }

    fn make_project(root: &Path, name: &str) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({ "projectName": name }).to_string(),
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
