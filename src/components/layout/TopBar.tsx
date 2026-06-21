import { LayoutDashboard, MessageSquareText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectRecord, ViewRoute } from "@/lib/types";

export function TopBar(props: {
  activeProject: ProjectRecord | null;
  homePath: string;
  onNavigate: (route: ViewRoute) => void;
  feedbackCount?: number;
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
        <Button className="h-8" size="sm" variant="ghost" onClick={() => props.onNavigate({ kind: "projects" })}>
          <LayoutDashboard aria-hidden="true" data-icon="inline-start" />
          Projects
        </Button>
        {props.activeProject && (props.feedbackCount || 0) > 0 ? (
          <Button className="h-8" size="sm" variant="ghost" onClick={() => props.onNavigate({ kind: "feedback-queue" })}>
            <MessageSquareText aria-hidden="true" data-icon="inline-start" />
            Feedback ({props.feedbackCount})
          </Button>
        ) : null}
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
