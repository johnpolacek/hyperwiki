import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Command,
  Download,
  ExternalLink,
  FolderPlus,
  FolderOpen,
  FolderGit2,
  GitBranch,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { MdxPlanRenderer } from "@/components/MdxPlanRenderer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { GridBeam, type GridBeamColorScheme, type GridBeamPaletteKey } from "@/components/ui/grid-beam";
import { hyperwikiApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { normalizePlanDisplayTitle } from "@/lib/wiki-title";

type ViewRoute =
  | { kind: "wiki"; path: string }
  | { kind: "projects" }
  | { kind: "new-project" }
  | { kind: "settings" };

type CommandAction = "execute-main" | "execute-worktree" | "modify" | "review" | "new-plan";
type AgentRunKind = "modify" | "execute" | "worktree" | "review" | "planning";
type AgentRunPhase = "idle" | "starting" | "waiting" | "sent" | "exploring" | "editing" | "checking" | "complete" | "blocked";
type ThinkingEffort = "low" | "medium" | "high" | "xhigh";

type PendingExecuteAgentConfirmation = {
  candidateSession: SessionRecord;
  currentPage: string;
  prompt: string;
  scope: TerminalScope;
};

interface SourceDocumentInput {
  name: string;
  documentType: string;
  content: string;
}

const DISABLE_TEXT_CORRECTION_PROPS = {
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;
const PROJECT_ENV_AUTOSAVE_DELAY_MS = 900;
const THEME_AUTOSAVE_DELAY_MS = 350;
const RUNTIME_ENV_KEY_HINT_DENYLIST = new Set(["PORTLESS_URL"]);
const GridBeamRuntimeContext = createContext<{ prefersReducedMotion: boolean; theme: GridBeamColorScheme }>({
  prefersReducedMotion: false,
  theme: "light",
});

interface WikiPage {
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

interface WikiHeading {
  level: number;
  text: string;
  anchor: string;
  line: number;
}

interface WikiLink {
  href: string;
  label: string;
  line: number;
  targetPath?: string;
  resolved: boolean;
}

interface WikiValidationWarning {
  kind: string;
  message: string;
  href?: string;
  line: number;
}

interface WikiComponentRef {
  name: string;
  line: number;
  attributes: Record<string, string>;
}

interface AgentRunState {
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

interface PlanPageActionState {
  isPlanPage: boolean;
  isComplete: boolean;
  isStale: boolean;
  canExecute: boolean;
  currentPath: string;
  currentTitle: string;
  currentUnitLabel: string;
}

interface WikiListResponse {
  pages?: WikiPage[];
}

interface WikiFingerprintResponse {
  fingerprint: string;
  fileCount: number;
  latestModifiedMs?: number | null;
}

interface WikiSourceResponse {
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

interface WikiMarkdownZipDownloadResponse {
  filename: string;
  path: string;
  bytes: number;
  files?: Array<{ path: string; bytes: number }>;
  revealed: boolean;
  revealError?: string | null;
}

interface WikiPlanDeletionResponse {
  path: string;
  deletedPaths?: string[];
}

interface ProjectRecord {
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

interface ProjectGroup {
  name: string;
  projectSlug: string;
  checkouts: ProjectRecord[];
}

interface ProjectListResponse {
  activeProjectId?: string | null;
  projects?: ProjectRecord[];
  checkouts?: ProjectRecord[];
  projectGroups?: ProjectGroup[];
}

interface WorkspaceResponse {
  status?: {
    stage?: string;
    current?: string;
    currentPath?: string;
    next?: string;
    completed?: string;
  };
  project?: ProjectRecord;
}

interface ProjectCreateResponse {
  project: ProjectRecord;
  workspaceUrl?: string;
}

interface ProjectRemoveResponse {
  project: ProjectRecord;
  deletedFiles?: boolean;
}

interface ProjectEnvKey {
  name: string;
  present: boolean;
  source: string;
  maskedValue?: string;
}

interface ProjectEnvResponse {
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

interface ProjectEnvEditorState {
  open: boolean;
  initialKey?: string;
  reason?: string;
}

type ProjectEnvStatusTone = "neutral" | "success" | "error";

interface AppPreviewResponse {
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

interface SettingsResponse {
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

type TerminalCompletionNotificationSettings = {
  enabled?: boolean;
  onlyWhenUnfocused?: boolean;
  sound?: boolean;
};

interface ThemePreset {
  label?: string;
  mode?: string;
  tokens?: {
    ui?: Record<string, string>;
    docs?: Record<string, string>;
    terminal?: Record<string, string>;
  };
}

interface MemoryEntry {
  id?: string;
  title?: string;
  content?: string;
  enabled?: boolean;
  updatedAt?: string;
}

interface LayoutPanel {
  name: string;
  role: string;
  command?: string | null;
}

interface LayoutResponse {
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

interface RepoContextResponse {
  root?: string;
  git?: {
    root?: string | null;
    branch?: string;
    dirty?: boolean | null;
    worktree?: string;
  };
}

interface WorktreeCreateResponse {
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

interface SessionRecord {
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

type TerminalScope = {
  scope: string;
  scopeKind: string;
  planPath: string | null;
};

interface SessionsResponse {
  sessions?: SessionRecord[];
}

interface SessionResponse {
  session: SessionRecord;
}

interface DroppedFilesResponse {
  files?: Array<{ name?: string; path?: string }>;
}

type TerminalCompletionReason = "process-exit" | "agent-ready";

interface TerminalCompletionEventPayload {
  sessionId: string;
  role?: string | null;
  name?: string | null;
  scope?: string | null;
  planPath?: string | null;
  reason: TerminalCompletionReason;
  exitCode?: number | null;
  completedAt?: string;
}

interface TerminalStartResponse {
  session: SessionRecord;
  replay?: string;
}

interface DevLifecycleResponse {
  session?: SessionRecord | null;
  replay?: string;
  preview?: AppPreviewResponse | null;
  stopped?: boolean;
}

interface TerminalReplayResponse {
  sessionId: string;
  seq: number;
  bytes: number[];
}

interface TerminalOutputEventPayload {
  sessionId: string;
  seq: number;
  bytes: number[];
}

interface PlanningQuestion {
  id: string;
  sessionId: string;
  requestId?: string;
  batchId?: string;
  question: string;
  recommendedAnswer: string;
  reasoning: string;
  options: PlanningQuestionOption[];
}

interface PlanningQuestionOption {
  label: string;
  description?: string;
}

interface PlanningQuestionAnswer {
  question: PlanningQuestion;
  answer: string;
}

interface ReviewWorkflow {
  id: string;
  label: string;
  scope: string;
  description: string;
  requiresAgent: boolean;
  resultBoundary: string;
  evidenceType: string;
}

interface ReviewWorkflowResponse {
  workflows?: ReviewWorkflow[];
}

interface ImportPlanningAnswer {
  id: string;
  answer: string;
}

interface ImportPlanningQuestion {
  id: string;
  label: string;
  prompt: string;
  impact: string;
  rationale: string;
  recommendedAnswer?: string;
  options?: PlanningQuestionOption[];
}

interface ImportPlanningResponse {
  ready: boolean;
  score: number;
  sourceSummary: string;
  recommendedPlanTitle: string;
  questions?: ImportPlanningQuestion[];
  unknowns?: string[];
  summary?: string;
}

interface StagedArtifactRecord {
  virtualPath: string;
  intendedPath: string;
  contentHash: string;
  validationStatus: string;
  validationErrors: string[];
  commitStatus: string;
  committedAtMs?: number | null;
}

interface ImportPlanningArtifactValidation {
  status: "valid" | "invalid" | string;
  stagedPath: string;
  artifacts: StagedArtifactRecord[];
  errors: string[];
  repairPrompt?: string | null;
  validatedAtMs: number;
}

interface ImportPlanningStatus {
  status: "notImported" | "incomplete" | "complete" | "needsRepair";
  answeredCount: number;
  currentQuestion?: ImportPlanningQuestion | null;
  currentRequestId?: string | null;
  nextAction: string;
  qnaPath?: string | null;
  artifactValidation?: ImportPlanningArtifactValidation | null;
}

interface CodexImportTurnResponse {
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

interface ImportOnboardingEventRecord {
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

interface ImportOnboardingStatusResponse {
  ok: boolean;
  session: ImportOnboardingSessionRecord;
  activeRun?: ImportOnboardingRunRecord | null;
  currentQuestion?: ImportPlanningQuestion | null;
  importPlanning: ImportPlanningStatus;
  retryableFailure?: string | null;
  recentEvents?: ImportOnboardingEventRecord[];
  artifactValidation?: ImportPlanningArtifactValidation | null;
}

interface ImportOnboardingPrewarmResponse {
  ok: boolean;
  projectId: string;
  providerReady: boolean;
  threadReady: boolean;
  threadId?: string | null;
  elapsedMs: number;
  error?: string | null;
}

interface ImportPlanningReadyToPlan {
  type: "hyperwiki-ready-to-plan";
  requestId: string;
  reasoning: string;
  planIntent: string;
}

interface CodexImportTurnStartResponse {
  ok: boolean;
  runId: string;
  sessionId?: string;
  status: "running" | string;
  projectId: string;
  requestId: string;
  run?: ImportOnboardingRunRecord | null;
}

interface CodexImportTurnStatusResponse {
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

type ImportPlanningProtocolPhase =
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
type PlanningInterviewStatus = "idle" | "starting" | "waiting_for_question" | "streaming" | "schema_mismatch" | "stalled" | "failed" | "question_ready" | "answering";

interface CodexImportTurnSnapshot {
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

interface CodexAdapterMetrics {
  providerReadyMs?: number | null;
  threadReadyMs?: number | null;
  turnRequestedMs?: number | null;
  firstEventMs?: number | null;
  firstDeltaMs?: number | null;
  completedMs?: number | null;
  elapsedMs?: number;
  events?: number;
}

interface ImportOnboardingSessionRecord {
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

interface ImportOnboardingRunRecord {
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

class ImportPlanningProtocolError extends Error {
  phase: "schema_mismatch" | "stalled" | "failed";
  tail: string;

  constructor(phase: "schema_mismatch" | "stalled" | "failed", message: string, tail = "") {
    super(message);
    this.name = "ImportPlanningProtocolError";
    this.phase = phase;
    this.tail = tail;
  }
}

const defaultWikiPath = "/wiki/plans/index.mdx";
const importLogStorageKey = "hyperwiki.importLog";
const importPlanningWorkstreamLimit = 1000;
const defaultThinkingEffort: ThinkingEffort = "low";
const thinkingEffortStorageKey = "hyperwiki.thinkingEffort";
const generalAgentPrewarmTarget = 2;
const modifyAgentPrewarmTarget = 1;
const prewarmAgentReadinessAttempts = 80;
const generalAgentPrewarmRefillDelayMs = 1500;
const terminalXtermScrollback = 100000;

function App() {
  const [route, setRoute] = useState<ViewRoute>(() => routeFromLocation());
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
  const [wikiHtml, setWikiHtml] = useState("");
  const [wikiSource, setWikiSource] = useState<WikiSourceResponse | null>(null);
  const [wikiError, setWikiError] = useState("");
  const [isWikiLoading, setIsWikiLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectListResponse>({});
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [pendingImportProject, setPendingImportProject] = useState<ProjectRecord | null>(() => readPendingImportProject());
  const [unavailableProjectIds, setUnavailableProjectIds] = useState<Set<string>>(() => new Set());
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [preview, setPreview] = useState<AppPreviewResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [layout, setLayout] = useState<LayoutResponse | null>(null);
  const [repoContext, setRepoContext] = useState<RepoContextResponse | null>(null);
  const [reviewWorkflows, setReviewWorkflows] = useState<ReviewWorkflow[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(defaultThinkingEffort);
  const [agentProviders, setAgentProviders] = useState<AgentProviderAvailability>({ codexAvailable: false, claudeAvailable: false });
  const [activePlanningQuestion, setActivePlanningQuestion] = useState<PlanningQuestion | null>(null);
  const [activePlanningQuestions, setActivePlanningQuestions] = useState<PlanningQuestion[]>([]);
  const [planningInterviewStatus, setPlanningInterviewStatus] = useState<PlanningInterviewStatus>("idle");
  const [lastPlanningAnswer, setLastPlanningAnswer] = useState("");
  const [planningActivity, setPlanningActivity] = useState("");
  const [planningWorkstream, setPlanningWorkstream] = useState<string[]>([]);
  const [activeImportPlanningRun, setActiveImportPlanningRun] = useState<ImportOnboardingRunRecord | null>(null);
  const [isWikiExporting, setIsWikiExporting] = useState(false);
  const [wikiExportStatus, setWikiExportStatus] = useState("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [projectEnvEditor, setProjectEnvEditor] = useState<ProjectEnvEditorState>({ open: false });
  const [terminalEnvHint, setTerminalEnvHint] = useState<{ key: string; sessionId: string } | null>(null);
  const [isUpNextOpen, setIsUpNextOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [agentRun, setAgentRun] = useState<AgentRunState | null>(null);
  const [pendingExecuteAgentConfirmation, setPendingExecuteAgentConfirmation] = useState<PendingExecuteAgentConfirmation | null>(null);
  const prewarmingModifySessions = useRef<Set<string>>(new Set());
  const prewarmingGeneralSessions = useRef<Set<string>>(new Set());
  const generalPrewarmRefillTimers = useRef<Map<string, number>>(new Map());
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);
  const [resumedImportPlanningProjectId, setResumedImportPlanningProjectId] = useState<string | null>(null);
  const baseDataRequestId = useRef(0);
  const projectDataRequestId = useRef(0);
  const requestedProjectDataId = useRef("");
  const lastImportPlanningDiagnostic = useRef("");
  const importedPlanningRuns = useRef(new Map<string, Promise<void>>());
  const importedPlanningCompletedKeys = useRef(new Set<string>());
  const activeImportPlanningTurn = useRef<{ projectId: string; requestId: string; runId?: string; sessionId: string } | null>(null);
  const importTurnSnapshotLineKeys = useRef(new Set<string>());
  const importQuestionScripts = useRef(new Map<string, PlanningQuestion[]>());
  const planningQuestionBuffers = useRef(new Map<string, string>());
  const answeredPlanningQuestionIds = useRef(new Set<string>());
  const loggedPlanningQuestionIds = useRef(new Set<string>());
  const armedAgentCompletions = useRef(new Map<string, { minPromptIndex: number; label: string; planPath: string | null }>());
  const notifiedTerminalCompletions = useRef(new Set<string>());
  const latestNotificationSettings = useRef<SettingsResponse["notifications"] | null>(null);
  const latestSessionsRef = useRef<SessionRecord[]>([]);
  const latestActiveProjectRef = useRef<ProjectRecord | null>(null);
  const latestPreviewRef = useRef<AppPreviewResponse | null>(null);
  const latestWikiPagesRef = useRef<WikiPage[]>([]);
  const wikiFingerprintRef = useRef("");
  const wikiRefreshInFlight = useRef(false);
  const latestTerminalContext = useRef<{ projectId: string; scope: string }>({ projectId: "", scope: "" });

  const currentWikiPath = route.kind === "wiki" ? route.path : defaultWikiPath;
  const terminalScope = useMemo(() => scopeForRoute(route), [route]);
  latestTerminalContext.current = { projectId: activeProject?.id || "", scope: normalizeTerminalScope(terminalScope).scope };
  const sidebarModel = useMemo(() => buildSidebarModel(wikiPages), [wikiPages]);
  const projectGroups = useMemo(() => normalizeProjectGroups(projects, unavailableProjectIds), [projects, unavailableProjectIds]);
  const hasRegisteredProjects = projectGroups.length > 0;
  const workspaceSelection = workspaceSelectionFromLocation();
  const isPendingImportRoute = Boolean(route.kind === "wiki" && pendingImportProject && matchesWorkspaceSelection(pendingImportProject, workspaceSelection));
  const importPlanningState = useMemo(() => importedPlanningState(route, wikiPages), [route, wikiPages]);
  const isImportedPlanningActive = isImportedPlanningIntakeRoute(route, wikiPages);
  const isImportPlanningStarting = route.kind === "wiki"
    && route.path === defaultWikiPath
    && Boolean(activeProject)
    && planningInterviewStatus !== "idle"
    && !hasGeneratedPlanPages(wikiPages);
  const isImportPlanningResume = route.kind === "wiki"
    && route.path === defaultWikiPath
    && Boolean(activeProject)
    && resumedImportPlanningProjectId === activeProject?.id
    && isIncompleteImportProject(activeProject)
    && !hasGeneratedPlanPages(wikiPages);
  const isImportPlanningView = false;
  const canResumeImportPlanning = route.kind === "wiki"
    && route.path === defaultWikiPath
    && Boolean(activeProject)
    && isIncompleteImportProject(activeProject)
    && hasImportedSource(wikiPages)
    && !hasGeneratedPlanPages(wikiPages);
  const activePlanState = useMemo(() => planPageActionState(currentWikiPath, wikiPages), [currentWikiPath, wikiPages]);
  const activePlanScopeComplete = useMemo(() => planScopeIsComplete(terminalScope, wikiPages), [terminalScope.scope, terminalScope.scopeKind, terminalScope.planPath, wikiPages]);

  useEffect(() => {
    latestNotificationSettings.current = settings?.notifications || null;
  }, [settings?.notifications]);

  useEffect(() => {
    latestSessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    latestActiveProjectRef.current = activeProject;
  }, [activeProject]);

  useEffect(() => {
    latestPreviewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    latestWikiPagesRef.current = wikiPages;
  }, [wikiPages]);

  useEffect(() => {
    let disposed = false;
    hyperwikiApi
      .json<AgentProviderAvailability>("/api/agent-providers")
      .then((providers) => {
        if (!disposed) setAgentProviders(providers);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    listenTerminalCompletion((payload) => {
      void notifyTerminalCompletion(payload);
      void loadSessions();
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch((error) => appendImportLog("Terminal completion listener unavailable", error));
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    applyAppTheme(settings?.theme);
  }, [settings?.theme]);

  useEffect(() => {
    window.localStorage.removeItem(thinkingEffortStorageKey);
  }, []);

  useEffect(() => {
    function onPopState() {
      appendImportLog(`Popstate route=${window.location.pathname}${window.location.hash || ""}`);
      setRoute(routeFromLocation());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; path?: string } | null;
      if (!data || data.type !== "hyperwiki:navigate" || !data.path?.startsWith("/wiki/")) return;
      appendImportLog(`Iframe wiki navigation path=${data.path} activeProject=${activeProject?.id || "none"}`);
      navigate({ kind: "wiki", path: data.path });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activeProject]);

  useEffect(() => {
    if (pendingImportProject || window.location.pathname.startsWith("/workspace/") || readImportLog().length) {
      appendImportLog(`App boot route=${window.location.pathname}${window.location.hash || ""} pending=${pendingImportProject ? `${pendingImportProject.projectSlug}/${pendingImportProject.worktreeSlug}` : "none"}`);
    }
    void loadBaseData();
  }, []);

  useEffect(() => {
    if (!hasLoadedProjects || hasRegisteredProjects || activeProject || route.kind !== "wiki") return;
    if (window.location.pathname.startsWith("/workspace/")) {
      appendImportLog(`Holding workspace route while project registry catches up: route=${window.location.pathname}${window.location.hash || ""}`);
      return;
    }
    if (isPendingImportRoute) {
      appendImportLog("Holding workspace route for pending import; not redirecting to New Project");
      return;
    }
    appendImportLog(`Redirecting to New Project: hasLoadedProjects=${hasLoadedProjects} hasRegisteredProjects=${hasRegisteredProjects} activeProject=none route=${window.location.pathname}${window.location.hash || ""}`);
    setRoute({ kind: "new-project" });
    window.history.replaceState(null, "", "/projects/new");
  }, [activeProject?.id, hasLoadedProjects, hasRegisteredProjects, isPendingImportRoute, route.kind]);

  useEffect(() => {
    if (route.kind !== "wiki" || route.path !== "/wiki/plans/index.mdx") return;
    const diagnostic = JSON.stringify({
      project: activeProject?.id || "none",
      importedSource: importPlanningState.hasImportedSource,
      generatedPlanCount: importPlanningState.generatedPlanPaths.length,
      generatedPlanPaths: importPlanningState.generatedPlanPaths,
      qnaIntake: importPlanningState.isIntake,
      wikiPageCount: wikiPages.length,
    });
    if (lastImportPlanningDiagnostic.current === diagnostic) return;
    lastImportPlanningDiagnostic.current = diagnostic;
    appendImportLog(`Planning intake state ${diagnostic}`);
  }, [activeProject?.id, importPlanningState, route, wikiPages.length]);

  useEffect(() => {
    if (!activeProject || !hasLoadedProjects) return;
    if (requestedProjectDataId.current === activeProject.id) return;
    requestedProjectDataId.current = activeProject.id;
    setWikiPages([]);
    setWikiHtml("");
    setWikiSource(null);
    setWikiError("");
    appendImportLog(`Hydrating active project data project=${activeProject.id}`);
    void loadProjectData(activeProject);
  }, [activeProject?.id, hasLoadedProjects]);

  useEffect(() => {
    if (route.kind !== "wiki" || route.path !== defaultWikiPath) return;
    if (hasExplicitWikiRouteLocation()) return;
    if (isImportedPlanningActive) return;
    const landingPath = planLandingPath(wikiPages);
    if (!landingPath || landingPath === defaultWikiPath) return;
    const nextRoute: ViewRoute = { kind: "wiki", path: landingPath };
    setRoute(nextRoute);
    window.history.replaceState(null, "", urlForRoute(nextRoute, activeProject));
  }, [activeProject, isImportedPlanningActive, route, wikiPages, workspace]);

  useEffect(() => {
    if (!activeProject || !isImportedPlanningActive) return;
    if (!activePlanningQuestion && activeProject.importPlanning?.status === "incomplete" && activeProject.importPlanning.currentQuestion) {
      setPlanningQuestions([importPlanningQuestionToPlanningQuestion(activeProject.importPlanning.currentQuestion)]);
      setPlanningInterviewStatus("question_ready");
      setPlanningActivity(activeProject.importPlanning.nextAction);
      return;
    }
    if (!["starting", "waiting_for_question", "streaming", "answering"].includes(planningInterviewStatus)) return;
    let cancelled = false;
    const project = activeProject;
    const poll = async () => {
      const [wikiResult, projectsResult, workspaceResult] = await Promise.allSettled([
        hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", project)),
        hyperwikiApi.json<ProjectListResponse>(withProjectQuery("/api/projects", project)),
        hyperwikiApi.json<WorkspaceResponse>(withProjectQuery("/api/workspace", project)),
      ]);
      if (cancelled) return;
      const pages = wikiResult.status === "fulfilled" ? wikiResult.value.pages || [] : [];
      if (wikiResult.status === "fulfilled") setWikiPages(pages);
      let selectedProject = project;
      if (projectsResult.status === "fulfilled") {
        setProjects(projectsResult.value);
        selectedProject = findActiveProject(projectsResult.value, unavailableProjectIds, {
          projectSlug: project.projectSlug,
          worktreeSlug: project.worktreeSlug,
        }) || project;
        setActiveProject(selectedProject);
      }
      if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
      const planning = importedPlanningState({ kind: "wiki", path: "/wiki/plans/index.mdx" }, pages);
      const completed = importPlanArtifactsAreComplete(selectedProject, planning.generatedPlanPaths);
      if (selectedProject.importPlanning?.status === "needsRepair") {
        appendImportLog(`Imported Q&A generated plan needs repair project=${project.id} errors=${selectedProject.importPlanning.artifactValidation?.errors.length || 0}`);
        setPlanningInterviewStatus("failed");
        setPlanningActivity(selectedProject.importPlanning.nextAction);
        setPlanningWorkstream(importArtifactValidationLines(selectedProject.importPlanning));
        setStatus("Imported project plan needs repair");
        return;
      }
      if (!completed) return;
      appendImportLog(`Imported Q&A completion detected project=${project.id} generatedPlanCount=${planning.generatedPlanPaths.length}`);
      importedPlanningCompletedKeys.current.add(`${project.id}:import-qna`);
      clearPlanningQuestions();
      setPlanningInterviewStatus("idle");
      setPlanningActivity("Generated MVP plan is ready.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Generated MVP plan is ready."]));
      setStatus("Imported project plan created");
      const nextPath = importCompletionLandingPath(
        workspaceResult.status === "fulfilled" ? workspaceResult.value : null,
        planning.generatedPlanPaths,
      );
      if (route.kind === "wiki" && route.path !== nextPath) {
        const nextRoute: ViewRoute = { kind: "wiki", path: nextPath };
        setRoute(nextRoute);
        window.history.replaceState(null, "", urlForRoute(nextRoute, selectedProject));
      }
    };
    void poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeProject?.id, currentWikiPath, isImportedPlanningActive, planningInterviewStatus, route.kind, unavailableProjectIds]);

  useEffect(() => {
    if (route.kind !== "wiki") return;
    if (hasLoadedProjects && !hasRegisteredProjects && !activeProject) return;
    if (hasLoadedProjects && !activeProject) return;
    let cancelled = false;
    setIsWikiLoading(true);
    setWikiError("");
    const request = isReactRenderedMdxPath(route.path)
      ? hyperwikiApi.json<WikiSourceResponse>(withProjectQuery(`/api/wiki/source?path=${encodeURIComponent(route.path)}`, activeProject))
      : hyperwikiApi.text(wikiRequestPath(route.path, activeProject));
    request
      .then((result) => {
        if (cancelled) return;
        if (typeof result === "string") {
          setWikiHtml(result);
          setWikiSource(null);
        } else {
          setWikiHtml("");
          setWikiSource(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWikiHtml("");
          setWikiSource(null);
          setWikiError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsWikiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route, activeProject, hasLoadedProjects, hasRegisteredProjects]);

  useEffect(() => {
    wikiFingerprintRef.current = "";
    if (!hasLoadedProjects || (hasRegisteredProjects && !activeProject)) return;
    void checkWikiFingerprint("project-change");
  }, [activeProject?.id, hasLoadedProjects, hasRegisteredProjects]);

  useEffect(() => {
    const shouldMonitor = sessions.some((session) => isAgentSession(session) && isLiveTerminalSession(session))
      && route.kind === "wiki";
    if (!shouldMonitor) return;
    void checkWikiFingerprint("agent-monitor-start");
    const timer = window.setInterval(() => {
      void checkWikiFingerprint("agent-monitor");
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeProject?.id, route.kind, sessions]);

  useEffect(() => {
    function handleFocusRefresh() {
      void checkWikiFingerprint("focus");
    }
    function handleVisibilityRefresh() {
      if (document.visibilityState === "visible") void checkWikiFingerprint("visibility");
    }
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    return () => {
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [activeProject?.id, route]);

  useEffect(() => {
    if (!wikiError || !activeProject || !isMissingFileError(wikiError)) return;
    setStatus("Active project is unavailable");
    setUnavailableProjectIds((current) => new Set(current).add(activeProject.id));
    setActiveProject(null);
    setWikiError("");
    setWikiHtml("");
  }, [wikiError, activeProject]);

  useEffect(() => {
    if (!pendingImportProject || activeProject || route.kind !== "wiki") return;
    if (!matchesWorkspaceSelection(pendingImportProject, workspaceSelectionFromLocation())) return;
    appendImportLog(`Pending import poll started for ${pendingImportProject.projectSlug}/${pendingImportProject.worktreeSlug}`);
    let cancelled = false;
    const poll = async () => {
      try {
        const projectsResult = await hyperwikiApi.json<ProjectListResponse>("/api/projects");
        if (cancelled) return;
        setProjects(projectsResult);
        const records = allProjectRecords(projectsResult);
        console.info("[hyperwiki] import ui pending poll", {
          wanted: `${pendingImportProject.projectSlug}/${pendingImportProject.worktreeSlug}`,
          records: records.map((project) => `${project.projectSlug}/${project.worktreeSlug}:${project.id}`),
        });
        const project = findActiveProject(projectsResult, unavailableProjectIds, {
          projectSlug: pendingImportProject.projectSlug,
          worktreeSlug: pendingImportProject.worktreeSlug,
        });
        if (!project) return;
        appendImportLog(`Pending import found project ${project.id}`);
        clearPendingImportProject();
        setPendingImportProject(null);
        setActiveProject(project);
        setStatus("Imported project ready");
        void startTerminalImportPlanning(project, "pending-import");
      } catch (error) {
        console.warn("[hyperwiki] import ui pending poll failed", error);
      }
    };
    void poll();
    const timer = window.setInterval(poll, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeProject, pendingImportProject, route.kind, unavailableProjectIds]);

  useEffect(() => {
    if (hasLoadedProjects && !activeProject) {
      setSessions([]);
      setActiveSessionId(null);
      setIsSessionsLoading(false);
      return;
    }
    void loadSessions();
  }, [activeProject?.id, hasLoadedProjects]);

  useEffect(() => {
    if (!activeProject) return;
    if (!sessions.some((session) => isLiveTerminalSession(session))) return;
    const timer = window.setInterval(() => {
      void loadSessions();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeProject?.id, sessions]);

  useEffect(() => {
    if (!activeProject || terminalScope.scopeKind !== "plan" || activePlanScopeComplete || isImportedPlanningActive) return;
    if (agentRun && agentRun.phase !== "complete" && agentRun.phase !== "blocked") return;
    const project = activeProject;
    const projectLayout = layout;
    const scope = terminalScope;
    const knownSessions = sessions;
    const timer = window.setTimeout(() => {
      void prewarmAgentSessionsForScope(project, projectLayout, scope, knownSessions);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeProject?.id, activePlanScopeComplete, agentRun?.phase, isImportedPlanningActive, layout, sessions, terminalScope.scope, terminalScope.scopeKind, terminalScope.planPath, thinkingEffort]);

  useEffect(() => {
    if (!activeProject || terminalScope.scopeKind !== "plan" || !activePlanScopeComplete) return;
    const closable = sessions.filter((session) =>
      (isModifySession(session) || isGeneralPrewarmSession(session))
      && isLiveTerminalSession(session)
      && session.scope === terminalScope.scope
      && (isStandbySession(session) || !agentRun || agentRun.sessionId !== session.id || agentRun.phase === "complete" || agentRun.phase === "blocked")
    );
    for (const session of closable) {
      appendImportLog(`Closing completed-plan modify session project=${activeProject.id} session=${session.id} scope=${terminalScope.scope}`);
      void closeSessionQuietly(activeProject, session.id);
    }
  }, [activeProject?.id, activePlanScopeComplete, agentRun?.phase, agentRun?.sessionId, sessions, terminalScope.scope, terminalScope.scopeKind]);

  async function loadBaseData() {
    const requestId = baseDataRequestId.current + 1;
    baseDataRequestId.current = requestId;
    setStatus("Loading workspace");
    const [wikiResult, projectsResult, workspaceResult, previewResult, settingsResult, layoutResult, reviewResult, repoResult] = await Promise.allSettled([
      hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", activeProject)),
      hyperwikiApi.json<ProjectListResponse>(withProjectQuery("/api/projects", activeProject)),
      hyperwikiApi.json<WorkspaceResponse>(withProjectQuery("/api/workspace", activeProject)),
      hyperwikiApi.json<AppPreviewResponse>(withProjectQuery("/api/app-preview", activeProject)),
      hyperwikiApi.json<SettingsResponse>("/api/settings"),
      hyperwikiApi.json<LayoutResponse>(withProjectQuery("/api/layout", activeProject)),
      hyperwikiApi.json<ReviewWorkflowResponse>(withProjectQuery("/api/review-workflows", activeProject)),
      hyperwikiApi.json<RepoContextResponse>(withProjectQuery("/api/repo", activeProject)),
    ]);
    if (requestId !== baseDataRequestId.current) return;

    if (wikiResult.status === "fulfilled") {
      const pages = wikiResult.value.pages || [];
      setWikiPages(pages);
      const planning = importedPlanningState({ kind: "wiki", path: "/wiki/plans/index.mdx" }, pages);
      appendImportLog(`Base wiki pages loaded project=${activeProject?.id || "none"} pages=${pages.length} importedSource=${planning.hasImportedSource} generatedPlanCount=${planning.generatedPlanPaths.length} qnaIntake=${planning.isIntake}`);
    }
    if (projectsResult.status === "fulfilled") {
      setProjects(projectsResult.value);
      const selectedProject = findActiveProject(projectsResult.value, unavailableProjectIds, workspaceSelectionFromLocation());
      if (pendingImportProject || window.location.pathname.startsWith("/workspace/") || readImportLog().length) {
        appendImportLog(`Project list loaded count=${allProjectRecords(projectsResult.value).length} selected=${selectedProject?.id || "none"} route=${window.location.pathname}${window.location.hash || ""}`);
      }
      setActiveProject(selectedProject);
      if (selectedProject && pendingImportProject && matchesWorkspaceSelection(selectedProject, workspaceSelectionFromLocation())) {
        appendImportLog(`Clearing pending import after selecting ${selectedProject.id}`);
        clearPendingImportProject();
        setPendingImportProject(null);
      }
      setHasLoadedProjects(true);
    }
    if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
    if (previewResult.status === "fulfilled") setPreview(previewResult.value);
    if (settingsResult.status === "fulfilled") setSettings(settingsResult.value);
    if (layoutResult.status === "fulfilled") setLayout(layoutResult.value);
    if (reviewResult.status === "fulfilled") setReviewWorkflows(reviewResult.value.workflows || []);
    if (repoResult.status === "fulfilled") setRepoContext(repoResult.value);

    const rejected = [wikiResult, projectsResult, workspaceResult, previewResult, settingsResult, layoutResult, reviewResult, repoResult].find((result) => result.status === "rejected");
    setStatus(rejected ? "Some workspace data is unavailable" : "Workspace loaded");
  }

  async function checkWikiFingerprint(reason: string) {
    if (hasLoadedProjects && hasRegisteredProjects && !activeProject) return;
    try {
      const result = await hyperwikiApi.json<WikiFingerprintResponse>(withProjectQuery("/api/wiki/fingerprint", activeProject));
      if (!result.fingerprint) return;
      if (!wikiFingerprintRef.current) {
        wikiFingerprintRef.current = result.fingerprint;
        appendImportLog(`Wiki fingerprint initialized reason=${reason} files=${result.fileCount}`);
        return;
      }
      if (wikiFingerprintRef.current === result.fingerprint) return;
      const previous = wikiFingerprintRef.current;
      wikiFingerprintRef.current = result.fingerprint;
      appendImportLog(`Wiki fingerprint changed reason=${reason} previous=${previous} next=${result.fingerprint} files=${result.fileCount}`);
      await refreshWikiStateFromDisk(reason);
    } catch (error) {
      appendImportLog(`Wiki fingerprint check failed reason=${reason}`, error);
    }
  }

  async function refreshWikiStateFromDisk(reason: string) {
    if (wikiRefreshInFlight.current) return;
    wikiRefreshInFlight.current = true;
    try {
      const [wikiResult, workspaceResult] = await Promise.allSettled([
        hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", activeProject)),
        hyperwikiApi.json<WorkspaceResponse>(withProjectQuery("/api/workspace", activeProject)),
      ]);
      const nextPages = wikiResult.status === "fulfilled" ? wikiResult.value.pages || [] : wikiPages;
      const nextWorkspace = workspaceResult.status === "fulfilled" ? workspaceResult.value : workspace;
      if (wikiResult.status === "fulfilled") setWikiPages(nextPages);
      if (workspaceResult.status === "fulfilled") setWorkspace(nextWorkspace);
      if (route.kind === "wiki") {
        const displayPath = displayWikiPath(route.path);
        const visiblePageExists = nextPages.some((page) => displayWikiPath(page.path) === displayPath);
        if (!visiblePageExists && displayPath !== defaultWikiPath) {
          const landingPath = planLandingPath(nextPages);
          const nextRoute: ViewRoute = { kind: "wiki", path: landingPath };
          setRoute(nextRoute);
          window.history.replaceState(null, "", urlForRoute(nextRoute, activeProject));
        } else {
          await reloadVisibleWikiPage(route.path);
        }
      }
      setStatus(reason === "focus" || reason === "visibility" ? "Wiki refreshed" : "Wiki changes loaded");
    } finally {
      wikiRefreshInFlight.current = false;
    }
  }

  async function reloadVisibleWikiPage(path: string) {
    if (!isReactRenderedMdxPath(path)) {
      const html = await hyperwikiApi.text(wikiRequestPath(path, activeProject));
      setWikiHtml(html);
      setWikiSource(null);
      return;
    }
    const source = await hyperwikiApi.json<WikiSourceResponse>(withProjectQuery(`/api/wiki/source?path=${encodeURIComponent(path)}`, activeProject));
    setWikiHtml("");
    setWikiSource(source);
  }

  async function loadSessions(options: { selectSessionId?: string | null } = {}) {
    const requestedProjectId = activeProject?.id || "";
    setIsSessionsLoading(true);
    try {
      const response = await hyperwikiApi.json<SessionsResponse>(withProjectQuery("/api/sessions", activeProject));
      if (!isCurrentTerminalProject(requestedProjectId, latestTerminalContext.current)) {
        appendImportLog(`Ignoring stale session load project=${requestedProjectId || "none"} currentProject=${latestTerminalContext.current.projectId || "none"}`);
        return;
      }
      const nextSessions = response.sessions || [];
      applyTerminalSessions(requestedProjectId, nextSessions, { reason: "load", selectSessionId: options.selectSessionId });
    } catch {
      if (!isCurrentTerminalProject(requestedProjectId, latestTerminalContext.current)) return;
      setSessions([]);
      setActiveSessionId(null);
    } finally {
      if (isCurrentTerminalProject(requestedProjectId, latestTerminalContext.current)) {
        setIsSessionsLoading(false);
      }
    }
  }

  function navigate(nextRoute: ViewRoute) {
    const nextUrl = urlForRoute(nextRoute, activeProject);
    latestTerminalContext.current = { projectId: activeProject?.id || "", scope: normalizeTerminalScope(scopeForRoute(nextRoute)).scope };
    appendImportLog(`Navigate route=${nextRoute.kind}${nextRoute.kind === "wiki" ? `:${nextRoute.path}` : ""} url=${nextUrl} activeProject=${activeProject?.id || "none"}`);
    setRoute(nextRoute);
    window.history.pushState(null, "", nextUrl);
  }

  async function switchProject(project: ProjectRecord) {
    appendImportLog(`Switch project ${project.id} ${project.projectSlug}/${project.worktreeSlug}`);
    latestTerminalContext.current = { projectId: project.id, scope: latestTerminalContext.current.scope };
    setActiveProject(project);
    setIsProjectsOpen(false);
    setSessions([]);
    setActiveSessionId(null);
    setIsSessionsLoading(true);
    const loaded = await loadProjectData(project);
    const loadedWorkspace = loaded.workspace;
    const landingPath = isIncompleteImportProject(project) ? defaultWikiPath : planLandingPath(loaded.pages);
    if (isIncompleteImportProject(project)) void startTerminalImportPlanning(project, "switch-project");
    const nextRoute: ViewRoute = { kind: "wiki", path: landingPath };
    latestTerminalContext.current = { projectId: project.id, scope: normalizeTerminalScope(scopeForRoute(nextRoute)).scope };
    setRoute(nextRoute);
    const nextPath = `/workspace/${project.projectSlug}/${project.worktreeSlug}#${landingPath}`;
    window.history.pushState(null, "", nextPath);
  }

  async function loadProjectData(project: ProjectRecord) {
    requestedProjectDataId.current = project.id;
    const requestId = projectDataRequestId.current + 1;
    projectDataRequestId.current = requestId;
    setStatus("Loading workspace");
    const [wikiResult, workspaceResult, previewResult, layoutResult, reviewResult, repoResult] = await Promise.allSettled([
      hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", project)),
      hyperwikiApi.json<WorkspaceResponse>(withProjectQuery("/api/workspace", project)),
      hyperwikiApi.json<AppPreviewResponse>(withProjectQuery("/api/app-preview", project)),
      hyperwikiApi.json<LayoutResponse>(withProjectQuery("/api/layout", project)),
      hyperwikiApi.json<ReviewWorkflowResponse>(withProjectQuery("/api/review-workflows", project)),
      hyperwikiApi.json<RepoContextResponse>(withProjectQuery("/api/repo", project)),
    ]);
    if (requestId !== projectDataRequestId.current) {
      appendImportLog(`Ignoring stale project data load project=${project.id}`);
      return { workspace: null, layout: null, pages: [] };
    }

    if (wikiResult.status === "fulfilled") {
      const pages = wikiResult.value.pages || [];
      setWikiPages(pages);
      const planning = importedPlanningState({ kind: "wiki", path: "/wiki/plans/index.mdx" }, pages);
      appendImportLog(`Project data wiki pages loaded project=${project.id} pages=${pages.length} importedSource=${planning.hasImportedSource} generatedPlanCount=${planning.generatedPlanPaths.length} qnaIntake=${planning.isIntake}`);
    }
    if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
    if (previewResult.status === "fulfilled") setPreview(previewResult.value);
    if (layoutResult.status === "fulfilled") setLayout(layoutResult.value);
    if (reviewResult.status === "fulfilled") setReviewWorkflows(reviewResult.value.workflows || []);
    if (repoResult.status === "fulfilled") setRepoContext(repoResult.value);

    const rejected = [wikiResult, workspaceResult, previewResult, layoutResult, reviewResult, repoResult].find((result) => result.status === "rejected");
    setStatus(rejected ? "Some workspace data is unavailable" : "Workspace loaded");
    return {
      workspace: workspaceResult.status === "fulfilled" ? workspaceResult.value : null,
      layout: layoutResult.status === "fulfilled" ? layoutResult.value : null,
      pages: wikiResult.status === "fulfilled" ? wikiResult.value.pages || [] : [],
    };
  }

  async function changeAgentProvider(provider: AgentProviderId) {
    if (!activeProject) return;
    try {
      const nextLayout = await hyperwikiApi.json<LayoutResponse>(withProjectQuery("/api/agent-provider", activeProject), {
        method: "POST",
        body: { provider },
      });
      setLayout(nextLayout);
      scheduleGeneralAgentPrewarmRefill(activeProject, nextLayout, terminalScope, "provider-switch");
    } catch (error) {
      appendImportLog(`Agent provider switch failed: ${String(error)}`);
    }
  }

  async function startTerminal(role: "agent" | "cli") {
    const name = role;
    const startedAt = Date.now();
    const pendingId = nextClientTerminalId();
    setStatus(`Starting ${name.toLowerCase()}`);
    appendImportLog(`Manual terminal start clicked role=${role} project=${activeProject?.id || "none"} scope=${terminalScope.scope}`);
    try {
      if (role === "agent" && activeProject) {
        const normalizedScope = normalizeTerminalScope(terminalScope);
        const existing = selectReusableAgentSession(sessions.filter((session) =>
          isGeneralSession(session)
          && sessionMatchesScope(session, normalizedScope)
        ), { purpose: "general", promote: true, provider: layoutAgentProvider(layout) });
        if (existing?.command && isLiveTerminalSession(existing) && isStandbySession(existing)) {
          appendImportLog(`Manual agent promoting prewarmed general session project=${activeProject.id} session=${existing.id} scope=${normalizedScope.scope}`);
          const promoted = await promoteSession(activeProject, existing.id, "general");
          appendImportLog(`Manual agent promoted prewarmed general session project=${activeProject.id} session=${promoted.id} elapsedMs=${Date.now() - startedAt}`);
          setStatus("Agent ready");
          scheduleGeneralAgentPrewarmRefill(activeProject, layout, normalizedScope, "manual-agent-promote");
          void waitForAgentPromptReady(promoted.id, { maxAttempts: 8, intervalMs: 250, reason: "manual-agent-promote" }).then((ready) => {
            appendImportLog(`Manual agent promoted readiness session=${promoted.id} ready=${ready} elapsedMs=${Date.now() - startedAt}`);
          });
          void loadSessions({ selectSessionId: promoted.id });
          return;
        }
      }
      if (activeProject) {
        const pendingSession = pendingTerminalSession({
          id: pendingId,
          name,
          role,
          command: role === "agent" ? agentLaunchCommand(layout, thinkingEffort) : null,
          scope: terminalScope,
        });
        upsertTerminalSession(activeProject.id, pendingSession, { reason: "optimistic-start", select: true });
        appendImportLog(`Manual terminal optimistic pane inserted role=${role} session=${pendingId} elapsedMs=${Date.now() - startedAt}`);
      }
      const started = await hyperwikiApi.json<TerminalStartResponse>(withProjectQuery("/api/terminal/start", activeProject), {
        method: "POST",
        body: {
          id: pendingId,
          name,
          role,
          command: role === "agent" ? agentLaunchCommand(layout, thinkingEffort) : null,
          scope: terminalScope.scope,
          scopeKind: terminalScope.scopeKind,
          planPath: terminalScope.planPath,
          purpose: role === "agent" ? "general" : null,
        },
      });
      if (activeProject) upsertTerminalSession(activeProject.id, started.session, { reason: "start-terminal", select: true });
      appendImportLog(`Manual terminal backend start returned role=${role} session=${started.session.id} elapsedMs=${Date.now() - startedAt}`);
      void loadSessions({ selectSessionId: started.session.id });
      if (role === "agent") {
        if (activeProject) scheduleGeneralAgentPrewarmRefill(activeProject, layout, terminalScope, "manual-agent-start");
        void waitForAgentPromptReady(started.session.id, { maxAttempts: 20, intervalMs: 250, reason: "manual-agent-start" }).then((ready) => {
          appendImportLog(`Manual agent prompt readiness session=${started.session.id} ready=${ready} elapsedMs=${Date.now() - startedAt}`);
        });
      }
      setStatus(`${name} started`);
    } catch (error) {
      if (activeProject) {
        const failed = failedTerminalSession({
          id: pendingId,
          name,
          role,
          command: role === "agent" ? agentLaunchCommand(layout, thinkingEffort) : null,
          scope: terminalScope,
          error: error instanceof Error ? error.message : String(error),
        });
        upsertTerminalSession(activeProject.id, failed, { reason: "optimistic-start-failed", select: true });
      }
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function applyTerminalSessions(projectId: string, incomingSessions: SessionRecord[], options: { reason: string; selectSessionId?: string | null } = { reason: "apply" }) {
    if (!isCurrentTerminalProject(projectId, latestTerminalContext.current)) {
      appendImportLog(`Ignoring stale terminal sessions apply reason=${options.reason} project=${projectId || "none"} currentProject=${latestTerminalContext.current.projectId || "none"}`);
      return;
    }
    setSessions((current) => {
      const currentVisible = current.filter(isVisibleTerminalPaneSession);
      const incomingIds = new Set(incomingSessions.map((session) => session.id));
      const preserved = currentVisible.filter((session) => !incomingIds.has(session.id));
      const nextSessions = [...incomingSessions, ...preserved].sort(compareSessions);
      appendImportLog(`Applied terminal sessions reason=${options.reason} project=${projectId || "none"} incoming=${incomingSessions.length} preserved=${preserved.length} ids=${nextSessions.map((session) => `${session.id}:${session.role || ""}:${session.scope || ""}:${session.visibility || "visible"}`).join(",") || "none"}`);
      setActiveSessionId((currentActive) => selectActiveSessionId(nextSessions, options.selectSessionId, currentActive));
      return nextSessions;
    });
  }

  function upsertTerminalSession(projectId: string, session: SessionRecord, options: { reason: string; select?: boolean } = { reason: "upsert" }) {
    const requestedScope = canonicalTerminalScopePath(session.scope || "");
    if (!requestedScope || !isCurrentTerminalProject(projectId, latestTerminalContext.current)) {
      appendImportLog(`Ignoring stale terminal session upsert reason=${options.reason} project=${projectId || "none"} session=${session.id} scope=${requestedScope || "none"} currentProject=${latestTerminalContext.current.projectId || "none"} currentScope=${latestTerminalContext.current.scope}`);
      return;
    }
    setSessions((current) => {
      const nextSessions = upsertSessionRecord(current, session).sort(compareSessions);
      appendImportLog(`Upserted terminal session reason=${options.reason} project=${projectId || "none"} session=${session.id} scope=${requestedScope} visibility=${session.visibility || "visible"} status=${session.status || "unknown"}`);
      setActiveSessionId((currentActive) => selectActiveSessionId(nextSessions, options.select && !isStandbySession(session) ? session.id : null, currentActive));
      return nextSessions;
    });
  }

  async function ensureAgentSession() {
    const session = await ensureAgentSessionForProject(activeProject, layout, terminalScope, sessions, { purpose: "general", promote: true });
    return session;
  }

  async function loadSessionsForProject(project: ProjectRecord | null, scope = terminalScope) {
    if (!project) return [];
    const requestedScope = normalizeTerminalScope(scope).scope;
    appendImportLog(`Loading sessions project=${project.id} scope=${requestedScope}`);
    const response = await hyperwikiApi.json<SessionsResponse>(withProjectQuery("/api/sessions", project));
    const nextSessions = response.sessions || [];
    appendImportLog(`Loaded sessions project=${project.id} scope=${requestedScope} projectWideCount=${nextSessions.length} ids=${nextSessions.map((session) => `${session.id}:${session.role || ""}:${session.scope || ""}`).join(",") || "none"}`);
    if (!isCurrentTerminalProject(project.id, latestTerminalContext.current)) {
      appendImportLog(`Ignoring stale project session load project=${project.id} scope=${requestedScope} currentProject=${latestTerminalContext.current.projectId || "none"} currentScope=${latestTerminalContext.current.scope}`);
      return nextSessions;
    }
    applyTerminalSessions(project.id, nextSessions, { reason: "project-load" });
    return nextSessions;
  }

  async function ensureAgentSessionForProject(
    project: ProjectRecord | null,
    projectLayout: LayoutResponse | null,
    scope = terminalScope,
    knownSessions = sessions,
    options: { commandOverride?: string; forceNew?: boolean; purpose?: string; visibility?: "visible" | "standby"; promote?: boolean } = {},
  ) {
    if (!project) {
      throw new Error("Project not found for agent planning.");
    }
    const normalizedScope = normalizeTerminalScope(scope);
    const matchingSessions = knownSessions.filter((session) =>
      isAgentSession(session)
      && (!options.purpose || session.purpose === options.purpose)
      && sessionMatchesScope(session, normalizedScope)
    );
    const desiredProvider: AgentProviderId = options.commandOverride
      ? agentProviderFromCommand(options.commandOverride)
      : layoutAgentProvider(projectLayout);
    const existing = selectReusableAgentSession(matchingSessions, { ...options, provider: desiredProvider });
    if (existing?.command && isLiveTerminalSession(existing) && !options.forceNew) {
      appendImportLog(`ensureAgentSession reused known session project=${project.id} session=${existing.id} known=${knownSessions.length} scope=${normalizedScope.scope} purpose=${existing.purpose || "none"} visibility=${existing.visibility || "visible"} createdAt=${existing.createdAt || "unknown"}`);
      if (options.promote && isStandbySession(existing)) {
        const promotedPurpose = options.purpose || existing.purpose || "general";
        const promoted = await promoteSession(project, existing.id, promotedPurpose);
        appendImportLog(`ensureAgentSession promoted standby project=${project.id} session=${existing.id} purpose=${promotedPurpose} scope=${normalizedScope.scope}`);
        upsertTerminalSession(project.id, promoted, { reason: "promote-reuse", select: true });
        return promoted;
      }
      upsertTerminalSession(project.id, existing, { reason: "reuse-agent", select: true });
      return existing;
    }
    if (existing?.command && options.forceNew) {
      appendImportLog(`ensureAgentSession starting fresh agent project=${project.id} previous=${existing.id} known=${knownSessions.length} scope=${normalizedScope.scope} purpose=${existing.purpose || "none"} visibility=${existing.visibility || "visible"}`);
    }
    const command = options.commandOverride || agentLaunchCommand(projectLayout, thinkingEffort);
    if (!command) {
      throw new Error("No agent launch command is configured for this project. Set agent.launchCommand in .hyperwiki/config.json, for example codex --yolo.");
    }
    const pendingId = options.visibility === "standby" ? "" : nextClientTerminalId();
    const startedAt = Date.now();
    if (pendingId) {
      const pendingSession = pendingTerminalSession({
        id: pendingId,
        name: "Agent",
        role: "agent",
        command,
        scope: normalizedScope,
      });
      pendingSession.purpose = options.purpose || "general";
      upsertTerminalSession(project.id, pendingSession, { reason: "optimistic-agent-start", select: true });
      appendImportLog(`ensureAgentSession optimistic pane inserted project=${project.id} session=${pendingId} scope=${normalizedScope.scope} purpose=${pendingSession.purpose || "none"}`);
    }
    try {
      const started = await hyperwikiApi.json<TerminalStartResponse>(withProjectQuery("/api/terminal/start", project), {
        method: "POST",
        body: {
          id: pendingId || undefined,
          name: "Agent",
          role: "agent",
          command,
          scope: normalizedScope.scope,
          scopeKind: normalizedScope.scopeKind,
          planPath: normalizedScope.planPath,
          visibility: options.visibility || "visible",
          purpose: options.purpose || null,
        },
      });
      appendImportLog(`ensureAgentSession started terminal project=${project.id} session=${started.session.id} scope=${started.session.scope || ""} role=${started.session.role || ""} purpose=${started.session.purpose || "none"} visibility=${started.session.visibility || "visible"} elapsedMs=${Date.now() - startedAt}`);
      upsertTerminalSession(project.id, started.session, { reason: "start-agent", select: !isStandbySession(started.session) });
      return started.session;
    } catch (error) {
      if (pendingId) {
        const failed = failedTerminalSession({
          id: pendingId,
          name: "Agent",
          role: "agent",
          command,
          scope: normalizedScope,
          error: error instanceof Error ? error.message : String(error),
        });
        failed.purpose = options.purpose || "general";
        upsertTerminalSession(project.id, failed, { reason: "optimistic-agent-start-failed", select: true });
      }
      throw error;
    }
  }

  async function prewarmAgentSessionsForScope(project: ProjectRecord, projectLayout: LayoutResponse | null, scope: TerminalScope, knownSessions: SessionRecord[]) {
    const normalizedScope = normalizeTerminalScope(scope);
    appendImportLog(`Prewarm batch scheduled project=${project.id} scope=${normalizedScope.scope}`);
    await prewarmGeneralSessionForScope(project, projectLayout, normalizedScope, knownSessions);
    await prewarmModifySessionForScope(project, projectLayout, normalizedScope, knownSessions);
  }

  function scheduleGeneralAgentPrewarmRefill(project: ProjectRecord, projectLayout: LayoutResponse | null, scope: TerminalScope, reason: string) {
    const normalizedScope = normalizeTerminalScope(scope);
    if (normalizedScope.scopeKind !== "plan") return;
    const key = `${project.id}:${normalizedScope.scope}`;
    if (generalPrewarmRefillTimers.current.has(key)) {
      appendImportLog(`General prewarm refill already scheduled project=${project.id} scope=${normalizedScope.scope} reason=${reason}`);
      return;
    }
    appendImportLog(`General prewarm refill scheduled project=${project.id} scope=${normalizedScope.scope} reason=${reason} delayMs=${generalAgentPrewarmRefillDelayMs}`);
    const timer = window.setTimeout(() => {
      generalPrewarmRefillTimers.current.delete(key);
      const refillStartedAt = Date.now();
      if (!isCurrentTerminalProject(project.id, latestTerminalContext.current) || latestTerminalContext.current.scope !== normalizedScope.scope) {
        appendImportLog(`General prewarm refill skipped stale scope project=${project.id} scope=${normalizedScope.scope} currentProject=${latestTerminalContext.current.projectId || "none"} currentScope=${latestTerminalContext.current.scope} reason=${reason}`);
        return;
      }
      void loadSessionsForProject(project, normalizedScope)
        .then((latestSessions) => {
          appendImportLog(`General prewarm refill loaded sessions project=${project.id} scope=${normalizedScope.scope} count=${latestSessions.length} reason=${reason} elapsedMs=${Date.now() - refillStartedAt}`);
          return prewarmGeneralSessionForScope(project, projectLayout, normalizedScope, latestSessions);
        })
        .catch((error) => {
          appendImportLog(`General prewarm refill failed project=${project.id} scope=${normalizedScope.scope} reason=${reason} elapsedMs=${Date.now() - refillStartedAt}`, error);
        });
    }, generalAgentPrewarmRefillDelayMs);
    generalPrewarmRefillTimers.current.set(key, timer);
  }

  async function prewarmModifySessionForScope(project: ProjectRecord, projectLayout: LayoutResponse | null, scope: TerminalScope, knownSessions: SessionRecord[]) {
    const normalizedScope = normalizeTerminalScope(scope);
    const key = `${project.id}:${normalizedScope.scope}`;
    if (prewarmingModifySessions.current.has(key)) return;
    const command = agentLaunchCommand(projectLayout, thinkingEffort);
    if (!command) return;
    const desiredProvider = agentProviderFromCommand(command);
    const existingModifyCount = knownSessions.filter((session) => isModifySession(session) && sessionMatchesScope(session, normalizedScope) && isLiveTerminalSession(session) && agentProviderFromCommand(session.command) === desiredProvider).length;
    if (existingModifyCount >= modifyAgentPrewarmTarget) return;
    prewarmingModifySessions.current.add(key);
    try {
      appendImportLog(`Prewarming modify agent project=${project.id} scope=${normalizedScope.scope}`);
      const session = await ensureAgentSessionForProject(project, projectLayout, normalizedScope, knownSessions, { commandOverride: command, purpose: "modify", visibility: "standby" });
      appendImportLog(`Prewarmed modify agent started project=${project.id} session=${session.id} scope=${normalizedScope.scope} visibility=${session.visibility || "visible"}`);
      await loadSessionsForProject(project, normalizedScope);
      void waitForAgentPromptReady(session.id, { maxAttempts: 20, intervalMs: 250, reason: "modify-prewarm" }).then((ready) => {
        appendImportLog(`Prewarmed modify agent readiness project=${project.id} session=${session.id} scope=${normalizedScope.scope} ready=${ready}`);
      });
    } catch (error) {
      appendImportLog(`Prewarm modify agent failed project=${project.id} scope=${normalizedScope.scope}`, error);
    } finally {
      prewarmingModifySessions.current.delete(key);
    }
  }

  async function prewarmGeneralSessionForScope(project: ProjectRecord, projectLayout: LayoutResponse | null, scope: TerminalScope, knownSessions: SessionRecord[]) {
    const normalizedScope = normalizeTerminalScope(scope);
    const key = `${project.id}:${normalizedScope.scope}`;
    if (prewarmingGeneralSessions.current.has(key)) return;
    const command = agentLaunchCommand(projectLayout, thinkingEffort);
    if (!command) return;
    const desiredProvider = agentProviderFromCommand(command);
    const existingPool = knownSessions.filter((session) => isGeneralPrewarmSession(session) && sessionMatchesScope(session, normalizedScope) && isLiveTerminalSession(session) && agentProviderFromCommand(session.command) === desiredProvider);
    const missing = Math.max(0, generalAgentPrewarmTarget - existingPool.length);
    if (missing <= 0) return;
    prewarmingGeneralSessions.current.add(key);
    const prewarmStartedAt = Date.now();
    const createdSessions: SessionRecord[] = [];
    try {
      appendImportLog(`Prewarming general agent pool project=${project.id} scope=${normalizedScope.scope} existing=${existingPool.length} target=${generalAgentPrewarmTarget} starting=${missing}`);
      for (let index = 0; index < missing; index += 1) {
        const slot = existingPool.length + index + 1;
        const slotStartedAt = Date.now();
        const session = await ensureAgentSessionForProject(project, projectLayout, normalizedScope, [...knownSessions, ...createdSessions], { commandOverride: command, purpose: "general", visibility: "standby", forceNew: true });
        createdSessions.push(session);
        appendImportLog(`Prewarmed general agent pool slot started project=${project.id} session=${session.id} scope=${normalizedScope.scope} slot=${slot}/${generalAgentPrewarmTarget} visibility=${session.visibility || "visible"} elapsedMs=${Date.now() - slotStartedAt} totalElapsedMs=${Date.now() - prewarmStartedAt}`);
        void waitForAgentPromptReady(session.id, { maxAttempts: prewarmAgentReadinessAttempts, intervalMs: 250, reason: `general-prewarm-${slot}` }).then((ready) => {
          appendImportLog(`Prewarmed general agent readiness project=${project.id} session=${session.id} scope=${normalizedScope.scope} slot=${slot}/${generalAgentPrewarmTarget} ready=${ready} elapsedMs=${Date.now() - prewarmStartedAt}`);
        });
      }
      if (createdSessions.length) await loadSessionsForProject(project, normalizedScope);
    } catch (error) {
      appendImportLog(`Prewarm general agent failed project=${project.id} scope=${normalizedScope.scope}`, error);
    } finally {
      prewarmingGeneralSessions.current.delete(key);
    }
  }

  async function promoteSession(project: ProjectRecord, sessionId: string, purpose = "modify") {
    const response = await hyperwikiApi.json<SessionResponse>(withProjectQuery(`/api/sessions/${encodeURIComponent(sessionId)}`, project), {
      method: "PATCH",
      body: { visibility: "visible", purpose },
    });
    const promoted = response.session;
    upsertTerminalSession(project.id, promoted, { reason: "promote", select: true });
    return promoted;
  }

  async function retargetAgentSession(project: ProjectRecord, sessionId: string, scope: TerminalScope, purpose = "general") {
    const normalizedScope = normalizeTerminalScope(scope);
    const response = await hyperwikiApi.json<SessionResponse>(withProjectQuery(`/api/sessions/${encodeURIComponent(sessionId)}`, project), {
      method: "PATCH",
      body: {
        visibility: "visible",
        purpose,
        scope: normalizedScope.scope,
        scopeKind: normalizedScope.scopeKind,
        planPath: normalizedScope.planPath,
      },
    });
    const retargeted = response.session;
    appendImportLog(`Agent session retargeted project=${project.id} session=${retargeted.id} scope=${normalizedScope.scope} purpose=${retargeted.purpose || "none"}`);
    upsertTerminalSession(project.id, retargeted, { reason: "retarget-agent", select: true });
    return retargeted;
  }

  async function sendAgentPrompt(prompt: string) {
    await sendAgentPromptToProject(activeProject, prompt, currentWikiPath, terminalScope, layout, sessions);
  }

  function startAgentRun(kind: AgentRunKind, label: string) {
    const run: AgentRunState = {
      id: `${kind}-${Date.now()}`,
      kind,
      label,
      phase: "starting",
      sessionId: null,
      activity: "Starting agent session",
      lines: ["Starting agent session"],
      outcome: "",
      transcript: "Starting agent session",
      startedAt: Date.now(),
    };
    setAgentRun(run);
    return run.id;
  }

  function updateAgentRun(runId: string | null, update: Partial<AgentRunState>) {
    if (!runId) return;
    setAgentRun((current) => current?.id === runId ? { ...current, ...update } : current);
  }

  function clearActiveImportPlanningTurn(requestId: string) {
    if (activeImportPlanningTurn.current?.requestId === requestId) {
      activeImportPlanningTurn.current = null;
    }
    setActiveImportPlanningRun((current) => current?.requestId === requestId ? null : current);
  }

  async function checkpointImportPlanningQuestion(project: ProjectRecord, question: PlanningQuestion) {
    const requestId = question.requestId || question.id;
    const activeTurn = activeImportPlanningTurn.current;
    const activeTurnRunId = activeTurn && activeTurn.requestId === question.requestId ? activeTurn.runId || "" : "";
    const status = await hyperwikiApi.json<ImportPlanningStatus>(withProjectQuery("/api/import-planning/question", project), {
      method: "POST",
      body: {
        requestId,
        sessionId: question.sessionId || "",
        runId: activeTurnRunId,
        question: planningQuestionToImportQuestion(question),
      },
    });
    applyImportPlanningStatus(status);
    appendImportLog(`Imported Q&A checkpointed human input project=${project.id} request=${requestId} question=${question.id}`);
  }

  async function setImportPlanningQuestions(project: ProjectRecord, questions: PlanningQuestion[]) {
    const nextQuestions = questions.filter((question) => !answeredPlanningQuestionIds.current.has(question.id));
    if (nextQuestions[0]) {
      try {
        await checkpointImportPlanningQuestion(project, nextQuestions[0]);
      } catch (error) {
        appendImportLog(`Imported Q&A checkpoint failed project=${project.id} question=${nextQuestions[0].id}`, error);
      }
    }
    setPlanningQuestions(nextQuestions);
  }

  function setPlanningQuestions(questions: PlanningQuestion[]) {
    const nextQuestions = questions.filter((question) => !answeredPlanningQuestionIds.current.has(question.id));
    setActivePlanningQuestions(nextQuestions);
    setActivePlanningQuestion(nextQuestions[0] || null);
  }

  function stageImportQuestionScript(project: ProjectRecord, questions: PlanningQuestion[]) {
    const scriptedQuestions = questions.filter((question) => !answeredPlanningQuestionIds.current.has(question.id));
    importQuestionScripts.current.set(project.id, scriptedQuestions);
    appendImportLog(`Imported Q&A script staged project=${project.id} questions=${scriptedQuestions.length} ids=${scriptedQuestions.map((question) => question.id).join(",") || "none"}`);
    return revealNextImportScriptQuestion(project);
  }

  function revealNextImportScriptQuestion(project: ProjectRecord) {
    const questions = importQuestionScripts.current.get(project.id) || [];
    const nextQuestions = questions.filter((question) => !answeredPlanningQuestionIds.current.has(question.id));
    importQuestionScripts.current.set(project.id, nextQuestions);
    const nextQuestion = nextQuestions[0] || null;
    if (!nextQuestion) return false;
    appendImportLog(`Imported Q&A script question ready project=${project.id} remaining=${nextQuestions.length} id=${nextQuestion.id}`);
    setPlanningInterviewStatus("question_ready");
    void setImportPlanningQuestions(project, [nextQuestion]);
    setPlanningActivity("Next planning question is ready.");
    setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [`Scripted question ready (${nextQuestions.length} remaining)`]));
    setStatus("Imported project Q&A question ready");
    return true;
  }

  function clearPlanningQuestions() {
    setActivePlanningQuestions([]);
    setActivePlanningQuestion(null);
  }

  const openProjectEnvEditor = useCallback((initialKey?: string, reason?: string) => {
    setProjectEnvEditor({
      open: true,
      initialKey: initialKey?.trim() || undefined,
      reason: reason?.trim() || undefined,
    });
  }, []);

  function armAgentCompletion(session: SessionRecord, label: string) {
    const bufferedText = planningQuestionBuffers.current.get(session.id) || "";
    const readiness = agentPromptReadinessSnapshot(bufferedText);
    const pageTitle = session.planPath ? titleForPath(session.planPath, wikiPages) : "";
    armedAgentCompletions.current.set(session.id, {
      minPromptIndex: readiness.promptIndex,
      label,
      planPath: session.planPath || null,
    });
    appendImportLog(`Agent completion armed session=${session.id} label=${label} promptIndex=${readiness.promptIndex} plan=${pageTitle || session.planPath || "none"}`);
  }

  async function notifyTerminalCompletion(payload: TerminalCompletionEventPayload) {
    const completionKey = `${payload.reason}:${payload.sessionId}:${payload.completedAt || ""}`;
    if (notifiedTerminalCompletions.current.has(completionKey)) return;
    notifiedTerminalCompletions.current.add(completionKey);
    const settings = terminalCompletionNotificationSettings(latestNotificationSettings.current);
    if (!settings.enabled) return;
    if (settings.onlyWhenUnfocused && document.hasFocus()) return;
    const session = latestSessionsRef.current.find((candidate) => candidate.id === payload.sessionId);
    const project = latestActiveProjectRef.current;
    const role = payload.role || session?.role || session?.name || "terminal";
    const name = payload.name || session?.name || role;
    const planPath = payload.planPath || session?.planPath || "";
    const label = role === "agent" && payload.reason === "agent-ready"
      ? `${name} finished work`
      : payload.exitCode && payload.exitCode !== 0
        ? `${name} exited with status ${payload.exitCode}`
        : `${name} finished`;
    const scopeLabel = titleForPath(planPath, latestWikiPagesRef.current) || project?.name || project?.projectSlug || "project terminal";
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = await requestPermission() === "granted";
      }
      if (!granted) return;
      sendNotification({
        title: "hyperwiki terminal complete",
        body: `${label} in ${scopeLabel}.`,
        group: "terminal-completion",
        sound: settings.sound ? terminalCompletionSound() : undefined,
      });
    } catch (error) {
      appendImportLog(`Terminal completion notification failed session=${payload.sessionId}`, error);
    }
  }

  const handleTerminalText = useCallback((sessionId: string, text: string) => {
    if (!text) return;
    const detectedEnvKey = detectEnvKeyFromTerminalText(text);
    if (detectedEnvKey) {
      setTerminalEnvHint((current) => current?.key === detectedEnvKey && current?.sessionId === sessionId
        ? current
        : { key: detectedEnvKey, sessionId });
    }
    const session = latestSessionsRef.current.find((candidate) => candidate.id === sessionId);
    if (session?.role === "dev") {
      const runtimeUrl = terminalPreviewUrlFromText(text, latestPreviewRef.current, latestActiveProjectRef.current);
      if (runtimeUrl) {
        setPreview((current) => {
          if (!current || current.url === runtimeUrl) return current;
          appendImportLog(`Dev preview runtime URL detected session=${sessionId} url=${runtimeUrl}`);
          return {
            ...current,
            url: runtimeUrl,
            running: true,
            status: current.status === "not-configured" ? current.status : "running",
            reason: `Dev server reported ${runtimeUrl}.`,
          };
        });
      }
    }
    const current = planningQuestionBuffers.current.get(sessionId) || "";
    const next = trimPlanningQuestionBuffer(current + text);
    planningQuestionBuffers.current.set(sessionId, next);
    const armedCompletion = armedAgentCompletions.current.get(sessionId);
    if (armedCompletion) {
      const readiness = agentPromptReadinessSnapshot(next);
      if (readiness.ready && readiness.promptIndex > armedCompletion.minPromptIndex) {
        armedAgentCompletions.current.delete(sessionId);
        void notifyTerminalCompletion({
          sessionId,
          role: "agent",
          name: armedCompletion.label,
          planPath: armedCompletion.planPath,
          reason: "agent-ready",
          completedAt: new Date().toISOString(),
        });
      }
    }
    const activity = latestPlanningActivity(next);
    if (activity) setPlanningActivity((currentActivity) => currentActivity === activity ? currentActivity : activity);
    const workstream = planningWorkstreamLines(next);
    if (workstream.length) setPlanningWorkstream(workstream);
    setAgentRun((currentRun) => {
      if (!currentRun || currentRun.sessionId !== sessionId) return currentRun;
      const transcript = appendAgentTranscript(currentRun.transcript, text);
      const fullWorkstream = planningWorkstreamLines(transcript, { limit: 10000, maxLineLength: 2000 });
      const lines = fullWorkstream.length ? fullWorkstream : workstream.length ? workstream : currentRun.lines;
      const phase = inferAgentRunPhase(next, lines, currentRun.phase);
      const outcome = agentRunOutcome(next, lines, phase) || currentRun.outcome;
      return {
        ...currentRun,
        phase,
        activity: phase === "complete" || phase === "blocked" ? outcome || agentRunPhaseLabel(phase) : activity || currentRun.activity,
        lines,
        outcome,
        transcript,
      };
    });
    const activeImportTurn = activeImportPlanningTurn.current;
    if (activeImportTurn && activeImportTurn.sessionId !== sessionId) {
      return;
    }
    const expectedRequestId = activeImportTurn?.sessionId === sessionId ? activeImportTurn.requestId : "";
    const questions = extractLatestPlanningQuestions(next, sessionId, answeredPlanningQuestionIds.current, expectedRequestId);
    if (questions.length) {
      for (const question of questions) {
        if (loggedPlanningQuestionIds.current.has(question.id)) continue;
        loggedPlanningQuestionIds.current.add(question.id);
        appendImportLog(`Planning question extracted session=${sessionId} request=${question.requestId || "none"} expected=${expectedRequestId || "none"} id=${question.id} batch=${questions.length} options=${question.options.length} chars=${question.question.length} recommended=${question.recommendedAnswer ? "yes" : "no"}`);
      }
      setPlanningInterviewStatus("question_ready");
      if (activeProject && isIncompleteImportProject(activeProject)) {
        void setImportPlanningQuestions(activeProject, questions);
      } else {
        setPlanningQuestions(questions);
      }
    }
  }, []);

  useEffect(() => {
    if (terminalEnvHint && isRuntimeEnvKeyHintIgnored(terminalEnvHint.key)) {
      setTerminalEnvHint(null);
    }
  }, [terminalEnvHint]);

  async function answerPlanningQuestion(answers: PlanningQuestionAnswer[]) {
    const trimmedAnswers = answers
      .map((item) => ({ question: item.question, answer: item.answer.trim() }))
      .filter((item) => item.answer);
    if (!trimmedAnswers.length || !activeProject) return;
    const first = trimmedAnswers[0];
    const answerSummary = trimmedAnswers.map((item) => `${item.question.question}: ${item.answer}`).join("\n");
    const requestId = `planning-answer:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    for (const item of trimmedAnswers) {
      answeredPlanningQuestionIds.current.add(item.question.id);
    }
    setPlanningInterviewStatus("answering");
    appendImportLog(`Planning answer submitting request=${requestId} session=${first.question.sessionId || "none"} questions=${trimmedAnswers.length} chars=${answerSummary.length}`);
    if (activeProject && isIncompleteImportProject(activeProject)) {
      const item = trimmedAnswers[0];
      const nextStatus = await hyperwikiApi.json<ImportOnboardingStatusResponse>(withProjectQuery("/api/import-onboarding/answer", activeProject), {
        method: "POST",
        body: {
          requestId: item.question.requestId || item.question.id,
          answer: item.answer,
        },
      });
      appendImportLog(`Planning answer accepted by runtime project=${activeProject.id} question=${item.question.id} next=${nextStatus.currentQuestion?.id || "agent"}`);
      applyImportOnboardingStatus(activeProject, nextStatus);
      setLastPlanningAnswer(answerSummary);
      setPlanningActivity("Answer sent to the planning agent");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [
        "Answer sent to the planning agent",
        "Preparing the next Codex import-planning turn",
      ]));
      clearPlanningQuestions();
      setPlanningInterviewStatus("waiting_for_question");
      setStatus("Planning answer sent");
      void waitForImportOnboardingRuntime(activeProject);
      appendImportLog(`Planning answer submitted session=${first.question.sessionId || "none"} questions=${trimmedAnswers.length}`);
      return;
    } else if (first.question.sessionId) {
      const response = `hyperwiki planning answer: ${answerSummary}\n\nContinue the source-grounded planning interview. Emit the next question as JSON with question, recommendedAnswer, reasoning, and options, or create the MVP plan if no blocking unknowns remain.`;
      await sendPasteSubmitInput(first.question.sessionId, response);
      appendImportLog(`Planning answer sent to terminal session=${first.question.sessionId} questions=${trimmedAnswers.length} chars=${response.length}`);
    }
    if (!first.question.sessionId) {
      appendImportLog(`Planning answer has no terminal session questions=${trimmedAnswers.length}`);
    }
    appendImportLog(`Planning answer submitted session=${first.question.sessionId || "none"} questions=${trimmedAnswers.length}`);
    setLastPlanningAnswer(answerSummary);
    setPlanningActivity("Answer sent to the planning agent");
    setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Answer sent to the planning agent"]));
    clearPlanningQuestions();
    setPlanningInterviewStatus((current) => current === "answering" ? "waiting_for_question" : current);
    setStatus("Planning answer sent");
  }

  function applyImportPlanningStatus(nextStatus: ImportPlanningStatus, projectId = activeProject?.id || "") {
    setActiveProject((current) => current ? { ...current, importPlanning: nextStatus } : current);
    setProjects((current) => updateProjectImportPlanning(current, projectId, nextStatus));
    if (nextStatus.currentQuestion) {
      setPlanningQuestions([importPlanningQuestionToPlanningQuestion(nextStatus.currentQuestion)]);
      setPlanningInterviewStatus("question_ready");
      setPlanningActivity(nextStatus.nextAction);
      return;
    }
    clearPlanningQuestions();
    setPlanningInterviewStatus(nextStatus.status === "complete" ? "idle" : "waiting_for_question");
    setPlanningActivity(nextStatus.nextAction);
  }

  async function sendAgentPromptToProject(project: ProjectRecord | null, prompt: string, currentPage = currentWikiPath, scope = terminalScope, projectLayout = layout, knownSessions = sessions, options: { commandOverride?: string; forceNew?: boolean; requestId?: string } = {}) {
    const session = await ensureAgentSessionForProject(project, projectLayout, scope, knownSessions, { commandOverride: options.commandOverride, forceNew: options.forceNew, purpose: "general", promote: !options.forceNew });
    const ready = await waitForAgentPromptReady(session.id);
    appendImportLog(`Agent prompt readiness session=${session.id} ready=${ready}`);
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        appendImportLog(`Agent prompt submit attempt=${attempt + 1} session=${session.id} scope=${scope.scope}`);
        await hyperwikiApi.json(withProjectQuery("/api/agent/prompt", project), {
          method: "POST",
          body: {
            prompt,
            currentPage: displayWikiPath(currentPage),
            requestId: options.requestId || "",
            sessionId: session.id,
            scope: scope.scope,
          },
        });
        appendImportLog(`Agent prompt submit ok attempt=${attempt + 1} session=${session.id}`);
        return session;
      } catch (error) {
        lastError = error;
        appendImportLog(`Agent prompt submit failed attempt=${attempt + 1} session=${session.id}`, error);
        await delay(250);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Agent unavailable.");
  }

  async function sendTrackedAgentPrompt(
    kind: AgentRunKind,
    label: string,
    prompt: string,
    currentPage = currentWikiPath,
    scope = terminalScope,
    projectLayout = layout,
    knownSessions = sessions,
    existingRunId?: string,
    options: { forceNewSession?: boolean; project?: ProjectRecord | null; targetSessionId?: string } = {},
  ) {
    const runId = existingRunId || startAgentRun(kind, label);
    const promptProject = options.project || activeProject;
    const handoffStartedAt = Date.now();
    appendImportLog(`Agent handoff start kind=${kind} label=${label} project=${promptProject?.id || "none"} scope=${scope.scope} forceNew=${options.forceNewSession ? "yes" : "no"} targetSession=${options.targetSessionId || "none"}`);
    try {
      const agentPurpose = kind === "modify" ? "modify" : "general";
      let session: SessionRecord;
      if (options.targetSessionId) {
        if (!promptProject) throw new Error("Project not found for agent planning.");
        const target = [...knownSessions, ...sessions].find((candidate) => candidate.id === options.targetSessionId);
        if (!target || !isReusableVisibleExecuteAgentSession(target)) {
          throw new Error("Selected agent terminal is no longer available.");
        }
        session = await retargetAgentSession(promptProject, options.targetSessionId, scope, agentPurpose);
      } else {
        session = await ensureAgentSessionForProject(promptProject, projectLayout, scope, knownSessions, { forceNew: options.forceNewSession, purpose: agentPurpose, promote: kind === "modify" || (!options.forceNewSession && agentPurpose === "general") });
      }
      appendImportLog(`Agent handoff session ready kind=${kind} session=${session.id} elapsedMs=${Date.now() - handoffStartedAt}`);
      updateAgentRun(runId, {
        sessionId: session.id,
        phase: "waiting",
        activity: "Waiting for the agent prompt",
        lines: ["Agent session started", "Waiting for the agent prompt"],
        transcript: "Agent session started\nWaiting for the agent prompt",
      });
      const readinessOptions = kind === "modify"
        ? { maxAttempts: 8, intervalMs: 250, reason: "modify-submit" }
        : kind === "execute"
          ? { maxAttempts: 60, intervalMs: 250, reason: "execute-submit" }
          : undefined;
      const ready = await waitForAgentPromptReady(session.id, readinessOptions);
      appendImportLog(`Agent prompt readiness session=${session.id} ready=${ready} kind=${kind} maxAttempts=${readinessOptions?.maxAttempts || 120} elapsedMs=${Date.now() - handoffStartedAt}`);
      updateAgentRun(runId, {
        phase: "sent",
        activity: ready ? "Sending prompt to agent" : "Sending prompt after readiness timeout",
        lines: ready ? ["Agent session started", "Prompt ready", "Sending prompt to agent"] : ["Agent session started", "Prompt readiness timed out", "Sending prompt to agent"],
        transcript: ready ? "Agent session started\nPrompt ready\nSending prompt to agent" : "Agent session started\nPrompt readiness timed out\nSending prompt to agent",
      });
      let lastError: unknown;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          appendImportLog(`Agent prompt submit attempt=${attempt + 1} session=${session.id} scope=${scope.scope} elapsedMs=${Date.now() - handoffStartedAt}`);
          await hyperwikiApi.json(withProjectQuery("/api/agent/prompt", promptProject), {
            method: "POST",
            body: {
              prompt,
              currentPage: displayWikiPath(currentPage),
              sessionId: session.id,
              scope: scope.scope,
            },
          });
          appendImportLog(`Agent prompt submit ok attempt=${attempt + 1} session=${session.id} elapsedMs=${Date.now() - handoffStartedAt}`);
          armAgentCompletion(session, label);
          if (kind === "execute" && promptProject) {
            scheduleGeneralAgentPrewarmRefill(promptProject, projectLayout, scope, "execute-submit");
          }
          updateAgentRun(runId, {
            phase: "sent",
            activity: "Prompt sent; waiting for agent activity",
            lines: ["Agent session started", "Prompt sent; waiting for agent activity"],
            transcript: "Agent session started\nPrompt sent; waiting for agent activity",
          });
          return session;
        } catch (error) {
          lastError = error;
          appendImportLog(`Agent prompt submit failed attempt=${attempt + 1} session=${session.id}`, error);
          await delay(250);
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Agent unavailable.");
    } catch (error) {
      updateAgentRun(runId, {
        phase: "blocked",
        activity: error instanceof Error ? error.message : "Agent run could not start",
        outcome: error instanceof Error ? error.message : "Agent run could not start",
      });
      throw error;
    }
  }

  async function openVisibleAgentPromptSession(options: {
    kind: AgentRunKind;
    label: string;
    prompt: string;
    currentPage: string;
    scope: TerminalScope;
    targetRoute?: ViewRoute;
    forceNewSession?: boolean;
    runId?: string;
    project?: ProjectRecord | null;
  }) {
    const promptProject = options.project || activeProject;
    if (options.targetRoute) {
      latestTerminalContext.current = { projectId: promptProject?.id || "", scope: normalizeTerminalScope(options.scope).scope };
      appendImportLog(`Visible agent prompt route kind=${options.kind} page=${options.currentPage} scope=${options.scope.scope}`);
      setRoute(options.targetRoute);
      window.history.pushState(null, "", urlForRoute(options.targetRoute, promptProject));
    }
    setIsWorkspaceExpanded(false);
    if (options.kind === "planning") {
      setResumedImportPlanningProjectId(null);
      clearPlanningQuestions();
      setPlanningInterviewStatus("idle");
    }
    appendImportLog(`Opening visible agent prompt kind=${options.kind} label=${options.label} page=${options.currentPage} scope=${options.scope.scope} forceNew=${options.forceNewSession ? "yes" : "no"}`);
    return sendTrackedAgentPrompt(
      options.kind,
      options.label,
      options.prompt,
      options.currentPage,
      options.scope,
      layout,
      sessions,
      options.runId,
      { forceNewSession: options.forceNewSession, project: promptProject },
    );
  }

  async function startTerminalImportPlanning(project: ProjectRecord, reason: "create-project" | "pending-import" | "switch-project" | "resume" | "retry" = "create-project") {
    const projectRoute: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" };
    const projectScope = scopeForRoute(projectRoute);
    appendImportLog(`Terminal import planning start project=${project.id} reason=${reason}`);
    clearPlanningQuestions();
    setPlanningInterviewStatus("idle");
    setPlanningActivity("Import planning is running in the terminal.");
    setPlanningWorkstream(["Import planning is running in the terminal."]);
    openImportedPlanningWorkspace(project, projectRoute);
    const loaded = await loadProjectData(project);
    const knownSessions = await loadSessionsForProject(project, projectScope);
    await openVisibleAgentPromptSession({
      kind: "planning",
      label: "Import Planning",
      prompt: terminalImportPlanningPrompt(project),
      currentPage: "/wiki/plans/index.mdx",
      scope: projectScope,
      targetRoute: projectRoute,
      forceNewSession: true,
      project,
      runId: `import-planning-${Date.now()}`,
    });
    appendImportLog(`Terminal import planning prompt sent project=${project.id} reason=${reason} sessions=${knownSessions.length} pages=${loaded.pages.length}`);
  }

  async function planImportedProject(project: ProjectRecord) {
    const key = `${project.id}:import-qna`;
    if (importedPlanningCompletedKeys.current.has(key)) {
      appendImportLog(`Imported Q&A start allowed as retry despite previous turn project=${project.id}`);
      importedPlanningCompletedKeys.current.delete(key);
    }
    const inFlight = importedPlanningRuns.current.get(key);
    if (inFlight) {
      appendImportLog(`Imported Q&A start joined in-flight run project=${project.id}`);
      await inFlight;
      return;
    }
    try {
      await startImportOnboardingRuntime(project, activeImportPlanningRun?.retryable || planningInterviewStatus === "failed" ? "retry" : "start");
    } catch (error) {
      appendImportLog(`Imported Q&A start failed project=${project.id}`, error);
      throw error;
    }
  }

  async function prewarmImportOnboarding(project: ProjectRecord, reason: string) {
    try {
      const result = await hyperwikiApi.json<ImportOnboardingPrewarmResponse>(withProjectQuery("/api/import-onboarding/prewarm", project), {
        method: "POST",
      });
      appendImportLog(`Imported Q&A prewarm ${reason} project=${project.id} provider=${result.providerReady} thread=${result.threadReady} elapsedMs=${result.elapsedMs}`);
    } catch (error) {
      appendImportLog(`Imported Q&A prewarm failed ${reason} project=${project.id}`, error);
    }
  }

  async function cancelActiveImportPlanningTurn() {
    const runId = activeImportPlanningRun?.runId || activeImportPlanningTurn.current?.runId || "";
    if (!activeProject) return;
    appendImportLog(`Imported Q&A cancel requested project=${activeProject.id} run=${runId || "runtime"}`);
    try {
      const cancelled = await hyperwikiApi.json<ImportOnboardingStatusResponse>(withProjectQuery("/api/import-onboarding/cancel", activeProject), {
        method: "POST",
      });
      applyImportOnboardingStatus(activeProject, cancelled);
      setPlanningInterviewStatus("idle");
      setPlanningActivity(cancelled.retryableFailure || "Import Q&A cancelled.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [cancelled.retryableFailure || "Import Q&A cancelled."]));
      setStatus("Imported project Q&A cancelled");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendImportLog(`Imported Q&A cancel failed project=${activeProject.id} run=${runId} error=${message}`, error);
      setPlanningActivity(`Cancel failed: ${message}`);
    }
  }

  async function startImportOnboardingRuntime(project: ProjectRecord, action: "start" | "retry" | "answer") {
    const key = `${project.id}:import-qna`;
    const inFlight = importedPlanningRuns.current.get(key);
    if (inFlight) {
      appendImportLog(`Imported Q&A runtime joined in-flight run project=${project.id} action=${action}`);
      await inFlight;
      return;
    }
    const run = (async () => {
      const projectRoute: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" };
      openImportedPlanningWorkspace(project, projectRoute);
      setPlanningInterviewStatus("starting");
      setPlanningActivity("Preparing import planning");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [
        action === "answer" ? "Answer sent to the planning agent" : action === "retry" ? "Retrying import planning" : "Preparing import planning",
        "Codex import-planning phase: starting",
      ]));
      setStatus("Imported project Q&A started");
      const endpoint = action === "retry" ? "/api/import-onboarding/retry" : "/api/import-onboarding/start";
      const started = await hyperwikiApi.json<ImportOnboardingStatusResponse>(withProjectQuery(endpoint, project), {
        method: "POST",
      });
      applyImportOnboardingStatus(project, started);
      await waitForImportOnboardingRuntime(project);
    })();
    importedPlanningRuns.current.set(key, run);
    try {
      await run;
    } finally {
      importedPlanningRuns.current.delete(key);
    }
  }

  async function waitForImportOnboardingRuntime(project: ProjectRecord) {
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= 360; attempt += 1) {
      await delay(500);
      const status = await hyperwikiApi.json<ImportOnboardingStatusResponse>(withProjectQuery("/api/import-onboarding/status", project));
      applyImportOnboardingStatus(project, status);
      if (attempt === 1 || attempt % 10 === 0 || status.session.status !== "running") {
        appendImportLog(`Imported Q&A runtime status project=${project.id} attempt=${attempt} status=${status.session.status} phase=${status.session.phase} elapsedMs=${Date.now() - startedAt}`);
      }
      if (status.currentQuestion) return;
      if (status.importPlanning.status === "complete") {
        importedPlanningCompletedKeys.current.add(`${project.id}:import-qna`);
        setPlanningInterviewStatus("idle");
        setPlanningActivity("Generated MVP plan is ready.");
        setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Generated MVP plan is ready."]));
        await loadProjectData(project);
        return;
      }
      if (status.session.status === "retryable_failure" || status.activeRun?.retryable) {
        setPlanningInterviewStatus("failed");
        setPlanningActivity(status.retryableFailure || "Planning runtime needs retry.");
        setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [status.retryableFailure || "Planning runtime needs retry."]));
        setStatus("Imported project Q&A needs retry");
        return;
      }
      if (!status.activeRun && status.session.status !== "running" && status.session.status !== "waiting_for_answer") return;
    }
    setPlanningInterviewStatus("stalled");
    setPlanningActivity("Import planning runtime timed out.");
    setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Import planning runtime timed out."]));
  }

  function applyImportOnboardingStatus(project: ProjectRecord, response: ImportOnboardingStatusResponse) {
    applyImportPlanningStatus(response.importPlanning, project.id);
    setActiveImportPlanningRun(response.activeRun || null);
    applyImportOnboardingEventLines(response.recentEvents || []);
    if (response.currentQuestion) {
      setPlanningQuestions([importPlanningQuestionToPlanningQuestion(response.currentQuestion)]);
      setPlanningInterviewStatus("question_ready");
      setPlanningActivity(response.importPlanning.nextAction || "Next planning question is ready.");
      return;
    }
    if (response.importPlanning.status === "complete") {
      clearPlanningQuestions();
      setPlanningInterviewStatus("idle");
      setPlanningActivity("Generated MVP plan is ready.");
      return;
    }
    if (response.session.status === "retryable_failure" || response.activeRun?.retryable) {
      clearPlanningQuestions();
      setPlanningInterviewStatus("failed");
      setPlanningActivity(response.retryableFailure || "Import planning needs retry.");
      return;
    }
    if (response.session.status === "running" || response.activeRun?.status === "running") {
      clearPlanningQuestions();
      const phase = response.activeRun?.phase || response.session.phase;
      setPlanningInterviewStatus(phase === "streaming" ? "streaming" : "waiting_for_question");
      setPlanningActivity(importOnboardingPhaseLabel(phase));
      return;
    }
  }

  function applyImportOnboardingEventLines(events: ImportOnboardingEventRecord[]) {
    const lines: string[] = [];
    for (const event of events.slice(-12)) {
      const key = `runtime:${event.seq}:${event.kind}:${event.phase}:${event.message}:${event.detail || ""}`;
      if (importTurnSnapshotLineKeys.current.has(key)) continue;
      importTurnSnapshotLineKeys.current.add(key);
      lines.push(event.message);
      if (event.detail) {
        lines.push(...event.detail.split("\n").map((line) => line.trim()).filter(Boolean));
      }
    }
    if (lines.length) setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, lines));
  }

  async function loadImportPlanningSourceContext(project: ProjectRecord) {
    const sourcePaths = [
      "/wiki/sources/import-state.mdx",
      "/wiki/sources/import-qna.mdx",
      "/wiki/sources/import.mdx",
      "/wiki/sources/prd.mdx",
      "/wiki/sources/technical-brief.mdx",
      "/wiki/sources/design-brief.mdx",
      "/wiki/plans/index.mdx",
    ];
    const settled = await Promise.allSettled(sourcePaths.map(async (path) => {
      const source = await hyperwikiApi.json<WikiSourceResponse>(withProjectQuery(`/api/wiki/source?path=${encodeURIComponent(path)}`, project));
      return { path, markdown: source.markdown || source.source || "" };
    }));
    const chunks: string[] = [];
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const markdown = result.value.markdown.replace(/\s+\n/g, "\n").trim();
      if (!markdown) continue;
      chunks.push(`## ${result.value.path}\n${markdown.slice(0, 3600)}`);
    }
    const context = chunks.join("\n\n---\n\n").slice(0, 18000);
    appendImportLog(`Imported Q&A source context loaded project=${project.id} sources=${chunks.length} chars=${context.length}`);
    return context;
  }

  async function startImportPlanningTurn(project: ProjectRecord, reason: "initial" | "answer" | "retry" | "repair" | "plan" | "plan_repair", answer = "", answeredQuestionId = "") {
    const key = `${project.id}:import-qna`;
    if ((reason === "initial" || reason === "retry") && revealNextImportScriptQuestion(project)) {
      appendImportLog(`Imported Q&A start reused staged script project=${project.id} reason=${reason}`);
      return;
    }
    const inFlight = importedPlanningRuns.current.get(key);
    if (inFlight) {
      appendImportLog(`Imported Q&A turn joined in-flight run project=${project.id} reason=${reason}`);
      await inFlight;
      return;
    }
    const projectRoute: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" };
    const projectScope = scopeForRoute(projectRoute);
    const requestId = `import-turn:${reason}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const run = (async () => {
      const existingSessions = await loadSessionsForProject(project, projectScope);
      appendImportLog(`Imported Q&A turn start project=${project.id} request=${requestId} reason=${reason} previousSessions=${existingSessions.length} answerChars=${answer.length}`);
      setPlanningInterviewStatus("starting");
      setPlanningActivity("Preparing import planning");
      setActiveImportPlanningRun(null);
      importTurnSnapshotLineKeys.current.clear();
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Preparing import planning"]));
      openImportedPlanningWorkspace(project, projectRoute);
      await loadProjectData(project);
      const nextSessions = await loadSessionsForProject(project, projectScope);
      const sourceContext = reason === "initial" || reason === "retry" ? await loadImportPlanningSourceContext(project) : "";
      const prompt = reason === "initial" || reason === "retry"
        ? importedProjectQuestionScriptPrompt(project, requestId, sourceContext)
        : reason === "plan"
          ? importedProjectPlanGenerationPrompt(project, requestId, answer)
          : reason === "plan_repair"
            ? importedProjectPlanRepairPrompt(project, requestId, answer)
        : reason === "repair"
          ? importedProjectPlanningRepairPrompt(project, requestId, answer, answeredQuestionId)
          : importedProjectPlanningPrompt(project, requestId, answer, answeredQuestionId);
      appendImportLog(`Imported Q&A sending app-server turn project=${project.id} request=${requestId} scope=${projectScope.scope} sessions=${nextSessions.length}`);
      activeImportPlanningTurn.current = { projectId: project.id, requestId, sessionId: "codex-app-server" };
      setPlanningInterviewStatus("waiting_for_question");
      setPlanningActivity(reason === "initial" || reason === "retry"
        ? "Codex is generating the planning question script"
        : reason === "plan" || reason === "plan_repair"
          ? "Planning agent is writing the MVP plan"
          : reason === "repair" ? "Planning agent is repairing the previous incomplete turn" : "Planning agent is working on the next question");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, reason === "initial" || reason === "retry"
        ? ["Codex app-server script turn started", "Using inline source context", "Waiting for the first structured question"]
        : reason === "plan" || reason === "plan_repair"
          ? ["Codex app-server plan generation turn started", "Waiting for validated MVP plan artifacts"]
        : reason === "repair"
          ? ["Codex app-server repair turn started", "Previous turn produced no question or plan files", "Waiting for a generated plan or one structured question"]
        : ["Codex app-server turn started", "Waiting for the next structured question"]));
      setStatus("Imported project Q&A started");
      try {
        const started = await hyperwikiApi.json<CodexImportTurnStartResponse>(withProjectQuery("/api/import-planning/turn", project), {
          method: "POST",
          body: {
            prompt,
            currentPage: "/wiki/plans/index.mdx",
            requestId,
          },
        });
        activeImportPlanningTurn.current = { projectId: project.id, requestId, runId: started.runId, sessionId: "codex-app-server" };
        setActiveImportPlanningRun(started.run || null);
        appendImportLog(`Imported Q&A app-server turn accepted project=${project.id} request=${requestId} run=${started.runId}`);
        const turn = await waitForImportPlanningTurn(project, started.runId, requestId);
        appendImportLog(`Imported Q&A app-server turn complete project=${project.id} request=${requestId} thread=${turn.threadId} turn=${turn.turnId} chars=${turn.text.length} firstDeltaMs=${turn.firstDeltaMs ?? "none"} elapsedMs=${turn.elapsedMs} events=${turn.events}`);
        await handleImportPlanningTurnText(project, turn.threadId || "codex-app-server", requestId, turn.text, answeredQuestionId);
      } catch (error) {
        clearActiveImportPlanningTurn(requestId);
        const message = error instanceof Error ? error.message : String(error);
        appendImportLog(`Imported Q&A app-server turn failed project=${project.id} request=${requestId} error=${message}`, error);
        if (message.toLowerCase().includes("cancelled")) {
          setPlanningInterviewStatus("idle");
          setPlanningActivity("Import Q&A cancelled.");
          setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Import Q&A cancelled."]));
          setStatus("Imported project Q&A cancelled");
          return;
        }
        if (error instanceof ImportPlanningProtocolError) {
          setPlanningInterviewStatus(error.phase);
          setPlanningActivity(message);
          setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [message, ...(error.tail ? [`Last output: ${error.tail.slice(-360)}`] : [])]));
          setStatus(error.phase === "stalled" ? "Imported project Q&A stalled" : "Imported project Q&A needs retry");
        } else {
          setPlanningInterviewStatus("idle");
          setPlanningActivity(`Codex app-server import turn failed: ${message}`);
          setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [`Codex app-server import turn failed: ${message}`]));
          setStatus("Imported project Q&A app-server failed");
        }
      }
    })();
    importedPlanningRuns.current.set(key, run);
    try {
      await run;
    } catch (error) {
      appendImportLog(`Imported Q&A turn failed project=${project.id} request=${requestId}`, error);
      throw error;
    } finally {
      importedPlanningRuns.current.delete(key);
    }
  }

  async function waitForImportPlanningTurn(project: ProjectRecord, runId: string, requestId: string) {
    const startedAt = Date.now();
    let loggedActiveMismatch = false;
    for (let attempt = 1; attempt <= 360; attempt += 1) {
      await delay(500);
      const activeTurn = activeImportPlanningTurn.current;
      if (activeTurn && activeTurn.projectId === project.id && activeTurn.requestId !== requestId && !loggedActiveMismatch) {
        loggedActiveMismatch = true;
        appendImportLog(`Imported Q&A continuing backend run despite active ref mismatch project=${project.id} request=${requestId} active=${activeTurn.requestId} run=${runId}`);
      }
      const status = await hyperwikiApi.json<CodexImportTurnStatusResponse>(withProjectQuery(`/api/import-planning/turn-status?runId=${encodeURIComponent(runId)}`, project));
      if (status.run) setActiveImportPlanningRun(status.run);
      if (attempt === 1 || attempt % 10 === 0 || status.status !== "running") {
        appendImportLog(`Imported Q&A app-server status project=${project.id} request=${requestId} run=${runId} attempt=${attempt} status=${status.status} elapsedMs=${Date.now() - startedAt}`);
      }
      if (status.status === "complete" && status.response) return status.response;
      if (status.status === "cancelled") {
        throw new Error(status.error || "Import onboarding run cancelled.");
      }
      if (status.status === "failed") {
        const phase = status.phase === "stalled" ? "stalled" : "failed";
        throw new ImportPlanningProtocolError(phase, status.error || "Codex app-server import turn failed.", status.snapshot?.textTail || "");
      }
      if (status.snapshot) {
        applyImportTurnSnapshot(status.snapshot);
        const plain = terminalTextForParsing(status.snapshot.text || status.snapshot.textTail || "");
        const diagnostics = planningQuestionExtractionDiagnostics(plain, "codex-app-server", answeredPlanningQuestionIds.current, requestId);
        if (diagnostics.questions.length) {
          appendImportLog(`Imported Q&A app-server partial question ready project=${project.id} request=${requestId} ids=${diagnostics.questions.map((question) => question.id).join(",")} batch=${diagnostics.questions.length}`);
          return {
            ok: true,
            transport: "codex-app-server",
            projectId: project.id,
            requestId,
            threadId: "codex-app-server",
            turnId: status.snapshot.turnId || "partial",
            text: plain,
            firstDeltaMs: status.snapshot.firstDeltaMs ?? null,
            elapsedMs: status.snapshot.elapsedMs,
            planDetected: false,
            events: status.snapshot.events,
          };
        }
        if (status.snapshot.firstDeltaMs && status.snapshot.elapsedMs >= 60000) {
          throw new ImportPlanningProtocolError("schema_mismatch", "Codex returned text, but not a valid hyperwiki planning question within 60 seconds.", status.snapshot.textTail || plain.slice(-1200));
        }
      }
    }
    throw new Error("Codex app-server import turn timed out.");
  }

  function applyImportTurnSnapshot(snapshot: CodexImportTurnSnapshot) {
    const isWaitingPhase = [
      "thread_ready",
      "turn_requested",
      "turn_started",
      "waiting_for_first_event",
      "waiting_for_assistant",
      "exec_json_fallback",
    ].includes(snapshot.phase);
    const phase = isWaitingPhase ? "waiting_for_question" : snapshot.phase === "streaming" ? "streaming" : planningInterviewStatus;
    if (phase === "waiting_for_question" || phase === "streaming") setPlanningInterviewStatus(phase);
    const label = importTurnSnapshotLabel(snapshot);
    if (label) setPlanningActivity(label);
    const eventLines = snapshot.eventLog?.length
      ? snapshot.eventLog.map((line) => `event: ${line}`)
      : snapshot.events ? [`events observed: ${snapshot.events}`] : [];
    const lines = [
      label,
      ...eventLines,
      snapshot.firstDeltaMs ? `First assistant text: ${snapshot.firstDeltaMs}ms` : "",
      snapshot.candidateCount ? `Structured candidates seen: ${snapshot.candidateCount}` : "",
      snapshot.textTail ? `assistant: ${compactPlanningActivityText(snapshot.textTail, 360)}` : "",
    ].filter(Boolean);
    const freshLines = lines.filter((line) => {
      const key = `${snapshot.phase}:${line}`;
      if (importTurnSnapshotLineKeys.current.has(key)) return false;
      importTurnSnapshotLineKeys.current.add(key);
      return true;
    });
    if (freshLines.length) setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, freshLines));
  }

  async function handleImportPlanningTurnText(project: ProjectRecord, sessionId: string, requestId: string, text: string, answeredQuestionId = "") {
    const [wikiResult, projectsResult] = await Promise.allSettled([
      hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", project)),
      hyperwikiApi.json<ProjectListResponse>(withProjectQuery("/api/projects", project)),
    ]);
    const pages = wikiResult.status === "fulfilled" ? wikiResult.value.pages || [] : wikiPages;
    if (wikiResult.status === "fulfilled") setWikiPages(pages);
    if (projectsResult.status === "fulfilled") setProjects(projectsResult.value);
    const latestProject = projectsResult.status === "fulfilled"
      ? findActiveProject(projectsResult.value, unavailableProjectIds, {
        projectSlug: project.projectSlug,
        worktreeSlug: project.worktreeSlug,
      }) || project
      : project;
    const planning = importedPlanningState({ kind: "wiki", path: "/wiki/plans/index.mdx" }, pages);
    if (latestProject.importPlanning?.status === "needsRepair") {
      appendImportLog(`Imported Q&A app-server plan validation failed project=${project.id} request=${requestId} errors=${latestProject.importPlanning.artifactValidation?.errors.length || 0}`);
      clearActiveImportPlanningTurn(requestId);
      setPlanningInterviewStatus("failed");
      setPlanningActivity(latestProject.importPlanning.nextAction);
      setPlanningWorkstream(importArtifactValidationLines(latestProject.importPlanning));
      setStatus("Imported project plan needs repair");
      return;
    }
    if (importPlanArtifactsAreComplete(latestProject, planning.generatedPlanPaths)) {
      appendImportLog(`Imported Q&A app-server plan detected project=${project.id} request=${requestId} generatedPlanCount=${planning.generatedPlanPaths.length}`);
      clearActiveImportPlanningTurn(requestId);
      importedPlanningCompletedKeys.current.add(`${project.id}:import-qna`);
      setPlanningInterviewStatus("idle");
      setPlanningActivity("Generated MVP plan is ready.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Generated MVP plan is ready."]));
      return;
    }
    const plain = terminalTextForParsing(text);
    const diagnostics = planningQuestionExtractionDiagnostics(plain, sessionId, answeredPlanningQuestionIds.current, requestId);
    appendImportLog(`Imported Q&A app-server extraction project=${project.id} request=${requestId} blocks=${diagnostics.codeBlocks} rawObjects=${diagnostics.rawObjects} candidates=${diagnostics.candidateIds.length} ignored=${diagnostics.ignoredRequestIds.join(",") || "none"} unanswered=${diagnostics.questions.map((question) => question.id).join(",") || "none"} tail=${JSON.stringify(plain.slice(-180))}`);
    const nextQuestions = diagnostics.questions.filter((question) => question.id !== answeredQuestionId);
    if (nextQuestions.length) {
      clearActiveImportPlanningTurn(requestId);
      appendImportLog(`Imported Q&A app-server question ready project=${project.id} request=${requestId} ids=${nextQuestions.map((question) => question.id).join(",")} batch=${nextQuestions.length}`);
      if (requestId.includes(":initial:") && nextQuestions.length > 1) {
        stageImportQuestionScript(project, nextQuestions);
        return;
      }
      setPlanningInterviewStatus("question_ready");
      await setImportPlanningQuestions(project, nextQuestions);
      setPlanningActivity("Next planning question is ready.");
      return;
    }
    const readyToPlan = extractLatestReadyToPlanSignal(plain, requestId);
    if (readyToPlan && !requestId.includes(":plan:") && !requestId.includes(":plan_repair:")) {
      clearActiveImportPlanningTurn(requestId);
      appendImportLog(`Imported Q&A ready-to-plan project=${project.id} request=${requestId} reasoning=${JSON.stringify(readyToPlan.reasoning.slice(0, 180))}`);
      setPlanningInterviewStatus("waiting_for_question");
      setPlanningActivity("Planning decisions are complete; generating the MVP plan.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [
        "Structured ready-to-plan signal received.",
        readyToPlan.reasoning ? `ready-to-plan: ${readyToPlan.reasoning}` : "Starting MVP plan generation.",
      ]));
      window.setTimeout(() => {
        void startImportPlanningTurn(project, "plan", readyToPlan.planIntent || plain.slice(-1200), answeredQuestionId);
      }, 0);
      return;
    }
    if (requestId.includes(":plan:")) {
      clearActiveImportPlanningTurn(requestId);
      appendImportLog(`Imported Q&A plan generation missing artifacts project=${project.id} request=${requestId} tail=${JSON.stringify(plain.slice(-240))}`);
      setPlanningInterviewStatus("waiting_for_question");
      setPlanningActivity("Plan generation finished without validated artifacts; running one plan repair.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [
        "Plan generation completed without validated MVP plan artifacts.",
        "Starting one plan repair turn.",
      ]));
      window.setTimeout(() => {
        void startImportPlanningTurn(project, "plan_repair", plain.slice(-1200), answeredQuestionId);
      }, 0);
      return;
    }
    if (requestId.includes(":plan_repair:")) {
      clearActiveImportPlanningTurn(requestId);
      setPlanningInterviewStatus("failed");
      setPlanningActivity("Codex plan repair did not produce validated MVP plan artifacts.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Plan repair completed without validated MVP plan artifacts."]));
      setStatus("Imported project plan repair failed");
      return;
    }
    if (shouldAutoRepairImportPlanningDrift(requestId, plain)) {
      clearActiveImportPlanningTurn(requestId);
      appendImportLog(`Imported Q&A app-server repair queued project=${project.id} request=${requestId} tail=${JSON.stringify(plain.slice(-240))}`);
      setPlanningInterviewStatus("waiting_for_question");
      setPlanningActivity("Planning agent finished without a question or plan; running one repair turn.");
      setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, [
        "Planning turn completed without a parseable question or generated plan.",
        "Starting one repair turn to create the plan or ask the next question.",
      ]));
      window.setTimeout(() => {
        void startImportPlanningTurn(project, "repair", plain.slice(-1200), answeredQuestionId);
      }, 0);
      return;
    }
    clearActiveImportPlanningTurn(requestId);
    setPlanningInterviewStatus("idle");
    setPlanningActivity("Planning agent did not produce a question or validated plan. Use Start Q&A to retry.");
    setPlanningWorkstream((current) => appendPlanningWorkstreamLines(current, ["Planning turn completed without a parseable question or generated plan."]));
    setStatus("Imported project Q&A needs retry");
  }

  function resumeImportPlanning() {
    if (!activeProject) return;
    const nextRoute: ViewRoute = { kind: "wiki", path: defaultWikiPath };
    setResumedImportPlanningProjectId(activeProject.id);
    setRoute(nextRoute);
    window.history.pushState(null, "", urlForRoute(nextRoute, activeProject));
    void startTerminalImportPlanning(activeProject, "resume");
  }

  function openImportedPlanningWorkspace(project: ProjectRecord, route: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" }) {
    setActiveProject(project);
    setIsProjectsOpen(false);
    setRoute(route);
    window.history.pushState(null, "", urlForRoute(route, project));
  }

  async function submitExecuteUnitPrompt(
    prompt: string,
    executionPage: string,
    executionScope: TerminalScope,
    options: { targetSessionId?: string; forceNewSession?: boolean } = {},
  ) {
    await sendTrackedAgentPrompt(
      "execute",
      "Execute Unit",
      prompt,
      executionPage,
      executionScope,
      layout,
      sessions,
      undefined,
      { targetSessionId: options.targetSessionId, forceNewSession: options.forceNewSession },
    );
    setStatus("Execute prompt sent");
  }

  async function stageExecuteUnitPrompt(payload?: Record<string, string>) {
    const normalizedCurrentPage = displayWikiPath(currentWikiPath);
    const executionPage = activePlanState.currentPath || normalizedCurrentPage;
    const executionScope = scopeForRoute({ kind: "wiki", path: executionPage });
    const prompt = workflowPrompt("execute-main", workspace, wikiPages, executionPage, payload?.prompt || "");
    const candidateSession = selectExecuteAgentReuseCandidate(sessions, activeSessionId);
    if (candidateSession) {
      setPendingExecuteAgentConfirmation({
        candidateSession,
        currentPage: executionPage,
        prompt,
        scope: executionScope,
      });
      setStatus("Choose Execute agent terminal");
      return true;
    }
    await submitExecuteUnitPrompt(prompt, executionPage, executionScope);
    return true;
  }

  async function confirmExecuteInCurrentAgent() {
    const pending = pendingExecuteAgentConfirmation;
    if (!pending) return;
    setPendingExecuteAgentConfirmation(null);
    try {
      await submitExecuteUnitPrompt(pending.prompt, pending.currentPage, pending.scope, { targetSessionId: pending.candidateSession.id });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Execute prompt failed");
    }
  }

  async function confirmExecuteInNewAgent() {
    const pending = pendingExecuteAgentConfirmation;
    if (!pending) return;
    setPendingExecuteAgentConfirmation(null);
    try {
      await submitExecuteUnitPrompt(pending.prompt, pending.currentPage, pending.scope, { forceNewSession: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Execute prompt failed");
    }
  }

  function cancelExecuteAgentConfirmation() {
    setPendingExecuteAgentConfirmation(null);
    setStatus("Execute canceled");
  }

  async function runCommandAction(action: CommandAction, payload?: Record<string, string>) {
    setStatus(`Running ${action}`);
    try {
      if (action === "execute-main") {
        await stageExecuteUnitPrompt(payload);
        return;
      }
      if (action === "modify") {
        const normalizedCurrentPage = displayWikiPath(currentWikiPath);
        const executionPage = normalizedCurrentPage;
        const executionScope = terminalScope;
        const prompt = workflowPrompt(action, workspace, wikiPages, executionPage, payload?.prompt || "");
        await sendTrackedAgentPrompt(
          "modify",
          "Modify Plan",
          prompt,
          executionPage,
          executionScope,
          layout,
          sessions,
          undefined,
          {},
        );
        setStatus("Modify prompt sent");
      }
      if (action === "execute-worktree") {
        const runId = startAgentRun("worktree", "Run Dev Worktree");
        const branch = payload?.branch || `feature/${slugify(activePlanState.currentTitle || titleForPath(currentWikiPath, wikiPages))}`;
        updateAgentRun(runId, { activity: `Creating worktree ${branch}`, lines: [`Creating worktree ${branch}`], transcript: `Creating worktree ${branch}` });
        const result = await hyperwikiApi.json<{ branch?: string; path?: string; previewUrl?: string; project?: ProjectRecord }>(withProjectQuery("/api/worktrees", activeProject), {
          method: "POST",
          body: { branch },
        });
        await loadBaseData();
        await sendTrackedAgentPrompt("worktree", "Run Dev Worktree", existingWorktreePrompt(workspace, currentWikiPath, result), currentWikiPath, terminalScope, layout, sessions, runId);
        setStatus(`Worktree ready: ${result.branch || branch}`);
      }
      if (action === "review" && payload?.workflowId) {
        const runId = startAgentRun("review", "Review Workflow");
        const session = await ensureAgentSession();
        updateAgentRun(runId, {
          sessionId: session.id,
          phase: "sent",
          activity: "Review prompt sent; waiting for agent activity",
          lines: ["Agent session started", "Review prompt sent; waiting for agent activity"],
          transcript: "Agent session started\nReview prompt sent; waiting for agent activity",
        });
        await hyperwikiApi.json(withProjectQuery("/api/review-workflows/run", activeProject), {
          method: "POST",
          body: {
            workflowId: payload.workflowId,
            currentPage: currentWikiPath,
            scope: terminalScope.scope,
          },
        });
        armAgentCompletion(session, "Review Workflow");
        setStatus("Review prompt sent");
      }
      if (action === "new-plan") {
        const planIndexRoute: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" };
        const planScope = scopeForRoute(planIndexRoute);
        await openVisibleAgentPromptSession({
          kind: "planning",
          label: "Create Plan",
          prompt: planCreationPrompt(activeProject),
          currentPage: planIndexRoute.path,
          scope: planScope,
          targetRoute: planIndexRoute,
          forceNewSession: true,
        });
        setStatus("Plan creation terminal started");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function closeSession(sessionId: string) {
    const localSession = sessions.find((session) => session.id === sessionId);
    if (localSession && isPendingTerminalSession(localSession)) {
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setActiveSessionId((currentActive) => currentActive === sessionId ? selectActiveSessionId(sessions.filter((session) => session.id !== sessionId), null, null) : currentActive);
      setStatus("Session closed");
      return;
    }
    setStatus("Closing session");
    try {
      let response = await hyperwikiApi.request(withProjectQuery(`/api/terminal/${encodeURIComponent(sessionId)}`, activeProject), { method: "DELETE" });
      if (!response.ok) {
        response = await hyperwikiApi.request(withProjectQuery(`/api/sessions/${encodeURIComponent(sessionId)}`, activeProject), { method: "DELETE" });
      }
      if (!response.ok) throw new Error(response.text || `Request failed: ${response.status}`);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      await loadSessions();
      setStatus("Session closed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function closeSessionQuietly(project: ProjectRecord, sessionId: string) {
    try {
      let response = await hyperwikiApi.request(withProjectQuery(`/api/terminal/${encodeURIComponent(sessionId)}`, project), { method: "DELETE" });
      if (!response.ok) {
        response = await hyperwikiApi.request(withProjectQuery(`/api/sessions/${encodeURIComponent(sessionId)}`, project), { method: "DELETE" });
      }
      if (response.ok) await loadSessionsForProject(project, terminalScope);
    } catch (error) {
      appendImportLog(`Quiet session close failed project=${project.id} session=${sessionId}`, error);
    }
  }

  async function renameSession(sessionId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStatus("Renaming session");
    try {
      await hyperwikiApi.json(withProjectQuery(`/api/sessions/${encodeURIComponent(sessionId)}`, activeProject), {
        method: "PATCH",
        body: { name: trimmed },
      });
      await loadSessions();
      setStatus("Session renamed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function restartSession(session: SessionRecord) {
    setStatus("Restarting session");
    try {
      const restarted = await hyperwikiApi.json<TerminalStartResponse>(withProjectQuery("/api/terminal/start", activeProject), {
        method: "POST",
        body: {
          id: session.id,
          name: session.name,
          role: session.role,
          command: session.command,
          scope: session.scope || terminalScope.scope,
          scopeKind: session.scopeKind || terminalScope.scopeKind,
          planPath: session.planPath || terminalScope.planPath,
        },
      });
      if (activeProject) upsertTerminalSession(activeProject.id, restarted.session, { reason: "restart", select: true });
      await loadSessions({ selectSessionId: restarted.session.id });
      setStatus("Session attached");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function startDevTerminal() {
    const command = preview?.startCommand || "";
    if (!command.trim()) {
      setStatus(preview?.reason || "No dev command is configured.");
      return;
    }
    setStatus("Starting dev terminal");
    try {
      const started = await hyperwikiApi.json<DevLifecycleResponse>(withProjectQuery("/api/dev/start", activeProject), {
        method: "POST",
        body: {},
      });
      if (started.preview) setPreview(started.preview);
      if (activeProject && started.session) upsertTerminalSession(activeProject.id, started.session, { reason: "start-dev", select: true });
      await loadSessions({ selectSessionId: started.session?.id || preview?.managedSession?.id || null });
      setStatus(started.session ? `Dev started: ${command}` : started.preview?.reason || "Dev already running");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function stopDevTerminal() {
    setStatus("Stopping dev terminal");
    try {
      const result = await hyperwikiApi.json<DevLifecycleResponse>(withProjectQuery("/api/dev", activeProject), {
        method: "DELETE",
        body: {},
      });
      if (result.preview) setPreview(result.preview);
      await loadSessions();
      setStatus(result.stopped === false ? "Dev process was not stopped" : "Dev stopped");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function restartDevTerminal() {
    setStatus("Restarting dev terminal");
    try {
      const result = await hyperwikiApi.json<DevLifecycleResponse>(withProjectQuery("/api/dev/restart", activeProject), {
        method: "POST",
        body: {},
      });
      if (result.preview) setPreview(result.preview);
      if (activeProject && result.session) upsertTerminalSession(activeProject.id, result.session, { reason: "restart-dev", select: true });
      await loadSessions({ selectSessionId: result.session?.id || null });
      setStatus(result.session ? "Dev restarted" : "Dev restart requested");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function showDevTerminal() {
    const visibleDevSession = selectDevTerminalSession(sessions, preview);
    if (visibleDevSession) {
      setActiveSessionId(visibleDevSession.id);
      setStatus(isDetachedDevSession(visibleDevSession) ? "Dev process is running without replayable terminal output" : "Dev terminal selected");
      return;
    }
    const managedId = preview?.managedSession?.id || null;
    setStatus(managedId ? "Loading dev terminal" : "Loading sessions");
    await loadSessions({ selectSessionId: managedId });
  }

  async function initializeGitFromTerminal() {
    if (!activeProject) return;
    setStatus("Initializing Git");
    const result = await hyperwikiApi.json<{ repo?: RepoContextResponse; result?: { committed?: boolean; message?: string } }>(withProjectQuery("/api/git/init", activeProject), { method: "POST", body: {} });
    if (result.repo) setRepoContext(result.repo);
    setStatus(result.result?.committed ? "Git initialized. Worktrees are now available." : result.result?.message || "Git initialized. Worktrees are now available.");
  }

  async function createWorktreeFromTerminal(branch: string) {
    if (!activeProject) return;
    setStatus("Creating worktree");
    const result = await hyperwikiApi.json<WorktreeCreateResponse>(withProjectQuery("/api/worktrees", activeProject), {
      method: "POST",
      body: { branch },
    });
    const projectsResult = await hyperwikiApi.json<ProjectListResponse>(`/api/projects?project=${encodeURIComponent(result.project?.id || activeProject.id)}`);
    setProjects(projectsResult);
    if (result.project) {
      await switchProject(result.project);
    }
    setStatus(result.install?.ok === false ? result.install.message || "Worktree created; install failed." : "Worktree ready.");
  }

  async function createProject(input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) {
    baseDataRequestId.current += 1;
    setStatus("Initializing project");
    appendImportLog(`Create request started title=${input.title}`);
    const startedAt = Math.floor(Date.now() / 1000);
    const createRequest = hyperwikiApi
      .json<ProjectCreateResponse>("/api/projects/create", {
        method: "POST",
        body: {
          title: input.title,
          summary: documentSummary(input.document),
          document: input.document,
          documentType: input.documentType,
          sourceDocuments: input.sourceDocuments,
          initializeGit: input.initializeGit,
          agentLaunchCommand: agentLaunchCommand(layout, thinkingEffort, agentProviders),
        },
      })
      .then((result) => result.project);
    const project = await Promise.race([
      createRequest,
      recoverCreatedProject(input.title, startedAt),
    ]);
    appendImportLog(`Create request resolved project=${project.id} slug=${project.projectSlug}/${project.worktreeSlug}`);
    setStatus(`Project created: ${project.name}`);
    setProjects((current) => withOptimisticProject(current, project));
    setPlanningInterviewStatus("starting");
    setPlanningActivity("Preparing import planning");
    setPlanningWorkstream(["Preparing import planning"]);
    openImportedPlanningWorkspace(project);
    void startTerminalImportPlanning(project, "create-project");
    void hyperwikiApi
      .json<ProjectListResponse>(`/api/projects?project=${encodeURIComponent(project.id)}`)
      .then((projectsResult) => {
        setProjects(projectsResult);
        setActiveProject(findActiveProject(projectsResult, unavailableProjectIds, {
          projectSlug: project.projectSlug,
          worktreeSlug: project.worktreeSlug,
        }) || project);
      })
      .catch((error) => {
        console.error("Could not refresh projects after import", error);
      });
    return project;
  }

  async function recoverCreatedProject(title: string, startedAt: number) {
    await delay(800);
    const titleSlug = slugify(title);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const projectsResult = await hyperwikiApi.json<ProjectListResponse>("/api/projects");
      const candidates = allProjectRecords(projectsResult)
        .filter((project) => project.name === title || project.projectSlug === titleSlug)
        .sort((left, right) => Number(right.lastOpenedAt || 0) - Number(left.lastOpenedAt || 0));
      const project = candidates.find((candidate) => Number(candidate.lastOpenedAt || 0) >= startedAt - 2) || candidates[0];
      if (project) return project;
      await delay(250);
    }
    throw new Error("Project was created, but hyperwiki could not find it in the registry.");
  }

  async function removeProject(project: ProjectRecord, deleteFiles: boolean) {
    setStatus(deleteFiles ? "Deleting project files" : "Removing project");
    await hyperwikiApi.json<ProjectRemoveResponse>(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "DELETE",
      body: {
        deleteFiles,
        root: project.root,
      },
    });
    const projectsResult = await hyperwikiApi.json<ProjectListResponse>("/api/projects");
    setProjects(projectsResult);
    setActiveProject(findActiveProject(projectsResult, unavailableProjectIds));
    setStatus(deleteFiles ? "Project removed and files deleted" : "Project removed from hyperwiki");
  }

  async function deletePlanPage(path: string) {
    const displayPath = displayWikiPath(path);
    setStatus("Deleting plan");
    await hyperwikiApi.json<WikiPlanDeletionResponse>(withProjectQuery(`/api/wiki/plan?path=${encodeURIComponent(displayPath)}`, activeProject), {
      method: "DELETE",
    });
    await refreshWikiStateFromDisk("plan-delete");
    setStatus("Plan deleted");
  }

  async function downloadWikiMarkdownZip() {
    setStatus("Preparing wiki Markdown export");
    setWikiExportStatus("Saving export...");
    setIsWikiExporting(true);
    try {
      const exportPayload = await hyperwikiApi.json<WikiMarkdownZipDownloadResponse>(withProjectQuery("/api/wiki/export-markdown-zip/download", activeProject), {
        method: "POST",
      });
      const fileCount = exportPayload.files?.length ? ` (${exportPayload.files.length} files)` : "";
      const revealNote = exportPayload.revealError ? ` Saved to Downloads; reveal failed: ${exportPayload.revealError}` : "Saved to Downloads.";
      setWikiExportStatus(`${revealNote}${fileCount}`);
      setStatus(`Wiki Markdown export saved: ${exportPayload.filename}${fileCount}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not export wiki Markdown.";
      setWikiExportStatus(message);
      setStatus(message);
    } finally {
      setIsWikiExporting(false);
    }
  }

  const isProjectUnavailable = hasLoadedProjects && !activeProject && !isPendingImportRoute;
  const isUtilityRoute = route.kind === "projects" || route.kind === "new-project" || route.kind === "settings" || isProjectUnavailable || isPendingImportRoute;
  const isMainPaneExpanded = isWorkspaceExpanded && !isUtilityRoute;
  const prefersReducedMotion = usePrefersReducedMotion();
  const gridBeamTheme = useDocumentGridBeamTheme();
  const gridBeamRuntime = useMemo(
    () => ({ prefersReducedMotion, theme: gridBeamTheme }),
    [gridBeamTheme, prefersReducedMotion],
  );

  useEffect(() => {
    if (!isUtilityRoute) return;
    appendImportLog(`Terminal pane hidden utility=${isUtilityRoute} route=${route.kind} activeProject=${activeProject?.id || "none"}`);
  }, [activeProject?.id, isUtilityRoute, route.kind]);

  return (
    <main className="hyperwiki-shell flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <GridBeamRuntimeContext.Provider value={gridBeamRuntime}>
      <BeamSurface
        borderRadius={0}
        className="flex h-full min-h-0 flex-col bg-background"
        colorVariant="mono"
        cols={8}
        contentClassName="flex h-full min-h-0 flex-col"
        duration={7}
        rows={5}
        strength={0.18}
      >
        <TopBar
          activeProject={activeProject}
          homePath={planLandingPath(wikiPages)}
          isProjectsOpen={isProjectsOpen}
          isUpNextOpen={isUpNextOpen}
          onRefresh={loadBaseData}
          onNavigate={navigate}
          onSwitchProject={switchProject}
          preview={preview}
          projectGroups={projectGroups}
          setIsProjectsOpen={setIsProjectsOpen}
          setIsUpNextOpen={setIsUpNextOpen}
          status={status}
          workspace={workspace}
        />
        <section
          className={cn(
            "grid h-full min-h-0 flex-1 overflow-hidden",
            isMainPaneExpanded || isUtilityRoute
              ? "grid-cols-1"
              : isImportPlanningView
              ? "grid-cols-[300px_minmax(420px,1fr)] max-xl:grid-cols-[260px_minmax(0,1fr)]"
              : "grid-cols-[300px_minmax(420px,1fr)_minmax(380px,0.92fr)] max-xl:grid-cols-[260px_minmax(0,1fr)]",
          )}
        >
          {isMainPaneExpanded || isUtilityRoute ? null : (
            <WikiSidebar
              currentPath={currentWikiPath}
              exportStatus={wikiExportStatus}
              isExporting={isWikiExporting}
              model={sidebarModel}
              onCreatePlan={() => runCommandAction("new-plan")}
              onDownloadWikiMarkdownZip={downloadWikiMarkdownZip}
              onNavigate={(path) => navigate({ kind: "wiki", path })}
              route={route}
              workspace={workspace}
            />
          )}
          <WorkspacePane
            activeProject={activeProject}
            hasLoadedProjects={hasLoadedProjects}
            isExpanded={isMainPaneExpanded}
            isLoading={isWikiLoading}
            onNavigate={navigate}
            onCreateProject={createProject}
            activeImportPlanningRun={activeImportPlanningRun}
            onCancelImportPlanningTurn={cancelActiveImportPlanningTurn}
            onPlanImportedProject={planImportedProject}
            onResumeImportPlanning={resumeImportPlanning}
            onRemoveProject={removeProject}
            onDeletePlan={deletePlanPage}
            onRunCommand={runCommandAction}
            onAnswerPlanningQuestion={answerPlanningQuestion}
            onToggleExpanded={() => setIsWorkspaceExpanded((value) => !value)}
            onSwitchProject={switchProject}
            planningActivity={planningActivity}
            planningWorkstream={planningWorkstream}
            lastPlanningAnswer={lastPlanningAnswer}
            pendingImportProject={isPendingImportRoute ? pendingImportProject : null}
            isImportPlanningView={isImportPlanningView}
            canResumeImportPlanning={canResumeImportPlanning}
            planningInterviewStatus={planningInterviewStatus}
            planningQuestions={activePlanningQuestions}
            projectGroups={projectGroups}
            reviewWorkflows={reviewWorkflows}
            route={route}
            settings={settings}
            onOpenProjectEnv={openProjectEnvEditor}
            wikiError={wikiError}
            wikiHtml={wikiHtml}
            wikiSource={wikiSource}
            wikiPath={currentWikiPath}
            wikiPages={wikiPages}
            activePlanState={activePlanState}
          />
          {isMainPaneExpanded || isUtilityRoute ? null : isImportPlanningView ? null : (
            <div className="h-full min-h-0 overflow-hidden">
              <TerminalPane
                activeSessionId={activeSessionId}
                activeProject={activeProject}
                isLoading={isSessionsLoading}
                onCloseSession={closeSession}
                onCreateWorktree={createWorktreeFromTerminal}
                onInitializeGit={initializeGitFromTerminal}
                onRenameSession={renameSession}
                onRestartSession={restartSession}
                onRestartDev={restartDevTerminal}
                onRunDev={startDevTerminal}
                onShowDev={showDevTerminal}
                onStopDev={stopDevTerminal}
                onOpenProjectEnv={openProjectEnvEditor}
                onSelectSession={setActiveSessionId}
                onStart={startTerminal}
                onTerminalText={handleTerminalText}
                preview={preview}
                repoContext={repoContext}
                scope={terminalScope}
                thinkingEffort={thinkingEffort}
                onThinkingEffortChange={setThinkingEffort}
                agentProvider={layoutAgentProvider(layout)}
                agentProviders={agentProviders}
                onAgentProviderChange={changeAgentProvider}
                currentWorkTitle={activePlanState.currentTitle}
                workspace={workspace}
                sessions={sessions}
                terminalEnvHint={terminalEnvHint}
              />
            </div>
          )}
        </section>
        <AlertDialog open={Boolean(pendingExecuteAgentConfirmation)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run Execute Unit in this agent?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingExecuteAgentConfirmation
                  ? `Use ${terminalPaneLabel(pendingExecuteAgentConfirmation.candidateSession, 0).replace(/\s+--$/, "")} for ${titleForPath(pendingExecuteAgentConfirmation.currentPage, wikiPages)}, start a new agent, or cancel.`
                  : "Choose how to run Execute Unit."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelExecuteAgentConfirmation}>Cancel</AlertDialogCancel>
              <AlertDialogAction className={buttonVariants({ variant: "outline" })} onClick={() => void confirmExecuteInNewAgent()}>
                New agent
              </AlertDialogAction>
              <AlertDialogAction onClick={() => void confirmExecuteInCurrentAgent()}>
                Run in current agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ProjectEnvEditor
          activeProject={activeProject}
          initialKey={projectEnvEditor.initialKey}
          onClose={() => setProjectEnvEditor({ open: false })}
          onSaved={() => {
            setTerminalEnvHint(null);
            setStatus("Project env saved");
          }}
          open={projectEnvEditor.open}
          reason={projectEnvEditor.reason}
        />
      </BeamSurface>
      </GridBeamRuntimeContext.Provider>
    </main>
  );
}

function TopBar(props: {
  activeProject: ProjectRecord | null;
  homePath: string;
  isProjectsOpen: boolean;
  isUpNextOpen: boolean;
  onNavigate: (route: ViewRoute) => void;
  onRefresh: () => void;
  onSwitchProject: (project: ProjectRecord) => void;
  preview: AppPreviewResponse | null;
  projectGroups: ProjectGroup[];
  setIsProjectsOpen: (value: boolean) => void;
  setIsUpNextOpen: (value: boolean) => void;
  status: string;
  workspace: WorkspaceResponse | null;
}) {
  const projectsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.isProjectsOpen) return;

    function handleDocumentPointerDown(event: PointerEvent) {
      if (projectsMenuRef.current?.contains(event.target as Node)) return;
      props.setIsProjectsOpen(false);
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [props.isProjectsOpen, props.setIsProjectsOpen]);

  return (
    <header className="hyperwiki-header flex min-h-12 shrink-0 items-center justify-between gap-4 overflow-hidden border-b border-t border-t-border/55 bg-card/95 px-3 text-sm backdrop-blur">
      <button className="group flex min-w-0 items-center gap-3 rounded-md px-1.5 py-1 text-left font-mono font-bold hover:bg-secondary/70" onClick={() => props.onNavigate({ kind: "wiki", path: props.homePath })} type="button">
        <BrandMark />
        <span className="truncate text-xs font-bold uppercase text-muted-foreground">hyperwiki</span>
        {props.activeProject?.name ? (
          <>
            <span className="text-xs font-bold text-muted-foreground/60">|</span>
            <span className="truncate text-sm font-normal text-foreground">{props.activeProject.name}</span>
          </>
        ) : null}
      </button>
      <div className="relative flex items-center gap-2">
        <div className="relative" ref={projectsMenuRef}>
          <Button size="sm" variant="outline" onClick={() => props.setIsProjectsOpen(!props.isProjectsOpen)}>
            <LayoutDashboard aria-hidden="true" data-icon="inline-start" />
            Projects
          </Button>
          {props.isProjectsOpen ? <ProjectsPopover groups={props.projectGroups} onClose={() => props.setIsProjectsOpen(false)} onNavigate={props.onNavigate} onSwitchProject={props.onSwitchProject} /> : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => props.onNavigate({ kind: "settings" })}>
          <Settings aria-hidden="true" data-icon="inline-start" />
          Settings
        </Button>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <span className="brand-dots" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

function BeamSurface({
  active = true,
  borderRadius = 8,
  breathe = true,
  children,
  className,
  colorVariant = "mono",
  cols = 4,
  contentClassName,
  dividerStroke,
  duration = 5,
  rows = 3,
  strength = 0.32,
}: {
  active?: boolean;
  borderRadius?: number;
  breathe?: boolean;
  children: ReactNode;
  className?: string;
  colorVariant?: GridBeamPaletteKey;
  cols?: number;
  contentClassName?: string;
  dividerStroke?: string;
  duration?: number;
  rows?: number;
  strength?: number;
}) {
  const { prefersReducedMotion, theme } = useContext(GridBeamRuntimeContext);
  return (
    <GridBeam
      active={active && !prefersReducedMotion}
      borderRadius={borderRadius}
      breathe={breathe}
      className={className}
      colorVariant={colorVariant}
      cols={cols}
      contentClassName={contentClassName}
      dividerStroke={dividerStroke}
      duration={duration}
      rows={rows}
      strength={strength}
      theme={theme}
    >
      <div className={cn("relative", contentClassName)}>{children}</div>
    </GridBeam>
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return prefersReducedMotion;
}

function useDocumentGridBeamTheme(): GridBeamColorScheme {
  const [scheme, setScheme] = useState<GridBeamColorScheme>(() => documentGridBeamTheme());
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setScheme(documentGridBeamTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributeFilter: ["style"], attributes: true });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

function documentGridBeamTheme(): GridBeamColorScheme {
  return document.documentElement.style.colorScheme === "dark" ? "dark" : "light";
}

function UpNextPopover({ workspace }: { workspace: WorkspaceResponse | null }) {
  const item = workspace?.status;
  return (
    <BeamSurface className="absolute left-0 top-10 z-20 w-96 border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur" colorVariant="ocean" cols={3} rows={2} strength={0.2}>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-bold uppercase text-muted-foreground">Current focus</div>
        <div className="font-bold">{item?.current || item?.stage || "No current task"}</div>
        {item?.currentPath ? <div className="break-all text-xs text-muted-foreground">{item.currentPath}</div> : null}
        {item?.next ? <div className="border-t pt-2 text-sm text-muted-foreground">{item.next}</div> : null}
      </div>
    </BeamSurface>
  );
}

function ProjectsPopover({
  groups,
  onClose,
  onNavigate,
  onSwitchProject,
}: {
  groups: ProjectGroup[];
  onClose: () => void;
  onNavigate: (route: ViewRoute) => void;
  onSwitchProject: (project: ProjectRecord) => void;
}) {
  const projects = groups
    .map((group) => ({
      group,
      project: group.checkouts.find((checkout) => checkout.active) || group.checkouts.find((checkout) => checkout.worktreeSlug === "main") || group.checkouts[0],
    }))
    .filter((item): item is { group: ProjectGroup; project: ProjectRecord } => Boolean(item.project));
  return (
    <BeamSurface className="absolute right-0 top-11 z-20 max-h-[70vh] w-[25rem] overflow-auto rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur" colorVariant="ocean" cols={4} rows={4} strength={0.22}>
      <div className="mb-4 flex flex-col gap-2">
        <button
          className="flex min-h-11 items-center justify-center gap-2 rounded-md border bg-foreground px-3 text-sm font-bold text-background shadow-sm"
          onClick={() => {
            onClose();
            onNavigate({ kind: "new-project" });
          }}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          New Project
        </button>
        <button
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-bold"
          onClick={() => {
            onClose();
            onNavigate({ kind: "projects" });
          }}
          type="button"
        >
          <span aria-hidden="true" className="text-base leading-none">⇥</span>
          Manage Projects
        </button>
      </div>
      {projects.length ? (
        <div className="flex flex-col gap-2">
          {projects.map(({ group, project }) => (
            <button
              className={cn(
                "grid w-full gap-0.5 rounded-md border border-transparent px-3 py-2.5 text-left hover:bg-secondary",
                group.checkouts.some((checkout) => checkout.active) && "border-primary bg-primary/12",
              )}
              key={group.projectSlug}
              onClick={() => {
                onClose();
                onSwitchProject(project);
              }}
              type="button"
            >
              <span className="truncate text-base font-bold">{group.name || project.name}</span>
              <span className="truncate text-xs font-bold text-muted-foreground">{project.root}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">No projects available.</div>
      )}
    </BeamSurface>
  );
}

interface SidebarModel {
  plans: WikiPage[];
  projectPages: WikiPage[];
}

function WikiSidebar(props: {
  currentPath: string;
  exportStatus: string;
  isExporting: boolean;
  model: SidebarModel;
  onCreatePlan: () => void;
  onDownloadWikiMarkdownZip: () => Promise<void>;
  onNavigate: (path: string) => void;
  route: ViewRoute;
  workspace: WorkspaceResponse | null;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-card">
      <BeamSurface className="h-full bg-card" colorVariant="mono" cols={3} contentClassName="h-full" dividerStroke="transparent" duration={6} rows={5} strength={0.12}>
      <nav className="flex h-full min-h-0 flex-col overflow-hidden">
        <section className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-2 flex min-h-8 items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-bold uppercase text-muted-foreground">Plans</h2>
            <div className="flex items-center gap-1">
              <Button
                aria-label="Download wiki Markdown zip"
                className="size-8"
                disabled={props.isExporting}
                size="icon"
                title="Download wiki Markdown zip"
                type="button"
                variant="ghost"
                onClick={() => void props.onDownloadWikiMarkdownZip()}
              >
                {props.isExporting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Download aria-hidden="true" data-icon="inline-start" />}
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={props.onCreatePlan}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                plan
              </Button>
            </div>
          </div>
          {props.exportStatus ? <p className="m-0 mb-2 px-1 text-xs text-muted-foreground" role="status">{props.exportStatus}</p> : null}
          <PlanTree pages={props.model.plans} currentPath={props.currentPath} onNavigate={props.onNavigate} />
        </section>
        <details className="shrink-0 border-t bg-card p-3">
          <summary className="cursor-pointer list-none text-xs font-bold uppercase text-muted-foreground">Project</summary>
          <div className="mt-2 grid gap-1">
            {props.model.projectPages.map((page) => (
              <SidebarPageButton currentPath={props.currentPath} depth={0} key={page.path} onNavigate={props.onNavigate} page={page} />
            ))}
          </div>
        </details>
      </nav>
      </BeamSurface>
    </aside>
  );
}

function PlanTree({ pages, currentPath, onNavigate }: { pages: WikiPage[]; currentPath: string; onNavigate: (path: string) => void }) {
  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const roots = sorted.filter((page) => isTopLevelPlanPage(page) && !isCompletedTopLevelPlanPage(page));
  const visibleRoots = roots.filter((page) => !isPlansIndexPage(page));
  const completedRoots = sorted.filter((page) => isCompletedTopLevelPlanPage(page));
  const currentPlanPath = currentPlanWorkPath(sorted, roots);
  if (!visibleRoots.length && !completedRoots.length) return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No plan pages.</div>;
  return (
    <div className="grid gap-1">
      {visibleRoots.map((page) => (
        <PlanNode currentPath={currentPath} currentWorkPath={currentPlanPath} key={page.path} onNavigate={onNavigate} page={page} pages={sorted} />
      ))}
      {completedRoots.length ? (
        <details className="mt-2 grid gap-1" open={completedRoots.some((page) => pathContainsSelectedPage(page.path, currentPath))}>
          <summary className="cursor-pointer list-none px-2 py-1 text-[11px] font-bold uppercase text-muted-foreground">Completed Plans</summary>
          <div className="mt-1 grid gap-1">
            {completedRoots.map((page) => (
              <PlanNode currentPath={currentPath} currentWorkPath="" key={page.path} onNavigate={onNavigate} page={page} pages={sorted} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PlanNode({ page, pages, currentPath, currentWorkPath, onNavigate, depth = 0 }: { page: WikiPage; pages: WikiPage[]; currentPath: string; currentWorkPath: string; onNavigate: (path: string) => void; depth?: number }) {
  const children = childPlanPages(page, pages);
  const isCurrent = Boolean(currentWorkPath) && pathContainsSelectedPage(page.path, currentWorkPath);
  const isSelected = currentPath === page.path;
  const shouldOpen = isSelected || isCurrent || children.some((child) => pathContainsSelectedPage(child.path, currentPath) || (Boolean(currentWorkPath) && pathContainsSelectedPage(child.path, currentWorkPath)));
  const [isOpen, setIsOpen] = useState(shouldOpen);
  useEffect(() => {
    if (shouldOpen) setIsOpen(true);
  }, [shouldOpen]);
  return (
    <div className="grid min-w-0 gap-1 overflow-hidden">
      <SidebarPageButton
        current={isCurrent}
        depth={depth}
        hasChildren={Boolean(children.length)}
        isOpen={isOpen}
        onNavigate={onNavigate}
        onToggle={() => setIsOpen((value) => !value)}
        page={page}
        selected={isSelected}
      />
      {children.length && isOpen ? (
        <div className="grid min-w-0 gap-1 overflow-hidden">
          {children.map((child) => (
            <PlanNode currentPath={currentPath} currentWorkPath={currentWorkPath} depth={depth + 1} key={child.path} onNavigate={onNavigate} page={child} pages={pages} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarPageButton({
  page,
  currentPath,
  onNavigate,
  depth,
  current,
  selected,
  hasChildren = false,
  isOpen = false,
  onToggle,
}: {
  page: WikiPage;
  currentPath?: string;
  onNavigate: (path: string) => void;
  depth: number;
  current?: boolean;
  selected?: boolean;
  hasChildren?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const isSelected = selected ?? currentPath === page.path;
  const isComplete = isCompletedPage(page);
  return (
    <div
      className={cn(
        "grid min-h-10 min-w-0 grid-cols-[1rem_0.625rem_minmax(0,1fr)] items-center gap-1.5 rounded-md py-1.5 pe-2 text-[13px] transition-colors",
        isSelected ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      {hasChildren ? (
        <button
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${cleanPageTitle(page)}`}
          className="grid size-4 place-items-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle?.();
          }}
          type="button"
        >
          <ChevronDown aria-hidden="true" className={cn("size-3 transition-transform", !isOpen && "-rotate-90")} />
        </button>
      ) : (
        <span aria-hidden="true" className="size-4" />
      )}
      <span className="mx-auto grid size-3 shrink-0 place-items-center">
        {current ? (
          <span aria-label="Current work" className="size-[6px] rounded-full bg-[#25a244] opacity-70 shadow-[0_0_0_3px_rgba(37,162,68,0.14)]" />
        ) : isComplete ? (
          <Check aria-label="Complete" className="size-3 text-muted-foreground/60" />
        ) : null}
      </span>
      <button
        className="min-w-0 truncate text-left font-normal"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onNavigate(page.path);
        }}
        type="button"
      >
        {cleanPageTitle(page)}
      </button>
    </div>
  );
}

function WorkspacePane(props: {
  activePlanState: PlanPageActionState;
  activeProject: ProjectRecord | null;
  activeImportPlanningRun: ImportOnboardingRunRecord | null;
  hasLoadedProjects: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) => Promise<ProjectRecord | void>;
  onCancelImportPlanningTurn: () => Promise<void>;
  onNavigate: (route: ViewRoute) => void;
  onAnswerPlanningQuestion: (answers: PlanningQuestionAnswer[]) => Promise<void>;
  onPlanImportedProject: (project: ProjectRecord) => Promise<void>;
  onResumeImportPlanning: () => void;
  onRemoveProject: (project: ProjectRecord, deleteFiles: boolean) => Promise<void>;
  onDeletePlan: (path: string) => Promise<void>;
  onOpenProjectEnv: (initialKey?: string, reason?: string) => void;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onToggleExpanded: () => void;
  onSwitchProject: (project: ProjectRecord) => void;
  planningActivity: string;
  planningWorkstream: string[];
  lastPlanningAnswer: string;
  pendingImportProject: ProjectRecord | null;
  isImportPlanningView: boolean;
  canResumeImportPlanning: boolean;
  planningInterviewStatus: PlanningInterviewStatus;
  planningQuestions: PlanningQuestion[];
  projectGroups: ProjectGroup[];
  reviewWorkflows: ReviewWorkflow[];
  route: ViewRoute;
  settings: SettingsResponse | null;
  wikiError: string;
  wikiHtml: string;
  wikiSource: WikiSourceResponse | null;
  wikiPath: string;
  wikiPages: WikiPage[];
}) {
  const isFirstProject = props.hasLoadedProjects && props.projectGroups.length === 0;
  if (props.route.kind === "projects") {
    return <ProjectsView groups={props.projectGroups} onNewProject={() => props.onNavigate({ kind: "new-project" })} onOpenProject={props.onSwitchProject} onRemoveProject={props.onRemoveProject} />;
  }
  if (props.route.kind === "new-project") {
    return <NewProjectView isFirstProject={isFirstProject} onCreateProject={props.onCreateProject} />;
  }
  if (props.route.kind === "settings") {
    return <SettingsView activeProject={props.activeProject} onOpenProjectEnv={props.onOpenProjectEnv} settings={props.settings} />;
  }
  if (props.pendingImportProject) {
    return <PendingImportView project={props.pendingImportProject} />;
  }
  if (props.hasLoadedProjects && !props.activeProject) {
    return <NewProjectView isFirstProject={isFirstProject} onCreateProject={props.onCreateProject} />;
  }
  const isActivePlanPage = displayWikiPath(props.wikiPath) === displayWikiPath(props.activePlanState.currentPath);
  if (props.isImportPlanningView) {
    return (
      <ImportedPlanningQAView
        activeProject={props.activeProject}
        activeRun={props.activeImportPlanningRun}
        activity={props.planningActivity}
        workstream={props.planningWorkstream}
        lastAnswer={props.lastPlanningAnswer}
        onAnswer={props.onAnswerPlanningQuestion}
        onCancelRun={props.onCancelImportPlanningTurn}
        onStart={() => props.activeProject ? props.onPlanImportedProject(props.activeProject) : Promise.resolve()}
        questions={props.planningQuestions}
        status={props.planningInterviewStatus}
      />
    );
  }
  if (displayWikiPath(props.wikiPath) === defaultWikiPath) {
    return (
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background/80">
        <BeamSurface className="flex h-full min-h-0 flex-col bg-background/88" colorVariant="mono" cols={5} contentClassName="flex h-full min-h-0 flex-col" duration={6} rows={4} strength={0.2}>
          <div className="flex min-h-12 shrink-0 items-center justify-between border-b bg-card/95 px-3 backdrop-blur">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Button
                aria-label={props.isExpanded ? "Restore sidebars" : "Expand document"}
                className="size-8"
                size="icon"
                title={props.isExpanded ? "Restore sidebars" : "Expand document"}
                variant="outline"
                onClick={props.onToggleExpanded}
              >
                {props.isExpanded ? <Minimize2 aria-hidden="true" data-icon="inline-start" /> : <Maximize2 aria-hidden="true" data-icon="inline-start" />}
              </Button>
              <span className="truncate text-xs font-bold uppercase">Plans</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CommandBar activePlanState={props.activePlanState} canResumeImportPlanning={props.canResumeImportPlanning} onResumeImportPlanning={props.onResumeImportPlanning} onRunCommand={props.onRunCommand} />
            </div>
          </div>
          <PlansIndexEmptyState onCreatePlan={() => props.onRunCommand("new-plan")} />
        </BeamSurface>
      </section>
    );
  }
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background/80">
      <BeamSurface className="flex h-full min-h-0 flex-col bg-background/88" colorVariant="mono" cols={6} contentClassName="flex h-full min-h-0 flex-col" duration={6.5} rows={5} strength={0.18}>
        <div className="flex min-h-12 shrink-0 items-center justify-between border-b bg-card/95 px-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Button
              aria-label={props.isExpanded ? "Restore sidebars" : "Expand document"}
              className="size-8"
              size="icon"
              title={props.isExpanded ? "Restore sidebars" : "Expand document"}
              variant="outline"
              onClick={props.onToggleExpanded}
            >
              {props.isExpanded ? <Minimize2 aria-hidden="true" data-icon="inline-start" /> : <Maximize2 aria-hidden="true" data-icon="inline-start" />}
            </Button>
            <span className="truncate text-xs font-bold uppercase">{titleForPath(props.wikiPath, props.wikiPages).replace(/\.[^.]+$/, "")}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CommandBar activePlanState={props.activePlanState} canResumeImportPlanning={props.canResumeImportPlanning} onResumeImportPlanning={props.onResumeImportPlanning} onRunCommand={props.onRunCommand} />
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {props.isLoading ? (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b bg-card/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Loading wiki page
            </div>
          ) : null}
          {props.wikiError ? (
            <WikiErrorState error={props.wikiError} onNewProject={() => props.onNavigate({ kind: "new-project" })} onProjects={() => props.onNavigate({ kind: "projects" })} />
          ) : props.wikiSource && isReactRenderedMdxPath(props.wikiPath) ? (
            <MdxPlanRenderer
              canDeletePlan={isDeletablePlanRootPage(props.wikiPath, props.wikiPages)}
              markdown={props.wikiSource.markdown}
              onDeletePlan={() => props.onDeletePlan(props.wikiPath)}
              onNavigate={(path) => props.onNavigate({ kind: "wiki", path })}
              path={props.wikiPath}
              status={isActivePlanPage ? "active" : props.wikiSource.status}
              source={props.wikiSource.source}
              validationWarnings={props.wikiSource.validationWarnings}
            />
          ) : (
            <iframe className="size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={embeddedWikiHtml(props.wikiHtml)} title="Wiki page" />
          )}
        </div>
      </BeamSurface>
    </section>
  );
}

function PlansIndexEmptyState({ onCreatePlan }: { onCreatePlan: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
      <BeamSurface className="flex max-w-lg flex-col items-center gap-5 rounded-md border bg-card/90 p-8 text-center shadow-sm" colorVariant="ocean" cols={3} rows={3} strength={0.24}>
        <div className="grid size-14 place-items-center rounded-md border bg-card">
          <BookOpen aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>
        <div className="grid gap-2">
          <h1 className="font-ui m-0 text-3xl font-semibold tracking-tight">No active plans</h1>
          <p className="m-0 text-base leading-7 text-muted-foreground">Create a plan to start a new implementation track.</p>
        </div>
        <Button className="min-h-12 px-6 text-base" onClick={onCreatePlan}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New Plan
        </Button>
      </BeamSurface>
    </div>
  );
}

function WikiErrorState({ error, onNewProject, onProjects }: { error: string; onNewProject: () => void; onProjects: () => void }) {
  const missing = isMissingFileError(error);
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <BeamSurface className="flex max-w-lg flex-col items-center gap-4 rounded-md border bg-card/90 p-8 text-center shadow-sm" colorVariant="sunset" cols={3} rows={3} strength={0.22}>
        <div className="grid size-12 place-items-center rounded-md border bg-card">
          <FolderOpen aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
        <div className="grid gap-2">
          <h2 className="font-ui m-0 text-2xl font-semibold tracking-tight">{missing ? "Project files are unavailable" : "Wiki page unavailable"}</h2>
          <p className="m-0 text-sm text-muted-foreground">
            {missing ? "The selected project points to files that no longer exist. Pick another project or create a new one." : "hyperwiki could not load this wiki page."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onProjects}>Projects</Button>
          <Button variant="outline" onClick={onNewProject}>New Project</Button>
        </div>
      </BeamSurface>
    </div>
  );
}

function embeddedWikiHtml(html: string) {
  const style = "<style id=\"hyperwiki-embedded-style\">.wiki-header{display:none!important}.wiki-page{padding-top:32px!important}.wiki-page>h1+p:has(a[href*='/wiki/plans/mvp/stage-']){display:none!important}</style>";
  const script = `<script id="hyperwiki-embedded-navigation">
document.addEventListener("click", function(event) {
  var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
  if (!link) return;
  var url;
  try {
    url = new URL(link.getAttribute("href"), window.location.href);
  } catch (_) {
    return;
  }
  var path = url.pathname;
  var projectWikiMatch = path.match(/^\\/projects\\/[^/]+(\\/wiki\\/.*)$/);
  if (projectWikiMatch) path = projectWikiMatch[1];
  if (!path.startsWith("/wiki/")) return;
  event.preventDefault();
  window.parent.postMessage({ type: "hyperwiki:navigate", path: path + url.search + url.hash }, "*");
});
</script>`;
  if (!html.trim()) return html;
  if (html.includes("hyperwiki-embedded-style")) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${style}${script}</head>`);
  return `${style}${script}${html}`;
}

function isMissingFileError(error: string) {
  return error.includes("No such file or directory") || error.includes("os error 2");
}

function CommandBar({
  activePlanState,
  canResumeImportPlanning,
  onResumeImportPlanning,
  onRunCommand,
}: {
  activePlanState: PlanPageActionState;
  canResumeImportPlanning: boolean;
  onResumeImportPlanning: () => void;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
}) {
  const executeLabel = activePlanState.currentUnitLabel ? `execute ${activePlanState.currentUnitLabel.toLowerCase()}` : "execute";
  return (
    <div className="flex items-center gap-2">
      {canResumeImportPlanning ? (
        <Button size="sm" onClick={onResumeImportPlanning}>
          <Play aria-hidden="true" data-icon="inline-start" />
          Resume Q&A
        </Button>
      ) : null}
      {activePlanState.isPlanPage && activePlanState.isComplete ? null : (
        <Button size="sm" variant="outline" onClick={() => onRunCommand("modify")}>
          modify
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={!activePlanState.canExecute} onClick={() => onRunCommand("execute-main")}>
        {executeLabel}
      </Button>
    </div>
  );
}

function ImportedPlanningQAView({
  activeProject,
  activeRun,
  activity,
  workstream,
  lastAnswer,
  onAnswer,
  onCancelRun,
  onStart,
  questions,
  status,
}: {
  activeProject: ProjectRecord | null;
  activeRun: ImportOnboardingRunRecord | null;
  activity: string;
  workstream: string[];
  lastAnswer: string;
  onAnswer: (answers: PlanningQuestionAnswer[]) => Promise<void>;
  onCancelRun: () => Promise<void>;
  onStart: () => Promise<void>;
  questions: PlanningQuestion[];
  status: PlanningInterviewStatus;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const hasStartedRef = useRef("");
  const otherAnswerRef = useRef<HTMLTextAreaElement | null>(null);

  async function start() {
    appendImportLog(`Imported Q&A view start clicked project=${activeProject?.id || "none"}`);
    setIsStarting(true);
    try {
      await onStart();
      setHasStarted(true);
    } finally {
      setIsStarting(false);
    }
  }

  useEffect(() => {
    if (!activeProject) return;
    if (hasStartedRef.current === activeProject.id) return;
    hasStartedRef.current = activeProject.id;
    appendImportLog(`Imported Q&A view auto-start project=${activeProject.id}`);
    void start();
  }, [activeProject?.id]);

  useEffect(() => {
    setSelectedOptions({});
    setOtherAnswers({});
  }, [questions.map((question) => question.id).join("|")]);

  function answerForQuestion(question: PlanningQuestion) {
    const selected = selectedOptions[question.id] || "";
    return selected === "__other__" ? (otherAnswers[question.id] || "").trim() : selected.trim();
  }

  async function submitAnswers(nextAnswers: PlanningQuestionAnswer[]) {
    const trimmed = nextAnswers
      .map((item) => ({ question: item.question, answer: item.answer.trim() }))
      .filter((item) => item.answer);
    if (!trimmed.length) return;
    setIsAnswering(true);
    try {
      await onAnswer(trimmed);
      setSelectedOptions({});
      setOtherAnswers({});
    } finally {
      setIsAnswering(false);
    }
  }

  async function cancelRun() {
    setIsCancelling(true);
    try {
      await onCancelRun();
    } finally {
      setIsCancelling(false);
    }
  }

  const canSubmitBatch = questions.length > 1 && questions.every((question) => answerForQuestion(question)) && !isAnswering;
  const title = "Planning Q&A";
  const waitingLabel = status === "streaming"
    ? "Checking Codex output"
    : lastAnswer ? "Waiting for next question" : "Waiting for first question";
  const activityLabel = questions.length ? "Planning activity" : waitingLabel;
  const isRetryableFailure = status === "stalled" || status === "schema_mismatch" || status === "failed";
  const isRunning = Boolean(activeRun && activeRun.status === "running") || ["starting", "waiting_for_question", "streaming", "answering"].includes(status) || isStarting;
  const showActivityPane = !isRetryableFailure
    && (status === "starting" || status === "waiting_for_question" || status === "streaming" || status === "answering" || isStarting || Boolean(activity) || workstream.length > 0);
  const description = "Answer questions and make important decisions to create your project.";

  return (
    <main className="min-h-0 overflow-auto bg-background/80 antialiased">
      <BeamSurface className="grid min-h-full place-items-start bg-background/86 px-5 pt-8 md:px-8 md:pt-12" colorVariant="mono" cols={5} duration={7} rows={5} strength={0.18}>
      <section className="mt-2 grid w-full max-w-3xl gap-5 rounded-lg border bg-card/92 p-5 shadow-sm md:p-6">
        <div className="grid gap-3">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creating project</p>
          <h1 className="font-ui m-0 text-4xl font-semibold leading-tight tracking-tight text-balance">{title}</h1>
          <p className="m-0 text-base leading-7 text-muted-foreground text-pretty">{description}</p>
        </div>
        {questions.length ? (
          <div className="grid gap-4">
            {questions.length > 1 ? (
              <p className="m-0 rounded-md bg-secondary px-3 py-2 text-sm leading-6 text-secondary-foreground">
                Answer these related decisions together so the next planning turn can move faster.
              </p>
            ) : null}
            {questions.map((question, questionIndex) => (
              <div className="grid gap-4 rounded-md border bg-background p-4" key={question.id}>
                <div className="grid gap-2">
                  <h2 className="font-ui m-0 text-xl font-semibold leading-snug tracking-tight">{question.question}</h2>
                  {question.recommendedAnswer ? (
                    <p className="m-0 rounded-md bg-secondary px-3 py-2 text-sm leading-6 text-secondary-foreground">
                      <span className="font-semibold">Recommended:</span> {question.recommendedAnswer}
                    </p>
                  ) : null}
                  {question.reasoning ? <p className="m-0 text-sm leading-6 text-muted-foreground">{question.reasoning}</p> : null}
                </div>
                {question.options.length ? (
                  <div className="grid gap-2">
                    {question.options.map((option, index) => {
                      const selected = selectedOptions[question.id] === option.label;
                      return (
                        <button
                          className={cn(
                            "grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-secondary",
                            selected && "border-primary bg-secondary text-secondary-foreground",
                          )}
                          disabled={isAnswering}
                          key={`${question.id}:${index}:${option.label}`}
                          onClick={() => {
                            setSelectedOptions((current) => ({ ...current, [question.id]: option.label }));
                            if (questions.length === 1) {
                              void submitAnswers([{ question, answer: option.label }]);
                            }
                          }}
                          type="button"
                        >
                          <span className="grid gap-1">
                            <span>{option.label}</span>
                            {option.description ? <span className="text-xs leading-5 text-muted-foreground">{option.description}</span> : null}
                          </span>
                          {index === 0 ? <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">recommended</span> : null}
                        </button>
                      );
                    })}
                    <button
                      className={cn(
                        "flex min-h-11 items-center justify-between gap-3 rounded-md border border-dashed bg-card px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-secondary",
                        selectedOptions[question.id] === "__other__" && "border-primary bg-secondary text-secondary-foreground",
                      )}
                      disabled={isAnswering}
                      onClick={() => {
                        setSelectedOptions((current) => ({ ...current, [question.id]: "__other__" }));
                        if (questions.length === 1) window.setTimeout(() => otherAnswerRef.current?.focus(), 0);
                      }}
                      type="button"
                    >
                      <span>None of the above</span>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">add note</span>
                    </button>
                  </div>
                ) : null}
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const answer = otherAnswers[question.id] || "";
                    if (questions.length === 1) void submitAnswers([{ question, answer }]);
                  }}
                >
                  <label className="text-sm font-semibold" htmlFor={`planning-other-answer-${question.id}`}>Other</label>
                  <textarea
                    {...DISABLE_TEXT_CORRECTION_PROPS}
                    className="min-h-24 rounded-md border bg-card px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    id={`planning-other-answer-${question.id}`}
                    onChange={(event) => {
                      setSelectedOptions((current) => ({ ...current, [question.id]: "__other__" }));
                      setOtherAnswers((current) => ({ ...current, [question.id]: event.target.value }));
                    }}
                    placeholder="None of the above. Use this instead..."
                    ref={questionIndex === 0 ? otherAnswerRef : undefined}
                    value={otherAnswers[question.id] || ""}
                  />
                  {questions.length === 1 ? (
                    <div className="flex justify-end">
                      <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={!answerForQuestion(question) || isAnswering} type="submit">
                        {isAnswering ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
                        Send Other
                      </Button>
                    </div>
                  ) : null}
                </form>
              </div>
            ))}
            {questions.length > 1 ? (
              <div className="flex justify-end">
                <Button
                  className="min-h-10 active:scale-[0.96] transition-transform"
                  disabled={!canSubmitBatch}
                  onClick={() => void submitAnswers(questions.map((question) => ({ question, answer: answerForQuestion(question) })))}
                  type="button"
                >
                  {isAnswering ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
                  Send Answers
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {showActivityPane ? (
          <div className="grid gap-3 rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {!questions.length || isRunning ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                <span className="truncate">{activityLabel}</span>
              </div>
              {activeRun ? (
                <span className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-[11px] text-secondary-foreground">
                  {activeRun.phase}
                </span>
              ) : null}
            </div>
            <div className="max-h-72 min-h-44 overflow-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-5 text-secondary-foreground shadow-inner">
              {workstream.length ? (
                workstream.map((line, index) => <p className="m-0 whitespace-pre-wrap" key={`${index}:${line}`}>{line}</p>)
              ) : (
                <p className="m-0 whitespace-pre-wrap">{activity || "Starting the planning agent"}</p>
              )}
            </div>
          </div>
        ) : null}
        {!questions.length && isRetryableFailure ? (
          <div className="grid gap-3 rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
            <div className="grid gap-1">
              <h2 className="m-0 text-base font-semibold text-foreground">{status === "stalled" ? "Codex stalled" : status === "schema_mismatch" ? "Invalid planning question" : "Codex turn failed"}</h2>
              <p className="m-0 leading-6">{activity || "The import-planning turn did not produce a usable structured question."}</p>
            </div>
            {workstream.length ? (
              <div className="max-h-64 overflow-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-5 text-secondary-foreground shadow-inner">
                {workstream.map((line, index) => <p className="m-0 whitespace-pre-wrap" key={`${index}:${line}`}>{line}</p>)}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {isRunning && activeRun?.runId ? (
            <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={isCancelling} variant="outline" onClick={() => void cancelRun()} type="button">
              {isCancelling ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
              Cancel Run
            </Button>
          ) : null}
          <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={isStarting || !activeProject || !["idle", "stalled", "schema_mismatch", "failed"].includes(status)} onClick={start} type="button">
            {isStarting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Play aria-hidden="true" data-icon="inline-start" />}
            {isStarting ? "Starting Q&A" : isRetryableFailure || hasStarted ? "Retry Q&A" : status !== "idle" ? "Q&A Running" : "Start Q&A"}
          </Button>
        </div>
      </section>
      </BeamSurface>
    </main>
  );
}

function ProjectsView({
  groups,
  onNewProject,
  onOpenProject,
  onRemoveProject,
}: {
  groups: ProjectGroup[];
  onNewProject: () => void;
  onOpenProject: (project: ProjectRecord) => void;
  onRemoveProject: (project: ProjectRecord, deleteFiles: boolean) => Promise<void>;
}) {
  return (
    <section className="min-h-0 overflow-auto bg-background/80">
      <BeamSurface className="min-h-full bg-background/85" colorVariant="mono" cols={6} contentClassName="min-h-full" duration={7} rows={4} strength={0.18}>
        <header className="flex min-h-40 items-center justify-between px-10">
          <div>
            <h1 className="m-0 text-4xl font-bold leading-none">Projects</h1>
            <p className="m-0 mt-3 text-sm text-muted-foreground">Switch between registered local hyperwiki projects.</p>
          </div>
          <Button className="min-h-11 px-5" variant="outline" onClick={onNewProject}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            New Project
          </Button>
        </header>
        <div className="grid max-w-[84rem] grid-cols-2 gap-3 p-8 max-2xl:grid-cols-1">
          {groups.length ? (
            groups.map((group) => <ProjectCard group={group} key={group.projectSlug} onOpenProject={onOpenProject} onRemoveProject={onRemoveProject} />)
          ) : (
            <BeamSurface className="col-span-full flex min-h-[22rem] max-w-2xl flex-col justify-center rounded-md border bg-card/92 p-8 shadow-sm" colorVariant="ocean" cols={4} rows={3} strength={0.26}>
              <h2 className="m-0 text-3xl font-bold">No projects yet</h2>
              <p className="m-0 mt-3 text-sm text-muted-foreground">Create a fresh hyperwiki project from a brief to start the workspace.</p>
              <Button className="mt-6 w-fit min-h-11 px-5" onClick={onNewProject}>
                <Plus aria-hidden="true" data-icon="inline-start" />
                New Project
              </Button>
            </BeamSurface>
          )}
        </div>
      </BeamSurface>
    </section>
  );
}

function ProjectCard({
  group,
  onOpenProject,
  onRemoveProject,
}: {
  group: ProjectGroup;
  onOpenProject: (project: ProjectRecord) => void;
  onRemoveProject: (project: ProjectRecord, deleteFiles: boolean) => Promise<void>;
}) {
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [removeStatus, setRemoveStatus] = useState("");
  const [isRemoving, setIsRemoving] = useState(false);
  const selected = group.checkouts.find((checkout) => checkout.active) || group.checkouts.find((checkout) => checkout.worktreeSlug === "main") || group.checkouts[0];
  const isActive = group.checkouts.some((checkout) => checkout.active);
  const available = group.checkouts.some((checkout) => checkout.available !== false);
  const importPlanning = selected?.importPlanning;
  const importIncomplete = importPlanning?.status === "incomplete";
  const appUrl = `https://${group.projectSlug}.localhost`;
  const checkoutCount = group.checkouts.length;

  async function confirmRemoval() {
    if (!selected) return;
    setIsRemoving(true);
    setRemoveStatus(deleteFiles ? "Deleting project files" : "Removing project");
    try {
      await onRemoveProject(selected, deleteFiles);
      setIsConfirmingRemoval(false);
    } catch (error) {
      setRemoveStatus(error instanceof Error ? error.message : "Project removal failed.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <BeamSurface className={cn("min-h-[23rem] rounded-md border bg-card/92 shadow-sm", isActive && "border-primary/45 ring-1 ring-primary/25")} colorVariant={isActive ? "ocean" : "mono"} cols={4} rows={4} strength={isActive ? 0.32 : 0.2}>
    <article className="flex min-h-[23rem] flex-col p-5">
      <div className="mb-7 flex items-start justify-between gap-4">
        <h2 className="m-0 min-w-0 truncate text-lg font-bold">{group.name || selected?.name || group.projectSlug}</h2>
        <span className={cn("rounded-full border px-2 py-1 text-xs font-bold uppercase", isActive ? "bg-primary/10 text-secondary-foreground" : "bg-secondary text-muted-foreground")}>
          {importIncomplete ? "Import incomplete" : isActive ? "Active" : available ? "Available" : "Missing"}
        </span>
      </div>
      {group.checkouts.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {group.checkouts.map((checkout) => (
            <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", checkout.active && "border-primary bg-primary/10")} key={checkout.id}>
              {checkout.worktreeSlug || "main"} <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase text-muted-foreground">stopped</span>
            </span>
          ))}
        </div>
      ) : null}
      <p className="mb-5 truncate text-sm font-bold text-muted-foreground">{selected?.root || ""}</p>
      <div className="grid gap-2">
        <ProjectDetail label="Checkout" value={selected?.worktreeSlug || "main"} />
        {importIncomplete ? <ProjectDetail label="Import" value={importPlanning?.nextAction || "Resume planning Q&A"} /> : null}
        <ProjectDetail label="App" value={appUrl} />
        <ProjectDetail label="Last opened" value={formatProjectDate(selected?.lastOpenedAt)} />
      </div>
      <div className="mt-auto flex items-end justify-between pt-5">
        <Button onClick={() => selected && onOpenProject(selected)} disabled={!selected}>
          <ExternalLink aria-hidden="true" data-icon="inline-start" />
          Open Project
        </Button>
        <button className="rounded p-1 text-muted-foreground hover:text-foreground" type="button" aria-label={`Remove ${group.name}`} onClick={() => setIsConfirmingRemoval(true)}>
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
      {isConfirmingRemoval ? (
        <div className="mt-4 rounded-md border bg-background p-3">
          <div className="grid gap-1 text-sm">
            <strong>{checkoutCount > 1 ? `Remove checkout: ${selected?.worktreeSlug || "main"}` : "Destructive option"}</strong>
            <span className="text-muted-foreground">
              Removing this {checkoutCount > 1 ? "checkout" : "project"} only forgets it in hyperwiki. File deletion permanently deletes the {checkoutCount > 1 ? "checkout" : "project"} folder.
            </span>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <input className="size-4 accent-primary" checked={deleteFiles} disabled={!selected?.available || isRemoving} type="checkbox" onChange={(event) => setDeleteFiles(event.target.checked)} />
            <span>{selected?.available ? `Also delete ${checkoutCount > 1 ? "checkout" : "project"} files` : "Project files unavailable"}</span>
          </label>
          {removeStatus ? <p className="m-0 mt-2 text-xs text-muted-foreground" role="status">{removeStatus}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button disabled={isRemoving} variant="outline" onClick={() => setIsConfirmingRemoval(false)}>
              Cancel
            </Button>
            <Button disabled={isRemoving} onClick={() => void confirmRemoval()}>
              {isRemoving ? (deleteFiles ? "Deleting" : "Removing") : deleteFiles ? "Confirm Delete" : "Confirm Remove"}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
    </BeamSurface>
  );
}

function ProjectDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/86 px-3 py-3">
      <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-bold">{value}</div>
    </div>
  );
}

function formatProjectDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function PendingImportView({ project }: { project: ProjectRecord }) {
  return (
    <section className="flex min-h-0 items-center justify-center bg-background/80 p-8">
      <BeamSurface className="grid max-w-md gap-3 rounded-md border bg-card/92 p-8 text-center shadow-sm" colorVariant="ocean" cols={3} rows={3} strength={0.28}>
        <Loader2 aria-hidden="true" className="mx-auto size-5 animate-spin text-muted-foreground" />
        <h1 className="font-ui m-0 text-2xl font-semibold tracking-tight">Opening {project.name}</h1>
        <p className="m-0 text-sm text-muted-foreground">Waiting for the imported project to appear in the local registry.</p>
      </BeamSurface>
    </section>
  );
}

function NewProjectView({
  isFirstProject = false,
  onCreateProject,
}: {
  isFirstProject?: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) => Promise<ProjectRecord | void>;
}) {
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState("");
  const [documentType, setDocumentType] = useState("markdown");
  const [initializeGit, setInitializeGit] = useState(true);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [handoffProject, setHandoffProject] = useState<ProjectRecord | null>(null);
  const [importLog, setImportLog] = useState<string[]>(() => readImportLog());

  function logImport(message: string, error?: unknown) {
    appendImportLog(message, error);
    setImportLog(readImportLog());
  }

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    clearImportLog();
    setImportLog([]);
    setIsSubmitting(true);
    setStatus(files.length === 1 ? `Reading ${files[0].name}` : `Reading ${files.length} files`);
    logImport(files.length === 1 ? `Reading ${files[0].name}` : `Reading ${files.length} selected files`);
    try {
      const sourceDocuments = await Promise.all(files.map(async (file) => {
        const content = await file.text();
        logImport(`Read ${content.length} bytes from ${file.name}`);
        return {
          name: file.name,
          documentType: sourceDocumentTypeForFile(file.name),
          content,
        };
      }));
      const nextType = sourceDocuments.length === 1 ? sourceDocuments[0].documentType : "markdown";
      const combinedDocument = combineSourceDocuments(sourceDocuments);
      const nextTitle = title || files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setDocument(combinedDocument);
      setDocumentType(nextType);
      setTitle(nextTitle);
      await createProjectAndStartPlanning({
        title: nextTitle.trim(),
        document: combinedDocument.trim(),
        documentType: nextType,
        sourceDocuments,
        initializeGit,
      });
    } catch (error) {
      logImport("hyperwiki import failed while reading the selected file bundle.", error);
      setStatus(error instanceof Error ? `Could not read import files: ${error.message}` : "Could not read the import files.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createProjectAndStartPlanning({
      title: title.trim(),
      document: document.trim(),
      documentType,
      initializeGit,
    });
  }

  async function createProjectAndStartPlanning(input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) {
    if (!input.title.trim() || !input.document.trim()) {
      setStatus("Add a project name and source brief before planning the MVP.");
      return;
    }
    const pendingProject = pendingImportedProject(input.title);
    let routed = false;
    const routeToWorkspace = (project = pendingProject) => {
      if (routed) return;
      routed = true;
      logImport(`Writing pending import marker ${project.projectSlug}/${project.worktreeSlug}`);
      writePendingImportProject(project);
      const target = `/workspace/${encodeURIComponent(project.projectSlug)}/${encodeURIComponent(project.worktreeSlug)}#/wiki/plans/index.mdx`;
      logImport(`Forcing workspace route ${target}`);
      window.location.assign(target);
    };
    setIsSubmitting(true);
    setHandoffProject(pendingProject);
    setStatus("Initializing project");
    logImport(`Handoff view set for ${pendingProject.projectSlug}/${pendingProject.worktreeSlug}`);
    logImport("Creating imported project");
    const fallbackTimer = window.setTimeout(routeToWorkspace, 900);
    void onCreateProject(input)
      .then((project) => {
        if (!project) return;
        window.clearTimeout(fallbackTimer);
        setHandoffProject(project);
        setStatus("Project imported. Opening planning workspace");
        logImport(`Created project ${project.name} (${project.id})`);
        routeToWorkspace(project);
      })
      .catch((error) => {
        window.clearTimeout(fallbackTimer);
        setHandoffProject(null);
        logImport("hyperwiki import agent handoff failed.", error);
        setStatus(error instanceof Error ? error.message : "Could not start agent-led planning.");
      });
  }

  if (handoffProject) {
    return (
      <section className="flex min-h-0 items-center justify-center bg-background/80 p-8">
        <BeamSurface className="grid max-w-md gap-3 rounded-md border bg-card/92 p-8 text-center shadow-sm" colorVariant="ocean" cols={3} rows={3} strength={0.28}>
          <Loader2 aria-hidden="true" className="mx-auto size-5 animate-spin text-muted-foreground" />
          <h1 className="font-ui m-0 text-2xl font-semibold tracking-tight">Opening {handoffProject.name}</h1>
          <p className="m-0 text-sm text-muted-foreground">Switching to the planning workspace and starting the agent.</p>
        </BeamSurface>
      </section>
    );
  }

  const heading = isFirstProject ? "Welcome to hyperwiki" : "New Project";
  const subhead = isFirstProject
    ? "Create your first project by importing a brief or source file. hyperwiki will do the rest."
    : "Import a brief or source file. hyperwiki will do the rest.";
  const canSubmitBrief = Boolean(title.trim() && document.trim());

  return (
    <section className="min-h-0 overflow-auto bg-background/80">
      <BeamSurface className="min-h-full bg-background/86 px-5 py-10 md:px-10 md:py-14" colorVariant="mono" cols={5} duration={7} rows={4} strength={0.18}>
        <div className="mx-auto grid w-full max-w-[60rem] gap-9">
          <header className="px-1">
            <h1 className="font-ui m-0 text-4xl font-semibold leading-tight tracking-tight text-balance text-foreground md:text-5xl">{heading}</h1>
            <p className="m-0 mt-3 max-w-2xl text-base leading-7 text-muted-foreground text-pretty md:text-lg">
              {subhead}
            </p>
          </header>

          <BeamSurface className="rounded-lg border bg-card/92 shadow-sm" colorVariant="ocean" cols={4} rows={5} strength={0.24}>
          <form className="grid gap-6 p-5 md:p-8" data-testid="new-project-form" onSubmit={handleSubmit}>
          <label className="group flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-primary/45 bg-background px-6 text-center text-muted-foreground transition-colors hover:border-primary hover:bg-secondary/40 hover:text-foreground">
            <Upload aria-hidden="true" className="mb-4 size-10 text-primary transition-transform group-hover:-translate-y-0.5" />
            <span className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-active:scale-[0.98]">Import Project Doc</span>
            <small className="mt-3 text-sm text-muted-foreground">Markdown, HTML, or text files</small>
            <input className="sr-only" data-testid="project-file-input" type="file" accept=".md,.markdown,.html,.htm,.txt,.text,.csv,.tsv,.json,.yaml,.yml,text/*,application/json,application/x-yaml" multiple onChange={(event) => void handleFiles(event.target.files)} />
          </label>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
            <span className="h-px bg-border" />
            <span>OR</span>
            <span className="h-px bg-border" />
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-card-foreground">Project Name</span>
            <input {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-12 rounded-md border bg-background px-3 text-base outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring" autoComplete="off" placeholder="Enter project name" required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-card-foreground">Brief</span>
            <textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-[9rem] resize-y rounded-md border bg-background p-3 text-base leading-7 outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring" placeholder="Paste the project brief" required value={document} onChange={(event) => setDocument(event.target.value)} />
          </label>

          <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-card-foreground">
            <input className="size-5 accent-primary" checked={initializeGit} type="checkbox" onChange={(event) => setInitializeGit(event.target.checked)} />
            <span>Initialize Git and create an initial commit</span>
          </label>

          <Button className="min-h-12 w-full text-sm font-semibold transition-transform active:scale-[0.98] disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100" disabled={isSubmitting || !canSubmitBrief} type="submit">
            {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <FolderPlus aria-hidden="true" data-icon="inline-start" />}
            {isSubmitting ? "Starting Agent Planning" : "Start Agent Planning"}
          </Button>

          {status ? <p className="m-0 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground" role="status">{status}</p> : null}
          <ImportLog lines={importLog} />
          </form>
          </BeamSurface>
        </div>
      </BeamSurface>
    </section>
  );
}

function readImportLog() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(importLogStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-16) : [];
  } catch {
    return [];
  }
}

function appendImportLog(message: string, error?: unknown) {
  const line = `${new Date().toLocaleTimeString()} ${message}`;
  try {
    const next = [...readImportLog(), line].slice(-16);
    window.sessionStorage.setItem(importLogStorageKey, JSON.stringify(next));
  } catch {
    // Import logging is diagnostic only.
  }
  if (error) {
    console.error(`[hyperwiki] import ui ${message}`, error);
  } else {
    console.info(`[hyperwiki] import ui ${message}`);
  }
}

function clearImportLog() {
  try {
    window.sessionStorage.removeItem(importLogStorageKey);
  } catch {
    // Ignore diagnostic cleanup failures.
  }
}

function ImportLog({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <BeamSurface className="mt-4 rounded-md border bg-background/88 p-3" colorVariant="mono" cols={4} rows={2} strength={0.14}>
      <h3 className="m-0 text-xs font-bold uppercase text-muted-foreground">Import Log</h3>
      <ol className="m-0 mt-2 grid gap-1 p-0 text-xs text-muted-foreground">
        {lines.map((line, index) => (
          <li className="list-none break-words" key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </BeamSurface>
  );
}

function documentSummary(document: string) {
  if (/^\s*(<!doctype html|<html[\s>])/i.test(document)) {
    const parsed = new DOMParser().parseFromString(document, "text/html");
    const summary = parsed.querySelector("meta[name='description']")?.getAttribute("content")
      || parsed.querySelector(".lede, p")?.textContent
      || parsed.body?.textContent
      || "";
    return summary.trim().replace(/\s+/g, " ").slice(0, 240);
  }
  return document
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

function combineSourceDocuments(sourceDocuments: SourceDocumentInput[]) {
  if (sourceDocuments.length === 1) return sourceDocuments[0].content;
  return sourceDocuments
    .map((document) => `# Imported file: ${document.name}\n\nSource type: ${document.documentType}\n\n${document.content}`)
    .join("\n\n---\n\n");
}

function sourceDocumentTypeForFile(name: string) {
  const lower = name.toLowerCase();
  if (/\.html?$/.test(lower)) return "html";
  if (/\.(json|ya?ml|csv|tsv|txt|text)$/.test(lower)) return "text";
  return "markdown";
}

function SettingsView({ activeProject, onOpenProjectEnv, settings }: { activeProject: ProjectRecord | null; onOpenProjectEnv: (initialKey?: string, reason?: string) => void; settings: SettingsResponse | null }) {
  const [draft, setDraft] = useState<SettingsResponse | null>(settings);
  const [mode, setMode] = useState<"overview" | "theme" | "agent">("overview");
  const [themeDraft, setThemeDraft] = useState<SettingsResponse["theme"] | null>(settings?.theme || null);
  const [agentDraft, setAgentDraft] = useState<{ soul: SettingsResponse["soul"]; memory: SettingsResponse["memory"] } | null>(null);
  const [agentsFile, setAgentsFile] = useState<{ path: string; content: string }>({ path: "", content: "" });
  const [status, setStatus] = useState("");
  const currentDraftRef = useRef<SettingsResponse | null>(settings);
  const themeEditorBaselineRef = useRef<SettingsResponse["theme"] | null>(settings?.theme || null);
  const themeAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeAutosaveRequestRef = useRef(0);

  useEffect(() => {
    setDraft(settings);
    setThemeDraft(settings?.theme || null);
  }, [settings]);

  useEffect(() => {
    currentDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (mode !== "theme" || !draft || !themeDraft) return;
    applyAppTheme(themeDraft);
    if (themeJson(themeDraft) === themeJson(draft.theme)) return;

    if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    const requestId = ++themeAutosaveRequestRef.current;
    setStatus("Saving theme...");

    themeAutosaveTimerRef.current = setTimeout(async () => {
      const currentDraft = currentDraftRef.current;
      if (!currentDraft) return;
      try {
        const saved = await hyperwikiApi.json<SettingsResponse>("/api/settings", { method: "PUT", body: { ...currentDraft, theme: themeDraft } });
        if (requestId !== themeAutosaveRequestRef.current) return;
        applyAppTheme(saved.theme);
        setDraft(saved);
        setThemeDraft(saved.theme || null);
        setStatus("Theme autosaved.");
      } catch (error) {
        if (requestId !== themeAutosaveRequestRef.current) return;
        setStatus(error instanceof Error ? error.message : "Could not save theme.");
      }
    }, THEME_AUTOSAVE_DELAY_MS);

    return () => {
      if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    };
  }, [draft, mode, themeDraft]);

  useEffect(() => {
    return () => {
      if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (mode !== "agent" || !activeProject) return;
    let cancelled = false;
    setAgentsFile({ path: "Loading", content: "" });
    hyperwikiApi
      .json<{ path?: string; content?: string }>(withProjectQuery("/api/settings/agents-file", activeProject))
      .then((result) => {
        if (cancelled) return;
        const content = replaceManagedAgentsBlock(result.content || "", renderAgentsManagedBlock(agentDraft || { soul: draft?.soul, memory: draft?.memory }));
        setAgentsFile({ path: result.path || "AGENTS.md", content });
      })
      .catch((error) => {
        if (cancelled) return;
        setAgentsFile({ path: "Unavailable", content: error instanceof Error ? error.message : "Could not load AGENTS.md." });
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject, draft?.memory, draft?.soul, mode]);

  async function save(next: SettingsResponse, messages: { saving?: string; saved?: string } = {}) {
    setStatus(messages.saving || "Saving...");
    try {
      const saved = await hyperwikiApi.json<SettingsResponse>("/api/settings", { method: "PUT", body: next });
      applyAppTheme(saved.theme);
      setDraft(saved);
      setThemeDraft(saved.theme || null);
      setStatus(messages.saved || "Saved.");
      return saved;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save settings.");
      return null;
    }
  }

  function openThemeEditor() {
    const baseline = structuredClone(draft?.theme || {});
    themeEditorBaselineRef.current = baseline;
    setThemeDraft(baseline);
    setMode("theme");
    setStatus("");
  }

  function openAgentEditor() {
    setAgentDraft({ soul: structuredClone(draft?.soul || {}), memory: structuredClone(draft?.memory || { entries: [] }) });
    setMode("agent");
    setStatus("");
  }

  async function revertTheme() {
    if (!draft) return;
    if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    const baseline = structuredClone(themeEditorBaselineRef.current || draft.theme || {});
    const requestId = ++themeAutosaveRequestRef.current;
    setMode("overview");
    setThemeDraft(baseline);
    const saved = await save({ ...draft, theme: baseline }, { saving: "Reverting theme...", saved: "Theme reverted." });
    if (!saved && requestId === themeAutosaveRequestRef.current) setMode("theme");
  }

  async function completeThemeEditor() {
    if (!draft || !themeDraft || themeJson(themeDraft) === themeJson(draft.theme)) {
      setMode("overview");
      return;
    }
    if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    const requestId = ++themeAutosaveRequestRef.current;
    const saved = await save({ ...draft, theme: themeDraft }, { saving: "Saving theme...", saved: "Theme autosaved." });
    if (saved && requestId === themeAutosaveRequestRef.current) setMode("overview");
  }

  async function saveAgentInstructions() {
    if (!draft || !agentDraft) return;
    const nextSoul = agentDraft.soul || {};
    const nextMemory = {
      entries: (agentDraft.memory?.entries || [])
        .map((entry) => ({
          id: entry.id || crypto.randomUUID(),
          title: String(entry.title || "").trim(),
          content: String(entry.content || "").trim(),
          enabled: entry.enabled !== false,
          updatedAt: new Date().toISOString(),
        }))
        .filter((entry) => entry.title || entry.content),
    };
    const saved = await save({ ...draft, soul: nextSoul, memory: nextMemory });
    if (!saved) return;
    if (activeProject) {
      setStatus("Syncing AGENTS.md...");
      const content = replaceManagedAgentsBlock(agentsFile.content, renderAgentsManagedBlock({ soul: nextSoul, memory: nextMemory }));
      try {
        await hyperwikiApi.json(withProjectQuery("/api/settings/sync-agents", activeProject), { method: "POST", body: { content } });
        setStatus("Agent instructions saved.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not sync AGENTS.md.");
        return;
      }
    }
    setMode("overview");
  }

  async function updateTerminalCompletionNotifications(next: Partial<TerminalCompletionNotificationSettings>) {
    if (!draft) return;
    const current = terminalCompletionNotificationSettings(draft.notifications);
    const notifications = {
      ...(draft.notifications || {}),
      terminalCompletion: {
        ...current,
        ...next,
      },
    };
    await save({ ...draft, notifications }, { saving: "Saving notifications...", saved: "Notification settings saved." });
  }

  if (!draft) {
    return (
      <section className="min-h-0 overflow-auto bg-background/80">
        <BeamSurface className="min-h-full bg-background" colorVariant="mono" cols={5} contentClassName="min-h-full" dividerStroke="transparent" duration={7} rows={4} strength={0.08}>
        <SettingsPageHeader title="Settings" description="Control global theme and agent instructions." />
        <div className="m-8 border bg-card p-4 text-sm text-muted-foreground">Settings are unavailable.</div>
        </BeamSurface>
      </section>
    );
  }

  const theme = effectiveTheme(draft.theme);
  const overviewMemory = draft.memory?.entries || [];
  const soul = draft.soul || {};

  if (mode === "theme") {
    const editableTheme = themeDraft || {};
    const editTheme = effectiveTheme(editableTheme);
    const presets = editableTheme.presets || {};
    return (
      <section className="min-h-0 overflow-auto bg-background/80">
        <BeamSurface className="min-h-full bg-background" colorVariant="mono" cols={6} contentClassName="min-h-full" dividerStroke="transparent" duration={7} rows={5} strength={0.08}>
        <SettingsPageHeader
          actions={<><Button variant="outline" onClick={revertTheme}>Revert</Button><Button onClick={completeThemeEditor}>Done</Button></>}
          description="Theme changes apply immediately and save automatically."
          title="Edit Theme"
        />
        <div className="grid min-w-0 gap-4 p-8">
          <ThemePresetCard large presetKey={editableTheme.activePreset || "custom"} theme={editTheme} />
          <ThemePresetStrip activePreset={editableTheme.activePreset || ""} onSelect={(key) => setThemeDraft(selectThemePreset(editableTheme, key))} presets={presets} />
          <div className="grid grid-cols-[minmax(360px,0.55fr)_minmax(420px,1fr)] gap-4 max-lg:grid-cols-1">
            <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={3} dividerStroke="transparent" rows={4} strength={0.12}>
              <label className="grid gap-1 text-xs font-bold uppercase text-muted-foreground">
                Mode
                <select className="rounded-md border bg-background px-2 py-2 text-sm font-normal text-foreground" value={editTheme.mode} onChange={(event) => setThemeDraft(updateThemeMode(editableTheme, event.target.value))}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ColorField label="Primary" value={editTheme.tokens.ui?.accent || "#4361ee"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "ui", "accent", value))} />
                <ColorField label="Terminal Accent" value={editTheme.tokens.terminal?.accent || editTheme.tokens.ui?.accent || "#4361ee"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "terminal", "accent", value))} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <SelectField label="Body Style" value={fontStyle(editTheme.tokens.docs?.serifFont)} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "docs", "serifFont", value === "sans" ? "Work Sans, sans-serif" : "Instrument Serif, serif"))} options={[["serif", "Serif"], ["sans", "Sans Serif"]]} />
                <SelectField label="Sidebar" value={editTheme.tokens.ui?.sidebarFont === editTheme.tokens.ui?.sansFont ? "body" : "mono"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "ui", "sidebarFont", value === "body" ? editTheme.tokens.ui?.sansFont || "Rethink Sans, sans-serif" : editTheme.tokens.docs?.monoFont || "Space Mono, monospace"))} options={[["body", "UI font"], ["mono", "Mono font"]]} />
                <SelectField label="Mono Font" value={editTheme.tokens.docs?.monoFont || "Space Mono, monospace"} onChange={(value) => setThemeDraft(updateThemeToken(updateThemeToken(editableTheme, "docs", "monoFont", value), "terminal", "font", value))} options={[["Space Mono, monospace", "Space Mono"], ["IBM Plex Mono, monospace", "IBM Plex Mono"], ["Fira Code, monospace", "Fira Code"], ["Roboto Mono, monospace", "Roboto Mono"]]} />
                <SelectField label="Terminal Mode" value={editTheme.tokens.terminal?.mode || "dark"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "terminal", "mode", value))} options={[["dark", "Dark"], ["light", "Light"], ["match", "Match UI"]]} />
              </div>
              <ThemeFontSummary theme={editTheme} />
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-bold uppercase text-muted-foreground">Advanced JSON</summary>
                <textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="mt-2 min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs" value={JSON.stringify(themeDraft, null, 2)} onChange={(event) => { try { setThemeDraft(JSON.parse(event.target.value)); setStatus(""); } catch { setStatus("Theme JSON is not valid."); } }} />
              </details>
            </BeamSurface>
            <BeamSurface className="grid rounded-md border bg-card p-6 shadow-sm" colorVariant="ocean" cols={4} dividerStroke="transparent" rows={3} strength={0.14}>
              <div className="grid grid-cols-[190px_1fr] gap-8">
                <div className="border-r pr-6 font-ui">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Plans</p>
                  <p className="mt-3 text-sm">Stage 08 Settings</p>
                  <p className="mt-3 text-sm">Unit 02 - Theme System</p>
                </div>
                <div style={{ fontFamily: editTheme.tokens.docs?.serifFont }}>
                  <h2 className="text-4xl">Planning Preview</h2>
                  <p className="mt-4 max-w-xl text-2xl text-muted-foreground">Docs keep their reading voice while the UI stays dense and scannable.</p>
                  <code className="mt-5 inline-block bg-muted px-2 py-1 font-mono text-sm">wiki/plans/mvp/stage-08-settings-soul-memory.mdx</code>
                </div>
              </div>
            </BeamSurface>
          </div>
        </div>
        <SettingsStatus status={status} />
        </BeamSurface>
      </section>
    );
  }

  if (mode === "agent") {
    const editableAgent = agentDraft || { soul: draft.soul || {}, memory: draft.memory || { entries: [] } };
    return (
      <section className="min-h-0 overflow-auto bg-background/80">
        <BeamSurface className="min-h-full bg-background" colorVariant="mono" cols={6} contentClassName="min-h-full" dividerStroke="transparent" duration={7} rows={5} strength={0.08}>
        <SettingsPageHeader
          actions={<><Button variant="outline" onClick={() => { setAgentDraft(null); setMode("overview"); }}>Cancel</Button><Button onClick={saveAgentInstructions}>Save Agent Instructions</Button></>}
          description="Saving updates global instructions and syncs the current project AGENTS.md."
          title="Edit Agent Instructions"
        />
        <div className="grid gap-4 p-8">
          <div className="grid grid-cols-[minmax(360px,0.78fr)_minmax(320px,1fr)] gap-4 max-lg:grid-cols-1">
            <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={3} dividerStroke="transparent" rows={4} strength={0.12}>
              <TextareaField label="Principles" value={(editableAgent.soul?.principles || []).join("\n")} rows={8} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), principles: value.split("\n").map((line) => line.trim()).filter(Boolean) } })} />
              <TextareaField label="Interface Guidance" value={editableAgent.soul?.interface || ""} rows={5} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), interface: value } })} />
              <TextareaField label="Agent Guidance" value={editableAgent.soul?.agent || ""} rows={5} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), agent: value } })} />
            </BeamSurface>
            <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={3} dividerStroke="transparent" rows={4} strength={0.12}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase">Memory</h2>
                <Button variant="outline" onClick={() => setAgentDraft({ ...editableAgent, memory: { entries: [...(editableAgent.memory?.entries || []), { title: "", content: "", enabled: true }] } })}>+ Memory</Button>
              </div>
              <div className="grid gap-3">
                {(editableAgent.memory?.entries || []).length ? (editableAgent.memory?.entries || []).map((entry, index) => (
                  <MemoryEditor entry={entry} index={index} key={entry.id || index} onChange={(next) => {
                    const entries = [...(editableAgent.memory?.entries || [])];
                    entries[index] = next;
                    setAgentDraft({ ...editableAgent, memory: { entries } });
                  }} onRemove={() => setAgentDraft({ ...editableAgent, memory: { entries: (editableAgent.memory?.entries || []).filter((_, itemIndex) => itemIndex !== index) } })} />
                )) : <p className="text-sm text-muted-foreground">No memory entries added yet.</p>}
              </div>
            </BeamSurface>
          </div>
          <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={5} dividerStroke="transparent" rows={3} strength={0.1}>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold uppercase">AGENTS.md</h2>
              <span className="truncate text-xs text-muted-foreground">{agentsFile.path || "AGENTS.md"}</span>
            </div>
            <textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-[360px] w-full rounded-md border bg-background p-4 font-mono text-xs leading-relaxed" value={agentsFile.content} onChange={(event) => setAgentsFile({ ...agentsFile, content: event.target.value })} />
          </BeamSurface>
        </div>
        <SettingsStatus status={status} />
        </BeamSurface>
      </section>
    );
  }

  return (
    <section className="min-h-0 overflow-auto bg-background/80">
      <BeamSurface className="min-h-full bg-background" colorVariant="mono" cols={6} contentClassName="min-h-full" dividerStroke="transparent" duration={7} rows={5} strength={0.08}>
      <SettingsPageHeader title="Settings" description="Control global theme and agent instructions." />
      <div className="grid grid-cols-[minmax(480px,1.18fr)_minmax(340px,0.82fr)] gap-5 p-8 max-lg:grid-cols-1">
        <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="ocean" cols={4} dividerStroke="transparent" rows={4} strength={0.12}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase">Theme</h2>
            <Button variant="outline" onClick={openThemeEditor}>Edit</Button>
          </div>
          <div className="grid min-h-48 grid-cols-[minmax(0,1fr)_auto] items-end gap-5 rounded-md border bg-background p-7">
            <h3 className="m-0 text-7xl font-bold leading-none">{theme.label}</h3>
            <ThemeSwatches colors={[theme.tokens.ui?.bg, theme.tokens.ui?.panel, theme.tokens.ui?.accent, theme.tokens.docs?.bg, theme.tokens.docs?.link, theme.tokens.terminal?.bg, theme.tokens.terminal?.accent]} tall />
          </div>
          <div className="mt-4 grid gap-3">
            <ThemeSurfaceSummary label="UI" description="Sidebar and workspace chrome" tokens={theme.tokens.ui} fontKeys={[["UI Font", "sidebarFont"]]} />
            <ThemeSurfaceSummary label="Docs" description="Planning and wiki pages" tokens={theme.tokens.docs} fontKeys={[["Primary Font", "serifFont"], ["Mono Font", "monoFont"]]} />
            <ThemeSurfaceSummary label="Terminal" description="Pane chrome and session frames" tokens={theme.tokens.terminal} fontKeys={[["Font", "font"]]} />
          </div>
        </BeamSurface>
        <div className="grid gap-5">
          <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={3} dividerStroke="transparent" rows={3} strength={0.1}>
            <div className="mb-4 flex items-start gap-3">
              <Bell aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <h2 className="m-0 text-sm font-bold uppercase">Notifications</h2>
                <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">Notify when a project terminal finishes while hyperwiki is not focused.</p>
              </div>
            </div>
            <div className="grid gap-3 text-sm">
              <label className="flex items-center gap-3">
                <input className="size-4 accent-primary" checked={terminalCompletionNotificationSettings(draft.notifications).enabled} type="checkbox" onChange={(event) => void updateTerminalCompletionNotifications({ enabled: event.target.checked })} />
                <span>Terminal completion notifications</span>
              </label>
              <label className="flex items-center gap-3">
                <input className="size-4 accent-primary" checked={terminalCompletionNotificationSettings(draft.notifications).sound} disabled={!terminalCompletionNotificationSettings(draft.notifications).enabled} type="checkbox" onChange={(event) => void updateTerminalCompletionNotifications({ sound: event.target.checked })} />
                <span>Play system chime</span>
              </label>
              <label className="flex items-center gap-3">
                <input className="size-4 accent-primary" checked={terminalCompletionNotificationSettings(draft.notifications).onlyWhenUnfocused} disabled={!terminalCompletionNotificationSettings(draft.notifications).enabled} type="checkbox" onChange={(event) => void updateTerminalCompletionNotifications({ onlyWhenUnfocused: event.target.checked })} />
                <span>Only when hyperwiki is unfocused</span>
              </label>
            </div>
          </BeamSurface>
          <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={3} dividerStroke="transparent" rows={4} strength={0.1}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase">Agent Instructions</h2>
              <Button variant="outline" onClick={openAgentEditor}>Edit</Button>
            </div>
            <div className="grid gap-3">
              <AgentSummaryCard title="Soul" meta={`${soul.principles?.length || 0} principles`} lines={(soul.principles || []).slice(0, 3)} />
              <AgentSummaryCard title="Agent" meta="Guidance" lines={[soul.agent || "No agent guidance recorded."]} />
              <AgentSummaryCard title="Memory" meta={`${overviewMemory.filter((entry) => entry.enabled !== false && (entry.title || entry.content)).length} enabled`} lines={overviewMemory.filter((entry) => entry.enabled !== false && (entry.title || entry.content)).slice(0, 3).map((entry) => entry.title || entry.content || "")} />
            </div>
          </BeamSurface>
          <BeamSurface className="rounded-md border bg-card p-4 shadow-sm" colorVariant="mono" cols={3} dividerStroke="transparent" rows={2} strength={0.1}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-sm font-bold uppercase">Project Env</h2>
                <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
                  Store local keys in the active checkout's <code>.env.local</code> without putting values into terminal history.
                </p>
                {activeProject ? <p className="m-0 mt-2 truncate text-xs text-muted-foreground">{activeProject.root}</p> : null}
              </div>
              <Button disabled={!activeProject} variant="outline" onClick={() => onOpenProjectEnv(undefined, "settings")}>
                <KeyRound data-icon="inline-start" />
                Env
              </Button>
            </div>
          </BeamSurface>
        </div>
      </div>
      <SettingsStatus status={status} />
      </BeamSurface>
    </section>
  );
}

function SettingsPageHeader({ actions, description, title }: { actions?: ReactNode; description: string; title: string }) {
  return (
    <header className="flex min-h-36 items-start justify-between gap-6 bg-muted/20 px-8 py-10">
      <div>
        <h1 className="font-ui m-0 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{title}</h1>
        <p className="m-0 mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pt-10">{actions}</div> : null}
    </header>
  );
}

function SettingsStatus({ status }: { status: string }) {
  if (!status) return null;
  return <p className="px-8 pb-6 text-sm text-muted-foreground" role="status">{status}</p>;
}

function ProjectEnvEditor({
  activeProject,
  initialKey,
  onClose,
  onSaved,
  open,
  reason,
}: {
  activeProject: ProjectRecord | null;
  initialKey?: string;
  onClose: () => void;
  onSaved: (keys: string[]) => void;
  open: boolean;
  reason?: string;
}) {
  const [summary, setSummary] = useState<ProjectEnvResponse | null>(null);
  const [rows, setRows] = useState<Array<{ id: string; name: string; present: boolean; source: string; value: string }>>([]);
  const [focusedValueRows, setFocusedValueRows] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<ProjectEnvStatusTone>("neutral");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedSignatureRef = useRef("");

  useEffect(() => {
    if (!open || !activeProject) return;
    let cancelled = false;
    setIsLoading(true);
    setStatus("Loading project env...");
    setStatusTone("neutral");
    hyperwikiApi
      .json<ProjectEnvResponse>(withProjectQuery("/api/project-env", activeProject))
      .then((response) => {
        if (cancelled) return;
        setSummary(response);
        setRows(projectEnvRows(response, initialKey));
        setFocusedValueRows({});
        setRevealed({});
        setStatus("");
        setStatusTone("neutral");
        lastSavedSignatureRef.current = "";
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Could not load project env.");
        setStatusTone("error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id, initialKey, open]);

  const activePath = summary?.envFile || (activeProject ? `${activeProject.root}/.env.local` : ".env.local");
  const dirtyRows = rows
    .map((row) => ({ name: row.name.trim(), value: row.value }))
    .filter((row) => row.name && row.value.length > 0);
  const hasInvalidKey = rows.some((row) => row.name.trim() && !isValidEnvKeyName(row.name.trim()));
  const canSave = Boolean(activeProject) && dirtyRows.length > 0 && !hasInvalidKey && !isSaving && !isLoading;
  const saveLabel = summary?.gitIgnored ? "Save now" : "Add .env.local to .gitignore and save";
  const dirtySignature = dirtyRows.map((row) => `${row.name}\0${row.value}`).join("\0\0");

  useEffect(() => {
    if (!open || !canSave || !dirtySignature || dirtySignature === lastSavedSignatureRef.current) return;
    const timeout = window.setTimeout(() => {
      void save(!summary?.gitIgnored, "auto");
    }, PROJECT_ENV_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [canSave, dirtySignature, open, summary?.gitIgnored]);

  if (!open) return null;

  function updateRow(id: string, patch: Partial<{ name: string; value: string }>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addRow(name = "") {
    setRows((current) => [...current, { id: crypto.randomUUID(), name, present: false, source: "custom", value: "" }]);
  }

  async function save(addGitignore: boolean, mode: "auto" | "manual" = "manual") {
    if (!activeProject || !canSave) return;
    setIsSaving(true);
    setStatus(mode === "auto"
      ? summary?.gitIgnored ? "Autosaving .env.local..." : "Adding .env.local to .gitignore and autosaving..."
      : summary?.gitIgnored ? "Saving .env.local..." : "Updating .gitignore and saving .env.local...");
    setStatusTone("neutral");
    try {
      const saved = await hyperwikiApi.json<ProjectEnvResponse>(withProjectQuery("/api/project-env", activeProject), {
        method: "PUT",
        body: {
          addGitignore,
          entries: dirtyRows,
        },
      });
      const savedNames = new Set(dirtyRows.map((row) => row.name));
      setSummary(saved);
      setRows((current) => current.map((row) => savedNames.has(row.name.trim()) ? { ...row, present: true, source: ".env.local" } : row));
      setFocusedValueRows({});
      lastSavedSignatureRef.current = dirtySignature;
      setStatus(mode === "auto"
        ? "Saved"
        : reason === "terminal-detected"
        ? "Saved. Rerun the blocked command or restart the affected terminal."
        : "Saved. Restart any running process that needs the new value.");
      setStatusTone("success");
      onSaved(dirtyRows.map((row) => row.name));
    } catch (error) {
      lastSavedSignatureRef.current = "";
      setStatus(error instanceof Error ? error.message : "Could not save project env.");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="project-env-title" className="fixed bottom-3 left-3 z-50 flex max-h-[min(720px,calc(100vh-24px))] w-[min(560px,calc(100vw-24px))] origin-bottom-left flex-col overflow-hidden rounded-md border bg-card text-card-foreground shadow-2xl md:bottom-4 md:left-4 md:max-h-[min(720px,calc(100vh-32px))] md:w-[min(560px,calc(100vw-32px))]" role="dialog">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b p-4">
        <div className="min-w-0">
          <h2 className="m-0 flex items-center gap-2 text-xl font-semibold" id="project-env-title">
            <KeyRound data-icon="inline-start" />
            Project Env
          </h2>
          <p className="m-0 mt-2 truncate text-sm text-muted-foreground">{activePath}</p>
        </div>
        <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label="Close project env editor">
          <X aria-hidden="true" data-icon="inline-start" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!activeProject ? (
          <p className="m-0 text-sm text-muted-foreground">Open a project before editing env vars.</p>
        ) : (
          <div className="grid gap-4">
            {summary && !summary.gitIgnored ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                <strong className="block">Git ignore required</strong>
                <span className="mt-1 block text-muted-foreground">Hyperwiki will add <code>.env.local</code> to <code>.gitignore</code> before saving these local secrets.</span>
              </div>
            ) : null}
            {initialKey ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Detected key</span>
                <code className="ml-2">{initialKey}</code>
              </div>
            ) : null}
            <div className="grid gap-3">
              {rows.map((row) => {
                const invalid = Boolean(row.name.trim()) && !isValidEnvKeyName(row.name.trim());
                const showingStoredMask = row.present && !row.value && !focusedValueRows[row.id];
                return (
                  <div className="grid min-w-0 gap-3 rounded-md border bg-background p-3" key={row.id}>
                    <label className="grid min-w-0 gap-1">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground">Key</span>
                      <input
                        {...DISABLE_TEXT_CORRECTION_PROPS}
                        aria-invalid={invalid}
                        className={cn("h-9 min-w-0 rounded-md border bg-card px-2 font-mono text-xs outline-none focus:border-primary", invalid && "border-destructive")}
                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        title={row.name}
                        value={row.name}
                      />
                      <span className={cn("min-h-4 text-[11px]", row.present ? "font-semibold text-emerald-700" : "text-muted-foreground")}>
                        {row.present ? "value set in .env.local" : row.source}
                      </span>
                    </label>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <label className="grid min-w-0 gap-1">
                        <span className="flex items-center gap-2 text-[11px] font-bold uppercase text-muted-foreground">
                          Value
                          {row.present ? <strong className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">set</strong> : null}
                        </span>
                        <input
                          {...DISABLE_TEXT_CORRECTION_PROPS}
                          className="h-9 min-w-0 rounded-md border bg-card px-2 font-mono text-xs outline-none focus:border-primary"
                          onChange={(event) => updateRow(row.id, { value: event.target.value })}
                          onBlur={() => setFocusedValueRows((current) => ({ ...current, [row.id]: false }))}
                          onFocus={() => setFocusedValueRows((current) => ({ ...current, [row.id]: true }))}
                          placeholder={row.present ? "Paste to replace saved value" : "Paste value"}
                          type={showingStoredMask || revealed[row.id] ? "text" : "password"}
                          value={showingStoredMask ? "****************" : row.value}
                        />
                        <span className="min-h-4 text-[11px] text-muted-foreground">{row.present ? "Secret is saved locally. Paste a new value only if you want to replace it." : ""}</span>
                      </label>
                      <Button className="mt-5" size="icon" variant="outline" type="button" onClick={() => setRevealed((current) => ({ ...current, [row.id]: !current[row.id] }))} aria-label={revealed[row.id] ? "Hide value" : "Reveal value"}>
                        {revealed[row.id] ? <EyeOff aria-hidden="true" data-icon="inline-start" /> : <Eye aria-hidden="true" data-icon="inline-start" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" type="button" onClick={() => addRow()}>
                <Plus data-icon="inline-start" />
                Add key
              </Button>
              {summary?.suggestedKeys.filter((key) => !rows.some((row) => row.name === key.name)).slice(0, 6).map((key) => (
                <Button key={key.name} size="sm" variant="ghost" type="button" onClick={() => addRow(key.name)}>
                  {key.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer className="flex shrink-0 flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("m-0 flex min-w-0 items-center gap-2 text-sm text-muted-foreground", statusTone === "success" && "text-emerald-700", statusTone === "error" && "text-destructive")} role="status">
          {statusTone === "success" ? <Check aria-hidden="true" data-icon="inline-start" /> : null}
          <span className="min-w-0 truncate">{status || (dirtyRows.length ? "Autosaves after a short pause." : summary?.envFileExists ? ".env.local exists" : ".env.local will be created")}</span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Close</Button>
          <Button disabled={!canSave} type="button" onClick={() => save(!summary?.gitIgnored)}>
            {isSaving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {saveLabel}
          </Button>
        </div>
      </footer>
    </section>
  );
}

function ThemeSurfaceSummary({ description, fontKeys, label, tokens }: { description: string; fontKeys: Array<[string, string]>; label: string; tokens?: Record<string, string> }) {
  return (
    <BeamSurface className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 rounded-md border bg-background p-4" colorVariant="mono" cols={4} dividerStroke="transparent" rows={2} strength={0.08}>
      <header>
        <strong className="block text-sm">{label}</strong>
        <span className="text-xs text-muted-foreground">{description}</span>
      </header>
      <div className="min-w-0">
        <ThemeSwatches colors={["bg", "panel", "muted", "text", "border", "accent"].map((key) => tokens?.[key])} />
        <dl className="mt-3 grid gap-2">
          {fontKeys.map(([name, key]) => (
            <div className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-3" key={key}>
              <dt className="text-xs font-bold uppercase text-muted-foreground">{name}</dt>
              <dd className="min-w-0">
                <span className="block text-xs font-bold text-muted-foreground">{fontLabel(tokens?.[key])}</span>
                <span className="block truncate text-2xl" style={{ fontFamily: tokens?.[key] }}>AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </BeamSurface>
  );
}

function ThemeSwatches({ colors, tall = false }: { colors: Array<string | undefined>; tall?: boolean }) {
  return (
    <span className={cn("flex justify-end gap-1", tall && "items-end gap-0")}>
      {colors.filter(Boolean).map((color, index) => (
        <span
          className={cn("block rounded-sm border", tall ? "h-24 w-9 rounded-none first:rounded-l-md last:rounded-r-md" : "size-5")}
          key={`${color}-${index}`}
          style={{ background: color }}
          title={color}
        />
      ))}
    </span>
  );
}

function AgentSummaryCard({ lines, meta, title }: { lines: string[]; meta: string; title: string }) {
  const values = lines.filter(Boolean);
  return (
    <BeamSurface className="rounded-md border bg-background p-3" colorVariant="mono" cols={3} dividerStroke="transparent" rows={2} strength={0.08}>
      <header className="mb-2 flex items-center justify-between gap-3">
        <strong>{title}</strong>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </header>
      <ul className="m-0 grid gap-1 pl-5 text-sm text-muted-foreground">
        {(values.length ? values : ["No entries added yet."]).map((line, index) => <li key={index}>{line}</li>)}
      </ul>
    </BeamSurface>
  );
}

function ThemePresetStrip({ activePreset, onSelect, presets }: { activePreset: string; onSelect: (key: string) => void; presets: Record<string, ThemePreset> }) {
  const entries = Object.entries(presets);
  if (!entries.length) return null;
  return (
    <BeamSurface className="min-w-0 overflow-hidden rounded-md border bg-card p-3 shadow-sm" colorVariant="mono" cols={5} dividerStroke="transparent" rows={2} strength={0.08}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 text-xs font-bold uppercase text-muted-foreground">Presets</h2>
        <span className="truncate text-xs text-muted-foreground">Choosing a preset applies and autosaves.</span>
      </div>
      <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {entries.map(([key, preset]) => {
          const theme = normalizePreset(preset);
          const selected = key === activePreset;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "grid w-52 shrink-0 gap-2 rounded-md border bg-background p-3 text-left hover:border-primary",
                selected && "border-primary ring-1 ring-primary/40",
              )}
              key={key}
              onClick={() => onSelect(key)}
              type="button"
            >
              <span className="flex items-center gap-1">
                {["bg", "panel", "accent"].map((token) => (
                  <i
                    aria-hidden="true"
                    className="block size-4 rounded-full border"
                    key={token}
                    style={{ background: theme.tokens.ui?.[token] || theme.tokens.docs?.[token] || "transparent" }}
                  />
                ))}
                <i aria-hidden="true" className="ml-auto block h-4 w-8 rounded-full border" style={{ background: theme.tokens.terminal?.bg || "transparent" }} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm" style={{ fontFamily: theme.tokens.docs?.serifFont }}>{theme.label || key}</strong>
                <span className="block truncate text-xs text-muted-foreground" style={{ fontFamily: theme.tokens.docs?.monoFont }}>{key}</span>
              </span>
            </button>
          );
        })}
      </div>
    </BeamSurface>
  );
}

function ThemePresetCard({ large = false, presetKey, theme }: { large?: boolean; presetKey: string; theme: NormalizedTheme }) {
  return (
    <div className={cn("grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-center gap-3", large && "grid-cols-[300px_minmax(0,1fr)] rounded-md border bg-card p-7")}>
      <span className={cn("relative block h-16 overflow-hidden rounded-md border bg-background", large && "h-52")}>
        <i className="absolute left-8 top-10 size-6 bg-primary" style={{ background: theme.tokens.ui?.accent }} />
        <b className="absolute left-24 top-12 h-2 w-28 bg-primary" style={{ background: theme.tokens.docs?.link || theme.tokens.ui?.accent }} />
        <em className="absolute left-24 top-20 h-2 w-36 bg-primary/30" style={{ background: theme.tokens.ui?.muted || theme.tokens.ui?.panel }} />
        <strong className="absolute bottom-0 right-0 h-16 w-56 bg-foreground" style={{ background: theme.tokens.terminal?.bg }} />
      </span>
      <span className="min-w-0">
        <strong className={cn("block truncate", large && "text-2xl")}>{theme.label || presetKey}</strong>
        {large ? (
          <span className="mt-6 grid grid-cols-2 gap-8 border-t pt-5">
            <span>
              <small className="block text-xs font-bold uppercase text-muted-foreground">Text</small>
              <b className="block truncate text-3xl" style={{ fontFamily: theme.tokens.docs?.serifFont }}>AaBbCcDdEeFfGgHhIiJjKkLlMm</b>
              <em className="block truncate text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog.</em>
            </span>
            <span>
              <small className="block text-xs font-bold uppercase text-muted-foreground">Mono</small>
              <b className="block truncate text-3xl" style={{ fontFamily: theme.tokens.docs?.monoFont }}>AaBbCcDdEeFfGgHhIiJjKkLlMm</b>
              <em className="block truncate text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog.</em>
            </span>
          </span>
        ) : (
          <>
            <span className="block truncate text-sm text-muted-foreground" style={{ fontFamily: theme.tokens.docs?.serifFont }}>{fontLabel(theme.tokens.docs?.serifFont)}</span>
            <span className="block truncate text-sm text-muted-foreground" style={{ fontFamily: theme.tokens.docs?.monoFont }}>{fontLabel(theme.tokens.docs?.monoFont)}</span>
          </>
        )}
      </span>
    </div>
  );
}

function ColorField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-1 text-xs font-bold uppercase text-muted-foreground">
      {label}
      <input className="h-10 w-full rounded-md border bg-background px-1" type="color" value={normalizeColor(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <label className="grid gap-1 text-xs font-bold uppercase text-muted-foreground">
      {label}
      <select className="rounded-md border bg-background px-2 py-2 text-sm font-normal text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function ThemeFontSummary({ theme }: { theme: NormalizedTheme }) {
  const fonts = [
    ["Body", theme.tokens.docs?.serifFont],
    ["Sidebar", theme.tokens.ui?.sidebarFont],
    ["Mono", theme.tokens.docs?.monoFont],
    ["Terminal", theme.tokens.terminal?.font],
  ];
  return (
    <dl className="mt-4 grid gap-2 rounded-md border bg-background p-3 text-xs">
      {fonts.map(([label, value]) => (
        <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3" key={label}>
          <dt className="font-bold uppercase text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate font-normal text-foreground" style={{ fontFamily: value }}>{fontLabel(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TextareaField({ label, onChange, rows, value }: { label: string; onChange: (value: string) => void; rows: number; value: string }) {
  return (
    <label className="mb-4 grid gap-2 text-xs font-bold uppercase text-muted-foreground">
      {label}
      <textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="w-full rounded-md border bg-background p-3 font-mono text-sm font-normal normal-case text-foreground" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MemoryEditor({ entry, index, onChange, onRemove }: { entry: MemoryEntry; index: number; onChange: (entry: MemoryEntry) => void; onRemove: () => void }) {
  return (
    <article className="grid gap-2 rounded-md border bg-background p-3">
      <input {...DISABLE_TEXT_CORRECTION_PROPS} className="rounded-md border bg-card px-3 py-2 text-sm" placeholder={`Memory ${index + 1}`} value={entry.title || ""} onChange={(event) => onChange({ ...entry, title: event.target.value })} />
      <textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-20 rounded-md border bg-card px-3 py-2 text-sm" placeholder="Memory" value={entry.content || ""} onChange={(event) => onChange({ ...entry, content: event.target.value })} />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
          <input className="size-4 accent-primary" checked={entry.enabled !== false} type="checkbox" onChange={(event) => onChange({ ...entry, enabled: event.target.checked })} />
          Enabled
        </label>
        <Button variant="outline" onClick={onRemove}>Remove</Button>
      </div>
    </article>
  );
}

interface NormalizedTheme {
  label: string;
  mode: string;
  tokens: {
    ui?: Record<string, string>;
    docs?: Record<string, string>;
    terminal?: Record<string, string>;
  };
}

function effectiveTheme(theme?: SettingsResponse["theme"]): NormalizedTheme {
  const presets = theme?.presets || {};
  const preset = presets[theme?.activePreset || ""] || Object.values(presets)[0] || {};
  return mergePreset(normalizePreset(preset), { label: hasThemeOverrides(theme) ? "Custom" : preset.label || "Custom", tokens: theme?.customTokens || {} });
}

function applyAppTheme(themeSettings?: SettingsResponse["theme"]) {
  const theme = effectiveTheme(themeSettings);
  const ui = theme.tokens.ui || {};
  const docs = theme.tokens.docs || {};
  const terminal = theme.tokens.terminal || {};
  const root = document.documentElement;
  const background = normalizeColor(docs.bg || ui.bg || "#f7f7f4", "#f7f7f4");
  const panel = normalizeColor(ui.panel || docs.panel || "#ffffff", "#ffffff");
  const foreground = normalizeColor(ui.text || docs.text || "#20231f", "#20231f");
  const mutedForeground = normalizeColor(ui.muted || docs.muted || "#62675f", "#62675f");
  const border = normalizeColor(ui.border || docs.border || "#d8d8d0", "#d8d8d0");
  const accent = normalizeColor(ui.accent || docs.link || "#276ef1", "#276ef1");
  const secondary = mixHex(accent, theme.mode === "dark" ? "#ffffff" : panel, theme.mode === "dark" ? 0.18 : 0.9);
  const muted = mixHex(mutedForeground, background, theme.mode === "dark" ? 0.68 : 0.84);
  const uiFont = cssFontValue(ui.sansFont || ui.font || docs.sansFont, "\"Rethink Sans\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif");
  const primaryFont = cssFontValue(docs.serifFont, "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif");
  const monoFont = cssFontValue(docs.monoFont, "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace");
  const terminalFont = cssFontValue(terminal.font, monoFont);

  root.style.colorScheme = theme.mode === "dark" ? "dark" : "light";
  setCssVars(root, {
    "--background": background,
    "--foreground": foreground,
    "--card": panel,
    "--card-foreground": foreground,
    "--popover": panel,
    "--popover-foreground": foreground,
    "--primary": accent,
    "--primary-foreground": readableTextOn(accent),
    "--secondary": secondary,
    "--secondary-foreground": readableTextOn(secondary),
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--accent": accent,
    "--accent-foreground": readableTextOn(accent),
    "--border": border,
    "--input": border,
    "--ring": accent,
    "--ui-sans-font": uiFont,
    "--docs-serif-font": primaryFont,
    "--docs-mono-font": monoFont,
    "--terminal-font": terminalFont,
    "--sidebar-font": cssFontValue(ui.sidebarFont, uiFont),
  });
}

function cssFontValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function setCssVars(element: HTMLElement, vars: Record<string, string>) {
  Object.entries(vars).forEach(([name, value]) => element.style.setProperty(name, value));
}

function normalizePreset(preset?: ThemePreset): NormalizedTheme {
  const docs = { ...(preset?.tokens?.docs || {}) };
  const ui = { ...(preset?.tokens?.ui || {}) };
  ui.sansFont ||= "Rethink Sans, sans-serif";
  return {
    label: preset?.label || "Custom",
    mode: preset?.mode || "light",
    tokens: {
      ui,
      docs,
      terminal: { ...(preset?.tokens?.terminal || {}) },
    },
  };
}

function mergePreset(base: NormalizedTheme, patch: Partial<NormalizedTheme>): NormalizedTheme {
  return {
    label: patch.label || base.label,
    mode: patch.mode || base.mode,
    tokens: {
      ui: { ...(base.tokens.ui || {}), ...(patch.tokens?.ui || {}) },
      docs: { ...(base.tokens.docs || {}), ...(patch.tokens?.docs || {}) },
      terminal: { ...(base.tokens.terminal || {}), ...(patch.tokens?.terminal || {}) },
    },
  };
}

function hasThemeOverrides(theme?: SettingsResponse["theme"]) {
  return Object.values(theme?.customTokens || {}).some((surface) => Object.keys(surface || {}).length > 0);
}

function themeJson(theme?: SettingsResponse["theme"] | null) {
  return JSON.stringify(theme || {});
}

function selectThemePreset(theme: SettingsResponse["theme"], activePreset: string): SettingsResponse["theme"] {
  return {
    ...(theme || {}),
    activePreset,
    customTokens: {},
  };
}

function updateThemeMode(theme: SettingsResponse["theme"], mode: string): SettingsResponse["theme"] {
  return { ...(theme || {}), customTokens: { ...(theme?.customTokens || {}), ui: { ...(theme?.customTokens?.ui || {}) }, docs: { ...(theme?.customTokens?.docs || {}) }, terminal: { ...(theme?.customTokens?.terminal || {}), mode } } };
}

function updateThemeToken(theme: SettingsResponse["theme"], surface: "ui" | "docs" | "terminal", token: string, value: string): SettingsResponse["theme"] {
  return { ...(theme || {}), customTokens: { ...(theme?.customTokens || {}), [surface]: { ...(theme?.customTokens?.[surface] || {}), [token]: value } } };
}

function fontStyle(value?: string) {
  return value?.includes("sans-serif") ? "sans" : "serif";
}

function fontLabel(value?: string) {
  if (!value) return "Default";
  return value.split(",")[0].replaceAll("\"", "").trim();
}

function normalizeColor(value?: string, fallback = "#4361ee") {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value || fallback : fallback;
}

function readableTextOn(color: string) {
  return contrastRatio("#ffffff", color) >= contrastRatio("#111312", color) ? "#ffffff" : "#111312";
}

function mixHex(a: string, b: string, amount: number) {
  const left = hexToRgb(normalizeColor(a));
  const right = hexToRgb(normalizeColor(b));
  return rgbToHex({
    r: Math.round(left.r * (1 - amount) + right.r * amount),
    g: Math.round(left.g * (1 - amount) + right.g * amount),
    b: Math.round(left.b * (1 - amount) + right.b * amount),
  });
}

function contrastRatio(a: string, b: string) {
  const left = relativeLuminance(hexToRgb(normalizeColor(a)));
  const right = relativeLuminance(hexToRgb(normalizeColor(b)));
  const light = Math.max(left, right);
  const dark = Math.min(left, right);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function hexToRgb(hex: string) {
  const normalized = normalizeColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function renderAgentsManagedBlock(settings: { soul?: SettingsResponse["soul"]; memory?: SettingsResponse["memory"] }) {
  const soul = settings.soul || {};
  const principles = (soul.principles || []).filter(Boolean);
  const memories = (settings.memory?.entries || []).filter((entry) => entry.enabled !== false && String(entry.content || "").trim());
  return `<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->
## hyperwiki Global Context

### Soul

${principles.length ? principles.map((item) => `- ${item}`).join("\n") : "- No global soul principles recorded."}

Interface guidance: ${soul.interface || "Use hyperwiki's default interface guidance."}

Agent guidance: ${soul.agent || "Use hyperwiki's default agent guidance."}

### Memory

${memories.length ? memories.map((entry) => `- ${entry.title ? `${entry.title}: ` : ""}${entry.content}`).join("\n") : "- No approved global memory entries recorded."}
<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->`;
}

function replaceManagedAgentsBlock(content: string, block: string) {
  const start = "<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->";
  const end = "<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->";
  if (content.includes(start) && content.includes(end)) {
    return content.replace(new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`), block);
  }
  return `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${block}\n`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function TerminalPane(props: {
  activeSessionId: string | null;
  activeProject: ProjectRecord | null;
  isLoading: boolean;
  onCloseSession: (sessionId: string) => void;
  onCreateWorktree: (branch: string) => Promise<void>;
  onInitializeGit: () => Promise<void>;
  onOpenProjectEnv: (initialKey?: string, reason?: string) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onRestartDev: () => void;
  onRestartSession: (session: SessionRecord) => void;
  onRunDev: () => void;
  onShowDev: () => void;
  onStopDev: () => void;
  onStart: (role: "agent" | "cli") => void;
  onSelectSession: (sessionId: string) => void;
  onThinkingEffortChange: (effort: ThinkingEffort) => void;
  agentProvider: AgentProviderId;
  agentProviders: AgentProviderAvailability;
  onAgentProviderChange: (provider: AgentProviderId) => void;
  onTerminalText: (sessionId: string, text: string) => void;
  preview: AppPreviewResponse | null;
  repoContext: RepoContextResponse | null;
  scope: { scope: string; scopeKind: string; planPath: string | null };
  terminalEnvHint: { key: string; sessionId: string } | null;
  thinkingEffort: ThinkingEffort;
  currentWorkTitle: string;
  workspace: WorkspaceResponse | null;
  sessions: SessionRecord[];
}) {
  const liveSessions = useMemo(() => props.sessions.filter(isVisibleTerminalPaneSession), [props.sessions]);
  const devPaneSession = selectDevTerminalSession(liveSessions, props.preview) || previewDetachedDevSession(props.preview, props.activeProject);
  const terminalSessions = useMemo(() => liveSessions.filter((session) => session.role !== "dev"), [liveSessions]);
  const [isWorktreeOpen, setIsWorktreeOpen] = useState(false);
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [worktreeStatus, setWorktreeStatus] = useState("");
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set());
  const sessionSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const branchLabel = props.repoContext?.git?.worktree || props.activeProject?.worktreeSlug || props.repoContext?.git?.branch || props.activeProject?.branch || "main";
  const terminalContextLabel = props.currentWorkTitle || titleForPath(props.scope.planPath || "", []) || branchLabel;
  const hasGit = Boolean(props.repoContext?.git?.root);
  const canCreateWorktree = hasGit && ["main", "master"].includes(String(branchLabel || "").trim().toLowerCase());
  const canRunDev = props.preview?.canStart === true;
  const canStopDev = props.preview?.canStop === true;
  const devIsRunning = props.preview?.running === true;
  const devPaneIsDetached = Boolean(devPaneSession && isDetachedDevSession(devPaneSession));
  const expandedDevPaneSession = devPaneSession && !collapsedSessionIds.has(devPaneSession.id) ? devPaneSession : null;
  const devPaneNeedsTerminalSpace = Boolean(expandedDevPaneSession && !isDetachedDevSession(expandedDevPaneSession));
  const devPreviewUrl = props.preview?.url || "";
  const runDevTitle = canRunDev
    ? props.preview?.startCommand || "Run dev"
    : props.preview?.reason || "No package.json dev script is available.";
  const worktreeSlug = slugify(worktreeBranch.replace(/^refs\/heads\//, "") || "feature/worktree");
  const gitRoot = props.repoContext?.git?.root || props.repoContext?.root || "";
  const worktreePreview = worktreePreviewForSlug(gitRoot, worktreeSlug);
  const previewUrl = props.activeProject?.projectSlug ? `https://${worktreeSlug}.${props.activeProject.projectSlug}.localhost` : `https://${worktreeSlug}.localhost`;

  useEffect(() => {
    appendImportLog(`Terminal pane render project=${props.activeProject?.id || "none"} scope=${props.scope.scope} sessions=${props.sessions.length} active=${props.activeSessionId || "none"} ids=${props.sessions.map((session) => `${session.id}:${session.role || ""}:${session.scope || ""}`).join(",") || "none"}`);
  }, [props.activeProject?.id, props.activeSessionId, props.scope.scope, props.sessions]);

  useEffect(() => {
    setCollapsedSessionIds((current) => {
      const visibleIds = new Set(terminalSessions.map((session) => session.id));
      if (devPaneSession) visibleIds.add(devPaneSession.id);
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [devPaneSession, terminalSessions]);

  useEffect(() => {
    if (!props.activeSessionId) return;
    setCollapsedSessionIds((current) => {
      if (!current.has(props.activeSessionId || "")) return current;
      const next = new Set(current);
      next.delete(props.activeSessionId || "");
      return next;
    });
    requestAnimationFrame(() => {
      sessionSectionRefs.current[props.activeSessionId || ""]?.scrollIntoView({ block: "nearest" });
    });
  }, [props.activeSessionId]);

  function openWorktreePopover() {
    if (!hasGit) {
      setWorktreeStatus("Initialize Git before creating a worktree.");
      setIsWorktreeOpen(true);
      return;
    }
    const title = props.currentWorkTitle || titleForPath(props.scope.planPath || "worktree", []);
    setWorktreeBranch(`feature/${slugify(title || "worktree")}`);
    setWorktreeStatus(props.repoContext?.git?.dirty ? "Main has uncommitted changes. Commit them first if the worktree should include them." : "");
    setIsWorktreeOpen(true);
  }

  async function submitWorktree(event: FormEvent) {
    event.preventDefault();
    setIsCreatingWorktree(true);
    try {
      if (!hasGit) {
        setWorktreeStatus("Initializing Git...");
        await props.onInitializeGit();
        setWorktreeStatus("Git initialized. Create a worktree when ready.");
        return;
      }
      setWorktreeStatus("Creating worktree...");
      await props.onCreateWorktree(worktreeBranch.trim());
      setIsWorktreeOpen(false);
      setWorktreeStatus("");
    } catch (error) {
      setWorktreeStatus(error instanceof Error ? error.message : "Could not create worktree.");
    } finally {
      setIsCreatingWorktree(false);
    }
  }

  function setSessionSectionRef(sessionId: string, element: HTMLElement | null) {
    sessionSectionRefs.current[sessionId] = element;
  }

  function toggleSessionCollapsed(sessionId: string) {
    setCollapsedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  function revealDevTerminal() {
    if (devPaneSession) {
      setCollapsedSessionIds((current) => {
        if (!current.has(devPaneSession.id)) return current;
        const next = new Set(current);
        next.delete(devPaneSession.id);
        return next;
      });
      props.onSelectSession(devPaneSession.id);
      requestAnimationFrame(() => {
        sessionSectionRefs.current[devPaneSession.id]?.scrollIntoView({ block: "nearest" });
      });
      return;
    }
    props.onShowDev();
  }

  function toggleDevCollapsed() {
    if (devPaneSession) {
      toggleSessionCollapsed(devPaneSession.id);
      return;
    }
    props.onShowDev();
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-[#2c302d] bg-[#111312] text-[#eef2ec] max-xl:hidden">
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-[#2c302d] bg-[#171a18] px-3 text-xs">
        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-[#9da79f]" />
          <strong className="min-w-0 max-w-[260px] truncate font-medium text-[#eef2ec]" title={`Current work: ${terminalContextLabel}. Checkout: ${branchLabel}`}>{terminalContextLabel}</strong>
          {canCreateWorktree || !hasGit ? (
            <Button className="h-7 border-[#8ea0ff] bg-[#8ea0ff]/15 px-3 text-xs font-bold text-white hover:bg-[#8ea0ff]/25" size="sm" variant="outline" type="button" onClick={openWorktreePopover}>
              {hasGit ? "+ worktree" : "init git"}
            </Button>
          ) : null}
          <Button className="h-7 border-[#3a403b] bg-transparent px-3 text-xs font-bold text-[#eef2ec] hover:border-[#9fd1ff] hover:bg-transparent hover:text-[#9fd1ff] disabled:cursor-not-allowed disabled:border-[#2c302d] disabled:text-[#68716a]" disabled={!props.activeProject} size="sm" title="Edit project .env.local" variant="outline" type="button" onClick={() => props.onOpenProjectEnv(undefined, "terminal")}>
            env
          </Button>
          {isWorktreeOpen ? (
            <form className="absolute left-0 top-[calc(100%+8px)] z-50 grid w-[min(420px,calc(100vw-32px))] gap-3 rounded-lg border border-[#465063] bg-[#111513] p-3.5 text-[#eef2ec] shadow-[0_18px_52px_rgba(0,0,0,0.42)]" onSubmit={submitWorktree}>
              <header className="flex items-center justify-between gap-3">
                <strong className="text-sm">New worktree</strong>
                <button className="grid size-7 place-items-center text-xl leading-none text-[#aeb8b0] hover:text-[#eef2ec]" type="button" onClick={() => setIsWorktreeOpen(false)} aria-label="Close worktree creator">&times;</button>
              </header>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase text-[#9da79f]">Branch</span>
                <input {...DISABLE_TEXT_CORRECTION_PROPS} className="w-full rounded-md border border-[#3a403b] bg-[#0c0f0d] px-2.5 py-2 text-xs text-[#eef2ec] outline-none focus:border-[#8ea0ff]" disabled={!hasGit} value={worktreeBranch} onChange={(event) => setWorktreeBranch(event.target.value)} />
              </label>
              <dl className="grid gap-1.5 rounded-md border border-[#2c302d] bg-[#151917] p-2.5">
                <div className="flex items-center justify-between gap-3"><dt className="text-[11px] font-bold uppercase text-[#9da79f]">Slug</dt><dd className="truncate text-right">{worktreeSlug}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-[11px] font-bold uppercase text-[#9da79f]">Path</dt><dd className="truncate text-right">{worktreePreview}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="text-[11px] font-bold uppercase text-[#9da79f]">Preview</dt><dd className="truncate text-right">{previewUrl}</dd></div>
              </dl>
              {worktreeStatus ? <p className="m-0 text-[11px] leading-snug text-[#f4d88c]">{worktreeStatus}</p> : null}
              <footer className="flex items-center justify-end gap-3">
                <Button className="h-8 border-[#eef2ec] bg-[#eef2ec] px-3 text-xs font-extrabold text-[#111513] hover:bg-white" disabled={isCreatingWorktree} type="submit">
                  {hasGit ? "Create Worktree" : "init git"}
                </Button>
              </footer>
            </form>
          ) : null}
          {props.isLoading ? <Loader2 aria-hidden="true" className="size-4 animate-spin text-[#9da79f]" /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.agentProviders.codexAvailable && props.agentProviders.claudeAvailable ? (
            <label className="flex items-center gap-1.5 text-[#9da79f]">
              <span>agent</span>
              <select className="h-7 rounded border border-[#3a403b] bg-[#111312] px-2 pr-7 text-[#eef2ec] outline-none" value={props.agentProvider} onChange={(event) => props.onAgentProviderChange(event.target.value === "claude" ? "claude" : "codex")} aria-label="Coding agent provider for new agent terminals">
                <option value="codex">codex</option>
                <option value="claude">claude</option>
              </select>
            </label>
          ) : null}
          {props.agentProvider === "claude" ? null : (
            <label className="flex items-center gap-1.5 text-[#9da79f]">
              <span>think</span>
              <select className="h-7 rounded border border-[#3a403b] bg-[#111312] px-2 pr-7 text-[#eef2ec] outline-none" value={props.thinkingEffort} onChange={(event) => props.onThinkingEffortChange(normalizedThinkingEffort(event.target.value))} aria-label="Default thinking effort for new agent terminals">
                <option value="low">low</option>
                <option value="medium">med</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </label>
          )}
          <Button className="h-7 border-[#3a403b] bg-transparent px-3 text-xs font-bold text-[#eef2ec] hover:border-[#9fd1ff] hover:bg-transparent hover:text-[#9fd1ff]" size="sm" variant="outline" onClick={() => props.onStart("agent")}>
            + agent
          </Button>
          <Button className="h-7 border-[#3a403b] bg-transparent px-3 text-xs font-bold text-[#eef2ec] hover:border-[#9fd1ff] hover:bg-transparent hover:text-[#9fd1ff]" size="sm" variant="outline" onClick={() => props.onStart("cli")}>
            + cli
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <section ref={(element) => { if (devPaneSession) setSessionSectionRef(devPaneSession.id, element); }} className={cn("flex shrink-0 flex-col overflow-hidden border-b border-[#2c302d] bg-[#171a18]", devPaneNeedsTerminalSpace && "min-h-0 flex-1")}>
          <header className="flex min-h-9 shrink-0 items-center justify-between gap-3 px-3 text-xs">
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" type="button" onClick={devPaneSession ? toggleDevCollapsed : revealDevTerminal} aria-expanded={Boolean(devPaneSession && !collapsedSessionIds.has(devPaneSession.id))} title={devPaneSession && collapsedSessionIds.has(devPaneSession.id) ? "Expand dev terminal" : devPaneSession ? "Collapse dev terminal" : "Load dev session details"}>
              {devPaneSession && !collapsedSessionIds.has(devPaneSession.id) ? <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-[#9da79f]" /> : <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[#9da79f]" />}
              <strong className="shrink-0 font-mono text-[11px] font-medium lowercase text-[#eef2ec]">dev</strong>
              <span className={cn("shrink-0", devIsRunning ? "text-[#b8f4c7]" : "text-[#8c958e]")}>{devIsRunning ? "running" : "not running"}</span>
            </button>
            {devPreviewUrl ? (
              <button className="min-w-0 truncate font-mono text-[11px] text-[#9fd1ff] hover:text-[#c8e6ff]" type="button" title={`Open ${devPreviewUrl}`} onClick={() => void openTerminalWebLink(devPreviewUrl)}>
                {devPreviewUrl}
              </button>
            ) : (
              <span className="min-w-0 truncate text-[#68716a]">{props.preview?.reason || runDevTitle}</span>
            )}
            {devPaneIsDetached ? (
              <Button className="h-7 border-[#8ea0ff] bg-[#8ea0ff]/15 px-2.5 text-xs font-bold text-white hover:bg-[#8ea0ff]/25" size="sm" variant="outline" type="button" onClick={props.onRestartDev}>
                restart
              </Button>
            ) : devIsRunning ? (
              <Button className="h-7 border-[#3a403b] bg-transparent px-2.5 text-xs font-bold text-[#eef2ec] hover:border-[#f4b8b8] hover:bg-transparent hover:text-[#f4b8b8] disabled:cursor-not-allowed disabled:border-[#2c302d] disabled:text-[#68716a]" disabled={!canStopDev} size="sm" variant="outline" type="button" onClick={props.onStopDev}>
                stop
              </Button>
            ) : (
              <Button className="h-7 border-[#3a403b] bg-transparent px-2.5 text-xs font-bold text-[#eef2ec] hover:border-[#9fd1ff] hover:bg-transparent hover:text-[#9fd1ff] disabled:cursor-not-allowed disabled:border-[#2c302d] disabled:text-[#68716a]" disabled={!canRunDev} size="sm" title={props.preview?.reason || runDevTitle} variant="outline" type="button" onClick={props.onRunDev}>
                start
              </Button>
            )}
          </header>
          {expandedDevPaneSession ? (
            <div className={cn("min-h-0", devPaneNeedsTerminalSpace && "flex-1")}>
              {isDetachedDevSession(expandedDevPaneSession) ? (
                <DetachedDevSession session={expandedDevPaneSession} onRestart={props.onRestartDev} />
              ) : isPendingTerminalSession(expandedDevPaneSession) ? (
                <PendingTerminalSession session={expandedDevPaneSession} />
              ) : (
                <XtermSession activeProject={props.activeProject} isActive={props.activeSessionId === expandedDevPaneSession.id} onTerminalText={props.onTerminalText} session={expandedDevPaneSession} />
              )}
            </div>
          ) : null}
        </section>
        {props.terminalEnvHint ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2c302d] bg-[#182018] px-3 py-2 text-xs text-[#d8ded9]">
            <p className="m-0 min-w-0 truncate">
              Missing env key detected: <code>{props.terminalEnvHint.key}</code>
            </p>
            <Button className="h-7 shrink-0 border-[#9fd1ff] bg-[#9fd1ff]/12 px-3 text-xs font-bold text-[#eef2ec] hover:bg-[#9fd1ff]/22" size="sm" variant="outline" type="button" onClick={() => props.onOpenProjectEnv(props.terminalEnvHint?.key, "terminal-detected")}>
              <KeyRound data-icon="inline-start" />
              Add env var
            </Button>
          </div>
        ) : null}
        {terminalSessions.length ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {terminalSessions.map((session, index) => {
              const isCollapsed = collapsedSessionIds.has(session.id);
              const paneStatus = terminalPaneStatusLabel(session);
              return (
                <section ref={(element) => setSessionSectionRef(session.id, element)} className={cn("flex min-h-0 flex-col overflow-hidden border-[#3a403b] bg-[#20231f] first:border-t-0 not-first:border-t", isCollapsed ? "shrink-0" : "flex-1")} key={session.id} onFocusCapture={() => props.onSelectSession(session.id)} onMouseDown={() => props.onSelectSession(session.id)}>
                  <header className="flex min-h-8 shrink-0 items-center justify-between gap-3 border-b border-[#2c302d] px-3 text-xs">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" type="button" onClick={(event) => { event.stopPropagation(); toggleSessionCollapsed(session.id); }} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand terminal" : "Collapse terminal"}>
                      {isCollapsed ? <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-[#9da79f]" /> : <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-[#9da79f]" />}
                      <span className="min-w-0 truncate font-mono text-[11px] font-medium lowercase text-[#eef2ec]">{terminalPaneLabel(session, index)}</span>
                      <span className="shrink-0 text-[11px] text-[#8c958e]">{paneStatus}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button className="size-7 shrink-0 text-[#aeb8b0] hover:bg-transparent hover:text-[#aeb8b0]" size="icon" variant="ghost" type="button" onClick={(event) => { event.stopPropagation(); props.onCloseSession(session.id); }} title="Close terminal" aria-label="Close terminal">
                        <X aria-hidden="true" data-icon="inline-start" />
                      </Button>
                    </div>
                  </header>
                  {isCollapsed ? (
                    <div className="flex min-h-8 items-center justify-between gap-3 bg-[#171a18] px-3 py-2 text-[11px] text-[#8c958e]">
                      <span className="min-w-0 truncate">{terminalCollapsedSummary(session)}</span>
                      {session.pid ? <span className="shrink-0">pid {session.pid}</span> : null}
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1">
                      {isPendingTerminalSession(session) ? (
                        <PendingTerminalSession session={session} />
                      ) : (
                        <XtermSession activeProject={props.activeProject} isActive={props.activeSessionId === session.id} onTerminalText={props.onTerminalText} session={session} />
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="min-h-0 flex-1" />
        )}
      </div>
    </aside>
  );
}

function TerminalSessionTab(props: {
  isActive: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onRestart: () => void;
  onSelect: () => void;
  session: SessionRecord;
}) {
  const [draftName, setDraftName] = useState(props.session.name || props.session.role || "Terminal");

  useEffect(() => {
    setDraftName(props.session.name || props.session.role || "Terminal");
  }, [props.session.name, props.session.role]);

  return (
    <article className={cn("border bg-background p-2", props.isActive && "border-primary")}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 text-left">
          <input
            {...DISABLE_TEXT_CORRECTION_PROPS}
            aria-label="Session name"
            className="w-full bg-transparent text-sm font-bold outline-none"
            onBlur={() => props.onRename(draftName)}
            onChange={(event) => setDraftName(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onFocus={props.onSelect}
            value={draftName}
          />
          <span className="block truncate text-xs text-muted-foreground">{props.session.cwd || props.session.command || props.session.shell || props.session.id}</span>
        </div>
        <Button size="icon" variant="ghost" onClick={props.onSelect} title="Show session">
          <Play aria-hidden="true" />
        </Button>
        <Button size="icon" variant="ghost" onClick={props.onRestart} title="Attach or restart session">
          <RotateCcw aria-hidden="true" />
        </Button>
        <Button size="icon" variant="ghost" onClick={props.onClose} title="Close session">
          <Square aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="border px-2 py-1">{props.session.status || "unknown"}</span>
        <span className="border px-2 py-1">{props.session.role || props.session.kind || "session"}</span>
        <span className="border px-2 py-1">{props.session.mode || "mode unknown"}</span>
        {props.session.reconnectable ? <span className="border px-2 py-1">reconnectable</span> : null}
      </div>
    </article>
  );
}

function PendingTerminalSession({ session }: { session: SessionRecord }) {
  const failed = session.status === "failed";
  return (
    <div className="flex h-full min-h-0 flex-col justify-between bg-[#20231f] p-3 font-mono text-[13px] text-[#d8ded9]">
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-[#8c958e]">
          {failed ? null : <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
          <span>{failed ? "Agent terminal failed to start" : "Starting Codex"}</span>
        </div>
        {failed && session.shell ? <p className="m-0 max-w-full whitespace-pre-wrap text-[#f4b8b8]">{session.shell}</p> : null}
        {!failed ? <p className="m-0 text-[#8c958e]">Preparing the terminal session...</p> : null}
      </div>
      <p className="m-0 truncate text-[11px] text-[#69736c]">{session.command || session.id}</p>
    </div>
  );
}

function DetachedDevSession({ session, onRestart }: { session: SessionRecord; onRestart: () => void }) {
  return (
    <div className="grid min-h-[180px] place-items-center bg-[#0c0f0d] p-6 text-center">
      <div className="grid max-w-[360px] gap-3">
        <strong className="text-sm text-[#eef2ec]">Dev process still running</strong>
        <p className="m-0 text-xs leading-relaxed text-[#aeb8b0]">
          Hyperwiki started this dev process before the app restarted. Terminal output cannot be replayed, but Hyperwiki can restart it.
        </p>
        <div className="flex justify-center gap-2">
          <Button className="h-8 border-[#8ea0ff] bg-[#8ea0ff]/15 px-3 text-xs font-bold text-white hover:bg-[#8ea0ff]/25" size="sm" variant="outline" type="button" onClick={onRestart}>
            restart
          </Button>
        </div>
        <span className="text-[11px] text-[#68716a]">pid {session.pid || "unknown"}</span>
      </div>
    </div>
  );
}

function XtermSession({
  activeProject,
  isActive,
  onTerminalText,
  session,
}: {
  activeProject: ProjectRecord | null;
  isActive: boolean;
  onTerminalText: (sessionId: string, text: string) => void;
  session: SessionRecord;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const seenSeqRef = useRef(0);
  const loggedPlainTextRef = useRef("");
  const emptyDisplayLogCountRef = useRef(0);
  const displayWriteLogCountRef = useRef(0);
  const renderCheckLogCountRef = useRef(0);
  const fitLogCountRef = useRef(0);
  const terminalTranscriptLogCountRef = useRef(0);
  const xtermEffectRunRef = useRef(0);
  const xtermRenderHealthyRef = useRef(false);
  const terminalTranscriptRef = useRef("");
  const initialDisplayBufferRef = useRef<string | null>("");
  const displayControlCarryRef = useRef({ current: "" });
  const pendingRef = useRef<string[]>([]);
  const closedRef = useRef(false);
  const flushingInputRef = useRef(false);
  const [startupNoticeVisible, setStartupNoticeVisible] = useState(false);
  const startupNotice = terminalStartupNotice(session);

  const flushPendingInput = useCallback(async function flushPendingInput() {
    if (flushingInputRef.current) return;
    flushingInputRef.current = true;
    try {
      while (!closedRef.current && pendingRef.current.length) {
        const input = pendingRef.current.shift() || "";
        try {
          await sendInput(session.id, input);
        } catch (error) {
          pendingRef.current = [];
          const message = error instanceof Error ? error.message : String(error);
          appendImportLog(`Terminal input failed session=${session.id}`, error);
          terminalRef.current?.write(`\r\n\x1b[31m[hyperwiki] terminal input failed: ${message}\x1b[0m\r\n`);
          break;
        }
      }
    } finally {
      flushingInputRef.current = false;
      if (!closedRef.current && pendingRef.current.length) void flushPendingInput();
    }
  }, [session.id]);

  const queueTerminalInput = useCallback((input: string) => {
    if (!input || closedRef.current) return;
    pendingRef.current.push(input);
    void flushPendingInput();
  }, [flushPendingInput]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const effectRun = xtermEffectRunRef.current + 1;
    xtermEffectRunRef.current = effectRun;
    const mountedAt = Date.now();
    let disposed = false;
    const renderCheckTimers: number[] = [];
    closedRef.current = false;
    seenSeqRef.current = 0;
    loggedPlainTextRef.current = "";
    emptyDisplayLogCountRef.current = 0;
    displayWriteLogCountRef.current = 0;
    renderCheckLogCountRef.current = 0;
    fitLogCountRef.current = 0;
    terminalTranscriptLogCountRef.current = 0;
    xtermRenderHealthyRef.current = false;
    terminalTranscriptRef.current = "";
    initialDisplayBufferRef.current = "";
    displayControlCarryRef.current.current = "";
    pendingRef.current = [];
    let hasLoadedReplay = false;
    let eventBuffer: TerminalOutputEventPayload[] = [];
    let unlisten: (() => void) | null = null;
    let startupNoticeIsVisible = Boolean(startupNotice);

    const terminalFont = getComputedStyle(document.documentElement).getPropertyValue("--terminal-font").trim() || "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: terminalFont,
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: terminalXtermScrollback,
      theme: {
        background: "#20231f",
        foreground: "#f7f7f4",
        cursor: "#f7f7f4",
        selectionBackground: "#3b4138",
      },
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openTerminalWebLink(uri);
    }));
    terminal.open(container);
    const isCurrentEffect = () => !disposed && xtermEffectRunRef.current === effectRun && !closedRef.current;
    appendImportLog(`Terminal xterm opened session=${session.id} effect=${effectRun} container=${container.clientWidth}x${container.clientHeight} cols=${terminal.cols} rows=${terminal.rows} active=${isActive} elapsedMs=${Date.now() - mountedAt}`);
    if (isActive) {
      terminal.focus();
    }
    setStartupNoticeVisible(startupNoticeIsVisible);

    const clearStartupNotice = () => {
      if (!startupNoticeIsVisible) return;
      startupNoticeIsVisible = false;
      setStartupNoticeVisible(false);
    };

    const logEmptyDisplay = (source: "output" | "replay", bytesLength: number, seq: number | null, text: string) => {
      if (emptyDisplayLogCountRef.current >= 5) return;
      emptyDisplayLogCountRef.current += 1;
      appendImportLog(`Terminal display empty session=${session.id} source=${source} bytes=${bytesLength} seq=${seq ?? "none"} count=${emptyDisplayLogCountRef.current} parsedTail=${JSON.stringify(terminalDisplayDebugTail(text))}`);
    };

    const setTerminalTranscript = (text: string, reason: string) => {
      if (!isCurrentEffect()) return;
      const nextText = text.trimEnd();
      if (nextText === terminalTranscriptRef.current) return;
      terminalTranscriptRef.current = nextText;
      if (terminalTranscriptLogCountRef.current < 8) {
        terminalTranscriptLogCountRef.current += 1;
        appendImportLog(`Terminal transcript cache updated session=${session.id} effect=${effectRun} reason=${reason} chars=${nextText.length} lines=${nextText.split("\n").length} elapsedMs=${Date.now() - mountedAt} count=${terminalTranscriptLogCountRef.current}`);
      }
    };

    const appendTerminalTranscript = (text: string, reason: string) => {
      const nextText = appendTerminalTranscriptText(terminalTranscriptRef.current, terminalTranscriptTextForDisplay(text));
      setTerminalTranscript(nextText, reason);
    };

    const logDisplayWrite = (source: "output" | "replay", bytesLength: number, seq: number | null, displayText: string, hasVisibleText: boolean) => {
      if (displayWriteLogCountRef.current >= 8) return;
      displayWriteLogCountRef.current += 1;
      appendImportLog(`Terminal display write session=${session.id} effect=${effectRun} source=${source} bytes=${bytesLength} seq=${seq ?? "none"} displayChars=${displayText.length} visible=${hasVisibleText} container=${container.clientWidth}x${container.clientHeight} cols=${terminal.cols} rows=${terminal.rows} elapsedMs=${Date.now() - mountedAt} count=${displayWriteLogCountRef.current}`);
    };

    const checkXtermRender = (source: "output" | "replay", seq: number | null, finalCheck: boolean) => {
      if (!isCurrentEffect()) return;
      const snapshot = xtermRenderSnapshot(container, terminal);
      if (renderCheckLogCountRef.current < 12) {
        renderCheckLogCountRef.current += 1;
        appendImportLog(`Terminal xterm render check session=${session.id} effect=${effectRun} source=${source} seq=${seq ?? "none"} final=${finalCheck} ${xtermRenderSnapshotSummary(snapshot)} elapsedMs=${Date.now() - mountedAt} count=${renderCheckLogCountRef.current}`);
      }
      if (snapshot.rendered || snapshot.interactive) {
        xtermRenderHealthyRef.current = true;
        return;
      }
      if (finalCheck && terminalTranscriptRef.current.trim()) {
        appendImportLog(`Terminal xterm render unresolved session=${session.id} effect=${effectRun} keeping=xterm ${xtermRenderSnapshotSummary(snapshot)} transcriptChars=${terminalTranscriptRef.current.length} elapsedMs=${Date.now() - mountedAt}`);
      }
    };

    const scheduleXtermRenderChecks = (source: "output" | "replay", seq: number | null) => {
      if (xtermRenderHealthyRef.current) return;
      renderCheckTimers.push(window.setTimeout(() => checkXtermRender(source, seq, false), 120));
      renderCheckTimers.push(window.setTimeout(() => checkXtermRender(source, seq, true), 650));
    };

    const writeDisplayText = (source: "output" | "replay", bytesLength: number, seq: number | null, displayText: string, text: string) => {
      appendTerminalTranscript(text, `${source}-raw`);
      if (!displayText) {
        logEmptyDisplay(source, bytesLength, seq, text);
        return;
      }
      const hasVisibleText = terminalDisplayHasVisibleText(displayText);
      logDisplayWrite(source, bytesLength, seq, displayText, hasVisibleText);
      if (!hasVisibleText) logEmptyDisplay(source, bytesLength, seq, text);
      terminal.write(displayText, () => {
        if (!isCurrentEffect()) return;
        if (!hasVisibleText) return;
        clearStartupNotice();
        scheduleXtermRenderChecks(source, seq);
      });
    };

    const fit = () => {
      if (!isCurrentEffect()) return;
      if (container.clientWidth <= 0 || container.clientHeight <= 0) {
        if (fitLogCountRef.current < 8) {
          fitLogCountRef.current += 1;
          appendImportLog(`Terminal fit skipped session=${session.id} effect=${effectRun} container=${container.clientWidth}x${container.clientHeight} elapsedMs=${Date.now() - mountedAt} count=${fitLogCountRef.current}`);
        }
        return;
      }
      try {
        fitAddon.fit();
        void sendResize(session.id, terminal.cols, terminal.rows);
        if (fitLogCountRef.current < 8) {
          fitLogCountRef.current += 1;
          appendImportLog(`Terminal fit session=${session.id} effect=${effectRun} container=${container.clientWidth}x${container.clientHeight} cols=${terminal.cols} rows=${terminal.rows} elapsedMs=${Date.now() - mountedAt} count=${fitLogCountRef.current}`);
        }
      } catch {
        // xterm fit can throw while the panel is resizing; the next observer tick retries.
      }
    };

    const dataDisposable = terminal.onData((data) => {
      if (!isCurrentEffect()) return;
      queueTerminalInput(data);
    });
    const pasteListenerOptions: AddEventListenerOptions = { capture: true };
    const handlePaste = (event: ClipboardEvent) => {
      if (!isCurrentEffect()) return;
      const imageFiles = terminalClipboardImageFiles(event.clipboardData);
      if (!imageFiles.length) return;
      const pastedText = event.clipboardData?.getData("text/plain") || "";
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      appendImportLog(`Terminal image paste start session=${session.id} files=${imageFiles.length} textChars=${pastedText.length}`);
      void (async () => {
        try {
          const savedPaths = await saveTerminalDroppedFiles(activeProject, imageFiles);
          if (!isCurrentEffect()) return;
          for (const path of savedPaths) {
            queueTerminalInput(terminalBracketedPaste(path));
          }
          if (pastedText) {
            queueTerminalInput(terminalBracketedPaste(pastedText));
          }
          terminalRef.current?.focus();
          appendImportLog(`Terminal image paste complete session=${session.id} files=${savedPaths.length} textChars=${pastedText.length}`);
        } catch (error) {
          if (!isCurrentEffect()) return;
          const message = error instanceof Error ? error.message : String(error);
          appendImportLog(`Terminal image paste failed session=${session.id}`, error);
          terminal.write(`\r\n\x1b[31m[hyperwiki] image paste failed: ${message}\x1b[0m\r\n`);
        }
      })();
    };
    container.addEventListener("paste", handlePaste, pasteListenerOptions);
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (!isCurrentEffect()) return;
      void sendResize(session.id, cols, rows);
    });
    const observer = new ResizeObserver(fit);
    observer.observe(container);

    const writeTerminalChunk = (payload: TerminalOutputEventPayload) => {
      if (!isCurrentEffect()) return;
      if (payload.sessionId !== session.id || payload.seq <= seenSeqRef.current) return;
      const firstOutput = seenSeqRef.current === 0;
      seenSeqRef.current = payload.seq;
      const bytes = Uint8Array.from(payload.bytes || []);
      if (!bytes.length) return;
      const text = terminalBytesToText(bytes);
      const displayText = cleanInitialTerminalDisplayText(
        terminalDisplayTextForXterm(text, displayControlCarryRef.current),
        initialDisplayBufferRef
      );
      onTerminalText(session.id, terminalTextForParsing(text));
      logTerminalPlainText(session.id, "Terminal output plain", bytes.length, payload.seq, text, loggedPlainTextRef);
      if (firstOutput) appendImportLog(`Terminal first output session=${session.id} seq=${payload.seq} bytes=${bytes.length}`);
      writeDisplayText("output", bytes.length, payload.seq, displayText, text);
    };

    const handleTerminalChunk = (payload: TerminalOutputEventPayload) => {
      if (!isCurrentEffect()) return;
      if (payload.sessionId !== session.id) return;
      if (!hasLoadedReplay) {
        eventBuffer.push(payload);
        return;
      }
      writeTerminalChunk(payload);
    };

    async function attach() {
      try {
        unlisten = await listenTerminalOutput(handleTerminalChunk);
        const replay = await hyperwikiApi.json<TerminalReplayResponse>(`/api/terminal/${encodeURIComponent(session.id)}/replay`);
        if (!isCurrentEffect()) return;
        if (replay.bytes?.length) {
          const bytes = Uint8Array.from(replay.bytes);
          const text = terminalBytesToText(bytes);
          const displayText = cleanInitialTerminalDisplayText(
            terminalDisplayTextForXterm(text, displayControlCarryRef.current),
            initialDisplayBufferRef
          );
          onTerminalText(session.id, terminalTextForParsing(text));
          logTerminalPlainText(session.id, "Terminal replay plain", bytes.length, replay.seq, text, loggedPlainTextRef);
          appendImportLog(`Terminal first replay output session=${session.id} seq=${replay.seq} bytes=${bytes.length}`);
          writeDisplayText("replay", bytes.length, replay.seq, displayText, text);
        }
        seenSeqRef.current = replay.seq || 0;
        hasLoadedReplay = true;
        eventBuffer.sort((left, right) => left.seq - right.seq).forEach(writeTerminalChunk);
        eventBuffer = [];
        fit();
        void flushPendingInput();
      } catch (error) {
        if (!isCurrentEffect()) return;
        terminal.writeln("");
        terminal.writeln(error instanceof Error ? error.message : String(error));
      }
    }

    void attach();
    const fitTimer = window.setTimeout(fit, 0);

    return () => {
      disposed = true;
      closedRef.current = true;
      appendImportLog(`Terminal xterm cleanup session=${session.id} effect=${effectRun} elapsedMs=${Date.now() - mountedAt}`);
      if (unlisten) unlisten();
      renderCheckTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(fitTimer);
      observer.disconnect();
      container.removeEventListener("paste", handlePaste, pasteListenerOptions);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [activeProject?.id, flushPendingInput, onTerminalText, queueTerminalInput, session.id]);

  useEffect(() => {
    if (isActive) {
      terminalRef.current?.focus();
    }
  }, [isActive]);

  return (
    <div className="relative h-full min-h-0">
      {startupNoticeVisible && startupNotice ? (
        <div className="pointer-events-none absolute left-3 top-2 z-10 font-mono text-[13px] text-[#8c958e]">
          {startupNotice}
        </div>
      ) : null}
      <div
        className="terminal-scrollbar-thin h-full min-h-0 p-1"
        onClick={() => terminalRef.current?.focus()}
        onMouseDown={() => terminalRef.current?.focus()}
        ref={containerRef}
      />
    </div>
  );
}

function routeFromLocation(): ViewRoute {
  const rawHashPath = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : "";
  const hashPath = rawHashPath.startsWith("/wiki/") || /^\/projects\/[^/]+\/wiki\//.test(rawHashPath)
    ? displayWikiPath(rawHashPath)
    : "";
  if (hashPath) return { kind: "wiki", path: hashPath };
  if (window.location.pathname === "/projects") return { kind: "projects" };
  if (window.location.pathname === "/projects/new") return { kind: "new-project" };
  if (window.location.pathname.endsWith("/plans/new") || window.location.pathname === "/plans/new") return { kind: "wiki", path: "/wiki/plans/index.mdx" };
  if (window.location.pathname === "/settings") return { kind: "settings" };
  if (window.location.pathname.startsWith("/wiki/")) return { kind: "wiki", path: displayWikiPath(window.location.pathname) };
  return { kind: "wiki", path: defaultWikiPath };
}

function hasExplicitWikiRouteLocation() {
  return Boolean(
    window.location.hash
    || window.location.pathname.startsWith("/wiki/")
    || window.location.pathname.endsWith("/plans/new")
    || window.location.pathname === "/plans/new",
  );
}

function urlForRoute(route: ViewRoute, activeProject: ProjectRecord | null) {
  if (route.kind === "projects") return "/projects";
  if (route.kind === "new-project") return "/projects/new";
  if (route.kind === "settings") return "/settings";
  const projectPrefix = activeProject ? `/workspace/${activeProject.projectSlug}/${activeProject.worktreeSlug}` : "";
  return projectPrefix ? `${projectPrefix}#${route.path}` : route.path;
}

function withProjectQuery(path: string, activeProject: ProjectRecord | null) {
  if (!activeProject) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}project=${encodeURIComponent(activeProject.id)}`;
}

function terminalClipboardImageFiles(data: DataTransfer | null) {
  if (!data) return [];
  const itemFiles = Array.from(data.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (itemFiles.length) return itemFiles;
  return Array.from(data.files || []).filter((file) => file.type.startsWith("image/"));
}

async function saveTerminalDroppedFiles(activeProject: ProjectRecord | null, files: File[]) {
  const response = await hyperwikiApi.json<DroppedFilesResponse>(withProjectQuery("/api/terminal/drop", activeProject), {
    method: "POST",
    body: {
      files: await Promise.all(files.map(async (file, index) => ({
        name: terminalPasteImageFileName(file, index),
        content: await fileToBase64(file),
      }))),
    },
  });
  return (response.files || [])
    .map((file) => String(file.path || "").trim())
    .filter(Boolean);
}

function terminalPasteImageFileName(file: File, index: number) {
  if (file.name.trim()) return file.name;
  const extension = file.type === "image/jpeg"
    ? "jpg"
    : file.type === "image/webp"
      ? "webp"
      : file.type === "image/gif"
        ? "gif"
        : "png";
  return `pasted-image-${index + 1}.${extension}`;
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function terminalBracketedPaste(text: string) {
  return `\x1b[200~${text}\x1b[201~`;
}

function projectEnvRows(response: ProjectEnvResponse, initialKey?: string) {
  const byName = new Map<string, { name: string; present: boolean; source: string; value: string }>();
  for (const key of [...(response.suggestedKeys || []), ...(response.keys || [])]) {
    if (!key.name || byName.has(key.name)) continue;
    byName.set(key.name, {
      name: key.name,
      present: key.present,
      source: key.source || "suggested",
      value: "",
    });
  }
  const trimmedInitial = initialKey?.trim();
  if (trimmedInitial && !byName.has(trimmedInitial)) {
    byName.set(trimmedInitial, {
      name: trimmedInitial,
      present: false,
      source: "detected",
      value: "",
    });
  }
  const rows = Array.from(byName.values())
    .sort((left, right) => Number(right.name === trimmedInitial) - Number(left.name === trimmedInitial) || left.name.localeCompare(right.name))
    .map((row) => ({ ...row, id: crypto.randomUUID() }));
  return rows.length ? rows : [{ id: crypto.randomUUID(), name: trimmedInitial || "", present: false, source: trimmedInitial ? "detected" : "custom", value: "" }];
}

function isValidEnvKeyName(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function detectEnvKeyFromTerminalText(text: string) {
  const candidates = terminalTextForParsing(text).match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [];
  return candidates.find((candidate) =>
    !isRuntimeEnvKeyHintIgnored(candidate)
    && (
      candidate.startsWith("CLERK_")
      || candidate.startsWith("CONVEX_")
      || candidate.startsWith("NEXT_PUBLIC_")
      || /_(KEY|SECRET|TOKEN|URL|DOMAIN|ISSUER|DEPLOYMENT)$/.test(candidate)
    )
  ) || "";
}

function isRuntimeEnvKeyHintIgnored(key: string) {
  return RUNTIME_ENV_KEY_HINT_DENYLIST.has(key.trim());
}

function terminalPreviewUrlFromText(text: string, preview: AppPreviewResponse | null, activeProject: ProjectRecord | null) {
  const urls = terminalTextForParsing(text).match(/\bhttps?:\/\/[^\s"'<>`]+/g) || [];
  return urls
    .map(cleanTerminalPreviewUrl)
    .find((url) => isExpectedPreviewRuntimeUrl(url, preview, activeProject)) || "";
}

function cleanTerminalPreviewUrl(url: string) {
  return url.replace(/[),.;\]]+$/g, "");
}

function isExpectedPreviewRuntimeUrl(url: string, preview: AppPreviewResponse | null, activeProject: ProjectRecord | null) {
  const hostname = hostnameFromUrl(url);
  if (!hostname) return false;
  const expectedHosts = new Set(
    [preview?.url, preview?.expectedUrl, activeProject?.projectSlug ? `https://${activeProject.projectSlug}.localhost` : ""]
      .map((candidate) => hostnameFromUrl(candidate || ""))
      .filter(Boolean)
  );
  if (activeProject?.projectSlug && activeProject.worktreeSlug && activeProject.worktreeSlug !== "main") {
    expectedHosts.add(`${activeProject.worktreeSlug}.${activeProject.projectSlug}.localhost`);
  }
  return expectedHosts.has(hostname);
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function wikiRequestPath(path: string, activeProject: ProjectRecord | null) {
  if (!activeProject) return path;
  return `/projects/${encodeURIComponent(activeProject.id)}${path}`;
}

function findActiveProject(response: ProjectListResponse, unavailableProjectIds: Set<string> = new Set(), workspaceSelection = workspaceSelectionFromLocation()) {
  const all = allProjectRecords(response).filter((project) => isAvailableProject(project, unavailableProjectIds));
  if (workspaceSelection) {
    const selected = all.find((project) => project.projectSlug === workspaceSelection.projectSlug && project.worktreeSlug === workspaceSelection.worktreeSlug);
    if (selected) return selected;
  }
  return all.find((project) => project.id === response.activeProjectId) || all.find((project) => project.active) || all[0] || null;
}

function allProjectRecords(response: ProjectListResponse) {
  const records = [...(response.projects || []), ...(response.checkouts || []), ...(response.projectGroups || []).flatMap((group) => group.checkouts)];
  const byId = new Map<string, ProjectRecord>();
  for (const record of records) byId.set(record.id, record);
  return Array.from(byId.values());
}

function pendingImportedProject(title: string): ProjectRecord {
  const slug = slugify(title);
  return {
    id: `pending-${slug}`,
    name: title,
    root: "",
    projectSlug: slug,
    worktreeSlug: "main",
    available: true,
  };
}

const pendingImportStorageKey = "hyperwiki.pendingImportProject";

function readPendingImportProject() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(pendingImportStorageKey) || "null") as ProjectRecord | null;
    if (!parsed?.projectSlug || !parsed?.worktreeSlug) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePendingImportProject(project: ProjectRecord) {
  try {
    window.sessionStorage.setItem(pendingImportStorageKey, JSON.stringify(project));
  } catch {
    // Session storage is best-effort; route fallback still works without it.
  }
}

function clearPendingImportProject() {
  try {
    window.sessionStorage.removeItem(pendingImportStorageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function matchesWorkspaceSelection(project: ProjectRecord, selection: ReturnType<typeof workspaceSelectionFromLocation>) {
  return Boolean(selection && project.projectSlug === selection.projectSlug && project.worktreeSlug === selection.worktreeSlug);
}

function workspaceSelectionFromLocation() {
  const match = window.location.pathname.match(/^\/workspace\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return {
    projectSlug: decodeURIComponent(match[1]),
    worktreeSlug: decodeURIComponent(match[2]),
  };
}

function withOptimisticProject(response: ProjectListResponse, project: ProjectRecord): ProjectListResponse {
  const projects = [project, ...(response.projects || []).filter((item) => item.id !== project.id)];
  const checkouts = [project, ...(response.checkouts || []).filter((item) => item.id !== project.id)];
  const groups = response.projectGroups?.length
    ? [
        {
          name: project.name,
          projectSlug: project.projectSlug,
          checkouts: [project, ...response.projectGroups.flatMap((group) => group.checkouts).filter((item) => item.id !== project.id && item.projectSlug === project.projectSlug)],
        },
        ...response.projectGroups.filter((group) => group.projectSlug !== project.projectSlug),
      ]
    : response.projectGroups;
  return {
    ...response,
    activeProjectId: project.id,
    projects,
    checkouts,
    projectGroups: groups,
  };
}

function normalizeProjectGroups(response: ProjectListResponse, unavailableProjectIds: Set<string> = new Set()) {
  if (response.projectGroups?.length) {
    return response.projectGroups
      .map((group) => ({
        ...group,
        checkouts: group.checkouts.filter((project) => isAvailableProject(project, unavailableProjectIds)),
      }))
      .filter((group) => group.checkouts.length > 0);
  }
  const all = [...(response.checkouts || []), ...(response.projects || [])].filter((project) => isAvailableProject(project, unavailableProjectIds));
  const groups = new Map<string, ProjectGroup>();
  for (const project of all) {
    const key = project.projectSlug || project.name || project.id;
    const existing = groups.get(key) || { name: project.name || key, projectSlug: key, checkouts: [] };
    existing.checkouts.push(project);
    groups.set(key, existing);
  }
  return Array.from(groups.values());
}

function isAvailableProject(project: ProjectRecord, unavailableProjectIds: Set<string>) {
  return project.available !== false && !unavailableProjectIds.has(project.id);
}

function buildSidebarModel(pages: WikiPage[]): SidebarModel {
  const all = pages.length ? pages : [{ title: "Home", path: defaultWikiPath }];
  return {
    plans: all.filter((page) => page.path.includes("/wiki/plans/")),
    projectPages: all.filter((page) => isProjectWikiPage(page)),
  };
}

function isProjectWikiPage(page: WikiPage) {
  const path = displayWikiPath(page.path);
  return [
    "/wiki/architecture.mdx",
    "/wiki/dev.mdx",
    "/wiki/roadmap.mdx",
    "/wiki/sources.mdx",
    "/wiki/log.mdx",
  ].some((suffix) => path.endsWith(suffix)) || path.includes("/wiki/sources/");
}

function cleanPageTitle(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.mdx")) return "Plans";
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return "MVP Plan";
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return "Completed Plans";
  if (isUnitPage(page)) return normalizePlanDisplayTitle(page.title);
  if (path.includes("/stage-")) return normalizePlanDisplayTitle(page.title);
  if (page.title.toLowerCase() === "prd") return "PRD";
  if (path.includes("/wiki/plans/")) return page.title.replace(/\s+Plan$/, "");
  return page.title;
}

function displayWikiPath(path: string) {
  return path
    .replace(/^\/workspace\/[^/]+\/[^/#?]+#/, "")
    .replace(/^\/projects\/[^/]+/, "")
}

function isTopLevelPlanPage(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.mdx")) return true;
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return true;
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return true;
  if (/^\/wiki\/plans\/(?!zzz_completed\/)[^/]+\/index\.mdx$/.test(path)) return true;
  if (/^\/wiki\/plans\/features\/[^/]+\.mdx$/.test(path)) return true;
  return /^\/wiki\/plans\/[^/]+\.mdx$/.test(path) && !path.endsWith("/index.mdx");
}

function isDeletablePlanRootPage(path: string, pages: WikiPage[]) {
  const displayPath = displayWikiPath(path);
  if (!displayPath.startsWith("/wiki/plans/") || !displayPath.endsWith(".mdx")) return false;
  if (
    displayPath.endsWith("/wiki/plans/index.mdx")
    || displayPath.endsWith("/wiki/plans/zzz_completed/index.mdx")
  ) {
    return false;
  }
  if (/\/stage-\d+[^/]*\.mdx$/.test(displayPath) || /\/unit-\d+[^/]*\.mdx$/.test(displayPath)) {
    return false;
  }
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === displayPath);
  return Boolean(page && isTopLevelPlanPage(page));
}

function isPlansIndexPage(page: WikiPage) {
  return displayWikiPath(page.path).endsWith("/wiki/plans/index.mdx");
}

function isCompletedTopLevelPlanPage(page: WikiPage) {
  return isTopLevelPlanPage(page) && !displayWikiPath(page.path).endsWith("/wiki/plans/zzz_completed/index.mdx") && isCompletedPage(page);
}

function isUnitPage(page: WikiPage) {
  return /\/unit-\d+-[^/]+\.mdx$/.test(displayWikiPath(page.path));
}

function childPlanPages(parent: WikiPage, pages: WikiPage[]) {
  return pages.filter((candidate) => isImmediateChildPlanPage(parent, candidate) && !isDuplicateSlugChildPage(parent, candidate));
}

function isDuplicateSlugChildPage(parent: WikiPage, candidate: WikiPage) {
  return slugify(cleanPageTitle(parent)) === slugify(candidate.title);
}

function isImmediateChildPlanPage(parent: WikiPage, candidate: WikiPage) {
  const parentPath = displayWikiPath(parent.path);
  const candidatePath = displayWikiPath(candidate.path);
  if (parentPath === candidatePath) return false;
  if (parentPath.endsWith("/wiki/plans/zzz_completed/index.mdx")) {
    return (/^\/wiki\/plans\/zzz_completed\/[^/]+\.mdx$/.test(candidatePath) && !candidatePath.endsWith("/index.mdx")) || isCompletedTopLevelPlanPage(candidate);
  }
  if (parentPath.endsWith("/wiki/plans/mvp/index.mdx")) {
    return /^\/wiki\/plans\/mvp\/stage-\d+[^/]*\.mdx$/.test(candidatePath);
  }
  if (/^\/wiki\/plans\/features\/[^/]+\.mdx$/.test(parentPath)) return false;
  const stage = parentPath.match(/^(.*)\/stage-(\d+)[^/]*\.mdx$/);
  if (stage) {
    const legacyBase = parentPath.replace(/\.mdx$/, "");
    const legacyChild = candidatePath.startsWith(`${legacyBase}/`) && !candidatePath.slice(legacyBase.length + 1).includes("/");
    const unitBase = `${stage[1]}/units/stage-${stage[2]}`;
    const documentedChild = candidatePath.startsWith(`${unitBase}/`) && !candidatePath.slice(unitBase.length + 1).includes("/");
    return legacyChild || documentedChild;
  }
  const parentBase = planTreeBasePath(parentPath);
  return candidatePath.startsWith(`${parentBase}/`) && !candidatePath.slice(parentBase.length + 1).includes("/");
}

function planTreeBasePath(path: string) {
  return path.endsWith("/index.mdx") ? path.slice(0, -"/index.mdx".length) : path.replace(/\.mdx$/, "");
}

function planSortKey(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.mdx")) return "00";
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return "01";
  if (path.startsWith("/wiki/plans/mvp/stage-")) return `01-${path}`;
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return "99";
  if (path.startsWith("/wiki/plans/zzz_completed/")) return `99-${path}`;
  return `02-${path}`;
}

function isCompletedPage(page: WikiPage) {
  return pageStatus(page) === "complete";
}

function planPageActionState(path: string, pages: WikiPage[]): PlanPageActionState {
  const displayPath = displayWikiPath(path);
  const isPlanPage = displayPath.includes("/wiki/plans/") && displayPath.endsWith(".mdx");
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === displayPath);
  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const roots = sorted.filter((candidate) => isTopLevelPlanPage(candidate) && !isCompletedTopLevelPlanPage(candidate));
  const currentPath = currentPlanWorkPath(sorted, roots);
  const currentDisplayPath = displayWikiPath(currentPath);
  const currentPage = pages.find((candidate) => displayWikiPath(candidate.path) === currentDisplayPath);
  const isComplete = Boolean(page && isCompletedPage(page));
  const isStale = Boolean(isPlanPage && currentDisplayPath && displayPath !== currentDisplayPath && !displayPath.endsWith("/wiki/plans/index.mdx"));
  const canExecute = Boolean(currentDisplayPath && currentDisplayPath !== defaultWikiPath && currentPage && !isCompletedPage(currentPage));
  return {
    isPlanPage,
    isComplete,
    isStale,
    canExecute,
    currentPath,
    currentTitle: currentPage && canExecute ? cleanPageTitle(currentPage) : "",
    currentUnitLabel: currentPage && canExecute ? compactUnitLabel(currentPage) : "",
  };
}

function compactUnitLabel(page: WikiPage) {
  const title = cleanPageTitle(page);
  const titleMatch = title.match(/\bunit\s+(\d+)\b/i);
  if (titleMatch?.[1]) return `Unit ${titleMatch[1].padStart(2, "0")}`;
  const pathMatch = displayWikiPath(page.path).match(/\/unit-(\d+)[^/]*\.mdx$/i);
  if (pathMatch?.[1]) return `Unit ${pathMatch[1].padStart(2, "0")}`;
  return title;
}

function planScopeIsComplete(scope: { scope: string; scopeKind: string; planPath: string | null }, pages: WikiPage[]) {
  if (scope.scopeKind !== "plan" || !scope.planPath) return false;
  const scopePath = displayWikiPath(scope.planPath);
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === scopePath);
  return Boolean(page && isCompletedPage(page));
}

function currentPlanWorkPath(pages: WikiPage[], roots: WikiPage[]) {
  const derived = firstIncompleteWorkPath(pages, roots);
  if (derived && derived !== defaultWikiPath) return derived;
  if (derived) return derived;
  return pages.find((page) => page.currentState === "current-unit" && !isCompletedPage(page))?.path || pages.find((page) => page.currentState === "current-plan" && !isCompletedPage(page))?.path || "";
}

function planLandingPath(pages: WikiPage[]) {
  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const roots = sorted.filter((page) => isTopLevelPlanPage(page) && !isCompletedTopLevelPlanPage(page));
  const currentPath = currentPlanWorkPath(sorted, roots);
  if (currentPath && currentPath !== defaultWikiPath) return currentPath;
  return defaultWikiPath;
}

function firstIncompleteWorkPath(pages: WikiPage[], roots: WikiPage[]) {
  for (const root of roots) {
    if (isCompletedPage(root)) continue;
    if (displayWikiPath(root.path).endsWith("/wiki/plans/index.mdx")) {
      const hasConcretePlan = roots.some((candidate) => candidate.path !== root.path);
      if (hasConcretePlan) continue;
    }
    const stages = childPlanPages(root, pages).filter((page) => !isCompletedPage(page));
    if (!stages.length) return root.path;
    const stage = stages[0];
    const units = childPlanPages(stage, pages).filter((page) => !isCompletedPage(page));
    return (units[0] || stage).path;
  }
  return "";
}

function pathIsCompletedPage(path: string, pages: WikiPage[]) {
  const displayPath = displayWikiPath(path);
  const page = pages.find((candidate) => displayWikiPath(candidate.path) === displayPath);
  return Boolean(page && isCompletedPage(page));
}

function pageStatus(page: WikiPage) {
  return page.status ? String(page.status).replace("completed", "complete") : "";
}

function pathContainsSelectedPage(path: string, selectedPath: string) {
  const normalizedPath = displayWikiPath(path);
  const normalizedSelected = displayWikiPath(selectedPath);
  if (normalizedSelected === normalizedPath) return true;
  const stage = normalizedPath.match(/^(.*)\/stage-(\d+)[^/]*\.mdx$/);
  if (stage && normalizedSelected.startsWith(`${stage[1]}/units/stage-${stage[2]}/`)) return true;
  const basePath = planTreeBasePath(normalizedPath);
  return normalizedSelected.startsWith(`${basePath}/`);
}

function titleForPath(path: string, pages: WikiPage[]) {
  const page = pages.find((candidate) => candidate.path === path);
  return page ? cleanPageTitle(page) : normalizePlanDisplayTitle(path.split("/").pop() || "Wiki");
}

function isAgentSession(session: SessionRecord) {
  return session.role === "agent" || session.name?.toLowerCase().startsWith("agent");
}

function isReusableVisibleExecuteAgentSession(session: SessionRecord) {
  return isAgentSession(session)
    && isVisibleLiveTerminalSession(session)
    && Boolean(session.command?.trim());
}

function selectExecuteAgentReuseCandidate(sessions: SessionRecord[], activeSessionId: string | null) {
  const visibleAgents = sessions.filter(isReusableVisibleExecuteAgentSession);
  if (!visibleAgents.length) return null;
  if (activeSessionId) {
    const selected = visibleAgents.find((session) => session.id === activeSessionId);
    if (selected) return selected;
  }
  return visibleAgents[0] || null;
}

function isModifySession(session: SessionRecord) {
  return isAgentSession(session) && session.purpose === "modify";
}

function isGeneralSession(session: SessionRecord) {
  return isAgentSession(session) && session.purpose === "general";
}

function isGeneralPrewarmSession(session: SessionRecord) {
  return isGeneralSession(session) && isStandbySession(session);
}

function isStandbySession(session: SessionRecord) {
  return session.visibility === "standby";
}

function isPendingTerminalSession(session: SessionRecord) {
  return session.status === "starting" || session.status === "failed";
}

function terminalPaneLabel(session: SessionRecord, index: number) {
  const label = (session.role || session.name || `terminal ${index + 1}`).toLowerCase();
  return `${label} --`;
}

function terminalPaneStatusLabel(session: SessionRecord) {
  if (isDetachedDevSession(session)) return "detached";
  if (isPendingTerminalSession(session)) return session.status === "failed" ? "failed" : "starting";
  if (isLiveTerminalSession(session)) return "running";
  return session.status || "unknown";
}

function terminalCollapsedSummary(session: SessionRecord) {
  if (isDetachedDevSession(session)) return "Dev process is still running. Terminal output cannot be replayed after restart.";
  if (isPendingTerminalSession(session)) return session.command || session.shell || "Terminal is starting.";
  return session.command || session.cwd || session.shell || session.id;
}

function terminalStartupNotice(session: SessionRecord) {
  if (isStandbySession(session)) return "";
  if (session.role === "agent") return "Starting agent terminal";
  if (session.role === "dev") return "Starting dev terminal";
  if (!session.command) return "";
  return "Starting terminal";
}

function isLiveTerminalSession(session: SessionRecord) {
  return session.status === "active";
}

function isDetachedDevSession(session: SessionRecord) {
  return session.role === "dev" && session.status === "detached";
}

function isVisibleLiveTerminalSession(session: SessionRecord) {
  return isLiveTerminalSession(session) && !isStandbySession(session);
}

function isVisibleTerminalPaneSession(session: SessionRecord) {
  return (isLiveTerminalSession(session) || isPendingTerminalSession(session) || isDetachedDevSession(session)) && !isStandbySession(session);
}

function selectDevTerminalSession(sessions: SessionRecord[], preview?: AppPreviewResponse | null) {
  const visible = sessions.filter(isVisibleTerminalPaneSession);
  const managedId = preview?.managedSession?.id || "";
  if (managedId) {
    const managed = visible.find((session) => session.id === managedId);
    if (managed) return managed;
  }
  return newestSession(visible.filter((session) => session.role === "dev"));
}

function previewDetachedDevSession(preview?: AppPreviewResponse | null, activeProject?: ProjectRecord | null): SessionRecord | null {
  const managed = preview?.managedSession;
  if (!preview?.running || !managed?.id) return null;
  return {
    id: managed.id,
    name: "dev",
    kind: "pty",
    status: managed.status || "detached",
    mode: "terminal",
    role: "dev",
    command: preview.startCommand || null,
    shell: null,
    pid: managed.pid || managed.conflictPid || null,
    cwd: activeProject?.root || null,
    scope: "global",
    scopeKind: "global",
    planPath: null,
    visibility: "visible",
    connectedClients: 0,
    retained: true,
    reconnectable: false,
  };
}

function upsertSessionRecord(sessions: SessionRecord[], nextSession: SessionRecord) {
  const didReplace = sessions.some((session) => session.id === nextSession.id);
  if (didReplace) return sessions.map((session) => session.id === nextSession.id ? nextSession : session);
  return [...sessions, nextSession];
}

function compareSessions(left: SessionRecord, right: SessionRecord) {
  const leftMs = sessionSortMs(left);
  const rightMs = sessionSortMs(right);
  if (leftMs !== rightMs) return leftMs - rightMs;
  return left.id.localeCompare(right.id);
}

function selectActiveSessionId(sessions: SessionRecord[], preferredId?: string | null, currentId?: string | null) {
  const visible = sessions.filter(isVisibleTerminalPaneSession);
  if (preferredId && visible.some((session) => session.id === preferredId)) return preferredId;
  if (currentId && visible.some((session) => session.id === currentId)) return currentId;
  return newestSession(visible)?.id || null;
}

function selectReusableAgentSession(sessions: SessionRecord[], options: { purpose?: string; visibility?: "visible" | "standby"; promote?: boolean; provider?: AgentProviderId }) {
  const liveWithCommand = sessions.filter((session) =>
    session.command
    && isLiveTerminalSession(session)
    && (!options.provider || agentProviderFromCommand(session.command) === options.provider)
  );
  if (!liveWithCommand.length) return null;
  if (options.purpose === "general" && options.promote) {
    return oldestSession(liveWithCommand.filter(isStandbySession));
  }
  if (options.purpose === "modify" && options.promote) {
    return newestSession(liveWithCommand.filter(isStandbySession))
      || newestSession(liveWithCommand.filter(isVisibleLiveTerminalSession))
      || newestSession(liveWithCommand);
  }
  if (options.visibility === "standby") {
    return newestSession(liveWithCommand);
  }
  return newestSession(liveWithCommand.filter(isVisibleLiveTerminalSession));
}

function oldestSession(sessions: SessionRecord[]) {
  return sessions.reduce<SessionRecord | null>((oldest, session) => {
    if (!oldest) return session;
    const oldestMs = sessionSortMs(oldest);
    const currentMs = sessionSortMs(session);
    if (currentMs !== oldestMs) return currentMs < oldestMs ? session : oldest;
    return session.id < oldest.id ? session : oldest;
  }, null);
}

function newestSession(sessions: SessionRecord[]) {
  return sessions.reduce<SessionRecord | null>((newest, session) => {
    if (!newest) return session;
    const newestMs = sessionSortMs(newest);
    const currentMs = sessionSortMs(session);
    if (currentMs !== newestMs) return currentMs > newestMs ? session : newest;
    return session.id > newest.id ? session : newest;
  }, null);
}

function sessionSortMs(session: SessionRecord) {
  const parsed = session.createdAt ? Date.parse(session.createdAt) : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  const idTimestamp = session.id.match(/(\d{10,})/)?.[1];
  return idTimestamp ? Number(idTimestamp) : 0;
}

function nextClientTerminalId() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pendingTerminalSession(options: { id: string; name: string; role: "agent" | "cli"; command: string | null; scope: TerminalScope }): SessionRecord {
  const now = new Date().toISOString();
  return {
    id: options.id,
    name: options.name,
    kind: "terminal",
    status: "starting",
    mode: "pending",
    role: options.role,
    command: options.command,
    scope: options.scope.scope,
    scopeKind: options.scope.scopeKind,
    planPath: options.scope.planPath,
    visibility: "visible",
    purpose: options.role === "agent" ? "general" : null,
    createdAt: now,
    updatedAt: now,
  };
}

function failedTerminalSession(options: { id: string; name: string; role: "agent" | "cli"; command: string | null; scope: TerminalScope; error: string }): SessionRecord {
  return {
    ...pendingTerminalSession(options),
    status: "failed",
    mode: "failed",
    shell: options.error,
    updatedAt: new Date().toISOString(),
  };
}

function sessionMatchesScope(session: SessionRecord, scope: TerminalScope) {
  return canonicalTerminalScopePath(session.scope || "") === scope.scope;
}

function isCurrentTerminalProject(projectId: string, current: { projectId: string; scope: string }) {
  return current.projectId === projectId;
}

function hasImportedSource(pages: WikiPage[]) {
  return pages.some((page) => displayWikiPath(page.path).endsWith("/wiki/sources/import.mdx"));
}

function hasGeneratedPlanPages(pages: WikiPage[]) {
  return importedGeneratedPlanPaths(pages).length > 0;
}

function importedGeneratedPlanPaths(pages: WikiPage[]) {
  return pages
    .map((page) => displayWikiPath(page.path))
    .filter((path) => {
      if (!path.startsWith("/wiki/plans/") || path === "/wiki/plans/index.mdx") return false;
      return true;
    });
}

function importedPlanningState(route: ViewRoute, pages: WikiPage[]) {
  const generatedPlanPaths = importedGeneratedPlanPaths(pages);
  const importedSource = hasImportedSource(pages);
  return {
    generatedPlanPaths,
    hasImportedSource: importedSource,
    isIntake: route.kind === "wiki" && route.path === "/wiki/plans/index.mdx" && importedSource && generatedPlanPaths.length === 0,
  };
}

function importPlanArtifactsAreComplete(project: ProjectRecord | null, generatedPlanPaths: string[]) {
  if (project?.importPlanning?.status === "complete") return true;
  if (project?.importPlanning?.status === "needsRepair") return false;
  return !project?.importPlanning && generatedPlanPaths.length > 0;
}

function importArtifactValidationLines(importPlanning: ImportPlanningStatus) {
  const validation = importPlanning.artifactValidation;
  if (!validation) return [importPlanning.nextAction];
  return [
    importPlanning.nextAction,
    `Artifact validation: ${validation.status}`,
    `Staged artifacts: ${validation.artifacts.length}`,
    ...validation.errors.slice(0, 8).map((error) => `validation: ${error}`),
  ];
}

function importCompletionLandingPath(workspace: WorkspaceResponse | null, generatedPlanPaths: string[]) {
  const currentPath = workspace?.status?.currentPath || "";
  if (currentPath && currentPath !== "/wiki/plans/index.mdx") return currentPath;
  return generatedPlanPaths.find((path) => path.endsWith("/index.mdx")) || generatedPlanPaths[0] || "/wiki/plans/index.mdx";
}

function importTurnSnapshotLabel(snapshot: CodexImportTurnSnapshot) {
  switch (snapshot.phase) {
    case "thread_ready":
      return "Codex thread is ready.";
    case "turn_requested":
      return "Codex turn requested; waiting for the first app-server event.";
    case "turn_started":
      return "Codex import-planning turn started.";
    case "waiting_for_first_event":
      return "Codex is still preparing the first app-server event.";
    case "waiting_for_assistant":
      return "Codex is still working; waiting for assistant text.";
    case "exec_json_fallback":
      return "Codex app-server was quiet; trying codex exec JSON.";
    case "streaming":
      return "Receiving Codex output and checking for a structured question.";
    case "stalled":
      return snapshot.schemaError || "Codex app-server stalled before producing a usable question.";
    default:
      return snapshot.phase ? `Codex import-planning phase: ${snapshot.phase}` : "";
  }
}

function importOnboardingPhaseLabel(phase: string) {
  switch (phase) {
    case "starting_provider":
    case "starting":
      return "Starting the planning agent";
    case "thread_ready":
      return "Codex provider and import thread are ready.";
    case "turn_requested":
      return "Codex turn requested; waiting for provider events.";
    case "waiting_for_first_event":
      return "Codex is still preparing the first app-server event.";
    case "waiting_for_assistant":
    case "streaming":
      return "Receiving Codex output and checking for a structured question.";
    case "exec_json_fallback":
      return "Codex app-server was quiet; trying codex exec JSON.";
    case "running_question_turn":
      return "Waiting for the next structured question.";
    case "running_repair_turn":
      return "Repairing the previous incomplete planning turn.";
    case "running_plan_turn":
    case "running_plan_repair_turn":
      return "Planning agent is writing the MVP plan.";
    case "parsing_contract":
      return "Parsing the planning contract.";
    case "waiting_for_answer":
      return "Next planning question is ready.";
    default:
      return phase ? phase.replace(/_/g, " ") : "Import planning is running.";
  }
}

function shouldAutoRepairImportPlanningDrift(requestId: string, text: string) {
  if (!requestId.includes(":answer:")) return false;
  if (!text.trim()) return false;
  const compact = text.replace(/\s+/g, " ").trim();
  const futureWork = /(?:i(?:'m| am| will)|we(?:'re| are| will)|going to|next(?:,| i| we)?).{0,140}(?:create|write|update|generate|produce).{0,140}(?:mvp|plan|wiki|brief|source|artifact|file)/i.test(compact);
  const docsOnlyPlanIntent = /(?:create|write|update|generate).{0,120}(?:mvp plan|plan files|durable briefs|wiki indexes|source briefs|docs-only)/i.test(compact);
  return futureWork || docsOnlyPlanIntent || compact.length > 0;
}

function planningWorkstreamLineKey(line: string) {
  return line.trim().replace(/\s+/g, " ").replace(/[.]+$/g, "").toLowerCase();
}

function appendPlanningWorkstreamLines(current: string[], nextLines: string[], limit = importPlanningWorkstreamLimit) {
  const next = [...current];
  for (const line of nextLines) {
    const normalized = line.trim();
    if (!normalized) continue;
    const previous = next[next.length - 1] || "";
    if (planningWorkstreamLineKey(previous) === planningWorkstreamLineKey(normalized)) continue;
    next.push(normalized);
  }
  return next.slice(-limit);
}

function compactPlanningActivityText(text: string, maxChars: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}

function isImportedPlanningIntakeRoute(route: ViewRoute, pages: WikiPage[]) {
  return importedPlanningState(route, pages).isIntake;
}

function isReactRenderedMdxPath(path: string) {
  return displayWikiPath(path).startsWith("/wiki/") && path.endsWith(".mdx");
}

function isIncompleteImportProject(project: ProjectRecord | null | undefined) {
  return project?.importPlanning?.status === "incomplete";
}

function importPlanningQuestionToPlanningQuestion(question: ImportPlanningQuestion): PlanningQuestion {
  return {
    id: question.id,
    sessionId: question.id,
    requestId: question.id,
    question: question.prompt,
    recommendedAnswer: question.recommendedAnswer || "",
    reasoning: question.rationale,
    options: question.options || [],
  };
}

function planningQuestionToImportQuestion(question: PlanningQuestion): ImportPlanningQuestion {
  return {
    id: question.id,
    label: "Agent Planning Question",
    prompt: question.question,
    impact: "blocking",
    rationale: question.reasoning || question.recommendedAnswer || "Captured during imported project planning Q&A.",
    recommendedAnswer: question.recommendedAnswer,
    options: question.options,
  };
}

function updateProjectImportPlanning(projects: ProjectListResponse, projectId: string, importPlanning: ImportPlanningStatus): ProjectListResponse {
  if (!projectId) return projects;
  const update = (project: ProjectRecord) => project.id === projectId ? { ...project, importPlanning } : project;
  return {
    ...projects,
    projects: projects.projects?.map(update) || [],
    checkouts: projects.checkouts?.map(update) || [],
    projectGroups: projects.projectGroups?.map((group) => ({
      ...group,
      checkouts: group.checkouts.map(update),
    })) || [],
  };
}

function terminalImportPlanningPrompt(project: ProjectRecord) {
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "Mode: terminal_import_planning.",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "Goal:",
    "Run a terminal-native one-question-at-a-time planning interview for this newly imported hyperwiki project, then create validated MDX MVP plan docs when no blocking unknowns remain.",
    "",
    "Immediate workflow:",
    "- Read wiki/index.mdx and wiki/sources.mdx first.",
    "- Read wiki/sources/import.mdx and any source briefs under wiki/sources/ that exist.",
    "- Inspect repo evidence before asking questions the repo can answer.",
    "- Ask exactly one focused terminal question at a time and stop for the user's answer.",
    "- When tradeoffs exist, include a recommended answer first and 2-3 concise alternatives in normal terminal prose.",
    "- Do not emit hyperwiki-question JSON, hyperwiki-question-batch JSON, or app-rendered question objects.",
    "- After each user answer, reconcile it against the imported sources and saved Q&A, then ask the next blocking question or write the MVP plan.",
    "",
    "Durable Q&A:",
    "- Record summarized import decisions and user answers in wiki/sources/import-qna.mdx.",
    "- Update wiki/sources/import-state.mdx when useful to summarize readiness, blockers, and next action.",
    "- Keep full terminal transcript out of visible wiki pages unless explicitly requested.",
    "",
    "Plan artifact contract:",
    "- Write wiki/plans/mvp/index.mdx.",
    "- Write separate stage and executable unit files under wiki/plans/mvp/.",
    "- Keep wiki/plans/index.mdx structural only.",
    "- Each executable unit must include intent, scope, implementation notes, dependencies or blockers, verification, and completion gate.",
    "- If a unit requires manual verification or external setup, spell out the exact user action, command or settings path when known, expected success signal, and what to rerun afterward.",
    "- Update wiki/log.mdx only with durable import-planning decisions or plan creation history.",
    "- Name unknowns instead of inventing certainty.",
    "",
    "Completion:",
    "- Stop after creating the MVP plan artifacts and recording verification/handoff notes.",
    "- Do not commit unless repository instructions explicitly allow it and checks pass.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
  ].join("\n");
}

type AgentProviderAvailability = { codexAvailable: boolean; claudeAvailable: boolean };
type AgentProviderId = "codex" | "claude";

function defaultAgentCommand(providers?: AgentProviderAvailability) {
  // Detection only changes the default for new/unconfigured panels. Codex stays
  // the default when both CLIs are present (back-compat); fall back to Claude
  // only when it is the sole installed agent.
  if (providers && !providers.codexAvailable && providers.claudeAvailable) {
    return "claude --dangerously-skip-permissions";
  }
  return "codex --yolo";
}

function agentLaunchCommand(layout: LayoutResponse | null, effort: ThinkingEffort = defaultThinkingEffort, providers?: AgentProviderAvailability) {
  const command = layout?.panels?.find((panel) => panel.role === "agent" || panel.name === "agent")?.command?.trim() || defaultAgentCommand(providers);
  return codexCommandWithThinkingEffort(command, effort);
}

function importAgentLaunchCommand(layout: LayoutResponse | null) {
  const command = agentLaunchCommand(layout, defaultThinkingEffort);
  if (!/^\s*(?:[\w./-]+\/)?codex(?:\s|$)/.test(command)) return command;
  const withoutExistingModel = command
    .replace(/\s+-m\s+\S+/g, "")
    .replace(/\s+--model\s+\S+/g, "")
    .replace(codexModelReasoningEffortFlagPattern, "")
    .replace(codexPlanModeReasoningEffortFlagPattern, "")
    .trim();
  return `${withoutExistingModel} -m gpt-5.5 -c 'model_reasoning_effort="low"' -c 'plan_mode_reasoning_effort="low"'`;
}

function codexCommandWithThinkingEffort(command: string, effort: ThinkingEffort) {
  if (!/^\s*(?:[\w./-]+\/)?codex(?:\s|$)/.test(command)) return command;
  const normalized = normalizedThinkingEffort(effort);
  const withoutExistingEffort = command
    .replace(codexModelReasoningEffortFlagPattern, "")
    .replace(codexPlanModeReasoningEffortFlagPattern, "")
    .trim();
  return `${withoutExistingEffort} -c 'model_reasoning_effort="${normalized}"' -c 'plan_mode_reasoning_effort="${normalized}"'`;
}

const codexModelReasoningEffortFlagPattern = /\s+-c\s+(['"]?)model_reasoning_effort=(?:"[^"]*"|'[^']*'|[^\s'"]+)\1/g;
const codexPlanModeReasoningEffortFlagPattern = /\s+-c\s+(['"]?)plan_mode_reasoning_effort=(?:"[^"]*"|'[^']*'|[^\s'"]+)\1/g;

// Claude Code has no Codex-style reasoning-effort flags, so its launch command
// passes through unchanged. Kept as a named parallel to the Codex helper.
function claudeCommandWithThinkingEffort(command: string, _effort: ThinkingEffort) {
  if (!/^\s*(?:[\w./-]+\/)?claude(?:\s|$)/.test(command)) return command;
  return command;
}

function agentProviderFromCommand(command?: string | null): AgentProviderId {
  const token = (command || "").trim().split(/\s+/)[0] || "";
  const base = token.split(/[\\/]/).pop() || token;
  return base === "claude" ? "claude" : "codex";
}

function layoutAgentProvider(layout: LayoutResponse | null): AgentProviderId {
  const command = layout?.panels?.find((panel) => panel.role === "agent" || panel.name === "agent")?.command;
  return agentProviderFromCommand(command);
}

function importedProjectQuestionScriptPrompt(project: ProjectRecord, requestId: string, sourceContext: string) {
  return [
    "You are generating the next hyperwiki import-planning interview question.",
    "Questionnaire-only response. Do not use tools. Do not run commands. Do not read files. Do not write plans. Do not update wiki files.",
    "Use only the inline source context in this prompt.",
    "If you are about to say you will write files, create the MVP plan, update wiki indexes, inspect the repo, or run commands, stop and output the JSON question instead.",
    "",
    "Goal:",
    "Generate exactly one source-grounded blocking planning question for the imported project. hyperwiki will ask it in the UI.",
    "",
    "Output exactly one fenced JSON block. No prose after the block.",
    "The JSON object must have:",
    "- type: \"hyperwiki-question\"",
    `- requestId: \"${requestId}\"`,
    "- question",
    "- recommendedAnswer",
    "- reasoning",
    "- options",
    "",
    "Options may be strings or objects with label and description. Put the recommended option first.",
    "Ask only decisions that affect MVP scope, UX, technical shape, verification, privacy, or plan sequencing.",
    "Prefer source-specific questions over generic startup questions.",
    "Do not include placeholder keys like label or description as visible options.",
    "Stop after the JSON block.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
    "",
    "Inline source context:",
    sourceContext.trim() || "No source context was available. Ask source-grounded discovery questions and name unknowns.",
  ].join("\n");
}

function importedProjectPlanningPrompt(project: ProjectRecord, requestId: string, latestAnswer = "", answeredQuestionId = "") {
  const isInitialTurn = !latestAnswer.trim();
  if (!isInitialTurn) {
    return [
      "You are working inside this newly imported hyperwiki project.",
      "Plan mode only: do not implement product code from this prompt.",
      "",
      "Fast import-planning turn:",
      `- requestId: ${requestId}`,
      `- Latest answer: ${latestAnswer}`,
      answeredQuestionId ? `- Answered question id: ${answeredQuestionId}` : "- Answered question id: none.",
      "",
      "Read only wiki/sources/import-state.mdx and wiki/sources/import-qna.mdx first.",
      "Use wiki/sources/import.mdx or source briefs only if the compact state is insufficient for the next decision.",
      "",
      "Output rules:",
      "- If a branching decision remains, emit one JSON object with type \"hyperwiki-question\", requestId, question, recommendedAnswer, reasoning, and options.",
      "- If no blocking unknowns remain, emit one JSON object with type \"hyperwiki-ready-to-plan\", requestId, reasoning, and planIntent.",
      "- Options may be strings or objects with label and description. Put the recommended option first.",
      `- Every emitted object must use requestId exactly \"${requestId}\".`,
      "- Emit only the JSON object. Do not use tools, run commands, read additional files, write files, or include prose.",
      "- Stop after emitting the JSON object.",
      "",
      `Imported project: ${project.name}`,
      `Project root: ${project.root}`,
    ].join("\n");
  }
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "You are working inside this newly imported hyperwiki project.",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "Goal:",
    "Run a fresh source-grounded planning interview for this imported project, then create the first MVP plan docs only after the user has answered enough questions.",
    "",
    "Current import-planning turn:",
    `- requestId: ${requestId}`,
    latestAnswer ? `- Latest answer: ${latestAnswer}` : "- Latest answer: none yet; ask the first blocking question.",
    answeredQuestionId ? `- Answered question id: ${answeredQuestionId}` : "- Answered question id: none.",
    "",
    "Source context:",
    "- Read wiki/index.mdx first.",
    "- Read wiki/sources.mdx.",
    "- Read wiki/sources/import.mdx as the canonical imported source.",
    "- If wiki/sources/import-qna.mdx exists, read it and continue from the saved unanswered state instead of restarting the interview.",
    "- Read wiki/sources/prd.mdx, wiki/sources/technical-brief.mdx, and wiki/sources/design-brief.mdx if present.",
    "",
    "Planning requirements:",
    "- Start with a one-question-at-a-time grilling session before writing implementation stages or units.",
    "- For every user-facing question, emit one JSON object containing type \"hyperwiki-question\", requestId, question, recommendedAnswer, reasoning, and options. Prefer a fenced ```json block, but do not use bullets inside the JSON.",
    `- The JSON object's requestId must be exactly \"${requestId}\".`,
    "- hyperwiki renders that JSON in the app UI; keep prose before and after the question brief.",
    "- Put the recommended answer first in options. Keep options mutually exclusive and concise.",
    "- After emitting a hyperwiki-question block, stop and wait for the user's answer before continuing.",
    "- If latest answer is present above, briefly reconcile it against wiki/sources/import-qna.mdx, then either emit the next hyperwiki-question object or emit a hyperwiki-ready-to-plan object if no blocking unknowns remain.",
    "- If the user's answer rejects the options, reconcile the note and then ask the next blocking question with a new hyperwiki-question block.",
    "- This is the first plan for an imported project; treat it as MVP planning unless the user corrects that during Q&A.",
    "- Do not create wiki/plans/mvp/ until the Q&A has resolved blocking product, UX, technical, and verification decisions.",
    "- The technical-stack pass is mandatory before plan creation. Resolve or explicitly record as a blocker/unknown: frontend or client surface, backend/API/runtime, persistence/data storage, auth/user model, external services and integrations, AI/model provider when relevant, deployment/local preview approach, build/type/test commands, and any required environment variables.",
    "- For hyperwiki projects, package management defaults to pnpm and the local run command is always pnpm dev. If frontend, backend, workers, or other long-running processes are needed, plan to orchestrate them inside the package dev script, commonly with concurrently.",
    "- Do not infer stack defaults from thin context. If source evidence does not justify a stack choice, ask a hyperwiki-question or record the unknown as a blocker in the generated plan.",
    "- When the interview is done, emit a hyperwiki-ready-to-plan object. Do not create plan files in this question-decision turn.",
    "- Name unknowns instead of inventing certainty.",
    "- Do not finish with future-tense procedural prose like \"I am going to create the plan.\" Either emit a hyperwiki-ready-to-plan JSON object or emit the next hyperwiki-question JSON object.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
  ].join("\n");
}

function importedProjectPlanningRepairPrompt(project: ProjectRecord, requestId: string, previousOutput = "", answeredQuestionId = "") {
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "You are repairing an incomplete hyperwiki import-planning turn.",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "The previous turn completed without a parseable hyperwiki-question and without validated generated plan files.",
    "Do not summarize what you will do. Return one of these two JSON objects now:",
    "",
    "A. If no blocking unknowns remain, output exactly one fenced JSON object with type \"hyperwiki-ready-to-plan\", requestId, reasoning, and planIntent.",
    "B. If a blocking unknown remains, output exactly one fenced JSON object with type \"hyperwiki-question\", requestId, question, recommendedAnswer, reasoning, and options.",
    "",
    "Strict output rules:",
    `- Any emitted question must use requestId exactly \"${requestId}\".`,
    "- Do not emit future-tense procedural prose such as \"I am going to update\" or \"I will create\".",
    "- Do not write plan files in this repair turn.",
    "- Stop immediately after the JSON block.",
    answeredQuestionId ? `- The answered question id was ${answeredQuestionId}.` : "- No answered question id was supplied.",
    "",
    "Context to read first:",
    "- wiki/index.mdx",
    "- wiki/sources/import.mdx",
    "- wiki/sources/import-qna.mdx",
    "- wiki/sources/import-state.mdx when present",
    "- wiki/sources/prd.mdx, wiki/sources/technical-brief.mdx, and wiki/sources/design-brief.mdx when present",
    "",
    "Previous incomplete assistant output:",
    previousOutput.trim().slice(-1200) || "No previous output was captured.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
  ].join("\n");
}

function importedProjectPlanGenerationPrompt(project: ProjectRecord, requestId: string, readyContext = "") {
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "You are generating the first MVP plan for this newly imported hyperwiki project.",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "This is a plan-generation turn, not a question turn.",
    `- requestId: ${requestId}`,
    "- Create validated MDX wiki plan files now.",
    "- Do not ask another question unless writing a safe MVP plan is impossible; in that case emit exactly one hyperwiki-question JSON object and stop.",
    "",
    "Read first:",
    "- wiki/index.mdx",
    "- wiki/sources.mdx",
    "- wiki/sources/import.mdx",
    "- wiki/sources/import-qna.mdx",
    "- wiki/sources/import-state.mdx when present",
    "- wiki/sources/prd.mdx, wiki/sources/technical-brief.mdx, and wiki/sources/design-brief.mdx when present",
    "",
    "Plan artifact contract:",
    "- Write wiki/plans/mvp/index.mdx.",
    "- Write separate stage and executable unit files under wiki/plans/mvp/.",
    "- Keep wiki/plans/index.mdx structural only; put current plan, current stage/unit, blockers, and next action in the active plan files.",
    "- Update wiki/log.mdx and source briefs only when the import decisions created durable project context.",
    "- Choose a planning composition pattern before writing: feature plan, architecture comparison, API/MCP contract, implementation unit, or verification handoff.",
    "- Use CardGroup for full-width stacked cards and Columns only for logical grouping; avoid multi-column plan layouts so generated briefs read as one full-width column.",
    "- Use RequestExample and ResponseExample for API, MCP, command, event, or schema contracts.",
    "- Every executable unit must include intent, scope, implementation notes, dependencies or blockers, and a Verification section.",
    "- Name unknowns instead of inventing certainty.",
    "- Do not finish by saying you will write files. Write them before the final response.",
    "",
    "Ready-to-plan context:",
    readyContext.trim().slice(-1600) || "No ready-to-plan context was supplied; use the imported source and Q&A.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
  ].join("\n");
}

function importedProjectPlanRepairPrompt(project: ProjectRecord, requestId: string, previousOutput = "") {
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "You are repairing a failed hyperwiki import plan-generation turn.",
    "The previous turn completed without validated MVP plan artifacts.",
    "",
    `- requestId: ${requestId}`,
    "- Write the missing MVP plan files now under wiki/plans/mvp/.",
    "- Keep wiki/plans/index.mdx structural only.",
    "- Do not ask another question unless the imported source and Q&A make MVP planning impossible.",
    "- If you ask a question, emit exactly one hyperwiki-question JSON object and stop.",
    "- Do not emit future-tense procedural prose.",
    "",
    "Previous incomplete output:",
    previousOutput.trim().slice(-1200) || "No previous output was captured.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
  ].join("\n");
}

function planCreationPrompt(project: ProjectRecord | null, intent = "") {
  const normalizedIntent = intent.trim();
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "Goal:",
    "Run a terminal-native one-question-at-a-time planning interview, then create or update MDX wiki plan docs only when no blocking unknowns remain.",
    "",
    ...(normalizedIntent ? [] : [
      "Immediate blank-intent handling:",
      "- No initial user intent was provided.",
      "- Your first response must ask one focused terminal question asking what plan the user wants to create, then stop and wait.",
      "- Do not inspect the repo, read wiki files, run commands, or summarize existing plans before that first answer.",
      "- After the user answers, read wiki/index.mdx and wiki/plans/index.mdx first if they exist, then inspect repo evidence before asking questions the repo can answer.",
      "",
    ]),
    "hyperwiki requirements:",
    normalizedIntent
      ? "- Read wiki/index.mdx and wiki/plans/index.mdx first if they exist."
      : "- After the user supplies the planning focus, read wiki/index.mdx and wiki/plans/index.mdx first if they exist.",
    "- Inspect repo evidence before asking questions the repo can answer, except for the initial planning-focus question when the initial user intent is blank.",
    "- If the initial user intent below is blank, ask the user for the planning focus first and wait; do not do any repo or wiki exploration before that first answer.",
    "- Ask one focused terminal question at a time. When tradeoffs exist, include a recommended answer first and 2-3 concise alternatives.",
    "- After each question, stop and wait for the user's answer in the terminal.",
    "- After receiving an answer, briefly reconcile it, then either ask the next blocking question or create the plan if no blocking unknowns remain.",
    "- Keep asking until goal, audience, success criteria, scope, constraints, implementation approach, edge cases, and verification are clear enough for another engineer or agent to implement safely.",
    "- Surface terminology conflicts, contradictions, scope risks, and missing verification.",
    "- For plans that create or materially change implementation foundations, resolve or explicitly record stack-impacting choices before writing executable units: frontend/client surface, backend/API/runtime, persistence, auth, external services/integrations, provider choices, local preview/deployment approach, and build/type/test commands.",
    "- For hyperwiki projects, package management defaults to pnpm and the local run command is always pnpm dev. If frontend, backend, workers, or other long-running processes are needed, plan to orchestrate them inside the package dev script, commonly with concurrently.",
    "- Do not infer stack defaults from thin context. Ask a hyperwiki-question or record a blocker/assumption when the stack would affect implementation safety.",
    "- Preserve a flexible plan > stages > units structure; compact plans may use one implicit stage.",
    "- If the accepted plan has explicit stages, a Current stage, a multi-stage implementation sequence, or more than one phase gate, do not write it as a single wiki/plans/features/*.mdx leaf page.",
    "- Staged plans must use a plan-root directory: wiki/plans/<slug>/index.mdx, child wiki/plans/<slug>/stage-XX-*.mdx pages, and child unit pages under each stage directory.",
    "- For complex staged plans, create all stage pages and all currently planned unit pages before finishing. Do not leave stages as headings inside the root plan.",
    "- Each stage page must include the stage goal, dependencies or blockers, detailed unit sequence, completion gate, and verification expectations before later stages begin.",
    "- Each unit page must be highly detailed enough for one implementation pass: Intent or Goal, Scope, Implementation Notes, Dependencies or Blockers, Verification, and Completion Gate.",
    "- Unit Verification must name concrete automated, manual, or explicitly deferred checks. Manual checks must include exact user-facing steps, commands or settings when known, and the expected success signal.",
    "- Unit Completion Gate must make required manual steps impossible to miss: name who performs the step, what is blocked until it happens, how to perform it, what evidence proves success, and what to rerun afterward.",
    "- Mark the next unit as blocked or not-started until the current unit's verification is recorded or explicitly deferred with risk.",
    "- Every executable unit must include a Verification section or component.",
    "- hyperwiki plan pages can use these built-in MDX components without imports: PlanHero, PlanSummary, PlanUnit, Decision, Evidence, Verification, Callout, Note, Tip, Warning, Danger, Check, Panel, Frame, Card, CardGroup, Columns, Column, Aside, RequestExample, ResponseExample, Steps, Step, Prompt, Update, TaskList, StatusBadge, ParamField, ResponseField, Tree, TreeFolder, TreeFile, CodeBlock, CommandBlock, Tabs, Tab, AccordionGroup, Accordion, Tooltip, and Visibility.",
    "- Before writing, choose the planning composition pattern that fits the content: feature plan, architecture comparison, API/MCP contract, implementation unit, or verification handoff.",
    "- Prefer PlanHero for the title, intent, and canonical page status. Use PlanSummary for current unit/next action/blockers/validation, Decision for accepted choices, Evidence for source-grounded facts, Verification for checks, Steps/Step for stage or unit sequences, full-width CardGroup cards for alternatives or work tracks, CommandBlock for exact local commands, CodeBlock for file snippets/schema/config/API examples, RequestExample/ResponseExample/ParamField/ResponseField for contracts, and Callout/Warning/Danger for important constraints. Use plain semantic sections for routine headings like Scope, Implementation Notes, and Completion Gate.",
    "- Prefer CodeBlock over raw fenced code blocks for visible plan examples when a title, language label, copy affordance, or tabbed alternatives would help. For alternatives, compose Tabs/Tab with one CodeBlock per tab instead of dumping repeated fences.",
    "- Use Visibility for=\"agents\" around long source context, raw Q&A, or implementation handoff details that agents need but humans should not see in the rendered app. Use Visibility for=\"humans\" only for app-visible explanation that should be stripped from agent Markdown.",
    "- Do not dump long imported source bundles or Q&A transcripts into visible paragraphs; summarize visibly and preserve the full context in agent-only Visibility blocks when needed.",
    "- Write MDX files under wiki/plans/ and update wiki/plans/index.mdx and wiki/log.mdx.",
    "- Keep full transcript out of durable wiki files unless explicitly requested; write summarized evidence and decisions.",
    "- Commit generated docs when safe. Do not push.",
    "",
    `Project: ${project?.name || "Unknown"}`,
    `Project root: ${project?.root || "Unknown"}`,
    "",
    "Initial user intent:",
    normalizedIntent || "(blank; ask the user what plan they want to create)",
  ].join("\n");
}

function workflowPrompt(action: "execute-main" | "modify", workspace: WorkspaceResponse | null, pages: WikiPage[], visiblePath: string, userRequest = "") {
  const context = planningPromptContext(workspace, pages, visiblePath, action === "modify");
  if (action === "modify") {
    const initialRequest = userRequest.trim();
    return [
      "Mode: Modify Plan, planning/wiki-only.",
      "",
      initialRequest ? "Task: apply the requested plan modification." : "Task: no modification request yet. Inspect only the current planning page and nearby planning context, then stop with a concise ready message.",
      "",
      "Current context:",
      `- Planning page: ${context.planningPage}`,
      `- Current unit: ${context.unitTitle}`,
      `- Current unit path: ${context.unitPath || "none"}`,
      ...(initialRequest ? ["", "Requested modification:", initialRequest] : ["", "Standby behavior: do not edit files or run checks until the user provides the requested modification."]),
      "",
      "Allowed files when editing:",
      "- wiki/plans/**/*.mdx, wiki/index.mdx, wiki/log.mdx, wiki/sources.mdx, wiki/AGENTS.mdx.",
      "",
      "Restrictions:",
      "- Do not implement product code, format product code, or change src/**, app/**, components/**, lib/**, public/**, tests/**, package manifests, lockfiles, build config, runtime config, or generated application assets.",
      "- Do not run ahead into Execute Unit behavior. If the requested change requires code, update the plan to describe that execution work and stop.",
      "- If you edit files, run relevant checks before finishing.",
      "- Report only repo-visible non-wiki changes as a caution; leave .hyperwiki/ runtime/session state alone and do not treat it as a blocker.",
    ].join("\n");
  }
  const unitTitle = context.unitTitle;
  const unitPath = context.unitPath;
  return [
    "Execute exactly one hyperwiki unit on main.",
    "",
    `Execution unit: ${unitTitle}`,
    `Execution unit path: ${unitPath || "none"}`,
    `Visible page path: ${context.planningPage}`,
    "",
    "Instructions:",
    "- Work in the current main checkout.",
    "- Keep changes grounded in the execution unit and repo state.",
    "- Complete exactly this execution unit.",
    "- Do not complete sibling units, later units, or the entire stage unless this unit explicitly requires only status reconciliation for already-finished work.",
    "- If the unit reaches a manual review, approval, external configuration, credential, deployment setting, browser inspection, or human validation gate, prepare the evidence/checklist and stop before continuing.",
    "- Any manual gate must be explicit in your final handoff. Add a clearly titled `Manual step required` section before the general summary.",
    "- The `Manual step required` section must include: what is blocked, why it is blocked, who must do it, exact commands/settings/UI path when known, expected success signal/output, files/status intentionally left unchanged, and what button or command the user should rerun after completing it.",
    "- Do not merely say a manual gate remains; explain how the user can clear it.",
    "- Update unit, stage, dashboard, sidebar-relevant status, and log entries only when the evidence supports those status changes.",
    "- Run relevant checks before summarizing the result.",
  ].join("\n");
}

function planningPromptContext(workspace: WorkspaceResponse | null, pages: WikiPage[], visiblePath: string, preferVisibleUnit: boolean) {
  const planningPage = displayWikiPath(visiblePath);
  const visiblePage = pages.find((page) => displayWikiPath(page.path) === planningPage);
  if (preferVisibleUnit && visiblePage && isUnitPage(visiblePage)) {
    return {
      planningPage,
      unitTitle: cleanPageTitle(visiblePage),
      unitPath: planningPage,
    };
  }
  const status = workspace?.status || {};
  return {
    planningPage,
    unitTitle: status.current || "No current unit resolved",
    unitPath: status.currentPath ? displayWikiPath(status.currentPath) : "",
  };
}

function existingWorktreePrompt(workspace: WorkspaceResponse | null, visiblePath: string, result: { branch?: string; path?: string; previewUrl?: string; project?: ProjectRecord }) {
  const status = workspace?.status || {};
  return [
    "Execute exactly one hyperwiki unit in the already-created worktree.",
    "",
    `Execution unit: ${status.current || "No current unit resolved"}`,
    `Execution unit path: ${status.currentPath || "none"}`,
    `Visible page path: ${visiblePath}`,
    `Worktree branch: ${result.branch || "unknown"}`,
    `Worktree path: ${result.path || result.project?.root || "unknown"}`,
    `Worktree preview URL: ${result.previewUrl || "not configured"}`,
    "",
    "Instructions:",
    "- Use this existing worktree checkout directly; do not create another worktree.",
    "- Use the parallel-dev-worktrees skill before changing files.",
    "- Keep changes grounded in this execution unit and repo state.",
    "- If the implementation creates or changes a previewable app, ensure package.json has a runnable dev script, preferably backed by Portless.",
    "- Include the Preview URL in your final handoff.",
    "- Complete exactly this execution unit.",
    "- If the unit reaches a manual review, approval, external configuration, credential, deployment setting, browser inspection, or human validation gate, stop and put a clearly titled `Manual step required` section before the general summary.",
    "- The `Manual step required` section must include: what is blocked, why it is blocked, who must do it, exact commands/settings/UI path when known, expected success signal/output, files/status intentionally left unchanged, and what button or command the user should rerun after completing it.",
    "- Run relevant checks before summarizing the result.",
  ].join("\n");
}

function slugify(value: string) {
  return String(value || "work")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "work";
}

function normalizedThinkingEffort(value: string | null | undefined): ThinkingEffort {
  const normalized = String(value || "low").trim().toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(normalized) ? normalized as ThinkingEffort : "low";
}

function worktreePreviewForSlug(root: string, slug: string) {
  const normalized = root.replace(/\/+$/g, "");
  if (!normalized) return `../worktrees/${slug}`;
  const parts = normalized.split("/");
  const base = parts.pop() || "project";
  const parent = parts.join("/") || "/";
  return `${parent}/${base}.worktrees/${slug}`;
}

function scopeForRoute(route: ViewRoute) {
  if (route.kind !== "wiki") {
    return { scope: route.kind, scopeKind: "app", planPath: null };
  }
  const wikiPath = displayWikiPath(route.path);
  if (wikiPath.includes("/plans/")) {
    const planPath = terminalPlanRootPath(wikiPath);
    return { scope: planPath, scopeKind: "plan", planPath };
  }
  return { scope: wikiPath, scopeKind: "wiki", planPath: null };
}

function terminalPlanRootPath(path: string) {
  const normalized = canonicalTerminalScopePath(path);
  const unitChild = normalized.match(/^(.*)\/unit-\d+[^/]*\.mdx$/);
  if (unitChild) return `${unitChild[1]}.mdx`;
  return normalized;
}

function normalizeTerminalScope(scope: TerminalScope): TerminalScope {
  if (scope.scopeKind === "plan") {
    const planPath = terminalPlanRootPath(scope.planPath || scope.scope);
    return { ...scope, scope: planPath, planPath };
  }
  if (scope.scopeKind === "wiki") {
    const wikiPath = canonicalTerminalScopePath(scope.scope);
    return { ...scope, scope: wikiPath, planPath: scope.planPath ? canonicalTerminalScopePath(scope.planPath) : null };
  }
  return scope.planPath
    ? { ...scope, planPath: canonicalTerminalScopePath(scope.planPath) }
    : scope;
}

function canonicalTerminalScopePath(path: string) {
  return displayWikiPath((path || "").split(/[?#]/)[0] || path);
}

function trimPlanningQuestionBuffer(text: string) {
  return text.length > 40000 ? text.slice(-40000) : text;
}

function extractLatestPlanningQuestions(text: string, sessionId: string, answeredQuestionIds: Set<string> = new Set(), expectedRequestId = ""): PlanningQuestion[] {
  const diagnostics = planningQuestionExtractionDiagnostics(text, sessionId, answeredQuestionIds, expectedRequestId);
  if (diagnostics.candidateIds.length && !diagnostics.questions.length) {
    appendImportLog(`Planning question candidates unavailable session=${sessionId} expected=${expectedRequestId || "none"} candidates=${diagnostics.candidateIds.length} ids=${diagnostics.candidateIds.join(",")} ignoredRequests=${diagnostics.ignoredRequestIds.join(",") || "none"}`);
  }
  return diagnostics.questions;
}

function planningQuestionExtractionDiagnostics(text: string, sessionId: string, answeredQuestionIds: Set<string> = new Set(), expectedRequestId = "") {
  const candidates: PlanningQuestion[] = [];
  const blocks = [...text.matchAll(/```(?:json|hyperwiki-question)?\s*([\s\S]*?)```/gi)];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const raw = blocks[index]?.[1]?.trim();
    if (!raw) continue;
    candidates.push(...parsePlanningQuestionJson(raw, sessionId));
  }
  const rawObjects = extractRawPlanningQuestionObjects(text);
  for (let index = rawObjects.length - 1; index >= 0; index -= 1) {
    candidates.push(...parsePlanningQuestionJson(rawObjects[index], sessionId));
  }
  const requestMatched = expectedRequestId
    ? candidates.filter((question) => !question.requestId || question.requestId === expectedRequestId)
    : candidates;
  const ignoredRequestIds = expectedRequestId
    ? candidates.map((question) => question.requestId || "none").filter((requestId) => requestId !== "none" && requestId !== expectedRequestId)
    : [];
  const questions = firstQuestionGroup(requestMatched.filter((question) => !answeredQuestionIds.has(question.id)));
  return {
    candidateIds: candidates.map((question) => question.id),
    codeBlocks: blocks.length,
    ignoredRequestIds,
    questions,
    rawObjects: rawObjects.length,
  };
}

function extractLatestReadyToPlanSignal(text: string, expectedRequestId = ""): ImportPlanningReadyToPlan | null {
  const candidates: ImportPlanningReadyToPlan[] = [];
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const parsed = parseReadyToPlanJson(blocks[index]?.[1]?.trim() || "");
    if (parsed) candidates.push(parsed);
  }
  const rawObjects = extractRawTypedObjects(text, "hyperwiki-ready-to-plan");
  for (let index = rawObjects.length - 1; index >= 0; index -= 1) {
    const parsed = parseReadyToPlanJson(rawObjects[index]);
    if (parsed) candidates.push(parsed);
  }
  return candidates.find((candidate) => !expectedRequestId || !candidate.requestId || candidate.requestId === expectedRequestId) || null;
}

function parseReadyToPlanJson(raw: string): ImportPlanningReadyToPlan | null {
  if (!raw || !raw.includes("hyperwiki-ready-to-plan")) return null;
  try {
    const value = JSON.parse(raw) as Partial<ImportPlanningReadyToPlan>;
    if (value.type !== "hyperwiki-ready-to-plan") return null;
    return {
      type: "hyperwiki-ready-to-plan",
      requestId: stringValue(value.requestId),
      reasoning: stringValue(value.reasoning),
      planIntent: stringValue(value.planIntent),
    };
  } catch {
    return null;
  }
}

function firstQuestionGroup(questions: PlanningQuestion[]) {
  if (!questions.length) return [];
  const first = questions[0];
  if (!first.batchId) return [first];
  return questions.filter((question) => question.batchId === first.batchId);
}

function extractRawPlanningQuestionObjects(text: string) {
  const objects: string[] = [];
  const markerPattern = /"(?:type|question)"\s*:/g;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    markerPattern.lastIndex = searchFrom;
    const match = markerPattern.exec(text);
    if (!match) break;
    const markerIndex = match.index;
    const start = text.lastIndexOf("{", markerIndex);
    if (start === -1) {
      searchFrom = markerIndex + match[0].length;
      continue;
    }
    const end = findJsonObjectEnd(text, start);
    if (end === -1) {
      searchFrom = markerIndex + match[0].length;
      continue;
    }
    const candidate = text.slice(start, end + 1);
    if (isPlanningQuestionObjectCandidate(candidate)) objects.push(candidate);
    searchFrom = end + 1;
  }
  return objects;
}

function extractRawTypedObjects(text: string, type: string) {
  const objects: string[] = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(type, searchFrom);
    if (markerIndex === -1) break;
    const start = text.lastIndexOf("{", markerIndex);
    if (start === -1) {
      searchFrom = markerIndex + type.length;
      continue;
    }
    const end = findJsonObjectEnd(text, start);
    if (end !== -1) objects.push(text.slice(start, end + 1));
    searchFrom = end === -1 ? markerIndex + type.length : end + 1;
  }
  return objects;
}

function isPlanningQuestionObjectCandidate(candidate: string) {
  return candidate.includes("hyperwiki-question")
    || (/"question"\s*:/.test(candidate) && (/"recommendedAnswer"\s*:/.test(candidate) || /"options"\s*:/.test(candidate)));
}

function findJsonObjectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parsePlanningQuestionJson(raw: string, sessionId: string): PlanningQuestion[] {
  try {
    const value = JSON.parse(raw) as Partial<PlanningQuestion> & { type?: string; questions?: unknown[] };
    if (value.type === "hyperwiki-question-batch" && Array.isArray(value.questions)) {
      const requestId = stringValue(value.requestId);
      const batchId = `planning-batch:${Math.abs(stableHash(`${sessionId}\n${requestId}\n${raw}`))}`;
      const parsedQuestions: PlanningQuestion[] = [];
      value.questions.forEach((question, index) => {
        const parsed = planningQuestionFromValue(question as Partial<PlanningQuestion> & { type?: string }, sessionId, requestId, batchId, index);
        if (parsed) parsedQuestions.push(parsed);
      });
      return parsedQuestions;
    }
    const question = planningQuestionFromValue(value, sessionId);
    return question ? [question] : [];
  } catch {
    return parseLoosePlanningQuestion(raw, sessionId);
  }
}

function parseLoosePlanningQuestion(raw: string, sessionId: string): PlanningQuestion[] {
  if (!raw.includes("hyperwiki-question")) return [];
  const question = looseJsonStringField(raw, "question");
  if (!question) return [];
  const requestId = looseJsonStringField(raw, "requestId");
  const recommendedAnswer = looseJsonStringField(raw, "recommendedAnswer");
  const reasoning = looseJsonStringField(raw, "reasoning");
  const options = looseJsonArrayField(raw, "options");
  return [normalizePlanningQuestion(sessionId, question, recommendedAnswer, reasoning, options, requestId)];
}

function planningQuestionFromValue(value: Partial<PlanningQuestion> & { type?: string }, sessionId: string, inheritedRequestId = "", batchId = "", batchIndex = 0) {
  const question = stringValue(value.question);
  if (!question) return null;
  if (value.type && value.type !== "hyperwiki-question") return null;
  const requestId = stringValue(value.requestId) || inheritedRequestId;
  const recommendedAnswer = stringValue(value.recommendedAnswer);
  const reasoning = stringValue(value.reasoning);
  const options = Array.isArray(value.options)
    ? value.options.map(planningQuestionOptionFromValue).filter((option): option is PlanningQuestionOption => Boolean(option)).slice(0, 7)
    : [];
  return normalizePlanningQuestion(sessionId, question, recommendedAnswer, reasoning, options, requestId, batchId, batchIndex);
}

function planningQuestionOptionFromValue(value: unknown): PlanningQuestionOption | null {
  if (typeof value === "string") {
    const label = value.trim();
    if (isOptionPlaceholderLabel(label)) return null;
    return label ? { label } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = stringValue(record.label) || stringValue(record.value) || stringValue(record.title);
  if (isOptionPlaceholderLabel(label)) return null;
  if (!label) return null;
  const description = stringValue(record.description) || stringValue(record.detail) || stringValue(record.reasoning);
  return description ? { label, description } : { label };
}

function isOptionPlaceholderLabel(label: string) {
  return /^(?:label|description)$/i.test(label.trim());
}

function normalizePlanningQuestion(sessionId: string, question: string, recommendedAnswer: string, reasoning: string, options: PlanningQuestionOption[], requestId = "", batchId = "", batchIndex = 0) {
  const normalizedOptions = options.length || !recommendedAnswer ? options : [{ label: recommendedAnswer }];
  return {
    id: stableQuestionId(sessionId, question, recommendedAnswer, normalizedOptions.map((option) => option.description ? `${option.label}: ${option.description}` : option.label), batchId ? String(batchIndex) : ""),
    sessionId,
    requestId,
    batchId,
    question,
    recommendedAnswer,
    reasoning,
    options: normalizedOptions,
  };
}

function latestPlanningActivity(text: string) {
  const lines = planningWorkstreamLines(text);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (/^(Explored|Read|Ran|Search|List)\b/.test(line)) return `Agent ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
    if (/^(I |I’|I've|I’ve|Source review|The source|There is|I found|I confirmed)/.test(line)) return line;
  }
  const workingMatch = text.match(/Working\(([^)]*)\)/);
  return workingMatch?.[1] ? `Agent is working (${workingMatch[1]})` : "";
}

function agentRunPhaseLabel(phase: AgentRunPhase) {
  switch (phase) {
    case "starting":
      return "Starting agent";
    case "waiting":
      return "Waiting for prompt";
    case "sent":
      return "Prompt sent";
    case "exploring":
      return "Exploring project";
    case "editing":
      return "Editing files";
    case "checking":
      return "Running checks";
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    default:
      return "Idle";
  }
}

function inferAgentRunPhase(text: string, lines: string[], current: AgentRunPhase): AgentRunPhase {
  const joined = lines.join("\n");
  if (/Worked for|Handled the workspace request|Checks run successfully|worktree remains clean|No code or wiki edits were needed/i.test(joined)) return "complete";
  if (/Remaining blocker|blocked by|blocked:/i.test(joined)) return "blocked";
  if (/Edited |Apply patch|changed \d+ files?/i.test(joined)) return "editing";
  if (/Ran pnpm|Ran npm|Ran yarn|Ran cargo|typecheck|lint|test|build|smoke/i.test(joined)) return "checking";
  if (/Explored|Read |Search |List |Inspect/i.test(joined)) return "exploring";
  if (/Please handle this hyperwiki workspace request|Prompt sent/i.test(text)) return "sent";
  return current;
}

function agentRunOutcome(text: string, lines: string[], phase: AgentRunPhase) {
  if (phase === "blocked") {
    const blocker = lines.find((line) => /Remaining blocker|blocked by|blocked:/i.test(line));
    return blocker || "Agent run is blocked.";
  }
  if (phase !== "complete") return "";
  const commit = text.match(/Committed(?:\s+[^.]{0,120}?)?\s+as\s+([a-f0-9]{7,40})\s+([^\n.]+)/i);
  const remaining = text.match(/Remaining blocker:\s*([\s\S]{0,260}?)(?:\.|\n|$)/i);
  if (commit) {
    return normalizeAgentOutcome(`Agent finished and committed ${commit[1]} ${commit[2]}.${remaining ? ` Remaining blocker: ${remaining[1]}.` : ""}`);
  }
  if (/git status --short\s*└ \(no output\)|worktree remains clean|No code or wiki edits were needed/i.test(text)) {
    return normalizeAgentOutcome(`Agent finished and the worktree remained clean.${remaining ? ` Remaining blocker: ${remaining[1]}.` : ""}`);
  }
  const summary = [...lines].reverse().find((line) => /Handled the workspace request|Checks run successfully|passed|complete/i.test(line));
  return normalizeAgentOutcome(summary ? `${summary}${remaining ? ` Remaining blocker: ${remaining[1]}.` : ""}` : `Agent finished.${remaining ? ` Remaining blocker: ${remaining[1]}.` : ""}`);
}

function normalizeAgentOutcome(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendAgentTranscript(current: string, chunk: string) {
  const text = terminalTextForParsing(chunk);
  if (!text.trim()) return current;
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  return `${current}${separator}${text}`;
}

function planningWorkstreamLines(text: string, options: { limit?: number; maxLineLength?: number } = {}) {
  const limit = options.limit ?? importPlanningWorkstreamLimit;
  const maxLineLength = options.maxLineLength ?? 220;
  return terminalTextForParsing(text)
    .split("\n")
    .map((line) => line.trim().replace(/^[-•]\s*/, "").replace(/^└\s*/, ""))
    .filter((line) => {
      if (!line || line.length < 3 || line.length > maxLineLength) return false;
      if (line.includes("hyperwiki-question") || line.startsWith('"') || line === "{" || line === "}" || line === "[" || line === "]") return false;
      if (/^(Wor|Work|Worki|Workin|Working|orking|rking|king|ing|M+|\d+\s+[A-Za-z])$/.test(line)) return false;
      if (/^gpt-\S+\s/.test(line) || line.startsWith("›")) return false;
      if (/^[\u2500-╿]{6,}$/.test(line)) return false;
      return true;
    })
    .slice(-limit);
}

function looseJsonStringField(raw: string, field: string) {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|,\\s*\\]|\\s*\\})`));
  return match?.[1] ? unescapeLooseJsonString(match[1]) : "";
}

function looseJsonArrayField(raw: string, field: string): PlanningQuestionOption[] {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(`[${match[1]}]`) as unknown[];
    return parsed
      .map(planningQuestionOptionFromValue)
      .filter((option): option is PlanningQuestionOption => Boolean(option))
      .slice(0, 7);
  } catch {
    const objectOptions: PlanningQuestionOption[] = [];
    let searchFrom = 0;
    while (searchFrom < match[1].length) {
      const start = match[1].indexOf("{", searchFrom);
      if (start === -1) break;
      const end = findJsonObjectEnd(match[1], start);
      if (end === -1) break;
      try {
        const option = planningQuestionOptionFromValue(JSON.parse(match[1].slice(start, end + 1)));
        if (option) objectOptions.push(option);
      } catch {
        const rawOption = match[1].slice(start, end + 1);
        const label = looseJsonStringField(rawOption, "label");
        const description = looseJsonStringField(rawOption, "description");
        if (label) objectOptions.push(description ? { label, description } : { label });
      }
      searchFrom = end + 1;
    }
    if (objectOptions.length) return objectOptions.slice(0, 7);
  }
  return [...match[1].matchAll(/"([\s\S]*?)"\s*,?/g)]
    .map((item) => unescapeLooseJsonString(item[1] || ""))
    .filter((value) => value && value !== "label" && value !== "description")
    .map((label) => ({ label }))
    .slice(0, 7);
}

function unescapeLooseJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/\n/g, "\\n")}"`).trim();
  } catch {
    return value.replace(/\s+/g, " ").trim();
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index) | 0;
  }
  return hash;
}

function stableQuestionId(sessionId: string, question: string, recommendedAnswer: string, options: string[], suffix = "") {
  const input = `${question}\n${recommendedAnswer}\n${options.join("\n")}\n${suffix}`;
  const hash = stableHash(input);
  return `planning-question:${Math.abs(hash)}`;
}

async function sendInput(sessionId: string, input: string) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    body: { input },
  });
}

async function sendPasteSubmitInput(sessionId: string, message: string) {
  appendImportLog(`Terminal paste submit start session=${sessionId} chars=${message.length}`);
  await sendInput(sessionId, `\x1b[200~${message}\x1b[201~`);
  await sendInput(sessionId, "\r");
  appendImportLog(`Terminal paste submit complete session=${sessionId}`);
}

type AgentPromptReadinessSnapshot = {
  ready: boolean;
  reason: string;
  tail: string;
  promptReady: boolean;
  promptIndex: number;
  mcpSeen: boolean;
  mcpCurrent: number | null;
  mcpTotal: number | null;
};

async function waitForAgentPromptReady(sessionId: string, options: { maxAttempts?: number; intervalMs?: number; reason?: string } = {}) {
  const startedAt = Date.now();
  let lastText = "";
  let lastSnapshot: AgentPromptReadinessSnapshot | null = null;
  let lastLogKey = "";
  const maxAttempts = options.maxAttempts || 120;
  const intervalMs = options.intervalMs || 250;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const replay = await hyperwikiApi.json<TerminalReplayResponse>(`/api/terminal/${encodeURIComponent(sessionId)}/replay`);
      const bytes = Uint8Array.from(replay.bytes || []);
      const plain = terminalTextForParsing(terminalBytesToText(bytes));
      const snapshot = agentPromptReadinessSnapshot(plain);
      lastSnapshot = snapshot;
      lastText = snapshot.tail;
      const logKey = agentPromptReadinessLogKey(snapshot);
      if (logKey !== lastLogKey) {
        appendImportLog(`Agent prompt readiness state session=${sessionId} reason=${options.reason || "default"} attempt=${attempt + 1}/${maxAttempts} ready=${snapshot.ready} detail=${logKey} elapsedMs=${Date.now() - startedAt} tail=${JSON.stringify(snapshot.tail)}`);
        lastLogKey = logKey;
      }
      if (snapshot.ready) return true;
    } catch (error) {
      lastText = error instanceof Error ? error.message : String(error);
    }
    await delay(intervalMs);
  }
  appendImportLog(`Agent prompt readiness timed out session=${sessionId} reason=${options.reason || "default"} waitedMs=${Date.now() - startedAt} attempts=${maxAttempts} state=${lastSnapshot ? agentPromptReadinessLogKey(lastSnapshot) : "none"} tail=${JSON.stringify(lastText)}`);
  return false;
}

function isAgentPromptReady(text: string) {
  return agentPromptReadinessSnapshot(text).ready;
}

function agentPromptReadinessSnapshot(text: string): AgentPromptReadinessSnapshot {
  const normalized = text.replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const lastPrompt = Math.max(normalized.lastIndexOf("›"), normalized.lastIndexOf("\u203a"));
  const compactLastPrompt = Math.max(compact.lastIndexOf("›"), compact.lastIndexOf("\u203a"));
  const tail = normalized.slice(-500);
  const queuedFollowUp = /queued\s*follow-up\s*inputs|queuedfollow-upinputs/.test(lower.slice(-3500)) || compact.slice(-3500).includes("queuedfollow-upinputs");
  const lastModelLoading = lower.lastIndexOf("model: loading");
  const lastModelReady = Math.max(lower.lastIndexOf("model: gpt"), lower.lastIndexOf("model: default"));
  const modelLoading = lastModelLoading !== -1 && lastModelLoading > lastModelReady;
  const mcp = agentMcpStartupState(lower, compact);
  const promptTail = lastPrompt === -1 ? "" : normalized.slice(lastPrompt, lastPrompt + 260);
  const promptReady = lastPrompt !== -1 && (/\u203a\s*$/.test(text) || /›\s*$/.test(text) || isCodexPromptPlaceholderReady(promptTail));
  const base: Omit<AgentPromptReadinessSnapshot, "ready" | "reason"> = {
    tail,
    promptReady,
    promptIndex: lastPrompt,
    mcpSeen: mcp.seen,
    mcpCurrent: mcp.latestCount?.current ?? null,
    mcpTotal: mcp.latestCount?.total ?? null,
  };

  if (queuedFollowUp) return { ...base, ready: false, reason: "queued-follow-up" };
  if (modelLoading) return { ...base, ready: false, reason: "model-loading" };
  if (mcp.seen) {
    if (!mcp.latestCount) return { ...base, ready: false, reason: "mcp-starting-no-count" };
    if (mcp.latestCount.current < mcp.latestCount.total) {
      if (promptReady && compactLastPrompt > mcp.latestCount.endIndex) {
        return { ...base, ready: true, reason: `prompt-after-stale-mcp-${mcp.latestCount.current}/${mcp.latestCount.total}` };
      }
      return { ...base, ready: false, reason: `mcp-starting-${mcp.latestCount.current}/${mcp.latestCount.total}` };
    }
    if (compactLastPrompt === -1) return { ...base, ready: false, reason: "no-prompt-after-mcp" };
    if (compactLastPrompt < mcp.latestCount.endIndex) return { ...base, ready: false, reason: "prompt-before-mcp-complete" };
  }
  if (lastPrompt === -1) return { ...base, ready: false, reason: "no-prompt" };
  if (!promptReady) return { ...base, ready: false, reason: "prompt-not-ready" };
  return { ...base, ready: true, reason: mcp.seen ? "prompt-after-mcp" : "prompt-ready" };
}

function agentPromptReadinessLogKey(snapshot: AgentPromptReadinessSnapshot) {
  const mcp = snapshot.mcpCurrent === null || snapshot.mcpTotal === null ? "mcp=none" : `mcp=${snapshot.mcpCurrent}/${snapshot.mcpTotal}`;
  return `${snapshot.reason};prompt=${snapshot.promptReady ? "ready" : snapshot.promptIndex === -1 ? "none" : "seen"};${mcp}`;
}

function agentMcpStartupState(lower: string, compact: string) {
  const seen = /starting\s*mcp|mcp\s*servers|servers\s*\(\s*\d+\s*\/\s*\d+\s*\)|codex_apps|codx_apps|computer-use|node_repl/.test(lower)
    || /startingmcp|mcpservers|servers\(\d+\/\d+\)|codex_apps|codx_apps|computer-use|node_repl/.test(compact);
  let latestCount: { current: number; total: number; endIndex: number } | null = null;
  const counts = compact.matchAll(/(?:mcp)?servers?\((\d{1,2})\/(\d{1,2})\)/g);
  for (const count of counts) {
    const current = Number.parseInt(count[1], 10);
    const total = Number.parseInt(count[2], 10);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1 || total > 20 || current > total) continue;
    latestCount = {
      current,
      total,
      endIndex: (count.index || 0) + count[0].length,
    };
  }
  return { seen: seen || Boolean(latestCount), latestCount };
}

function isCodexPromptPlaceholderReady(promptTail: string) {
  const knownPrompts = /(?:Implement \{feature\}|Explain this codebase|Write tests for @filename|Run \/review on my current changes|Use \/skills to list available skills)/i;
  if (new RegExp(`[›\u203a]\\s*${knownPrompts.source}`, "i").test(promptTail)) return true;
  const promptMatch = promptTail.match(/[›\u203a]\s*([^\r\n]{1,220})/);
  const promptLine = promptMatch?.[1]?.trim() || "";
  if (!promptLine) return false;
  if (/queued\s*follow-up\s*inputs|queuedfollow-upinputs|starting\s+mcp|startingmcp|model:\s*loading/i.test(promptLine)) return false;
  return /(?:gpt-\d|gpt-\d\.\d|default|low|medium|high|xhigh|\/model|·|~\/|\/Users\/)/i.test(promptLine);
}

function isAgentStartupInProgress(text: string) {
  const lower = text.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const recent = lower.slice(-1800);
  if (/queued\s*follow-up\s*inputs|queuedfollow-upinputs/.test(recent)) return true;
  const lastModelLoading = lower.lastIndexOf("model: loading");
  const lastModelReady = Math.max(lower.lastIndexOf("model: gpt"), lower.lastIndexOf("model: default"));
  if (lastModelLoading !== -1 && lastModelLoading > lastModelReady) return true;
  const lastPrompt = Math.max(lower.lastIndexOf("›"), lower.lastIndexOf("\u203a"));
  const markerAfterPrompt = (pattern: RegExp) => {
    const match = [...lower.matchAll(pattern)].at(-1);
    return Boolean(match && match.index !== undefined && (lastPrompt === -1 || match.index > lastPrompt));
  };
  if (markerAfterPrompt(/model:\s*loading/g)) return true;
  if (markerAfterPrompt(/starting\s+\d+\s*\(/g)) return true;
  if (markerAfterPrompt(/starting\s+mcp|startingmcp/g)) return true;
  if (markerAfterPrompt(/mcp\s+servers\s*\(\s*\d+\s*\/\s*\d+\s*\)/g)) {
    const afterPrompt = lastPrompt === -1 ? lower : lower.slice(lastPrompt);
    const complete = afterPrompt.match(/mcp\s+servers\s*\(\s*(\d+)\s*\/\s*\1\s*\)/g);
    const lastCount = [...afterPrompt.matchAll(/mcp\s+servers\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/g)].at(-1);
    if (lastCount && lastCount[1] !== lastCount[2]) return true;
    if (!complete) return true;
  }
  const compactAfterPrompt = lastPrompt === -1 ? compact : compact.slice(lastPrompt);
  const compactLastCount = [...compactAfterPrompt.matchAll(/mcpservers\((\d+)\/(\d+)\)/g)].at(-1);
  if (compactLastCount && compactLastCount[1] !== compactLastCount[2]) return true;
  return false;
}

function isAgentMcpStartupInProgress(text: string) {
  const lastPrompt = Math.max(text.lastIndexOf("›"), text.lastIndexOf("\u203a"));
  const tail = (lastPrompt === -1 ? text : text.slice(lastPrompt)).toLowerCase();
  const compactTail = tail.replace(/\s+/g, "");
  const startupIndex = Math.max(tail.lastIndexOf("starting mcp servers"), compactTail.lastIndexOf("startingmcpservers"));
  if (startupIndex === -1) return false;
  const startupTail = tail.slice(Math.max(0, Math.min(startupIndex, tail.length - 1)));
  const compactStartupTail = compactTail.slice(Math.max(0, Math.min(startupIndex, compactTail.length - 1)));
  const spacedCount = [...startupTail.matchAll(/servers\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/g)].at(-1);
  const compactCount = [...compactStartupTail.matchAll(/servers\((\d+)\/(\d+)\)/g)].at(-1);
  const count = spacedCount || compactCount;
  if (count) return count[1] !== count[2];
  return /starting\s*mcp|startingmcp|codex_apps|computer-use|node_repl/.test(startupTail) || /startingmcp|codex_apps|computer-use|node_repl/.test(compactStartupTail);
}

async function sendResize(sessionId: string, cols: number, rows: number) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/resize`, {
    method: "POST",
    body: { cols, rows },
  });
}

type TauriEvent = {
  payload?: unknown;
};

type TauriEventGlobal = typeof globalThis & {
  __TAURI__?: {
    event?: {
      listen?: (event: string, handler: (event: TauriEvent) => void) => Promise<() => void>;
    };
  };
};

async function listenTerminalOutput(handler: (payload: TerminalOutputEventPayload) => void) {
  const listen = (globalThis as TauriEventGlobal).__TAURI__?.event?.listen;
  if (typeof listen !== "function") {
    throw new Error("Tauri event transport is unavailable for terminal output.");
  }
  return listen("terminal://output", (event) => {
    const payload = event.payload as Partial<TerminalOutputEventPayload> | null;
    if (!payload || typeof payload.sessionId !== "string" || typeof payload.seq !== "number" || !Array.isArray(payload.bytes)) return;
    handler({
      sessionId: payload.sessionId,
      seq: payload.seq,
      bytes: payload.bytes.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 255),
    });
  });
}

async function listenTerminalCompletion(handler: (payload: TerminalCompletionEventPayload) => void) {
  const listen = (globalThis as TauriEventGlobal).__TAURI__?.event?.listen;
  if (typeof listen !== "function") {
    throw new Error("Tauri event transport is unavailable for terminal completion.");
  }
  return listen("terminal://completion", (event) => {
    const payload = event.payload as Partial<TerminalCompletionEventPayload> | null;
    if (!payload || typeof payload.sessionId !== "string" || (payload.reason !== "process-exit" && payload.reason !== "agent-ready")) return;
    handler({
      sessionId: payload.sessionId,
      role: typeof payload.role === "string" ? payload.role : null,
      name: typeof payload.name === "string" ? payload.name : null,
      scope: typeof payload.scope === "string" ? payload.scope : null,
      planPath: typeof payload.planPath === "string" ? payload.planPath : null,
      reason: payload.reason,
      exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
      completedAt: typeof payload.completedAt === "string" ? payload.completedAt : new Date().toISOString(),
    });
  });
}

function terminalCompletionNotificationSettings(settings?: SettingsResponse["notifications"] | null): Required<TerminalCompletionNotificationSettings> {
  const terminalCompletion = settings?.terminalCompletion || {};
  return {
    enabled: terminalCompletion.enabled !== false,
    onlyWhenUnfocused: terminalCompletion.onlyWhenUnfocused !== false,
    sound: terminalCompletion.sound !== false,
  };
}

function terminalCompletionSound() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "Ping";
  if (platform.includes("linux")) return "message-new-instant";
  return undefined;
}

function terminalBytesToText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function cleanInitialTerminalDisplayText(data: string, initialBuffer: { current: string | null }) {
  if (initialBuffer.current === null) return data;
  const combined = `${initialBuffer.current}${data}`;
  const markerMatch = combined.match(/^\r?%[ \t]*(?:\r\n?|\n)/);
  if (markerMatch) {
    initialBuffer.current = null;
    return combined.slice(markerMatch[0].length);
  }
  if (/^\r?%[ \t]*$/.test(combined)) {
    initialBuffer.current = combined;
    return "";
  }
  initialBuffer.current = null;
  return combined;
}

function terminalDisplayTextForXterm(data: string, carry: { current: string }) {
  return stripTerminalDisplayControlSequences(data, carry);
}

function terminalDisplayHasVisibleText(data: string) {
  return stripTerminalDisplayControlSequences(data)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n")
    .trim()
    .length > 0;
}

function terminalDisplayDebugTail(data: string) {
  return terminalPlainTextForLog(data)
    || terminalTextForParsing(data).replace(/[ \t]+/g, " ").trim().slice(-500);
}

async function openTerminalWebLink(uri: string) {
  try {
    await hyperwikiApi.request("/api/app/open-external", {
      method: "POST",
      body: { target: uri },
    });
  } catch (error) {
    console.error("Failed to open terminal link", error);
  }
}

function terminalTranscriptTextForDisplay(data: string) {
  return terminalTextForParsing(data)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .filter(isUsefulTerminalLogLine)
    .join("\n");
}

function appendTerminalTranscriptText(previous: string, next: string) {
  const trimmedNext = next.trim();
  if (!trimmedNext) return previous;
  const trimmedPrevious = previous.trim();
  if (!trimmedPrevious) return trimmedNext;
  if (trimmedPrevious.endsWith(trimmedNext)) return previous;
  const previousTail = trimmedPrevious.slice(-1200);
  if (previousTail && trimmedNext.includes(previousTail)) {
    return trimmedNext;
  }
  return `${trimmedPrevious}\n${trimmedNext}`;
}

type XtermRenderSnapshot = {
  containerWidth: number;
  containerHeight: number;
  terminalWidth: number;
  terminalHeight: number;
  cols: number;
  rows: number;
  canvasCount: number;
  domTextLength: number;
  hasHelperTextarea: boolean;
  interactive: boolean;
  paintedPixels: number;
  rendered: boolean;
  display: string;
  visibility: string;
  opacity: string;
};

function xtermRenderSnapshot(container: HTMLElement, terminal: Terminal): XtermRenderSnapshot {
  const containerRect = container.getBoundingClientRect();
  const element = terminal.element || (container.querySelector(".xterm") as HTMLElement | null);
  const terminalRect = element?.getBoundingClientRect();
  const style = element ? getComputedStyle(element) : null;
  const helperTextarea = container.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
  const domText = (container.querySelector(".xterm-rows")?.textContent
    || container.querySelector(".xterm-screen")?.textContent
    || element?.textContent
    || "");
  const domTextLength = domText.replace(/\s+/g, "").length;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  let paintedPixels = 0;
  for (const canvas of canvases) {
    paintedPixels += countVisibleCanvasPixels(canvas, 220 - paintedPixels);
    if (paintedPixels >= 220) break;
  }
  const hasUsableGeometry = containerRect.width > 0 && containerRect.height > 0 && (terminalRect?.width || 0) > 0 && (terminalRect?.height || 0) > 0 && terminal.cols > 0 && terminal.rows > 0;
  const isElementVisible = !style || (style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0);
  const hasInteractiveInput = Boolean(helperTextarea && !helperTextarea.disabled && !helperTextarea.readOnly);
  const hasRenderedContent = paintedPixels >= 220 || domTextLength > 0;
  return {
    containerWidth: Math.round(containerRect.width),
    containerHeight: Math.round(containerRect.height),
    terminalWidth: Math.round(terminalRect?.width || 0),
    terminalHeight: Math.round(terminalRect?.height || 0),
    cols: terminal.cols,
    rows: terminal.rows,
    canvasCount: canvases.length,
    domTextLength,
    hasHelperTextarea: Boolean(helperTextarea),
    interactive: hasUsableGeometry && isElementVisible && hasInteractiveInput,
    paintedPixels,
    rendered: hasUsableGeometry && isElementVisible && hasRenderedContent,
    display: style?.display || "unknown",
    visibility: style?.visibility || "unknown",
    opacity: style?.opacity || "unknown",
  };
}

function xtermRenderSnapshotSummary(snapshot: XtermRenderSnapshot) {
  return `container=${snapshot.containerWidth}x${snapshot.containerHeight} terminal=${snapshot.terminalWidth}x${snapshot.terminalHeight} cols=${snapshot.cols} rows=${snapshot.rows} canvases=${snapshot.canvasCount} paintedPixels=${snapshot.paintedPixels} domChars=${snapshot.domTextLength} helperTextarea=${snapshot.hasHelperTextarea} interactive=${snapshot.interactive} rendered=${snapshot.rendered} display=${snapshot.display} visibility=${snapshot.visibility} opacity=${snapshot.opacity}`;
}

function countVisibleCanvasPixels(canvas: HTMLCanvasElement, needed: number) {
  if (needed <= 0 || canvas.width <= 0 || canvas.height <= 0) return 0;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    return 0;
  }
  if (!context) return 0;
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 24) continue;
      if (isTerminalBackgroundPixel(pixels[index], pixels[index + 1], pixels[index + 2])) continue;
      count += 1;
      if (count >= needed) return count;
    }
    return count;
  } catch {
    return 0;
  }
}

function isTerminalBackgroundPixel(red: number, green: number, blue: number) {
  return colorDistance(red, green, blue, 32, 35, 31) < 14
    || colorDistance(red, green, blue, 0, 0, 0) < 10
    || colorDistance(red, green, blue, 17, 19, 18) < 14;
}

function colorDistance(red: number, green: number, blue: number, targetRed: number, targetGreen: number, targetBlue: number) {
  return Math.abs(red - targetRed) + Math.abs(green - targetGreen) + Math.abs(blue - targetBlue);
}

function terminalTextForParsing(data: string) {
  return stripTerminalDisplayControlSequences(data)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n");
}

function stripTerminalDisplayControlSequences(data: string, carry?: { current: string }) {
  const raw = `${carry?.current || ""}${String(data || "")}`;
  const { complete, pending } = splitTrailingTerminalControlSequence(raw);
  if (carry) carry.current = pending;
  return complete.replace(/\x1b\[\?2026[hl]/g, "");
}

function splitTrailingTerminalControlSequence(data: string) {
  const escapeIndex = data.lastIndexOf("\x1b");
  if (escapeIndex === -1) return { complete: data, pending: "" };
  const suffix = data.slice(escapeIndex);
  if (suffix === "\x1b") return { complete: data.slice(0, escapeIndex), pending: suffix };
  if (suffix.startsWith("\x1b[")) {
    if (/^\x1b\[[0-?]*[ -/]*[@-~]$/.test(suffix)) return { complete: data, pending: "" };
    if (!/[@-~]/.test(suffix.slice(2).replace(/[0-?]/g, "").replace(/[ -/]/g, ""))) {
      return { complete: data.slice(0, escapeIndex), pending: suffix };
    }
  }
  if (suffix.startsWith("\x1b]") && !suffix.includes("\x07") && !suffix.includes("\x1b\\")) {
    return { complete: data.slice(0, escapeIndex), pending: suffix };
  }
  return { complete: data, pending: "" };
}

function logTerminalPlainText(
  sessionId: string,
  label: string,
  chars: number,
  total: number | null,
  output: string,
  previous: { current: string },
) {
  const text = terminalPlainTextForLog(output);
  if (!text || text === previous.current) return;
  previous.current = text;
  const totalPart = total === null ? "" : ` total=${total}`;
  appendImportLog(`${label} session=${sessionId} chars=${chars}${totalPart} text=${text}`);
}

function terminalPlainTextForLog(data: string) {
  const text = stripTerminalDisplayControlSequences(data)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n");
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(isUsefulTerminalLogLine)
    .slice(-16)
    .join("\\n")
    .slice(-1600);
}

function isUsefulTerminalLogLine(line: string) {
  if (!line) return false;
  const normalized = line.replace(/^[-•]\s*/, "").trim();
  if (!normalized) return false;
  if (/^%+$/.test(normalized)) return false;
  if (/^(?:Wor|Work|Worki|Workin|Working|orking|rking|king|ing)$/.test(normalized)) return false;
  if (/^(?:[WM•\s]*Working|Working|M+|M M|S|l|g|\d+|[?;:\d\[\]HKl]+)$/.test(normalized)) return false;
  if (/(?:esc to interrupt|background terminals? running|\/ps to vi|ctrl \+ t to view transcript)/i.test(normalized)) return false;
  if (/^(?:\d{1,3};){1,}\d{1,3}[A-Za-z]?$/.test(normalized)) return false;
  if (/^(?:\d{1,3};){1,}\d{1,3};\d{1,3}m/.test(normalized)) return false;
  if (/^›\s*.*mplement\s+\{feature\}/i.test(line)) return false;
  if (/^gpt-[\w.-]+\s+\w+\s+·\s+/.test(line)) return false;
  if (/^model:\s|^directory:\s|^permissions:\s|^Tip:\s/.test(line)) return false;
  if (/^[-─]{8,}$/.test(line)) return false;
  if (/^[╭╰│╯─\s>_OpenAICodex().\w:-]+$/.test(line) && line.includes("Codex")) return false;
  if (/^(?:active|agent|pty|reconnectable)$/.test(line)) return false;
  return /[A-Za-z]{3,}/.test(line);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default App;
