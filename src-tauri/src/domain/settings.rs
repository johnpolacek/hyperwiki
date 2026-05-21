use super::DomainSurface;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

const MANAGED_START: &str = "<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->";
const MANAGED_END: &str = "<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->";

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "settings",
        runtime_owner: "rust-tauri",
        responsibilities: &[
            "global settings persistence",
            "theme token generation",
            "Soul and Memory controls",
            "managed AGENTS.md sync",
        ],
        parity_gate: "settings manual pass plus managed block replacement tests",
    }
}

#[derive(Debug, Clone)]
pub struct SettingsStore {
    file_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentsSyncResult {
    pub path: PathBuf,
    pub memory_entries: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AgentsFile {
    pub path: PathBuf,
    pub content: String,
}

impl SettingsStore {
    pub fn from_environment() -> Self {
        let home = std::env::var_os("HYPERWIKI_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".hyperwiki")))
            .unwrap_or_else(|| PathBuf::from(".hyperwiki"));
        Self::new(home)
    }

    pub fn new(home: impl Into<PathBuf>) -> Self {
        Self {
            file_path: home.into().join("settings.json"),
        }
    }

    pub fn read(&self) -> Value {
        let parsed = fs::read_to_string(&self.file_path)
            .ok()
            .and_then(|content| serde_json::from_str::<Value>(&content).ok())
            .unwrap_or_else(default_settings);
        normalize_built_in_presets(merge_settings(default_settings(), parsed))
    }

    pub fn write(&self, settings: Value) -> Result<Value, String> {
        let next = normalize_built_in_presets(merge_settings(default_settings(), settings));
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let text = serde_json::to_string_pretty(&next).map_err(|error| error.to_string())?;
        fs::write(&self.file_path, format!("{text}\n")).map_err(|error| error.to_string())?;
        Ok(next)
    }

    pub fn reset_theme(&self) -> Result<Value, String> {
        let mut settings = self.read();
        settings["theme"] = default_settings()["theme"].clone();
        self.write(settings)
    }
}

pub fn theme_css(settings: &Value) -> String {
    let theme = effective_theme(settings);
    let ui = &theme["tokens"]["ui"];
    let docs = &theme["tokens"]["docs"];
    let terminal = &theme["tokens"]["terminal"];
    format!(
        ":root {{\n  color-scheme: {};\n  --bg: {};\n  --panel: {};\n  --border: {};\n  --text: {};\n  --muted: {};\n  --accent: {};\n  --sidebar-font: {};\n  --docs-bg: {};\n  --docs-panel: {};\n  --docs-border: {};\n  --docs-text: {};\n  --docs-muted: {};\n  --docs-link: {};\n  --docs-code: {};\n  --docs-serif-font: {};\n  --docs-mono-font: {};\n  --terminal-bg: {};\n  --terminal-pane: {};\n  --terminal-toolbar: {};\n  --terminal-header: {};\n  --terminal-border: {};\n  --terminal-text: {};\n  --terminal-muted: {};\n  --terminal-accent: {};\n  --terminal-font: {};\n}}\n",
        css_value(&theme["mode"], "light"),
        css_value(&ui["bg"], "#f7f7f4"),
        css_value(&ui["panel"], "#ffffff"),
        css_value(&ui["border"], "#d8d8d0"),
        css_value(&ui["text"], "#20231f"),
        css_value(&ui["muted"], "#62675f"),
        css_value(&ui["accent"], "#276ef1"),
        css_value(&ui["sidebarFont"], "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"),
        css_value(&docs["bg"], "#fbfaf4"),
        css_value(&docs["panel"], "#fffdf8"),
        css_value(&docs["border"], "#ddd7c9"),
        css_value(&docs["text"], "#24221d"),
        css_value(&docs["muted"], "#6f695d"),
        css_value(&docs["link"], "#285f8f"),
        css_value(&docs["code"], "#efede4"),
        css_value(&docs["serifFont"], "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif"),
        css_value(&docs["monoFont"], "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"),
        css_value(&terminal["bg"], "#272822"),
        css_value(&terminal["pane"], "#111312"),
        css_value(&terminal["toolbar"], "#171a18"),
        css_value(&terminal["header"], "#1b1f1b"),
        css_value(&terminal["border"], "#2c302d"),
        css_value(&terminal["text"], "#eef2ec"),
        css_value(&terminal["muted"], "#abb5ad"),
        css_value(&terminal["accent"], "#9fd1ff"),
        css_value(&terminal["font"], css_value(&docs["monoFont"], "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace").as_str())
    )
}

pub fn sync_agents_file(
    root: impl AsRef<Path>,
    settings: &Value,
    base_content: Option<&str>,
) -> Result<AgentsSyncResult, String> {
    let file_path = root.as_ref().join("AGENTS.md");
    let existing = base_content
        .map(String::from)
        .or_else(|| fs::read_to_string(&file_path).ok())
        .unwrap_or_default();
    let block = render_agents_block(settings);
    let next = replace_or_append_managed_block(&existing, &block);
    fs::write(&file_path, next).map_err(|error| error.to_string())?;
    Ok(AgentsSyncResult {
        path: file_path,
        memory_entries: enabled_memory_entries(settings).len(),
    })
}

pub fn agents_file(root: impl AsRef<Path>) -> AgentsFile {
    let path = root.as_ref().join("AGENTS.md");
    AgentsFile {
        content: fs::read_to_string(&path).unwrap_or_default(),
        path,
    }
}

pub fn render_agents_block(settings: &Value) -> String {
    let soul = &settings["soul"];
    let principles = soul["principles"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item.as_str())
        .filter(|item| !item.trim().is_empty())
        .map(|item| format!("- {}", item.trim()))
        .collect::<Vec<_>>();
    let memories = enabled_memory_entries(settings)
        .into_iter()
        .map(|(title, content)| {
            if title.is_empty() {
                format!("- {content}")
            } else {
                format!("- {title}: {content}")
            }
        })
        .collect::<Vec<_>>();
    format!(
        "{MANAGED_START}\n## HyperWiki Global Context\n\n### Soul\n\n{}\n\nInterface guidance: {}\n\nAgent guidance: {}\n\n### Memory\n\n{}\n{MANAGED_END}",
        if principles.is_empty() { "- No global soul principles recorded.".to_string() } else { principles.join("\n") },
        string_at(soul, "interface", "Use HyperWiki's default interface guidance."),
        string_at(soul, "agent", "Use HyperWiki's default agent guidance."),
        if memories.is_empty() { "- No approved global memory entries recorded.".to_string() } else { memories.join("\n") }
    )
}

fn replace_or_append_managed_block(existing: &str, block: &str) -> String {
    if let (Some(start), Some(end)) = (existing.find(MANAGED_START), existing.find(MANAGED_END)) {
        let end_index = end + MANAGED_END.len();
        return format!("{}{}{}", &existing[..start], block, &existing[end_index..]);
    }
    let trimmed = existing.trim_end();
    if trimmed.is_empty() {
        format!("{block}\n")
    } else {
        format!("{trimmed}\n\n{block}\n")
    }
}

fn enabled_memory_entries(settings: &Value) -> Vec<(String, String)> {
    settings["memory"]["entries"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry["enabled"].as_bool() != Some(false))
        .filter_map(|entry| {
            let content = entry["content"].as_str().unwrap_or_default().trim();
            (!content.is_empty()).then(|| {
                (
                    entry["title"]
                        .as_str()
                        .unwrap_or_default()
                        .trim()
                        .to_string(),
                    content.to_string(),
                )
            })
        })
        .collect()
}

fn effective_theme(settings: &Value) -> Value {
    let active = settings["theme"]["activePreset"]
        .as_str()
        .unwrap_or("paper");
    let preset = settings["theme"]["presets"][active]
        .as_object()
        .map(|_| settings["theme"]["presets"][active].clone())
        .unwrap_or_else(|| default_settings()["theme"]["presets"]["paper"].clone());
    merge_settings(
        preset,
        json!({ "tokens": settings["theme"]["customTokens"].clone() }),
    )
}

fn normalize_built_in_presets(mut settings: Value) -> Value {
    settings["theme"]["presets"] = default_settings()["theme"]["presets"].clone();
    let active = settings["theme"]["activePreset"]
        .as_str()
        .unwrap_or("paper")
        .to_string();
    if !settings["theme"]["presets"][&active].is_object() {
        settings["theme"]["activePreset"] = json!("paper");
    }
    settings
}

fn merge_settings(base: Value, override_value: Value) -> Value {
    match (base, override_value) {
        (Value::Object(mut base), Value::Object(override_object)) => {
            for (key, value) in override_object {
                let next = base.remove(&key).unwrap_or(Value::Null);
                base.insert(key, merge_settings(next, value));
            }
            Value::Object(base)
        }
        (base, Value::Null) => base,
        (_, override_value) => override_value,
    }
}

fn css_value(value: &Value, fallback: &str) -> String {
    value.as_str().unwrap_or(fallback).to_string()
}

fn string_at<'a>(value: &'a Value, key: &str, fallback: &'a str) -> &'a str {
    value[key]
        .as_str()
        .filter(|item| !item.is_empty())
        .unwrap_or(fallback)
}

fn default_settings() -> Value {
    json!({
        "theme": {
            "activePreset": "paper",
            "presets": {
                "paper": {
                    "label": "Paper",
                    "mode": "light",
                    "tokens": {
                        "ui": {
                            "bg": "#f7f7f4",
                            "panel": "#ffffff",
                            "border": "#d8d8d0",
                            "text": "#20231f",
                            "muted": "#62675f",
                            "accent": "#276ef1",
                            "sidebarFont": "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                        },
                        "docs": {
                            "bg": "#fbfaf4",
                            "panel": "#fffdf8",
                            "border": "#ddd7c9",
                            "text": "#24221d",
                            "muted": "#6f695d",
                            "link": "#285f8f",
                            "code": "#efede4",
                            "serifFont": "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
                            "monoFont": "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                        },
                        "terminal": {
                            "bg": "#272822",
                            "pane": "#111312",
                            "toolbar": "#171a18",
                            "header": "#1b1f1b",
                            "border": "#2c302d",
                            "text": "#eef2ec",
                            "muted": "#abb5ad",
                            "accent": "#9fd1ff",
                            "font": "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                        }
                    }
                },
                "atlas": preset("Atlas", "light", "#f4f7f8", "#ffffff", "#cad8dc", "#17252a", "#5d6d72", "#0b7285", "#fafcfb", "#ffffff", "#d3dddc", "#1f2928", "#637170", "#0b7285", "#e9f1f1", "#1a2428", "#10181b", "#142025", "#1b2a30", "#34464c", "#eef7f8", "#a9b8bb", "#6bd6e6"),
                "obsidian": preset("Obsidian", "dark", "#141516", "#1d1f20", "#363a3b", "#eeeeea", "#a5aaa8", "#9dc4ff", "#151617", "#202223", "#383c3e", "#f0ede5", "#b1aaa0", "#9dc4ff", "#2a2c2d", "#0c0d0e", "#08090a", "#111314", "#17191b", "#303438", "#f2f4f3", "#a8b0ae", "#9dc4ff"),
                "graphite": preset("Graphite", "dark", "#171819", "#202224", "#3a3f43", "#f0f2f2", "#a6adb1", "#7dd3a8", "#17191a", "#222426", "#3c4145", "#edf1ee", "#aab2ad", "#7dd3a8", "#2a2d2f", "#0d0f10", "#090a0b", "#121516", "#181c1e", "#333a3d", "#eef5f1", "#a7b2ad", "#7dd3a8")
            },
            "customTokens": {}
        },
        "soul": {
            "principles": [
                "HyperWiki is Localhost Tooling for docs-driven agentic development.",
                "Prefer concise, concrete language over marketing language.",
                "Keep product behavior visible, inspectable, and reversible."
            ],
            "interface": "Use quiet, utilitarian UI that supports repeated planning, reading, and agent handoff work.",
            "agent": "Agents should preserve repo-local truth, name uncertainty, update durable wiki context, and run relevant checks before finishing."
        },
        "memory": { "entries": [] }
    })
}

#[allow(clippy::too_many_arguments)]
fn preset(
    label: &str,
    mode: &str,
    ui_bg: &str,
    ui_panel: &str,
    ui_border: &str,
    ui_text: &str,
    ui_muted: &str,
    ui_accent: &str,
    docs_bg: &str,
    docs_panel: &str,
    docs_border: &str,
    docs_text: &str,
    docs_muted: &str,
    docs_link: &str,
    docs_code: &str,
    terminal_bg: &str,
    terminal_pane: &str,
    terminal_toolbar: &str,
    terminal_header: &str,
    terminal_border: &str,
    terminal_text: &str,
    terminal_muted: &str,
    terminal_accent: &str,
) -> Value {
    json!({
        "label": label,
        "mode": mode,
        "tokens": {
            "ui": {
                "bg": ui_bg,
                "panel": ui_panel,
                "border": ui_border,
                "text": ui_text,
                "muted": ui_muted,
                "accent": ui_accent,
                "sidebarFont": "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            },
            "docs": {
                "bg": docs_bg,
                "panel": docs_panel,
                "border": docs_border,
                "text": docs_text,
                "muted": docs_muted,
                "link": docs_link,
                "code": docs_code,
                "serifFont": "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
                "monoFont": "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            },
            "terminal": {
                "bg": terminal_bg,
                "pane": terminal_pane,
                "toolbar": terminal_toolbar,
                "header": terminal_header,
                "border": terminal_border,
                "text": terminal_text,
                "muted": terminal_muted,
                "accent": terminal_accent,
                "font": "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reads_defaults_and_normalizes_builtin_presets() {
        let home = temp_root("settings-defaults");
        let settings = SettingsStore::new(&home).read();
        assert_eq!(settings["theme"]["activePreset"], "paper");
        assert!(settings["theme"]["presets"]["atlas"].is_object());
        assert!(settings["soul"]["principles"].as_array().unwrap().len() >= 3);
    }

    #[test]
    fn normalizes_missing_active_preset_to_paper() {
        let home = temp_root("settings-active-preset");
        fs::create_dir_all(&home).unwrap();
        fs::write(
            home.join("settings.json"),
            json!({
                "theme": {
                    "activePreset": "signal",
                    "presets": {
                        "signal": { "label": "Signal", "tokens": {} }
                    },
                    "customTokens": {}
                }
            })
            .to_string(),
        )
        .unwrap();
        let settings = SettingsStore::new(&home).read();
        assert_eq!(settings["theme"]["activePreset"], "paper");
        assert!(settings["theme"]["presets"]["paper"].is_object());
    }

    #[test]
    fn writes_settings_and_resets_theme_without_losing_soul() {
        let home = temp_root("settings-write");
        let store = SettingsStore::new(&home);
        let written = store
            .write(json!({
                "theme": {
                    "activePreset": "obsidian",
                    "customTokens": { "ui": { "accent": "#123456" } }
                },
                "soul": { "agent": "Name uncertainty." }
            }))
            .unwrap();
        assert_eq!(written["theme"]["activePreset"], "obsidian");

        let reset = store.reset_theme().unwrap();
        assert_eq!(reset["theme"]["activePreset"], "paper");
        assert_eq!(reset["soul"]["agent"], "Name uncertainty.");
    }

    #[test]
    fn generates_theme_css_from_custom_tokens() {
        let settings = merge_settings(
            default_settings(),
            json!({ "theme": { "customTokens": { "ui": { "accent": "#abcdef" } } } }),
        );
        let css = theme_css(&settings);
        assert!(css.contains("--accent: #abcdef;"));
        assert!(css.contains("--terminal-font:"));
    }

    #[test]
    fn replaces_agents_managed_block_and_counts_enabled_memory() {
        let root = temp_root("settings-agents");
        let settings = merge_settings(
            default_settings(),
            json!({
                "soul": { "principles": ["One"], "interface": "Calm UI.", "agent": "Be precise." },
                "memory": { "entries": [
                    { "title": "Keep", "content": "Visible context.", "enabled": true },
                    { "title": "Skip", "content": "Hidden context.", "enabled": false }
                ] }
            }),
        );
        let result = sync_agents_file(
            &root,
            &settings,
            Some("Header\n\n<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->\nold\n<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->\nTail\n"),
        )
        .unwrap();
        let content = fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert_eq!(result.memory_entries, 1);
        assert!(content.contains("Header"));
        assert!(content.contains("- One"));
        assert!(content.contains("- Keep: Visible context."));
        assert!(!content.contains("old"));
        assert!(content.contains("Tail"));
    }

    fn temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hyperwiki-tauri-{label}-{nanos}"));
        fs::create_dir_all(&root).unwrap();
        root
    }
}
