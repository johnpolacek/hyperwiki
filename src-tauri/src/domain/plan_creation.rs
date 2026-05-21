use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "plan-creation",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "project-scoped plan creation clarity gate",
            "plan question batching and answer tracking",
            "repo-visible wiki plan file generation",
            "planning dashboard and project log updates",
        ],
        parity_gate: "plan creation clarity, path refusal, and generated wiki fixture tests",
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanClarifyRequest {
    pub title: String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub plan_type: String,
    #[serde(default)]
    pub answers: Vec<PlanAnswer>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanCreateRequest {
    pub title: String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub plan_type: String,
    #[serde(default)]
    pub answers: Vec<PlanAnswer>,
    #[serde(default)]
    pub allow_deferred_unknowns: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanAnswer {
    pub id: String,
    #[serde(default)]
    pub answer: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanQuestion {
    pub id: String,
    pub label: String,
    pub prompt: String,
    pub impact: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanClarifyResponse {
    pub ready: bool,
    pub score: u8,
    pub slug: String,
    pub path: String,
    pub path_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_slug: Option<String>,
    pub questions: Vec<PlanQuestion>,
    pub answered: Vec<String>,
    pub assumptions: Vec<String>,
    pub unknowns: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanCreateResponse {
    pub plan: PlanClarifyResponse,
    pub path: String,
    pub display_path: String,
    pub wrote: Vec<String>,
}

pub fn clarify_plan(request: PlanClarifyRequest) -> PlanClarifyResponse {
    clarify_plan_for_root(None, request)
}

pub fn clarify_plan_for_root(root: Option<&Path>, request: PlanClarifyRequest) -> PlanClarifyResponse {
    let title = request.title.trim();
    let slug = slugify(if title.is_empty() { "new-plan" } else { title });
    let path = format!("/wiki/plans/features/{slug}.html");
    let path_available = root
        .map(|root| !root.join("wiki").join("plans").join("features").join(format!("{slug}.html")).exists())
        .unwrap_or(true);
    let suggested_slug = if path_available {
        None
    } else {
        root.map(|root| unique_slug(root, &slug))
    };
    let answered = answered_question_ids(&request.answers);
    let mut questions = Vec::new();
    for question in question_bank() {
        if !answered.iter().any(|id| id == &question.id) {
            questions.push(question.clone());
        }
    }
    let blocking_missing = questions
        .iter()
        .filter(|question| question.impact == "blocking")
        .count();
    let important_missing = questions
        .iter()
        .filter(|question| question.impact == "important")
        .count();
    let answered_count = answered.len().min(question_bank().len());
    let score = ((answered_count * 100) / question_bank().len()) as u8;
    let ready = !title.is_empty()
        && !request.intent.trim().is_empty()
        && blocking_missing == 0
        && important_missing == 0;
    let summary = if ready {
        format!("Ready to create a {} plan for {title}.", normalized_plan_type(&request.plan_type))
    } else if title.is_empty() || request.intent.trim().is_empty() {
        "Title and intent are required before Hyperwiki can evaluate plan clarity.".to_string()
    } else {
        format!(
            "Need {blocking_missing} blocking and {important_missing} important answer(s) before writing the plan."
        )
    };
    PlanClarifyResponse {
        ready,
        score,
        slug,
        path,
        path_available,
        suggested_slug,
        questions: questions.into_iter().take(4).collect(),
        answered,
        assumptions: assumptions_from_answers(&request.answers),
        unknowns: unknowns_from_questions(blocking_missing, important_missing),
        summary,
    }
}

pub fn create_plan(
    root: impl AsRef<Path>,
    request: PlanCreateRequest,
) -> Result<PlanCreateResponse, (u16, String)> {
    let root = root.as_ref();
    let clarify = clarify_plan_for_root(Some(root), PlanClarifyRequest {
        title: request.title.clone(),
        intent: request.intent.clone(),
        plan_type: request.plan_type.clone(),
        answers: request.answers.clone(),
    });
    if !clarify.ready && !request.allow_deferred_unknowns {
        return Err((
            409,
            "Plan clarity gate has not passed. Answer the blocking and important questions first."
                .to_string(),
        ));
    }
    let relative = display_path_to_relative(&clarify.path)?;
    let plan_path = root.join(&relative);
    ensure_inside(root, &plan_path)?;
    if plan_path.exists() {
        let suggestion = clarify
            .suggested_slug
            .as_deref()
            .map(|slug| format!(" Try {slug}."))
            .unwrap_or_default();
        return Err((409, format!("Plan already exists at {}.{suggestion}", clarify.path)));
    }
    fs::create_dir_all(
        plan_path
            .parent()
            .ok_or_else(|| (500, "Plan path has no parent directory.".to_string()))?,
    )
    .map_err(|error| (500, error.to_string()))?;
    fs::write(
        &plan_path,
        plan_html(&request, &clarify, request.allow_deferred_unknowns),
    )
    .map_err(|error| (500, error.to_string()))?;
    let mut wrote = vec![slash_path(&relative)];
    if update_plans_index(root, &request, &clarify).map_err(|error| (500, error))? {
        wrote.push("wiki/plans/index.html".to_string());
    }
    if append_log(root, &request, &clarify).map_err(|error| (500, error))? {
        wrote.push("wiki/log.html".to_string());
    }
    Ok(PlanCreateResponse {
        plan: clarify.clone(),
        path: format!("/wiki/{}", slash_path(&relative.strip_prefix("wiki").unwrap_or(&relative))),
        display_path: clarify.path,
        wrote,
    })
}

fn question_bank() -> Vec<PlanQuestion> {
    vec![
        question("outcome", "Outcome", "What concrete user-visible or developer-visible outcome should this plan produce?", "blocking"),
        question("workflow", "Workflow", "What is the expected user workflow from start to finish?", "blocking"),
        question("scope", "Scope", "What is in scope, and what should this plan explicitly not do?", "blocking"),
        question("surface", "Surface", "Which app surfaces, commands, files, APIs, or data models are expected to change?", "important"),
        question("validation", "Validation", "What automated and manual checks should prove the plan is complete?", "important"),
        question("risks", "Risks", "What ambiguity, migration risk, security concern, or compatibility issue should the plan preserve?", "important"),
        question("rollout", "Rollout", "Should the work ship immediately, stay behind review, or require staged follow-up?", "optional"),
        question("sources", "Sources", "Should any pasted brief or external source be captured in wiki/sources before writing the plan?", "optional"),
    ]
}

fn question(id: &str, label: &str, prompt: &str, impact: &str) -> PlanQuestion {
    PlanQuestion {
        id: id.to_string(),
        label: label.to_string(),
        prompt: prompt.to_string(),
        impact: impact.to_string(),
    }
}

fn answered_question_ids(answers: &[PlanAnswer]) -> Vec<String> {
    answers
        .iter()
        .filter(|answer| !answer.answer.trim().is_empty())
        .map(|answer| answer.id.clone())
        .collect()
}

fn assumptions_from_answers(answers: &[PlanAnswer]) -> Vec<String> {
    let mut assumptions = Vec::new();
    for answer in answers {
        let text = answer.answer.trim();
        if text.to_lowercase().contains("assume") {
            assumptions.push(text.to_string());
        }
    }
    assumptions
}

fn unknowns_from_questions(blocking_missing: usize, important_missing: usize) -> Vec<String> {
    let mut unknowns = Vec::new();
    if blocking_missing > 0 {
        unknowns.push(format!("{blocking_missing} blocking question(s) still need answers."));
    }
    if important_missing > 0 {
        unknowns.push(format!("{important_missing} important question(s) still need answers."));
    }
    unknowns
}

fn normalized_plan_type(value: &str) -> &str {
    match value.trim().to_lowercase().as_str() {
        "fix" => "fix",
        "cleanup" => "cleanup",
        "research" => "research",
        _ => "feature",
    }
}

fn plan_html(request: &PlanCreateRequest, clarify: &PlanClarifyResponse, deferred: bool) -> String {
    let title = escape_html(request.title.trim());
    let intent = escape_html(request.intent.trim());
    let plan_type = escape_html(normalized_plan_type(&request.plan_type));
    let answers = request
        .answers
        .iter()
        .filter(|answer| !answer.answer.trim().is_empty())
        .map(|answer| {
            format!(
                "<tr><td>{}</td><td>{}</td></tr>",
                escape_html(&answer.id),
                escape_html(answer.answer.trim())
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let unknowns = if clarify.unknowns.is_empty() || deferred {
        "<li>None blocking; remaining optional unknowns are deferred.</li>".to_string()
    } else {
        clarify
            .unknowns
            .iter()
            .map(|item| format!("<li>{}</li>", escape_html(item)))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} - hyperwiki</title>
  <link rel="stylesheet" href="/assets/wiki.css">
</head>
<body>
  <header class="wiki-header">
    <a href="/wiki/index.html">hyperwiki</a>
    <nav>
      <a href="/wiki/architecture.html">Architecture</a>
      <a href="/wiki/dev.html">Dev</a>
      <a href="/wiki/plans/index.html">Plans</a>
      <a href="/wiki/log.html">Log</a>
      <a href="/wiki/sources.html">Sources</a>
    </nav>
  </header>
  <main class="wiki-page">
    <h1>{title}</h1>
    <section class="summary">
      <h2>Summary</h2>
      <ul>
        <li>Status: active</li>
        <li>Shape: compact {plan_type} plan</li>
        <li>Current unit: Unit 01 - Implement first slice</li>
        <li>Next action: review this generated plan, then execute Unit 01.</li>
        <li>Validation: define and run the checks listed below before closeout.</li>
      </ul>
    </section>
    <section>
      <h2>Intent</h2>
      <p>{intent}</p>
    </section>
    <section>
      <h2>Clarification Evidence</h2>
      <table>
        <thead><tr><th>Question</th><th>Answer</th></tr></thead>
        <tbody>{answers}</tbody>
      </table>
    </section>
    <section>
      <h2>Open Unknowns</h2>
      <ul>{unknowns}</ul>
    </section>
    <section>
      <h2>Execution Units</h2>
      <ol>
        <li>Unit 01 - Implement first slice.</li>
        <li>Unit 02 - Validate behavior and sync wiki state.</li>
      </ol>
    </section>
    <section>
      <h2>Verification</h2>
      <ul>
        <li>Run the project checks that match the affected surfaces.</li>
        <li>Record any deferred verification with the reason it could not run.</li>
      </ul>
    </section>
  </main>
</body>
</html>
"#
    )
}

fn update_plans_index(
    root: &Path,
    request: &PlanCreateRequest,
    clarify: &PlanClarifyResponse,
) -> Result<bool, String> {
    let path = root.join("wiki").join("plans").join("index.html");
    if !path.exists() {
        return Ok(false);
    }
    let html = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let title = escape_html(request.title.trim());
    let active_item = format!(
        r#"<li><a href="{}">{}</a> was created through the project plan Q&amp;A workflow.</li>"#,
        clarify.path, title
    );
    let html = replace_summary_item(&html, "Status:", "Status: active");
    let html = replace_summary_item(
        &html,
        "Current plan:",
        &format!(r#"Current plan: <a href="{}">{}</a>"#, clarify.path, title),
    );
    let html = replace_summary_item(&html, "Current unit:", "Current unit: Unit 01 - Implement first slice");
    let html = replace_summary_item(&html, "Next action:", "Next action: review the generated plan, then execute Unit 01.");
    let html = replace_section_list(&html, "Active Plans", &active_item).unwrap_or(html);
    fs::write(&path, html).map_err(|error| error.to_string())?;
    Ok(true)
}

fn append_log(
    root: &Path,
    request: &PlanCreateRequest,
    clarify: &PlanClarifyResponse,
) -> Result<bool, String> {
    let path = root.join("wiki").join("log.html");
    if !path.exists() {
        return Ok(false);
    }
    let html = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let title = escape_html(request.title.trim());
    let entry = format!(
        r#"<article>
  <h2>2026-05-21 planning | {}</h2>
  <ul>
    <li>Created <a href="{}">{}</a> through the project plan Q&amp;A workflow.</li>
    <li>Clarity score: {}. Remaining unknowns: {}.</li>
  </ul>
</article>
"#,
        escape_html(&clarify.slug),
        clarify.path,
        title,
        clarify.score,
        if clarify.unknowns.is_empty() {
            "none".to_string()
        } else {
            escape_html(&clarify.unknowns.join("; "))
        }
    );
    let marker = "<p>Git owns routine implementation history. This log owns durable project-context history.</p>";
    let next = if html.contains(marker) {
        html.replacen(marker, &format!("{marker}\n{entry}"), 1)
    } else {
        html
    };
    fs::write(&path, next).map_err(|error| error.to_string())?;
    Ok(true)
}

fn replace_summary_item(html: &str, label: &str, value: &str) -> String {
    let Some(index) = html.find(label) else {
        return html.to_string();
    };
    let Some(start) = html[..index].rfind("<li>") else {
        return html.to_string();
    };
    let Some(end_offset) = html[index..].find("</li>") else {
        return html.to_string();
    };
    let end = index + end_offset + "</li>".len();
    format!("{}<li>{}</li>{}", &html[..start], value, &html[end..])
}

fn replace_section_list(html: &str, heading: &str, list_items: &str) -> Option<String> {
    let heading_index = html.find(&format!("<h2>{heading}</h2>"))?;
    let list_start = html[heading_index..].find("<ul>")? + heading_index;
    let list_end = html[list_start..].find("</ul>")? + list_start + "</ul>".len();
    Some(format!(
        "{}<ul>\n    {}\n  </ul>{}",
        &html[..list_start],
        list_items,
        &html[list_end..]
    ))
}

fn display_path_to_relative(path: &str) -> Result<PathBuf, (u16, String)> {
    let relative = path
        .strip_prefix("/wiki/")
        .ok_or_else(|| (400, "Plan path must be under /wiki/.".to_string()))?;
    if relative
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err((400, "Invalid plan path.".to_string()));
    }
    Ok(PathBuf::from("wiki").join(relative))
}

fn ensure_inside(root: &Path, path: &Path) -> Result<(), (u16, String)> {
    let root = root
        .canonicalize()
        .or_else(|_| fs::create_dir_all(root).and_then(|_| root.canonicalize()))
        .map_err(|error| (500, error.to_string()))?;
    let parent = path
        .parent()
        .ok_or_else(|| (400, "Path has no parent.".to_string()))?;
    fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    let parent = parent.canonicalize().map_err(|error| (500, error.to_string()))?;
    if !parent.starts_with(&root) {
        return Err((400, "Refusing to write outside the project root.".to_string()));
    }
    Ok(())
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in value.to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn unique_slug(root: &Path, base: &str) -> String {
    for index in 2..100 {
        let candidate = format!("{base}-{index}");
        if !root
            .join("wiki")
            .join("plans")
            .join("features")
            .join(format!("{candidate}.html"))
            .exists()
        {
            return candidate;
        }
    }
    format!("{base}-next")
}

fn slash_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
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
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn clarification_blocks_until_required_questions_are_answered() {
        let response = clarify_plan(PlanClarifyRequest {
            title: "Import CSV".to_string(),
            intent: "Let users import customer rows.".to_string(),
            plan_type: "feature".to_string(),
            answers: vec![PlanAnswer {
                id: "outcome".to_string(),
                answer: "A visible import workflow.".to_string(),
            }],
        });
        assert!(!response.ready);
        assert!(response.questions.iter().any(|question| question.id == "workflow"));
        assert!(response.path_available);
    }

    #[test]
    fn creates_plan_after_clarity_gate() {
        let root = temp_root("plan-create");
        make_wiki(&root);
        let request = ready_request("Import CSV");
        let response = create_plan(&root, request).expect("plan should create");
        assert_eq!(response.display_path, "/wiki/plans/features/import-csv.html");
        assert!(root
            .join("wiki")
            .join("plans")
            .join("features")
            .join("import-csv.html")
            .exists());
        let index = fs::read_to_string(root.join("wiki").join("plans").join("index.html")).unwrap();
        assert!(index.contains("Current plan: <a href=\"/wiki/plans/features/import-csv.html\">Import CSV</a>"));
    }

    #[test]
    fn refuses_duplicate_plan_path() {
        let root = temp_root("plan-duplicate");
        make_wiki(&root);
        let request = ready_request("Import CSV");
        create_plan(&root, request.clone()).expect("first plan should create");
        let error = create_plan(&root, request).expect_err("duplicate should fail");
        assert_eq!(error.0, 409);
        assert!(error.1.contains("import-csv-2"));
    }

    fn ready_request(title: &str) -> PlanCreateRequest {
        PlanCreateRequest {
            title: title.to_string(),
            intent: "Let users import structured customer rows.".to_string(),
            plan_type: "feature".to_string(),
            allow_deferred_unknowns: false,
            answers: question_bank()
                .into_iter()
                .filter(|question| question.impact != "optional")
                .map(|question| PlanAnswer {
                    id: question.id,
                    answer: "Answered with concrete scope.".to_string(),
                })
                .collect(),
        }
    }

    fn make_wiki(root: &Path) {
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.html"),
            "<h1>Planning Dashboard</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: complete</li><li>Current plan: none</li><li>Current unit: none</li><li>Next action: choose work.</li></ul></section><section><h2>Active Plans</h2><ul><li>None.</li></ul></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("log.html"),
            "<h1>Project Log</h1><p>Git owns routine implementation history. This log owns durable project-context history.</p>",
        )
        .unwrap();
    }

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-tauri-{label}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
