import { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, FolderOpen, Loader2, Maximize2, Minimize2, Play, Plus } from "lucide-react";
import { MdxPlanRenderer } from "@/components/MdxPlanRenderer";
import { BeamSurface } from "@/components/ui/beam-surface";
import { Button } from "@/components/ui/button";
import { NewProjectView } from "@/components/views/NewProjectView";
import { AdoptingView, PendingImportView, ProjectsView } from "@/components/views/ProjectsView";
import { SettingsView } from "@/components/views/SettingsView";
import { UnitGalleryView } from "@/components/views/UnitGalleryView";
import { appendImportLog } from "@/lib/import-log";
import { cn, DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";
import { fetchUnitScreenshotImages, type UnitScreenshotImageData } from "@/lib/api";
import { defaultWikiPath, displayWikiPath, isDeletablePlanRootPage, isReactRenderedMdxPath, isUnitPage, titleForPath } from "@/lib/wiki-pages";
import type { AdoptInspectResponse, AdoptProjectResponse, CommandAction, ImportOnboardingRunRecord, PlanPageActionState, PlanningInterviewStatus, PlanningQuestion, PlanningQuestionAnswer, ProjectGroup, ProjectRecord, ReviewWorkflow, SettingsResponse, SourceDocumentInput, ViewRoute, WikiPage, WikiSourceResponse } from "@/lib/types";

export function WorkspacePane(props: {
  activePlanState: PlanPageActionState;
  activeProject: ProjectRecord | null;
  activeImportPlanningRun: ImportOnboardingRunRecord | null;
  hasLoadedProjects: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  onCreateProject: (input: { title: string; document: string; documentType: string; sourceDocuments?: SourceDocumentInput[]; initializeGit: boolean }) => Promise<ProjectRecord | void>;
  onInspectProject: (root: string) => Promise<AdoptInspectResponse>;
  onAdoptProject: (input: { root: string }) => Promise<AdoptProjectResponse | void>;
  onCancelImportPlanningTurn: () => Promise<void>;
  onNavigate: (route: ViewRoute) => void;
  onAnswerPlanningQuestion: (answers: PlanningQuestionAnswer[]) => Promise<void>;
  onPlanImportedProject: (project: ProjectRecord) => Promise<void>;
  onRetryAdoption: (project: ProjectRecord) => Promise<void>;
  onResumeImportPlanning: () => void;
  onRemoveProject: (project: ProjectRecord, deleteFiles: boolean) => Promise<void>;
  onDeletePlan: (path: string) => Promise<void>;
  onOpenProjectEnv: (initialKey?: string, reason?: string) => void;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onReviewScreenshots: (unitPath: string) => void;
  onSendCommandToTerminal: (command: string) => void;
  onToggleWikiTask: (text: string, checked: boolean) => Promise<void>;
  onToggleExpanded: () => void;
  onSwitchProject: (project: ProjectRecord) => void;
  planningActivity: string;
  planningWorkstream: string[];
  lastPlanningAnswer: string;
  pendingImportProject: ProjectRecord | null;
  isImportPlanningView: boolean;
  canResumeImportPlanning: boolean;
  planningInterviewStatus: PlanningInterviewStatus;
  planningQuestions: PlanningQuestion[];
  projectGroups: ProjectGroup[];
  reviewWorkflows: ReviewWorkflow[];
  route: ViewRoute;
  settings: SettingsResponse | null;
  wikiError: string;
  wikiHtml: string;
  wikiSource: WikiSourceResponse | null;
  wikiPath: string;
  wikiPages: WikiPage[];
  wikiPageStatuses: Record<string, string>;
}) {
  const isFirstProject = props.hasLoadedProjects && props.projectGroups.length === 0;
  const unitScreenshotPath = (() => {
    const page = props.wikiPages.find((candidate) => displayWikiPath(candidate.path) === displayWikiPath(props.wikiPath));
    return page && isUnitPage(page) ? displayWikiPath(page.path) : "";
  })();
  const [unitScreenshots, setUnitScreenshots] = useState<UnitScreenshotImageData[]>([]);
  const screenshotProjectId = props.activeProject?.id || "";
  useEffect(() => {
    if (!unitScreenshotPath) {
      setUnitScreenshots([]);
      return;
    }
    let active = true;
    setUnitScreenshots([]);
    void fetchUnitScreenshotImages(unitScreenshotPath, props.activeProject).then((result) => {
      if (active) setUnitScreenshots(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitScreenshotPath, screenshotProjectId]);
  if (props.route.kind === "projects") {
    return <ProjectsView groups={props.projectGroups} onNewProject={() => props.onNavigate({ kind: "new-project" })} onOpenProject={props.onSwitchProject} onRemoveProject={props.onRemoveProject} />;
  }
  if (props.route.kind === "new-project") {
    return <NewProjectView isFirstProject={isFirstProject} onCreateProject={props.onCreateProject} onInspectProject={props.onInspectProject} onAdoptProject={props.onAdoptProject} />;
  }
  if (props.route.kind === "settings") {
    return <SettingsView activeProject={props.activeProject} onOpenProjectEnv={props.onOpenProjectEnv} settings={props.settings} />;
  }
  if (props.route.kind === "unit-gallery") {
    return <UnitGalleryView activeProject={props.activeProject} onOpenUnit={(path) => props.onNavigate({ kind: "wiki", path })} wikiPages={props.wikiPages} />;
  }
  if (props.pendingImportProject) {
    return <PendingImportView project={props.pendingImportProject} />;
  }
  const adoptionStatus = props.activeProject?.importPlanning?.status;
  if (adoptionStatus === "adopting" || adoptionStatus === "adoptionFailed") {
    return (
      <AdoptingView
        project={props.activeProject!}
        activity={props.planningActivity}
        workstream={props.planningWorkstream}
        onRetry={() => { if (props.activeProject) void props.onRetryAdoption(props.activeProject); }}
      />
    );
  }
  if (props.hasLoadedProjects && !props.activeProject) {
    return <NewProjectView isFirstProject={isFirstProject} onCreateProject={props.onCreateProject} onInspectProject={props.onInspectProject} onAdoptProject={props.onAdoptProject} />;
  }
  const isActivePlanPage = displayWikiPath(props.wikiPath) === displayWikiPath(props.activePlanState.currentPath);
  if (props.isImportPlanningView) {
    return (
      <ImportedPlanningQAView
        activeProject={props.activeProject}
        activeRun={props.activeImportPlanningRun}
        activity={props.planningActivity}
        workstream={props.planningWorkstream}
        lastAnswer={props.lastPlanningAnswer}
        onAnswer={props.onAnswerPlanningQuestion}
        onCancelRun={props.onCancelImportPlanningTurn}
        onStart={() => props.activeProject ? props.onPlanImportedProject(props.activeProject) : Promise.resolve()}
        questions={props.planningQuestions}
        status={props.planningInterviewStatus}
      />
    );
  }
  if (displayWikiPath(props.wikiPath) === defaultWikiPath) {
    return (
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-12 shrink-0 items-center justify-between border-b bg-background px-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Button
                aria-label={props.isExpanded ? "Restore sidebars" : "Expand document"}
                className="size-8"
                size="icon"
                title={props.isExpanded ? "Restore sidebars" : "Expand document"}
                variant="outline"
                onClick={props.onToggleExpanded}
              >
                {props.isExpanded ? <Minimize2 aria-hidden="true" data-icon="inline-start" /> : <Maximize2 aria-hidden="true" data-icon="inline-start" />}
              </Button>
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plans</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CommandBar activePlanState={props.activePlanState} canResumeImportPlanning={props.canResumeImportPlanning} onResumeImportPlanning={props.onResumeImportPlanning} onRunCommand={props.onRunCommand} />
            </div>
          </div>
          <PlansIndexEmptyState onCreatePlan={() => props.onRunCommand("new-plan")} />
        </div>
      </section>
    );
  }
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-12 shrink-0 items-center justify-between border-b bg-background px-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Button
              aria-label={props.isExpanded ? "Restore sidebars" : "Expand document"}
              className="size-8"
              size="icon"
              title={props.isExpanded ? "Restore sidebars" : "Expand document"}
              variant="outline"
              onClick={props.onToggleExpanded}
            >
              {props.isExpanded ? <Minimize2 aria-hidden="true" data-icon="inline-start" /> : <Maximize2 aria-hidden="true" data-icon="inline-start" />}
            </Button>
            <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titleForPath(props.wikiPath, props.wikiPages).replace(/\.[^.]+$/, "")}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {unitScreenshots.length ? (
              <Button size="sm" variant="outline" onClick={() => props.onReviewScreenshots(unitScreenshotPath)}>
                <Camera aria-hidden="true" data-icon="inline-start" />
                Review ({unitScreenshots.length})
              </Button>
            ) : null}
            <CommandBar activePlanState={props.activePlanState} canResumeImportPlanning={props.canResumeImportPlanning} onResumeImportPlanning={props.onResumeImportPlanning} onRunCommand={props.onRunCommand} />
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {props.isLoading ? (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Loading wiki page
            </div>
          ) : null}
          {props.wikiError ? (
            <WikiErrorState error={props.wikiError} onNewProject={() => props.onNavigate({ kind: "new-project" })} onProjects={() => props.onNavigate({ kind: "projects" })} />
          ) : props.wikiSource && isReactRenderedMdxPath(props.wikiPath) ? (
            <MdxPlanRenderer
              canDeletePlan={isDeletablePlanRootPage(props.wikiPath, props.wikiPages)}
              markdown={props.wikiSource.markdown}
              onDeletePlan={() => props.onDeletePlan(props.wikiPath)}
              onNavigate={(path) => props.onNavigate({ kind: "wiki", path })}
              onProposeChange={(prompt) => props.onRunCommand("modify", { prompt })}
              onSendCommand={props.onSendCommandToTerminal}
              onToggleTask={props.onToggleWikiTask}
              pageStatuses={props.wikiPageStatuses}
              path={props.wikiPath}
              status={isActivePlanPage ? "active" : props.wikiSource.status}
              source={props.wikiSource.source}
              unitScreenshots={unitScreenshots}
              validationWarnings={props.wikiSource.validationWarnings}
            />
          ) : (
            <iframe className="size-full border-0 bg-background" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" srcDoc={embeddedWikiHtml(props.wikiHtml)} title="Wiki page" />
          )}
        </div>
      </div>
    </section>
  );
}

export function PlansIndexEmptyState({ onCreatePlan }: { onCreatePlan: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
      <BeamSurface className="flex max-w-lg flex-col items-center gap-5 rounded-md border bg-card/90 p-8 text-center shadow-sm" colorVariant="ocean" cols={3} rows={3} strength={0.24}>
        <div className="grid size-14 place-items-center rounded-md border bg-card">
          <BookOpen aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>
        <div className="grid gap-2">
          <h1 className="font-ui m-0 text-3xl font-semibold tracking-tight">No active plans</h1>
          <p className="m-0 text-base leading-7 text-muted-foreground">Create a plan to start a new implementation track.</p>
        </div>
        <Button className="min-h-12 px-6 text-base" onClick={onCreatePlan}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          New Plan
        </Button>
      </BeamSurface>
    </div>
  );
}

export function WikiErrorState({ error, onNewProject, onProjects }: { error: string; onNewProject: () => void; onProjects: () => void }) {
  const missing = isMissingFileError(error);
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <BeamSurface className="flex max-w-lg flex-col items-center gap-4 rounded-md border bg-card/90 p-8 text-center shadow-sm" colorVariant="sunset" cols={3} rows={3} strength={0.22}>
        <div className="grid size-12 place-items-center rounded-md border bg-card">
          <FolderOpen aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
        <div className="grid gap-2">
          <h2 className="font-ui m-0 text-2xl font-semibold tracking-tight">{missing ? "Project files are unavailable" : "Wiki page unavailable"}</h2>
          <p className="m-0 text-sm text-muted-foreground">
            {missing ? "The selected project points to files that no longer exist. Pick another project or create a new one." : "hyperwiki could not load this wiki page."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onProjects}>Projects</Button>
          <Button variant="outline" onClick={onNewProject}>New Project</Button>
        </div>
      </BeamSurface>
    </div>
  );
}

export function embeddedWikiHtml(html: string) {
  const style = "<style id=\"hyperwiki-embedded-style\">.wiki-header{display:none!important}.wiki-page{padding-top:32px!important}.wiki-page>h1+p:has(a[href*='/wiki/plans/mvp/stage-']){display:none!important}</style>";
  const script = `<script id="hyperwiki-embedded-navigation">
document.addEventListener("click", function(event) {
  var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
  if (!link) return;
  var url;
  try {
    url = new URL(link.getAttribute("href"), window.location.href);
  } catch (_) {
    return;
  }
  var path = url.pathname;
  var projectWikiMatch = path.match(/^\\/projects\\/[^/]+(\\/wiki\\/.*)$/);
  if (projectWikiMatch) path = projectWikiMatch[1];
  if (!path.startsWith("/wiki/")) return;
  event.preventDefault();
  window.parent.postMessage({ type: "hyperwiki:navigate", path: path + url.search + url.hash }, "*");
});
</script>`;
  if (!html.trim()) return html;
  if (html.includes("hyperwiki-embedded-style")) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${style}${script}</head>`);
  return `${style}${script}${html}`;
}

export function isMissingFileError(error: string) {
  return error.includes("No such file or directory") || error.includes("os error 2");
}

export function CommandBar({
  activePlanState,
  canResumeImportPlanning,
  onResumeImportPlanning,
  onRunCommand,
}: {
  activePlanState: PlanPageActionState;
  canResumeImportPlanning: boolean;
  onResumeImportPlanning: () => void;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
}) {
  const executeLabel = activePlanState.currentUnitLabel ? `execute ${activePlanState.currentUnitLabel.toLowerCase()}` : "execute";
  return (
    <div className="flex items-center gap-2">
      {canResumeImportPlanning ? (
        <Button size="sm" onClick={onResumeImportPlanning}>
          <Play aria-hidden="true" data-icon="inline-start" />
          Resume Q&A
        </Button>
      ) : null}
      {activePlanState.isPlanPage && activePlanState.isComplete ? null : (
        <Button size="sm" variant="outline" onClick={() => onRunCommand("modify")}>
          modify
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={!activePlanState.canExecute} onClick={() => onRunCommand("execute-main")}>
        {executeLabel}
      </Button>
    </div>
  );
}

export function ImportedPlanningQAView({
  activeProject,
  activeRun,
  activity,
  workstream,
  lastAnswer,
  onAnswer,
  onCancelRun,
  onStart,
  questions,
  status,
}: {
  activeProject: ProjectRecord | null;
  activeRun: ImportOnboardingRunRecord | null;
  activity: string;
  workstream: string[];
  lastAnswer: string;
  onAnswer: (answers: PlanningQuestionAnswer[]) => Promise<void>;
  onCancelRun: () => Promise<void>;
  onStart: () => Promise<void>;
  questions: PlanningQuestion[];
  status: PlanningInterviewStatus;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const hasStartedRef = useRef("");
  const otherAnswerRef = useRef<HTMLTextAreaElement | null>(null);

  async function start() {
    appendImportLog(`Imported Q&A view start clicked project=${activeProject?.id || "none"}`);
    setIsStarting(true);
    try {
      await onStart();
      setHasStarted(true);
    } finally {
      setIsStarting(false);
    }
  }

  useEffect(() => {
    if (!activeProject) return;
    if (hasStartedRef.current === activeProject.id) return;
    hasStartedRef.current = activeProject.id;
    appendImportLog(`Imported Q&A view auto-start project=${activeProject.id}`);
    void start();
  }, [activeProject?.id]);

  useEffect(() => {
    setSelectedOptions({});
    setOtherAnswers({});
  }, [questions.map((question) => question.id).join("|")]);

  function answerForQuestion(question: PlanningQuestion) {
    const selected = selectedOptions[question.id] || "";
    return selected === "__other__" ? (otherAnswers[question.id] || "").trim() : selected.trim();
  }

  async function submitAnswers(nextAnswers: PlanningQuestionAnswer[]) {
    const trimmed = nextAnswers
      .map((item) => ({ question: item.question, answer: item.answer.trim() }))
      .filter((item) => item.answer);
    if (!trimmed.length) return;
    setIsAnswering(true);
    try {
      await onAnswer(trimmed);
      setSelectedOptions({});
      setOtherAnswers({});
    } finally {
      setIsAnswering(false);
    }
  }

  async function cancelRun() {
    setIsCancelling(true);
    try {
      await onCancelRun();
    } finally {
      setIsCancelling(false);
    }
  }

  const canSubmitBatch = questions.length > 1 && questions.every((question) => answerForQuestion(question)) && !isAnswering;
  const title = "Planning Q&A";
  const waitingLabel = status === "streaming"
    ? "Checking Codex output"
    : lastAnswer ? "Waiting for next question" : "Waiting for first question";
  const activityLabel = questions.length ? "Planning activity" : waitingLabel;
  const isRetryableFailure = status === "stalled" || status === "schema_mismatch" || status === "failed";
  const isRunning = Boolean(activeRun && activeRun.status === "running") || ["starting", "waiting_for_question", "streaming", "answering"].includes(status) || isStarting;
  const showActivityPane = !isRetryableFailure
    && (status === "starting" || status === "waiting_for_question" || status === "streaming" || status === "answering" || isStarting || Boolean(activity) || workstream.length > 0);
  const description = "Answer questions and make important decisions to create your project.";

  return (
    <main className="min-h-0 overflow-auto bg-background antialiased">
      <div className="grid min-h-full place-items-start px-5 pt-8 md:px-8 md:pt-12">
      <section className="mt-2 grid w-full max-w-3xl gap-5 rounded-lg border bg-card/92 p-5 shadow-sm md:p-6">
        <div className="grid gap-3">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creating project</p>
          <h1 className="font-ui m-0 text-4xl font-semibold leading-tight tracking-tight text-balance">{title}</h1>
          <p className="m-0 text-base leading-7 text-muted-foreground text-pretty">{description}</p>
        </div>
        {questions.length ? (
          <div className="grid gap-4">
            {questions.length > 1 ? (
              <p className="m-0 rounded-md bg-secondary px-3 py-2 text-sm leading-6 text-secondary-foreground">
                Answer these related decisions together so the next planning turn can move faster.
              </p>
            ) : null}
            {questions.map((question, questionIndex) => (
              <div className="grid gap-4 rounded-md border bg-background p-4" key={question.id}>
                <div className="grid gap-2">
                  <h2 className="font-ui m-0 text-xl font-semibold leading-snug tracking-tight">{question.question}</h2>
                  {question.recommendedAnswer ? (
                    <p className="m-0 rounded-md bg-secondary px-3 py-2 text-sm leading-6 text-secondary-foreground">
                      <span className="font-semibold">Recommended:</span> {question.recommendedAnswer}
                    </p>
                  ) : null}
                  {question.reasoning ? <p className="m-0 text-sm leading-6 text-muted-foreground">{question.reasoning}</p> : null}
                </div>
                {question.options.length ? (
                  <div className="grid gap-2">
                    {question.options.map((option, index) => {
                      const selected = selectedOptions[question.id] === option.label;
                      return (
                        <button
                          className={cn(
                            "grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-secondary",
                            selected && "border-primary bg-secondary text-secondary-foreground",
                          )}
                          disabled={isAnswering}
                          key={`${question.id}:${index}:${option.label}`}
                          onClick={() => {
                            setSelectedOptions((current) => ({ ...current, [question.id]: option.label }));
                            if (questions.length === 1) {
                              void submitAnswers([{ question, answer: option.label }]);
                            }
                          }}
                          type="button"
                        >
                          <span className="grid gap-1">
                            <span>{option.label}</span>
                            {option.description ? <span className="text-xs leading-5 text-muted-foreground">{option.description}</span> : null}
                          </span>
                          {index === 0 ? <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">recommended</span> : null}
                        </button>
                      );
                    })}
                    <button
                      className={cn(
                        "flex min-h-11 items-center justify-between gap-3 rounded-md border border-dashed bg-card px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-secondary",
                        selectedOptions[question.id] === "__other__" && "border-primary bg-secondary text-secondary-foreground",
                      )}
                      disabled={isAnswering}
                      onClick={() => {
                        setSelectedOptions((current) => ({ ...current, [question.id]: "__other__" }));
                        if (questions.length === 1) window.setTimeout(() => otherAnswerRef.current?.focus(), 0);
                      }}
                      type="button"
                    >
                      <span>None of the above</span>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">add note</span>
                    </button>
                  </div>
                ) : null}
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const answer = otherAnswers[question.id] || "";
                    if (questions.length === 1) void submitAnswers([{ question, answer }]);
                  }}
                >
                  <label className="text-sm font-semibold" htmlFor={`planning-other-answer-${question.id}`}>Other</label>
                  <textarea
                    {...DISABLE_TEXT_CORRECTION_PROPS}
                    className="min-h-24 rounded-md border bg-card px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    id={`planning-other-answer-${question.id}`}
                    onChange={(event) => {
                      setSelectedOptions((current) => ({ ...current, [question.id]: "__other__" }));
                      setOtherAnswers((current) => ({ ...current, [question.id]: event.target.value }));
                    }}
                    placeholder="None of the above. Use this instead..."
                    ref={questionIndex === 0 ? otherAnswerRef : undefined}
                    value={otherAnswers[question.id] || ""}
                  />
                  {questions.length === 1 ? (
                    <div className="flex justify-end">
                      <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={!answerForQuestion(question) || isAnswering} type="submit">
                        {isAnswering ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
                        Send Other
                      </Button>
                    </div>
                  ) : null}
                </form>
              </div>
            ))}
            {questions.length > 1 ? (
              <div className="flex justify-end">
                <Button
                  className="min-h-10 active:scale-[0.96] transition-transform"
                  disabled={!canSubmitBatch}
                  onClick={() => void submitAnswers(questions.map((question) => ({ question, answer: answerForQuestion(question) })))}
                  type="button"
                >
                  {isAnswering ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
                  Send Answers
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {showActivityPane ? (
          <div className="grid gap-3 rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {!questions.length || isRunning ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                <span className="truncate">{activityLabel}</span>
              </div>
              {activeRun ? (
                <span className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-[11px] text-secondary-foreground">
                  {activeRun.phase}
                </span>
              ) : null}
            </div>
            <div className="max-h-72 min-h-44 overflow-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-5 text-secondary-foreground shadow-inner">
              {workstream.length ? (
                workstream.map((line, index) => <p className="m-0 whitespace-pre-wrap" key={`${index}:${line}`}>{line}</p>)
              ) : (
                <p className="m-0 whitespace-pre-wrap">{activity || "Starting the planning agent"}</p>
              )}
            </div>
          </div>
        ) : null}
        {!questions.length && isRetryableFailure ? (
          <div className="grid gap-3 rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
            <div className="grid gap-1">
              <h2 className="m-0 text-base font-semibold text-foreground">{status === "stalled" ? "Codex stalled" : status === "schema_mismatch" ? "Invalid planning question" : "Codex turn failed"}</h2>
              <p className="m-0 leading-6">{activity || "The import-planning turn did not produce a usable structured question."}</p>
            </div>
            {workstream.length ? (
              <div className="max-h-64 overflow-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-5 text-secondary-foreground shadow-inner">
                {workstream.map((line, index) => <p className="m-0 whitespace-pre-wrap" key={`${index}:${line}`}>{line}</p>)}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {isRunning && activeRun?.runId ? (
            <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={isCancelling} variant="outline" onClick={() => void cancelRun()} type="button">
              {isCancelling ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
              Cancel Run
            </Button>
          ) : null}
          <Button className="min-h-10 active:scale-[0.96] transition-transform" disabled={isStarting || !activeProject || !["idle", "stalled", "schema_mismatch", "failed"].includes(status)} onClick={start} type="button">
            {isStarting ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Play aria-hidden="true" data-icon="inline-start" />}
            {isStarting ? "Starting Q&A" : isRetryableFailure || hasStarted ? "Retry Q&A" : status !== "idle" ? "Q&A Running" : "Start Q&A"}
          </Button>
        </div>
      </section>
      </div>
    </main>
  );
}
