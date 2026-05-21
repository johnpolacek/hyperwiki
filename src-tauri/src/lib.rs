pub mod command;
pub mod domain;

pub fn run_cli_or_app() {
    let raw_args = std::env::args().skip(1).collect::<Vec<_>>();
    let mut args = raw_args.iter().map(String::as_str);
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
        Some("init") => run_init_cli(&raw_args[1..]),
        Some("reset") => run_reset_cli(&raw_args[1..]),
        Some(command) => {
            eprintln!("Unknown command: {command}");
            print_help();
            std::process::exit(1);
        }
    }
}

fn run_init_cli(args: &[String]) {
    let options = CliOptions::parse(args);
    let root = std::env::current_dir().unwrap_or_else(|_| ".".into());
    let package = PackageMetadata::read(&root);
    let project_name = options
        .string("project_name")
        .or_else(|| package.name.clone())
        .or_else(|| {
            root.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "project".to_string());
    let summary = options
        .string("summary")
        .or_else(|| package.description.clone())
        .unwrap_or_else(|| {
            "Project summary is not known yet. Update this page after the repository purpose is clarified."
                .to_string()
        });
    let dev_command = package
        .scripts
        .iter()
        .find(|script| script.as_str() == "dev")
        .map(|_| format!("{} run dev", package.manager));
    let result = domain::projects::init_hyperwiki_project(
        &root,
        domain::projects::InitProjectOptions {
            project_name: project_name.clone(),
            summary,
            source_document: options.string("source_document").unwrap_or_default(),
            source_document_type: options.string("source_document_type").unwrap_or_default(),
            agent_launch_command: options.string("agent_launch_command").unwrap_or_default(),
            dev_command: dev_command.unwrap_or_default(),
            package_scripts: package
                .scripts
                .iter()
                .map(|script| format!("{} run {script}", package.manager))
                .collect(),
            overwrite: options.flag("overwrite"),
        },
    );
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
    let no_git = options.flag("no_git");
    let should_init_git = !no_git && (options.flag("yes") || options.flag("git"));
    let git_result = if no_git {
        Some("skipped".to_string())
    } else if should_init_git {
        match domain::git::initialize_git_onboarding(&root) {
            Ok(response) => Some(response.result.status),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
    } else {
        Some("skipped".to_string())
    };
    println!("Initialized hyperwiki for {project_name}");
    match git_result.as_deref() {
        Some("committed") => println!("Initialized Git and created the initial Hyperwiki commit."),
        Some("already-initialized") => println!("Git is already initialized."),
        Some("initialized") => println!("Initialized Git."),
        Some("skipped") => println!("Skipped Git initialization."),
        _ => {}
    }
    println!("Run: hyperwiki");
}

fn run_reset_cli(args: &[String]) {
    let options = CliOptions::parse(args);
    let root = std::env::current_dir().unwrap_or_else(|_| ".".into());
    let dry_run = options.flag("dry_run");
    let registry = domain::projects::ProjectRegistry::from_environment();
    let actions = match domain::projects::reset_hyperwiki_state(&root, &registry, dry_run) {
        Ok(actions) => actions,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    for action in actions {
        println!(
            "{} {}",
            if dry_run { "Would reset" } else { "Reset" },
            action.path.display()
        );
    }
    println!(
        "{}",
        if dry_run {
            "hyperwiki reset dry run complete."
        } else {
            "hyperwiki local state reset complete."
        }
    );
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![command::hyperwiki_request])
        .run(tauri::generate_context!())
        .expect("error while running hyperwiki Tauri app");
}

fn print_help() {
    println!(
        "hyperwiki\n\nUsage:\n  hyperwiki\n  hyperwiki init [--yes] [--git|--no-git] [--project-name NAME] [--summary TEXT] [--overwrite]\n  hyperwiki reset [--dry-run]\n  hyperwiki launch\n  hyperwiki dev\n  hyperwiki mcp\n  hyperwiki help\n\nCommands:\n  init     Scaffold an HTML-first repo-local wiki and hyperwiki config.\n  reset    Clear user registry and ignored local runtime state without touching wiki or config files.\n  launch   Open the Tauri desktop app.\n  dev      Open the Tauri desktop app for local development.\n  mcp      Start the local stdio MCP server for read-only project context.\n"
    );
}

#[derive(Debug, Clone)]
struct CliOptions {
    values: std::collections::BTreeMap<String, String>,
    flags: std::collections::BTreeSet<String>,
}

impl CliOptions {
    fn parse(args: &[String]) -> Self {
        let mut values = std::collections::BTreeMap::new();
        let mut flags = std::collections::BTreeSet::new();
        let mut index = 0;
        while index < args.len() {
            let arg = &args[index];
            if !arg.starts_with("--") {
                index += 1;
                continue;
            }
            let without_prefix = &arg[2..];
            let (key, inline) = without_prefix
                .split_once('=')
                .map(|(key, value)| (key.to_string(), Some(value.to_string())))
                .unwrap_or_else(|| (without_prefix.to_string(), None));
            let key = key.replace('-', "_");
            if let Some(value) = inline {
                values.insert(key, value);
            } else if args
                .get(index + 1)
                .map(|next| !next.starts_with("--"))
                .unwrap_or(false)
            {
                values.insert(key, args[index + 1].clone());
                index += 1;
            } else {
                flags.insert(key);
            }
            index += 1;
        }
        Self { values, flags }
    }

    fn flag(&self, key: &str) -> bool {
        self.flags.contains(key)
            || self
                .values
                .get(key)
                .map(|value| value == "true")
                .unwrap_or(false)
    }

    fn string(&self, key: &str) -> Option<String> {
        self.values.get(key).cloned()
    }
}

#[derive(Debug, Clone)]
struct PackageMetadata {
    name: Option<String>,
    description: Option<String>,
    scripts: Vec<String>,
    manager: String,
}

impl PackageMetadata {
    fn read(root: &std::path::Path) -> Self {
        let package = std::fs::read_to_string(root.join("package.json"))
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
        let manager = package
            .as_ref()
            .and_then(|value| value.get("packageManager"))
            .and_then(|value| value.as_str())
            .map(|value| value.split('@').next().unwrap_or("pnpm").to_string())
            .unwrap_or_else(|| "pnpm".to_string());
        let mut scripts = package
            .as_ref()
            .and_then(|value| value.get("scripts"))
            .and_then(|value| value.as_object())
            .map(|scripts| scripts.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        scripts.sort();
        Self {
            name: package
                .as_ref()
                .and_then(|value| value.get("name"))
                .and_then(|value| value.as_str())
                .map(String::from),
            description: package
                .as_ref()
                .and_then(|value| value.get("description"))
                .and_then(|value| value.as_str())
                .map(String::from),
            scripts,
            manager,
        }
    }
}
