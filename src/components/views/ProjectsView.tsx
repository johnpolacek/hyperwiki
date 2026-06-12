import { useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { BeamSurface } from "@/components/ui/beam-surface";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectGroup, ProjectRecord } from "@/lib/types";

export function ProjectsView({
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

export function ProjectCard({
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

export function ProjectDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/86 px-3 py-3">
      <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-bold">{value}</div>
    </div>
  );
}

export function formatProjectDate(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function PendingImportView({ project }: { project: ProjectRecord }) {
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
