//! Persisted "screenshots reviewed" marks.
//!
//! Gates advancing to the next unit: a unit awaits review until the user has
//! approved or closed its review dialog for the current screenshot set. We store
//! the `capturedAt` (newest screenshot mtime, unix seconds) the user reviewed,
//! per unit, in a single JSON map under the gitignored runtime dir. A later
//! fix-run that regenerates screenshots bumps `capturedAt` past the stored mark,
//! so the unit awaits review again.

use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const REVIEWS_FILE: &str = ".hyperwiki/state/screenshot-reviews.json";

fn reviews_path(root: impl AsRef<Path>) -> PathBuf {
    root.as_ref().join(REVIEWS_FILE)
}

/// The full `{ unitPath: reviewedCapturedAt }` map.
pub fn reviewed(root: impl AsRef<Path>) -> BTreeMap<String, u64> {
    let Ok(content) = fs::read_to_string(reviews_path(&root)) else {
        return BTreeMap::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&content) else {
        return BTreeMap::new();
    };
    value
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| value.as_u64().map(|captured| (key.clone(), captured)))
                .collect()
        })
        .unwrap_or_default()
}

/// Mark a unit reviewed at `captured_at`. Never lowers an existing mark.
pub fn mark_reviewed(root: impl AsRef<Path>, unit_path: &str, captured_at: u64) -> Result<(), String> {
    let path = reviews_path(&root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut map: Map<String, Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let existing = map.get(unit_path).and_then(Value::as_u64).unwrap_or(0);
    map.insert(unit_path.to_string(), Value::from(captured_at.max(existing)));
    let text = serde_json::to_string_pretty(&Value::Object(map)).map_err(|error| error.to_string())?;
    fs::write(&path, format!("{text}\n")).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("hyperwiki-reviews-{label}-{}", std::process::id()))
    }

    #[test]
    fn mark_and_read_round_trip() {
        let root = temp_root("round-trip");
        assert!(reviewed(&root).is_empty());
        mark_reviewed(&root, "/wiki/plans/mvp/units/01-x.mdx", 100).unwrap();
        let map = reviewed(&root);
        assert_eq!(map.get("/wiki/plans/mvp/units/01-x.mdx"), Some(&100));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn newer_mark_overwrites_and_never_lowers() {
        let root = temp_root("overwrite");
        mark_reviewed(&root, "/wiki/plans/mvp/units/01-x.mdx", 100).unwrap();
        mark_reviewed(&root, "/wiki/plans/mvp/units/01-x.mdx", 250).unwrap();
        assert_eq!(reviewed(&root).get("/wiki/plans/mvp/units/01-x.mdx"), Some(&250));
        // An older mark does not lower the stored value.
        mark_reviewed(&root, "/wiki/plans/mvp/units/01-x.mdx", 120).unwrap();
        assert_eq!(reviewed(&root).get("/wiki/plans/mvp/units/01-x.mdx"), Some(&250));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn tracks_multiple_units() {
        let root = temp_root("multi");
        mark_reviewed(&root, "/wiki/a.mdx", 1).unwrap();
        mark_reviewed(&root, "/wiki/b.mdx", 2).unwrap();
        let map = reviewed(&root);
        assert_eq!(map.len(), 2);
        assert_eq!(map.get("/wiki/b.mdx"), Some(&2));
        fs::remove_dir_all(&root).ok();
    }
}
