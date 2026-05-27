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
    let answers = read_progress_answers(root);
    let planning = clarify_import_plan(
        root,
        ImportPlanningRequest {
            plan_title: String::new(),
            answers,
        },
    );
    ImportPlanningStatus {
        status: "incomplete".to_string(),
        answered_count: planning.answered.len(),
        current_question: planning.questions.first().cloned(),
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
    root: impl AsRef<Path>,
    request: ImportPlanningRequest,
) -> ImportPlanningResponse {
    let root = root.as_ref();
    let source = ImportedSource::read(root);
    let sequence = import_question_sequence(&source);
    let answered = request
        .answers
        .iter()
        .filter(|answer| !answer.answer.trim().is_empty())
        .map(|answer| answer.id.clone())
        .collect::<Vec<_>>();
    let missing = sequence
        .iter()
        .filter(|question| {
            question.impact != "optional" && !answered.iter().any(|id| id == &question.id)
        })
        .cloned()
        .collect::<Vec<_>>();
    let required_count = sequence
        .iter()
        .filter(|question| question.impact != "optional")
        .count();
    let score =
        (((required_count.saturating_sub(missing.len())) * 100) / required_count.max(1)) as u8;
    let ready = missing.is_empty();
    let questions = missing.into_iter().take(1).collect::<Vec<_>>();
    let title = if request.plan_title.trim().is_empty() {
        "Imported Project Plan".to_string()
    } else {
        request.plan_title.trim().to_string()
    };
    ImportPlanningResponse {
        ready,
        score,
        source_summary: source.summary.clone(),
        recommended_plan_title: title,
        questions,
        answered,
        unknowns: unknowns_from_answers(&sequence, &request.answers),
        summary: if ready {
            "Ready to create a source-grounded implementation plan.".to_string()
        } else {
            "More planning answers are needed before Hyperwiki can write detailed stages and units."
                .to_string()
        },
    }
}

pub fn create_import_plan(
    root: impl AsRef<Path>,
    request: ImportPlanningRequest,
) -> Result<ImportPlanningCreateResponse, (u16, String)> {
    let root = root.as_ref();
    let request = ImportPlanningRequest {
        answers: merge_import_planning_answers(read_progress_answers(root), request.answers),
        ..request
    };
    let planning = clarify_import_plan(root, request.clone());
    if !planning.ready {
        return Err((
            409,
            "Import planning questions are not complete. Answer the required questions first."
                .to_string(),
        ));
    }
    let answers = AnswerSet::new(&request.answers);
    let title = if request.plan_title.trim().is_empty() {
        "Imported Project Plan"
    } else {
        request.plan_title.trim()
    };
    let mut wrote = Vec::new();
    write_file(
        root,
        "wiki/plans/imported-project-plan/index.mdx",
        &imported_plan_index_html(title),
        &mut wrote,
    )?;
    write_file(
        root,
        "wiki/plans/imported-project-plan/stage-01-prototype-foundation.mdx",
        &stage_html(
            "Stage 01 - Prototype Foundation",
            "Build the smallest end-to-end prototype path that proves the imported product idea can work.",
            &[
                (
                    "/wiki/plans/imported-project-plan/stage-01-prototype-foundation/unit-01-product-and-scope-lock.mdx",
                    "Unit 01 - Product And Scope Lock",
                ),
                (
                    "/wiki/plans/imported-project-plan/stage-01-prototype-foundation/unit-02-technical-foundation.mdx",
                    "Unit 02 - Technical Foundation",
                ),
                (
                    "/wiki/plans/imported-project-plan/stage-01-prototype-foundation/unit-03-core-demo-loop.mdx",
                    "Unit 03 - Core Demo Loop",
                ),
            ],
        ),
        &mut wrote,
    )?;
    write_file(
        root,
        "wiki/plans/imported-project-plan/stage-02-validation-and-hardening.mdx",
        &stage_html(
            "Stage 02 - Validation And Hardening",
            "Turn the first demo into an evaluable implementation with safety, UX, and verification evidence.",
            &[
                (
                    "/wiki/plans/imported-project-plan/stage-02-validation-and-hardening/unit-01-safety-and-privacy-model.mdx",
                    "Unit 01 - Safety And Privacy Model",
                ),
                (
                    "/wiki/plans/imported-project-plan/stage-02-validation-and-hardening/unit-02-demo-validation.mdx",
                    "Unit 02 - Demo Validation",
                ),
            ],
        ),
        &mut wrote,
    )?;
    let units = [
        (
            "wiki/plans/imported-project-plan/stage-01-prototype-foundation/unit-01-product-and-scope-lock.mdx",
            "Unit 01 - Product And Scope Lock",
            format!(
                "Confirm the first mode ({}) and explicit non-goals before product code starts.",
                answers.get("first-mode")
            ),
            format!(
                "Document target user, first scenario, deferred capabilities, and demo success criteria from the imported source and Q&A. Non-goals: {}",
                answers.get("non-goals")
            ),
            "Manual: review PRD, design brief, and this unit against the imported source; confirm the dashboard points to Unit 02 only after scope is locked.".to_string(),
            "Complete when the first scenario, non-goals, and success criteria are recorded without contradicting source evidence.".to_string(),
        ),
        (
            "wiki/plans/imported-project-plan/stage-01-prototype-foundation/unit-02-technical-foundation.mdx",
            "Unit 02 - Technical Foundation",
            format!(
                "Create the runnable foundation for {} with frontend {}, backend/runtime {}, storage {}, auth {}, services {}, {} location data, and {} as the model/provider direction.",
                answers.get("platform"),
                answers.get("frontend-stack"),
                answers.get("backend-runtime"),
                answers.get("data-storage"),
                answers.get("auth-users"),
                answers.get("services-integrations"),
                answers.get("location-source"),
                answers.get("provider")
            ),
            format!(
                "Add the minimum app/runtime scaffold, configuration notes, environment variable placeholders, and local preview path needed for the first demo loop. Use these local command assumptions: {}. Do not implement saved tours or broad mode support in this unit.",
                answers.get("dev-commands")
            ),
            format!(
                "Automated: run the selected local checks: {}. Manual: launch the local preview/deployment target from those commands and confirm the foundation screen loads.",
                answers.get("dev-commands")
            ),
            "Complete when a future agent can run the app locally, understand the frontend/backend/storage/auth/service boundaries, and see the first-mode foundation without guessing setup steps.".to_string(),
        ),
        (
            "wiki/plans/imported-project-plan/stage-01-prototype-foundation/unit-03-core-demo-loop.mdx",
            "Unit 03 - Core Demo Loop",
            format!(
                "Implement the first end-to-end demo loop with {} output.",
                answers.get("narration-output")
            ),
            "Use the chosen location source, generate route-aware narration, expose the core user controls needed for the demo, and preserve source/context metadata when feasible.".to_string(),
            "Automated: run unit or integration checks for narration input/output shaping. Manual: complete the first demo scenario and verify the narration changes with location/mode context.".to_string(),
            "Complete when the first demo proves the imported product promise in one focused scenario.".to_string(),
        ),
        (
            "wiki/plans/imported-project-plan/stage-02-validation-and-hardening/unit-01-safety-and-privacy-model.mdx",
            "Unit 01 - Safety And Privacy Model",
            format!(
                "Harden the first demo around safety/privacy requirements: {}",
                answers.get("safety-privacy")
            ),
            "Add user-facing boundaries, provider/source attribution expectations, and mode-specific safeguards before expanding prototype breadth.".to_string(),
            "Manual: review driving/transit or movement-sensitive states against the safety model; verify unsafe interactions are deferred or guarded.".to_string(),
            "Complete when the first implementation can be demoed without hiding safety, privacy, or attribution constraints.".to_string(),
        ),
        (
            "wiki/plans/imported-project-plan/stage-02-validation-and-hardening/unit-02-demo-validation.mdx",
            "Unit 02 - Demo Validation",
            format!("Validate the prototype against: {}", answers.get("success-criteria")),
            "Run the demo acceptance pass, capture findings, update source briefs, and decide whether to continue, narrow, or expand the implementation.".to_string(),
            "Automated: rerun all project checks. Manual: perform the demo acceptance checklist and record pass/fail evidence in the unit and log.".to_string(),
            "Complete when validation evidence supports the next product decision or names the blocker clearly.".to_string(),
        ),
    ];
    for (path, unit_title, goal, scope, verification, gate) in units {
        write_file(
            root,
            path,
            &unit_html(unit_title, &goal, &scope, &verification, &gate),
            &mut wrote,
        )?;
    }
    write_file(
        root,
        "wiki/plans/index.mdx",
        &plans_index_html(title),
        &mut wrote,
    )?;
    append_log(root, title, &mut wrote)?;
    Ok(ImportPlanningCreateResponse {
        planning,
        display_path: "/wiki/plans/imported-project-plan/index.mdx".to_string(),
        wrote,
    })
}

fn merge_import_planning_answers(
    mut saved: Vec<ImportPlanningAnswer>,
    incoming: Vec<ImportPlanningAnswer>,
) -> Vec<ImportPlanningAnswer> {
    for answer in incoming {
        if answer.answer.trim().is_empty() {
            continue;
        }
        if let Some(saved_answer) = saved.iter_mut().find(|item| item.id == answer.id) {
            saved_answer.answer = answer.answer;
        } else {
            saved.push(answer);
        }
    }
    saved
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

#[derive(Debug, Clone, Default)]
struct ImportedSource {
    summary: String,
    problem: String,
    mvp: Vec<String>,
    promotion: Vec<String>,
}

impl ImportedSource {
    fn read(root: &Path) -> Self {
        let prd = fs::read_to_string(root.join("wiki").join("sources").join("prd.mdx"))
            .unwrap_or_default();
        Self {
            summary: text_between(&prd, "<section class=\"summary\"", "</section>")
                .unwrap_or_else(|| "Imported source summary unavailable.".to_string()),
            problem: text_between_heading(&prd, "Problem")
                .unwrap_or_else(|| "Problem statement unavailable.".to_string()),
            mvp: list_items_after_heading(&prd, "MVP"),
            promotion: list_items_after_heading(&prd, "Promotion Criteria"),
        }
    }
}

#[derive(Debug, Clone)]
struct AnswerSet<'a> {
    answers: &'a [ImportPlanningAnswer],
}

impl<'a> AnswerSet<'a> {
    fn new(answers: &'a [ImportPlanningAnswer]) -> Self {
        Self { answers }
    }

    fn get(&self, id: &str) -> String {
        self.answers
            .iter()
            .find(|answer| answer.id == id)
            .map(|answer| answer.answer.trim())
            .filter(|answer| !answer.is_empty())
            .unwrap_or("Unknown")
            .to_string()
    }
}

fn import_question_sequence(source: &ImportedSource) -> Vec<ImportPlanningQuestion> {
    vec![
        question(
            "first-mode",
            "First Mode",
            &format!(
                "Pick the one lane this prototype has to prove first. Source MVP clues: {}",
                if source.mvp.is_empty() {
                    "none captured".to_string()
                } else {
                    source.mvp.join("; ")
                }
            ),
            "blocking",
            "The source may be full of good ideas; the implementation still needs one starting line.",
        ),
        question(
            "platform",
            "Platform",
            "Where should the first version live: web app, mobile app, desktop, CLI, or something else with a pulse?",
            "blocking",
            "This choice frames the stack, APIs, preview command, and tests we can actually trust.",
        ),
        question(
            "frontend-stack",
            "Frontend Stack",
            "What client or UI stack should the first implementation use, including framework and styling direction if there is a UI?",
            "blocking",
            "Future agents need the visible surface and frontend conventions before they scaffold routes, components, or checks.",
        ),
        question(
            "backend-runtime",
            "Backend Runtime",
            "What backend, API, or server/runtime layer should the first version use, or should it be explicitly client-only for now?",
            "blocking",
            "This prevents agents from inventing an API boundary, server framework, or runtime ownership mid-implementation.",
        ),
        question(
            "data-storage",
            "Data Storage",
            "What persistence or data storage should the first version use: none, local files/storage, SQLite, Postgres, hosted database, or another choice?",
            "blocking",
            "Storage choices affect schema work, local setup, privacy, seed data, and the verification path.",
        ),
        question(
            "auth-users",
            "Auth And Users",
            "What auth and user model should the first version assume: no accounts, local-only identity, email login, OAuth, org accounts, or something else?",
            "blocking",
            "Auth assumptions change data boundaries, UI states, security posture, and what must be deferred.",
        ),
        question(
            "services-integrations",
            "Services And Integrations",
            "Which external services, APIs, SDKs, or integrations are required for the first demo, and which should be mocked or deferred?",
            "blocking",
            "Services introduce credentials, network failure modes, cost, rate limits, and setup instructions.",
        ),
        question(
            "location-source",
            "Location Source",
            "For the first demo, are we using live data, simulated data, or both because we enjoy controlled chaos?",
            "blocking",
            "Real data buys realism; simulated data buys speed, repeatability, and fewer permission traps.",
        ),
        question(
            "narration-output",
            "Narration Output",
            "What should the first slice actually produce: text, audio playback, or both?",
            "blocking",
            "Audio is valuable, but it drags in latency, dependencies, UX states, and extra verification.",
        ),
        question(
            "provider",
            "Provider",
            "Which model or provider should the plan assume first, so future agents are not provider-shopping mid-sprint?",
            "blocking",
            "Provider assumptions affect setup, attribution, cost, fallback behavior, and how honest the plan can be.",
        ),
        question(
            "dev-commands",
            "Local Commands",
            "What package manager, dev command, build/typecheck/test commands, preview/deployment target, and required environment variables should implementation agents assume?",
            "blocking",
            "Executable units need concrete local commands and setup boundaries instead of vague 'run the app' instructions.",
        ),
        question(
            "safety-privacy",
            "Safety And Privacy",
            &format!(
                "What safety, privacy, distraction, or attribution rules are non-negotiable from day one? Source signal: {}",
                source.promotion.first().cloned().unwrap_or_else(|| source.problem.clone())
            ),
            "blocking",
            "If this stays vague, the app can look clever while quietly creating risk. Bad trade.",
        ),
        question(
            "non-goals",
            "Non-Goals",
            "What are we absolutely not building yet, even if the source keeps waving it around?",
            "blocking",
            "A good MVP needs edges; otherwise every bullet tries to become the whole product.",
        ),
        question(
            "success-criteria",
            "Success Criteria",
            "What exact demo result tells us this thing works and is not just a nicely organized wish?",
            "blocking",
            "Detailed units need acceptance criteria a future agent can verify without reading minds.",
        ),
    ]
}

fn question(
    id: &str,
    label: &str,
    prompt: &str,
    impact: &str,
    rationale: &str,
) -> ImportPlanningQuestion {
    ImportPlanningQuestion {
        id: id.to_string(),
        label: label.to_string(),
        prompt: prompt.to_string(),
        impact: impact.to_string(),
        rationale: rationale.to_string(),
    }
}

fn unknowns_from_answers(
    sequence: &[ImportPlanningQuestion],
    answers: &[ImportPlanningAnswer],
) -> Vec<String> {
    sequence
        .iter()
        .filter(|question| {
            question.impact != "optional"
                && !answers
                    .iter()
                    .any(|answer| answer.id == question.id && !answer.answer.trim().is_empty())
        })
        .map(|question| format!("{} is unresolved.", question.label))
        .collect()
}

fn write_file(
    root: &Path,
    relative: &str,
    html: &str,
    wrote: &mut Vec<String>,
) -> Result<(), (u16, String)> {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    }
    fs::write(&path, html).map_err(|error| (500, error.to_string()))?;
    wrote.push(relative.to_string());
    Ok(())
}

fn imported_plan_index_html(title: &str) -> String {
    page(
        title,
        &format!(
            "<h1>{}</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>Shape: two-stage imported project plan</li><li>Current stage: Stage 01 - Prototype Foundation</li><li>Current unit: Unit 01 - Product And Scope Lock</li><li>Next action: complete Unit 01 before product code starts.</li></ul></section><section><h2>Stages</h2><ul><li><a href=\"/wiki/plans/imported-project-plan/stage-01-prototype-foundation.mdx\">Stage 01 - Prototype Foundation</a></li><li><a href=\"/wiki/plans/imported-project-plan/stage-02-validation-and-hardening.mdx\">Stage 02 - Validation And Hardening</a></li></ul></section>",
            escape_html(title)
        ),
    )
}

fn plans_index_html(title: &str) -> String {
    page(
        "Plans",
        &format!(
            "<h1>Plans</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>Current plan: <a href=\"/wiki/plans/imported-project-plan/index.mdx\">{}</a></li><li>Current stage: Stage 01 - Prototype Foundation</li><li>Current unit: Unit 01 - Product And Scope Lock</li><li>Next action: execute Unit 01 after reviewing the source-grounded plan.</li></ul></section><section><h2>Active Plans</h2><ul><li><a href=\"/wiki/plans/imported-project-plan/index.mdx\">{}</a> was created from the post-import Q&amp;A gate.</li></ul></section>",
            escape_html(title),
            escape_html(title)
        ),
    )
}

fn stage_html(title: &str, goal: &str, units: &[(&str, &str)]) -> String {
    let unit_links = units
        .iter()
        .map(|(path, label)| {
            format!(
                "<li><a href=\"{}\">{}</a></li>",
                escape_html(path),
                escape_html(label)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    page(
        title,
        &format!(
            "<h1>{}</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>Goal: {}</li></ul></section><section><h2>Units</h2><ul>{}</ul></section><section><h2>Completion Gate</h2><p>This stage is complete when every unit has recorded verification evidence or an explicit deferral with risk.</p></section>",
            escape_html(title),
            escape_html(goal),
            unit_links
        ),
    )
}

fn unit_html(title: &str, goal: &str, scope: &str, verification: &str, gate: &str) -> String {
    page(
        title,
        &format!(
            "<h1>{}</h1><section class=\"summary\"><h2>Summary</h2><ul><li>Status: active</li><li>{}</li></ul></section><section><h2>Goal</h2><p>{}</p></section><section><h2>Scope</h2><p>{}</p></section><section><h2>Verification</h2><ul><li>{}</li></ul></section><section><h2>Completion Gate</h2><p>{}</p></section>",
            escape_html(title),
            escape_html(goal),
            escape_html(goal),
            escape_html(scope),
            escape_html(verification),
            escape_html(gate)
        ),
    )
}

fn append_log(root: &Path, title: &str, wrote: &mut Vec<String>) -> Result<(), (u16, String)> {
    let path = root.join("wiki").join("log.mdx");
    let mut html =
        fs::read_to_string(&path).unwrap_or_else(|_| page("Log", "<h1>Project Log</h1>"));
    let entry = format!(
        "<article><h2>planning | post-import Q&amp;A completed</h2><ul><li>Created <a href=\"/wiki/plans/imported-project-plan/index.mdx\">{}</a> after source-aware import questions were answered.</li></ul></article>",
        escape_html(title)
    );
    if let Some(index) = html.find("<h1>Project Log</h1>") {
        let insert_at = index + "<h1>Project Log</h1>".len();
        html.insert_str(insert_at, &entry);
    } else {
        html.push_str(&entry);
    }
    fs::write(&path, html).map_err(|error| (500, error.to_string()))?;
    wrote.push("wiki/log.mdx".to_string());
    Ok(())
}

fn page(title: &str, body: &str) -> String {
    let body = body.replace(" class=", " className=");
    format!(
        "---\ntitle: \"{}\"\ndescription: \"Source-grounded Hyperwiki planning page.\"\nwikiKind: \"plan\"\n---\n\n{}",
        escape_html(title),
        body
    )
}

fn text_between_heading(html: &str, heading: &str) -> Option<String> {
    text_between(html, &format!("<h2>{heading}</h2>"), "</section>")
}

fn list_items_after_heading(html: &str, heading: &str) -> Vec<String> {
    text_between_heading(html, heading)
        .map(|section| {
            let mut items = Vec::new();
            let mut rest = section.as_str();
            while let Some(start) = rest.find("<li>") {
                rest = &rest[start + 4..];
                let Some(end) = rest.find("</li>") else {
                    break;
                };
                items.push(html_to_text(&rest[..end]));
                rest = &rest[end + 5..];
            }
            items
        })
        .unwrap_or_default()
}

fn text_between(html: &str, start_marker: &str, end_marker: &str) -> Option<String> {
    let start = html.find(start_marker)?;
    let after = &html[start + start_marker.len()..];
    let open_end = after.find('>').map(|index| index + 1).unwrap_or(0);
    let after = &after[open_end..];
    let end = after.find(end_marker)?;
    Some(html_to_text(&after[..end]))
}

fn html_to_text(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                text.push(' ');
            }
            '>' => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
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
        assert!(status.current_question.is_some());

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
        let question = import_planning_status(&root).current_question.unwrap();

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
