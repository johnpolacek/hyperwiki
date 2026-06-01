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
        Some("wt") => run_worktree_cli(&raw_args[1..]),
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
            summary: summary.clone(),
            source_document: options.string("source_document").unwrap_or_default(),
            source_document_type: options.string("source_document_type").unwrap_or_default(),
            source_documents: Vec::new(),
            source_facts: domain::projects::SourceFacts {
                summary,
                ..Default::default()
            },
            planning_answers: std::collections::BTreeMap::new(),
            agent_launch_command: options.string("agent_launch_command").unwrap_or_default(),
            dev_command: dev_command.unwrap_or_default(),
            package_scripts: package
                .scripts
                .iter()
                .map(|script| format!("{} run {script}", package.manager))
                .collect(),
            install_agent_skills: !options.flag("no_skills"),
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
        Some("committed") => println!("Initialized Git and created the initial hyperwiki commit."),
        Some("already-initialized") => println!("Git is already initialized."),
        Some("initialized") => println!("Initialized Git."),
        Some("skipped") => println!("Skipped Git initialization."),
        _ => {}
    }
    println!("Run: hyperwiki");
}

fn run_worktree_cli(args: &[String]) {
    let command = args.first().map(String::as_str).unwrap_or("help");
    let rest = &args.get(1..).unwrap_or(&[]);
    let root = std::env::current_dir().unwrap_or_else(|_| ".".into());
    let registry = domain::projects::ProjectRegistry::from_environment();
    let result = match command {
        "doctor" => wt_doctor(&root, &registry),
        "list" => wt_list(&registry),
        "create" => wt_create(&root, &registry, rest),
        "resume" | "open" => wt_open(&root, &registry, rest),
        "finish" => wt_finish(&root),
        "prune" => wt_prune(&root),
        "help" | "--help" | "-h" => {
            print_worktree_help();
            Ok(())
        }
        other => Err(format!("Unknown worktree command: {other}")),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn wt_doctor(
    root: &std::path::Path,
    registry: &domain::projects::ProjectRegistry,
) -> Result<(), String> {
    let repo = domain::git::repo_context(root);
    println!("Repo: {}", root.display());
    println!(
        "Git root: {}",
        repo.git.root.as_deref().unwrap_or("not initialized")
    );
    println!("Branch: {}", repo.git.branch);
    println!("Worktree: {}", repo.git.worktree);
    println!("Dirty: {}", repo.git.dirty.unwrap_or(false));
    println!(
        "Registered checkouts: {}",
        registry.list(None).checkouts.len()
    );
    Ok(())
}

fn wt_list(registry: &domain::projects::ProjectRegistry) -> Result<(), String> {
    let list = registry.list(None);
    if list.checkouts.is_empty() {
        println!("No registered hyperwiki checkouts.");
        return Ok(());
    }
    for project in list.checkouts {
        println!(
            "{}\t{}\t{}",
            project.project_slug,
            project.worktree_slug,
            project.root.display()
        );
    }
    Ok(())
}

fn wt_create(
    root: &std::path::Path,
    registry: &domain::projects::ProjectRegistry,
    args: &[String],
) -> Result<(), String> {
    let branch = args.first().cloned();
    let project = registry.register(root)?;
    let response = domain::git::create_worktree_checkout(
        registry,
        &project,
        domain::git::WorktreeCreateRequest { branch, name: None },
    )
    .map_err(|(_, message)| message)?;
    println!("Created worktree: {}", response.path.display());
    println!("Branch: {}", response.branch);
    println!("Workspace: {}", response.workspace_url);
    if !response.preview_url.is_empty() {
        println!("Preview: {}", response.preview_url);
    }
    if !response.install.ok {
        println!("Install warning: {}", response.install.message);
    }
    Ok(())
}

fn wt_open(
    root: &std::path::Path,
    registry: &domain::projects::ProjectRegistry,
    args: &[String],
) -> Result<(), String> {
    let target = resolve_worktree_target(root, registry, args.first());
    let result = std::process::Command::new("open").arg(&target).output();
    match result {
        Ok(output) if output.status.success() => {
            println!("Opened {}", target.display());
            Ok(())
        }
        Ok(output) => Err(String::from_utf8_lossy(&output.stderr).trim().to_string()),
        Err(error) => Err(error.to_string()),
    }
}

fn resolve_worktree_target(
    root: &std::path::Path,
    registry: &domain::projects::ProjectRegistry,
    value: Option<&String>,
) -> std::path::PathBuf {
    let Some(value) = value else {
        return root.to_path_buf();
    };
    let direct = std::path::PathBuf::from(value);
    if direct.exists() {
        return direct;
    }
    let slug = cli_slug(value);
    registry
        .list(None)
        .checkouts
        .into_iter()
        .find(|project| {
            project.worktree_slug == slug
                || project.project_slug == slug
                || cli_slug(&project.name) == slug
        })
        .map(|project| project.root)
        .unwrap_or(direct)
}

fn wt_finish(root: &std::path::Path) -> Result<(), String> {
    let branch = domain::git::git(root, &["branch", "--show-current"]);
    if !branch.ok || branch.stdout.is_empty() {
        return Err("Could not determine current branch.".to_string());
    }
    let main_root = primary_worktree(root)?;
    let base = default_local_base_branch(&main_root);
    let checkout = domain::git::git(&main_root, &["checkout", &base]);
    if !checkout.ok {
        return Err(format!("Could not checkout {base}: {}", checkout.stderr));
    }
    let merge = domain::git::git(&main_root, &["merge", "--no-ff", &branch.stdout]);
    if !merge.ok {
        return Err(format!(
            "Could not merge {}: {}",
            branch.stdout, merge.stderr
        ));
    }
    println!(
        "Merged {} into {} at {}",
        branch.stdout,
        base,
        main_root.display()
    );
    Ok(())
}

fn wt_prune(root: &std::path::Path) -> Result<(), String> {
    let result = domain::git::git(root, &["worktree", "prune"]);
    if !result.ok {
        return Err(format!("Could not prune worktrees: {}", result.stderr));
    }
    println!("Pruned stale Git worktree metadata.");
    Ok(())
}

fn primary_worktree(root: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let result = domain::git::git(root, &["worktree", "list", "--porcelain"]);
    if !result.ok {
        return Err(format!("Could not list worktrees: {}", result.stderr));
    }
    result
        .stdout
        .lines()
        .find_map(|line| line.strip_prefix("worktree "))
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "Could not find primary worktree.".to_string())
}

fn default_local_base_branch(root: &std::path::Path) -> String {
    for branch in ["main", "master"] {
        if domain::git::git(
            root,
            &[
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{branch}"),
            ],
        )
        .ok
        {
            return branch.to_string();
        }
    }
    "main".to_string()
}

fn print_worktree_help() {
    println!(
        "hyperwiki wt\n\nUsage:\n  hyperwiki wt doctor\n  hyperwiki wt create <branch>\n  hyperwiki wt list\n  hyperwiki wt resume [path]\n  hyperwiki wt open [path]\n  hyperwiki wt finish\n  hyperwiki wt prune\n"
    );
}

fn cli_slug(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
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
        .setup(|app| {
            command::set_app_handle(app.handle().clone());
            domain::codex_app_server::spawn_codex_provider_prewarm();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![command::hyperwiki_request])
        .run(tauri::generate_context!())
        .expect("error while running hyperwiki Tauri app");
}

fn print_help() {
    println!(
        "hyperwiki\n\nUsage:\n  hyperwiki\n  hyperwiki init [--yes] [--git|--no-git] [--project-name NAME] [--summary TEXT] [--overwrite] [--no-skills]\n  hyperwiki reset [--dry-run]\n  hyperwiki launch\n  hyperwiki dev\n  hyperwiki mcp\n  hyperwiki wt <doctor|create|list|resume|open|finish|prune>\n  hyperwiki help\n\nCommands:\n  init     Scaffold an MDX-first repo-local wiki, hyperwiki config, and default repo-local agent skills.\n  reset    Clear user registry and ignored local runtime state without touching wiki or config files.\n  launch   Open the Tauri desktop app.\n  dev      Open the Tauri desktop app for local development.\n  mcp      Start the local stdio MCP server for read-only project context.\n  wt       Manage hyperwiki worktree development through the Rust CLI.\n"
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
