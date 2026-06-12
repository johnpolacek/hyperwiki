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
import { hyperwikiApi, withProjectQuery } from "@/lib/api";
import { terminalCompletionNotificationSettings } from "@/lib/terminal-notifications";
import { cn } from "@/lib/utils";
import { normalizePlanDisplayTitle } from "@/lib/wiki-title";
import { PendingImportView, ProjectsView } from "@/components/views/ProjectsView";
import { documentSummary, NewProjectView } from "@/components/views/NewProjectView";
import { SettingsView } from "@/components/views/SettingsView";
import { ProjectEnvEditor } from "@/components/settings/ProjectEnvEditor";
import { TopBar } from "@/components/layout/TopBar";
import { WikiSidebar } from "@/components/layout/WikiSidebar";
import { isMissingFileError, WorkspacePane } from "@/components/views/WorkspacePane";
import { TerminalPane } from "@/components/terminal/TerminalPane";
import { XtermSession } from "@/components/terminal/XtermSession";
import { appendTerminalTranscriptText, cleanInitialTerminalDisplayText, isLiveTerminalSession, isStandbySession, newestSession, sessionSortMs, fileToBase64, isDetachedDevSession, isPendingTerminalSession, isVisibleTerminalPaneSession, listenTerminalCompletion, listenTerminalOutput, logTerminalPlainText, openTerminalWebLink, previewDetachedDevSession, saveTerminalDroppedFiles, selectDevTerminalSession, sendInput, sendResize, terminalBracketedPaste, terminalBytesToText, terminalClipboardImageFiles, terminalCollapsedSummary, terminalDisplayDebugTail, terminalDisplayHasVisibleText, terminalDisplayTextForXterm, terminalPaneLabel, terminalPaneStatusLabel, terminalPasteImageFileName, terminalStartupNotice, terminalTextForParsing, terminalTranscriptTextForDisplay, terminalXtermScrollback, worktreePreviewForSlug, xtermRenderSnapshot, xtermRenderSnapshotSummary } from "@/lib/terminal";
import { isReactRenderedMdxPath } from "@/lib/wiki-pages";
import { buildSidebarModel, childPlanPages, defaultWikiPath, cleanPageTitle, compactUnitLabel, currentPlanWorkPath, displayWikiPath, firstIncompleteWorkPath, isCompletedPage, isCompletedTopLevelPlanPage, isDeletablePlanRootPage, isDuplicateSlugChildPage, isImmediateChildPlanPage, isPlansIndexPage, isProjectWikiPage, isTopLevelPlanPage, isUnitPage, pageStatus, pathContainsSelectedPage, pathIsCompletedPage, planLandingPath, planPageActionState, planScopeIsComplete, planSortKey, planTreeBasePath, titleForPath, type SidebarModel } from "@/lib/wiki-pages";
import { clearPendingImportProject, readPendingImportProject } from "@/lib/pending-import";
import { DISABLE_TEXT_CORRECTION_PROPS, slugify } from "@/lib/utils";
import { BeamSurface, GridBeamRuntimeContext, useDocumentGridBeamTheme, usePrefersReducedMotion } from "@/components/ui/beam-surface";
import { agentLaunchCommand, agentProviderFromCommand, claudeCommandWithThinkingEffort, codexCommandWithThinkingEffort, defaultAgentCommand, defaultThinkingEffort, importAgentLaunchCommand, layoutAgentProvider, normalizedThinkingEffort, type AgentProviderAvailability, type AgentProviderId } from "@/lib/agent";
import { appendImportLog, clearImportLog, readImportLog } from "@/lib/import-log";
import { applyAppTheme, contrastRatio, effectiveTheme, fontLabel, fontStyle, hasThemeOverrides, mergePreset, mixHex, normalizeColor, normalizePreset, readableTextOn, selectThemePreset, themeJson, updateThemeMode, updateThemeToken, type NormalizedTheme } from "@/lib/theme";
import type { AgentRunKind, AgentRunPhase, AgentRunState, AppPreviewResponse, CodexAdapterMetrics, CodexImportTurnResponse, CodexImportTurnSnapshot, CodexImportTurnStartResponse, CodexImportTurnStatusResponse, CommandAction, DevLifecycleResponse, DroppedFilesResponse, ImportOnboardingEventRecord, ImportOnboardingPrewarmResponse, ImportOnboardingRunRecord, ImportOnboardingSessionRecord, ImportOnboardingStatusResponse, ImportPlanningAnswer, ImportPlanningArtifactValidation, ImportPlanningProtocolPhase, ImportPlanningQuestion, ImportPlanningReadyToPlan, ImportPlanningResponse, ImportPlanningStatus, LayoutPanel, LayoutResponse, MemoryEntry, PendingExecuteAgentConfirmation, PlanningInterviewStatus, PlanningQuestion, PlanningQuestionAnswer, PlanningQuestionOption, PlanPageActionState, ProjectCreateResponse, ProjectEnvEditorState, ProjectEnvKey, ProjectEnvResponse, ProjectEnvStatusTone, ProjectGroup, ProjectListResponse, ProjectRecord, ProjectRemoveResponse, RepoContextResponse, ReviewWorkflow, ReviewWorkflowResponse, SessionRecord, SessionResponse, SessionsResponse, SettingsResponse, SourceDocumentInput, StagedArtifactRecord, TerminalCompletionEventPayload, TerminalCompletionNotificationSettings, TerminalCompletionReason, TerminalOutputEventPayload, TerminalReplayResponse, TerminalScope, TerminalStartResponse, ThemePreset, ThinkingEffort, ViewRoute, WikiComponentRef, WikiFingerprintResponse, WikiHeading, WikiLink, WikiListResponse, WikiMarkdownZipDownloadResponse, WikiPage, WikiPlanDeletionResponse, WikiSourceResponse, WikiValidationWarning, WorkspaceResponse, WorktreeCreateResponse } from "@/lib/types";


const RUNTIME_ENV_KEY_HINT_DENYLIST = new Set(["PORTLESS_URL"]);

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

const importPlanningWorkstreamLimit = 1000;
const thinkingEffortStorageKey = "hyperwiki.thinkingEffort";
const generalAgentPrewarmTarget = 2;
const modifyAgentPrewarmTarget = 1;
const prewarmAgentReadinessAttempts = 80;
const generalAgentPrewarmRefillDelayMs = 1500;

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

function isVisibleLiveTerminalSession(session: SessionRecord) {
  return isLiveTerminalSession(session) && !isStandbySession(session);
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

function terminalCompletionSound() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "Ping";
  if (platform.includes("linux")) return "message-new-instant";
  return undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default App;
