use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "projects",
        runtime_owner: "rust-tauri",
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_planning: Option<crate::domain::import_planning::ImportPlanningStatus>,
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
    pub planning_answers: BTreeMap<String, PlanningAnswer>,
    #[serde(default)]
    pub initialize_git: Option<bool>,
    #[serde(default)]
    pub install_agent_skills: Option<bool>,
    #[serde(default)]
    pub agent_launch_command: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanningAnswer {
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub tradeoff: String,
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
                "hyperwiki project not found. Run `hyperwiki init` in this repo first.".to_string(),
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
            import_planning: Some(crate::domain::import_planning::import_planning_status(
                &project.root,
            )),
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
        let records = self.available_records();
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
                import_planning: project
                    .available
                    .then(|| crate::domain::import_planning::import_planning_status(&item.root)),
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
        let projects = self.available_records();
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
            import_planning: Some(crate::domain::import_planning::import_planning_status(
                &record.root,
            )),
            ..record
        })
    }

    pub fn resolve(&self, id: Option<&str>, fallback_root: Option<&Path>) -> Option<ProjectRecord> {
        let registry = RegistryFile {
            version: 1,
            projects: self.available_records(),
        };
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
            import_planning: Some(crate::domain::import_planning::import_planning_status(
                &record.root,
            )),
            ..record
        })
    }

    fn available_records(&self) -> Vec<ProjectRecord> {
        let mut registry = self.read_raw();
        let before = registry.projects.len();
        registry.projects = prune_unavailable_records(with_unique_slugs(registry.projects));
        if registry.projects.len() != before {
            let _ = write_registry_file(&self.file_path, &registry);
        }
        registry.projects
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
    let source_document = request.document.unwrap_or_default();
    let source_document_type = request.document_type.unwrap_or_default();
    let source_facts = SourceFacts::from_document(&source_document, &source_document_type, summary);
    let project_root = unique_project_root(title).map_err(|error| (500, error))?;
    fs::create_dir_all(&project_root).map_err(|error| (500, error.to_string()))?;
    init_hyperwiki_project(
        &project_root,
        InitProjectOptions {
            project_name: title.to_string(),
            summary: source_facts.summary.clone(),
            source_document,
            source_document_type,
            source_facts,
            planning_answers: request.planning_answers,
            agent_launch_command: request.agent_launch_command.unwrap_or_default(),
            dev_command: String::new(),
            package_scripts: Vec::new(),
            install_agent_skills: request.install_agent_skills.unwrap_or(true),
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
    pub source_facts: SourceFacts,
    pub planning_answers: BTreeMap<String, PlanningAnswer>,
    pub agent_launch_command: String,
    pub dev_command: String,
    pub package_scripts: Vec<String>,
    pub install_agent_skills: bool,
    pub overwrite: bool,
}

struct BundledAgentSkillFile {
    relative_path: &'static str,
    bytes: &'static [u8],
}

struct BundledAgentSkill {
    name: &'static str,
    source: &'static str,
    source_type: &'static str,
    skill_path: &'static str,
    computed_hash: &'static str,
    files: &'static [BundledAgentSkillFile],
}

include!(concat!(env!("OUT_DIR"), "/bundled_agent_skills.rs"));

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SourceFacts {
    pub summary: String,
    pub problem: String,
    pub idea: String,
    pub shape: String,
    pub mvp: Vec<String>,
    pub promotion: Vec<String>,
    pub features: Vec<String>,
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
                "canonicalWiki": "mdx",
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
    if options.install_agent_skills {
        install_agent_skills(root, options.overwrite)?;
    }
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

fn prune_unavailable_records(projects: Vec<ProjectRecord>) -> Vec<ProjectRecord> {
    projects
        .into_iter()
        .filter(|project| project_from_root(&project.root).available)
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
    if !options.source_document.trim().is_empty() {
        return write_import_wiki(root, options);
    }
    let pages = [
        ("wiki/index.mdx", index_page(options)),
        ("wiki/AGENTS.mdx", wiki_agent_page(options)),
        ("wiki/log.mdx", log_page(options)),
        ("wiki/sources.mdx", sources_page(options)),
        (
            "wiki/scaffold-contract.mdx",
            scaffold_contract_page(options),
        ),
        (
            "wiki/roadmap.mdx",
            simple_page(
                options,
                "Roadmap",
                "Confirm project goals, implement the first slice, and record validation.",
            ),
        ),
        (
            "wiki/architecture.mdx",
            simple_page(
                options,
                "Architecture",
                "Document the project architecture as implementation evidence grows.",
            ),
        ),
        ("wiki/dev.mdx", dev_page(options)),
        ("wiki/plans/index.mdx", plans_index_page(options)),
        (
            "wiki/plans/mvp/index.mdx",
            simple_page(
                options,
                "MVP Plan",
                "Track MVP stages and implementation units.",
            ),
        ),
        (
            "wiki/plans/mvp/implementation-spec.mdx",
            simple_page(
                options,
                "Implementation Spec",
                "Capture implementation scope, constraints, and verification expectations.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation.mdx",
            stage_page(options),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.mdx",
            unit_page(
                options,
                "Unit 01 - Confirm Project Direction",
                "Confirm project goals, audience, non-goals, and success criteria.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.mdx",
            unit_page(
                options,
                "Unit 02 - Review Repository Setup",
                "Review repository setup and development commands.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.mdx",
            unit_page(
                options,
                "Unit 03 - Update Source Briefs",
                "Update source briefs and roadmap from real project evidence.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.mdx",
            unit_page(
                options,
                "Unit 04 - Define First Implementation Unit",
                "Define the first implementation unit and verification path.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace.mdx",
            simple_page(
                options,
                "Stage 02 - First Implementation Track",
                "Implement the first approved feature or architecture slice.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-01-implement-first-slice.mdx",
            unit_page(
                options,
                "Unit 01 - Implement First Slice",
                "Implement the first approved feature or architecture slice.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-02-sync-plan-status.mdx",
            unit_page(
                options,
                "Unit 02 - Sync Plan Status",
                "Keep plan status and source context synchronized with discoveries.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-03-record-validation.mdx",
            unit_page(
                options,
                "Unit 03 - Record Validation",
                "Record validation that changes project confidence or next steps.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-02-dev-workspace/unit-04-preserve-canonical-truth.mdx",
            unit_page(
                options,
                "Unit 04 - Preserve Canonical Truth",
                "Avoid hidden UI-only state; keep repo files and Git canonical.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening.mdx",
            simple_page(
                options,
                "Stage 03 - Hardening And Release Readiness",
                "Close verification gaps and update durable docs.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-01-close-verification-gaps.mdx",
            unit_page(
                options,
                "Unit 01 - Close Verification Gaps",
                "Close gaps found during implementation and verification.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-02-harden-workflows.mdx",
            unit_page(
                options,
                "Unit 02 - Harden Workflows",
                "Harden setup, test, security, accessibility, or release workflows as relevant.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-03-update-durable-docs.mdx",
            unit_page(
                options,
                "Unit 03 - Update Durable Docs",
                "Update durable docs and source briefs from final implementation evidence.",
            ),
        ),
        (
            "wiki/plans/mvp/stage-03-dogfood-hardening/unit-04-record-handoff-notes.mdx",
            unit_page(
                options,
                "Unit 04 - Record Handoff Notes",
                "Record completion criteria and release or handoff notes.",
            ),
        ),
        (
            "wiki/sources/prd.mdx",
            source_page(options, "Product Brief"),
        ),
        (
            "wiki/sources/technical-brief.mdx",
            source_page(options, "Technical Brief"),
        ),
        (
            "wiki/sources/design-brief.mdx",
            source_page(options, "Design Brief"),
        ),
        ("wiki/sources/import.mdx", import_page(options)),
    ];
    for (relative, content) in pages {
        write_if_safe(&root.join(relative), &content, options.overwrite)?;
    }
    Ok(())
}

fn write_import_wiki(root: &Path, options: &InitProjectOptions) -> Result<(), String> {
    let pages = [
        ("wiki/index.mdx", index_page(options)),
        ("wiki/AGENTS.mdx", wiki_agent_page(options)),
        ("wiki/log.mdx", log_page(options)),
        ("wiki/sources.mdx", sources_page(options)),
        (
            "wiki/scaffold-contract.mdx",
            scaffold_contract_page(options),
        ),
        ("wiki/roadmap.mdx", import_roadmap_page(options)),
        (
            "wiki/architecture.mdx",
            simple_page(
                options,
                "Architecture",
                "Architecture is intentionally unset until source-grounded Q&A confirms stack, data, integration, privacy, and runtime decisions.",
            ),
        ),
        ("wiki/dev.mdx", dev_page(options)),
        ("wiki/plans/index.mdx", plans_index_page(options)),
        (
            "wiki/sources/prd.mdx",
            product_brief_page(options),
        ),
        (
            "wiki/sources/technical-brief.mdx",
            technical_brief_page(options),
        ),
        (
            "wiki/sources/design-brief.mdx",
            design_brief_page(options),
        ),
        ("wiki/sources/import.mdx", import_page(options)),
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

fn write_bytes_if_safe(path: &Path, content: &[u8], overwrite: bool) -> Result<(), String> {
    if path.exists() && !overwrite {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

fn install_agent_skills(root: &Path, overwrite: bool) -> Result<(), String> {
    for skill in BUNDLED_AGENT_SKILLS {
        for file in skill.files {
            write_bytes_if_safe(
                &root
                    .join(".agents")
                    .join("skills")
                    .join(skill.name)
                    .join(file.relative_path),
                file.bytes,
                overwrite,
            )?;
        }
    }
    merge_skills_lock(root, overwrite)
}

fn merge_skills_lock(root: &Path, overwrite: bool) -> Result<(), String> {
    let lock_path = root.join("skills-lock.json");
    let mut lock = fs::read_to_string(&lock_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .filter(|value| value.is_object())
        .unwrap_or_else(|| serde_json::json!({ "version": 1, "skills": {} }));

    if !lock["version"].is_number() {
        lock["version"] = serde_json::json!(1);
    }
    if !lock["skills"].is_object() {
        lock["skills"] = serde_json::json!({});
    }

    let skills = lock["skills"]
        .as_object_mut()
        .ok_or_else(|| "Could not merge skills-lock.json.".to_string())?;
    for skill in BUNDLED_AGENT_SKILLS {
        if overwrite || !skills.contains_key(skill.name) {
            skills.insert(
                skill.name.to_string(),
                serde_json::json!({
                    "source": skill.source,
                    "sourceType": skill.source_type,
                    "skillPath": skill.skill_path,
                    "computedHash": skill.computed_hash
                }),
            );
        }
    }

    write_if_safe(
        &lock_path,
        &format!(
            "{}\n",
            serde_json::to_string_pretty(&lock).map_err(|error| error.to_string())?
        ),
        true,
    )
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
    let body = body.replace(" class=", " className=");
    format!(
        r#"---
title: "{}"
description: "{}"
wikiKind: "page"
---

{body}
"#,
        escape_html(title),
        escape_html(&format!("{title} for {}", options.project_name)),
    )
}

fn index_page(options: &InitProjectOptions) -> String {
    let plan_link = if options.source_document.trim().is_empty() {
        "<li><a href=\"/wiki/plans/mvp/index.mdx\">MVP plan</a></li>"
    } else {
        "<li><a href=\"/wiki/plans/index.mdx\">Plans</a></li>"
    };
    layout(
        options,
        "Home",
        &format!(
            "<h1>{}</h1><p>{}</p><section><h2>Core Pages</h2><ul>{}<li><a href=\"/wiki/sources/prd.mdx\">Product brief</a></li></ul></section>",
            escape_html(&options.project_name),
            escape_html(&options.summary),
            plan_link
        ),
    )
}

fn plans_index_page(options: &InitProjectOptions) -> String {
    if !options.source_document.trim().is_empty() {
        return layout(
            options,
            "Plans",
            "<h1>Plans</h1>\
<section class=\"summary\"><h2>Summary</h2><ul>\
<li>Status: planning</li>\
<li>Current stage: none; source-grounded Q&amp;A has not produced a real implementation stage yet.</li>\
<li>Current unit: none; do not execute product code until the agent creates a detailed unit with verification.</li>\
	<li>Next action: run the agent-led source review from <code>wiki/sources/import.mdx</code>, ask focused questions in the agent terminal if needed, then create a decision-complete plan.</li>\
</ul></section>\
<section><h2>Planning Rule</h2><p>This imported project intentionally has no generated MVP stage tree yet. Stages and units must be created only after the source has been reviewed and the user has answered detailed Q&amp;A for maximum clarity.</p></section>",
        );
    }
    layout(
        options,
        "Plans",
        "<h1>Plans</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>Current stage: Stage 01 - Project Direction And Setup</li><li>Current unit: Unit 01 - Confirm Project Direction</li></ul></section><ul><li><a href=\"/wiki/plans/mvp/stage-01-foundation.mdx\">Stage 01 - Project Direction And Setup</a></li></ul>",
    )
}

fn stage_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Stage 01 - Project Direction And Setup",
        "<h1>Stage 01 - Project Direction And Setup</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li></ul></section><ul><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-01-confirm-project-direction.mdx\">Unit 01 - Confirm Project Direction</a></li><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-02-review-repository-setup.mdx\">Unit 02 - Review Repository Setup</a></li><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-03-update-source-briefs.mdx\">Unit 03 - Update Source Briefs</a></li><li><a href=\"/wiki/plans/mvp/stage-01-foundation/unit-04-define-first-implementation-unit.mdx\">Unit 04 - Define First Implementation Unit</a></li></ul>",
    )
}

fn unit_page(options: &InitProjectOptions, title: &str, summary: &str) -> String {
    layout(
        options,
        title,
        &format!(
            "<h1>{}</h1>\
<section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>{}</li></ul></section>\
<section><h2>Intent</h2><p>{}</p></section>\
<section><h2>Scope</h2><ul><li>Confirm the concrete work for this unit before editing product code.</li><li>Keep changes bounded to evidence from the source briefs, repository, and user decisions.</li></ul></section>\
<section><h2>Implementation Notes</h2><ul><li>Read <code>wiki/index.mdx</code>, <code>wiki/sources.mdx</code>, and relevant source briefs before execution.</li><li>Update this unit if implementation discoveries change scope, blockers, or verification.</li></ul></section>\
<section><h2>Verification</h2><ul><li>Record the command, manual check, or explicit deferral that proves this unit is complete.</li><li>Do not mark the unit complete until verification evidence is captured.</li></ul></section>",
            escape_html(title),
            escape_html(summary),
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

fn product_brief_page(options: &InitProjectOptions) -> String {
    let facts = &options.source_facts;
    layout(
        options,
        "Product Brief",
        &format!(
            "<h1>Product Brief</h1>\
<section class=\"summary\"><h2>Summary</h2><ul><li>{}</li></ul></section>\
<section><h2>Problem</h2><p>{}</p></section>\
<section><h2>Idea</h2><p>{}</p></section>\
<section><h2>MVP</h2>{}</section>\
<section><h2>Promotion Criteria</h2>{}</section>\
<section><h2>Status</h2><ul><li>Last reviewed: import time</li><li>Evidence basis: imported source document</li><li>Confidence: medium until Q&amp;A confirms scope.</li></ul></section>",
            escape_html(&facts.summary),
            escape_html(or_unknown(&facts.problem)),
            escape_html(or_unknown(&facts.idea)),
            html_list_or_unknown(&facts.mvp),
            html_list_or_unknown(&facts.promotion)
        ),
    )
}

fn technical_brief_page(options: &InitProjectOptions) -> String {
    let facts = &options.source_facts;
    layout(
        options,
        "Technical Brief",
        &format!(
            "<h1>Technical Brief</h1>\
	<section class=\"summary\"><h2>Summary</h2><ul><li>Technical decisions are not final until source review and focused Q&amp;A confirm implementation constraints.</li></ul></section>\
<section><h2>Known Implementation Signals</h2>{}</section>\
<section><h2>Technical Unknowns For Q&amp;A</h2><ul>\
<li>Target platform, app shell, storage model, and deployment path.</li>\
<li>External APIs, model providers, location or device capabilities, and privacy boundaries.</li>\
<li>Automated test strategy, manual acceptance flow, and preview/runtime commands.</li>\
</ul></section>\
<section><h2>Status</h2><ul><li>Last reviewed: import time</li><li>Evidence basis: imported source document</li><li>Confidence: low until Q&amp;A confirms stack and runtime decisions.</li></ul></section>",
            html_list_or_unknown(&facts.features)
        ),
    )
}

fn design_brief_page(options: &InitProjectOptions) -> String {
    let facts = &options.source_facts;
    layout(
        options,
        "Design Brief",
        &format!(
            "<h1>Design Brief</h1>\
<section class=\"summary\"><h2>Summary</h2><ul><li>{}</li></ul></section>\
<section><h2>Interaction Signals</h2>{}</section>\
<section><h2>Design Unknowns For Q&amp;A</h2><ul>\
<li>Primary user flow, first-run experience, and core screen sequence.</li>\
<li>Accessibility and safety requirements for the intended context of use.</li>\
<li>Manual validation steps for key UX and responsive states.</li>\
</ul></section>\
<section><h2>Status</h2><ul><li>Last reviewed: import time</li><li>Evidence basis: imported source document</li><li>Confidence: medium for intent, low for concrete UI until Q&amp;A.</li></ul></section>",
            escape_html(&facts.summary),
            html_list_or_unknown(&facts.mvp)
        ),
    )
}

fn import_roadmap_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Roadmap",
        "<h1>Roadmap</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: planning intake</li><li>Next action: complete detailed Q&amp;A before creating implementation stages or units.</li></ul></section><p>The imported source defines product intent, but implementation sequencing is intentionally deferred until focused agent Q&amp;A resolves key decisions.</p>",
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

impl SourceFacts {
    fn from_document(document: &str, document_type: &str, fallback_summary: &str) -> Self {
        let sections = if document_type.eq_ignore_ascii_case("html") {
            html_sections(document)
        } else {
            markdown_sections(document)
        };
        let problem = section_text(&sections, &["problem"]);
        let idea = section_text(&sections, &["idea", "overview"]);
        let shape = section_text(&sections, &["shape", "product shape"]);
        let mvp = section_items(&sections, &["mvp", "minimum viable product"]);
        let promotion = section_items(
            &sections,
            &[
                "promotion",
                "promotion criteria",
                "validation",
                "success criteria",
            ],
        );
        let features = section_items(&sections, &["idea", "shape", "core features", "features"]);
        let meta_description = html_meta_description(document);
        let lead = lead_text(document, document_type);
        let summary = first_non_empty([
            meta_description.as_str(),
            lead.as_str(),
            problem.as_str(),
            fallback_summary,
            "Imported project source.",
        ]);
        Self {
            summary: truncate_summary(&summary),
            problem,
            idea,
            shape,
            mvp,
            promotion,
            features,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct SourceSection {
    heading: String,
    text: String,
    items: Vec<String>,
}

fn html_sections(html: &str) -> Vec<SourceSection> {
    let mut sections = Vec::new();
    let mut rest = html;
    while let Some(start) = find_ci(rest, "<section") {
        rest = &rest[start..];
        let Some(open_end) = rest.find('>') else {
            break;
        };
        rest = &rest[open_end + 1..];
        let Some(end) = find_ci(rest, "</section>") else {
            break;
        };
        let raw = &rest[..end];
        let heading = first_heading(raw);
        if !heading.is_empty() {
            sections.push(SourceSection {
                heading: normalize_heading(&heading),
                text: html_to_text(raw),
                items: html_list_items(raw),
            });
        }
        rest = &rest[end + "</section>".len()..];
    }
    if sections.is_empty() {
        let text = html_to_text(html);
        if !text.is_empty() {
            sections.push(SourceSection {
                heading: "source".to_string(),
                text,
                items: Vec::new(),
            });
        }
    }
    sections
}

fn markdown_sections(markdown: &str) -> Vec<SourceSection> {
    let mut sections = Vec::new();
    let mut current: Option<SourceSection> = None;
    for line in markdown.lines() {
        if let Some(title) = line.trim_start().strip_prefix('#') {
            if line.trim_start().starts_with('#') {
                if let Some(section) = current.take() {
                    sections.push(section);
                }
                current = Some(SourceSection {
                    heading: normalize_heading(title.trim_start_matches('#').trim()),
                    text: String::new(),
                    items: Vec::new(),
                });
                continue;
            }
        }
        if let Some(section) = current.as_mut() {
            let trimmed = line.trim();
            if let Some(item) = trimmed
                .strip_prefix("- ")
                .or_else(|| trimmed.strip_prefix("* "))
            {
                section.items.push(item.trim().to_string());
            }
            if !trimmed.is_empty() {
                if !section.text.is_empty() {
                    section.text.push(' ');
                }
                section
                    .text
                    .push_str(trimmed.trim_start_matches("- ").trim_start_matches("* "));
            }
        }
    }
    if let Some(section) = current {
        sections.push(section);
    }
    sections
}

fn first_heading(html: &str) -> String {
    for tag in ["h1", "h2", "h3", "h4", "h5", "h6"] {
        let open = format!("<{tag}");
        let close = format!("</{tag}>");
        if let Some(start) = find_ci(html, &open) {
            let after = &html[start..];
            let Some(open_end) = after.find('>') else {
                continue;
            };
            let content = &after[open_end + 1..];
            let Some(end) = find_ci(content, &close) else {
                continue;
            };
            return html_to_text(&content[..end]);
        }
    }
    String::new()
}

fn html_list_items(html: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut rest = html;
    while let Some(start) = find_ci(rest, "<li") {
        rest = &rest[start..];
        let Some(open_end) = rest.find('>') else {
            break;
        };
        rest = &rest[open_end + 1..];
        let Some(end) = find_ci(rest, "</li>") else {
            break;
        };
        let item = html_to_text(&rest[..end]);
        if !item.is_empty() {
            items.push(item);
        }
        rest = &rest[end + "</li>".len()..];
    }
    items
}

fn html_to_text(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                text.push(' ');
            }
            '>' => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }
    decode_entities(&collapse_whitespace(&text))
}

fn html_meta_description(html: &str) -> String {
    let Some(meta_start) = find_ci(html, "name=\"description\"") else {
        return String::new();
    };
    let before = &html[..meta_start];
    let tag_start = before.rfind('<').unwrap_or(meta_start);
    let after = &html[meta_start..];
    let tag_end = after
        .find('>')
        .map(|index| meta_start + index)
        .unwrap_or(html.len());
    let tag = &html[tag_start..tag_end];
    for marker in ["content=\"", "content='"] {
        if let Some(start) = find_ci(tag, marker) {
            let quote = marker.chars().last().unwrap_or('"');
            let value = &tag[start + marker.len()..];
            if let Some(end) = value.find(quote) {
                return decode_entities(&value[..end]);
            }
        }
    }
    String::new()
}

fn lead_text(document: &str, document_type: &str) -> String {
    if document_type.eq_ignore_ascii_case("html") {
        if let Some(start) = find_ci(document, "<p") {
            let after = &document[start..];
            if let Some(open_end) = after.find('>') {
                let content = &after[open_end + 1..];
                if let Some(end) = find_ci(content, "</p>") {
                    return html_to_text(&content[..end]);
                }
            }
        }
        return html_to_text(document);
    }
    collapse_whitespace(
        document
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or(""),
    )
}

fn section_text(sections: &[SourceSection], headings: &[&str]) -> String {
    let normalized = headings
        .iter()
        .map(|heading| normalize_heading(heading))
        .collect::<Vec<_>>();
    sections
        .iter()
        .find(|section| normalized.iter().any(|heading| heading == &section.heading))
        .map(|section| remove_heading_prefix(&section.text, &section.heading))
        .unwrap_or_default()
}

fn section_items(sections: &[SourceSection], headings: &[&str]) -> Vec<String> {
    let normalized = headings
        .iter()
        .map(|heading| normalize_heading(heading))
        .collect::<Vec<_>>();
    sections
        .iter()
        .filter(|section| normalized.iter().any(|heading| heading == &section.heading))
        .flat_map(|section| {
            if section.items.is_empty() {
                vec![remove_heading_prefix(&section.text, &section.heading)]
            } else {
                section.items.clone()
            }
        })
        .filter(|item| !item.trim().is_empty())
        .collect()
}

fn remove_heading_prefix(text: &str, heading: &str) -> String {
    let text = collapse_whitespace(text);
    let plain_heading = heading.replace(' ', "");
    if normalize_heading(&text).starts_with(heading) && text.len() > heading.len() {
        text[heading.len()..].trim().to_string()
    } else if normalize_heading(&text)
        .replace(' ', "")
        .starts_with(&plain_heading)
    {
        text
    } else {
        text
    }
}

fn normalize_heading(value: &str) -> String {
    collapse_whitespace(
        &value
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() {
                    ch.to_ascii_lowercase()
                } else {
                    ' '
                }
            })
            .collect::<String>(),
    )
}

fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    haystack.to_lowercase().find(&needle.to_lowercase())
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn first_non_empty<const N: usize>(values: [&str; N]) -> String {
    values
        .iter()
        .map(|value| value.trim())
        .find(|value| !value.is_empty() && !value.starts_with("<!doctype"))
        .unwrap_or("Imported project source.")
        .to_string()
}

fn truncate_summary(value: &str) -> String {
    let clean = collapse_whitespace(value);
    if clean.len() > 220 {
        format!("{}...", clean[..217].trim())
    } else {
        clean
    }
}

fn or_unknown(value: &str) -> &str {
    if value.trim().is_empty() {
        "Unknown; resolve through source review and focused agent Q&amp;A."
    } else {
        value
    }
}

fn html_list_or_unknown(items: &[String]) -> String {
    if items.is_empty() {
        return "<p>Unknown; resolve through source review and focused agent Q&amp;A.</p>".to_string();
    }
    format!(
        "<ul>{}</ul>",
        items
            .iter()
            .map(|item| format!("<li>{}</li>", escape_html(item)))
            .collect::<Vec<_>>()
            .join("")
    )
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
        "<h1>Scaffold Contract</h1><p>Hyperwiki scaffold conventions for MDX-first project wikis.</p><ul><li>Use lowercase <code>wiki/sources.mdx</code> as the source index.</li><li>Use app-visible <code>wiki/AGENTS.mdx</code> for wiki agent guidance.</li><li>Render plan pages from exact MDX source; agent-facing current-plan resources should use the Markdown derivative exposed by <code>/api/wiki/source</code> and the project contract.</li><li>Serve wiki styling from <code>/assets/wiki.css</code>.</li><li>Keep runtime state under ignored <code>.hyperwiki/state</code> and <code>.hyperwiki/sessions</code>.</li></ul>",
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
    items.push("<li><code>hyperwiki</code></li>".to_string());
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
        "<h1>Project Log</h1><article><h2>bootstrap | initialize MDX-first project wiki</h2><ul><li>Mode: bootstrap_new.</li><li>Canonical wiki format: MDX.</li></ul></article>",
    )
}

fn sources_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Sources",
        "<h1>Sources</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Source index for this Hyperwiki project.</li><li>Canonical source index path: lowercase <code>wiki/sources.mdx</code>.</li></ul></section><ul><li><a href=\"/wiki/sources/prd.mdx\">Product brief</a></li><li><a href=\"/wiki/sources/technical-brief.mdx\">Technical brief</a></li><li><a href=\"/wiki/sources/design-brief.mdx\">Design brief</a></li><li><a href=\"/wiki/sources/import.mdx\">Imported source</a></li></ul>",
    )
}

fn wiki_agent_page(options: &InitProjectOptions) -> String {
    layout(
        options,
        "Wiki Agent Guide",
        "<h1>Wiki Agent Guide</h1><p>Read wiki/index.mdx before project-specific work and use wiki/sources.mdx as the source index. For active plans, prefer the project contract or <code>/api/wiki/source</code> Markdown derivative over rendered app HTML.</p><section><h2>Repo-local Skills</h2><p>New Hyperwiki projects include repo-local agent skills under <code>.agents/skills/</code> unless initialization used <code>--no-skills</code>. Use <code>hyperwiki</code> for wiki maintenance, <code>grill-with-docs</code> for plan and domain-language stress tests, <code>parallel-dev-worktrees</code> and <code>portless</code> for branch-local previews, <code>frontend-design</code> and <code>make-interfaces-feel-better</code> for substantial UI work and polish, and <code>shadcn</code> plus <code>tailwind-design-system</code> for React, shadcn/ui, or Tailwind changes.</p></section>",
    )
}

fn agents_markdown(options: &InitProjectOptions) -> String {
    format!(
        "# AGENTS.md instructions for {}\n\nRead `wiki/index.mdx` before project-specific work and use `wiki/sources.mdx` as the source index.\n\nDo not add a duplicate `wiki/Sources.mdx`; Hyperwiki uses lowercase `wiki/sources.mdx`.\n\nFor active plans, prefer the project contract or `/api/wiki/source` Markdown derivative over rendered app HTML.\n\nIf this project needs an app preview, add or maintain a Portless-backed `dev` script and keep preview instructions in `.hyperwiki/config.json`.\n\nUse Portless for local dev previews. Prefer package-manager-backed `dev` scripts over fixed localhost ports.\n\nRepo-local agent skills are installed under `.agents/skills/` by default unless initialization used `--no-skills`. Use `hyperwiki` for wiki maintenance, `grill-with-docs` for plan and domain-language stress tests, `parallel-dev-worktrees` and `portless` for branch-local previews, `frontend-design` and `make-interfaces-feel-better` for substantial UI work and polish, and `shadcn` plus `tailwind-design-system` for React, shadcn/ui, or Tailwind changes.\n\nCreate or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.\n",
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
    fn prunes_unavailable_project_records_from_list_and_registry() {
        let home = temp_root("prune-unavailable");
        let missing = home.join("Routechat");
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![record(
                    "routechat",
                    &missing,
                    "routechat",
                    "routechat",
                    "main",
                )],
            },
        )
        .unwrap();

        let registry = ProjectRegistry::new(&home);
        let list = registry.list(Some("routechat"));

        assert!(list.projects.is_empty());
        assert!(list.checkouts.is_empty());
        assert!(list.project_groups.is_empty());
        assert_eq!(list.active_project_id, None);
        assert!(registry.read_raw().projects.is_empty());
    }

    #[test]
    fn does_not_resolve_unavailable_project_by_id_or_slug() {
        let home = temp_root("resolve-unavailable");
        let missing = home.join("Routechat");
        write_registry_file(
            &home.join("projects.json"),
            &RegistryFile {
                version: 1,
                projects: vec![record(
                    "routechat",
                    &missing,
                    "routechat",
                    "routechat",
                    "main",
                )],
            },
        )
        .unwrap();

        let registry = ProjectRegistry::new(&home);

        assert!(registry.resolve(Some("routechat"), None).is_none());
        assert!(registry.resolve_by_slug("routechat", Some("main")).is_none());
        assert!(registry.read_raw().projects.is_empty());
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
                planning_answers: BTreeMap::new(),
                initialize_git: Some(true),
                install_agent_skills: None,
                agent_launch_command: Some("codex --yolo".to_string()),
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
            .join("index.mdx")
            .is_file());
        assert!(!created
            .project
            .root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .exists());
        let plans = fs::read_to_string(
            created
                .project
                .root
                .join("wiki")
                .join("plans")
                .join("index.mdx"),
        )
        .unwrap();
        assert!(plans.contains("Status: planning"));
        assert!(plans.contains("no generated MVP stage tree"));
        let agents = fs::read_to_string(created.project.root.join("AGENTS.md")).unwrap();
        let config =
            fs::read_to_string(created.project.root.join(".hyperwiki").join("config.json"))
                .unwrap();
        let sources =
            fs::read_to_string(created.project.root.join("wiki").join("sources.mdx")).unwrap();
        let contract = fs::read_to_string(
            created
                .project
                .root
                .join("wiki")
                .join("scaffold-contract.mdx"),
        )
        .unwrap();
        assert!(agents.contains("Do not add a duplicate `wiki/Sources.mdx`"));
        assert!(agents.contains("/api/wiki/source"));
        assert!(agents.contains("Portless-backed `dev` script"));
        assert!(config.contains("\"launchCommand\": \"codex --yolo\""));
        assert!(sources.contains("lowercase <code>wiki/sources.mdx</code>"));
        assert!(contract.contains("wiki/AGENTS.mdx"));
        assert!(contract.contains("/api/wiki/source"));
        assert_default_skills_installed(&created.project.root);
        assert!(registry
            .list(Some(&created.project.id))
            .checkouts
            .iter()
            .any(|project| project.id == created.project.id));
    }

    #[test]
    fn imported_html_project_keeps_source_context_and_defers_plan_units() {
        let previous_projects_dir = std::env::var_os("HYPERWIKI_PROJECTS_DIR");
        let projects_dir = temp_root("routechat-import-projects-dir");
        let home = temp_root("routechat-import-home");
        std::env::set_var("HYPERWIKI_PROJECTS_DIR", &projects_dir);
        let registry = ProjectRegistry::new(&home);
        let mut planning_answers = BTreeMap::new();
        planning_answers.insert(
            "promise".to_string(),
            PlanningAnswer {
                value: "Generate live location narration first".to_string(),
                label: "Live narration".to_string(),
                detail: "Focus the first plan on the core route-aware audio loop.".to_string(),
                tradeoff: "Safety and privacy need early decisions.".to_string(),
            },
        );

        let created = create_project_from_dashboard(
            &registry,
            ProjectCreateRequest {
                title: "RouteChat".to_string(),
                summary: Some("<!doctype html> <html lang=\"en\"> <head>".to_string()),
                document: Some(
                    r#"<!doctype html>
<html lang="en">
<head><meta name="description" content="RouteChat is an app that gives you a spontaneous guided audio tour wherever you are."></head>
<body>
<section id="problem"><h2>Problem</h2><p>Most tours require planning, fixed routes, tickets, or a specific destination.</p></section>
<section id="idea"><h2>Idea</h2><p>RouteChat is a location-aware voice companion for travelers and curious locals.</p><ul><li>The key interaction is just start talking to me about where I am.</li><li>Driving mode should be hands-free and non-distracting.</li></ul></section>
<section id="mvp"><h2>MVP</h2><ul><li>Generates narration from current latitude, longitude, movement direction, speed, selected mode, and recent narration history.</li><li>Lets users choose a tone, ask follow-up questions, pause, replay, and switch modes by voice.</li></ul></section>
<section id="promotion"><h2>Promotion Criteria</h2><ul><li>A working prototype that can generate interesting narration from live location data.</li><li>A strong hands-free voice interaction design.</li></ul></section>
</body>
</html>"#
                        .to_string(),
                ),
                document_type: Some("html".to_string()),
                planning_answers,
                initialize_git: Some(false),
                install_agent_skills: None,
                agent_launch_command: None,
            },
        )
        .unwrap();

        match previous_projects_dir {
            Some(value) => std::env::set_var("HYPERWIKI_PROJECTS_DIR", value),
            None => std::env::remove_var("HYPERWIKI_PROJECTS_DIR"),
        }

        let root = created.project.root;
        let index = fs::read_to_string(root.join("wiki").join("index.mdx")).unwrap();
        let prd = fs::read_to_string(root.join("wiki").join("sources").join("prd.mdx")).unwrap();
        let plans = fs::read_to_string(root.join("wiki").join("plans").join("index.mdx")).unwrap();

        assert!(index.contains("spontaneous guided audio tour"));
        assert!(!index.contains("&lt;!doctype html&gt;"));
        assert!(prd.contains("Most tours require planning"));
        assert!(prd.contains("Generates narration from current latitude"));
        assert!(prd.contains("hands-free voice interaction"));
        assert!(plans.contains("Status: planning"));
        assert!(plans.contains("no generated MVP stage tree"));
        assert!(!root
            .join("wiki")
            .join("sources")
            .join("planning-interview.mdx")
            .exists());
        assert!(!root.join("wiki").join("plans").join("mvp").exists());
    }

    #[test]
    fn init_installs_default_agent_skills_and_lockfile() {
        let root = temp_root("init-agent-skills");

        init_hyperwiki_project(&root, init_options("Skill Project")).unwrap();

        assert_default_skills_installed(&root);
        let agents = fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(agents.contains("Repo-local agent skills are installed"));
        let wiki_agents = fs::read_to_string(root.join("wiki").join("AGENTS.mdx")).unwrap();
        assert!(wiki_agents.contains(".agents/skills/"));
    }

    #[test]
    fn init_can_skip_agent_skills() {
        let root = temp_root("init-no-agent-skills");
        let mut options = init_options("No Skills Project");
        options.install_agent_skills = false;

        init_hyperwiki_project(&root, options).unwrap();

        assert!(!root.join(".agents").join("skills").exists());
        assert!(!root.join("skills-lock.json").exists());
    }

    #[test]
    fn init_preserves_existing_agent_skills_and_lock_entries_without_overwrite() {
        let root = temp_root("init-preserve-agent-skills");
        let custom_skill = root.join(".agents").join("skills").join("shadcn");
        fs::create_dir_all(&custom_skill).unwrap();
        fs::write(custom_skill.join("SKILL.md"), "custom shadcn").unwrap();
        fs::write(
            root.join("skills-lock.json"),
            serde_json::to_string_pretty(&serde_json::json!({
                "version": 1,
                "skills": {
                    "shadcn": {
                        "source": "custom/source",
                        "sourceType": "local",
                        "skillPath": "SKILL.md",
                        "computedHash": "custom"
                    },
                    "custom-skill": {
                        "source": "custom/other",
                        "sourceType": "local",
                        "skillPath": "SKILL.md",
                        "computedHash": "other"
                    }
                }
            }))
            .unwrap(),
        )
        .unwrap();

        init_hyperwiki_project(&root, init_options("Preserve Skills")).unwrap();

        assert_eq!(
            fs::read_to_string(root.join(".agents").join("skills").join("shadcn").join("SKILL.md"))
                .unwrap(),
            "custom shadcn"
        );
        let lock = skills_lock(&root);
        assert_eq!(lock["skills"]["shadcn"]["source"], "custom/source");
        assert_eq!(lock["skills"]["custom-skill"]["source"], "custom/other");
        assert!(lock["skills"]["hyperwiki"].is_object());
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
            import_planning: None,
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

    fn init_options(project_name: &str) -> InitProjectOptions {
        InitProjectOptions {
            project_name: project_name.to_string(),
            summary: "Test project summary.".to_string(),
            source_document: String::new(),
            source_document_type: String::new(),
            source_facts: SourceFacts {
                summary: "Test project summary.".to_string(),
                ..Default::default()
            },
            planning_answers: BTreeMap::new(),
            agent_launch_command: String::new(),
            dev_command: String::new(),
            package_scripts: Vec::new(),
            install_agent_skills: true,
            overwrite: false,
        }
    }

    fn assert_default_skills_installed(root: &Path) {
        let lock = skills_lock(root);
        for skill in BUNDLED_AGENT_SKILLS {
            assert!(
                root.join(".agents")
                    .join("skills")
                    .join(skill.name)
                    .join("SKILL.md")
                    .is_file(),
                "{} should have SKILL.md",
                skill.name
            );
            assert!(
                lock["skills"][skill.name].is_object(),
                "{} should be in skills-lock.json",
                skill.name
            );
        }
    }

    fn skills_lock(root: &Path) -> serde_json::Value {
        serde_json::from_str(&fs::read_to_string(root.join("skills-lock.json")).unwrap()).unwrap()
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
