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

const OUTPUT_BUFFER_LIMIT: usize = 20000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStartRequest {
    pub id: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub command: Option<String>,
    pub scope: Option<String>,
    pub scope_kind: Option<String>,
    pub plan_path: Option<String>,
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
pub struct TerminalOutputResponse {
    pub output: String,
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
        output: Arc<Mutex<String>>,
        registry: SessionRegistry,
    },
    Pipe {
        child: Child,
        stdin: Option<ChildStdin>,
        output: Arc<Mutex<String>>,
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
        let root = root.as_ref();
        let id = request.id.clone().unwrap_or_else(next_terminal_id);
        if let Some(existing) = self.sessions.get(&id) {
            let registry = SessionRegistry::new(root);
            let session = registry
                .upsert(
                    &id,
                    SessionUpdates {
                        status: Some("active".to_string()),
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

        match self.start_pty_session(root, &id, request.clone()) {
            Ok(response) => Ok(response),
            Err(pty_error) => self.start_pipe_session_with_warning(root, &id, request, &pty_error),
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
        self.start_pipe_session_with_warning(root, &id, request, "")
    }

    fn start_pty_session(
        &mut self,
        root: &Path,
        id: &str,
        request: TerminalStartRequest,
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
        command.cwd(root);
        command.env("TERM", "xterm-256color");
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("Could not start PTY shell: {error}"))?;
        drop(pair.slave);
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("Could not read PTY output: {error}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| format!("Could not open PTY input: {error}"))?;
        let mut writer = writer;
        let output = Arc::new(Mutex::new(String::new()));
        capture_output(reader, Arc::clone(&output));
        launch_recorded_command(writer.as_mut(), launch_command.as_deref())?;
        let registry = SessionRegistry::new(root);
        let session = registry
            .upsert(
                id,
                SessionUpdates {
                    name: Some(request.name.unwrap_or_else(|| id.to_string())),
                    status: Some("active".to_string()),
                    mode: Some("pty".to_string()),
                    role: Some(request.role.unwrap_or_else(|| "shell".to_string())),
                    command: request.command,
                    shell: Some(shell),
                    pid: child.process_id(),
                    cwd: Some(root.to_path_buf()),
                    scope: Some(request.scope.unwrap_or_else(|| "global".to_string())),
                    scope_kind: Some(request.scope_kind.unwrap_or_else(|| "global".to_string())),
                    plan_path: request.plan_path,
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
    ) -> Result<TerminalStartResponse, String> {
        let shell = shell_path();
        let launch_command = request.command.clone();
        let mut child = Command::new(&shell)
            .current_dir(root)
            .env("TERM", "xterm-256color")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Could not start terminal shell: {error}"))?;

        let output = Arc::new(Mutex::new(String::new()));
        if !warning.is_empty() {
            append_output(
                &output,
                &format!(
                    "\r\n[hyperwiki] PTY spawn failed; using pipe fallback for this session.\r\n[hyperwiki] {warning}\r\n\r\n"
                ),
            );
        }
        if let Some(stdout) = child.stdout.take() {
            capture_output(stdout, Arc::clone(&output));
        }
        if let Some(stderr) = child.stderr.take() {
            capture_output(stderr, Arc::clone(&output));
        }
        let mut stdin = child.stdin.take();
        if let Some(writer) = stdin.as_mut() {
            launch_recorded_command(writer, launch_command.as_deref())?;
        }
        let registry = SessionRegistry::new(root);
        let session = registry
            .upsert(
                &id,
                SessionUpdates {
                    name: Some(request.name.unwrap_or_else(|| id.to_string())),
                    status: Some("active".to_string()),
                    mode: Some("pipe-fallback".to_string()),
                    role: Some(request.role.unwrap_or_else(|| "shell".to_string())),
                    command: request.command,
                    shell: Some(shell),
                    pid: Some(child.id()),
                    cwd: Some(root.to_path_buf()),
                    scope: Some(request.scope.unwrap_or_else(|| "global".to_string())),
                    scope_kind: Some(request.scope_kind.unwrap_or_else(|| "global".to_string())),
                    plan_path: request.plan_path,
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

fn launch_recorded_command(writer: &mut dyn Write, command: Option<&str>) -> Result<(), String> {
    let Some(command) = command.map(str::trim).filter(|command| !command.is_empty()) else {
        return Ok(());
    };
    writer
        .write_all(format!("{command}\n").as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| format!("Could not launch terminal command: {error}"))
}

impl TerminalProcess {
    fn output(&self) -> String {
        self.output_buffer()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    fn output_buffer(&self) -> &Arc<Mutex<String>> {
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
}

fn capture_output(mut reader: impl Read + Send + 'static, output: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => append_output(&output, &String::from_utf8_lossy(&buffer[..size])),
                Err(_) => break,
            }
        }
    });
}

fn append_output(output: &Arc<Mutex<String>>, chunk: &str) {
    let mut value = output.lock().unwrap_or_else(|error| error.into_inner());
    value.push_str(chunk);
    if value.len() > OUTPUT_BUFFER_LIMIT {
        trim_output_buffer(&mut value);
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
                    scope: Some("plan:/wiki/plans/index.html".to_string()),
                    scope_kind: Some("plan".to_string()),
                    plan_path: Some("/wiki/plans/index.html".to_string()),
                },
            )
            .unwrap();
        assert_eq!(started.session.mode, "pipe-fallback");
        assert_eq!(started.session.scope, "plan:/wiki/plans/index.html");

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
    fn trims_terminal_output_on_utf8_boundaries() {
        let mut output = format!("{}🚀", "a".repeat(OUTPUT_BUFFER_LIMIT));
        trim_output_buffer(&mut output);
        assert!(output.len() <= OUTPUT_BUFFER_LIMIT);
        assert!(output.is_char_boundary(0));
        assert!(output.starts_with('a'));
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
