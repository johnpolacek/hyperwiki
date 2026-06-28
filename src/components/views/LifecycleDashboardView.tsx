import { ArrowRight, CheckCircle2, Circle, CircleDot, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { lifecyclePhases, type LifecyclePhaseState } from "@/lib/lifecycle";
import { displayWikiPath } from "@/lib/wiki-pages";
import type { CommandAction, ProjectRecord, ViewRoute, WikiPage } from "@/lib/types";

// The lifecycle dashboard: the 6 phases as a board with truthful status + gate
// state, an "Ask the Orchestrator" action, and a per-phase handoff that respects
// the enablement rule (only the active phase, with explicit reopen for cleared
// phases). Buttons drive the runCommandAction dispatch in App.tsx.
export function LifecycleDashboardView({ wikiPages, activeProject, onRunCommand, onNavigate }: {
  wikiPages: WikiPage[];
  activeProject: ProjectRecord | null;
  onRunCommand: (action: CommandAction, payload?: Record<string, string>) => void;
  onNavigate: (route: ViewRoute) => void;
}) {
  const phases = lifecyclePhases(wikiPages);
  const active = phases.find((phase) => phase.isActive);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Product Lifecycle</h1>
          <p className="text-sm text-muted-foreground">
            {active
              ? <>Active phase: <span className="font-medium text-foreground">{active.label}</span></>
              : "All phases complete — the lifecycle is done."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => onRunCommand("orchestrate")}>
          <Sparkles className="size-4" />
          Ask the Orchestrator
        </Button>
      </header>

      <ol className="flex flex-col gap-3">
        {phases.map((phase) => (
          <PhaseRow
            key={phase.phaseId}
            phase={phase}
            onHandoff={() => onRunCommand("lifecycle-phase", { phase: phase.phaseId })}
            onReopen={() => onRunCommand("lifecycle-phase", { phase: phase.phaseId, reopen: "true" })}
            onOpenPage={phase.page ? () => onNavigate({ kind: "wiki", path: displayWikiPath(phase.page!.path) }) : undefined}
          />
        ))}
      </ol>
    </div>
  );
}

function PhaseRow({ phase, onHandoff, onReopen, onOpenPage }: {
  phase: LifecyclePhaseState;
  onHandoff: () => void;
  onReopen: () => void;
  onOpenPage?: () => void;
}) {
  const Glyph = phase.status === "complete" ? CheckCircle2 : phase.status === "active" ? CircleDot : Circle;
  const glyphClass = phase.status === "complete"
    ? "text-emerald-500"
    : phase.status === "active"
      ? "text-primary"
      : "text-muted-foreground/40";

  return (
    <Card className={cn("flex flex-row items-center gap-4 p-4", phase.status === "locked" && "opacity-70")}>
      <Glyph className={cn("size-5 shrink-0", glyphClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{phase.phaseOrder}</span>
          {onOpenPage ? (
            <button type="button" onClick={onOpenPage} className="truncate text-left font-medium text-foreground hover:underline">
              {phase.label}
            </button>
          ) : (
            <span className="truncate font-medium text-foreground">{phase.label}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={phase.gateCleared ? "ok" : "idle"} withDot={false}>
            gate: {phase.gate} · {phase.gateCleared ? "cleared" : "open"}
          </StatusBadge>
          {phase.childPlan ? (
            <span className="truncate text-xs text-muted-foreground">sub-plan: {phase.childPlan}</span>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">
        {phase.status === "active" ? (
          <Button size="sm" onClick={onHandoff}>
            Hand off
            <ArrowRight className="size-4" />
          </Button>
        ) : phase.status === "complete" ? (
          <Button size="sm" variant="outline" onClick={onReopen}>
            <RotateCcw className="size-4" />
            Reopen
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Locked</span>
        )}
      </div>
    </Card>
  );
}
