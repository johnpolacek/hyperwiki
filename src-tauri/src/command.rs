use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperwikiRequest {
    pub path: String,
    pub method: String,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperwikiResponse {
    pub ok: bool,
    pub status: u16,
    pub text: String,
}

#[tauri::command]
pub fn hyperwiki_request(request: HyperwikiRequest) -> HyperwikiResponse {
    if request.path == "/api/settings" {
        let store = crate::domain::settings::SettingsStore::from_environment();
        if request.method == "GET" {
            return json_response(200, &store.read());
        }
        if request.method == "PUT" {
            let parsed = request
                .body
                .as_deref()
                .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok());
            return match parsed {
                Some(settings) => match store.write(settings) {
                    Ok(settings) => json_response(200, &settings),
                    Err(error) => error_response(500, error),
                },
                None => error_response(400, "Invalid settings JSON body."),
            };
        }
    }
    if request.method == "POST" && request.path.starts_with("/api/settings/reset-theme") {
        let store = crate::domain::settings::SettingsStore::from_environment();
        return match store.reset_theme() {
            Ok(settings) => json_response(200, &settings),
            Err(error) => error_response(500, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/assets/theme.css") {
        let settings = crate::domain::settings::SettingsStore::from_environment().read();
        return text_response(200, crate::domain::settings::theme_css(&settings));
    }
    if request.path.starts_with("/api/settings/agents-file")
        || request.path.starts_with("/api/settings/sync-agents")
    {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let Some(project) = project else {
            return error_response(404, "Project not found for settings request.");
        };
        if request.method == "GET" && request.path.starts_with("/api/settings/agents-file") {
            return json_response(200, &crate::domain::settings::agents_file(&project.root));
        }
        if request.method == "POST" && request.path.starts_with("/api/settings/sync-agents") {
            let body = request
                .body
                .as_deref()
                .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
                .unwrap_or(serde_json::Value::Null);
            let base_content = body["content"].as_str();
            let settings = crate::domain::settings::SettingsStore::from_environment().read();
            return match crate::domain::settings::sync_agents_file(
                &project.root,
                &settings,
                base_content,
            ) {
                Ok(result) => json_response(200, &result),
                Err(error) => error_response(500, error),
            };
        }
    }
    if request.method == "GET" && request.path.starts_with("/api/projects") {
        let active_id = query_param(&request.path, "project");
        return json_response(
            200,
            &crate::domain::projects::ProjectRegistry::from_environment()
                .list(active_id.as_deref()),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/layout") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::previews::layout_config_for_root(project_root),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/app-previews") {
        let active_id = query_param(&request.path, "project");
        return json_response(
            200,
            &crate::domain::previews::app_preview_summary(
                &crate::domain::projects::ProjectRegistry::from_environment(),
                active_id.as_deref(),
            ),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/app-preview") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let active_id = query_param(&request.path, "project");
        let summary = crate::domain::previews::app_preview_summary(&registry, active_id.as_deref());
        return match summary.active_preview {
            Some(preview) => json_response(200, &preview),
            None => json_response(200, &serde_json::Value::Null),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/wiki") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        if let Some(project) = project {
            return json_response(
                200,
                &crate::domain::wiki::list_wiki_pages(&project.root, Some(&project.id)),
            );
        }
        return json_response(
            200,
            &crate::domain::wiki::list_wiki_pages(
                std::env::current_dir().unwrap_or_else(|_| ".".into()),
                None,
            ),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/repo") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        if let Some(project) = project {
            return json_response(200, &crate::domain::git::repo_context(&project.root));
        }
        return json_response(
            200,
            &crate::domain::git::repo_context(
                std::env::current_dir().unwrap_or_else(|_| ".".into()),
            ),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/workspace") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::verification::workspace_summary(project_root),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/verification") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::verification::verification_summary(project_root),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/guardrails") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::verification::guardrail_summary(project_root),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/project-contract") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::verification::project_contract(project_root),
        );
    }
    if request.method == "GET" && request.path.starts_with("/api/mcp-surface") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(200, &crate::domain::mcp::mcp_surface_summary(project_root));
    }
    if request.method == "POST" && request.path.starts_with("/api/git/init") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let Some(project) = project else {
            return error_response(404, "Project not found for Git initialization.");
        };
        return match crate::domain::git::initialize_git_onboarding(&project.root) {
            Ok(result) => json_response(200, &result),
            Err(error) => error_response(500, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/worktrees") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project = resolve_request_project(&request.path).or_else(current_project_record);
        let Some(project) = project else {
            return error_response(404, "Project not found for worktree creation.");
        };
        let parsed = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::git::WorktreeCreateRequest>(body).ok()
            })
            .unwrap_or(crate::domain::git::WorktreeCreateRequest {
                branch: None,
                name: None,
            });
        return match crate::domain::git::create_worktree_checkout(&registry, &project, parsed) {
            Ok(result) => json_response(200, &result),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/sessions") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        let scope = query_param(&request.path, "scope");
        return json_response(
            200,
            &crate::domain::sessions::SessionRegistry::new(&project_root)
                .list(scope.as_deref(), true),
        );
    }
    if request.method == "POST" && request.path.starts_with("/api/sessions/prune") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        let registry = crate::domain::sessions::SessionRegistry::new(&project_root);
        if let Err(error) = registry.prune() {
            return error_response(500, error);
        }
        return json_response(200, &registry.list(None, false));
    }
    if request.path.starts_with("/api/sessions/") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        let registry = crate::domain::sessions::SessionRegistry::new(&project_root);
        let path_without_query = request
            .path
            .split_once('?')
            .map(|(path, _)| path)
            .unwrap_or(&request.path);
        if request.method == "POST" && path_without_query.ends_with("/export") {
            let id = path_without_query
                .trim_start_matches("/api/sessions/")
                .trim_end_matches("/export");
            return match registry.export(id) {
                Ok(export) => json_response(200, &export),
                Err(error) => error_response(404, error),
            };
        }
        let id = path_without_query.trim_start_matches("/api/sessions/");
        if request.method == "PATCH" {
            let body = request
                .body
                .as_deref()
                .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
                .unwrap_or(serde_json::Value::Null);
            return match registry.rename(id, body["name"].as_str().unwrap_or_default()) {
                Ok(session) => {
                    json_response(200, &crate::domain::sessions::SessionResponse { session })
                }
                Err(error) => error_response(400, error),
            };
        }
        if request.method == "DELETE" {
            return match registry.close(id) {
                Ok(session) => {
                    json_response(200, &crate::domain::sessions::SessionResponse { session })
                }
                Err(error) => error_response(500, error),
            };
        }
    }
    if request.method == "POST" && request.path.starts_with("/api/terminal/start") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        let parsed = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::terminals::TerminalStartRequest>(body).ok()
            })
            .unwrap_or(crate::domain::terminals::TerminalStartRequest {
                id: None,
                name: None,
                role: None,
                command: None,
                scope: None,
                scope_kind: None,
                plan_path: None,
            });
        let mut manager = terminal_manager()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        return match manager.start_session(project_root, parsed) {
            Ok(result) => json_response(200, &result),
            Err(error) => error_response(500, error),
        };
    }
    if request.path.starts_with("/api/terminal/") {
        let path_without_query = request
            .path
            .split_once('?')
            .map(|(path, _)| path)
            .unwrap_or(&request.path);
        let mut parts = path_without_query
            .trim_start_matches("/api/terminal/")
            .split('/');
        let id = parts.next().unwrap_or_default();
        let action = parts.next().unwrap_or_default();
        let mut manager = terminal_manager()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if request.method == "POST" && action == "write" {
            let body = request
                .body
                .as_deref()
                .and_then(|body| {
                    serde_json::from_str::<crate::domain::terminals::TerminalInputRequest>(body)
                        .ok()
                })
                .unwrap_or(crate::domain::terminals::TerminalInputRequest {
                    input: String::new(),
                });
            return match manager.write(id, &body.input) {
                Ok(result) => json_response(200, &result),
                Err(error) => error_response(404, error),
            };
        }
        if request.method == "POST" && action == "resize" {
            let body = request
                .body
                .as_deref()
                .and_then(|body| {
                    serde_json::from_str::<crate::domain::terminals::TerminalResizeRequest>(body)
                        .ok()
                })
                .unwrap_or(crate::domain::terminals::TerminalResizeRequest {
                    cols: None,
                    rows: None,
                });
            return match manager.resize(id, body) {
                Ok(result) => json_response(200, &result),
                Err(error) => error_response(404, error),
            };
        }
        if request.method == "GET" && action == "output" {
            return match manager.output(id) {
                Ok(result) => json_response(200, &result),
                Err(error) => error_response(404, error),
            };
        }
        if request.method == "DELETE" {
            return match manager.close(id) {
                Ok(session) => {
                    json_response(200, &crate::domain::sessions::SessionResponse { session })
                }
                Err(error) => error_response(404, error),
            };
        }
    }
    if request.method == "POST" && request.path.starts_with("/api/agent/prompt") {
        let project = resolve_request_project(&request.path).or_else(current_project_record);
        let Some(project) = project else {
            return error_response(404, "Project not found for agent prompt.");
        };
        let body = request
            .body
            .as_deref()
            .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
            .unwrap_or(serde_json::Value::Null);
        return match send_agent_prompt(&project, &body) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/review-workflows") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::reviews::review_workflow_summary(project_root),
        );
    }
    if request.method == "POST" && request.path.starts_with("/api/review-workflows/run") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for review workflow.");
        };
        let body = request
            .body
            .as_deref()
            .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
            .unwrap_or(serde_json::Value::Null);
        let dry_run = body["dryRun"].as_bool() == Some(true);
        let workflow_id = body["workflowId"].as_str().unwrap_or_default();
        let current_page = body["currentPage"].as_str();
        let prepared = match crate::domain::reviews::prepare_review_workflow(
            &project.root,
            workflow_id,
            current_page,
            dry_run,
        ) {
            Ok(prepared) => prepared,
            Err(error) => return error_response(404, error),
        };
        if dry_run {
            return json_response(200, &prepared);
        }
        let prompt_body = serde_json::json!({
            "prompt": prepared.prompt.clone().unwrap_or_default(),
            "currentPage": current_page.unwrap_or("/wiki/plans/index.html"),
            "scope": body["scope"].as_str().unwrap_or_default()
        });
        return match send_agent_prompt(&project, &prompt_body) {
            Ok(result) => json_response(
                200,
                &crate::domain::reviews::response_with_session(prepared, result["session"].clone()),
            ),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path == "/api/health" {
        return json_response(
            200,
            &serde_json::json!({
                "ok": true,
                "app": "hyperwiki",
                "runtime": "tauri"
            }),
        );
    }
    let text = serde_json::json!({
        "error": "Tauri command transport is not implemented for this endpoint yet.",
        "path": request.path,
        "method": request.method,
        "bodyPresent": request.body.is_some(),
        "surfaces": crate::domain::surface_ids()
    })
    .to_string();
    HyperwikiResponse {
        ok: false,
        status: 501,
        text,
    }
}

fn json_response<T: Serialize>(status: u16, value: &T) -> HyperwikiResponse {
    HyperwikiResponse {
        ok: status < 400,
        status,
        text: serde_json::to_string(value).expect("response should serialize"),
    }
}

fn text_response(status: u16, text: String) -> HyperwikiResponse {
    HyperwikiResponse {
        ok: status < 400,
        status,
        text,
    }
}

fn error_response(status: u16, message: impl Into<String>) -> HyperwikiResponse {
    json_response(status, &serde_json::json!({ "error": message.into() }))
}

fn query_param(path: &str, key: &str) -> Option<String> {
    let query = path.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (left, right) = pair.split_once('=')?;
        (left == key).then(|| right.to_string())
    })
}

fn resolve_request_project(path: &str) -> Option<crate::domain::projects::ProjectRecord> {
    let registry = crate::domain::projects::ProjectRegistry::from_environment();
    let project_id = query_param(path, "project");
    registry.resolve(
        project_id.as_deref(),
        std::env::current_dir().ok().as_deref(),
    )
}

fn current_project_record() -> Option<crate::domain::projects::ProjectRecord> {
    let root = std::env::current_dir().ok()?;
    let info = crate::domain::projects::project_from_root(&root);
    info.available
        .then_some(crate::domain::projects::ProjectRecord {
            id: "current".to_string(),
            root,
            name: info.name,
            project_slug: "current".to_string(),
            worktree_slug: "main".to_string(),
            last_opened_at: None,
            available: true,
            active: false,
        })
}

fn terminal_manager() -> &'static Mutex<crate::domain::terminals::TerminalManager> {
    static MANAGER: OnceLock<Mutex<crate::domain::terminals::TerminalManager>> = OnceLock::new();
    MANAGER.get_or_init(|| Mutex::new(crate::domain::terminals::TerminalManager::new()))
}

fn send_agent_prompt(
    project: &crate::domain::projects::ProjectRecord,
    body: &serde_json::Value,
) -> Result<serde_json::Value, (u16, String)> {
    let prompt = body["prompt"].as_str().unwrap_or_default().trim();
    if prompt.is_empty() {
        return Err((400, "Prompt is required.".to_string()));
    }
    let scope = body["scope"].as_str().unwrap_or_default();
    let sessions = crate::domain::sessions::SessionRegistry::new(&project.root).list(None, false);
    let Some(agent_session) = sessions.sessions.into_iter().rev().find(|session| {
        (session.status == "active" || session.status == "detached")
            && session.role == "agent"
            && (scope.is_empty() || session.scope == scope)
            && session
                .command
                .as_deref()
                .map(str::trim)
                .is_some_and(|command| !command.is_empty())
    }) else {
        return Err((409, "No active agent session is available.".to_string()));
    };
    let current_page = body["currentPage"]
        .as_str()
        .unwrap_or("/wiki/plans/index.html");
    let message = [
        "",
        "Please handle this hyperwiki workspace request.",
        "",
        &format!("Project: {}", project.name),
        &format!("Repo root: {}", project.root.display()),
        &format!("Current wiki page: {current_page}"),
        "If AGENTS.md contains a HyperWiki Global Context managed block, treat it as active Soul and Memory guidance.",
        "Keep durable project knowledge in wiki/ HTML pages and Git-visible files. Run relevant checks before finishing.",
        "When creating a new plan page, do not append \"Plan\" to the page title; the plans sidebar already supplies that context.",
        "",
        prompt,
        "",
    ]
    .join("\n");
    let mut manager = terminal_manager()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    manager
        .write(&agent_session.id, &codex_paste_input(&message))
        .map_err(|error| (409, error))?;
    manager
        .write(&agent_session.id, "\r")
        .map_err(|error| (409, error))?;
    Ok(serde_json::json!({
        "ok": true,
        "session": {
            "id": agent_session.id,
            "name": agent_session.name
        }
    }))
}

fn codex_paste_input(message: &str) -> String {
    format!("\x1b[200~{message}\x1b[201~")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Mutex, OnceLock};
    use std::thread::sleep;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    #[test]
    fn response_shape_is_json_serializable() {
        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/not-implemented".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let value = serde_json::to_value(response).expect("response should serialize");
        assert_eq!(value["ok"], false);
        assert_eq!(value["status"], 501);
        assert!(value["text"]
            .as_str()
            .unwrap()
            .contains("/api/not-implemented"));
    }

    #[test]
    fn health_endpoint_is_implemented() {
        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/health".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        assert!(response.ok);
        assert_eq!(response.status, 200);
        assert!(response.text.contains("\"runtime\":\"tauri\""));
    }

    #[test]
    fn app_preview_endpoints_return_active_preview_and_layout() {
        let _guard = env_lock();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let home = temp_root("command-preview-home");
        let root = temp_root("command-preview-project");
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({
                "projectName": "Command Preview",
                "dev": {
                    "command": "",
                    "previewUrl": "https://command-preview.localhost"
                }
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            root.join("package.json"),
            serde_json::json!({
                "scripts": { "dev": "vite" },
                "packageManager": "pnpm@10.33.3"
            })
            .to_string(),
        )
        .unwrap();
        fs::create_dir_all(&home).unwrap();
        fs::write(
            home.join("projects.json"),
            serde_json::json!({
                "version": 1,
                "projects": [{
                    "id": "preview-id",
                    "root": root,
                    "name": "Command Preview",
                    "projectSlug": "command-preview",
                    "worktreeSlug": "main",
                    "available": true
                }]
            })
            .to_string(),
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);

        let layout = hyperwiki_request(HyperwikiRequest {
            path: "/api/layout?project=preview-id".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let preview = hyperwiki_request(HyperwikiRequest {
            path: "/api/app-preview?project=preview-id".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(layout.ok);
        assert!(layout.text.contains("\"command\":\"pnpm run dev\""));
        assert!(preview.ok);
        assert!(preview.text.contains("\"projectId\":\"preview-id\""));
        assert!(preview.text.contains("\"status\":\""));
        assert!(preview
            .text
            .contains("\"expectedUrl\":\"https://command-preview.localhost\""));
    }

    #[test]
    fn worktree_endpoint_requires_git_checkout() {
        let _guard = env_lock();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let home = temp_root("command-worktree-home");
        let root = temp_root("command-worktree-project");
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({ "projectName": "Command Worktree" }).to_string(),
        )
        .unwrap();
        fs::create_dir_all(&home).unwrap();
        fs::write(
            home.join("projects.json"),
            serde_json::json!({
                "version": 1,
                "projects": [{
                    "id": "worktree-id",
                    "root": root,
                    "name": "Command Worktree",
                    "projectSlug": "command-worktree",
                    "worktreeSlug": "main",
                    "available": true
                }]
            })
            .to_string(),
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/worktrees?project=worktree-id".to_string(),
            method: "POST".to_string(),
            body: Some(serde_json::json!({ "branch": "feature/test" }).to_string()),
        });

        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(!response.ok);
        assert_eq!(response.status, 409);
        assert!(response.text.contains("Initialize Git"));
    }

    #[test]
    fn workspace_verification_and_guardrail_endpoints_return_models() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-verification");
        let home = temp_root("command-verification-home");
        fs::create_dir_all(root.join(".hyperwiki").join("state")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({
                "projectName": "Command Verification",
                "verification": {
                    "loops": [{
                        "id": "syntax-checks",
                        "label": "Syntax checks",
                        "command": "pnpm run check",
                        "scope": "codebase",
                        "trigger": "before commit"
                    }]
                }
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            root.join(".hyperwiki")
                .join("state")
                .join("verification.json"),
            serde_json::json!({
                "runs": [{
                    "loopId": "syntax-checks",
                    "status": "passed",
                    "ranAt": "2026-05-14T12:00:00.000Z"
                }]
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.html"),
            "<h1>Plans</h1><section class=\"summary\"><ul><li>Current stage: Stage 01</li><li>Current unit: Unit 01</li></ul></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("log.html"),
            "<h1>Log</h1><h2>Entry</h2>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let workspace = hyperwiki_request(HyperwikiRequest {
            path: "/api/workspace".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let verification = hyperwiki_request(HyperwikiRequest {
            path: "/api/verification".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let guardrails = hyperwiki_request(HyperwikiRequest {
            path: "/api/guardrails".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let contract = hyperwiki_request(HyperwikiRequest {
            path: "/api/project-contract".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let mcp_surface = hyperwiki_request(HyperwikiRequest {
            path: "/api/mcp-surface".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(workspace.ok);
        assert!(workspace.text.contains("\"current\":\"Unit 01\""));
        assert!(verification.ok);
        assert!(verification.text.contains("\"status\":\"passed\""));
        assert!(guardrails.ok);
        assert!(guardrails.text.contains("Localhost Tooling"));
        assert!(contract.ok);
        assert!(contract.text.contains("hyperwiki.project-contract"));
        assert!(contract.text.contains("Verification loops:"));
        assert!(mcp_surface.ok);
        assert!(mcp_surface.text.contains("hyperwiki.mcp-surface"));
        assert!(mcp_surface.text.contains("hyperwiki://project-contract"));
    }

    #[test]
    fn wiki_endpoint_lists_current_checkout_when_registry_is_empty() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki");
        let home = temp_root("command-wiki-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join("wiki").join("index.html"),
            "<h1>Command Wiki</h1>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok);
        assert_eq!(response.status, 200);
        assert!(response.text.contains("Command Wiki"));
        assert!(response.text.contains("/wiki/index.html"));
    }

    fn temp_root(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-tauri-{label}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn settings_endpoint_reads_from_isolated_home() {
        let _guard = env_lock();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let home = temp_root("command-settings-home");
        std::env::set_var("HYPERWIKI_HOME", &home);

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/settings".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok);
        assert!(response.text.contains("\"activePreset\":\"paper\""));
    }

    #[test]
    fn repo_endpoint_reports_current_checkout_git_context() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-repo");
        let home = temp_root("command-repo-home");
        fs::write(root.join("README.md"), "# Repo\n").unwrap();
        crate::domain::git::git(&root, &["init"]);
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/repo".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok);
        assert!(response.text.contains("\"worktree\":\"main\""));
        assert!(response.text.contains("README.md"));
    }

    #[test]
    fn sessions_endpoint_lists_and_mutates_current_checkout_sessions() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-sessions");
        let home = temp_root("command-sessions-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("index.html"), "<h1>Sessions</h1>").unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();
        let registry = crate::domain::sessions::SessionRegistry::new(&root);
        registry
            .upsert(
                "agent-one",
                crate::domain::sessions::SessionUpdates {
                    name: Some("agent".to_string()),
                    scope: Some("plan:/wiki/plans/index.html".to_string()),
                    ..crate::domain::sessions::SessionUpdates::default()
                },
            )
            .unwrap();

        let list = hyperwiki_request(HyperwikiRequest {
            path: "/api/sessions?scope=plan:/wiki/plans/index.html".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let rename = hyperwiki_request(HyperwikiRequest {
            path: "/api/sessions/agent-one".to_string(),
            method: "PATCH".to_string(),
            body: Some("{\"name\":\"agent renamed\"}".to_string()),
        });
        let export = hyperwiki_request(HyperwikiRequest {
            path: "/api/sessions/agent-one/export".to_string(),
            method: "POST".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(list.ok);
        assert!(list.text.contains("agent-one"));
        assert!(rename.text.contains("agent renamed"));
        assert!(export.text.contains("runtime-only"));
    }

    #[test]
    fn terminal_endpoints_start_write_replay_and_close_pipe_session() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-terminal");
        let home = temp_root("command-terminal-home");
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let start = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/start".to_string(),
            method: "POST".to_string(),
            body: Some("{\"id\":\"terminal-command\",\"name\":\"cli\"}".to_string()),
        });
        let write = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/terminal-command/write".to_string(),
            method: "POST".to_string(),
            body: Some("{\"input\":\"printf tauri-terminal-command\\\\n\\n\"}".to_string()),
        });
        let output = wait_for_terminal_output("terminal-command", "tauri-terminal-command");
        let close = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/terminal-command".to_string(),
            method: "DELETE".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(start.ok);
        assert!(
            start.text.contains("\"mode\":\"pty\"")
                || start.text.contains("\"mode\":\"pipe-fallback\"")
        );
        assert!(write.ok);
        assert!(output.contains("tauri-terminal-command"));
        assert!(close.ok);
        assert!(close.text.contains("\"status\":\"closed\""));
    }

    #[test]
    fn agent_prompt_routes_only_to_command_backed_agent_session() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-agent-prompt");
        let home = temp_root("command-agent-prompt-home");
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            "{\"project\":{\"name\":\"Agent Prompt\"}}",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("index.html"),
            "<h1>Agent Prompt</h1>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let missing = hyperwiki_request(HyperwikiRequest {
            path: "/api/agent/prompt".to_string(),
            method: "POST".to_string(),
            body: Some("{\"prompt\":\"Before agent exists\"}".to_string()),
        });
        let start = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/start".to_string(),
            method: "POST".to_string(),
            body: Some("{\"id\":\"agent-command\",\"name\":\"agent\",\"role\":\"agent\",\"command\":\"codex --yolo\",\"scope\":\"plan:/wiki/plans/index.html\"}".to_string()),
        });
        let routed = hyperwiki_request(HyperwikiRequest {
            path: "/api/agent/prompt".to_string(),
            method: "POST".to_string(),
            body: Some("{\"prompt\":\"Do the thing\",\"currentPage\":\"/wiki/plans/index.html\",\"scope\":\"plan:/wiki/plans/index.html\"}".to_string()),
        });
        let close = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/agent-command".to_string(),
            method: "DELETE".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(!missing.ok);
        assert_eq!(missing.status, 409);
        assert!(start.ok);
        assert!(routed.ok);
        assert!(routed.text.contains("\"id\":\"agent-command\""));
        assert!(close.ok);
    }

    #[test]
    fn review_workflow_endpoints_prepare_and_route_prompts() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-review-workflows");
        let home = temp_root("command-review-workflows-home");
        make_hyperwiki_project(&root, "Review Workflow Command");
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let summary = hyperwiki_request(HyperwikiRequest {
            path: "/api/review-workflows".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let prepared = hyperwiki_request(HyperwikiRequest {
            path: "/api/review-workflows/run".to_string(),
            method: "POST".to_string(),
            body: Some("{\"workflowId\":\"security-review\",\"currentPage\":\"/wiki/plans/index.html\",\"dryRun\":true}".to_string()),
        });
        let start = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/start".to_string(),
            method: "POST".to_string(),
            body: Some("{\"id\":\"review-agent\",\"name\":\"agent\",\"role\":\"agent\",\"command\":\"codex --yolo\",\"scope\":\"plan:/wiki/plans/index.html\"}".to_string()),
        });
        let routed = hyperwiki_request(HyperwikiRequest {
            path: "/api/review-workflows/run".to_string(),
            method: "POST".to_string(),
            body: Some("{\"workflowId\":\"security-review\",\"currentPage\":\"/wiki/plans/index.html\",\"scope\":\"plan:/wiki/plans/index.html\"}".to_string()),
        });
        let close = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/review-agent".to_string(),
            method: "DELETE".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(summary.ok);
        assert!(summary.text.contains("hyperwiki.review-workflows"));
        assert!(summary.text.contains("security-review"));
        assert!(prepared.ok);
        assert!(prepared.text.contains("\"sent\":false"));
        assert!(prepared.text.contains("Workflow: Security Review"));
        assert!(prepared.text.contains("Project: Review Workflow Command"));
        assert!(start.ok);
        assert!(routed.ok);
        assert!(routed.text.contains("\"sent\":true"));
        assert!(routed.text.contains("\"id\":\"review-agent\""));
        assert!(close.ok);
    }

    fn wait_for_terminal_output(id: &str, needle: &str) -> String {
        for _ in 0..30 {
            let response = hyperwiki_request(HyperwikiRequest {
                path: format!("/api/terminal/{id}/output"),
                method: "GET".to_string(),
                body: None,
            });
            if response.text.contains(needle) {
                return response.text;
            }
            sleep(Duration::from_millis(50));
        }
        hyperwiki_request(HyperwikiRequest {
            path: format!("/api/terminal/{id}/output"),
            method: "GET".to_string(),
            body: None,
        })
        .text
    }

    fn make_hyperwiki_project(root: &std::path::Path, name: &str) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            format!("{{\"projectName\":\"{name}\"}}"),
        )
        .unwrap();
        fs::write(root.join("wiki").join("index.html"), "<h1>Home</h1>").unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.html"),
            "<h1>Plans</h1><section class=\"summary\"><ul><li>Status: active</li></ul></section>",
        )
        .unwrap();
    }
}
