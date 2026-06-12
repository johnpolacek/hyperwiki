import { LayoutDashboard, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AppPreviewResponse, ProjectGroup, ProjectRecord, ViewRoute, WorkspaceResponse } from "@/lib/types";

export function TopBar(props: {
  activeProject: ProjectRecord | null;
  homePath: string;
  isProjectsOpen: boolean;
  onNavigate: (route: ViewRoute) => void;
  onRefresh: () => void;
  onSwitchProject: (project: ProjectRecord) => void;
  preview: AppPreviewResponse | null;
  projectGroups: ProjectGroup[];
  setIsProjectsOpen: (value: boolean) => void;
  status: string;
  workspace: WorkspaceResponse | null;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 overflow-hidden border-b bg-background px-3 text-sm">
      <button className="group flex min-w-0 items-center gap-3 rounded-md px-1.5 py-1 text-left font-mono transition-colors duration-150 hover:bg-muted" onClick={() => props.onNavigate({ kind: "wiki", path: props.homePath })} type="button">
        <BrandMark />
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">hyperwiki</span>
        {props.activeProject?.name ? (
          <>
            <span className="text-xs text-muted-foreground/50">/</span>
            <span className="truncate text-sm font-normal text-foreground">{props.activeProject.name}</span>
          </>
        ) : null}
      </button>
      <div className="flex items-center gap-2">
        <Popover open={props.isProjectsOpen} onOpenChange={props.setIsProjectsOpen}>
          <PopoverTrigger asChild>
            <Button className="h-8" size="sm" variant="ghost">
              <LayoutDashboard aria-hidden="true" data-icon="inline-start" />
              Projects
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[70vh] w-[25rem] overflow-auto">
            <ProjectsMenu groups={props.projectGroups} onClose={() => props.setIsProjectsOpen(false)} onNavigate={props.onNavigate} onSwitchProject={props.onSwitchProject} />
          </PopoverContent>
        </Popover>
        <Button className="h-8" size="sm" variant="ghost" onClick={() => props.onNavigate({ kind: "settings" })}>
          <Settings aria-hidden="true" data-icon="inline-start" />
          Settings
        </Button>
      </div>
    </header>
  );
}

export function BrandMark() {
  return (
    <span className="brand-dots" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

export function ProjectsMenu({
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
    <div>
      <div className="mb-4 flex flex-col gap-2">
        <button
          className="flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
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
          className="flex min-h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors duration-150 hover:bg-muted"
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
                "grid w-full gap-0.5 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted",
                group.checkouts.some((checkout) => checkout.active) && "border-primary/40 bg-primary/10",
              )}
              key={group.projectSlug}
              onClick={() => {
                onClose();
                onSwitchProject(project);
              }}
              type="button"
            >
              <span className="truncate text-sm font-semibold">{group.name || project.name}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{project.root}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">No projects available.</div>
      )}
    </div>
  );
}
