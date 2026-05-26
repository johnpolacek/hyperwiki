import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Circle,
  Command,
  ExternalLink,
  FolderOpen,
  FolderGit2,
  GitBranch,
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
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { MdxPlanRenderer } from "@/components/MdxPlanRenderer";
import { Button } from "@/components/ui/button";
import { hyperwikiApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { normalizePlanDisplayTitle } from "@/lib/wiki-title";

type ViewRoute =
  | { kind: "wiki"; path: string }
  | { kind: "projects" }
  | { kind: "new-project" }
  | { kind: "plan-create" }
  | { kind: "settings" };

type CommandAction = "execute-main" | "execute-worktree" | "modify" | "review" | "new-plan";

interface WikiPage {
  title: string;
  path: string;
  summary?: string[];
  status?: string;
  currentState?: string;
  format?: "html" | "mdx";
  sourcePath?: string;
}

interface WikiListResponse {
  pages?: WikiPage[];
}

interface WikiSourceResponse {
  path: string;
  source: string;
  markdown: string;
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

interface AppPreviewResponse {
  url?: string;
  status?: string;
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
  agentCommand?: string;
  codexCommand?: string;
  claudeCommand?: string;
  browserCommand?: string;
  mcpEnabled?: boolean;
  [key: string]: unknown;
}

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
  connectedClients?: number;
  retained?: boolean;
  reconnectable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface SessionsResponse {
  sessions?: SessionRecord[];
}

interface TerminalStartResponse {
  session: SessionRecord;
  replay?: string;
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
  question: string;
  recommendedAnswer: string;
  reasoning: string;
  options: string[];
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

interface ImportPlanningStatus {
  status: "notImported" | "incomplete" | "complete";
  answeredCount: number;
  currentQuestion?: ImportPlanningQuestion | null;
  nextAction: string;
  qnaPath?: string | null;
}

interface ImportPlanningCreateResponse {
  displayPath?: string;
  wrote?: string[];
}

const defaultWikiPath = "/wiki/plans/index.mdx";
const importLogStorageKey = "hyperwiki.importLog";

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
  const [activePlanningQuestion, setActivePlanningQuestion] = useState<PlanningQuestion | null>(null);
  const [planningInterviewStatus, setPlanningInterviewStatus] = useState<"idle" | "starting" | "waiting_for_question" | "question_ready" | "answering">("idle");
  const [lastPlanningAnswer, setLastPlanningAnswer] = useState("");
  const [planningActivity, setPlanningActivity] = useState("");
  const [planningWorkstream, setPlanningWorkstream] = useState<string[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [isUpNextOpen, setIsUpNextOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<"modify" | "new-plan">("modify");
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);
  const baseDataRequestId = useRef(0);
  const lastImportPlanningDiagnostic = useRef("");
  const importedPlanningRuns = useRef(new Map<string, Promise<void>>());
  const importedPlanningCompletedKeys = useRef(new Set<string>());
  const planningQuestionBuffers = useRef(new Map<string, string>());
  const answeredPlanningQuestionIds = useRef(new Set<string>());
  const loggedPlanningQuestionIds = useRef(new Set<string>());

  const currentWikiPath = route.kind === "wiki" ? route.path : defaultWikiPath;
  const terminalScope = useMemo(() => scopeForRoute(route), [route]);
  const sidebarModel = useMemo(() => buildSidebarModel(wikiPages), [wikiPages]);
  const projectGroups = useMemo(() => normalizeProjectGroups(projects, unavailableProjectIds), [projects, unavailableProjectIds]);
  const hasRegisteredProjects = projectGroups.length > 0;
  const workspaceSelection = workspaceSelectionFromLocation();
  const isPendingImportRoute = Boolean(route.kind === "wiki" && pendingImportProject && matchesWorkspaceSelection(pendingImportProject, workspaceSelection));
  const importPlanningState = useMemo(() => importedPlanningState(route, wikiPages), [route, wikiPages]);
  const isImportedPlanningActive = isImportedPlanningIntakeRoute(route, wikiPages);

  useEffect(() => {
    applyAppTheme(settings?.theme);
  }, [settings?.theme]);

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
    if (!activeProject || !isImportedPlanningActive) return;
    if (!["starting", "waiting_for_question", "answering"].includes(planningInterviewStatus)) return;
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
      const completed = selectedProject.importPlanning?.status === "complete" || planning.generatedPlanPaths.length > 0;
      if (!completed) return;
      appendImportLog(`Imported Q&A completion detected project=${project.id} generatedPlanCount=${planning.generatedPlanPaths.length}`);
      importedPlanningCompletedKeys.current.add(`${project.id}:import-qna`);
      setActivePlanningQuestion(null);
      setPlanningInterviewStatus("idle");
      setPlanningActivity("Generated MVP plan is ready.");
      setPlanningWorkstream(["Generated MVP plan is ready."]);
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
    const request = isReactRenderedPlanPath(route.path)
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
        void planImportedProject(project);
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
  }, [terminalScope, activeProject, hasLoadedProjects]);

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

  async function loadSessions() {
    setIsSessionsLoading(true);
    try {
      const response = await hyperwikiApi.json<SessionsResponse>(withProjectQuery(`/api/sessions?scope=${encodeURIComponent(terminalScope.scope)}`, activeProject));
      const nextSessions = response.sessions || [];
      setSessions(nextSessions);
      setActiveSessionId((current) => current && nextSessions.some((session) => session.id === current) ? current : nextSessions[0]?.id || null);
    } catch {
      setSessions([]);
      setActiveSessionId(null);
    } finally {
      setIsSessionsLoading(false);
    }
  }

  function navigate(nextRoute: ViewRoute) {
    const nextUrl = urlForRoute(nextRoute, activeProject);
    appendImportLog(`Navigate route=${nextRoute.kind}${nextRoute.kind === "wiki" ? `:${nextRoute.path}` : ""} url=${nextUrl} activeProject=${activeProject?.id || "none"}`);
    setRoute(nextRoute);
    window.history.pushState(null, "", nextUrl);
  }

  async function switchProject(project: ProjectRecord) {
    appendImportLog(`Switch project ${project.id} ${project.projectSlug}/${project.worktreeSlug}`);
    setActiveProject(project);
    setIsProjectsOpen(false);
    const loaded = await loadProjectData(project);
    const loadedWorkspace = loaded.workspace;
    const landingPath = isIncompleteImportProject(project) ? defaultWikiPath : loadedWorkspace?.status?.currentPath || defaultWikiPath;
    const nextRoute: ViewRoute = { kind: "wiki", path: landingPath };
    setRoute(nextRoute);
    const nextPath = `/workspace/${project.projectSlug}/${project.worktreeSlug}#${landingPath}`;
    window.history.pushState(null, "", nextPath);
  }

  async function loadProjectData(project: ProjectRecord) {
    setStatus("Loading workspace");
    const [wikiResult, workspaceResult, previewResult, layoutResult, reviewResult, repoResult] = await Promise.allSettled([
      hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", project)),
      hyperwikiApi.json<WorkspaceResponse>(withProjectQuery("/api/workspace", project)),
      hyperwikiApi.json<AppPreviewResponse>(withProjectQuery("/api/app-preview", project)),
      hyperwikiApi.json<LayoutResponse>(withProjectQuery("/api/layout", project)),
      hyperwikiApi.json<ReviewWorkflowResponse>(withProjectQuery("/api/review-workflows", project)),
      hyperwikiApi.json<RepoContextResponse>(withProjectQuery("/api/repo", project)),
    ]);

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
    };
  }

  async function startTerminal(role: "agent" | "cli") {
    const name = role === "agent" ? "Agent" : "Terminal";
    setStatus(`Starting ${name.toLowerCase()}`);
    try {
      const started = await hyperwikiApi.json<TerminalStartResponse>(withProjectQuery("/api/terminal/start", activeProject), {
        method: "POST",
        body: {
          name,
          role,
          command: role === "agent" ? agentLaunchCommand(layout) : null,
          scope: terminalScope.scope,
          scopeKind: terminalScope.scopeKind,
          planPath: terminalScope.planPath,
        },
      });
      setActiveSessionId(started.session.id);
      await loadSessions();
      setStatus(`${name} started`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function ensureAgentSession() {
    const session = await ensureAgentSessionForProject(activeProject, layout, terminalScope, sessions);
    return session;
  }

  async function loadSessionsForProject(project: ProjectRecord | null, scope = terminalScope) {
    if (!project) return [];
    appendImportLog(`Loading sessions project=${project.id} scope=${scope.scope}`);
    const response = await hyperwikiApi.json<SessionsResponse>(withProjectQuery(`/api/sessions?scope=${encodeURIComponent(scope.scope)}`, project));
    const nextSessions = response.sessions || [];
    appendImportLog(`Loaded sessions project=${project.id} scope=${scope.scope} count=${nextSessions.length} ids=${nextSessions.map((session) => `${session.id}:${session.role || ""}:${session.scope || ""}`).join(",") || "none"}`);
    setSessions(nextSessions);
    setActiveSessionId((current) => current && nextSessions.some((session) => session.id === current) ? current : nextSessions[0]?.id || null);
    return nextSessions;
  }

  async function ensureAgentSessionForProject(project: ProjectRecord | null, projectLayout: LayoutResponse | null, scope = terminalScope, knownSessions = sessions) {
    if (!project) {
      throw new Error("Project not found for agent planning.");
    }
    const existing = knownSessions.find(isAgentSession);
    if (existing?.command) {
      appendImportLog(`ensureAgentSession reused known session project=${project.id} session=${existing.id} known=${knownSessions.length}`);
      setActiveSessionId(existing.id);
      return existing;
    }
    const command = agentLaunchCommand(projectLayout);
    if (!command) {
      throw new Error("No agent launch command is configured for this project. Set agent.launchCommand in .hyperwiki/config.json, for example codex --yolo.");
    }
    const started = await hyperwikiApi.json<TerminalStartResponse>(withProjectQuery("/api/terminal/start", project), {
      method: "POST",
      body: {
        name: "Agent",
        role: "agent",
        command,
        scope: scope.scope,
        scopeKind: scope.scopeKind,
        planPath: scope.planPath,
      },
    });
    appendImportLog(`ensureAgentSession started terminal project=${project.id} session=${started.session.id} scope=${started.session.scope || ""} role=${started.session.role || ""}`);
    setSessions((current) => current.some((session) => session.id === started.session.id) ? current : [...current, started.session]);
    setActiveSessionId(started.session.id);
    return started.session;
  }

  async function sendAgentPrompt(prompt: string) {
    await sendAgentPromptToProject(activeProject, prompt, currentWikiPath, terminalScope, layout, sessions);
  }

  const handleTerminalText = useCallback((sessionId: string, text: string) => {
    if (!text) return;
    const current = planningQuestionBuffers.current.get(sessionId) || "";
    const next = trimPlanningQuestionBuffer(current + text);
    planningQuestionBuffers.current.set(sessionId, next);
    const activity = latestPlanningActivity(next);
    if (activity) setPlanningActivity((currentActivity) => currentActivity === activity ? currentActivity : activity);
    const workstream = planningWorkstreamLines(next);
    if (workstream.length) setPlanningWorkstream(workstream);
    const question = extractLatestPlanningQuestion(next, sessionId);
    if (question && !answeredPlanningQuestionIds.current.has(question.id)) {
      if (!loggedPlanningQuestionIds.current.has(question.id)) {
        loggedPlanningQuestionIds.current.add(question.id);
        appendImportLog(`Planning question extracted session=${sessionId} id=${question.id} options=${question.options.length}`);
      }
      setPlanningInterviewStatus("question_ready");
      setActivePlanningQuestion((currentQuestion) => currentQuestion?.id === question.id ? currentQuestion : question);
    }
  }, []);

  async function answerPlanningQuestion(answer: string) {
    const question = activePlanningQuestion;
    const trimmed = answer.trim();
    if (!question || !trimmed) return;
    const response = [
      "Hyperwiki planning answer:",
      trimmed,
      "",
    ].join("\n");
    answeredPlanningQuestionIds.current.add(question.id);
    setPlanningInterviewStatus("answering");
    appendImportLog(`Planning answer submitting session=${question.sessionId} question=${question.id} chars=${trimmed.length}`);
    await sendInput(question.sessionId, terminalPasteSubmitInput(response));
    if (activeProject && isIncompleteImportProject(activeProject)) {
      void hyperwikiApi.json<ImportPlanningStatus>(withProjectQuery("/api/import-planning/answer", activeProject), {
        method: "POST",
        body: {
          question: planningQuestionToImportQuestion(question),
          answer: trimmed,
        },
      }).catch((error) => {
        appendImportLog("Could not persist import planning answer", error);
      });
    }
    appendImportLog(`Planning answer submitted session=${question.sessionId} question=${question.id}`);
    setLastPlanningAnswer(trimmed);
    setPlanningActivity("Answer sent to the planning agent");
    setPlanningWorkstream((current) => [...current.slice(-8), "Answer sent to the planning agent"]);
    setActivePlanningQuestion(null);
    setPlanningInterviewStatus("waiting_for_question");
    setStatus("Planning answer sent");
  }

  async function sendAgentPromptToProject(project: ProjectRecord | null, prompt: string, currentPage = currentWikiPath, scope = terminalScope, projectLayout = layout, knownSessions = sessions) {
    const session = await ensureAgentSessionForProject(project, projectLayout, scope, knownSessions);
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
            currentPage,
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

  async function planImportedProject(project: ProjectRecord) {
    const key = `${project.id}:import-qna`;
    const projectRoute: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" };
    const projectScope = scopeForRoute(projectRoute);
    if (importedPlanningCompletedKeys.current.has(key)) {
      appendImportLog(`Imported Q&A start ignored because prompt was already sent project=${project.id}`);
      setStatus("Imported project Q&A is already running");
      return;
    }
    const inFlight = importedPlanningRuns.current.get(key);
    if (inFlight) {
      appendImportLog(`Imported Q&A start joined in-flight run project=${project.id}`);
      await inFlight;
      return;
    }
    const existingSessions = await loadSessionsForProject(project, projectScope);
    const existingAgent = existingSessions.find(isAgentSession);
    if (existingAgent?.command) {
      appendImportLog(`Imported Q&A recovered existing agent project=${project.id} session=${existingAgent.id}`);
      setActiveSessionId(existingAgent.id);
      setStatus("Imported project Q&A is already running");
      return;
    }
    const run = (async () => {
      appendImportLog(`Imported Q&A start requested project=${project.id}`);
      setPlanningInterviewStatus("starting");
      setPlanningActivity("Starting the planning agent");
      setPlanningWorkstream(["Starting the planning agent"]);
      openImportedPlanningWorkspace(project, projectRoute);
      const loaded = await loadProjectData(project);
      const nextSessions = await loadSessionsForProject(project, projectScope);
      const refreshedAgent = nextSessions.find(isAgentSession);
      if (refreshedAgent?.command) {
        appendImportLog(`Imported Q&A found agent after refresh project=${project.id} session=${refreshedAgent.id}`);
        setActiveSessionId(refreshedAgent.id);
        setStatus("Imported project Q&A is already running");
        return;
      }
      appendImportLog(`Imported Q&A sending prompt project=${project.id} scope=${projectScope.scope} sessions=${nextSessions.length}`);
      const session = await sendAgentPromptToProject(project, importedProjectPlanningPrompt(project), "/wiki/plans/index.mdx", projectScope, loaded.layout, nextSessions);
      appendImportLog(`Imported Q&A prompt sent session=${session.id}`);
      importedPlanningCompletedKeys.current.add(key);
      setSessions((current) => current.some((item) => item.id === session.id) ? current : [...current, session]);
      setActiveSessionId(session.id);
      setPlanningInterviewStatus("waiting_for_question");
      setPlanningActivity((current) => current || "Planning prompt sent; waiting for the first structured question");
      setPlanningWorkstream((current) => current.length ? current : ["Planning prompt sent; waiting for the first structured question"]);
      setStatus("Imported project Q&A started");
    })();
    importedPlanningRuns.current.set(key, run);
    try {
      await run;
    } catch (error) {
      appendImportLog(`Imported Q&A start failed project=${project.id}`, error);
      throw error;
    } finally {
      importedPlanningRuns.current.delete(key);
    }
  }

  function openImportedPlanningWorkspace(project: ProjectRecord, route: ViewRoute = { kind: "wiki", path: "/wiki/plans/index.mdx" }) {
    setActiveProject(project);
    setIsProjectsOpen(false);
    setRoute(route);
    window.history.pushState(null, "", urlForRoute(route, project));
  }

  async function runCommandAction(action: CommandAction, payload?: Record<string, string>) {
    setStatus(`Running ${action}`);
    try {
      if (action === "execute-main" || action === "modify") {
        await sendAgentPrompt(action === "modify" && payload?.prompt ? payload.prompt : workflowPrompt(action, workspace, currentWikiPath));
        setStatus(action === "modify" ? "Modify prompt sent" : "Execute prompt sent");
      }
      if (action === "execute-worktree") {
        const branch = payload?.branch || `feature/${slugify(workspace?.status?.current || titleForPath(currentWikiPath, wikiPages))}`;
        const result = await hyperwikiApi.json<{ branch?: string; path?: string; previewUrl?: string; project?: ProjectRecord }>(withProjectQuery("/api/worktrees", activeProject), {
          method: "POST",
          body: { branch },
        });
        await loadBaseData();
        await sendAgentPrompt(existingWorktreePrompt(workspace, currentWikiPath, result));
        setStatus(`Worktree ready: ${result.branch || branch}`);
      }
      if (action === "review" && payload?.workflowId) {
        await ensureAgentSession();
        await hyperwikiApi.json(withProjectQuery("/api/review-workflows/run", activeProject), {
          method: "POST",
          body: {
            workflowId: payload.workflowId,
            currentPage: currentWikiPath,
            scope: terminalScope.scope,
          },
        });
        setStatus("Review prompt sent");
      }
      if (action === "new-plan") {
        navigate({ kind: "plan-create" });
        setStatus("Plan creation opened");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function startPlanCreation(intent: string) {
    const trimmed = intent.trim();
    if (!trimmed) {
      setStatus("Describe what this plan should accomplish.");
      return;
    }
    setStatus("Starting plan interview");
    try {
      const projectScope = scopeForRoute({ kind: "plan-create" });
      const session = await sendAgentPromptToProject(activeProject, planCreationPrompt(activeProject, trimmed), "/wiki/plans/index.mdx", projectScope, layout, sessions);
      setActiveSessionId(session.id);
      await loadSessionsForProject(activeProject, projectScope);
      setStatus("Plan interview started");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function closeSession(sessionId: string) {
    setStatus("Closing session");
    try {
      let response = await hyperwikiApi.request(`/api/terminal/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      if (!response.ok) {
        response = await hyperwikiApi.request(withProjectQuery(`/api/sessions/${encodeURIComponent(sessionId)}`, activeProject), { method: "DELETE" });
      }
      if (!response.ok) throw new Error(response.text || `Request failed: ${response.status}`);
      await loadSessions();
      setStatus("Session closed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
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
      setActiveSessionId(restarted.session.id);
      await loadSessions();
      setStatus("Session attached");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
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

  async function createProject(input: { title: string; document: string; documentType: string; initializeGit: boolean }) {
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
          initializeGit: input.initializeGit,
          agentLaunchCommand: agentLaunchCommand(layout),
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
    openImportedPlanningWorkspace(project);
    void planImportedProject(project);
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
    throw new Error("Project was created, but Hyperwiki could not find it in the registry.");
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
    setStatus(deleteFiles ? "Project removed and files deleted" : "Project removed from Hyperwiki");
  }

  const isProjectUnavailable = hasLoadedProjects && !activeProject && !isPendingImportRoute;
  const isUtilityRoute = route.kind === "projects" || route.kind === "new-project" || route.kind === "settings" || isProjectUnavailable || isPendingImportRoute;
  const isMainPaneExpanded = isWorkspaceExpanded && !isUtilityRoute && route.kind !== "plan-create";

  useEffect(() => {
    if (!isUtilityRoute && route.kind !== "plan-create") return;
    appendImportLog(`Terminal pane hidden utility=${isUtilityRoute} route=${route.kind} activeProject=${activeProject?.id || "none"}`);
  }, [activeProject?.id, isUtilityRoute, route.kind]);

  return (
    <main className="hyperwiki-shell flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        activeProject={activeProject}
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
          isMainPaneExpanded || isUtilityRoute || route.kind === "plan-create"
            ? "grid-cols-1"
            : isImportedPlanningActive
            ? "grid-cols-[300px_minmax(420px,1fr)] max-xl:grid-cols-[260px_minmax(0,1fr)]"
            : "grid-cols-[300px_minmax(420px,1fr)_minmax(380px,0.92fr)] max-xl:grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        {isMainPaneExpanded || isUtilityRoute || route.kind === "plan-create" ? null : (
          <WikiSidebar
            currentPath={currentWikiPath}
            model={sidebarModel}
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
          onPlanImportedProject={planImportedProject}
          onRemoveProject={removeProject}
          onRunCommand={runCommandAction}
          onAnswerPlanningQuestion={answerPlanningQuestion}
          onStartPlanCreation={startPlanCreation}
          onSetSidePanelMode={setSidePanelMode}
          onToggleExpanded={() => setIsWorkspaceExpanded((value) => !value)}
          onSwitchProject={switchProject}
          planningActivity={planningActivity}
          planningWorkstream={planningWorkstream}
          lastPlanningAnswer={lastPlanningAnswer}
          pendingImportProject={isPendingImportRoute ? pendingImportProject : null}
          planningInterviewStatus={planningInterviewStatus}
          planningQuestion={activePlanningQuestion}
          projectGroups={projectGroups}
          reviewWorkflows={reviewWorkflows}
          route={route}
          settings={settings}
          wikiError={wikiError}
          wikiHtml={wikiHtml}
          wikiSource={wikiSource}
          wikiPath={currentWikiPath}
          wikiPages={wikiPages}
        />
        {isMainPaneExpanded || isUtilityRoute || route.kind === "plan-create" ? null : isImportedPlanningActive ? (
          <HeadlessTerminalListener activeProject={activeProject} onTerminalText={handleTerminalText} sessions={sessions} />
        ) : (
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
              onSelectSession={setActiveSessionId}
              onStart={startTerminal}
              onTerminalText={handleTerminalText}
              repoContext={repoContext}
              scope={terminalScope}
              workspace={workspace}
              sessions={sessions}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function TopBar(props: {
  activeProject: ProjectRecord | null;
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
  return (
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-4 border-b bg-card px-3 text-sm">
      <button className="group flex min-w-0 items-center gap-3 rounded-md px-1.5 py-1 text-left font-bold hover:bg-secondary/70" onClick={() => props.onNavigate({ kind: "wiki", path: defaultWikiPath })} type="button">
        <BrandMark />
        <span className="truncate text-xs font-bold uppercase text-muted-foreground">hyperwiki</span>
        {props.activeProject?.name ? (
          <>
            <span className="text-xs font-bold text-muted-foreground/60">|</span>
            <span className="font-ui truncate text-sm font-semibold text-foreground">{props.activeProject.name}</span>
          </>
        ) : null}
      </button>
      <div className="relative flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => props.setIsProjectsOpen(!props.isProjectsOpen)}>
          <LayoutDashboard aria-hidden="true" data-icon="inline-start" />
          Projects
        </Button>
        {props.isProjectsOpen ? <ProjectsPopover groups={props.projectGroups} onClose={() => props.setIsProjectsOpen(false)} onNavigate={props.onNavigate} onSwitchProject={props.onSwitchProject} /> : null}
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

function UpNextPopover({ workspace }: { workspace: WorkspaceResponse | null }) {
  const item = workspace?.status;
  return (
    <div className="absolute left-0 top-10 z-20 w-96 border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-bold uppercase text-muted-foreground">Current focus</div>
        <div className="font-bold">{item?.current || item?.stage || "No current task"}</div>
        {item?.currentPath ? <div className="break-all text-xs text-muted-foreground">{item.currentPath}</div> : null}
        {item?.next ? <div className="border-t pt-2 text-sm text-muted-foreground">{item.next}</div> : null}
      </div>
    </div>
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
    <div className="absolute right-0 top-11 z-20 max-h-[70vh] w-[25rem] overflow-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
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
    </div>
  );
}

interface SidebarModel {
  plans: WikiPage[];
  projectPages: WikiPage[];
}

function WikiSidebar(props: {
  currentPath: string;
  model: SidebarModel;
  onNavigate: (path: string) => void;
  route: ViewRoute;
  workspace: WorkspaceResponse | null;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-card">
      <nav className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <section className="min-h-0 flex-1 overflow-auto p-3">
          <h2 className="mb-2 px-1 text-xs font-bold uppercase text-muted-foreground">Plans</h2>
          <PlanTree pages={props.model.plans} currentPath={props.currentPath} onNavigate={props.onNavigate} workspace={props.workspace} />
        </section>
        <details className="border-t bg-card p-3" open={false}>
          <summary className="cursor-pointer list-none text-xs font-bold uppercase text-muted-foreground">Project</summary>
          <div className="mt-2 grid gap-1">
            {props.model.projectPages.map((page) => (
              <SidebarPageButton currentPath={props.currentPath} depth={0} key={page.path} onNavigate={props.onNavigate} page={page} />
            ))}
          </div>
        </details>
      </nav>
    </aside>
  );
}

function PlanTree({ pages, currentPath, onNavigate, workspace }: { pages: WikiPage[]; currentPath: string; onNavigate: (path: string) => void; workspace: WorkspaceResponse | null }) {
  const sorted = [...pages].sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  const roots = sorted.filter((page) => isTopLevelPlanPage(page) && !isCompletedTopLevelPlanPage(page));
  const currentPlanPath = currentPlanWorkPath(sorted, roots, workspace);
  if (!roots.length) return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No plan pages.</div>;
  return (
    <div className="grid gap-1">
      {roots.map((page) => (
        <PlanNode currentPath={currentPath} currentWorkPath={currentPlanPath} key={page.path} onNavigate={onNavigate} page={page} pages={sorted} />
      ))}
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
  return (
    <div
      className={cn(
        "grid min-h-10 min-w-0 grid-cols-[1rem_0.625rem_minmax(0,1fr)] items-center gap-1.5 rounded-md py-1.5 pe-2 text-sm transition-colors",
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
      <span className={cn("mx-auto size-2 shrink-0 rounded-full", current ? "bg-[#25a244] shadow-[0_0_0_3px_rgba(37,162,68,0.14)]" : "bg-transparent")} />
      <button
        className="min-w-0 truncate text-left font-bold"
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
  activeProject: ProjectRecord | null;
  hasLoadedProjects: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; initializeGit: boolean }) => Promise<ProjectRecord | void>;
  onNavigate: (route: ViewRoute) => void;
  onAnswerPlanningQuestion: (answer: string) => Promise<void>;
  onPlanImportedProject: (project: ProjectRecord) => Promise<void>;
  onRemoveProject: (project: ProjectRecord, deleteFiles: boolean) => Promise<void>;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onSetSidePanelMode: (mode: "modify" | "new-plan") => void;
  onStartPlanCreation: (intent: string) => Promise<void>;
  onToggleExpanded: () => void;
  onSwitchProject: (project: ProjectRecord) => void;
  planningActivity: string;
  planningWorkstream: string[];
  lastPlanningAnswer: string;
  pendingImportProject: ProjectRecord | null;
  planningInterviewStatus: "idle" | "starting" | "waiting_for_question" | "question_ready" | "answering";
  planningQuestion: PlanningQuestion | null;
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
    return <SettingsView activeProject={props.activeProject} settings={props.settings} />;
  }
  if (props.route.kind === "plan-create") {
    return <PlanCreationView activeProject={props.activeProject} isImportedFirstPlan={hasImportedSource(props.wikiPages) && !hasGeneratedPlanPages(props.wikiPages)} onCancel={() => props.onNavigate({ kind: "wiki", path: "/wiki/plans/index.mdx" })} onStart={props.onStartPlanCreation} />;
  }
  if (props.pendingImportProject) {
    return <PendingImportView project={props.pendingImportProject} />;
  }
  if (props.hasLoadedProjects && !props.activeProject) {
    return <NewProjectView isFirstProject={isFirstProject} onCreateProject={props.onCreateProject} />;
  }
  if (isImportedPlanningIntakeRoute(props.route, props.wikiPages)) {
    return (
      <ImportedPlanningQAView
        activeProject={props.activeProject}
        activity={props.planningActivity}
        workstream={props.planningWorkstream}
        lastAnswer={props.lastPlanningAnswer}
        onAnswer={props.onAnswerPlanningQuestion}
        onStart={() => props.activeProject ? props.onPlanImportedProject(props.activeProject) : Promise.resolve()}
        question={props.planningQuestion}
        status={props.planningInterviewStatus}
      />
    );
  }
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-12 shrink-0 items-center justify-between border-b bg-card px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate text-xs font-bold uppercase">{titleForPath(props.wikiPath, props.wikiPages).replace(/\.[^.]+$/, "")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label={props.isExpanded ? "Restore sidebars" : "Expand document"}
            size="sm"
            variant="outline"
            onClick={props.onToggleExpanded}
          >
            {props.isExpanded ? <Minimize2 aria-hidden="true" data-icon="inline-start" /> : <Maximize2 aria-hidden="true" data-icon="inline-start" />}
            {props.isExpanded ? "restore" : "expand"}
          </Button>
          <CommandBar onRunCommand={props.onRunCommand} onSetSidePanelMode={props.onSetSidePanelMode} reviewWorkflows={props.reviewWorkflows} wikiPath={props.wikiPath} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {props.isLoading ? (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b bg-card px-3 py-2 text-xs text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading wiki page
          </div>
        ) : null}
        {props.wikiError ? (
          <WikiErrorState error={props.wikiError} onNewProject={() => props.onNavigate({ kind: "new-project" })} onProjects={() => props.onNavigate({ kind: "projects" })} />
        ) : props.wikiSource && isReactRenderedPlanPath(props.wikiPath) ? (
          <MdxPlanRenderer
            markdown={props.wikiSource.markdown}
            onNavigate={(path) => props.onNavigate({ kind: "wiki", path })}
            path={props.wikiPath}
            source={props.wikiSource.source}
          />
        ) : (
          <iframe className="size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={embeddedWikiHtml(props.wikiHtml)} title="Wiki page" />
        )}
      </div>
    </section>
  );
}

function WikiErrorState({ error, onNewProject, onProjects }: { error: string; onNewProject: () => void; onProjects: () => void }) {
  const missing = isMissingFileError(error);
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="flex max-w-lg flex-col items-center gap-4 text-center">
        <div className="grid size-12 place-items-center rounded-md border bg-card">
          <FolderOpen aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
        <div className="grid gap-2">
          <h2 className="font-ui m-0 text-2xl font-bold">{missing ? "Project files are unavailable" : "Wiki page unavailable"}</h2>
          <p className="m-0 text-sm text-muted-foreground">
            {missing ? "The selected project points to files that no longer exist. Pick another project or create a new one." : "Hyperwiki could not load this wiki page."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onProjects}>Projects</Button>
          <Button variant="outline" onClick={onNewProject}>New Project</Button>
        </div>
      </div>
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
  onRunCommand,
  onSetSidePanelMode,
  reviewWorkflows,
  wikiPath,
}: {
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onSetSidePanelMode: (mode: "modify" | "new-plan") => void;
  reviewWorkflows: ReviewWorkflow[];
  wikiPath: string;
}) {
  const [mode, setMode] = useState<"closed" | "worktree" | "new-plan" | "review">("closed");
  const [branch, setBranch] = useState(`feature/${slugify(wikiPath)}`);
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");
  const [planType, setPlanType] = useState("feature");

  useEffect(() => {
    setBranch(`feature/${slugify(wikiPath)}`);
  }, [wikiPath]);

  return (
    <div className="relative flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onRunCommand("new-plan")}
      >
        + plan
      </Button>
      <Button size="sm" variant="outline" onClick={() => onSetSidePanelMode("modify")}>
        modify
      </Button>
      <Button size="sm" onClick={() => onRunCommand("execute-main")}>
        execute
      </Button>
      <Button size="sm" variant="outline" onClick={() => setMode(mode === "worktree" ? "closed" : "worktree")}>
        run dev
      </Button>
      {mode !== "closed" ? (
        <div className="absolute right-0 top-10 z-20 w-[28rem] border bg-popover p-3 text-popover-foreground shadow-lg">
          {mode === "worktree" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                onRunCommand("execute-worktree", { branch });
                setMode("closed");
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">Branch</span>
                <input className="border bg-background px-2 py-2" onChange={(event) => setBranch(event.target.value)} value={branch} />
              </label>
              <Button type="submit">
                <GitBranch aria-hidden="true" data-icon="inline-start" />
                Create Worktree And Execute
              </Button>
            </form>
          ) : null}
          {mode === "review" ? (
            <div className="flex flex-col gap-2">
              {reviewWorkflows.length ? (
                reviewWorkflows.map((workflow) => (
                  <button
                    className="grid gap-1 rounded-md border bg-background p-2 text-left text-sm hover:bg-secondary"
                    key={workflow.id}
                    onClick={() => {
                      onRunCommand("review", { workflowId: workflow.id });
                      setMode("closed");
                    }}
                    type="button"
                  >
                    <span className="font-bold">{workflow.label}</span>
                    <span className="text-xs text-muted-foreground">{workflow.description}</span>
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No review workflows available.</div>
              )}
            </div>
          ) : null}
          {mode === "new-plan" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                onRunCommand("new-plan", { title, intent, planType });
                setMode("closed");
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">Title</span>
                <input className="border bg-background px-2 py-2" onChange={(event) => setTitle(event.target.value)} value={title} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">Intent</span>
                <textarea className="min-h-24 border bg-background px-2 py-2" onChange={(event) => setIntent(event.target.value)} value={intent} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-bold">Type</span>
                <select className="border bg-background px-2 py-2" onChange={(event) => setPlanType(event.target.value)} value={planType}>
                  <option value="feature">feature</option>
                  <option value="refactor">refactor</option>
                  <option value="fix">fix</option>
                </select>
              </label>
              <Button type="submit">
                <Plus aria-hidden="true" data-icon="inline-start" />
                Create Plan
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlanCreationView({
  activeProject,
  isImportedFirstPlan = false,
  onCancel,
  onStart,
}: {
  activeProject: ProjectRecord | null;
  isImportedFirstPlan?: boolean;
  onCancel: () => void;
  onStart: (intent: string) => Promise<void>;
}) {
  const [intent, setIntent] = useState(isImportedFirstPlan ? "Create the first MVP plan from the imported source." : "");
  const [isStarting, setIsStarting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsStarting(true);
    try {
      await onStart(intent);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="grid min-h-0 bg-background antialiased">
      <section className="mx-auto flex min-h-0 w-full max-w-4xl flex-col gap-6 px-8 py-8">
        <header className="flex items-start justify-between gap-4 pb-2">
          <div className="grid gap-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan creation</p>
            <h1 className="font-ui m-0 text-4xl font-semibold leading-tight text-balance">Create New Plan</h1>
            <p className="m-0 max-w-2xl text-base leading-7 text-muted-foreground text-pretty">
              {isImportedFirstPlan
                ? "Hyperwiki will use the imported source as the planning brief, start a focused Q&A, then write the first MVP plan when the blocking decisions are clear."
                : "Hyperwiki will start a focused Q&A, inspect the repo and wiki, then write plan docs when the blocking decisions are clear."}
            </p>
          </div>
          <Button className="min-h-10 active:scale-[0.96] transition-transform" variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
        </header>
        <form className="grid gap-5 rounded-lg bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.05)]" onSubmit={submit}>
          {!isImportedFirstPlan ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold">Planning focus</span>
              <textarea
                className="min-h-[180px] rounded-md bg-background p-4 text-sm leading-6 outline-none shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-shadow focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--ring)),0_0_0_3px_hsl(var(--ring)/0.18)]"
                onChange={(event) => setIntent(event.target.value)}
                placeholder="Feature, workflow, refactor, research track, or product change..."
                value={intent}
              />
            </label>
          ) : (
            <div className="grid gap-3 rounded-md bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))]">
              <h2 className="m-0 text-lg font-semibold">Imported source detected</h2>
              <p className="m-0 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
                This is the first plan for {activeProject?.name || "this project"}, so Hyperwiki will create an MVP plan from the imported source after the Q&A resolves open decisions.
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={isStarting || !activeProject} type="submit">
              {isStarting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Play aria-hidden="true" data-icon="inline-start" />}
              Start Q&A
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

function ImportedPlanningQAView({
  activeProject,
  activity,
  workstream,
  lastAnswer,
  onAnswer,
  onStart,
  question,
  status,
}: {
  activeProject: ProjectRecord | null;
  activity: string;
  workstream: string[];
  lastAnswer: string;
  onAnswer: (answer: string) => Promise<void>;
  onStart: () => Promise<void>;
  question: PlanningQuestion | null;
  status: "idle" | "starting" | "waiting_for_question" | "question_ready" | "answering";
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedOption, setSelectedOption] = useState("");
  const [otherAnswer, setOtherAnswer] = useState("");
  const hasStartedRef = useRef("");
  const otherAnswerRef = useRef<HTMLTextAreaElement | null>(null);

  async function start() {
    if (hasStarted) return;
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
    setSelectedOption("");
    setOtherAnswer("");
  }, [question?.id]);

  async function submitAnswer(answer: string) {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setIsAnswering(true);
    try {
      await onAnswer(trimmed);
      setSelectedOption("");
      setOtherAnswer("");
    } finally {
      setIsAnswering(false);
    }
  }

  const canSubmitOther = Boolean(otherAnswer.trim()) && !isAnswering;
  const title = "Planning Q&A";
  const waitingLabel = lastAnswer ? "Waiting for next question..." : "Waiting for first question...";
  const description = "Answer questions and make important decisions to create your project.";

  return (
    <main className="grid min-h-0 place-items-start overflow-auto bg-background px-8 pt-12 antialiased">
      <section className="mt-2 grid w-full max-w-3xl gap-5 rounded-lg bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_42px_rgba(0,0,0,0.06)]">
        <div className="grid gap-3">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creating project</p>
          <h1 className="font-ui m-0 text-4xl font-semibold leading-tight text-balance">{title}</h1>
          <p className="m-0 text-base leading-7 text-muted-foreground text-pretty">{description}</p>
        </div>
        {question ? (
          <div className="grid gap-4 rounded-md border bg-background p-4">
            <div className="grid gap-2">
              <h2 className="font-ui m-0 text-xl font-semibold leading-snug">{question.question}</h2>
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
                  const selected = selectedOption === option;
                  return (
                    <button
                      className={cn(
                        "flex min-h-11 items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-secondary",
                        selected && "border-primary bg-secondary text-secondary-foreground",
                      )}
                      disabled={isAnswering}
                      key={`${question.id}:${index}:${option}`}
                      onClick={() => {
                        setSelectedOption(option);
                        void submitAnswer(option);
                      }}
                      type="button"
                    >
                      <span>{option}</span>
                      {index === 0 ? <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">recommended</span> : null}
                    </button>
                  );
                })}
                <button
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 rounded-md border border-dashed bg-card px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-secondary",
                    selectedOption === "__other__" && "border-primary bg-secondary text-secondary-foreground",
                  )}
                  disabled={isAnswering}
                  onClick={() => {
                    setSelectedOption("__other__");
                    window.setTimeout(() => otherAnswerRef.current?.focus(), 0);
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
                void submitAnswer(otherAnswer);
              }}
            >
              <label className="text-sm font-semibold" htmlFor="planning-other-answer">Other</label>
              <textarea
                className="min-h-24 rounded-md border bg-card px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="planning-other-answer"
                onChange={(event) => setOtherAnswer(event.target.value)}
                placeholder="None of the above. Use this instead..."
                ref={otherAnswerRef}
                value={otherAnswer}
              />
              <div className="flex justify-end">
                <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={!canSubmitOther} type="submit">
                  {isAnswering ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
                  Send Other
                </Button>
              </div>
            </form>
          </div>
        ) : null}
        {!question && (status === "starting" || status === "waiting_for_question" || status === "answering" || isStarting) ? (
          <div className="grid gap-3 rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              <span>{waitingLabel}</span>
            </div>
            <div className="max-h-64 min-h-32 overflow-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-5 text-secondary-foreground shadow-inner">
              {workstream.length ? (
                workstream.map((line, index) => <p className="m-0 whitespace-pre-wrap" key={`${index}:${line}`}>{line}</p>)
              ) : (
                <p className="m-0 whitespace-pre-wrap">{activity || "Starting the planning agent..."}</p>
              )}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={isStarting || hasStarted || !activeProject || status !== "idle"} onClick={start} type="button">
            {isStarting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Play aria-hidden="true" data-icon="inline-start" />}
            {isStarting ? "Starting Q&A" : hasStarted || status !== "idle" ? "Q&A Running" : "Start Q&A"}
          </Button>
        </div>
      </section>
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
    <section className="min-h-0 overflow-auto bg-background">
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
          <div className="col-span-full flex min-h-[22rem] max-w-2xl flex-col justify-center rounded-md border bg-card p-8">
            <h2 className="m-0 text-3xl font-bold">No projects yet</h2>
            <p className="m-0 mt-3 text-sm text-muted-foreground">Create a fresh Hyperwiki project from a brief to start the workspace.</p>
            <Button className="mt-6 w-fit min-h-11 px-5" onClick={onNewProject}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              New Project
            </Button>
          </div>
        )}
      </div>
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
    setRemoveStatus(deleteFiles ? "Deleting project files..." : "Removing project...");
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
    <article className={cn("flex min-h-[23rem] flex-col rounded-md border bg-card p-5", isActive && "border-primary/45 ring-1 ring-primary/25")}>
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
          » Open Project
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
              Removing this {checkoutCount > 1 ? "checkout" : "project"} only forgets it in Hyperwiki. File deletion permanently deletes the {checkoutCount > 1 ? "checkout" : "project"} folder.
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
              {isRemoving ? (deleteFiles ? "Deleting..." : "Removing...") : deleteFiles ? "Confirm Delete" : "Confirm Remove"}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ProjectDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-3">
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
    <section className="flex min-h-0 items-center justify-center bg-background p-8">
      <div className="grid max-w-md gap-3 text-center">
        <Loader2 aria-hidden="true" className="mx-auto size-5 animate-spin text-muted-foreground" />
        <h1 className="font-ui m-0 text-2xl font-bold">Opening {project.name}</h1>
        <p className="m-0 text-sm text-muted-foreground">Waiting for the imported project to appear in the local registry.</p>
      </div>
    </section>
  );
}

function NewProjectView({
  isFirstProject = false,
  onCreateProject,
}: {
  isFirstProject?: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; initializeGit: boolean }) => Promise<ProjectRecord | void>;
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

  async function handleFile(file: File | null) {
    if (!file) return;
    clearImportLog();
    setImportLog([]);
    setIsSubmitting(true);
    setStatus(`Reading ${file.name}...`);
    logImport(`Reading ${file.name}`);
    try {
      const text = await file.text();
      logImport(`Read ${text.length} bytes from ${file.name}`);
      const nextType = file.name.toLowerCase().match(/\.html?$/) ? "html" : "markdown";
      const nextTitle = title || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setDocument(text);
      setDocumentType(nextType);
      setTitle(nextTitle);
      await createProjectAndStartPlanning({
        title: nextTitle.trim(),
        document: text.trim(),
        documentType: nextType,
        initializeGit,
      });
    } catch (error) {
      logImport("Hyperwiki import failed while reading the selected file.", error);
      setStatus(error instanceof Error ? `Could not read import file: ${error.message}` : "Could not read the import file.");
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

  async function createProjectAndStartPlanning(input: { title: string; document: string; documentType: string; initializeGit: boolean }) {
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
    setStatus("Initializing project...");
    logImport(`Handoff view set for ${pendingProject.projectSlug}/${pendingProject.worktreeSlug}`);
    logImport("Creating imported project");
    const fallbackTimer = window.setTimeout(routeToWorkspace, 900);
    void onCreateProject(input)
      .then((project) => {
        if (!project) return;
        window.clearTimeout(fallbackTimer);
        setHandoffProject(project);
        setStatus("Project imported. Opening planning workspace...");
        logImport(`Created project ${project.name} (${project.id})`);
        routeToWorkspace(project);
      })
      .catch((error) => {
        window.clearTimeout(fallbackTimer);
        setHandoffProject(null);
        logImport("Hyperwiki import agent handoff failed.", error);
        setStatus(error instanceof Error ? error.message : "Could not start agent-led planning.");
      });
  }

  if (handoffProject) {
    return (
      <section className="flex min-h-0 items-center justify-center bg-background p-8">
        <div className="grid max-w-md gap-3 text-center">
          <Loader2 aria-hidden="true" className="mx-auto size-5 animate-spin text-muted-foreground" />
          <h1 className="font-ui m-0 text-2xl font-bold">Opening {handoffProject.name}</h1>
          <p className="m-0 text-sm text-muted-foreground">Switching to the planning workspace and starting the agent.</p>
        </div>
      </section>
    );
  }

  const heading = isFirstProject ? "Welcome to HyperWiki" : "New Project";
  const subhead = isFirstProject
    ? "Create your first project by importing a brief or source file. HyperWiki will do the rest."
    : "Import a brief or source file. HyperWiki will do the rest.";
  const canSubmitBrief = Boolean(title.trim() && document.trim());

  return (
    <section className="min-h-0 overflow-auto bg-background px-5 py-10 md:px-10 md:py-14">
      <div className="mx-auto grid w-full max-w-[60rem] gap-9">
        <header className="px-1">
          <h1 className="font-ui m-0 text-5xl font-bold leading-none tracking-normal text-balance text-foreground">{heading}</h1>
          <p className="m-0 mt-3 text-lg leading-8 text-muted-foreground text-pretty">
            {subhead}
          </p>
        </header>

        <form className="grid gap-6 rounded-lg bg-card p-8 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_24px_72px_rgba(0,0,0,0.08)] md:p-10" data-testid="new-project-form" onSubmit={handleSubmit}>
          <label className="group flex min-h-44 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-primary/45 bg-background px-6 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
            <Upload aria-hidden="true" className="mb-5 size-11 text-primary transition-transform group-hover:-translate-y-0.5" />
            <span className="rounded-md bg-primary px-5 py-2.5 text-base font-bold text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.10),0_8px_22px_rgba(0,0,0,0.10)] transition-transform group-active:scale-[0.96]">Import Project File</span>
            <small className="mt-3 text-base text-muted-foreground">Markdown or HTML</small>
            <input className="sr-only" data-testid="project-file-input" type="file" accept=".md,.markdown,.mdx,.html,.htm,text/markdown,text/html,text/plain" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
          </label>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-sm font-bold uppercase text-muted-foreground" aria-hidden="true">
            <span className="h-px bg-border" />
            <span>OR</span>
            <span className="h-px bg-border" />
          </div>

          <label className="grid gap-2">
            <span className="text-base font-bold text-card-foreground">Project Name</span>
            <input className="min-h-14 rounded-md border bg-background px-4 text-base outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring" autoComplete="off" placeholder="Enter project name..." required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="grid gap-2">
            <span className="text-base font-bold text-card-foreground">Brief</span>
            <textarea className="min-h-[9rem] resize-y rounded-md border bg-background p-4 text-base leading-7 outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring" placeholder="Enter project brief..." required value={document} onChange={(event) => setDocument(event.target.value)} />
          </label>

          <label className="flex min-h-10 items-center gap-3 text-base text-card-foreground">
            <input className="size-5 accent-primary" checked={initializeGit} type="checkbox" onChange={(event) => setInitializeGit(event.target.checked)} />
            <span>Initialize Git and create an initial commit</span>
          </label>

          <Button className="min-h-14 w-full text-base active:scale-[0.96] transition-transform" disabled={isSubmitting || !canSubmitBrief} type="submit">
            {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Sparkles aria-hidden="true" data-icon="inline-start" />}
            {isSubmitting ? "Starting Agent Planning..." : "Start Agent Planning"}
          </Button>

          {status ? <p className="m-0 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground" role="status">{status}</p> : null}
          <ImportLog lines={importLog} />
        </form>
      </div>
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
    <section className="mt-4 rounded-md border bg-background p-3">
      <h3 className="m-0 text-xs font-bold uppercase text-muted-foreground">Import Log</h3>
      <ol className="m-0 mt-2 grid gap-1 p-0 text-xs text-muted-foreground">
        {lines.map((line, index) => (
          <li className="list-none break-words" key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </section>
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

function SettingsView({ activeProject, settings }: { activeProject: ProjectRecord | null; settings: SettingsResponse | null }) {
  const [draft, setDraft] = useState<SettingsResponse | null>(settings);
  const [mode, setMode] = useState<"overview" | "theme" | "agent">("overview");
  const [themeDraft, setThemeDraft] = useState<SettingsResponse["theme"] | null>(settings?.theme || null);
  const [agentDraft, setAgentDraft] = useState<{ soul: SettingsResponse["soul"]; memory: SettingsResponse["memory"] } | null>(null);
  const [agentsFile, setAgentsFile] = useState<{ path: string; content: string }>({ path: "", content: "" });
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraft(settings);
    setThemeDraft(settings?.theme || null);
  }, [settings]);

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

  async function save(next: SettingsResponse) {
    setStatus("Saving...");
    try {
      const saved = await hyperwikiApi.json<SettingsResponse>("/api/settings", { method: "PUT", body: next });
      applyAppTheme(saved.theme);
      setDraft(saved);
      setThemeDraft(saved.theme || null);
      setStatus("Saved.");
      return saved;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save settings.");
      return null;
    }
  }

  function openThemeEditor() {
    setThemeDraft(structuredClone(draft?.theme || {}));
    setMode("theme");
    setStatus("");
  }

  function openAgentEditor() {
    setAgentDraft({ soul: structuredClone(draft?.soul || {}), memory: structuredClone(draft?.memory || { entries: [] }) });
    setMode("agent");
    setStatus("");
  }

  async function saveTheme() {
    if (!draft || !themeDraft) return;
    const saved = await save({ ...draft, theme: themeDraft });
    if (saved) setMode("overview");
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

  if (!draft) {
    return (
      <section className="min-h-0 overflow-auto bg-background">
        <SettingsPageHeader title="Settings" description="Control global theme and agent instructions." />
        <div className="m-8 border bg-card p-4 text-sm text-muted-foreground">Settings are unavailable.</div>
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
      <section className="min-h-0 overflow-auto bg-background">
        <SettingsPageHeader
          actions={<><Button variant="outline" onClick={() => { setThemeDraft(draft.theme || null); setMode("overview"); }}>Cancel</Button><Button onClick={saveTheme}>Save Theme</Button></>}
          description="Adjust a draft theme and preview it here. The workspace updates after Save."
          fontFamily={editTheme.tokens.docs?.serifFont}
          title="Edit Theme"
        />
        <div className="grid min-w-0 gap-4 p-8">
          <ThemePresetCard large presetKey={editableTheme.activePreset || "custom"} theme={editTheme} />
          <ThemePresetStrip activePreset={editableTheme.activePreset || ""} onSelect={(key) => setThemeDraft(selectThemePreset(editableTheme, key))} presets={presets} />
          <div className="grid grid-cols-[minmax(360px,0.55fr)_minmax(420px,1fr)] gap-4 max-lg:grid-cols-1">
            <section className="rounded-md border bg-card p-4">
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
                <SelectField label="Sidebar" value={editTheme.tokens.ui?.sidebarFont === editTheme.tokens.docs?.serifFont ? "body" : "mono"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "ui", "sidebarFont", value === "body" ? editTheme.tokens.docs?.serifFont || "Work Sans, sans-serif" : editTheme.tokens.docs?.monoFont || "Space Mono, monospace"))} options={[["body", "Body copy font"], ["mono", "Mono font"]]} />
                <SelectField label="Mono Font" value={editTheme.tokens.docs?.monoFont || "Space Mono, monospace"} onChange={(value) => setThemeDraft(updateThemeToken(updateThemeToken(editableTheme, "docs", "monoFont", value), "terminal", "font", value))} options={[["Space Mono, monospace", "Space Mono"], ["IBM Plex Mono, monospace", "IBM Plex Mono"], ["Fira Code, monospace", "Fira Code"], ["Roboto Mono, monospace", "Roboto Mono"]]} />
                <SelectField label="Terminal Mode" value={editTheme.tokens.terminal?.mode || "dark"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "terminal", "mode", value))} options={[["dark", "Dark"], ["light", "Light"], ["match", "Match UI"]]} />
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-bold uppercase text-muted-foreground">Advanced JSON</summary>
                <textarea className="mt-2 min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs" value={JSON.stringify(themeDraft, null, 2)} onChange={(event) => { try { setThemeDraft(JSON.parse(event.target.value)); setStatus(""); } catch { setStatus("Theme JSON is not valid."); } }} />
              </details>
            </section>
            <section className="grid rounded-md border bg-card p-6">
              <div className="grid grid-cols-[190px_1fr] gap-8">
                <div className="border-r pr-6 font-ui">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Plans</p>
                  <p className="mt-3 text-sm">Stage-08 Settings, Soul...</p>
                  <p className="mt-3 text-sm">Unit 02 - Theme System</p>
                </div>
                <div style={{ fontFamily: editTheme.tokens.docs?.serifFont }}>
                  <h2 className="text-4xl">Planning Preview</h2>
                  <p className="mt-4 max-w-xl text-2xl text-muted-foreground">Docs keep their reading voice while the UI stays dense and scannable.</p>
                  <code className="mt-5 inline-block bg-muted px-2 py-1 font-mono text-sm">wiki/plans/mvp/stage-08-settings-soul-memory.mdx</code>
                </div>
              </div>
            </section>
          </div>
        </div>
        <SettingsStatus status={status} />
      </section>
    );
  }

  if (mode === "agent") {
    const editableAgent = agentDraft || { soul: draft.soul || {}, memory: draft.memory || { entries: [] } };
    return (
      <section className="min-h-0 overflow-auto bg-background">
        <SettingsPageHeader
          actions={<><Button variant="outline" onClick={() => { setAgentDraft(null); setMode("overview"); }}>Cancel</Button><Button onClick={saveAgentInstructions}>Save Agent Instructions</Button></>}
          description="Saving updates global instructions and syncs the current project AGENTS.md."
          fontFamily={theme.tokens.docs?.serifFont}
          title="Edit Agent Instructions"
        />
        <div className="grid gap-4 p-8">
          <div className="grid grid-cols-[minmax(360px,0.78fr)_minmax(320px,1fr)] gap-4 max-lg:grid-cols-1">
            <section className="rounded-md border bg-card p-4">
              <TextareaField label="Principles" value={(editableAgent.soul?.principles || []).join("\n")} rows={8} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), principles: value.split("\n").map((line) => line.trim()).filter(Boolean) } })} />
              <TextareaField label="Interface Guidance" value={editableAgent.soul?.interface || ""} rows={5} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), interface: value } })} />
              <TextareaField label="Agent Guidance" value={editableAgent.soul?.agent || ""} rows={5} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), agent: value } })} />
            </section>
            <section className="rounded-md border bg-card p-4">
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
                )) : <p className="text-sm text-muted-foreground">No memory entries added yet...</p>}
              </div>
            </section>
          </div>
          <section className="rounded-md border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold uppercase">AGENTS.md</h2>
              <span className="truncate text-xs text-muted-foreground">{agentsFile.path || "AGENTS.md"}</span>
            </div>
            <textarea className="min-h-[360px] w-full rounded-md border bg-background p-4 font-mono text-xs leading-relaxed" value={agentsFile.content} onChange={(event) => setAgentsFile({ ...agentsFile, content: event.target.value })} />
          </section>
        </div>
        <SettingsStatus status={status} />
      </section>
    );
  }

  return (
    <section className="min-h-0 overflow-auto bg-background">
      <SettingsPageHeader title="Settings" description="Control global theme and agent instructions." fontFamily={theme.tokens.docs?.serifFont} />
      <div className="grid grid-cols-[minmax(480px,1.18fr)_minmax(340px,0.82fr)] gap-5 p-8 max-lg:grid-cols-1">
        <section className="rounded-md border bg-card p-4">
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
        </section>
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase">Agent Instructions</h2>
            <Button variant="outline" onClick={openAgentEditor}>Edit</Button>
          </div>
          <div className="grid gap-3">
            <AgentSummaryCard title="Soul" meta={`${soul.principles?.length || 0} principles`} lines={(soul.principles || []).slice(0, 3)} />
            <AgentSummaryCard title="Agent" meta="Guidance" lines={[soul.agent || "No agent guidance recorded."]} />
            <AgentSummaryCard title="Memory" meta={`${overviewMemory.filter((entry) => entry.enabled !== false && (entry.title || entry.content)).length} enabled`} lines={overviewMemory.filter((entry) => entry.enabled !== false && (entry.title || entry.content)).slice(0, 3).map((entry) => entry.title || entry.content || "")} />
          </div>
        </section>
      </div>
      <SettingsStatus status={status} />
    </section>
  );
}

function SettingsPageHeader({ actions, description, fontFamily, title }: { actions?: ReactNode; description: string; fontFamily?: string; title: string }) {
  return (
    <header className="flex min-h-36 items-start justify-between gap-6 bg-muted/20 px-8 py-10">
      <div>
        <h1 className="m-0 text-5xl font-bold leading-none tracking-normal" style={{ fontFamily }}>{title}</h1>
        <p className="m-0 mt-3 text-base text-muted-foreground" style={{ fontFamily }}>{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pt-10">{actions}</div> : null}
    </header>
  );
}

function SettingsStatus({ status }: { status: string }) {
  if (!status) return null;
  return <p className="px-8 pb-6 text-sm text-muted-foreground" role="status">{status}</p>;
}

function ThemeSurfaceSummary({ description, fontKeys, label, tokens }: { description: string; fontKeys: Array<[string, string]>; label: string; tokens?: Record<string, string> }) {
  return (
    <article className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 rounded-md border bg-background p-4">
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
    </article>
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
    <article className="rounded-md border bg-background p-3">
      <header className="mb-2 flex items-center justify-between gap-3">
        <strong>{title}</strong>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </header>
      <ul className="m-0 grid gap-1 pl-5 text-sm text-muted-foreground">
        {(values.length ? values : ["No entries added yet..."]).map((line, index) => <li key={index}>{line}</li>)}
      </ul>
    </article>
  );
}

function ThemePresetStrip({ activePreset, onSelect, presets }: { activePreset: string; onSelect: (key: string) => void; presets: Record<string, ThemePreset> }) {
  const entries = Object.entries(presets);
  if (!entries.length) return null;
  return (
    <section className="min-w-0 overflow-hidden rounded-md border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 text-xs font-bold uppercase text-muted-foreground">Presets</h2>
        <span className="truncate text-xs text-muted-foreground">Choosing a preset resets custom edits.</span>
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
                <strong className="block truncate text-sm">{theme.label || key}</strong>
                <span className="block truncate text-xs text-muted-foreground">{key}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
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
              <em className="block truncate text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog...</em>
            </span>
            <span>
              <small className="block text-xs font-bold uppercase text-muted-foreground">Mono</small>
              <b className="block truncate text-3xl" style={{ fontFamily: theme.tokens.docs?.monoFont }}>AaBbCcDdEeFfGgHhIiJjKkLlMm</b>
              <em className="block truncate text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog...</em>
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

function TextareaField({ label, onChange, rows, value }: { label: string; onChange: (value: string) => void; rows: number; value: string }) {
  return (
    <label className="mb-4 grid gap-2 text-xs font-bold uppercase text-muted-foreground">
      {label}
      <textarea className="w-full rounded-md border bg-background p-3 font-mono text-sm font-normal normal-case text-foreground" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MemoryEditor({ entry, index, onChange, onRemove }: { entry: MemoryEntry; index: number; onChange: (entry: MemoryEntry) => void; onRemove: () => void }) {
  return (
    <article className="grid gap-2 rounded-md border bg-background p-3">
      <input className="rounded-md border bg-card px-3 py-2 text-sm" placeholder={`Memory ${index + 1}`} value={entry.title || ""} onChange={(event) => onChange({ ...entry, title: event.target.value })} />
      <textarea className="min-h-20 rounded-md border bg-card px-3 py-2 text-sm" placeholder="Memory" value={entry.content || ""} onChange={(event) => onChange({ ...entry, content: event.target.value })} />
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
    "--secondary-foreground": foreground,
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--accent": accent,
    "--accent-foreground": readableTextOn(accent),
    "--border": border,
    "--input": border,
    "--ring": accent,
    "--docs-serif-font": primaryFont,
    "--docs-mono-font": monoFont,
    "--terminal-font": terminalFont,
    "--sidebar-font": cssFontValue(ui.sidebarFont, primaryFont),
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
  if (preset?.label === "Signal" && docs.serifFont) {
    ui.sidebarFont = docs.serifFont;
  }
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
## HyperWiki Global Context

### Soul

${principles.length ? principles.map((item) => `- ${item}`).join("\n") : "- No global soul principles recorded."}

Interface guidance: ${soul.interface || "Use HyperWiki's default interface guidance."}

Agent guidance: ${soul.agent || "Use HyperWiki's default agent guidance."}

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

function RightActionPane({
  mode,
  onRunCommand,
  onSetMode,
  status,
}: {
  mode: "modify" | "new-plan";
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onSetMode: (mode: "modify" | "new-plan") => void;
  status: string;
}) {
  const [modifyText, setModifyText] = useState("");
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");

  return (
    <aside className="min-h-0 overflow-auto border-l bg-background p-8 max-xl:hidden">
      <section className="rounded-lg border bg-card p-8 shadow-[0_18px_44px_rgba(32,35,31,0.08)]">
        <div className="mb-5 flex items-center gap-2">
          <button
            className={cn("rounded-md border px-3 py-1.5 text-sm font-bold", mode === "modify" ? "bg-foreground text-background" : "bg-background")}
            onClick={() => onSetMode("modify")}
            type="button"
          >
            Modify
          </button>
          <button
            className={cn("rounded-md border px-3 py-1.5 text-sm font-bold", mode === "new-plan" ? "bg-foreground text-background" : "bg-background")}
            onClick={() => onSetMode("new-plan")}
            type="button"
          >
            New Plan
          </button>
        </div>
        {mode === "modify" ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              onRunCommand("modify", { prompt: modifyText });
            }}
          >
            <h1 className="m-0 text-3xl font-bold">Modify Page</h1>
            <textarea
              className="min-h-[340px] rounded-md border bg-background p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setModifyText(event.target.value)}
              placeholder="Describe how the agent should revise this page..."
              value={modifyText}
            />
            <Button className="min-h-12 w-full" type="submit">
              <Play aria-hidden="true" data-icon="inline-start" />
              Send
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onRunCommand("new-plan", { title, intent, planType: "feature" });
            }}
          >
            <h1 className="m-0 text-3xl font-bold">Create Plan</h1>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Title
              <input className="rounded-md border bg-background px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setTitle(event.target.value)} value={title} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Intent
              <textarea className="min-h-48 rounded-md border bg-background px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setIntent(event.target.value)} value={intent} />
            </label>
            <Button className="min-h-12 w-full" type="submit">
              + plan
            </Button>
          </form>
        )}
        <p className="mt-4 text-xs text-muted-foreground" role="status">{status}</p>
      </section>
    </aside>
  );
}

function TerminalPane(props: {
  activeSessionId: string | null;
  activeProject: ProjectRecord | null;
  isLoading: boolean;
  onCloseSession: (sessionId: string) => void;
  onCreateWorktree: (branch: string) => Promise<void>;
  onInitializeGit: () => Promise<void>;
  onRenameSession: (sessionId: string, name: string) => void;
  onRestartSession: (session: SessionRecord) => void;
  onStart: (role: "agent" | "cli") => void;
  onSelectSession: (sessionId: string) => void;
  onTerminalText: (sessionId: string, text: string) => void;
  repoContext: RepoContextResponse | null;
  scope: { scope: string; scopeKind: string; planPath: string | null };
  workspace: WorkspaceResponse | null;
  sessions: SessionRecord[];
}) {
  const activeSession = props.sessions.find((session) => session.id === props.activeSessionId) || props.sessions[0] || null;
  const [isWorktreeOpen, setIsWorktreeOpen] = useState(false);
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [worktreeStatus, setWorktreeStatus] = useState("");
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState(() => normalizedThinkingEffort(window.localStorage.getItem("hyperwiki.thinkingEffort")));
  const branchLabel = props.repoContext?.git?.worktree || props.activeProject?.worktreeSlug || props.repoContext?.git?.branch || props.activeProject?.branch || "main";
  const hasGit = Boolean(props.repoContext?.git?.root);
  const canCreateWorktree = hasGit && ["main", "master"].includes(String(branchLabel || "").trim().toLowerCase());
  const worktreeSlug = slugify(worktreeBranch.replace(/^refs\/heads\//, "") || "feature/worktree");
  const gitRoot = props.repoContext?.git?.root || props.repoContext?.root || "";
  const worktreePreview = worktreePreviewForSlug(gitRoot, worktreeSlug);
  const previewUrl = props.activeProject?.projectSlug ? `https://${worktreeSlug}.${props.activeProject.projectSlug}.localhost` : `https://${worktreeSlug}.localhost`;

  useEffect(() => {
    window.localStorage.setItem("hyperwiki.thinkingEffort", thinkingEffort);
  }, [thinkingEffort]);

  useEffect(() => {
    appendImportLog(`Terminal pane render project=${props.activeProject?.id || "none"} scope=${props.scope.scope} sessions=${props.sessions.length} active=${props.activeSessionId || "none"} ids=${props.sessions.map((session) => `${session.id}:${session.role || ""}:${session.scope || ""}`).join(",") || "none"}`);
  }, [props.activeProject?.id, props.activeSessionId, props.scope.scope, props.sessions]);

  function openWorktreePopover() {
    if (!hasGit) {
      setWorktreeStatus("Initialize Git before creating a worktree.");
      setIsWorktreeOpen(true);
      return;
    }
    const title = props.workspace?.status?.current || titleForPath(props.scope.planPath || "worktree", []);
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

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-[#2c302d] bg-[#111312] text-[#eef2ec] max-xl:hidden">
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-[#2c302d] bg-[#171a18] px-3 text-xs">
        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-[#9da79f]" />
          <strong className="min-w-0 max-w-[260px] truncate font-medium text-[#eef2ec]">{branchLabel}</strong>
          {canCreateWorktree || !hasGit ? (
            <Button className="h-7 border-[#8ea0ff] bg-[#8ea0ff]/15 px-3 text-xs font-bold text-white hover:bg-[#8ea0ff]/25" size="sm" variant="outline" type="button" onClick={openWorktreePopover}>
              {hasGit ? "+ worktree" : "init git"}
            </Button>
          ) : null}
          {isWorktreeOpen ? (
            <form className="absolute left-0 top-[calc(100%+8px)] z-50 grid w-[min(420px,calc(100vw-32px))] gap-3 rounded-lg border border-[#465063] bg-[#111513] p-3.5 text-[#eef2ec] shadow-[0_18px_52px_rgba(0,0,0,0.42)]" onSubmit={submitWorktree}>
              <header className="flex items-center justify-between gap-3">
                <strong className="text-sm">New worktree</strong>
                <button className="grid size-7 place-items-center text-xl leading-none text-[#aeb8b0] hover:text-[#eef2ec]" type="button" onClick={() => setIsWorktreeOpen(false)} aria-label="Close worktree creator">&times;</button>
              </header>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase text-[#9da79f]">Branch</span>
                <input className="w-full rounded-md border border-[#3a403b] bg-[#0c0f0d] px-2.5 py-2 text-xs text-[#eef2ec] outline-none focus:border-[#8ea0ff]" disabled={!hasGit} value={worktreeBranch} onChange={(event) => setWorktreeBranch(event.target.value)} />
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
          <label className="flex items-center gap-1.5 text-[#9da79f]">
            <span>thinking</span>
            <select className="h-7 rounded border border-[#3a403b] bg-[#111312] px-2 pr-7 text-[#eef2ec] outline-none" value={thinkingEffort} onChange={(event) => setThinkingEffort(normalizedThinkingEffort(event.target.value))} aria-label="Default thinking effort for new agent terminals">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
          </label>
          <Button className="h-7 border-[#3a403b] bg-transparent px-3 text-xs font-bold text-[#eef2ec] hover:border-[#9fd1ff] hover:bg-transparent hover:text-[#9fd1ff]" size="sm" variant="outline" onClick={() => props.onStart("agent")}>
            + agent
          </Button>
          <Button className="h-7 border-[#3a403b] bg-transparent px-3 text-xs font-bold text-[#eef2ec] hover:border-[#9fd1ff] hover:bg-transparent hover:text-[#9fd1ff]" size="sm" variant="outline" onClick={() => props.onStart("cli")}>
            + cli
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {props.sessions.length ? (
          <>
            {props.sessions.length > 1 ? (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#2c302d] bg-[#151816] px-2 py-1.5 text-xs">
                {props.sessions.map((session) => (
                  <button
                    className={cn(
                      "max-w-44 truncate rounded border border-transparent px-2.5 py-1 text-left text-[#9da79f] transition-colors hover:border-[#3a403b] hover:text-[#eef2ec]",
                      activeSession?.id === session.id && "border-[#8ea0ff] bg-[#8ea0ff]/15 text-[#eef2ec]",
                    )}
                    key={session.id}
                    onClick={() => props.onSelectSession(session.id)}
                    title={session.cwd || session.command || session.shell || session.id}
                    type="button"
                  >
                    {session.name || session.role || "terminal"}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              {activeSession ? (
                <XtermSession activeProject={props.activeProject} key={activeSession.id} onTerminalText={props.onTerminalText} scope={props.scope} session={activeSession} />
              ) : null}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-xs text-[#abb5ad]">
            No terminals running
          </div>
        )}
      </div>
    </aside>
  );
}

function HeadlessTerminalListener({
  activeProject,
  onTerminalText,
  sessions,
}: {
  activeProject: ProjectRecord | null;
  onTerminalText: (sessionId: string, text: string) => void;
  sessions: SessionRecord[];
}) {
  const agentSession = sessions.find(isAgentSession) || null;
  useEffect(() => {
    if (!activeProject || !agentSession) return;
    const session = agentSession;
    let closed = false;
    let seenSeq = 0;
    let eventBuffer: TerminalOutputEventPayload[] = [];
    let unlisten: (() => void) | null = null;

    const writeChunk = (payload: TerminalOutputEventPayload) => {
      if (closed || payload.sessionId !== session.id || payload.seq <= seenSeq) return;
      seenSeq = payload.seq;
      const bytes = Uint8Array.from(payload.bytes || []);
      if (!bytes.length) return;
      onTerminalText(session.id, terminalTextForParsing(terminalBytesToText(bytes)));
    };

    const handleChunk = (payload: TerminalOutputEventPayload) => {
      if (payload.sessionId !== session.id) return;
      if (!seenSeq) {
        eventBuffer.push(payload);
        return;
      }
      writeChunk(payload);
    };

    async function attach() {
      try {
        unlisten = await listenTerminalOutput(handleChunk);
        const replay = await hyperwikiApi.json<TerminalReplayResponse>(`/api/terminal/${encodeURIComponent(session.id)}/replay`);
        if (closed) return;
        const bytes = Uint8Array.from(replay.bytes || []);
        if (bytes.length) onTerminalText(session.id, terminalTextForParsing(terminalBytesToText(bytes)));
        seenSeq = replay.seq || 0;
        eventBuffer.sort((left, right) => left.seq - right.seq).forEach(writeChunk);
        eventBuffer = [];
      } catch (error) {
        appendImportLog(`Headless terminal listener failed session=${session.id}`, error);
      }
    }

    void attach();
    return () => {
      closed = true;
      if (unlisten) unlisten();
    };
  }, [activeProject?.id, agentSession?.id, onTerminalText]);

  return null;
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

function XtermSession({
  activeProject,
  onTerminalText,
  scope,
  session,
}: {
  activeProject: ProjectRecord | null;
  onTerminalText: (sessionId: string, text: string) => void;
  scope: { scope: string; scopeKind: string; planPath: string | null };
  session: SessionRecord;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const seenSeqRef = useRef(0);
  const loggedPlainTextRef = useRef("");
  const pendingRef = useRef<string[]>([]);
  const closedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    closedRef.current = false;
    seenSeqRef.current = 0;
    loggedPlainTextRef.current = "";
    pendingRef.current = [];
    let hasLoadedReplay = false;
    let eventBuffer: TerminalOutputEventPayload[] = [];
    let unlisten: (() => void) | null = null;

    const terminalFont = getComputedStyle(document.documentElement).getPropertyValue("--terminal-font").trim() || "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: terminalFont,
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: 10000,
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
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);

    const fit = () => {
      if (closedRef.current || container.clientWidth <= 0 || container.clientHeight <= 0) return;
      try {
        fitAddon.fit();
        void sendResize(session.id, terminal.cols, terminal.rows);
      } catch {
        // xterm fit can throw while the panel is resizing; the next observer tick retries.
      }
    };

    const flush = async () => {
      while (!closedRef.current && pendingRef.current.length) {
        const input = pendingRef.current.shift() || "";
        await sendInput(session.id, input);
      }
    };

    const dataDisposable = terminal.onData((data) => {
      pendingRef.current.push(data);
      void flush();
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void sendResize(session.id, cols, rows);
    });
    const observer = new ResizeObserver(fit);
    observer.observe(container);

    const writeTerminalChunk = (payload: TerminalOutputEventPayload) => {
      if (payload.sessionId !== session.id || payload.seq <= seenSeqRef.current) return;
      seenSeqRef.current = payload.seq;
      const bytes = Uint8Array.from(payload.bytes || []);
      if (!bytes.length) return;
      const text = terminalBytesToText(bytes);
      onTerminalText(session.id, terminalTextForParsing(text));
      logTerminalPlainText(session.id, "Terminal output plain", bytes.length, payload.seq, text, loggedPlainTextRef);
      terminal.write(bytes);
    };

    const handleTerminalChunk = (payload: TerminalOutputEventPayload) => {
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
        if (replay.bytes?.length) {
          const bytes = Uint8Array.from(replay.bytes);
          const text = terminalBytesToText(bytes);
          onTerminalText(session.id, terminalTextForParsing(text));
          logTerminalPlainText(session.id, "Terminal replay plain", bytes.length, replay.seq, text, loggedPlainTextRef);
          terminal.write(bytes);
        }
        seenSeqRef.current = replay.seq || 0;
        hasLoadedReplay = true;
        eventBuffer.sort((left, right) => left.seq - right.seq).forEach(writeTerminalChunk);
        eventBuffer = [];
        fit();
        void flush();
      } catch (error) {
        terminal.writeln("");
        terminal.writeln(error instanceof Error ? error.message : String(error));
      }
    }

    void attach();
    const fitTimer = window.setTimeout(fit, 0);

    return () => {
      closedRef.current = true;
      if (unlisten) unlisten();
      window.clearTimeout(fitTimer);
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [activeProject, onTerminalText, scope.planPath, scope.scope, scope.scopeKind, session]);

  return <div className="h-full min-h-0 bg-foreground p-2" ref={containerRef} />;
}

function routeFromLocation(): ViewRoute {
  const hashPath = window.location.hash.startsWith("#/wiki/") ? window.location.hash.slice(1) : "";
  if (hashPath) return { kind: "wiki", path: hashPath };
  if (window.location.pathname === "/projects") return { kind: "projects" };
  if (window.location.pathname === "/projects/new") return { kind: "new-project" };
  if (window.location.pathname.endsWith("/plans/new") || window.location.pathname === "/plans/new") return { kind: "plan-create" };
  if (window.location.pathname === "/settings") return { kind: "settings" };
  if (window.location.pathname.startsWith("/wiki/")) return { kind: "wiki", path: window.location.pathname };
  return { kind: "wiki", path: defaultWikiPath };
}

function urlForRoute(route: ViewRoute, activeProject: ProjectRecord | null) {
  if (route.kind === "projects") return "/projects";
  if (route.kind === "new-project") return "/projects/new";
  if (route.kind === "plan-create") {
    const projectPrefix = activeProject ? `/workspace/${activeProject.projectSlug}/${activeProject.worktreeSlug}` : "";
    return `${projectPrefix}/plans/new`;
  }
  if (route.kind === "settings") return "/settings";
  const projectPrefix = activeProject ? `/workspace/${activeProject.projectSlug}/${activeProject.worktreeSlug}` : "";
  return projectPrefix ? `${projectPrefix}#${route.path}` : route.path;
}

function withProjectQuery(path: string, activeProject: ProjectRecord | null) {
  if (!activeProject) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}project=${encodeURIComponent(activeProject.id)}`;
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
  if (path.endsWith("/wiki/plans/index.mdx")) return "Planning Dashboard";
  if (path.endsWith("/wiki/plans/mvp/index.mdx")) return "MVP Plan";
  if (path.endsWith("/wiki/plans/zzz_completed/index.mdx")) return "Completed Plans";
  if (isUnitPage(page)) return normalizePlanDisplayTitle(page.title);
  if (path.includes("/stage-")) return normalizePlanDisplayTitle(page.title);
  if (page.title.toLowerCase() === "prd") return "PRD";
  if (path.includes("/wiki/plans/")) return page.title.replace(/\s+Plan$/, "");
  return page.title;
}

function displayWikiPath(path: string) {
  return path.replace(/^\/projects\/[^/]+/, "");
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

function isCompletedTopLevelPlanPage(page: WikiPage) {
  return isTopLevelPlanPage(page) && !displayWikiPath(page.path).endsWith("/wiki/plans/zzz_completed/index.mdx") && isCompletedPage(page);
}

function isUnitPage(page: WikiPage) {
  return /\/unit-\d+-[^/]+\.mdx$/.test(displayWikiPath(page.path));
}

function childPlanPages(parent: WikiPage, pages: WikiPage[]) {
  return pages.filter((candidate) => isImmediateChildPlanPage(parent, candidate));
}

function isImmediateChildPlanPage(parent: WikiPage, candidate: WikiPage) {
  const parentPath = displayWikiPath(parent.path);
  const candidatePath = displayWikiPath(candidate.path);
  if (parentPath === candidatePath) return false;
  if (parentPath.endsWith("/wiki/plans/zzz_completed/index.mdx")) {
    return (/^\/wiki\/plans\/zzz_completed\/[^/]+\.mdx$/.test(candidatePath) && !candidatePath.endsWith("/index.mdx")) || isCompletedTopLevelPlanPage(candidate);
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

function currentPlanWorkPath(pages: WikiPage[], roots: WikiPage[], workspace: WorkspaceResponse | null) {
  const derived = firstIncompleteWorkPath(pages, roots);
  if (derived && derived !== defaultWikiPath) return derived;
  const currentPath = workspace?.status?.currentPath;
  if (currentPath) return currentPath;
  if (derived) return derived;
  return pages.find((page) => page.currentState === "current-unit")?.path || pages.find((page) => page.currentState === "current-plan")?.path || "";
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

function pageStatus(page: WikiPage) {
  if (page.status) return String(page.status).replace("completed", "complete");
  const summary = Array.isArray(page.summary) ? page.summary : [];
  const statusItem = summary.find((item) => /^status:/i.test(item));
  return statusItem ? statusItem.slice(statusItem.indexOf(":") + 1).trim().toLowerCase().replace("completed", "complete") : "";
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

function importCompletionLandingPath(workspace: WorkspaceResponse | null, generatedPlanPaths: string[]) {
  const currentPath = workspace?.status?.currentPath || "";
  if (currentPath && currentPath !== "/wiki/plans/index.mdx") return currentPath;
  return generatedPlanPaths.find((path) => path.endsWith("/index.mdx")) || generatedPlanPaths[0] || "/wiki/plans/index.mdx";
}

function isImportedPlanningIntakeRoute(route: ViewRoute, pages: WikiPage[]) {
  return importedPlanningState(route, pages).isIntake;
}

function isReactRenderedPlanPath(path: string) {
  return displayWikiPath(path).startsWith("/wiki/plans/") && path.endsWith(".mdx");
}

function isIncompleteImportProject(project: ProjectRecord | null | undefined) {
  return project?.importPlanning?.status === "incomplete";
}

function planningQuestionToImportQuestion(question: PlanningQuestion): ImportPlanningQuestion {
  return {
    id: question.id,
    label: "Agent Planning Question",
    prompt: question.question,
    impact: "blocking",
    rationale: question.reasoning || question.recommendedAnswer || "Captured during imported project planning Q&A.",
  };
}

function agentLaunchCommand(layout: LayoutResponse | null) {
  return layout?.panels?.find((panel) => panel.role === "agent" || panel.name === "agent")?.command?.trim() || "codex --yolo";
}

function importedProjectPlanningPrompt(project: ProjectRecord) {
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "You are working inside this newly imported Hyperwiki project.",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "Goal:",
    "Run a fresh source-grounded planning interview for this imported project, then create the first MVP plan docs only after the user has answered enough questions.",
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
    "- For every user-facing question, emit only one JSON object containing type \"hyperwiki-question\", question, recommendedAnswer, reasoning, and options. Prefer a fenced ```json block, but do not use bullets inside the JSON.",
    "- Hyperwiki renders that JSON in the app UI; keep prose before and after the question brief.",
    "- Put the recommended answer first in options. Keep options mutually exclusive and concise.",
    "- After emitting a hyperwiki-question block, stop and wait for the user's answer before continuing.",
    "- After receiving `Hyperwiki planning answer: ...`, briefly reconcile it, then either emit the next hyperwiki-question object or create the plan if no blocking unknowns remain.",
    "- If the user's answer rejects the options, reconcile the note and then ask the next blocking question with a new hyperwiki-question block.",
    "- This is the first plan for an imported project; treat it as MVP planning unless the user corrects that during Q&A.",
    "- Do not create wiki/plans/mvp/ until the Q&A has resolved blocking product, UX, technical, and verification decisions.",
    "- When the interview is done, create a decision-complete MDX MVP plan under wiki/plans/mvp/ with separate navigable files.",
    "- Preserve the plan > stages > units structure as files: wiki/plans/mvp/index.mdx, wiki/plans/mvp/stage-XX-name.mdx, and one MDX file per unit under either wiki/plans/mvp/stage-XX-name/unit-XX-name.mdx or wiki/plans/mvp/units/stage-XX/XX-name.mdx.",
    "- Do not collapse stages and units into headings inside wiki/plans/mvp/index.mdx; the sidebar depends on stage and unit files.",
    "- Each executable unit must include intent, scope, implementation notes, dependencies or blockers, and a Verification section.",
    "- Do not create many single-unit stages unless each has a real phase boundary.",
    "- Name unknowns instead of inventing certainty.",
    "- Update wiki/plans/index.mdx so the current plan, current stage/unit, blockers, and next action are obvious.",
    "- Replace the import intake copy with the created MVP plan state once the plan exists.",
    "- Update wiki/log.mdx and source briefs only when the interview creates durable project context.",
    "- Keep all durable project knowledge under wiki/.",
    "",
    `Imported project: ${project.name}`,
    `Project root: ${project.root}`,
  ].join("\n");
}

function planCreationPrompt(project: ProjectRecord | null, intent: string) {
  const normalizedIntent = intent.trim() || "Create the next plan from current project context.";
  return [
    "Use $hyperwiki and $grill-with-docs.",
    "",
    "Plan mode only: do not implement product code from this prompt.",
    "",
    "Goal:",
    "Run a one-question-at-a-time grilling interview for the requested work, then automatically create or update MDX wiki plan docs when no blocking unknowns remain.",
    "",
    "Hyperwiki requirements:",
    "- Read wiki/index.mdx and wiki/plans/index.mdx first if they exist.",
    "- Inspect repo evidence before asking questions the repo can answer.",
    "- Ask one focused question at a time and recommend an answer when tradeoffs exist.",
    "- For every user-facing question, emit only one JSON object containing type \"hyperwiki-question\", question, recommendedAnswer, reasoning, and options. Prefer a fenced ```json block, but do not use bullets inside the JSON.",
    "- Hyperwiki renders that JSON in the app UI; keep prose before and after the question brief.",
    "- Put the recommended answer first in options. After the block, stop and wait for the user's answer.",
    "- After receiving `Hyperwiki planning answer: ...`, briefly reconcile it, then either emit the next hyperwiki-question object or create the plan if no blocking unknowns remain.",
    "- Surface terminology conflicts, contradictions, scope risks, and missing verification.",
    "- Preserve a flexible plan > stages > units structure; compact plans may use one implicit stage.",
    "- Every executable unit must include a Verification section or component.",
    "- Write MDX files under wiki/plans/ and update wiki/plans/index.mdx and wiki/log.mdx.",
    "- Keep full transcript out of durable wiki files unless explicitly requested; write summarized evidence and decisions.",
    "- Commit generated docs when safe. Do not push.",
    "",
    `Project: ${project?.name || "Unknown"}`,
    `Project root: ${project?.root || "Unknown"}`,
    "",
    "Initial user intent:",
    normalizedIntent,
  ].join("\n");
}

function workflowPrompt(action: "execute-main" | "modify", workspace: WorkspaceResponse | null, visiblePath: string) {
  const status = workspace?.status || {};
  const unitTitle = status.current || "No current unit resolved";
  const unitPath = status.currentPath || "";
  if (action === "modify") {
    return [
      "Modify the currently visible Hyperwiki plan or wiki page.",
      "",
      `Visible page path: ${visiblePath}`,
      `Current unit: ${unitTitle}`,
      `Current unit path: ${unitPath || "none"}`,
      "",
      "Instructions:",
      "- Inspect the page and repo state before editing.",
      "- Keep the change scoped to the user's requested modification.",
      "- Update durable wiki context only when the evidence supports it.",
      "- Run relevant checks before summarizing the result.",
    ].join("\n");
  }
  return [
    "Execute exactly one hyperwiki unit on main.",
    "",
    `Execution unit: ${unitTitle}`,
    `Execution unit path: ${unitPath || "none"}`,
    `Visible page path: ${visiblePath}`,
    "",
    "Instructions:",
    "- Work in the current main checkout.",
    "- Keep changes grounded in the execution unit and repo state.",
    "- Complete exactly this execution unit.",
    "- Do not complete sibling units, later units, or the entire stage unless this unit explicitly requires only status reconciliation for already-finished work.",
    "- If the unit reaches a manual review, approval, or human validation gate, prepare the evidence/checklist and stop before continuing.",
    "- Update unit, stage, dashboard, sidebar-relevant status, and log entries only when the evidence supports those status changes.",
    "- Run relevant checks before summarizing the result.",
  ].join("\n");
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

function normalizedThinkingEffort(value: string | null | undefined) {
  const normalized = String(value || "low").trim().toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(normalized) ? normalized : "low";
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
  if (route.kind === "plan-create") {
    return { scope: "plan-create", scopeKind: "plan-create", planPath: "/wiki/plans/index.mdx" };
  }
  if (route.kind !== "wiki") {
    return { scope: route.kind, scopeKind: "app", planPath: null };
  }
  if (route.path.includes("/plans/")) {
    return { scope: route.path, scopeKind: "plan", planPath: route.path };
  }
  return { scope: route.path, scopeKind: "wiki", planPath: null };
}

function trimPlanningQuestionBuffer(text: string) {
  return text.length > 40000 ? text.slice(-40000) : text;
}

function extractLatestPlanningQuestion(text: string, sessionId: string): PlanningQuestion | null {
  const blocks = [...text.matchAll(/```(?:json|hyperwiki-question)?\s*([\s\S]*?)```/gi)];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const raw = blocks[index]?.[1]?.trim();
    if (!raw) continue;
    const parsed = parsePlanningQuestionJson(raw, sessionId);
    if (parsed) return parsed;
  }
  const rawObjects = extractRawPlanningQuestionObjects(text);
  for (let index = rawObjects.length - 1; index >= 0; index -= 1) {
    const parsed = parsePlanningQuestionJson(rawObjects[index], sessionId);
    if (parsed) return parsed;
  }
  return null;
}

function extractRawPlanningQuestionObjects(text: string) {
  const objects: string[] = [];
  const marker = "\"type\"";
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;
    const start = text.lastIndexOf("{", markerIndex);
    if (start === -1) {
      searchFrom = markerIndex + marker.length;
      continue;
    }
    const end = findJsonObjectEnd(text, start);
    if (end === -1) {
      searchFrom = markerIndex + marker.length;
      continue;
    }
    const candidate = text.slice(start, end + 1);
    if (candidate.includes("hyperwiki-question")) objects.push(candidate);
    searchFrom = end + 1;
  }
  return objects;
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

function parsePlanningQuestionJson(raw: string, sessionId: string): PlanningQuestion | null {
  try {
    const value = JSON.parse(raw) as Partial<PlanningQuestion> & { type?: string };
    return planningQuestionFromValue(value, sessionId);
  } catch {
    return parseLoosePlanningQuestion(raw, sessionId);
  }
}

function parseLoosePlanningQuestion(raw: string, sessionId: string): PlanningQuestion | null {
  if (!raw.includes("hyperwiki-question")) return null;
  const question = looseJsonStringField(raw, "question");
  if (!question) return null;
  const recommendedAnswer = looseJsonStringField(raw, "recommendedAnswer");
  const reasoning = looseJsonStringField(raw, "reasoning");
  const options = looseJsonArrayField(raw, "options");
  return normalizePlanningQuestion(sessionId, question, recommendedAnswer, reasoning, options);
}

function planningQuestionFromValue(value: Partial<PlanningQuestion> & { type?: string }, sessionId: string) {
  if (value.type !== "hyperwiki-question") return null;
  const question = stringValue(value.question);
  if (!question) return null;
  const recommendedAnswer = stringValue(value.recommendedAnswer);
  const reasoning = stringValue(value.reasoning);
  const options = Array.isArray(value.options)
    ? value.options.map(stringValue).filter(Boolean).slice(0, 7)
    : [];
  return normalizePlanningQuestion(sessionId, question, recommendedAnswer, reasoning, options);
}

function normalizePlanningQuestion(sessionId: string, question: string, recommendedAnswer: string, reasoning: string, options: string[]) {
  const normalizedOptions = options.length || !recommendedAnswer ? options : [recommendedAnswer];
  return {
    id: stableQuestionId(sessionId, question, recommendedAnswer, normalizedOptions),
    sessionId,
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

function planningWorkstreamLines(text: string) {
  return terminalTextForParsing(text)
    .split("\n")
    .map((line) => line.trim().replace(/^[-•]\s*/, "").replace(/^└\s*/, ""))
    .filter((line) => {
      if (!line || line.length < 3 || line.length > 220) return false;
      if (line.includes("hyperwiki-question") || line.startsWith('"') || line === "{" || line === "}" || line === "[" || line === "]") return false;
      if (/^(Wor|Work|Worki|Workin|Working|orking|rking|king|ing|M+|\d+\s+[A-Za-z])$/.test(line)) return false;
      if (/^gpt-\S+\s/.test(line) || line.startsWith("›")) return false;
      if (/^[\u2500-╿]{6,}$/.test(line)) return false;
      return true;
    })
    .slice(-18);
}

function looseJsonStringField(raw: string, field: string) {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|,\\s*\\]|\\s*\\})`));
  return match?.[1] ? unescapeLooseJsonString(match[1]) : "";
}

function looseJsonArrayField(raw: string, field: string) {
  const match = raw.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match?.[1]) return [];
  return [...match[1].matchAll(/"([\s\S]*?)"\s*,?/g)]
    .map((item) => unescapeLooseJsonString(item[1] || ""))
    .filter(Boolean)
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

function stableQuestionId(sessionId: string, question: string, recommendedAnswer: string, options: string[]) {
  const input = `${question}\n${recommendedAnswer}\n${options.join("\n")}`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index) | 0;
  }
  return `planning-question:${Math.abs(hash)}`;
}

async function sendInput(sessionId: string, input: string) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    body: { input },
  });
}

function terminalPasteSubmitInput(message: string) {
  return `\x1b[200~${message}\x1b[201~\r`;
}

async function waitForAgentPromptReady(sessionId: string) {
  const startedAt = Date.now();
  let lastText = "";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const replay = await hyperwikiApi.json<TerminalReplayResponse>(`/api/terminal/${encodeURIComponent(sessionId)}/replay`);
      const bytes = Uint8Array.from(replay.bytes || []);
      const plain = terminalTextForParsing(terminalBytesToText(bytes));
      lastText = plain.slice(-240);
      if (isAgentPromptReady(plain)) return true;
    } catch (error) {
      lastText = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  appendImportLog(`Agent prompt readiness timed out session=${sessionId} waitedMs=${Date.now() - startedAt} tail=${JSON.stringify(lastText)}`);
  return false;
}

function isAgentPromptReady(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  return /\u203a\s*$/.test(text) || /›\s*$/.test(text) || normalized.includes("› Implement {feature}");
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

function terminalBytesToText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
  if (/^(?:[WM•\s]*Working|Working|M M|S|l|g|\d+|[?;:\d\[\]HKl]+)$/.test(line)) return false;
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
