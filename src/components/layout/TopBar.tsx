import { useEffect, useRef } from "react";
import { LayoutDashboard, Plus, Settings } from "lucide-react";
import { BeamSurface } from "@/components/ui/beam-surface";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppPreviewResponse, ProjectGroup, ProjectRecord, ViewRoute, WorkspaceResponse } from "@/lib/types";

export function TopBar(props: {
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

export function BrandMark() {
  return (
    <span className="brand-dots" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}


export function UpNextPopover({ workspace }: { workspace: WorkspaceResponse | null }) {
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

export function ProjectsPopover({
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
