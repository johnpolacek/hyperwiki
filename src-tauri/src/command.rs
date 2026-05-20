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
    if request.method == "GET" && request.path.starts_with("/api/projects") {
        let active_id = query_param(&request.path, "project");
        return json_response(
            200,
            &crate::domain::projects::ProjectRegistry::from_environment()
                .list(active_id.as_deref()),
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
}
