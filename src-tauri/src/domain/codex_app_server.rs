use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnRequest {
    pub prompt: String,
    #[serde(default)]
    pub current_page: String,
    #[serde(default)]
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnResponse {
    pub ok: bool,
    pub transport: String,
    pub project_id: String,
    pub request_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub text: String,
    pub first_delta_ms: Option<u128>,
    pub elapsed_ms: u128,
    pub plan_detected: bool,
    pub events: usize,
    pub metrics: CodexAdapterMetrics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnStartResponse {
    pub ok: bool,
    pub run_id: String,
    pub session_id: String,
    pub status: String,
    pub project_id: String,
    pub request_id: String,
    pub run: Option<ImportOnboardingRunRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnStatusResponse {
    pub ok: bool,
    pub run_id: String,
    pub session_id: String,
    pub status: String,
    pub phase: String,
    pub session: Option<ImportOnboardingSessionRecord>,
    pub run: Option<ImportOnboardingRunRecord>,
    pub snapshot: Option<CodexTurnSnapshot>,
    pub question: Option<Value>,
    pub retryable: bool,
    pub response: Option<CodexTurnResponse>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnSnapshot {
    pub phase: String,
    pub text: String,
    pub text_tail: String,
    pub events: usize,
    pub first_delta_ms: Option<u128>,
    pub last_event_ms: Option<u128>,
    pub elapsed_ms: u128,
    pub turn_id: String,
    pub schema_error: Option<String>,
    pub candidate_count: usize,
    pub metrics: CodexAdapterMetrics,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexAdapterMetrics {
    pub provider_ready_ms: Option<u128>,
    pub thread_ready_ms: Option<u128>,
    pub turn_requested_ms: Option<u128>,
    pub first_event_ms: Option<u128>,
    pub first_delta_ms: Option<u128>,
    pub completed_ms: Option<u128>,
    pub elapsed_ms: u128,
    pub events: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingSessionRecord {
    pub project_id: String,
    pub session_id: String,
    pub status: String,
    pub phase: String,
    pub current_run_id: Option<String>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingRunRecord {
    pub project_id: String,
    pub session_id: String,
    pub run_id: String,
    pub request_id: String,
    pub status: String,
    pub phase: String,
    pub retryable: bool,
    pub started_at_ms: u128,
    pub updated_at_ms: u128,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOnboardingEvent {
    pub kind: String,
    pub seq: u64,
    pub timestamp_ms: u128,
    pub project_id: String,
    pub session_id: String,
    pub run_id: String,
    pub request_id: String,
    pub phase: String,
    pub message: String,
}

#[derive(Debug)]
struct AppServer {
    child: Child,
    stdin: ChildStdin,
    state: Arc<(Mutex<AppServerState>, Condvar)>,
    next_id: AtomicU64,
}

#[derive(Debug, Default)]
struct AppServerState {
    lines: Vec<Value>,
    initialized: bool,
}

#[derive(Debug, Default)]
struct ImportThreadRegistry {
    by_project: HashMap<String, String>,
}

#[derive(Debug, Default)]
struct TurnRunRegistry {
    by_id: HashMap<String, TurnRunState>,
    sessions_by_project: HashMap<String, ImportOnboardingSessionRecord>,
    runs_by_id: HashMap<String, ImportOnboardingRunRecord>,
    events: VecDeque<ImportOnboardingEvent>,
    next_event_seq: u64,
}

#[derive(Debug)]
enum TurnRunState {
    Running(CodexTurnSnapshot),
    Complete(CodexTurnResponse),
    Failed(String),
    Cancelled(String),
}

#[derive(Debug, Clone)]
enum CodexAdapterEvent {
    TurnStarted { turn_id: String },
    AssistantDelta { delta: String },
    AgentMessageCompleted { text: String },
    TurnCompleted { turn_id: String },
    Error { message: String },
    Other,
}

const APP_SERVER_TURN_TIMEOUT: Duration = Duration::from_secs(120);
const APP_SERVER_FIRST_EVENT_PROGRESS_AFTER: Duration = Duration::from_secs(3);
const APP_SERVER_FIRST_EVENT_FALLBACK_AFTER: Duration = Duration::from_secs(10);
const EXEC_JSON_TURN_TIMEOUT: Duration = Duration::from_secs(120);
const FIRST_EVENT_TIMEOUT_MESSAGE: &str =
    "Codex app-server accepted the turn but did not emit a first event.";

fn app_server() -> &'static Mutex<Option<AppServer>> {
    static SERVER: OnceLock<Mutex<Option<AppServer>>> = OnceLock::new();
    SERVER.get_or_init(|| Mutex::new(None))
}

fn import_threads() -> &'static Mutex<ImportThreadRegistry> {
    static THREADS: OnceLock<Mutex<ImportThreadRegistry>> = OnceLock::new();
    THREADS.get_or_init(|| Mutex::new(ImportThreadRegistry::default()))
}

fn turn_runs() -> &'static Mutex<TurnRunRegistry> {
    static RUNS: OnceLock<Mutex<TurnRunRegistry>> = OnceLock::new();
    RUNS.get_or_init(|| Mutex::new(TurnRunRegistry::default()))
}

pub fn start_import_planning_turn(
    project: crate::domain::projects::ProjectRecord,
    request: CodexTurnRequest,
    app: Option<tauri::AppHandle>,
) -> Result<CodexTurnStartResponse, (u16, String)> {
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err((400, "Prompt is required.".to_string()));
    }
    let request_id = if request.request_id.trim().is_empty() {
        format!("import-turn:{}", monotonic_id())
    } else {
        request.request_id.clone()
    };
    let project_id = project.id.clone();
    let run_id = format!("codex-import-turn:{}:{}", project.id, monotonic_id());
    let (session_id, run_record, duplicate) = start_run_record(&project.id, &run_id, &request_id)?;
    let run_id = run_record.run_id.clone();
    emit_onboarding_event(
        app.as_ref(),
        &run_record,
        if duplicate {
            "run_joined"
        } else {
            "run_started"
        },
        "starting",
        if duplicate {
            "Import onboarding joined an active Codex run."
        } else {
            "Import onboarding Codex run started."
        },
    );
    if duplicate {
        return Ok(CodexTurnStartResponse {
            ok: true,
            run_id,
            session_id,
            status: "running".to_string(),
            project_id,
            request_id,
            run: Some(run_record),
        });
    }
    let run_id_for_thread = run_id.clone();
    let request_for_thread = CodexTurnRequest {
        request_id: request_id.clone(),
        ..request
    };
    thread::spawn(move || {
        let result = run_import_planning_turn(
            &project,
            &run_id_for_thread,
            request_for_thread,
            app.clone(),
        );
        if result.is_err() {
            reset_app_server();
        }
        match result {
            Ok(response) => {
                let _ = complete_run_record(&run_id_for_thread, response, app.as_ref());
            }
            Err((_, error)) => {
                let _ = fail_run_record(&run_id_for_thread, error, app.as_ref());
            }
        }
    });
    Ok(CodexTurnStartResponse {
        ok: true,
        run_id,
        session_id,
        status: "running".to_string(),
        project_id,
        request_id,
        run: Some(run_record),
    })
}

pub fn retry_import_planning_turn(
    project: crate::domain::projects::ProjectRecord,
    request: CodexTurnRequest,
    app: Option<tauri::AppHandle>,
) -> Result<CodexTurnStartResponse, (u16, String)> {
    start_import_planning_turn(project, request, app)
}

pub fn import_planning_turn_status(run_id: &str) -> Result<CodexTurnStatusResponse, (u16, String)> {
    if run_id.trim().is_empty() {
        return Err((
            400,
            "Import planning turn status requires a run id.".to_string(),
        ));
    }
    let runs = turn_runs()
        .lock()
        .map_err(|_| (500, "Codex turn run registry lock is poisoned.".to_string()))?;
    let Some(state) = runs.by_id.get(run_id) else {
        return Err((404, "Import planning turn run not found.".to_string()));
    };
    let run = runs.runs_by_id.get(run_id).cloned();
    let session_id = run
        .as_ref()
        .map(|record| record.session_id.clone())
        .unwrap_or_default();
    let session = run
        .as_ref()
        .and_then(|record| runs.sessions_by_project.get(&record.project_id))
        .cloned();
    let (status, phase, snapshot, response, error, retryable) = match state {
        TurnRunState::Running(snapshot) => (
            "running".to_string(),
            snapshot.phase.clone(),
            Some(snapshot.clone()),
            None,
            None,
            false,
        ),
        TurnRunState::Complete(response) => (
            "complete".to_string(),
            "complete".to_string(),
            None,
            Some(response.clone()),
            None,
            false,
        ),
        TurnRunState::Failed(error) => (
            "failed".to_string(),
            if is_stall_error(error) {
                "stalled".to_string()
            } else {
                "failed".to_string()
            },
            None,
            None,
            Some(error.clone()),
            true,
        ),
        TurnRunState::Cancelled(error) => (
            "cancelled".to_string(),
            "cancelled".to_string(),
            None,
            None,
            Some(error.clone()),
            true,
        ),
    };
    Ok(CodexTurnStatusResponse {
        ok: error.is_none(),
        run_id: run_id.to_string(),
        session_id,
        status,
        phase,
        session,
        run,
        snapshot,
        question: None,
        retryable,
        response,
        error,
    })
}

pub fn cancel_import_planning_turn(
    run_id: &str,
    app: Option<tauri::AppHandle>,
) -> Result<CodexTurnStatusResponse, (u16, String)> {
    if run_id.trim().is_empty() {
        return Err((400, "Cancel requires a run id.".to_string()));
    }
    let record = {
        let mut registry = turn_runs()
            .lock()
            .map_err(|_| (500, "Codex turn run registry lock is poisoned.".to_string()))?;
        let record = {
            let Some(run) = registry.runs_by_id.get_mut(run_id) else {
                return Err((404, "Import planning turn run not found.".to_string()));
            };
            run.status = "cancelled".to_string();
            run.phase = "cancelled".to_string();
            run.retryable = true;
            run.error = Some("Import onboarding run cancelled.".to_string());
            run.updated_at_ms = unix_time_ms();
            run.clone()
        };
        registry.by_id.insert(
            run_id.to_string(),
            TurnRunState::Cancelled("Import onboarding run cancelled.".to_string()),
        );
        update_session_from_run(&mut registry, &record);
        record
    };
    emit_onboarding_event(
        app.as_ref(),
        &record,
        "run_cancelled",
        "cancelled",
        "Import onboarding run cancelled.",
    );
    import_planning_turn_status(run_id)
}

fn is_stall_error(error: &str) -> bool {
    let lower = error.to_lowercase();
    lower.contains("timed out") || lower.contains("did not emit")
}

fn empty_snapshot(phase: &str) -> CodexTurnSnapshot {
    CodexTurnSnapshot {
        phase: phase.to_string(),
        text: String::new(),
        text_tail: String::new(),
        events: 0,
        first_delta_ms: None,
        last_event_ms: None,
        elapsed_ms: 0,
        turn_id: String::new(),
        schema_error: None,
        candidate_count: 0,
        metrics: CodexAdapterMetrics::default(),
    }
}

fn update_run_snapshot(run_id: &str, snapshot: CodexTurnSnapshot) {
    if let Ok(mut runs) = turn_runs().lock() {
        if matches!(runs.by_id.get(run_id), Some(TurnRunState::Running(_))) {
            let phase = snapshot.phase.clone();
            runs.by_id
                .insert(run_id.to_string(), TurnRunState::Running(snapshot));
            if let Some(run) = runs.runs_by_id.get_mut(run_id) {
                run.phase = phase;
                run.updated_at_ms = unix_time_ms();
                let record = run.clone();
                update_session_from_run(&mut runs, &record);
            }
        }
    }
}

fn start_run_record(
    project_id: &str,
    run_id: &str,
    request_id: &str,
) -> Result<(String, ImportOnboardingRunRecord, bool), (u16, String)> {
    let now = unix_time_ms();
    let mut registry = turn_runs()
        .lock()
        .map_err(|_| (500, "Codex turn run registry lock is poisoned.".to_string()))?;
    if let Some(existing) = registry.runs_by_id.values().find(|run| {
        run.project_id == project_id && run.request_id == request_id && run.status == "running"
    }) {
        return Ok((existing.session_id.clone(), existing.clone(), true));
    }
    let session_id = registry
        .sessions_by_project
        .entry(project_id.to_string())
        .or_insert_with(|| ImportOnboardingSessionRecord {
            project_id: project_id.to_string(),
            session_id: format!("import-onboarding:{}:{}", project_id, monotonic_id()),
            status: "running".to_string(),
            phase: "starting".to_string(),
            current_run_id: Some(run_id.to_string()),
            created_at_ms: now,
            updated_at_ms: now,
        })
        .session_id
        .clone();
    let run_record = ImportOnboardingRunRecord {
        project_id: project_id.to_string(),
        session_id: session_id.clone(),
        run_id: run_id.to_string(),
        request_id: request_id.to_string(),
        status: "running".to_string(),
        phase: "starting".to_string(),
        retryable: false,
        started_at_ms: now,
        updated_at_ms: now,
        error: None,
    };
    registry.by_id.insert(
        run_id.to_string(),
        TurnRunState::Running(empty_snapshot("starting")),
    );
    registry
        .runs_by_id
        .insert(run_id.to_string(), run_record.clone());
    if let Some(session) = registry.sessions_by_project.get_mut(project_id) {
        session.status = "running".to_string();
        session.phase = "starting".to_string();
        session.current_run_id = Some(run_id.to_string());
        session.updated_at_ms = now;
    }
    Ok((session_id, run_record, false))
}

fn complete_run_record(
    run_id: &str,
    response: CodexTurnResponse,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    let record = {
        let mut registry = turn_runs()
            .lock()
            .map_err(|_| (500, "Codex turn run registry lock is poisoned.".to_string()))?;
        if matches!(registry.by_id.get(run_id), Some(TurnRunState::Cancelled(_))) {
            return Ok(());
        }
        registry
            .by_id
            .insert(run_id.to_string(), TurnRunState::Complete(response));
        let Some(run) = registry.runs_by_id.get_mut(run_id) else {
            return Ok(());
        };
        run.status = "complete".to_string();
        run.phase = "complete".to_string();
        run.retryable = false;
        run.error = None;
        run.updated_at_ms = unix_time_ms();
        let record = run.clone();
        update_session_from_run(&mut registry, &record);
        record
    };
    emit_onboarding_event(
        app,
        &record,
        "run_completed",
        "complete",
        "Import onboarding Codex run completed.",
    );
    Ok(())
}

fn fail_run_record(
    run_id: &str,
    error: String,
    app: Option<&tauri::AppHandle>,
) -> Result<(), (u16, String)> {
    let phase = if is_stall_error(&error) {
        "stalled"
    } else if error.to_lowercase().contains("cancel") {
        "cancelled"
    } else {
        "failed"
    };
    let record = {
        let mut registry = turn_runs()
            .lock()
            .map_err(|_| (500, "Codex turn run registry lock is poisoned.".to_string()))?;
        if matches!(registry.by_id.get(run_id), Some(TurnRunState::Cancelled(_))) {
            return Ok(());
        }
        registry
            .by_id
            .insert(run_id.to_string(), TurnRunState::Failed(error.clone()));
        let Some(run) = registry.runs_by_id.get_mut(run_id) else {
            return Ok(());
        };
        run.status = "failed".to_string();
        run.phase = phase.to_string();
        run.retryable = true;
        run.error = Some(error);
        run.updated_at_ms = unix_time_ms();
        let record = run.clone();
        update_session_from_run(&mut registry, &record);
        record
    };
    emit_onboarding_event(
        app,
        &record,
        "run_failed",
        phase,
        "Import onboarding Codex run failed.",
    );
    Ok(())
}

fn update_session_from_run(registry: &mut TurnRunRegistry, run: &ImportOnboardingRunRecord) {
    if let Some(session) = registry.sessions_by_project.get_mut(&run.project_id) {
        session.status = run.status.clone();
        session.phase = run.phase.clone();
        session.current_run_id = Some(run.run_id.clone());
        session.updated_at_ms = unix_time_ms();
    }
}

fn emit_onboarding_event(
    app: Option<&tauri::AppHandle>,
    run: &ImportOnboardingRunRecord,
    kind: &str,
    phase: &str,
    message: &str,
) {
    let event = {
        let mut registry = match turn_runs().lock() {
            Ok(registry) => registry,
            Err(_) => return,
        };
        registry.next_event_seq = registry.next_event_seq.saturating_add(1);
        let event = ImportOnboardingEvent {
            kind: kind.to_string(),
            seq: registry.next_event_seq,
            timestamp_ms: unix_time_ms(),
            project_id: run.project_id.clone(),
            session_id: run.session_id.clone(),
            run_id: run.run_id.clone(),
            request_id: run.request_id.clone(),
            phase: phase.to_string(),
            message: message.to_string(),
        };
        registry.events.push_back(event.clone());
        while registry.events.len() > 200 {
            registry.events.pop_front();
        }
        event
    };
    if let Some(app) = app {
        let _ = app.emit("import-onboarding://event", event);
    }
}

fn run_record(run_id: &str) -> Option<ImportOnboardingRunRecord> {
    turn_runs()
        .lock()
        .ok()
        .and_then(|registry| registry.runs_by_id.get(run_id).cloned())
}

fn is_run_cancelled(run_id: &str) -> bool {
    turn_runs()
        .lock()
        .ok()
        .map(|registry| matches!(registry.by_id.get(run_id), Some(TurnRunState::Cancelled(_))))
        .unwrap_or(false)
}

fn unix_time_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn reset_app_server() {
    if let Ok(mut server_guard) = app_server().lock() {
        if let Some(mut server) = server_guard.take() {
            let _ = server.child.kill();
        }
    }
    if let Ok(mut threads) = import_threads().lock() {
        threads.by_project.clear();
    }
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

pub fn run_import_planning_turn(
    project: &crate::domain::projects::ProjectRecord,
    run_id: &str,
    request: CodexTurnRequest,
    app: Option<tauri::AppHandle>,
) -> Result<CodexTurnResponse, (u16, String)> {
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err((400, "Prompt is required.".to_string()));
    }
    let start = Instant::now();
    let request_id = if request.request_id.trim().is_empty() {
        format!("import-turn:{}", start.elapsed().as_nanos())
    } else {
        request.request_id.clone()
    };

    let app_server_attempt = {
        let mut server_guard = app_server()
            .lock()
            .map_err(|_| (500, "Codex app-server lock is poisoned.".to_string()))?;
        let server = ensure_app_server(&mut server_guard)?;
        let provider_ready_ms = Some(start.elapsed().as_millis());
        let thread_id = ensure_import_thread(server, project)?;
        let thread_ready_ms = Some(start.elapsed().as_millis());
        update_run_snapshot(
            run_id,
            CodexTurnSnapshot {
                phase: "thread_ready".to_string(),
                metrics: CodexAdapterMetrics {
                    provider_ready_ms,
                    thread_ready_ms,
                    elapsed_ms: start.elapsed().as_millis(),
                    ..CodexAdapterMetrics::default()
                },
                ..empty_snapshot("thread_ready")
            },
        );
        if let Some(record) = run_record(run_id) {
            emit_onboarding_event(
                app.as_ref(),
                &record,
                "provider_ready",
                "thread_ready",
                "Codex provider and import thread are ready.",
            );
        }
        let before_index = server.line_count();
        let turn_request_id = server.next_request_id();
        let params = json!({
            "threadId": thread_id,
            "input": [{
                "type": "text",
                "text": prompt,
                "text_elements": []
            }],
            "cwd": project.root,
            "model": "gpt-5.5",
            "effort": "low",
            "approvalPolicy": "never",
            "sandboxPolicy": { "type": "dangerFullAccess" },
            "responsesapiClientMetadata": {
                "hyperwiki_request_id": request_id,
                "hyperwiki_project_id": project.id.clone(),
                "hyperwiki_surface": "import-planning"
            }
        });
        eprintln!(
            "[hyperwiki] codex app-server turn start project_id={} request_id={} thread_id={} prompt_chars={}",
            project.id,
            request_id,
            thread_id,
            prompt.chars().count()
        );
        server.send(turn_request_id, "turn/start", params)?;
        let turn_requested_ms = Some(start.elapsed().as_millis());
        update_run_snapshot(
            run_id,
            CodexTurnSnapshot {
                phase: "turn_requested".to_string(),
                elapsed_ms: start.elapsed().as_millis(),
                metrics: CodexAdapterMetrics {
                    provider_ready_ms,
                    thread_ready_ms,
                    turn_requested_ms,
                    elapsed_ms: start.elapsed().as_millis(),
                    ..CodexAdapterMetrics::default()
                },
                ..empty_snapshot("turn_requested")
            },
        );
        if let Some(record) = run_record(run_id) {
            emit_onboarding_event(
                app.as_ref(),
                &record,
                "run_progress",
                "turn_requested",
                "Codex turn requested.",
            );
        }
        let timing_marks = CodexAdapterTimingMarks {
            provider_ready_ms,
            thread_ready_ms,
            turn_requested_ms,
        };
        let result = server.wait_for_turn(
            &thread_id,
            before_index,
            APP_SERVER_TURN_TIMEOUT,
            run_id,
            timing_marks,
            app.as_ref(),
        );
        (
            thread_id,
            provider_ready_ms,
            thread_ready_ms,
            turn_requested_ms,
            result,
        )
    };

    let (thread_id, provider_ready_ms, thread_ready_ms, turn_requested_ms, result) =
        app_server_attempt;
    let result = match result {
        Ok(result) => result,
        Err((_, error)) if is_first_event_timeout_error(&error) => {
            eprintln!(
                "[hyperwiki] codex app-server first event timeout; falling back to exec json project_id={} request_id={} thread_id={} elapsed_ms={}",
                project.id,
                request_id,
                thread_id,
                start.elapsed().as_millis()
            );
            reset_app_server();
            return run_exec_json_turn(
                project,
                run_id,
                &request_id,
                prompt,
                app.as_ref(),
                Some(&error),
            );
        }
        Err(error) => return Err(error),
    };
    let elapsed_ms = start.elapsed().as_millis();
    let metrics = CodexAdapterMetrics {
        provider_ready_ms,
        thread_ready_ms,
        turn_requested_ms,
        first_event_ms: result.first_event_ms,
        first_delta_ms: result.first_delta_ms,
        completed_ms: Some(elapsed_ms),
        elapsed_ms,
        events: result.events,
    };
    eprintln!(
        "[hyperwiki] codex app-server turn complete project_id={} request_id={} thread_id={} turn_id={} chars={} provider_ready_ms={:?} thread_ready_ms={:?} turn_requested_ms={:?} first_event_ms={:?} first_delta_ms={:?} elapsed_ms={} events={}",
        project.id,
        request_id,
        thread_id,
        result.turn_id,
        result.text.chars().count(),
        provider_ready_ms,
        thread_ready_ms,
        turn_requested_ms,
        result.first_event_ms,
        result.first_delta_ms,
        elapsed_ms,
        result.events
    );
    Ok(CodexTurnResponse {
        ok: true,
        transport: "codex-app-server".to_string(),
        project_id: project.id.clone(),
        request_id,
        thread_id,
        turn_id: result.turn_id,
        text: result.text,
        first_delta_ms: result.first_delta_ms,
        elapsed_ms,
        plan_detected: crate::domain::import_planning::has_generated_plan_pages(&project.root),
        events: result.events,
        metrics,
    })
}

fn is_first_event_timeout_error(error: &str) -> bool {
    error.contains(FIRST_EVENT_TIMEOUT_MESSAGE)
}

fn run_exec_json_turn(
    project: &crate::domain::projects::ProjectRecord,
    run_id: &str,
    request_id: &str,
    prompt: &str,
    app: Option<&tauri::AppHandle>,
    fallback_reason: Option<&str>,
) -> Result<CodexTurnResponse, (u16, String)> {
    let start = Instant::now();
    let timing_marks = CodexAdapterTimingMarks {
        provider_ready_ms: Some(0),
        thread_ready_ms: None,
        turn_requested_ms: Some(0),
    };
    update_run_snapshot(
        run_id,
        turn_snapshot(
            "exec_json_fallback",
            "",
            0,
            None,
            None,
            None,
            0,
            "codex-exec-json",
            fallback_reason,
            timing_marks,
        ),
    );
    if let Some(record) = run_record(run_id) {
        emit_onboarding_event(
            app,
            &record,
            "run_progress",
            "exec_json_fallback",
            "Codex app-server was quiet; trying codex exec JSON.",
        );
    }

    let mut child = Command::new("codex")
        .args([
            "exec",
            "--json",
            "--model",
            "gpt-5.5",
            "--skip-git-repo-check",
            "--",
            prompt,
        ])
        .current_dir(&project.root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| {
            (
                502,
                format!("Failed to start codex exec JSON fallback: {error}"),
            )
        })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        (
            502,
            "Failed to capture codex exec JSON fallback output.".to_string(),
        )
    })?;
    let (tx, rx) = mpsc::channel::<Result<Value, String>>();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) if line.trim().is_empty() => {}
                Ok(line) => {
                    let parsed = serde_json::from_str::<Value>(&line).map_err(|error| {
                        format!("Failed to parse codex exec JSON event: {error}; line={line}")
                    });
                    if tx.send(parsed).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = tx.send(Err(format!(
                        "Failed to read codex exec JSON fallback output: {error}"
                    )));
                    break;
                }
            }
        }
    });

    let deadline = start + EXEC_JSON_TURN_TIMEOUT;
    let mut thread_id = "codex-exec-json".to_string();
    let mut turn_id = "codex-exec-json".to_string();
    let mut text = String::new();
    let mut first_event_ms = None;
    let mut first_delta_ms = None;
    let mut events = 0usize;

    loop {
        if is_run_cancelled(run_id) {
            let _ = child.kill();
            return Err((499, "Import onboarding run cancelled.".to_string()));
        }
        let now = Instant::now();
        if now >= deadline {
            let _ = child.kill();
            return Err((504, "Codex exec JSON fallback timed out.".to_string()));
        }
        let wait = deadline
            .saturating_duration_since(now)
            .min(Duration::from_millis(250));
        match rx.recv_timeout(wait) {
            Ok(Ok(value)) => {
                events += 1;
                let elapsed_ms = start.elapsed().as_millis();
                if first_event_ms.is_none() {
                    first_event_ms = Some(elapsed_ms);
                }
                let last_event_ms = Some(elapsed_ms);
                match value["type"].as_str().unwrap_or_default() {
                    "thread.started" => {
                        if let Some(id) = value["thread_id"].as_str() {
                            thread_id = id.to_string();
                        }
                    }
                    "turn.started" => {
                        if let Some(id) = value["turn_id"].as_str() {
                            turn_id = id.to_string();
                        }
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "turn_started",
                                &text,
                                events,
                                first_event_ms,
                                first_delta_ms,
                                last_event_ms,
                                elapsed_ms,
                                &turn_id,
                                None,
                                timing_marks,
                            ),
                        );
                    }
                    "item.completed" if value["item"]["type"].as_str() == Some("agent_message") => {
                        text = exec_agent_message_text(&value["item"]);
                        if first_delta_ms.is_none() {
                            first_delta_ms = Some(elapsed_ms);
                        }
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "streaming",
                                &text,
                                events,
                                first_event_ms,
                                first_delta_ms,
                                last_event_ms,
                                elapsed_ms,
                                &turn_id,
                                None,
                                timing_marks,
                            ),
                        );
                        if let Some(record) = run_record(run_id) {
                            emit_onboarding_event(
                                app,
                                &record,
                                "assistant_delta",
                                "streaming",
                                "Codex exec JSON produced assistant text.",
                            );
                        }
                    }
                    "turn.completed" => {
                        let elapsed_ms = start.elapsed().as_millis();
                        let metrics = CodexAdapterMetrics {
                            provider_ready_ms: Some(0),
                            thread_ready_ms: None,
                            turn_requested_ms: Some(0),
                            first_event_ms,
                            first_delta_ms,
                            completed_ms: Some(elapsed_ms),
                            elapsed_ms,
                            events,
                        };
                        eprintln!(
                            "[hyperwiki] codex exec json fallback complete project_id={} request_id={} thread_id={} turn_id={} chars={} first_event_ms={:?} first_delta_ms={:?} elapsed_ms={} events={}",
                            project.id,
                            request_id,
                            thread_id,
                            turn_id,
                            text.chars().count(),
                            first_event_ms,
                            first_delta_ms,
                            elapsed_ms,
                            events
                        );
                        let _ = child.kill();
                        return Ok(CodexTurnResponse {
                            ok: true,
                            transport: "codex-exec-json".to_string(),
                            project_id: project.id.clone(),
                            request_id: request_id.to_string(),
                            thread_id,
                            turn_id,
                            text,
                            first_delta_ms,
                            elapsed_ms,
                            plan_detected: crate::domain::import_planning::has_generated_plan_pages(
                                &project.root,
                            ),
                            events,
                            metrics,
                        });
                    }
                    "error" => {
                        let _ = child.kill();
                        return Err((
                            502,
                            format!("Codex exec JSON fallback failed: {}", value["message"]),
                        ));
                    }
                    _ => {}
                }
            }
            Ok(Err(error)) => {
                let _ = child.kill();
                return Err((502, error));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Some(status) = child
                    .try_wait()
                    .map_err(|error| (500, format!("Failed to poll codex exec JSON: {error}")))?
                {
                    if text.trim().is_empty() {
                        return Err((
                            502,
                            format!(
                                "Codex exec JSON fallback exited before assistant text: {status}"
                            ),
                        ));
                    }
                    return Err((
                        502,
                        format!("Codex exec JSON fallback exited before turn completion: {status}"),
                    ));
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Some(status) = child
                    .try_wait()
                    .map_err(|error| (500, format!("Failed to poll codex exec JSON: {error}")))?
                {
                    return Err((
                        502,
                        format!("Codex exec JSON fallback exited before turn completion: {status}"),
                    ));
                }
                let _ = child.kill();
                return Err((
                    502,
                    "Codex exec JSON fallback output closed before turn completion.".to_string(),
                ));
            }
        }
    }
}

fn exec_agent_message_text(item: &Value) -> String {
    if let Some(text) = item["text"].as_str() {
        return text.to_string();
    }
    if let Some(content) = item["content"].as_array() {
        return content
            .iter()
            .filter_map(|part| part["text"].as_str())
            .collect::<Vec<_>>()
            .join("");
    }
    String::new()
}

fn ensure_app_server(
    server_guard: &mut Option<AppServer>,
) -> Result<&mut AppServer, (u16, String)> {
    let needs_start = match server_guard {
        Some(server) => server
            .child
            .try_wait()
            .map(|status| status.is_some())
            .unwrap_or(true),
        None => true,
    };
    if needs_start {
        *server_guard = Some(AppServer::start()?);
    }
    let server = server_guard
        .as_mut()
        .ok_or_else(|| (500, "Codex app-server did not start.".to_string()))?;
    server.initialize()?;
    Ok(server)
}

fn ensure_import_thread(
    server: &mut AppServer,
    project: &crate::domain::projects::ProjectRecord,
) -> Result<String, (u16, String)> {
    if let Some(thread_id) = import_threads()
        .lock()
        .map_err(|_| (500, "Import thread registry lock is poisoned.".to_string()))?
        .by_project
        .get(&project.id)
        .cloned()
    {
        return Ok(thread_id);
    }
    let request_id = server.next_request_id();
    let params = json!({
        "cwd": project.root,
        "model": "gpt-5.5",
        "config": {
            "model_reasoning_effort": "low",
            "plan_mode_reasoning_effort": "low"
        },
        "sandbox": "danger-full-access",
        "approvalPolicy": "never",
        "threadSource": "user",
        "ephemeral": false
    });
    let response = server.request(request_id, "thread/start", params, Duration::from_secs(30))?;
    let thread_id = response["thread"]["id"]
        .as_str()
        .ok_or_else(|| {
            (
                502,
                "Codex app-server thread/start response had no thread id.".to_string(),
            )
        })?
        .to_string();
    import_threads()
        .lock()
        .map_err(|_| (500, "Import thread registry lock is poisoned.".to_string()))?
        .by_project
        .insert(project.id.clone(), thread_id.clone());
    eprintln!(
        "[hyperwiki] codex app-server thread ready project_id={} thread_id={}",
        project.id, thread_id
    );
    Ok(thread_id)
}

impl AppServer {
    fn start() -> Result<Self, (u16, String)> {
        let mut child = Command::new("codex")
            .args([
                "app-server",
                "--listen",
                "stdio://",
                "-c",
                "model=\"gpt-5.5\"",
                "-c",
                "model_reasoning_effort=\"low\"",
                "-c",
                "plan_mode_reasoning_effort=\"low\"",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|error| (502, format!("Failed to start codex app-server: {error}")))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| (502, "Codex app-server stdout was unavailable.".to_string()))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| (502, "Codex app-server stdin was unavailable.".to_string()))?;
        let state = Arc::new((Mutex::new(AppServerState::default()), Condvar::new()));
        let reader_state = Arc::clone(&state);
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<Value>(&line) {
                    Ok(value) => {
                        let (lock, condvar) = &*reader_state;
                        if let Ok(mut state) = lock.lock() {
                            state.lines.push(value);
                            condvar.notify_all();
                        }
                    }
                    Err(error) => {
                        eprintln!("[hyperwiki] codex app-server emitted invalid json: {error}");
                    }
                }
            }
        });
        eprintln!("[hyperwiki] codex app-server started transport=stdio");
        Ok(Self {
            child,
            stdin,
            state,
            next_id: AtomicU64::new(1),
        })
    }

    fn initialize(&mut self) -> Result<(), (u16, String)> {
        {
            let (lock, _) = &*self.state;
            if lock.lock().map(|state| state.initialized).unwrap_or(false) {
                return Ok(());
            }
        }
        let request_id = self.next_request_id();
        let _ = self.request(
            request_id,
            "initialize",
            json!({
                "clientInfo": {
                    "name": "hyperwiki",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": null
            }),
            Duration::from_secs(15),
        )?;
        let (lock, _) = &*self.state;
        if let Ok(mut state) = lock.lock() {
            state.initialized = true;
        }
        eprintln!("[hyperwiki] codex app-server initialized");
        Ok(())
    }

    fn next_request_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }

    fn line_count(&self) -> usize {
        let (lock, _) = &*self.state;
        lock.lock().map(|state| state.lines.len()).unwrap_or(0)
    }

    fn send(&mut self, id: u64, method: &str, params: Value) -> Result<(), (u16, String)> {
        let payload = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        let line = serde_json::to_string(&payload)
            .map_err(|error| (500, format!("Failed to encode Codex request: {error}")))?;
        self.stdin
            .write_all(line.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|error| {
                (
                    502,
                    format!("Failed to write Codex app-server request: {error}"),
                )
            })
    }

    fn request(
        &mut self,
        id: u64,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, (u16, String)> {
        let before_index = self.line_count();
        self.send(id, method, params)?;
        let deadline = Instant::now() + timeout;
        let (lock, condvar) = &*self.state;
        let mut state = lock
            .lock()
            .map_err(|_| (500, "Codex app-server state lock is poisoned.".to_string()))?;
        loop {
            if let Some(value) = state
                .lines
                .iter()
                .skip(before_index)
                .find(|value| value["id"].as_u64() == Some(id))
            {
                if !value["error"].is_null() {
                    return Err((
                        502,
                        format!("Codex app-server {method} failed: {}", value["error"]),
                    ));
                }
                return Ok(value["result"].clone());
            }
            let now = Instant::now();
            if now >= deadline {
                return Err((504, format!("Codex app-server {method} timed out.")));
            }
            let wait = deadline
                .saturating_duration_since(now)
                .min(Duration::from_millis(250));
            let (next_state, _) = condvar
                .wait_timeout(state, wait)
                .map_err(|_| (500, "Codex app-server condvar wait failed.".to_string()))?;
            state = next_state;
        }
    }

    fn wait_for_turn(
        &self,
        thread_id: &str,
        before_index: usize,
        timeout: Duration,
        run_id: &str,
        timing_marks: CodexAdapterTimingMarks,
        app: Option<&tauri::AppHandle>,
    ) -> Result<TurnResult, (u16, String)> {
        let started_at = Instant::now();
        let deadline = started_at + timeout;
        let (lock, condvar) = &*self.state;
        let mut state = lock
            .lock()
            .map_err(|_| (500, "Codex app-server state lock is poisoned.".to_string()))?;
        let mut seen = before_index;
        let mut text = String::new();
        let mut turn_id = String::new();
        let mut first_event_ms = None;
        let mut first_delta_ms = None;
        let mut last_event_ms = None;
        let mut events = 0usize;
        let mut last_waiting_snapshot_ms = 0u128;
        loop {
            for value in state.lines.iter().skip(seen) {
                if is_run_cancelled(run_id) {
                    return Err((499, "Import onboarding run cancelled.".to_string()));
                }
                seen += 1;
                let Some(event) = normalize_turn_event(value, thread_id) else {
                    continue;
                };
                events += 1;
                let event_elapsed_ms = started_at.elapsed().as_millis();
                if first_event_ms.is_none() {
                    first_event_ms = Some(event_elapsed_ms);
                }
                last_event_ms = Some(event_elapsed_ms);
                match event {
                    CodexAdapterEvent::TurnStarted { turn_id: id } => {
                        if turn_id.is_empty() {
                            turn_id = id;
                        }
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "turn_started",
                                &text,
                                events,
                                first_event_ms,
                                first_delta_ms,
                                last_event_ms,
                                started_at.elapsed().as_millis(),
                                &turn_id,
                                None,
                                timing_marks,
                            ),
                        );
                        if let Some(record) = run_record(run_id) {
                            emit_onboarding_event(
                                app,
                                &record,
                                "run_progress",
                                "turn_started",
                                "Codex import-planning turn started.",
                            );
                        }
                    }
                    CodexAdapterEvent::AssistantDelta { delta } => {
                        let is_first_delta = first_delta_ms.is_none();
                        if first_delta_ms.is_none() {
                            first_delta_ms = Some(started_at.elapsed().as_millis());
                        }
                        text.push_str(&delta);
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "streaming",
                                &text,
                                events,
                                first_event_ms,
                                first_delta_ms,
                                last_event_ms,
                                started_at.elapsed().as_millis(),
                                &turn_id,
                                None,
                                timing_marks,
                            ),
                        );
                        if is_first_delta {
                            if let Some(record) = run_record(run_id) {
                                emit_onboarding_event(
                                    app,
                                    &record,
                                    "assistant_delta",
                                    "streaming",
                                    "Codex assistant text is streaming.",
                                );
                            }
                        }
                    }
                    CodexAdapterEvent::AgentMessageCompleted { text: full_text } => {
                        text = full_text;
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "streaming",
                                &text,
                                events,
                                first_event_ms,
                                first_delta_ms,
                                last_event_ms,
                                started_at.elapsed().as_millis(),
                                &turn_id,
                                None,
                                timing_marks,
                            ),
                        );
                    }
                    CodexAdapterEvent::Error { message } => {
                        return Err((502, format!("Codex app-server turn failed: {message}")));
                    }
                    CodexAdapterEvent::TurnCompleted {
                        turn_id: completed_turn_id,
                    } => {
                        if turn_id.is_empty() {
                            turn_id = completed_turn_id;
                        }
                        return Ok(TurnResult {
                            turn_id,
                            text,
                            first_event_ms,
                            first_delta_ms,
                            events,
                        });
                    }
                    CodexAdapterEvent::Other => {}
                }
            }
            let now = Instant::now();
            if now >= deadline {
                return Err((504, "Codex app-server turn timed out.".to_string()));
            }
            let elapsed = started_at.elapsed();
            let elapsed_ms = elapsed.as_millis();
            if events == 0 && elapsed >= APP_SERVER_FIRST_EVENT_FALLBACK_AFTER {
                update_run_snapshot(
                    run_id,
                    turn_snapshot(
                        "exec_json_fallback",
                        &text,
                        events,
                        first_event_ms,
                        first_delta_ms,
                        last_event_ms,
                        elapsed_ms,
                        &turn_id,
                        Some(FIRST_EVENT_TIMEOUT_MESSAGE),
                        timing_marks,
                    ),
                );
                if let Some(record) = run_record(run_id) {
                    emit_onboarding_event(
                        app,
                        &record,
                        "run_progress",
                        "exec_json_fallback",
                        "Codex app-server was quiet; trying codex exec JSON.",
                    );
                }
                return Err((504, FIRST_EVENT_TIMEOUT_MESSAGE.to_string()));
            }
            if events == 0
                && elapsed >= APP_SERVER_FIRST_EVENT_PROGRESS_AFTER
                && elapsed_ms.saturating_sub(last_waiting_snapshot_ms) >= 2_000
            {
                last_waiting_snapshot_ms = elapsed_ms;
                update_run_snapshot(
                    run_id,
                    turn_snapshot(
                        "waiting_for_first_event",
                        &text,
                        events,
                        first_event_ms,
                        first_delta_ms,
                        last_event_ms,
                        elapsed_ms,
                        &turn_id,
                        None,
                        timing_marks,
                    ),
                );
                if let Some(record) = run_record(run_id) {
                    emit_onboarding_event(
                        app,
                        &record,
                        "run_progress",
                        "waiting_for_first_event",
                        "Codex is still preparing the first app-server event.",
                    );
                }
            }
            if events > 0
                && first_delta_ms.is_none()
                && elapsed >= Duration::from_secs(25)
                && elapsed_ms.saturating_sub(last_waiting_snapshot_ms) >= 5_000
            {
                last_waiting_snapshot_ms = elapsed_ms;
                update_run_snapshot(
                    run_id,
                    turn_snapshot(
                        "waiting_for_assistant",
                        &text,
                        events,
                        first_event_ms,
                        first_delta_ms,
                        last_event_ms,
                        elapsed_ms,
                        &turn_id,
                        None,
                        timing_marks,
                    ),
                );
                if let Some(record) = run_record(run_id) {
                    emit_onboarding_event(
                        app,
                        &record,
                        "run_progress",
                        "waiting_for_assistant",
                        "Codex is still working; waiting for assistant text.",
                    );
                }
            }
            let wait = deadline
                .saturating_duration_since(now)
                .min(Duration::from_millis(250));
            let (next_state, _) = condvar
                .wait_timeout(state, wait)
                .map_err(|_| (500, "Codex app-server condvar wait failed.".to_string()))?;
            state = next_state;
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct CodexAdapterTimingMarks {
    provider_ready_ms: Option<u128>,
    thread_ready_ms: Option<u128>,
    turn_requested_ms: Option<u128>,
}

fn normalize_turn_event(value: &Value, thread_id: &str) -> Option<CodexAdapterEvent> {
    let method = value["method"].as_str().unwrap_or_default();
    let params = &value["params"];
    if params["threadId"].as_str() != Some(thread_id) {
        return None;
    }
    let fallback_turn_id = params["turnId"].as_str().unwrap_or_default().to_string();
    match method {
        "turn/started" => {
            let turn_id = params["turn"]["id"]
                .as_str()
                .map(str::to_string)
                .unwrap_or(fallback_turn_id);
            Some(CodexAdapterEvent::TurnStarted { turn_id })
        }
        "item/agentMessage/delta" => Some(CodexAdapterEvent::AssistantDelta {
            delta: params["delta"].as_str().unwrap_or_default().to_string(),
        }),
        "item/completed" if params["item"]["type"].as_str() == Some("agentMessage") => {
            Some(CodexAdapterEvent::AgentMessageCompleted {
                text: params["item"]["text"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
            })
        }
        "error" => Some(CodexAdapterEvent::Error {
            message: params["error"].to_string(),
        }),
        "turn/completed" => {
            let turn_id = params["turn"]["id"]
                .as_str()
                .map(str::to_string)
                .unwrap_or(fallback_turn_id);
            Some(CodexAdapterEvent::TurnCompleted { turn_id })
        }
        _ => Some(CodexAdapterEvent::Other),
    }
}

fn turn_snapshot(
    phase: &str,
    text: &str,
    events: usize,
    first_event_ms: Option<u128>,
    first_delta_ms: Option<u128>,
    last_event_ms: Option<u128>,
    elapsed_ms: u128,
    turn_id: &str,
    schema_error: Option<&str>,
    timing_marks: CodexAdapterTimingMarks,
) -> CodexTurnSnapshot {
    let text_tail = text
        .chars()
        .rev()
        .take(1200)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    CodexTurnSnapshot {
        phase: phase.to_string(),
        text: text.to_string(),
        text_tail,
        events,
        first_delta_ms,
        last_event_ms,
        elapsed_ms,
        turn_id: turn_id.to_string(),
        schema_error: schema_error.map(str::to_string),
        candidate_count: text.matches("hyperwiki-question").count(),
        metrics: CodexAdapterMetrics {
            provider_ready_ms: timing_marks.provider_ready_ms,
            thread_ready_ms: timing_marks.thread_ready_ms,
            turn_requested_ms: timing_marks.turn_requested_ms,
            first_event_ms,
            first_delta_ms,
            completed_ms: None,
            elapsed_ms,
            events,
        },
    }
}

#[derive(Debug)]
struct TurnResult {
    turn_id: String,
    text: String,
    first_event_ms: Option<u128>,
    first_delta_ms: Option<u128>,
    events: usize,
}

#[allow(dead_code)]
fn _path_for_debug(path: &Path) -> PathBuf {
    path.to_path_buf()
}
