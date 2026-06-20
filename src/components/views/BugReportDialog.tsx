import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";
import { displayWikiPath } from "@/lib/wiki-pages";
import type { BugCreateInput, BugSeverity, ProjectRecord } from "@/lib/types";

const severities: BugSeverity[] = ["low", "medium", "high", "critical"];

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
  const defaultLinkedPlan = useMemo(() => {
    const path = displayWikiPath(currentPath);
    return path.startsWith("/wiki/plans/") ? path : "";
  }, [currentPath]);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [description, setDescription] = useState("");
  const [observed, setObserved] = useState("");
  const [expected, setExpected] = useState("");
  const [steps, setSteps] = useState("");
  const [linkedPlan, setLinkedPlan] = useState(defaultLinkedPlan);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSeverity("medium");
    setDescription("");
    setObserved("");
    setExpected("");
    setSteps("");
    setLinkedPlan(defaultLinkedPlan);
    setError("");
  }, [defaultLinkedPlan, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await onCreate({
        title: trimmedTitle,
        description: description.trim(),
        observed: observed.trim(),
        expected: expected.trim(),
        steps: steps.trim(),
        severity,
        currentRoute: displayWikiPath(currentPath),
        linkedPlan: linkedPlan.trim(),
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
      <DialogContent className="w-[min(calc(100vw-2rem),42rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Report Bug</DialogTitle>
          <DialogDescription>Create a wiki-backed bug report for this project.</DialogDescription>
        </DialogHeader>
        <form className="grid max-h-[70vh] gap-4 overflow-auto pr-1" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="bug-title">Title</Label>
            <Input
              {...DISABLE_TEXT_CORRECTION_PROPS}
              autoFocus
              id="bug-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Sidebar does not remember Bugs mode"
              value={title}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bug-severity">Severity</Label>
            <Select id="bug-severity" onChange={(event) => setSeverity(event.target.value as BugSeverity)} value={severity}>
              {severities.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bug-description">Description</Label>
            <Textarea
              {...DISABLE_TEXT_CORRECTION_PROPS}
              id="bug-description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What broke?"
              value={description}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="bug-observed">Observed</Label>
              <Textarea
                {...DISABLE_TEXT_CORRECTION_PROPS}
                className="min-h-24"
                id="bug-observed"
                onChange={(event) => setObserved(event.target.value)}
                placeholder="What happened"
                value={observed}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bug-expected">Expected</Label>
              <Textarea
                {...DISABLE_TEXT_CORRECTION_PROPS}
                className="min-h-24"
                id="bug-expected"
                onChange={(event) => setExpected(event.target.value)}
                placeholder="What should happen"
                value={expected}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bug-steps">Steps</Label>
            <Textarea
              {...DISABLE_TEXT_CORRECTION_PROPS}
              className="min-h-24"
              id="bug-steps"
              onChange={(event) => setSteps(event.target.value)}
              placeholder="1. Open..."
              value={steps}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bug-linked-plan">Linked plan or unit</Label>
            <Input
              {...DISABLE_TEXT_CORRECTION_PROPS}
              id="bug-linked-plan"
              onChange={(event) => setLinkedPlan(event.target.value)}
              placeholder="/wiki/plans/features/example.mdx"
              value={linkedPlan}
            />
          </div>
          {error ? <p className="m-0 text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={isSaving} type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={isSaving || !title.trim()} type="submit">
              {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
              Save Bug
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
