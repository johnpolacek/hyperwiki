use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperwikiRequest {
    path: String,
    method: String,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperwikiResponse {
    ok: bool,
    status: u16,
    text: String,
}

#[tauri::command]
fn hyperwiki_request(request: HyperwikiRequest) -> HyperwikiResponse {
    let text = serde_json::json!({
        "error": "Tauri command transport is not implemented for this endpoint yet.",
        "path": request.path,
        "method": request.method,
        "bodyPresent": request.body.is_some()
    })
    .to_string();
    HyperwikiResponse {
        ok: false,
        status: 501,
        text,
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![hyperwiki_request])
        .run(tauri::generate_context!())
        .expect("error while running hyperwiki Tauri app");
}
