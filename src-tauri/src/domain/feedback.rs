//! Screenshot review feedback queue.
//!
//! Reviewers queue per-screenshot feedback instead of dispatching it to the
//! agent immediately. Items are persisted as per-item JSON under the gitignored
//! runtime dir and drained to the agent in batches per unit. Storage mirrors the
//! sessions registry pattern (`domain::sessions`).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const FEEDBACK_SUBDIR: &str = ".hyperwiki/state/feedback";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackItem {
    pub id: String,
    /// Unit wiki display path, e.g. `/wiki/plans/mvp/units/stage-04/03-foo.mdx`.
    pub unit_path: String,
    /// Screenshot file name the comment is about, e.g. `02-roster.png`.
    pub screenshot: String,
    pub comment: String,
    pub status: String, // "pending" | "dispatched"
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispatched_at: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackCommentInput {
    pub screenshot: String,
    pub comment: String,
}

fn feedback_dir(root: impl AsRef<Path>) -> PathBuf {
    root.as_ref().join(FEEDBACK_SUBDIR)
}

/// Append pending feedback items for a unit. Blank comments are skipped.
pub fn enqueue(
    root: impl AsRef<Path>,
    unit_path: &str,
    comments: &[FeedbackCommentInput],
) -> Result<Vec<FeedbackItem>, String> {
    let dir = feedback_dir(&root);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let base = now_millis();
    let created = now_secs();
    let mut items = Vec::new();
    for (index, input) in comments.iter().enumerate() {
        let comment = input.comment.trim();
        if comment.is_empty() {
            continue;
        }
        let item = FeedbackItem {
            id: format!("{base:013}-{index}"),
            unit_path: unit_path.to_string(),
            screenshot: input.screenshot.clone(),
            comment: comment.to_string(),
            status: "pending".to_string(),
            created_at: created,
            dispatched_at: None,
        };
        write_one(&dir, &item)?;
        items.push(item);
    }
    Ok(items)
}

/// All feedback items, oldest first.
pub fn list(root: impl AsRef<Path>) -> Vec<FeedbackItem> {
    let Ok(entries) = fs::read_dir(feedback_dir(&root)) else {
        return Vec::new();
    };
    let mut items: Vec<FeedbackItem> = entries
        .flatten()
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .filter_map(|entry| {
            fs::read_to_string(entry.path())
                .ok()
                .and_then(|content| serde_json::from_str::<FeedbackItem>(&content).ok())
        })
        .collect();
    items.sort_by(|a, b| a.id.cmp(&b.id));
    items
}

/// Mark the given items dispatched (kept as a record, filtered out of the
/// pending queue by callers).
pub fn mark_dispatched(root: impl AsRef<Path>, ids: &[String]) -> Result<(), String> {
    let dir = feedback_dir(&root);
    let dispatched = now_secs();
    for id in ids {
        let path = dir.join(format!("{}.json", safe_id(id)));
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(mut item) = serde_json::from_str::<FeedbackItem>(&content) else {
            continue;
        };
        item.status = "dispatched".to_string();
        item.dispatched_at = Some(dispatched);
        write_one(&dir, &item)?;
    }
    Ok(())
}

/// Remove a single feedback item.
pub fn remove(root: impl AsRef<Path>, id: &str) -> Result<(), String> {
    let path = feedback_dir(&root).join(format!("{}.json", safe_id(id)));
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn write_one(dir: &Path, item: &FeedbackItem) -> Result<(), String> {
    let path = dir.join(format!("{}.json", safe_id(&item.id)));
    let text = serde_json::to_string_pretty(item).map_err(|error| error.to_string())?;
    fs::write(path, format!("{text}\n")).map_err(|error| error.to_string())
}

fn safe_id(id: &str) -> String {
    id.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("hyperwiki-feedback-{label}-{}", std::process::id()))
    }

    fn input(screenshot: &str, comment: &str) -> FeedbackCommentInput {
        FeedbackCommentInput { screenshot: screenshot.to_string(), comment: comment.to_string() }
    }

    #[test]
    fn enqueue_persists_pending_items_and_skips_blanks() {
        let root = temp_root("enqueue");
        let items = enqueue(
            &root,
            "/wiki/plans/mvp/units/stage-04/03-foo.mdx",
            &[input("01-a.png", "too small"), input("02-b.png", "   "), input("03-c.png", "wrong color")],
        )
        .unwrap();
        assert_eq!(items.len(), 2, "blank comments are skipped");

        let listed = list(&root);
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().all(|item| item.status == "pending"));
        assert_eq!(listed[0].unit_path, "/wiki/plans/mvp/units/stage-04/03-foo.mdx");
        let screenshots: Vec<&str> = listed.iter().map(|item| item.screenshot.as_str()).collect();
        assert_eq!(screenshots, vec!["01-a.png", "03-c.png"]);

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn mark_dispatched_updates_status() {
        let root = temp_root("dispatch");
        let items = enqueue(&root, "/wiki/plans/mvp/units/01-x.mdx", &[input("01.png", "fix")]).unwrap();
        mark_dispatched(&root, &[items[0].id.clone()]).unwrap();
        let listed = list(&root);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].status, "dispatched");
        assert!(listed[0].dispatched_at.is_some());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn remove_deletes_item() {
        let root = temp_root("remove");
        let items = enqueue(&root, "/wiki/plans/mvp/units/01-x.mdx", &[input("01.png", "fix")]).unwrap();
        remove(&root, &items[0].id).unwrap();
        assert!(list(&root).is_empty());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn list_is_empty_without_a_queue_dir() {
        let root = temp_root("empty");
        assert!(list(&root).is_empty());
    }
}
