import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  ChevronDown,
  Circle,
  Command,
  ExternalLink,
  FileText,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  Loader2,
  PanelRight,
  Play,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Settings,
  Square,
  TerminalSquare,
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
  theme?: string;
  agentCommand?: string;
  codexCommand?: string;
  claudeCommand?: string;
  browserCommand?: string;
  mcpEnabled?: boolean;
  [key: string]: unknown;
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

const defaultWikiPath = "/wiki/index.html";

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
  const groupedWikiPages = useMemo(() => groupWikiPages(wikiPages), [wikiPages]);
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
    const [wikiResult, projectsResult, workspaceResult, previewResult, settingsResult, layoutResult, reviewResult] = await Promise.allSettled([
      hyperwikiApi.json<WikiListResponse>(withProjectQuery("/api/wiki", activeProject)),
      hyperwikiApi.json<ProjectListResponse>(withProjectQuery("/api/projects", activeProject)),
      hyperwikiApi.json<WorkspaceResponse>(withProjectQuery("/api/workspace", activeProject)),
      hyperwikiApi.json<AppPreviewResponse>(withProjectQuery("/api/app-preview", activeProject)),
      hyperwikiApi.json<SettingsResponse>("/api/settings"),
      hyperwikiApi.json<LayoutResponse>(withProjectQuery("/api/layout", activeProject)),
      hyperwikiApi.json<ReviewWorkflowResponse>(withProjectQuery("/api/review-workflows", activeProject)),
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

    const rejected = [wikiResult, projectsResult, workspaceResult, previewResult, settingsResult, layoutResult, reviewResult].find((result) => result.status === "rejected");
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

  function switchProject(project: ProjectRecord) {
    setActiveProject(project);
    setIsProjectsOpen(false);
    const nextPath = `/workspace/${project.projectSlug}/${project.worktreeSlug}#${currentWikiPath}`;
    window.history.pushState(null, "", nextPath);
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
    navigate({ kind: "projects" });
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

  const isUtilityRoute = route.kind === "projects" || route.kind === "new-project";

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
            groups={groupedWikiPages}
            onNavigate={(path) => navigate({ kind: "wiki", path })}
            route={route}
          />
        )}
        <WorkspacePane
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
        {isUtilityRoute ? null : <RightActionPane mode={sidePanelMode} onRunCommand={runCommandAction} onSetMode={setSidePanelMode} status={status} />}
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

function WikiSidebar(props: {
  currentPath: string;
  groups: Array<{ label: string; pages: WikiPage[] }>;
  onNavigate: (path: string) => void;
  route: ViewRoute;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r bg-card">
      <nav className="min-h-0 flex-1 overflow-auto p-4">
        {props.groups.map((group) => (
          <section className="mb-5 flex flex-col gap-2" key={group.label}>
            <h2 className="px-0 text-xs font-bold uppercase text-muted-foreground">{group.label}</h2>
            {group.pages.map((page) => (
              <button
                className={cn(
                  "grid w-full gap-1 rounded-md px-3 py-2 text-left text-sm transition-[background,color] hover:bg-secondary",
                  props.currentPath === page.path && props.route.kind === "wiki" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
                )}
                key={page.path}
                onClick={() => props.onNavigate(page.path)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", page.status === "completed" ? "bg-muted-foreground/30" : "bg-primary/70")} />
                  <span className="truncate font-bold">{page.title}</span>
                </span>
                {page.status || page.format ? (
                  <span className="truncate pl-6 text-xs text-muted-foreground">{[page.status, page.format].filter(Boolean).join(" / ")}</span>
                ) : null}
              </button>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}

function WorkspacePane(props: {
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
    return <SettingsView settings={props.settings} />;
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
          <iframe className="size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={props.wikiHtml} title="Wiki page" />
        )}
      </div>
    </section>
  );
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
      <header className="flex min-h-40 items-center border-b px-10">
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

function SettingsView({ settings }: { settings: SettingsResponse | null }) {
  const entries = settings ? Object.entries(settings).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)) : [];
  return (
    <section className="min-h-0 overflow-auto bg-background p-4">
      <div className="mb-4">
        <h1 className="m-0 text-xl font-bold">Settings</h1>
        <p className="m-0 text-sm text-muted-foreground">Runtime settings surfaced through the existing desktop API.</p>
      </div>
      <div className="grid gap-2">
        {entries.length ? (
          entries.map(([key, value]) => (
            <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-3 border bg-card px-3 py-2 text-sm" key={key}>
              <span className="font-bold">{key}</span>
              <span className="truncate text-muted-foreground">{String(value)}</span>
            </div>
          ))
        ) : (
          <div className="border bg-card p-4 text-sm text-muted-foreground">Settings are unavailable.</div>
        )}
      </div>
    </section>
  );
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
  isLoading: boolean;
  onCloseSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onRefresh: () => void;
  onRestartSession: (session: SessionRecord) => void;
  onStart: (role: "agent" | "cli") => void;
  onSelectSession: (sessionId: string) => void;
  scope: { scope: string; scopeKind: string; planPath: string | null };
  sessions: SessionRecord[];
}) {
  const activeSession = props.sessions.find((session) => session.id === props.activeSessionId) || props.sessions[0] || null;
  return (
    <aside className="flex min-h-0 flex-col border-l bg-card/88 shadow-[-1px_0_0_rgba(255,255,255,0.64)_inset] max-xl:hidden">
      <div className="flex min-h-11 items-center justify-between border-b px-3 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset]">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
          <PanelRight aria-hidden="true" className="size-4 text-muted-foreground" />
          Terminals
          {props.isLoading ? <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={props.onRefresh} title="Refresh terminals">
            <RefreshCw aria-hidden="true" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => props.onStart("agent")}>
            <Bot aria-hidden="true" data-icon="inline-start" />
            Agent
          </Button>
          <Button size="sm" onClick={() => props.onStart("cli")}>
            <TerminalSquare aria-hidden="true" data-icon="inline-start" />
            CLI
          </Button>
        </div>
      </div>
      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="font-bold uppercase">{props.scope.scopeKind}</span> {props.scope.scope}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {props.sessions.length ? (
          <>
            <div className="flex max-h-40 shrink-0 flex-col gap-2 overflow-auto border-b p-2">
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
          <div className="m-3 grid min-h-48 place-items-center border bg-background p-4 text-center text-sm text-muted-foreground">
            <div className="flex max-w-xs flex-col items-center gap-3">
              <TerminalSquare aria-hidden="true" className="size-8" />
              <span>No retained sessions for this scope.</span>
              <Button size="sm" onClick={() => props.onStart("cli")}>
                <Play aria-hidden="true" data-icon="inline-start" />
                Start CLI
              </Button>
            </div>
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

function groupWikiPages(pages: WikiPage[]) {
  const planPages = (pages.length ? pages : [{ title: "Home", path: defaultWikiPath }]).filter((page) => page.path.includes("/plans/"));
  if (planPages.length) {
    return [{ label: "Plans", pages: planPages }];
  }
  const groups = new Map<string, WikiPage[]>();
  for (const page of pages.length ? pages : [{ title: "Home", path: defaultWikiPath }]) {
    groups.set("Plans", [...(groups.get("Plans") || []), page]);
  }
  return Array.from(groups.entries()).map(([label, groupedPages]) => ({ label, pages: groupedPages }));
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
