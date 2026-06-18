//! Unit design exploration storage and lookup.
//!
//! Design explorations are agent-generated ideation images saved under ignored
//! runtime state, separate from implemented-result screenshots:
//!
//! ```text
//! wiki/plans/mvp/unit-1-init.mdx
//!   -> .hyperwiki/state/explorations/plans/mvp/unit-1-init/01-dashboard.png
//!                                                            /metadata.json
//! ```
//!
//! This mirrors the screenshot storage contract while keeping explorations an
//! optional pre-implementation artifact.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const EXPLORATIONS_SUBDIR: &str = ".hyperwiki/state/explorations";
const METADATA_FILE: &str = "metadata.json";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitExploration {
    /// Wiki display path of the unit, e.g. `/wiki/plans/mvp/unit-1-init.mdx`.
    pub unit_path: String,
    /// Number of candidate PNGs captured for this unit.
    pub count: usize,
    /// Newest candidate's last-modified time, unix seconds.
    pub captured_at: u64,
    /// Total bytes across all of the unit's candidate images.
    pub bytes: u64,
    pub selected_candidate: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitExplorationImage {
    pub unit_path: String,
    /// File name within the unit folder, e.g. `01-dashboard.png`.
    pub name: String,
    pub media_type: String,
    pub base64: String,
    pub captured_at: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitExplorationMetadata {
    pub version: u8,
    pub unit_path: String,
    pub mode: String,
    pub prompt: String,
    pub source_screenshot_path: Option<String>,
    pub provider: String,
    pub model_id: Option<String>,
    pub image_count: usize,
    pub selected_candidate: Option<String>,
    pub notes: Option<String>,
    pub text_brief: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitExplorationMetadataInput {
    pub unit_path: String,
    pub mode: String,
    pub prompt: String,
    pub source_screenshot_path: Option<String>,
    pub provider: Option<String>,
    pub model_id: Option<String>,
    pub image_count: Option<usize>,
    pub selected_candidate: Option<String>,
    pub notes: Option<String>,
    pub text_brief: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitExplorationSelectionInput {
    pub unit_path: String,
    pub candidate_name: String,
    pub notes: Option<String>,
    pub text_brief: Option<String>,
}

/// Wiki-relative portion of a unit page path (the part after `wiki/`), or `None`
/// when the path does not point inside the wiki or escapes via `.`/`..`.
fn wiki_relative(unit_path: &str) -> Option<String> {
    let path = unit_path
        .split_once('?')
        .map(|(p, _)| p)
        .unwrap_or(unit_path);
    let marker = "wiki/";
    let relative = path
        .strip_prefix("/wiki/")
        .or_else(|| path.strip_prefix("wiki/"))
        .map(ToString::to_string)
        .or_else(|| {
            path.find(&format!("/{marker}"))
                .and_then(|index| path.get(index + marker.len() + 1..))
                .map(ToString::to_string)
        })?;
    if relative.is_empty()
        || relative
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    Some(relative)
}

fn unit_stem(unit_path: &str) -> Option<String> {
    let relative = wiki_relative(unit_path)?;
    relative.strip_suffix(".mdx").map(ToString::to_string)
}

pub fn exploration_dir_for_unit(root: impl AsRef<Path>, unit_path: &str) -> Option<PathBuf> {
    let stem = unit_stem(unit_path)?;
    Some(root.as_ref().join(EXPLORATIONS_SUBDIR).join(stem))
}

fn metadata_path_for_unit(root: impl AsRef<Path>, unit_path: &str) -> Option<PathBuf> {
    Some(exploration_dir_for_unit(root, unit_path)?.join(METADATA_FILE))
}

fn unit_path_for_stem(stem: &str) -> String {
    format!("/wiki/{stem}.mdx")
}

pub fn clear_unit_explorations(root: impl AsRef<Path>, unit_path: &str) -> Result<(), String> {
    if let Some(dir) = exploration_dir_for_unit(&root, unit_path) {
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn read_unit_exploration_images(
    root: impl AsRef<Path>,
    unit_path: &str,
) -> Vec<UnitExplorationImage> {
    let Some(unit_relative) = wiki_relative(unit_path) else {
        return Vec::new();
    };
    let display_unit_path = format!("/wiki/{unit_relative}");
    let mut files: Vec<(String, PathBuf)> = Vec::new();

    if let Some(dir) = exploration_dir_for_unit(&root, unit_path) {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if is_png(&path) {
                    let name = path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default()
                        .to_string();
                    files.push((name, path));
                }
            }
        }
    }

    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
        .into_iter()
        .filter_map(|(name, path)| {
            let bytes = fs::read(&path).ok()?;
            let metadata = fs::metadata(&path).ok()?;
            Some(UnitExplorationImage {
                unit_path: display_unit_path.clone(),
                name,
                media_type: "image/png".to_string(),
                base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
                captured_at: modified_secs(&metadata),
                bytes: metadata.len(),
            })
        })
        .collect()
}

pub fn list_unit_explorations(root: impl AsRef<Path>) -> Vec<UnitExploration> {
    let base = root.as_ref().join(EXPLORATIONS_SUBDIR);
    let mut pngs: Vec<(String, fs::Metadata)> = Vec::new();
    collect_pngs(&base, &base, &mut pngs);

    use std::collections::BTreeMap;
    let mut by_unit: BTreeMap<String, (usize, u64, u64)> = BTreeMap::new();
    for (relative, metadata) in pngs {
        let Some(stem) = unit_stem_for_exploration(&relative) else {
            continue;
        };
        let entry = by_unit.entry(stem).or_insert((0, 0, 0));
        entry.0 += 1;
        entry.1 = entry.1.max(modified_secs(&metadata));
        entry.2 += metadata.len();
    }

    by_unit
        .into_iter()
        .map(|(stem, (count, captured_at, bytes))| {
            let unit_path = unit_path_for_stem(&stem);
            let selected_candidate = read_unit_exploration_metadata(&root, &unit_path)
                .and_then(|metadata| metadata.selected_candidate);
            UnitExploration {
                unit_path,
                count,
                captured_at,
                bytes,
                selected_candidate,
            }
        })
        .collect()
}

pub fn read_unit_exploration_metadata(
    root: impl AsRef<Path>,
    unit_path: &str,
) -> Option<UnitExplorationMetadata> {
    let path = metadata_path_for_unit(root, unit_path)?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_unit_exploration_metadata(
    root: impl AsRef<Path>,
    input: UnitExplorationMetadataInput,
) -> Result<UnitExplorationMetadata, String> {
    let Some(unit_relative) = wiki_relative(&input.unit_path) else {
        return Err("Invalid unit page path.".to_string());
    };
    let display_unit_path = format!("/wiki/{unit_relative}");
    let dir = exploration_dir_for_unit(&root, &display_unit_path)
        .ok_or_else(|| "Invalid unit page path.".to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let now = now_secs();
    let existing = read_unit_exploration_metadata(&root, &display_unit_path);
    let metadata = UnitExplorationMetadata {
        version: 1,
        unit_path: display_unit_path,
        mode: input.mode,
        prompt: input.prompt,
        source_screenshot_path: input.source_screenshot_path,
        provider: input.provider.unwrap_or_else(|| "agent".to_string()),
        model_id: input.model_id,
        image_count: input.image_count.unwrap_or(1),
        selected_candidate: input.selected_candidate,
        notes: input.notes,
        text_brief: input.text_brief,
        created_at: existing.map(|metadata| metadata.created_at).unwrap_or(now),
        updated_at: now,
    };
    write_metadata_file(dir.join(METADATA_FILE), &metadata)?;
    Ok(metadata)
}

pub fn select_unit_exploration(
    root: impl AsRef<Path>,
    input: UnitExplorationSelectionInput,
) -> Result<UnitExplorationMetadata, String> {
    let Some(unit_relative) = wiki_relative(&input.unit_path) else {
        return Err("Invalid unit page path.".to_string());
    };
    let display_unit_path = format!("/wiki/{unit_relative}");
    let dir = exploration_dir_for_unit(&root, &display_unit_path)
        .ok_or_else(|| "Invalid unit page path.".to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let now = now_secs();
    let mut metadata = read_unit_exploration_metadata(&root, &display_unit_path).unwrap_or(
        UnitExplorationMetadata {
            version: 1,
            unit_path: display_unit_path,
            mode: "unknown".to_string(),
            prompt: String::new(),
            source_screenshot_path: None,
            provider: "agent".to_string(),
            model_id: None,
            image_count: 0,
            selected_candidate: None,
            notes: None,
            text_brief: None,
            created_at: now,
            updated_at: now,
        },
    );
    metadata.selected_candidate = Some(input.candidate_name);
    metadata.notes = input.notes;
    metadata.text_brief = input.text_brief;
    metadata.updated_at = now;
    write_metadata_file(dir.join(METADATA_FILE), &metadata)?;
    Ok(metadata)
}

fn write_metadata_file(path: PathBuf, metadata: &UnitExplorationMetadata) -> Result<(), String> {
    let json = serde_json::to_string_pretty(metadata).map_err(|error| error.to_string())?;
    fs::write(path, format!("{json}\n")).map_err(|error| error.to_string())
}

fn unit_stem_for_exploration(relative_png: &str) -> Option<String> {
    let stem = relative_png.strip_suffix(".png")?;
    let (parent, leaf) = match stem.rsplit_once('/') {
        Some((parent, leaf)) => (Some(parent), leaf),
        None => (None, stem),
    };
    if let Some(parent) = parent {
        let dir_leaf = parent.rsplit_once('/').map(|(_, l)| l).unwrap_or(parent);
        if is_unit_leaf(dir_leaf) {
            return Some(parent.to_string());
        }
    }
    if leaf.starts_with("unit-") && is_unit_leaf(leaf) {
        return Some(stem.to_string());
    }
    None
}

fn is_unit_leaf(leaf: &str) -> bool {
    let rest = leaf.strip_prefix("unit-").unwrap_or(leaf);
    let digits = rest.chars().take_while(|c| c.is_ascii_digit()).count();
    digits > 0 && rest[digits..].starts_with('-')
}

fn is_png(path: &Path) -> bool {
    path.is_file() && path.extension().and_then(|value| value.to_str()) == Some("png")
}

fn collect_pngs(base: &Path, dir: &Path, out: &mut Vec<(String, fs::Metadata)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_pngs(base, &path, out);
            continue;
        }
        if !is_png(&path) {
            continue;
        }
        let Ok(relative) = path.strip_prefix(base) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        out.push((relative.to_string_lossy().replace('\\', "/"), metadata));
    }
}

fn modified_secs(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_unit_path_to_exploration_dir() {
        let root = Path::new("/tmp/project");
        let dir = exploration_dir_for_unit(root, "/wiki/plans/foo/stage-1/unit-3-bar.mdx").unwrap();
        assert_eq!(
            dir,
            root.join(".hyperwiki/state/explorations/plans/foo/stage-1/unit-3-bar")
        );
    }

    #[test]
    fn rejects_traversal_and_non_wiki_paths() {
        let root = Path::new("/tmp/project");
        assert!(exploration_dir_for_unit(root, "/wiki/../../etc/passwd.mdx").is_none());
        assert!(exploration_dir_for_unit(root, "/wiki/plans/../unit-1-x.mdx").is_none());
        assert!(exploration_dir_for_unit(root, "/etc/passwd").is_none());
        assert!(exploration_dir_for_unit(root, "/wiki/plans/unit-1-x.txt").is_none());
    }

    #[test]
    fn reads_multiple_explorations_sorted_by_name() {
        let dir = std::env::temp_dir().join(format!(
            "hyperwiki-explorations-read-{}",
            std::process::id()
        ));
        let unit_dir = dir.join(".hyperwiki/state/explorations/plans/mvp/unit-1-init");
        fs::create_dir_all(&unit_dir).unwrap();
        fs::write(unit_dir.join("02-alt.png"), b"second").unwrap();
        fs::write(unit_dir.join("01-base.png"), b"first").unwrap();
        fs::write(unit_dir.join("metadata.json"), b"{}").unwrap();

        let images = read_unit_exploration_images(&dir, "/wiki/plans/mvp/unit-1-init.mdx");
        let names: Vec<&str> = images.iter().map(|image| image.name.as_str()).collect();
        assert_eq!(names, vec!["01-base.png", "02-alt.png"]);
        assert!(images
            .iter()
            .all(|image| image.unit_path == "/wiki/plans/mvp/unit-1-init.mdx"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn lists_numeric_prefixed_unit_folders() {
        let dir = std::env::temp_dir().join(format!(
            "hyperwiki-explorations-numeric-{}",
            std::process::id()
        ));
        let unit_dir =
            dir.join(".hyperwiki/state/explorations/plans/mvp/units/stage-04/03-email-invite-flow");
        fs::create_dir_all(&unit_dir).unwrap();
        fs::write(unit_dir.join("01-flow.png"), b"a").unwrap();
        fs::write(unit_dir.join("02-flow.png"), b"bb").unwrap();

        let explorations = list_unit_explorations(&dir);
        assert_eq!(explorations.len(), 1);
        assert_eq!(
            explorations[0].unit_path,
            "/wiki/plans/mvp/units/stage-04/03-email-invite-flow.mdx"
        );
        assert_eq!(explorations[0].count, 2);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn writes_and_selects_metadata() {
        let dir = std::env::temp_dir().join(format!(
            "hyperwiki-explorations-meta-{}",
            std::process::id()
        ));
        let unit = "/wiki/plans/mvp/unit-1-init.mdx";
        let metadata = write_unit_exploration_metadata(
            &dir,
            UnitExplorationMetadataInput {
                unit_path: unit.to_string(),
                mode: "new-mockups".to_string(),
                prompt: "Make it calmer.".to_string(),
                source_screenshot_path: None,
                provider: Some("codex-imagegen".to_string()),
                model_id: Some("agent-owned".to_string()),
                image_count: Some(3),
                selected_candidate: None,
                notes: None,
                text_brief: None,
            },
        )
        .unwrap();
        assert_eq!(metadata.unit_path, unit);
        assert_eq!(metadata.image_count, 3);

        let selected = select_unit_exploration(
            &dir,
            UnitExplorationSelectionInput {
                unit_path: unit.to_string(),
                candidate_name: "02-alt.png".to_string(),
                notes: Some("Keep the navigation.".to_string()),
                text_brief: Some("Use a calm split-pane layout.".to_string()),
            },
        )
        .unwrap();
        assert_eq!(selected.selected_candidate.as_deref(), Some("02-alt.png"));
        assert_eq!(selected.notes.as_deref(), Some("Keep the navigation."));
        assert_eq!(
            read_unit_exploration_metadata(&dir, unit)
                .unwrap()
                .text_brief
                .as_deref(),
            Some("Use a calm split-pane layout.")
        );

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn clear_removes_the_unit_folder_and_is_traversal_safe() {
        let dir = std::env::temp_dir().join(format!(
            "hyperwiki-explorations-clear-{}",
            std::process::id()
        ));
        let unit_dir = dir.join(".hyperwiki/state/explorations/plans/mvp/units/stage-04/03-foo");
        fs::create_dir_all(&unit_dir).unwrap();
        fs::write(unit_dir.join("01-old.png"), b"stale").unwrap();

        let unit = "/wiki/plans/mvp/units/stage-04/03-foo.mdx";
        assert_eq!(read_unit_exploration_images(&dir, unit).len(), 1);
        clear_unit_explorations(&dir, unit).unwrap();
        assert!(read_unit_exploration_images(&dir, unit).is_empty());
        assert!(!unit_dir.exists());

        clear_unit_explorations(&dir, unit).unwrap();
        clear_unit_explorations(&dir, "/wiki/../../etc/passwd.mdx").unwrap();

        fs::remove_dir_all(&dir).ok();
    }
}
