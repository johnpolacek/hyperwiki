use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

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
    #[serde(default)]
    pub request_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HumanInputCheckpointRequest {
    pub request_id: String,
    pub question: ImportPlanningQuestion,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub run_id: String,
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
    #[serde(default)]
    pub recommended_answer: String,
    #[serde(default)]
    pub options: Vec<ImportPlanningQuestionOption>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningQuestionOption {
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningStatus {
    pub status: String,
    pub answered_count: usize,
    pub current_question: Option<ImportPlanningQuestion>,
    pub current_request_id: Option<String>,
    pub next_action: String,
    pub qna_path: Option<String>,
    pub artifact_validation: Option<ImportPlanningArtifactValidation>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StagedArtifactRecord {
    pub virtual_path: String,
    pub intended_path: String,
    pub content_hash: String,
    pub validation_status: String,
    pub validation_errors: Vec<String>,
    pub commit_status: String,
    pub committed_at_ms: Option<u128>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanningArtifactValidation {
    pub status: String,
    pub staged_path: String,
    pub artifacts: Vec<StagedArtifactRecord>,
    pub errors: Vec<String>,
    pub repair_prompt: Option<String>,
    pub validated_at_ms: u128,
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
    let imported = root
        .join("wiki")
        .join("sources")
        .join("import.mdx")
        .exists();
    if !imported {
        return ImportPlanningStatus {
            status: "notImported".to_string(),
            answered_count: 0,
            current_question: None,
            current_request_id: None,
            next_action: "Create or import a project brief.".to_string(),
            qna_path: None,
            artifact_validation: None,
        };
    }
    if has_generated_plan_pages(root) {
        let artifact_validation = validate_import_plan_artifacts(root);
        let valid = artifact_validation.status == "valid";
        return ImportPlanningStatus {
            status: if valid { "complete" } else { "needsRepair" }.to_string(),
            answered_count: read_progress_answers(root).len(),
            current_question: None,
            current_request_id: None,
            next_action: if valid {
                "Continue from the validated generated implementation plan."
            } else {
                "Repair generated plan artifacts before continuing."
            }
            .to_string(),
            qna_path: Some("wiki/sources/import-qna.mdx".to_string()),
            artifact_validation: Some(artifact_validation),
        };
    }
    let current_request = read_human_input_request(root);
    ImportPlanningStatus {
        status: "incomplete".to_string(),
        answered_count: read_progress_answers(root).len(),
        current_question: current_request
            .as_ref()
            .map(|request| request.question.clone()),
        current_request_id: current_request.map(|request| request.request_id),
        next_action: "Resume import planning Q&A before creating implementation stages."
            .to_string(),
        qna_path: Some("wiki/sources/import-qna.mdx".to_string()),
        artifact_validation: read_artifact_validation(root),
    }
}

pub fn record_human_input_request(
    root: impl AsRef<Path>,
    request: HumanInputCheckpointRequest,
) -> Result<ImportPlanningStatus, (u16, String)> {
    let root = root.as_ref();
    if request.request_id.trim().is_empty() {
        return Err((400, "Human input request id is required.".to_string()));
    }
    let path = human_input_request_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    }
    let content = human_input_request_page(&request);
    fs::write(&path, content).map_err(|error| (500, error.to_string()))?;
    Ok(import_planning_status(root))
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
    if let Some(pending) = read_human_input_request(root) {
        let request_id_matches =
            request.request_id.trim().is_empty() || request.request_id.trim() == pending.request_id;
        if !request_id_matches || question.id != pending.question.id {
            return Err((
                409,
                "Import planning answer targets a stale question. Reload the current question and try again.".to_string(),
            ));
        }
    }
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
    write_import_state_page(root, &entries).map_err(|error| (500, error))?;
    clear_human_input_request(root);
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

pub fn has_generated_plan_pages(root: &Path) -> bool {
    let plans = root.join("wiki").join("plans");
    has_generated_plan_page(&plans, &plans)
}

pub fn validate_import_plan_artifacts(root: &Path) -> ImportPlanningArtifactValidation {
    let mut artifacts = collect_import_plan_artifacts(root);
    let source_terms = source_specific_terms(root);
    let mut errors = Vec::new();
    if artifacts.is_empty() {
        errors.push("No generated plan artifacts were found under wiki/plans/.".to_string());
    }
    let has_plan_index = artifacts
        .iter()
        .any(|artifact| artifact.intended_path.ends_with("/index.mdx"));
    if !artifacts.is_empty() && !has_plan_index {
        errors.push(
            "Generated plan is missing a nested plan index such as wiki/plans/mvp/index.mdx."
                .to_string(),
        );
    }
    let has_executable_unit = artifacts
        .iter()
        .any(|artifact| is_unit_artifact_path(&artifact.intended_path));
    if !artifacts.is_empty() && !has_executable_unit {
        errors.push("Generated plan has no executable unit pages.".to_string());
    }
    let executable_unit_count = artifacts
        .iter()
        .filter(|artifact| is_unit_artifact_path(&artifact.intended_path))
        .count();
    if !artifacts.is_empty() && executable_unit_count < 2 {
        errors.push(
            "Generated MVP plan must include at least two concrete executable unit pages."
                .to_string(),
        );
    }
    let has_mvp_stage_page = artifacts
        .iter()
        .any(|artifact| is_mvp_stage_artifact_path(&artifact.intended_path));
    if !artifacts.is_empty() && !has_mvp_stage_page {
        errors
            .push("Generated MVP plan is missing a stage page under wiki/plans/mvp/.".to_string());
    }
    for artifact in artifacts.iter_mut() {
        if is_unit_artifact_path(&artifact.intended_path) {
            artifact
                .validation_errors
                .extend(validate_unit_detail_quality(
                    &artifact.intended_path,
                    root,
                    &source_terms,
                ));
        }
        if artifact.validation_errors.is_empty() {
            artifact.validation_status = "valid".to_string();
        } else {
            artifact.validation_status = "invalid".to_string();
        }
        errors.extend(
            artifact
                .validation_errors
                .iter()
                .map(|error| format!("{}: {error}", artifact.intended_path)),
        );
    }
    let status = if errors.is_empty() {
        "valid"
    } else {
        "invalid"
    }
    .to_string();
    let repair_prompt = (!errors.is_empty()).then(|| import_artifact_repair_prompt(&errors));
    let staged_path = artifact_validation_path(root);
    let validation = ImportPlanningArtifactValidation {
        status,
        staged_path: staged_path
            .strip_prefix(root)
            .unwrap_or(staged_path.as_path())
            .to_string_lossy()
            .replace('\\', "/"),
        artifacts,
        errors,
        repair_prompt,
        validated_at_ms: unix_time_ms(),
    };
    write_artifact_validation(root, &validation);
    validation
}

fn collect_import_plan_artifacts(root: &Path) -> Vec<StagedArtifactRecord> {
    let plans = root.join("wiki").join("plans");
    let mut paths = Vec::new();
    collect_import_plan_artifact_paths(&plans, &plans, &mut paths);
    paths.sort();
    paths
        .into_iter()
        .filter_map(|path| staged_artifact_record(root, &path).ok())
        .collect()
}

fn collect_import_plan_artifact_paths(base: &Path, path: &Path, paths: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_import_plan_artifact_paths(base, &path, paths);
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) != Some("mdx") {
            continue;
        }
        let Ok(_relative) = path.strip_prefix(base) else {
            continue;
        };
        paths.push(path);
    }
}

fn staged_artifact_record(
    root: &Path,
    path: &Path,
) -> Result<StagedArtifactRecord, std::io::Error> {
    let content = fs::read_to_string(path)?;
    let intended_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let validation_errors = validate_plan_artifact_content(&intended_path, &content);
    Ok(StagedArtifactRecord {
        virtual_path: format!("staged://{intended_path}"),
        intended_path,
        content_hash: stable_content_hash(&content),
        validation_status: if validation_errors.is_empty() {
            "valid".to_string()
        } else {
            "invalid".to_string()
        },
        validation_errors,
        commit_status: "committed".to_string(),
        committed_at_ms: Some(unix_time_ms()),
    })
}

fn validate_unit_detail_quality(path: &str, root: &Path, source_terms: &[String]) -> Vec<String> {
    let full_path = root.join(path);
    let content = fs::read_to_string(full_path).unwrap_or_default();
    let visible = strip_agent_visibility_blocks(&content);
    let lower = visible.to_lowercase();
    let mut errors = Vec::new();

    for phrase in [
        "mvp surface shell",
        "core source behavior",
        "verification and handoff",
        "confirmed mvp slice",
        "build the mvp",
        "source decision.",
        "run checks.",
        "use the accepted source decisions as authority, but keep visible instructions concise",
        "manually exercise the behavior named by the imported source",
    ] {
        if lower.contains(phrase) {
            errors.push(format!(
                "unit page contains generic planning detail: {phrase}"
            ));
        }
    }

    if source_terms.len() >= 3 {
        let matched = source_terms
            .iter()
            .filter(|term| lower.contains(term.as_str()))
            .take(3)
            .count();
        if matched < 2 {
            errors.push(
                "unit page must include at least two concrete terms from imported source/Q&A in visible planning content"
                    .to_string(),
            );
        }
    }

    let verification = section_after_heading(&visible, "verification");
    let verification = if verification.trim().is_empty() {
        strip_htmlish(&visible)
    } else {
        verification
    };
    let verification_lower = verification.to_lowercase();
    if verification.split_whitespace().count() < 10
        || verification_lower.trim() == "run checks."
        || ![
            "open", "type", "reload", "confirm", "inspect", "exercise", "verify", "run",
        ]
        .iter()
        .any(|verb| verification_lower.contains(verb))
    {
        errors.push(
            "unit page verification must name concrete automated or manual acceptance checks"
                .to_string(),
        );
    }

    errors
}

fn validate_plan_artifact_content(path: &str, content: &str) -> Vec<String> {
    let mut errors = Vec::new();
    let trimmed = content.trim_start();
    let lower = content.to_lowercase();
    if !trimmed.starts_with("---") {
        errors.push("missing MDX frontmatter".to_string());
    }
    if !content.contains("wikiKind: \"plan\"") && !content.contains("wikiKind: 'plan'") {
        errors.push("frontmatter must declare wikiKind plan".to_string());
    }
    if !content.contains("<h1") {
        errors.push("missing h1 title".to_string());
    }
    if lower.contains("unit 01 - confirmed mvp slice") || lower.contains("confirmed mvp slice") {
        errors.push(
            "generated MVP plan still contains the generic confirmed MVP slice placeholder"
                .to_string(),
        );
    }
    if path == "wiki/plans/index.mdx" {
        for (label, needle) in [
            ("active plan", "active plan"),
            ("planning shape", "shape"),
            ("current unit", "current"),
            ("next action", "next action"),
            ("blockers", "blocker"),
            ("validation", "validation"),
        ] {
            if !lower.contains(needle) {
                errors.push(format!("Plans index must include {label}"));
            }
        }
    }
    if is_unit_artifact_path(path) {
        for (label, alternatives) in [
            ("intent or goal", &["intent", "goal"][..]),
            ("scope", &["scope"][..]),
            ("implementation notes", &["implementation notes"][..]),
            (
                "dependencies or blockers",
                &["dependencies", "blockers", "dependency", "blocker"][..],
            ),
            ("verification", &["verification"][..]),
            ("completion gate", &["completion gate"][..]),
        ] {
            if !alternatives.iter().any(|needle| lower.contains(needle)) {
                errors.push(format!("unit page must include {label}"));
            }
        }
    }
    if is_mvp_stage_artifact_path(path) {
        for (label, alternatives) in [
            ("stage goal", &["stage goal", "goal"][..]),
            ("unit sequence", &["unit sequence", "units"][..]),
            ("completion gate", &["completion gate"][..]),
            ("verification", &["verification"][..]),
        ] {
            if !alternatives.iter().any(|needle| lower.contains(needle)) {
                errors.push(format!("stage page must include {label}"));
            }
        }
    }
    if path.ends_with("/index.mdx") {
        if !lower.contains("stage") && !lower.contains("unit") {
            errors.push("plan index must reference stages or units".to_string());
        }
    }
    if path.contains("/mvp/")
        && !lower.contains("unknown")
        && !lower.contains("source")
        && !lower.contains("decision")
    {
        errors.push(
            "generated MVP plan should preserve source grounding, decisions, or unknowns"
                .to_string(),
        );
    }
    errors
}

fn source_specific_terms(root: &Path) -> Vec<String> {
    let source_root = root.join("wiki").join("sources");
    let candidates = [
        source_root.join("import.mdx"),
        source_root.join("import-qna.mdx"),
        source_root.join("import-state.mdx"),
        source_root.join("prd.mdx"),
        source_root.join("technical-brief.mdx"),
        source_root.join("design-brief.mdx"),
    ];
    let mut terms = Vec::new();
    for path in candidates {
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        for term in concrete_terms(&strip_htmlish(&content)) {
            if !terms.contains(&term) {
                terms.push(term);
            }
        }
    }
    terms.truncate(24);
    terms
}

fn concrete_terms(content: &str) -> Vec<String> {
    content
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .map(str::trim)
        .filter(|token| token.len() >= 5)
        .map(|token| token.to_lowercase())
        .filter(|token| !COMMON_IMPORT_PLAN_TERMS.contains(&token.as_str()))
        .collect()
}

const COMMON_IMPORT_PLAN_TERMS: &[&str] = &[
    "about",
    "accepted",
    "active",
    "answer",
    "answers",
    "brief",
    "build",
    "complete",
    "context",
    "create",
    "current",
    "creates",
    "decision",
    "decisions",
    "description",
    "generated",
    "hyperwiki",
    "implementation",
    "intent",
    "import",
    "imported",
    "local",
    "manual",
    "missing",
    "planning",
    "project",
    "reasoning",
    "source",
    "sources",
    "stage",
    "status",
    "summary",
    "title",
    "unknown",
    "unknowns",
    "validation",
    "verification",
    "wikikind",
];

fn strip_htmlish(content: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for ch in content.chars() {
        match ch {
            '<' => {
                in_tag = true;
                output.push(' ');
            }
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output
        .replace("&amp;", " ")
        .replace("&quot;", " ")
        .replace("&lt;", " ")
        .replace("&gt;", " ")
}

fn strip_agent_visibility_blocks(content: &str) -> String {
    let mut output = content.to_string();
    let mut cursor = 0;
    loop {
        let lower = output.to_lowercase();
        let Some(relative_start) = lower[cursor..].find("<visibility") else {
            break;
        };
        let start = cursor + relative_start;
        let Some(open_end_relative) = lower[start..].find('>') else {
            break;
        };
        let open_end = start + open_end_relative + 1;
        let opening = &lower[start..open_end];
        if !opening.contains("agents") {
            cursor = open_end;
            continue;
        }
        if let Some(close_relative) = lower[open_end..].find("</visibility>") {
            let close_end = open_end + close_relative + "</visibility>".len();
            output.replace_range(start..close_end, "");
            cursor = start;
        } else {
            output.replace_range(start..output.len(), "");
            break;
        }
    }
    output
}

fn section_after_heading(content: &str, heading: &str) -> String {
    let lower = content.to_lowercase();
    let component_open = format!("<{heading}");
    if let Some(start) = lower.find(&component_open) {
        let after_open = content[start..]
            .find('>')
            .map(|index| start + index + 1)
            .unwrap_or(start + component_open.len());
        let close = format!("</{heading}>");
        let end = lower[after_open..]
            .find(&close)
            .map(|index| after_open + index)
            .unwrap_or(content.len());
        return strip_htmlish(&content[after_open..end]);
    }
    let patterns = [
        format!("<h2>{heading}"),
        format!("## {heading}"),
        heading.to_string(),
    ];
    let mut found = None;
    for pattern in patterns {
        if let Some(index) = lower.find(&pattern) {
            found = Some((index, pattern.len()));
            break;
        }
    }
    let Some((start, pattern_len)) = found else {
        return String::new();
    };
    let rest = &content[start + pattern_len..];
    let rest_lower = rest.to_lowercase();
    let end = ["<h2", "## ", "<section", "<verification", "</verification>"]
        .iter()
        .filter_map(|needle| rest_lower.find(needle))
        .filter(|index| *index > 0)
        .min()
        .unwrap_or(rest.len());
    strip_htmlish(&rest[..end])
}

fn is_unit_artifact_path(path: &str) -> bool {
    path.contains("/unit-") || path.contains("/units/")
}

fn is_mvp_stage_artifact_path(path: &str) -> bool {
    path.starts_with("wiki/plans/mvp/stage-")
        && path.ends_with(".mdx")
        && !is_unit_artifact_path(path)
}

fn import_artifact_repair_prompt(errors: &[String]) -> String {
    format!(
        "Repair the staged Hyperwiki import plan artifacts without implementing product code. Fix these validation errors, preserve source-grounded decisions and unknowns, keep MDX frontmatter with wikiKind plan, and ensure executable unit pages include verification guidance:\n- {}",
        errors.join("\n- ")
    )
}

fn artifact_validation_path(root: &Path) -> PathBuf {
    root.join(".hyperwiki")
        .join("state")
        .join("import-onboarding")
        .join("staged-artifacts.json")
}

fn read_artifact_validation(root: &Path) -> Option<ImportPlanningArtifactValidation> {
    fs::read_to_string(artifact_validation_path(root))
        .ok()
        .and_then(|content| serde_json::from_str::<ImportPlanningArtifactValidation>(&content).ok())
}

fn write_artifact_validation(root: &Path, validation: &ImportPlanningArtifactValidation) {
    let path = artifact_validation_path(root);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(validation) {
        let _ = fs::write(path, content);
    }
}

fn stable_content_hash(content: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in content.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn unix_time_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
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

fn human_input_request_path(root: &Path) -> std::path::PathBuf {
    root.join(".hyperwiki")
        .join("state")
        .join("import-onboarding")
        .join("human-input-request.json")
}

fn read_human_input_request(root: &Path) -> Option<HumanInputCheckpointRequest> {
    fs::read_to_string(human_input_request_path(root))
        .ok()
        .and_then(|content| serde_json::from_str::<HumanInputCheckpointRequest>(&content).ok())
}

fn clear_human_input_request(root: &Path) {
    let _ = fs::remove_file(human_input_request_path(root));
}

fn human_input_request_page(request: &HumanInputCheckpointRequest) -> String {
    serde_json::to_string_pretty(request).unwrap_or_else(|_| "{}".to_string())
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

fn write_import_state_page(root: &Path, entries: &[ImportPlanningAnswer]) -> Result<(), String> {
    let path = root.join("wiki").join("sources").join("import-state.mdx");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let latest = entries.last();
    let mut content = String::from(
        "---\ntitle: \"Import Planning State\"\ndescription: \"Compact state for fast imported-project planning turns.\"\nwikiKind: \"source\"\n---\n\n<h1>Import Planning State</h1>\n<section><h2>Summary</h2>\n<ul>\n",
    );
    content.push_str(&format!("<li>Answered decisions: {}</li>\n", entries.len()));
    content.push_str("<li>Readiness: continue Q&amp;A until the agent either asks the next blocking question or creates the MVP plan.</li>\n");
    content.push_str(
        "<li>Next recommended action: ask only the next unresolved blocking decision.</li>\n",
    );
    if let Some(latest) = latest {
        content.push_str(&format!(
            "<li>Latest answer: <code>{}</code> - {}</li>\n",
            escape_html(&latest.id),
            escape_html(&latest.answer)
        ));
    }
    content.push_str("</ul>\n</section>\n<section><h2>Decisions</h2>\n<ul>\n");
    for entry in entries {
        content.push_str(&format!(
            "<li><code>{}</code>: {}</li>\n",
            escape_html(&entry.id),
            escape_html(&entry.answer)
        ));
    }
    content.push_str("</ul>\n</section>\n<section><h2>Open Unknowns</h2>\n<p>The visible planning agent owns unresolved blocker detection. Do not invent certainty; ask another question or write unknowns into the generated MVP plan.</p>\n</section>\n");
    fs::write(path, content).map_err(|error| error.to_string())
}

fn strip_import_answer_comments(content: &str) -> String {
    content
        .lines()
        .filter(|line| {
            !line
                .trim_start()
                .starts_with("<!-- hyperwiki-import-answer ")
        })
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
            "<h1>Source Import</h1><p>RouteChat creates walking tour routes with map pins and shareable itineraries.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("sources").join("prd.mdx"),
            "<h1>Product Brief</h1><section><h2>Summary</h2><ul><li>RouteChat creates walking tours and shareable route itineraries.</li></ul></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "---\ntitle: \"Plans\"\ndescription: \"Current project plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1><p>Active plan pending import planning. Shape pending. Current unit none. Next action continue import Q&amp;A. Blockers: unresolved import decisions. Validation pending.</p>",
        )
        .unwrap();
    }

    fn write_valid_import_plan(root: &Path) {
        fs::create_dir_all(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation"),
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "---\ntitle: \"Plans\"\ndescription: \"Current project plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1><section><h2>Active Plan</h2><p>Active plan: MVP Plan. Shape: single-stage MVP. Current stage: Stage 01. Current unit: Unit 01. Next action: implement Unit 01. Blockers: none. Validation: static file manual check.</p></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            "---\ntitle: \"MVP Plan\"\ndescription: \"Source-grounded MVP plan.\"\nwikiKind: \"plan\"\n---\n\n<h1>MVP Plan</h1><section><h2>Summary</h2><p>Status active. Shape single-stage MVP. Current unit Unit 01. Source decisions and unknowns are preserved.</p></section><section><h2>Stage Sequence</h2><p><a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx\">Stage 01</a> contains the unit sequence.</p></section><section><h2>Deferred Work</h2><p>Unknown deployment polish is deferred.</p></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation.mdx"),
            "---\ntitle: \"Stage 01 - Static MVP Foundation\"\ndescription: \"Build the source-grounded static MVP.\"\nwikiKind: \"plan\"\n---\n\n<h1>Stage 01 - Static MVP Foundation</h1><section><h2>Stage Goal</h2><p>Implement the source-decided local MVP.</p></section><section><h2>Unit Sequence</h2><ul><li>Unit 01 - Static shell</li><li>Unit 02 - Persistence and interactions</li></ul></section><section><h2>Dependencies</h2><p>Source decision: local-only MVP.</p></section><section><h2>Verification</h2><p>Manual browser check and applicable repository checks.</p></section><section><h2>Completion Gate</h2><p>All units complete with verification recorded.</p></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation")
                .join("unit-01-static-shell.mdx"),
            "---\ntitle: \"Unit 01 - RouteChat Tour Shell\"\ndescription: \"Create the source-grounded route tour UI shell.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 01 - RouteChat Tour Shell</h1><h2>Intent</h2><p>Build the RouteChat walking tour shell for route itineraries.</p><h2>Scope</h2><p>One source-decided surface for walking tour route entry, map pin placeholders, and itinerary review.</p><h2>Implementation Notes</h2><p>Use the accepted RouteChat tour decisions. Preserve source decisions and unknowns around shareable routes.</p><h2>Dependencies</h2><p>Depends on the accepted RouteChat walking tour decision.</p><h2>Verification</h2><p>Open the surface, enter a walking tour route, inspect map pin placeholders, and confirm the itinerary review path is visible.</p><h2>Completion Gate</h2><p>Complete when the RouteChat tour shell renders the route itinerary workflow without backend, framework, or network scope.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-static-mvp-foundation")
                .join("unit-02-persistence-and-interactions.mdx"),
            "---\ntitle: \"Unit 02 - RouteChat Tour Interactions\"\ndescription: \"Add source-grounded RouteChat tour interactions.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 02 - RouteChat Tour Interactions</h1><h2>Intent</h2><p>Implement walking tour route creation, itinerary edits, and shareable route interaction state.</p><h2>Scope</h2><p>RouteChat tour route editing, map pin interaction state, itinerary updates, and shareable route handoff copy.</p><h2>Implementation Notes</h2><p>Use the accepted RouteChat walking tour answer and preserve unknowns around map pins and shareable itineraries.</p><h2>Dependencies</h2><p>Depends on the RouteChat tour shell.</p><h2>Verification</h2><p>Create a walking tour route, update map pins, edit the itinerary, and confirm the shareable route handoff remains visible.</p><h2>Completion Gate</h2><p>Complete when the RouteChat walking tour workflow works for route creation, itinerary editing, and shareable route review.</p>",
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

        write_valid_import_plan(&root);

        let status = import_planning_status(&root);
        assert_eq!(status.status, "complete");
        assert_eq!(
            status
                .artifact_validation
                .as_ref()
                .map(|value| value.status.as_str()),
            Some("valid")
        );
        assert!(root
            .join(".hyperwiki")
            .join("state")
            .join("import-onboarding")
            .join("staged-artifacts.json")
            .exists());
    }

    #[test]
    fn generated_plan_validation_reports_repairable_errors() {
        let root = temp_root("artifact-validation");
        make_imported_project(&root);
        fs::create_dir_all(root.join("wiki").join("plans").join("mvp")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "---\ntitle: \"Plans\"\ndescription: \"Current project plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1><p>Active plan: MVP. Shape: single-stage MVP. Current unit: Unit 01. Next action: repair. Blockers: invalid unit. Validation: failing.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            "---\ntitle: \"MVP Plan\"\nwikiKind: \"plan\"\n---\n\n<h1>MVP Plan</h1><p>Stage and unit list from source decisions.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("unit-01-build.mdx"),
            "---\ntitle: \"Unit 01\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 01</h1><p>Implement source decision.</p>",
        )
        .unwrap();

        let status = import_planning_status(&root);
        assert_eq!(status.status, "needsRepair");
        let validation = status.artifact_validation.unwrap();
        assert_eq!(validation.status, "invalid");
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("verification")));
        assert!(validation
            .repair_prompt
            .unwrap()
            .contains("Repair the staged Hyperwiki import plan artifacts"));
    }

    #[test]
    fn generated_plan_validation_rejects_confirmed_mvp_placeholder() {
        let root = temp_root("placeholder-plan");
        make_imported_project(&root);
        fs::create_dir_all(root.join("wiki").join("plans").join("mvp")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "---\ntitle: \"Plans\"\ndescription: \"Current project plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1><p>Active plan: MVP. Shape: single-stage MVP. Current unit: Unit 01. Next action: implement. Blockers: none. Validation: pending.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            "---\ntitle: \"MVP Plan\"\ndescription: \"Runtime fallback.\"\nwikiKind: \"plan\"\n---\n\n<h1>MVP Plan</h1><p>Stage 01 and Unit 01 from source decisions and unknowns.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("unit-01-confirmed-mvp.mdx"),
            "---\ntitle: \"Unit 01 - Confirmed MVP Slice\"\ndescription: \"Placeholder.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 01 - Confirmed MVP Slice</h1><h2>Intent</h2><p>Source decision.</p><h2>Scope</h2><p>Build the MVP.</p><h2>Implementation Notes</h2><p>Unknowns remain.</p><h2>Dependencies</h2><p>None.</p><h2>Verification</h2><p>Run checks.</p><h2>Completion Gate</h2><p>Done when implemented.</p>",
        )
        .unwrap();

        let validation = validate_import_plan_artifacts(&root);
        assert_eq!(validation.status, "invalid");
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("generic confirmed MVP slice placeholder")));
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("at least two concrete executable unit pages")));
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("missing a stage page")));
    }

    #[test]
    fn generated_plan_validation_rejects_generic_unit_detail() {
        let root = temp_root("generic-unit-detail");
        make_imported_project(&root);
        fs::create_dir_all(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-source-grounded-mvp"),
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "---\ntitle: \"Plans\"\ndescription: \"Current project plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1><p>Active plan: MVP. Shape: single-stage MVP. Current unit: Unit 01. Next action: implement. Blockers: none. Validation: pending.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            "---\ntitle: \"MVP Plan\"\ndescription: \"Source-grounded MVP plan.\"\nwikiKind: \"plan\"\n---\n\n<h1>MVP Plan</h1><p>Stage 01 and Unit 01 from source decisions and unknowns.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("stage-01-source-grounded-mvp.mdx"),
            "---\ntitle: \"Stage 01 - Source Grounded MVP\"\ndescription: \"Build the source-grounded MVP.\"\nwikiKind: \"plan\"\n---\n\n<h1>Stage 01 - Source Grounded MVP</h1><h2>Stage Goal</h2><p>Implement RouteChat walking tour routes.</p><h2>Unit Sequence</h2><p>Unit 01 and Unit 02.</p><h2>Verification</h2><p>Verify RouteChat walking tour route behavior.</p><h2>Completion Gate</h2><p>Complete when units pass.</p>",
        )
        .unwrap();
        for unit in [
            "unit-01-mvp-surface-shell.mdx",
            "unit-02-core-source-behavior.mdx",
        ] {
            fs::write(
                root.join("wiki")
                    .join("plans")
                    .join("mvp")
                    .join("stage-01-source-grounded-mvp")
                    .join(unit),
                "---\ntitle: \"Unit 01 - MVP Surface Shell\"\ndescription: \"Generic.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 01 - MVP Surface Shell</h1><h2>Intent</h2><p>Create the minimum source-decided user-facing MVP surface.</p><h2>Scope</h2><p>Build the MVP.</p><h2>Implementation Notes</h2><p>Use the accepted source decisions as authority, but keep visible instructions concise.</p><h2>Dependencies</h2><p>None.</p><h2>Verification</h2><p>Run checks.</p><h2>Completion Gate</h2><p>Done when implemented.</p>",
            )
            .unwrap();
        }

        let validation = validate_import_plan_artifacts(&root);
        assert_eq!(validation.status, "invalid");
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("generic planning detail")));
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("concrete terms from imported source")));
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("concrete automated or manual acceptance checks")));
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
            recommended_answer: String::new(),
            options: Vec::new(),
        };

        let status = record_import_planning_answer(
            &root,
            ImportPlanningProgressRequest {
                question: Some(question),
                answer: "Walking tours first.".to_string(),
                request_id: String::new(),
            },
        )
        .unwrap();

        assert_eq!(status.status, "incomplete");
        assert_eq!(status.answered_count, 1);
        let qna =
            fs::read_to_string(root.join("wiki").join("sources").join("import-qna.mdx")).unwrap();
        let state =
            fs::read_to_string(root.join("wiki").join("sources").join("import-state.mdx")).unwrap();
        assert!(qna.contains("Walking tours first."));
        assert!(qna.contains("hyperwiki-import-answer"));
        assert!(state.contains("Import Planning State"));
        assert!(state.contains("Walking tours first."));
        assert_eq!(read_progress_answers(&root).len(), 1);
    }

    #[test]
    fn human_input_checkpoint_rejects_stale_answer() {
        let root = temp_root("human-input");
        make_imported_project(&root);
        let question = ImportPlanningQuestion {
            id: "agent-question".to_string(),
            label: "Agent Question".to_string(),
            prompt: "Which source-specific slice should come first?".to_string(),
            impact: "blocking".to_string(),
            rationale: "Asked by the visible import-planning agent.".to_string(),
            recommended_answer: String::new(),
            options: Vec::new(),
        };

        let status = record_human_input_request(
            &root,
            HumanInputCheckpointRequest {
                request_id: "request-current".to_string(),
                question: question.clone(),
                session_id: "session".to_string(),
                run_id: "run".to_string(),
            },
        )
        .unwrap();

        assert_eq!(
            status.current_request_id.as_deref(),
            Some("request-current")
        );
        assert_eq!(
            status
                .current_question
                .as_ref()
                .map(|question| question.id.as_str()),
            Some("agent-question")
        );
        let stale = record_import_planning_answer(
            &root,
            ImportPlanningProgressRequest {
                question: Some(question.clone()),
                answer: "Walking tours first.".to_string(),
                request_id: "request-stale".to_string(),
            },
        );
        assert_eq!(stale.unwrap_err().0, 409);

        let accepted = record_import_planning_answer(
            &root,
            ImportPlanningProgressRequest {
                question: Some(question),
                answer: "Walking tours first.".to_string(),
                request_id: "request-current".to_string(),
            },
        )
        .unwrap();
        assert!(accepted.current_request_id.is_none());
        assert!(read_human_input_request(&root).is_none());
    }
}
