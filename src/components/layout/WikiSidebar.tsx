import { useEffect, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Download, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { bugSortKey, childPlanPages, cleanPageTitle, currentPlanWorkPath, isBugPath, isBugReportPage, isClosedBugPage, isCompletedPage, isCompletedTopLevelPlanPage, isPlansIndexPage, isTopLevelPlanPage, pageStatus, pathContainsSelectedPage, planSortKey, type SidebarModel } from "@/lib/wiki-pages";
import { cn } from "@/lib/utils";
import type { ViewRoute, WikiPage, WorkspaceResponse } from "@/lib/types";

export function WikiSidebar(props: {
  currentPath: string;
  exportStatus: string;
  isExporting: boolean;
  model: SidebarModel;
  onCreateBug: () => void;
  onCreatePlan: () => void;
  onDownloadWikiMarkdownZip: () => Promise<void>;
  onOpenBugs: () => void;
  onOpenPlans: () => void;
  onNavigate: (path: string) => void;
  route: ViewRoute;
  workspace: WorkspaceResponse | null;
}) {
  const mode = isBugPath(props.currentPath) ? "bugs" : "plans";
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r bg-background">
      <nav className="flex h-full min-h-0 flex-col overflow-hidden">
        <section className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-2 flex min-h-9 items-center justify-between gap-2 px-1">
            <ToggleGroup
              aria-label="Sidebar work mode"
              className="min-w-0 gap-1"
              size="sm"
              type="single"
              value={mode}
              onValueChange={(value) => {
                if (value === "plans") props.onOpenPlans();
                if (value === "bugs") props.onOpenBugs();
              }}
            >
              <ToggleGroupItem className={sidebarModeClass(mode === "plans")} value="plans">Plans</ToggleGroupItem>
              <ToggleGroupItem className={sidebarModeClass(mode === "bugs")} value="bugs">Bugs</ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center gap-1">
              {mode === "plans" ? (
                <>
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
                </>
              ) : (
                <Button size="sm" type="button" variant="outline" onClick={props.onCreateBug}>
                  <Plus aria-hidden="true" data-icon="inline-start" />
                  Bug
                </Button>
              )}
            </div>
          </div>
          {mode === "plans" && props.exportStatus ? <p className="m-0 mb-2 px-1 text-xs text-muted-foreground" role="status">{props.exportStatus}</p> : null}
          {mode === "bugs" ? (
            <BugTree pages={props.model.bugs} currentPath={props.currentPath} onNavigate={props.onNavigate} />
          ) : (
            <PlanTree pages={props.model.plans} currentPath={props.currentPath} onNavigate={props.onNavigate} />
          )}
        </section>
        <details className="shrink-0 border-t bg-background p-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</summary>
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

function sidebarModeClass(active: boolean) {
  return cn(
    "h-8 rounded-md text-xs transition-colors",
    active
      ? "px-0 font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:text-muted-foreground"
      : "px-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function PlanTree({ pages, currentPath, onNavigate }: { pages: WikiPage[]; currentPath: string; onNavigate: (path: string) => void }) {
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

export function BugTree({ pages, currentPath, onNavigate }: { pages: WikiPage[]; currentPath: string; onNavigate: (path: string) => void }) {
  const sorted = pages.filter(isBugReportPage).sort((a, b) => bugSortKey(a).localeCompare(bugSortKey(b)));
  const active = sorted.filter((page) => !isClosedBugPage(page));
  const completed = sorted.filter(isClosedBugPage);
  if (!active.length && !completed.length) return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No bugs reported.</div>;
  return (
    <div className="grid gap-1">
      {active.map((page) => (
        <BugNode currentPath={currentPath} key={page.path} onNavigate={onNavigate} page={page} />
      ))}
      {completed.length ? (
        <details className="mt-2 grid gap-1" open={completed.some((page) => page.path === currentPath)}>
          <summary className="cursor-pointer list-none px-2 py-1 text-[11px] font-bold uppercase text-muted-foreground">Fixed Bugs</summary>
          <div className="mt-1 grid gap-1">
            {completed.map((page) => (
              <BugNode currentPath={currentPath} key={page.path} onNavigate={onNavigate} page={page} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function BugNode({ page, currentPath, onNavigate }: { page: WikiPage; currentPath: string; onNavigate: (path: string) => void }) {
  const selected = currentPath === page.path;
  const status = pageStatus(page) || "open";
  const severity = String(page.frontmatter?.severity || "medium");
  return (
    <button
      className={cn(
        "grid min-w-0 gap-1 rounded-md px-2 py-2 text-left transition-colors duration-150",
        selected
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
      type="button"
      onClick={() => onNavigate(page.path)}
    >
      <span className="truncate text-[13px] font-medium">{cleanPageTitle(page)}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <Badge className="h-5 px-1.5 text-[10px]" variant={status === "open" || status === "fixing" ? "default" : "secondary"}>{status}</Badge>
        <span className="truncate text-[11px] text-muted-foreground">{severity}</span>
      </span>
    </button>
  );
}

export function PlanNode({ page, pages, currentPath, currentWorkPath, onNavigate, depth = 0 }: { page: WikiPage; pages: WikiPage[]; currentPath: string; currentWorkPath: string; onNavigate: (path: string) => void; depth?: number }) {
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

export function SidebarPageButton({
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
        "relative grid min-h-8 min-w-0 grid-cols-[1rem_0.625rem_minmax(0,1fr)] items-center gap-1.5 rounded-md py-1 pe-2 pl-[calc(8px+var(--depth)*12px)] text-[13px] transition-colors duration-150",
        isSelected
          ? "bg-muted text-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-['']"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
      style={{ "--depth": depth } as CSSProperties}
    >
      {hasChildren ? (
        <button
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${cleanPageTitle(page)}`}
          className="grid size-4 place-items-center rounded text-muted-foreground transition-colors duration-150 hover:text-foreground"
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
          <span aria-label="Current work" className="size-[6px] rounded-full bg-emerald-500 opacity-80 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
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
