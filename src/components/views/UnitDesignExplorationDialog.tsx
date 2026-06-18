import { useEffect, useState } from "react";
import { ImagePlus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { ScreenshotCarousel } from "@/components/ScreenshotCarousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { UnitScreenshotImageData } from "@/lib/api";
import type { UnitExplorationMetadata } from "@/lib/types";

export type UnitExplorationMode = "new-mockups" | "redesign-from-screenshot";

export interface UnitDesignExplorationGenerateInput {
  mode: UnitExplorationMode;
  prompt: string;
  variantCount: number;
  sourceScreenshotName: string;
  sourceScreenshotPath: string;
}

export function UnitDesignExplorationDialog({
  open,
  unitPath,
  unitTitle,
  explorationDir,
  screenshotDir,
  images,
  screenshots,
  metadata,
  isGenerating,
  onOpenChange,
  onGenerate,
  onRefresh,
  onClear,
  onSelect,
}: {
  open: boolean;
  unitPath: string;
  unitTitle: string;
  explorationDir: string;
  screenshotDir: string;
  images: UnitScreenshotImageData[];
  screenshots: UnitScreenshotImageData[];
  metadata: UnitExplorationMetadata | null;
  isGenerating: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (input: UnitDesignExplorationGenerateInput) => void;
  onRefresh: () => void;
  onClear: () => void;
  onSelect: (candidateName: string, notes: string, textBrief: string) => void;
}) {
  const [mode, setMode] = useState<UnitExplorationMode>("new-mockups");
  const [variantCount, setVariantCount] = useState("3");
  const [prompt, setPrompt] = useState("");
  const [sourceScreenshotName, setSourceScreenshotName] = useState("");
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [textBrief, setTextBrief] = useState("");
  const current = images[Math.min(index, images.length - 1)];
  const selectedName = metadata?.selectedCandidate || "";

  useEffect(() => {
    if (!open) return;
    const metadataMode = metadata?.mode === "redesign-from-screenshot" ? "redesign-from-screenshot" : "new-mockups";
    setMode(metadataMode);
    setVariantCount(String(Math.min(Math.max(metadata?.imageCount || 3, 1), 4)));
    setPrompt(metadata?.prompt || "");
    setNotes(metadata?.notes || "");
    setTextBrief(metadata?.textBrief || "");
    setIndex(0);
    const metadataSourceName = metadata?.sourceScreenshotPath?.split("/").pop() || "";
    setSourceScreenshotName(metadataSourceName || screenshots[0]?.name || "");
  }, [open, unitPath, metadata, screenshots]);

  const submitGenerate = () => {
    const count = Math.min(Math.max(Number.parseInt(variantCount, 10) || 1, 1), 4);
    const sourceName = mode === "redesign-from-screenshot" ? sourceScreenshotName : "";
    onGenerate({
      mode,
      prompt: prompt.trim(),
      variantCount: count,
      sourceScreenshotName: sourceName,
      sourceScreenshotPath: sourceName ? `${screenshotDir}/${sourceName}` : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),62rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Explore designs — {unitTitle}</DialogTitle>
          <DialogDescription>
            Candidates are stored in <span className="font-mono">{explorationDir}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Mode</Label>
              <ToggleGroup
                className="w-full"
                type="single"
                value={mode}
                variant="outline"
                onValueChange={(value) => {
                  if (value === "new-mockups" || value === "redesign-from-screenshot") setMode(value);
                }}
              >
                <ToggleGroupItem className="flex-1" value="new-mockups">New</ToggleGroupItem>
                <ToggleGroupItem className="flex-1" value="redesign-from-screenshot">Redesign</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="unit-exploration-variants">Variants</Label>
              <Select
                id="unit-exploration-variants"
                value={variantCount}
                onChange={(event) => setVariantCount(event.target.value)}
              >
                <option value="1">1 candidate</option>
                <option value="2">2 candidates</option>
                <option value="3">3 candidates</option>
                <option value="4">4 candidates</option>
              </Select>
            </div>

            {mode === "redesign-from-screenshot" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="unit-exploration-source">Source screenshot</Label>
                <Select
                  disabled={!screenshots.length}
                  id="unit-exploration-source"
                  value={sourceScreenshotName}
                  onChange={(event) => setSourceScreenshotName(event.target.value)}
                >
                  {screenshots.length ? screenshots.map((image) => (
                    <option key={image.name} value={image.name}>{image.name}</option>
                  )) : <option value="">No screenshots</option>}
                </Select>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="unit-exploration-prompt">Direction</Label>
              <Textarea
                className="min-h-32"
                id="unit-exploration-prompt"
                placeholder="Clean up hierarchy, make the main workflow easier to scan, preserve the product tone…"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>

            <Button disabled={isGenerating} onClick={submitGenerate}>
              {isGenerating ? <RefreshCw aria-hidden="true" data-icon="inline-start" /> : <Sparkles aria-hidden="true" data-icon="inline-start" />}
              {isGenerating ? "Starting" : "Generate"}
            </Button>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <ImagePlus aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">Candidates{images.length ? ` (${images.length})` : ""}</span>
                {selectedName ? <Badge variant="secondary">Selected {selectedName}</Badge> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" onClick={onRefresh}>
                  <RefreshCw aria-hidden="true" data-icon="inline-start" />
                  Refresh
                </Button>
                <Button disabled={!images.length && !metadata} size="sm" variant="outline" onClick={onClear}>
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  Clear
                </Button>
              </div>
            </div>

            {images.length ? (
              <>
                <ScreenshotCarousel
                  className="h-[min(54vh,30rem)]"
                  images={images}
                  index={index}
                  onIndexChange={setIndex}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="unit-exploration-notes">Selection notes</Label>
                    <Textarea
                      className="min-h-24"
                      id="unit-exploration-notes"
                      placeholder="Keep the thread rail and calmer message rhythm."
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="unit-exploration-brief">Implementation brief</Label>
                    <Textarea
                      className="min-h-24"
                      id="unit-exploration-brief"
                      placeholder="Use this visual direction when executing the unit."
                      value={textBrief}
                      onChange={(event) => setTextBrief(event.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/30 p-8 text-center">
                <ImagePlus aria-hidden="true" className="size-6 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <p className="m-0 text-sm font-medium">No candidates yet</p>
                  <p className="m-0 max-w-sm text-sm text-muted-foreground">Generate a set, then refresh when the agent finishes writing PNGs.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            disabled={!current}
            onClick={() => {
              if (current) onSelect(current.name, notes.trim(), textBrief.trim());
            }}
          >
            Use direction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
