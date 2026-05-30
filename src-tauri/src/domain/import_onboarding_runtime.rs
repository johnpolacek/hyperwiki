use crate::domain::codex_app_server::{
    cancel_import_planning_turn, import_planning_turn_status, start_import_planning_turn,
    CodexTurnRequest, CodexTurnResponse, CodexTurnSnapshot,
};
use crate::domain::import_planning::{
    has_generated_plan_pages, import_planning_status, record_human_input_request,
    record_import_planning_answer, validate_import_plan_artifacts, HumanInputCheckpointRequest,
    ImportPlanningArtifactValidation, ImportPlanningProgressRequest, ImportPlanningQuestion,
    ImportPlanningQuestionOption, ImportPlanningStatus,
};
use crate::domain::projects::ProjectRecord;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::Emitter;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingAnswerRequest {
    pub request_id: String,
    pub answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingSession {
    pub project_id: String,
    pub session_id: String,
    pub status: String,
    pub phase: String,
    pub current_run_id: Option<String>,
    pub current_question_id: Option<String>,
    pub repair_attempts: u8,
    pub plan_repair_attempts: u8,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingRun {
    pub project_id: String,
    pub session_id: String,
    pub run_id: String,
    pub provider_run_id: Option<String>,
    pub request_id: String,
    pub kind: String,
    pub status: String,
    pub phase: String,
    pub retryable: bool,
    pub started_at_ms: u128,
    pub updated_at_ms: u128,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingEventRecord {
    pub seq: u64,
    pub timestamp_ms: u128,
    pub project_id: String,
    pub session_id: String,
    pub run_id: String,
    pub request_id: String,
    pub kind: String,
    pub phase: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingCheckpoint {
    pub checkpoint_id: String,
    pub timestamp_ms: u128,
    pub project_id: String,
    pub session_id: String,
    pub run_id: String,
    pub request_id: String,
    pub kind: String,
    pub phase: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingStatusResponse {
    pub ok: bool,
    pub session: ImportOnboardingSession,
    pub active_run: Option<ImportOnboardingRun>,
    pub current_question: Option<ImportPlanningQuestion>,
    pub import_planning: ImportPlanningStatus,
    pub retryable_failure: Option<String>,
    pub recent_events: Vec<ImportOnboardingEventRecord>,
    pub artifact_validation: Option<ImportPlanningArtifactValidation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingEventsResponse {
    pub ok: bool,
    pub session_id: String,
    pub events: Vec<ImportOnboardingEventRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GeneratedPlanArtifact {
    path: String,
    content: String,
}

#[derive(Debug, Default)]
struct RuntimeRegistry {
    active_by_project: HashMap<String, String>,
    cancelled_runs: HashSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeTurnKind {
    Initial,
    Answer,
    Repair,
    Plan,
    PlanRepair,
}

impl RuntimeTurnKind {
    fn as_str(self) -> &'static str {
        match self {
            RuntimeTurnKind::Initial => "initial",
            RuntimeTurnKind::Answer => "answer",
            RuntimeTurnKind::Repair => "repair",
            RuntimeTurnKind::Plan => "plan",
            RuntimeTurnKind::PlanRepair => "plan_repair",
        }
    }

    fn runs_question_contract(self) -> bool {
        matches!(
            self,
            RuntimeTurnKind::Initial | RuntimeTurnKind::Answer | RuntimeTurnKind::Repair
        )
    }
}

fn registry() -> &'static Mutex<RuntimeRegistry> {
    static REGISTRY: OnceLock<Mutex<RuntimeRegistry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(RuntimeRegistry::default()))
}

pub fn start_import_onboarding(
    project: ProjectRecord,
    app: Option<tauri::AppHandle>,
) -> Result<ImportOnboardingStatusResponse, (u16, String)> {
    let planning = import_planning_status(&project.root);
    let session = load_or_create_session(&project)?;
    if session.status == "retryable_failure" {
        let kind = if session.phase.contains("plan") {
            RuntimeTurnKind::PlanRepair
        } else {
            RuntimeTurnKind::Repair
        };
        spawn_runtime_turn(
            project.clone(),
            kind,
            "Resume requested from retryable import onboarding failure.".to_string(),
            String::new(),
            app,
        )?;
        return import_onboarding_status(&project);
    }
    if matches!(planning.status.as_str(), "complete" | "needsRepair") {
        let mut session = session;
        session.status = planning.status.clone();
        session.phase = if planning.status == "complete" {
            "complete".to_string()
        } else {
            "validating_artifacts".to_string()
        };
        session.current_run_id = None;
        session.updated_at_ms = unix_time_ms();
        write_session(&project.root, &session)?;
        return import_onboarding_status(&project);
    }
    if planning.current_question.is_some() {
        let mut session = session;
        session.status = "waiting_for_answer".to_string();
        session.phase = "waiting_for_answer".to_string();
        session.current_question_id = planning
            .current_question
            .as_ref()
            .map(|question| question.id.clone());
        session.current_run_id = None;
        session.updated_at_ms = unix_time_ms();
        write_session(&project.root, &session)?;
        return import_onboarding_status(&project);
    }
    spawn_runtime_turn(
        project.clone(),
        RuntimeTurnKind::Initial,
        String::new(),
        String::new(),
        app,
    )?;
    import_onboarding_status(&project)
}

pub fn answer_import_onboarding(
    project: ProjectRecord,
    request: ImportOnboardingAnswerRequest,
    app: Option<tauri::AppHandle>,
) -> Result<ImportOnboardingStatusResponse, (u16, String)> {
    let planning = import_planning_status(&project.root);
    let Some(question) = planning.current_question.clone() else {
        return Err((
            409,
            "There is no active import planning question to answer.".to_string(),
        ));
    };
    let pending_request = planning
        .current_request_id
        .clone()
        .unwrap_or_else(|| question.id.clone());
    if request.request_id.trim() != pending_request {
        return Err((
            409,
            "Import planning answer targets a stale question. Reload the current question and try again.".to_string(),
        ));
    }
    if request.answer.trim().is_empty() {
        return Err((400, "Import planning answer is required.".to_string()));
    }
    record_import_planning_answer(
        &project.root,
        ImportPlanningProgressRequest {
            question: Some(question.clone()),
            answer: request.answer.clone(),
            request_id: pending_request.clone(),
        },
    )?;
    let summary = format!("{}: {}", question.prompt, request.answer.trim());
    let mut session = load_or_create_session(&project)?;
    session.status = "recording_answer".to_string();
    session.phase = "recording_answer".to_string();
    session.current_question_id = None;
    session.updated_at_ms = unix_time_ms();
    write_session(&project.root, &session)?;
    let run_stub = ImportOnboardingRun {
        project_id: project.id.clone(),
        session_id: session.session_id.clone(),
        run_id: session.current_run_id.clone().unwrap_or_default(),
        provider_run_id: None,
        request_id: pending_request,
        kind: "answer".to_string(),
        status: "accepted".to_string(),
        phase: "recording_answer".to_string(),
        retryable: false,
        started_at_ms: unix_time_ms(),
        updated_at_ms: unix_time_ms(),
        error: None,
    };
    append_event(
        &project.root,
        app.as_ref(),
        &run_stub,
        "answer_accepted",
        "recording_answer",
        "Answer sent to the planning runtime.",
        Some(summary.clone()),
    )?;
    spawn_runtime_turn(
        project.clone(),
        RuntimeTurnKind::Answer,
        summary,
        question.id,
        app,
    )?;
    import_onboarding_status(&project)
}

pub fn retry_import_onboarding(
    project: ProjectRecord,
    app: Option<tauri::AppHandle>,
) -> Result<ImportOnboardingStatusResponse, (u16, String)> {
    let planning = import_planning_status(&project.root);
    if planning.current_question.is_some() {
        return import_onboarding_status(&project);
    }
    let session = load_or_create_session(&project)?;
    let kind = if planning.status == "needsRepair" {
        RuntimeTurnKind::PlanRepair
    } else if session.phase.contains("plan") {
        RuntimeTurnKind::PlanRepair
    } else {
        RuntimeTurnKind::Repair
    };
    spawn_runtime_turn(
        project.clone(),
        kind,
        "Manual retry requested.".to_string(),
        String::new(),
        app,
    )?;
    import_onboarding_status(&project)
}

pub fn cancel_import_onboarding(
    project: ProjectRecord,
    app: Option<tauri::AppHandle>,
) -> Result<ImportOnboardingStatusResponse, (u16, String)> {
    let mut session = load_or_create_session(&project)?;
    if let Some(run_id) = session.current_run_id.clone() {
        if let Ok(mut guard) = registry().lock() {
            guard.cancelled_runs.insert(run_id.clone());
        }
        if let Some(mut run) = read_run(&project.root, &run_id) {
            if let Some(provider_run_id) = run.provider_run_id.clone() {
                let _ = cancel_import_planning_turn(&provider_run_id, app.clone());
            }
            run.status = "cancelled".to_string();
            run.phase = "cancelled".to_string();
            run.retryable = true;
            run.error = Some("Import onboarding run cancelled.".to_string());
            run.updated_at_ms = unix_time_ms();
            write_run(&project.root, &run)?;
            append_event(
                &project.root,
                app.as_ref(),
                &run,
                "run_cancelled",
                "cancelled",
                "Import onboarding run cancelled.",
                None,
            )?;
        }
    }
    session.status = "cancelled".to_string();
    session.phase = "cancelled".to_string();
    session.current_run_id = None;
    session.updated_at_ms = unix_time_ms();
    write_session(&project.root, &session)?;
    import_onboarding_status(&project)
}

pub fn import_onboarding_status(
    project: &ProjectRecord,
) -> Result<ImportOnboardingStatusResponse, (u16, String)> {
    let planning = import_planning_status(&project.root);
    let mut session = load_or_create_session(project)?;
    if let Some(run_id) = session.current_run_id.clone() {
        if !has_active_runtime_run(&project.id) {
            if let Some(mut run) = read_run(&project.root, &run_id) {
                if run.status == "running" {
                    run.status = "failed".to_string();
                    run.phase = "retryable_failure".to_string();
                    run.retryable = true;
                    run.error = Some(
                        "Import onboarding run was interrupted and can be retried.".to_string(),
                    );
                    run.updated_at_ms = unix_time_ms();
                    write_run(&project.root, &run)?;
                    session.status = "retryable_failure".to_string();
                    session.phase = "retryable_failure".to_string();
                    session.updated_at_ms = unix_time_ms();
                    write_session(&project.root, &session)?;
                }
            }
        }
    }
    if planning.status == "complete" {
        session.status = "complete".to_string();
        session.phase = "complete".to_string();
        session.current_run_id = None;
        session.current_question_id = None;
        session.updated_at_ms = unix_time_ms();
        write_session(&project.root, &session)?;
    } else if planning.current_question.is_some() && !has_active_runtime_run(&project.id) {
        session.status = "waiting_for_answer".to_string();
        session.phase = "waiting_for_answer".to_string();
        session.current_question_id = planning
            .current_question
            .as_ref()
            .map(|question| question.id.clone());
        session.current_run_id = None;
        session.updated_at_ms = unix_time_ms();
        write_session(&project.root, &session)?;
    }
    let active_run = session
        .current_run_id
        .as_ref()
        .and_then(|run_id| read_run(&project.root, run_id));
    let retryable_failure = active_run.as_ref().and_then(|run| {
        if run.retryable {
            run.error
                .clone()
                .or_else(|| Some("Import onboarding can be retried.".to_string()))
        } else {
            None
        }
    });
    Ok(ImportOnboardingStatusResponse {
        ok: true,
        session,
        active_run,
        current_question: planning.current_question.clone(),
        artifact_validation: planning.artifact_validation.clone(),
        import_planning: planning,
        retryable_failure,
        recent_events: read_recent_events(&project.root, 80),
    })
}

pub fn import_onboarding_events(
    project: &ProjectRecord,
) -> Result<ImportOnboardingEventsResponse, (u16, String)> {
    let session = load_or_create_session(project)?;
    Ok(ImportOnboardingEventsResponse {
        ok: true,
        session_id: session.session_id,
        events: read_recent_events(&project.root, 200),
    })
}

fn spawn_runtime_turn(
    project: ProjectRecord,
    kind: RuntimeTurnKind,
    context: String,
    answered_question_id: String,
    app: Option<tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    let mut session = load_or_create_session(&project)?;
    if has_active_runtime_run(&project.id) {
        return Ok(());
    }
    let run_id = format!("import-runtime:{}:{}", project.id, monotonic_id());
    let request_id = format!("import-turn:{}:{}", kind.as_str(), monotonic_id());
    let now = unix_time_ms();
    session.status = "running".to_string();
    session.phase = runtime_phase(kind).to_string();
    session.current_run_id = Some(run_id.clone());
    session.current_question_id = None;
    session.updated_at_ms = now;
    if matches!(kind, RuntimeTurnKind::Repair) {
        session.repair_attempts = session.repair_attempts.saturating_add(1);
    }
    if matches!(kind, RuntimeTurnKind::PlanRepair) {
        session.plan_repair_attempts = session.plan_repair_attempts.saturating_add(1);
    }
    write_session(&project.root, &session)?;
    let run = ImportOnboardingRun {
        project_id: project.id.clone(),
        session_id: session.session_id.clone(),
        run_id: run_id.clone(),
        provider_run_id: None,
        request_id: request_id.clone(),
        kind: kind.as_str().to_string(),
        status: "running".to_string(),
        phase: runtime_phase(kind).to_string(),
        retryable: false,
        started_at_ms: now,
        updated_at_ms: now,
        error: None,
    };
    write_run(&project.root, &run)?;
    append_checkpoint(
        &project.root,
        &run,
        "run_started",
        runtime_phase(kind),
        "Import onboarding runtime turn started.",
    )?;
    append_event(
        &project.root,
        app.as_ref(),
        &run,
        "run_started",
        runtime_phase(kind),
        "Starting the planning agent.",
        None,
    )?;
    registry()
        .lock()
        .map_err(|_| {
            (
                500,
                "Import onboarding registry lock is poisoned.".to_string(),
            )
        })?
        .active_by_project
        .insert(project.id.clone(), run_id.clone());
    thread::spawn(move || {
        let result = run_runtime_turn(
            project.clone(),
            run_id.clone(),
            kind,
            context,
            answered_question_id,
            app.clone(),
        );
        if let Err((_, error)) = result {
            let _ = fail_runtime_run(&project, &run_id, error, app.as_ref());
        }
        release_runtime_active(&project.id, &run_id);
        if let Ok(mut guard) = registry().lock() {
            guard.cancelled_runs.remove(&run_id);
        }
    });
    Ok(())
}

fn run_runtime_turn(
    project: ProjectRecord,
    run_id: String,
    kind: RuntimeTurnKind,
    context: String,
    answered_question_id: String,
    app: Option<tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    update_runtime_run(
        &project.root,
        &run_id,
        "running",
        runtime_phase(kind),
        false,
        None,
    )?;
    let request_id = read_run(&project.root, &run_id)
        .map(|run| run.request_id)
        .unwrap_or_else(|| format!("import-turn:{}", monotonic_id()));
    let prompt_context = read_import_source_context(&project.root);
    let prompt = match kind {
        RuntimeTurnKind::Initial => question_turn_prompt(&project, &request_id, &prompt_context),
        RuntimeTurnKind::Answer => answer_turn_prompt(
            &project,
            &request_id,
            &context,
            &prompt_context,
            &answered_question_id,
        ),
        RuntimeTurnKind::Repair => repair_turn_prompt(
            &project,
            &request_id,
            &context,
            &prompt_context,
            &answered_question_id,
        ),
        RuntimeTurnKind::Plan => plan_turn_prompt(&project, &request_id, &context, &prompt_context),
        RuntimeTurnKind::PlanRepair => {
            plan_repair_prompt(&project, &request_id, &context, &prompt_context)
        }
    };
    let response = match execute_provider_turn(&project, &run_id, &prompt, app.clone()) {
        Ok(response) => response,
        Err((_status, error))
            if matches!(kind, RuntimeTurnKind::Plan | RuntimeTurnKind::PlanRepair)
                && is_plan_provider_stall(&error) =>
        {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "plan_fallback_started",
                "staging_artifacts",
                "Codex plan artifact turn went quiet; completing from accepted decisions.",
                Some(error),
            )?;
            return complete_plan_from_runtime_context(
                &project,
                &run_id,
                &context,
                &prompt_context,
                app.as_ref(),
            );
        }
        Err(error) => return Err(error),
    };
    let text = response.text.clone();
    let planning = import_planning_status(&project.root);
    if planning.status == "complete" {
        return complete_runtime_run(
            &project,
            &run_id,
            "complete",
            "Generated MVP plan is ready.",
            app.as_ref(),
        );
    }
    if planning.status == "needsRepair" {
        let session = load_or_create_session(&project)?;
        if session.plan_repair_attempts == 0 {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "contract_warning",
                "validating_artifacts",
                "Generated plan artifacts need one repair turn.",
                None,
            )?;
            complete_chained_runtime_run(
                &project,
                &run_id,
                "validating_artifacts",
                "Generated plan artifacts need one repair turn.",
                app.as_ref(),
            )?;
            spawn_runtime_turn(
                project,
                RuntimeTurnKind::PlanRepair,
                planning
                    .artifact_validation
                    .as_ref()
                    .and_then(|validation| validation.repair_prompt.clone())
                    .unwrap_or_else(|| text_tail(&text, 1200)),
                String::new(),
                app,
            )?;
            return Ok(());
        }
        return fail_runtime_run(
            &project,
            &run_id,
            "Codex plan repair did not produce validated MVP plan artifacts.".to_string(),
            app.as_ref(),
        );
    }
    if kind.runs_question_contract() {
        if let Some(question) =
            extract_latest_question(&text, &request_id, Some(&answered_question_id))
        {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "question_ready",
                "waiting_for_answer",
                "Structured planning question ready.",
                Some(question.prompt.clone()),
            )?;
            record_human_input_request(
                &project.root,
                HumanInputCheckpointRequest {
                    request_id: question.id.clone(),
                    question: question.clone(),
                    session_id: run_id.clone(),
                    run_id: run_id.clone(),
                },
            )?;
            let mut session = load_or_create_session(&project)?;
            session.status = "waiting_for_answer".to_string();
            session.phase = "waiting_for_answer".to_string();
            session.current_run_id = None;
            session.current_question_id = Some(question.id);
            session.updated_at_ms = unix_time_ms();
            write_session(&project.root, &session)?;
            update_runtime_run(
                &project.root,
                &run_id,
                "complete",
                "waiting_for_answer",
                false,
                None,
            )?;
            return Ok(());
        }
        if let Some(ready) = extract_ready_to_plan(&text, &request_id) {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "ready_to_plan",
                "running_plan_turn",
                "Planning decisions are complete; generating the MVP plan.",
                Some(ready.clone()),
            )?;
            complete_runtime_run(
                &project,
                &run_id,
                "ready_to_plan",
                "Structured ready-to-plan signal received.",
                app.as_ref(),
            )?;
            release_runtime_active(&project.id, &run_id);
            spawn_runtime_turn(project, RuntimeTurnKind::Plan, ready, String::new(), app)?;
            return Ok(());
        }
        let session = load_or_create_session(&project)?;
        if session.repair_attempts <= 1 && !matches!(kind, RuntimeTurnKind::Repair) {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "contract_warning",
                "parsing_contract",
                "Planning turn completed without a parseable question or generated plan.",
                Some(text_tail(&text, 500)),
            )?;
            complete_chained_runtime_run(
                &project,
                &run_id,
                "running_repair_turn",
                "Starting one repair turn to create the plan or ask the next question.",
                app.as_ref(),
            )?;
            spawn_runtime_turn(
                project,
                RuntimeTurnKind::Repair,
                text_tail(&text, 1200),
                answered_question_id,
                app,
            )?;
            return Ok(());
        }
        return fail_runtime_run(
            &project,
            &run_id,
            "Planning turn completed without a parseable question or generated plan.".to_string(),
            app.as_ref(),
        );
    }
    if matches!(kind, RuntimeTurnKind::Plan | RuntimeTurnKind::PlanRepair) {
        if let Some(artifacts) = extract_plan_artifacts(&text, &request_id) {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "artifacts_received",
                "staging_artifacts",
                "Structured MVP plan artifacts received from Codex.",
                Some(format!("artifacts={}", artifacts.len())),
            )?;
            write_generated_plan_artifacts(&project.root, &artifacts)?;
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "artifacts_committed",
                "validating_artifacts",
                "Runtime wrote Codex-generated MDX artifacts; validating now.",
                Some(
                    artifacts
                        .iter()
                        .map(|artifact| artifact.path.clone())
                        .collect::<Vec<_>>()
                        .join("\n"),
                ),
            )?;
        }
        let validation = validate_import_plan_artifacts(&project.root);
        if has_generated_plan_pages(&project.root) && validation.status == "valid" {
            return complete_runtime_run(
                &project,
                &run_id,
                "complete",
                "Generated MVP plan is ready.",
                app.as_ref(),
            );
        }
        if let Some(question) = extract_latest_question(&text, &request_id, None) {
            append_event_for_run(
                &project.root,
                app.as_ref(),
                &run_id,
                "question_ready",
                "waiting_for_answer",
                "Structured planning question ready.",
                Some(question.prompt.clone()),
            )?;
            record_human_input_request(
                &project.root,
                HumanInputCheckpointRequest {
                    request_id: question.id.clone(),
                    question: question.clone(),
                    session_id: run_id.clone(),
                    run_id: run_id.clone(),
                },
            )?;
            let mut session = load_or_create_session(&project)?;
            session.status = "waiting_for_answer".to_string();
            session.phase = "waiting_for_answer".to_string();
            session.current_run_id = None;
            session.current_question_id = Some(question.id);
            session.updated_at_ms = unix_time_ms();
            write_session(&project.root, &session)?;
            update_runtime_run(
                &project.root,
                &run_id,
                "complete",
                "waiting_for_answer",
                false,
                None,
            )?;
            return Ok(());
        }
        if matches!(kind, RuntimeTurnKind::Plan) {
            append_event_for_run(&project.root, app.as_ref(), &run_id, "contract_warning", "staging_artifacts", "Plan generation completed without validated MVP plan artifacts; running one repair.", Some(text_tail(&text, 500)))?;
            complete_chained_runtime_run(
                &project,
                &run_id,
                "running_plan_repair_turn",
                "Plan generation completed without validated artifacts; starting one repair turn.",
                app.as_ref(),
            )?;
            spawn_runtime_turn(
                project,
                RuntimeTurnKind::PlanRepair,
                text_tail(&text, 1200),
                String::new(),
                app,
            )?;
            return Ok(());
        }
        return fail_runtime_run(
            &project,
            &run_id,
            "Plan repair completed without validated MVP plan artifacts.".to_string(),
            app.as_ref(),
        );
    }
    Ok(())
}

fn execute_provider_turn(
    project: &ProjectRecord,
    run_id: &str,
    prompt: &str,
    app: Option<tauri::AppHandle>,
) -> Result<CodexTurnResponse, (u16, String)> {
    append_event_for_run(
        &project.root,
        app.as_ref(),
        run_id,
        "provider_start",
        "starting_provider",
        "Codex turn requested; waiting for provider events.",
        None,
    )?;
    let request_id = read_run(&project.root, run_id)
        .map(|run| run.request_id)
        .unwrap_or_else(|| format!("import-turn:{}", monotonic_id()));
    let started = start_import_planning_turn(
        project.clone(),
        CodexTurnRequest {
            prompt: prompt.to_string(),
            current_page: "/wiki/plans/index.mdx".to_string(),
            request_id,
        },
        app.clone(),
    )?;
    if let Some(mut run) = read_run(&project.root, run_id) {
        run.provider_run_id = Some(started.run_id.clone());
        run.updated_at_ms = unix_time_ms();
        write_run(&project.root, &run)?;
    }
    append_event_for_run(
        &project.root,
        app.as_ref(),
        run_id,
        "provider_accepted",
        "starting_provider",
        "Codex import-planning turn started.",
        Some(started.run_id.clone()),
    )?;
    let mut last_phase = String::new();
    let mut last_events = 0usize;
    for _ in 0..360 {
        if is_runtime_cancelled(run_id) {
            let _ = cancel_import_planning_turn(&started.run_id, app.clone());
            return Err((499, "Import onboarding run cancelled.".to_string()));
        }
        thread::sleep(Duration::from_millis(500));
        let status = import_planning_turn_status(&started.run_id)?;
        if let Some(snapshot) = status.snapshot.clone() {
            if snapshot.phase != last_phase || snapshot.events != last_events {
                emit_snapshot_events(project, run_id, &snapshot, app.as_ref())?;
                last_phase = snapshot.phase.clone();
                last_events = snapshot.events;
            }
        }
        if status.status == "complete" {
            let response = status.response.ok_or_else(|| {
                (
                    502,
                    "Codex import-planning turn completed without a response.".to_string(),
                )
            })?;
            append_event_for_run(
                &project.root,
                app.as_ref(),
                run_id,
                "provider_complete",
                "parsing_contract",
                "Codex turn complete; parsing the structured contract.",
                Some(format!(
                    "chars={} events={} firstDeltaMs={:?}",
                    response.text.chars().count(),
                    response.events,
                    response.first_delta_ms
                )),
            )?;
            return Ok(response);
        }
        if status.status == "failed" || status.status == "cancelled" {
            return Err((
                502,
                status
                    .error
                    .unwrap_or_else(|| "Codex import-planning turn failed.".to_string()),
            ));
        }
    }
    Err((504, "Codex import-planning runtime timed out.".to_string()))
}

fn is_plan_provider_stall(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("did not produce assistant text")
        || lower.contains("did not emit assistant text")
        || lower.contains("bounded import-planning window")
        || lower.contains("runtime timed out")
        || lower.contains("timed out")
}

fn complete_plan_from_runtime_context(
    project: &ProjectRecord,
    run_id: &str,
    ready_context: &str,
    source_context: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    let artifacts = runtime_fallback_plan_artifacts(project, ready_context, source_context);
    write_generated_plan_artifacts(&project.root, &artifacts)?;
    append_event_for_run(
        &project.root,
        app,
        run_id,
        "artifacts_committed",
        "validating_artifacts",
        "Runtime wrote conservative MVP plan artifacts from accepted import decisions.",
        Some(
            artifacts
                .iter()
                .map(|artifact| artifact.path.clone())
                .collect::<Vec<_>>()
                .join("\n"),
        ),
    )?;
    let validation = validate_import_plan_artifacts(&project.root);
    if has_generated_plan_pages(&project.root) && validation.status == "valid" {
        return complete_runtime_run(
            project,
            run_id,
            "complete",
            "Generated MVP plan is ready.",
            app,
        );
    }
    fail_runtime_run(
        project,
        run_id,
        format!(
            "Runtime fallback plan did not pass validation: {}",
            validation.errors.join("; ")
        ),
        app,
    )
}

fn runtime_fallback_plan_artifacts(
    project: &ProjectRecord,
    ready_context: &str,
    source_context: &str,
) -> Vec<GeneratedPlanArtifact> {
    let title = escape_html(&project.name);
    let ready_summary = escape_html(&compact(ready_context, 1000));
    let source_summary = escape_html(&compact(source_context, 1400));
    let source_excerpt = if source_summary.trim().is_empty() {
        "No source excerpt was available to the runtime fallback. Preserve this as an implementation unknown and verify against the imported source before coding.".to_string()
    } else {
        source_summary
    };
    let ready_excerpt = if ready_summary.trim().is_empty() {
        "Codex signaled that planning could continue, but did not provide a usable plan-intent excerpt before the artifact turn stalled.".to_string()
    } else {
        ready_summary
    };
    let plan_name = format!("{title} MVP Plan");
    let root_index = format!(
        r#"---
title: "Plans"
description: "Current project plans."
wikiKind: "plan"
---

<h1>Plans</h1>
<section>
  <h2>Current MVP Plan</h2>
  <ul>
    <li><a href="/wiki/plans/mvp/index.mdx">{plan_name}</a></li>
    <li>Current stage: Stage 01 - Confirmed MVP implementation</li>
    <li>Current unit: <a href="/wiki/plans/mvp/unit-01-confirmed-mvp.mdx">Unit 01 - Confirmed MVP slice</a></li>
  </ul>
</section>
"#
    );
    let mvp_index = format!(
        r#"---
title: "{plan_name}"
description: "Runtime fallback MVP plan generated from accepted import decisions after the Codex artifact turn stalled."
wikiKind: "plan"
---

<h1>{plan_name}</h1>
<section>
  <h2>Source Decisions</h2>
  <p>{ready_excerpt}</p>
  <p>{source_excerpt}</p>
</section>
<section>
  <h2>Stage 01 - Confirmed MVP Implementation</h2>
  <ul>
    <li><a href="/wiki/plans/mvp/unit-01-confirmed-mvp.mdx">Unit 01 - Confirmed MVP slice</a></li>
  </ul>
</section>
<section>
  <h2>Unknowns</h2>
  <p>Treat exact file names, visual polish, and verification commands as implementation details unless the imported source or Q&amp;A already names them. Do not add unconfirmed framework, backend, account, sync, or storage scope.</p>
</section>
"#
    );
    let unit = format!(
        r#"---
title: "Unit 01 - Confirmed MVP Slice"
description: "Implement the first source-grounded MVP slice from the imported source and accepted Q&A decisions."
wikiKind: "plan"
---

<h1>Unit 01 - Confirmed MVP Slice</h1>
<section>
  <h2>Intent</h2>
  <p>Implement the smallest working MVP that matches the accepted import-planning decisions and the imported source evidence. This page exists because the Codex plan-artifact turn stalled after decisions were complete, so the runtime preserved progress with a conservative plan instead of leaving onboarding blocked.</p>
</section>
<section>
  <h2>Source Decisions</h2>
  <p>{ready_excerpt}</p>
  <p>{source_excerpt}</p>
</section>
<section>
  <h2>Scope</h2>
  <ul>
    <li>Build only the confirmed MVP surface described by the imported source and latest Q&amp;A answer.</li>
    <li>Keep implementation choices local and dependency-light unless the source explicitly requires a framework, backend, account system, sync, or external service.</li>
    <li>Persist any user-facing behavior and constraints named by the source context; mark missing details as unknowns instead of inventing product scope.</li>
    <li>Update the wiki plan if implementation discovers a contradiction between the source, the Q&amp;A decision, and the repository shape.</li>
  </ul>
</section>
<section>
  <h2>Implementation Notes</h2>
  <ul>
    <li>Use the imported source files and <code>wiki/sources/import-qna.mdx</code> as the authority for UX, data, persistence, and verification decisions.</li>
    <li>Avoid broad refactors or infrastructure changes in this first unit.</li>
    <li>Keep generated or runtime state out of tracked source unless it is deliberate wiki context.</li>
  </ul>
</section>
<section>
  <h2>Verification</h2>
  <ul>
    <li>Run the repository checks that apply to the touched files.</li>
    <li>Manually exercise the MVP happy path described by the imported source.</li>
    <li>Verify the accepted Q&amp;A decision is reflected in the implementation.</li>
    <li>Confirm no unrequested storage, account, networking, framework, or deployment scope was introduced.</li>
  </ul>
</section>
"#
    );
    vec![
        GeneratedPlanArtifact {
            path: "wiki/plans/index.mdx".to_string(),
            content: root_index,
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/index.mdx".to_string(),
            content: mvp_index,
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/unit-01-confirmed-mvp.mdx".to_string(),
            content: unit,
        },
    ]
}

fn emit_snapshot_events(
    project: &ProjectRecord,
    run_id: &str,
    snapshot: &CodexTurnSnapshot,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    let label = match snapshot.phase.as_str() {
        "thread_ready" => "Codex provider and import thread are ready.",
        "turn_requested" => "Codex turn requested.",
        "turn_started" => "Codex turn started.",
        "waiting_for_first_event" => "Codex is still preparing the first app-server event.",
        "waiting_for_assistant" => "Receiving Codex output and checking for a structured question.",
        "exec_json_fallback" => "Codex app-server was quiet; trying codex exec JSON.",
        "streaming" => "Codex assistant text is streaming.",
        "stalled" => "Codex stalled before producing usable output.",
        _ => "Codex import-planning phase updated.",
    };
    let mut detail = Vec::new();
    for line in snapshot.event_log.iter().rev().take(4).rev() {
        detail.push(format!("event: {line}"));
    }
    if let Some(first_delta_ms) = snapshot.first_delta_ms {
        detail.push(format!("First assistant text: {first_delta_ms}ms"));
    }
    if !snapshot.text_tail.trim().is_empty() {
        detail.push(format!("assistant: {}", compact(&snapshot.text_tail, 420)));
    }
    append_event_for_run(
        &project.root,
        app,
        run_id,
        "provider_snapshot",
        &snapshot.phase,
        label,
        Some(detail.join("\n")),
    )?;
    update_runtime_run(
        &project.root,
        run_id,
        "running",
        &snapshot.phase,
        false,
        None,
    )?;
    Ok(())
}

fn complete_runtime_run(
    project: &ProjectRecord,
    run_id: &str,
    phase: &str,
    message: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    update_runtime_run(&project.root, run_id, "complete", phase, false, None)?;
    append_event_for_run(
        &project.root,
        app,
        run_id,
        "run_completed",
        phase,
        message,
        None,
    )?;
    let mut session = load_or_create_session(project)?;
    session.status = if phase == "complete" {
        "complete"
    } else {
        "running"
    }
    .to_string();
    session.phase = phase.to_string();
    session.current_run_id = None;
    session.updated_at_ms = unix_time_ms();
    write_session(&project.root, &session)
}

fn complete_chained_runtime_run(
    project: &ProjectRecord,
    run_id: &str,
    phase: &str,
    message: &str,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    complete_runtime_run(project, run_id, phase, message, app)?;
    release_runtime_active(&project.id, run_id);
    Ok(())
}

fn release_runtime_active(project_id: &str, run_id: &str) {
    if let Ok(mut guard) = registry().lock() {
        if guard
            .active_by_project
            .get(project_id)
            .map(|active| active == run_id)
            .unwrap_or(false)
        {
            guard.active_by_project.remove(project_id);
        }
    }
}

fn fail_runtime_run(
    project: &ProjectRecord,
    run_id: &str,
    error: String,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    update_runtime_run(
        &project.root,
        run_id,
        "failed",
        "retryable_failure",
        true,
        Some(error.clone()),
    )?;
    append_event_for_run(
        &project.root,
        app,
        run_id,
        "contract_error",
        "retryable_failure",
        &error,
        None,
    )?;
    let mut session = load_or_create_session(project)?;
    session.status = "retryable_failure".to_string();
    session.phase = "retryable_failure".to_string();
    session.current_run_id = Some(run_id.to_string());
    session.updated_at_ms = unix_time_ms();
    write_session(&project.root, &session)
}

fn update_runtime_run(
    root: &Path,
    run_id: &str,
    status: &str,
    phase: &str,
    retryable: bool,
    error: Option<String>,
) -> Result<(), (u16, String)> {
    let Some(mut run) = read_run(root, run_id) else {
        return Ok(());
    };
    run.status = status.to_string();
    run.phase = phase.to_string();
    run.retryable = retryable;
    run.error = error;
    run.updated_at_ms = unix_time_ms();
    write_run(root, &run)
}

fn append_event_for_run(
    root: &Path,
    app: Option<&tauri::AppHandle>,
    run_id: &str,
    kind: &str,
    phase: &str,
    message: &str,
    detail: Option<String>,
) -> Result<(), (u16, String)> {
    let Some(run) = read_run(root, run_id) else {
        return Ok(());
    };
    append_event(root, app, &run, kind, phase, message, detail)
}

fn append_event(
    root: &Path,
    app: Option<&tauri::AppHandle>,
    run: &ImportOnboardingRun,
    kind: &str,
    phase: &str,
    message: &str,
    detail: Option<String>,
) -> Result<(), (u16, String)> {
    let event = ImportOnboardingEventRecord {
        seq: next_event_seq(root),
        timestamp_ms: unix_time_ms(),
        project_id: run.project_id.clone(),
        session_id: run.session_id.clone(),
        run_id: run.run_id.clone(),
        request_id: run.request_id.clone(),
        kind: kind.to_string(),
        phase: phase.to_string(),
        message: message.to_string(),
        detail,
    };
    let path = events_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| (500, error.to_string()))?;
    let line = serde_json::to_string(&event).map_err(|error| (500, error.to_string()))?;
    writeln!(file, "{line}").map_err(|error| (500, error.to_string()))?;
    if let Some(app) = app {
        let _ = app.emit("import-onboarding://event", event);
    }
    Ok(())
}

fn append_checkpoint(
    root: &Path,
    run: &ImportOnboardingRun,
    kind: &str,
    phase: &str,
    summary: &str,
) -> Result<(), (u16, String)> {
    let checkpoint = ImportOnboardingCheckpoint {
        checkpoint_id: format!("checkpoint:{}", monotonic_id()),
        timestamp_ms: unix_time_ms(),
        project_id: run.project_id.clone(),
        session_id: run.session_id.clone(),
        run_id: run.run_id.clone(),
        request_id: run.request_id.clone(),
        kind: kind.to_string(),
        phase: phase.to_string(),
        summary: summary.to_string(),
    };
    let path = checkpoints_dir(root, &run.run_id).join(format!(
        "{}.json",
        checkpoint.checkpoint_id.replace(':', "-")
    ));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    }
    write_json(&path, &checkpoint)
}

fn load_or_create_session(
    project: &ProjectRecord,
) -> Result<ImportOnboardingSession, (u16, String)> {
    if let Some(session) = read_json::<ImportOnboardingSession>(&session_path(&project.root)) {
        return Ok(session);
    }
    let now = unix_time_ms();
    let session = ImportOnboardingSession {
        project_id: project.id.clone(),
        session_id: format!("import-onboarding:{}:{}", project.id, monotonic_id()),
        status: "idle".to_string(),
        phase: "idle".to_string(),
        current_run_id: None,
        current_question_id: None,
        repair_attempts: 0,
        plan_repair_attempts: 0,
        created_at_ms: now,
        updated_at_ms: now,
    };
    write_session(&project.root, &session)?;
    Ok(session)
}

fn write_session(root: &Path, session: &ImportOnboardingSession) -> Result<(), (u16, String)> {
    write_json(&session_path(root), session)
}

fn read_run(root: &Path, run_id: &str) -> Option<ImportOnboardingRun> {
    read_json(&run_path(root, run_id))
}

fn write_run(root: &Path, run: &ImportOnboardingRun) -> Result<(), (u16, String)> {
    write_json(&run_path(root, &run.run_id), run)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), (u16, String)> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|error| (500, error.to_string()))?;
    fs::write(path, content).map_err(|error| (500, error.to_string()))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<T>(&content).ok())
}

fn read_recent_events(root: &Path, limit: usize) -> Vec<ImportOnboardingEventRecord> {
    let Ok(content) = fs::read_to_string(events_path(root)) else {
        return Vec::new();
    };
    let mut events = content
        .lines()
        .filter_map(|line| serde_json::from_str::<ImportOnboardingEventRecord>(line).ok())
        .collect::<Vec<_>>();
    if events.len() > limit {
        events = events.split_off(events.len() - limit);
    }
    events
}

fn next_event_seq(root: &Path) -> u64 {
    read_recent_events(root, 1)
        .last()
        .map(|event| event.seq.saturating_add(1))
        .unwrap_or(1)
}

fn has_active_runtime_run(project_id: &str) -> bool {
    registry()
        .lock()
        .ok()
        .and_then(|guard| guard.active_by_project.get(project_id).cloned())
        .is_some()
}

fn is_runtime_cancelled(run_id: &str) -> bool {
    registry()
        .lock()
        .ok()
        .map(|guard| guard.cancelled_runs.contains(run_id))
        .unwrap_or(false)
}

fn runtime_phase(kind: RuntimeTurnKind) -> &'static str {
    match kind {
        RuntimeTurnKind::Initial => "running_question_turn",
        RuntimeTurnKind::Answer => "running_question_turn",
        RuntimeTurnKind::Repair => "running_repair_turn",
        RuntimeTurnKind::Plan => "running_plan_turn",
        RuntimeTurnKind::PlanRepair => "running_plan_repair_turn",
    }
}

fn runtime_root(root: &Path) -> PathBuf {
    root.join(".hyperwiki")
        .join("state")
        .join("import-onboarding")
        .join("runtime")
}

fn session_path(root: &Path) -> PathBuf {
    runtime_root(root).join("session.json")
}

fn runs_dir(root: &Path) -> PathBuf {
    runtime_root(root).join("runs")
}

fn run_path(root: &Path, run_id: &str) -> PathBuf {
    runs_dir(root).join(safe_file_id(run_id)).join("run.json")
}

fn checkpoints_dir(root: &Path, run_id: &str) -> PathBuf {
    runs_dir(root)
        .join(safe_file_id(run_id))
        .join("checkpoints")
}

fn events_path(root: &Path) -> PathBuf {
    runtime_root(root).join("events.jsonl")
}

fn safe_file_id(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn read_import_source_context(root: &Path) -> String {
    let paths = [
        "wiki/sources/import-state.mdx",
        "wiki/sources/import-qna.mdx",
        "wiki/sources/import.mdx",
        "wiki/sources/prd.mdx",
        "wiki/sources/technical-brief.mdx",
        "wiki/sources/design-brief.mdx",
        "wiki/plans/index.mdx",
    ];
    let mut chunks = Vec::new();
    for path in paths {
        let full_path = root.join(path);
        let Ok(content) = fs::read_to_string(&full_path) else {
            continue;
        };
        let compacted = content
            .lines()
            .map(str::trim_end)
            .collect::<Vec<_>>()
            .join("\n");
        if compacted.trim().is_empty() {
            continue;
        }
        chunks.push(format!(
            "## /{path}\n{}",
            compacted.trim().chars().take(3600).collect::<String>()
        ));
    }
    chunks.join("\n\n---\n\n").chars().take(18_000).collect()
}

fn question_turn_prompt(project: &ProjectRecord, request_id: &str, source_context: &str) -> String {
    [
        "You are generating the next Hyperwiki import-planning interview question.",
        "Questionnaire-only response. Do not use tools. Do not run commands. Do not read files. Do not write plans.",
        "Use only the inline source context in this prompt.",
        "If no blocking unknowns remain, emit a hyperwiki-ready-to-plan JSON object instead of prose.",
        "",
        "Output exactly one fenced JSON block. No prose after the block.",
        "Question JSON fields: type=\"hyperwiki-question\", requestId, question, recommendedAnswer, reasoning, options.",
        "Ready JSON fields: type=\"hyperwiki-ready-to-plan\", requestId, reasoning, planIntent.",
        &format!("The requestId must be exactly \"{request_id}\"."),
        "Options may be strings or objects with label and description. Put the recommended option first.",
        "Ask only source-specific decisions that affect MVP scope, UX, technical shape, verification, privacy, or sequencing.",
        "",
        &format!("Imported project: {}", project.name),
        &format!("Project root: {}", project.root.display()),
        "",
        "Inline source context:",
        if source_context.trim().is_empty() { "No source context was available. Ask the first source-grounded discovery question and name unknowns." } else { source_context },
    ]
    .join("\n")
}

fn answer_turn_prompt(
    project: &ProjectRecord,
    request_id: &str,
    latest_answer: &str,
    source_context: &str,
    answered_question_id: &str,
) -> String {
    [
        "You are continuing a Hyperwiki imported-project planning interview.",
        "Questionnaire-only response. Do not use tools. Do not run commands. Do not read files. Do not write plans.",
        "Use only the inline source context and latest answer in this prompt.",
        "",
        "Output exactly one fenced JSON block. No prose after the block.",
        "If another blocking decision remains, emit type=\"hyperwiki-question\" with requestId, question, recommendedAnswer, reasoning, and options.",
        "If no blocking unknowns remain, emit type=\"hyperwiki-ready-to-plan\" with requestId, reasoning, and planIntent.",
        &format!("The requestId must be exactly \"{request_id}\"."),
        "Do not emit future-tense procedural prose.",
        "",
        &format!("Latest answer: {}", latest_answer.trim()),
        &format!("Answered question id: {}", if answered_question_id.trim().is_empty() { "none" } else { answered_question_id }),
        &format!("Imported project: {}", project.name),
        &format!("Project root: {}", project.root.display()),
        "",
        "Inline source context:",
        source_context,
    ]
    .join("\n")
}

fn repair_turn_prompt(
    project: &ProjectRecord,
    request_id: &str,
    previous_output: &str,
    source_context: &str,
    answered_question_id: &str,
) -> String {
    [
        "You are repairing an incomplete Hyperwiki import-planning turn.",
        "Questionnaire-only response. Do not use tools. Do not run commands. Do not read files. Do not write plans.",
        "Return exactly one JSON object now: either a hyperwiki-question or a hyperwiki-ready-to-plan object.",
        &format!("The requestId must be exactly \"{request_id}\"."),
        "Do not summarize what you will do. Do not emit prose outside the JSON block.",
        "",
        &format!("Answered question id: {}", if answered_question_id.trim().is_empty() { "none" } else { answered_question_id }),
        "Previous incomplete assistant output:",
        &text_tail(previous_output, 1200),
        "",
        &format!("Imported project: {}", project.name),
        &format!("Project root: {}", project.root.display()),
        "",
        "Inline source context:",
        source_context,
    ]
    .join("\n")
}

fn plan_turn_prompt(
    project: &ProjectRecord,
    request_id: &str,
    ready_context: &str,
    source_context: &str,
) -> String {
    [
        "You are generating the first MVP plan for this newly imported Hyperwiki project.",
        "Artifact-generation response only. Do not use tools. Do not run commands. Do not read files. Do not write files.",
        "Use only the inline source context and ready-to-plan context in this prompt.",
        &format!("The requestId must be exactly \"{request_id}\"."),
        "",
        "Output exactly one fenced JSON block. No prose before or after the block.",
        "The JSON object must have type=\"hyperwiki-plan-artifacts\", requestId, and artifacts.",
        "artifacts must be an array of objects with path and content.",
        "Required artifact paths:",
        "- wiki/plans/mvp/index.mdx",
        "- at least one executable unit under wiki/plans/mvp/ with \"unit-\" in the filename",
        "- wiki/plans/index.mdx",
        "Every artifact content must be complete MDX text, including frontmatter with wikiKind: \"plan\" for plan files.",
        "Every executable unit must include a Verification section.",
        "Name unknowns, source evidence, and decisions instead of inventing certainty.",
        "If writing a safe MVP plan is impossible, emit exactly one hyperwiki-question JSON object instead.",
        "",
        "Ready-to-plan context:",
        &text_tail(ready_context, 1600),
        "",
        "Inline source context:",
        source_context,
        "",
        &format!("Imported project: {}", project.name),
        &format!("Project root: {}", project.root.display()),
    ]
    .join("\n")
}

fn plan_repair_prompt(
    project: &ProjectRecord,
    request_id: &str,
    previous_output: &str,
    source_context: &str,
) -> String {
    [
        "You are repairing a failed Hyperwiki import plan-generation turn.",
        "Artifact-generation response only. Do not use tools. Do not run commands. Do not read files. Do not write files.",
        "Return exactly one fenced JSON object with type=\"hyperwiki-plan-artifacts\", requestId, and artifacts.",
        &format!("The requestId must be exactly \"{request_id}\"."),
        "The runtime will write and validate the artifacts. You only generate the file paths and complete MDX contents.",
        "Required artifact paths: wiki/plans/mvp/index.mdx, at least one wiki/plans/mvp/*unit-*.mdx file, and wiki/plans/index.mdx.",
        "Every executable unit must include a Verification section and source-grounded decisions or unknowns.",
        "If the imported source and Q&A make MVP planning impossible, emit exactly one hyperwiki-question JSON object and stop.",
        "",
        "Previous incomplete output or validation prompt:",
        &text_tail(previous_output, 1600),
        "",
        "Inline source context:",
        source_context,
        "",
        &format!("Imported project: {}", project.name),
        &format!("Project root: {}", project.root.display()),
    ]
    .join("\n")
}

fn extract_latest_question(
    text: &str,
    session_id: &str,
    excluded_question_id: Option<&str>,
) -> Option<ImportPlanningQuestion> {
    let mut questions = Vec::new();
    for raw in json_candidates(text) {
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            collect_questions(&value, session_id, &mut questions);
        }
    }
    questions
        .into_iter()
        .rev()
        .find(|question| Some(question.id.as_str()) != excluded_question_id)
}

fn collect_questions(value: &Value, session_id: &str, questions: &mut Vec<ImportPlanningQuestion>) {
    if let Some(items) = value.get("questions").and_then(Value::as_array) {
        for item in items {
            collect_questions(item, session_id, questions);
        }
    }
    let type_name = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if type_name != "hyperwiki-question" && value.get("question").is_none() {
        return;
    }
    let question = value
        .get("question")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if question.is_empty() {
        return;
    }
    let recommended_answer = value
        .get("recommendedAnswer")
        .or_else(|| value.get("recommended_answer"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let reasoning = value
        .get("reasoning")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let options = value
        .get("options")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(option_from_value)
                .take(7)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| value.get("requestId").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("planning-question:{}", stable_hash(question)));
    questions.push(ImportPlanningQuestion {
        id,
        label: "Agent Planning Question".to_string(),
        prompt: question.to_string(),
        impact: "blocking".to_string(),
        rationale: if reasoning.is_empty() {
            "Asked by the import onboarding runtime.".to_string()
        } else {
            reasoning
        },
        recommended_answer,
        options,
    });
    if questions
        .last()
        .map(|question| question.options.is_empty())
        .unwrap_or(false)
    {
        if let Some(last) = questions.last_mut() {
            if !last.recommended_answer.is_empty() {
                last.options.push(ImportPlanningQuestionOption {
                    label: last.recommended_answer.clone(),
                    description: "Recommended by the planning agent.".to_string(),
                });
            }
        }
    }
    let _ = session_id;
}

fn option_from_value(value: &Value) -> Option<ImportPlanningQuestionOption> {
    if let Some(label) = value.as_str() {
        let label = label.trim();
        if !label.is_empty() {
            return Some(ImportPlanningQuestionOption {
                label: label.to_string(),
                description: String::new(),
            });
        }
    }
    let label = value
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if label.is_empty() {
        return None;
    }
    Some(ImportPlanningQuestionOption {
        label: label.to_string(),
        description: value
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string(),
    })
}

fn extract_ready_to_plan(text: &str, request_id: &str) -> Option<String> {
    for raw in json_candidates(text).into_iter().rev() {
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        if value.get("type").and_then(Value::as_str) != Some("hyperwiki-ready-to-plan") {
            continue;
        }
        if let Some(found_request_id) = value.get("requestId").and_then(Value::as_str) {
            if found_request_id != request_id {
                continue;
            }
        }
        let reasoning = value
            .get("reasoning")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let intent = value
            .get("planIntent")
            .and_then(Value::as_str)
            .unwrap_or_default();
        return Some(format!("Reasoning: {reasoning}\nPlan intent: {intent}"));
    }
    None
}

fn extract_plan_artifacts(text: &str, request_id: &str) -> Option<Vec<GeneratedPlanArtifact>> {
    for raw in json_candidates(text).into_iter().rev() {
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        if value.get("type").and_then(Value::as_str) != Some("hyperwiki-plan-artifacts") {
            continue;
        }
        if let Some(found_request_id) = value.get("requestId").and_then(Value::as_str) {
            if found_request_id != request_id {
                continue;
            }
        }
        let artifacts = value
            .get("artifacts")
            .and_then(Value::as_array)?
            .iter()
            .filter_map(|artifact| {
                let path = artifact.get("path").and_then(Value::as_str)?.trim();
                let content = artifact.get("content").and_then(Value::as_str)?.trim();
                if path.is_empty() || content.is_empty() {
                    return None;
                }
                Some(GeneratedPlanArtifact {
                    path: path.trim_start_matches('/').to_string(),
                    content: format!("{}\n", content),
                })
            })
            .collect::<Vec<_>>();
        if !artifacts.is_empty() {
            return Some(artifacts);
        }
    }
    None
}

fn write_generated_plan_artifacts(
    root: &Path,
    artifacts: &[GeneratedPlanArtifact],
) -> Result<(), (u16, String)> {
    if artifacts.is_empty() {
        return Err((
            422,
            "No generated plan artifacts were supplied.".to_string(),
        ));
    }
    for artifact in artifacts {
        let relative = safe_plan_artifact_path(&artifact.path)?;
        let destination = root.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| (500, error.to_string()))?;
        }
        fs::write(destination, &artifact.content).map_err(|error| (500, error.to_string()))?;
    }
    Ok(())
}

fn safe_plan_artifact_path(path: &str) -> Result<PathBuf, (u16, String)> {
    let normalized = path.trim().trim_start_matches('/').replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized
            .split('/')
            .any(|part| part == ".." || part.is_empty())
    {
        return Err((422, format!("Unsafe generated artifact path: {path}")));
    }
    let allowed = normalized == "wiki/plans/index.mdx"
        || (normalized.starts_with("wiki/plans/mvp/") && normalized.ends_with(".mdx"));
    if !allowed {
        return Err((
            422,
            format!("Generated plan artifact path is outside the allowed plan boundary: {path}"),
        ));
    }
    Ok(PathBuf::from(normalized))
}

fn json_candidates(text: &str) -> Vec<String> {
    let mut candidates = fenced_json_blocks(text);
    candidates.extend(raw_json_objects(text));
    candidates
}

fn fenced_json_blocks(text: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("```") {
        rest = &rest[start + 3..];
        if let Some(newline) = rest.find('\n') {
            let language = rest[..newline].trim().to_lowercase();
            rest = &rest[newline + 1..];
            if let Some(end) = rest.find("```") {
                let body = rest[..end].trim();
                if language.is_empty() || language == "json" || body.starts_with('{') {
                    blocks.push(body.to_string());
                }
                rest = &rest[end + 3..];
            } else {
                break;
            }
        } else {
            break;
        }
    }
    blocks
}

fn raw_json_objects(text: &str) -> Vec<String> {
    let chars = text.char_indices().collect::<Vec<_>>();
    let mut objects = Vec::new();
    let mut stack = 0i32;
    let mut start = None;
    let mut in_string = false;
    let mut escaped = false;
    for (index, ch) in chars {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            continue;
        }
        if ch == '{' {
            if stack == 0 {
                start = Some(index);
            }
            stack += 1;
        } else if ch == '}' && stack > 0 {
            stack -= 1;
            if stack == 0 {
                if let Some(start_index) = start.take() {
                    let candidate = &text[start_index..=index];
                    if candidate.contains("hyperwiki-question")
                        || candidate.contains("hyperwiki-ready-to-plan")
                    {
                        objects.push(candidate.to_string());
                    }
                }
            }
        }
    }
    objects
}

fn compact(value: &str, max_chars: usize) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= max_chars {
        return collapsed;
    }
    collapsed.chars().take(max_chars).collect::<String>()
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn text_tail(value: &str, max_chars: usize) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= max_chars {
        return value.to_string();
    }
    chars[chars.len() - max_chars..].iter().collect()
}

fn stable_hash(value: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn monotonic_id() -> u128 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let counter = NEXT.fetch_add(1, Ordering::SeqCst);
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    (millis * 1000) + u128::from(counter)
}

fn unix_time_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "hyperwiki-import-onboarding-runtime-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn test_project(root: PathBuf) -> ProjectRecord {
        ProjectRecord {
            id: format!("project-test-{}", monotonic_id()),
            root,
            name: "Micro Journal".to_string(),
            project_slug: "micro-journal".to_string(),
            worktree_slug: "main".to_string(),
            available: true,
            last_opened_at: None,
            active: false,
            import_planning: None,
        }
    }

    fn make_imported_project(root: &Path) {
        fs::create_dir_all(root.join("wiki").join("sources")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("sources").join("import.mdx"),
            "<h1>Micro Journal</h1><p>Single static HTML page with localStorage persistence, debounced autosave, and Clear Entry.</p>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("sources").join("import-qna.mdx"),
            "<h1>Import Q&amp;A</h1><p>Decision: Static single file.</p>",
        )
        .unwrap();
    }

    #[test]
    fn extracts_structured_question_with_options() {
        let text = r#"
```json
{
  "type": "hyperwiki-question",
  "requestId": "import-turn:initial:1",
  "question": "Which persistence boundary should the MVP use?",
  "recommendedAnswer": "Local storage only",
  "reasoning": "The imported source describes a local prototype.",
  "options": [
    {"label": "Local storage only", "description": "Fastest path"},
    "Database-backed accounts"
  ]
}
```
"#;
        let question = extract_latest_question(text, "import-turn:initial:1", None).unwrap();
        assert_eq!(question.id, "import-turn:initial:1");
        assert_eq!(question.recommended_answer, "Local storage only");
        assert_eq!(question.options.len(), 2);
        assert_eq!(question.options[0].description, "Fastest path");
    }

    #[test]
    fn extracts_ready_to_plan_contract_for_matching_request() {
        let text = r#"{"type":"hyperwiki-ready-to-plan","requestId":"import-turn:answer:1","reasoning":"Decisions are complete.","planIntent":"Create the MVP plan."}"#;
        let ready = extract_ready_to_plan(text, "import-turn:answer:1").unwrap();
        assert!(ready.contains("Decisions are complete."));
        assert!(extract_ready_to_plan(text, "other-request").is_none());
    }

    #[test]
    fn releases_completed_run_before_chained_turn() {
        let project_id = format!("project-test-{}", monotonic_id());
        let run_id = format!("run-test-{}", monotonic_id());
        {
            let mut guard = registry().lock().unwrap();
            guard
                .active_by_project
                .insert(project_id.clone(), run_id.clone());
        }
        assert!(has_active_runtime_run(&project_id));
        release_runtime_active(&project_id, &run_id);
        assert!(!has_active_runtime_run(&project_id));
    }

    #[test]
    fn parent_finalizer_does_not_clear_child_run() {
        let project_id = format!("project-test-{}", monotonic_id());
        let parent_run_id = format!("parent-run-test-{}", monotonic_id());
        let child_run_id = format!("child-run-test-{}", monotonic_id());
        {
            let mut guard = registry().lock().unwrap();
            guard
                .active_by_project
                .insert(project_id.clone(), child_run_id.clone());
        }

        release_runtime_active(&project_id, &parent_run_id);

        let active = registry()
            .lock()
            .unwrap()
            .active_by_project
            .get(&project_id)
            .cloned();
        assert_eq!(active.as_deref(), Some(child_run_id.as_str()));
        release_runtime_active(&project_id, &child_run_id);
    }

    #[test]
    fn extracts_structured_plan_artifacts() {
        let text = r#"
```json
{
  "type": "hyperwiki-plan-artifacts",
  "requestId": "import-turn:plan:1",
  "artifacts": [
    {
      "path": "wiki/plans/index.mdx",
      "content": "---\ntitle: \"Plans\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1>"
    },
    {
      "path": "wiki/plans/mvp/unit-01-build.mdx",
      "content": "---\ntitle: \"Unit 01\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 01</h1>\n<h2>Verification</h2>"
    }
  ]
}
```
"#;
        let artifacts = extract_plan_artifacts(text, "import-turn:plan:1").unwrap();
        assert_eq!(artifacts.len(), 2);
        assert_eq!(artifacts[0].path, "wiki/plans/index.mdx");
        assert!(extract_plan_artifacts(text, "other-request").is_none());
    }

    #[test]
    fn rejects_generated_plan_artifacts_outside_plan_boundary() {
        assert!(safe_plan_artifact_path("wiki/plans/mvp/unit-01.mdx").is_ok());
        assert!(safe_plan_artifact_path("wiki/plans/index.mdx").is_ok());
        assert!(safe_plan_artifact_path("../secret.mdx").is_err());
        assert!(safe_plan_artifact_path("src/App.tsx").is_err());
        assert!(safe_plan_artifact_path("wiki/sources/import.mdx").is_err());
    }

    #[test]
    fn runtime_plan_fallback_writes_valid_mvp_artifacts() {
        let root = temp_root("plan-fallback");
        make_imported_project(&root);
        let project = test_project(root.clone());
        let session = load_or_create_session(&project).unwrap();
        let run_id = format!("run-test-{}", monotonic_id());
        write_run(
            &root,
            &ImportOnboardingRun {
                project_id: project.id.clone(),
                session_id: session.session_id,
                run_id: run_id.clone(),
                provider_run_id: None,
                request_id: "import-turn:plan:test".to_string(),
                kind: "plan".to_string(),
                status: "running".to_string(),
                phase: "running_plan_turn".to_string(),
                retryable: false,
                started_at_ms: unix_time_ms(),
                updated_at_ms: unix_time_ms(),
                error: None,
            },
        )
        .unwrap();

        complete_plan_from_runtime_context(
            &project,
            &run_id,
            "Reasoning: decisions complete.\nPlan intent: Implement a static single-file localStorage MVP.",
            &read_import_source_context(&root),
            None,
        )
        .unwrap();

        let validation = validate_import_plan_artifacts(&root);
        assert_eq!(validation.status, "valid");
        assert!(root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("index.mdx")
            .exists());
        assert!(root
            .join("wiki")
            .join("plans")
            .join("mvp")
            .join("unit-01-confirmed-mvp.mdx")
            .exists());
        let run = read_run(&root, &run_id).unwrap();
        assert_eq!(run.status, "complete");
        assert_eq!(run.phase, "complete");
    }
}
