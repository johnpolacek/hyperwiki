use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnStartResponse {
    pub ok: bool,
    pub run_id: String,
    pub status: String,
    pub project_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexTurnStatusResponse {
    pub ok: bool,
    pub run_id: String,
    pub status: String,
    pub phase: String,
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
}

#[derive(Debug)]
enum TurnRunState {
    Running(CodexTurnSnapshot),
    Complete(CodexTurnResponse),
    Failed(String),
}

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
    let run_id = format!("codex-import-turn:{}:{}", project.id, monotonic_id());
    turn_runs()
        .lock()
        .map_err(|_| (500, "Codex turn run registry lock is poisoned.".to_string()))?
        .by_id
        .insert(
            run_id.clone(),
            TurnRunState::Running(empty_snapshot("starting")),
        );
    let run_id_for_thread = run_id.clone();
    let project_id = project.id.clone();
    let request_for_thread = CodexTurnRequest {
        request_id: request_id.clone(),
        ..request
    };
    thread::spawn(move || {
        let result = run_import_planning_turn(&project, &run_id_for_thread, request_for_thread);
        if result.is_err() {
            reset_app_server();
        }
        if let Ok(mut runs) = turn_runs().lock() {
            runs.by_id.insert(
                run_id_for_thread.clone(),
                match result {
                    Ok(response) => TurnRunState::Complete(response),
                    Err((_, error)) => TurnRunState::Failed(error),
                },
            );
        }
    });
    Ok(CodexTurnStartResponse {
        ok: true,
        run_id,
        status: "running".to_string(),
        project_id,
        request_id,
    })
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
    };
    Ok(CodexTurnStatusResponse {
        ok: error.is_none(),
        run_id: run_id.to_string(),
        status,
        phase,
        snapshot,
        question: None,
        retryable,
        response,
        error,
    })
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
    }
}

fn update_run_snapshot(run_id: &str, snapshot: CodexTurnSnapshot) {
    if let Ok(mut runs) = turn_runs().lock() {
        if matches!(runs.by_id.get(run_id), Some(TurnRunState::Running(_))) {
            runs.by_id
                .insert(run_id.to_string(), TurnRunState::Running(snapshot));
        }
    }
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
) -> Result<CodexTurnResponse, (u16, String)> {
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err((400, "Prompt is required.".to_string()));
    }
    let start = Instant::now();
    let mut server_guard = app_server()
        .lock()
        .map_err(|_| (500, "Codex app-server lock is poisoned.".to_string()))?;
    let server = ensure_app_server(&mut server_guard)?;
    let thread_id = ensure_import_thread(server, project)?;
    update_run_snapshot(
        run_id,
        CodexTurnSnapshot {
            phase: "thread_ready".to_string(),
            ..empty_snapshot("thread_ready")
        },
    );
    let request_id = if request.request_id.trim().is_empty() {
        format!("import-turn:{}", start.elapsed().as_nanos())
    } else {
        request.request_id.clone()
    };
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
    update_run_snapshot(
        run_id,
        CodexTurnSnapshot {
            phase: "turn_requested".to_string(),
            elapsed_ms: start.elapsed().as_millis(),
            ..empty_snapshot("turn_requested")
        },
    );
    let result =
        server.wait_for_turn(&thread_id, before_index, Duration::from_secs(120), run_id)?;
    let elapsed_ms = start.elapsed().as_millis();
    eprintln!(
        "[hyperwiki] codex app-server turn complete project_id={} request_id={} thread_id={} turn_id={} chars={} first_delta_ms={:?} elapsed_ms={} events={}",
        project.id,
        request_id,
        thread_id,
        result.turn_id,
        result.text.chars().count(),
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
    })
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
        let mut first_delta_ms = None;
        let mut last_event_ms = None;
        let mut events = 0usize;
        loop {
            for value in state.lines.iter().skip(seen) {
                seen += 1;
                let method = value["method"].as_str().unwrap_or_default();
                let params = &value["params"];
                if params["threadId"].as_str() != Some(thread_id) {
                    continue;
                }
                events += 1;
                last_event_ms = Some(started_at.elapsed().as_millis());
                if let Some(id) = params["turnId"].as_str() {
                    if turn_id.is_empty() {
                        turn_id = id.to_string();
                    }
                }
                match method {
                    "turn/started" => {
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "turn_started",
                                &text,
                                events,
                                first_delta_ms,
                                last_event_ms,
                                started_at.elapsed().as_millis(),
                                &turn_id,
                                None,
                            ),
                        );
                        if let Some(id) = params["turn"]["id"]
                            .as_str()
                            .or_else(|| params["turnId"].as_str())
                        {
                            turn_id = id.to_string();
                        }
                    }
                    "item/agentMessage/delta" => {
                        if first_delta_ms.is_none() {
                            first_delta_ms = Some(started_at.elapsed().as_millis());
                        }
                        if let Some(delta) = params["delta"].as_str() {
                            text.push_str(delta);
                        }
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "streaming",
                                &text,
                                events,
                                first_delta_ms,
                                last_event_ms,
                                started_at.elapsed().as_millis(),
                                &turn_id,
                                None,
                            ),
                        );
                    }
                    "item/completed" => {
                        if params["item"]["type"].as_str() == Some("agentMessage") {
                            if let Some(full_text) = params["item"]["text"].as_str() {
                                text = full_text.to_string();
                            }
                        }
                        update_run_snapshot(
                            run_id,
                            turn_snapshot(
                                "streaming",
                                &text,
                                events,
                                first_delta_ms,
                                last_event_ms,
                                started_at.elapsed().as_millis(),
                                &turn_id,
                                None,
                            ),
                        );
                    }
                    "error" => {
                        return Err((
                            502,
                            format!("Codex app-server turn failed: {}", params["error"]),
                        ));
                    }
                    "turn/completed" => {
                        if turn_id.is_empty() {
                            turn_id = params["turn"]["id"]
                                .as_str()
                                .unwrap_or_default()
                                .to_string();
                        }
                        return Ok(TurnResult {
                            turn_id,
                            text,
                            first_delta_ms,
                            events,
                        });
                    }
                    _ => {}
                }
            }
            let now = Instant::now();
            if now >= deadline {
                return Err((504, "Codex app-server turn timed out.".to_string()));
            }
            let elapsed = started_at.elapsed();
            if events == 0 && elapsed >= Duration::from_secs(30) {
                update_run_snapshot(
                    run_id,
                    turn_snapshot(
                        "stalled",
                        &text,
                        events,
                        first_delta_ms,
                        last_event_ms,
                        elapsed.as_millis(),
                        &turn_id,
                        Some("Codex app-server did not emit a turn event within 30 seconds."),
                    ),
                );
                return Err((
                    504,
                    "Codex app-server did not emit a turn event within 30 seconds.".to_string(),
                ));
            }
            if first_delta_ms.is_none() && elapsed >= Duration::from_secs(25) {
                update_run_snapshot(
                    run_id,
                    turn_snapshot(
                        "stalled",
                        &text,
                        events,
                        first_delta_ms,
                        last_event_ms,
                        elapsed.as_millis(),
                        &turn_id,
                        Some("Codex app-server did not emit assistant text within 25 seconds."),
                    ),
                );
                return Err((
                    504,
                    "Codex app-server did not emit assistant text within 25 seconds.".to_string(),
                ));
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

fn turn_snapshot(
    phase: &str,
    text: &str,
    events: usize,
    first_delta_ms: Option<u128>,
    last_event_ms: Option<u128>,
    elapsed_ms: u128,
    turn_id: &str,
    schema_error: Option<&str>,
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
    }
}

#[derive(Debug)]
struct TurnResult {
    turn_id: String,
    text: String,
    first_delta_ms: Option<u128>,
    events: usize,
}

#[allow(dead_code)]
fn _path_for_debug(path: &Path) -> PathBuf {
    path.to_path_buf()
}
