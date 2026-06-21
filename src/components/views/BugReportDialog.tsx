import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";
import { displayWikiPath } from "@/lib/wiki-pages";
import type { BugCreateInput, ProjectRecord } from "@/lib/types";

export function BugReportDialog({
  activeProject,
  currentPath,
  onCreate,
  onOpenChange,
  open,
}: {
  activeProject: ProjectRecord | null;
  currentPath: string;
  onCreate: (input: BugCreateInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setError("");
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const report = prompt.trim();
    if (!report) {
      setError("Describe the bug first.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await onCreate({
        title: titleFromPrompt(report),
        description: report,
        observed: "",
        expected: "",
        steps: "",
        severity: "medium",
        currentRoute: displayWikiPath(currentPath),
        linkedPlan: linkedPlanFromPath(currentPath),
        projectSlug: activeProject?.projectSlug || "",
        worktreeSlug: activeProject?.worktreeSlug || "",
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create bug.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSaving) onOpenChange(nextOpen); }}>
      <DialogContent className="w-[min(calc(100vw-2rem),38rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Report Bug</DialogTitle>
          <DialogDescription>Describe what is wrong. Hyperwiki will save it as a wiki-backed bug.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="bug-prompt">Bug</Label>
            <Textarea
              {...DISABLE_TEXT_CORRECTION_PROPS}
              autoFocus
              className="min-h-40 resize-y"
              id="bug-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="The Bugs sidebar takes me to New Project when there are no bugs yet."
              value={prompt}
            />
          </div>
          {error ? <p className="m-0 text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={isSaving} type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={isSaving || !prompt.trim()} type="submit">
              {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
              Report Bug
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function titleFromPrompt(prompt: string) {
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim())?.trim() || "Bug report";
  return firstLine.length > 72 ? `${firstLine.slice(0, 69).trimEnd()}...` : firstLine;
}

function linkedPlanFromPath(path: string) {
  const displayPath = displayWikiPath(path);
  return displayPath.startsWith("/wiki/plans/") ? displayPath : "";
}
