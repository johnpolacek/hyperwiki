import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Circle,
  Command,
  ExternalLink,
  FileText,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Settings,
  Square,
  Trash2,
} from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { Button } from "@/components/ui/button";
import { hyperwikiApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type ViewRoute =
  | { kind: "wiki"; path: string }
  | { kind: "projects" }
  | { kind: "new-project" }
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

interface PlanCreateResponse {
  page?: {
    path?: string;
    title?: string;
  };
  path?: string;
}

const defaultWikiPath = "/wiki/plans/mvp/index.html";

function App() {
  const [route, setRoute] = useState<ViewRoute>(() => routeFromLocation());
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
  const [wikiHtml, setWikiHtml] = useState("");
  const [wikiError, setWikiError] = useState("");
  const [isWikiLoading, setIsWikiLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectListResponse>({});
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [preview, setPreview] = useState<AppPreviewResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [layout, setLayout] = useState<LayoutResponse | null>(null);
  const [repoContext, setRepoContext] = useState<RepoContextResponse | null>(null);
  const [reviewWorkflows, setReviewWorkflows] = useState<ReviewWorkflow[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [isUpNextOpen, setIsUpNextOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<"modify" | "new-plan">("modify");

  const currentWikiPath = route.kind === "wiki" ? route.path : defaultWikiPath;
  const terminalScope = useMemo(() => scopeForRoute(route), [route]);
  const sidebarModel = useMemo(() => buildSidebarModel(wikiPages), [wikiPages]);
  const projectGroups = useMemo(() => normalizeProjectGroups(projects), [projects]);
  const hasRegisteredProjects = projectGroups.length > 0;

  useEffect(() => {
    function onPopState() {
      setRoute(routeFromLocation());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    if (!hasLoadedProjects || hasRegisteredProjects || route.kind !== "wiki") return;
    setRoute({ kind: "new-project" });
    window.history.replaceState(null, "", "/projects/new");
  }, [hasLoadedProjects, hasRegisteredProjects, route.kind]);

  useEffect(() => {
    if (route.kind !== "wiki") return;
    if (hasLoadedProjects && !hasRegisteredProjects) return;
    let cancelled = false;
    setIsWikiLoading(true);
    setWikiError("");
    hyperwikiApi
      .text(wikiRequestPath(route.path, activeProject))
      .then((html) => {
        if (!cancelled) setWikiHtml(html);
      })
      .catch((error) => {
        if (!cancelled) {
          setWikiHtml("");
          setWikiError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsWikiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route, activeProject]);

  useEffect(() => {
    void loadSessions();
  }, [terminalScope]);

  async function loadBaseData() {
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

    if (wikiResult.status === "fulfilled") setWikiPages(wikiResult.value.pages || []);
    if (projectsResult.status === "fulfilled") {
      setProjects(projectsResult.value);
      setActiveProject(findActiveProject(projectsResult.value));
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
    setRoute(nextRoute);
    window.history.pushState(null, "", urlForRoute(nextRoute, activeProject));
  }

  async function switchProject(project: ProjectRecord) {
    setActiveProject(project);
    setIsProjectsOpen(false);
    const loadedWorkspace = await loadProjectData(project);
    const landingPath = loadedWorkspace?.status?.currentPath || defaultWikiPath;
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

    if (wikiResult.status === "fulfilled") setWikiPages(wikiResult.value.pages || []);
    if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
    if (previewResult.status === "fulfilled") setPreview(previewResult.value);
    if (layoutResult.status === "fulfilled") setLayout(layoutResult.value);
    if (reviewResult.status === "fulfilled") setReviewWorkflows(reviewResult.value.workflows || []);
    if (repoResult.status === "fulfilled") setRepoContext(repoResult.value);

    const rejected = [wikiResult, workspaceResult, previewResult, layoutResult, reviewResult, repoResult].find((result) => result.status === "rejected");
    setStatus(rejected ? "Some workspace data is unavailable" : "Workspace loaded");
    return workspaceResult.status === "fulfilled" ? workspaceResult.value : null;
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
          scope_kind: terminalScope.scopeKind,
          plan_path: terminalScope.planPath,
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
    const existing = sessions.find((session) => session.role === "agent" || session.name?.toLowerCase().startsWith("agent"));
    if (existing?.command) {
      setActiveSessionId(existing.id);
      return existing;
    }
    const command = agentLaunchCommand(layout);
    if (!command) {
      throw new Error("No agent launch command is configured for this project. Set agent.launchCommand in .hyperwiki/config.json, for example codex --yolo.");
    }
    const started = await hyperwikiApi.json<TerminalStartResponse>(withProjectQuery("/api/terminal/start", activeProject), {
      method: "POST",
      body: {
        name: "Agent",
        role: "agent",
        command,
        scope: terminalScope.scope,
        scope_kind: terminalScope.scopeKind,
        plan_path: terminalScope.planPath,
      },
    });
    setActiveSessionId(started.session.id);
    await loadSessions();
    return started.session;
  }

  async function sendAgentPrompt(prompt: string) {
    await ensureAgentSession();
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await hyperwikiApi.json(withProjectQuery("/api/agent/prompt", activeProject), {
          method: "POST",
          body: {
            prompt,
            currentPage: currentWikiPath,
            scope: terminalScope.scope,
          },
        });
        return;
      } catch (error) {
        lastError = error;
        await delay(250);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Agent unavailable.");
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
        const title = payload?.title || "";
        const intent = payload?.intent || "";
        if (!title.trim() || !intent.trim()) throw new Error("New Plan needs a title and intent.");
        const result = await hyperwikiApi.json<PlanCreateResponse>(withProjectQuery("/api/plans/create", activeProject), {
          method: "POST",
          body: {
            title,
            intent,
            planType: payload?.planType || "feature",
            answers: [],
            allowDeferredUnknowns: true,
          },
        });
        await loadBaseData();
        const path = result.page?.path || result.path;
        if (path) navigate({ kind: "wiki", path });
        setStatus("Plan created");
      }
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
          scope_kind: session.scopeKind || terminalScope.scopeKind,
          plan_path: session.planPath || terminalScope.planPath,
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
    setStatus("Initializing project");
    const result = await hyperwikiApi.json<ProjectCreateResponse>("/api/projects/create", {
      method: "POST",
      body: {
        title: input.title,
        summary: documentSummary(input.document),
        document: input.document,
        documentType: input.documentType,
        initializeGit: input.initializeGit,
      },
    });
    setActiveProject(result.project);
    setStatus(`Project created: ${result.project.name}`);
    const projectsResult = await hyperwikiApi.json<ProjectListResponse>(`/api/projects?project=${encodeURIComponent(result.project.id)}`);
    setProjects(projectsResult);
    await switchProject(result.project);
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
    setActiveProject(findActiveProject(projectsResult));
    setStatus(deleteFiles ? "Project removed and files deleted" : "Project removed from Hyperwiki");
  }

  const isUtilityRoute = route.kind === "projects" || route.kind === "new-project" || route.kind === "settings";

  return (
    <main className="hyperwiki-shell flex min-h-svh flex-col bg-background text-foreground">
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
      <section className={cn("grid min-h-0 flex-1 overflow-hidden", isUtilityRoute ? "grid-cols-1" : "grid-cols-[300px_minmax(420px,1fr)_minmax(380px,0.92fr)] max-xl:grid-cols-[260px_minmax(0,1fr)]")}>
        {isUtilityRoute ? null : (
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
          isLoading={isWikiLoading}
          onNavigate={navigate}
          onCreateProject={createProject}
          onRemoveProject={removeProject}
          onRunCommand={runCommandAction}
          onSetSidePanelMode={setSidePanelMode}
          onSwitchProject={switchProject}
          projectGroups={projectGroups}
          reviewWorkflows={reviewWorkflows}
          route={route}
          settings={settings}
          wikiError={wikiError}
          wikiHtml={wikiHtml}
          wikiPath={currentWikiPath}
          wikiPages={wikiPages}
        />
        {isUtilityRoute ? null : (
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
            repoContext={repoContext}
            scope={terminalScope}
            workspace={workspace}
            sessions={sessions}
          />
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
    <header className="flex min-h-12 items-center justify-between gap-4 border-b bg-card px-3 text-sm">
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
    <aside className="flex min-h-0 flex-col overflow-hidden border-r bg-card">
      <nav className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
  if (!children.length) {
    return <SidebarPageButton current={isCurrent} currentPath={currentPath} depth={depth} onNavigate={onNavigate} page={page} selected={isSelected} />;
  }
  const open = isSelected || isCurrent || children.some((child) => pathContainsSelectedPage(child.path, currentPath) || (Boolean(currentWorkPath) && pathContainsSelectedPage(child.path, currentWorkPath)));
  return (
    <details className="grid min-w-0 gap-1 overflow-hidden" open={open}>
      <summary className="min-w-0 cursor-pointer list-none overflow-hidden">
        <SidebarPageButton current={isCurrent} currentPath={currentPath} depth={depth} onNavigate={onNavigate} page={page} selected={isSelected} />
      </summary>
      <div className="grid min-w-0 gap-1 overflow-hidden">
        {children.map((child) => (
          <PlanNode currentPath={currentPath} currentWorkPath={currentWorkPath} depth={depth + 1} key={child.path} onNavigate={onNavigate} page={child} pages={pages} />
        ))}
      </div>
    </details>
  );
}

function SidebarPageButton({ page, currentPath, onNavigate, depth, current, selected }: { page: WikiPage; currentPath: string; onNavigate: (path: string) => void; depth: number; current?: boolean; selected?: boolean }) {
  const isSelected = selected ?? currentPath === page.path;
  return (
    <button
      className={cn(
        "flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-sm hover:bg-secondary",
        isSelected ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onNavigate(page.path);
      }}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      type="button"
    >
      <span className={cn("size-2 shrink-0 rounded-full", current ? "bg-[#25a244] shadow-[0_0_0_3px_rgba(37,162,68,0.14)]" : "bg-transparent")} />
      <span className="min-w-0 flex-1 truncate font-bold">{cleanPageTitle(page)}</span>
    </button>
  );
}

function WorkspacePane(props: {
  activeProject: ProjectRecord | null;
  isLoading: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; initializeGit: boolean }) => Promise<void>;
  onNavigate: (route: ViewRoute) => void;
  onRemoveProject: (project: ProjectRecord, deleteFiles: boolean) => Promise<void>;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onSetSidePanelMode: (mode: "modify" | "new-plan") => void;
  onSwitchProject: (project: ProjectRecord) => void;
  projectGroups: ProjectGroup[];
  reviewWorkflows: ReviewWorkflow[];
  route: ViewRoute;
  settings: SettingsResponse | null;
  wikiError: string;
  wikiHtml: string;
  wikiPath: string;
  wikiPages: WikiPage[];
}) {
  if (props.route.kind === "projects") {
    return <ProjectsView groups={props.projectGroups} onNewProject={() => props.onNavigate({ kind: "new-project" })} onOpenProject={props.onSwitchProject} onRemoveProject={props.onRemoveProject} />;
  }
  if (props.route.kind === "new-project") {
    return <NewProjectView onCreateProject={props.onCreateProject} />;
  }
  if (props.route.kind === "settings") {
    return <SettingsView activeProject={props.activeProject} settings={props.settings} />;
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-background">
      <div className="flex min-h-12 items-center justify-between border-b bg-card px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate text-xs font-bold uppercase">{titleForPath(props.wikiPath, props.wikiPages).replace(/\.[^.]+$/, "")}</span>
        </div>
        <CommandBar onRunCommand={props.onRunCommand} onSetSidePanelMode={props.onSetSidePanelMode} reviewWorkflows={props.reviewWorkflows} wikiPath={props.wikiPath} />
      </div>
      <div className="relative min-h-0 flex-1">
        {props.isLoading ? (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b bg-card px-3 py-2 text-xs text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading wiki page
          </div>
        ) : null}
        {props.wikiError ? (
          <div className="m-4 border bg-card p-4 text-sm text-destructive shadow-sm">{props.wikiError}</div>
        ) : (
          <iframe className="size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={embeddedWikiHtml(props.wikiHtml)} title="Wiki page" />
        )}
      </div>
    </section>
  );
}

function embeddedWikiHtml(html: string) {
  const style = "<style id=\"hyperwiki-embedded-style\">.wiki-header{display:none!important}.wiki-page{padding-top:32px!important}.wiki-page>h1+p:has(a[href*='/wiki/plans/mvp/stage-']){display:none!important}</style>";
  if (!html.trim()) return html;
  if (html.includes("hyperwiki-embedded-style")) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${style}</head>`);
  return `${style}${html}`;
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
      <Button size="sm" variant="outline" onClick={() => onSetSidePanelMode("new-plan")}>
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
          {isActive ? "Active" : available ? "Available" : "Missing"}
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

function NewProjectView({ onCreateProject }: { onCreateProject: (input: { title: string; document: string; documentType: string; initializeGit: boolean }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState("");
  const [documentType, setDocumentType] = useState("markdown");
  const [initializeGit, setInitializeGit] = useState(true);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setDocument(text);
    setDocumentType(file.name.toLowerCase().match(/\.html?$/) ? "html" : "markdown");
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !document.trim()) {
      setStatus("Add a project name and source brief before planning the MVP.");
      return;
    }
    setIsSubmitting(true);
    setStatus("Initializing project...");
    try {
      await onCreateProject({
        title: title.trim(),
        document: document.trim(),
        documentType,
        initializeGit,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create the project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="min-h-0 overflow-auto bg-background">
      <header className="flex min-h-40 items-center px-10">
        <div>
          <h1 className="font-ui m-0 text-4xl font-bold leading-none">New Project</h1>
          <p className="font-ui m-0 mt-3 text-sm text-muted-foreground">Initialize a fresh hyperwiki project from a brief and hand it to the agent.</p>
        </div>
      </header>
      <div className="flex justify-center px-8 py-7">
        <form className="w-full max-w-[56rem] rounded-md border bg-card p-5" onSubmit={handleSubmit}>
          <header className="mb-5">
            <div>
              <h2 className="font-ui m-0 text-3xl font-normal leading-tight">Project Brief</h2>
              <p className="font-ui m-0 mt-2 max-w-[42rem] text-base text-muted-foreground">
                Start with a brief or source file. HyperWiki will extract the product evidence before asking planning questions.
              </p>
            </div>
          </header>
          <label className="mb-4 flex min-h-20 w-full cursor-pointer flex-col items-center justify-center rounded-md border bg-background text-center text-muted-foreground hover:bg-secondary">
            <span className="text-base font-bold uppercase">Import Project File</span>
            <small className="text-xs font-bold">Markdown or HTML</small>
            <input className="sr-only" type="file" accept=".md,.markdown,.html,.htm,text/markdown,text/html,text/plain" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
          </label>
          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-bold uppercase text-muted-foreground" aria-hidden="true">
            <span className="h-px bg-border" />
            <span>OR</span>
            <span className="h-px bg-border" />
          </div>
          <label className="mb-4 grid gap-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Project name</span>
            <input className="min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" autoComplete="off" required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="mb-4 grid gap-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Brief</span>
            <textarea className="min-h-[14rem] rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" required value={document} onChange={(event) => setDocument(event.target.value)} />
          </label>
          <label className="mb-4 flex items-center gap-3 text-sm font-bold text-muted-foreground">
            <input className="size-4 accent-primary" checked={initializeGit} type="checkbox" onChange={(event) => setInitializeGit(event.target.checked)} />
            <span>Initialize Git and create an initial commit</span>
          </label>
          <Button className="min-h-11 w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Initializing Project..." : "Review Source And Plan MVP"}
          </Button>
          {status ? <p className="m-0 mt-4 text-sm text-muted-foreground" role="status">{status}</p> : null}
        </form>
      </div>
    </section>
  );
}

function documentSummary(document: string) {
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
        <div className="grid gap-4 p-8">
          <ThemePresetCard large presetKey={editableTheme.activePreset || "custom"} theme={editTheme} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
            {Object.entries(presets).map(([key, preset]) => (
              <button
                className={cn("rounded-md border bg-card p-3 text-left hover:border-primary", key === editableTheme.activePreset && "border-primary ring-1 ring-primary/40")}
                key={key}
                onClick={() => setThemeDraft({ ...editableTheme, activePreset: key })}
                type="button"
              >
                <ThemePresetCard presetKey={key} theme={normalizePreset(preset)} />
              </button>
            ))}
          </div>
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
                  <code className="mt-5 inline-block bg-muted px-2 py-1 font-mono text-sm">wiki/plans/mvp/stage-08-settings-soul-memory.html</code>
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

function normalizeColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value || "#4361ee" : "#4361ee";
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
    <aside className="flex min-h-0 flex-col border-l border-[#2c302d] bg-[#111312] text-[#eef2ec] max-xl:hidden">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[#2c302d] bg-[#171a18] px-3 font-mono text-xs">
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
      <div className="flex min-h-0 flex-1 flex-col">
        {props.sessions.length ? (
          <>
            <div className="flex max-h-40 shrink-0 flex-col gap-2 overflow-auto border-b border-[#2c302d] p-2">
              {props.sessions.map((session) => (
                <TerminalSessionTab
                  isActive={activeSession?.id === session.id}
                  key={session.id}
                  onClose={() => props.onCloseSession(session.id)}
                  onRename={(name) => props.onRenameSession(session.id, name)}
                  onRestart={() => props.onRestartSession(session)}
                  onSelect={() => props.onSelectSession(session.id)}
                  session={session}
                />
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {activeSession ? (
                <XtermSession key={activeSession.id} scope={props.scope} session={activeSession} />
              ) : null}
            </div>
          </>
        ) : (
          <div className="px-5 py-4 font-mono text-xs text-[#abb5ad]">
            No terminals running
          </div>
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
  scope,
  session,
}: {
  scope: { scope: string; scopeKind: string; planPath: string | null };
  session: SessionRecord;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const seenLengthRef = useRef(0);
  const pendingRef = useRef<string[]>([]);
  const closedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    closedRef.current = false;
    seenLengthRef.current = 0;
    pendingRef.current = [];

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
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
        await sendInput(session.id, normalizeTerminalInput(input));
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

    async function attach() {
      try {
        const started = await hyperwikiApi.json<TerminalStartResponse>("/api/terminal/start", {
          method: "POST",
          body: {
            id: session.id,
            name: session.name,
            role: session.role,
            command: session.command,
            scope: session.scope || scope.scope,
            scope_kind: session.scopeKind || scope.scopeKind,
            plan_path: session.planPath || scope.planPath,
          },
        });
        const replay = String(started.replay || "");
        if (replay) {
          seenLengthRef.current = replay.length;
          terminal.write(stripTerminalDisplayControlSequences(replay));
        }
        fit();
        void flush();
      } catch (error) {
        terminal.writeln("");
        terminal.writeln(error instanceof Error ? error.message : String(error));
      }
    }

    const poll = async () => {
      if (closedRef.current) return;
      try {
        const result = await hyperwikiApi.json<{ output?: string }>(`/api/terminal/${encodeURIComponent(session.id)}/output`);
        const output = String(result.output || "");
        if (output.length > seenLengthRef.current) {
          const next = output.slice(seenLengthRef.current);
          seenLengthRef.current = output.length;
          terminal.write(stripTerminalDisplayControlSequences(next));
        } else if (output.length < seenLengthRef.current) {
          seenLengthRef.current = output.length;
          terminal.clear();
          terminal.write(stripTerminalDisplayControlSequences(output));
        }
      } catch {
        // A closed session is reflected by the next session refresh.
      }
    };

    void attach();
    const pollTimer = window.setInterval(poll, 250);
    const fitTimer = window.setTimeout(fit, 0);

    return () => {
      closedRef.current = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(fitTimer);
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [scope.planPath, scope.scope, scope.scopeKind, session]);

  return <div className="h-full min-h-0 bg-foreground p-2" ref={containerRef} />;
}

function routeFromLocation(): ViewRoute {
  const hashPath = window.location.hash.startsWith("#/wiki/") ? window.location.hash.slice(1) : "";
  if (hashPath) return { kind: "wiki", path: hashPath };
  if (window.location.pathname === "/projects") return { kind: "projects" };
  if (window.location.pathname === "/projects/new") return { kind: "new-project" };
  if (window.location.pathname === "/settings") return { kind: "settings" };
  if (window.location.pathname.startsWith("/wiki/")) return { kind: "wiki", path: window.location.pathname };
  return { kind: "wiki", path: defaultWikiPath };
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

function wikiRequestPath(path: string, activeProject: ProjectRecord | null) {
  if (!activeProject) return path;
  return `/projects/${encodeURIComponent(activeProject.id)}${path}`;
}

function findActiveProject(response: ProjectListResponse) {
  const all = [...(response.projects || []), ...(response.checkouts || []), ...normalizeProjectGroups(response).flatMap((group) => group.checkouts)];
  return all.find((project) => project.id === response.activeProjectId) || all.find((project) => project.active) || all[0] || null;
}

function normalizeProjectGroups(response: ProjectListResponse) {
  if (response.projectGroups?.length) return response.projectGroups;
  const all = [...(response.checkouts || []), ...(response.projects || [])];
  const groups = new Map<string, ProjectGroup>();
  for (const project of all) {
    const key = project.projectSlug || project.name || project.id;
    const existing = groups.get(key) || { name: project.name || key, projectSlug: key, checkouts: [] };
    existing.checkouts.push(project);
    groups.set(key, existing);
  }
  return Array.from(groups.values());
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
    "/wiki/architecture.html",
    "/wiki/dev.html",
    "/wiki/roadmap.html",
    "/wiki/sources.html",
    "/wiki/log.html",
  ].some((suffix) => path.endsWith(suffix)) || path.includes("/wiki/sources/");
}

function cleanPageTitle(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/index.html")) return "Planning Dashboard";
  if (path.endsWith("/wiki/plans/mvp/index.html")) return "MVP Plan";
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return "Completed Plans";
  if (isUnitPage(page)) return page.title.replace(/^Unit (\d+) - /, (_match, unit) => `Unit ${unit.padStart(2, "0")}: `);
  if (path.includes("/stage-")) return page.title.replace(/^Stage (\d+) - /, (_match, stage) => `Stage ${stage.padStart(2, "0")}: `);
  if (page.title.toLowerCase() === "prd") return "PRD";
  if (path.includes("/wiki/plans/")) return page.title.replace(/\s+Plan$/, "");
  return page.title;
}

function displayWikiPath(path: string) {
  return path.replace(/^\/projects\/[^/]+/, "");
}

function isTopLevelPlanPage(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return true;
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return true;
  if (/^\/wiki\/plans\/features\/[^/]+\.html$/.test(path)) return true;
  return /^\/wiki\/plans\/[^/]+\.html$/.test(path) && !path.endsWith("/index.html");
}

function isCompletedTopLevelPlanPage(page: WikiPage) {
  return isTopLevelPlanPage(page) && !displayWikiPath(page.path).endsWith("/wiki/plans/zzz_completed/index.html") && isCompletedPage(page);
}

function isUnitPage(page: WikiPage) {
  return /\/unit-\d+-[^/]+\.html$/.test(displayWikiPath(page.path));
}

function childPlanPages(parent: WikiPage, pages: WikiPage[]) {
  return pages.filter((candidate) => isImmediateChildPlanPage(parent, candidate));
}

function isImmediateChildPlanPage(parent: WikiPage, candidate: WikiPage) {
  const parentPath = displayWikiPath(parent.path);
  const candidatePath = displayWikiPath(candidate.path);
  if (parentPath === candidatePath) return false;
  if (parentPath.endsWith("/wiki/plans/mvp/index.html")) return /^\/wiki\/plans\/mvp\/stage-[^/]+\.html$/.test(candidatePath);
  if (parentPath.endsWith("/wiki/plans/zzz_completed/index.html")) {
    return (/^\/wiki\/plans\/zzz_completed\/[^/]+\.html$/.test(candidatePath) && !candidatePath.endsWith("/index.html")) || isCompletedTopLevelPlanPage(candidate);
  }
  if (/^\/wiki\/plans\/features\/[^/]+\.html$/.test(parentPath)) return false;
  const parentBase = parentPath.replace(/\.html$/, "");
  return candidatePath.startsWith(`${parentBase}/`) && !candidatePath.slice(parentBase.length + 1).includes("/");
}

function planSortKey(page: WikiPage) {
  const path = displayWikiPath(page.path);
  if (path.endsWith("/wiki/plans/mvp/index.html")) return "01";
  if (path.startsWith("/wiki/plans/mvp/stage-")) return `01-${path}`;
  if (path.endsWith("/wiki/plans/zzz_completed/index.html")) return "99";
  if (path.startsWith("/wiki/plans/zzz_completed/")) return `99-${path}`;
  return `02-${path}`;
}

function isCompletedPage(page: WikiPage) {
  return pageStatus(page) === "complete";
}

function currentPlanWorkPath(pages: WikiPage[], roots: WikiPage[], workspace: WorkspaceResponse | null) {
  const derived = firstIncompleteWorkPath(pages, roots);
  if (derived) return derived;
  const currentPath = workspace?.status?.currentPath;
  if (currentPath) return currentPath;
  return pages.find((page) => page.currentState === "current-unit")?.path || pages.find((page) => page.currentState === "current-plan")?.path || "";
}

function firstIncompleteWorkPath(pages: WikiPage[], roots: WikiPage[]) {
  for (const root of roots) {
    if (isCompletedPage(root)) continue;
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
  const basePath = normalizedPath.endsWith("/index.html") ? normalizedPath.slice(0, -"/index.html".length) : normalizedPath.replace(/\.html$/, "");
  return normalizedSelected.startsWith(`${basePath}/`);
}

function titleForPath(path: string, pages: WikiPage[]) {
  return pages.find((page) => page.path === path)?.title || path.split("/").pop() || "Wiki";
}

function agentLaunchCommand(layout: LayoutResponse | null) {
  return layout?.panels?.find((panel) => panel.role === "agent" || panel.name === "agent")?.command?.trim() || "";
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
  if (route.kind !== "wiki") {
    return { scope: route.kind, scopeKind: "app", planPath: null };
  }
  if (route.path.includes("/plans/")) {
    return { scope: route.path, scopeKind: "plan", planPath: route.path };
  }
  return { scope: route.path, scopeKind: "wiki", planPath: null };
}

async function sendInput(sessionId: string, input: string) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    body: { input },
  });
}

async function sendResize(sessionId: string, cols: number, rows: number) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/resize`, {
    method: "POST",
    body: { cols, rows },
  });
}

function normalizeTerminalInput(data: string) {
  if (data === "\x1b\x1b[D") return "\x1bb";
  if (data === "\x1b\x1b[C") return "\x1bf";
  return data;
}

function stripTerminalDisplayControlSequences(data: string) {
  return String(data || "").replace(/\x1b\[\?2026[hl]/g, "");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default App;
