use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

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
