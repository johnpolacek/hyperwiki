export type ViewRoute =
  | { kind: "wiki"; path: string }
  | { kind: "projects" }
  | { kind: "new-project" }
  | { kind: "settings" };

export type CommandAction = "execute-main" | "execute-worktree" | "modify" | "review" | "new-plan";
export type AgentRunKind = "modify" | "execute" | "worktree" | "review" | "planning";
export type AgentRunPhase = "idle" | "starting" | "waiting" | "sent" | "exploring" | "editing" | "checking" | "complete" | "blocked";
export type ThinkingEffort = "low" | "medium" | "high" | "xhigh";

export type PendingExecuteAgentConfirmation = {
  candidateSession: SessionRecord;
  currentPage: string;
  prompt: string;
  scope: TerminalScope;
};

export interface SourceDocumentInput {
  name: string;
  documentType: string;
  content: string;
}

export interface WikiPage {
  title: string;
  path: string;
  summary?: string[];
  status?: string;
  currentState?: string;
  format?: "html" | "mdx";
  sourcePath?: string;
  frontmatter?: Record<string, string>;
  headings?: WikiHeading[];
  links?: WikiLink[];
  componentRefs?: WikiComponentRef[];
  validationWarnings?: WikiValidationWarning[];
}

export interface WikiHeading {
  level: number;
  text: string;
  anchor: string;
  line: number;
}

export interface WikiLink {
  href: string;
  label: string;
  line: number;
  targetPath?: string;
  resolved: boolean;
}

export interface WikiValidationWarning {
  kind: string;
  message: string;
  href?: string;
  line: number;
}

export interface WikiComponentRef {
  name: string;
  line: number;
  attributes: Record<string, string>;
}

export interface AgentRunState {
  id: string;
  kind: AgentRunKind;
  label: string;
  phase: AgentRunPhase;
  sessionId: string | null;
  activity: string;
  lines: string[];
  outcome: string;
  transcript: string;
  startedAt: number;
}

export interface PlanPageActionState {
  isPlanPage: boolean;
  isComplete: boolean;
  isStale: boolean;
  canExecute: boolean;
  currentPath: string;
  currentTitle: string;
  currentUnitLabel: string;
}

export interface WikiListResponse {
  pages?: WikiPage[];
}

export interface WikiFingerprintResponse {
  fingerprint: string;
  fileCount: number;
  latestModifiedMs?: number | null;
}

export interface WikiSourceResponse {
  path: string;
  source: string;
  markdown: string;
  status?: string;
  frontmatter?: Record<string, string>;
  headings?: WikiHeading[];
  links?: WikiLink[];
  componentRefs?: WikiComponentRef[];
  validationWarnings?: WikiValidationWarning[];
}

export interface WikiMarkdownZipDownloadResponse {
  filename: string;
  path: string;
  bytes: number;
  files?: Array<{ path: string; bytes: number }>;
  revealed: boolean;
  revealError?: string | null;
}

export interface WikiPlanDeletionResponse {
  path: string;
  deletedPaths?: string[];
}

export interface ProjectRecord {
  id: string;
  name: string;
  root: string;
  projectSlug: string;
  worktreeSlug: string;
  available?: boolean;
  active?: boolean;
  branch?: string;
  lastOpenedAt?: string | null;
  importPlanning?: ImportPlanningStatus;
}

export interface ProjectGroup {
  name: string;
  projectSlug: string;
  checkouts: ProjectRecord[];
}

export interface ProjectListResponse {
  activeProjectId?: string | null;
  projects?: ProjectRecord[];
  checkouts?: ProjectRecord[];
  projectGroups?: ProjectGroup[];
}

export interface WorkspaceResponse {
  status?: {
    stage?: string;
    current?: string;
    currentPath?: string;
    next?: string;
    completed?: string;
  };
  project?: ProjectRecord;
}

export interface ProjectCreateResponse {
  project: ProjectRecord;
  workspaceUrl?: string;
}

export interface ProjectRemoveResponse {
  project: ProjectRecord;
  deletedFiles?: boolean;
}

export interface ProjectEnvKey {
  name: string;
  present: boolean;
  source: string;
  maskedValue?: string;
}

export interface ProjectEnvResponse {
  projectRoot: string;
  envFile: string;
  exampleFile?: string | null;
  gitignoreFile: string;
  envFileExists: boolean;
  exampleFileExists: boolean;
  gitIgnored: boolean;
  keys: ProjectEnvKey[];
  suggestedKeys: ProjectEnvKey[];
}

export interface ProjectEnvEditorState {
  open: boolean;
  initialKey?: string;
  reason?: string;
}

export type ProjectEnvStatusTone = "neutral" | "success" | "error";

export interface AppPreviewResponse {
  url?: string;
  expectedUrl?: string;
  canStart?: boolean;
  running?: boolean;
  canStop?: boolean;
  canRestart?: boolean;
  reason?: string;
  startCommand?: string;
  status?: string;
  runningSource?: string;
  managedSession?: {
    id?: string;
    status?: string;
    pid?: number | null;
    processGroup?: number | null;
    conflictPid?: number | null;
    conflictProcessGroup?: number | null;
    stoppable?: boolean;
    attachable?: boolean;
  } | null;
  projectSlug?: string;
  worktreeSlug?: string;
}

export interface SettingsResponse {
  theme?: {
    activePreset?: string;
    presets?: Record<string, ThemePreset>;
    customTokens?: Record<string, Record<string, string>>;
  };
  soul?: {
    principles?: string[];
    interface?: string;
    agent?: string;
  };
  memory?: {
    entries?: MemoryEntry[];
  };
  notifications?: {
    terminalCompletion?: TerminalCompletionNotificationSettings;
  };
  agentCommand?: string;
  codexCommand?: string;
  claudeCommand?: string;
  browserCommand?: string;
  mcpEnabled?: boolean;
  [key: string]: unknown;
}

export type TerminalCompletionNotificationSettings = {
  enabled?: boolean;
  onlyWhenUnfocused?: boolean;
  sound?: boolean;
};

export interface ThemePreset {
  label?: string;
  mode?: string;
  tokens?: {
    ui?: Record<string, string>;
    docs?: Record<string, string>;
    terminal?: Record<string, string>;
  };
}

export interface MemoryEntry {
  id?: string;
  title?: string;
  content?: string;
  enabled?: boolean;
  updatedAt?: string;
}

export interface LayoutPanel {
  name: string;
  role: string;
  command?: string | null;
}

export interface LayoutResponse {
  panels?: LayoutPanel[];
  dev?: {
    command?: string;
    previewUrl?: string;
  };
  worktrees?: {
    workflow?: string;
    previewUrlPattern?: string;
  };
}

export interface RepoContextResponse {
  root?: string;
  git?: {
    root?: string | null;
    branch?: string;
    dirty?: boolean | null;
    worktree?: string;
  };
}

export interface WorktreeCreateResponse {
  branch?: string;
  slug?: string;
  path?: string;
  previewUrl?: string;
  workspaceUrl?: string;
  project?: ProjectRecord;
  install?: {
    ok?: boolean;
    message?: string;
  };
}

export interface SessionRecord {
  id: string;
  name?: string;
  kind?: string;
  status?: string;
  mode?: string;
  role?: string;
  command?: string | null;
  shell?: string | null;
  pid?: number | null;
  cwd?: string | null;
  scope?: string;
  scopeKind?: string;
  planPath?: string | null;
  visibility?: "visible" | "standby" | string;
  purpose?: "modify" | "general" | string | null;
  connectedClients?: number;
  retained?: boolean;
  reconnectable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type TerminalScope = {
  scope: string;
  scopeKind: string;
  planPath: string | null;
};

export interface SessionsResponse {
  sessions?: SessionRecord[];
}

export interface SessionResponse {
  session: SessionRecord;
}

export interface DroppedFilesResponse {
  files?: Array<{ name?: string; path?: string }>;
}

export type TerminalCompletionReason = "process-exit" | "agent-ready";

export interface TerminalCompletionEventPayload {
  sessionId: string;
  role?: string | null;
  name?: string | null;
  scope?: string | null;
  planPath?: string | null;
  reason: TerminalCompletionReason;
  exitCode?: number | null;
  completedAt?: string;
}

export interface TerminalStartResponse {
  session: SessionRecord;
  replay?: string;
}

export interface DevLifecycleResponse {
  session?: SessionRecord | null;
  replay?: string;
  preview?: AppPreviewResponse | null;
  stopped?: boolean;
}

export interface TerminalReplayResponse {
  sessionId: string;
  seq: number;
  bytes: number[];
}

export interface TerminalOutputEventPayload {
  sessionId: string;
  seq: number;
  bytes: number[];
}

export interface PlanningQuestion {
  id: string;
  sessionId: string;
  requestId?: string;
  batchId?: string;
  question: string;
  recommendedAnswer: string;
  reasoning: string;
  options: PlanningQuestionOption[];
}

export interface PlanningQuestionOption {
  label: string;
  description?: string;
}

export interface PlanningQuestionAnswer {
  question: PlanningQuestion;
  answer: string;
}

export interface ReviewWorkflow {
  id: string;
  label: string;
  scope: string;
  description: string;
  requiresAgent: boolean;
  resultBoundary: string;
  evidenceType: string;
}

export interface ReviewWorkflowResponse {
  workflows?: ReviewWorkflow[];
}

export interface ImportPlanningAnswer {
  id: string;
  answer: string;
}

export interface ImportPlanningQuestion {
  id: string;
  label: string;
  prompt: string;
  impact: string;
  rationale: string;
  recommendedAnswer?: string;
  options?: PlanningQuestionOption[];
}

export interface ImportPlanningResponse {
  ready: boolean;
  score: number;
  sourceSummary: string;
  recommendedPlanTitle: string;
  questions?: ImportPlanningQuestion[];
  unknowns?: string[];
  summary?: string;
}

export interface StagedArtifactRecord {
  virtualPath: string;
  intendedPath: string;
  contentHash: string;
  validationStatus: string;
  validationErrors: string[];
  commitStatus: string;
  committedAtMs?: number | null;
}

export interface ImportPlanningArtifactValidation {
  status: "valid" | "invalid" | string;
  stagedPath: string;
  artifacts: StagedArtifactRecord[];
  errors: string[];
  repairPrompt?: string | null;
  validatedAtMs: number;
}

export interface ImportPlanningStatus {
  status: "notImported" | "incomplete" | "complete" | "needsRepair";
  answeredCount: number;
  currentQuestion?: ImportPlanningQuestion | null;
  currentRequestId?: string | null;
  nextAction: string;
  qnaPath?: string | null;
  artifactValidation?: ImportPlanningArtifactValidation | null;
}

export interface CodexImportTurnResponse {
  ok: boolean;
  transport: "codex-app-server" | string;
  projectId: string;
  requestId: string;
  threadId: string;
  turnId: string;
  text: string;
  firstDeltaMs?: number | null;
  elapsedMs: number;
  planDetected: boolean;
  events: number;
  metrics?: CodexAdapterMetrics;
}

export interface ImportOnboardingEventRecord {
  seq: number;
  timestampMs: number;
  projectId: string;
  sessionId: string;
  runId: string;
  requestId: string;
  kind: string;
  phase: string;
  message: string;
  detail?: string | null;
}

export interface ImportOnboardingStatusResponse {
  ok: boolean;
  session: ImportOnboardingSessionRecord;
  activeRun?: ImportOnboardingRunRecord | null;
  currentQuestion?: ImportPlanningQuestion | null;
  importPlanning: ImportPlanningStatus;
  retryableFailure?: string | null;
  recentEvents?: ImportOnboardingEventRecord[];
  artifactValidation?: ImportPlanningArtifactValidation | null;
}

export interface ImportOnboardingPrewarmResponse {
  ok: boolean;
  projectId: string;
  providerReady: boolean;
  threadReady: boolean;
  threadId?: string | null;
  elapsedMs: number;
  error?: string | null;
}

export interface ImportPlanningReadyToPlan {
  type: "hyperwiki-ready-to-plan";
  requestId: string;
  reasoning: string;
  planIntent: string;
}

export interface CodexImportTurnStartResponse {
  ok: boolean;
  runId: string;
  sessionId?: string;
  status: "running" | string;
  projectId: string;
  requestId: string;
  run?: ImportOnboardingRunRecord | null;
}

export interface CodexImportTurnStatusResponse {
  ok: boolean;
  runId: string;
  sessionId?: string;
  status: "running" | "complete" | "failed" | "cancelled" | string;
  phase?: ImportPlanningProtocolPhase | string;
  session?: ImportOnboardingSessionRecord | null;
  run?: ImportOnboardingRunRecord | null;
  snapshot?: CodexImportTurnSnapshot | null;
  question?: PlanningQuestion | null;
  retryable?: boolean;
  response?: CodexImportTurnResponse | null;
  error?: string | null;
}

export type ImportPlanningProtocolPhase =
  | "starting"
  | "thread_ready"
  | "turn_requested"
  | "turn_started"
  | "waiting_for_first_event"
  | "waiting_for_assistant"
  | "exec_json_fallback"
  | "streaming"
  | "question_ready"
  | "ready_to_plan"
  | "schema_mismatch"
  | "stalled"
  | "complete"
  | "failed";
export type PlanningInterviewStatus = "idle" | "starting" | "waiting_for_question" | "streaming" | "schema_mismatch" | "stalled" | "failed" | "question_ready" | "answering";

export interface CodexImportTurnSnapshot {
  phase: ImportPlanningProtocolPhase | string;
  text: string;
  textTail: string;
  eventLog?: string[];
  events: number;
  firstDeltaMs?: number | null;
  lastEventMs?: number | null;
  elapsedMs: number;
  turnId: string;
  schemaError?: string | null;
  candidateCount: number;
  metrics?: CodexAdapterMetrics;
}

export interface CodexAdapterMetrics {
  providerReadyMs?: number | null;
  threadReadyMs?: number | null;
  turnRequestedMs?: number | null;
  firstEventMs?: number | null;
  firstDeltaMs?: number | null;
  completedMs?: number | null;
  elapsedMs?: number;
  events?: number;
}

export interface ImportOnboardingSessionRecord {
  projectId: string;
  sessionId: string;
  status: string;
  phase: string;
  currentRunId?: string | null;
  currentQuestionId?: string | null;
  repairAttempts?: number;
  planRepairAttempts?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ImportOnboardingRunRecord {
  projectId: string;
  sessionId: string;
  runId: string;
  providerRunId?: string | null;
  requestId: string;
  kind?: string;
  status: string;
  phase: string;
  retryable: boolean;
  startedAtMs: number;
  updatedAtMs: number;
  error?: string | null;
}
