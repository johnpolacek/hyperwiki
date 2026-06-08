use super::DomainSurface;
use crate::domain::sessions::{SessionRecord, SessionRegistry, SessionUpdates};
use portable_pty::{native_pty_system, Child as PtyChild, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "terminals",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "PTY and pipe-backed process lifecycle",
            "terminal input, output, resize, and replay",
            "agent launch command enforcement",
            "prompt submission into active agent sessions",
        ],
        parity_gate: "PTY smoke plus agent execute launch guard browser coverage",
    }
}

const OUTPUT_BUFFER_LIMIT: usize = 64 * 1024;
pub const TERMINAL_OUTPUT_EVENT: &str = "terminal://output";
pub const TERMINAL_COMPLETION_EVENT: &str = "terminal://completion";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStartRequest {
    pub id: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub command: Option<String>,
    pub scope: Option<String>,
    #[serde(alias = "scope_kind")]
    pub scope_kind: Option<String>,
    #[serde(alias = "plan_path")]
    pub plan_path: Option<String>,
    pub visibility: Option<String>,
    pub purpose: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TerminalInputRequest {
    pub input: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TerminalResizeRequest {
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStartResponse {
    pub session: SessionRecord,
    pub replay: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalReplayResponse {
    pub session_id: String,
    pub seq: u64,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub seq: u64,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCompletionEvent {
    pub session_id: String,
    pub role: Option<String>,
    pub name: Option<String>,
    pub scope: Option<String>,
    pub plan_path: Option<String>,
    pub reason: String,
    pub exit_code: Option<i32>,
    pub completed_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TerminalOutputResponse {
    pub output: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalWriteDiagnostics {
    pub live: bool,
    pub replay_seq: Option<u64>,
    pub pid: Option<u32>,
    pub process_group: Option<i32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TerminalWriteResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TerminalResizeResponse {
    pub ok: bool,
    pub mode: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

pub struct TerminalManager {
    sessions: HashMap<String, TerminalProcess>,
}

enum TerminalProcess {
    Pty {
        child: Box<dyn PtyChild + Send + Sync>,
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        output: Arc<Mutex<TerminalOutputBuffers>>,
        registry: SessionRegistry,
    },
    Pipe {
        child: Child,
        stdin: Option<ChildStdin>,
        output: Arc<Mutex<TerminalOutputBuffers>>,
        registry: SessionRegistry,
    },
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn start_session(
        &mut self,
        root: impl AsRef<Path>,
        request: TerminalStartRequest,
    ) -> Result<TerminalStartResponse, String> {
        self.start_session_with_app(root, request, None)
    }

    pub fn start_session_with_app(
        &mut self,
        root: impl AsRef<Path>,
        request: TerminalStartRequest,
        app: Option<tauri::AppHandle>,
    ) -> Result<TerminalStartResponse, String> {
        let root = root.as_ref();
        let id = request.id.clone().unwrap_or_else(next_terminal_id);
        if let Some(existing) = self.sessions.get(&id) {
            let registry = SessionRegistry::new(root);
            let session = registry
                .upsert(
                    &id,
                    SessionUpdates {
                        status: Some("active".to_string()),
                        visibility: request.visibility.clone(),
                        purpose: request.purpose.clone(),
                        connected_clients: Some(1),
                        last_attached_at: Some(timestamp()),
                        ..SessionUpdates::default()
                    },
                )
                .map_err(|error| format!("Could not reattach terminal session: {error}"))?;
            return Ok(TerminalStartResponse {
                session,
                replay: existing.output(),
            });
        }

        match self.start_pty_session(root, &id, request.clone(), app.clone()) {
            Ok(response) => Ok(response),
            Err(pty_error) => {
                self.start_pipe_session_with_warning(root, &id, request, &pty_error, app)
            }
        }
    }

    pub fn start_pipe_session(
        &mut self,
        root: impl AsRef<Path>,
        request: TerminalStartRequest,
    ) -> Result<TerminalStartResponse, String> {
        let root = root.as_ref();
        let id = request.id.clone().unwrap_or_else(next_terminal_id);
        if let Some(existing) = self.sessions.get(&id) {
            let registry = SessionRegistry::new(root);
            let session = registry
                .upsert(
                    &id,
                    SessionUpdates {
                        status: Some("active".to_string()),
                        visibility: request.visibility.clone(),
                        purpose: request.purpose.clone(),
                        connected_clients: Some(1),
                        last_attached_at: Some(timestamp()),
                        ..SessionUpdates::default()
                    },
                )
                .map_err(|error| format!("Could not reattach terminal session: {error}"))?;
            return Ok(TerminalStartResponse {
                session,
                replay: existing.output(),
            });
        }
        self.start_pipe_session_with_warning(root, &id, request, "", None)
    }

    fn start_pty_session(
        &mut self,
        root: &Path,
        id: &str,
        request: TerminalStartRequest,
        app: Option<tauri::AppHandle>,
    ) -> Result<TerminalStartResponse, String> {
        let shell = shell_path();
        let launch_command = request.command.clone();
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("Could not open PTY: {error}"))?;
        let mut command = CommandBuilder::new(&shell);
        configure_pty_shell_command(&mut command, launch_command.as_deref());
        command.cwd(root);
        command.env("TERM", "xterm-256color");
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("Could not start PTY shell: {error}"))?;
        let process_group = pair.master.process_group_leader();
        drop(pair.slave);
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("Could not read PTY output: {error}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| format!("Could not open PTY input: {error}"))?;
        let output = Arc::new(Mutex::new(TerminalOutputBuffers::default()));
        capture_output(reader, Arc::clone(&output), id.to_string(), app);
        let registry = SessionRegistry::new(root);
        let session = registry
            .upsert(
                id,
                SessionUpdates {
                    name: Some(request.name.unwrap_or_else(|| id.to_string())),
                    status: Some("active".to_string()),
                    mode: Some("pty".to_string()),
                    role: Some(request.role.unwrap_or_else(|| "shell".to_string())),
                    command: launch_command,
                    shell: Some(shell),
                    pid: child.process_id(),
                    process_group,
                    cwd: Some(root.to_path_buf()),
                    scope: Some(request.scope.unwrap_or_else(|| "global".to_string())),
                    scope_kind: Some(request.scope_kind.unwrap_or_else(|| "global".to_string())),
                    plan_path: request.plan_path,
                    visibility: request.visibility,
                    purpose: request.purpose,
                    connected_clients: Some(1),
                    last_attached_at: Some(timestamp()),
                    ..SessionUpdates::default()
                },
            )
            .map_err(|error| format!("Could not record PTY session: {error}"))?;
        self.sessions.insert(
            id.to_string(),
            TerminalProcess::Pty {
                child,
                master: pair.master,
                writer,
                output,
                registry,
            },
        );
        Ok(TerminalStartResponse {
            session,
            replay: String::new(),
        })
    }

    fn start_pipe_session_with_warning(
        &mut self,
        root: &Path,
        id: &str,
        request: TerminalStartRequest,
        warning: &str,
        app: Option<tauri::AppHandle>,
    ) -> Result<TerminalStartResponse, String> {
        let shell = shell_path();
        let launch_command = request.command.clone();
        let mut command = Command::new(&shell);
        configure_std_shell_command(&mut command, launch_command.as_deref());
        let mut child = command
            .current_dir(root)
            .env("TERM", "xterm-256color")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Could not start terminal shell: {error}"))?;

        let output = Arc::new(Mutex::new(TerminalOutputBuffers::default()));
        if !warning.is_empty() {
            append_output(
                &output,
                id,
                format!(
                    "\r\n[hyperwiki] PTY spawn failed; using pipe fallback for this session.\r\n[hyperwiki] {warning}\r\n\r\n"
                )
                .as_bytes(),
                app.as_ref(),
            );
        }
        if let Some(stdout) = child.stdout.take() {
            capture_output(stdout, Arc::clone(&output), id.to_string(), app.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            capture_output(stderr, Arc::clone(&output), id.to_string(), app.clone());
        }
        let stdin = child.stdin.take();
        let registry = SessionRegistry::new(root);
        let session = registry
            .upsert(
                &id,
                SessionUpdates {
                    name: Some(request.name.unwrap_or_else(|| id.to_string())),
                    status: Some("active".to_string()),
                    mode: Some("pipe-fallback".to_string()),
                    role: Some(request.role.unwrap_or_else(|| "shell".to_string())),
                    command: launch_command,
                    shell: Some(shell),
                    pid: Some(child.id()),
                    process_group: None,
                    cwd: Some(root.to_path_buf()),
                    scope: Some(request.scope.unwrap_or_else(|| "global".to_string())),
                    scope_kind: Some(request.scope_kind.unwrap_or_else(|| "global".to_string())),
                    plan_path: request.plan_path,
                    visibility: request.visibility,
                    purpose: request.purpose,
                    connected_clients: Some(1),
                    last_attached_at: Some(timestamp()),
                    ..SessionUpdates::default()
                },
            )
            .map_err(|error| format!("Could not record terminal session: {error}"))?;
        self.sessions.insert(
            id.to_string(),
            TerminalProcess::Pipe {
                child,
                stdin,
                output,
                registry,
            },
        );
        Ok(TerminalStartResponse {
            session,
            replay: String::new(),
        })
    }

    pub fn write(&mut self, id: &str, input: &str) -> Result<TerminalWriteResponse, String> {
        let Some(process) = self.sessions.get_mut(id) else {
            return Err("Terminal session not found.".to_string());
        };
        let writer: &mut dyn Write = match process {
            TerminalProcess::Pty { writer, .. } => writer.as_mut(),
            TerminalProcess::Pipe { stdin, .. } => {
                let Some(stdin) = stdin.as_mut() else {
                    return Err("Terminal session input is closed.".to_string());
                };
                stdin
            }
        };
        writer
            .write_all(input.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|error| format!("Could not write to terminal session: {error}"))?;
        Ok(TerminalWriteResponse { ok: true })
    }

    pub fn resize(
        &mut self,
        id: &str,
        request: TerminalResizeRequest,
    ) -> Result<TerminalResizeResponse, String> {
        let Some(process) = self.sessions.get_mut(id) else {
            return Err("Terminal session not found.".to_string());
        };
        let mode = match process {
            TerminalProcess::Pty { master, .. } => {
                master
                    .resize(PtySize {
                        rows: request.rows.unwrap_or(30),
                        cols: request.cols.unwrap_or(100),
                        pixel_width: 0,
                        pixel_height: 0,
                    })
                    .map_err(|error| format!("Could not resize PTY session: {error}"))?;
                "pty"
            }
            TerminalProcess::Pipe { .. } => "pipe-fallback",
        };
        Ok(TerminalResizeResponse {
            ok: true,
            mode: mode.to_string(),
            cols: request.cols,
            rows: request.rows,
        })
    }

    pub fn output(&self, id: &str) -> Result<TerminalOutputResponse, String> {
        let Some(process) = self.sessions.get(id) else {
            return Err("Terminal session not found.".to_string());
        };
        Ok(TerminalOutputResponse {
            output: process.output(),
        })
    }

    pub fn replay(&self, id: &str) -> Result<TerminalReplayResponse, String> {
        let Some(process) = self.sessions.get(id) else {
            return Err("Terminal session not found.".to_string());
        };
        let snapshot = process.replay();
        Ok(TerminalReplayResponse {
            session_id: id.to_string(),
            seq: snapshot.seq,
            bytes: snapshot.bytes,
        })
    }

    pub fn diagnostics(&mut self, id: &str) -> TerminalWriteDiagnostics {
        self.reap_completed_sessions(None);
        let process = self.sessions.get(id);
        let replay_seq = process.map(|process| process.replay().seq);
        TerminalWriteDiagnostics {
            live: replay_seq.is_some(),
            replay_seq,
            pid: process.and_then(TerminalProcess::pid),
            process_group: process.and_then(TerminalProcess::process_group),
        }
    }

    pub fn reap_completed_sessions(&mut self, app: Option<&tauri::AppHandle>) -> Vec<TerminalCompletionEvent> {
        let mut completed = Vec::new();
        let ids = self.sessions.keys().cloned().collect::<Vec<_>>();
        for id in ids {
            let Some(status) = self
                .sessions
                .get_mut(&id)
                .and_then(TerminalProcess::try_wait)
            else {
                continue;
            };
            let Some(process) = self.sessions.remove(&id) else {
                continue;
            };
            if let Ok(session) = process.registry().close(&id) {
                let event = TerminalCompletionEvent {
                    session_id: id,
                    role: Some(session.role),
                    name: Some(session.name),
                    scope: Some(session.scope),
                    plan_path: session.plan_path,
                    reason: "process-exit".to_string(),
                    exit_code: status.exit_code,
                    completed_at: timestamp(),
                };
                if let Some(app) = app {
                    let _ = app.emit(TERMINAL_COMPLETION_EVENT, event.clone());
                }
                completed.push(event);
            }
        }
        completed
    }

    pub fn close(&mut self, id: &str) -> Result<SessionRecord, String> {
        let Some(mut process) = self.sessions.remove(id) else {
            return Err("Terminal session not found.".to_string());
        };
        process.kill_and_wait();
        process.registry().close(id)
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

fn configure_pty_shell_command(command: &mut CommandBuilder, launch_command: Option<&str>) {
    let Some(script) = terminal_launch_script(launch_command) else {
        return;
    };
    command.arg("-l");
    command.arg("-i");
    command.arg("-c");
    command.arg(script);
}

fn configure_std_shell_command(command: &mut Command, launch_command: Option<&str>) {
    let Some(script) = terminal_launch_script(launch_command) else {
        return;
    };
    command.arg("-l").arg("-i").arg("-c").arg(script);
}

fn terminal_launch_script(command: Option<&str>) -> Option<String> {
    let command = command
        .map(str::trim)
        .filter(|command| !command.is_empty())?;
    Some(format!(
        "{command}\nhyperwiki_launch_status=$?\nif [ \"$hyperwiki_launch_status\" -ne 0 ]; then printf '\\n[hyperwiki] launch command exited with status %s\\n' \"$hyperwiki_launch_status\"; fi\nexec \"${{SHELL:-/bin/sh}}\" -l"
    ))
}

impl TerminalProcess {
    fn output(&self) -> String {
        self.output_buffer()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .transcript
            .clone()
    }

    fn replay(&self) -> TerminalReplaySnapshot {
        let value = self.output_buffer()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        TerminalReplaySnapshot {
            seq: value.seq,
            bytes: value.replay.clone(),
        }
    }

    fn output_buffer(&self) -> &Arc<Mutex<TerminalOutputBuffers>> {
        match self {
            TerminalProcess::Pty { output, .. } => output,
            TerminalProcess::Pipe { output, .. } => output,
        }
    }

    fn registry(&self) -> &SessionRegistry {
        match self {
            TerminalProcess::Pty { registry, .. } => registry,
            TerminalProcess::Pipe { registry, .. } => registry,
        }
    }

    fn kill_and_wait(&mut self) {
        match self {
            TerminalProcess::Pty { child, .. } => {
                let _ = child.kill();
                let _ = child.wait();
            }
            TerminalProcess::Pipe { child, .. } => {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    fn try_wait(&mut self) -> Option<TerminalProcessExit> {
        match self {
            TerminalProcess::Pty { child, .. } => {
                child
                    .try_wait()
                    .ok()
                    .flatten()
                    .map(|status| TerminalProcessExit {
                        exit_code: i32::try_from(status.exit_code()).ok(),
                    })
            }
            TerminalProcess::Pipe { child, .. } => {
                child
                    .try_wait()
                    .ok()
                    .flatten()
                    .map(|status| TerminalProcessExit {
                        exit_code: status.code(),
                    })
            }
        }
    }

    fn pid(&self) -> Option<u32> {
        match self {
            TerminalProcess::Pty { child, .. } => child.process_id(),
            TerminalProcess::Pipe { child, .. } => Some(child.id()),
        }
    }

    fn process_group(&self) -> Option<i32> {
        match self {
            TerminalProcess::Pty { master, .. } => master.process_group_leader(),
            TerminalProcess::Pipe { .. } => None,
        }
    }
}

#[derive(Default)]
struct TerminalOutputBuffers {
    seq: u64,
    replay: Vec<u8>,
    transcript: String,
}

struct TerminalReplaySnapshot {
    seq: u64,
    bytes: Vec<u8>,
}

struct TerminalProcessExit {
    exit_code: Option<i32>,
}

fn capture_output(
    mut reader: impl Read + Send + 'static,
    output: Arc<Mutex<TerminalOutputBuffers>>,
    session_id: String,
    app: Option<tauri::AppHandle>,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => append_output(&output, &session_id, &buffer[..size], app.as_ref()),
                Err(_) => break,
            }
        }
    });
}

fn append_output(
    output: &Arc<Mutex<TerminalOutputBuffers>>,
    session_id: &str,
    chunk: &[u8],
    app: Option<&tauri::AppHandle>,
) {
    let event = {
        let mut value = output.lock().unwrap_or_else(|error| error.into_inner());
        value.seq = value.seq.saturating_add(1);
        value.replay.extend_from_slice(chunk);
        value.transcript.push_str(&String::from_utf8_lossy(chunk));
        trim_output_buffer(&mut value.transcript);
        TerminalOutputEvent {
            session_id: session_id.to_string(),
            seq: value.seq,
            bytes: chunk.to_vec(),
        }
    };
    if let Some(app) = app {
        let _ = app.emit(TERMINAL_OUTPUT_EVENT, event);
    }
}

fn trim_output_buffer(value: &mut String) {
    if value.len() <= OUTPUT_BUFFER_LIMIT {
        return;
    }
    let minimum_start = value.len() - OUTPUT_BUFFER_LIMIT;
    let drain_to = value
        .char_indices()
        .find_map(|(index, _)| (index >= minimum_start).then_some(index))
        .unwrap_or(value.len());
    value.drain(..drain_to);
}

fn shell_path() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            "bash".to_string()
        }
    })
}

fn next_terminal_id() -> String {
    format!("terminal-{}", timestamp())
}

fn timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{millis:013}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn starts_pipe_session_writes_replays_resizes_and_closes() {
        let root = temp_root("terminal-pipe");
        let mut manager = TerminalManager::new();
        let started = manager
            .start_pipe_session(
                &root,
                TerminalStartRequest {
                    id: Some("pipe-one".to_string()),
                    name: Some("pipe".to_string()),
                    role: Some("shell".to_string()),
                    command: None,
                    scope: Some("plan:/wiki/plans/index.mdx".to_string()),
                    scope_kind: Some("plan".to_string()),
                    plan_path: Some("/wiki/plans/index.mdx".to_string()),
                    visibility: None,
                    purpose: None,
                },
            )
            .unwrap();
        assert_eq!(started.session.mode, "pipe-fallback");
        assert_eq!(started.session.scope, "plan:/wiki/plans/index.mdx");

        manager
            .write("pipe-one", "printf hyperwiki-terminal-ready\\n\n")
            .unwrap();
        let output = wait_for_output(&manager, "pipe-one", "hyperwiki-terminal-ready");
        assert!(output.contains("hyperwiki-terminal-ready"));

        let replay = manager
            .start_pipe_session(
                &root,
                TerminalStartRequest {
                    id: Some("pipe-one".to_string()),
                    name: Some("pipe".to_string()),
                    role: Some("shell".to_string()),
                    command: None,
                    scope: None,
                    scope_kind: None,
                    plan_path: None,
                    visibility: None,
                    purpose: None,
                },
            )
            .unwrap();
        assert!(replay.replay.contains("hyperwiki-terminal-ready"));

        let resize = manager
            .resize(
                "pipe-one",
                TerminalResizeRequest {
                    cols: Some(120),
                    rows: Some(40),
                },
            )
            .unwrap();
        assert_eq!(resize.mode, "pipe-fallback");
        assert_eq!(resize.cols, Some(120));

        let closed = manager.close("pipe-one").unwrap();
        assert_eq!(closed.status, "closed");
    }

    #[test]
    fn starts_preferred_pty_session_with_pipe_fallback() {
        let root = temp_root("terminal-pty");
        let mut manager = TerminalManager::new();
        let started = manager
            .start_session(
                &root,
                TerminalStartRequest {
                    id: Some("preferred-one".to_string()),
                    name: Some("preferred".to_string()),
                    role: Some("shell".to_string()),
                    command: None,
                    scope: None,
                    scope_kind: None,
                    plan_path: None,
                    visibility: None,
                    purpose: None,
                },
            )
            .unwrap();
        assert!(started.session.mode == "pty" || started.session.mode == "pipe-fallback");
        manager
            .write("preferred-one", "printf preferred-terminal-ready\\n\n")
            .unwrap();
        let output = wait_for_output(&manager, "preferred-one", "preferred-terminal-ready");
        assert!(output.contains("preferred-terminal-ready"));
        let resized = manager
            .resize(
                "preferred-one",
                TerminalResizeRequest {
                    cols: Some(90),
                    rows: Some(20),
                },
            )
            .unwrap();
        assert_eq!(resized.cols, Some(90));
        manager.close("preferred-one").unwrap();
    }

    #[test]
    fn launch_script_uses_zsh_safe_status_variable() {
        let script = terminal_launch_script(Some("printf ready\\n")).unwrap();
        assert!(script.contains("hyperwiki_launch_status=$?"));
        assert!(script.contains("exec \"${SHELL:-/bin/sh}\" -l"));
        assert!(!script.contains("\nstatus=$?"));
        assert!(!script.contains("[ $status"));
    }

    #[test]
    fn trims_terminal_output_on_utf8_boundaries() {
        let mut output = format!("{}🚀", "a".repeat(OUTPUT_BUFFER_LIMIT));
        trim_output_buffer(&mut output);
        assert!(output.len() <= OUTPUT_BUFFER_LIMIT);
        assert!(output.is_char_boundary(0));
        assert!(output.starts_with('a'));
    }

    #[test]
    fn terminal_replay_keeps_full_live_history() {
        let output = Arc::new(Mutex::new(TerminalOutputBuffers::default()));
        let first = b"terminal-history-start\n";
        append_output(&output, "history", first, None);
        append_output(&output, "history", &vec![b'a'; 3 * 1024 * 1024], None);
        let snapshot = output
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .replay
            .clone();
        assert!(snapshot.starts_with(first));
        assert_eq!(snapshot.len(), first.len() + 3 * 1024 * 1024);
    }

    #[test]
    fn terminal_start_request_accepts_camel_and_snake_scope_fields() {
        let camel: TerminalStartRequest = serde_json::from_str(
            r#"{"scope":"plan:/wiki/plans/index.mdx","scopeKind":"plan","planPath":"/wiki/plans/index.mdx"}"#,
        )
        .unwrap();
        let snake: TerminalStartRequest = serde_json::from_str(
            r#"{"scope":"plan:/wiki/plans/index.mdx","scope_kind":"plan","plan_path":"/wiki/plans/index.mdx"}"#,
        )
        .unwrap();
        assert_eq!(camel.scope_kind.as_deref(), Some("plan"));
        assert_eq!(camel.plan_path.as_deref(), Some("/wiki/plans/index.mdx"));
        assert_eq!(snake.scope_kind.as_deref(), Some("plan"));
        assert_eq!(snake.plan_path.as_deref(), Some("/wiki/plans/index.mdx"));
    }

    #[test]
    fn terminal_start_request_accepts_standby_metadata() {
        let request: TerminalStartRequest = serde_json::from_str(
            r#"{"scope":"plan:/wiki/plans/index.mdx","visibility":"standby","purpose":"modify"}"#,
        )
        .unwrap();
        assert_eq!(request.visibility.as_deref(), Some("standby"));
        assert_eq!(request.purpose.as_deref(), Some("modify"));
    }

    #[test]
    fn reaps_naturally_exited_sessions_as_completion_events() {
        let root = temp_root("terminal-completion");
        let mut manager = TerminalManager::new();
        manager
            .start_pipe_session(
                &root,
                TerminalStartRequest {
                    id: Some("completion-one".to_string()),
                    name: Some("cli".to_string()),
                    role: Some("cli".to_string()),
                    command: Some("exit 7".to_string()),
                    scope: Some("plan:/wiki/plans/index.mdx".to_string()),
                    scope_kind: Some("plan".to_string()),
                    plan_path: Some("/wiki/plans/index.mdx".to_string()),
                    visibility: None,
                    purpose: None,
                },
            )
            .unwrap();

        let events = wait_for_completion_events(&mut manager);

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].session_id, "completion-one");
        assert_eq!(events[0].role.as_deref(), Some("cli"));
        assert_eq!(events[0].reason, "process-exit");
        assert_eq!(events[0].exit_code, Some(7));
        assert!(!manager.diagnostics("completion-one").live);
    }

    fn wait_for_output(manager: &TerminalManager, id: &str, needle: &str) -> String {
        for _ in 0..30 {
            let output = manager.output(id).unwrap().output;
            if output.contains(needle) {
                return output;
            }
            sleep(Duration::from_millis(50));
        }
        manager.output(id).unwrap().output
    }

    fn wait_for_completion_events(manager: &mut TerminalManager) -> Vec<TerminalCompletionEvent> {
        for _ in 0..30 {
            let events = manager.reap_completed_sessions(None);
            if !events.is_empty() {
                return events;
            }
            sleep(Duration::from_millis(50));
        }
        manager.reap_completed_sessions(None)
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
