//! Unit screenshot storage and lookup.
//!
//! When the execute agent finishes a unit that produces a browser-observable
//! result, it captures one or more screenshots with the `agent-browser` skill
//! and saves them under the gitignored runtime dir, in a per-unit folder that
//! mirrors the unit's wiki-relative path:
//!
//! ```text
//! wiki/plans/mvp/unit-1-init.mdx
//!   -> .hyperwiki/state/screenshots/plans/mvp/unit-1-init/01-home.png
//!                                                         /02-settings.png
//! ```
//!
//! This module is the authoritative mapping between a unit wiki page path and
//! its screenshot folder. It must stay in lockstep with `unitScreenshotDir`
//! in `src/lib/wiki-pages.ts`, which the execute prompt and the frontend fetch
//! URLs both rely on. A legacy single-file layout (`<stem>.png`) is still read
//! so screenshots captured before the folder switch keep working.

use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const SCREENSHOTS_SUBDIR: &str = ".hyperwiki/state/screenshots";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitScreenshot {
    /// Wiki display path of the unit, e.g. `/wiki/plans/mvp/unit-1-init.mdx`.
    pub unit_path: String,
    /// Number of screenshots captured for this unit.
    pub count: usize,
    /// Newest screenshot's last-modified time, unix seconds.
    pub captured_at: u64,
    /// Total bytes across all of the unit's screenshots.
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitScreenshotImage {
    pub unit_path: String,
    /// File name within the unit folder, e.g. `01-home.png`.
    pub name: String,
    pub media_type: String,
    pub base64: String,
    pub captured_at: u64,
    pub bytes: u64,
}

/// Wiki-relative portion of a unit page path (the part after `wiki/`), or `None`
/// when the path does not point inside the wiki or escapes via `.`/`..`.
fn wiki_relative(unit_path: &str) -> Option<String> {
    let path = unit_path.split_once('?').map(|(p, _)| p).unwrap_or(unit_path);
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

/// Wiki-relative stem of a unit (relative path minus the `.mdx` suffix), or
/// `None` for non-`.mdx` / traversal paths.
fn unit_stem(unit_path: &str) -> Option<String> {
    let relative = wiki_relative(unit_path)?;
    relative.strip_suffix(".mdx").map(ToString::to_string)
}

/// Resolve the per-unit screenshot directory for a unit wiki page path.
pub fn screenshot_dir_for_unit(root: impl AsRef<Path>, unit_path: &str) -> Option<PathBuf> {
    let stem = unit_stem(unit_path)?;
    Some(root.as_ref().join(SCREENSHOTS_SUBDIR).join(stem))
}

/// Legacy single-file path (`<stem>.png`) for back-compat with screenshots
/// captured before the per-unit folder switch.
fn legacy_screenshot_path(root: impl AsRef<Path>, unit_path: &str) -> Option<PathBuf> {
    let stem = unit_stem(unit_path)?;
    Some(root.as_ref().join(SCREENSHOTS_SUBDIR).join(stem + ".png"))
}

/// Inverse of [`screenshot_dir_for_unit`]: map a unit stem (relative to the
/// screenshots dir) back to its unit wiki display path.
fn unit_path_for_stem(stem: &str) -> String {
    format!("/wiki/{stem}.mdx")
}

/// Remove all screenshots for a unit (its per-unit folder and any legacy single
/// file) so a redesign replaces the set cleanly instead of leaving stale shots.
/// Non-wiki / traversal paths resolve to `None` and are a no-op.
pub fn clear_unit_screenshots(root: impl AsRef<Path>, unit_path: &str) -> Result<(), String> {
    if let Some(dir) = screenshot_dir_for_unit(&root, unit_path) {
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(|error| error.to_string())?;
        }
    }
    if let Some(legacy) = legacy_screenshot_path(&root, unit_path) {
        if legacy.is_file() {
            fs::remove_file(&legacy).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

/// Read every screenshot for a unit, sorted by file name. Reads the per-unit
/// folder, falling back to a legacy single `<stem>.png`.
pub fn read_unit_screenshots(root: impl AsRef<Path>, unit_path: &str) -> Vec<UnitScreenshotImage> {
    let Some(unit_relative) = wiki_relative(unit_path) else {
        return Vec::new();
    };
    let display_unit_path = format!("/wiki/{unit_relative}");
    let mut files: Vec<(String, PathBuf)> = Vec::new();

    if let Some(dir) = screenshot_dir_for_unit(&root, unit_path) {
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
    if files.is_empty() {
        if let Some(legacy) = legacy_screenshot_path(&root, unit_path) {
            if legacy.is_file() {
                let name = legacy
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_string();
                files.push((name, legacy));
            }
        }
    }

    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
        .into_iter()
        .filter_map(|(name, path)| {
            let bytes = fs::read(&path).ok()?;
            let metadata = fs::metadata(&path).ok()?;
            Some(UnitScreenshotImage {
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

/// Read a single (newest) screenshot for a unit, or `None` when absent. Used by
/// the inline unit-page card.
pub fn read_unit_screenshot(root: impl AsRef<Path>, unit_path: &str) -> Option<UnitScreenshotImage> {
    read_unit_screenshots(root, unit_path)
        .into_iter()
        .max_by_key(|image| image.captured_at)
}

/// List every unit that has screenshots, one entry per unit, sorted by unit
/// path. Walks the runtime screenshots dir for per-unit folders (and legacy
/// single files) whose leaf name identifies a unit.
pub fn list_unit_screenshots(root: impl AsRef<Path>) -> Vec<UnitScreenshot> {
    let base = root.as_ref().join(SCREENSHOTS_SUBDIR);
    let mut pngs: Vec<(String, fs::Metadata)> = Vec::new();
    collect_pngs(&base, &base, &mut pngs);

    // Group png paths (relative to base) by unit stem.
    use std::collections::BTreeMap;
    let mut by_unit: BTreeMap<String, (usize, u64, u64)> = BTreeMap::new();
    for (relative, metadata) in pngs {
        let Some(stem) = unit_stem_for_screenshot(&relative) else {
            continue;
        };
        let entry = by_unit.entry(stem).or_insert((0, 0, 0));
        entry.0 += 1;
        entry.1 = entry.1.max(modified_secs(&metadata));
        entry.2 += metadata.len();
    }

    by_unit
        .into_iter()
        .map(|(stem, (count, captured_at, bytes))| UnitScreenshot {
            unit_path: unit_path_for_stem(&stem),
            count,
            captured_at,
            bytes,
        })
        .collect()
}

/// Map a screenshot path (relative to the screenshots dir) to its unit stem,
/// when the path identifies a unit screenshot. Handles both the per-unit folder
/// layout (`<stem>/<file>.png` where the folder leaf is `unit-*`) and the
/// legacy single-file layout (`<stem>.png` where the file leaf is `unit-*`).
fn unit_stem_for_screenshot(relative_png: &str) -> Option<String> {
    let stem = relative_png.strip_suffix(".png")?;
    let (parent, leaf) = match stem.rsplit_once('/') {
        Some((parent, leaf)) => (Some(parent), leaf),
        None => (None, stem),
    };
    // Per-unit folder: the directory leaf is the unit slug.
    if let Some(parent) = parent {
        let dir_leaf = parent.rsplit_once('/').map(|(_, l)| l).unwrap_or(parent);
        if is_unit_leaf(dir_leaf) {
            return Some(parent.to_string());
        }
    }
    // Legacy single file named after the unit (canonical `unit-NN-...` only).
    if leaf.starts_with("unit-") && is_unit_leaf(leaf) {
        return Some(stem.to_string());
    }
    None
}

/// True for a unit folder/file leaf: the canonical `unit-NN-...` form, or the
/// imported `NN-...` form (numeric-prefixed slug, e.g. `03-email-invite-flow`).
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_unit_path_to_screenshot_dir() {
        let root = Path::new("/tmp/project");
        let dir = screenshot_dir_for_unit(root, "/wiki/plans/foo/stage-1/unit-3-bar.mdx").unwrap();
        assert_eq!(
            dir,
            root.join(".hyperwiki/state/screenshots/plans/foo/stage-1/unit-3-bar")
        );
    }

    #[test]
    fn accepts_project_scoped_and_bare_wiki_paths() {
        let root = Path::new("/tmp/project");
        let expected = root.join(".hyperwiki/state/screenshots/plans/mvp/unit-1-init");
        assert_eq!(
            screenshot_dir_for_unit(root, "/projects/abc/wiki/plans/mvp/unit-1-init.mdx").unwrap(),
            expected
        );
        assert_eq!(
            screenshot_dir_for_unit(root, "wiki/plans/mvp/unit-1-init.mdx").unwrap(),
            expected
        );
    }

    #[test]
    fn rejects_traversal_and_non_wiki_paths() {
        let root = Path::new("/tmp/project");
        assert!(screenshot_dir_for_unit(root, "/wiki/../../etc/passwd.mdx").is_none());
        assert!(screenshot_dir_for_unit(root, "/wiki/plans/../unit-1-x.mdx").is_none());
        assert!(screenshot_dir_for_unit(root, "/etc/passwd").is_none());
        assert!(screenshot_dir_for_unit(root, "/wiki/plans/unit-1-x.txt").is_none());
    }

    #[test]
    fn reads_multiple_screenshots_sorted_by_name() {
        let dir = std::env::temp_dir().join(format!("hyperwiki-shots-read-{}", std::process::id()));
        let unit_dir = dir.join(".hyperwiki/state/screenshots/plans/mvp/unit-1-init");
        fs::create_dir_all(&unit_dir).unwrap();
        fs::write(unit_dir.join("02-settings.png"), b"second").unwrap();
        fs::write(unit_dir.join("01-home.png"), b"first").unwrap();
        fs::write(unit_dir.join("notes.txt"), b"ignore").unwrap();

        let images = read_unit_screenshots(&dir, "/wiki/plans/mvp/unit-1-init.mdx");
        let names: Vec<&str> = images.iter().map(|image| image.name.as_str()).collect();
        assert_eq!(names, vec!["01-home.png", "02-settings.png"]);
        assert!(images.iter().all(|image| image.unit_path == "/wiki/plans/mvp/unit-1-init.mdx"));
        assert_eq!(images[1].bytes, "second".len() as u64);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_legacy_single_file_fallback() {
        let dir = std::env::temp_dir().join(format!("hyperwiki-shots-legacy-{}", std::process::id()));
        let shots = dir.join(".hyperwiki/state/screenshots/plans/mvp");
        fs::create_dir_all(&shots).unwrap();
        fs::write(shots.join("unit-1-init.png"), b"legacy").unwrap();

        let images = read_unit_screenshots(&dir, "/wiki/plans/mvp/unit-1-init.mdx");
        assert_eq!(images.len(), 1);
        assert_eq!(images[0].name, "unit-1-init.png");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn lists_units_with_count_from_folders_and_legacy_files() {
        let dir = std::env::temp_dir().join(format!("hyperwiki-shots-list-{}", std::process::id()));
        let base = dir.join(".hyperwiki/state/screenshots");
        let folder_unit = base.join("plans/mvp/unit-1-init");
        fs::create_dir_all(&folder_unit).unwrap();
        fs::write(folder_unit.join("01-home.png"), b"a").unwrap();
        fs::write(folder_unit.join("02-next.png"), b"bb").unwrap();
        // Legacy single file for another unit.
        let legacy_dir = base.join("plans/mvp");
        fs::write(legacy_dir.join("unit-2-next.png"), b"ccc").unwrap();
        // Non-unit noise should be ignored.
        fs::create_dir_all(base.join("scratch")).unwrap();
        fs::write(base.join("scratch/notes.png"), b"x").unwrap();

        let shots = list_unit_screenshots(&dir);
        let paths: Vec<&str> = shots.iter().map(|shot| shot.unit_path.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "/wiki/plans/mvp/unit-1-init.mdx",
                "/wiki/plans/mvp/unit-2-next.mdx"
            ]
        );
        assert_eq!(shots[0].count, 2);
        assert_eq!(shots[1].count, 1);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn lists_numeric_prefixed_unit_folders() {
        // Imported projects name units `NN-slug.mdx` under `units/`, not `unit-NN-...`.
        let dir = std::env::temp_dir().join(format!("hyperwiki-shots-numeric-{}", std::process::id()));
        let unit_dir = dir.join(".hyperwiki/state/screenshots/plans/mvp/units/stage-04/03-email-invite-flow");
        fs::create_dir_all(&unit_dir).unwrap();
        fs::write(unit_dir.join("01-onboarding-step3-send-invites.png"), b"a").unwrap();
        fs::write(unit_dir.join("06-invite-not-found.png"), b"bb").unwrap();

        let shots = list_unit_screenshots(&dir);
        assert_eq!(shots.len(), 1);
        assert_eq!(shots[0].unit_path, "/wiki/plans/mvp/units/stage-04/03-email-invite-flow.mdx");
        assert_eq!(shots[0].count, 2);

        // The same path also reads as a unit's image set.
        let images = read_unit_screenshots(&dir, "/wiki/plans/mvp/units/stage-04/03-email-invite-flow.mdx");
        assert_eq!(images.len(), 2);
        assert_eq!(images[0].name, "01-onboarding-step3-send-invites.png");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn clear_removes_the_unit_folder_and_is_traversal_safe() {
        let dir = std::env::temp_dir().join(format!("hyperwiki-shots-clear-{}", std::process::id()));
        let unit_dir = dir.join(".hyperwiki/state/screenshots/plans/mvp/units/stage-04/03-foo");
        fs::create_dir_all(&unit_dir).unwrap();
        fs::write(unit_dir.join("01-old.png"), b"stale").unwrap();
        fs::write(unit_dir.join("02-old.png"), b"stale").unwrap();

        let unit = "/wiki/plans/mvp/units/stage-04/03-foo.mdx";
        assert_eq!(read_unit_screenshots(&dir, unit).len(), 2);
        clear_unit_screenshots(&dir, unit).unwrap();
        assert!(read_unit_screenshots(&dir, unit).is_empty());
        assert!(!unit_dir.exists());

        // Clearing an already-empty unit and a traversal path are no-ops.
        clear_unit_screenshots(&dir, unit).unwrap();
        clear_unit_screenshots(&dir, "/wiki/../../etc/passwd.mdx").unwrap();

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn is_unit_leaf_accepts_both_conventions() {
        assert!(is_unit_leaf("unit-03-email-invite-flow"));
        assert!(is_unit_leaf("03-email-invite-flow"));
        assert!(!is_unit_leaf("stage-04"));
        assert!(!is_unit_leaf("scratch"));
        assert!(!is_unit_leaf("index"));
    }
}
