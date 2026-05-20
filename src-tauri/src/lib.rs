pub mod command;
pub mod domain;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![command::hyperwiki_request])
        .run(tauri::generate_context!())
        .expect("error while running hyperwiki Tauri app");
}
