import { useEffect, useState } from "react";
import { Loader2, MessageSquareText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingsPageHeader } from "@/components/views/SettingsView";
import { fetchFeedback } from "@/lib/api";
import { titleForPath } from "@/lib/wiki-pages";
import type { FeedbackItem, ProjectRecord, WikiPage } from "@/lib/types";

// Pending screenshot feedback, grouped by unit, drained to the agent on demand.
export function FeedbackQueueView({ activeProject, wikiPages, onOpenUnit, onDispatchUnit, onRemoveItem }: {
  activeProject: ProjectRecord | null;
  wikiPages: WikiPage[];
  onOpenUnit: (path: string) => void;
  onDispatchUnit: (unitPath: string, items: FeedbackItem[]) => Promise<void> | void;
  onRemoveItem: (id: string) => Promise<void> | void;
}) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyUnit, setBusyUnit] = useState<string | null>(null);
  const projectId = activeProject?.id || "";

  async function reload() {
    const all = await fetchFeedback(activeProject);
    setItems(all.filter((item) => item.status === "pending"));
    setIsLoading(false);
  }
  useEffect(() => {
    setIsLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const groups: [string, FeedbackItem[]][] = [];
  for (const item of items) {
    const found = groups.find(([path]) => path === item.unitPath);
    if (found) found[1].push(item);
    else groups.push([item.unitPath, [item]]);
  }

  async function sendGroup(unitPath: string, groupItems: FeedbackItem[]) {
    setBusyUnit(unitPath);
    try {
      await onDispatchUnit(unitPath, groupItems);
    } finally {
      setBusyUnit(null);
      await reload();
    }
  }
  async function removeOne(id: string) {
    await onRemoveItem(id);
    await reload();
  }

  return (
    <section className="min-h-0 overflow-auto bg-background">
      <div className="min-h-full">
        <SettingsPageHeader
          title="Feedback queue"
          description="Queued screenshot feedback, grouped by unit. Send a unit's batch to the agent when you're ready."
        />
        {isLoading ? (
          <div className="flex items-center gap-2 px-8 py-10 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading queue
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center text-muted-foreground">
            <div className="grid size-12 place-items-center rounded-md border bg-card">
              <MessageSquareText aria-hidden="true" className="size-5" />
            </div>
            <p className="m-0 max-w-md text-sm leading-6">
              No queued feedback. Open a unit's screenshots (Review UI), comment on any that need changes, and add them to the queue.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-8">
            {groups.map(([unitPath, groupItems]) => (
              <Card key={unitPath} className="gap-0 overflow-hidden py-0">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                  <button className="min-w-0 truncate text-left text-sm font-semibold hover:underline" type="button" onClick={() => onOpenUnit(unitPath)}>
                    {titleForPath(unitPath, wikiPages)}
                  </button>
                  <Button className="shrink-0" disabled={busyUnit === unitPath} size="sm" onClick={() => void sendGroup(unitPath, groupItems)}>
                    {busyUnit === unitPath ? "Sending…" : `Send to agent (${groupItems.length})`}
                  </Button>
                </div>
                <div className="grid gap-2 p-4">
                  {groupItems.map((item) => (
                    <div className="flex items-start justify-between gap-3 rounded-md border bg-background p-2.5" key={item.id}>
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">{item.screenshot}</span>
                        <p className="m-0 text-sm leading-6">{item.comment}</p>
                      </div>
                      <Button aria-label="Remove from queue" className="size-7 shrink-0 text-muted-foreground" size="icon" variant="ghost" onClick={() => void removeOne(item.id)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
