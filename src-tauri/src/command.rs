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

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

pub fn set_app_handle(app: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app);
}

#[tauri::command]
pub fn hyperwiki_request(request: HyperwikiRequest) -> HyperwikiResponse {
    let app = APP_HANDLE.get().cloned();
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
        let list =
            crate::domain::projects::ProjectRegistry::from_environment().list(active_id.as_deref());
        eprintln!(
            "[hyperwiki] projects list active_id={:?} projects={} checkouts={} groups={} active={:?}",
            active_id,
            list.projects.len(),
            list.checkouts.len(),
            list.project_groups.len(),
            list.active_project_id
        );
        return json_response(200, &list);
    }
    if request.method == "POST" && request.path.starts_with("/api/projects/create") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let body = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::projects::ProjectCreateRequest>(body).ok()
            })
            .unwrap_or(crate::domain::projects::ProjectCreateRequest {
                title: String::new(),
                summary: None,
                document: None,
                document_type: None,
                source_documents: Vec::new(),
                planning_answers: std::collections::BTreeMap::new(),
                initialize_git: None,
                install_agent_skills: None,
                agent_launch_command: None,
            });
        eprintln!(
            "[hyperwiki] import create start title={:?} document_bytes={} document_type={:?}",
            body.title,
            body.document.as_deref().map(str::len).unwrap_or(0),
            body.document_type
        );
        return match crate::domain::projects::create_project_from_dashboard(&registry, body) {
            Ok(result) => {
                eprintln!(
                    "[hyperwiki] import create ok project_id={} root={}",
                    result.project.id,
                    result.project.root.display()
                );
                crate::domain::codex_app_server::spawn_import_thread_prewarm(
                    result.project.clone(),
                );
                json_response(200, &result)
            }
            Err((status, error)) => {
                eprintln!("[hyperwiki] import create error status={status} error={error}");
                error_response(status, error)
            }
        };
    }
    if request.method == "DELETE" && request.path.starts_with("/api/projects/") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let path_without_query = request
            .path
            .split_once('?')
            .map(|(path, _)| path)
            .unwrap_or(&request.path);
        let id = path_without_query.trim_start_matches("/api/projects/");
        let body = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::projects::ProjectRemoveRequest>(body).ok()
            })
            .unwrap_or(crate::domain::projects::ProjectRemoveRequest {
                delete_files: false,
                root: None,
            });
        return match registry.remove_with_root_fallback(id, body) {
            Ok(result) => json_response(200, &result),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET"
        && (request.path.starts_with("/wiki/")
            || (request.path.starts_with("/projects/") && request.path.contains("/wiki/")))
    {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return match crate::domain::wiki::read_wiki_page(project_root, &request.path) {
            Ok(html) => text_response(200, html),
            Err(error) => error_response(404, error),
        };
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
    if request.method == "GET" && request.path.starts_with("/api/wiki/export-markdown-zip") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(
            200,
            &crate::domain::wiki::wiki_markdown_zip_export(project_root),
        );
    }
    if request.method == "POST"
        && request
            .path
            .starts_with("/api/wiki/export-markdown-zip/download")
    {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let reveal = query_param(&request.path, "reveal").as_deref() != Some("false");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return match crate::domain::wiki::save_wiki_markdown_zip_to_downloads(project_root, reveal)
        {
            Ok(result) => json_response(200, &result),
            Err(error) => error_response(500, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/wiki/skill.md") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return text_response(200, crate::domain::wiki::wiki_project_skill(project_root).content);
    }
    if request.method == "GET" && request.path.starts_with("/api/wiki/page-markdown") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let source_path = query_param(&request.path, "path")
            .and_then(|path| percent_decode_path_segment(&path))
            .unwrap_or_else(|| "/wiki/index.mdx".to_string());
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return match crate::domain::wiki::wiki_page_markdown(project_root, &source_path) {
            Ok(source) => json_response(200, &source),
            Err(error) => error_response(404, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/wiki/llms.txt") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return text_response(200, crate::domain::wiki::wiki_llms_txt(project_root));
    }
    if request.method == "GET" && request.path.starts_with("/api/wiki/fingerprint") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return json_response(200, &crate::domain::wiki::wiki_fingerprint(project_root));
    }
    if request.method == "GET" && request.path.starts_with("/api/wiki/source") {
        let registry = crate::domain::projects::ProjectRegistry::from_environment();
        let project_id = query_param(&request.path, "project");
        let source_path = query_param(&request.path, "path")
            .and_then(|path| percent_decode_path_segment(&path))
            .unwrap_or_else(|| "/wiki/index.mdx".to_string());
        let project = registry.resolve(
            project_id.as_deref(),
            std::env::current_dir().ok().as_deref(),
        );
        let project_root = project
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return match crate::domain::wiki::read_wiki_source(project_root, &source_path) {
            Ok(source) => json_response(200, &source),
            Err(error) => error_response(404, error),
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
    if request.method == "POST" && request.path.starts_with("/api/import-planning/clarify") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            eprintln!(
                "[hyperwiki] import planning clarify error status=404 path={}",
                request.path
            );
            return error_response(404, "Project not found for import planning.");
        };
        let parsed = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::import_planning::ImportPlanningRequest>(body)
                    .ok()
            })
            .unwrap_or(crate::domain::import_planning::ImportPlanningRequest {
                plan_title: String::new(),
                answers: Vec::new(),
            });
        eprintln!(
            "[hyperwiki] import planning clarify start project_id={} root={} answers={}",
            project.id,
            project.root.display(),
            parsed.answers.len()
        );
        return json_response(
            200,
            &crate::domain::import_planning::clarify_import_plan(&project.root, parsed),
        );
    }
    if request.method == "POST" && request.path.starts_with("/api/import-onboarding/start") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding.");
        };
        return match crate::domain::import_onboarding_runtime::start_import_onboarding(project, app)
        {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-onboarding/prewarm") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding prewarm.");
        };
        return match crate::domain::codex_app_server::prewarm_import_thread(project) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/import-onboarding/status") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding.");
        };
        return match crate::domain::import_onboarding_runtime::import_onboarding_status(&project) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/import-onboarding/events") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding.");
        };
        return match crate::domain::import_onboarding_runtime::import_onboarding_events(&project) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-onboarding/answer") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding.");
        };
        let Some(parsed) = request.body.as_deref().and_then(|body| {
            serde_json::from_str::<
                crate::domain::import_onboarding_runtime::ImportOnboardingAnswerRequest,
            >(body)
            .ok()
        }) else {
            return error_response(400, "Invalid import onboarding answer request.");
        };
        return match crate::domain::import_onboarding_runtime::answer_import_onboarding(
            project, parsed, app,
        ) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-onboarding/retry") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding.");
        };
        return match crate::domain::import_onboarding_runtime::retry_import_onboarding(project, app)
        {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-onboarding/cancel") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import onboarding.");
        };
        return match crate::domain::import_onboarding_runtime::cancel_import_onboarding(
            project, app,
        ) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/import-planning/status") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import planning.");
        };
        return json_response(
            200,
            &crate::domain::import_planning::import_planning_status(&project.root),
        );
    }
    if request.method == "POST" && request.path.starts_with("/api/import-planning/question") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import planning.");
        };
        let parsed = request.body.as_deref().and_then(|body| {
            serde_json::from_str::<crate::domain::import_planning::HumanInputCheckpointRequest>(
                body,
            )
            .ok()
        });
        let Some(parsed) = parsed else {
            return error_response(400, "Invalid import planning question checkpoint.");
        };
        return match crate::domain::import_planning::record_human_input_request(
            &project.root,
            parsed,
        ) {
            Ok(result) => json_response(200, &result),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-planning/answer") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import planning.");
        };
        let parsed =
            request
                .body
                .as_deref()
                .and_then(|body| {
                    serde_json::from_str::<
                        crate::domain::import_planning::ImportPlanningProgressRequest,
                    >(body)
                    .ok()
                })
                .unwrap_or(
                    crate::domain::import_planning::ImportPlanningProgressRequest {
                        question: None,
                        answer: String::new(),
                        request_id: String::new(),
                    },
                );
        return match crate::domain::import_planning::record_import_planning_answer(
            &project.root,
            parsed,
        ) {
            Ok(result) => json_response(200, &result),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-planning/create-plan") {
        let Some(project) = resolve_request_project(&request.path).or_else(current_project_record)
        else {
            return error_response(404, "Project not found for import planning.");
        };
        let parsed = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::import_planning::ImportPlanningRequest>(body)
                    .ok()
            })
            .unwrap_or(crate::domain::import_planning::ImportPlanningRequest {
                plan_title: String::new(),
                answers: Vec::new(),
            });
        return match crate::domain::import_planning::create_import_plan(&project.root, parsed) {
            Ok(result) => json_response(200, &result),
            Err((status, error)) => error_response(status, error),
        };
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
        let registry = crate::domain::sessions::SessionRegistry::new(&project_root);
        let mut sessions = registry.list(scope.as_deref(), true);
        let manager = terminal_manager()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        for session in sessions.sessions.iter_mut() {
            let is_live = manager.diagnostics(&session.id).live;
            if is_live {
                session.status = "active".to_string();
                session.connected_clients = session.connected_clients.max(1);
            } else if session.status == "active" {
                if let Ok(closed) = registry.close(&session.id) {
                    *session = closed;
                } else {
                    session.status = "closed".to_string();
                    session.connected_clients = 0;
                }
            } else if session.status == "detached" {
                if let Ok(closed) = registry.close(&session.id) {
                    *session = closed;
                } else {
                    session.status = "closed".to_string();
                    session.connected_clients = 0;
                }
            }
            if session.status == "closed" {
                session.connected_clients = 0;
            }
        }
        sessions
            .sessions
            .retain(|session| session.status != "closed");
        return json_response(200, &sessions);
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
            let result = if body.get("visibility").is_some() || body.get("purpose").is_some() {
                registry.update_runtime_metadata(
                    id,
                    body["name"].as_str().map(str::to_string),
                    body["visibility"].as_str().map(str::to_string),
                    body["purpose"].as_str().map(str::to_string),
                )
            } else {
                registry.rename(id, body["name"].as_str().unwrap_or_default())
            };
            return match result {
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
                visibility: None,
                purpose: None,
            });
        let mut manager = terminal_manager()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        return match manager.start_session_with_app(project_root, parsed, app) {
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
        if request.method == "GET" && action == "replay" {
            return match manager.replay(id) {
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
    if request.method == "POST" && request.path.starts_with("/api/import-planning/turn-retry") {
        let project = resolve_request_project(&request.path).or_else(current_project_record);
        let Some(project) = project else {
            return error_response(404, "Project not found for import planning retry.");
        };
        let body = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::codex_app_server::CodexTurnRequest>(body).ok()
            })
            .unwrap_or(crate::domain::codex_app_server::CodexTurnRequest {
                prompt: String::new(),
                current_page: String::new(),
                request_id: String::new(),
            });
        return match crate::domain::codex_app_server::retry_import_planning_turn(project, body, app)
        {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-planning/turn-cancel") {
        let run_id = query_param(&request.path, "runId").unwrap_or_default();
        return match crate::domain::codex_app_server::cancel_import_planning_turn(&run_id, app) {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/import-planning/turn") {
        let project = resolve_request_project(&request.path).or_else(current_project_record);
        let Some(project) = project else {
            return error_response(404, "Project not found for import planning turn.");
        };
        let body = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::codex_app_server::CodexTurnRequest>(body).ok()
            })
            .unwrap_or(crate::domain::codex_app_server::CodexTurnRequest {
                prompt: String::new(),
                current_page: String::new(),
                request_id: String::new(),
            });
        return match crate::domain::codex_app_server::start_import_planning_turn(project, body, app)
        {
            Ok(value) => json_response(200, &value),
            Err((status, error)) => error_response(status, error),
        };
    }
    if request.method == "GET" && request.path.starts_with("/api/import-planning/turn-status") {
        let run_id = query_param(&request.path, "runId").unwrap_or_default();
        return match crate::domain::codex_app_server::import_planning_turn_status(&run_id) {
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
            "currentPage": current_page.unwrap_or("/wiki/plans/index.mdx"),
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
    if request.method == "GET" && request.path.starts_with("/api/app-shell") {
        return json_response(200, &crate::domain::app_shell::app_shell_summary());
    }
    if request.method == "POST" && request.path.starts_with("/api/app/open-external") {
        let body = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::app_shell::OpenTargetRequest>(body).ok()
            })
            .unwrap_or(crate::domain::app_shell::OpenTargetRequest {
                target: String::new(),
            });
        return match crate::domain::app_shell::open_external_target(&body.target) {
            Ok(result) => json_response(200, &result),
            Err(error) => error_response(400, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/app/reveal-project") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        return match crate::domain::app_shell::reveal_project_folder(project_root) {
            Ok(result) => json_response(200, &result),
            Err(error) => error_response(400, error),
        };
    }
    if request.method == "POST" && request.path.starts_with("/api/terminal/drop") {
        let project_root = resolve_request_project(&request.path)
            .map(|project| project.root)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_else(|| ".".into());
        let body = request
            .body
            .as_deref()
            .and_then(|body| {
                serde_json::from_str::<crate::domain::app_shell::DroppedFilesRequest>(body).ok()
            })
            .unwrap_or(crate::domain::app_shell::DroppedFilesRequest { files: Vec::new() });
        return match crate::domain::app_shell::save_dropped_files(project_root, body) {
            Ok(result) => json_response(200, &result),
            Err(error) => error_response(400, error),
        };
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
        (left == key)
            .then(|| percent_decode_path_segment(right).unwrap_or_else(|| right.to_string()))
    })
}

fn percent_decode_path_segment(value: &str) -> Option<String> {
    let mut output = String::new();
    let mut chars = value.as_bytes().iter().copied();
    while let Some(byte) = chars.next() {
        if byte == b'%' {
            let high = chars.next()?;
            let low = chars.next()?;
            let hex = [high, low];
            let text = std::str::from_utf8(&hex).ok()?;
            let decoded = u8::from_str_radix(text, 16).ok()?;
            output.push(decoded as char);
        } else if byte == b'+' {
            output.push(' ');
        } else {
            output.push(byte as char);
        }
    }
    Some(output)
}

fn path_project_id(path: &str) -> Option<String> {
    let path_without_query = path.split_once('?').map(|(path, _)| path).unwrap_or(path);
    let rest = path_without_query.strip_prefix("/projects/")?;
    let (id, _) = rest.split_once('/')?;
    (!id.is_empty()).then(|| id.to_string())
}

fn resolve_request_project(path: &str) -> Option<crate::domain::projects::ProjectRecord> {
    let registry = crate::domain::projects::ProjectRegistry::from_environment();
    let project_id = query_param(path, "project").or_else(|| path_project_id(path));
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
            root: root.clone(),
            name: info.name,
            project_slug: "current".to_string(),
            worktree_slug: "main".to_string(),
            last_opened_at: None,
            available: true,
            active: false,
            import_planning: Some(crate::domain::import_planning::import_planning_status(
                &root,
            )),
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
    let requested_session_id = body["sessionId"].as_str().unwrap_or_default();
    let request_id = body["requestId"].as_str().unwrap_or_default();
    let sessions = crate::domain::sessions::SessionRegistry::new(&project.root).list(None, false);
    let mut manager = terminal_manager()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let agent_session = if requested_session_id.is_empty() {
        sessions.sessions.into_iter().rev().find(|session| {
            (session.status == "active" || session.status == "detached")
                && session.role == "agent"
                && (scope.is_empty() || session.scope == scope)
                && session
                    .command
                    .as_deref()
                    .map(str::trim)
                    .is_some_and(|command| !command.is_empty())
                && manager.diagnostics(&session.id).live
        })
    } else {
        sessions.sessions.into_iter().find(|session| {
            session.id == requested_session_id
                && (session.status == "active" || session.status == "detached")
                && session.role == "agent"
                && session
                    .command
                    .as_deref()
                    .map(str::trim)
                    .is_some_and(|command| !command.is_empty())
        })
    };
    let Some(agent_session) = agent_session else {
        return Err((409, "No active agent session is available.".to_string()));
    };
    let before = manager.diagnostics(&agent_session.id);
    if !requested_session_id.is_empty() && !before.live {
        return Err((409, "Requested agent session is not live.".to_string()));
    }
    let current_page = body["currentPage"]
        .as_str()
        .unwrap_or("/wiki/plans/index.mdx");
    let message = [
        "",
        "Please handle this hyperwiki workspace request.",
        "",
        &format!("Project: {}", project.name),
        &format!("Repo root: {}", project.root.display()),
        &format!("Current wiki page: {current_page}"),
        "If AGENTS.md contains a hyperwiki Global Context managed block, treat it as active Soul and Memory guidance.",
        "Keep durable project knowledge in wiki/ MDX pages and Git-visible files. If you edit files, run relevant checks before finishing.",
        "When creating a new plan page, do not append \"Plan\" to the page title; the plans sidebar already supplies that context.",
        "",
        prompt,
        "",
    ]
    .join("\n");
    let paste = codex_paste_input(&message);
    manager
        .write(&agent_session.id, &paste)
        .map_err(|error| (409, error))?;
    manager
        .write(&agent_session.id, "\r")
        .map_err(|error| (409, error))?;
    let after = manager.diagnostics(&agent_session.id);
    eprintln!(
        "[hyperwiki] agent prompt routed request_id={} project_id={} requested_session={} selected_session={} scope={} prompt_chars={} paste_bytes={} before_seq={:?} after_seq={:?} live={}",
        request_id,
        project.id,
        requested_session_id,
        agent_session.id,
        scope,
        prompt.chars().count(),
        paste.len() + 1,
        before.replay_seq,
        after.replay_seq,
        after.live
    );
    Ok(serde_json::json!({
        "ok": true,
        "requestId": request_id,
        "requestedSessionId": requested_session_id,
        "scope": scope,
        "promptChars": prompt.chars().count(),
        "pasteBytes": paste.len() + 1,
        "beforeReplaySeq": before.replay_seq,
        "afterReplaySeq": after.replay_seq,
        "live": after.live,
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
    fn app_shell_and_drop_endpoints_are_implemented() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let root = temp_root("command-app-shell");
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({ "projectName": "Command App Shell" }).to_string(),
        )
        .unwrap();
        std::env::set_current_dir(&root).unwrap();

        let summary = hyperwiki_request(HyperwikiRequest {
            path: "/api/app-shell".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let dropped = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/drop".to_string(),
            method: "POST".to_string(),
            body: Some(
                serde_json::json!({
                    "files": [{ "name": "../drop.txt", "content": "aGVsbG8=" }]
                })
                .to_string(),
            ),
        });
        let rejected_open = hyperwiki_request(HyperwikiRequest {
            path: "/api/app/open-external".to_string(),
            method: "POST".to_string(),
            body: Some(serde_json::json!({ "target": "/tmp/not-url" }).to_string()),
        });

        std::env::set_current_dir(previous_dir).unwrap();
        assert!(summary.ok);
        assert!(summary.text.contains("\"windowTitle\":\"hyperwiki\""));
        assert!(dropped.ok);
        assert!(dropped.text.contains(".hyperwiki"));
        assert!(!rejected_open.ok);
        assert_eq!(rejected_open.status, 400);
    }

    #[test]
    fn project_create_and_remove_endpoints_manage_registry() {
        let _guard = env_lock();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let previous_projects_dir = std::env::var_os("HYPERWIKI_PROJECTS_DIR");
        let home = temp_root("command-project-create-home");
        let projects_dir = temp_root("command-projects-dir");
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_var("HYPERWIKI_PROJECTS_DIR", &projects_dir);

        let created = hyperwiki_request(HyperwikiRequest {
            path: "/api/projects/create".to_string(),
            method: "POST".to_string(),
            body: Some(
                serde_json::json!({
                    "title": "Command Project",
                    "summary": "Created through Rust command transport.",
                    "initializeGit": false
                })
                .to_string(),
            ),
        });
        let created_value = serde_json::from_str::<serde_json::Value>(&created.text).unwrap();
        let project_id = created_value["project"]["id"].as_str().unwrap().to_string();
        let project_root = created_value["project"]["root"]
            .as_str()
            .unwrap()
            .to_string();
        let removed = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/projects/{project_id}"),
            method: "DELETE".to_string(),
            body: Some(
                serde_json::json!({
                    "deleteFiles": true,
                    "root": project_root
                })
                .to_string(),
            ),
        });

        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        match previous_projects_dir {
            Some(value) => std::env::set_var("HYPERWIKI_PROJECTS_DIR", value),
            None => std::env::remove_var("HYPERWIKI_PROJECTS_DIR"),
        }
        assert!(created.ok);
        assert!(created
            .text
            .contains("\"workspaceUrl\":\"/workspace/command-project/main\""));
        assert!(removed.ok);
        assert!(removed.text.contains("\"deletedFiles\":true"));
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
        fs::create_dir_all(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-command-verification"),
        )
        .unwrap();
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
            root.join("wiki").join("plans").join("index.mdx"),
            r#"<PlanHero status="active planning"><h1>Plans</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("plans").join("mvp").join("index.mdx"),
            r#"<PlanHero status="active"><h1>MVP</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-command-verification.mdx"),
            r#"<PlanHero status="active"><h1>Stage 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki")
                .join("plans")
                .join("mvp")
                .join("stage-01-command-verification")
                .join("unit-01-command-verification.mdx"),
            r#"<PlanHero status="planned"><h1>Unit 01</h1></PlanHero>"#,
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("log.mdx"),
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
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Command Wiki</h1>").unwrap();
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
        assert!(response.text.contains("/wiki/index.mdx"));
    }

    #[test]
    fn wiki_fingerprint_endpoint_returns_current_checkout_fingerprint() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-fingerprint");
        let home = temp_root("command-wiki-fingerprint-home");
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Command Wiki</h1>").unwrap();
        fs::write(
            root.join("wiki").join("plans").join("feature.mdx"),
            "<h1>Feature</h1>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/fingerprint".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok, "{}", response.text);
        assert_eq!(response.status, 200);
        assert!(response.text.contains("\"fingerprint\""));
        assert!(response.text.contains("\"fileCount\":2"));
    }

    #[test]
    fn wiki_source_endpoint_returns_exact_source_and_markdown() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-source");
        let home = temp_root("command-wiki-source-home");
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("sample.mdx"),
            "---\ntitle: \"Sample\"\n---\n\n<PlanHero><h1>Sample</h1></PlanHero>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/source?path=%2Fwiki%2Fplans%2Fsample.mdx".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok, "{}", response.text);
        assert!(response.text.contains("<PlanHero>"));
        assert!(response.text.contains("\"markdown\":\"# Sample\""));
    }

    #[test]
    fn wiki_page_markdown_endpoint_returns_markdown_export() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-markdown");
        let home = temp_root("command-wiki-markdown-home");
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join("wiki").join("plans").join("sample.mdx"),
            "<h1>Sample</h1><p>Markdown export.</p>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/page-markdown?path=%2Fwiki%2Fplans%2Fsample.mdx".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok, "{}", response.text);
        assert!(response.text.contains("\"markdown\":\"# Sample"));
        assert!(response.text.contains("Markdown export."));
    }

    #[test]
    fn wiki_llms_txt_endpoint_returns_project_export() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-llms");
        let home = temp_root("command-wiki-llms-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/llms.txt".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok, "{}", response.text);
        assert!(response.text.contains("# hyperwiki Project Wiki"));
        assert!(response.text.contains("- [Home](/wiki/index.mdx)"));
    }

    #[test]
    fn wiki_markdown_zip_endpoint_returns_download_payload() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-zip");
        let home = temp_root("command-wiki-zip-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/export-markdown-zip".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok, "{}", response.text);
        assert!(response.text.contains("\"filename\":\"hyperwiki-markdown-export.zip\""));
        assert!(response.text.contains("\"mimeType\":\"application/zip\""));
        assert!(response.text.contains("\"path\":\"SKILL.md\""));
    }

    #[test]
    fn wiki_markdown_zip_download_endpoint_writes_to_downloads() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let previous_user_home = std::env::var_os("HOME");
        let previous_user_profile = std::env::var_os("USERPROFILE");
        let root = temp_root("command-wiki-zip-download");
        let home = temp_root("command-wiki-zip-download-home");
        let user_home = temp_root("command-wiki-user-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_var("HOME", &user_home);
        std::env::set_var("USERPROFILE", &user_home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/export-markdown-zip/download?reveal=false".to_string(),
            method: "POST".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        match previous_user_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match previous_user_profile {
            Some(value) => std::env::set_var("USERPROFILE", value),
            None => std::env::remove_var("USERPROFILE"),
        }

        assert!(response.ok, "{}", response.text);
        let value: serde_json::Value = serde_json::from_str(&response.text).unwrap();
        let path = std::path::PathBuf::from(value["path"].as_str().unwrap());
        assert!(path.starts_with(user_home.join("Downloads")));
        assert!(path.exists());
        assert_eq!(value["revealed"], false);
        assert!(value["filename"]
            .as_str()
            .unwrap()
            .starts_with("hyperwiki-markdown-export-"));
        assert!(fs::read(path).unwrap().starts_with(b"PK\x03\x04"));
    }

    #[test]
    fn wiki_skill_endpoint_returns_generated_skill_markdown() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-skill");
        let home = temp_root("command-wiki-skill-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/wiki/skill.md".to_string(),
            method: "GET".to_string(),
            body: None,
        });

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(response.ok, "{}", response.text);
        assert!(response.text.contains("name: hyperwiki-project-context"));
        assert!(response.text.contains("/api/wiki/export-markdown-zip"));
    }

    #[test]
    fn import_planning_endpoints_gate_and_create_detailed_imported_plan_units() {
        let _guard = env_lock();
        let root = temp_root("command-import-planning");
        let home = temp_root("command-import-planning-home");
        make_hyperwiki_project(&root, "RouteChat");
        fs::create_dir_all(root.join("wiki").join("sources")).unwrap();
        fs::write(
            root.join("wiki").join("sources").join("prd.mdx"),
            "<h1>Product Brief</h1><section class=\"summary\"><h2>Summary</h2><ul><li>RouteChat gives spontaneous guided audio tours.</li></ul></section><section><h2>Problem</h2><p>Most tours require planning.</p></section><section><h2>MVP</h2><ul><li>Generates narration from current location.</li></ul></section><section><h2>Promotion Criteria</h2><ul><li>A safety model for driving and transit use.</li></ul></section>",
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("sources").join("import.mdx"),
            "<h1>Source Import</h1><p>RouteChat gives spontaneous guided audio tours.</p>",
        )
        .unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();
        let project = crate::domain::projects::ProjectRegistry::from_environment()
            .register(&root)
            .unwrap();

        let clarify = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/import-planning/clarify?project={}", project.id),
            method: "POST".to_string(),
            body: Some("{\"planTitle\":\"RouteChat Imported Plan\",\"answers\":[]}".to_string()),
        });
        assert!(clarify.ok);
        assert!(clarify.text.contains("\"ready\":false"));
        assert!(clarify.text.contains("\"questions\":[]"));
        assert!(clarify
            .text
            .contains("questions are produced by the visible agent"));

        let status = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/import-planning/status?project={}", project.id),
            method: "GET".to_string(),
            body: None,
        });
        assert!(status.ok);
        assert!(status.text.contains("\"status\":\"incomplete\""));

        let answer = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/import-planning/answer?project={}", project.id),
            method: "POST".to_string(),
            body: Some("{\"question\":{\"id\":\"agent-question\",\"label\":\"Agent Question\",\"prompt\":\"Which RouteChat slice should prove the product first?\",\"impact\":\"blocking\",\"rationale\":\"Asked after reading raw source.\"},\"answer\":\"Walking tours first.\"}".to_string()),
        });
        assert!(answer.ok, "{}", answer.text);
        assert!(answer.text.contains("\"answeredCount\":1"));
        assert!(root
            .join("wiki")
            .join("sources")
            .join("import-qna.mdx")
            .exists());

        let blocked = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/import-planning/create-plan?project={}", project.id),
            method: "POST".to_string(),
            body: Some("{\"planTitle\":\"RouteChat Imported Plan\",\"answers\":[]}".to_string()),
        });
        assert_eq!(blocked.status, 409);

        let missing_stack = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/import-planning/create-plan?project={}", project.id),
            method: "POST".to_string(),
            body: Some("{\"planTitle\":\"RouteChat Imported Plan\",\"answers\":[{\"id\":\"first-mode\",\"answer\":\"Walking tours first.\"},{\"id\":\"platform\",\"answer\":\"Mobile web prototype.\"},{\"id\":\"location-source\",\"answer\":\"Simulated routes first, live GPS later.\"},{\"id\":\"narration-output\",\"answer\":\"Text plus audio playback.\"},{\"id\":\"provider\",\"answer\":\"Gemini default behind a provider wrapper.\"},{\"id\":\"safety-privacy\",\"answer\":\"No driving interactions in the first demo; no precise route retention without consent.\"},{\"id\":\"non-goals\",\"answer\":\"No saved tours, accounts, or multi-mode support.\"},{\"id\":\"success-criteria\",\"answer\":\"A demo route produces useful narration and passes safety review.\"}]}".to_string()),
        });
        assert_eq!(missing_stack.status, 409);
        assert!(missing_stack
            .text
            .contains("plans are created by the visible agent"));

        let create = hyperwiki_request(HyperwikiRequest {
            path: format!("/api/import-planning/create-plan?project={}", project.id),
            method: "POST".to_string(),
            body: Some("{\"planTitle\":\"RouteChat Imported Plan\",\"answers\":[{\"id\":\"first-mode\",\"answer\":\"Walking tours first.\"},{\"id\":\"platform\",\"answer\":\"Mobile web prototype.\"},{\"id\":\"frontend-stack\",\"answer\":\"React, Vite, TypeScript, and Tailwind for the mobile web UI.\"},{\"id\":\"backend-runtime\",\"answer\":\"Client-first prototype with a small Node route handler only if provider proxying is required.\"},{\"id\":\"data-storage\",\"answer\":\"Browser local storage for demo route state; no database in the first milestone.\"},{\"id\":\"auth-users\",\"answer\":\"No accounts in the first demo.\"},{\"id\":\"services-integrations\",\"answer\":\"Mock route feed plus Gemini API integration; defer maps SDK billing setup.\"},{\"id\":\"location-source\",\"answer\":\"Simulated routes first, live GPS later.\"},{\"id\":\"narration-output\",\"answer\":\"Text plus audio playback.\"},{\"id\":\"provider\",\"answer\":\"Gemini default behind a provider wrapper.\"},{\"id\":\"dev-commands\",\"answer\":\"pnpm install, pnpm dev, pnpm run build, pnpm run check, and GEMINI_API_KEY for provider calls.\"},{\"id\":\"safety-privacy\",\"answer\":\"No driving interactions in the first demo; no precise route retention without consent.\"},{\"id\":\"non-goals\",\"answer\":\"No saved tours, accounts, or multi-mode support.\"},{\"id\":\"success-criteria\",\"answer\":\"A demo route produces useful narration and passes safety review.\"}]}".to_string()),
        });
        assert_eq!(create.status, 409);
        assert!(create
            .text
            .contains("plans are created by the visible agent"));
    }

    #[test]
    fn wiki_page_paths_return_html_for_tauri_iframes() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-wiki-page");
        let home = temp_root("command-wiki-page-home");
        let unrelated = temp_root("command-wiki-page-unrelated-cwd");
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({ "projectName": "Command Wiki Page" }).to_string(),
        )
        .unwrap();
        fs::write(
            root.join("wiki").join("index.mdx"),
            "<h1>Command Wiki Page</h1>",
        )
        .unwrap();
        let registry = crate::domain::projects::ProjectRegistry::new(&home);
        let project = registry.register(&root).unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&unrelated).unwrap();

        let response = hyperwiki_request(HyperwikiRequest {
            path: format!("/projects/{}/wiki/index.mdx", project.id),
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
        assert!(response.text.contains("Command Wiki Page"));
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
    fn sessions_endpoint_closes_stale_persisted_active_sessions() {
        let _guard = env_lock();
        let previous_dir = std::env::current_dir().unwrap();
        let previous_home = std::env::var_os("HYPERWIKI_HOME");
        let root = temp_root("command-sessions");
        let home = temp_root("command-sessions-home");
        fs::create_dir_all(root.join("wiki")).unwrap();
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Sessions</h1>").unwrap();
        std::env::set_var("HYPERWIKI_HOME", &home);
        std::env::set_current_dir(&root).unwrap();
        let registry = crate::domain::sessions::SessionRegistry::new(&root);
        registry
            .upsert(
                "agent-one",
                crate::domain::sessions::SessionUpdates {
                    name: Some("agent".to_string()),
                    scope: Some("plan:/wiki/plans/index.mdx".to_string()),
                    ..crate::domain::sessions::SessionUpdates::default()
                },
            )
            .unwrap();

        let list = hyperwiki_request(HyperwikiRequest {
            path: "/api/sessions?scope=plan:/wiki/plans/index.mdx".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let persisted_after_list = registry.list(None, false);

        std::env::set_current_dir(previous_dir).unwrap();
        match previous_home {
            Some(value) => std::env::set_var("HYPERWIKI_HOME", value),
            None => std::env::remove_var("HYPERWIKI_HOME"),
        }
        assert!(list.ok);
        assert!(!list.text.contains("agent-one"));
        assert_eq!(
            persisted_after_list.sessions[0].status, "closed",
            "stale active sessions must be persisted closed"
        );
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
            body: Some(
                "{\"id\":\"terminal-command\",\"name\":\"cli\",\"command\":\"printf tauri-terminal-launch\\\\n\"}"
                    .to_string(),
            ),
        });
        let write = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/terminal-command/write".to_string(),
            method: "POST".to_string(),
            body: Some("{\"input\":\"printf tauri-terminal-command\\\\n\\n\"}".to_string()),
        });
        let launch_output = wait_for_terminal_output("terminal-command", "tauri-terminal-launch");
        let output = wait_for_terminal_output("terminal-command", "tauri-terminal-command");
        let replay = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/terminal-command/replay".to_string(),
            method: "GET".to_string(),
            body: None,
        });
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
        assert!(launch_output.contains("tauri-terminal-launch"));
        assert!(output.contains("tauri-terminal-command"));
        assert!(replay.ok);
        assert!(replay.text.contains("\"sessionId\":\"terminal-command\""));
        assert!(replay.text.contains("\"bytes\""));
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
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Agent Prompt</h1>").unwrap();
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
            body: Some("{\"id\":\"agent-command\",\"name\":\"agent\",\"role\":\"agent\",\"command\":\"codex --yolo\",\"scope\":\"plan:/wiki/plans/index.mdx\"}".to_string()),
        });
        let routed = hyperwiki_request(HyperwikiRequest {
            path: "/api/agent/prompt".to_string(),
            method: "POST".to_string(),
            body: Some("{\"prompt\":\"Do the thing\",\"currentPage\":\"/wiki/plans/index.mdx\",\"scope\":\"plan:/wiki/plans/index.mdx\"}".to_string()),
        });
        let explicitly_routed = hyperwiki_request(HyperwikiRequest {
            path: "/api/agent/prompt".to_string(),
            method: "POST".to_string(),
            body: Some("{\"prompt\":\"Do the exact thing\",\"currentPage\":\"/wiki/plans/index.mdx\",\"scope\":\"plan:/wiki/plans/index.mdx\",\"sessionId\":\"agent-command\",\"requestId\":\"test-answer-1\"}".to_string()),
        });
        let missing_requested = hyperwiki_request(HyperwikiRequest {
            path: "/api/agent/prompt".to_string(),
            method: "POST".to_string(),
            body: Some("{\"prompt\":\"Do the missing thing\",\"scope\":\"plan:/wiki/plans/index.mdx\",\"sessionId\":\"missing-agent\",\"requestId\":\"test-answer-missing\"}".to_string()),
        });
        let close = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/agent-command".to_string(),
            method: "DELETE".to_string(),
            body: None,
        });
        let stale_requested = hyperwiki_request(HyperwikiRequest {
            path: "/api/agent/prompt".to_string(),
            method: "POST".to_string(),
            body: Some("{\"prompt\":\"Do the stale thing\",\"scope\":\"plan:/wiki/plans/index.mdx\",\"sessionId\":\"agent-command\",\"requestId\":\"test-answer-stale\"}".to_string()),
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
        assert!(explicitly_routed.ok);
        assert!(explicitly_routed
            .text
            .contains("\"requestedSessionId\":\"agent-command\""));
        assert!(explicitly_routed
            .text
            .contains("\"requestId\":\"test-answer-1\""));
        assert!(explicitly_routed.text.contains("\"live\":true"));
        assert!(!missing_requested.ok);
        assert_eq!(missing_requested.status, 409);
        assert!(close.ok);
        assert!(!stale_requested.ok);
        assert_eq!(stale_requested.status, 409);
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
            body: Some("{\"workflowId\":\"security-review\",\"currentPage\":\"/wiki/plans/index.mdx\",\"dryRun\":true}".to_string()),
        });
        let unrouted = hyperwiki_request(HyperwikiRequest {
            path: "/api/review-workflows/run".to_string(),
            method: "POST".to_string(),
            body: Some("{\"workflowId\":\"security-review\",\"currentPage\":\"/wiki/plans/index.mdx\",\"scope\":\"plan:/wiki/plans/index.mdx\"}".to_string()),
        });
        let start = hyperwiki_request(HyperwikiRequest {
            path: "/api/terminal/start".to_string(),
            method: "POST".to_string(),
            body: Some("{\"id\":\"review-agent\",\"name\":\"agent\",\"role\":\"agent\",\"command\":\"codex --yolo\",\"scope\":\"plan:/wiki/plans/index.mdx\"}".to_string()),
        });
        let routed = hyperwiki_request(HyperwikiRequest {
            path: "/api/review-workflows/run".to_string(),
            method: "POST".to_string(),
            body: Some("{\"workflowId\":\"security-review\",\"currentPage\":\"/wiki/plans/index.mdx\",\"scope\":\"plan:/wiki/plans/index.mdx\"}".to_string()),
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
        assert!(!unrouted.ok);
        assert_eq!(unrouted.status, 409);
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
        fs::write(root.join("wiki").join("index.mdx"), "<h1>Home</h1>").unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.mdx"),
            "<h1>Plans</h1><section class=\"summary\"><ul><li>Status: active</li></ul></section>",
        )
        .unwrap();
    }
}
