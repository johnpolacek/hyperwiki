use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "import-planning",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "post-import source-aware planning questions",
            "import planning answer persistence",
            "source-grounded imported project stage and unit generation",
        ],
        parity_gate: "RouteChat-style import Q&A and generated unit verification tests",
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningRequest {
    #[serde(default)]
    pub plan_title: String,
    #[serde(default)]
    pub answers: Vec<ImportPlanningAnswer>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningProgressRequest {
    #[serde(default)]
    pub question: Option<ImportPlanningQuestion>,
    #[serde(default)]
    pub answer: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningAnswer {
    pub id: String,
    #[serde(default)]
    pub answer: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningQuestion {
    pub id: String,
    pub label: String,
    pub prompt: String,
    pub impact: String,
    pub rationale: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningStatus {
    pub status: String,
    pub answered_count: usize,
    pub current_question: Option<ImportPlanningQuestion>,
    pub next_action: String,
    pub qna_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningResponse {
    pub ready: bool,
    pub score: u8,
    pub source_summary: String,
    pub recommended_plan_title: String,
    pub questions: Vec<ImportPlanningQuestion>,
    pub answered: Vec<String>,
    pub unknowns: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningCreateResponse {
    pub planning: ImportPlanningResponse,
    pub display_path: String,
    pub wrote: Vec<String>,
}

pub fn import_planning_status(root: impl AsRef<Path>) -> ImportPlanningStatus {
    let root = root.as_ref();
    let imported = root.join("wiki").join("sources").join("import.mdx").exists();
    if !imported {
        return ImportPlanningStatus {
            status: "notImported".to_string(),
            answered_count: 0,
            current_question: None,
            next_action: "Create or import a project brief.".to_string(),
            qna_path: None,
        };
    }
    if has_generated_plan_pages(root) {
        return ImportPlanningStatus {
            status: "complete".to_string(),
            answered_count: read_progress_answers(root).len(),
            current_question: None,
            next_action: "Continue from the generated implementation plan.".to_string(),
            qna_path: Some("wiki/sources/import-qna.mdx".to_string()),
        };
    }
    ImportPlanningStatus {
        status: "incomplete".to_string(),
        answered_count: read_progress_answers(root).len(),
        current_question: None,
        next_action: "Resume import planning Q&A before creating implementation stages.".to_string(),
        qna_path: Some("wiki/sources/import-qna.mdx".to_string()),
    }
}

pub fn record_import_planning_answer(
    root: impl AsRef<Path>,
    request: ImportPlanningProgressRequest,
) -> Result<ImportPlanningStatus, (u16, String)> {
    let root = root.as_ref();
    let question = request.question.ok_or_else(|| {
        (
            400,
            "Import planning progress requires the question being answered.".to_string(),
        )
    })?;
    let answer = request.answer.trim();
    if answer.is_empty() {
        return Err((400, "Import planning answer is required.".to_string()));
    }
    let path = root.join("wiki").join("sources").join("import-qna.mdx");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    }
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let mut entries = read_progress_answers(root);
    if let Some(existing_answer) = entries.iter_mut().find(|item| item.id == question.id) {
        existing_answer.answer = answer.to_string();
    } else {
        entries.push(ImportPlanningAnswer {
            id: question.id.clone(),
            answer: answer.to_string(),
        });
    }
    let content = import_qna_page(&existing, &question, answer, &entries);
    fs::write(&path, content).map_err(|error| (500, error.to_string()))?;
    Ok(import_planning_status(root))
}

pub fn clarify_import_plan(
    _root: impl AsRef<Path>,
    request: ImportPlanningRequest,
) -> ImportPlanningResponse {
    let answered = request
        .answers
        .iter()
        .filter(|answer| !answer.answer.trim().is_empty())
        .map(|answer| answer.id.clone())
        .collect::<Vec<_>>();
    let title = if request.plan_title.trim().is_empty() {
        "Imported Project Plan".to_string()
    } else {
        request.plan_title.trim().to_string()
    };
    ImportPlanningResponse {
        ready: false,
        score: 0,
        source_summary: "Raw imported source is reviewed by the visible agent interview.".to_string(),
        recommended_plan_title: title,
        questions: Vec::new(),
        answered,
        unknowns: Vec::new(),
        summary: "Import planning questions are produced by the visible agent after it reads the raw source.".to_string(),
    }
}

pub fn create_import_plan(
    _root: impl AsRef<Path>,
    _request: ImportPlanningRequest,
) -> Result<ImportPlanningCreateResponse, (u16, String)> {
    Err((
        409,
        "Imported project plans are created by the visible agent after it reads the raw source."
            .to_string(),
    ))
}

fn has_generated_plan_pages(root: &Path) -> bool {
    let plans = root.join("wiki").join("plans");
    has_generated_plan_page(&plans, &plans)
}

fn has_generated_plan_page(base: &Path, path: &Path) -> bool {
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if has_generated_plan_page(base, &path) {
                return true;
            }
            continue;
        }
        let Ok(relative) = path.strip_prefix(base) else {
            continue;
        };
        if relative == Path::new("index.mdx") {
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) == Some("mdx") {
            return true;
        }
    }
    false
}

fn read_progress_answers(root: &Path) -> Vec<ImportPlanningAnswer> {
    let path = root.join("wiki").join("sources").join("import-qna.mdx");
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter_map(|line| line.strip_prefix("<!-- hyperwiki-import-answer "))
        .filter_map(|line| line.strip_suffix(" -->"))
        .filter_map(|json| serde_json::from_str::<ImportPlanningAnswer>(json).ok())
        .filter(|answer| !answer.answer.trim().is_empty())
        .collect()
}

fn import_qna_page(
    existing: &str,
    question: &ImportPlanningQuestion,
    answer: &str,
    entries: &[ImportPlanningAnswer],
) -> String {
    let body_start = existing
        .find("<section")
        .map(|index| existing[index..].to_string())
        .unwrap_or_default();
    let mut content = String::from(
        "---\ntitle: \"Import Q&A\"\ndescription: \"Durable imported project planning answers.\"\nwikiKind: \"source\"\n---\n\n<h1>Import Q&amp;A</h1>\n",
    );
    if body_start.is_empty() {
        content.push_str("<section><h2>Answers</h2>\n");
    } else {
        content.push_str(&strip_import_answer_comments(&body_start));
        if !content.ends_with('\n') {
            content.push('\n');
        }
    }
    content.push_str(&format!(
        "<article><h3>{}</h3><p><strong>Question:</strong> {}</p><p><strong>Answer:</strong> {}</p></article>\n",
        escape_html(&question.label),
        escape_html(&question.prompt),
        escape_html(answer)
    ));
    for entry in entries {
        if let Ok(json) = serde_json::to_string(entry) {
            content.push_str(&format!("<!-- hyperwiki-import-answer {} -->\n", json));
        }
    }
    content
}

fn strip_import_answer_comments(content: &str) -> String {
    content
        .lines()
        .filter(|line| !line.trim_start().starts_with("<!-- hyperwiki-import-answer "))
        .collect::<Vec<_>>()
        .join("\n")
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "hyperwiki-import-planning-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn make_imported_project(root: &Path) {
        fs::create_dir_all(root.join("wiki").join("sources")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("sources").join("import.mdx"),
            "<h1>Source Import</h1><p>RouteChat imported source.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("sources").join("prd.mdx"),
            "<h1>Product Brief</h1><section><h2>Summary</h2><ul><li>RouteChat creates tours.</li></ul></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "<h1>Plans</h1>",
        )
        .unwrap();
    }

    #[test]
    fn import_status_reports_incomplete_until_generated_plan_exists() {
        let root = temp_root("status");
        make_imported_project(&root);

        let status = import_planning_status(&root);
        assert_eq!(status.status, "incomplete");
        assert_eq!(status.answered_count, 0);
        assert!(status.current_question.is_none());

        fs::create_dir_all(root.join("wiki").join("plans").join("mvp")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            "<h1>MVP Plan</h1>",
        )
        .unwrap();

        let status = import_planning_status(&root);
        assert_eq!(status.status, "complete");
    }

    #[test]
    fn import_answer_progress_is_repo_visible_and_reloadable() {
        let root = temp_root("answers");
        make_imported_project(&root);
        let question = ImportPlanningQuestion {
            id: "agent-question".to_string(),
            label: "Agent Question".to_string(),
            prompt: "Which source-specific slice should come first?".to_string(),
            impact: "blocking".to_string(),
            rationale: "Asked by the visible import-planning agent.".to_string(),
        };

        let status = record_import_planning_answer(
            &root,
            ImportPlanningProgressRequest {
                question: Some(question),
                answer: "Walking tours first.".to_string(),
            },
        )
        .unwrap();

        assert_eq!(status.status, "incomplete");
        assert_eq!(status.answered_count, 1);
        let qna = fs::read_to_string(root.join("wiki").join("sources").join("import-qna.mdx"))
            .unwrap();
        assert!(qna.contains("Walking tours first."));
        assert!(qna.contains("hyperwiki-import-answer"));
        assert_eq!(read_progress_answers(&root).len(), 1);
    }
}
