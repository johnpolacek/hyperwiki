//! Repo-visible bug reports stored as MDX wiki pages.

use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const BUGS_DIR: &str = "bugs";
const BUGS_INDEX: &str = "index.mdx";

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "bugs",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "repo-visible bug report MDX files",
            "bug listing and status updates",
            "safe bug report creation context",
        ],
        parity_gate: "bug workflow domain tests and sidebar smoke coverage",
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BugRecord {
    pub title: String,
    pub path: String,
    pub source_path: String,
    pub status: String,
    pub severity: String,
    pub summary: Vec<String>,
    pub reported_at: String,
    pub current_route: String,
    pub linked_plan: String,
    pub project_slug: String,
    pub worktree_slug: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugCreateInput {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub observed: String,
    #[serde(default)]
    pub expected: String,
    #[serde(default)]
    pub steps: String,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub current_route: String,
    #[serde(default)]
    pub linked_plan: String,
    #[serde(default)]
    pub project_slug: String,
    #[serde(default)]
    pub worktree_slug: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugStatusUpdateInput {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub status: String,
}

pub fn list(root: impl AsRef<Path>) -> Vec<BugRecord> {
    let root = root.as_ref();
    let pages = crate::domain::wiki::list_wiki_pages(root, None).pages;
    let mut records = pages
        .into_iter()
        .filter(|page| {
            page.path.starts_with("/wiki/bugs/")
                && !page.path.ends_with("/wiki/bugs/index.mdx")
                && page.frontmatter.get("wikiKind").map(String::as_str) == Some("bug")
        })
        .map(|page| {
            let severity = normalize_severity(
                page.frontmatter
                    .get("severity")
                    .map(String::as_str)
                    .unwrap_or("medium"),
            );
            let status = normalize_status(
                page.status
                    .as_deref()
                    .or_else(|| page.frontmatter.get("status").map(String::as_str))
                    .unwrap_or("open"),
            );
            BugRecord {
                title: page.title,
                path: page.path,
                source_path: page.source_path,
                status,
                severity,
                summary: page.summary,
                reported_at: page
                    .frontmatter
                    .get("reportedAt")
                    .cloned()
                    .unwrap_or_default(),
                current_route: page
                    .frontmatter
                    .get("currentRoute")
                    .cloned()
                    .unwrap_or_default(),
                linked_plan: page
                    .frontmatter
                    .get("linkedPlan")
                    .cloned()
                    .unwrap_or_default(),
                project_slug: page
                    .frontmatter
                    .get("projectSlug")
                    .cloned()
                    .unwrap_or_default(),
                worktree_slug: page
                    .frontmatter
                    .get("worktreeSlug")
                    .cloned()
                    .unwrap_or_default(),
            }
        })
        .collect::<Vec<_>>();
    records.sort_by(|left, right| {
        bug_status_rank(&left.status)
            .cmp(&bug_status_rank(&right.status))
            .then_with(|| severity_rank(&left.severity).cmp(&severity_rank(&right.severity)))
            .then_with(|| right.reported_at.cmp(&left.reported_at))
            .then_with(|| left.title.cmp(&right.title))
    });
    records
}

pub fn create(root: impl AsRef<Path>, input: BugCreateInput) -> Result<BugRecord, String> {
    let root = root.as_ref();
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Bug title is required.".to_string());
    }
    let wiki_dir = root.join("wiki");
    let bugs_dir = wiki_dir.join(BUGS_DIR);
    fs::create_dir_all(&bugs_dir).map_err(|error| error.to_string())?;
    ensure_bug_index(&bugs_dir)?;
    let slug = unique_bug_slug(&bugs_dir, &slugify(title));
    let path = bugs_dir.join(format!("{slug}.mdx"));
    let severity = normalize_severity(&input.severity);
    let reported_at = now_timestamp();
    let source = bug_mdx(&BugMdxInput {
        title,
        description: input.description.trim(),
        observed: input.observed.trim(),
        expected: input.expected.trim(),
        steps: input.steps.trim(),
        severity: &severity,
        status: "open",
        current_route: safe_route(&input.current_route),
        linked_plan: safe_route(&input.linked_plan),
        project_slug: safe_slug(&input.project_slug),
        worktree_slug: safe_slug(&input.worktree_slug),
        reported_at: &reported_at,
    });
    fs::write(&path, source).map_err(|error| error.to_string())?;
    list(root)
        .into_iter()
        .find(|bug| bug.source_path == format!("wiki/bugs/{slug}.mdx"))
        .ok_or_else(|| "Bug was written but could not be listed.".to_string())
}

pub fn update_status(
    root: impl AsRef<Path>,
    input: BugStatusUpdateInput,
) -> Result<BugRecord, String> {
    let root = root.as_ref();
    let status = normalize_status(&input.status);
    if status.is_empty() {
        return Err("Unsupported bug status.".to_string());
    }
    let relative = bug_relative_path(&input.path)?;
    let page_path = root.join("wiki").join(&relative);
    let source = fs::read_to_string(&page_path).map_err(|error| error.to_string())?;
    let updated = update_bug_status_source(&source, &status);
    fs::write(&page_path, updated).map_err(|error| error.to_string())?;
    list(root)
        .into_iter()
        .find(|bug| bug.source_path == format!("wiki/{relative}"))
        .ok_or_else(|| "Bug status was updated but could not be listed.".to_string())
}

pub fn open_bug_summaries(root: impl AsRef<Path>) -> Vec<BugRecord> {
    list(root)
        .into_iter()
        .filter(|bug| matches!(bug.status.as_str(), "open" | "fixing"))
        .collect()
}

fn ensure_bug_index(bugs_dir: &Path) -> Result<(), String> {
    let index_path = bugs_dir.join(BUGS_INDEX);
    if index_path.exists() {
        return Ok(());
    }
    let source = r#"---
title: "Bugs"
description: "Current project bugs."
wikiKind: "bug-index"
---

<PlanHero title="Bugs" description="This structural file lets the app route to Bugs. The app renders the top-level Bugs state." />
"#;
    fs::write(index_path, source).map_err(|error| error.to_string())
}

struct BugMdxInput<'a> {
    title: &'a str,
    description: &'a str,
    observed: &'a str,
    expected: &'a str,
    steps: &'a str,
    severity: &'a str,
    status: &'a str,
    current_route: String,
    linked_plan: String,
    project_slug: String,
    worktree_slug: String,
    reported_at: &'a str,
}

fn bug_mdx(input: &BugMdxInput<'_>) -> String {
    let description = fallback(input.description, "No description recorded.");
    let observed = fallback(input.observed, "Not recorded.");
    let expected = fallback(input.expected, "Not recorded.");
    let steps = fallback(input.steps, "Not recorded.");
    let current_route = fallback(&input.current_route, "Not recorded.");
    let linked_plan = fallback(&input.linked_plan, "Not linked.");
    let project_slug = fallback(&input.project_slug, "current");
    let worktree_slug = fallback(&input.worktree_slug, "current");
    format!(
        r#"---
title: {title}
description: "Bug report."
wikiKind: "bug"
status: "{status}"
severity: "{severity}"
reportedAt: "{reported_at}"
currentRoute: {current_route_frontmatter}
linkedPlan: {linked_plan_frontmatter}
projectSlug: {project_slug_frontmatter}
worktreeSlug: {worktree_slug_frontmatter}
---

<PlanHero title={title} status="{status}" description="{severity} severity bug report." />

<PlanSummary>
  <ul>
    <li>Status: {status}</li>
    <li>Severity: {severity}</li>
    <li>Reported: {reported_at}</li>
    <li>Current route: <code>{current_route}</code></li>
    <li>Linked plan or unit: <code>{linked_plan}</code></li>
    <li>Checkout: <code>{project_slug}/{worktree_slug}</code></li>
  </ul>
</PlanSummary>

<section>
  <h2>Description</h2>
  <p>{description}</p>
</section>

<section>
  <h2>Observed Behavior</h2>
  <p>{observed}</p>
</section>

<section>
  <h2>Expected Behavior</h2>
  <p>{expected}</p>
</section>

<section>
  <h2>Reproduction Steps</h2>
  <pre>{steps}</pre>
</section>

<section>
  <h2>Fix Notes</h2>
  <p>No fix has been recorded yet.</p>
</section>
"#,
        title = yaml_string(input.title),
        status = input.status,
        severity = input.severity,
        reported_at = input.reported_at,
        current_route_frontmatter = yaml_string(&input.current_route),
        linked_plan_frontmatter = yaml_string(&input.linked_plan),
        project_slug_frontmatter = yaml_string(&input.project_slug),
        worktree_slug_frontmatter = yaml_string(&input.worktree_slug),
        current_route = html_escape(&current_route),
        linked_plan = html_escape(&linked_plan),
        project_slug = html_escape(&project_slug),
        worktree_slug = html_escape(&worktree_slug),
        description = paragraph_escape(&description),
        observed = paragraph_escape(&observed),
        expected = paragraph_escape(&expected),
        steps = html_escape(&steps),
    )
}

fn update_bug_status_source(source: &str, status: &str) -> String {
    let mut in_frontmatter = false;
    let mut frontmatter_seen = false;
    let mut status_written = false;
    let mut lines = Vec::new();
    for line in source.lines() {
        let mut next = line.to_string();
        if !frontmatter_seen && line.trim() == "---" {
            frontmatter_seen = true;
            in_frontmatter = true;
        } else if in_frontmatter && line.trim() == "---" {
            if !status_written {
                lines.push(format!("status: \"{status}\""));
                status_written = true;
            }
            in_frontmatter = false;
        } else if in_frontmatter && line.trim_start().starts_with("status:") {
            next = format!("status: \"{status}\"");
            status_written = true;
        } else if line.contains("<PlanHero") && line.contains("status=") {
            next = replace_status_attr(line, status);
        } else if line.trim_start().starts_with("<li>Status:") {
            let indent = line
                .chars()
                .take_while(|ch| ch.is_whitespace())
                .collect::<String>();
            next = format!("{indent}<li>Status: {status}</li>");
        } else if line.contains("<StatusBadge") && line.contains("status=") {
            next = replace_status_attr(line, status);
        }
        lines.push(next);
    }
    let mut output = lines.join("\n");
    if source.ends_with('\n') {
        output.push('\n');
    }
    output
}

fn replace_status_attr(line: &str, status: &str) -> String {
    let Some(start) = line.find("status=\"") else {
        return line.to_string();
    };
    let value_start = start + "status=\"".len();
    let Some(end) = line[value_start..].find('"') else {
        return line.to_string();
    };
    format!(
        "{}{}{}",
        &line[..value_start],
        status,
        &line[value_start + end..]
    )
}

fn bug_relative_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    let relative = trimmed
        .strip_prefix("/wiki/")
        .or_else(|| trimmed.strip_prefix("wiki/"))
        .unwrap_or(trimmed);
    if relative.is_empty()
        || relative == "bugs/index.mdx"
        || !relative.starts_with("bugs/")
        || !relative.ends_with(".mdx")
        || relative
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("Invalid bug page path.".to_string());
    }
    Ok(relative.to_string())
}

fn unique_bug_slug(dir: &Path, base: &str) -> String {
    let base = if base.is_empty() { "bug" } else { base };
    let mut candidate = base.to_string();
    let mut index = 2;
    while dir.join(format!("{candidate}.mdx")).exists() {
        candidate = format!("{base}-{index}");
        index += 1;
    }
    candidate
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash {
            output.push('-');
            previous_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

pub fn normalize_status(status: &str) -> String {
    let normalized = status.trim().to_lowercase();
    match normalized.as_str() {
        "open" | "fixing" | "fixed" | "verified" | "closed" => normalized,
        _ => String::new(),
    }
}

fn normalize_severity(severity: &str) -> String {
    let normalized = severity.trim().to_lowercase();
    match normalized.as_str() {
        "low" | "medium" | "high" | "critical" => normalized,
        _ => "medium".to_string(),
    }
}

fn bug_status_rank(status: &str) -> usize {
    match status {
        "fixing" => 0,
        "open" => 1,
        "fixed" => 2,
        "verified" => 3,
        "closed" => 4,
        _ => 5,
    }
}

fn severity_rank(severity: &str) -> usize {
    match severity {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    }
}

fn safe_route(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("/wiki/") || trimmed.is_empty() {
        trimmed.to_string()
    } else {
        String::new()
    }
}

fn safe_slug(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .collect()
}

fn fallback(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn paragraph_escape(value: &str) -> String {
    html_escape(value).replace('\n', "<br />")
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('{', "&#123;")
        .replace('}', "&#125;")
}

fn yaml_string(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', " ")
            .trim()
    )
}

fn now_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_root(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("hyperwiki-bugs-{label}-{}", std::process::id()));
        fs::remove_dir_all(&root).ok();
        fs::create_dir_all(root.join("wiki")).unwrap();
        root
    }

    fn input(title: &str, severity: &str) -> BugCreateInput {
        BugCreateInput {
            title: title.to_string(),
            description: "A useful report".to_string(),
            observed: "Observed".to_string(),
            expected: "Expected".to_string(),
            steps: "1. Open the app".to_string(),
            severity: severity.to_string(),
            current_route: "/wiki/plans/index.mdx".to_string(),
            linked_plan: "/wiki/plans/features/test.mdx".to_string(),
            project_slug: "sample".to_string(),
            worktree_slug: "main".to_string(),
        }
    }

    #[test]
    fn create_bug_writes_slugged_page_and_index() {
        let root = temp_root("create");
        let bug = create(&root, input("Button fails", "high")).unwrap();
        assert_eq!(bug.path, "/wiki/bugs/button-fails.mdx");
        assert_eq!(bug.status, "open");
        assert_eq!(bug.severity, "high");
        assert!(root.join("wiki").join("bugs").join("index.mdx").exists());
        assert!(root
            .join("wiki")
            .join("bugs")
            .join("button-fails.mdx")
            .exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn create_bug_uses_unique_slug() {
        let root = temp_root("slug");
        create(&root, input("Button fails", "medium")).unwrap();
        let second = create(&root, input("Button fails", "medium")).unwrap();
        assert_eq!(second.path, "/wiki/bugs/button-fails-2.mdx");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn list_orders_open_and_fixing_before_completed_statuses() {
        let root = temp_root("order");
        let low = create(&root, input("Low issue", "low")).unwrap();
        let critical = create(&root, input("Critical issue", "critical")).unwrap();
        let fixed = create(&root, input("Fixed issue", "critical")).unwrap();
        update_status(
            &root,
            BugStatusUpdateInput {
                path: fixed.path,
                status: "fixed".to_string(),
            },
        )
        .unwrap();
        update_status(
            &root,
            BugStatusUpdateInput {
                path: low.path,
                status: "fixing".to_string(),
            },
        )
        .unwrap();

        let bugs = list(&root);
        assert_eq!(
            bugs.iter()
                .map(|bug| bug.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Low issue", "Critical issue", "Fixed issue",]
        );
        assert_eq!(bugs[0].status, "fixing");
        assert_eq!(bugs[1].path, critical.path);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn update_status_rewrites_frontmatter_and_visible_summary() {
        let root = temp_root("status");
        let bug = create(&root, input("Wrong color", "medium")).unwrap();
        let updated = update_status(
            &root,
            BugStatusUpdateInput {
                path: bug.path,
                status: "verified".to_string(),
            },
        )
        .unwrap();
        assert_eq!(updated.status, "verified");
        let source =
            fs::read_to_string(root.join("wiki").join("bugs").join("wrong-color.mdx")).unwrap();
        assert!(source.contains("status: \"verified\""));
        assert!(source.contains("status=\"verified\""));
        assert!(source.contains("<li>Status: verified</li>"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_unsafe_status_paths() {
        let root = temp_root("unsafe");
        create(&root, input("Path issue", "medium")).unwrap();
        let error = update_status(
            &root,
            BugStatusUpdateInput {
                path: "/wiki/bugs/../plans/index.mdx".to_string(),
                status: "closed".to_string(),
            },
        )
        .unwrap_err();
        assert!(error.contains("Invalid bug page path"));
        fs::remove_dir_all(root).ok();
    }
}
