//! Unit screenshot storage and lookup.
//!
//! When the execute agent finishes a unit that produces a browser-observable
//! result, it captures a screenshot with the `agent-browser` skill and saves it
//! under the gitignored runtime dir, mirroring the unit's wiki-relative path:
//!
//! ```text
//! wiki/plans/foo/stage-1/unit-3-bar.mdx
//!   -> .hyperwiki/state/screenshots/plans/foo/stage-1/unit-3-bar.png
//! ```
//!
//! This module is the authoritative mapping between a unit wiki page path and
//! its screenshot file. It must stay in lockstep with `unitScreenshotRelPath`
//! in `src/lib/wiki-pages.ts`, which the execute prompt and the frontend fetch
//! URL both rely on.

use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const SCREENSHOTS_SUBDIR: &str = ".hyperwiki/state/screenshots";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitScreenshot {
    /// Wiki display path of the unit, e.g. `/wiki/plans/foo/unit-3-bar.mdx`.
    pub unit_path: String,
    /// Last-modified time, unix seconds.
    pub captured_at: u64,
    /// File size in bytes.
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnitScreenshotImage {
    pub unit_path: String,
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

/// Resolve the screenshot file path for a unit wiki page path. Returns `None`
/// for non-wiki paths, traversal attempts, or paths that are not `.mdx`.
pub fn screenshot_path_for_unit(root: impl AsRef<Path>, unit_path: &str) -> Option<PathBuf> {
    let relative = wiki_relative(unit_path)?;
    let png = relative.strip_suffix(".mdx")?.to_string() + ".png";
    Some(root.as_ref().join(SCREENSHOTS_SUBDIR).join(png))
}

/// Inverse of [`screenshot_path_for_unit`]: map a screenshot file (relative to
/// the screenshots dir) back to its unit wiki display path.
fn unit_path_for_screenshot(relative_png: &str) -> Option<String> {
    let stem = relative_png.strip_suffix(".png")?;
    Some(format!("/wiki/{stem}.mdx"))
}

/// Read a single unit screenshot as base64, or `None` when absent.
pub fn read_unit_screenshot(root: impl AsRef<Path>, unit_path: &str) -> Option<UnitScreenshotImage> {
    let file = screenshot_path_for_unit(&root, unit_path)?;
    let bytes = fs::read(&file).ok()?;
    let metadata = fs::metadata(&file).ok()?;
    Some(UnitScreenshotImage {
        unit_path: format!("/wiki/{}", wiki_relative(unit_path)?),
        media_type: "image/png".to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        captured_at: modified_secs(&metadata),
        bytes: metadata.len(),
    })
}

/// List every captured unit screenshot, sorted by unit path. Walks the runtime
/// screenshots dir and maps each `unit-*.png` back to its unit wiki path.
pub fn list_unit_screenshots(root: impl AsRef<Path>) -> Vec<UnitScreenshot> {
    let base = root.as_ref().join(SCREENSHOTS_SUBDIR);
    let mut files = Vec::new();
    collect_pngs(&base, &base, &mut files);
    let mut shots: Vec<UnitScreenshot> = files
        .into_iter()
        .filter_map(|(relative, metadata)| {
            Some(UnitScreenshot {
                unit_path: unit_path_for_screenshot(&relative)?,
                captured_at: modified_secs(&metadata),
                bytes: metadata.len(),
            })
        })
        .collect();
    shots.sort_by(|a, b| a.unit_path.cmp(&b.unit_path));
    shots
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
        let is_unit_png = path.extension().and_then(|value| value.to_str()) == Some("png")
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("unit-"));
        if !is_unit_png {
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
    fn maps_unit_path_to_screenshot_file() {
        let root = Path::new("/tmp/project");
        let path = screenshot_path_for_unit(root, "/wiki/plans/foo/stage-1/unit-3-bar.mdx").unwrap();
        assert_eq!(
            path,
            root.join(".hyperwiki/state/screenshots/plans/foo/stage-1/unit-3-bar.png")
        );
    }

    #[test]
    fn accepts_project_scoped_and_bare_wiki_paths() {
        let root = Path::new("/tmp/project");
        let expected = root.join(".hyperwiki/state/screenshots/plans/mvp/unit-1-init.png");
        assert_eq!(
            screenshot_path_for_unit(root, "/projects/abc/wiki/plans/mvp/unit-1-init.mdx").unwrap(),
            expected
        );
        assert_eq!(
            screenshot_path_for_unit(root, "wiki/plans/mvp/unit-1-init.mdx").unwrap(),
            expected
        );
    }

    #[test]
    fn rejects_traversal_and_non_wiki_paths() {
        let root = Path::new("/tmp/project");
        assert!(screenshot_path_for_unit(root, "/wiki/../../etc/passwd.mdx").is_none());
        assert!(screenshot_path_for_unit(root, "/wiki/plans/../unit-1-x.mdx").is_none());
        assert!(screenshot_path_for_unit(root, "/etc/passwd").is_none());
        assert!(screenshot_path_for_unit(root, "/wiki/plans/unit-1-x.txt").is_none());
    }

    #[test]
    fn round_trips_unit_path_through_screenshot_relative() {
        assert_eq!(
            unit_path_for_screenshot("plans/foo/stage-1/unit-3-bar.png").as_deref(),
            Some("/wiki/plans/foo/stage-1/unit-3-bar.mdx")
        );
    }

    #[test]
    fn lists_only_unit_pngs_with_metadata() {
        let dir = std::env::temp_dir().join(format!(
            "hyperwiki-shots-{}",
            std::process::id()
        ));
        let shots_dir = dir.join(".hyperwiki/state/screenshots/plans/mvp");
        fs::create_dir_all(&shots_dir).unwrap();
        fs::write(shots_dir.join("unit-1-init.png"), b"png").unwrap();
        fs::write(shots_dir.join("unit-2-next.png"), b"png-bytes").unwrap();
        fs::write(shots_dir.join("notes.png"), b"ignore").unwrap();
        fs::write(shots_dir.join("unit-3-skip.txt"), b"ignore").unwrap();

        let shots = list_unit_screenshots(&dir);
        let paths: Vec<&str> = shots.iter().map(|shot| shot.unit_path.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "/wiki/plans/mvp/unit-1-init.mdx",
                "/wiki/plans/mvp/unit-2-next.mdx"
            ]
        );
        assert_eq!(shots[1].bytes, "png-bytes".len() as u64);

        fs::remove_dir_all(&dir).ok();
    }
}
