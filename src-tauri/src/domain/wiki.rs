use super::DomainSurface;
use base64::Engine;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

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
    pub frontmatter: BTreeMap<String, String>,
    pub headings: Vec<WikiHeading>,
    pub links: Vec<WikiLink>,
    pub component_refs: Vec<WikiComponentRef>,
    pub validation_warnings: Vec<WikiValidationWarning>,
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
pub struct WikiFingerprint {
    pub fingerprint: String,
    pub file_count: usize,
    pub latest_modified_ms: Option<u128>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiSource {
    pub path: String,
    pub source: String,
    pub markdown: String,
    pub frontmatter: BTreeMap<String, String>,
    pub headings: Vec<WikiHeading>,
    pub links: Vec<WikiLink>,
    pub component_refs: Vec<WikiComponentRef>,
    pub validation_warnings: Vec<WikiValidationWarning>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiHeading {
    pub level: usize,
    pub text: String,
    pub anchor: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiLink {
    pub href: String,
    pub label: String,
    pub line: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_path: Option<String>,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiValidationWarning {
    pub kind: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiComponentRef {
    pub name: String,
    pub line: usize,
    pub attributes: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiDocument {
    pub frontmatter: BTreeMap<String, String>,
    pub nodes: Vec<WikiAstNode>,
    pub headings: Vec<WikiHeading>,
    pub links: Vec<WikiLink>,
    pub component_refs: Vec<WikiComponentRef>,
    pub validation_warnings: Vec<WikiValidationWarning>,
    pub markdown: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WikiAstNode {
    Heading {
        level: usize,
        text: String,
        line: usize,
    },
    Paragraph {
        text: String,
        line: usize,
    },
    ListItem {
        text: String,
        line: usize,
    },
    CodeBlock {
        text: String,
        line: usize,
    },
    Component {
        name: String,
        attributes: BTreeMap<String, String>,
        line: usize,
    },
    Html {
        raw: String,
        line: usize,
    },
    Text {
        text: String,
        line: usize,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiMarkdownExportFile {
    pub path: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiMarkdownZipExport {
    pub filename: String,
    pub mime_type: String,
    pub base64: String,
    pub files: Vec<WikiMarkdownExportFile>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiMarkdownZipDownload {
    pub filename: String,
    pub path: String,
    pub bytes: usize,
    pub files: Vec<WikiMarkdownExportFile>,
    pub revealed: bool,
    pub reveal_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikiSkillExport {
    pub filename: String,
    pub content: String,
}

pub fn list_wiki_pages(root: impl AsRef<Path>, project_id: Option<&str>) -> WikiPageList {
    let wiki_root = root.as_ref().join("wiki");
    if !wiki_root.is_dir() {
        return WikiPageList { pages: Vec::new() };
    }
    let mut files = Vec::new();
    collect_wiki_files(&wiki_root, &mut files);
    let known_paths = known_relative_paths(&wiki_root, &files);
    let mut pages = files
        .into_iter()
        .filter_map(|full_path| {
            wiki_page_from_file(&wiki_root, &full_path, project_id, &known_paths)
        })
        .collect::<Vec<_>>();
    apply_effective_plan_statuses(&mut pages);
    pages.sort_by(|left, right| left.path.cmp(&right.path));
    WikiPageList { pages }
}

pub fn wiki_fingerprint(root: impl AsRef<Path>) -> WikiFingerprint {
    let wiki_root = root.as_ref().join("wiki");
    if !wiki_root.is_dir() {
        return WikiFingerprint {
            fingerprint: "empty".to_string(),
            file_count: 0,
            latest_modified_ms: None,
        };
    }
    let mut files = Vec::new();
    collect_wiki_files(&wiki_root, &mut files);
    let mut entries = files
        .iter()
        .filter_map(|full_path| {
            let relative = full_path.strip_prefix(&wiki_root).ok().map(slash_path)?;
            let metadata = fs::metadata(full_path).ok()?;
            let modified_ms = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis())
                .unwrap_or(0);
            Some((relative, metadata.len(), modified_ms))
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let latest_modified_ms = entries.iter().map(|entry| entry.2).max();
    let fingerprint = stable_wiki_fingerprint(&entries);
    WikiFingerprint {
        fingerprint,
        file_count: entries.len(),
        latest_modified_ms,
    }
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
    let wiki_root = root.as_ref().join("wiki");
    let mut files = Vec::new();
    collect_wiki_files(&wiki_root, &mut files);
    let known_paths = known_relative_paths(&wiki_root, &files);
    let mut pages = files
        .iter()
        .filter_map(|full_path| wiki_page_from_file(&wiki_root, full_path, None, &known_paths))
        .collect::<Vec<_>>();
    apply_effective_plan_statuses(&mut pages);
    let mut document = parse_wiki_document(&source, relative, &known_paths);
    let path = format!("/wiki/{relative}");
    let source_status = canonical_page_status(&document, &source, &path);
    let status = pages
        .iter()
        .find(|page| page.path == path)
        .and_then(|page| page.status.clone())
        .or_else(|| source_status.clone());
    let status_warnings =
        status_validation_warnings(source_status.as_ref(), &document, &list_items_from_first_summary(&source));
    document.validation_warnings.extend(status_warnings);
    Ok(WikiSource {
        path,
        markdown: document.markdown,
        frontmatter: document.frontmatter,
        headings: document.headings,
        links: document.links,
        component_refs: document.component_refs,
        validation_warnings: document.validation_warnings,
        status,
        source,
    })
}

pub fn wiki_page_markdown(
    root: impl AsRef<Path>,
    request_path: &str,
) -> Result<WikiSource, String> {
    read_wiki_source(root, request_path)
}

pub fn wiki_llms_txt(root: impl AsRef<Path>) -> String {
    let pages = list_wiki_pages(&root, None);
    let mut output = String::from("# hyperwiki Project Wiki\n\n");
    output.push_str("Repo-local wiki pages exported as Markdown derivatives for local agents.\n\n");
    output.push_str("## Pages\n");
    for page in &pages.pages {
        output.push_str("- [");
        output.push_str(&page.title);
        output.push_str("](");
        output.push_str(&page.path);
        output.push_str(")\n");
    }
    for page in pages.pages {
        if let Ok(source) = read_wiki_source(&root, &page.path) {
            if source.markdown.trim().is_empty() {
                continue;
            }
            output.push_str("\n---\n\n");
            output.push_str("## ");
            output.push_str(&page.path);
            output.push_str("\n\n");
            output.push_str(&source.markdown);
            output.push('\n');
        }
    }
    output.trim_end().to_string()
}

pub fn wiki_project_skill(root: impl AsRef<Path>) -> WikiSkillExport {
    WikiSkillExport {
        filename: "SKILL.md".to_string(),
        content: generated_project_skill(root),
    }
}

pub fn wiki_markdown_zip_export(root: impl AsRef<Path>) -> WikiMarkdownZipExport {
    let payload = wiki_markdown_zip_payload(root);
    WikiMarkdownZipExport {
        filename: "hyperwiki-markdown-export.zip".to_string(),
        mime_type: "application/zip".to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(payload.zip),
        files: payload.files,
    }
}

pub fn save_wiki_markdown_zip_to_downloads(
    root: impl AsRef<Path>,
    reveal: bool,
) -> Result<WikiMarkdownZipDownload, String> {
    let payload = wiki_markdown_zip_payload(root);
    let filename = format!("hyperwiki-markdown-export-{}.zip", unix_time_ms());
    let downloads_dir = downloads_dir()?;
    fs::create_dir_all(&downloads_dir).map_err(|error| error.to_string())?;
    let path = downloads_dir.join(&filename);
    fs::write(&path, &payload.zip).map_err(|error| error.to_string())?;
    let reveal_error = if reveal {
        reveal_file(&path).err()
    } else {
        None
    };
    Ok(WikiMarkdownZipDownload {
        filename,
        path: path.to_string_lossy().to_string(),
        bytes: payload.zip.len(),
        files: payload.files,
        revealed: reveal && reveal_error.is_none(),
        reveal_error,
    })
}

struct WikiMarkdownZipPayload {
    zip: Vec<u8>,
    files: Vec<WikiMarkdownExportFile>,
}

fn wiki_markdown_zip_payload(root: impl AsRef<Path>) -> WikiMarkdownZipPayload {
    let files = wiki_markdown_export_files(&root);
    let zip_entries = files
        .iter()
        .map(|(path, content)| (path.as_str(), content.as_bytes()))
        .collect::<Vec<_>>();
    let zip = zip_store(&zip_entries);
    let files = files
        .into_iter()
        .map(|(path, content)| WikiMarkdownExportFile {
            path,
            bytes: content.len(),
        })
        .collect();
    WikiMarkdownZipPayload { zip, files }
}

fn wiki_markdown_export_files(root: impl AsRef<Path>) -> Vec<(String, String)> {
    let pages = list_wiki_pages(&root, None);
    let mut files = Vec::new();
    for page in pages.pages {
        let Ok(source) = read_wiki_source(&root, &page.path) else {
            continue;
        };
        if source.markdown.trim().is_empty() {
            continue;
        }
        let path = page.source_path.trim_end_matches(".mdx").to_string() + ".md";
        files.push((path, source.markdown));
    }
    files.push(("llms.txt".to_string(), wiki_llms_txt(&root)));
    files.push(("SKILL.md".to_string(), generated_project_skill(root)));
    files.sort_by(|left, right| left.0.cmp(&right.0));
    files
}

fn generated_project_skill(root: impl AsRef<Path>) -> String {
    let pages = list_wiki_pages(&root, None);
    let mut content = String::from(
        r#"---
name: hyperwiki-project-context
description: Use when working in this repository and you need canonical project wiki context, current plans, source briefs, or local agent handoff guidance.
---

# hyperwiki Project Context

Use this skill to read the local hyperwiki project wiki as canonical repo-visible context.

## Workflow

1. Read `wiki/index.mdx` first for project orientation.
2. Read `wiki/plans/index.mdx` for the current plan, current unit, blockers, and next action.
3. Read `wiki/sources.mdx` and linked source briefs when product, design, technical, or imported-source context matters.
4. Prefer Markdown derivatives from hyperwiki's local APIs over rendered app HTML when you need agent-readable context:
   - `/api/wiki/page-markdown?path=/wiki/path.mdx`
   - `/api/wiki/llms.txt`
   - `/api/wiki/export-markdown-zip`
5. Treat repo files and Git as canonical. Runtime exports are returned to the caller and are not automatically written into the wiki.

## Wiki Pages

"#,
    );
    for page in pages.pages {
        content.push_str("- `");
        content.push_str(&page.source_path);
        content.push_str("` - ");
        content.push_str(&page.title);
        content.push('\n');
    }
    content.trim_end().to_string()
}

fn downloads_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let home = std::env::var_os("USERPROFILE");
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var_os("HOME");
    let Some(home) = home else {
        return Err("Could not resolve the Downloads folder.".to_string());
    };
    Ok(PathBuf::from(home).join("Downloads"))
}

fn reveal_file(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg("-R").arg(path).output();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open")
        .arg(path.parent().unwrap_or_else(|| Path::new(".")))
        .output();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .output();
    result
        .map_err(|error| error.to_string())
        .and_then(|output| {
            output.status.success().then_some(()).ok_or_else(|| {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if stderr.is_empty() {
                    "Could not reveal the saved zip file.".to_string()
                } else {
                    stderr
                }
            })
        })
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn zip_store(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut output = Vec::new();
    let mut central_directory = Vec::new();
    let mut offset = 0u32;
    for (name, bytes) in entries {
        let name_bytes = name.as_bytes();
        let crc = crc32(bytes);
        let size = bytes.len() as u32;
        write_u32(&mut output, 0x0403_4b50);
        write_u16(&mut output, 20);
        write_u16(&mut output, 0);
        write_u16(&mut output, 0);
        write_u16(&mut output, 0);
        write_u16(&mut output, 33);
        write_u32(&mut output, crc);
        write_u32(&mut output, size);
        write_u32(&mut output, size);
        write_u16(&mut output, name_bytes.len() as u16);
        write_u16(&mut output, 0);
        output.extend_from_slice(name_bytes);
        output.extend_from_slice(bytes);

        write_u32(&mut central_directory, 0x0201_4b50);
        write_u16(&mut central_directory, 20);
        write_u16(&mut central_directory, 20);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 33);
        write_u32(&mut central_directory, crc);
        write_u32(&mut central_directory, size);
        write_u32(&mut central_directory, size);
        write_u16(&mut central_directory, name_bytes.len() as u16);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u32(&mut central_directory, 0);
        write_u32(&mut central_directory, offset);
        central_directory.extend_from_slice(name_bytes);
        offset = output.len() as u32;
    }
    let central_directory_offset = output.len() as u32;
    let central_directory_size = central_directory.len() as u32;
    output.extend_from_slice(&central_directory);
    write_u32(&mut output, 0x0605_4b50);
    write_u16(&mut output, 0);
    write_u16(&mut output, 0);
    write_u16(&mut output, entries.len() as u16);
    write_u16(&mut output, entries.len() as u16);
    write_u32(&mut output, central_directory_size);
    write_u32(&mut output, central_directory_offset);
    write_u16(&mut output, 0);
    output
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= *byte as u32;
        for _ in 0..8 {
            let mask = if crc & 1 == 1 { 0xedb8_8320 } else { 0 };
            crc = (crc >> 1) ^ mask;
        }
    }
    !crc
}

fn write_u16(output: &mut Vec<u8>, value: u16) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn write_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_le_bytes());
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
    parse_wiki_document(mdx, "index.mdx", &HashSet::new()).markdown
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
    "CardGroup",
    "Columns",
    "Column",
    "Card",
    "Aside",
    "RequestExample",
    "ResponseExample",
    "Steps",
    "Step",
    "Prompt",
    "Update",
    "TaskList",
    "StatusBadge",
    "Badge",
    "ParamField",
    "ResponseField",
    "TreeFolder",
    "TreeFile",
    "Tree",
    "Tabs",
    "Tab",
    "AccordionGroup",
    "AccordionItem",
    "Accordion",
    "Tooltip",
];

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
        ("Card", "Card"),
        ("Aside", "Aside"),
        ("RequestExample", "Request example"),
        ("ResponseExample", "Response example"),
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
    line.contains(&format!(" {name} "))
        || line.contains(&format!(" {name}>"))
        || line.contains(&format!(" {name}/"))
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

fn collect_wiki_files(directory: &Path, files: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let full_path = entry.path();
        if full_path.is_dir() {
            collect_wiki_files(&full_path, files);
            continue;
        }
        if full_path.extension().and_then(|value| value.to_str()) != Some("mdx") {
            continue;
        }
        files.push(full_path);
    }
}

fn stable_wiki_fingerprint(entries: &[(String, u64, u128)]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for (path, size, modified_ms) in entries {
        for byte in path.as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        for byte in size.to_le_bytes() {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        for byte in modified_ms.to_le_bytes() {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    format!("{:016x}-{}", hash, entries.len())
}

fn known_relative_paths(base_root: &Path, files: &[std::path::PathBuf]) -> HashSet<String> {
    files
        .iter()
        .filter_map(|full_path| full_path.strip_prefix(base_root).ok())
        .map(slash_path)
        .collect()
}

fn wiki_page_from_file(
    base_root: &Path,
    full_path: &Path,
    project_id: Option<&str>,
    known_paths: &HashSet<String>,
) -> Option<WikiPage> {
    let relative_path = slash_path(full_path.strip_prefix(base_root).ok()?);
    let mdx = fs::read_to_string(full_path).unwrap_or_default();
    let mut document = parse_wiki_document(&mdx, &relative_path, known_paths);
    let title = document
        .frontmatter
        .get("title")
        .cloned()
        .or_else(|| {
            document
                .headings
                .first()
                .map(|heading| heading.text.clone())
        })
        .unwrap_or_else(|| title_from_wiki_path(&relative_path));
    let path = project_id
        .map(|id| format!("/projects/{id}/wiki/{relative_path}"))
        .unwrap_or_else(|| format!("/wiki/{relative_path}"));
    let mut summary = list_items_from_first_summary(&mdx);
    let status = canonical_page_status(&document, &mdx, &path);
    if let Some(status) = status.as_ref() {
        ensure_summary_status(&mut summary, status);
    }
    let status_warnings = status_validation_warnings(status.as_ref(), &document, &summary);
    document.validation_warnings.extend(status_warnings);
    Some(WikiPage {
        title,
        summary,
        source_path: format!("wiki/{relative_path}"),
        format: "mdx".to_string(),
        frontmatter: document.frontmatter,
        headings: document.headings,
        links: document.links,
        component_refs: document.component_refs,
        validation_warnings: document.validation_warnings,
        path,
        status,
    })
}

fn apply_effective_plan_statuses(pages: &mut [WikiPage]) {
    let path_statuses = pages
        .iter()
        .map(|page| (page.path.clone(), page.status.clone()))
        .collect::<HashMap<_, _>>();
    let paths = pages.iter().map(|page| page.path.clone()).collect::<Vec<_>>();
    let mut memo = HashMap::new();
    for path in &paths {
        let status = effective_plan_status_for_path(path, &paths, &path_statuses, &mut memo);
        if let Some(page) = pages.iter_mut().find(|page| page.path == *path) {
            page.status = status;
            if let Some(status) = page.status.as_ref() {
                ensure_summary_status(&mut page.summary, status);
            }
        }
    }
}

fn effective_plan_status_for_path(
    path: &str,
    paths: &[String],
    path_statuses: &HashMap<String, Option<String>>,
    memo: &mut HashMap<String, Option<String>>,
) -> Option<String> {
    if let Some(status) = memo.get(path) {
        return status.clone();
    }
    let explicit = path_statuses.get(path).cloned().flatten();
    if matches!(explicit.as_deref(), Some("complete" | "blocked" | "deferred")) {
        memo.insert(path.to_string(), explicit.clone());
        return explicit;
    }
    let children = immediate_plan_child_paths(path, paths);
    if !children.is_empty()
        && children.iter().all(|child_path| {
            effective_plan_status_for_path(child_path, paths, path_statuses, memo).as_deref()
                == Some("complete")
        })
    {
        let status = Some("complete".to_string());
        memo.insert(path.to_string(), status.clone());
        return status;
    }
    memo.insert(path.to_string(), explicit.clone());
    explicit
}

fn immediate_plan_child_paths(path: &str, paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter(|candidate| is_immediate_plan_child_path(path, candidate))
        .cloned()
        .collect()
}

fn is_immediate_plan_child_path(parent: &str, candidate: &str) -> bool {
    let parent = display_wiki_path_for_status(parent);
    let candidate = display_wiki_path_for_status(candidate);
    if parent == candidate {
        return false;
    }
    if parent.ends_with("/wiki/plans/mvp/index.mdx") {
        return candidate.starts_with("/wiki/plans/mvp/stage-")
            && candidate.ends_with(".mdx")
            && !candidate.trim_start_matches("/wiki/plans/mvp/").contains('/');
    }
    let Some((stage_root, stage_number)) = stage_page_parts(&parent) else {
        let base = plan_tree_base_path_for_status(&parent);
        return candidate.starts_with(&format!("{base}/"))
            && !candidate[base.len() + 1..].contains('/');
    };
    let legacy_base = parent.trim_end_matches(".mdx");
    let legacy_child = candidate.starts_with(&format!("{legacy_base}/"))
        && !candidate[legacy_base.len() + 1..].contains('/');
    let unit_base = format!("{stage_root}/units/stage-{stage_number}");
    let documented_child = candidate.starts_with(&format!("{unit_base}/"))
        && !candidate[unit_base.len() + 1..].contains('/');
    legacy_child || documented_child
}

fn stage_page_parts(path: &str) -> Option<(&str, &str)> {
    let marker = "/stage-";
    let marker_index = path.rfind(marker)?;
    if !path.ends_with(".mdx") {
        return None;
    }
    let after_marker = &path[marker_index + marker.len()..];
    let number_len = after_marker
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .map(char::len_utf8)
        .sum::<usize>();
    if number_len == 0 {
        return None;
    }
    Some((&path[..marker_index], &after_marker[..number_len]))
}

fn plan_tree_base_path_for_status(path: &str) -> String {
    path.strip_suffix("/index.mdx")
        .map(str::to_string)
        .unwrap_or_else(|| path.trim_end_matches(".mdx").to_string())
}

fn display_wiki_path_for_status(path: &str) -> String {
    if let Some(wiki_index) = path.find("/wiki/") {
        return path[wiki_index..].to_string();
    }
    path.to_string()
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

fn parse_wiki_document(
    mdx: &str,
    current_relative_path: &str,
    known_paths: &HashSet<String>,
) -> WikiDocument {
    let frontmatter = frontmatter_values(mdx);
    let nodes = parse_wiki_ast_nodes(mdx);
    let headings = headings_from_nodes(&nodes);
    let links = links_from_nodes(&nodes, current_relative_path, known_paths);
    let component_refs = component_refs_from_nodes(&nodes);
    let validation_warnings = validation_warnings_from_links(&links);
    let markdown = markdown_from_nodes(&nodes);
    WikiDocument {
        frontmatter,
        nodes,
        headings,
        links,
        component_refs,
        validation_warnings,
        markdown,
    }
}

fn parse_wiki_ast_nodes(mdx: &str) -> Vec<WikiAstNode> {
    let mut nodes = Vec::new();
    let mut in_code = false;
    let mut code = String::new();
    let mut code_start_line = 0;
    let mut skip_human_visibility = false;
    for (line_number, line) in mdx_body_lines(mdx) {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            if in_code {
                nodes.push(WikiAstNode::CodeBlock {
                    text: code.trim_end().to_string(),
                    line: code_start_line,
                });
                code.clear();
                in_code = false;
            } else {
                in_code = true;
                code_start_line = line_number;
            }
            continue;
        }
        if in_code {
            code.push_str(line);
            code.push('\n');
            continue;
        }
        if trimmed.is_empty() || trimmed.starts_with("import ") || trimmed.starts_with("export ") {
            continue;
        }
        if skip_human_visibility {
            if trimmed.contains("</Visibility>") {
                skip_human_visibility = false;
            }
            continue;
        }
        if let Some(component) = component_node_from_line(trimmed, line_number) {
            let is_human_visibility = match &component {
                WikiAstNode::Component {
                    name, attributes, ..
                } => {
                    name == "Visibility"
                        && attributes
                            .get("for")
                            .or_else(|| attributes.get("audience"))
                            .map(|value| value.eq_ignore_ascii_case("humans"))
                            .unwrap_or(false)
                }
                _ => false,
            };
            nodes.push(component);
            if is_human_visibility {
                if !trimmed.contains("</Visibility>") {
                    skip_human_visibility = true;
                }
                continue;
            }
        }
        let line = strip_visibility_wrappers(line);
        let trimmed = line.trim();
        let recorded_html_links = trimmed.contains("href=");
        if recorded_html_links {
            nodes.push(WikiAstNode::Html {
                raw: trimmed.to_string(),
                line: line_number,
            });
        }
        if let Some(hint) = mdx_component_markdown_hint(trimmed) {
            push_markdown_hint_node(&mut nodes, &hint, line_number);
            if trimmed.ends_with("/>") || trimmed.ends_with('>') {
                continue;
            }
        }
        let stripped = strip_mdx_wrappers(&line);
        let trimmed = stripped.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((level, text)) = markdown_heading(trimmed) {
            nodes.push(WikiAstNode::Heading {
                level,
                text: strip_html(text),
                line: line_number,
            });
            continue;
        }
        if let Some(heading) = html_heading_node(trimmed, line_number) {
            nodes.push(heading);
            for item in html_list_items_to_markdown(trimmed) {
                nodes.push(WikiAstNode::ListItem {
                    text: item,
                    line: line_number,
                });
            }
            continue;
        }
        if let Some(paragraph) = html_paragraph_to_markdown(trimmed) {
            nodes.push(WikiAstNode::Paragraph {
                text: paragraph,
                line: line_number,
            });
            continue;
        }
        for item in html_list_items_to_markdown(trimmed) {
            nodes.push(WikiAstNode::ListItem {
                text: item,
                line: line_number,
            });
        }
        if html_list_item_to_markdown(trimmed).is_some() {
            continue;
        }
        if let Some(item) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
        {
            nodes.push(WikiAstNode::ListItem {
                text: strip_html(item),
                line: line_number,
            });
            continue;
        }
        if trimmed.starts_with('<') && trimmed.ends_with('>') {
            if !recorded_html_links {
                nodes.push(WikiAstNode::Html {
                    raw: trimmed.to_string(),
                    line: line_number,
                });
            }
            continue;
        }
        nodes.push(WikiAstNode::Text {
            text: strip_html(trimmed),
            line: line_number,
        });
    }
    nodes
}

fn component_node_from_line(line: &str, line_number: usize) -> Option<WikiAstNode> {
    let rest = line.strip_prefix('<')?;
    if rest.starts_with('/') || rest.starts_with('!') {
        return None;
    }
    let name_end = rest
        .find(|character: char| character.is_whitespace() || character == '>' || character == '/')
        .unwrap_or(rest.len());
    let name = rest.get(..name_end)?.trim();
    if name.is_empty()
        || name
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_lowercase())
    {
        return None;
    }
    let attributes = mdx_attributes(line);
    Some(WikiAstNode::Component {
        name: name.to_string(),
        attributes,
        line: line_number,
    })
}

fn mdx_attributes(line: &str) -> BTreeMap<String, String> {
    let mut attributes = BTreeMap::new();
    let Some(start) = line.find(char::is_whitespace) else {
        return attributes;
    };
    let raw = line[start..]
        .trim_end_matches('>')
        .trim_end_matches('/')
        .trim();
    for quote in ['"', '\''] {
        let mut rest = raw;
        while let Some(eq_index) = rest.find(&format!("={quote}")) {
            let key = rest[..eq_index]
                .split_whitespace()
                .last()
                .unwrap_or_default()
                .trim_matches('/')
                .to_string();
            let after = &rest[eq_index + 2..];
            let Some(end) = after.find(quote) else {
                break;
            };
            if !key.is_empty() {
                attributes.insert(key, after[..end].to_string());
            }
            rest = &after[end + 1..];
        }
    }
    attributes
}

fn push_markdown_hint_node(nodes: &mut Vec<WikiAstNode>, hint: &str, line: usize) {
    if let Some(text) = hint.strip_prefix("### ") {
        nodes.push(WikiAstNode::Heading {
            level: 3,
            text: text.to_string(),
            line,
        });
        return;
    }
    if let Some(text) = hint.strip_prefix("- ") {
        nodes.push(WikiAstNode::ListItem {
            text: text.to_string(),
            line,
        });
        return;
    }
    nodes.push(WikiAstNode::Paragraph {
        text: hint.to_string(),
        line,
    });
}

fn html_heading_node(line: &str, line_number: usize) -> Option<WikiAstNode> {
    for level in 1..=6 {
        let start = format!("<h{level}");
        let end = format!("</h{level}>");
        if let Some(value) = first_between_case_insensitive(line, &start, &end) {
            let text = value
                .split_once('>')
                .map(|(_, content)| strip_html(content))
                .unwrap_or_else(|| strip_html(&value));
            return Some(WikiAstNode::Heading {
                level,
                text,
                line: line_number,
            });
        }
    }
    None
}

fn headings_from_nodes(nodes: &[WikiAstNode]) -> Vec<WikiHeading> {
    nodes
        .iter()
        .filter_map(|node| match node {
            WikiAstNode::Heading { level, text, line } => Some(WikiHeading {
                level: *level,
                text: text.clone(),
                anchor: heading_anchor(text),
                line: *line,
            }),
            _ => None,
        })
        .collect()
}

fn component_refs_from_nodes(nodes: &[WikiAstNode]) -> Vec<WikiComponentRef> {
    nodes
        .iter()
        .filter_map(|node| match node {
            WikiAstNode::Component {
                name,
                attributes,
                line,
            } => Some(WikiComponentRef {
                name: name.clone(),
                line: *line,
                attributes: attributes.clone(),
            }),
            _ => None,
        })
        .collect()
}

fn links_from_nodes(
    nodes: &[WikiAstNode],
    current_relative_path: &str,
    known_paths: &HashSet<String>,
) -> Vec<WikiLink> {
    let mut links = Vec::new();
    for node in nodes {
        match node {
            WikiAstNode::Heading { text, line, .. }
            | WikiAstNode::Paragraph { text, line }
            | WikiAstNode::ListItem { text, line }
            | WikiAstNode::Text { text, line } => {
                links.extend(markdown_links_from_line(
                    text,
                    *line,
                    current_relative_path,
                    known_paths,
                ));
            }
            WikiAstNode::Html { raw, line } => {
                links.extend(html_links_from_line(
                    raw,
                    *line,
                    current_relative_path,
                    known_paths,
                ));
                links.extend(markdown_links_from_line(
                    raw,
                    *line,
                    current_relative_path,
                    known_paths,
                ));
            }
            WikiAstNode::Component { .. } | WikiAstNode::CodeBlock { .. } => {}
        }
    }
    links
}

fn markdown_from_nodes(nodes: &[WikiAstNode]) -> String {
    let mut output = String::new();
    let mut text = String::new();
    for node in nodes {
        match node {
            WikiAstNode::Heading {
                level, text: value, ..
            } => {
                flush_markdown_text(&mut output, &mut text);
                output.push_str(&"#".repeat(*level));
                output.push(' ');
                output.push_str(value);
                output.push('\n');
            }
            WikiAstNode::Paragraph { text: value, .. } | WikiAstNode::Text { text: value, .. } => {
                if !text.is_empty() {
                    text.push(' ');
                }
                text.push_str(value);
            }
            WikiAstNode::ListItem { text: value, .. } => {
                flush_markdown_text(&mut output, &mut text);
                output.push_str("- ");
                output.push_str(value);
                output.push('\n');
            }
            WikiAstNode::CodeBlock { text: value, .. } => {
                flush_markdown_text(&mut output, &mut text);
                output.push_str("```\n");
                output.push_str(value);
                output.push_str("\n```\n");
            }
            WikiAstNode::Component { .. } | WikiAstNode::Html { .. } => {
                flush_markdown_text(&mut output, &mut text);
            }
        }
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

fn frontmatter_values(mdx: &str) -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();
    let mut lines = mdx.lines();
    if lines.next().map(str::trim) != Some("---") {
        return values;
    }
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        values.insert(
            key.trim().to_string(),
            value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string(),
        );
    }
    values
}

fn markdown_links_from_line(
    line: &str,
    line_number: usize,
    current_relative_path: &str,
    known_paths: &HashSet<String>,
) -> Vec<WikiLink> {
    let mut links = Vec::new();
    let mut rest = line;
    while let Some(label_start) = rest.find('[') {
        let after_label_start = &rest[label_start + 1..];
        let Some(label_end) = after_label_start.find("](") else {
            break;
        };
        let label = &after_label_start[..label_end];
        let after_href_start = &after_label_start[label_end + 2..];
        let Some(href_end) = after_href_start.find(')') else {
            break;
        };
        let href = &after_href_start[..href_end];
        links.push(make_wiki_link(
            href,
            label,
            line_number,
            current_relative_path,
            known_paths,
        ));
        rest = &after_href_start[href_end + 1..];
    }
    links
}

fn html_links_from_line(
    line: &str,
    line_number: usize,
    current_relative_path: &str,
    known_paths: &HashSet<String>,
) -> Vec<WikiLink> {
    let mut links = Vec::new();
    for quote in ['"', '\''] {
        let marker = format!("href={quote}");
        let mut rest = line;
        while let Some(start) = rest.find(&marker) {
            let after = &rest[start + marker.len()..];
            let Some(end) = after.find(quote) else {
                break;
            };
            let href = &after[..end];
            links.push(make_wiki_link(
                href,
                "",
                line_number,
                current_relative_path,
                known_paths,
            ));
            rest = &after[end + 1..];
        }
    }
    links
}

fn make_wiki_link(
    href: &str,
    label: &str,
    line: usize,
    current_relative_path: &str,
    known_paths: &HashSet<String>,
) -> WikiLink {
    let target_path = resolve_wiki_link_target(href, current_relative_path);
    let resolved = target_path
        .as_ref()
        .map(|target| known_paths.contains(target.trim_start_matches("/wiki/")))
        .unwrap_or(true);
    WikiLink {
        href: href.to_string(),
        label: strip_html(label),
        line,
        target_path,
        resolved,
    }
}

fn resolve_wiki_link_target(href: &str, current_relative_path: &str) -> Option<String> {
    let href = href
        .split('#')
        .next()
        .unwrap_or(href)
        .split('?')
        .next()
        .unwrap_or(href);
    if href.is_empty() || href.starts_with('#') {
        return None;
    }
    if href.contains("://") || href.starts_with("mailto:") || href.starts_with("tel:") {
        return None;
    }
    if let Some(relative) = href.strip_prefix("/wiki/") {
        return Some(format!("/wiki/{relative}"));
    }
    if let Some(index) = href.find("/wiki/") {
        return Some(href[index..].to_string());
    }
    if href.starts_with("./") || href.starts_with("../") || href.ends_with(".mdx") {
        let mut parts = current_relative_path.split('/').collect::<Vec<_>>();
        parts.pop();
        for part in href.split('/') {
            if part.is_empty() || part == "." {
                continue;
            }
            if part == ".." {
                if parts.is_empty() {
                    return Some(format!("/wiki/{href}"));
                }
                parts.pop();
                continue;
            }
            parts.push(part);
        }
        return Some(format!("/wiki/{}", parts.join("/")));
    }
    None
}

fn mdx_body_lines(mdx: &str) -> Vec<(usize, &str)> {
    let mut lines = Vec::new();
    let mut in_frontmatter = mdx.lines().next().map(str::trim) == Some("---");
    for (index, line) in mdx.lines().enumerate() {
        let line_number = index + 1;
        if line_number == 1 && in_frontmatter {
            continue;
        }
        if in_frontmatter {
            if line.trim() == "---" {
                in_frontmatter = false;
            }
            continue;
        }
        lines.push((line_number, line));
    }
    lines
}

fn validation_warnings_from_links(links: &[WikiLink]) -> Vec<WikiValidationWarning> {
    links
        .iter()
        .filter(|link| link.target_path.is_some() && !link.resolved)
        .map(|link| WikiValidationWarning {
            kind: "broken-wiki-link".to_string(),
            message: format!("Wiki link target does not exist: {}", link.href),
            href: Some(link.href.clone()),
            line: link.line,
        })
        .collect()
}

fn heading_anchor(value: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;
    for character in value.to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character);
            previous_dash = false;
        } else if !previous_dash {
            output.push('-');
            previous_dash = true;
        }
    }
    output.trim_matches('-').to_string()
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
    if let Some(section) = first_between_case_insensitive(html, "<PlanSummary", "</PlanSummary>") {
        return Some(section);
    }
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

fn canonical_page_status(document: &WikiDocument, mdx: &str, path: &str) -> Option<String> {
    component_status(document, "PlanHero", "status")
        .or_else(|| frontmatter_status(document))
        .or_else(|| summary_page_status(&list_items_from_first_summary(mdx), path))
}

fn component_status(document: &WikiDocument, component_name: &str, attr_name: &str) -> Option<String> {
    document
        .component_refs
        .iter()
        .find(|component| component.name == component_name)
        .and_then(|component| component.attributes.get(attr_name))
        .and_then(|status| normalize_page_status(status))
}

fn frontmatter_status(document: &WikiDocument) -> Option<String> {
    document
        .frontmatter
        .get("status")
        .and_then(|status| normalize_page_status(status))
}

fn summary_page_status(summary: &[String], path: &str) -> Option<String> {
    if path.contains("/wiki/plans/zzz_completed/")
        && !path.ends_with("/wiki/plans/zzz_completed/index.mdx")
    {
        return Some("complete".to_string());
    }
    summary.iter().find_map(|item| {
        let lower = item.to_lowercase();
        let status = lower.strip_prefix("status:")?.trim();
        normalize_page_status(status)
    })
}

fn normalize_page_status(status: &str) -> Option<String> {
    let normalized = status.trim().to_lowercase().replace("completed", "complete");
    [
        "active",
        "active planning",
        "pending",
        "planned",
        "complete",
        "draft",
        "blocked",
        "deferred",
    ]
    .contains(&normalized.as_str())
    .then_some(normalized)
}

fn ensure_summary_status(summary: &mut Vec<String>, status: &str) {
    if summary
        .iter()
        .any(|item| item.to_lowercase().starts_with("status:"))
    {
        return;
    }
    summary.insert(0, format!("Status: {status}"));
}

fn status_validation_warnings(
    canonical_status: Option<&String>,
    document: &WikiDocument,
    summary: &[String],
) -> Vec<WikiValidationWarning> {
    let mut warnings = Vec::new();
    let Some(canonical_status) = canonical_status else {
        return warnings;
    };
    if let Some(frontmatter_status) = frontmatter_status(document) {
        if frontmatter_status != *canonical_status {
            warnings.push(status_conflict_warning(
                "frontmatter",
                &frontmatter_status,
                canonical_status,
                1,
            ));
        }
    }
    if let Some(summary_status) = summary_page_status(summary, "") {
        if summary_status != *canonical_status {
            warnings.push(status_conflict_warning(
                "PlanSummary",
                &summary_status,
                canonical_status,
                1,
            ));
        }
    }
    for component in &document.component_refs {
        if component.name != "StatusBadge" && component.name != "Badge" && component.name != "PlanUnit" {
            continue;
        }
        let Some(value) = component
            .attributes
            .get("status")
            .or_else(|| component.attributes.get("label"))
            .and_then(|status| normalize_page_status(status))
        else {
            continue;
        };
        if value != *canonical_status {
            warnings.push(status_conflict_warning(
                &component.name,
                &value,
                canonical_status,
                component.line,
            ));
        }
    }
    warnings
}

fn status_conflict_warning(
    source: &str,
    value: &str,
    canonical: &str,
    line: usize,
) -> WikiValidationWarning {
    WikiValidationWarning {
        kind: "status-source-conflict".to_string(),
        message: format!(
            "{source} status '{value}' differs from canonical page status '{canonical}'."
        ),
        href: None,
        line,
    }
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
    use std::thread::sleep;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
    fn indexes_frontmatter_headings_links_and_validation_warnings() {
        let root = temp_root("wiki-index-metadata");
        let plan_dir = root.join("wiki").join("plans");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(plan_dir.join("other.mdx"), "<h1>Other</h1>").unwrap();
        fs::write(
            plan_dir.join("feature-plan.mdx"),
            "---\ntitle: \"Feature\"\nwikiKind: \"plan\"\n---\n\n<h1>Feature</h1>\n## Scope\n[Other](./other.mdx)\n<a href=\"/wiki/plans/missing.mdx\">Missing</a>",
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        let page = pages
            .iter()
            .find(|page| page.path == "/wiki/plans/feature-plan.mdx")
            .unwrap();

        assert_eq!(
            page.frontmatter.get("wikiKind").map(String::as_str),
            Some("plan")
        );
        assert_eq!(page.headings.len(), 2);
        assert_eq!(page.headings[1].text, "Scope");
        assert_eq!(page.links.len(), 2);
        assert_eq!(
            page.links[0].target_path.as_deref(),
            Some("/wiki/plans/other.mdx")
        );
        assert!(page.links[0].resolved);
        assert_eq!(page.validation_warnings.len(), 1);
        assert_eq!(page.validation_warnings[0].kind, "broken-wiki-link");
    }

    #[test]
    fn parses_document_pipeline_once_for_metadata_components_and_markdown() {
        let mut known_paths = HashSet::new();
        known_paths.insert("plans/other.mdx".to_string());
        let document = parse_wiki_document(
            r#"---
title: "Pipeline"
wikiKind: "plan"
---

<PlanHero title="Pipeline" status="active">
<h1>Pipeline</h1>
</PlanHero>
<Visibility for="humans">
Human-only text.
</Visibility>
<Visibility for="agents">
Agent-only text.
</Visibility>
<Step title="Wire parser">
<ParamField name="path" type="string" required>
<p>See <a href="./other.mdx">Other</a> and <a href="./missing.mdx">Missing</a>.</p>
</ParamField>
</Step>
<CardGroup>
<Card title="Option A"><p>Use the local pipeline.</p></Card>
<Card title="Option B"><p>Defer runtime changes.</p></Card>
</CardGroup>
<Columns>
<Column>
<Aside title="Operator note"><p>Keep visible prose compact.</p></Aside>
</Column>
<Column>
<RequestExample title="MCP request"><pre>GET /api/wiki/llms.txt</pre></RequestExample>
<ResponseExample title="MCP response"><pre>200 OK</pre></ResponseExample>
</Column>
</Columns>
"#,
            "plans/pipeline.mdx",
            &known_paths,
        );

        assert_eq!(
            document.frontmatter.get("wikiKind").map(String::as_str),
            Some("plan")
        );
        assert!(document
            .component_refs
            .iter()
            .any(|component| component.name == "PlanHero"));
        assert!(document
            .component_refs
            .iter()
            .any(|component| component.name == "ParamField"));
        assert!(document
            .component_refs
            .iter()
            .any(|component| component.name == "CardGroup"));
        assert!(document
            .component_refs
            .iter()
            .any(|component| component.name == "RequestExample"));
        assert!(document.markdown.contains("# Pipeline"));
        assert!(document.markdown.contains("Agent-only text."));
        assert!(document.markdown.contains("### Wire parser"));
        assert!(document
            .markdown
            .contains("- `path` (param, string, required)"));
        assert!(document.markdown.contains("**Card:** Option A"));
        assert!(document.markdown.contains("**Aside:** Operator note"));
        assert!(document
            .markdown
            .contains("**Request example:** MCP request"));
        assert!(document
            .markdown
            .contains("**Response example:** MCP response"));
        assert!(!document.markdown.contains("Human-only text."));
        assert_eq!(document.links.len(), 2);
        assert!(document.links.iter().any(|link| link.resolved));
        assert_eq!(document.validation_warnings.len(), 1);
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
    fn parses_plan_summary_component_status() {
        let root = temp_root("wiki-plan-summary-component-status");
        let plan_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(
            plan_dir.join("unit-01-root-html-shell.mdx"),
            r#"<PlanHero><h1>Unit 01: Root HTML Shell</h1></PlanHero>
<PlanSummary><ul><li>Status: complete</li><li>Next action: implement Unit 02.</li></ul></PlanSummary>"#,
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        assert_eq!(
            pages[0].path,
            "/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-01-root-html-shell.mdx"
        );
        assert_eq!(pages[0].status.as_deref(), Some("complete"));
        assert_eq!(pages[0].summary[0], "Status: complete");
    }

    #[test]
    fn uses_plan_hero_status_as_canonical_page_status() {
        let root = temp_root("wiki-plan-hero-status");
        let plan_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(
            plan_dir.join("unit-03-local-persistence.mdx"),
            r#"<PlanHero status="completed"><h1>Unit 03 - Local Persistence</h1></PlanHero>
<Card title="Build"><p>Persistence behavior.</p></Card>"#,
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;

        assert_eq!(
            pages[0].path,
            "/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-03-local-persistence.mdx"
        );
        assert_eq!(pages[0].status.as_deref(), Some("complete"));
        assert_eq!(pages[0].summary[0], "Status: complete");
    }

    #[test]
    fn warns_when_plan_status_sources_conflict() {
        let root = temp_root("wiki-plan-status-conflict");
        let plan_dir = root.join("wiki").join("plans");
        fs::create_dir_all(&plan_dir).unwrap();
        fs::write(
            plan_dir.join("conflict.mdx"),
            r#"<PlanHero status="complete"><h1>Conflict</h1></PlanHero>
<PlanSummary><ul><li>Status: active</li></ul></PlanSummary>"#,
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;

        assert_eq!(pages[0].status.as_deref(), Some("complete"));
        assert!(pages[0]
            .validation_warnings
            .iter()
            .any(|warning| warning.kind == "status-source-conflict"));
    }

    #[test]
    fn derives_parent_plan_status_when_all_children_are_complete() {
        let root = temp_root("wiki-derived-parent-status");
        let stage_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&stage_dir).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            r#"<PlanHero status="active"><h1>MVP Plan</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation.mdx"),
            r#"<PlanHero status="planned"><h1>Stage 01</h1></PlanHero>"#,
        )
        .unwrap();
        for unit in 1..=3 {
            fs::write(
                stage_dir.join(format!("unit-{unit:02}-done.mdx")),
                format!(r#"<PlanHero status="complete"><h1>Unit {unit:02}</h1></PlanHero>"#),
            )
            .unwrap();
        }

        let pages = list_wiki_pages(&root, None).pages;
        let status = |path: &str| {
            pages
                .iter()
                .find(|page| page.path == path)
                .and_then(|page| page.status.as_deref())
        };

        assert_eq!(status("/wiki/plans/mvp/index.mdx"), Some("complete"));
        assert_eq!(
            status("/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx"),
            Some("complete")
        );
    }

    #[test]
    fn derives_project_scoped_mvp_plan_status_when_only_stage_is_complete() {
        let root = temp_root("wiki-derived-project-scoped-parent-status");
        let stage_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&stage_dir).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            r#"<PlanHero status="active"><h1>MVP Plan</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation.mdx"),
            r#"<PlanHero status="planned"><h1>Stage 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            stage_dir.join("unit-01-done.mdx"),
            r#"<PlanHero status="complete"><h1>Unit 01</h1></PlanHero>"#,
        )
        .unwrap();

        let pages = list_wiki_pages(&root, Some("project-1")).pages;
        let status = |path: &str| {
            pages
                .iter()
                .find(|page| page.path == path)
                .and_then(|page| page.status.as_deref())
        };

        assert_eq!(
            status("/projects/project-1/wiki/plans/mvp/index.mdx"),
            Some("complete")
        );
        assert_eq!(
            status("/projects/project-1/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx"),
            Some("complete")
        );
    }

    #[test]
    fn keeps_parent_plan_incomplete_when_any_child_is_incomplete() {
        let root = temp_root("wiki-derived-parent-incomplete");
        let stage_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&stage_dir).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            r#"<PlanHero status="active"><h1>MVP Plan</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation.mdx"),
            r#"<PlanHero status="planned"><h1>Stage 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            stage_dir.join("unit-01-done.mdx"),
            r#"<PlanHero status="complete"><h1>Unit 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            stage_dir.join("unit-02-planned.mdx"),
            r#"<PlanHero status="planned"><h1>Unit 02</h1></PlanHero>"#,
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        let status = |path: &str| {
            pages
                .iter()
                .find(|page| page.path == path)
                .and_then(|page| page.status.as_deref())
        };

        assert_eq!(status("/wiki/plans/mvp/index.mdx"), Some("active"));
        assert_eq!(
            status("/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx"),
            Some("planned")
        );
    }

    #[test]
    fn preserves_blocked_or_deferred_parent_status() {
        let root = temp_root("wiki-derived-parent-blocked");
        let stage_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&stage_dir).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            r#"<PlanHero status="deferred"><h1>MVP Plan</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation.mdx"),
            r#"<PlanHero status="blocked"><h1>Stage 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            stage_dir.join("unit-01-done.mdx"),
            r#"<PlanHero status="complete"><h1>Unit 01</h1></PlanHero>"#,
        )
        .unwrap();

        let pages = list_wiki_pages(&root, None).pages;
        let status = |path: &str| {
            pages
                .iter()
                .find(|page| page.path == path)
                .and_then(|page| page.status.as_deref())
        };

        assert_eq!(status("/wiki/plans/mvp/index.mdx"), Some("deferred"));
        assert_eq!(
            status("/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx"),
            Some("blocked")
        );
    }

    #[test]
    fn read_wiki_source_uses_derived_parent_status() {
        let root = temp_root("wiki-source-derived-parent-status");
        let stage_dir = root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("stage-01-static-mvp-foundation");
        fs::create_dir_all(&stage_dir).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            r#"<PlanHero status="active"><h1>MVP Plan</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation.mdx"),
            r#"<PlanHero status="planned"><h1>Stage 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            stage_dir.join("unit-01-done.mdx"),
            r#"<PlanHero status="complete"><h1>Unit 01</h1></PlanHero>"#,
        )
        .unwrap();

        let source = read_wiki_source(
            &root,
            "/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx",
        )
        .unwrap();

        assert_eq!(source.status.as_deref(), Some("complete"));
        assert!(!source
            .validation_warnings
            .iter()
            .any(|warning| warning.kind == "status-source-conflict"));
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
    fn wiki_fingerprint_changes_when_mdx_files_change() {
        let root = temp_root("wiki-fingerprint-change");
        let wiki = root.join("wiki").join("plans");
        fs::create_dir_all(&wiki).unwrap();
        let page = wiki.join("feature.mdx");
        fs::write(&page, "<h1>Feature</h1>").unwrap();

        let initial = wiki_fingerprint(&root);
        sleep(Duration::from_millis(2));
        fs::write(&page, "<h1>Feature Updated</h1>").unwrap();
        let updated = wiki_fingerprint(&root);
        fs::write(wiki.join("unit-01-test.mdx"), "<h1>Unit 01</h1>").unwrap();
        let added = wiki_fingerprint(&root);
        fs::remove_file(page).unwrap();
        let removed = wiki_fingerprint(&root);

        assert_ne!(initial.fingerprint, updated.fingerprint);
        assert_ne!(updated.fingerprint, added.fingerprint);
        assert_ne!(added.fingerprint, removed.fingerprint);
        assert_eq!(initial.file_count, 1);
        assert_eq!(added.file_count, 2);
        assert_eq!(removed.file_count, 1);
    }

    #[test]
    fn wiki_fingerprint_ignores_non_mdx_files() {
        let root = temp_root("wiki-fingerprint-ignore");
        let wiki = root.join("wiki");
        fs::create_dir_all(&wiki).unwrap();
        fs::write(wiki.join("index.mdx"), "<h1>Home</h1>").unwrap();
        let initial = wiki_fingerprint(&root);
        fs::write(wiki.join("notes.txt"), "not a page").unwrap();
        let ignored = wiki_fingerprint(&root);

        assert_eq!(initial.fingerprint, ignored.fingerprint);
        assert_eq!(ignored.file_count, 1);
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
        assert_eq!(source.status.as_deref(), Some("active"));
        assert!(source.markdown.contains("# Sample"));
        assert!(source.markdown.contains("- Status: active"));
        assert!(source
            .component_refs
            .iter()
            .any(|component| component.name == "PlanHero"));
        assert!(!source.markdown.contains("PlanHero"));
    }

    #[test]
    fn exports_llms_txt_from_markdown_derivatives() {
        let root = temp_root("wiki-llms");
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("sample.mdx"),
            "<h1>Sample</h1>\n<p>Agent-readable page.</p>",
        )
        .unwrap();

        let export = wiki_llms_txt(&root);

        assert!(export.contains("# hyperwiki Project Wiki"));
        assert!(export.contains("- [Sample](/wiki/plans/sample.mdx)"));
        assert!(export.contains("## /wiki/plans/sample.mdx"));
        assert!(export.contains("Agent-readable page."));
    }

    #[test]
    fn exports_generated_project_skill() {
        let root = temp_root("wiki-skill");
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();

        let skill = wiki_project_skill(&root);

        assert_eq!(skill.filename, "SKILL.md");
        assert!(skill.content.contains("name: hyperwiki-project-context"));
        assert!(skill.content.contains("wiki/index.mdx"));
        assert!(skill.content.contains("/api/wiki/export-markdown-zip"));
        assert!(skill.content.contains("`wiki/index.mdx` - Home"));
    }

    #[test]
    fn exports_markdown_zip_with_wiki_markdown_llms_and_skill() {
        let root = temp_root("wiki-zip");
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();

        let export = wiki_markdown_zip_export(&root);
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(export.base64.as_bytes())
            .unwrap();

        assert_eq!(export.mime_type, "application/zip");
        assert!(bytes.starts_with(b"PK\x03\x04"));
        assert!(export.files.iter().any(|file| file.path == "wiki/index.md"));
        assert!(export.files.iter().any(|file| file.path == "llms.txt"));
        assert!(export.files.iter().any(|file| file.path == "SKILL.md"));
        assert!(String::from_utf8_lossy(&bytes).contains("wiki/index.md"));
        assert!(String::from_utf8_lossy(&bytes).contains("SKILL.md"));
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
