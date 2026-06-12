import { useState, type FormEvent } from "react";
import { FolderPlus, Loader2, Upload } from "lucide-react";
import { BeamSurface } from "@/components/ui/beam-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appendImportLog, clearImportLog, readImportLog } from "@/lib/import-log";
import { pendingImportedProject, writePendingImportProject } from "@/lib/pending-import";
import { DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";
import type { ProjectRecord, SourceDocumentInput } from "@/lib/types";

export function NewProjectView({
  isFirstProject = false,
  onCreateProject,
}: {
  isFirstProject?: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) => Promise<ProjectRecord | void>;
}) {
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState("");
  const [documentType, setDocumentType] = useState("markdown");
  const [initializeGit, setInitializeGit] = useState(true);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [handoffProject, setHandoffProject] = useState<ProjectRecord | null>(null);
  const [importLog, setImportLog] = useState<string[]>(() => readImportLog());

  function logImport(message: string, error?: unknown) {
    appendImportLog(message, error);
    setImportLog(readImportLog());
  }

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    clearImportLog();
    setImportLog([]);
    setIsSubmitting(true);
    setStatus(files.length === 1 ? `Reading ${files[0].name}` : `Reading ${files.length} files`);
    logImport(files.length === 1 ? `Reading ${files[0].name}` : `Reading ${files.length} selected files`);
    try {
      const sourceDocuments = await Promise.all(files.map(async (file) => {
        const content = await file.text();
        logImport(`Read ${content.length} bytes from ${file.name}`);
        return {
          name: file.name,
          documentType: sourceDocumentTypeForFile(file.name),
          content,
        };
      }));
      const nextType = sourceDocuments.length === 1 ? sourceDocuments[0].documentType : "markdown";
      const combinedDocument = combineSourceDocuments(sourceDocuments);
      const nextTitle = title || files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setDocument(combinedDocument);
      setDocumentType(nextType);
      setTitle(nextTitle);
      await createProjectAndStartPlanning({
        title: nextTitle.trim(),
        document: combinedDocument.trim(),
        documentType: nextType,
        sourceDocuments,
        initializeGit,
      });
    } catch (error) {
      logImport("hyperwiki import failed while reading the selected file bundle.", error);
      setStatus(error instanceof Error ? `Could not read import files: ${error.message}` : "Could not read the import files.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createProjectAndStartPlanning({
      title: title.trim(),
      document: document.trim(),
      documentType,
      initializeGit,
    });
  }

  async function createProjectAndStartPlanning(input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) {
    if (!input.title.trim() || !input.document.trim()) {
      setStatus("Add a project name and source brief before planning the MVP.");
      return;
    }
    const pendingProject = pendingImportedProject(input.title);
    let routed = false;
    const routeToWorkspace = (project = pendingProject) => {
      if (routed) return;
      routed = true;
      logImport(`Writing pending import marker ${project.projectSlug}/${project.worktreeSlug}`);
      writePendingImportProject(project);
      const target = `/workspace/${encodeURIComponent(project.projectSlug)}/${encodeURIComponent(project.worktreeSlug)}#/wiki/plans/index.mdx`;
      logImport(`Forcing workspace route ${target}`);
      window.location.assign(target);
    };
    setIsSubmitting(true);
    setHandoffProject(pendingProject);
    setStatus("Initializing project");
    logImport(`Handoff view set for ${pendingProject.projectSlug}/${pendingProject.worktreeSlug}`);
    logImport("Creating imported project");
    const fallbackTimer = window.setTimeout(routeToWorkspace, 900);
    void onCreateProject(input)
      .then((project) => {
        if (!project) return;
        window.clearTimeout(fallbackTimer);
        setHandoffProject(project);
        setStatus("Project imported. Opening planning workspace");
        logImport(`Created project ${project.name} (${project.id})`);
        routeToWorkspace(project);
      })
      .catch((error) => {
        window.clearTimeout(fallbackTimer);
        setHandoffProject(null);
        logImport("hyperwiki import agent handoff failed.", error);
        setStatus(error instanceof Error ? error.message : "Could not start agent-led planning.");
      });
  }

  if (handoffProject) {
    return (
      <section className="flex min-h-0 items-center justify-center bg-background/80 p-8">
        <BeamSurface className="grid max-w-md gap-3 rounded-md border bg-card/92 p-8 text-center shadow-sm" colorVariant="ocean" cols={3} rows={3} strength={0.28}>
          <Loader2 aria-hidden="true" className="mx-auto size-5 animate-spin text-muted-foreground" />
          <h1 className="font-ui m-0 text-2xl font-semibold tracking-tight">Opening {handoffProject.name}</h1>
          <p className="m-0 text-sm text-muted-foreground">Switching to the planning workspace and starting the agent.</p>
        </BeamSurface>
      </section>
    );
  }

  const heading = isFirstProject ? "Welcome to hyperwiki" : "New Project";
  const subhead = isFirstProject
    ? "Create your first project by importing a brief or source file. hyperwiki will do the rest."
    : "Import a brief or source file. hyperwiki will do the rest.";
  const canSubmitBrief = Boolean(title.trim() && document.trim());

  return (
    <section className="min-h-0 overflow-auto bg-background">
      <div className="min-h-full px-5 py-10 md:px-10 md:py-14">
        <div className="mx-auto grid w-full max-w-xl gap-8">
          <header className="px-1">
            <h1 className="font-ui m-0 text-3xl font-semibold leading-tight tracking-tight text-balance text-foreground md:text-4xl">{heading}</h1>
            <p className="m-0 mt-2 max-w-2xl text-base leading-7 text-muted-foreground text-pretty">
              {subhead}
            </p>
          </header>

          <div className="rounded-lg border bg-card shadow-xs">
          <form className="grid gap-6 p-6" data-testid="new-project-form" onSubmit={handleSubmit}>
          <label className="group flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-background px-6 text-center text-muted-foreground transition-colors duration-150 hover:border-primary hover:bg-muted/50 hover:text-foreground">
            <Upload aria-hidden="true" className="mb-4 size-8 text-muted-foreground transition-colors duration-150 group-hover:text-primary" />
            <span className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Import Project Doc</span>
            <small className="mt-3 text-xs text-muted-foreground">Markdown, HTML, or text files</small>
            <input className="sr-only" data-testid="project-file-input" type="file" accept=".md,.markdown,.html,.htm,.txt,.text,.csv,.tsv,.json,.yaml,.yml,text/*,application/json,application/x-yaml" multiple onChange={(event) => void handleFiles(event.target.files)} />
          </label>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
            <span className="h-px bg-border" />
            <span>OR</span>
            <span className="h-px bg-border" />
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-card-foreground">Project Name</span>
            <Input {...DISABLE_TEXT_CORRECTION_PROPS} autoComplete="off" placeholder="Enter project name" required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-card-foreground">Brief</span>
            <Textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-[9rem] resize-y" placeholder="Paste the project brief" required value={document} onChange={(event) => setDocument(event.target.value)} />
          </label>

          <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-card-foreground">
            <input className="size-4 accent-primary" checked={initializeGit} type="checkbox" onChange={(event) => setInitializeGit(event.target.checked)} />
            <span>Initialize Git and create an initial commit</span>
          </label>

          <Button className="min-h-11 w-full text-sm font-semibold disabled:border-border disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100" disabled={isSubmitting || !canSubmitBrief} type="submit">
            {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <FolderPlus aria-hidden="true" data-icon="inline-start" />}
            {isSubmitting ? "Starting Agent Planning" : "Start Agent Planning"}
          </Button>

          {status ? <p className="m-0 rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground" role="status">{status}</p> : null}
          <ImportLog lines={importLog} />
          </form>
          </div>
        </div>
      </div>
    </section>
  );
}


export function ImportLog({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="mt-4 rounded-md border bg-background p-3">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import Log</h3>
      <ol className="m-0 mt-2 grid gap-1 p-0 text-xs text-muted-foreground">
        {lines.map((line, index) => (
          <li className="list-none break-words" key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

export function documentSummary(document: string) {
  if (/^\s*(<!doctype html|<html[\s>])/i.test(document)) {
    const parsed = new DOMParser().parseFromString(document, "text/html");
    const summary = parsed.querySelector("meta[name='description']")?.getAttribute("content")
      || parsed.querySelector(".lede, p")?.textContent
      || parsed.body?.textContent
      || "";
    return summary.trim().replace(/\s+/g, " ").slice(0, 240);
  }
  return document
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

export function combineSourceDocuments(sourceDocuments: SourceDocumentInput[]) {
  if (sourceDocuments.length === 1) return sourceDocuments[0].content;
  return sourceDocuments
    .map((document) => `# Imported file: ${document.name}\n\nSource type: ${document.documentType}\n\n${document.content}`)
    .join("\n\n---\n\n");
}

export function sourceDocumentTypeForFile(name: string) {
  const lower = name.toLowerCase();
  if (/\.html?$/.test(lower)) return "html";
  if (/\.(json|ya?ml|csv|tsv|txt|text)$/.test(lower)) return "text";
  return "markdown";
}
