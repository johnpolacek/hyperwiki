//! Adoption of existing local projects into hyperwiki.
//!
//! Unlike dashboard project creation (which scaffolds a fresh directory and
//! wiki), adoption points hyperwiki at an existing repo that may already have
//! a wiki in an arbitrary shape — commonly plain `.md` docs-first pages. The
//! flow inspects the wiki shape, takes a git checkpoint, writes only the
//! non-wiki scaffold, and then lets the project's agent CLI port the existing
//! wiki to hyperwiki MDX conventions in an agentic runtime turn. Adoption
//! success is judged by `validate_adopted_wiki`, never by agent output.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::projects::{
    percent_encode_path_segment, same_path, unsafe_removal_root, write_project_scaffold,
    InitProjectOptions, ProjectRecord, ProjectRegistry,
};

pub const ADOPTION_CHECKPOINT_MESSAGE: &str = "hyperwiki: pre-adoption checkpoint";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptInspectRequest {
    pub root: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptInspectResponse {
    pub ok: bool,
    pub root: PathBuf,
    pub is_git_repo: bool,
    pub is_git_root: bool,
    pub git_dirty: bool,
    pub already_registered: bool,
    pub has_hyperwiki: bool,
    pub wiki: WikiShape,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiShape {
    pub exists: bool,
    pub md_files: Vec<String>,
    pub mdx_count: usize,
    pub other_files: Vec<String>,
    pub classification: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptProjectRequest {
    pub root: PathBuf,
    #[serde(default)]
    pub confirm_replace: bool,
    #[serde(default)]
    pub agent_launch_command: Option<String>,
    #[serde(default)]
    pub install_agent_skills: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptProjectResponse {
    pub ok: bool,
    pub project: ProjectRecord,
    pub workspace_url: String,
    pub checkpoint: AdoptionCheckpoint,
    pub adoption: AdoptionState,
    pub needs_adopt_turn: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdoptionCheckpoint {
    pub commit: String,
    pub created_commit: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdoptionState {
    pub status: String,
    pub md_files: Vec<String>,
    pub checkpoint_commit: String,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdoptionValidation {
    pub status: String,
    pub errors: Vec<String>,
    pub validated_at_ms: u128,
}

pub fn inspect_existing_project(
    root: &Path,
    registry: &ProjectRegistry,
) -> Result<AdoptInspectResponse, (u16, String)> {
    let root = normalized_adoption_root(root)?;
    let repo = crate::domain::git::repo_context(&root);
    let already_registered = registry
        .read_raw()
        .projects
        .iter()
        .any(|item| same_path(&item.root, &root));
    let is_git_root = repo
        .git
        .root
        .as_deref()
        .map(|git_root| git_toplevel_matches(&root, git_root))
        .unwrap_or(false);
    Ok(AdoptInspectResponse {
        ok: true,
        is_git_repo: repo.git.root.is_some(),
        is_git_root,
        git_dirty: repo.git.dirty.unwrap_or(false),
        already_registered,
        has_hyperwiki: root.join(".hyperwiki").join("config.json").is_file(),
        wiki: inspect_wiki_shape(&root),
        root,
    })
}

pub fn adopt_existing_project(
    registry: &ProjectRegistry,
    request: AdoptProjectRequest,
    app: Option<tauri::AppHandle>,
) -> Result<AdoptProjectResponse, (u16, String)> {
    let root = normalized_adoption_root(&request.root)?;
    if !request.confirm_replace {
        return Err((
            400,
            "Adoption requires explicit consent to convert and replace existing wiki markdown."
                .to_string(),
        ));
    }
    let repo = crate::domain::git::repo_context(&root);
    let Some(git_root) = repo.git.root.as_deref() else {
        return Err((
            409,
            "Adoption requires an existing Git repository so the pre-adoption checkpoint can make the conversion revertable.".to_string(),
        ));
    };
    // The checkpoint commit runs `git add -A` scoped to the repository root, so
    // adoption must target that root — not a subdirectory of a larger repo, or
    // the checkpoint and revert would silently span unrelated files.
    if !git_toplevel_matches(&root, git_root) {
        return Err((
            409,
            "Adoption must point at the Git repository root so the pre-adoption checkpoint is scoped correctly.".to_string(),
        ));
    }
    if registry
        .read_raw()
        .projects
        .iter()
        .any(|item| same_path(&item.root, &root))
    {
        return Err((
            409,
            "This project is already registered with hyperwiki.".to_string(),
        ));
    }

    let checkpoint = create_adoption_checkpoint(&root).map_err(|error| (500, error))?;
    let wiki = inspect_wiki_shape(&root);
    let project_name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Adopted Project".to_string());
    let options = InitProjectOptions {
        project_name: project_name.clone(),
        summary: String::new(),
        source_document: String::new(),
        source_document_type: String::new(),
        source_documents: Vec::new(),
        source_facts: Default::default(),
        planning_answers: Default::default(),
        agent_launch_command: request.agent_launch_command.unwrap_or_default(),
        dev_command: detected_dev_command(&root),
        package_scripts: Vec::new(),
        install_agent_skills: request.install_agent_skills.unwrap_or(true),
        overwrite: false,
    };
    // Adoption never fabricates an MVP plan tree (that is a fresh-project
    // concern and would contradict "stop after adoption"). Write only the
    // non-wiki scaffold; for a wiki with nothing to port, drop a minimal
    // index.mdx so the app has a landing page.
    write_project_scaffold(&root, options).map_err(|error| (500, error))?;
    if wiki.classification == "none" {
        write_minimal_index(&root, &project_name).map_err(|error| (500, error))?;
    }

    let needs_adopt_turn = match wiki.classification.as_str() {
        "none" => false,
        "alreadyMdx" => {
            let validation = validate_adopted_wiki(&root, &[]);
            let _ = write_adoption_validation(&root, &validation);
            validation.status != "valid"
        }
        _ => true,
    };
    let state = AdoptionState {
        status: if needs_adopt_turn {
            "adopting".to_string()
        } else {
            "complete".to_string()
        },
        md_files: wiki.md_files.clone(),
        checkpoint_commit: checkpoint.commit.clone(),
        updated_at_ms: unix_time_ms(),
    };
    write_adoption_state(&root, &state).map_err(|error| (500, error))?;

    let record = registry.register(&root).map_err(|error| (500, error))?;
    if needs_adopt_turn {
        crate::domain::codex_app_server::spawn_import_thread_prewarm(record.clone());
        crate::domain::import_onboarding_runtime::start_wiki_adoption(record.clone(), app)?;
    }
    let workspace_url = format!(
        "/workspace/{}/{}",
        percent_encode_path_segment(&record.project_slug),
        percent_encode_path_segment(&record.worktree_slug)
    );
    Ok(AdoptProjectResponse {
        ok: true,
        project: record,
        workspace_url,
        checkpoint,
        adoption: state,
        needs_adopt_turn,
    })
}

pub fn create_adoption_checkpoint(root: &Path) -> Result<AdoptionCheckpoint, String> {
    let repo = crate::domain::git::repo_context(root);
    if repo.git.root.is_none() {
        return Err("Adoption checkpoint requires a Git repository.".to_string());
    }
    let mut created_commit = false;
    let needs_commit = repo.git.dirty.unwrap_or(false)
        || !crate::domain::git::git(root, &["rev-parse", "HEAD"]).ok;
    if needs_commit {
        let staged = crate::domain::git::git(root, &["add", "-A"]);
        if !staged.ok {
            return Err(format!(
                "Could not stage files for the pre-adoption checkpoint: {}",
                first_line(&staged.stderr)
            ));
        }
        let commit = crate::domain::git::git(root, &["commit", "-m", ADOPTION_CHECKPOINT_MESSAGE]);
        if !commit.ok {
            let fallback = crate::domain::git::git(
                root,
                &[
                    "-c",
                    "user.name=hyperwiki",
                    "-c",
                    "user.email=hyperwiki@localhost",
                    "commit",
                    "-m",
                    ADOPTION_CHECKPOINT_MESSAGE,
                ],
            );
            if !fallback.ok {
                return Err(format!(
                    "Could not create the pre-adoption checkpoint commit: {}",
                    first_line(&fallback.stderr)
                ));
            }
        }
        created_commit = true;
    }
    let head = crate::domain::git::git(root, &["rev-parse", "HEAD"]);
    if !head.ok {
        return Err("Could not resolve HEAD for the pre-adoption checkpoint.".to_string());
    }
    Ok(AdoptionCheckpoint {
        commit: head.stdout.trim().to_string(),
        created_commit,
    })
}

pub fn inspect_wiki_shape(root: &Path) -> WikiShape {
    let wiki_root = root.join("wiki");
    let mut md_files = Vec::new();
    let mut mdx_count = 0usize;
    let mut other_files = Vec::new();
    if wiki_root.is_dir() {
        collect_wiki_files(
            &wiki_root,
            &wiki_root,
            &mut md_files,
            &mut mdx_count,
            &mut other_files,
        );
    }
    md_files.sort();
    other_files.sort();
    let classification = if !wiki_root.is_dir() || (md_files.is_empty() && mdx_count == 0) {
        "none"
    } else if md_files.is_empty() {
        "alreadyMdx"
    } else if mdx_count == 0 {
        "legacyMarkdown"
    } else {
        "mixed"
    };
    WikiShape {
        exists: wiki_root.is_dir(),
        md_files,
        mdx_count,
        other_files,
        classification: classification.to_string(),
    }
}

fn collect_wiki_files(
    wiki_root: &Path,
    directory: &Path,
    md_files: &mut Vec<String>,
    mdx_count: &mut usize,
    other_files: &mut Vec<String>,
) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        if path.is_dir() {
            collect_wiki_files(wiki_root, &path, md_files, mdx_count, other_files);
            continue;
        }
        let relative = format!(
            "wiki/{}",
            path.strip_prefix(wiki_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/")
        );
        match path.extension().and_then(|value| value.to_str()) {
            Some("md") => md_files.push(relative),
            Some("mdx") => *mdx_count += 1,
            _ => other_files.push(relative),
        }
    }
}

pub fn validate_adopted_wiki(root: &Path, expected_md: &[String]) -> AdoptionValidation {
    let mut errors = Vec::new();
    let wiki_root = root.join("wiki");
    if !wiki_root.join("index.mdx").is_file() {
        errors.push("wiki/index.mdx is missing.".to_string());
    }
    let shape = inspect_wiki_shape(root);
    for leftover in &shape.md_files {
        errors.push(format!(
            "{leftover} was not converted; no .md files may remain under wiki/."
        ));
    }
    let expected_sources = expected_md.iter().any(|path| {
        let lower = path.to_ascii_lowercase();
        lower == "wiki/sources.md"
    });
    if expected_sources && !wiki_root.join("sources.mdx").is_file() {
        errors.push("wiki/sources.mdx is missing (converted from Sources.md).".to_string());
    }
    if dir_exists_recursive(&wiki_root.join("plans"), "zzz-completed") {
        errors.push(
            "wiki/plans contains a zzz-completed directory; it must be renamed to zzz_completed."
                .to_string(),
        );
    }
    if wiki_root.join("plans").is_dir() && !wiki_root.join("plans").join("index.mdx").is_file() {
        errors.push("wiki/plans/index.mdx is missing.".to_string());
    }
    let mut mdx_pages = Vec::new();
    collect_mdx_pages(&wiki_root, &wiki_root, &mut mdx_pages);
    for (relative, content) in &mdx_pages {
        validate_adopted_page(relative, content, &mut errors);
        validate_internal_links(root, relative, content, &mut errors);
    }
    AdoptionValidation {
        status: if errors.is_empty() { "valid" } else { "invalid" }.to_string(),
        errors,
        validated_at_ms: unix_time_ms(),
    }
}

fn collect_mdx_pages(wiki_root: &Path, directory: &Path, pages: &mut Vec<(String, String)>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        if path.is_dir() {
            collect_mdx_pages(wiki_root, &path, pages);
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) != Some("mdx") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let relative = format!(
            "wiki/{}",
            path.strip_prefix(wiki_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/")
        );
        pages.push((relative, content));
    }
}

fn validate_adopted_page(relative: &str, content: &str, errors: &mut Vec<String>) {
    let frontmatter = frontmatter_block(content);
    match &frontmatter {
        None => errors.push(format!("{relative} is missing YAML frontmatter.")),
        Some(block) if !block.contains("title:") => {
            errors.push(format!("{relative} frontmatter is missing a title."));
        }
        Some(_) => {}
    }
    let body = content
        .split_once("---")
        .and_then(|(_, rest)| rest.split_once("---"))
        .map(|(_, body)| body)
        .unwrap_or(content);
    let has_h1 = body.contains("<h1") || body.lines().any(|line| line.trim_start().starts_with("# "));
    if !has_h1 {
        errors.push(format!("{relative} has no h1 heading."));
    }
    let in_plans = relative.starts_with("wiki/plans/");
    let archived = relative.contains("/zzz_completed/");
    let is_plans_index = relative == "wiki/plans/index.mdx";
    if in_plans && !archived && !is_plans_index {
        let declares_plan = frontmatter
            .as_deref()
            .map(|block| block.contains("wikiKind: \"plan\"") || block.contains("wikiKind: plan"))
            .unwrap_or(false);
        if !declares_plan {
            errors.push(format!(
                "{relative} must declare wikiKind: \"plan\" in frontmatter."
            ));
        }
    }
}

fn frontmatter_block(content: &str) -> Option<String> {
    let rest = content.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    Some(rest[..end].to_string())
}

fn validate_internal_links(root: &Path, relative: &str, content: &str, errors: &mut Vec<String>) {
    for target in extract_wiki_links(content) {
        let file = root.join(target.trim_start_matches('/'));
        if !file.is_file() {
            errors.push(format!("{relative} links to missing page {target}."));
        }
    }
}

fn extract_wiki_links(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    for marker in ["](/wiki/", "href=\"/wiki/"] {
        let mut rest = content;
        while let Some(index) = rest.find(marker) {
            let start = index + marker.len() - "/wiki/".len();
            let tail = &rest[start..];
            let end = tail
                .find(|ch: char| ch == ')' || ch == '"' || ch == '#' || ch.is_whitespace())
                .unwrap_or(tail.len());
            let target = &tail[..end];
            if target.ends_with(".mdx") {
                links.push(target.to_string());
            }
            rest = &rest[index + marker.len()..];
        }
    }
    links.sort();
    links.dedup();
    links
}

fn dir_exists_recursive(directory: &Path, name: &str) -> bool {
    let Ok(entries) = fs::read_dir(directory) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if entry.file_name().to_string_lossy() == name {
            return true;
        }
        if dir_exists_recursive(&path, name) {
            return true;
        }
    }
    false
}

fn detected_dev_command(root: &Path) -> String {
    let Ok(package) = fs::read_to_string(root.join("package.json")) else {
        return String::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&package) else {
        return String::new();
    };
    if value["scripts"]["dev"].as_str().is_some() {
        return "pnpm dev".to_string();
    }
    String::new()
}

fn git_toplevel_matches(root: &Path, git_root: &str) -> bool {
    let git_root = Path::new(git_root.trim());
    match (root.canonicalize(), git_root.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => same_path(root, git_root),
    }
}

fn write_minimal_index(root: &Path, project_name: &str) -> Result<(), String> {
    let path = root.join("wiki").join("index.mdx");
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let title = project_name.replace('"', "'");
    let content = format!(
        "---\ntitle: \"{title}\"\ndescription: \"Adopted into hyperwiki.\"\n---\n\n# {title}\n\nThis project was adopted into hyperwiki. Add wiki pages under `wiki/` as Markdown/MDX.\n"
    );
    fs::write(&path, content).map_err(|error| error.to_string())
}

fn normalized_adoption_root(root: &Path) -> Result<PathBuf, (u16, String)> {
    if root.as_os_str().is_empty() {
        return Err((400, "Project path is required.".to_string()));
    }
    let root = root
        .canonicalize()
        .map_err(|_| (400, format!("Project path {} does not exist.", root.display())))?;
    if !root.is_dir() {
        return Err((400, "Project path must be a directory.".to_string()));
    }
    if unsafe_removal_root(&root) {
        return Err((400, "Refusing to adopt an unsafe project root.".to_string()));
    }
    Ok(root)
}

pub fn adoption_state_path(root: &Path) -> PathBuf {
    root.join(".hyperwiki").join("state").join("adoption.json")
}

fn adoption_validation_path(root: &Path) -> PathBuf {
    root.join(".hyperwiki")
        .join("state")
        .join("adoption-validation.json")
}

pub fn read_adoption_state(root: &Path) -> Option<AdoptionState> {
    let content = fs::read_to_string(adoption_state_path(root)).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_adoption_state(root: &Path, state: &AdoptionState) -> Result<(), String> {
    let path = adoption_state_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())
}

pub fn read_adoption_validation(root: &Path) -> Option<AdoptionValidation> {
    let content = fs::read_to_string(adoption_validation_path(root)).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_adoption_validation(root: &Path, validation: &AdoptionValidation) -> Result<(), String> {
    let path = adoption_validation_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(validation).map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())
}

fn first_line(text: &str) -> String {
    text.lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("unknown error")
        .to_string()
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-{prefix}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }

    fn write(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn git_init_with_commit(root: &Path) {
        assert!(crate::domain::git::git(root, &["init", "--initial-branch=main"]).ok);
        write(root, "README.md", "# fixture\n");
        assert!(crate::domain::git::git(root, &["add", "-A"]).ok);
        assert!(crate::domain::git::git(
            root,
            &[
                "-c",
                "user.name=test",
                "-c",
                "user.email=test@localhost",
                "commit",
                "-m",
                "init",
            ],
        )
        .ok);
    }

    fn legacy_wiki(root: &Path) {
        write(root, "wiki/index.md", "# Fixture Wiki\n");
        write(root, "wiki/AGENTS.md", "# Agents\n");
        write(root, "wiki/Sources.md", "# Sources\n");
        write(root, "wiki/log.md", "# Log\n");
        write(root, "wiki/plans/foo.md", "# Plan Foo\n");
        write(root, "wiki/plans/zzz-completed/old.md", "# Old Plan\n");
        write(root, "wiki/sources/data.json", "{}");
    }

    #[test]
    fn inspect_classifies_legacy_markdown_wiki() {
        let root = temp_root("adopt-inspect");
        legacy_wiki(&root);
        let shape = inspect_wiki_shape(&root);
        assert_eq!(shape.classification, "legacyMarkdown");
        assert_eq!(shape.md_files.len(), 6);
        assert!(shape.md_files.contains(&"wiki/index.md".to_string()));
        assert!(shape
            .md_files
            .contains(&"wiki/plans/zzz-completed/old.md".to_string()));
        assert_eq!(shape.other_files, vec!["wiki/sources/data.json"]);
        assert_eq!(shape.mdx_count, 0);
    }

    #[test]
    fn inspect_classifies_missing_and_mdx_wikis() {
        let none = temp_root("adopt-none");
        assert_eq!(inspect_wiki_shape(&none).classification, "none");
        let mdx = temp_root("adopt-mdx");
        write(&mdx, "wiki/index.mdx", "---\ntitle: \"X\"\n---\n# X\n");
        assert_eq!(inspect_wiki_shape(&mdx).classification, "alreadyMdx");
        write(&mdx, "wiki/extra.md", "# Extra\n");
        assert_eq!(inspect_wiki_shape(&mdx).classification, "mixed");
    }

    #[test]
    fn adopt_rejects_non_git_root() {
        let root = temp_root("adopt-no-git");
        legacy_wiki(&root);
        let registry = ProjectRegistry::new(temp_root("adopt-no-git-home"));
        let error = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: root.clone(),
                confirm_replace: true,
                agent_launch_command: None,
                install_agent_skills: Some(false),
            },
            None,
        )
        .unwrap_err();
        assert_eq!(error.0, 409);
        assert!(error.1.contains("Git repository"));
    }

    #[test]
    fn adopt_requires_confirm_replace() {
        let root = temp_root("adopt-consent");
        git_init_with_commit(&root);
        legacy_wiki(&root);
        let registry = ProjectRegistry::new(temp_root("adopt-consent-home"));
        let error = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: root.clone(),
                confirm_replace: false,
                agent_launch_command: None,
                install_agent_skills: Some(false),
            },
            None,
        )
        .unwrap_err();
        assert_eq!(error.0, 400);
        assert!(error.1.contains("consent"));
    }

    #[test]
    fn adopt_rejects_already_registered_root() {
        let root = temp_root("adopt-registered");
        git_init_with_commit(&root);
        legacy_wiki(&root);
        let registry = ProjectRegistry::new(temp_root("adopt-registered-home"));
        let first = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: root.clone(),
                confirm_replace: true,
                agent_launch_command: None,
                install_agent_skills: Some(false),
            },
            None,
        );
        assert!(first.is_ok(), "first adoption failed: {first:?}");
        let error = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: root.clone(),
                confirm_replace: true,
                agent_launch_command: None,
                install_agent_skills: Some(false),
            },
            None,
        )
        .unwrap_err();
        assert_eq!(error.0, 409);
        assert!(error.1.contains("already registered"));
    }

    #[test]
    fn adopt_creates_checkpoint_commit_when_dirty() {
        let root = temp_root("adopt-checkpoint");
        git_init_with_commit(&root);
        legacy_wiki(&root);
        let checkpoint = create_adoption_checkpoint(&root).unwrap();
        assert!(checkpoint.created_commit);
        let log = crate::domain::git::git(&root, &["log", "-1", "--pretty=%s"]);
        assert!(log.ok);
        assert_eq!(log.stdout.trim(), ADOPTION_CHECKPOINT_MESSAGE);
        // Clean tree: no second commit, same HEAD.
        let second = create_adoption_checkpoint(&root).unwrap();
        assert!(!second.created_commit);
        assert_eq!(second.commit, checkpoint.commit);
    }

    #[test]
    fn adopt_scaffold_preserves_existing_wiki_and_agents_md() {
        let root = temp_root("adopt-scaffold");
        git_init_with_commit(&root);
        legacy_wiki(&root);
        write(&root, "AGENTS.md", "existing agents guide\n");
        let registry = ProjectRegistry::new(temp_root("adopt-scaffold-home"));
        let response = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: root.clone(),
                confirm_replace: true,
                agent_launch_command: Some("claude --dangerously-skip-permissions".to_string()),
                install_agent_skills: Some(false),
            },
            None,
        )
        .unwrap();
        assert!(response.needs_adopt_turn);
        assert_eq!(response.adoption.status, "adopting");
        assert_eq!(response.adoption.md_files.len(), 6);
        assert_eq!(
            fs::read_to_string(root.join("AGENTS.md")).unwrap(),
            "existing agents guide\n"
        );
        assert!(root.join(".hyperwiki").join("config.json").is_file());
        // Scaffold must not write the fresh-project wiki over the legacy one.
        assert!(!root.join("wiki").join("index.mdx").exists());
        assert!(root.join("wiki").join("index.md").is_file());
        let registered = registry.read_raw().projects;
        assert_eq!(registered.len(), 1);
        // start_wiki_adoption spawns a background turn that will fail fast
        // without an agent CLI; the registration and marker are what we assert.
        assert_eq!(read_adoption_state(&root).unwrap().status, "adopting");
    }

    #[test]
    fn adopt_without_wiki_scaffolds_and_completes() {
        let root = temp_root("adopt-empty");
        git_init_with_commit(&root);
        let registry = ProjectRegistry::new(temp_root("adopt-empty-home"));
        let response = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: root.clone(),
                confirm_replace: true,
                agent_launch_command: None,
                install_agent_skills: Some(false),
            },
            None,
        )
        .unwrap();
        assert!(!response.needs_adopt_turn);
        assert_eq!(response.adoption.status, "complete");
        // A minimal landing page is written, but NOT a fabricated MVP plan tree.
        assert!(root.join("wiki").join("index.mdx").is_file());
        assert!(!root.join("wiki").join("plans").join("mvp").exists());
        assert!(!root.join("wiki").join("plans").exists());
    }

    #[test]
    fn adopt_rejects_subdirectory_of_repo() {
        let root = temp_root("adopt-subdir");
        git_init_with_commit(&root);
        let subdir = root.join("packages").join("docs");
        fs::create_dir_all(&subdir).unwrap();
        legacy_wiki(&subdir);
        let registry = ProjectRegistry::new(temp_root("adopt-subdir-home"));
        let error = adopt_existing_project(
            &registry,
            AdoptProjectRequest {
                root: subdir,
                confirm_replace: true,
                agent_launch_command: None,
                install_agent_skills: Some(false),
            },
            None,
        )
        .unwrap_err();
        assert_eq!(error.0, 409);
        assert!(error.1.contains("Git repository root"));
    }

    #[test]
    fn validate_adopted_wiki_flags_leftovers_and_structure() {
        let root = temp_root("adopt-validate");
        write(&root, "wiki/index.mdx", "---\ntitle: \"Home\"\n---\n# Home\n");
        write(&root, "wiki/log.md", "# Leftover\n");
        write(
            &root,
            "wiki/plans/zzz-completed/old.mdx",
            "---\ntitle: \"Old\"\n---\n# Old\n",
        );
        write(&root, "wiki/plans/foo.mdx", "---\ntitle: \"Foo\"\n---\n# Foo\n");
        let validation =
            validate_adopted_wiki(&root, &["wiki/Sources.md".to_string()]);
        assert_eq!(validation.status, "invalid");
        let joined = validation.errors.join("\n");
        assert!(joined.contains("wiki/log.md was not converted"));
        assert!(joined.contains("zzz-completed"));
        assert!(joined.contains("wiki/sources.mdx is missing"));
        assert!(joined.contains("wiki/plans/index.mdx is missing"));
        assert!(joined.contains("wiki/plans/foo.mdx must declare wikiKind"));
    }

    #[test]
    fn validate_adopted_wiki_passes_converted_fixture() {
        let root = temp_root("adopt-valid");
        write(&root, "wiki/index.mdx", "---\ntitle: \"Home\"\ndescription: \"Fixture\"\n---\n# Home\nSee [plans](/wiki/plans/index.mdx).\n");
        write(&root, "wiki/sources.mdx", "---\ntitle: \"Sources\"\n---\n# Sources\n");
        write(
            &root,
            "wiki/plans/index.mdx",
            "---\ntitle: \"Plans\"\nwikiKind: \"plan\"\n---\n# Plans\n",
        );
        write(
            &root,
            "wiki/plans/foo.mdx",
            "---\ntitle: \"Foo\"\nwikiKind: \"plan\"\n---\n# Foo\n",
        );
        write(
            &root,
            "wiki/plans/zzz_completed/old.mdx",
            "---\ntitle: \"Old\"\n---\n# Old\n",
        );
        let validation =
            validate_adopted_wiki(&root, &["wiki/Sources.md".to_string()]);
        assert_eq!(validation.status, "valid", "errors: {:?}", validation.errors);
    }

    #[test]
    fn validate_adopted_wiki_flags_broken_links_and_missing_frontmatter() {
        let root = temp_root("adopt-links");
        write(&root, "wiki/index.mdx", "# No Frontmatter\nSee [gone](/wiki/missing.mdx).\n");
        let validation = validate_adopted_wiki(&root, &[]);
        let joined = validation.errors.join("\n");
        assert!(joined.contains("wiki/index.mdx is missing YAML frontmatter"));
        assert!(joined.contains("links to missing page /wiki/missing.mdx"));
    }
}
