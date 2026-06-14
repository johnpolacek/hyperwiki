import { useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageHeader } from "@/components/views/SettingsView";
import { fetchUnitScreenshot, fetchUnitScreenshots } from "@/lib/api";
import { cleanPageTitle, compactUnitLabel, displayWikiPath, pageStatus } from "@/lib/wiki-pages";
import type { ProjectRecord, WikiPage } from "@/lib/types";

interface GalleryEntry {
  unitPath: string;
  capturedAt: number;
  count: number;
  dataUrl: string | null;
}

export function UnitGalleryView({ activeProject, wikiPages, onOpenUnit }: {
  activeProject: ProjectRecord | null;
  wikiPages: WikiPage[];
  onOpenUnit: (path: string) => void;
}) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const projectId = activeProject?.id || "";

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void fetchUnitScreenshots(activeProject).then(async (list) => {
      const withImages = await Promise.all(
        list.map(async (shot) => ({
          unitPath: shot.unitPath,
          capturedAt: shot.capturedAt,
          count: shot.count,
          dataUrl: (await fetchUnitScreenshot(shot.unitPath, activeProject))?.dataUrl ?? null,
        })),
      );
      if (active) {
        setEntries(withImages);
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <section className="min-h-0 overflow-auto bg-background">
      <div className="min-h-full">
        <SettingsPageHeader
          title="Screenshots"
          description="Visual proof captured with agent-browser when units were completed."
        />
        {isLoading ? (
          <div className="flex items-center gap-2 px-8 py-10 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading screenshots
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center text-muted-foreground">
            <div className="grid size-12 place-items-center rounded-md border bg-card">
              <Camera aria-hidden="true" className="size-5" />
            </div>
            <p className="m-0 max-w-md text-sm leading-6">
              No unit screenshots yet. Execute a unit with a browser-observable result and the agent will capture one here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-8 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => {
              const page = wikiPages.find((candidate) => displayWikiPath(candidate.path) === displayWikiPath(entry.unitPath));
              const title = page ? cleanPageTitle(page) : entry.unitPath.split("/").pop()?.replace(/\.mdx$/, "") || entry.unitPath;
              const label = page ? compactUnitLabel(page) : "";
              const status = page ? pageStatus(page) : "";
              return (
                <button
                  key={entry.unitPath}
                  className="group block text-left"
                  type="button"
                  onClick={() => onOpenUnit(entry.unitPath)}
                >
                  <Card className="overflow-hidden transition-colors group-hover:border-primary/50">
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      {entry.dataUrl ? (
                        <img
                          alt={`Screenshot of ${title}`}
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          src={entry.dataUrl}
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground">
                          <Camera aria-hidden="true" className="size-6" />
                        </div>
                      )}
                      {entry.count > 1 ? (
                        <span className="absolute right-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm">{entry.count}</span>
                      ) : null}
                    </div>
                    <CardHeader className="gap-1 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="truncate text-sm">{title}</CardTitle>
                        {status === "complete" ? <Badge variant="secondary">complete</Badge> : null}
                      </div>
                      <CardDescription className="text-xs">
                        {[label, formatCapturedAt(entry.capturedAt)].filter(Boolean).join(" · ")}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function formatCapturedAt(capturedAt: number) {
  if (!capturedAt) return "";
  try {
    return `Captured ${new Date(capturedAt * 1000).toLocaleString()}`;
  } catch {
    return "";
  }
}
