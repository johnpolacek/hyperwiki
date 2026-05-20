use super::DomainSurface;
use serde::Serialize;
use serde_json::Value;
use std::path::Path;

pub fn surface() -> DomainSurface {
    DomainSurface {
        id: "reviews",
        node_reference: "src/server.js",
        responsibilities: &[
            "named review workflow discovery",
            "review prompt preparation",
            "dry-run review payloads",
            "review prompt routing to active agent sessions",
        ],
        parity_gate: "review-workflows smoke equivalent",
    }
}

#[derive(Debug, Clone, Copy)]
struct ReviewWorkflow {
    id: &'static str,
    label: &'static str,
    scope: &'static str,
    description: &'static str,
    evidence_type: &'static str,
    instructions: &'static [&'static str],
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewWorkflowView {
    pub id: &'static str,
    pub label: &'static str,
    pub scope: &'static str,
    pub description: &'static str,
    pub requires_agent: bool,
    pub result_boundary: &'static str,
    pub evidence_type: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewWorkflowSummary {
    pub version: u8,
    pub kind: &'static str,
    pub boundary: &'static str,
    pub source: &'static str,
    pub result_truth: &'static str,
    pub workflows: Vec<ReviewWorkflowView>,
    pub project: ReviewProject,
    pub plan: ReviewPlan,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReviewProject {
    pub name: String,
    pub root: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPlan {
    pub current: String,
    pub current_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReviewEvidence {
    #[serde(rename = "workflowId")]
    pub workflow_id: &'static str,
    pub status: String,
    pub boundary: &'static str,
    pub recorded: bool,
    #[serde(rename = "evidenceType")]
    pub evidence_type: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReviewRunResponse {
    pub ok: bool,
    pub sent: bool,
    pub workflow: ReviewWorkflowView,
    pub boundary: &'static str,
    pub evidence: ReviewEvidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<serde_json::Value>,
}

pub fn review_workflow_summary(root: impl AsRef<Path>) -> ReviewWorkflowSummary {
    let contract = crate::domain::verification::project_contract(root.as_ref());
    ReviewWorkflowSummary {
        version: 1,
        kind: "hyperwiki.review-workflows",
        boundary: "runtime-only-until-recorded",
        source: "built-in review workflow definitions plus the current project contract",
        result_truth: "Review findings are runtime evidence until a human or agent records them in wiki files or Git.",
        workflows: workflows().iter().map(review_workflow_view).collect(),
        project: ReviewProject {
            name: contract.project.name,
            root: contract.project.root.display().to_string(),
        },
        plan: ReviewPlan {
            current: contract.plan.status.current,
            current_path: contract.plan.current_path,
        },
    }
}

pub fn prepare_review_workflow(
    root: impl AsRef<Path>,
    workflow_id: &str,
    current_page: Option<&str>,
    dry_run: bool,
) -> Result<ReviewRunResponse, String> {
    let workflow = workflows()
        .iter()
        .find(|workflow| workflow.id == workflow_id)
        .copied()
        .ok_or_else(|| "Unknown review workflow.".to_string())?;
    let contract = crate::domain::verification::project_contract(root.as_ref());
    let current_page = current_page.unwrap_or_else(|| {
        if contract.plan.current_path.is_empty() {
            "/wiki/plans/index.html"
        } else {
            contract.plan.current_path.as_str()
        }
    });
    let prompt = review_workflow_prompt(&workflow, &contract, current_page);
    Ok(ReviewRunResponse {
        ok: true,
        sent: !dry_run,
        workflow: review_workflow_view(&workflow),
        boundary: "runtime-only-until-recorded",
        evidence: ReviewEvidence {
            workflow_id: workflow.id,
            status: if dry_run { "prepared" } else { "queued" }.to_string(),
            boundary: "runtime-evidence",
            recorded: false,
            evidence_type: workflow.evidence_type,
        },
        prompt: Some(prompt),
        session: None,
    })
}

pub fn response_with_session(mut response: ReviewRunResponse, session: Value) -> ReviewRunResponse {
    response.prompt = None;
    response.session = Some(session);
    response
}

fn review_workflow_view(workflow: &ReviewWorkflow) -> ReviewWorkflowView {
    ReviewWorkflowView {
        id: workflow.id,
        label: workflow.label,
        scope: workflow.scope,
        description: workflow.description,
        requires_agent: true,
        result_boundary: "runtime-evidence",
        evidence_type: workflow.evidence_type,
    }
}

fn review_workflow_prompt(
    workflow: &ReviewWorkflow,
    contract: &crate::domain::verification::ProjectContract,
    current_page: &str,
) -> String {
    let instructions = workflow
        .instructions
        .iter()
        .map(|instruction| format!("- {instruction}"))
        .collect::<Vec<_>>()
        .join("\n");
    [
        format!("Workflow: {}", workflow.label),
        format!("Workflow ID: {}", workflow.id),
        format!("Scope: {}", workflow.scope),
        format!("Current wiki page: {current_page}"),
        String::new(),
        "Project contract:".to_string(),
        contract.agent_context.clone(),
        String::new(),
        "Review instructions:".to_string(),
        instructions,
        String::new(),
        "Result boundary:".to_string(),
        "- Treat the review result as runtime evidence.".to_string(),
        "- Do not edit wiki files, commit, or change code unless the user explicitly asks you to act on a finding.".to_string(),
        "- If a finding should become durable project knowledge, say exactly where it should be recorded.".to_string(),
    ]
    .join("\n")
}

fn workflows() -> &'static [ReviewWorkflow] {
    &[
        ReviewWorkflow {
            id: "diff-review",
            label: "Diff Review",
            scope: "changed-files",
            description: "Review the current Git diff for behavioral regressions, missing edge cases, accidental churn, and commit readiness.",
            evidence_type: "review.findings.diff",
            instructions: &[
                "Inspect the current Git diff and repo status before giving findings.",
                "Prioritize bugs, regressions, unintended behavior changes, and missing tests.",
                "Report findings first with file and line references where possible.",
                "Call out whether the changes look ready to commit after verification.",
            ],
        },
        ReviewWorkflow {
            id: "architecture-review",
            label: "Architecture Consistency Review",
            scope: "project-architecture",
            description: "Check whether the current work matches the documented wiki architecture, source briefs, plan intent, and existing code patterns.",
            evidence_type: "review.findings.architecture",
            instructions: &[
                "Compare the current implementation against the active plan, source briefs, and nearby code patterns.",
                "Identify drift from documented architecture, duplicated concepts, misplaced responsibilities, or unclear boundaries.",
                "Prefer small corrective changes that preserve the existing system shape.",
                "Name any plan or source page that needs a durable update.",
            ],
        },
        ReviewWorkflow {
            id: "security-review",
            label: "Security Review",
            scope: "trust-boundaries",
            description: "Review localhost tooling trust boundaries, filesystem access, terminal handoff behavior, user input handling, and runtime state.",
            evidence_type: "review.findings.security",
            instructions: &[
                "Focus on concrete security risks in the changed behavior and exposed local endpoints.",
                "Check trust boundaries around files, credentials, environment variables, terminal sessions, runtime state, and generated prompts.",
                "Separate confirmed issues from theoretical concerns.",
                "Recommend minimal mitigations and tests for each confirmed issue.",
            ],
        },
        ReviewWorkflow {
            id: "test-gap-review",
            label: "Test Gap Review",
            scope: "verification-coverage",
            description: "Find missing automated or manual verification coverage for the current plan, changed code paths, and user-visible workflows.",
            evidence_type: "review.findings.test-gaps",
            instructions: &[
                "Map the active plan acceptance criteria to existing checks and smoke tests.",
                "Identify important paths that are untested or only manually tested.",
                "Recommend focused tests or manual verification loops, avoiding broad low-value coverage.",
                "Call out any known failing smoke coverage separately from new gaps.",
            ],
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn summarizes_review_workflows_with_project_context() {
        let root = temp_root("reviews-summary");
        make_project(&root);
        let summary = review_workflow_summary(&root);
        assert_eq!(summary.version, 1);
        assert_eq!(summary.kind, "hyperwiki.review-workflows");
        assert_eq!(summary.project.name, "Review Test");
        assert!(summary
            .workflows
            .iter()
            .any(|workflow| workflow.id == "security-review"));
    }

    #[test]
    fn prepares_review_prompt_with_runtime_evidence_boundary() {
        let root = temp_root("reviews-prepare");
        make_project(&root);
        let prepared = prepare_review_workflow(
            &root,
            "security-review",
            Some("/wiki/plans/index.html"),
            true,
        )
        .unwrap();
        assert!(!prepared.sent);
        assert_eq!(prepared.evidence.status, "prepared");
        let prompt = prepared.prompt.unwrap();
        assert!(prompt.contains("Workflow: Security Review"));
        assert!(prompt.contains("Project: Review Test"));
        assert!(prompt.contains("Current plan:"));
        assert!(prompt.contains("Verification loops:"));
        assert!(prompt.contains(
            "Do not edit wiki files, commit, or change code unless the user explicitly asks"
        ));
    }

    fn make_project(root: &Path) {
        fs::create_dir_all(root.join(".hyperwiki")).unwrap();
        fs::create_dir_all(root.join("wiki").join("plans")).unwrap();
        fs::write(
            root.join(".hyperwiki").join("config.json"),
            "{\"projectName\":\"Review Test\"}",
        )
        .unwrap();
        fs::write(root.join("wiki").join("index.html"), "<h1>Home</h1>").unwrap();
        fs::write(
            root.join("wiki").join("plans").join("index.html"),
            "<h1>Plans</h1><section class=\"summary\"><ul><li>Status: active</li></ul></section>",
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
