use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "project-env",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "project .env.local inspection",
            "masked env metadata responses",
            "safe .env.local updates",
            "Git ignore guardrails for local secrets",
        ],
        parity_gate: "project-env Rust tests plus terminal env UI smoke",
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEnvResponse {
    pub project_root: PathBuf,
    pub env_file: PathBuf,
    pub example_file: Option<PathBuf>,
    pub gitignore_file: PathBuf,
    pub env_file_exists: bool,
    pub example_file_exists: bool,
    pub git_ignored: bool,
    pub keys: Vec<ProjectEnvKey>,
    pub suggested_keys: Vec<ProjectEnvKey>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEnvKey {
    pub name: String,
    pub present: bool,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub masked_value: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEnvUpdateRequest {
    #[serde(default)]
    pub entries: Vec<ProjectEnvUpdateEntry>,
    #[serde(default)]
    pub add_gitignore: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ProjectEnvUpdateEntry {
    pub name: String,
    pub value: String,
}

pub fn project_env_summary(root: impl AsRef<Path>) -> ProjectEnvResponse {
    let root = root.as_ref();
    let env_file = root.join(".env.local");
    let example_file = find_example_file(root);
    let gitignore_file = root.join(".gitignore");
    let existing = read_env_keys(&env_file);
    let example = example_file.as_ref().map(read_env_keys).unwrap_or_default();
    let mut keys = existing
        .keys()
        .map(|name| ProjectEnvKey {
            name: name.clone(),
            present: true,
            source: ".env.local".to_string(),
            masked_value: Some(masked_value()),
        })
        .collect::<Vec<_>>();
    keys.sort_by(|left, right| left.name.cmp(&right.name));

    let mut suggested_names = BTreeSet::new();
    suggested_names.extend(example.keys().cloned());
    for known in known_env_key_hints() {
        suggested_names.insert(known.to_string());
    }
    let suggested_keys = suggested_names
        .into_iter()
        .map(|name| ProjectEnvKey {
            present: existing.contains_key(&name),
            source: example_file
                .as_ref()
                .filter(|_| example.contains_key(&name))
                .map(|path| example_source_name(path))
                .unwrap_or_else(|| "common".to_string()),
            masked_value: existing.contains_key(&name).then(masked_value),
            name,
        })
        .collect::<Vec<_>>();

    ProjectEnvResponse {
        project_root: root.to_path_buf(),
        env_file,
        example_file: example_file.clone(),
        gitignore_file,
        env_file_exists: root.join(".env.local").exists(),
        example_file_exists: example_file.is_some(),
        git_ignored: env_local_is_ignored(root),
        keys,
        suggested_keys,
    }
}

pub fn update_project_env(
    root: impl AsRef<Path>,
    request: ProjectEnvUpdateRequest,
) -> Result<ProjectEnvResponse, (u16, String)> {
    let root = root.as_ref();
    if request.entries.is_empty() {
        return Ok(project_env_summary(root));
    }
    let entries = normalized_entries(request.entries).map_err(|error| (400, error))?;
    if !env_local_is_ignored(root) {
        if request.add_gitignore {
            ensure_env_local_ignored(root).map_err(|error| (500, error))?;
        } else {
            return Err((
                409,
                ".env.local is not ignored by Git. Add it to .gitignore before saving secrets."
                    .to_string(),
            ));
        }
    }
    write_env_local(root, &entries).map_err(|error| (500, error))?;
    Ok(project_env_summary(root))
}

fn find_example_file(root: &Path) -> Option<PathBuf> {
    [".env.example", ".env.local.example", ".env.sample"]
        .into_iter()
        .map(|name| root.join(name))
        .find(|path| path.exists())
}

fn example_source_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(".env.example")
        .to_string()
}

fn read_env_keys(path: impl AsRef<Path>) -> BTreeMap<String, String> {
    let Ok(content) = fs::read_to_string(path.as_ref()) else {
        return BTreeMap::new();
    };
    content
        .lines()
        .filter_map(parse_env_line)
        .collect::<BTreeMap<_, _>>()
}

fn parse_env_line(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
    let (key, value) = body.split_once('=')?;
    let key = key.trim();
    is_valid_env_key(key).then(|| (key.to_string(), value.trim().to_string()))
}

fn normalized_entries(
    entries: Vec<ProjectEnvUpdateEntry>,
) -> Result<BTreeMap<String, String>, String> {
    let mut normalized = BTreeMap::new();
    for entry in entries {
        let name = entry.name.trim();
        if !is_valid_env_key(name) {
            return Err(format!("Invalid environment variable name: {name}"));
        }
        normalized.insert(name.to_string(), entry.value);
    }
    Ok(normalized)
}

fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|char| char == '_' || char.is_ascii_alphanumeric())
}

fn write_env_local(root: &Path, updates: &BTreeMap<String, String>) -> Result<(), String> {
    let env_file = root.join(".env.local");
    let original = fs::read_to_string(&env_file).unwrap_or_default();
    let mut remaining = updates.clone();
    let mut output = Vec::new();
    for line in original.lines() {
        if let Some((key, _)) = parse_env_line(line) {
            if let Some(value) = remaining.remove(&key) {
                output.push(format!("{key}={}", format_env_value(&value)));
                continue;
            }
        }
        output.push(line.to_string());
    }
    if !remaining.is_empty() {
        if !output.is_empty() && output.last().is_some_and(|line| !line.trim().is_empty()) {
            output.push(String::new());
        }
        for (key, value) in remaining {
            output.push(format!("{key}={}", format_env_value(&value)));
        }
    }
    let content = if output.is_empty() {
        String::new()
    } else {
        format!("{}\n", output.join("\n"))
    };
    write_secret_file_atomically(&env_file, &content)
}

fn format_env_value(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_string();
    }
    let needs_quotes = value
        .chars()
        .any(|char| char.is_whitespace() || matches!(char, '#' | '"' | '\'' | '\\'));
    if !needs_quotes {
        return value.to_string();
    }
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    format!("\"{escaped}\"")
}

fn write_secret_file_atomically(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Env file path has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let tmp = parent.join(".env.local.hyperwiki-tmp");
    {
        let mut file = fs::File::create(&tmp).map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    harden_secret_file_permissions(&tmp);
    fs::rename(&tmp, path).map_err(|error| error.to_string())?;
    harden_secret_file_permissions(path);
    Ok(())
}

fn harden_secret_file_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
}

fn ensure_env_local_ignored(root: &Path) -> Result<(), String> {
    if env_local_is_ignored(root) {
        return Ok(());
    }
    let path = root.join(".gitignore");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let mut next = existing.clone();
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    if !next.is_empty() {
        next.push('\n');
    }
    next.push_str("# Local secrets managed by hyperwiki\n.env.local\n");
    fs::write(path, next).map_err(|error| error.to_string())
}

fn env_local_is_ignored(root: &Path) -> bool {
    if root.join(".git").exists() {
        return git_check_ignore_env_local(root);
    }
    gitignore_declares_env_local(root)
}

fn git_check_ignore_env_local(root: &Path) -> bool {
    if !root.join(".git").exists() {
        return false;
    }
    Command::new("git")
        .args(["check-ignore", "--quiet", "--", ".env.local"])
        .current_dir(root)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn gitignore_declares_env_local(root: &Path) -> bool {
    let Ok(content) = fs::read_to_string(root.join(".gitignore")) else {
        return false;
    };
    content.lines().any(|line| {
        let pattern = line.split('#').next().unwrap_or("").trim();
        matches!(
            pattern,
            ".env.local" | "/.env.local" | ".env*" | "/.env*" | ".env.*" | "/.env.*"
        )
    })
}

fn known_env_key_hints() -> &'static [&'static str] {
    &[
        "CLERK_JWT_ISSUER_DOMAIN",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "NEXT_PUBLIC_CONVEX_URL",
        "CONVEX_DEPLOYMENT",
        "HYPERWIKI_PREVIEW_AUTH_EMAIL",
        "HYPERWIKI_PREVIEW_AUTH_PASSWORD",
    ]
}

fn masked_value() -> String {
    "••••••".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn update_preserves_comments_and_masks_values() {
        let root = temp_root("env-preserve");
        fs::write(root.join(".gitignore"), ".env.local\n").unwrap();
        fs::write(
            root.join(".env.local"),
            "# existing\nA=old\n\nUNCHANGED=value\n",
        )
        .unwrap();
        let response = update_project_env(
            &root,
            ProjectEnvUpdateRequest {
                add_gitignore: false,
                entries: vec![
                    ProjectEnvUpdateEntry {
                        name: "A".to_string(),
                        value: "new value".to_string(),
                    },
                    ProjectEnvUpdateEntry {
                        name: "CLERK_SECRET_KEY".to_string(),
                        value: "sk_test_secret".to_string(),
                    },
                ],
            },
        )
        .unwrap();
        let written = fs::read_to_string(root.join(".env.local")).unwrap();
        assert!(written.contains(
            "# existing\nA=\"new value\"\n\nUNCHANGED=value\n\nCLERK_SECRET_KEY=sk_test_secret\n"
        ));
        assert!(!serde_json::to_string(&response)
            .unwrap()
            .contains("sk_test_secret"));
        assert!(serde_json::to_string(&response).unwrap().contains("••••••"));
    }

    #[test]
    fn update_blocks_unignored_env_local_by_default() {
        let root = temp_root("env-block");
        let error = update_project_env(
            &root,
            ProjectEnvUpdateRequest {
                add_gitignore: false,
                entries: vec![ProjectEnvUpdateEntry {
                    name: "CLERK_SECRET_KEY".to_string(),
                    value: "secret".to_string(),
                }],
            },
        )
        .unwrap_err();
        assert_eq!(error.0, 409);
        assert!(!root.join(".env.local").exists());
    }

    #[test]
    fn update_can_add_gitignore_before_writing() {
        let root = temp_root("env-ignore");
        update_project_env(
            &root,
            ProjectEnvUpdateRequest {
                add_gitignore: true,
                entries: vec![ProjectEnvUpdateEntry {
                    name: "CLERK_SECRET_KEY".to_string(),
                    value: "secret".to_string(),
                }],
            },
        )
        .unwrap();
        assert!(fs::read_to_string(root.join(".gitignore"))
            .unwrap()
            .contains(".env.local"));
        assert!(fs::read_to_string(root.join(".env.local"))
            .unwrap()
            .contains("CLERK_SECRET_KEY=secret"));
    }

    #[test]
    fn update_with_add_gitignore_overrides_existing_negation() {
        let root = temp_root("env-negation");
        Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .status()
            .unwrap();
        fs::write(root.join(".gitignore"), ".env*\n!.env.local\n").unwrap();
        assert!(!env_local_is_ignored(&root));

        update_project_env(
            &root,
            ProjectEnvUpdateRequest {
                add_gitignore: true,
                entries: vec![ProjectEnvUpdateEntry {
                    name: "CLERK_SECRET_KEY".to_string(),
                    value: "secret".to_string(),
                }],
            },
        )
        .unwrap();

        assert!(fs::read_to_string(root.join(".gitignore"))
            .unwrap()
            .ends_with("\n.env.local\n"));
        assert!(env_local_is_ignored(&root));
    }

    #[test]
    fn summary_uses_env_example_hints() {
        let root = temp_root("env-example");
        fs::write(
            root.join(".env.example"),
            "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\n",
        )
        .unwrap();
        let summary = project_env_summary(&root);
        assert!(summary
            .suggested_keys
            .iter()
            .any(|key| key.name == "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" && !key.present));
    }

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-{label}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
