use super::DomainSurface;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::Path;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "mcp",
        node_reference: "src/mcp.js, src/server.js",
        responsibilities: &[
            "MCP surface contract",
            "read-only resource and tool definitions",
            "stdio Content-Length JSON-RPC transport",
            "permissioned action tool boundaries",
        ],
        parity_gate: "MCP surface and transport smoke equivalents",
    }
}

const PROTOCOL_VERSION: &str = "2024-11-05";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpSurfaceSummary {
    pub version: u16,
    pub kind: String,
    pub generated_at: String,
    pub boundary: String,
    pub transport_status: String,
    pub contract: McpContractMapping,
    pub project: crate::domain::verification::ContractProject,
    pub canonical_truth: Vec<String>,
    pub runtime_truth: Vec<String>,
    pub resources: Vec<McpResource>,
    pub tools: Vec<McpTool>,
    pub use_cases: Vec<String>,
    pub implementation_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpContractMapping {
    pub source_endpoint: String,
    pub kind: String,
    pub version: u16,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub mime_type: String,
    pub boundary: String,
    pub read_only: bool,
    pub source_endpoint: String,
    pub contract_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub title: String,
    pub description: String,
    pub read_only: bool,
    pub idempotent: bool,
    pub destructive: bool,
    pub boundary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_active_agent_session: Option<bool>,
    pub maps_to: Value,
    pub input_schema: Value,
    pub project_root: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcMessage {
    pub jsonrpc: Option<String>,
    pub id: Option<Value>,
    pub method: Option<String>,
    #[serde(default)]
    pub params: Value,
}

pub fn mcp_surface_summary(root: impl AsRef<Path>) -> McpSurfaceSummary {
    let contract = crate::domain::verification::project_contract(root.as_ref());
    McpSurfaceSummary {
        version: 1,
        kind: "hyperwiki.mcp-surface".to_string(),
        generated_at: generated_at(),
        boundary: "localhost-tooling".to_string(),
        transport_status: "stdio-served".to_string(),
        contract: McpContractMapping {
            source_endpoint: "/api/project-contract".to_string(),
            kind: contract.kind.clone(),
            version: contract.version,
        },
        project: contract.project.clone(),
        canonical_truth: contract.canonical_truth.clone(),
        runtime_truth: contract.runtime_truth.clone(),
        resources: mcp_resources(),
        tools: mcp_tools(&contract),
        use_cases: vec![
            "Start an agent with current project, plan, source, guardrail, and verification context.".to_string(),
            "Let an MCP-capable agent discover verification loops before finishing work.".to_string(),
            "Prepare consistent diff, architecture, security, and test-gap review prompts.".to_string(),
            "Expose Localhost Tooling trust boundaries without asking agents to scrape the UI.".to_string(),
            "Keep runtime evidence separate from durable wiki and Git truth.".to_string(),
        ],
        implementation_notes: vec![
            "This is the stable surface contract for the local stdio MCP server.".to_string(),
            "Read resources are served through `hyperwiki mcp` and may also be read from corresponding local HTTP API payloads.".to_string(),
            "Action tools must preserve the same permission boundaries as the local HTTP handlers.".to_string(),
            "Prompt submission and review workflow execution require an active visible agent session unless dry-run preparation is requested.".to_string(),
        ],
    }
}

pub fn handle_mcp_message(root: impl AsRef<Path>, message: JsonRpcMessage) -> Option<Value> {
    let id = message.id?;
    let method = message.method.unwrap_or_default();
    let result = dispatch_mcp(root.as_ref(), &method, message.params);
    Some(match result {
        Ok(result) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        }),
        Err((code, message)) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": code,
                "message": message
            }
        }),
    })
}

pub fn frame_json_message(message: &Value) -> String {
    let body = serde_json::to_string(message).expect("MCP response should serialize");
    format!("Content-Length: {}\r\n\r\n{body}", body.len())
}

pub fn run_stdio_server(root: impl AsRef<Path>) -> Result<(), String> {
    let root = root.as_ref().to_path_buf();
    let mut input = std::io::stdin().lock();
    let mut output = std::io::stdout().lock();
    let mut buffer = Vec::<u8>::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let count = input.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            return Ok(());
        }
        buffer.extend_from_slice(&chunk[..count]);
        while let Some(raw_message) = next_framed_message(&mut buffer)? {
            let message = serde_json::from_slice::<JsonRpcMessage>(&raw_message)
                .map_err(|error| error.to_string())?;
            let Some(response) = handle_mcp_message(&root, message) else {
                continue;
            };
            output
                .write_all(frame_json_message(&response).as_bytes())
                .map_err(|error| error.to_string())?;
            output.flush().map_err(|error| error.to_string())?;
        }
    }
}

fn next_framed_message(buffer: &mut Vec<u8>) -> Result<Option<Vec<u8>>, String> {
    let Some(header_end) = find_bytes(buffer, b"\r\n\r\n") else {
        return Ok(None);
    };
    let header = String::from_utf8_lossy(&buffer[..header_end]);
    let Some(length) = header.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length")
            .then(|| value.trim().parse::<usize>().ok())
            .flatten()
    }) else {
        return Err("MCP message missing Content-Length header.".to_string());
    };
    let body_start = header_end + 4;
    if buffer.len() < body_start + length {
        return Ok(None);
    }
    let body = buffer[body_start..body_start + length].to_vec();
    buffer.drain(..body_start + length);
    Ok(Some(body))
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn dispatch_mcp(root: &Path, method: &str, params: Value) -> Result<Value, (i32, String)> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "resources": {},
                "tools": {}
            },
            "serverInfo": {
                "name": "hyperwiki",
                "version": env!("CARGO_PKG_VERSION")
            }
        })),
        "resources/list" => {
            let surface = mcp_surface_summary(root);
            Ok(json!({
                "resources": surface.resources.into_iter().map(|resource| json!({
                    "uri": resource.uri,
                    "name": resource.name,
                    "description": resource.description,
                    "mimeType": resource.mime_type
                })).collect::<Vec<_>>()
            }))
        }
        "resources/read" => {
            let uri = params["uri"].as_str().unwrap_or_default();
            let payload = resource_payload(root, uri)?;
            Ok(json!({
                "contents": [{
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": format!("{}\n", serde_json::to_string_pretty(&payload).unwrap())
                }]
            }))
        }
        "tools/list" => {
            let surface = mcp_surface_summary(root);
            Ok(json!({
                "tools": surface.tools.into_iter()
                    .filter(|tool| tool.read_only)
                    .map(|tool| json!({
                        "name": tool.name,
                        "title": tool.title,
                        "description": tool.description,
                        "inputSchema": tool.input_schema
                    }))
                    .collect::<Vec<_>>()
            }))
        }
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or_default();
            let arguments = params["arguments"].as_object().cloned().unwrap_or_default();
            if !arguments.is_empty() {
                return Err((-32602, format!("{name} does not accept arguments.")));
            }
            let payload = match name {
                "get_project_contract" => {
                    serde_json::to_value(crate::domain::verification::project_contract(root))
                        .unwrap()
                }
                "get_current_plan" => {
                    serde_json::to_value(crate::domain::verification::project_contract(root).plan)
                        .unwrap()
                }
                "list_verification_loops" => {
                    serde_json::to_value(crate::domain::verification::verification_summary(root))
                        .unwrap()
                }
                "list_review_workflows" => {
                    serde_json::to_value(crate::domain::reviews::review_workflow_summary(root))
                        .unwrap()
                }
                _ => {
                    return Err((
                        -32602,
                        format!("Unsupported or non-read-only MCP tool: {name}"),
                    ))
                }
            };
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("{}\n", serde_json::to_string_pretty(&payload).unwrap())
                }],
                "isError": false
            }))
        }
        _ => Err((-32601, format!("Unsupported MCP method: {method}"))),
    }
}

fn resource_payload(root: &Path, uri: &str) -> Result<Value, (i32, String)> {
    match uri {
        "hyperwiki://project-contract" => {
            Ok(serde_json::to_value(crate::domain::verification::project_contract(root)).unwrap())
        }
        "hyperwiki://current-plan" => Ok(serde_json::to_value(
            crate::domain::verification::project_contract(root).plan,
        )
        .unwrap()),
        "hyperwiki://source-index" => Ok(serde_json::to_value(
            crate::domain::verification::project_contract(root).sources,
        )
        .unwrap()),
        "hyperwiki://verification-loops" => Ok(serde_json::to_value(
            crate::domain::verification::verification_summary(root),
        )
        .unwrap()),
        "hyperwiki://guardrails" => {
            Ok(serde_json::to_value(crate::domain::verification::guardrail_summary(root)).unwrap())
        }
        "hyperwiki://review-workflows" => Ok(serde_json::to_value(
            crate::domain::reviews::review_workflow_summary(root),
        )
        .unwrap()),
        "hyperwiki://wiki-pages" => {
            Ok(serde_json::to_value(crate::domain::wiki::list_wiki_pages(root, None)).unwrap())
        }
        _ => Err((-32602, format!("Unknown MCP resource: {uri}"))),
    }
}

fn mcp_resources() -> Vec<McpResource> {
    vec![
        resource("hyperwiki://project-contract", "Project Contract", "Machine-readable project facts, current plan state, source briefs, guardrails, verification loops, layout, wiki pages, and runtime boundaries.", "localhost-tooling", "/api/project-contract", "$"),
        resource("hyperwiki://current-plan", "Current Plan", "Current planning dashboard status and active plan/unit path derived from repo-visible wiki HTML.", "canonical-wiki", "/api/project-contract", "$.plan"),
        resource("hyperwiki://source-index", "Source Index", "Source index and generated source briefs that define durable product and technical context.", "canonical-wiki", "/api/project-contract", "$.sources"),
        resource("hyperwiki://verification-loops", "Verification Loops", "Configured or inferred verification loops plus latest local runtime evidence.", "runtime-evidence", "/api/verification", "$"),
        resource("hyperwiki://guardrails", "Guardrails", "Localhost Tooling trust boundary, canonical truth, runtime state, and terminal/session action boundaries.", "localhost-tooling", "/api/guardrails", "$"),
        resource("hyperwiki://review-workflows", "Review Workflows", "Named agent review workflows for diff, architecture consistency, security, and test-gap review.", "runtime-only-until-recorded", "/api/review-workflows", "$"),
        resource("hyperwiki://wiki-pages", "Wiki Pages", "Repo-visible HTML wiki page index for canonical project knowledge.", "canonical-wiki", "/api/wiki", "$.wiki"),
    ]
}

fn mcp_tools(contract: &crate::domain::verification::ProjectContract) -> Vec<McpTool> {
    vec![
        tool("get_project_contract", "Get Project Contract", "Return the complete machine-readable project contract.", true, true, false, "localhost-tooling", None, json!({ "method": "GET", "endpoint": "/api/project-contract" }), object_schema(json!({}), vec![]), contract),
        tool("get_current_plan", "Get Current Plan", "Return the active plan and current unit derived from the wiki.", true, true, false, "canonical-wiki", None, json!({ "method": "GET", "endpoint": "/api/project-contract", "responsePath": "$.plan" }), object_schema(json!({}), vec![]), contract),
        tool("list_verification_loops", "List Verification Loops", "Return verification loops and latest local runtime evidence.", true, true, false, "runtime-evidence", None, json!({ "method": "GET", "endpoint": "/api/verification" }), object_schema(json!({}), vec![]), contract),
        tool("list_review_workflows", "List Review Workflows", "Return available named agent review workflows.", true, true, false, "runtime-only-until-recorded", None, json!({ "method": "GET", "endpoint": "/api/review-workflows" }), object_schema(json!({}), vec![]), contract),
        tool("prepare_review_workflow", "Prepare Review Workflow", "Build a project-contract-aware review prompt without sending it to a terminal session.", false, true, false, "runtime-evidence", None, json!({ "method": "POST", "endpoint": "/api/review-workflows/run", "fixedBody": { "dryRun": true } }), object_schema(json!({
            "workflowId": {
                "type": "string",
                "enum": ["diff-review", "architecture-review", "security-review", "test-gap-review"],
                "description": "Review workflow to prepare."
            },
            "currentPage": {
                "type": "string",
                "description": "Current wiki page path to include in the handoff."
            },
            "scope": {
                "type": "string",
                "description": "Optional terminal scope to target when the workflow is sent."
            }
        }), vec!["workflowId"]), contract),
        tool("submit_agent_prompt", "Submit Agent Prompt", "Send a bounded prompt into the active visible agent terminal session.", false, false, false, "visible-agent-session", Some(true), json!({ "method": "POST", "endpoint": "/api/agent/prompt" }), object_schema(json!({
            "prompt": {
                "type": "string",
                "description": "Prompt text to route through the visible terminal handoff."
            },
            "currentPage": {
                "type": "string",
                "description": "Current wiki page path to include in the handoff."
            },
            "scope": {
                "type": "string",
                "description": "Optional terminal scope to target, such as plan:/wiki/plans/index.html."
            }
        }), vec!["prompt"]), contract),
    ]
}

fn resource(
    uri: &str,
    name: &str,
    description: &str,
    boundary: &str,
    source_endpoint: &str,
    contract_path: &str,
) -> McpResource {
    McpResource {
        uri: uri.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        mime_type: "application/json".to_string(),
        boundary: boundary.to_string(),
        read_only: true,
        source_endpoint: source_endpoint.to_string(),
        contract_path: contract_path.to_string(),
    }
}

#[allow(clippy::too_many_arguments)]
fn tool(
    name: &str,
    title: &str,
    description: &str,
    read_only: bool,
    idempotent: bool,
    destructive: bool,
    boundary: &str,
    requires_active_agent_session: Option<bool>,
    maps_to: Value,
    input_schema: Value,
    contract: &crate::domain::verification::ProjectContract,
) -> McpTool {
    McpTool {
        name: name.to_string(),
        title: title.to_string(),
        description: description.to_string(),
        read_only,
        idempotent,
        destructive,
        boundary: boundary.to_string(),
        requires_active_agent_session,
        maps_to,
        input_schema,
        project_root: contract.project.root.display().to_string(),
    }
}

fn object_schema(properties: Value, required: Vec<&str>) -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": properties,
        "required": required
    })
}

fn generated_at() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("{seconds}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn mcp_surface_exposes_resources_and_permissioned_tools() {
        let root = temp_root("mcp-surface");
        make_project(&root, "MCP Surface");

        let surface = mcp_surface_summary(&root);
        let resource_uris = surface
            .resources
            .iter()
            .map(|resource| resource.uri.as_str())
            .collect::<Vec<_>>();
        let tool_names = surface
            .tools
            .iter()
            .map(|tool| tool.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(surface.version, 1);
        assert_eq!(surface.kind, "hyperwiki.mcp-surface");
        assert_eq!(surface.boundary, "localhost-tooling");
        assert_eq!(surface.transport_status, "stdio-served");
        assert_eq!(surface.contract.source_endpoint, "/api/project-contract");
        assert_eq!(surface.project.name, "MCP Surface");
        assert!(resource_uris.contains(&"hyperwiki://project-contract"));
        assert!(resource_uris.contains(&"hyperwiki://verification-loops"));
        assert!(surface
            .resources
            .iter()
            .all(|resource| resource.read_only && resource.mime_type == "application/json"));
        assert!(tool_names.contains(&"get_project_contract"));
        assert!(tool_names.contains(&"prepare_review_workflow"));
        let prepare = surface
            .tools
            .iter()
            .find(|tool| tool.name == "prepare_review_workflow")
            .unwrap();
        assert!(!prepare.read_only);
        assert_eq!(prepare.maps_to["endpoint"], "/api/review-workflows/run");
        assert_eq!(prepare.maps_to["fixedBody"]["dryRun"], true);
        assert!(prepare.input_schema["properties"]["workflowId"]["enum"]
            .as_array()
            .unwrap()
            .contains(&json!("security-review")));
        let prompt = surface
            .tools
            .iter()
            .find(|tool| tool.name == "submit_agent_prompt")
            .unwrap();
        assert_eq!(prompt.requires_active_agent_session, Some(true));
        assert!(!prompt.read_only);
    }

    #[test]
    fn mcp_json_rpc_handles_read_only_resources_and_tools() {
        let root = temp_root("mcp-transport");
        make_project(&root, "MCP Transport");

        let initialized = handle_mcp_message(
            &root,
            JsonRpcMessage {
                jsonrpc: Some("2.0".to_string()),
                id: Some(json!(1)),
                method: Some("initialize".to_string()),
                params: json!({}),
            },
        )
        .unwrap();
        assert_eq!(initialized["result"]["serverInfo"]["name"], "hyperwiki");
        assert!(initialized["result"]["capabilities"]["resources"].is_object());

        let resources = handle_mcp_message(
            &root,
            JsonRpcMessage {
                jsonrpc: Some("2.0".to_string()),
                id: Some(json!(2)),
                method: Some("resources/list".to_string()),
                params: json!({}),
            },
        )
        .unwrap();
        assert!(resources["result"]["resources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|resource| resource["uri"] == "hyperwiki://current-plan"));

        let current_plan = handle_mcp_message(
            &root,
            JsonRpcMessage {
                jsonrpc: Some("2.0".to_string()),
                id: Some(json!(3)),
                method: Some("resources/read".to_string()),
                params: json!({ "uri": "hyperwiki://current-plan" }),
            },
        )
        .unwrap();
        assert_eq!(
            current_plan["result"]["contents"][0]["mimeType"],
            "application/json"
        );
        assert!(current_plan["result"]["contents"][0]["text"]
            .as_str()
            .unwrap()
            .contains("\"status\""));

        let tools = handle_mcp_message(
            &root,
            JsonRpcMessage {
                jsonrpc: Some("2.0".to_string()),
                id: Some(json!(4)),
                method: Some("tools/list".to_string()),
                params: json!({}),
            },
        )
        .unwrap();
        let names = tools["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert!(names.contains(&"get_project_contract"));
        assert!(!names.contains(&"submit_agent_prompt"));

        let called = handle_mcp_message(
            &root,
            JsonRpcMessage {
                jsonrpc: Some("2.0".to_string()),
                id: Some(json!(5)),
                method: Some("tools/call".to_string()),
                params: json!({ "name": "get_project_contract", "arguments": {} }),
            },
        )
        .unwrap();
        assert!(called["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("hyperwiki.project-contract"));

        let framed = frame_json_message(&called);
        assert!(framed.starts_with("Content-Length: "));
        assert!(framed.contains("\r\n\r\n"));
    }

    fn make_project(root: &Path, name: &str) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            serde_json::json!({
                "projectName": name,
                "agent": { "launchCommand": "codex --yolo" }
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            root.join("package.json"),
            serde_json::json!({
                "scripts": { "check": "node --check index.js" },
                "packageManager": "pnpm@10.33.3"
            })
            .to_string(),
        )
        .unwrap();
        fs::write(root.join("wiki").join("index.html"), "<h1>Home</h1>").unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.html"),
            "<h1>Plans</h1><section class=\"summary\"><ul><li>Current unit: Unit 01</li></ul></section>",
        )
        .unwrap();
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
}
