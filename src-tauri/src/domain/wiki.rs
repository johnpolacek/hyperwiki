use super::DomainSurface;
use serde::Serialize;
use std::fs;
use std::path::Path;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "wiki",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "repo-visible MDX wiki file reads",
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
    pub source_path: String,
    pub format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiPageList {
    pub pages: Vec<WikiPage>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiSource {
    pub path: String,
    pub source: String,
    pub markdown: String,
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
    if page_path.extension().and_then(|value| value.to_str()) != Some("mdx") {
        return Err("Only MDX wiki pages can be served.".to_string());
    }
    let mdx = fs::read_to_string(page_path).map_err(|error| error.to_string())?;
    Ok(render_mdx_page(&mdx))
}

pub fn read_wiki_source(root: impl AsRef<Path>, request_path: &str) -> Result<WikiSource, String> {
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
    if page_path.extension().and_then(|value| value.to_str()) != Some("mdx") {
        return Err("Only MDX wiki source can be served.".to_string());
    }
    let source = fs::read_to_string(page_path).map_err(|error| error.to_string())?;
    Ok(WikiSource {
        path: format!("/wiki/{relative}"),
        markdown: mdx_markdown_derivative(&source),
        source,
    })
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

pub fn mdx_markdown_derivative(mdx: &str) -> String {
    let body = strip_frontmatter(mdx);
    let mut output = String::new();
    let mut in_code = false;
    let mut skip_human_visibility = false;
    let mut text = String::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("import ") || trimmed.starts_with("export ") {
            continue;
        }
        if trimmed.starts_with("```") {
            flush_markdown_text(&mut output, &mut text);
            in_code = !in_code;
            output.push_str(trimmed);
            output.push('\n');
            continue;
        }
        if in_code {
            output.push_str(line);
            output.push('\n');
            continue;
        }
        if skip_human_visibility {
            if trimmed.contains("</Visibility>") {
                skip_human_visibility = false;
            }
            continue;
        }
        if is_visibility_open_for(trimmed, "humans") {
            if !trimmed.contains("</Visibility>") {
                skip_human_visibility = true;
            }
            continue;
        }
        let line = strip_visibility_wrappers(line);
        let trimmed = line.trim();
        if let Some(hint) = mdx_component_markdown_hint(trimmed) {
            flush_markdown_text(&mut output, &mut text);
            output.push_str(&hint);
            output.push('\n');
            if trimmed.ends_with("/>") || trimmed.ends_with('>') {
                continue;
            }
        }
        let line = strip_mdx_wrappers(&line);
        let trimmed = line.trim();
        if trimmed.is_empty() {
            flush_markdown_text(&mut output, &mut text);
            continue;
        }
        if let Some(heading) = html_heading_to_markdown(trimmed) {
            flush_markdown_text(&mut output, &mut text);
            output.push_str(&heading);
            output.push('\n');
            for item in html_list_items_to_markdown(trimmed) {
                output.push_str("- ");
                output.push_str(&item);
                output.push('\n');
            }
            continue;
        }
        if let Some(paragraph) = html_paragraph_to_markdown(trimmed) {
            flush_markdown_text(&mut output, &mut text);
            output.push_str(&paragraph);
            output.push_str("\n\n");
            continue;
        }
        if let Some(item) = html_list_item_to_markdown(trimmed) {
            flush_markdown_text(&mut output, &mut text);
            output.push_str("- ");
            output.push_str(&item);
            output.push('\n');
            continue;
        }
        if trimmed.starts_with('<') && trimmed.ends_with('>') {
            flush_markdown_text(&mut output, &mut text);
            continue;
        }
        if !text.is_empty() {
            text.push(' ');
        }
        text.push_str(&strip_html(trimmed));
    }
    flush_markdown_text(&mut output, &mut text);
    output
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn flush_markdown_text(output: &mut String, text: &mut String) {
    let trimmed = text.trim();
    if !trimmed.is_empty() {
        output.push_str(trimmed);
        output.push_str("\n\n");
    }
    text.clear();
}

fn strip_mdx_wrappers(line: &str) -> String {
    let mut output = line.replace(" className=", " class=");
    for tag in MDX_SECTION_TAGS {
        output = output
            .replace(&format!("<{tag}"), "<section")
            .replace(&format!("</{tag}>"), "</section>");
    }
    output
        .replace("<CodeBlock", "<pre")
        .replace("</CodeBlock>", "</pre>")
        .replace("<CommandBlock", "<pre")
        .replace("</CommandBlock>", "</pre>")
}

const MDX_SECTION_TAGS: &[&str] = &[
    "PlanHero",
    "PlanSummary",
    "PlanUnit",
    "Decision",
    "Evidence",
    "Verification",
    "Callout",
    "Note",
    "Tip",
    "Warning",
    "Danger",
    "Check",
    "Panel",
    "Frame",
    "Card",
    "Steps",
    "Step",
    "Prompt",
    "Update",
    "TaskList",
    "StatusBadge",
    "Badge",
    "ParamField",
    "ResponseField",
    "Tree",
    "TreeFolder",
    "TreeFile",
    "Tabs",
    "Tab",
    "AccordionGroup",
    "Accordion",
    "AccordionItem",
    "Tooltip",
];

fn is_visibility_open_for(line: &str, audience: &str) -> bool {
    is_mdx_opening(line, "Visibility")
        && mdx_attr_value(line, "for")
            .or_else(|| mdx_attr_value(line, "audience"))
            .map(|value| value.eq_ignore_ascii_case(audience))
            .unwrap_or(false)
}

fn strip_visibility_wrappers(line: &str) -> String {
    let mut output = line.to_string();
    while let Some(start) = output.find("<Visibility") {
        let Some(end) = output[start..].find('>') else {
            break;
        };
        output.replace_range(start..start + end + 1, "");
    }
    output.replace("</Visibility>", "")
}

fn mdx_component_markdown_hint(line: &str) -> Option<String> {
    if is_mdx_opening(line, "ParamField") || is_mdx_opening(line, "ResponseField") {
        let field_kind = if is_mdx_opening(line, "ParamField") {
            "param"
        } else {
            "response"
        };
        let name = mdx_attr_value(line, "name")
            .or_else(|| mdx_attr_value(line, "field"))
            .or_else(|| mdx_attr_value(line, "title"))
            .unwrap_or_else(|| "field".to_string());
        let mut details = vec![field_kind.to_string()];
        if let Some(field_type) = mdx_attr_value(line, "type") {
            details.push(field_type);
        }
        if mdx_bool_attr(line, "required") {
            details.push("required".to_string());
        }
        if mdx_bool_attr(line, "deprecated") {
            details.push("deprecated".to_string());
        }
        return Some(format!("- `{name}` ({})", details.join(", ")));
    }

    if is_mdx_opening(line, "StatusBadge") || is_mdx_opening(line, "Badge") {
        let value = mdx_attr_value(line, "status")
            .or_else(|| mdx_attr_value(line, "label"))
            .unwrap_or_else(|| "Status".to_string());
        return Some(format!("Status: {value}"));
    }

    if is_mdx_opening(line, "Step") {
        return mdx_attr_value(line, "title")
            .or_else(|| mdx_attr_value(line, "label"))
            .map(|title| format!("### {title}"));
    }

    let labeled_components = [
        ("Decision", "Decision"),
        ("Evidence", "Evidence"),
        ("Verification", "Verification"),
        ("Callout", "Note"),
        ("Note", "Note"),
        ("Tip", "Tip"),
        ("Warning", "Warning"),
        ("Danger", "Danger"),
        ("Check", "Check"),
        ("Panel", "Panel"),
        ("Prompt", "Prompt"),
        ("Update", "Update"),
    ];
    for (tag, label) in labeled_components {
        if is_mdx_opening(line, tag) {
            let title = mdx_attr_value(line, "title")
                .or_else(|| mdx_attr_value(line, "label"))
                .or_else(|| mdx_attr_value(line, "date"));
            if let Some(title) = title {
                return Some(format!("**{label}:** {title}"));
            }
        }
    }

    None
}

fn is_mdx_opening(line: &str, tag: &str) -> bool {
    line.starts_with(&format!("<{tag}>"))
        || line.starts_with(&format!("<{tag} "))
        || line.starts_with(&format!("<{tag}/"))
}

fn mdx_attr_value(line: &str, name: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let marker = format!("{name}={quote}");
        if let Some(start) = line.find(&marker) {
            let value_start = start + marker.len();
            let value = line.get(value_start..)?;
            let end = value.find(quote)?;
            return value.get(..end).map(ToString::to_string);
        }
    }
    None
}

fn mdx_bool_attr(line: &str, name: &str) -> bool {
    if let Some(value) = mdx_attr_value(line, name) {
        return !value.eq_ignore_ascii_case("false");
    }
    line.contains(&format!(" {name} ")) || line.contains(&format!(" {name}>")) || line.contains(&format!(" {name}/"))
}

fn html_heading_to_markdown(line: &str) -> Option<String> {
    for level in 1..=6 {
        let start = format!("<h{level}");
        let end = format!("</h{level}>");
        if let Some(value) = first_between_case_insensitive(line, &start, &end) {
            let content = value
                .split_once('>')
                .map(|(_, content)| strip_html(content))
                .unwrap_or_else(|| strip_html(&value));
            return Some(format!("{} {}", "#".repeat(level), content));
        }
    }
    None
}

fn html_paragraph_to_markdown(line: &str) -> Option<String> {
    first_between_case_insensitive(line, "<p", "</p>").and_then(|value| {
        let content = value
            .split_once('>')
            .map(|(_, content)| strip_html(content))
            .unwrap_or_else(|| strip_html(&value));
        let content = content.trim().to_string();
        if content.is_empty() {
            None
        } else {
            Some(content)
        }
    })
}

fn html_list_item_to_markdown(line: &str) -> Option<String> {
    html_list_items_to_markdown(line).into_iter().next()
}

fn html_list_items_to_markdown(line: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut rest = line;
    while let Some(value) = first_between_case_insensitive(rest, "<li", "</li>") {
        let content = value
            .split_once('>')
            .map(|(_, content)| content)
            .unwrap_or(&value);
        items.push(strip_html(content));
        if let Some((_, next)) = rest.split_once("</li>") {
            rest = next;
        } else {
            break;
        }
    }
    items
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
        if full_path.extension().and_then(|value| value.to_str()) != Some("mdx") {
            continue;
        }
        let Ok(relative_path) = full_path.strip_prefix(base_root) else {
            continue;
        };
        let relative_path = slash_path(relative_path);
        let mdx = fs::read_to_string(&full_path).unwrap_or_default();
        let title = first_heading(&mdx).unwrap_or_else(|| title_from_wiki_path(&relative_path));
        let summary = list_items_from_first_summary(&mdx);
        let path = project_id
            .map(|id| format!("/projects/{id}/wiki/{relative_path}"))
            .unwrap_or_else(|| format!("/wiki/{relative_path}"));
        let status = page_status(&summary, &path);
        pages.push(WikiPage {
            title,
            summary,
            source_path: format!("wiki/{relative_path}"),
            format: "mdx".to_string(),
            path,
            status,
        });
    }
}

fn first_heading(mdx: &str) -> Option<String> {
    if let Some(title) = frontmatter_value(mdx, "title") {
        return Some(title);
    }
    if let Some(markdown_heading) = mdx.lines().find_map(|line| {
        line.trim()
            .strip_prefix("# ")
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }) {
        return Some(strip_html(markdown_heading));
    }
    first_between_case_insensitive(mdx, "<h1", "</h1>").map(|value| {
        let content = value
            .split_once('>')
            .map(|(_, content)| content)
            .unwrap_or(&value);
        strip_html(content)
    })
}

fn list_items_from_first_summary(html: &str) -> Vec<String> {
    let mut items = Vec::new();
    if let Some(table_items) = markdown_summary_table_items(html).filter(|items| !items.is_empty())
    {
        return table_items;
    }
    if let Some(section) = first_summary_section(html) {
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

fn frontmatter_value(mdx: &str, key: &str) -> Option<String> {
    let mut lines = mdx.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let prefix = format!("{key}:");
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(value) = line.strip_prefix(&prefix) {
            return Some(
                value
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
            );
        }
    }
    None
}

fn markdown_summary_table_items(mdx: &str) -> Option<Vec<String>> {
    let mut in_summary = false;
    let mut items = Vec::new();
    for line in mdx.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            in_summary = trimmed.trim_start_matches('#').trim() == "Summary";
            continue;
        }
        if !in_summary {
            continue;
        }
        if trimmed.starts_with("## ") || trimmed.starts_with("# ") {
            break;
        }
        if !trimmed.starts_with('|') || trimmed.contains("---") {
            continue;
        }
        let cells = trimmed
            .trim_matches('|')
            .split('|')
            .map(str::trim)
            .collect::<Vec<_>>();
        if cells.len() >= 2 && !cells[0].eq_ignore_ascii_case("field") {
            items.push(format!("{}: {}", cells[0], strip_html(cells[1])));
        }
    }
    Some(items)
}

fn first_summary_section(html: &str) -> Option<String> {
    if let Some(section) =
        first_between_case_insensitive(html, "<section class=\"summary\"", "</section>")
    {
        return Some(section);
    }
    let mut rest = html;
    while let Some(section) = first_between_case_insensitive(rest, "<section", "</section>") {
        if section_contains_heading(&section, "Summary") {
            return Some(section);
        }
        if let Some((_, next)) = rest.split_once("</section>") {
            rest = next;
        } else {
            break;
        }
    }
    None
}

fn section_contains_heading(section: &str, heading: &str) -> bool {
    (1..=6).any(|level| {
        let start = format!("<h{level}");
        let end = format!("</h{level}>");
        first_between_case_insensitive(section, &start, &end)
            .map(|value| {
                let content = value
                    .split_once('>')
                    .map(|(_, content)| strip_html(content))
                    .unwrap_or_else(|| strip_html(&value));
                content.trim().eq_ignore_ascii_case(heading)
            })
            .unwrap_or(false)
    })
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
        && !path.ends_with("/wiki/plans/zzz_completed/index.mdx")
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

fn render_mdx_page(mdx: &str) -> String {
    let title = first_heading(mdx).unwrap_or_else(|| "Wiki".to_string());
    let body = render_mdx_body(strip_frontmatter(mdx));
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{}</title>
  <link rel="stylesheet" href="/assets/wiki.css">
</head>
<body>
  <main class="wiki-page wiki-mdx">
{}
  </main>
</body>
</html>
"#,
        escape_html_text(&title),
        body
    )
}

fn strip_frontmatter(mdx: &str) -> &str {
    let Some(rest) = mdx.strip_prefix("---") else {
        return mdx;
    };
    let Some(end) = rest.find("\n---") else {
        return mdx;
    };
    &rest[end + "\n---".len()..]
}

fn render_mdx_body(mdx: &str) -> String {
    let mut html = String::new();
    let mut in_list = false;
    let mut in_code = false;
    let mut code = String::new();
    let mdx = expand_escaped_source_context_paragraphs(mdx);
    for line in mdx.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            if in_code {
                html.push_str("<pre><code>");
                html.push_str(&escape_html_text(&code));
                html.push_str("</code></pre>\n");
                code.clear();
                in_code = false;
            } else {
                close_list(&mut html, &mut in_list);
                in_code = true;
            }
            continue;
        }
        if in_code {
            code.push_str(line);
            code.push('\n');
            continue;
        }
        if trimmed.is_empty() {
            close_list(&mut html, &mut in_list);
            continue;
        }
        if trimmed.starts_with('<') {
            close_list(&mut html, &mut in_list);
            html.push_str(line);
            html.push('\n');
            continue;
        }
        if let Some((level, text)) = markdown_heading(trimmed) {
            close_list(&mut html, &mut in_list);
            html.push_str(&format!("<h{level}>{}</h{level}>\n", inline_markdown(text)));
            continue;
        }
        if let Some(item) = trimmed.strip_prefix("- ") {
            if !in_list {
                html.push_str("<ul>\n");
                in_list = true;
            }
            html.push_str("<li>");
            html.push_str(&inline_markdown(item));
            html.push_str("</li>\n");
            continue;
        }
        close_list(&mut html, &mut in_list);
        html.push_str("<p>");
        html.push_str(&inline_markdown(trimmed));
        html.push_str("</p>\n");
    }
    close_list(&mut html, &mut in_list);
    html
}

fn expand_escaped_source_context_paragraphs(mdx: &str) -> String {
    let mut output = String::new();
    for line in mdx.lines() {
        let trimmed = line.trim();
        if let Some(inner) = trimmed
            .strip_prefix("<p>")
            .and_then(|value| value.strip_suffix("</p>"))
            .filter(|value| value.starts_with("## /wiki/"))
        {
            let decoded = decode_common_html_entities(inner);
            let rendered = render_collapsed_source_context(&decoded);
            if !rendered.trim().is_empty() {
                output.push_str(&rendered);
                output.push('\n');
                continue;
            }
        }
        output.push_str(line);
        output.push('\n');
    }
    output
}

fn render_collapsed_source_context(value: &str) -> String {
    normalized_source_segments(value)
        .into_iter()
        .filter_map(|segment| {
            let (path, body) = collapsed_source_path_and_body(&segment)?;
            let body = strip_collapsed_frontmatter(body).trim();
            if body.is_empty() {
                return None;
            }
            Some(format!(
                r#"<article class="source-decision"><h3><a href="{path}">{label}</a></h3>{body}</article>"#,
                path = escape_html_text(path),
                label = escape_html_text(path),
            ))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalized_source_segments(value: &str) -> Vec<String> {
    let normalized = value.replace(" ## /wiki/", "\n## /wiki/");
    normalized
        .lines()
        .filter(|line| line.trim_start().starts_with("## /wiki/"))
        .map(|line| line.trim().to_string())
        .collect()
}

fn collapsed_source_path_and_body(segment: &str) -> Option<(&str, &str)> {
    let rest = segment.strip_prefix("## ")?;
    let split = rest.find(char::is_whitespace)?;
    let (path, body) = rest.split_at(split);
    Some((path, body))
}

fn strip_collapsed_frontmatter(value: &str) -> &str {
    let trimmed = value.trim_start();
    let Some(rest) = trimmed.strip_prefix("--- ") else {
        return trimmed;
    };
    let Some(end) = rest.find(" --- ") else {
        return trimmed;
    };
    &rest[end + " --- ".len()..]
}

fn markdown_heading(line: &str) -> Option<(usize, &str)> {
    let hashes = line.chars().take_while(|ch| *ch == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    line.get(hashes..)
        .and_then(|rest| rest.strip_prefix(' '))
        .map(|text| (hashes, text.trim()))
}

fn close_list(html: &mut String, in_list: &mut bool) {
    if *in_list {
        html.push_str("</ul>\n");
        *in_list = false;
    }
}

fn inline_markdown(value: &str) -> String {
    let escaped = escape_html_text(value);
    let mut output = String::new();
    let mut rest = escaped.as_str();
    while let Some(start) = rest.find('`') {
        output.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end) = after.find('`') {
            output.push_str("<code>");
            output.push_str(&after[..end]);
            output.push_str("</code>");
            rest = &after[end + 1..];
        } else {
            output.push('`');
            output.push_str(after);
            rest = "";
        }
    }
    output.push_str(rest);
    output
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn decode_common_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn title_from_wiki_path(relative_path: &str) -> String {
    let without_extension = relative_path.trim_end_matches(".mdx");
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
            root.join("wiki").join("index.mdx"),
            "<h1>Home</h1><section class=\"summary\"><ul><li>Status: active</li></ul></section>",
        )
        .unwrap();
        fs::write(plan_dir.join("feature-plan.mdx"), "<h1>Feature Plan</h1>").unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].path, "/wiki/index.mdx");
        assert_eq!(pages[0].source_path, "wiki/index.mdx");
        assert_eq!(pages[0].format, "mdx");
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
            plan_dir.join("tauri-rewrite.mdx"),
            "<h1>Tauri Rewrite</h1><dl><div><dt>Status</dt><dd><span>complete</span></dd></div></dl>",
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        assert_eq!(pages[0].path, "/wiki/plans/tauri-rewrite.mdx");
        assert_eq!(pages[0].status.as_deref(), Some("complete"));
        assert_eq!(pages[0].summary[0], "Status: complete");
    }

    #[test]
    fn parses_plain_summary_section_status() {
        let root = temp_root("wiki-plain-summary-status");
        let plan_dir = root.join("wiki").join("plans").join("features");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(
            plan_dir.join("remove-legacy-node-runtime.mdx"),
            "<h1>Remove Legacy Node Runtime</h1><section><h2>Summary</h2><ul><li>Status: complete</li></ul></section>",
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        assert_eq!(
            pages[0].path,
            "/wiki/plans/features/remove-legacy-node-runtime.mdx"
        );
        assert_eq!(pages[0].status.as_deref(), Some("complete"));
        assert_eq!(pages[0].summary[0], "Status: complete");
    }

    #[test]
    fn can_emit_project_scoped_wiki_paths() {
        let root = temp_root("wiki-project");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("source-index.mdx"), "").unwrap();

        let pages = list_wiki_pages(&root, Some("project-1")).pages;
        assert_eq!(pages[0].path, "/projects/project-1/wiki/source-index.mdx");
        assert_eq!(pages[0].title, "Source Index");
    }

    #[test]
    fn reads_exact_wiki_source_with_markdown_derivative() {
        let root = temp_root("wiki-source");
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("sample.mdx"),
            "---\ntitle: \"Sample\"\n---\n\n<PlanHero><h1>Sample</h1></PlanHero>\n<PlanSummary><ul><li>Status: active</li></ul></PlanSummary>\n<CommandBlock>pnpm run check</CommandBlock>",
        )
        .unwrap();

        let source = read_wiki_source(&root, "/wiki/plans/sample.mdx").unwrap();

        assert!(source.source.contains("<PlanHero>"));
        assert!(source.markdown.contains("# Sample"));
        assert!(source.markdown.contains("- Status: active"));
        assert!(!source.markdown.contains("PlanHero"));
    }

    #[test]
    fn mdx_markdown_derivative_applies_visibility_contract() {
        let markdown = mdx_markdown_derivative(
            r#"<h1>Plan</h1>
<Visibility for="humans">
Human-only decoration.
</Visibility>
<Visibility for="agents">
Agent-only instruction.
</Visibility>"#,
        );

        assert!(markdown.contains("# Plan"));
        assert!(markdown.contains("Agent-only instruction."));
        assert!(!markdown.contains("Human-only decoration."));
        assert!(!markdown.contains("Visibility"));
    }

    #[test]
    fn mdx_markdown_derivative_preserves_plan_component_context() {
        let markdown = mdx_markdown_derivative(
            r#"<Step title="Wire renderer">
<ParamField name="path" type="string" required>
<p>Wiki path.</p>
</ParamField>
<ResponseField name="markdown" type="string">
Derivative text.
</ResponseField>
<StatusBadge status="active" />
</Step>"#,
        );

        assert!(markdown.contains("### Wire renderer"));
        assert!(markdown.contains("- `path` (param, string, required)"));
        assert!(markdown.contains("Wiki path."));
        assert!(markdown.contains("- `markdown` (response, string)"));
        assert!(markdown.contains("Derivative text."));
        assert!(markdown.contains("Status: active"));
        assert!(!markdown.contains("ParamField"));
        assert!(!markdown.contains("ResponseField"));
    }

    #[test]
    fn renders_stale_escaped_import_source_bundle_as_html() {
        let root = temp_root("wiki-stale-source-bundle");
        fs::create_dir_all(root.join("wiki").join("plans").join("mvp")).unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("unit-01-confirmed-mvp.mdx"),
            r#"---
title: "Unit 01"
wikiKind: "plan"
---

<h1>Unit 01</h1>
<section>
  <h2>Source Decisions</h2>
  <p>## /wiki/sources/import-state.mdx --- title: &quot;Import Planning State&quot; wikiKind: &quot;source&quot; --- &lt;h1&gt;Import Planning State&lt;/h1&gt; &lt;section&gt;&lt;h2&gt;Summary&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Readiness: continue Q&amp;amp;A&lt;/li&gt;&lt;/ul&gt;&lt;/section&gt; ## /wiki/sources/import-qna.mdx --- title: &quot;Import Q&amp;amp;A&quot; wikiKind: &quot;source&quot; --- &lt;h1&gt;Import Q&amp;amp;A&lt;/h1&gt;</p>
</section>"#,
        )
        .unwrap();

        let html = read_wiki_page(&root, "/wiki/plans/mvp/unit-01-confirmed-mvp.mdx").unwrap();

        assert!(html.contains(r#"<article class="source-decision">"#));
        assert!(html.contains("<h1>Import Planning State</h1>"));
        assert!(html.contains("<h1>Import Q&amp;A</h1>"));
        assert!(!html.contains("&lt;h1&gt;"));
        assert!(!html.contains("wikiKind: &quot;source&quot;"));
    }

    #[test]
    fn rejects_unsafe_wiki_source_paths() {
        let root = temp_root("wiki-source-reject");

        let error = read_wiki_source(&root, "/wiki/../AGENTS.md").unwrap_err();

        assert_eq!(error, "Invalid wiki page path.");
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
