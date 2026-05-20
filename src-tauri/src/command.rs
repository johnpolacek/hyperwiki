use serde::{Deserialize, Serialize};

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn response_shape_is_json_serializable() {
        let response = hyperwiki_request(HyperwikiRequest {
            path: "/api/workspace".to_string(),
            method: "GET".to_string(),
            body: None,
        });
        let value = serde_json::to_value(response).expect("response should serialize");
        assert_eq!(value["ok"], false);
        assert_eq!(value["status"], 501);
        assert!(value["text"].as_str().unwrap().contains("/api/workspace"));
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
}
