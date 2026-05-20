use super::DomainSurface;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "sessions",
        node_reference: "src/sessions.js",
        responsibilities: &[
            "ignored session metadata",
            "terminal layout retention",
            "session rename, close, export, and prune",
            "plan-scoped restore state",
        ],
        parity_gate: "session-retention smoke equivalent",
    }
}

#[derive(Debug, Clone)]
pub struct SessionRegistry {
    sessions_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub mode: String,
    pub role: String,
    pub command: Option<String>,
    pub shell: Option<String>,
    pub pid: Option<u32>,
    pub cwd: PathBuf,
    pub scope: String,
    pub scope_kind: String,
    pub plan_path: Option<String>,
    pub connected_clients: u32,
    pub last_attached_at: Option<String>,
    pub retained: bool,
    pub reconnectable: bool,
    pub exported_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdates {
    pub name: Option<String>,
    pub kind: Option<String>,
    pub status: Option<String>,
    pub mode: Option<String>,
    pub role: Option<String>,
    pub command: Option<String>,
    pub shell: Option<String>,
    pub pid: Option<u32>,
    pub cwd: Option<PathBuf>,
    pub scope: Option<String>,
    pub scope_kind: Option<String>,
    pub plan_path: Option<String>,
    pub connected_clients: Option<u32>,
    pub last_attached_at: Option<String>,
    pub retained: Option<bool>,
    pub reconnectable: Option<bool>,
    pub exported_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SessionList {
    pub sessions: Vec<SessionRecord>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SessionResponse {
    pub session: SessionRecord,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExport {
    pub exported_at: String,
    pub boundary: String,
    pub note: String,
    pub session: SessionRecord,
}

impl SessionRegistry {
    pub fn new(root: impl AsRef<Path>) -> Self {
        Self {
            sessions_dir: root.as_ref().join(".hyperwiki").join("sessions"),
        }
    }

    pub fn list(&self, scope: Option<&str>, prune: bool) -> SessionList {
        if prune {
            let _ = self.prune();
        }
        let mut sessions = self.read_persisted();
        sessions.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        if let Some(scope) = scope.filter(|value| !value.is_empty()) {
            sessions.retain(|session| session.scope == scope);
        }
        SessionList { sessions }
    }

    pub fn upsert(&self, id: &str, updates: SessionUpdates) -> Result<SessionRecord, String> {
        fs::create_dir_all(&self.sessions_dir).map_err(|error| error.to_string())?;
        let now = timestamp();
        let existing = self.read_one(id);
        let status = updates
            .status
            .clone()
            .or_else(|| existing.as_ref().map(|session| session.status.clone()))
            .unwrap_or_else(|| "active".to_string());
        let session = SessionRecord {
            id: id.to_string(),
            name: updates
                .name
                .or_else(|| existing.as_ref().map(|session| session.name.clone()))
                .unwrap_or_else(|| id.to_string()),
            kind: updates
                .kind
                .or_else(|| existing.as_ref().map(|session| session.kind.clone()))
                .unwrap_or_else(|| "terminal".to_string()),
            status: status.clone(),
            mode: updates
                .mode
                .or_else(|| existing.as_ref().map(|session| session.mode.clone()))
                .unwrap_or_else(|| "unknown".to_string()),
            role: updates
                .role
                .or_else(|| existing.as_ref().map(|session| session.role.clone()))
                .unwrap_or_else(|| "shell".to_string()),
            command: updates.command.or_else(|| {
                existing
                    .as_ref()
                    .and_then(|session| session.command.clone())
            }),
            shell: updates
                .shell
                .or_else(|| existing.as_ref().and_then(|session| session.shell.clone())),
            pid: updates
                .pid
                .or_else(|| existing.as_ref().and_then(|session| session.pid)),
            cwd: updates
                .cwd
                .or_else(|| existing.as_ref().map(|session| session.cwd.clone()))
                .unwrap_or_else(|| self.project_root()),
            scope: updates
                .scope
                .or_else(|| existing.as_ref().map(|session| session.scope.clone()))
                .unwrap_or_else(|| "global".to_string()),
            scope_kind: updates
                .scope_kind
                .or_else(|| existing.as_ref().map(|session| session.scope_kind.clone()))
                .unwrap_or_else(|| "global".to_string()),
            plan_path: updates.plan_path.or_else(|| {
                existing
                    .as_ref()
                    .and_then(|session| session.plan_path.clone())
            }),
            connected_clients: updates
                .connected_clients
                .or_else(|| existing.as_ref().map(|session| session.connected_clients))
                .unwrap_or(0),
            last_attached_at: updates.last_attached_at.or_else(|| {
                existing
                    .as_ref()
                    .and_then(|session| session.last_attached_at.clone())
            }),
            retained: updates
                .retained
                .or_else(|| existing.as_ref().map(|session| session.retained))
                .unwrap_or(true),
            reconnectable: updates
                .reconnectable
                .or_else(|| existing.as_ref().map(|session| session.reconnectable))
                .unwrap_or(true),
            exported_at: updates.exported_at.or_else(|| {
                existing
                    .as_ref()
                    .and_then(|session| session.exported_at.clone())
            }),
            created_at: existing
                .as_ref()
                .map(|session| session.created_at.clone())
                .unwrap_or_else(|| now.clone()),
            updated_at: now.clone(),
            closed_at: if status == "closed" {
                Some(now)
            } else {
                existing
                    .as_ref()
                    .and_then(|session| session.closed_at.clone())
            },
        };
        self.write_one(&session)?;
        Ok(session)
    }

    pub fn rename(&self, id: &str, name: &str) -> Result<SessionRecord, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Session name is required.".to_string());
        }
        self.upsert(
            id,
            SessionUpdates {
                name: Some(trimmed.to_string()),
                ..SessionUpdates::default()
            },
        )
    }

    pub fn close(&self, id: &str) -> Result<SessionRecord, String> {
        self.upsert(
            id,
            SessionUpdates {
                status: Some("closed".to_string()),
                ..SessionUpdates::default()
            },
        )
    }

    pub fn export(&self, id: &str) -> Result<SessionExport, String> {
        if self.read_one(id).is_none() {
            return Err("Session not found.".to_string());
        }
        let exported_at = timestamp();
        let session = self.upsert(
            id,
            SessionUpdates {
                exported_at: Some(exported_at.clone()),
                ..SessionUpdates::default()
            },
        )?;
        Ok(SessionExport {
            exported_at,
            boundary: "runtime-only".to_string(),
            note: "This export is returned to the caller. hyperwiki does not write terminal runtime state into repo-visible wiki files automatically.".to_string(),
            session,
        })
    }

    pub fn prune(&self) -> Result<(), String> {
        let mut closed = self
            .read_persisted()
            .into_iter()
            .filter(|session| session.status == "closed")
            .collect::<Vec<_>>();
        closed.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        for session in closed.into_iter().skip(25) {
            let path = self
                .sessions_dir
                .join(format!("{}.json", safe_id(&session.id)));
            fs::remove_file(path)
                .or_else(|error| {
                    if error.kind() == std::io::ErrorKind::NotFound {
                        Ok(())
                    } else {
                        Err(error)
                    }
                })
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn read_persisted(&self) -> Vec<SessionRecord> {
        let Ok(entries) = fs::read_dir(&self.sessions_dir) else {
            return Vec::new();
        };
        entries
            .flatten()
            .filter(|entry| {
                entry.path().extension().and_then(|value| value.to_str()) == Some("json")
            })
            .filter_map(|entry| {
                entry
                    .path()
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .and_then(|id| self.read_one(id))
            })
            .collect()
    }

    fn read_one(&self, id: &str) -> Option<SessionRecord> {
        let path = self.sessions_dir.join(format!("{}.json", safe_id(id)));
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn write_one(&self, session: &SessionRecord) -> Result<(), String> {
        let path = self
            .sessions_dir
            .join(format!("{}.json", safe_id(&session.id)));
        let text = serde_json::to_string_pretty(session).map_err(|error| error.to_string())?;
        fs::write(path, format!("{text}\n")).map_err(|error| error.to_string())
    }

    fn project_root(&self) -> PathBuf {
        self.sessions_dir
            .parent()
            .and_then(|path| path.parent())
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    }
}

fn safe_id(id: &str) -> String {
    id.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{millis:013}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upserts_lists_renames_exports_and_closes_sessions() {
        let root = temp_root("sessions-basic");
        let registry = SessionRegistry::new(&root);
        let created = registry
            .upsert(
                "agent/one",
                SessionUpdates {
                    name: Some("agent".to_string()),
                    mode: Some("pty".to_string()),
                    scope: Some("plan:/wiki/plans/index.html".to_string()),
                    ..SessionUpdates::default()
                },
            )
            .unwrap();
        assert_eq!(created.id, "agent/one");
        assert_eq!(created.name, "agent");

        let renamed = registry.rename("agent/one", "agent main").unwrap();
        assert_eq!(renamed.name, "agent main");

        let exported = registry.export("agent/one").unwrap();
        assert_eq!(exported.boundary, "runtime-only");
        assert_eq!(exported.session.exported_at, Some(exported.exported_at));

        let scoped = registry.list(Some("plan:/wiki/plans/index.html"), true);
        assert_eq!(scoped.sessions.len(), 1);

        let closed = registry.close("agent/one").unwrap();
        assert_eq!(closed.status, "closed");
        assert!(closed.closed_at.is_some());
    }

    #[test]
    fn prunes_closed_sessions_to_latest_twenty_five() {
        let root = temp_root("sessions-prune");
        let registry = SessionRegistry::new(&root);
        for index in 0..30 {
            registry
                .upsert(
                    &format!("closed-{index}"),
                    SessionUpdates {
                        status: Some("closed".to_string()),
                        ..SessionUpdates::default()
                    },
                )
                .unwrap();
        }
        registry.prune().unwrap();
        let closed = registry
            .list(None, false)
            .sessions
            .into_iter()
            .filter(|session| session.status == "closed")
            .count();
        assert_eq!(closed, 25);
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
