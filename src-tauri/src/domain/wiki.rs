use super::DomainSurface;
use serde::Serialize;
use std::fs;
use std::path::Path;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "wiki",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "repo-visible HTML wiki file reads",
            "wiki page listing and title extraction",
            "project-scoped wiki links",
            "plan summary and status parsing",
        ],
        parity_gate: "project wiki links and plan status smoke equivalents",
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiPage {
    pub title: String,
    pub summary: Vec<String>,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiPageList {
    pub pages: Vec<WikiPage>,
}

pub fn list_wiki_pages(root: impl AsRef<Path>, project_id: Option<&str>) -> WikiPageList {
    let wiki_root = root.as_ref().join("wiki");
    if !wiki_root.is_dir() {
        return WikiPageList { pages: Vec::new() };
    }
    let mut pages = Vec::new();
    walk_wiki(&wiki_root, &wiki_root, project_id, &mut pages);
    pages.sort_by(|left, right| left.path.cmp(&right.path));
    WikiPageList { pages }
}

pub fn read_wiki_page(root: impl AsRef<Path>, request_path: &str) -> Result<String, String> {
    let Some(relative) = wiki_relative_path(request_path) else {
        return Err("Not a wiki page path.".to_string());
    };
    if relative
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("Invalid wiki page path.".to_string());
    }
    let page_path = root.as_ref().join("wiki").join(relative);
    if page_path.extension().and_then(|value| value.to_str()) != Some("html") {
        return Err("Only HTML wiki pages can be served.".to_string());
    }
    fs::read_to_string(page_path).map_err(|error| error.to_string())
}

fn wiki_relative_path(path: &str) -> Option<&str> {
    let path = path.split_once('?').map(|(path, _)| path).unwrap_or(path);
    if let Some(relative) = path.strip_prefix("/wiki/") {
        return Some(relative);
    }
    let marker = "/wiki/";
    path.find(marker)
        .and_then(|index| path.get(index + marker.len()..))
}

fn walk_wiki(
    base_root: &Path,
    directory: &Path,
    project_id: Option<&str>,
    pages: &mut Vec<WikiPage>,
) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let full_path = entry.path();
        if full_path.is_dir() {
            walk_wiki(base_root, &full_path, project_id, pages);
            continue;
        }
        if full_path.extension().and_then(|value| value.to_str()) != Some("html") {
            continue;
        }
        let Ok(relative_path) = full_path.strip_prefix(base_root) else {
            continue;
        };
        let relative_path = slash_path(relative_path);
        let html = fs::read_to_string(&full_path).unwrap_or_default();
        let title = first_heading(&html).unwrap_or_else(|| title_from_wiki_path(&relative_path));
        let summary = list_items_from_first_summary(&html);
        let path = project_id
            .map(|id| format!("/projects/{id}/wiki/{relative_path}"))
            .unwrap_or_else(|| format!("/wiki/{relative_path}"));
        let status = page_status(&summary, &path);
        pages.push(WikiPage {
            title,
            summary,
            path,
            status,
        });
    }
}

fn first_heading(html: &str) -> Option<String> {
    first_between_case_insensitive(html, "<h1", "</h1>").map(|value| {
        let content = value
            .split_once('>')
            .map(|(_, content)| content)
            .unwrap_or(&value);
        strip_html(content)
    })
}

fn list_items_from_first_summary(html: &str) -> Vec<String> {
    let mut items = Vec::new();
    if let Some(section) =
        first_between_case_insensitive(html, "<section class=\"summary\"", "</section>")
    {
        let mut rest = section.as_str();
        while let Some(item) = first_between_case_insensitive(rest, "<li", "</li>") {
            let content = item
                .split_once('>')
                .map(|(_, content)| content)
                .unwrap_or(&item);
            items.push(strip_html(content));
            if let Some((_, next)) = rest.split_once("</li>") {
                rest = next;
            } else {
                break;
            }
        }
    }
    if !items
        .iter()
        .any(|item| item.to_lowercase().starts_with("status:"))
    {
        if let Some(status) = definition_value_after_term(html, "Status") {
            items.insert(0, format!("Status: {status}"));
        }
    }
    items
}

fn definition_value_after_term(html: &str, term: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut search_from = 0;
    while let Some(relative_index) = lower[search_from..].find("<dt") {
        let start = search_from + relative_index;
        let end = lower[start..].find("</dt>")? + start;
        let element = &html[start..end];
        let content = element
            .split_once('>')
            .map(|(_, content)| strip_html(content))
            .unwrap_or_else(|| strip_html(element));
        if content.trim().eq_ignore_ascii_case(term) {
            let after = &html[end + "</dt>".len()..];
            let value = first_between_case_insensitive(after, "<dd", "</dd>")?;
            let content = value
                .split_once('>')
                .map(|(_, content)| content)
                .unwrap_or(&value);
            return Some(strip_html(content));
        }
        search_from = end + "</dt>".len();
    }
    None
}

fn page_status(summary: &[String], path: &str) -> Option<String> {
    if path.contains("/wiki/plans/zzz_completed/")
        && !path.ends_with("/wiki/plans/zzz_completed/index.html")
    {
        return Some("complete".to_string());
    }
    summary.iter().find_map(|item| {
        let lower = item.to_lowercase();
        let status = lower.strip_prefix("status:")?.trim();
        [
            "active",
            "pending",
            "complete",
            "completed",
            "draft",
            "blocked",
            "deferred",
        ]
        .contains(&status)
        .then(|| status.replace("completed", "complete"))
    })
}

fn first_between_case_insensitive(value: &str, start: &str, end: &str) -> Option<String> {
    let lower = value.to_lowercase();
    let start_index = lower.find(&start.to_lowercase())?;
    let end_index = lower[start_index..].find(&end.to_lowercase())? + start_index;
    Some(value[start_index..end_index].to_string())
}

fn strip_html(value: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn title_from_wiki_path(relative_path: &str) -> String {
    let without_extension = relative_path.trim_end_matches(".html");
    let segments = without_extension.split('/').collect::<Vec<_>>();
    let leaf = if segments.last() == Some(&"index") && segments.len() > 1 {
        segments[segments.len() - 2]
    } else {
        segments.last().copied().unwrap_or("wiki")
    };
    leaf.split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn slash_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn lists_wiki_pages_with_titles_summary_and_status() {
        let root = temp_root("wiki-list");
        let plan_dir = root.join("wiki").join("plans");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(
            root.join("wiki").join("index.html"),
            "<h1>Home</h1><section class=\"summary\"><ul><li>Status: active</li></ul></section>",
        )
        .unwrap();
        fs::write(plan_dir.join("feature-plan.html"), "<h1>Feature Plan</h1>").unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].path, "/wiki/index.html");
        assert_eq!(pages[0].title, "Home");
        assert_eq!(pages[0].status.as_deref(), Some("active"));
        assert_eq!(pages[1].title, "Feature Plan");
    }

    #[test]
    fn parses_custom_plan_status_metric() {
        let root = temp_root("wiki-custom-status");
        let plan_dir = root.join("wiki").join("plans");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(
            plan_dir.join("tauri-rewrite.html"),
            "<h1>Tauri Rewrite</h1><dl><div><dt>Status</dt><dd><span>complete</span></dd></div></dl>",
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        assert_eq!(pages[0].path, "/wiki/plans/tauri-rewrite.html");
        assert_eq!(pages[0].status.as_deref(), Some("complete"));
        assert_eq!(pages[0].summary[0], "Status: complete");
    }

    #[test]
    fn can_emit_project_scoped_wiki_paths() {
        let root = temp_root("wiki-project");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("source-index.html"), "").unwrap();

        let pages = list_wiki_pages(&root, Some("project-1")).pages;
        assert_eq!(pages[0].path, "/projects/project-1/wiki/source-index.html");
        assert_eq!(pages[0].title, "Source Index");
    }

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-tauri-{label}-{nanos}"));
        fs::create_dir_all(root.join("wiki")).unwrap();
        root
    }
}
