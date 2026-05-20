use super::DomainSurface;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const BASELINE_COMMIT_MESSAGE: &str = "Initialize Hyperwiki project";
const FALLBACK_AUTHOR_NAME: &str = "Hyperwiki";
const FALLBACK_AUTHOR_EMAIL: &str = "hyperwiki@localhost";

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "git",
        node_reference: "src/git.js, scripts/worktree.mjs",
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

    let init = git(root, &["init"]);
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
