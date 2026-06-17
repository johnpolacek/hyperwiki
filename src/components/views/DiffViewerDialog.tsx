import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchCommitChanges, fetchRecentCommits, fetchWorkingTreeChanges, openFileInEditor } from "@/lib/api";
import type { GitChangeSet, GitCommitSummary, GitFileChange, ProjectRecord } from "@/lib/types";

const WORKING_KEY = "working";

// The `</>` diff viewer. Position 0 is the working tree (uncommitted changes);
// positions 1..N step back through recent commits. We fetch only per-file +/-
// stats — never patch text — and open files in the IDE on click.
export function DiffViewerDialog({ open, onOpenChange, activeProject }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProject: ProjectRecord | null;
}) {
  const [pos, setPos] = useState(0);
  const [commits, setCommits] = useState<GitCommitSummary[]>([]);
  const [cache, setCache] = useState<Record<string, GitChangeSet | null>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const commit = pos === 0 ? null : commits[pos - 1];
  const currentKey = pos === 0 ? WORKING_KEY : commit?.hash ?? WORKING_KEY;
  const current = cache[currentKey];
  const total = 1 + commits.length;
  const isLoading = loadingKey === currentKey;

  // (Re)load the working tree and commit list whenever the dialog opens for a project.
  useEffect(() => {
    if (!open || !activeProject) return;
    let cancelled = false;
    setPos(0);
    setCommits([]);
    setCache({});
    setLoadingKey(WORKING_KEY);
    void Promise.all([fetchWorkingTreeChanges(activeProject), fetchRecentCommits(activeProject)]).then(([changes, log]) => {
      if (cancelled) return;
      setCache({ [WORKING_KEY]: changes });
      setCommits(log);
      setLoadingKey((key) => (key === WORKING_KEY ? null : key));
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeProject?.id]);

  // Lazily fetch a commit's stats the first time the pager lands on it.
  useEffect(() => {
    if (!open || !activeProject || !commit || commit.hash in cache) return;
    let cancelled = false;
    setLoadingKey(commit.hash);
    void fetchCommitChanges(commit.hash, activeProject).then((changes) => {
      if (cancelled) return;
      setCache((prev) => ({ ...prev, [commit.hash]: changes }));
      setLoadingKey((key) => (key === commit.hash ? null : key));
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeProject?.id, commit?.hash]);

  const openFile = async (file: GitFileChange) => {
    try {
      await openFileInEditor(file.path, activeProject);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open file.");
    }
  };

  const files = current?.files ?? [];
  const title = pos === 0 ? "Uncommitted changes" : commit?.subject || commit?.short || "Commit";
  const subtitle = pos === 0 ? "Working tree vs HEAD" : [commit?.short, commit?.author, commit?.relativeDate].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),46rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Changes</DialogTitle>
          <DialogDescription className="sr-only">Browse uncommitted changes and recent commits, and open files in your editor.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button aria-label="Newer" size="icon" variant="outline" onClick={() => setPos((value) => Math.max(0, value - 1))} disabled={pos === 0}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-sm font-medium">{title}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{subtitle}</div>
          </div>
          <Button aria-label="Older" size="icon" variant="outline" onClick={() => setPos((value) => Math.min(total - 1, value + 1))} disabled={pos >= total - 1}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{pos + 1} / {total}</span>
          {current?.isGit ? (
            <span className="font-mono tabular-nums">
              {files.length} {files.length === 1 ? "file" : "files"}
              {" · "}
              <span className="text-emerald-600 dark:text-emerald-400">+{current.totalAdditions}</span>
              {" "}
              <span className="text-destructive">−{current.totalDeletions}</span>
            </span>
          ) : null}
        </div>

        <ScrollArea className="-mx-2 h-[min(55vh,28rem)] border-t pt-2">
          <div className="px-2 pb-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Loading changes…
              </div>
            ) : !current?.isGit ? (
              <div className="py-12 text-center text-sm text-muted-foreground">This project is not a Git repository.</div>
            ) : files.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">{pos === 0 ? "No uncommitted changes." : "No file changes in this commit."}</div>
            ) : (
              <ul className="flex flex-col">
                {files.map((file) => (
                  <DiffFileRow key={`${file.status}:${file.path}`} file={file} onOpen={openFile} />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function DiffFileRow({ file, onOpen }: { file: GitFileChange; onOpen: (file: GitFileChange) => void }) {
  const meta = statusMeta(file.status);
  const deleted = file.status === "D";
  const additions = file.additions ?? 0;
  const deletions = file.deletions ?? 0;
  return (
    <li>
      <button
        className={cn(
          "group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
          deleted ? "cursor-default" : "hover:bg-muted",
        )}
        disabled={deleted}
        onClick={() => onOpen(file)}
        title={deleted ? "File was deleted" : "Open in editor"}
        type="button"
      >
        <span aria-label={meta.label} className={cn("w-4 shrink-0 text-center font-mono text-xs font-semibold", meta.className)} title={meta.label}>
          {meta.glyph}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {file.binary ? (
            <span className="text-muted-foreground">binary</span>
          ) : additions === 0 && deletions === 0 ? (
            <span className="text-muted-foreground">0</span>
          ) : (
            <>
              {additions > 0 ? <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span> : null}
              {deletions > 0 ? <span className="ml-1.5 text-destructive">−{deletions}</span> : null}
            </>
          )}
        </span>
        {deleted ? null : <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
      </button>
    </li>
  );
}

function statusMeta(status: string): { glyph: string; label: string; className: string } {
  switch (status) {
    case "A":
      return { glyph: "A", label: "Added", className: "text-emerald-600 dark:text-emerald-400" };
    case "M":
      return { glyph: "M", label: "Modified", className: "text-amber-600 dark:text-amber-400" };
    case "D":
      return { glyph: "D", label: "Deleted", className: "text-destructive" };
    case "R":
      return { glyph: "R", label: "Renamed", className: "text-sky-600 dark:text-sky-400" };
    case "?":
      return { glyph: "U", label: "Untracked", className: "text-muted-foreground" };
    default:
      return { glyph: status || "•", label: "Changed", className: "text-muted-foreground" };
  }
}
