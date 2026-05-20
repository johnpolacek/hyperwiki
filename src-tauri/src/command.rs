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
}
