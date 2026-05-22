import { useEffect, useMemo, useState } from "react";
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
  LayoutDashboard,
  Loader2,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Square,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hyperwikiApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type ViewRoute =
  | { kind: "wiki"; path: string }
  | { kind: "projects" }
  | { kind: "new-project" }
  | { kind: "settings" };

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

const defaultWikiPath = "/wiki/index.html";

function App() {
  const [route, setRoute] = useState<ViewRoute>(() => routeFromLocation());
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
  const [wikiHtml, setWikiHtml] = useState("");
  const [wikiError, setWikiError] = useState("");
  const [isWikiLoading, setIsWikiLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectListResponse>({});
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [preview, setPreview] = useState<AppPreviewResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [isUpNextOpen, setIsUpNextOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);

  const currentWikiPath = route.kind === "wiki" ? route.path : defaultWikiPath;
  const terminalScope = useMemo(() => scopeForRoute(route), [route]);
  const groupedWikiPages = useMemo(() => groupWikiPages(wikiPages), [wikiPages]);
  const projectGroups = useMemo(() => normalizeProjectGroups(projects), [projects]);

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
    if (route.kind !== "wiki") return;
    let cancelled = false;
    setIsWikiLoading(true);
    setWikiError("");
    hyperwikiApi
      .text(withProjectQuery(route.path, activeProject))
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
    const [wikiResult, projectsResult, workspaceResult, previewResult, settingsResult] = await Promise.allSettled([
      hyperwikiApi.json<WikiListResponse>("/api/wiki"),
      hyperwikiApi.json<ProjectListResponse>("/api/projects"),
      hyperwikiApi.json<WorkspaceResponse>("/api/workspace"),
      hyperwikiApi.json<AppPreviewResponse>("/api/app-preview"),
      hyperwikiApi.json<SettingsResponse>("/api/settings"),
    ]);

    if (wikiResult.status === "fulfilled") setWikiPages(wikiResult.value.pages || []);
    if (projectsResult.status === "fulfilled") {
      setProjects(projectsResult.value);
      setActiveProject(findActiveProject(projectsResult.value));
    }
    if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
    if (previewResult.status === "fulfilled") setPreview(previewResult.value);
    if (settingsResult.status === "fulfilled") setSettings(settingsResult.value);

    const rejected = [wikiResult, projectsResult, workspaceResult, previewResult, settingsResult].find((result) => result.status === "rejected");
    setStatus(rejected ? "Some workspace data is unavailable" : "Workspace loaded");
  }

  async function loadSessions() {
    setIsSessionsLoading(true);
    try {
      const response = await hyperwikiApi.json<SessionsResponse>(`/api/sessions?scope=${encodeURIComponent(terminalScope.scope)}`);
      setSessions(response.sessions || []);
    } catch {
      setSessions([]);
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
      await hyperwikiApi.json("/api/terminal/start", {
        method: "POST",
        body: {
          name,
          role,
          scope: terminalScope.scope,
          scope_kind: terminalScope.scopeKind,
          plan_path: terminalScope.planPath,
        },
      });
      await loadSessions();
      setStatus(`${name} started`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function closeSession(sessionId: string) {
    setStatus("Closing session");
    try {
      await hyperwikiApi.request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      await loadSessions();
      setStatus("Session closed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar
        activeProject={activeProject}
        isProjectsOpen={isProjectsOpen}
        isUpNextOpen={isUpNextOpen}
        onNavigate={navigate}
        onRefresh={loadBaseData}
        onSwitchProject={switchProject}
        preview={preview}
        projectGroups={projectGroups}
        setIsProjectsOpen={setIsProjectsOpen}
        setIsUpNextOpen={setIsUpNextOpen}
        status={status}
        workspace={workspace}
      />
      <section className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_minmax(340px,0.78fr)] overflow-hidden max-xl:grid-cols-[250px_minmax(0,1fr)]">
        <WikiSidebar
          currentPath={currentWikiPath}
          groups={groupedWikiPages}
          onNavigate={(path) => navigate({ kind: "wiki", path })}
          route={route}
        />
        <WorkspacePane
          isLoading={isWikiLoading}
          onNavigate={navigate}
          projectGroups={projectGroups}
          route={route}
          settings={settings}
          wikiError={wikiError}
          wikiHtml={wikiHtml}
          wikiPath={currentWikiPath}
          wikiPages={wikiPages}
        />
        <TerminalPane
          isLoading={isSessionsLoading}
          onCloseSession={closeSession}
          onRefresh={loadSessions}
          onStart={startTerminal}
          scope={terminalScope}
          sessions={sessions}
        />
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
    <header className="grid min-h-12 grid-cols-[280px_minmax(0,1fr)_auto] items-center border-b bg-card px-3 text-sm max-xl:grid-cols-[250px_minmax(0,1fr)_auto]">
      <button className="flex min-w-0 items-center gap-3 text-left font-bold" onClick={() => props.onNavigate({ kind: "wiki", path: defaultWikiPath })} type="button">
        <LayoutDashboard aria-hidden="true" className="size-5 text-primary" />
        <span className="truncate">hyperwiki</span>
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => props.setIsUpNextOpen(!props.isUpNextOpen)}>
            <Activity aria-hidden="true" data-icon="inline-start" />
            Up Next
            <ChevronDown aria-hidden="true" data-icon="inline-end" />
          </Button>
          {props.isUpNextOpen ? <UpNextPopover workspace={props.workspace} /> : null}
        </div>
        <div className="relative min-w-0">
          <Button size="sm" variant="ghost" onClick={() => props.setIsProjectsOpen(!props.isProjectsOpen)}>
            <FolderGit2 aria-hidden="true" data-icon="inline-start" />
            <span className="max-w-64 truncate">{props.activeProject?.name || "Projects"}</span>
            <ChevronDown aria-hidden="true" data-icon="inline-end" />
          </Button>
          {props.isProjectsOpen ? <ProjectsPopover groups={props.projectGroups} onSwitchProject={props.onSwitchProject} /> : null}
        </div>
        <span className="truncate text-muted-foreground">{props.status}</span>
      </div>
      <div className="flex items-center gap-2">
        {props.preview?.url ? (
          <Button asChild size="sm" variant="outline">
            <a href={props.preview.url} rel="noreferrer" target="_blank">
              <ExternalLink aria-hidden="true" data-icon="inline-start" />
              Preview
            </a>
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" onClick={props.onRefresh} title="Refresh workspace">
          <RefreshCw aria-hidden="true" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => props.onNavigate({ kind: "settings" })} title="Settings">
          <Settings aria-hidden="true" />
        </Button>
      </div>
    </header>
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

function ProjectsPopover({ groups, onSwitchProject }: { groups: ProjectGroup[]; onSwitchProject: (project: ProjectRecord) => void }) {
  return (
    <div className="absolute left-0 top-10 z-20 max-h-[70vh] w-[28rem] overflow-auto border bg-popover p-2 text-popover-foreground shadow-lg">
      {groups.length ? (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div className="flex flex-col gap-1" key={group.projectSlug}>
              <div className="px-2 text-xs font-bold uppercase text-muted-foreground">{group.name}</div>
              {group.checkouts.map((project) => (
                <button
                  className="grid gap-1 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
                  key={project.id}
                  onClick={() => onSwitchProject(project)}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-bold">
                    <Circle aria-hidden="true" className={cn("size-2 fill-current", project.active ? "text-primary" : "text-muted-foreground")} />
                    {project.worktreeSlug || project.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{project.root}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-2 text-sm text-muted-foreground">No projects available.</div>
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
      <div className="flex min-h-11 items-center gap-2 border-b px-3 text-xs font-bold uppercase text-muted-foreground">
        <BookOpen aria-hidden="true" className="size-4" />
        Wiki
      </div>
      <div className="flex gap-2 border-b p-2">
        <Button className="flex-1 justify-start" size="sm" variant={props.route.kind === "projects" ? "secondary" : "ghost"} onClick={() => props.onNavigate("/projects")}>
          <FolderGit2 aria-hidden="true" data-icon="inline-start" />
          Projects
        </Button>
        <Button className="flex-1 justify-start" size="sm" variant={props.route.kind === "settings" ? "secondary" : "ghost"} onClick={() => props.onNavigate("/settings")}>
          <Settings aria-hidden="true" data-icon="inline-start" />
          Settings
        </Button>
      </div>
      <nav className="min-h-0 flex-1 overflow-auto p-2">
        {props.groups.map((group) => (
          <section className="mb-4 flex flex-col gap-1" key={group.label}>
            <h2 className="px-2 text-xs font-bold uppercase text-muted-foreground">{group.label}</h2>
            {group.pages.map((page) => (
              <button
                className={cn(
                  "grid w-full gap-1 rounded-md px-2 py-2 text-left text-sm hover:bg-secondary",
                  props.currentPath === page.path && props.route.kind === "wiki" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
                )}
                key={page.path}
                onClick={() => props.onNavigate(page.path)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 shrink-0" />
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
  onNavigate: (route: ViewRoute) => void;
  projectGroups: ProjectGroup[];
  route: ViewRoute;
  settings: SettingsResponse | null;
  wikiError: string;
  wikiHtml: string;
  wikiPath: string;
  wikiPages: WikiPage[];
}) {
  if (props.route.kind === "projects") {
    return <ProjectsView groups={props.projectGroups} onNewProject={() => props.onNavigate({ kind: "new-project" })} />;
  }
  if (props.route.kind === "new-project") {
    return <NewProjectView />;
  }
  if (props.route.kind === "settings") {
    return <SettingsView settings={props.settings} />;
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-background">
      <div className="flex min-h-11 items-center justify-between border-b bg-card px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="truncate font-bold">{titleForPath(props.wikiPath, props.wikiPages)}</span>
          <span className="truncate text-xs text-muted-foreground">{props.wikiPath}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline">
            <Command aria-hidden="true" data-icon="inline-start" />
            Execute
          </Button>
          <Button size="sm" variant="ghost">
            <Search aria-hidden="true" data-icon="inline-start" />
            Modify
          </Button>
          <Button size="sm" variant="ghost">
            <Plus aria-hidden="true" data-icon="inline-start" />
            New Plan
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {props.isLoading ? (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b bg-card px-3 py-2 text-xs text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading wiki page
          </div>
        ) : null}
        {props.wikiError ? (
          <div className="m-4 border bg-card p-4 text-sm text-destructive">{props.wikiError}</div>
        ) : (
          <iframe className="size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={props.wikiHtml} title="Wiki page" />
        )}
      </div>
    </section>
  );
}

function ProjectsView({ groups, onNewProject }: { groups: ProjectGroup[]; onNewProject: () => void }) {
  return (
    <section className="min-h-0 overflow-auto bg-background p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="m-0 text-xl font-bold">Projects</h1>
          <p className="m-0 text-sm text-muted-foreground">Registered workspaces and branch worktrees.</p>
        </div>
        <Button onClick={onNewProject}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New Project
        </Button>
      </div>
      <div className="grid gap-3">
        {groups.map((group) => (
          <article className="border bg-card p-3" key={group.projectSlug}>
            <h2 className="m-0 mb-2 text-sm font-bold uppercase text-muted-foreground">{group.name}</h2>
            <div className="grid gap-2">
              {group.checkouts.map((project) => (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border bg-background px-3 py-2" key={project.id}>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{project.worktreeSlug || project.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{project.root}</div>
                  </div>
                  <span className="text-xs font-bold uppercase text-muted-foreground">{project.available === false ? "missing" : project.active ? "active" : "ready"}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NewProjectView() {
  return (
    <section className="min-h-0 overflow-auto bg-background p-4">
      <div className="max-w-2xl border bg-card p-4">
        <h1 className="m-0 mb-2 text-xl font-bold">New Project</h1>
        <p className="m-0 text-sm text-muted-foreground">
          Project creation remains backed by the existing Tauri API. Batch 2 preserves this route in the React shell so the form workflow can be rebuilt against the same endpoint.
        </p>
      </div>
    </section>
  );
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

function TerminalPane(props: {
  isLoading: boolean;
  onCloseSession: (sessionId: string) => void;
  onRefresh: () => void;
  onStart: (role: "agent" | "cli") => void;
  scope: { scope: string; scopeKind: string; planPath: string | null };
  sessions: SessionRecord[];
}) {
  return (
    <aside className="flex min-h-0 flex-col border-l bg-card max-xl:hidden">
      <div className="flex min-h-11 items-center justify-between border-b px-3">
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
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {props.sessions.length ? (
          <div className="grid gap-2">
            {props.sessions.map((session) => (
              <article className="border bg-background p-3" key={session.id}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{session.name || session.role || session.kind || "Terminal"}</div>
                    <div className="truncate text-xs text-muted-foreground">{session.cwd || session.command || session.shell || session.id}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => props.onCloseSession(session.id)} title="Close session">
                    <Square aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="border px-2 py-1">{session.status || "unknown"}</span>
                  <span className="border px-2 py-1">{session.role || session.kind || "session"}</span>
                  {session.reconnectable ? <span className="border px-2 py-1">reconnectable</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-48 place-items-center border bg-background p-4 text-center text-sm text-muted-foreground">
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
  return `${path}${joiner}project=${encodeURIComponent(activeProject.projectSlug)}&worktree=${encodeURIComponent(activeProject.worktreeSlug)}`;
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
  const groups = new Map<string, WikiPage[]>();
  for (const page of pages.length ? pages : [{ title: "Home", path: defaultWikiPath }]) {
    const label = page.path.includes("/plans/") ? "Plans" : page.path.includes("/sources") ? "Sources" : "Wiki";
    groups.set(label, [...(groups.get(label) || []), page]);
  }
  return Array.from(groups.entries()).map(([label, groupedPages]) => ({ label, pages: groupedPages }));
}

function titleForPath(path: string, pages: WikiPage[]) {
  return pages.find((page) => page.path === path)?.title || path.split("/").pop() || "Wiki";
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

export default App;
