import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, GitBranch, KeyRound, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { XtermSession } from "@/components/terminal/XtermSession";
import { appendImportLog } from "@/lib/import-log";
import { openTerminalWebLink, isDetachedDevSession, isPendingTerminalSession, isVisibleTerminalPaneSession, previewDetachedDevSession, selectDevTerminalSession, terminalCollapsedSummary, terminalPaneLabel, terminalPaneStatusLabel, terminalStartupNotice, worktreePreviewForSlug } from "@/lib/terminal";
import { cn, DISABLE_TEXT_CORRECTION_PROPS, slugify } from "@/lib/utils";
import { titleForPath } from "@/lib/wiki-pages";
import { normalizedThinkingEffort, type AgentProviderAvailability, type AgentProviderId } from "@/lib/agent";
import type { AppPreviewResponse, ProjectRecord, RepoContextResponse, SessionRecord, ThinkingEffort, WorkspaceResponse } from "@/lib/types";
export function TerminalPane(props: {
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
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-l border-terminal-border bg-terminal-pane text-terminal-text max-xl:hidden">
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-terminal-border bg-terminal-toolbar px-3 text-xs">
        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-terminal-muted" />
          <strong className="min-w-0 max-w-[260px] truncate font-medium text-terminal-text" title={`Current work: ${terminalContextLabel}. Checkout: ${branchLabel}`}>{terminalContextLabel}</strong>
          {canCreateWorktree || !hasGit ? (
            <Popover open={isWorktreeOpen} onOpenChange={(open) => (open ? openWorktreePopover() : setIsWorktreeOpen(false))}>
              <PopoverTrigger asChild>
                <Button className="h-7 border-terminal-accent bg-terminal-accent/15 px-3 text-xs font-bold text-terminal-text hover:bg-terminal-accent/25" size="sm" variant="outline" type="button">
                  {hasGit ? "+ worktree" : "init git"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(420px,calc(100vw-32px))] border-terminal-border bg-terminal-header text-terminal-text">
                <form className="grid gap-3 p-1" onSubmit={submitWorktree}>
                  <strong className="text-sm">New worktree</strong>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold uppercase text-terminal-muted">Branch</span>
                    <input {...DISABLE_TEXT_CORRECTION_PROPS} className="w-full rounded-md border border-terminal-border bg-terminal-bg px-2.5 py-2 text-xs text-terminal-text outline-none focus:border-terminal-accent" disabled={!hasGit} value={worktreeBranch} onChange={(event) => setWorktreeBranch(event.target.value)} />
                  </label>
                  <dl className="grid gap-1.5 rounded-md border border-terminal-border bg-terminal-bg p-2.5">
                    <div className="flex items-center justify-between gap-3"><dt className="text-[11px] font-bold uppercase text-terminal-muted">Slug</dt><dd className="truncate text-right">{worktreeSlug}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[11px] font-bold uppercase text-terminal-muted">Path</dt><dd className="truncate text-right">{worktreePreview}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-[11px] font-bold uppercase text-terminal-muted">Preview</dt><dd className="truncate text-right">{previewUrl}</dd></div>
                  </dl>
                  {worktreeStatus ? <p className="m-0 text-[11px] leading-snug text-terminal-warning">{worktreeStatus}</p> : null}
                  <footer className="flex items-center justify-end gap-3">
                    <Button className="h-8 border-terminal-text bg-terminal-text px-3 text-xs font-extrabold text-terminal-bg hover:bg-terminal-text/90" disabled={isCreatingWorktree} type="submit">
                      {hasGit ? "Create Worktree" : "init git"}
                    </Button>
                  </footer>
                </form>
              </PopoverContent>
            </Popover>
          ) : null}
          <Button className="h-7 border-terminal-border bg-transparent px-3 text-xs font-bold text-terminal-text hover:border-terminal-accent hover:bg-transparent hover:text-terminal-accent disabled:cursor-not-allowed disabled:border-terminal-border disabled:text-terminal-muted/70" disabled={!props.activeProject} size="sm" title="Edit project .env.local" variant="outline" type="button" onClick={() => props.onOpenProjectEnv(undefined, "terminal")}>
            env
          </Button>
          {props.isLoading ? <Loader2 aria-hidden="true" className="size-4 animate-spin text-terminal-muted" /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.agentProviders.codexAvailable && props.agentProviders.claudeAvailable ? (
            <label className="flex items-center gap-1.5 text-terminal-muted">
              <span>agent</span>
              <select className="h-7 rounded border border-terminal-border bg-terminal-pane px-2 pr-7 text-terminal-text outline-none" value={props.agentProvider} onChange={(event) => props.onAgentProviderChange(event.target.value === "claude" ? "claude" : "codex")} aria-label="Coding agent provider for new agent terminals">
                <option value="codex">codex</option>
                <option value="claude">claude</option>
              </select>
            </label>
          ) : null}
          {props.agentProvider === "claude" ? null : (
            <label className="flex items-center gap-1.5 text-terminal-muted">
              <span>think</span>
              <select className="h-7 rounded border border-terminal-border bg-terminal-pane px-2 pr-7 text-terminal-text outline-none" value={props.thinkingEffort} onChange={(event) => props.onThinkingEffortChange(normalizedThinkingEffort(event.target.value))} aria-label="Default thinking effort for new agent terminals">
                <option value="low">low</option>
                <option value="medium">med</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </label>
          )}
          <Button className="h-7 border-terminal-border bg-transparent px-3 text-xs font-bold text-terminal-text hover:border-terminal-accent hover:bg-transparent hover:text-terminal-accent" size="sm" variant="outline" onClick={() => props.onStart("agent")}>
            + agent
          </Button>
          <Button className="h-7 border-terminal-border bg-transparent px-3 text-xs font-bold text-terminal-text hover:border-terminal-accent hover:bg-transparent hover:text-terminal-accent" size="sm" variant="outline" onClick={() => props.onStart("cli")}>
            + cli
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <section ref={(element) => { if (devPaneSession) setSessionSectionRef(devPaneSession.id, element); }} className={cn("flex shrink-0 flex-col overflow-hidden border-b border-terminal-border bg-terminal-toolbar", devPaneNeedsTerminalSpace && "min-h-0 flex-1")}>
          <header className="flex min-h-9 shrink-0 items-center justify-between gap-3 px-3 text-xs">
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" type="button" onClick={devPaneSession ? toggleDevCollapsed : revealDevTerminal} aria-expanded={Boolean(devPaneSession && !collapsedSessionIds.has(devPaneSession.id))} title={devPaneSession && collapsedSessionIds.has(devPaneSession.id) ? "Expand dev terminal" : devPaneSession ? "Collapse dev terminal" : "Load dev session details"}>
              {devPaneSession && !collapsedSessionIds.has(devPaneSession.id) ? <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-terminal-muted" /> : <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-terminal-muted" />}
              <strong className="shrink-0 font-mono text-[11px] font-medium lowercase text-terminal-text">dev</strong>
              <span className={cn("shrink-0", devIsRunning ? "text-terminal-success" : "text-terminal-muted")}>{devIsRunning ? "running" : "not running"}</span>
            </button>
            {devPreviewUrl ? (
              <button className="min-w-0 truncate font-mono text-[11px] text-terminal-accent hover:text-terminal-accent/80" type="button" title={`Open ${devPreviewUrl}`} onClick={() => void openTerminalWebLink(devPreviewUrl)}>
                {devPreviewUrl}
              </button>
            ) : (
              <span className="min-w-0 truncate text-terminal-muted/70">{props.preview?.reason || runDevTitle}</span>
            )}
            {devPaneIsDetached ? (
              <Button className="h-7 border-terminal-accent bg-terminal-accent/15 px-2.5 text-xs font-bold text-terminal-text hover:bg-terminal-accent/25" size="sm" variant="outline" type="button" onClick={props.onRestartDev}>
                restart
              </Button>
            ) : devIsRunning ? (
              <Button className="h-7 border-terminal-border bg-transparent px-2.5 text-xs font-bold text-terminal-text hover:border-terminal-danger hover:bg-transparent hover:text-terminal-danger disabled:cursor-not-allowed disabled:border-terminal-border disabled:text-terminal-muted/70" disabled={!canStopDev} size="sm" variant="outline" type="button" onClick={props.onStopDev}>
                stop
              </Button>
            ) : (
              <Button className="h-7 border-terminal-border bg-transparent px-2.5 text-xs font-bold text-terminal-text hover:border-terminal-accent hover:bg-transparent hover:text-terminal-accent disabled:cursor-not-allowed disabled:border-terminal-border disabled:text-terminal-muted/70" disabled={!canRunDev} size="sm" title={props.preview?.reason || runDevTitle} variant="outline" type="button" onClick={props.onRunDev}>
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
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-terminal-border bg-terminal-header px-3 py-2 text-xs text-terminal-text">
            <p className="m-0 min-w-0 truncate">
              Missing env key detected: <code>{props.terminalEnvHint.key}</code>
            </p>
            <Button className="h-7 shrink-0 border-terminal-accent bg-terminal-accent/10 px-3 text-xs font-bold text-terminal-text hover:bg-terminal-accent/20" size="sm" variant="outline" type="button" onClick={() => props.onOpenProjectEnv(props.terminalEnvHint?.key, "terminal-detected")}>
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
                <section ref={(element) => setSessionSectionRef(session.id, element)} className={cn("flex min-h-0 flex-col overflow-hidden border-terminal-border bg-terminal-bg first:border-t-0 not-first:border-t", isCollapsed ? "shrink-0" : "flex-1")} key={session.id} onFocusCapture={() => props.onSelectSession(session.id)} onMouseDown={() => props.onSelectSession(session.id)}>
                  <header className="flex min-h-8 shrink-0 items-center justify-between gap-3 border-b border-terminal-border px-3 text-xs">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" type="button" onClick={(event) => { event.stopPropagation(); toggleSessionCollapsed(session.id); }} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand terminal" : "Collapse terminal"}>
                      {isCollapsed ? <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-terminal-muted" /> : <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-terminal-muted" />}
                      <span className="min-w-0 truncate font-mono text-[11px] font-medium lowercase text-terminal-text">{terminalPaneLabel(session, index)}</span>
                      <span className="shrink-0 text-[11px] text-terminal-muted">{paneStatus}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button className="size-7 shrink-0 text-terminal-muted hover:bg-transparent hover:text-terminal-muted" size="icon" variant="ghost" type="button" onClick={(event) => { event.stopPropagation(); props.onCloseSession(session.id); }} title="Close terminal" aria-label="Close terminal">
                        <X aria-hidden="true" data-icon="inline-start" />
                      </Button>
                    </div>
                  </header>
                  {isCollapsed ? (
                    <div className="flex min-h-8 items-center justify-between gap-3 bg-terminal-toolbar px-3 py-2 text-[11px] text-terminal-muted">
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

export function TerminalSessionTab(props: {
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

export function PendingTerminalSession({ session }: { session: SessionRecord }) {
  const failed = session.status === "failed";
  return (
    <div className="flex h-full min-h-0 flex-col justify-between bg-terminal-bg p-3 font-mono text-[13px] text-terminal-text">
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-terminal-muted">
          {failed ? null : <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
          <span>{failed ? "Agent terminal failed to start" : "Starting Codex"}</span>
        </div>
        {failed && session.shell ? <p className="m-0 max-w-full whitespace-pre-wrap text-terminal-danger">{session.shell}</p> : null}
        {!failed ? <p className="m-0 text-terminal-muted">Preparing the terminal session...</p> : null}
      </div>
      <p className="m-0 truncate text-[11px] text-terminal-muted/70">{session.command || session.id}</p>
    </div>
  );
}

export function DetachedDevSession({ session, onRestart }: { session: SessionRecord; onRestart: () => void }) {
  return (
    <div className="grid min-h-[180px] place-items-center bg-terminal-bg p-6 text-center">
      <div className="grid max-w-[360px] gap-3">
        <strong className="text-sm text-terminal-text">Dev process still running</strong>
        <p className="m-0 text-xs leading-relaxed text-terminal-muted">
          Hyperwiki started this dev process before the app restarted. Terminal output cannot be replayed, but Hyperwiki can restart it.
        </p>
        <div className="flex justify-center gap-2">
          <Button className="h-8 border-terminal-accent bg-terminal-accent/15 px-3 text-xs font-bold text-terminal-text hover:bg-terminal-accent/25" size="sm" variant="outline" type="button" onClick={onRestart}>
            restart
          </Button>
        </div>
        <span className="text-[11px] text-terminal-muted/70">pid {session.pid || "unknown"}</span>
      </div>
    </div>
  );
}
