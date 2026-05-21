pub mod command;
pub mod domain;

pub fn run_cli_or_app() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("mcp") => {
            if let Err(error) = domain::mcp::run_stdio_server(
                std::env::current_dir().unwrap_or_else(|_| ".".into()),
            ) {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        Some("help") | Some("--help") | Some("-h") => print_help(),
        Some("launch") | Some("dev") | None => run(),
        Some("init") | Some("reset") => {
            eprintln!(
                "This Tauri binary does not yet scaffold or reset projects. Use the Node compatibility CLI for this command during migration."
            );
            std::process::exit(2);
        }
        Some(command) => {
            eprintln!("Unknown command: {command}");
            print_help();
            std::process::exit(1);
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![command::hyperwiki_request])
        .run(tauri::generate_context!())
        .expect("error while running hyperwiki Tauri app");
}

fn print_help() {
    println!(
        "hyperwiki\n\nUsage:\n  hyperwiki\n  hyperwiki launch\n  hyperwiki dev\n  hyperwiki mcp\n  hyperwiki help\n\nCommands:\n  launch   Open the Tauri desktop app.\n  dev      Open the Tauri desktop app for local development.\n  mcp      Start the local stdio MCP server for read-only project context.\n"
    );
}
