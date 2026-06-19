use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const BASELINE_COMMIT_MESSAGE: &str = "Initialize hyperwiki project";
const FALLBACK_AUTHOR_NAME: &str = "hyperwiki";
const FALLBACK_AUTHOR_EMAIL: &str = "hyperwiki@localhost";

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "git",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "repo context and dirty state",
            "Git initialization onboarding",
            "branch and worktree detection",
            "worktree creation command orchestration",
        ],
        parity_gate: "git onboarding and worktree launch smoke equivalents",
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoContext {
    pub root: PathBuf,
    pub git: GitContext,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitContext {
    pub root: Option<String>,
    pub branch: String,
    pub dirty: Option<bool>,
    pub status: Vec<String>,
    pub is_worktree: Option<bool>,
    pub worktree: String,
}

/// One file in a change set: path plus the +/- line counts. `additions`/
/// `deletions` are `None` for binary files (Git reports `-` there).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub path: String,
    pub status: String,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub binary: bool,
}

/// A diff overview: the working tree against HEAD, or a single commit. Carries
/// per-file stats only — never the patch text — which is all the viewer needs.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeSet {
    pub ref_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    pub is_git: bool,
    pub files: Vec<GitFileChange>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    pub hash: String,
    pub short: String,
    pub subject: String,
    pub author: String,
    pub relative_date: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitOnboardingStatus {
    pub has_git: bool,
    pub root: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitInitResult {
    pub status: String,
    pub git_root: Option<String>,
    pub committed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GitInitResponse {
    pub ok: bool,
    pub result: GitInitResult,
    pub repo: RepoContext,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeCreateRequest {
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeCreateResponse {
    pub ok: bool,
    pub branch: String,
    pub slug: String,
    pub path: PathBuf,
    pub preview_url: String,
    pub workspace_url: String,
    pub project: crate::domain::projects::ProjectRecord,
    pub install: WorktreeInstallResult,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInstallResult {
    pub ok: bool,
    pub message: String,
}

pub fn repo_context(root: impl AsRef<Path>) -> RepoContext {
    let root = root.as_ref();
    let git_root = git(root, &["rev-parse", "--show-toplevel"]);
    let branch = git(root, &["branch", "--show-current"]);
    let status = git(root, &["status", "--short"]);
    let common_dir = git(root, &["rev-parse", "--git-common-dir"]);
    RepoContext {
        root: root.to_path_buf(),
        git: GitContext {
            root: git_root.ok.then_some(git_root.stdout),
            branch: if branch.ok && !branch.stdout.is_empty() {
                branch.stdout
            } else {
                "detached".to_string()
            },
            dirty: status.ok.then_some(!status.stdout.is_empty()),
            status: status
                .ok
                .then(|| status.stdout.lines().map(String::from).collect())
                .unwrap_or_default(),
            is_worktree: common_dir.ok.then(|| {
                common_dir.stdout != ".git"
                    && common_dir.stdout != root.join(".git").to_string_lossy()
            }),
            worktree: worktree_slug(root),
        },
    }
}

/// Uncommitted changes: staged + unstaged tracked edits (vs HEAD) plus
/// untracked files. Returns `is_git: false` for a non-repo so the UI can
/// explain instead of erroring.
pub fn working_tree_changes(root: impl AsRef<Path>) -> GitChangeSet {
    let root = root.as_ref();
    if !git(root, &["rev-parse", "--show-toplevel"]).ok {
        return GitChangeSet {
            ref_label: "Uncommitted changes".to_string(),
            subject: None,
            is_git: false,
            files: Vec::new(),
            total_additions: 0,
            total_deletions: 0,
        };
    }
    // Without any commit yet, "vs HEAD" is invalid — compare the index to the
    // empty tree (`--cached`) instead; unstaged-but-tracked can't exist there.
    let head_exists = git(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).ok;
    let base: &[&str] = if head_exists { &["HEAD"] } else { &["--cached"] };
    let numstat = git_diff(root, "--numstat", base);
    let name_status = git_diff(root, "--name-status", base);
    let (mut files, mut total_additions, total_deletions) =
        collect_changes(&numstat, &name_status);

    // numstat never lists untracked files, so fold them in by counting lines.
    let untracked = git(root, &["ls-files", "--others", "--exclude-standard", "-z"]);
    if untracked.ok {
        for rel in untracked.stdout.split('\0') {
            if rel.is_empty() {
                continue;
            }
            let (additions, binary) = untracked_line_count(&root.join(rel));
            total_additions += additions.unwrap_or(0);
            files.push(GitFileChange {
                path: rel.to_string(),
                status: "?".to_string(),
                additions,
                deletions: Some(0),
                binary,
            });
        }
    }

    GitChangeSet {
        ref_label: "Uncommitted changes".to_string(),
        subject: None,
        is_git: true,
        files,
        total_additions,
        total_deletions,
    }
}

/// Recent commits, newest first, for the viewer's pager. `limit` is clamped to
/// a sane range so a stray query value can't ask Git for everything.
pub fn recent_commits(root: impl AsRef<Path>, limit: usize) -> Vec<GitCommitSummary> {
    let root = root.as_ref();
    let limit = limit.clamp(1, 200).to_string();
    // Unit separator (\x1f) between fields survives commit subjects with tabs.
    let log = git(
        root,
        &[
            "log",
            "-n",
            &limit,
            "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ar",
        ],
    );
    if !log.ok {
        return Vec::new();
    }
    log.stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\u{1f}');
            Some(GitCommitSummary {
                hash: fields.next()?.to_string(),
                short: fields.next()?.to_string(),
                subject: fields.next().unwrap_or_default().to_string(),
                author: fields.next().unwrap_or_default().to_string(),
                relative_date: fields.next().unwrap_or_default().to_string(),
            })
        })
        .collect()
}

/// Per-file stats for one commit. `commit_ref` is resolved to a real commit
/// hash before any further use, so only validated, fully-qualified hashes ever
/// reach `git show`.
pub fn commit_changes(root: impl AsRef<Path>, commit_ref: &str) -> Result<GitChangeSet, String> {
    let root = root.as_ref();
    let resolved = git(
        root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            &format!("{commit_ref}^{{commit}}"),
        ],
    );
    if !resolved.ok || resolved.stdout.is_empty() {
        return Err("Unknown commit reference.".to_string());
    }
    let hash = resolved.stdout;
    let subject = git(root, &["show", "-s", "--format=%s", &hash]);
    let numstat = git(
        root,
        &["show", "--numstat", "--no-renames", "--format=", &hash],
    );
    let name_status = git(
        root,
        &["show", "--name-status", "--no-renames", "--format=", &hash],
    );
    let (files, total_additions, total_deletions) =
        collect_changes(&numstat.stdout, &name_status.stdout);
    Ok(GitChangeSet {
        ref_label: short_hash(&hash),
        subject: subject.ok.then_some(subject.stdout),
        is_git: true,
        files,
        total_additions,
        total_deletions,
    })
}

// `--no-renames` keeps output deterministic: a rename shows as a delete + add
// (two clean rows) instead of Git's brace/arrow path syntax we'd have to parse.
fn git_diff(root: &Path, mode: &str, base: &[&str]) -> String {
    let mut args = vec!["diff", mode, "--no-renames"];
    args.extend_from_slice(base);
    git(root, &args).stdout
}

// Merge a `--numstat` body (counts) with a `--name-status` body (the
// authoritative file + status list) into one ordered change set.
fn collect_changes(numstat: &str, name_status: &str) -> (Vec<GitFileChange>, u32, u32) {
    let mut counts: HashMap<&str, (Option<u32>, Option<u32>, bool)> = HashMap::new();
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        let (Some(add), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let binary = add == "-" && del == "-";
        counts.insert(
            path,
            (
                if binary { None } else { add.parse().ok() },
                if binary { None } else { del.parse().ok() },
                binary,
            ),
        );
    }
    let mut files = Vec::new();
    let mut total_additions = 0;
    let mut total_deletions = 0;
    for line in name_status.lines() {
        let mut parts = line.split('\t');
        let status = parts.next().unwrap_or("M");
        let Some(path) = parts.next().filter(|value| !value.is_empty()) else {
            continue;
        };
        let (additions, deletions, binary) =
            counts.get(path).copied().unwrap_or((Some(0), Some(0), false));
        total_additions += additions.unwrap_or(0);
        total_deletions += deletions.unwrap_or(0);
        files.push(GitFileChange {
            path: path.to_string(),
            status: status.chars().next().unwrap_or('M').to_string(),
            additions,
            deletions,
            binary,
        });
    }
    (files, total_additions, total_deletions)
}

// Count added lines for an untracked file by reading it; flag binaries (NUL
// byte) and leave their count empty, mirroring numstat's `-` for binary diffs.
fn untracked_line_count(path: &Path) -> (Option<u32>, bool) {
    match fs::read(path) {
        Ok(bytes) if bytes.contains(&0) => (None, true),
        Ok(bytes) => {
            let newlines = bytes.iter().filter(|byte| **byte == b'\n').count() as u32;
            let trailing = u32::from(!bytes.is_empty() && bytes.last() != Some(&b'\n'));
            (Some(newlines + trailing), false)
        }
        Err(_) => (Some(0), false),
    }
}

fn short_hash(hash: &str) -> String {
    hash.chars().take(7).collect()
}

pub fn git_onboarding_status(root: impl AsRef<Path>) -> GitOnboardingStatus {
    let result = git(root, &["rev-parse", "--show-toplevel"]);
    GitOnboardingStatus {
        has_git: result.ok,
        root: result.ok.then_some(result.stdout),
    }
}

pub fn initialize_git_onboarding(root: impl AsRef<Path>) -> Result<GitInitResponse, String> {
    let root = root.as_ref();
    let existing = git_onboarding_status(root);
    if existing.has_git {
        let result = GitInitResult {
            status: "already-initialized".to_string(),
            git_root: existing.root,
            committed: false,
            message: None,
        };
        return Ok(GitInitResponse {
            ok: true,
            result,
            repo: repo_context(root),
        });
    }

    let init = git(root, &["init", "--initial-branch=main"]);
    if !init.ok {
        return Err(format!(
            "Could not initialize Git: {}",
            first_message(&init, "git init failed")
        ));
    }
    require_git(root, &["add", "-A"], "stage initial files")?;
    let commit = git(root, &["commit", "-m", BASELINE_COMMIT_MESSAGE]);
    if !commit.ok {
        let fallback = git(
            root,
            &[
                "-c",
                &format!("user.name={FALLBACK_AUTHOR_NAME}"),
                "-c",
                &format!("user.email={FALLBACK_AUTHOR_EMAIL}"),
                "commit",
                "-m",
                BASELINE_COMMIT_MESSAGE,
            ],
        );
        if !fallback.ok {
            return Err(format!(
                "Could not create initial Git commit: {}",
                first_message(&fallback, &first_message(&commit, "git commit failed"))
            ));
        }
    }
    let initialized = git_onboarding_status(root);
    let result = GitInitResult {
        status: "committed".to_string(),
        git_root: initialized.root,
        committed: true,
        message: Some(BASELINE_COMMIT_MESSAGE.to_string()),
    };
    Ok(GitInitResponse {
        ok: true,
        result,
        repo: repo_context(root),
    })
}

pub fn create_worktree_checkout(
    registry: &crate::domain::projects::ProjectRegistry,
    project: &crate::domain::projects::ProjectRecord,
    request: WorktreeCreateRequest,
) -> Result<WorktreeCreateResponse, (u16, String)> {
    let repo = repo_context(&project.root);
    let Some(git_root) = repo.git.root.as_deref() else {
        return Err((
            409,
            "Initialize Git before creating a worktree.".to_string(),
        ));
    };
    let current = if repo.git.worktree.is_empty() {
        repo.git.branch.as_str()
    } else {
        repo.git.worktree.as_str()
    }
    .trim()
    .to_lowercase();
    if current != "main" && current != "master" {
        return Err((
            409,
            "Create new worktrees from the main or master checkout.".to_string(),
        ));
    }

    let branch = normalize_branch_name(request.branch.or(request.name))?;
    let branch_format = git(git_root, &["check-ref-format", "--branch", &branch]);
    if !branch_format.ok {
        return Err((
            400,
            "Branch name contains characters Git cannot use.".to_string(),
        ));
    }
    let slug = slugify(branch.trim_start_matches("refs/heads/"));
    let git_root_path = PathBuf::from(git_root);
    let parent = git_root_path.parent().unwrap_or(git_root_path.as_path());
    let base = git_root_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let target = parent.join(format!("{base}.worktrees")).join(&slug);
    if target.exists() {
        return Err((
            409,
            format!("Worktree path already exists: {}", target.display()),
        ));
    }
    let existing_branch = git(
        git_root,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    );
    if existing_branch.ok {
        return Err((409, format!("Branch already exists: {branch}")));
    }

    fs::create_dir_all(target.parent().unwrap_or(parent))
        .map_err(|error| (500, error.to_string()))?;
    let base_ref = default_git_branch(git_root, &repo.git.branch);
    let added = git(
        git_root,
        &[
            "worktree",
            "add",
            target.to_string_lossy().as_ref(),
            "-b",
            &branch,
            &base_ref,
        ],
    );
    if !added.ok {
        return Err((500, first_message(&added, "Could not create worktree.")));
    }

    let install = exec_file("pnpm", &["install"], &target);
    let record = registry.register(&target).map_err(|error| (500, error))?;
    let layout = crate::domain::previews::layout_config_for_root(&target);
    let preview = crate::domain::previews::app_preview_for_project(&record);
    let preview_url = if !preview.expected_url.is_empty() {
        preview.expected_url
    } else {
        layout.dev.preview_url
    };
    let workspace_url = format!(
        "/workspace/{}/{}",
        percent_encode_path_segment(&record.project_slug),
        percent_encode_path_segment(&record.worktree_slug)
    );
    Ok(WorktreeCreateResponse {
        ok: true,
        branch,
        slug,
        path: target,
        preview_url,
        workspace_url,
        project: record,
        install: WorktreeInstallResult {
            ok: install.ok,
            message: if install.ok {
                "pnpm install completed.".to_string()
            } else {
                first_message(&install, "pnpm install failed.")
            },
        },
    })
}

pub fn git(root: impl AsRef<Path>, args: &[&str]) -> GitCommandResult {
    match Command::new("git")
        .args(args)
        .current_dir(root.as_ref())
        .output()
    {
        Ok(output) => GitCommandResult {
            ok: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(error) => GitCommandResult {
            ok: false,
            stdout: String::new(),
            stderr: error.to_string(),
        },
    }
}

fn exec_file(command: &str, args: &[&str], cwd: &Path) -> GitCommandResult {
    match Command::new(command).args(args).current_dir(cwd).output() {
        Ok(output) => GitCommandResult {
            ok: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(error) => GitCommandResult {
            ok: false,
            stdout: String::new(),
            stderr: error.to_string(),
        },
    }
}

fn normalize_branch_name(value: Option<String>) -> Result<String, (u16, String)> {
    let branch = value
        .unwrap_or_default()
        .trim()
        .trim_matches('/')
        .to_string();
    if branch.is_empty() {
        return Err((400, "Branch name is required.".to_string()));
    }
    if branch.contains("..")
        || branch.ends_with('.')
        || branch.ends_with('/')
        || branch
            .chars()
            .any(|character| character.is_whitespace() || "~^:?*[]\\".contains(character))
    {
        return Err((
            400,
            "Branch name contains characters Git cannot use.".to_string(),
        ));
    }
    Ok(branch)
}

fn default_git_branch(root: &str, fallback: &str) -> String {
    let remote_head = git(
        root,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    );
    if remote_head.ok && remote_head.stdout.contains('/') {
        return remote_head
            .stdout
            .split('/')
            .skip(1)
            .collect::<Vec<_>>()
            .join("/");
    }
    if fallback.is_empty() || fallback == "detached" {
        "main".to_string()
    } else {
        fallback.to_string()
    }
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

fn require_git(root: &Path, args: &[&str], action: &str) -> Result<GitCommandResult, String> {
    let result = git(root, args);
    if result.ok {
        Ok(result)
    } else {
        Err(format!(
            "Could not {action}: {}",
            first_message(&result, "")
        ))
    }
}

fn first_message(result: &GitCommandResult, fallback: &str) -> String {
    if !result.stderr.is_empty() {
        result.stderr.clone()
    } else if !result.stdout.is_empty() {
        result.stdout.clone()
    } else {
        fallback.to_string()
    }
}

fn worktree_slug(root: &Path) -> String {
    let git_path = root.join(".git");
    if !git_path.exists() {
        return "main".to_string();
    }
    match fs::read_to_string(&git_path) {
        Ok(marker) if marker.starts_with("gitdir:") => slugify(
            root.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("main"),
        ),
        _ => "main".to_string(),
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reports_non_git_checkout() {
        let root = temp_root("git-none");
        let repo = repo_context(&root);
        assert_eq!(repo.git.root, None);
        assert_eq!(repo.git.branch, "detached");
        assert_eq!(repo.git.dirty, None);
        assert_eq!(repo.git.worktree, "main");
    }

    #[test]
    fn initializes_git_and_creates_baseline_commit() {
        let root = temp_root("git-init");
        fs::write(root.join("README.md"), "# Test\n").unwrap();
        let result = initialize_git_onboarding(&root).unwrap();
        assert!(result.ok);
        assert_eq!(result.result.status, "committed");
        assert!(result.result.committed);
        assert_eq!(
            result.result.message.as_deref(),
            Some(BASELINE_COMMIT_MESSAGE)
        );
        assert_eq!(result.repo.git.dirty, Some(false));
        assert_eq!(result.repo.git.branch, "main");
        assert!(result.repo.git.root.is_some());
    }

    #[test]
    fn reports_dirty_status_and_worktree_marker() {
        let root = temp_root("git-dirty");
        git(&root, &["init"]);
        fs::write(root.join("changed.txt"), "dirty\n").unwrap();
        let repo = repo_context(&root);
        assert_eq!(repo.git.dirty, Some(true));
        assert!(repo
            .git
            .status
            .iter()
            .any(|item| item.contains("changed.txt")));

        let worktree_parent = temp_root("git-worktree-parent");
        let worktree = worktree_parent.join("Feature Branch");
        fs::create_dir_all(&worktree).unwrap();
        fs::write(
            worktree.join(".git"),
            "gitdir: /tmp/hyperwiki-feature.git\n",
        )
        .unwrap();
        assert_eq!(repo_context(&worktree).git.worktree, "feature-branch");
    }

    #[test]
    fn creates_git_worktree_registers_checkout_and_runs_install() {
        let root = temp_root("git-worktree-main");
        let home = temp_root("git-worktree-home");
        make_hyperwiki_project(&root);
        fs::write(
            root.join("package.json"),
            serde_json::json!({
                "scripts": { "dev": "vite" },
                "packageManager": "pnpm@10.33.3"
            })
            .to_string(),
        )
        .unwrap();
        git(&root, &["init"]);
        git(&root, &["add", "-A"]);
        git(
            &root,
            &[
                "-c",
                "user.name=hyperwiki Test",
                "-c",
                "user.email=hyperwiki-test@localhost",
                "commit",
                "-m",
                "Initial",
            ],
        );
        fs::write(root.join("local-only-marker.txt"), "local commit").unwrap();
        git(&root, &["add", "-A"]);
        git(
            &root,
            &[
                "-c",
                "user.name=hyperwiki Test",
                "-c",
                "user.email=hyperwiki-test@localhost",
                "commit",
                "-m",
                "Local-only marker",
            ],
        );
        let fake_bin = fake_pnpm();
        let _path_guard = PathGuard::prepend(fake_bin);
        let registry = crate::domain::projects::ProjectRegistry::new(&home);
        let project = registry.register(&root).unwrap();

        let result = create_worktree_checkout(
            &registry,
            &project,
            WorktreeCreateRequest {
                branch: Some("feature/worktree-flow".to_string()),
                name: None,
            },
        )
        .unwrap();

        assert!(result.ok);
        assert_eq!(result.branch, "feature/worktree-flow");
        assert_eq!(result.slug, "feature-worktree-flow");
        assert!(result
            .path
            .to_string_lossy()
            .contains(".worktrees/feature-worktree-flow"));
        assert_eq!(
            result.workspace_url,
            "/workspace/git-worktree-main/feature-worktree-flow"
        );
        assert_eq!(
            result.preview_url,
            "https://feature-worktree-flow.git-worktree-main.localhost"
        );
        assert!(result.install.ok);
        assert_eq!(result.project.worktree_slug, "feature-worktree-flow");
        assert!(result.path.join("local-only-marker.txt").exists());
        let listed = registry.list(Some(&result.project.id));
        assert!(listed
            .checkouts
            .iter()
            .any(|project| project.worktree_slug == "feature-worktree-flow"));
    }

    #[test]
    fn rejects_worktree_creation_from_feature_checkout() {
        let root = temp_root("git-worktree-feature");
        make_hyperwiki_project(&root);
        fs::write(
            root.join(".git"),
            "gitdir: /tmp/hyperwiki-feature-worktree.git\n",
        )
        .unwrap();
        let registry =
            crate::domain::projects::ProjectRegistry::new(temp_root("git-worktree-feature-home"));
        let project = crate::domain::projects::ProjectRecord {
            id: "feature".to_string(),
            root,
            name: "Feature".to_string(),
            project_slug: "feature".to_string(),
            worktree_slug: "feature-branch".to_string(),
            available: true,
            last_opened_at: None,
            active: false,
            import_planning: None,
        };

        let error = create_worktree_checkout(
            &registry,
            &project,
            WorktreeCreateRequest {
                branch: Some("feature/nope".to_string()),
                name: None,
            },
        )
        .unwrap_err();

        assert_eq!(error.0, 409);
        assert!(error.1.contains("Initialize Git") || error.1.contains("main or master"));
    }

    #[test]
    fn summarizes_working_tree_and_commit_changes() {
        let root = temp_root("git-changes");
        git(&root, &["init"]);
        fs::write(root.join("tracked.txt"), "one\ntwo\n").unwrap();
        commit_all(&root, "Add tracked");
        fs::write(root.join("tracked.txt"), "one\ntwo\nthree\n").unwrap();
        fs::write(root.join("untracked.txt"), "new\nfile\n").unwrap();

        let changes = working_tree_changes(&root);
        assert!(changes.is_git);
        assert_eq!(changes.ref_label, "Uncommitted changes");
        let tracked = changes
            .files
            .iter()
            .find(|file| file.path == "tracked.txt")
            .unwrap();
        assert_eq!(tracked.status, "M");
        assert_eq!(tracked.additions, Some(1));
        assert_eq!(tracked.deletions, Some(0));
        let untracked = changes
            .files
            .iter()
            .find(|file| file.path == "untracked.txt")
            .unwrap();
        assert_eq!(untracked.status, "?");
        assert_eq!(untracked.additions, Some(2));
        assert!(!untracked.binary);
        assert_eq!(changes.total_additions, 3);

        let commits = recent_commits(&root, 10);
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "Add tracked");

        let commit = commit_changes(&root, &commits[0].hash).unwrap();
        assert_eq!(commit.ref_label.len(), 7);
        assert!(commits[0].hash.starts_with(&commit.ref_label));
        assert_eq!(commit.subject.as_deref(), Some("Add tracked"));
        let added = commit
            .files
            .iter()
            .find(|file| file.path == "tracked.txt")
            .unwrap();
        assert_eq!(added.status, "A");
        assert_eq!(added.additions, Some(2));

        assert!(commit_changes(&root, "not-a-real-ref").is_err());
    }

    #[test]
    fn reports_non_git_change_set() {
        let root = temp_root("git-changes-none");
        let changes = working_tree_changes(&root);
        assert!(!changes.is_git);
        assert!(changes.files.is_empty());
        assert!(recent_commits(&root, 5).is_empty());
    }

    fn commit_all(root: &Path, message: &str) {
        git(root, &["add", "-A"]);
        git(
            root,
            &[
                "-c",
                "user.name=hyperwiki Test",
                "-c",
                "user.email=hyperwiki-test@localhost",
                "commit",
                "-m",
                message,
            ],
        );
    }

    fn make_hyperwiki_project(root: &Path) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({
                "projectName": "Git Worktree Main",
                "dev": {
                    "command": "",
                    "previewUrl": "https://git-worktree-main.localhost"
                },
                "worktrees": {
                    "previewUrlPattern": "https://<branch-slug>.git-worktree-main.localhost"
                }
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("index.mdx"),
            "<h1>Git Worktree</h1>",
        )
        .unwrap();
    }

    fn fake_pnpm() -> PathBuf {
        let bin = temp_root("pnpm-bin");
        let path = bin.join("pnpm");
        fs::write(
            &path,
            "#!/usr/bin/env sh\nif [ \"$1\" = \"install\" ]; then exit 0; fi\nif [ \"$1\" = \"--version\" ]; then echo 10.33.3; exit 0; fi\nexit 1\n",
        )
        .unwrap();
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
