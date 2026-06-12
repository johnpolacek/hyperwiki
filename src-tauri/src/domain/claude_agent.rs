//! Claude Code headless transport for the import-planning flow.
//!
//! Claude Code has no persistent app-server mode, so every planning turn is a
//! single `claude -p` process whose `--output-format stream-json` output we
//! parse into the same `CodexTurnResponse` / `CodexTurnSnapshot` / onboarding
//! event contract the Codex transport produces. This mirrors the Codex
//! exec-json one-shot path; there is no secondary fallback.

use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use super::codex_app_server::{
    emit_onboarding_event, is_run_cancelled, push_event_log, run_record, turn_snapshot,
    update_run_snapshot, CodexAdapterMetrics, CodexAdapterTimingMarks, CodexTurnResponse,
};

const CLAUDE_TURN_TIMEOUT: Duration = Duration::from_secs(120);
const CLAUDE_WAITING_PROGRESS_AFTER: Duration = Duration::from_secs(5);
/// Pinned model for programmatic planning turns. The Codex path pins gpt-5.5 at
/// low effort; `sonnet` is the latency/cost-comparable Claude default.
const CLAUDE_PLANNING_MODEL: &str = "sonnet";

pub(crate) fn run_claude_planning_turn(
    project: &crate::domain::projects::ProjectRecord,
    run_id: &str,
    request_id: &str,
    prompt: &str,
    app: Option<&tauri::AppHandle>,
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
            "turn_requested",
            "",
            0,
            &[],
            None,
            None,
            None,
            0,
            "claude-stream-json",
            None,
            timing_marks,
        ),
    );
    if let Some(record) = run_record(run_id) {
        emit_onboarding_event(
            app,
            &record,
            "run_progress",
            "turn_requested",
            "Claude headless turn requested.",
        );
    }

    eprintln!(
        "[hyperwiki] claude headless turn start project_id={} request_id={} model={} prompt_chars={}",
        project.id,
        request_id,
        CLAUDE_PLANNING_MODEL,
        prompt.chars().count()
    );

    let mut child = Command::new("claude")
        .args([
            "-p",
            prompt,
            "--output-format",
            "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
            "--model",
            CLAUDE_PLANNING_MODEL,
        ])
        .current_dir(&project.root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| (502, format!("Failed to start claude headless turn: {error}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| (502, "Failed to capture claude headless output.".to_string()))?;
    let (tx, rx) = mpsc::channel::<Result<Value, String>>();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) if line.trim().is_empty() => {}
                Ok(line) => {
                    let parsed = serde_json::from_str::<Value>(&line).map_err(|error| {
                        format!("Failed to parse claude stream JSON event: {error}; line={line}")
                    });
                    if tx.send(parsed).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = tx.send(Err(format!(
                        "Failed to read claude headless output: {error}"
                    )));
                    break;
                }
            }
        }
    });

    let deadline = start + CLAUDE_TURN_TIMEOUT;
    let mut thread_id = "claude-stream-json".to_string();
    let mut turn_id = "claude-stream-json".to_string();
    let mut text = String::new();
    let mut first_event_ms = None;
    let mut first_delta_ms = None;
    let mut events = 0usize;
    let mut event_log = Vec::<String>::new();
    let mut last_waiting_snapshot_ms = 0u128;

    loop {
        if is_run_cancelled(run_id) {
            let _ = child.kill();
            return Err((499, "Import onboarding run cancelled.".to_string()));
        }
        let now = Instant::now();
        if now >= deadline {
            let _ = child.kill();
            if !text.trim().is_empty() {
                return Ok(claude_response(
                    project,
                    request_id,
                    &thread_id,
                    &turn_id,
                    text,
                    first_event_ms,
                    first_delta_ms,
                    start,
                    events,
                    "timeout_after_assistant_text",
                ));
            }
            return Err((504, "Claude headless turn timed out.".to_string()));
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
                push_event_log(&mut event_log, describe_claude_event(&value));
                match value["type"].as_str().unwrap_or_default() {
                    "system" => {
                        if value["subtype"].as_str() == Some("init") {
                            if let Some(id) = value["session_id"].as_str() {
                                thread_id = id.to_string();
                                turn_id = id.to_string();
                            }
                            update_run_snapshot(
                                run_id,
                                turn_snapshot(
                                    "turn_started",
                                    &text,
                                    events,
                                    &event_log,
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
                    }
                    "assistant" => {
                        let delta = claude_assistant_text(&value["message"]);
                        if !delta.is_empty() {
                            text.push_str(&delta);
                            if first_delta_ms.is_none() {
                                first_delta_ms = Some(elapsed_ms);
                            }
                            update_run_snapshot(
                                run_id,
                                turn_snapshot(
                                    "streaming",
                                    &text,
                                    events,
                                    &event_log,
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
                                    "Claude headless produced assistant text.",
                                );
                            }
                        }
                    }
                    "result" => {
                        let _ = child.kill();
                        if value["is_error"].as_bool().unwrap_or(false) {
                            let message = value["result"]
                                .as_str()
                                .filter(|message| !message.trim().is_empty())
                                .unwrap_or("Claude headless turn reported an error.");
                            return Err((502, format!("Claude headless turn failed: {message}")));
                        }
                        if let Some(result_text) = value["result"].as_str() {
                            if !result_text.trim().is_empty() {
                                text = result_text.to_string();
                                if first_delta_ms.is_none() {
                                    first_delta_ms = Some(elapsed_ms);
                                }
                            }
                        }
                        if text.trim().is_empty() {
                            return Err((
                                502,
                                "Claude headless turn completed without assistant text."
                                    .to_string(),
                            ));
                        }
                        return Ok(claude_response(
                            project,
                            request_id,
                            &thread_id,
                            &turn_id,
                            text,
                            first_event_ms,
                            first_delta_ms,
                            start,
                            events,
                            "result",
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
                let elapsed_ms = start.elapsed().as_millis();
                if text.trim().is_empty()
                    && start.elapsed() >= CLAUDE_WAITING_PROGRESS_AFTER
                    && elapsed_ms.saturating_sub(last_waiting_snapshot_ms) >= 5_000
                {
                    last_waiting_snapshot_ms = elapsed_ms;
                    update_run_snapshot(
                        run_id,
                        turn_snapshot(
                            "waiting_for_assistant",
                            &text,
                            events,
                            &event_log,
                            first_event_ms,
                            first_delta_ms,
                            None,
                            elapsed_ms,
                            &turn_id,
                            None,
                            timing_marks,
                        ),
                    );
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let status = child.try_wait().ok().flatten();
                if !text.trim().is_empty() {
                    eprintln!(
                        "[hyperwiki] claude headless output closed after assistant text project_id={} request_id={} status={:?}",
                        project.id, request_id, status
                    );
                    return Ok(claude_response(
                        project,
                        request_id,
                        &thread_id,
                        &turn_id,
                        text,
                        first_event_ms,
                        first_delta_ms,
                        start,
                        events,
                        "output_closed_after_assistant_text",
                    ));
                }
                let _ = child.kill();
                return Err((
                    502,
                    format!("Claude headless output closed before result. status={status:?}"),
                ));
            }
        }
    }
}

fn claude_assistant_text(message: &Value) -> String {
    message["content"]
        .as_array()
        .map(|content| {
            content
                .iter()
                .filter(|block| block["type"].as_str() == Some("text"))
                .filter_map(|block| block["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}

#[allow(clippy::too_many_arguments)]
fn claude_response(
    project: &crate::domain::projects::ProjectRecord,
    request_id: &str,
    thread_id: &str,
    turn_id: &str,
    text: String,
    first_event_ms: Option<u128>,
    first_delta_ms: Option<u128>,
    start: Instant,
    events: usize,
    completion_reason: &str,
) -> CodexTurnResponse {
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
        "[hyperwiki] claude headless turn complete project_id={} request_id={} session_id={} reason={} chars={} first_event_ms={:?} first_delta_ms={:?} elapsed_ms={} events={}",
        project.id,
        request_id,
        thread_id,
        completion_reason,
        text.chars().count(),
        first_event_ms,
        first_delta_ms,
        elapsed_ms,
        events
    );
    CodexTurnResponse {
        ok: true,
        transport: "claude-stream-json".to_string(),
        project_id: project.id.clone(),
        request_id: request_id.to_string(),
        thread_id: thread_id.to_string(),
        turn_id: turn_id.to_string(),
        text,
        first_delta_ms,
        elapsed_ms,
        plan_detected: crate::domain::import_planning::has_generated_plan_pages(&project.root),
        events,
        metrics,
    }
}

fn describe_claude_event(value: &Value) -> String {
    match value["type"].as_str().unwrap_or("event") {
        "system" => {
            let subtype = value["subtype"].as_str().unwrap_or("system");
            format!("claude system.{subtype}")
        }
        "assistant" => {
            let chars = claude_assistant_text(&value["message"]).chars().count();
            format!("claude assistant: {chars} chars")
        }
        "user" => "claude user (tool result)".to_string(),
        "result" => {
            let subtype = value["subtype"].as_str().unwrap_or("result");
            format!("claude result.{subtype}")
        }
        other => format!("claude {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn claude_assistant_text_concatenates_text_blocks() {
        let message = json!({
            "content": [
                { "type": "text", "text": "Hello " },
                { "type": "tool_use", "name": "Read", "input": {} },
                { "type": "text", "text": "world" }
            ]
        });
        assert_eq!(claude_assistant_text(&message), "Hello world");
    }

    #[test]
    fn claude_assistant_text_handles_missing_content() {
        assert_eq!(claude_assistant_text(&json!({})), "");
    }
}
