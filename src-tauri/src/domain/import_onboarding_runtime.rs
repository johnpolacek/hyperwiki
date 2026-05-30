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
    PlanRepair,
}

impl RuntimeTurnKind {
    fn as_str(self) -> &'static str {
        match self {
            RuntimeTurnKind::Initial => "initial",
            RuntimeTurnKind::Answer => "answer",
            RuntimeTurnKind::Repair => "repair",
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
        RuntimeTurnKind::PlanRepair => {
            plan_repair_prompt(&project, &request_id, &context, &prompt_context)
        }
    };
    let response = match execute_provider_turn(&project, &run_id, &prompt, app.clone()) {
        Ok(response) => response,
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
                "plan_compiler_started",
                "Planning decisions are complete; compiling MVP plan artifacts.",
                Some(ready.clone()),
            )?;
            return compile_plan_from_ready_context(project, &run_id, &ready, &prompt_context, app);
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
    if matches!(kind, RuntimeTurnKind::PlanRepair) {
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
        return fail_runtime_run(
            &project,
            &run_id,
            "Plan repair completed without validated MVP plan artifacts.".to_string(),
            app.as_ref(),
        );
    }
    Ok(())
}

fn compile_plan_from_ready_context(
    project: ProjectRecord,
    run_id: &str,
    ready_context: &str,
    source_context: &str,
    app: Option<tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    append_event_for_run(
        &project.root,
        app.as_ref(),
        run_id,
        "plan_compiler_started",
        "plan_compiler_started",
        "Compiling source-grounded MVP plan artifacts in the runtime.",
        None,
    )?;
    let artifacts = match compile_import_mvp_plan_artifacts(&project, ready_context, source_context)
    {
        Ok(artifacts) => artifacts,
        Err((422, error)) => {
            return record_compiler_followup_question(project, run_id, &error, app);
        }
        Err(error) => return Err(error),
    };
    append_event_for_run(
        &project.root,
        app.as_ref(),
        run_id,
        "plan_artifacts_compiled",
        "staging_artifacts",
        "Runtime compiled MVP plan artifacts from accepted decisions.",
        Some(
            artifacts
                .iter()
                .map(|artifact| artifact.path.clone())
                .collect::<Vec<_>>()
                .join("\n"),
        ),
    )?;
    write_generated_plan_artifacts(&project.root, &artifacts)?;
    append_event_for_run(
        &project.root,
        app.as_ref(),
        run_id,
        "plan_artifacts_written",
        "validating_artifacts",
        "Runtime wrote compiled MDX artifacts; validating now.",
        None,
    )?;
    let validation = validate_import_plan_artifacts(&project.root);
    if has_generated_plan_pages(&project.root) && validation.status == "valid" {
        append_event_for_run(
            &project.root,
            app.as_ref(),
            run_id,
            "plan_validation_passed",
            "complete",
            "Compiled MVP plan artifacts passed validation.",
            Some(format!("artifacts={}", validation.artifacts.len())),
        )?;
        return complete_runtime_run(
            &project,
            run_id,
            "complete",
            "Generated MVP plan is ready.",
            app.as_ref(),
        );
    }

    let session = load_or_create_session(&project)?;
    if session.plan_repair_attempts == 0 {
        append_event_for_run(
            &project.root,
            app.as_ref(),
            run_id,
            "contract_warning",
            "validating_artifacts",
            "Compiled plan artifacts need one Codex repair turn.",
            Some(validation.errors.join("\n")),
        )?;
        complete_chained_runtime_run(
            &project,
            run_id,
            "validating_artifacts",
            "Compiled plan artifacts need one Codex repair turn.",
            app.as_ref(),
        )?;
        spawn_runtime_turn(
            project,
            RuntimeTurnKind::PlanRepair,
            validation
                .repair_prompt
                .clone()
                .unwrap_or_else(|| validation.errors.join("\n")),
            String::new(),
            app,
        )?;
        return Ok(());
    }

    fail_runtime_run(
        &project,
        run_id,
        "Compiled MVP plan artifacts did not pass validation.".to_string(),
        app.as_ref(),
    )
}

fn record_compiler_followup_question(
    project: ProjectRecord,
    run_id: &str,
    error: &str,
    app: Option<tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    let question = ImportPlanningQuestion {
        id: format!("import-turn:compiler:{}", monotonic_id()),
        label: "Agent Planning Question".to_string(),
        prompt: "What concrete MVP surface and first behaviors should the imported project plan implement?".to_string(),
        impact: "blocking".to_string(),
        rationale: format!(
            "The import plan compiler could not safely derive enough source evidence: {error}"
        ),
        recommended_answer: "Use the smallest source-described user workflow and list the first concrete behaviors to implement.".to_string(),
        options: vec![ImportPlanningQuestionOption {
            label: "Smallest source-described workflow".to_string(),
            description: "Keeps the generated plan source-grounded instead of inventing MVP scope."
                .to_string(),
        }],
    };
    append_event_for_run(
        &project.root,
        app.as_ref(),
        run_id,
        "question_ready",
        "waiting_for_answer",
        "Plan compiler needs one more source-grounded decision.",
        Some(question.prompt.clone()),
    )?;
    record_human_input_request(
        &project.root,
        HumanInputCheckpointRequest {
            request_id: question.id.clone(),
            question: question.clone(),
            session_id: run_id.to_string(),
            run_id: run_id.to_string(),
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
        run_id,
        "complete",
        "waiting_for_answer",
        false,
        None,
    )
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

fn plan_repair_prompt(
    project: &ProjectRecord,
    request_id: &str,
    previous_output: &str,
    source_context: &str,
) -> String {
    [
        "You are generating or repairing Hyperwiki import plan artifacts.",
        "Artifact-generation response only. Do not use tools. Do not run commands. Do not read files. Do not write files.",
        "Return exactly one fenced JSON object with type=\"hyperwiki-plan-artifacts\", requestId, and artifacts.",
        &format!("The requestId must be exactly \"{request_id}\"."),
        "The runtime will write and validate the artifacts. You only generate the file paths and complete MDX contents.",
        "Apply the bundled Hyperwiki planning contract even though you cannot call a skill tool in this turn.",
        "Required artifact paths: wiki/plans/index.mdx, wiki/plans/mvp/index.mdx, one wiki/plans/mvp/stage-01-*.mdx stage page, and at least two wiki/plans/mvp/stage-01-*/unit-*.mdx executable unit pages.",
        "wiki/plans/index.mdx must expose active plan, planning shape, current stage or unit, next action, blockers, and validation.",
        "wiki/plans/mvp/index.mdx must summarize source decisions, assumptions or unknowns, stage sequence, current unit, and deferred work.",
        "The stage page must explain the stage goal, unit sequence, completion gate, dependencies, and verification expectations.",
        "Every executable unit must include Intent or Goal, Scope, Implementation Notes, Dependencies or Blockers, Verification, and Completion Gate sections.",
        "Split the MVP into concrete implementation slices from the source evidence; do not produce a generic single \"Confirmed MVP Slice\" unit.",
        "Preserve accepted Q&A decisions and imported source details inside the relevant unit notes.",
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

fn compile_import_mvp_plan_artifacts(
    project: &ProjectRecord,
    ready_context: &str,
    source_context: &str,
) -> Result<Vec<GeneratedPlanArtifact>, (u16, String)> {
    let evidence = format!("{}\n\n{}", ready_context.trim(), source_context.trim());
    if evidence.split_whitespace().count() < 8 {
        return Err((
            422,
            "Import planning reached ready-to-plan without enough source evidence to compile MVP plan artifacts.".to_string(),
        ));
    }

    let lower = evidence.to_lowercase();
    let is_static_local_mvp = lower.contains("index.html")
        || lower.contains("localstorage")
        || lower.contains("local storage")
        || lower.contains("vanilla")
        || lower.contains("static html");
    let title = clean_plan_title(&project.name);
    let decision_summary = compact_for_plan(&evidence, 900);
    let escaped_title = escape_html_text(&title);
    let escaped_decisions = escape_html_text(&decision_summary);

    if is_static_local_mvp {
        return Ok(compile_static_local_mvp_artifacts(
            &escaped_title,
            &escaped_decisions,
        ));
    }

    Ok(compile_generic_source_mvp_artifacts(
        &escaped_title,
        &escaped_decisions,
    ))
}

fn compile_static_local_mvp_artifacts(
    title: &str,
    decision_summary: &str,
) -> Vec<GeneratedPlanArtifact> {
    vec![
        GeneratedPlanArtifact {
            path: "wiki/plans/index.mdx".to_string(),
            content: format!(
                "---\ntitle: \"Plans\"\ndescription: \"Current source-grounded implementation plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1>\n<section className=\"summary\">\n  <h2>Summary</h2>\n  <ul>\n    <li>Status: active planning</li>\n    <li>Active plan: <a href=\"/wiki/plans/mvp/index.mdx\">{title} MVP Plan</a></li>\n    <li>Shape: single-stage MVP with three executable units</li>\n    <li>Current unit: <a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-01-root-html-shell.mdx\">Unit 01 - Root HTML Shell</a></li>\n    <li>Next action: implement the self-contained root <code>index.html</code> shell.</li>\n    <li>Blockers: none from accepted import decisions.</li>\n    <li>Validation: repository checks plus manual browser verification of the local-only journal workflow.</li>\n  </ul>\n</section>\n<section>\n  <h2>Active Plan</h2>\n  <p>The current active plan is the source-grounded MVP plan for {title}. It starts with Stage 01, a static local-only implementation path compiled from accepted import decisions.</p>\n</section>\n"
            ),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/index.mdx".to_string(),
            content: format!(
                "---\ntitle: \"{title} MVP Plan\"\ndescription: \"Source-grounded MVP plan compiled from import Q&amp;A decisions.\"\nwikiKind: \"plan\"\n---\n\n<h1>{title} MVP Plan</h1>\n<section className=\"summary\">\n  <h2>Summary</h2>\n  <ul>\n    <li>Status: active</li>\n    <li>Shape: single-stage MVP</li>\n    <li>Current stage: <a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation.mdx\">Stage 01 - Static MVP Foundation</a></li>\n    <li>Current unit: <a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-01-root-html-shell.mdx\">Unit 01 - Root HTML Shell</a></li>\n    <li>Source decisions: {decision_summary}</li>\n    <li>Unknowns: no blocking implementation unknowns remain for the local-only MVP slice.</li>\n  </ul>\n</section>\n<section>\n  <h2>Stage Sequence</h2>\n  <ol>\n    <li>Stage 01 builds the confirmed static local-only MVP as one root <code>index.html</code> file.</li>\n  </ol>\n</section>\n<section>\n  <h2>Units</h2>\n  <ol>\n    <li>Unit 01 creates semantic markup, embedded CSS, and the centered textarea workflow.</li>\n    <li>Unit 02 implements <code>localStorage</code> restore, debounced autosave, and save-status feedback.</li>\n    <li>Unit 03 implements clear-entry behavior and records manual verification.</li>\n  </ol>\n</section>\n<section>\n  <h2>Deferred Work</h2>\n  <p>Frameworks, backend services, accounts, sync, deployment automation, analytics, and external services are outside the accepted MVP decision.</p>\n</section>\n"
            ),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/stage-01-static-mvp-foundation.mdx".to_string(),
            content: format!(
                "---\ntitle: \"Stage 01 - Static MVP Foundation\"\ndescription: \"Build the accepted static local-only MVP.\"\nwikiKind: \"plan\"\n---\n\n<h1>Stage 01 - Static MVP Foundation</h1>\n<section>\n  <h2>Stage Goal</h2>\n  <p>Implement the source-decided {title} MVP as a single self-contained root <code>index.html</code> page using embedded HTML, CSS, and JavaScript.</p>\n</section>\n<section>\n  <h2>Unit Sequence</h2>\n  <ol>\n    <li><a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-01-root-html-shell.mdx\">Unit 01 - Root HTML Shell</a></li>\n    <li><a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-02-local-persistence.mdx\">Unit 02 - Local Persistence</a></li>\n    <li><a href=\"/wiki/plans/mvp/stage-01-static-mvp-foundation/unit-03-clear-entry-and-verification.mdx\">Unit 03 - Clear Entry And Verification</a></li>\n  </ol>\n</section>\n<section>\n  <h2>Dependencies</h2>\n  <p>Depends on the accepted source decision to keep the MVP static, local-only, dependency-free, and stored through browser <code>localStorage</code>.</p>\n</section>\n<section>\n  <h2>Verification</h2>\n  <p>Run applicable repository checks, then manually open the page in a browser, type a journal entry, reload to confirm restore, wait through debounce to confirm autosave, clear the entry, and confirm no backend, framework, build step, account, network, or external-service behavior is introduced.</p>\n</section>\n<section>\n  <h2>Completion Gate</h2>\n  <p>Complete when all three units are implemented, the root <code>index.html</code> workflow works locally, and verification is recorded in the relevant unit.</p>\n</section>\n"
            ),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/stage-01-static-mvp-foundation/unit-01-root-html-shell.mdx"
                .to_string(),
            content: format!(
                "---\ntitle: \"Unit 01 - Root HTML Shell\"\ndescription: \"Create the self-contained static journal shell.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 01 - Root HTML Shell</h1>\n<section>\n  <h2>Intent</h2>\n  <p>Create the accepted MVP surface as a root <code>index.html</code> file with semantic markup, embedded CSS, embedded JavaScript, and a centered textarea workflow for {title}.</p>\n</section>\n<section>\n  <h2>Scope</h2>\n  <p>Build only the static document shell: page title, main journal region, textarea, save-status area, and clear-entry control. Do not add a framework, backend, build step, external services, or account model.</p>\n</section>\n<section>\n  <h2>Implementation Notes</h2>\n  <p>Use plain HTML, CSS, and JavaScript in one file. Keep the layout responsive and centered, make the textarea the primary interaction, and preserve the source decision summary: {decision_summary}</p>\n</section>\n<section>\n  <h2>Dependencies</h2>\n  <p>Depends on the accepted static local-only MVP decision. Blockers: none.</p>\n</section>\n<section>\n  <h2>Verification</h2>\n  <p>Open the root <code>index.html</code> in a browser and confirm the page renders, the textarea is usable, controls are visible, and no network or build process is required.</p>\n</section>\n<section>\n  <h2>Completion Gate</h2>\n  <p>Complete when the static shell renders from the project root and is ready for local persistence wiring.</p>\n</section>\n"
            ),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/stage-01-static-mvp-foundation/unit-02-local-persistence.mdx"
                .to_string(),
            content: "---\ntitle: \"Unit 02 - Local Persistence\"\ndescription: \"Implement load-on-open restore and debounced localStorage autosave.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 02 - Local Persistence</h1>\n<section>\n  <h2>Intent</h2>\n  <p>Persist the journal entry locally with browser <code>localStorage</code> so the accepted MVP restores the previous entry on open and saves edits automatically.</p>\n</section>\n<section>\n  <h2>Scope</h2>\n  <p>Add a stable storage key, load-on-open restore, debounced autosave after textarea input, and user-visible save status. Keep all data local to the browser.</p>\n</section>\n<section>\n  <h2>Implementation Notes</h2>\n  <p>Use a small debounce timer around <code>localStorage.setItem</code>. Restore from the same key during initialization. Handle empty content consistently without adding backend, sync, accounts, analytics, or external calls. Preserve source decisions and unknowns in comments only when useful for future maintainers.</p>\n</section>\n<section>\n  <h2>Dependencies</h2>\n  <p>Depends on Unit 01's textarea and status elements. Blockers: none.</p>\n</section>\n<section>\n  <h2>Verification</h2>\n  <p>Type a journal entry, wait through the debounce, reload the browser, and confirm the same text is restored from <code>localStorage</code>. Inspect behavior with browser dev tools if needed.</p>\n</section>\n<section>\n  <h2>Completion Gate</h2>\n  <p>Complete when autosave and restore work without any backend, network, framework, or build step.</p>\n</section>\n".to_string(),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/stage-01-static-mvp-foundation/unit-03-clear-entry-and-verification.mdx"
                .to_string(),
            content: "---\ntitle: \"Unit 03 - Clear Entry And Verification\"\ndescription: \"Implement the clear-entry interaction and verify the MVP happy path.\"\nwikiKind: \"plan\"\n---\n\n<h1>Unit 03 - Clear Entry And Verification</h1>\n<section>\n  <h2>Intent</h2>\n  <p>Finish the static local-only MVP by adding clear-entry behavior and recording the manual verification path for the journal workflow.</p>\n</section>\n<section>\n  <h2>Scope</h2>\n  <p>Wire the clear-entry control to clear the textarea, update <code>localStorage</code>, return focus to the editor, and update save status. Verify the complete local-only happy path.</p>\n</section>\n<section>\n  <h2>Implementation Notes</h2>\n  <p>Keep the clear action immediate and predictable. It may ask for confirmation only if the source explicitly requires it; otherwise make the behavior simple for the MVP. Do not introduce unrequested storage, networking, account, framework, deployment, or external-service scope.</p>\n</section>\n<section>\n  <h2>Dependencies</h2>\n  <p>Depends on Unit 02's storage key and autosave behavior. Blockers: none.</p>\n</section>\n<section>\n  <h2>Verification</h2>\n  <p>Enter text, confirm autosave, reload to confirm restore, activate Clear Entry, reload again, and confirm the entry remains cleared. Run the repository checks that apply to static HTML changes.</p>\n</section>\n<section>\n  <h2>Completion Gate</h2>\n  <p>Complete when the entire MVP happy path works locally and verification confirms no unrequested backend, framework, build, account, network, or external service was added.</p>\n</section>\n".to_string(),
        },
    ]
}

fn compile_generic_source_mvp_artifacts(
    title: &str,
    decision_summary: &str,
) -> Vec<GeneratedPlanArtifact> {
    vec![
        GeneratedPlanArtifact {
            path: "wiki/plans/index.mdx".to_string(),
            content: format!(
                "---\ntitle: \"Plans\"\ndescription: \"Current source-grounded implementation plans.\"\nwikiKind: \"plan\"\n---\n\n<h1>Plans</h1><section><h2>Summary</h2><ul><li>Status: active planning</li><li>Active plan: <a href=\"/wiki/plans/mvp/index.mdx\">{title} MVP Plan</a></li><li>Shape: single-stage MVP with three executable units</li><li>Current unit: <a href=\"/wiki/plans/mvp/stage-01-source-grounded-mvp/unit-01-mvp-surface-shell.mdx\">Unit 01 - MVP Surface Shell</a></li><li>Next action: implement the source-decided MVP shell.</li><li>Blockers: none from accepted import decisions.</li><li>Validation: repository checks plus manual verification of the imported source workflow.</li></ul></section>"
            ),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/index.mdx".to_string(),
            content: format!(
                "---\ntitle: \"{title} MVP Plan\"\ndescription: \"Source-grounded MVP plan compiled from import Q&amp;A decisions.\"\nwikiKind: \"plan\"\n---\n\n<h1>{title} MVP Plan</h1><section><h2>Summary</h2><ul><li>Status: active</li><li>Shape: single-stage MVP</li><li>Current stage: <a href=\"/wiki/plans/mvp/stage-01-source-grounded-mvp.mdx\">Stage 01 - Source Grounded MVP</a></li><li>Current unit: <a href=\"/wiki/plans/mvp/stage-01-source-grounded-mvp/unit-01-mvp-surface-shell.mdx\">Unit 01 - MVP Surface Shell</a></li><li>Source decisions: {decision_summary}</li><li>Unknowns: no blocking implementation unknowns remain in the accepted ready-to-plan contract.</li></ul></section><section><h2>Stage Sequence</h2><p>Stage 01 implements the accepted source-grounded MVP units.</p></section><section><h2>Deferred Work</h2><p>Unrequested services, integrations, and post-MVP polish remain deferred until a later decision.</p></section>"
            ),
        },
        GeneratedPlanArtifact {
            path: "wiki/plans/mvp/stage-01-source-grounded-mvp.mdx".to_string(),
            content: "---\ntitle: \"Stage 01 - Source Grounded MVP\"\ndescription: \"Build the accepted imported-project MVP.\"\nwikiKind: \"plan\"\n---\n\n<h1>Stage 01 - Source Grounded MVP</h1><section><h2>Stage Goal</h2><p>Implement the source-decided MVP behavior without adding unrequested product scope.</p></section><section><h2>Unit Sequence</h2><ol><li><a href=\"/wiki/plans/mvp/stage-01-source-grounded-mvp/unit-01-mvp-surface-shell.mdx\">Unit 01 - MVP Surface Shell</a></li><li><a href=\"/wiki/plans/mvp/stage-01-source-grounded-mvp/unit-02-core-source-behavior.mdx\">Unit 02 - Core Source Behavior</a></li><li><a href=\"/wiki/plans/mvp/stage-01-source-grounded-mvp/unit-03-verification-and-handoff.mdx\">Unit 03 - Verification And Handoff</a></li></ol></section><section><h2>Dependencies</h2><p>Depends on accepted import source decisions and Q&amp;A answers.</p></section><section><h2>Verification</h2><p>Run applicable repository checks and manually exercise the source-described workflow.</p></section><section><h2>Completion Gate</h2><p>Complete when all units are implemented and verified against source decisions.</p></section>".to_string(),
        },
        generic_unit_artifact(
            "wiki/plans/mvp/stage-01-source-grounded-mvp/unit-01-mvp-surface-shell.mdx",
            "Unit 01 - MVP Surface Shell",
            "Create the minimum source-decided user-facing MVP surface.",
            decision_summary,
        ),
        generic_unit_artifact(
            "wiki/plans/mvp/stage-01-source-grounded-mvp/unit-02-core-source-behavior.mdx",
            "Unit 02 - Core Source Behavior",
            "Implement the primary behavior described by the imported source and accepted decisions.",
            decision_summary,
        ),
        generic_unit_artifact(
            "wiki/plans/mvp/stage-01-source-grounded-mvp/unit-03-verification-and-handoff.mdx",
            "Unit 03 - Verification And Handoff",
            "Verify the source-described happy path and record remaining unknowns.",
            decision_summary,
        ),
    ]
}

fn generic_unit_artifact(
    path: &str,
    title: &str,
    intent: &str,
    decision_summary: &str,
) -> GeneratedPlanArtifact {
    GeneratedPlanArtifact {
        path: path.to_string(),
        content: format!(
            "---\ntitle: \"{title}\"\ndescription: \"Source-grounded MVP implementation unit.\"\nwikiKind: \"plan\"\n---\n\n<h1>{title}</h1><section><h2>Intent</h2><p>{intent}</p></section><section><h2>Scope</h2><p>Stay inside the accepted imported-project MVP surface and avoid unrequested product, service, framework, deployment, account, or integration scope.</p></section><section><h2>Implementation Notes</h2><p>Use the accepted source decisions as authority: {decision_summary}</p></section><section><h2>Dependencies</h2><p>Depends on prior units in Stage 01 and the accepted import Q&amp;A decisions. Blockers: none unless implementation discovers a contradiction with source evidence.</p></section><section><h2>Verification</h2><p>Run applicable repository checks and manually exercise the behavior named by the imported source.</p></section><section><h2>Completion Gate</h2><p>Complete when the unit behavior is implemented, verified, and no source decision has been contradicted.</p></section>"
        ),
    }
}

fn clean_plan_title(value: &str) -> String {
    let compact = value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    if compact.is_empty() {
        "Imported Project".to_string()
    } else {
        compact.chars().take(80).collect()
    }
}

fn compact_for_plan(value: &str, max_chars: usize) -> String {
    let compacted = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compacted.chars().count() <= max_chars {
        compacted
    } else {
        format!(
            "{}...",
            compacted
                .chars()
                .take(max_chars.saturating_sub(3))
                .collect::<String>()
        )
    }
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
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
        assert!(safe_plan_artifact_path("wiki/plans/mvp/stage-01-static-mvp.mdx").is_ok());
        assert!(safe_plan_artifact_path("wiki/plans/index.mdx").is_ok());
        assert!(safe_plan_artifact_path("../secret.mdx").is_err());
        assert!(safe_plan_artifact_path("src/App.tsx").is_err());
        assert!(safe_plan_artifact_path("wiki/sources/import.mdx").is_err());
    }

    #[test]
    fn plan_repair_prompt_requires_hyperwiki_stage_and_unit_contract() {
        let root = temp_root("plan-prompt");
        make_imported_project(&root);
        let project = test_project(root.clone());
        let prompt = plan_repair_prompt(
            &project,
            "import-turn:plan:test",
            "Reasoning: decisions complete.\nPlan intent: Implement a static single-file localStorage MVP.",
            &read_import_source_context(&root),
        );

        assert!(prompt.contains("Apply the bundled Hyperwiki planning contract"));
        assert!(prompt.contains("one wiki/plans/mvp/stage-01-*.mdx stage page"));
        assert!(prompt
            .contains("at least two wiki/plans/mvp/stage-01-*/unit-*.mdx executable unit pages"));
        assert!(prompt.contains("do not produce a generic single \"Confirmed MVP Slice\" unit"));
        assert!(prompt.contains("localStorage persistence"));
    }

    #[test]
    fn deterministic_compiler_generates_valid_static_local_mvp_plan() {
        let root = temp_root("compiled-plan");
        make_imported_project(&root);
        let project = test_project(root.clone());
        let source_context = read_import_source_context(&root);
        let ready_context = "Reasoning: Decisions are complete.\nPlan intent: Create a root index.html Micro-Journal page with semantic markup, embedded CSS and JavaScript, localStorage restore/save behavior, debounce timing, clear-entry handling, responsive centered layout, and manual browser verification.";

        let artifacts =
            compile_import_mvp_plan_artifacts(&project, ready_context, &source_context).unwrap();
        assert_eq!(artifacts.len(), 6);
        assert!(artifacts
            .iter()
            .any(|artifact| artifact.path == "wiki/plans/index.mdx"));
        assert!(artifacts
            .iter()
            .any(|artifact| artifact.path.ends_with("unit-02-local-persistence.mdx")));
        let joined = artifacts
            .iter()
            .map(|artifact| artifact.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(joined.contains("root <code>index.html</code>"));
        assert!(joined.contains("localStorage"));
        assert!(joined.contains("debounced autosave"));
        assert!(joined.contains("load-on-open restore"));
        assert!(joined.contains("clear-entry"));
        assert!(joined.contains("manual browser verification"));

        write_generated_plan_artifacts(&root, &artifacts).unwrap();
        let validation = validate_import_plan_artifacts(&root);
        assert_eq!(validation.status, "valid");
        assert_eq!(
            validation
                .artifacts
                .iter()
                .filter(|artifact| artifact.intended_path.contains("/unit-"))
                .count(),
            3
        );
    }

    #[test]
    fn deterministic_compiler_requires_source_evidence() {
        let root = temp_root("compiled-plan-empty-source");
        let project = test_project(root);
        let error = compile_import_mvp_plan_artifacts(&project, "", "").unwrap_err();
        assert_eq!(error.0, 422);
        assert!(error.1.contains("without enough source evidence"));
    }
}
